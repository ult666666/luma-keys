import test from "node:test";
import assert from "node:assert/strict";
import { practiceTimeJump, ownsPracticeArrows } from "../src/practice-seek.mjs";
import { secondsBetween } from "../src/tempo.mjs";

const score = { bpm: 120, duration: 80, tempos: [{ beat: 8, bpm: 60 }, { beat: 20, bpm: 150 }] };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
test("five-second jumps follow the displayed song clock across tempo changes at every practice speed", () => {
  for (const speed of [.35, .6, 1, 1.5]) {
    const next = practiceTimeJump(score, 6, 5, speed);
    close(secondsBetween(score, 6, next), 5);
    close(practiceTimeJump(score, next, -5, speed), 6);
  }
});
test("jumps stay at song and repeat boundaries without wrapping", () => {
  close(practiceTimeJump(score, 0, -5), 0);
  close(practiceTimeJump(score, 80, 5), 80);
  close(practiceTimeJump(score, 13, 5, 1, { start: 12, end: 16 }), 16);
  close(practiceTimeJump(score, 13, -5, 1, { start: 12, end: 16 }), 12);
  close(practiceTimeJump(score, -4, 5, .6), practiceTimeJump(score, 0, 5, .6));
});
test("repeated jumps use the newest target and preserve fractional timing", () => {
  let beat = 24;
  for (let i = 0; i < 3; i++) beat = practiceTimeJump(score, beat, 5, .6);
  close(secondsBetween(score, 24, beat), 15);
  close(practiceTimeJump(score, beat, NaN, .6), beat);
});
test("arrows keep native control navigation, except the song timeline", () => {
  const control = { closest: () => ({}) };
  const ordinary = { closest: () => null };
  const timeline = { matches: s => s === ".piece-map-input", closest: () => ({}) };
  assert.equal(ownsPracticeArrows(control), true);
  assert.equal(ownsPracticeArrows(ordinary), false);
  assert.equal(ownsPracticeArrows(timeline), false);
  assert.equal(ownsPracticeArrows(null), false);
});
