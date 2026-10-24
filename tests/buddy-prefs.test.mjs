import test from "node:test";
import assert from "node:assert/strict";
import {
  readPreferences,
  validatePreferences,
  defaultReading,
} from "../src/preferences.mjs";
import { defaultBuddyState, readBuddyState, isDayKey } from "../src/buddy-brain.mjs";

const reading = (buddyState, extra = {}) =>
  readPreferences({ reading: { room: "hall", goal: 30, ...extra, buddyState } });

test("buddyState defaults to a quiet-off, right-side companion with an empty jar", () => {
  assert.deepEqual(defaultReading().buddyState, {
    quiet: false,
    hintSeen: false,
    side: "right",
    lastSeen: "",
    bond: {},
    treats: { jar: 0, day: "", earnedToday: 0, milestones: [], goalDay: "" },
  });
  // Older settings files have no buddyState at all: no issue is raised.
  const old = readPreferences({ reading: { room: "hall" } });
  assert.deepEqual(old.issues, []);
  assert.deepEqual(old.preferences.reading.buddyState, defaultBuddyState());
  // Every call gets its own copy.
  const a = defaultReading().buddyState;
  a.bond.cat = { xp: 1 };
  assert.deepEqual(defaultReading().buddyState.bond, {});
});

test("a valid buddyState round-trips through save validation", () => {
  const state = {
    quiet: true,
    hintSeen: true,
    side: "left",
    lastSeen: "2026-09-30",
    bond: { liszt: { xp: 140, pets: 2, petDay: "2026-09-30" }, cat: { xp: 0, pets: 0, petDay: "" } },
    treats: { jar: 4, day: "2026-09-29", earnedToday: 1, milestones: [3, 7], goalDay: "2026-09-29" },
  };
  const saved = validatePreferences({ reading: { buddyState: state } });
  assert.deepEqual(saved.reading.buddyState, state);
});

test("each damaged buddyState field falls back alone and leaves other reading fields untouched", () => {
  const cases = [
    [{ side: "top", quiet: true }, (s) => s.side === "right" && s.quiet === true],
    [
      { bond: { liszt: { xp: -1, pets: 3 }, mozart: { xp: 20 } } },
      (s) => s.bond.liszt.xp === 0 && s.bond.liszt.pets === 3 && s.bond.mozart.xp === 20,
    ],
    [{ bond: { dragon: { xp: 5 }, cat: { xp: 9 } } }, (s) => !("dragon" in s.bond) && s.bond.cat.xp === 9],
    [
      { treats: { jar: 99, earnedToday: 2, milestones: [3] } },
      (s) => s.treats.jar === 0 && s.treats.earnedToday === 2 && s.treats.milestones.join() === "3",
    ],
    [{ lastSeen: "2026-02-30", hintSeen: true }, (s) => s.lastSeen === "" && s.hintSeen === true],
    [{ treats: { milestones: [3, 5] }, side: "left" }, (s) => s.treats.milestones.length === 0 && s.side === "left"],
    [{ quiet: "yes" }, (s) => s.quiet === false],
    [{ bond: [] }, (s) => Object.keys(s.bond).length === 0],
    [{ treats: { jar: 3, goalDay: "yesterday" } }, (s) => s.treats.jar === 3 && s.treats.goalDay === ""],
  ];
  for (const [input, check] of cases) {
    const result = reading(input);
    const r = result.preferences.reading;
    assert.deepEqual(result.issues, ["Reading preferences"], JSON.stringify(input));
    assert.ok(check(r.buddyState), JSON.stringify(input) + " → " + JSON.stringify(r.buddyState));
    assert.equal(r.room, "hall");
    assert.equal(r.goal, 30);
    assert.equal(r.buddy, true);
    assert.throws(() => validatePreferences({ reading: { buddyState: input } }), /Reading preferences/);
  }
  // Not an object at all: the defaults, flagged.
  for (const bad of [null, 3, "quiet", []]) {
    const { state, invalid } = readBuddyState(bad);
    assert.equal(invalid, true);
    assert.deepEqual(state, defaultBuddyState());
  }
});

test("milestones are de-duplicated and day keys must be real dates", () => {
  const { state, invalid } = readBuddyState({ treats: { milestones: [7, 3, 7] } });
  assert.equal(invalid, false);
  assert.deepEqual(state.treats.milestones, [3, 7]);
  assert.ok(isDayKey(""));
  assert.ok(isDayKey("2024-02-29"));
  assert.ok(!isDayKey("2023-02-29"));
  assert.ok(!isDayKey("2026-9-30"));
  assert.ok(!isDayKey(20260930));
});

test("buddyState survives a save and reload through the local server", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { startServer } = await import("../server.mjs");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "luma-buddy-"));
  const { server, port, shutdown } = await startServer({ port: 0, dataDir: path.join(dir, "Library") });
  const base = `http://127.0.0.1:${port}`;
  try {
    const prefs = await (await fetch(base + "/api/preferences")).json();
    assert.deepEqual(prefs.reading.buddyState, defaultBuddyState());
    const buddyState = {
      quiet: true,
      hintSeen: true,
      side: "left",
      lastSeen: "2026-10-01",
      bond: { cat: { xp: 64, pets: 1, petDay: "2026-10-01" } },
      treats: { jar: 2, day: "2026-10-01", earnedToday: 1, milestones: [3], goalDay: "2026-10-01" },
    };
    const put = await fetch(base + "/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...prefs, reading: { ...prefs.reading, buddyState } }),
    });
    assert.equal(put.status, 200, await put.clone().text());
    const back = await (await fetch(base + "/api/preferences")).json();
    assert.deepEqual(back.reading.buddyState, buddyState);
    assert.equal(back.reading.room, prefs.reading.room, "the other reading fields are kept");
  } finally {
    server.close();
    await shutdown?.();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
