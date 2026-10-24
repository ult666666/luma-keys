import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { CHAINS, FINGERS, HandRig, POSTURE, handTemplate, naturalAngles, prepareTemplate, sculptTemplate, shapeAnatomy } from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";

// The skin must narrow through its visible joint shoulders as well as at
// each shaft's waist. Protecting the whole original joint cross-section
// leaves the MRTK fingers looking like tubes with round beads at the bends.
test("finger shaping continues through dorsal joint shoulders without pinching them", () => {
  for (const hand of ["left", "right"]) {
    const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
    const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
    const base = prepareTemplate(raw, { ...POSTURE, anatomy: 0, scale: 1, forearmExtra: 0 }, { ...HAND_RENDER_GEOMETRY, sculpt: 0 });
    const shaped = shapeAnatomy(base), rig = new HandRig(base);
    const before = new THREE.Vector3(), after = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const finger of FINGERS) {
      const joint = rig.bind.get(CHAINS[finger][2]), inverse = joint.q.clone().invert();
      const ids = new Set(CHAINS[finger].slice(1).map(name => base.names.indexOf(name)));
      let count = 0, beforeWidth = 0, afterWidth = 0;
      for (let i = 0; i < base.position.length / 3; i++) {
        if (!ids.has(rig.dominant[i])) continue;
        before.fromArray(base.position, i * 3).sub(joint.p).applyQuaternion(inverse);
        normal.fromArray(base.normal, i * 3).applyQuaternion(inverse);
        // A physical 8 mm band at PIP, on its visible side/dorsal shoulders.
        // The underside fold and fingertip contact surface are not sampled.
        if (Math.abs(before.z) >= 0.004 || Math.abs(before.x) <= 0.004 || normal.y <= 0.15) continue;
        after.fromArray(shaped.position, i * 3).sub(joint.p).applyQuaternion(inverse);
        beforeWidth += Math.abs(before.x);
        afterWidth += Math.abs(after.x);
        count++;
      }
      assert.ok(count > 40, `${hand} ${finger}: full joint-shoulder band exercised`);
      const ratio = afterWidth / beforeWidth;
      assert.ok(ratio < 0.90, `${hand} ${finger}: joint shoulders remain bulbous (${ratio})`);
      assert.ok(ratio > 0.82, `${hand} ${finger}: joint shoulders over-pinched (${ratio})`);
    }
  }
});

test("the upper palm tapers into its knuckle row instead of keeping a broad dorsal slab", () => {
  for (const hand of ["left", "right"]) {
    const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
    const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
    const base = prepareTemplate(raw, { ...POSTURE, anatomy: 0, scale: 1, forearmExtra: 0 }, { ...HAND_RENDER_GEOMETRY, sculpt: 0 });
    const shaped = shapeAnatomy(base), rig = new HandRig(base);
    const before = new THREE.Vector3(), after = new THREE.Vector3(), normal = new THREE.Vector3();
    let count = 0, beforeWidth = 0, afterWidth = 0;
    for (let i = 0; i < base.position.length / 3; i++) {
      before.fromArray(base.position, i * 3).sub(rig.origin).applyQuaternion(rig.toHand);
      normal.fromArray(base.normal, i * 3).applyQuaternion(rig.toHand);
      // The dorsal crown immediately behind the MCP row, deliberately
      // separate from the lower ulnar palm measured by the anatomy suite.
      if (before.z <= 0.012 || before.z >= 0.035 || Math.abs(before.x) <= 0.015 || normal.y <= 0.5) continue;
      after.fromArray(shaped.position, i * 3).sub(rig.origin).applyQuaternion(rig.toHand);
      beforeWidth += Math.abs(before.x);
      afterWidth += Math.abs(after.x);
      count++;
    }
    assert.ok(count > 800, `${hand}: full upper-palm surface exercised`);
    const ratio = afterWidth / beforeWidth;
    assert.ok(ratio < 0.94 && ratio > 0.85, `${hand}: coherent crown taper (${ratio})`);
  }
});

