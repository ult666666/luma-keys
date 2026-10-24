import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_RECOVERY_KEY,
  AUDIO_RECOVERY_TTL_MS,
  clearAudioRecovery,
  matchesAudioRecovery,
  readAudioRecovery,
  writeAudioRecovery,
} from "../src/audio-recovery.mjs";

const score = { id: "piece-1", title: "A piece", duration: 32, measures: 8 };
const place = { beat: 13.75, loop: true, loopA: 3, loopB: 6 };
function memory() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("recovery preserves paused place only and is consumed after matching application", () => {
  const storage = memory();
  assert.equal(
    writeAudioRecovery(
      storage,
      { ...score, notes: [{ midi: 60 }], chat: ["private"] },
      { ...place, playing: true, chat: "private", music: "payload" },
    ),
    true,
  );
  const snapshot = readAudioRecovery(storage);
  assert.deepEqual(
    Object.keys(snapshot).sort(),
    ["version", "createdAt", "identity", "beat", "loop", "loopA", "loopB"].sort(),
  );
  assert.deepEqual(snapshot.identity, { id: score.id, seed: null });
  assert.equal(snapshot.beat, 13.75);
  assert.equal(snapshot.loop, true);
  assert.equal(snapshot.loopA, 3);
  assert.equal(snapshot.loopB, 6);
  assert.equal(matchesAudioRecovery(snapshot, { ...score, title: "Renamed" }), true);
  assert.deepEqual(readAudioRecovery(storage), snapshot);
  assert.equal(clearAudioRecovery(storage), true);
  assert.equal(readAudioRecovery(storage), null);
  assert.equal(storage.values.size, 0);
});

test("piece IDs and exercise seeds never restore another piece's place", () => {
  const storage = memory();
  writeAudioRecovery(storage, score, place);
  const saved = readAudioRecovery(storage);
  assert.equal(matchesAudioRecovery(saved, { ...score, id: "piece-2" }), false);
  assert.equal(matchesAudioRecovery(saved, { ...score, id: undefined }), false);
  const exercise = { title: "Reading exercise", exercise: { seed: 83 }, duration: 16, measures: 4 };
  assert.equal(writeAudioRecovery(storage, exercise, place), true);
  const generated = readAudioRecovery(storage);
  assert.equal(matchesAudioRecovery(generated, exercise), true);
  assert.equal(matchesAudioRecovery(generated, { ...exercise, exercise: { seed: 84 } }), false);
  assert.equal(matchesAudioRecovery(generated, { ...exercise, title: "Other exercise" }), false);
  assert.equal(matchesAudioRecovery(generated, { ...exercise, exercise: undefined }), false);
  assert.equal(matchesAudioRecovery(generated, { ...exercise, id: "new-piece" }), false);
  assert.equal(writeAudioRecovery(storage, { ...exercise, id: "exercise-1" }, place), true);
  assert.equal(matchesAudioRecovery(readAudioRecovery(storage), {
    ...exercise, id: "exercise-1", exercise: { seed: 99 },
  }), false);
});

test("a handoff expires after two minutes, including while the normal piece load waits", (t) => {
  let now = 1800000000000;
  t.mock.method(Date, "now", () => now);
  const storage = memory();
  writeAudioRecovery(storage, score, place);
  const snapshot = readAudioRecovery(storage);
  now += AUDIO_RECOVERY_TTL_MS - 1;
  assert.equal(matchesAudioRecovery(snapshot, score), true);
  now++;
  assert.equal(matchesAudioRecovery(snapshot, score), false);
  assert.equal(readAudioRecovery(storage), null);
  assert.equal(storage.values.size, 0);
  now = snapshot.createdAt - 1;
  storage.setItem(AUDIO_RECOVERY_KEY, JSON.stringify(snapshot));
  assert.equal(readAudioRecovery(storage), null);
});

test("write bounds the place and loop to the piece and never saves autoplay", () => {
  const storage = memory();
  writeAudioRecovery(storage, score, { beat: 999, loop: true, loopA: -2, loopB: 100 });
  let snapshot = readAudioRecovery(storage);
  assert.equal(snapshot.beat, 32);
  assert.equal(snapshot.loopA, 1);
  assert.equal(snapshot.loopB, 8);
  assert.equal("playing" in snapshot, false);
  writeAudioRecovery(storage, score, { beat: -9, loop: "true", loopA: 6.9, loopB: 2 });
  snapshot = readAudioRecovery(storage);
  assert.equal(snapshot.beat, 0);
  assert.equal(snapshot.loop, false);
  assert.equal(snapshot.loopA, 6);
  assert.equal(snapshot.loopB, 6);
});

test("malformed and unsupported handoffs are cleared without throwing", () => {
  const storage = memory();
  writeAudioRecovery(storage, score, place);
  const valid = readAudioRecovery(storage);
  for (const raw of [
    "{", "null", "[]", "x".repeat(4097),
    ...[
      { version: 2 }, { createdAt: "today" }, { beat: -1 },
      { beat: null }, { beat: 10000001 }, { loop: "true" },
      { loopA: 0 }, { loopA: 6, loopB: 2 }, { loopB: 2.5 },
      { identity: { title: score.title, seed: -3 } },
      { identity: { id: "", seed: null } },
    ].map((patch) => JSON.stringify({ ...valid, ...patch })),
  ]) {
    storage.setItem(AUDIO_RECOVERY_KEY, raw);
    assert.equal(readAudioRecovery(storage), null, raw);
    assert.equal(storage.values.size, 0);
  }
});

test("failed storage and invalid scores fail safely and remove any previous handoff", () => {
  for (const method of ["getItem", "setItem", "removeItem"]) {
    const storage = memory();
    storage[method] = () => { throw Error("Storage unavailable"); };
    assert.doesNotThrow(() => readAudioRecovery(storage));
    assert.doesNotThrow(() => clearAudioRecovery(storage));
    if (method === "setItem") assert.equal(writeAudioRecovery(storage, score, place), false);
  }
  assert.equal(writeAudioRecovery(null, score, place), false);
  assert.equal(readAudioRecovery(null), null);
  const storage = memory();
  for (const invalid of [
    { ...score, measures: 0 }, { ...score, duration: NaN },
    { ...score, id: undefined, title: "" },
    { ...score, exercise: { seed: -1 } },
  ]) {
    writeAudioRecovery(storage, score, place);
    assert.equal(writeAudioRecovery(storage, invalid, place), false);
    assert.equal(readAudioRecovery(storage), null);
  }
});
