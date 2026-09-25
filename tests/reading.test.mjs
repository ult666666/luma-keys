import test from "node:test";
import assert from "node:assert/strict";
import {
  indexReadingNotes,
  readingNotesBetween,
  readingPassage,
  readingRests,
  readingGroups,
  readingBars,
  readingDuration,
  readingSpacing,
  readingNoteDisplay,
} from "../src/reading.mjs";

const note = (beat, duration, midi = 60, hand = "right") => ({
  beat,
  duration,
  midi,
  hand,
});
const score = { meter: 4, measures: 12, duration: 48 };

test("nearly simultaneous floating-point onsets share one visual chord without changing source times", () => {
  const input = [
    note(1, 1, 60),
    note(1.0000000002, 0.5, 64),
    note(1.0000007, 1, 67),
    note(1.0001, 0.25, 72),
  ];
  const index = indexReadingNotes(input);
  assert.deepEqual(index.onsets, [1, 1.0001]);
  const groups = readingGroups(index.hands.right, 0, 4);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].notes.length, 3);
  assert.equal(input[1].beat, 1.0000000002);
  assert.equal(
    index.hands.right[1].beat,
    1.0000000002,
    "source performance onset stays precise",
  );
  assert.equal(
    readingGroups(input, 0, 4).length,
    2,
    "direct callers get the same visual tolerance",
  );
  assert.ok(
    readingSpacing(0, 4, index.onsets).width < 1000,
    "floating-point noise cannot expand the score to thousands of pixels",
  );
});

test("piecewise reading positions preserve card spacing through highly unequal durations", () => {
  const onsets = [0, 0.0625, 0.125, 8, 15.999];
  const layout = readingSpacing(0, 16, onsets);
  for (let i = 1; i < onsets.length; i++) {
    assert.ok(
      (layout.position(onsets[i]) - layout.position(onsets[i - 1])) *
        layout.width >=
        48 - 1e-9,
    );
  }
  assert.ok(
    (1 - layout.position(onsets.at(-1))) * layout.width >= 48 - 1e-9,
    "last card fits before the boundary",
  );
  assert.equal(layout.position(-1), 0);
  assert.equal(layout.position(17), 1);
  assert.ok(
    Math.abs(layout.position(0.03125) - layout.position(0.0625) / 2) < 1e-12,
    "cursor and rest boundaries interpolate in the same coordinate system",
  );
  const mid = (layout.position(8) + layout.position(0.125)) / 2;
  assert.ok(
    Math.abs(layout.position((8 + 0.125) / 2) - mid) < 1e-12,
    "bar lines remain aligned with their true musical time",
  );
});

test("carried notes expose remaining duration and seek within the visible passage", () => {
  const held = note(2, 19, 48, "left");
  const fresh = note(16, 0.5, 60, "left");
  const group = readingGroups([held, fresh], 16, 20)[0];
  assert.equal(group.notes.length, 2);
  assert.equal(
    group.held,
    false,
    "one mixed stack still tracks each note independently",
  );
  assert.deepEqual(readingNoteDisplay(held, 16), {
    held: true,
    seekBeat: 16,
    duration: 5,
  });
  assert.deepEqual(readingNoteDisplay(fresh, 16), {
    held: false,
    seekBeat: 16,
    duration: 0.5,
  });
  assert.equal(held.duration, 19, "display does not rewrite written duration");
});

test("reading pages follow real pickup and changing-meter boundaries", () => {
  const standard = readingPassage(score, indexReadingNotes([]), 0);
  assert.equal(
    standard.lastBar,
    4,
    "exclusive ending beat is not an extra displayed bar",
  );
  assert.equal(
    readingPassage(
      score,
      indexReadingNotes([]),
      readingPassage(score, indexReadingNotes([]), 16).previous,
    ).start,
    0,
  );
  const mixed = {
    meter: 3,
    measures: 5,
    duration: 13,
    pickup: 0.5,
    measureStarts: [0, 0.5, 3.5, 6.5, 10.5],
    measureLengths: [0.5, 3, 3, 4, 2.5],
  };
  const index = indexReadingNotes([
    note(0, 0.5),
    note(0.5, 1),
    note(10.5, 2.5),
  ]);
  const first = readingPassage(mixed, index, 0);
  assert.deepEqual([first.start, first.end, first.next], [0, 10.5, 10.5]);
  const last = readingPassage(mixed, index, 12.5);
  assert.deepEqual(
    [last.start, last.end, last.firstBar, last.next],
    [10.5, 13, 5, null],
  );
  assert.equal(readingPassage(mixed, index, last.previous).start, 0);
  assert.deepEqual(
    readingBars(mixed, first).map((b) => b.end - b.start),
    [0.5, 3, 3, 4],
  );
});