test("the final sculpted skin keeps its palmar folds oriented through deep playing bends", () => {
  for (const hand of ["left", "right"]) {
    const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
    const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
    const base = prepareTemplate(raw, { ...POSTURE, anatomy: 0 }, HAND_RENDER_GEOMETRY);
    const shaped = prepareTemplate(raw, POSTURE, HAND_RENDER_GEOMETRY);
    const rig = new HandRig(base);
    // The prior anatomy checks stop near 49 degrees. The actual practice
    // pose can curl a free PIP to 78 degrees, and its allowed range reaches
    // 100 degrees. Exercise the final sculpt, not only the broad shape pass.
    for (const pip of [0.85, 1.36, 1.75]) {
      const angles = naturalAngles();
      for (const finger of FINGERS) angles[finger] = { abd: 0, mcp: 0.6, pip, dip: 0.45 };
      angles.thumb = { flex: -0.41, abd: 0.173, twist: -0.143, mcp: 0.347, ip: 0.435 };
      const fk = rig.fk(angles);
      const transforms = base.names.map(name => {
        const bind = rig.bind.get(name), posed = fk.get(name);
        const q = posed.q.clone().multiply(bind.q.clone().invert());
        return { q, p: posed.p.clone().sub(bind.p.clone().applyQuaternion(q)) };
      });
      const skin = tpl => {
        const out = new Float32Array(tpl.position.length);
        const point = new THREE.Vector3(), moved = new THREE.Vector3(), sum = new THREE.Vector3();
        for (let i = 0; i < tpl.position.length / 3; i++) {
          point.fromArray(tpl.position, i * 3); sum.set(0, 0, 0);
          for (let c = 0; c < 4; c++) {
            const weight = tpl.weights[i * 4 + c], transform = transforms[tpl.joints[i * 4 + c]];
            if (weight > 0) sum.addScaledVector(moved.copy(point).applyQuaternion(transform.q).add(transform.p), weight);
          }
          sum.toArray(out, i * 3);
        }
        return out;
      };
      const beforeSkin = skin(base), afterSkin = skin(shaped);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      const before = new THREE.Vector3(), after = new THREE.Vector3();
      const faceNormal = (positions, offset, target) => {
        a.fromArray(positions, base.index[offset] * 3);
        b.fromArray(positions, base.index[offset + 1] * 3).sub(a);
        c.fromArray(positions, base.index[offset + 2] * 3).sub(a);
        return target.crossVectors(b, c);
      };
      let checked = 0;
      for (let i = 0; i < base.index.length; i += 3) {
        faceNormal(beforeSkin, i, before);
        if (before.length() <= 1e-10) continue;
        faceNormal(afterSkin, i, after);
        assert.ok(after.length() > 1e-11, `${hand} PIP ${pip}: skin face ${i / 3} collapsed`);
        assert.ok(before.normalize().dot(after.normalize()) > 0, `${hand} PIP ${pip}: skin face ${i / 3} reversed`);
        checked++;
      }
      assert.ok(checked > 40000, `${hand}: complete articulated surface exercised`);
    }
  }
});

test("surface sculpt does not rebuild spherical caps on the shaped PIP shoulders", () => {
  for (const hand of ["left", "right"]) {
    const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
    const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
    const base = prepareTemplate(raw, { ...POSTURE, scale: 1, forearmExtra: 0 }, { ...HAND_RENDER_GEOMETRY, sculpt: 0 });
    const sculpted = sculptTemplate(base, HAND_RENDER_GEOMETRY.sculpt), rig = new HandRig(base);
    const before = new THREE.Vector3(), after = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const finger of FINGERS) {
      const joint = rig.bind.get(CHAINS[finger][2]), inverse = joint.q.clone().invert();
      const ids = new Set(CHAINS[finger].slice(1).map(name => base.names.indexOf(name)));
      let count = 0, peak = 0;
      for (let i = 0; i < base.position.length / 3; i++) {
        if (!ids.has(rig.dominant[i])) continue;
        before.fromArray(base.position, i * 3).sub(joint.p).applyQuaternion(inverse);
        normal.fromArray(base.normal, i * 3).applyQuaternion(inverse);
        if (Math.abs(before.z) > 0.004 || Math.abs(before.x) > 0.004 || normal.y < 0.7) continue;
        after.fromArray(sculpted.position, i * 3).sub(joint.p).applyQuaternion(inverse);
        peak = Math.max(peak, after.y - before.y);
        count++;
      }
      assert.ok(count > 30, `${hand} ${finger}: dorsal PIP crown exercised`);
      assert.ok(peak < 0.00045, `${hand} ${finger}: round cap rebuilt by ${(peak * 1000).toFixed(3)} mm of relief`);
    }
  }
});
