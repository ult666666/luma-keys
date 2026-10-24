import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveHandCoach,
  FINGER_NAMES,
  coachNotes,
  coachGuidance,
} from "../src/hand-coach.mjs";

const note = (id, midi, beat, duration, hand = "right") => ({
  id,
  midi,
  beat,
  duration,
  hand,
});
const fingers = (...entries) => new Map(entries);
const right = (notes, map, beat, options) =>
  deriveHandCoach(notes, map, beat, options).right;

test("finger names are distinct from pitches and shared by both hands", () => {
  assert.deepEqual(FINGER_NAMES, {
    1: "thumb",
    2: "index",
    3: "middle",
    4: "ring",
    5: "little",
  });
  assert.ok(Object.isFrozen(FINGER_NAMES));
  const notes = [note("r", 64, 0, 1), note("l", 48, 0, 1, "left")];
  const result = deriveHandCoach(notes, fingers(["r", 1], ["l", 5]), 0);
  assert.equal(result.right.current[0].label, "E4");
  assert.equal(
    result.right.current[0].fingerName,
    "thumb",
    "pitch E is not finger 3",
  );
  assert.equal(result.left.current[0].label, "C3");
  assert.equal(
    result.left.current[0].fingerName,
    "little",
    "the left C can use finger 5",
  );
});

test("new attacks and held notes remain distinct within the same chord", () => {
  const notes = [
    note("held", 60, 0, 4),
    note("first", 64, 0, 0.5),
    note("next", 65, 1, 0.5),
  ];
  const map = fingers(["held", 1], ["first", 3], ["next", 4]);
  assert.equal(right(notes, map, 0).state, "play");
  assert.deepEqual(
    right(notes, map, 0).current.map((n) => n.phase),
    ["attack", "attack"],
  );
  assert.equal(right(notes, map, 0.2).state, "hold");
  const before = right(notes, map, 0.75);
  assert.deepEqual(
    before.current.map((n) => n.label),
    ["C4"],
  );
  assert.equal(before.upcoming[0].label, "F4");
  assert.equal(before.gapBeats, 0.25);
  const together = right(notes, map, 1);
  assert.equal(together.state, "play");
  assert.deepEqual(
    together.current.map((n) => [n.label, n.phase, n.remainingBeats]),
    [
      ["C4", "hold", 3],
      ["F4", "attack", 0.5],
    ],
  );
  assert.equal(
    right(notes, map, 4).state,
    "rest",
    "release at the written end is silent",
  );
});

test("rests, count-in, next chords, and empty hands have truthful states", () => {
  const notes = [
    note("a", 60, 2, 0.5),
    note("b", 64, 2, 0.5),
    note("c", 67, 4, 1),
  ];
  const map = fingers(["a", 1], ["b", 3], ["c", 5]);
  const before = deriveHandCoach(notes, map, -1);
  assert.equal(before.right.state, "next");
  assert.equal(before.right.gapBeats, 3);
  assert.deepEqual(
    before.right.upcoming.map((n) => n.phase),
    ["next", "next"],
  );
  assert.equal(before.left.state, "empty");
  assert.equal(before.left.hasNotes, false);
  const rest = right(notes, map, 3);
  assert.equal(rest.state, "next");
  assert.equal(rest.current.length, 0);
  assert.equal(rest.upcoming[0].label, "G4");
  assert.equal(rest.gapBeats, 1);
  const done = right(notes, map, 5);
  assert.equal(done.state, "rest");
  assert.equal(done.hasNotes, true);
  assert.equal(done.gapBeats, null);
  assert.deepEqual(deriveHandCoach([], new Map(), 0), {
    right: {
      state: "empty",
      current: [],
      upcoming: [],
      gapBeats: null,
      hasNotes: false,
    },
    left: {
      state: "empty",
      current: [],
      upcoming: [],
      gapBeats: null,
      hasNotes: false,
    },
  });
});

test("unison voices collapse to one key and retain the longest duration", () => {
  const long = note("long", 60, 0, 4),
    short = note("short", 60, 0.0000002, 1);
  const map = fingers(["long", 1], ["short", 1]);
  for (const notes of [
    [long, short],
    [short, long],
  ]) {
    const cue = right(notes, map, 2).current;
    assert.equal(cue.length, 1);
    assert.deepEqual(new Set(cue[0].ids), new Set(["long", "short"]));
    assert.equal(cue[0].finger, 1);
    assert.equal(cue[0].phase, "hold");
    assert.equal(cue[0].remainingBeats, 2);
  }
});

