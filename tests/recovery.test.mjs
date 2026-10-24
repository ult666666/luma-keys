// Recovery in the app (2.44): removed scores and earlier versions come back
// under their own id; settings snapshots can be restored, keeping the file
// they replace. Damaged or unknown copies are listed honestly and refused.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import { demos } from "../src/music.mjs";
import {
  parseRemovedName,
  parseVersionName,
  stampToISO,
} from "../src/recovery.mjs";

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const score = (id, title = "Recovery check") => ({
  ...demos()[0],
  id,
  title,
  composer: "Luma Keys regression fixture",
  createdAt: "2026-10-08T12:00:00.000Z",
});
async function serve() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "luma-recovery-"));
  const dataDir = path.join(dir, "Luma Keys", "Library");
  const started = await startServer({ port: 0, dataDir });
  const base = `http://127.0.0.1:${started.port}`;
  const call = async (url, init) => {
    const r = await fetch(base + url, init);
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return {
    dir,
    dataDir,
    call,
    async close() {
      await started.shutdown();
      await new Promise((r) => started.server.close(r));
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("file-name stamps parse back to times, and only exact names are accepted", () => {
  assert.equal(
    stampToISO("2026-10-08T01-02-03-004Z"),
    "2026-10-08T01:02:03.004Z",
  );
  assert.deepEqual(
    parseRemovedName("1f0c-ab12-77-2026-10-08T01-02-03-004Z.json"),
    { id: "1f0c-ab12-77", at: "2026-10-08T01:02:03.004Z" },
  );
  assert.deepEqual(parseVersionName("2026-10-08T01-02-03-004Z.json"), {
    at: "2026-10-08T01:02:03.004Z",
  });
  for (const bad of [
    "../x-2026-10-08T01-02-03-004Z.json",
    "x-2026-10-08T01-02-03-004Z.json.bak",
    "x-2026-10-08.json",
    "",
  ])
    assert.equal(parseRemovedName(bad), null, bad);
  assert.equal(parseVersionName("../2026-10-08T01-02-03-004Z.json"), null);
});

test("a removed score is listed and restored under its own id; a second restore and a taken id are refused", async () => {
  const s = await serve();
  try {
    const original = score("recover-a", "Moonlit check");
    assert.equal(
      (await s.call("/api/scores/recover-a", json("PUT", original))).status,
      200,
    );
    assert.equal(
      (await s.call("/api/scores/recover-a", { method: "DELETE" })).status,
      200,
    );
    let { body } = await s.call("/api/recovery");
    assert.equal(body.removed.length, 1);
    const [entry] = body.removed;
    assert.equal(entry.id, "recover-a");
    assert.equal(entry.title, "Moonlit check");
    assert.equal(entry.notes, original.notes.length);
    assert.equal(entry.inLibrary, false);
    assert.ok(Date.parse(entry.removedAt) > 0);
    assert.equal(typeof entry.notes, "number", "a count, never the notes");
    const restored = await s.call(
      `/api/recovery/removed/${entry.file}/restore`,
      { method: "POST" },
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.body.score.id, "recover-a");
    const scores = (await s.call("/api/scores")).body;
    assert.deepEqual(
      scores.map((x) => x.id),
      ["recover-a"],
    );
    assert.equal((await s.call("/api/recovery")).body.removed.length, 0);
    // Gone from the removed folder: a second restore finds nothing.
    assert.equal(
      (
        await s.call(`/api/recovery/removed/${entry.file}/restore`, {
          method: "POST",
        })
      ).status,
      404,
    );
    // Remove, put back by hand (Undo), then try to restore the kept copy.
    await s.call("/api/scores/recover-a", { method: "DELETE" });
    await s.call("/api/scores/recover-a", json("PUT", original));
    ({ body } = await s.call("/api/recovery"));
    assert.equal(body.removed[0].inLibrary, true);
    const taken = await s.call(
      `/api/recovery/removed/${body.removed[0].file}/restore`,
      { method: "POST" },
    );
    assert.equal(taken.status, 409);
    assert.match(taken.body.error, /already in your library/);
    // The kept copy is untouched by the refusal.
    assert.equal((await s.call("/api/recovery")).body.removed.length, 1);
  } finally {
    await s.close();
  }
});

test("damaged and unknown removed copies are listed as damaged and refused; names cannot escape the folder", async () => {
  const s = await serve();
  try {
    const removedDir = path.join(s.dataDir, "Score recovery", "removed");
    await fs.mkdir(removedDir, { recursive: true });
    const damaged = "broken-2026-10-08T01-02-03-004Z.json";
    await fs.writeFile(path.join(removedDir, damaged), '{"notes":');
    const mismatch = "other-2026-10-08T01-02-03-005Z.json";
    await fs.writeFile(
      path.join(removedDir, mismatch),
      JSON.stringify(score("not-other")),
    );
    await fs.writeFile(path.join(removedDir, "notes.txt"), "ignored");
    const { body } = await s.call("/api/recovery");
    assert.deepEqual(body.removed.map((e) => [e.file, !!e.damaged]).sort(), [
      [damaged, true],
      [mismatch, true],
    ]);
    for (const file of [damaged, mismatch])
      assert.equal(
        (
          await s.call(`/api/recovery/removed/${file}/restore`, {
            method: "POST",
          })
        ).status,
        422,
      );
    for (const file of ["notes.txt", "..%2Fpreferences.json", "x.json"])
      assert.equal(
        (
          await s.call(`/api/recovery/removed/${file}/restore`, {
            method: "POST",
          })
        ).status,
        400,
        file,
      );
    assert.deepEqual((await s.call("/api/scores")).body, []);
    assert.equal(
      await fs.readFile(path.join(removedDir, damaged), "utf8"),
      '{"notes":',
    );
  } finally {
    await s.close();
  }
});

test("earlier versions are listed newest first; restoring one keeps the replaced version, so it can be undone", async () => {
  const s = await serve();
  try {
    await s.call(
      "/api/scores/recover-v",
      json("PUT", score("recover-v", "First")),
    );
    await tick();
    await s.call(
      "/api/scores/recover-v",
      json("PUT", score("recover-v", "Second")),
    );
    await tick();
    await s.call(
      "/api/scores/recover-v",
      json("PUT", score("recover-v", "Third")),
    );
    let versions = (await s.call("/api/scores/recover-v/versions")).body
      .versions;
    assert.deepEqual(
      versions.map((v) => v.title),
      ["Second", "First"],
    );
    assert.ok(
      Date.parse(versions[0].replacedAt) >= Date.parse(versions[1].replacedAt),
    );
    assert.equal((await s.call("/api/recovery")).body.versions["recover-v"], 2);
    const first = versions.find((v) => v.title === "First");
    const restored = await s.call(
      `/api/scores/recover-v/versions/${first.file}/restore`,
      { method: "POST" },
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.body.score.title, "First");
    assert.equal(
      (await s.call("/api/scores")).body.find((x) => x.id === "recover-v")
        .title,
      "First",
    );
    versions = (await s.call("/api/scores/recover-v/versions")).body.versions;
    assert.equal(
      versions[0].title,
      "Third",
      "the replaced version is kept first",
    );
    // Unknown, foreign and malformed requests change nothing.
    for (const url of [
      "/api/scores/recover-v/versions/2026-01-01T00-00-00-000Z.json/restore",
      "/api/scores/recover-v/versions/nope.json/restore",
      "/api/scores/removed/versions/2026-01-01T00-00-00-000Z.json/restore",
      "/api/scores/bad%20id/versions/2026-01-01T00-00-00-000Z.json/restore",
    ])
      assert.ok(
        [400, 404].includes((await s.call(url, { method: "POST" })).status),
        url,
      );
    assert.equal(
      (await s.call("/api/scores")).body.find((x) => x.id === "recover-v")
        .title,
      "First",
    );
    // A version whose id does not match its folder is damaged, not restored.
    const dir = path.join(s.dataDir, "Score recovery", "recover-v");
    const foreign = "2026-01-01T00-00-00-001Z.json";
    await fs.writeFile(
      path.join(dir, foreign),
      JSON.stringify(score("someone-else")),
    );
    versions = (await s.call("/api/scores/recover-v/versions")).body.versions;
    assert.equal(versions.find((v) => v.file === foreign).damaged, true);
    assert.equal(
      (
        await s.call(`/api/scores/recover-v/versions/${foreign}/restore`, {
          method: "POST",
        })
      ).status,
      422,
    );
  } finally {
    await s.close();
  }
});

test("settings snapshots are listed with a summary and restored; the replaced file is kept and itself restorable", async () => {
  const s = await serve();
  try {
    const prefsPath = path.join(s.dataDir, "preferences.json");
    const original = {
      volume: 0.3,
      stats: { correct: 9, minutes: 42.4, sessions: 7 },
      journal: {
        days: { "2026-10-01": { minutes: 10, pieces: { a: 10 } } },
        pieces: {
          a: {
            minutes: 10,
            sessions: 1,
            last: "2026-10-01",
            bar: 3,
            ranges: [[1, 3]],
            title: "A",
          },
        },
      },
      futureField: { kept: true },
    };
    await fs.writeFile(prefsPath, JSON.stringify(original));
    // The first write of the day keeps the file as it stood.
    const now = (await s.call("/api/preferences")).body;
    assert.equal(
      (
        await s.call(
          "/api/preferences",
          json("PUT", {
            ...now,
            volume: 0.9,
            stats: { ...now.stats, sessions: 8 },
          }),
        )
      ).status,
      200,
    );
    const { snapshots } = (await s.call("/api/settings/snapshots")).body;
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].kind, "day");
    assert.equal(snapshots[0].sessions, 7);
    assert.equal(snapshots[0].minutes, 42);
    assert.equal(snapshots[0].pieces, 1);
    assert.equal(snapshots[0].days, 1);
    const restored = await s.call(
      `/api/settings/snapshots/${snapshots[0].file}/restore`,
      { method: "POST" },
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.body.preferences.volume, 0.3);
    const onDisk = JSON.parse(await fs.readFile(prefsPath, "utf8"));
    assert.equal(onDisk.volume, 0.3);
    assert.deepEqual(
      onDisk.futureField,
      { kept: true },
      "the snapshot is put back whole",
    );
    // The replaced file (volume 0.9) is kept and listed after the days.
    const after = (await s.call("/api/settings/snapshots")).body.snapshots;
    assert.deepEqual(
      after.map((x) => x.kind),
      ["day", "before-restore"],
    );
    assert.equal(after[1].sessions, 8);
    assert.ok(Date.parse(after[1].at) > 0);
    // Undo: restore the copy kept before the restore.
    assert.equal(
      (
        await s.call(`/api/settings/snapshots/${after[1].file}/restore`, {
          method: "POST",
        })
      ).status,
      200,
    );
    assert.equal(JSON.parse(await fs.readFile(prefsPath, "utf8")).volume, 0.9);
  } finally {
    await s.close();
  }
});

test("damaged or unknown settings snapshots are refused without touching the settings file, and before-restore copies are bounded", async () => {
  const s = await serve();
  try {
    const prefsPath = path.join(s.dataDir, "preferences.json");
    const snapDir = path.join(s.dataDir, "Settings snapshots");
    await fs.mkdir(snapDir, { recursive: true });
    await fs.writeFile(prefsPath, JSON.stringify({ volume: 0.4 }));
    await fs.writeFile(
      path.join(snapDir, "preferences-2026-10-01.json"),
      '{"volume":',
    );
    await fs.writeFile(
      path.join(snapDir, "preferences-2026-10-02.json"),
      JSON.stringify({ volume: { bad: true } }),
    );
    const listed = (await s.call("/api/settings/snapshots")).body.snapshots;
    assert.equal(listed.find((x) => x.day === "2026-10-01").damaged, true);
    assert.equal(listed.find((x) => x.day === "2026-10-02").issues, 1);
    for (const file of [
      "preferences-2026-10-01.json",
      "preferences-2026-10-02.json",
    ])
      assert.equal(
        (
          await s.call(`/api/settings/snapshots/${file}/restore`, {
            method: "POST",
          })
        ).status,
        422,
      );
    assert.equal(
      (
        await s.call(
          "/api/settings/snapshots/preferences-2026-09-01.json/restore",
          { method: "POST" },
        )
      ).status,
      404,
    );
    for (const file of [
      "preferences.json",
      "..%2Fpreferences.json",
      "before-restore-x.json",
    ])
      assert.equal(
        (
          await s.call(`/api/settings/snapshots/${file}/restore`, {
            method: "POST",
          })
        ).status,
        400,
        file,
      );
    assert.equal(
      await fs.readFile(prefsPath, "utf8"),
      JSON.stringify({ volume: 0.4 }),
    );
    // Many restores keep only the newest five before-restore copies.
    await fs.writeFile(
      path.join(snapDir, "preferences-2026-10-03.json"),
      JSON.stringify({ volume: 0.5 }),
    );
    for (let i = 0; i < 7; i++) {
      assert.equal(
        (
          await s.call(
            "/api/settings/snapshots/preferences-2026-10-03.json/restore",
            { method: "POST" },
          )
        ).status,
        200,
      );
      await tick();
    }
    const kept = (await fs.readdir(snapDir)).filter((n) =>
      n.startsWith("before-restore-"),
    );
    assert.equal(kept.length, 5);
  } finally {
    await s.close();
  }
});

test("the recovery lists notice a copy changed or removed on disk between listings", async () => {
  const s = await serve();
  try {
    await s.call(
      "/api/scores/recover-c",
      json("PUT", score("recover-c", "Cache check")),
    );
    await s.call("/api/scores/recover-c", { method: "DELETE" });
    let { body } = await s.call("/api/recovery");
    assert.equal(body.removed[0].title, "Cache check");
    const file = path.join(
      s.dataDir,
      "Score recovery",
      "removed",
      body.removed[0].file,
    );
    await fs.writeFile(file, '{"notes":');
    ({ body } = await s.call("/api/recovery"));
    assert.equal(body.removed[0].damaged, true, "the damaged copy is seen");
    await fs.rm(file);
    ({ body } = await s.call("/api/recovery"));
    assert.equal(body.removed.length, 0);
  } finally {
    await s.close();
  }
});

test("saves of one piece arriving together run in order: the last wins and each earlier one is kept once", async () => {
  const s = await serve();
  try {
    await s.call(
      "/api/scores/recover-q",
      json("PUT", score("recover-q", "v0")),
    );
    const sent = Array.from({ length: 12 }, (_, i) =>
      s.call(
        "/api/scores/recover-q",
        json("PUT", score("recover-q", `v${i + 1}`)),
      ),
    );
    assert.ok((await Promise.all(sent)).every((r) => r.status === 200));
    const current = (await s.call("/api/scores")).body.find(
      (x) => x.id === "recover-q",
    );
    const versions = (
      await s.call("/api/scores/recover-q/versions")
    ).body.versions.map((v) => v.title);
    // Requests on one connection pool may arrive in any order; whatever
    // the order, the kept versions are distinct and none is the current one.
    assert.equal(
      new Set(versions).size,
      versions.length,
      JSON.stringify(versions),
    );
    assert.ok(!versions.includes(current.title));
    assert.equal(versions.length, 5);
  } finally {
    await s.close();
  }
});

test("with random ids, Recently removed keeps the ten most recently removed and lists them newest first", async () => {
  const s = await serve();
  try {
    const { randomUUID } = await import("node:crypto");
    for (let i = 0; i < 12; i++) {
      const id = randomUUID();
      await s.call(`/api/scores/${id}`, json("PUT", score(id, `piece ${i}`)));
      await s.call(`/api/scores/${id}`, { method: "DELETE" });
    }
    const titles = (await s.call("/api/recovery")).body.removed.map(
      (r) => r.title,
    );
    assert.deepEqual(
      titles,
      Array.from({ length: 10 }, (_, i) => `piece ${11 - i}`),
    );
  } finally {
    await s.close();
  }
});