test("sustained notes cross pages as held notes, with truthful silent gaps per hand", () => {
  const index = indexReadingNotes([
    note(0, 20, 48, "left"),
    note(16, 1),
    note(18, 1),
  ]);
  const left = readingNotesBetween(index, "left", 16, 24);
  const right = readingNotesBetween(index, "right", 16, 24);
  assert.deepEqual(readingRests(left, 16, 24), [{ beat: 20, duration: 4 }]);
  assert.deepEqual(readingRests(right, 16, 24), [
    { beat: 17, duration: 1 },
    { beat: 19, duration: 5 },
  ]);
  assert.equal(readingGroups(left, 16, 24)[0].held, true);
  assert.equal(readingGroups(left, 16, 24)[0].beat, 16);
  const entering = readingGroups([...left, note(16, 1, 55, "left")], 16, 24);
  assert.equal(
    entering.length,
    1,
    "held notes share a stack with new notes at a page boundary",
  );
  assert.equal(entering[0].notes.length, 2);
  assert.equal(readingNotesBetween(index, "left", 20, 24).length, 0);
  const manyHeld = Array.from({ length: 10000 }, (_, i) => note(i, 10001 - i));
  assert.equal(
    readingGroups(manyHeld, 10000, 10004)[0].notes.length,
    1,
    "overlapping voices on one held key cannot create an unbounded DOM stack",
  );
});

test("overlapping voices do not become invented rests or duplicate pitch cards", () => {
  const input = [note(0, 1), note(0, 3), note(1, 4, 64), note(5, 1, 67)];
  const index = indexReadingNotes(input);
  assert.equal(input[0].duration, 1, "indexing does not mutate score");
  assert.equal(index.hands.right.length, 3);
  assert.equal(index.hands.right[0].duration, 3);
  assert.deepEqual(readingRests(index.hands.right, 0, 8), [
    { beat: 6, duration: 2 },
  ]);
  assert.deepEqual(readingRests([], 0, 8), [{ beat: 0, duration: 8 }]);
});

test("dense and long scores show bounded onset passages and every segment is reachable", () => {
  const dense = { meter: 500, measures: 100, duration: 50000 };
  const index = indexReadingNotes(
    Array.from({ length: 50000 }, (_, i) => note(i, 0.5)),
  );
  let page = readingPassage(dense, index, 0);
  assert.equal(page.end, 32);
  assert.equal(page.detail, true);
  assert.equal(
    readingNotesBetween(index, "right", page.start, page.end).length,
    32,
  );
  page = readingPassage(dense, index, page.next);
  assert.equal(page.start, 32);
  assert.equal(readingPassage(dense, index, page.previous).start, 0);
  assert.equal(readingPassage(dense, index, 49999).end, 50000);
});

test("chords stay stacked at one onset and duration labels retain triplets and dotted notes", () => {
  const groups = readingGroups(
    [note(1, 0.333333, 60), note(1, 1.5, 64), note(2, 0.5, 62)],
    0,
    4,
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups[0].notes.map((n) => n.midi),
    [64, 60],
  );
  assert.deepEqual(
    [0.333333, 0.5, 1, 1.5, 3, 0.666667, 1.25].map(readingDuration),
    ["⅓", "½", "1", "1½", "3", "⅔", "1¼"],
  );
  assert.deepEqual(
    [
      readingPassage(score, indexReadingNotes([]), 16, 2).start,
      readingPassage(score, indexReadingNotes([]), 47, 2).end,
    ],
    [16, 48],
  );
});
