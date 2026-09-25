import test from "node:test";
import assert from "node:assert/strict";
import {
  gradePerformance,
  timingWindows,
  levelAdvice,
} from "../src/performance.mjs";

const score = { meter: 4, measures: 2, duration: 8 };
const line = (pitches) =>
  pitches.map((midi, i) => ({ id: `n${i}`, midi, beat: i, hand: "right" }));

test("pitch and timing are graded per note with tempo-aware windows", () => {
  const expected = line([60, 62, 64, 65, 67, 69, 71, 72]);
  const played = [
    { midi: 60, beat: 0.02 },
    { midi: 62, beat: 1.3 },
    { midi: 64, beat: 1.9 },
    { midi: 64, beat: 3.5 },
    { midi: 69, beat: 5.0 },
    { midi: 71, beat: 6.05 },
    { midi: 72, beat: 7.35 },
  ];
  const result = gradePerformance(expected, played, {
    score,
    start: 0,
    end: 8,
    stoppedAt: 8,
    secondsPerBeat: 1,
  });
  assert.deepEqual(
    result.notes.map((n) => n.status),
    ["on", "late", "on", "missed", "missed", "on", "on", "late"],
  );
  assert.equal(result.total, 8);
  assert.equal(result.matched, 6);
  assert.equal(result.missed, 2);
  assert.equal(result.extra, 1, "a wrong pitch counts as an extra note");
  assert.equal(result.accuracy, 0.75);
  assert.ok(result.offset > 0, "the mean offset says the player ran late");
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.bars.map((b) => [b.bar, b.total, b.missed, b.extra]),
    [
      [1, 4, 1, 1],
      [2, 4, 1, 0],
    ],
  );
  assert.deepEqual(result.worst, { first: 1, last: 2 });
  assert.deepEqual(timingWindows(1), { onTime: 0.1, accept: 0.4 });
  assert.deepEqual(timingWindows(0.25), { onTime: 0.4, accept: 1 });
});

test("repeated pitches take the nearest attempt and chords need every note", () => {
  const expected = [
    { id: "a", midi: 60, beat: 0 },
    { id: "b", midi: 60, beat: 1 },
    { id: "c", midi: 64, beat: 2 },
    { id: "d", midi: 67, beat: 2 },
  ];
  const played = [
    { midi: 60, beat: 0.9 },
    { midi: 60, beat: 0.05 },
    { midi: 64, beat: 2.02 },
  ];
  const result = gradePerformance(expected, played, {
    score,
    end: 4,
    stoppedAt: 4,
    secondsPerBeat: 0.5,
  });
  assert.deepEqual(
    result.notes.map((n) => [n.id, n.status]),
    [
      ["a", "on"],
      ["b", "on"],
      ["c", "on"],
      ["d", "missed"],
    ],
  );
  assert.equal(result.extra, 0);
  assert.equal(result.accuracy, 0.75);
});

test("stopping early grades only the notes that were reached", () => {
  const expected = line([60, 62, 64, 65, 67, 69, 71, 72]);
  const result = gradePerformance(expected, [{ midi: 60, beat: 0 }], {
    score,
    end: 8,
    stoppedAt: 2.5,
    secondsPerBeat: 0.5,
  });
  assert.equal(result.total, 3);
  assert.equal(result.unreached, 5);
  assert.equal(result.complete, false);
  assert.equal(result.missed, 2);
  const late = gradePerformance(expected, [{ midi: 72, beat: 9 }], {
    score,
    end: 8,
    stoppedAt: 8,
    secondsPerBeat: 0.5,
  });
  assert.equal(late.extra, 0, "attempts far past the end are not counted");
  assert.equal(late.missed, 8);
  assert.equal(late.worst.first, 1);
});

test("level advice needs three complete clean runs", () => {
  const run = (accuracy, timing, complete = true) => ({
    level: 3,
    accuracy,
    timing,
    complete,
  });
  assert.equal(levelAdvice([run(95, 80), run(92, 70)], 3).ready, false);
  assert.equal(
    levelAdvice([run(95, 80), run(92, 70), run(91, 65)], 3).ready,
    true,
  );
  assert.equal(
    levelAdvice([run(95, 80), run(70, 70), run(91, 65)], 3).ready,
    false,
  );
  assert.equal(
    levelAdvice([run(95, 80), run(95, 80, false), run(91, 65), run(93, 61)], 3)
      .ready,
    true,
  );
  assert.equal(
    levelAdvice([{ level: 2, accuracy: 100, timing: 100, complete: true }], 3)
      .ready,
    false,
  );
});
