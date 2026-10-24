import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { HandRig, POSTURE, PARENT, handTemplate, prepareTemplate, poseHand, viewOf } from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";
import { handMotions } from "../src/hand-pose.mjs";
import { scenarioInputs, poseOptions } from "../scripts/hand-lab-scenario.mjs";
import { SMOOTH_TAU } from "../src/hands3d-layer.mjs";

const rigs = Object.fromEntries(["left", "right"].map(hand => {
  const b = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
  return [hand, new HandRig(prepareTemplate(handTemplate(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), hand), POSTURE, HAND_RENDER_GEOMETRY))];
}));
const notes = [0, 2, 4].flatMap(beat => [["left", 46, 4], ["left", 55, 1], ["right", 64, 1], ["right", 73, 4]].map(([hand, midi, finger]) => ({ id: `${hand}-${midi}-${beat}`, hand, midi, finger, beat, duration: 1.5 })));
const inputs = scenarioInputs({ bpm: 144, notes, fingering: Object.fromEntries(notes.map(n => [n.id, n.finger])) });
const deg = Math.PI / 180;

test("inactive little fingers keep a distributed arch in the Appassionata opening", () => {
  for (const [keyWidth, keysHeight] of [[32.925, 171], [45, 192]]) {
    const geometry = { keyWidth, keysHeight, bedHeight: keysHeight + 90 }, view = viewOf(geometry);
    const frames = handMotions(inputs.steps, 0, poseOptions(inputs, geometry, { frozen: true, settle: { since: 0.4 } }));
    for (const hand of ["left", "right"]) {
      const s = poseHand(rigs[hand], frames[hand], view);
      assert.ok(s.angles.pinky.pip <= 82 * deg, `${hand}: inactive PIP is ${(s.angles.pinky.pip / deg).toFixed(1)}°, not a hooked rest`);
      assert.ok(s.angles.pinky.dip <= 55 * deg, `${hand}: no compensating distal hook`);
      assert.ok(s.pads[4].height >= 0.0008, `${hand}: resting pad clears the key`);
      for (const i of [0, 3]) assert.ok(s.errors[i] < 0.0005, `${hand} finger ${i + 1}: musical contact retained`);
    }
  }
});

test("rest-joint balancing never displaces a held contact or changes rigid bone lengths", () => {
  const geometry = { keyWidth: 32.925, keysHeight: 171, bedHeight: 261 }, view = viewOf(geometry);
  for (const beat of [0, 0.5, 1.4, 2, 2.5]) {
    const frames = handMotions(inputs.steps, beat, poseOptions(inputs, geometry));
    for (const hand of ["left", "right"]) {
      const s = poseHand(rigs[hand], frames[hand], view);
      const control = poseHand(rigs[hand], frames[hand], view, { ...POSTURE, idleJointBalance: null });
      for (let i = 0; i < 5; i++) if (s.fingers[i].down)
        assert.ok(s.pads[i].centre.distanceTo(control.pads[i].centre) < 1e-10, `${hand} held ${i + 1}`);
      for (const [name, local] of rigs[hand].local) {
        const parent = PARENT[name];
        if (!parent) continue;
        const length = s.world.get(name).p.distanceTo(s.world.get(parent).p);
        assert.ok(Math.abs(length - local.p.length()) < 1e-9, `${hand} ${name}: no stretching`);
      }
    }
  }
});

test("redistributing an idle bend preserves its pad instead of projecting it over a key edge", () => {
  for (const [keyWidth, keysHeight] of [[32.925, 171], [45, 192]]) {
    const geometry = { keyWidth, keysHeight, bedHeight: keysHeight + 90 }, view = viewOf(geometry);
    const frames = handMotions(inputs.steps, 0, poseOptions(inputs, geometry, { frozen: true, settle: { since: 0.4 } }));
    // Isolate redistribution from the independent neighbouring-finger spacing
    // pass: changing an intermediate joint can legitimately change that pass.
    const posture = { ...POSTURE, gap: 0 };
    for (const hand of ["left", "right"]) {
      const solved = poseHand(rigs[hand], frames[hand], view, posture);
      const control = poseHand(rigs[hand], frames[hand], view, { ...posture, idleJointBalance: null });
      assert.ok(control.angles.pinky.pip - solved.angles.pinky.pip > deg,
        `${hand}, ${keyWidth}px: actually redistribute a hooked resting joint`);
      for (let i = 1; i < 5; i++) if (!solved.fingers[i].down)
        assert.ok(solved.pads[i].centre.distanceTo(control.pads[i].centre) < 0.00001,
          `${hand} finger ${i + 1}, ${keyWidth}px: resting pad moved by more than 0.01 mm`);
    }
  }
});

// Advance musical time in real 120 Hz seconds, retaining the exact memory
// contract used by the renderer. The control changes only joint balancing:
// the current anatomy, spacing and hand placement remain identical.
function playSequence(input, geometry, toBeat) {
  const view = viewOf(geometry), dt = 1 / 120;
  const previous = {}, rows = [];
  const controlPosture = { ...POSTURE, idleJointBalance: null };
  for (let tick = 0; tick <= Math.ceil(input.clock.toSeconds(toBeat) / dt); tick++) {
    const beat = input.clock.toBeat(tick * dt);
    const frames = handMotions(input.steps, beat, poseOptions(input, geometry));
    for (const hand of ["left", "right"]) {
      const frame = frames[hand];
      if (!frame || frame.motion.guidanceOnly) { delete previous[hand]; continue; }
      const old = previous[hand];
      const memory = (solved) => solved ? { held: solved.held, k: 1 - Math.exp(-dt / SMOOTH_TAU), dt } : null;
      const solved = poseHand(rigs[hand], frame, view, POSTURE, memory(old?.solved));
      const control = poseHand(rigs[hand], frame, view, controlPosture, memory(old?.control));
      const row = { tick, beat, hand, frame, solved, control, old, view };
      rows.push(row);
      previous[hand] = row;
    }
  }
  return rows;
}

