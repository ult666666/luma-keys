import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { CHAINS, DIGITS, FINGERS, HandRig, POSTURE, handTemplate, naturalAngles, prepareTemplate, shapeAnatomy } from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";

const models = Object.fromEntries(["left", "right"].map((hand) => {
  const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
  const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
  const base = prepareTemplate(raw, { ...POSTURE, anatomy: 0, scale: 1, forearmExtra: 0 }, { ...HAND_RENDER_GEOMETRY, sculpt: 0 });
  return [hand, { base, shaped: shapeAnatomy(base), rig: new HandRig(base) }];
}));

test("anatomical reshaping preserves every bone, skin influence, and playing pad", () => {
  for (const [hand, { base, shaped, rig }] of Object.entries(models)) {
    for (const key of ["bind", "weights", "joints", "uv", "index"])
      assert.equal(shaped[key], base[key], `${hand}: ${key} stays shared`);
    const after = new HandRig(shaped);
    for (const digit of DIGITS) {
      assert.ok(rig.pads[digit].c.distanceTo(after.pads[digit].c) < 1e-8, `${hand} ${digit}: fixed contact centre`);
      assert.ok(Math.abs(rig.pads[digit].r - after.pads[digit].r) < 1e-8, `${hand} ${digit}: fixed contact radius`);
      assert.ok(Math.abs(rig.pads[digit].end - after.pads[digit].end) < 1e-8, `${hand} ${digit}: fixed fingertip length`);
    }
  }
});

test("palm and finger silhouettes become slimmer without shortening the articulated digits", () => {
  for (const [hand, { base, shaped, rig }] of Object.entries(models)) {
    const before = new THREE.Vector3(), after = new THREE.Vector3();
    let palmBefore = 0, palmAfter = 0, palmCount = 0;
    for (let i = 0; i < base.position.length; i += 3) {
      before.fromArray(base.position, i).sub(rig.origin).applyQuaternion(rig.toHand);
      after.fromArray(shaped.position, i).sub(rig.origin).applyQuaternion(rig.toHand);
      // The outer palm profile between the knuckle bridge and wrist.
      if (before.z > 0.04 && before.z < 0.07 && before.x * rig.chir > 0.025) {
        palmBefore += Math.abs(before.x);
        palmAfter += Math.abs(after.x);
        palmCount++;
      }
    }
    assert.ok(palmCount > 100, `${hand}: measured broad palm profile`);
    assert.ok(palmAfter / palmBefore < 0.92 && palmAfter / palmBefore > 0.78, `${hand}: visibly tapered palm ${palmAfter / palmBefore}`);
    for (const digit of FINGERS) {
      const a = rig.bind.get(CHAINS[digit][1]).p, b = rig.bind.get(CHAINS[digit][2]).p;
      const axis = b.clone().sub(a), length = axis.length(); axis.normalize();
      let widthBefore = 0, widthAfter = 0, count = 0;
      for (let i = 0; i < base.position.length / 3; i++) {
        if (base.names[rig.dominant[i]] !== CHAINS[digit][1]) continue;
        before.fromArray(base.position, i * 3).sub(a);
        const along = before.dot(axis);
        if (along < length * 0.3 || along > length * 0.7) continue;
        after.fromArray(shaped.position, i * 3).sub(a);
        widthBefore += before.addScaledVector(axis, -along).length();
        widthAfter += after.addScaledVector(axis, -after.dot(axis)).length();
        count++;
      }
      assert.ok(count > 50, `${hand} ${digit}: measured shaft`);
      assert.ok(widthAfter / widthBefore < 0.96 && widthAfter / widthBefore > 0.82, `${hand} ${digit}: articulated shaft taper ${widthAfter / widthBefore}`);
    }
  }
});

