import test from "node:test";
import assert from "node:assert/strict";
import {
  planListenStart,
  listenNoteDuration,
  listenWindowNotes,
} from "../src/listen-start.mjs";

const note = (beat, duration, midi = 60, hand = "right") => ({
  beat,
  duration,
  midi,
  hand,
  velocity: 0.7,
});

test("resume inside a sustained note schedules only its remaining duration once", () => {
  const held = note(0, 8),
    next = note(6, 1, 64);
  const notes = [held, next];
  const plan = planListenStart(notes, 4, 8);
  assert.equal(plan.index, 1);
  assert.deepEqual(plan.continuations, [{ note: held, duration: 4 }]);
  assert.deepEqual(
    notes.slice(plan.index),
    [next],
    "ordinary scheduler cannot attack the continuation a second time",
  );
  assert.equal(held.duration, 8, "written duration is preserved");
});

test("exact onsets and their chords stay exclusively in the ordinary scheduler", () => {
  const notes = [
    note(0, 8, 48, "left"),
    note(4, 1, 60),
    note(4, 2, 64),
    note(5, 1, 67),
  ];
  const plan = planListenStart(notes, 4, 8);
  assert.equal(plan.index, 1);
  assert.deepEqual(
    plan.continuations.map((n) => n.note.midi),
    [48],
  );
  assert.deepEqual(
    notes.slice(plan.index, plan.index + 2).map((n) => n.midi),
    [60, 64],
  );
  assert.equal(
    planListenStart([note(4 - 0.0000002, 1)], 4, 8).continuations.length,
    0,
    "rounding tolerance cannot duplicate the boundary attack",
  );
});

test("carry-only listen loops restart the hold and clip it to the loop boundary", () => {
  const notes = [note(0, 16)];
  const plan = planListenStart(notes, 4, 8);
  assert.equal(plan.index, notes.length, "loop has no new onsets");
  assert.equal(plan.continuations[0].duration, 4);
  assert.deepEqual(
    planListenStart(notes, 4, 8),
    plan,
    "every loop traversal plans one identical remaining hold",
  );
  assert.deepEqual(
    listenWindowNotes(notes, 4, 8),
    notes,
    "Listen visuals retain the same carry-in note as playback",
  );
  assert.deepEqual(
    listenWindowNotes([note(0, 4), ...notes, note(8, 4)], 4, 8),
    notes,
    "end/start-only contacts outside the phrase are excluded",
  );
});

test("notes ending at resume and starts at the playback end are silent", () => {
  assert.deepEqual(planListenStart([note(0, 4)], 4, 8).continuations, []);
  assert.deepEqual(planListenStart([note(0, 12)], 8, 8).continuations, []);
  assert.equal(listenNoteDuration(note(8, 4), 4, 8), 0);
  assert.equal(listenNoteDuration(note(7, 4), 7, 8), 1);
  assert.equal(listenNoteDuration(note(6, 1), 6.1, 8), 0.9000000000000004);
});

test("hand filtering is retained and negative count-in starts without premature sound", () => {
  const notes = [note(0, 8, 48, "left"), note(0, 8, 60), note(4, 1, 62)];
  const right = notes.filter((n) => n.hand === "right");
  assert.deepEqual(
    planListenStart(right, 2, 8).continuations.map((n) => n.note.midi),
    [60],
  );
  const countIn = planListenStart(notes, -4, 8);
  assert.deepEqual(countIn, { index: 0, continuations: [] });
  assert.equal(
    listenNoteDuration(notes[0], -1, 8),
    8,
    "normal beat-zero attack retains its full duration",
  );
});
