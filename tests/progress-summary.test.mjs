import test from "node:test";
import assert from "node:assert/strict";
import { pieceProgressSummary } from "../src/progress-summary.mjs";

test("piece coverage counts the union of played bars, including reversed ranges", () => {
  const summary = pieceProgressSummary(
    {
      ranges: [
        [6, 9],
        [1, 4],
        [3, 7],
        [12, 10],
      ],
      bar: 7,
    },
    { measures: 20 },
  );
  assert.deepEqual(summary, {
    ranges: [[1, 12]],
    coveredBars: 12,
    resumeBar: 7,
    share: 0.6,
  });
});

test("a shorter replacement score clips coverage and the saved resume bar", () => {
  const summary = pieceProgressSummary(
    {
      ranges: [
        [1, 4],
        [7, 15],
        [25, 30],
      ],
      bar: 28,
    },
    { measures: 10 },
  );
  assert.deepEqual(summary, {
    ranges: [
      [1, 4],
      [7, 10],
    ],
    coveredBars: 8,
    resumeBar: 10,
    share: 0.8,
  });
});

test("a saved bar at the end does not turn an unfinished piece into completion", () => {
  assert.deepEqual(
    pieceProgressSummary({ ranges: [[5, 7]], bar: 12 }, { measures: 12 }),
    { ranges: [[5, 7]], coveredBars: 3, resumeBar: 12, share: 0.25 },
  );
  assert.equal(
    pieceProgressSummary({ ranges: [], bar: 12 }, { measures: 12 }).share,
    0,
  );
  assert.equal(
    pieceProgressSummary({ ranges: [[1, 12]], bar: 3 }, { measures: 12 })
      .resumeBar,
    3,
  );
});

test("removed pieces keep their original coverage without inventing a percentage", () => {
  assert.deepEqual(
    pieceProgressSummary({
      ranges: [
        [5, 8],
        [1, 4],
        [12, 14],
      ],
      bar: 13,
    }),
    {
      ranges: [
        [1, 8],
        [12, 14],
      ],
      coveredBars: 11,
      resumeBar: 13,
      share: null,
    },
  );
});

test("invalid ranges and saved bars do not enter the displayed summary", () => {
  const summary = pieceProgressSummary(
    {
      ranges: [
        null,
        [1],
        Array(2),
        [1, 2, 3],
        ["1", 5],
        [0, 2],
        [-2, 5],
        [1.5, 4],
        [2, Infinity],
        [1, NaN],
        [1, 100001],
        [4, 6],
      ],
      bar: -1,
    },
    { measures: 8 },
  );
  assert.deepEqual(summary, {
    ranges: [[4, 6]],
    coveredBars: 3,
    resumeBar: 1,
    share: 3 / 8,
  });
  assert.deepEqual(pieceProgressSummary(undefined, { measures: 8 }), {
    ranges: [],
    coveredBars: 0,
    resumeBar: 1,
    share: 0,
  });
  assert.equal(
    pieceProgressSummary({ ranges: {}, bar: "4" }, { measures: 8 }).resumeBar,
    1,
  );
});

test("unknown score bounds do not erase history or divide by zero", () => {
  for (const measures of [undefined, 0, -2, 1.5, Infinity, "12"]) {
    assert.deepEqual(
      pieceProgressSummary({ ranges: [[2, 4]], bar: 7 }, { measures }),
      { ranges: [[2, 4]], coveredBars: 3, resumeBar: 7, share: null },
    );
  }
  assert.deepEqual(
    pieceProgressSummary({ ranges: [[1, 4]], bar: 4 }, { measures: 1 }),
    { ranges: [[1, 1]], coveredBars: 1, resumeBar: 1, share: 1 },
  );
});

test("summaries leave the score and nested journal arrays untouched", () => {
  const ranges = Object.freeze([Object.freeze([8, 4]), Object.freeze([1, 3])]);
  const entry = Object.freeze({ ranges, bar: 18 });
  const score = Object.freeze({ measures: 6, title: "A shorter revision" });
  const summary = pieceProgressSummary(entry, score);
  assert.deepEqual(summary.ranges, [[1, 6]]);
  assert.deepEqual(entry.ranges, [
    [8, 4],
    [1, 3],
  ]);
  assert.notEqual(summary.ranges, entry.ranges);
  assert.notEqual(summary.ranges[0], entry.ranges[0]);
  assert.equal(entry.bar, 18);
  assert.equal(score.measures, 6);
});
