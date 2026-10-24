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
import { COMPANIONS } from "../src/companions.mjs";
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
    journal: { days: {}, pieces: {} },
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
  assert.deepEqual(readPreferences({ theme: "ocean" }).issues, []);
  assert.deepEqual(
    readPreferences({ reading: { room: "hall" } }).preferences.reading.room,
    "hall",
  );
  assert.deepEqual(readPreferences({ reading: { room: "cave" } }).issues, [
    "Reading preferences",
  ]);
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
    { reading: { goal: 2 } },
    { journal: [] },
    { journal: { days: { "2026-02-30": { minutes: 1 } } } },
    { journal: { pieces: { p: { minutes: 1, sessions: 1, bar: 0 } } } },
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
      goal: 45,
      exercise: { ...defaultReading().exercise, level: 6, fifths: -1 },
    },
    journal: {
      days: { "2026-09-25": { minutes: 12.5, pieces: { "abc-1": 12.5 } } },
      pieces: {
        "abc-1": {
          minutes: 12.5,
          sessions: 3,
          last: "2026-09-25T14:00:00.000Z",
          bar: 214,
          ranges: [
            [1, 120],
            [200, 214],
          ],
          title: "Appassionata",
        },
      },
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
test("companion choices validate independently without applying their style during hydration", () => {
  const before = validatePreferences({
    theme: "ocean",
    pet: "bunny",
    volume: 0.4,
    stats: { correct: 72, minutes: 15, sessions: 3 },
    reading: {
      labels: "solfege",
      tonic: 5,
      speed: 0.5,
      mode: "wait",
      hand: "left",
      room: "dry",
      last: { scoreId: "saved-score" },
    },
    journal: {
      pieces: {
        "saved-score": {
          minutes: 15,
          sessions: 3,
          bar: 8,
          last: "2026-09-26T14:00:00.000Z",
          ranges: [[1, 8]],
          passages: [[3, 5]],
          title: "Saved music",
        },
      },
    },
    history: [
      {
        at: "2026-09-26T14:00:00.000Z",
        title: "Saved music",
        scoreId: "saved-score",
        accuracy: 90,
        timing: 80,
        notes: 20,
        tempo: 60,
        mode: "perform",
        complete: true,
        bars: 8,
      },
    ],
  });
  for (const { id } of COMPANIONS) {
    for (const companionStyle of [false, true]) {
      const candidate = structuredClone(before);
      candidate.reading.companion = id;
      candidate.reading.companionStyle = companionStyle;
      const result = readPreferences(candidate);
      assert.deepEqual(result.issues, []);
      assert.deepEqual(
        result.preferences,
        candidate,
        `${id}/${companionStyle} preserves existing settings and practice`,
      );
      assert.deepEqual(validatePreferences(candidate), candidate);
    }
  }
  const damaged = structuredClone(before);
  damaged.reading.companion = "unknown";
  damaged.reading.companionStyle = "yes";
  const recovered = readPreferences(damaged);
  assert.deepEqual(recovered.issues, ["Reading preferences"]);
  assert.deepEqual(
    recovered.preferences,
    before,
    "invalid companion fields leave music positions, progress and all other settings intact",
  );
  const legacy = structuredClone(before);
  delete legacy.reading.companion;
  delete legacy.reading.companionStyle;
  const snapshot = structuredClone(legacy);
  assert.deepEqual(readPreferences(legacy), {
    preferences: before,
    issues: [],
  });
  assert.deepEqual(
    legacy,
    snapshot,
    "reading old preferences adds defaults only to the result",
  );
  assert.equal(defaultReading().companion, "beethoven");
  assert.equal(defaultReading().companionStyle, true);
});

test("invalid companion fields recover alone while the other field and music settings survive", () => {
  for (const companion of ["dog", "Beethoven", "__proto__", null, {}, 1]) {
    const result = readPreferences({
      reading: { companion, companionStyle: false, speed: 0.5, room: "hall" },
    });
    assert.deepEqual(result.issues, ["Reading preferences"]);
    assert.equal(result.preferences.reading.companion, "beethoven");
    assert.equal(result.preferences.reading.companionStyle, false);
    assert.equal(result.preferences.reading.speed, 0.5);
    assert.equal(result.preferences.reading.room, "hall");
    assert.throws(
      () => validatePreferences({ reading: { companion } }),
      /Reading preferences/,
    );
  }
  for (const companionStyle of ["false", 0, 1, null, {}]) {
    const result = readPreferences({
      reading: { companion: "langlang", companionStyle, hand: "right" },
    });
    assert.deepEqual(result.issues, ["Reading preferences"]);
    assert.equal(result.preferences.reading.companion, "langlang");
    assert.equal(result.preferences.reading.companionStyle, true);
    assert.equal(result.preferences.reading.hand, "right");
    assert.throws(
      () => validatePreferences({ reading: { companionStyle } }),
      /Reading preferences/,
    );
  }
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
    const oldSettings = Buffer.from(
      JSON.stringify(
        { theme: "rose", pet: "bunny", reading: { speed: 0.5, room: "dry" } },
        null,
        2,
      ),
    );
    await fs.writeFile(file, oldSettings);
    const migrated = await (await fetch(base + "/preferences")).json();
    assert.equal(migrated.reading.companion, "beethoven");
    assert.equal(migrated.reading.companionStyle, true);
    assert.equal(migrated.theme, "rose");
    assert.equal(migrated.reading.room, "dry");
    assert.deepEqual(
      await fs.readFile(file),
      oldSettings,
      "hydrating new companion defaults does not rewrite old preferences",
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
    // (A folder that cannot be made is the app's side, not the reader's:
    // since 2.44 it answers 500 in plain words rather than 400.)
    const refused = await put(preferences);
    assert.equal(refused.status, 500);
    assert.ok(!/EEXIST|ENOTDIR|\//.test((await refused.json()).error));
    assert.deepEqual(await fs.readFile(file), damaged);
  } finally {
    await new Promise((r) => server.close(r));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("piano interpretation defaults to concert and validates independently", () => {
  assert.equal(
    readPreferences({}).preferences.reading.interpretation,
    "concert",
  );
  assert.equal(
    readPreferences({ reading: { interpretation: "written", room: "hall" } })
      .preferences.reading.interpretation,
    "written",
  );
  const result = readPreferences({
    reading: { interpretation: "invent", room: "dry" },
  });
  assert.equal(result.preferences.reading.interpretation, "concert");
  assert.equal(result.preferences.reading.room, "dry");
  assert.ok(result.issues.length);
});
test("trouble spots round-trip through the settings file and damaged ones are reported", () => {
  const spots = {
    4: { p: 5, s: 3, r: "x.xx.", last: "2026-10-05" },
    12: { p: 2, s: 2, r: "xx", last: "2026-10-04" },
  };
  const valid = {
    theme: "mint",
    pet: "cat",
    volume: 0.5,
    stats: { correct: 1, minutes: 1, sessions: 1, dailyMinutes: 0, practiceDate: "" },
    reading: defaultReading(),
    history: [],
    journal: {
      days: {},
      pieces: {
        "abc-1": {
          minutes: 12.5,
          sessions: 3,
          last: "2026-10-05T14:00:00.000Z",
          bar: 14,
          ranges: [[1, 14]],
          title: "Appassionata",
          spots,
        },
      },
    },
  };
  assert.deepEqual(validatePreferences(valid), valid);
  const damaged = readPreferences({
    ...valid,
    journal: {
      ...valid.journal,
      pieces: {
        "abc-1": { ...valid.journal.pieces["abc-1"], spots: { 4: spots[4], 5: { p: 1 } } },
      },
    },
  });
  assert.deepEqual(damaged.issues, ["Practice journal"]);
  assert.deepEqual(damaged.preferences.journal.pieces["abc-1"].spots, { 4: spots[4] });
  assert.equal(damaged.preferences.journal.pieces["abc-1"].minutes, 12.5);
  assert.throws(
    () =>
      validatePreferences({
        ...valid,
        journal: {
          ...valid.journal,
          pieces: { "abc-1": { ...valid.journal.pieces["abc-1"], spots: [] } },
        },
      }),
    /Practice journal/,
  );
});
