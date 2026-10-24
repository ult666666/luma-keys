import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { demos } from "../src/music.mjs";

// Solid storage (2.41) in the exact packaged app, on its own data root: the
// health report's version, writability and startup timings; a score edit
// keeps its earlier version; a removal keeps the removed score; the first
// settings write of the day keeps a snapshot; the diagnostics log beside the
// library records those events and a fault the page reports. Everything
// happens in a unique temporary root that is removed afterwards.
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-storage-"));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library/preferences.json"),
  JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: 0,
    stats: { correct: 0, minutes: 0, sessions: 0 },
    reading: { welcomeSeen: true },
  }),
);
const fixture = {
  ...demos()[0],
  id: "native-storage-fixture",
  title: "Native storage check",
  composer: "Luma Keys regression fixture",
};
const names = async (dir) => (await fs.readdir(dir).catch(() => [])).sort();
const checks = [];
let app, page;
try {
  app = await electron.launch({
    executablePath:
      process.env.LUMA_APP ||
      path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys"),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) =>
      window.webContents.setAudioMuted(true),
    ),
  );
  page.setDefaultTimeout(30000);
  const version = await app.evaluate(({ app }) => app.getVersion());
  const button = (name) => page.getByRole("button", { name, exact: true });
  await expect(button("Play")).toBeEnabled();
  const api = (url, init) =>
    page.evaluate(
      async ([url, init]) => {
        const r = await fetch(url, init);
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      [url, init],
    );
  const json = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // 1. Health: version, writable, startup timings, log location.
  const health = (await api("/api/health")).body;
  assert.equal(health.version, version);
  assert.equal(health.writable, true);
  assert.ok(health.startup.serverReadyMs > 0, "server-ready timing");
  assert.ok(
    health.startup.windowLoaded >= health.startup.serverReadyMs,
    "window-loaded timing follows server-ready",
  );
  assert.equal(health.log, path.join(root, "Logs", "luma-keys.log"));
  checks.push(
    `Health reports version ${version}, a writable library, startup timings (server ${health.startup.serverReadyMs} ms, window ${health.startup.windowLoaded} ms) and the log path`,
  );

  // 2. Import, edit, remove: recovery copies appear beside the library.
  await button("Import a score").click();
  await page.locator("input[type=file]").setInputFiles({
    name: "native-storage.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole("dialog", { name: "Review score" }).waitFor();
  await button("Close dialog").click();
  const scores = (await api("/api/scores")).body;
  const saved = scores.find((s) => s.title === fixture.title);
  assert.ok(saved, "the imported score is listed");
  const edited = (
    await api(
      "/api/scores/" + saved.id,
      json("PUT", { ...saved, title: "Native storage check · edited" }),
    )
  ).status;
  assert.equal(edited, 200);
  const versions = await names(
    path.join(root, "Library", "Score recovery", saved.id),
  );
  assert.equal(versions.length, 1, "one earlier version kept");
  assert.equal(
    JSON.parse(
      await fs.readFile(
        path.join(root, "Library", "Score recovery", saved.id, versions[0]),
        "utf8",
      ),
    ).title,
    fixture.title,
  );
  assert.equal(
    (await api("/api/scores/" + saved.id, { method: "DELETE" })).status,
    200,
  );
  const removed = await names(
    path.join(root, "Library", "Score recovery", "removed"),
  );
  assert.equal(removed.length, 1, "the removed score is kept");
  assert.ok(removed[0].startsWith(saved.id + "-"));
  assert.equal((await api("/api/scores")).body.length, 0);
  assert.ok(
    (await names(path.join(root, "Library"))).every((n) => !n.includes(".tmp")),
    "no temporary file remains",
  );
  checks.push(
    "Editing a score keeps its earlier version under Score recovery, removing it keeps the removed file, and no temporary file remains",
  );

  // 3. The first settings write of the day snapshots the file as it stood.
  const before = JSON.parse(
    await fs.readFile(path.join(root, "Library", "preferences.json"), "utf8"),
  );
  const prefs = (await api("/api/preferences")).body;
  assert.equal(
    (await api("/api/preferences", json("PUT", { ...prefs, volume: 0.25 })))
      .status,
    200,
  );
  assert.equal(
    (await api("/api/preferences", json("PUT", { ...prefs, volume: 0.5 })))
      .status,
    200,
  );
  const today = new Date().toLocaleDateString("en-CA");
  const snapshot = path.join(
    root,
    "Library",
    "Settings snapshots",
    `preferences-${today}.json`,
  );
  const kept = JSON.parse(await fs.readFile(snapshot, "utf8"));
  assert.equal(
    kept.volume,
    before.volume,
    "the snapshot is the file before today's first change",
  );
  // The live page keeps its own debounced settings writes, so the current
  // value is whatever landed last; it only has to be a whole, valid file.
  const live = (await api("/api/preferences")).body;
  assert.ok(
    Number.isFinite(live.volume) && live.volume >= 0 && live.volume <= 1,
  );
  checks.push(
    "The first settings write of the day keeps a snapshot of the file as it stood; later writes keep it and the live file stays whole",
  );

  // 4. A fault the page reports, and the events above, are in the log.
  await page.evaluate(() =>
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "native storage check fault",
        filename: "check.js",
        lineno: 7,
      }),
    ),
  );
  await expect
    .poll(
      async () =>
        (await fs.readFile(health.log, "utf8").catch(() => "")).includes(
          "native storage check fault",
        ),
      {
        timeout: 10000,
      },
    )
    .toBe(true);
  const events = (await fs.readFile(health.log, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const names_ = events.map((e) => e.event);
  for (const expected of [
    "server-ready",
    "app-ready",
    "score-version-kept",
    "score-removed",
    "settings-snapshot-kept",
    "renderer-error",
  ])
    assert.ok(names_.includes(expected), `log has ${expected}`);
  const ready = events.find((e) => e.event === "server-ready");
  assert.equal(ready.version, version);
  const fault = events.find((e) => e.event === "renderer-error");
  assert.equal(fault.where, "check.js:7");
  assert.ok(
    !JSON.stringify(events).includes(fixture.notes[0].midi + ",") &&
      !JSON.stringify(events).includes('"notes"'),
    "the log holds events, not music",
  );
  checks.push(
    `The diagnostics log records server-ready, app-ready, the kept version, the removal, the snapshot and a reported page fault (${events.length} events), without music`,
  );
  await fs.writeFile(
    "evidence/native-storage-qa.json",
    JSON.stringify(
      {
        passed: true,
        version,
        checks,
        health,
        logEvents: names_,
      },
      null,
      2,
    ),
  );
  console.log("PASS native storage", version, checks.length, "checks");
} catch (error) {
  await page
    ?.screenshot({
      path: "evidence/native-storage-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  await fs.writeFile(
    "evidence/native-storage-failure.json",
    JSON.stringify(
      {
        error: error.message,
        checks,
        body: await page
          ?.locator("body")
          .innerText()
          .catch(() => "unavailable"),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  // This reference belongs only to the uniquely isolated QA app launched above.
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