test("a repeated key replaces its former hold, including an omitted new suggestion", () => {
  const notes = [note("old", 60, 0, 8), note("again", 60, 2, 1)];
  const map = fingers(["old", 1], ["again", 2]);
  const repeated = right(notes, map, 2);
  assert.deepEqual(
    repeated.current.map((n) => [n.ids, n.finger, n.phase]),
    [[["again"], 2, "attack"]],
  );
  assert.equal(
    right(notes, map, 3).current.length,
    0,
    "the older long note does not return",
  );
  map.delete("again");
  const omitted = right(notes, map, 2.5).current;
  assert.equal(omitted.length, 1);
  assert.deepEqual(omitted[0].ids, ["again"]);
  assert.equal(
    omitted[0].finger,
    null,
    "do not retain or guess the old finger",
  );
});

test("missing and contradictory suggestions keep pitches visible without invented fingers", () => {
  const notes = [note("a", 60, 0, 1), note("b", 64, 0, 1), note("c", 67, 0, 1)];
  const missing = right(notes, fingers(["a", 1], ["b", 9]), 0).current;
  assert.deepEqual(
    missing.map((n) => n.finger),
    [1, null, null],
  );
  const conflict = right(notes, fingers(["a", 1], ["b", 1]), 0).current;
  assert.deepEqual(
    conflict.map((n) => [n.label, n.fingerName]),
    [
      ["C4", null],
      ["E4", null],
      ["G4", null],
    ],
  );
  const unison = [note("a", 60, 0, 1), note("b", 60, 0, 1)];
  assert.equal(
    right(unison, fingers(["a", 1], ["b", 2]), 0).current[0].finger,
    null,
  );
});

test("a selected phrase preserves carries, clips releases, and excludes outside onsets", () => {
  const notes = [
    note("carry", 60, 0, 8),
    note("inside", 64, 3, 1),
    note("outside", 67, 5, 1),
  ];
  const map = fingers(["carry", 1], ["inside", 3], ["outside", 5]);
  const options = { start: 2, end: 5 };
  const preparing = right(notes, map, 1, options);
  assert.equal(preparing.state, "next");
  assert.equal(preparing.gapBeats, 1);
  assert.deepEqual(
    preparing.upcoming.map((n) => [n.label, n.remainingBeats]),
    [["C4", 3]],
  );
  const held = right(notes, map, 2, options);
  assert.equal(held.state, "hold");
  assert.equal(held.current[0].end, 5);
  assert.equal(held.upcoming[0].label, "E4");
  assert.equal(right(notes, map, 4, options).upcoming.length, 0);
  assert.equal(right(notes, map, 5, options).current.length, 0);
  assert.equal(right(notes, map, 0, { start: 10, end: 12 }).state, "empty");
});

test("hand choice, flat spelling, and fine onsets do not alter timing", () => {
  const notes = [
    note("a", 60, 0, 0.03125),
    note("b", 61, 0.03125, 0.03125),
    note("l", 48, 0, 1, "left"),
  ];
  const map = fingers(["a", 1], ["b", 2], ["l", 5]);
  const result = deriveHandCoach(notes, map, 0.03125, {
    hand: "right",
    flats: true,
  });
  assert.deepEqual(
    result.right.current.map((n) => n.label),
    ["D♭4"],
  );
  assert.equal(result.left.state, "empty");
  assert.equal(result.right.current[0].beat, 0.03125);
  assert.equal(
    right(notes, map, 0.03125 + 0.01, { attackWindow: 0 }).state,
    "hold",
  );
  assert.equal(
    right(notes, map, 0.03125 - 0.0000002).state,
    "play",
    "floating onset noise is tolerated",
  );
});