test("120 Hz opening releases and aims keep clear pads and continuous free fingers", () => {
  for (const speed of [0.5, 1]) for (const [keyWidth, keysHeight] of [[32.925, 171], [45, 192]]) {
    const input = scenarioInputs(inputs.scenario, { speed });
    const rows = playSequence(input, { keyWidth, keysHeight, bedHeight: keysHeight + 90 }, 5.9);
    let releaseSamples = 0, aimSamples = 0, contactSamples = 0;
    for (const { beat, hand, solved, control, old, view } of rows) {
      for (let i = 1; i < 5; i++) {
        const f = solved.fingers[i], pad = solved.pads[i];
        const label = `${hand} finger ${i + 1}, ${keyWidth}px, ${speed}x, beat ${beat.toFixed(5)}`;
        if (f.down) {
          contactSamples++;
          assert.ok(solved.errors[i] <= 0.0005, `${label}: held contact misses its target`);
          assert.ok(pad.centre.distanceTo(control.pads[i].centre) < 1e-9, `${label}: balancing moved a held contact`);
          continue;
        }
        if (f.leaving > 0 && f.leaving < 1) releaseSamples++;
        if (f.aim > 0 && f.aim < 1) aimSamples++;
        // The key itself is still depressed during the first 100 ms of a
        // release. Compare against that moving surface, not the unpressed top.
        if (pad.centre.z <= view.keyLen)
          assert.ok(pad.height + f.dip >= -0.00001, `${label}: free pad penetrates the current key surface`);
        if (old) {
          const step = pad.centre.distanceTo(old.solved.pads[i].centre);
          // Six millimetres is about a quarter of a white key in one 8.3 ms
          // frame; a larger step in this in-position phrase is visibly abrupt.
          assert.ok(step < 0.006, `${label}: free pad jumped ${(step * 1000).toFixed(2)} mm in one frame`);
        }
      }
    }
    assert.ok(releaseSamples > 20 && aimSamples > 20 && contactSamples > 100,
      `The sequence must actually exercise release, aim and held states: ${JSON.stringify({ releaseSamples, aimSamples, contactSamples })}`);
  }
});

test("rest-joint balancing does not introduce free-finger snaps through a scale transition", () => {
  const scale = scenarioInputs(JSON.parse(fs.readFileSync(new URL("./fixtures/hand-motion/scale.json", import.meta.url))));
  const rows = playSequence(scale, { keyWidth: 45, keysHeight: 192, bedHeight: 282 }, 2);
  let compared = 0;
  for (const row of rows) {
    if (!row.old) continue;
    for (let i = 1; i < 5; i++) {
      if (row.solved.fingers[i].down || row.old.solved.fingers[i].down) continue;
      const step = row.solved.pads[i].centre.distanceTo(row.old.solved.pads[i].centre);
      // A key edge may be crossed one sample earlier after a rest adjustment;
      // allow that one-frame shift, while rejecting a new, larger jump.
      const neighbouring = rows.filter(r => r.hand === row.hand && r.old && Math.abs(r.tick - row.tick) <= 1);
      const controlStep = Math.max(...neighbouring.map(r => r.control.pads[i].centre.distanceTo(r.old.control.pads[i].centre)));
      assert.ok(step <= controlStep + 0.002,
        `${row.hand} finger ${i + 1}, beat ${row.beat.toFixed(6)}: balancing adds a snap (${(step * 1000).toFixed(2)} mm vs ${(controlStep * 1000).toFixed(2)} mm control)`);
      compared++;
    }
  }
  assert.ok(compared > 500, "Compare moving free digits throughout the transition, not only held contacts");
});

test("Practice-scale thumb crossings preserve written contacts at the actual keyboard geometry", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/hand-motion/scale.json", import.meta.url)));
  // The recorded Practice failure used 38 px keys and a 171 px key bed:
  // at half speed the extra legato ring contact pulled the arriving C5
  // thumb 2.89 mm off its key after the ring's written note had ended.
  for (const speed of [0.5, 1]) {
    const input = scenarioInputs(fixture, { speed });
    const rows = playSequence(input, { keyWidth: 38, keysHeight: 171, bedHeight: 272 }, 4.1);
    assert.equal(rows.length, 2 * (Math.ceil(input.clock.toSeconds(4.1) * 120) + 1),
      "Both hands remain visible throughout the written trajectory");
    let contacts = 0, crossingSamples = 0;
    for (const row of rows) {
      const { beat, hand, frame, solved } = row;
      const written = input.notes.filter(n => n.hand === hand && n.beat <= beat + 1e-8 && n.beat + n.duration > beat + 1e-8);
      for (const n of written) {
        const digit = frame.motion.fingers.findIndex(f => f.state === "down" && f.midi === n.midi);
        assert.ok(digit >= 0, `${hand}, ${speed}x, beat ${beat}: written ${n.midi} remains held`);
        assert.ok(solved.errors[digit] <= 0.0005,
          `${hand}, ${speed}x, beat ${beat}: written ${n.midi} misses by ${(solved.errors[digit] * 1000).toFixed(3)} mm`);
        contacts++;
        if (hand === "right" && n.midi === 72 && beat >= 3.5 && beat < 3.54) crossingSamples++;
      }
    }
    assert.ok(contacts > 500 && crossingSamples >= 2, "Exercise the written holds and the actual crossover window");
  }
});
