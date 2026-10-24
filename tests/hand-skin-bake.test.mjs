// The normal-map derivative must sample the same scalar height field as the
// detail pass. Otherwise even a constant omitted height adds a false slope.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { handTemplate, prepareTemplate, HandRig, POSTURE, CHAINS, DIGITS } from '../src/hand3d-rig.mjs';
import { HAND_RENDER_GEOMETRY } from '../src/hand3d-data.mjs';
import { makeSkin } from '../scripts/bake-hand-maps.mjs';

for (const hand of ['left', 'right']) {
  test(`${hand} skin: full and derivative samples share every height term, including dorsal grain and nail edges`, () => {
    const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
    const tpl = prepareTemplate(handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand), POSTURE, HAND_RENDER_GEOMETRY);
    const rig = new HandRig(tpl), sample = makeSkin(tpl, rig);
    const regions = new Map();
    for (const [di, digit] of DIGITS.entries())
      for (const name of CHAINS[digit]) regions.set(tpl.names.indexOf(name), digit !== 'thumb' && name.endsWith('metacarpal') ? 5 : di);
    regions.set(tpl.names.indexOf('wrist'), 5);
    let dorsal = 0, nailInterior = 0, nailEdge = 0, checked = 0;
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    // A bounded, deterministic selection across the actual prepared surface.
    // Include both signs of the baker's 0.06 mm derivative displacement.
    const offsets = [[0, 0, 0], [.06, 0, 0], [-.06, 0, 0], [0, .06, 0], [0, -.06, 0], [0, 0, .06], [0, 0, -.06]];
    for (let i = 0; i < tpl.position.length / 3; i += 13) {
      const membership = new Float32Array(6);
      for (let k = 0; k < 4; k++) {
        const region = regions.get(tpl.joints[4 * i + k]);
        if (region != null) membership[region] += tpl.weights[4 * i + k];
      }
      point.fromArray(tpl.position, 3 * i).multiplyScalar(1000);
      normal.fromArray(tpl.normal, 3 * i);
      const base = sample(point.x, point.y, point.z, normal.x, normal.y, normal.z, membership, {});
      if (membership[5] > .8 && normal.clone().applyQuaternion(rig.toHand).y > .7) dorsal++;
      if (base.nail > .8) nailInterior++;
      if (base.nail > .05 && base.nail < .8) nailEdge++;
      for (const [dx, dy, dz] of offsets) {
        const args = [point.x + dx, point.y + dy, point.z + dz, normal.x, normal.y, normal.z, membership];
        const full = sample(...args, {}), heightOnly = sample(...args, {}, true);
        assert.ok(Number.isFinite(full.h), `Finite height at vertex ${i}`);
        assert.equal(heightOnly.h, full.h, `Vertex ${i} offset ${[dx, dy, dz]} changed height between passes`);
        // This is the exact forward difference used to produce the map.
        assert.equal((heightOnly.h - base.h) / .06, (full.h - base.h) / .06,
          `Vertex ${i} introduced a false normal slope`);
        checked++;
      }
    }
    assert.ok(checked > 2000, 'Enough real surface and offset samples');
    assert.ok(dorsal > 15, 'Regression covers the dorsal field with its former omitted term');
    assert.ok(nailInterior > 3, 'Regression covers the masked nail interior');
    assert.ok(nailEdge > 3, 'Regression covers the varying grain mask at nail edges');
  });
}
