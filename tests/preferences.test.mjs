import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  readPreferences,
  validatePreferences,
  defaultReading,
} from "../src/preferences.mjs";
import { PianoAudio } from "../src/audio.js";
import { startServer } from "../server.mjs";
test("settings recovery retains valid fields and replaces only invalid values", () => {
  const raw = {
    theme: "rose",
    pet: "bunny",
    volume: { bad: true },
    stats: {
      correct: 52,
      minutes: 12.5,
      sessions: "3",
      dailyMinutes: -1,
      practiceDate: "2026-02-30",
    },
  };
  const before = structuredClone(raw),
    result = readPreferences(raw);
  assert.deepEqual(raw, before);
  assert.deepEqual(result.preferences, {
    theme: "rose",
    pet: "bunny",
    volume: 0.65,
    stats: {
      correct: 52,
      minutes: 12.5,
      sessions: 0,
      dailyMinutes: 0,
      practiceDate: "",
    },
    reading: defaultReading(),
    history: [],
  });
  assert.deepEqual(result.issues, [
    "Piano volume",
    "Practice-session total",
    "Today’s practice minutes",
    "Practice date",
  ]);
  assert.deepEqual(
    readPreferences({ theme: "lavender" }).issues,
    [],
    "older settings can omit new fields",
  );
  assert.deepEqual(readPreferences(null).issues, ["Saved settings"]);
  assert.deepEqual(readPreferences([]).issues, ["Saved settings"]);
});
test("saved settings reject invalid volumes, progress types, enum values and impossible dates", () => {
  for (const v of [
    null,
    [],
    { volume: Infinity },
    { volume: -1 },
    { volume: 2 },
    { volume: "0.5" },
    { pet: "dog" },
    { theme: {} },
    { stats: null },
    { stats: { correct: "50" } },
    { stats: { sessions: 0.5 } },
    { stats: { dailyMinutes: 1441 } },
    { stats: { minutes: NaN } },
    { stats: { practiceDate: "2026-02-30" } },
  ])
    assert.throws(() => validatePreferences(v), /Invalid settings/);
  const valid = {
    theme: "mint",
    pet: "cat",
    volume: 0,
    stats: {
      correct: 0,
      minutes: 0,
      sessions: 0,
      dailyMinutes: 0,
      practiceDate: "2024-02-29",
    },
    reading: {
      ...defaultReading(),
      labels: "letters",
      speed: 0.5,
      mode: "perform",
      exercise: { ...defaultReading().exercise, level: 6, fifths: -1 },
    },
    history: [
      {
        at: "2026-09-25T14:00:00.000Z",
        title: "Sight reading · Level 6 · F major",
        scoreId: null,
        level: 6,
        fifths: -1,
        seed: 12,
        accuracy: 87.5,
        timing: 60,
        notes: 24,
        tempo: 72,
        mode: "perform",
        complete: true,
        bars: 8,
        exercise: {
          seed: 12,
          level: 6,
          fifths: -1,
          hands: "auto",
          bars: "auto",
          meter: "auto",
          tempo: "auto",
        },
      },
    ],
  };
  assert.deepEqual(
    validatePreferences(valid),
    valid,
    "mute, zero counters and leap dates are preserved",
  );
});
test("reading settings and practice history recover field by field", () => {
  const result = readPreferences({
    reading: {
      labels: "solfege",
      speed: 3,
      mode: "perform",
      keyboardCollapsed: "yes",
      exercise: { level: 40, hands: "left", bars: 8 },
    },
    history: [
      {
        at: "2026-09-25T14:00:00.000Z",
        title: "ok",
        accuracy: 100,
        timing: 100,
        notes: 8,
        tempo: 60,
        mode: "perform",
        complete: true,
        bars: 4,
      },
      { at: "not a date", title: "bad" },
    ],
  });
  assert.equal(result.preferences.reading.labels, "solfege");
  assert.equal(result.preferences.reading.mode, "perform");
  assert.equal(
    result.preferences.reading.speed,
    0.75,
    "invalid speed → default",
  );
  assert.equal(result.preferences.reading.keyboardCollapsed, false);
  assert.equal(result.preferences.reading.coach, true);
  assert.equal(
    readPreferences({ reading: { coach: false, welcomeSeen: true } })
      .preferences.reading.welcomeSeen,
    true,
  );
  assert.deepEqual(readPreferences({ reading: { coach: "yes" } }).issues, [
    "Reading preferences",
  ]);
  assert.deepEqual(result.preferences.reading.exercise, {
    ...defaultReading().exercise,
    hands: "left",
    bars: 8,
  });
  assert.equal(result.preferences.history.length, 1);
  assert.equal(result.preferences.history[0].exercise, null);
  assert.deepEqual(result.issues, ["Reading preferences", "Practice history"]);
  const run = (title, exercise) => ({
    at: "2026-09-25T14:00:00.000Z",
    title,
    accuracy: 80,
    timing: 50,
    notes: 8,
    tempo: 60,
    mode: "perform",
    complete: true,
    bars: 4,
    exercise,
  });
  const withRef = readPreferences({
    history: [run("ref", { seed: 5, level: 2 }), run("bad ref", { level: 2 })],
  });
  assert.equal(withRef.preferences.history.length, 1);
  assert.deepEqual(withRef.preferences.history[0].exercise, {
    seed: 5,
    level: 2,
    fifths: "auto",
    hands: "auto",
    bars: "auto",
    meter: "auto",
    tempo: "auto",
  });
  assert.deepEqual(withRef.issues, ["Practice history"]);
  const many = Array.from({ length: 450 }, (_, i) => ({
    at: "2026-09-25T14:00:00.000Z",
    title: String(i),
    accuracy: 50,
    timing: 50,
    notes: 1,
    tempo: 60,
    mode: "wait",
    complete: false,
    bars: 1,
  }));
  const capped = readPreferences({ history: many });
  assert.equal(capped.preferences.history.length, 400);
  assert.equal(
    capped.preferences.history.at(-1).title,
    "449",
    "the newest runs are kept",
  );
  assert.deepEqual(capped.issues, []);
  const last = readPreferences({
    reading: {
      last: { scoreId: null, exercise: { level: 4, seed: 77, fifths: -1 } },
    },
  }).preferences.reading.last;
  assert.deepEqual(last, {
    scoreId: null,
    exercise: {
      seed: 77,
      level: 4,
      fifths: -1,
      hands: "auto",
      bars: "auto",
      meter: "auto",
      tempo: "auto",
    },
  });
  assert.deepEqual(
    readPreferences({ reading: { last: { scoreId: "elise" } } }).preferences
      .reading.last,
    { scoreId: "elise", exercise: null },
  );
  assert.deepEqual(
    readPreferences({ reading: { last: { exercise: { level: 4 } } } }).issues,
    ["Reading preferences"],
    "an exercise without a seed cannot be reopened",
  );
  assert.throws(
    () => validatePreferences({ history: "x" }),
    /Practice history/,
  );
  assert.throws(
    () => validatePreferences({ reading: { hand: "feet" } }),
    /Reading preferences/,
  );
});
test("audio gain stays finite and bounded even if a caller supplies a bad volume", () => {
  const piano = new PianoAudio(),
    scheduled = [];
  piano.ctx = { currentTime: 3 };
  piano.master = {
    gain: { setTargetAtTime: (...args) => scheduled.push(args) },
  };
  piano.setVolume(0.42);
  piano.setVolume({});
  piano.setVolume(NaN);
  piano.setVolume(Infinity);
  assert.equal(piano.volume, 0.42);
  assert.equal(scheduled.length, 1);
  piano.setVolume(-20);
  assert.equal(piano.volume, 0);
  piano.setVolume(300);
  assert.equal(piano.volume, 1);
  assert.ok(
    scheduled.every(
      ([gain]) => Number.isFinite(gain) && gain >= 0 && gain <= 1,
    ),
  );
});
test("settings reads do not overwrite corruption; repairs preserve exact bytes and save atomically", async () => {
  await fs.mkdir(".qa-runs", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".qa-runs/settings-api-"));
  const dataDir = path.join(root, "Library");
  const { server, port } = await startServer({ port: 0, dataDir });
  const base = `http://127.0.0.1:${port}/api`;
  const file = path.join(dataDir, "preferences.json");
  const put = async (value) =>
    fetch(base + "/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  try {
    const initial = await (await fetch(base + "/settings")).json();
    assert.equal(initial.issues.length, 0);
    await assert.rejects(
      fs.stat(file),
      { code: "ENOENT" },
      "first read does not create a file",
    );
    const damaged = Buffer.concat([
      Buffer.from('{"theme":"rose","broken":'),
      Buffer.from([0xff, 0xfe]),
    ]);
    await fs.writeFile(file, damaged);
    const read = await (await fetch(base + "/settings")).json();
    assert.deepEqual(read.issues, ["Incomplete settings file"]);
    const legacy = await (await fetch(base + "/preferences")).json();
    assert.equal(legacy.volume, 0.65);
    assert.deepEqual(await fs.readFile(file), damaged);
    assert.equal((await put({ volume: { bad: true } })).status, 400);
    assert.deepEqual(
      await fs.readFile(file),
      damaged,
      "rejected writes leave original data unchanged",
    );
    const preferences = validatePreferences({
      theme: "lavender",
      pet: "bunny",
      volume: 0,
      stats: { correct: 52, minutes: 12.5 },
    });
    const response = await put(preferences);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(
      result.recoveryFile.startsWith(path.join(dataDir, "Settings recovery")),
    );
    assert.deepEqual(
      await fs.readFile(result.recoveryFile),
      damaged,
      "even invalid UTF-8 bytes survive recovery",
    );
    assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), preferences);
    assert.equal(
      (await (await fetch(base + "/settings")).json()).issues.length,
      0,
    );
    const updates = await Promise.all([
      put({ ...preferences, volume: 0.2 }),
      put({ ...preferences, volume: 0.3 }),
    ]);
    assert.ok(updates.every((r) => r.status === 200));
    assert.equal(
      (await fs.readdir(path.join(dataDir, "Settings recovery"))).length,
      1,
      "normal saves do not duplicate recovered files",
    );
    assert.ok(!(await fs.readdir(dataDir)).some((f) => f.endsWith(".tmp")));
    assert.equal(
      (await (await fetch(base + "/library")).json()).issues.length,
      0,
      "settings backups never appear as broken music",
    );
    const safe = JSON.parse(await fs.readFile(file, "utf8"));
    assert.ok([0.2, 0.3].includes(safe.volume));
    // If preservation fails, the original must not be replaced.
    await fs.rm(path.join(dataDir, "Settings recovery"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "Settings recovery"),
      "not a directory",
    );
    await fs.writeFile(file, damaged);
    assert.equal((await put(preferences)).status, 400);
    assert.deepEqual(await fs.readFile(file), damaged);
  } finally {
    await new Promise((r) => server.close(r));
    await fs.rm(root, { recursive: true, force: true });
  }
});
