import test from "node:test";
import assert from "node:assert/strict";
import {
  demos,
  countInLength,
  metronomeEvents,
  degree,
  solfege,
} from "../src/music.mjs";
import { validatePractice } from "../src/export.mjs";
const elise = demos().find((s) => s.id === "elise");

test("Für Elise excerpt follows the public-domain opening pitches and separate hands", () => {
  const right = elise.notes.filter((n) => n.hand === "right");
  const left = elise.notes.filter((n) => n.hand === "left");
  assert.equal(right.length, 35);
  assert.equal(left.length, 18);
  assert.deepEqual(
    right.map((n) => n.midi),
    [
      76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72, 64,
      76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69,
    ],
  );
  assert.deepEqual(
    left.map((n) => n.midi),
    [45, 52, 57, 40, 52, 56, 45, 52, 57, 45, 52, 57, 40, 52, 56, 45, 52, 57],
  );
  assert.deepEqual(
    right.slice(0, 3).map((n) => [n.beat, n.duration]),
    [
      [0, 0.25],
      [0.25, 0.25],
      [0.5, 0.25],
    ],
  );
  assert.deepEqual(
    left.slice(0, 3).map((n) => [n.beat, n.duration]),
    [
      [2, 0.25],
      [2.25, 0.25],
      [2.5, 0.25],
    ],
  );
  // A4's eighth note ends at 2.5; the sixteenth rest before C4 stays silent.
  assert.deepEqual(
    right.slice(8, 10).map((n) => [n.beat, n.duration]),
    [
      [2, 0.5],
      [2.75, 0.25],
    ],
  );
  assert.deepEqual(
    right.slice(-1).map((n) => [n.midi, n.beat, n.duration]),
    [[69, 11, 1]],
  );
});

test("Für Elise pickup, 3/8 bars and short first ending keep their exact boundaries", () => {
  assert.equal(elise.bpm, 72);
  assert.equal(elise.pickup, 0.5);
  assert.equal(elise.duration, 12);
  assert.deepEqual(elise.measureStarts, [0, 0.5, 2, 3.5, 5, 6.5, 8, 9.5, 11]);
  assert.deepEqual(
    elise.measureLengths,
    [0.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1],
  );
  assert.equal(countInLength(elise), 1);
  assert.deepEqual(
    metronomeEvents(elise, -1.000001, 0.5).map((n) => [
      n.beat,
      n.count,
      n.accent,
    ]),
    [
      [-1, 1, true],
      [-0.5, 2, false],
      [0, 3, false],
      [0.5, 1, true],
    ],
  );
  assert.equal(degree(75), "♯2");
  assert.equal(solfege(75), "Ri");
  assert.equal(elise.notes.filter((n) => n.measure === 1).length, 2);
  assert.deepEqual(elise.warnings, []);
  assert.match(elise.xml, /Mutopia-2015\/08\/18-931/);
  validatePractice(elise);
});

test("Optional practice guidance must be a bounded list of text", () => {
  assert.throws(() =>
    validatePractice({ ...elise, practiceTips: { bad: true } }),
  );
  assert.throws(() =>
    validatePractice({ ...elise, practiceTips: [{ bad: true }] }),
  );
  assert.throws(() =>
    validatePractice({ ...elise, practiceTips: ["x".repeat(1001)] }),
  );
  assert.throws(() =>
    validatePractice({ ...elise, practiceTips: Array(11).fill("tip") }),
  );
});