test("anatomical shape has mirrored outward normals and no collapsed or reversed triangles", () => {
  const reflected = {};
  for (const [hand, { base, shaped, rig }] of Object.entries(models)) {
    assert.ok(shaped.position.every(Number.isFinite));
    assert.ok(shaped.normal.every(Number.isFinite));
    const p = new THREE.Vector3(), n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const normalBefore = new THREE.Vector3(), normalAfter = new THREE.Vector3();
    reflected[hand] = [];
    for (let i = 0; i < shaped.position.length; i += 3) {
      p.fromArray(shaped.position, i).sub(rig.origin).applyQuaternion(rig.toHand);
      p.x *= rig.chir;
      reflected[hand].push(p.toArray().map((v) => Math.round(v * 1e6)).join(","));
      n.fromArray(shaped.normal, i);
      if (Math.hypot(...base.normal.slice(i, i + 3)) > 0) assert.ok(Math.abs(n.length() - 1) < 1e-4);
    }
    const faceNormal = (positions, offset, target) => {
      a.fromArray(positions, base.index[offset] * 3);
      b.fromArray(positions, base.index[offset + 1] * 3).sub(a);
      c.fromArray(positions, base.index[offset + 2] * 3).sub(a);
      return target.crossVectors(b, c);
    };
    let checked = 0;
    for (let i = 0; i < base.index.length; i += 3) {
      faceNormal(base.position, i, normalBefore);
      if (normalBefore.length() < 1e-11) continue;
      faceNormal(shaped.position, i, normalAfter);
      assert.ok(normalAfter.length() > 1e-11, `${hand}: face ${i / 3} collapsed`);
      assert.ok(normalBefore.normalize().dot(normalAfter.normalize()) > 0.7, `${hand}: face ${i / 3} pinched or inverted`);
      checked++;
    }
    assert.ok(checked > 40000);
    reflected[hand].sort();
  }
  assert.deepEqual(reflected.left, reflected.right, "anatomy reflects within one micrometre with correct winding");
});

test("curled, open and thumb-under poses preserve the continuous skin's face orientation", () => {
  for (const [hand, { base, shaped, rig }] of Object.entries(models)) {
    const poses = [naturalAngles(), naturalAngles(), naturalAngles()];
    for (const finger of FINGERS) {
      poses[0][finger] = { abd: 0, mcp: 0.45, pip: 0.85, dip: 0.5 };
      poses[1][finger] = { abd: (FINGERS.indexOf(finger) - 1.5) * 0.12, mcp: 0.2, pip: 0.55, dip: 0.3 };
      poses[2][finger] = { abd: 0, mcp: 0.7, pip: 0.65, dip: 0.4 };
    }
    poses[2].thumb = { flex: 0.7, abd: 0.15, twist: 0.25, mcp: 0.4, ip: 0.45 };
    for (const [poseIndex, pose] of poses.entries()) {
      const fk = rig.fk(pose);
      const transforms = base.names.map((name) => {
        const bind = rig.bind.get(name), posed = fk.get(name);
        const q = posed.q.clone().multiply(bind.q.clone().invert());
        return { q, p: posed.p.clone().sub(bind.p.clone().applyQuaternion(q)) };
      });
      const skin = (tpl) => {
        const out = new Float32Array(tpl.position.length), point = new THREE.Vector3(), moved = new THREE.Vector3(), sum = new THREE.Vector3();
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
      const source = skin(base), target = skin(shaped);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), before = new THREE.Vector3(), after = new THREE.Vector3();
      const normal = (positions, i, out) => {
        a.fromArray(positions, base.index[i] * 3);
        b.fromArray(positions, base.index[i + 1] * 3).sub(a);
        c.fromArray(positions, base.index[i + 2] * 3).sub(a);
        return out.crossVectors(b, c);
      };
      let checked = 0;
      for (let i = 0; i < base.index.length; i += 3) {
        normal(source, i, before);
        if (before.length() <= 1e-10) continue;
        normal(target, i, after);
        assert.ok(after.length() > 1e-11, `${hand} pose ${poseIndex}: new collapsed skin face ${i / 3}`);
        assert.ok(before.normalize().dot(after.normalize()) > 0, `${hand} pose ${poseIndex}: new reversed skin face ${i / 3}`);
        checked++;
      }
      assert.ok(checked > 40000, `${hand} pose ${poseIndex}: full articulated mesh checked`);
    }
  }
});