test("immutable timing indexes support large scores, seeks, and updated finger maps", () => {
  const notes = Array.from({ length: 50_000 }, (_, i) =>
    note(`n${i}`, 60 + (i % 5), i, 0.5),
  );
  const map = fingers(["n49999", 5], ["n10", 1]);
  const before = JSON.stringify(notes[49999]);
  const end = right(notes, map, 49999.25);
  assert.equal(end.current.length, 1);
  assert.equal(end.current[0].label, "E4");
  assert.equal(end.current[0].finger, 5);
  assert.equal(
    right(notes, map, 10).current[0].finger,
    1,
    "backward seeks do not retain frame state",
  );
  map.set("n49999", 3);
  assert.equal(right(notes, map, 49999.25).current[0].finger, 3);
  assert.equal(
    JSON.stringify(notes[49999]),
    before,
    "the source score is never modified",
  );
  assert.equal(
    right(
      [...notes.slice(0, 1), note("edit", 72, 1, 1)],
      fingers(["edit", 5]),
      1,
    ).current[0].label,
    "C5",
    "a replaced note array builds fresh timing",
  );
});

test("an exact repeated voicing keeps current instructions and one repeat cue", () => {
  const notes = [
    note("a", 60, 0, 1),
    note("b", 64, 0, 1),
    note("c", 60, 1, 1),
    note("d", 64, 1, 1),
  ];
  const map = fingers(["a", 1], ["b", 3], ["c", 1], ["d", 3]);
  for (const beat of [0, 0.5]) {
    const coach = right(notes, map, beat);
    const before = JSON.stringify(coach);
    const shown = coachGuidance(coach, 0.5);
    assert.equal(shown.notes, coach.current);
    assert.equal(shown.repeat, coach.upcoming);
    assert.deepEqual(
      shown.notes.map((n) => n.phase),
      beat === 0 ? ["attack", "attack"] : ["hold", "hold"],
    );
    assert.equal(
      coachNotes(coach, 0.5).length,
      4,
      "full musical cues remain available",
    );
    assert.equal(
      JSON.stringify(coach),
      before,
      "presentation does not mutate cues",
    );
  }
});

test("different notes, fingers and unknown suggestions keep full next instructions", () => {
  const notes = [
    note("a", 60, 0, 1),
    note("b", 64, 0, 1),
    note("c", 60, 1, 1),
    note("d", 64, 1, 1),
  ];
  const map = fingers(["a", 1], ["b", 3], ["c", 1], ["d", 3]);
  const original = right(notes, map, 0.5);
  const cases = [
    {
      ...original,
      upcoming: original.upcoming.map((n, i) =>
        i ? { ...n, midi: 65, label: "F4" } : n,
      ),
    },
    {
      ...original,
      upcoming: original.upcoming.map((n, i) =>
        i ? { ...n, finger: 4, fingerName: "ring" } : n,
      ),
    },
    { ...original, upcoming: original.upcoming.slice(0, 1) },
    {
      ...original,
      current: original.current.map((n) => ({
        ...n,
        finger: null,
        fingerName: null,
      })),
      upcoming: original.upcoming.map((n) => ({
        ...n,
        finger: null,
        fingerName: null,
      })),
    },
    {
      ...original,
      current: original.current.map((n, i) =>
        i ? { ...n, phase: "wrong" } : n,
      ),
    },
  ];
  for (const coach of cases) {
    const shown = coachGuidance(coach, 0.5);
    assert.equal(shown.repeat, null);
    assert.deepEqual(shown.notes, [...coach.current, ...coach.upcoming]);
  }
});

test("repeat cues respect the next-attack window, rests and fresh attacks", () => {
  const notes = [note("a", 60, 0, 0.5), note("b", 60, 1, 0.5)];
  const map = fingers(["a", 1], ["b", 1]);
  const current = right(notes, map, 0);
  for (const gap of [null, 1, 2]) {
    const shown = coachGuidance(current, gap);
    assert.equal(shown.repeat, null);
    assert.equal(
      shown.notes,
      current.current,
      "farther attacks are not added early",
    );
  }
  const rest = right(notes, map, 0.75);
  const shown = coachGuidance(rest, 0.125);
  assert.equal(shown.repeat, null);
  assert.equal(
    shown.notes,
    rest.upcoming,
    "after release, the next notes are explicit again",
  );
  const attack = coachGuidance(right(notes, map, 1), 0);
  assert.equal(attack.repeat, null);
  assert.deepEqual(
    attack.notes.map((n) => n.phase),
    ["attack"],
    "a repeated note becomes a fresh attack",
  );
  assert.deepEqual(coachGuidance(right(notes, map, 2), null), {
    notes: [],
    repeat: null,
  });
});
