import test from "node:test";
import assert from "node:assert/strict";
import { toneFor, roomImpulse, ROOMS } from "../src/audio.js";

test("a harder touch is louder and brighter; pitch places the note", () => {
  const soft = toneFor(60, 0.26),
    loud = toneFor(60, 0.96);
  assert.ok(loud.gain > soft.gain * 4, JSON.stringify({ soft, loud }));
  assert.ok(loud.cutoff > soft.cutoff * 3);
  assert.ok(soft.cutoff >= 2000, "a soft middle C keeps its body");
  assert.ok(toneFor(96, 0.3).cutoff > toneFor(36, 0.3).cutoff);
  assert.ok(toneFor(21, 0.7).pan < 0 && toneFor(108, 0.7).pan > 0);
  assert.equal(toneFor(64, 0.7).pan, 0);
  for (const t of [toneFor(21, 0), toneFor(108, 1), toneFor(60, NaN)]) {
    assert.ok(Number.isFinite(t.gain) && t.gain > 0 && t.gain <= 0.62);
    assert.ok(t.cutoff > 0 && t.cutoff <= 18000);
    assert.ok(Math.abs(t.pan) <= 0.3);
  }
});

test("a room's impulse is stereo, fades as long as the room rings, and is repeatable", () => {
  const rate = 8000;
  const [left, right] = roomImpulse(rate, ROOMS.hall.decay);
  assert.equal(left.length, right.length);
  assert.equal(left.length, Math.round(rate * ROOMS.hall.decay * 1.15));
  const energy = (a, from, to) => {
    let e = 0;
    for (let i = from; i < to; i++) e += a[i] * a[i];
    return e / (to - from);
  };
  const tenth = Math.round(left.length / 10);
  assert.ok(energy(left, 0, tenth) > energy(left, left.length - tenth, left.length) * 100);
  assert.notDeepEqual(left.slice(0, 400), right.slice(0, 400), "the ears differ");
  const [again] = roomImpulse(rate, ROOMS.hall.decay);
  assert.deepEqual(again, left);
  assert.equal(ROOMS.dry.wet, 0);
  assert.ok(ROOMS.room.decay < ROOMS.hall.decay);
});
