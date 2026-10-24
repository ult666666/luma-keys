import assert from "node:assert/strict";
import test from "node:test";
import { gradeRhythm, rhythmFor } from "../src/companion-rhythm.mjs";

const expectedPatterns = {
  beethoven: [0, 0.5, 1, 2],
  langlang: [0, 0.5, 1.5, 2, 3],
  mozart: [0, 1, 1.5, 2.5, 3],
  liszt: [0, 0.5, 1, 2, 2.5, 3],
  cat: [0, 1, 2, 3],
  bunny: [0, 0.5, 2, 2.5],
};
const times = (pattern, bpm, origin = 5_000) =>
  pattern.onsets.map((beat) => origin + (beat * 60_000) / bpm);
const approximately = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);

test("all six companions have distinct, deeply frozen four-beat patterns", () => {
  for (const [id, onsets] of Object.entries(expectedPatterns)) {
    const pattern = rhythmFor(id);
    assert.equal(pattern.id, id);
    assert.equal(pattern.beats, 4);
    assert.ok(pattern.title.length > 0);
    assert.deepEqual(pattern.onsets, onsets);
    assert.ok(Object.isFrozen(pattern));
    assert.ok(Object.isFrozen(pattern.onsets));
    assert.throws(() => pattern.onsets.push(3.5), TypeError);
    assert.strictEqual(rhythmFor(id), pattern);
  }
  for (const unknown of [undefined, "", "unknown", "__proto__", null])
    assert.strictEqual(rhythmFor(unknown), rhythmFor("beethoven"));
});

test("every pattern grades accurately across tempos with no first-reaction penalty", () => {
  for (const id of Object.keys(expectedPatterns)) {
    const pattern = rhythmFor(id);
    for (const bpm of [30, 60, 90, 120, 240]) {
      for (const origin of [0, 17_291.75, 1_800_000_000_000]) {
        const result = gradeRhythm(pattern, times(pattern, bpm, origin), bpm);
        assert.equal(result.complete, true, `${id} at ${bpm} BPM`);
        assert.equal(result.matched, pattern.onsets.length);
        assert.equal(result.total, pattern.onsets.length);
        assert.equal(result.marks[0].offsetMs, 0);
        assert.ok(result.meanErrorMs < 0.001);
        assert.ok(result.marks.every((mark) => mark.kind === "on-time"));
      }
    }
  }
});

test("timing tolerance scales with the beat and includes the exact boundary", () => {
  const pattern = rhythmFor("cat");
  for (const bpm of [30, 80, 120, 240]) {
    const beatMs = 60_000 / bpm;
    for (const sign of [-1, 1]) {
      const onBoundary = times(pattern, bpm).map((time, index) =>
        index ? time + sign * beatMs * 0.18 : time,
      );
      assert.equal(gradeRhythm(pattern, onBoundary, bpm).matched, 4);
      const outside = onBoundary.map((time, index) =>
        index ? time + sign * 0.01 : time,
      );
      const result = gradeRhythm(pattern, outside, bpm);
      assert.equal(result.complete, true);
      assert.equal(result.matched, 1);
      assert.ok(
        result.marks
          .slice(1)
          .every((mark) => mark.kind === (sign < 0 ? "early" : "late")),
      );
    }
  }
});

test("late drift and early taps report signed errors without diluting the mean with the anchor", () => {
  const pattern = rhythmFor("cat");
  const late = gradeRhythm(pattern, [8_000, 8_600, 9_200, 9_800], 120);
  assert.deepEqual(
    late.marks.map((mark) => mark.offsetMs),
    [0, 100, 200, 300],
  );
  assert.deepEqual(
    late.marks.map((mark) => mark.kind),
    ["on-time", "late", "late", "late"],
  );
  assert.equal(late.meanErrorMs, 200);
  assert.match(late.summary, /late/);
  const early = gradeRhythm(pattern, [3_000, 3_380, 3_880, 4_380], 120);
  assert.equal(early.meanErrorMs, 120);
  assert.deepEqual(
    early.marks.slice(1).map((mark) => mark.offsetMs),
    [-120, -120, -120],
  );
  assert.match(early.summary, /early/);
  const mixed = gradeRhythm(pattern, [0, 400, 1_100, 1_500], 120);
  approximately(mixed.meanErrorMs, 200 / 3);
  assert.match(mixed.summary, /early and others late/);
});

