import assert from "node:assert/strict";
import test from "node:test";
import { advanceKeyMotion, keyMotionFrame } from "../src/key-motion.mjs";

const a = { id: "long", midi: 60, beat: 0, duration: 4 };
const b = { id: "short", midi: 60, beat: 1, duration: 1 };
const advance = (previous, notes = [], pressed = [], epoch = 0) =>
  advanceKeyMotion(previous, keyMotionFrame(notes, pressed, epoch));
const generation = (state, midi = 60) => state.generations.get(midi) || 0;

test("ending an overlapping score voice preserves resonance on the held key", () => {
  const first = advance(null, [a]);
  const overlap = advance(first, [a, b]);
  const shortEnds = advance(overlap, [a]);
  const allEnd = advance(shortEnds);
  assert.deepEqual(
    [first, overlap, shortEnds, allEnd].map((state) => generation(state)),
    [1, 2, 2, 2],
  );
  assert.deepEqual([...shortEnds.owners.get(60)], ['score:[0,"long"]']);
  assert.equal(allEnd.owners.size, 0);
});

test("live press attacks once and either live or score release preserves the other owner", () => {
  const scoreOnly = advance(null, [a]);
  const together = advance(scoreOnly, [a], [60]);
  const liveRelease = advance(together, [a]);
  const liveRepress = advance(liveRelease, [a], [60]);
  const scoreRelease = advance(liveRepress, [], [60]);
  assert.deepEqual(
    [scoreOnly, together, liveRelease, liveRepress, scoreRelease].map((state) =>
      generation(state),
    ),
    [1, 2, 2, 3, 3],
  );
  assert.deepEqual([...scoreRelease.owners.get(60)], ["live"]);
  assert.equal(advance(scoreRelease, [], [60]), scoreRelease);
});

test("consecutive same-pitch IDs and revisits after silence remain fresh attacks", () => {
  const first = advance(null, [a]);
  const consecutive = advance(first, [b]);
  const silence = advance(consecutive);
  const revisit = advance(silence, [b]);
  assert.deepEqual(
    [first, consecutive, silence, revisit].map((state) => generation(state)),
    [1, 2, 2, 3],
  );
  assert.equal(first.generations.get(60), 1, "earlier state is not mutated");
  assert.equal(consecutive.owners.has(60), true);
});

test("a playback epoch retriggers the same carried score note without retriggering live-only keys", () => {
  const first = advance(null, [a], [60, 72], 10);
  const wrapped = advance(first, [a], [60, 72], 12);
  assert.equal(generation(first, 60), 1);
  assert.equal(
    generation(wrapped, 60),
    2,
    "the carried score note attacks at the loop start",
  );
  assert.equal(
    generation(wrapped, 72),
    1,
    "live-only owner stays held through the wrap",
  );
  const scoreReleased = advance(wrapped, [], [60, 72], 12);
  assert.equal(
    generation(scoreReleased, 60),
    2,
    "score release does not become a new attack",
  );
  assert.equal(
    advance(scoreReleased, [], [60, 72], 14),
    scoreReleased,
    "epoch changes alone cannot retrigger any live-only owner",
  );
  const allReleased = advance(scoreReleased, [], [], 14);
  assert.equal(generation(allReleased, 60), 2);
  assert.equal(generation(allReleased, 72), 1);
});

test("reordering or duplicating current owners does not invent another attack", () => {
  const first = advance(null, [a, b], [60]);
  assert.equal(advance(first, [b, a, b], [60, 60]), first);
  const otherPitch = advance(first, [a, b, { ...a, midi: 64 }], [60]);
  assert.equal(generation(otherPitch, 60), 1);
  assert.equal(generation(otherPitch, 64), 1);
});

test("motion history keeps at most 88 counters and discards ended identities", () => {
  let state = advance(null);
  for (let i = 0; i < 1000; i++) {
    state = advance(state, [{ id: "note-" + i, midi: 21 + (i % 88) }]);
    assert.equal(state.owners.size, 1);
  }
  assert.equal(state.generations.size, 88);
  const cleared = advance(state, [{ id: "invalid", midi: 109 }], [20, 60.5]);
  assert.equal(cleared.owners.size, 0);
  assert.equal(cleared.generations.size, 88);
});
