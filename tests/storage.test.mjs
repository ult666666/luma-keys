import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  writeFileAtomic,
  removeStaleTemps,
  isAtomicTemp,
} from "../src/atomic-file.mjs";
import { createDiagnosticsLog } from "../src/diagnostics-log.mjs";
import {
  startServer,
  SCORE_VERSIONS,
  REMOVED_SCORES,
  SETTINGS_SNAPSHOTS,
} from "../server.mjs";
import { demos } from "../src/music.mjs";

const temp = () => fs.mkdtemp(path.join(os.tmpdir(), "luma-storage-"));
const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const score = (id, title = "Storage check") => ({
  ...demos()[0],
  id,
  title,
  composer: "Luma Keys regression fixture",
  createdAt: "2026-10-06T12:00:00.000Z",
});
async function serve(options = {}) {
  const dir = await temp();
  const dataDir = path.join(dir, "Luma Keys", "Library");
  const started = await startServer({ port: 0, dataDir, ...options });
  return {
    dir,
    dataDir,
    base: `http://127.0.0.1:${started.port}`,
    ...started,
    async close() {
      await started.shutdown();
      await new Promise((r) => started.server.close(r));
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
const names = async (dir) => (await fs.readdir(dir).catch(() => [])).sort();

test("atomic writes land whole, share no temporary file, and leave nothing behind on failure", async () => {
  const dir = await temp();
  try {
    const dest = path.join(dir, "file.json");
    await writeFileAtomic(dest, '{"a":1}');
    assert.equal(await fs.readFile(dest, "utf8"), '{"a":1}');
    // Twenty writers of the same destination: the result is one of theirs,
    // whole, and no temporary file survives.
    const payloads = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({ writer: i, pad: "x".repeat(2000 + i) }),
    );
    await Promise.all(payloads.map((p) => writeFileAtomic(dest, p)));
    const final = await fs.readFile(dest, "utf8");
    assert.ok(
      payloads.includes(final),
      "the file is exactly one complete write",
    );
    assert.deepEqual(await names(dir), ["file.json"]);
    // A write into a missing folder fails cleanly.
    await assert.rejects(
      writeFileAtomic(path.join(dir, "missing", "x.json"), "x"),
    );
    assert.deepEqual(await names(dir), ["file.json"]);
    // Only this module's temporary names are swept.
    await fs.writeFile(
      path.join(dir, ".file.json.0b4f6a3e-5a0c-4c2a-9d8e-0123456789ab.tmp"),
      "stale",
    );
    await fs.writeFile(path.join(dir, "keep.tmp"), "mine");
    await fs.writeFile(path.join(dir, ".hidden.json"), "mine");
    assert.equal(isAtomicTemp("keep.tmp"), false);
    assert.equal(await removeStaleTemps(dir), 1);
    assert.deepEqual(await names(dir), [
      ".hidden.json",
      "file.json",
      "keep.tmp",
    ]);
    assert.equal(await removeStaleTemps(path.join(dir, "nowhere")), 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the diagnostics log keeps short ordered events, rotates once at its cap and never throws", async () => {
  const dir = await temp();
  try {
    let tick = 0;
    const log = createDiagnosticsLog({
      dir: path.join(dir, "Logs"),
      maxBytes: 1200,
      now: () => new Date(Date.UTC(2026, 9, 6, 12, 0, tick++)),
    });
    log.record("first", {
      count: 1,
      text: "x".repeat(1000),
      nested: { deep: { deeper: { gone: 1 } } },
    });
    log.record("second", { ok: true, bad: Infinity, list: [1, "two", null] });
    log.record(42);
    await log.flush();
    const lines = (await fs.readFile(log.path, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].event, "first");
    assert.equal(lines[0].text.length, 300, "strings are cut short");
    assert.equal(lines[0].count, 1);
    assert.deepEqual(lines[0].nested, { deep: null }, "depth is bounded");
    assert.equal(lines[0].at, "2026-10-06T12:00:00.000Z");
    assert.deepEqual(lines[1], {
      at: "2026-10-06T12:00:01.000Z",
      event: "second",
      ok: true,
      bad: null,
      list: [1, "two", null],
    });
    // Past the cap the file rotates to .1 once; the newest events stay readable.
    for (let i = 0; i < 20; i++) log.record("filler", { i });
    await log.flush();
    const rotated = await fs.readFile(log.path + ".1", "utf8");
    assert.ok(rotated.includes('"event":"first"'));
    const current = (await fs.readFile(log.path, "utf8")).trim().split("\n");
    assert.ok(current.length >= 1 && current.length < 20);
    assert.ok(current.every((l) => JSON.parse(l).event === "filler"));
    assert.equal(log.failures, 0);
    // An unwritable location counts failures instead of breaking the app.
    const blocked = createDiagnosticsLog({
      dir: path.join(dir, "file-not-dir", "Logs"),
    });
    await fs.writeFile(path.join(dir, "file-not-dir"), "");
    blocked.record("x");
    await blocked.flush();
    assert.equal(blocked.failures, 1);
    const off = createDiagnosticsLog({});
    off.record("ignored");
    await off.flush();
    assert.equal(off.path, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("health reports the version, a writable library, startup timings and the log location", async () => {
  const s = await serve({ launchedAt: Date.now() - 1234 });
  try {
    s.markStartup("windowLoaded");
    const health = await (await fetch(s.base + "/api/health")).json();
    assert.equal(health.ok, true);
    assert.match(health.version, /^\d+\.\d+\.\d+$/);
    assert.equal(health.writable, true);
    assert.ok(health.startup.serverReadyMs >= 1234);
    assert.ok(health.startup.windowLoaded >= health.startup.serverReadyMs);
    assert.equal(
      health.log,
      path.join(s.dir, "Luma Keys", "Logs", "luma-keys.log"),
    );
    assert.deepEqual(
      await names(s.dataDir),
      ["accompaniment", "imports"],
      "the write probe leaves nothing behind",
    );
    await s.log.flush();
    const lines = (await fs.readFile(health.log, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(lines[0].event, "server-ready");
    assert.equal(lines[0].writable, true);
    const noClock = await serve();
    try {
      assert.equal(
        (await (await fetch(noClock.base + "/api/health")).json()).startup,
        null,
      );
    } finally {
      await noClock.close();
    }
  } finally {
    await s.close();
  }
});

test("editing a score keeps its earlier versions, the newest few, and identical saves keep nothing", async () => {
  const s = await serve();
  try {
    const id = "edited-score";
    const put = (title) =>
      fetch(s.base + "/api/scores/" + id, json("PUT", score(id, title)));
    assert.equal((await put("Version 1")).status, 200);
    const versions = path.join(s.dataDir, "Score recovery", id);
    assert.deepEqual(
      await names(versions),
      [],
      "a first save has nothing to keep",
    );
    assert.equal((await put("Version 1")).status, 200);
    assert.deepEqual(
      await names(versions),
      [],
      "an identical save keeps nothing",
    );
    await put("Version 2");
    let kept = await names(versions);
    assert.equal(kept.length, 1);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(versions, kept[0]), "utf8")).title,
      "Version 1",
    );
    for (let i = 3; i <= SCORE_VERSIONS + 4; i++) await put(`Version ${i}`);
    kept = await names(versions);
    assert.equal(kept.length, SCORE_VERSIONS, "only the newest versions stay");
    const titles = await Promise.all(
      kept.map(
        async (n) =>
          JSON.parse(await fs.readFile(path.join(versions, n), "utf8")).title,
      ),
    );
    assert.deepEqual(
      titles,
      Array.from({ length: SCORE_VERSIONS }, (_, i) => `Version ${i + 4}`),
    );
    // The library lists only the live score; recovery folders are not scores.
    const library = await (await fetch(s.base + "/api/library")).json();
    assert.equal(library.scores.length, 1);
    assert.equal(library.scores[0].title, `Version ${SCORE_VERSIONS + 4}`);
    assert.deepEqual(library.issues, []);
    // No temporary file survives the saves.
    assert.ok((await names(s.dataDir)).every((n) => !n.endsWith(".tmp")));
  } finally {
    await s.close();
  }
});

test("removing a score moves it to recovery, keeps the newest few, and still imports again", async () => {
  const s = await serve();
  try {
    const removed = path.join(s.dataDir, "Score recovery", "removed");
    for (let i = 1; i <= REMOVED_SCORES + 2; i++) {
      const id = `gone-${String(i).padStart(2, "0")}`;
      assert.equal(
        (
          await fetch(
            s.base + "/api/scores/" + id,
            json("PUT", score(id, `Gone ${i}`)),
          )
        ).status,
        200,
      );
      assert.equal(
        (await fetch(s.base + "/api/scores/" + id, { method: "DELETE" }))
          .status,
        200,
      );
      assert.equal(
        (await fetch(s.base + "/api/scores/" + id, { method: "DELETE" }))
          .status,
        200,
        "removing twice is fine",
      );
    }
    assert.equal(
      (await (await fetch(s.base + "/api/scores")).json()).length,
      0,
    );
    const kept = await names(removed);
    assert.equal(kept.length, REMOVED_SCORES);
    assert.ok(
      kept.every((n) => /^gone-\d\d-\d{4}-\d\d-\d\dT.*\.json$/.test(n)),
    );
    assert.ok(
      !kept.some((n) => n.startsWith("gone-01-")) &&
        !kept.some((n) => n.startsWith("gone-02-")),
      "the two oldest were pruned",
    );
    // A removed score comes back through the ordinary backup import.
    const form = new FormData();
    form.append(
      "score",
      new Blob([await fs.readFile(path.join(removed, kept.at(-1)))]),
      "restored.json",
    );
    const r = await fetch(s.base + "/api/import", {
      method: "POST",
      body: form,
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).score.title, `Gone ${REMOVED_SCORES + 2}`);
  } finally {
    await s.close();
  }
});

test("the settings file is snapshotted once per day before it changes, a fortnight deep", async () => {
  const s = await serve();
  try {
    const put = (volume) =>
      fetch(s.base + "/api/preferences", json("PUT", { volume }));
    const snapshots = path.join(s.dataDir, "Settings snapshots");
    assert.equal(
      (await put(0.5)).status,
      200,
      "a first write has no file to snapshot",
    );
    assert.deepEqual(await names(snapshots), []);
    assert.equal((await put(0.6)).status, 200);
    const today = new Date().toLocaleDateString("en-CA");
    assert.deepEqual(await names(snapshots), [`preferences-${today}.json`]);
    const first = JSON.parse(
      await fs.readFile(
        path.join(snapshots, `preferences-${today}.json`),
        "utf8",
      ),
    );
    assert.equal(
      first.volume,
      0.5,
      "the snapshot is the file as it stood before today's first change",
    );
    await put(0.7);
    assert.equal(
      JSON.parse(
        await fs.readFile(
          path.join(snapshots, `preferences-${today}.json`),
          "utf8",
        ),
      ).volume,
      0.5,
      "later writes today keep the morning snapshot",
    );
    assert.equal(
      (await (await fetch(s.base + "/api/preferences")).json()).volume,
      0.7,
    );
    // Older snapshots are pruned past the fortnight; unrelated files are left.
    for (let i = 1; i <= SETTINGS_SNAPSHOTS + 3; i++)
      await fs.writeFile(
        path.join(
          snapshots,
          `preferences-2025-01-${String(i).padStart(2, "0")}.json`,
        ),
        "{}",
      );
    await fs.writeFile(path.join(snapshots, "notes.txt"), "mine");
    await fs.rm(path.join(snapshots, `preferences-${today}.json`));
    await put(0.8);
    const kept = await names(snapshots);
    assert.equal(
      kept.filter((n) => n.startsWith("preferences-")).length,
      SETTINGS_SNAPSHOTS,
    );
    assert.ok(kept.includes(`preferences-${today}.json`));
    assert.ok(!kept.includes("preferences-2025-01-01.json"));
    assert.ok(kept.includes("notes.txt"));
    // A damaged file goes to the recovery copy, not the daily snapshot.
    await fs.writeFile(path.join(s.dataDir, "preferences.json"), "{ broken");
    const r = await (
      await fetch(s.base + "/api/preferences", json("PUT", { volume: 0.9 }))
    ).json();
    assert.ok(r.recoveryFile?.endsWith(".json.bak"));
    assert.equal(await fs.readFile(r.recoveryFile, "utf8"), "{ broken");
    assert.equal(
      (await (await fetch(s.base + "/api/preferences")).json()).volume,
      0.9,
    );
  } finally {
    await s.close();
  }
});

test("the library listing reuses parsed scores until a file changes, and reports damage per file", async () => {
  const s = await serve();
  try {
    const a = score("cached-a", "A");
    const b = score("cached-b", "B");
    for (const x of [a, b])
      await fetch(s.base + "/api/scores/" + x.id, json("PUT", x));
    const list = async () => (await fetch(s.base + "/api/library")).json();
    const first = await list();
    assert.deepEqual(first.scores.map((x) => x.title).sort(), ["A", "B"]);
    // A change through the API is seen at once.
    await fetch(
      s.base + "/api/scores/cached-a",
      json("PUT", { ...a, title: "A2" }),
    );
    assert.deepEqual((await list()).scores.map((x) => x.title).sort(), [
      "A2",
      "B",
    ]);
    // A change made to the file by hand is seen too (different size).
    const file = path.join(s.dataDir, "cached-b.json");
    await fs.writeFile(
      file,
      JSON.stringify({ ...b, title: "B edited by hand" }),
    );
    assert.deepEqual((await list()).scores.map((x) => x.title).sort(), [
      "A2",
      "B edited by hand",
    ]);
    // Damage is reported for that file only, and heals when the file does.
    await fs.writeFile(file, "{ not json");
    let damaged = await list();
    assert.deepEqual(
      damaged.scores.map((x) => x.title),
      ["A2"],
    );
    assert.equal(damaged.issues.length, 1);
    assert.equal(damaged.issues[0].file, "cached-b.json");
    await fs.writeFile(file, JSON.stringify(b));
    damaged = await list();
    assert.deepEqual(damaged.scores.map((x) => x.title).sort(), ["A2", "B"]);
    assert.deepEqual(damaged.issues, []);
    // A removed file leaves the listing.
    await fs.rm(file);
    assert.deepEqual(
      (await list()).scores.map((x) => x.title),
      ["A2"],
    );
  } finally {
    await s.close();
  }
});

test("twenty overlapping saves of one score end in one whole file and a clean folder", async () => {
  const s = await serve();
  try {
    const id = "busy-score";
    const bodies = Array.from({ length: 20 }, (_, i) =>
      score(id, `Draft ${i}`),
    );
    const results = await Promise.all(
      bodies.map((body) =>
        fetch(s.base + "/api/scores/" + id, json("PUT", body)),
      ),
    );
    assert.ok(results.every((r) => r.status === 200));
    const saved = JSON.parse(
      await fs.readFile(path.join(s.dataDir, id + ".json"), "utf8"),
    );
    assert.match(saved.title, /^Draft \d+$/);
    assert.equal(saved.notes.length, bodies[0].notes.length);
    assert.ok((await names(s.dataDir)).every((n) => !n.includes(".tmp")));
    const library = await (await fetch(s.base + "/api/library")).json();
    assert.equal(library.scores.length, 1);
    assert.deepEqual(library.issues, []);
  } finally {
    await s.close();
  }
});

test("the renderer can report an event to the diagnostics log, within strict limits", async () => {
  const s = await serve();
  try {
    const post = (body, headers = {}) =>
      fetch(s.base + "/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
    assert.equal(
      (
        await post({
          event: "renderer-error",
          message: "x".repeat(1500),
          where: "hand3d.mjs:12",
        })
      ).status,
      202,
    );
    assert.equal((await post({ event: "app-ready", ms: 1234 })).status, 202);
    assert.equal(
      (await post({ event: "not-allowed", ms: 1 })).status,
      400,
      "only known events are accepted",
    );
    assert.equal(
      (await post({ event: "app-ready", data: { nested: { too: "deep" } } }))
        .status,
      400,
      "flat data only",
    );
    assert.equal((await post("[]")).status, 400);
    assert.equal(
      (await post({ event: "app-ready", pad: "y".repeat(5000) })).status,
      413,
      "small reports only",
    );
    await s.log.flush();
    const lines = (await fs.readFile(s.log.path, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const reported = lines.filter(
      (l) => l.event === "renderer-error" || l.event === "app-ready",
    );
    assert.equal(reported.length, 2);
    assert.equal(reported[0].message.length, 300);
    assert.equal(reported[0].where, "hand3d.mjs:12");
    assert.equal(reported[1].ms, 1234);
    // A storm of reports is cut off, so a crash loop cannot fill the log.
    const burst = await Promise.all(
      Array.from({ length: 60 }, () =>
        post({ event: "renderer-error", message: "again" }),
      ),
    );
    assert.ok(
      burst.some((r) => r.status === 429),
      "later reports in a burst are refused",
    );
    await s.log.flush();
    const total = (await fs.readFile(s.log.path, "utf8"))
      .trim()
      .split("\n")
      .filter((l) => l.includes('"again"')).length;
    assert.ok(
      total <= 30,
      `at most a bounded number of burst events are kept (${total})`,
    );
  } finally {
    await s.close();
  }
});

test("fields a newer version stored are carried forward on every settings write; known fields still delete", async () => {
  const { mergeUnknownPreferences } = await import("../src/preferences.mjs");
  const previous = {
    theme: "mint",
    futureTop: { keep: true },
    stats: { correct: 1, futureCounter: 7 },
    reading: { labels: "numbers", futureSetting: "on" },
    journal: {
      futureIndex: [1, 2],
      days: { "2026-10-07": { minutes: 3, pieces: {}, futureDayMark: "x" } },
      pieces: {
        kept: {
          minutes: 1,
          sessions: 1,
          last: "2026-10-07T10:00:00.000Z",
          bar: 2,
          ranges: [[1, 2]],
          passages: [[1, 2]],
          futureMark: 5,
        },
        gone: {
          minutes: 1,
          sessions: 1,
          last: "2026-10-07T10:00:00.000Z",
          bar: 1,
          ranges: [],
          futureMark: 9,
        },
      },
    },
  };
  const next = {
    theme: "rose",
    stats: { correct: 2 },
    reading: { labels: "letters" },
    journal: {
      days: { "2026-10-07": { minutes: 4, pieces: {} } },
      pieces: {
        kept: {
          minutes: 2,
          sessions: 2,
          last: "2026-10-07T11:00:00.000Z",
          bar: 3,
          ranges: [[1, 3]],
        },
      },
    },
  };
  const before = structuredClone(previous);
  const merged = mergeUnknownPreferences(previous, next);
  assert.deepEqual(previous, before, "inputs untouched");
  assert.equal(merged.theme, "rose");
  assert.deepEqual(merged.futureTop, { keep: true });
  assert.deepEqual(merged.stats, { futureCounter: 7, correct: 2 });
  assert.deepEqual(merged.reading, { futureSetting: "on", labels: "letters" });
  assert.deepEqual(merged.journal.futureIndex, [1, 2]);
  assert.equal(merged.journal.days["2026-10-07"].futureDayMark, "x");
  assert.equal(merged.journal.pieces.kept.futureMark, 5);
  assert.equal(
    "passages" in merged.journal.pieces.kept,
    false,
    "a known field removed stays removed",
  );
  assert.equal(
    "gone" in merged.journal.pieces,
    false,
    "a removed piece is not revived",
  );
  assert.equal(mergeUnknownPreferences(null, next), next);
  // Through the API: a newer version's fields survive an ordinary save.
  const s = await serve();
  try {
    const file = path.join(s.dataDir, "preferences.json");
    await fs.writeFile(
      file,
      JSON.stringify({
        theme: "mint",
        volume: 0.5,
        futureTop: "kept",
        reading: { labels: "numbers", futureSetting: 3 },
      }),
    );
    const r = await fetch(
      s.base + "/api/preferences",
      json("PUT", { volume: 0.25, reading: { labels: "letters" } }),
    );
    assert.equal(r.status, 200);
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(saved.volume, 0.25);
    assert.equal(saved.futureTop, "kept");
    assert.equal(saved.reading.futureSetting, 3);
    assert.equal(saved.reading.labels, "letters");
    // The API still serves only what this version reads.
    const served = await (await fetch(s.base + "/api/preferences")).json();
    assert.equal("futureTop" in served, false);
    // A damaged file is not merged from: it goes whole to Settings recovery.
    await fs.writeFile(file, "{ broken");
    const repaired = await (
      await fetch(s.base + "/api/preferences", json("PUT", { volume: 0.3 }))
    ).json();
    assert.ok(repaired.recoveryFile);
    assert.equal(JSON.parse(await fs.readFile(file, "utf8")).volume, 0.3);
  } finally {
    await s.close();
  }
});