test("a missed interior or final tap stays missing without shifting correct later taps", () => {
  const pattern = rhythmFor("cat");
  const interior = gradeRhythm(pattern, [1_000, 2_000, 2_500], 120);
  assert.equal(interior.complete, false);
  assert.equal(interior.matched, 3);
  assert.deepEqual(
    interior.marks.map((mark) => mark.kind),
    ["on-time", "missing", "on-time", "on-time"],
  );
  assert.equal(interior.marks[1].offsetMs, null);
  assert.equal(interior.meanErrorMs, 0);
  assert.match(interior.summary, /1 tap is missing/);
  const final = gradeRhythm(pattern, [1_000, 1_500, 2_000], 120);
  assert.deepEqual(
    final.marks.map((mark) => mark.kind),
    ["on-time", "on-time", "on-time", "missing"],
  );
  assert.equal(final.complete, false);
  const anchor = gradeRhythm(pattern, [1_000], 120);
  assert.equal(anchor.matched, 1);
  assert.equal(anchor.complete, false);
  assert.equal(anchor.meanErrorMs, null);
  const empty = gradeRhythm(pattern, [], 120);
  assert.equal(empty.matched, 0);
  assert.equal(empty.complete, false);
  assert.equal(empty.meanErrorMs, null);
});

test("extra, malformed, nonfinite, descending and repeated timestamps cannot pass", () => {
  const pattern = rhythmFor("cat");
  for (const taps of [
    null,
    {},
    "0,500,1000,1500",
    [0, 500, 1_000, 1_500, 2_000],
    [0, 500, NaN, 1_500],
    [0, 500, Infinity, 1_500],
    [0, 500, "1000", 1_500],
    [0, 500, 500, 1_500],
    [0, 1_000, 500, 1_500],
    [-1, 500, 1_000, 1_500],
    [0, 500, 1_000, Number.MAX_SAFE_INTEGER + 1],
    [0, , 1_000, 1_500],
  ]) {
    const result = gradeRhythm(pattern, taps, 120);
    assert.equal(result.complete, false);
    assert.equal(result.matched, 0);
    assert.equal(result.meanErrorMs, null);
    assert.equal(result.total, 4);
    assert.ok(result.marks.every((mark) => mark.kind === "missing"));
  }
});

test("invalid tempos and malformed or unbounded patterns reject safely", () => {
  const pattern = rhythmFor("cat");
  for (const bpm of [
    undefined,
    null,
    "120",
    0,
    -60,
    29.99,
    240.01,
    NaN,
    Infinity,
  ]) {
    const result = gradeRhythm(pattern, [0, 500, 1_000, 1_500], bpm);
    assert.equal(result.complete, false);
    assert.equal(result.matched, 0);
  }
  for (const invalid of [
    undefined,
    null,
    {},
    { beats: 3, onsets: [0, 1, 2] },
    { beats: 4, onsets: [0] },
    { beats: 4, onsets: [1, 2] },
    { beats: 4, onsets: [0, 2, 1] },
    { beats: 4, onsets: [0, 1, 1] },
    { beats: 4, onsets: [0, 1, NaN] },
    { beats: 4, onsets: [0, 4] },
    { beats: 4, onsets: [0, "1"] },
    { beats: 4, onsets: [0, , 2] },
    { beats: 4, onsets: Array.from({ length: 33 }, (_, i) => i / 10) },
  ]) {
    const result = gradeRhythm(invalid, [], 120);
    assert.deepEqual(
      [result.complete, result.matched, result.total],
      [false, 0, 0],
    );
    assert.deepEqual(result.marks, []);
  }
});

test("grading does not mutate input, and separate results cannot corrupt a pattern", () => {
  const pattern = rhythmFor("bunny");
  const taps = Object.freeze(times(pattern, 90));
  const result = gradeRhythm(pattern, taps, 90);
  result.marks[0].kind = "late";
  assert.equal(gradeRhythm(pattern, taps, 90).matched, 4);
  assert.deepEqual(taps, times(pattern, 90));
  assert.deepEqual(pattern.onsets, expectedPatterns.bunny);
});
