import test from "node:test";
import assert from "node:assert/strict";
import {
  pianoNoteSeconds,
  planPianoStart,
  planPianoWindow,
} from "../src/piano-phrasing.mjs";

const score = { bpm: 60, duration: 8 };
const note = { id: "c", midi: 60, beat: 0, duration: 2, pianoGate: 0.5 };

test("the opening window queues beat zero before a delayed first frame, without repeating its attack", () => {
  const notes = [
    note,
    { ...note, id: "d", midi: 62, beat: 0.5 },
    { ...note, id: "e", midi: 64, beat: 1 },
  ];
  const options = { score, origin: 0, start: 10, now: 10 };
  const opening = planPianoWindow(notes, 0, options);
  assert.deepEqual(
    opening.attacks.map((a) => [a.note.id, a.when]),
    [
      ["c", 10],
      ["d", 10.5],
    ],
  );
  const delayed = planPianoWindow(notes, opening.index, {
    ...options,
    now: 10.4,
  });
  assert.deepEqual(delayed.attacks, []);
  const next = planPianoWindow(notes, delayed.index, {
    ...options,
    now: 10.55,
  });
  assert.deepEqual(
    next.attacks.map((a) => [a.note.id, a.when]),
    [["e", 11]],
  );
  // Later long stalls skip expired attacks rather than creating a burst.
  assert.deepEqual(
    planPianoWindow(notes, 0, { ...options, now: 11.8 }).attacks,
    [],
  );
});

test("queued deadlines follow tempo changes, practice speed, expressive delays and phrase bounds", () => {
  const changing = {
    ...score,
    tempos: [
      { beat: 0, bpm: 60 },
      { beat: 1, bpm: 120 },
    ],
  };
  const notes = [
    { ...note, id: "start", beat: 1, duration: 0.5, pianoDelay: 0.02 },
    { ...note, id: "next", beat: 1.5, duration: 0.5 },
    { ...note, id: "end", beat: 2, duration: 0.5 },
  ];
  const options = {
    score: changing,
    speed: 0.5,
    origin: 1,
    start: 12,
    now: 12,
    end: 2,
  };
  const queued = planPianoWindow(notes, 0, options);
  assert.deepEqual(
    queued.attacks.map((a) => [a.note.id, a.when]),
    [
      ["start", 12.02],
      ["next", 12.5],
    ],
  );
  assert.equal(queued.attacks[0].duration, 0.25);
  assert.equal(
    planPianoWindow(notes, queued.index, { ...options, now: 12.8 }).attacks
      .length,
    0,
  );
  // A future count-in origin queues exact deadlines after the clicks.
  const countIn = planPianoWindow(notes, 0, { ...options, start: 16, now: 16 });
  assert.equal(countIn.attacks[0].when, 16.02);
  const negativeCountIn = planPianoWindow([note], 0, {
    score,
    origin: -4,
    start: 20,
    now: 20,
  });
  assert.deepEqual(negativeCountIn.attacks, []);
  const approaching = planPianoWindow([note], 0, {
    score,
    origin: -4,
    start: 20,
    now: 23.6,
  });
  assert.equal(approaching.attacks[0].when, 24);
});

test("articulated releases remain absolute when seeking and respect written rests", () => {
  assert.equal(pianoNoteSeconds(score, 1, 0.75, 2, 8, note), 0.25);
  assert.equal(pianoNoteSeconds(score, 1, 1.5, 2, 8, note), 0);
  assert.equal(planPianoStart([note], 1.5, 8, score).continuations.length, 0);
});
test("resume recovers notes still ringing under a written pedal", () => {
  const pedalled = { ...score, pedals: [{ start: 0, end: 4 }] };
  const plan = planPianoStart([note], 3, 8, pedalled);
  assert.equal(plan.index, 1);
  assert.equal(plan.continuations.length, 1);
  assert.equal(pianoNoteSeconds(pedalled, 1, 3, 4, 8, note), 1);
  assert.equal(pianoNoteSeconds(pedalled, 1, 3, 4, 3.5, note), 0.5);
  assert.equal(planPianoStart([note], 4, 8, pedalled).continuations.length, 0);
});
test("a later pedal does not revive an already damped staccato note", () => {
  const pedalled = { ...score, pedals: [{ start: 1.25, end: 4 }] };
  assert.equal(pianoNoteSeconds(pedalled, 1, 0, 2, 8, note), 1);
  assert.equal(
    planPianoStart([note], 1.5, 8, pedalled).continuations.length,
    0,
  );
});
test("key holds follow changing written tempo and practice speed", () => {
  const changing = {
    ...score,
    tempos: [
      { beat: 0, bpm: 60 },
      { beat: 0.5, bpm: 120 },
    ],
  };
  assert.equal(pianoNoteSeconds(changing, 1, 0, 2, 8, note), 0.75);
  assert.equal(pianoNoteSeconds(changing, 0.5, 0, 2, 8, note), 1.5);
});

test("pedalled repeated pitches resume at their own elapsed positions, never as new simultaneous attacks", () => {
  const notes = Array.from({ length: 12 }, (_, i) => ({
    id: `repeat-${i}`,
    midi: 60,
    beat: i / 2,
    duration: 0.4,
  }));
  const pedalled = { ...score, pedals: [{ start: 0, end: 8 }] };
  const plan = planPianoStart(notes, 6, 8, pedalled);
  assert.equal(plan.index, notes.length);
  assert.deepEqual(
    plan.continuations.map((c) => c.elapsedBeats),
    notes.map((n) => 6 - n.beat),
  );
  assert.ok(plan.continuations.every((c) => c.duration === 2));
  const exact = planPianoStart(notes, 3, 8, pedalled);
  assert.equal(exact.index, 6);
  assert.ok(
    exact.continuations.every((c) => c.note.beat < 3 && c.elapsedBeats > 0),
  );
  assert.equal(planPianoStart(notes, -1, 8, pedalled).continuations.length, 0);
  assert.equal(planPianoStart(notes, 8, 8, pedalled).continuations.length, 0);
});
