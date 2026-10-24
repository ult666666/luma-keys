import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { HandRig, POSTURE, handTemplate, poseHand, prepareTemplate, viewOf } from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";
import { handMotions } from "../src/hand-pose.mjs";
import { poseOptions, scenarioInputs } from "../scripts/hand-lab-scenario.mjs";

const scenario = JSON.parse(fs.readFileSync(new URL("./fixtures/hand-motion/scale.json", import.meta.url)));
const rigs = Object.fromEntries(["left", "right"].map(hand => {
  const bytes = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
  const raw = handTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), hand);
  return [hand, new HandRig(prepareTemplate(raw, POSTURE, HAND_RENDER_GEOMETRY))];
}));

test("a scale crossover releases the written thumb before an unsupported extra hold can displace either contact", () => {
  // Real RAF playback found a 5.8 mm miss for the first 40 ms of beat 4:
  // LH C3/1 had ended, but a synthetic legato hold pinned it under D3/4.
  // Sample the whole narrow interval, including the exact musical onset.
  for (const speed of [0.5, 1]) {
    const inputs = scenarioInputs(scenario, { speed });
    for (const [keyWidth, keysHeight] of [[34, 166], [45, 192]]) {
      const geometry = { keyWidth, keysHeight, bedHeight: keysHeight + 90 }, view = viewOf(geometry);
      for (let step = -5; step <= 5; step++) {
        const beat = 4 + step * 0.01;
        const frames = handMotions(inputs.steps, beat, poseOptions(inputs, geometry));
        for (const hand of ["left", "right"]) {
          const solved = poseHand(rigs[hand], frames[hand], view);
          for (const [i, finger] of frames[hand].motion.fingers.entries()) if (finger.state === "down")
            assert.ok(solved.errors[i] < 0.0005,
              `${hand} finger ${i + 1}, beat ${beat}, speed ${speed}, key ${keyWidth}px: ${(solved.errors[i] * 1000).toFixed(3)} mm`);
        }
        if (beat >= 4) {
          assert.notEqual(frames.left.motion.fingers[0].state, "down", "the outgoing thumb's written hold has ended");
          assert.equal(frames.left.motion.fingers[3].state, "down", "the incoming ring finger contacts on time");
          assert.equal(frames.left.motion.fingers[3].midi, 50);
        }
      }
    }
  }
});
