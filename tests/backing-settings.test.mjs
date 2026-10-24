import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBacking,
  readBackingMap,
  backingKey,
} from "../src/backing-settings.mjs";
import { readPreferences, validatePreferences } from "../src/preferences.mjs";
const track = {
  id: "00000000-1111-4222-8333-444444444444",
  name: "My backing.wav",
  bpm: 72,
  offset: 2.5,
  duration: 240,
};
test("per-piece backing defaults off and keeps valid settings independently", () => {
  assert.equal(defaultBacking().enabled, false);
  assert.deepEqual(readBackingMap(undefined), { settings: {}, invalid: false });
  const raw = {
    one: { enabled: true, style: "acoustic", volume: 0.3 },
    two: { source: "audio", track, enabled: true },
    three: { volume: 3, style: "strings" },
  };
  const before = structuredClone(raw);
  const r = readBackingMap(raw);
  assert.deepEqual(raw, before);
  assert.equal(r.invalid, true);
  assert.equal(r.settings.one.volume, 0.3);
  assert.equal(r.settings.two.track.bpm, 72);
  assert.equal(r.settings.three.style, "strings");
  assert.equal(r.settings.three.volume, 0.45);
  assert.equal(
    readBackingMap({ one: { enabled: true, source: "audio" } }).settings.one
      .enabled,
    false,
  );
});
test("recording settings reject unsafe IDs, unsupported tempos and nonfinite offsets", () => {
  for (const bad of [
    { id: "../preferences" },
    { bpm: 0 },
    { bpm: NaN },
    { offset: -2 },
    { offset: 240 },
    { offset: 241 },
    { duration: Infinity },
    { name: "" },
  ]) {
    const r = readBackingMap({
      one: { source: "audio", enabled: true, track: { ...track, ...bad } },
    });
    assert.equal(r.invalid, true);
    assert.equal(r.settings.one.enabled, false);
    assert.equal(r.settings.one.track, null);
  }
  assert.equal(backingKey({ id: "../score" }), null);
  assert.equal(backingKey({ id: "lesson-1" }), "lesson-1");
  assert.equal(readBackingMap([]).invalid, true);
});
test("backing preferences survive validation without losing other practice fields", () => {
  const p = readPreferences({
    reading: {
      speed: 0.65,
      hand: "right",
      backing: {
        piece: { ...defaultBacking(), enabled: true, source: "audio", track },
      },
    },
  }).preferences;
  assert.equal(p.reading.backing.piece.track.offset, 2.5);
  assert.deepEqual(validatePreferences(p), p);
  assert.equal(p.reading.hand, "right");
  assert.throws(
    () =>
      validatePreferences({ reading: { backing: { piece: { volume: 2 } } } }),
    /Invalid settings/,
  );
});
