import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import {
  CHAINS,
  FINGERS,
  HandRig,
  POSTURE,
  handTemplate,
  prepareTemplate,
  sculptTemplate,
} from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";

// Isolate the surface operation from forearm extension, posing and scale.
// This is the same subdivided, planar source mesh used by the renderer.
const surfaces = Object.fromEntries(["left", "right"].map((hand) => {
  const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
  const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
  const base = prepareTemplate(raw, { ...POSTURE, scale: 1, forearmExtra: 0 }, {
    ...HAND_RENDER_GEOMETRY,
    sculpt: 0,
  });
  const original = base.position.slice();
  const shaped = sculptTemplate(base, HAND_RENDER_GEOMETRY.sculpt);
  return [hand, { base, original, shaped, rig: new HandRig(base) }];
}));

test("dorsal hand detail preserves the palmar body, skeleton and contact pads", () => {
  for (const [hand, { base, original, shaped, rig }] of Object.entries(surfaces)) {
    assert.deepEqual(base.position, original, `${hand}: source vertices must not mutate`);
    for (const attribute of ["bind", "weights", "joints", "index", "uv"])
      assert.equal(shaped[attribute], base[attribute], `${hand}: ${attribute} remains shared`);

    // The established terminal fingertip taper is a separate part of the
    // sculpt. All other palmar-facing skin must stay exactly in place.
    const terminal = new Set(FINGERS.flatMap((finger) => CHAINS[finger].slice(-2)));
    const normal = new THREE.Vector3();
    let protectedVertices = 0, changedDorsalVertices = 0;
    for (let i = 0; i < original.length / 3; i++) {
      normal.fromArray(base.normal, i * 3).applyQuaternion(rig.toHand);
      const unchanged = [0, 1, 2].every((axis) => shaped.position[3 * i + axis] === original[3 * i + axis]);
      if (normal.y <= 0 && !terminal.has(base.names[rig.dominant[i]])) {
        protectedVertices++;
        assert.ok(unchanged, `${hand}: palmar vertex ${i} moved`);
      }
      if (normal.y > 0 && !unchanged) changedDorsalVertices++;
    }
    assert.ok(protectedVertices > 0, `${hand}: palmar invariant exercised`);
    assert.ok(changedDorsalVertices > 0, `${hand}: detail operation exercised`);

    // Ten micrometres is far below the key-contact solver's submillimetre
    // tolerance. Surface styling must not change where a finger plays.
    const sculptedRig = new HandRig(shaped);
    for (const digit of ["thumb", ...FINGERS]) {
      assert.ok(rig.pads[digit].c.distanceTo(sculptedRig.pads[digit].c) < 0.00001,
        `${hand} ${digit}: contact centre changed`);
      assert.ok(Math.abs(rig.pads[digit].r - sculptedRig.pads[digit].r) < 0.00001,
        `${hand} ${digit}: contact radius changed`);
      assert.ok(Math.abs(rig.pads[digit].len - sculptedRig.pads[digit].len) < 0.00001,
        `${hand} ${digit}: contact length changed`);
    }
  }
});

test("both hands retain finite, mirrored surface relief", () => {
  const pointSets = {};
  for (const [hand, { base, shaped, rig }] of Object.entries(surfaces)) {
    assert.ok(shaped.position.every(Number.isFinite), `${hand}: finite positions`);
    assert.ok(shaped.normal.every(Number.isFinite), `${hand}: finite normals`);
    const points = [];
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let i = 0; i < shaped.position.length; i += 3) {
      point.fromArray(shaped.position, i).sub(rig.origin).applyQuaternion(rig.toHand);
      // Left-hand triangle winding gives subdivision a different vertex
      // order, so compare reflected coordinate multisets, not indices.
      if (hand === "left") point.x *= -1;
      points.push(point.toArray().map((v) => Math.round(v * 1e6)).join(","));
      normal.fromArray(shaped.normal, i);
      const sourceLength = Math.hypot(base.normal[i], base.normal[i + 1], base.normal[i + 2]);
      // Subdivision retains a few zero-area source vertices. Do not add
      // another collapsed normal while shaping the visible surface.
      if (sourceLength === 0) assert.equal(normal.length(), 0);
      else assert.ok(Math.abs(normal.length() - 1) < 0.0001, `${hand}: unit normal at ${i / 3}`);
    }
    pointSets[hand] = points.sort();
  }
  assert.deepEqual(pointSets.left, pointSets.right, "left/right relief mirrors within one micrometre");
});

test("joint relief and dorsal planes do not pinch, invert or inflate the skin", () => {
  for (const [hand, { base, shaped }] of Object.entries(surfaces)) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const before = new THREE.Vector3(), after = new THREE.Vector3();
    let checked = 0;
    for (let i = 0; i < base.position.length; i += 3) {
      a.fromArray(base.position, i);
      b.fromArray(shaped.position, i);
      assert.ok(a.distanceTo(b) < 0.0025, `${hand}: surface detail becomes a large deformation at ${i / 3}`);
    }
    const triangleNormal = (positions, index, target) => {
      a.fromArray(positions, base.index[index] * 3);
      b.fromArray(positions, base.index[index + 1] * 3).sub(a);
      c.fromArray(positions, base.index[index + 2] * 3).sub(a);
      return target.crossVectors(b, c);
    };
    for (let i = 0; i < base.index.length; i += 3) {
      triangleNormal(base.position, i, before);
      // The source includes tiny collapsed triangles at UV seams. Check
      // actual skin faces, where a reversal would produce a dark fold.
      if (before.length() <= 1e-11) continue;
      triangleNormal(shaped.position, i, after);
      assert.ok(after.length() > 1e-11, `${hand}: skin face collapsed at ${i / 3}`);
      assert.ok(before.normalize().dot(after.normalize()) > 0.85,
        `${hand}: skin face pinched or reversed at ${i / 3}`);
      checked++;
    }
    assert.ok(checked > 40000, `${hand}: both broad planes and small finger faces checked`);
  }
});
