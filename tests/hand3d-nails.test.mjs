import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { handTemplate, prepareTemplate, HandRig, CHAINS, POSTURE } from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";
import { nailGeometry, NAIL } from "../src/hand3d-nails.mjs";

const fixtures = ["left", "right"].map((hand) => {
  const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
  const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
  const tpl = prepareTemplate(raw, POSTURE, HAND_RENDER_GEOMETRY);
  return { hand, tpl, rig: new HandRig(tpl) };
});
const vertices = (values) => Array.from({ length: values.length / 3 }, (_, i) => new THREE.Vector3().fromArray(values, i * 3));

// Independent nearest-triangle distances test whether a plate actually
// follows the skin; they do not reuse the generator's radial surface fit.
function skinTriangles(tpl, rig, digit) {
  const names = CHAINS[digit].slice(-2);
  const ids = new Set(names.map((name) => tpl.names.indexOf(name)));
  const bind = tpl.bind.get(names[0]), inverse = bind.q.clone().invert();
  const local = (index) => new THREE.Vector3().fromArray(tpl.position, index * 3).sub(bind.p).applyQuaternion(inverse);
  const triangles = [];
  for (let i = 0; i < tpl.index.length; i += 3) {
    const idsAt = [tpl.index[i], tpl.index[i + 1], tpl.index[i + 2]];
    if (idsAt.some((index) => ids.has(rig.dominant[index]))) triangles.push(new THREE.Triangle(...idsAt.map(local)));
  }
  return triangles;
}

test("all ten pianist nails follow their skin instead of floating as fingertip caps", () => {
  const closest = new THREE.Vector3();
  for (const { hand, tpl, rig } of fixtures) for (const digit of Object.keys(CHAINS)) {
    const geometry = nailGeometry(tpl, rig, digit);
    assert.ok(geometry, `${hand} ${digit}: fitted plate`);
    const triangles = skinTriangles(tpl, rig, digit);
    for (const p of vertices(geometry.position)) {
      const distance = Math.min(...triangles.map((triangle) => p.distanceTo(triangle.closestPointToPoint(p, closest))));
      // Allow the short free edge to leave the skin by half a millimetre.
      // The prior copied end ring floated 1.3–1.8 mm from the same mesh.
      assert.ok(distance < 0.00065, `${hand} ${digit}: nail ${distance * 1000} mm off skin`);
    }
    const z = vertices(geometry.position).map((p) => p.z);
    assert.ok(Math.min(...z) >= rig.pads[digit].end - 0.0002, `${hand} ${digit}: short free edge`);
  }
});

test("nail plates have rounded ends, continuous curvature and finite outward-facing surfaces", () => {
  for (const { hand, tpl, rig } of fixtures) for (const digit of Object.keys(CHAINS)) {
    const { position, normal, index } = nailGeometry(tpl, rig, digit);
    const p = vertices(position), n = vertices(normal), label = `${hand} ${digit}`;
    const centre = Math.floor(NAIL.cols / 2), last = (NAIL.rows - 1) * NAIL.cols;
    assert.ok(p[centre].z > p[0].z + 0.0003, `${label}: rounded cuticle base`);
    assert.ok(p[last + centre].z < p[last].z - 0.0003, `${label}: rounded free-edge corners`);
    for (let i = 0; i < p.length; i++) {
      assert.ok(p[i].toArray().every(Number.isFinite), `${label}: finite vertex`);
      assert.ok(Math.abs(n[i].length() - 1) < 1e-5, `${label}: unit normal`);
      const outward = new THREE.Vector3(p[i].x - rig.pads[digit].c.x, p[i].y - rig.pads[digit].c.y, 0).normalize();
      assert.ok(n[i].dot(outward) > 0.05, `${label}: outward-facing plate`);
      const row = Math.floor(i / NAIL.cols), column = i % NAIL.cols;
      for (const neighbour of [column + 1 < NAIL.cols ? i + 1 : null, row + 1 < NAIL.rows ? i + NAIL.cols : null]) {
        if (neighbour !== null) assert.ok(n[i].angleTo(n[neighbour]) < Math.PI / 6, `${label}: no isolated shading spike`);
      }
      if (row > 0 && row + 1 < NAIL.rows) {
        const bend = p[i - NAIL.cols].clone().add(p[i + NAIL.cols]).addScaledVector(p[i], -2).length();
        assert.ok(bend < 0.001, `${label}: no millimetre-scale ridge along nail (${bend})`);
      }
    }
    for (let i = 0; i < index.length; i += 3) {
      assert.ok(index[i] < p.length && index[i + 1] < p.length && index[i + 2] < p.length);
      assert.ok(new THREE.Triangle(p[index[i]], p[index[i + 1]], p[index[i + 2]]).getArea() > 1e-12, `${label}: no collapsed triangle`);
    }
  }
});

test("nail fitting leaves skin, skeleton and playing contacts unchanged", () => {
  for (const { tpl, rig } of fixtures) {
    const positions = tpl.position.slice(), normals = tpl.normal.slice();
    const binds = [...tpl.bind].map(([name, bind]) => [name, bind.p.toArray(), bind.q.toArray()]);
    const pads = structuredClone(rig.pads);
    for (const digit of Object.keys(CHAINS)) nailGeometry(tpl, rig, digit);
    assert.deepEqual(tpl.position, positions);
    assert.deepEqual(tpl.normal, normals);
    assert.deepEqual([...tpl.bind].map(([name, bind]) => [name, bind.p.toArray(), bind.q.toArray()]), binds);
    assert.deepEqual(structuredClone(rig.pads), pads);
  }
});
