import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { handTemplate, prepareTemplate, HandRig, POSTURE, LIMITS, poseHand, viewOf, project } from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";
import { handMotions } from "../src/hand-pose.mjs";
import { scenarioInputs, poseOptions } from "../scripts/hand-lab-scenario.mjs";

const fixtures = Object.fromEntries(["left", "right"].map((hand) => {
  const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
  const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
  return [hand, prepareTemplate(raw, POSTURE, HAND_RENDER_GEOMETRY)];
}));
const inputs = scenarioInputs({
  bpm: 90, hands: ["left", "right"],
  notes: [
    { id: "l0", midi: 52, beat: 0, duration: 1, hand: "left" },
    { id: "l1", midi: 55, beat: 1, duration: 1, hand: "left" },
    { id: "r0", midi: 62, beat: 2, duration: 1, hand: "right" },
    { id: "r1", midi: 64, beat: 3, duration: 1, hand: "right" },
  ],
  fingering: { l0: 2, l1: 1, r0: 1, r1: 2 },
});
const noRestOffset = { ...POSTURE, thumbRestOut: 0, thumbRestBack: 0 };
function framesAt(beat, geometry, frozen = false) {
  return handMotions(inputs.steps, beat, poseOptions(inputs, geometry, { frozen, settle: { since: 0.4 } }));
}

test("free thumbs keep an open web, gentle joints and clear pads beside a melody", () => {
  for (const [keyWidth, keysHeight] of [[35, 171], [45, 192], [50, 224]]) {
    const geometry = { keyWidth, keysHeight, bedHeight: keysHeight + 220 }, view = viewOf(geometry);
    for (const beat of [0, 2.5, 4.5]) {
      const frames = framesAt(beat, geometry, beat === 0);
      for (const hand of ["left", "right"]) {
        const solved = poseHand(new HandRig(fixtures[hand]), frames[hand], view);
        if (solved.fingers[0].down) continue;
        const label = `${hand}, ${keyWidth}px, beat ${beat}`;
        const thumb = project(solved.pads[0].centre, view), index = project(solved.pads[1].centre, view);
        const gap = (thumb.x - index.x) * (hand === "left" ? 1 : -1);
        assert.ok(gap > keyWidth * 0.85 && gap < keyWidth * 1.9, `${label}: visible, relaxed thumb web ${gap / keyWidth} keys`);
        assert.ok(solved.pads[0].height >= 0.001, `${label}: thumb stays above the keys`);
        const a = solved.angles.thumb;
        for (const [key, range] of [["flex", LIMITS.cmcFlex], ["abd", LIMITS.cmcAbd], ["mcp", LIMITS.thumbMcp]]) {
          assert.ok(a[key] >= range[0] - 1e-8 && a[key] <= range[1] + 1e-8, `${label}: ${key} within limits`);
        }
        assert.ok(a.mcp < 40 * Math.PI / 180 && a.ip < 40 * Math.PI / 180, `${label}: soft curve, no hooked thumb`);
      }
    }
  }
});

test("relaxed thumb offsets do not move held or exact-note contacts", () => {
  const geometry = { keyWidth: 45, keysHeight: 192, bedHeight: 420 }, view = viewOf(geometry);
  for (const frozen of [false, true]) for (const beat of [0, 1.25, 2.25, 3.25]) {
    const frames = framesAt(beat, geometry, frozen);
    for (const hand of ["left", "right"]) {
      const rig = new HandRig(fixtures[hand]);
      const solved = poseHand(rig, frames[hand], view);
      const control = poseHand(rig, frames[hand], view, noRestOffset);
      for (let i = 0; i < 5; i++) if (solved.fingers[i].down) {
        assert.ok(solved.pads[i].centre.distanceTo(control.pads[i].centre) < 1e-10, `${hand} finger ${i + 1}: exact position unchanged`);
        assert.ok(solved.errors[i] < 0.0005, `${hand} finger ${i + 1}: pad contacts its actual note`);
      }
    }
  }
});

test("an aiming or tucked thumb relinquishes the open rest pose continuously", () => {
  const geometry = { keyWidth: 45, keysHeight: 192, bedHeight: 420 }, view = viewOf(geometry);
  for (const hand of ["left", "right"]) for (const tucked of [false, true]) {
    const rig = new HandRig(fixtures[hand]), base = framesAt(0, geometry, true)[hand];
    let previous = null;
    for (let step = 0; step <= 40; step++) {
      const t = step / 40, frame = structuredClone(base), f = frame.motion.fingers[0];
      f.exact = false;
      f.state = "free";
      f.target = { x: f.x, black: 0, contact: geometry.keysHeight * 0.8, alpha: 1 };
      f.aimTau = t * 0.7;
      f.extend = t;
      f.curl = 0;
      f.tuck = tucked ? t : 0;
      const solved = poseHand(rig, frame, view), p = solved.pads[0].centre;
      if (previous) assert.ok(p.distanceTo(previous) < 0.004, `${hand}: no abrupt rest/aim jump`);
      previous = p;
      if (step === 40) {
        const control = poseHand(rig, frame, view, noRestOffset);
        assert.ok(p.distanceTo(control.pads[0].centre) < 1e-10, `${hand}: full aim/tuck uses only the note target`);
      }
    }
  }
});
