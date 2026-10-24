import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { verifyRecognitionReload } from "./recognition-checks.mjs";
const executable = path.resolve(
  "release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const originalHash = hash(await fs.readFile("tests/Starter melody.pdf"));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
await fs.mkdir(".qa-runs", { recursive: true });
const results = [];
for (const mode of ["quit", "window-close", "force-quit"]) {
  const root = await fs.mkdtemp(path.resolve(".qa-runs/recognition-close-"));
  const ownProcesses = () =>
    execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((line) => line.includes(root) && line.includes("Audiveris"))
      .map((line) => ({
        pid: +line.trim().split(/\s+/)[0],
        ppid: +line.trim().split(/\s+/)[1],
        runner: line.includes("recognition-runner.cjs"),
      }));
  let app, page;
  const owned = new Set(),
    errors = [];
  const launch = async () => {
    app = await electron.launch({
      executablePath: executable,
      env: { ...process.env, LUMA_QA_ROOT: root },
    });
    page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .waitFor();
  };
  try {
    await launch();
    const version = await app.evaluate(({ app }) => app.getVersion());
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/import"),
    );
    await page
      .locator("input[type=file]")
      .setInputFiles("tests/Starter melody.pdf");
    const { jobId } = await (await response).json();
    assert.ok(jobId);
    await expect
      .poll(() => ownProcesses().filter((p) => !p.runner).length, {
        timeout: 10000,
        intervals: [50, 100],
      })
      .toBe(1);
    const before = ownProcesses();
    for (const p of before) owned.add(p.pid);
    const began = performance.now();
    const closed = app.waitForEvent("close", { timeout: 15000 });
    if (mode === "force-quit") process.kill(app.process().pid, "SIGKILL");
    else
      await app.evaluate(({ app, BrowserWindow }, mode) => {
        setTimeout(
          () =>
            mode === "window-close"
              ? BrowserWindow.getAllWindows()[0].close()
              : app.quit(),
          0,
        );
      }, mode);
    await closed;
    app = null;
    await expect
      .poll(() => ownProcesses(), { timeout: 10000, intervals: [100, 300] })
      .toEqual([]);
    const shutdownMs = performance.now() - began;
    await launch();
    await page.getByRole("button", { name: "View imports" }).click();
    const card = page.locator(`[data-import-id="${jobId}"]`);
    await expect(card).toContainText("Interrupted · original kept");
    const bytes = await fs.readFile(
      path.join(root, "Library", "imports", jobId + ".pdf"),
    );
    assert.equal(hash(bytes), originalHash);
    await page.screenshot({ path: `evidence/pdf-${mode}-recovered.png` });
    await card.getByRole("button", { name: "Retry recognition" }).click();
    await page
      .getByRole("dialog", { name: "Review score" })
      .waitFor({ timeout: 120000 });
    assert.equal(await page.locator("tbody tr").count(), 16);
    const detail = await page.evaluate(
      async (id) => (await fetch("/api/jobs/" + id)).json(),
      jobId,
    );
    assert.equal(detail.attempt, 2);
    assert.deepEqual(
      detail.scores[0].notes.map((n) => n.midi),
      [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60],
    );
    assert.equal(
      hash(
        await fs.readFile(
          path.join(root, "Library", "imports", jobId + ".pdf"),
        ),
      ),
      originalHash,
    );
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    let reload;
    if (mode === "quit")
      reload = await verifyRecognitionReload(page, "native-pdf-lifecycle");
    assert.deepEqual(errors, []);
    results.push({
      mode,
      version,
      passed: true,
      shutdownMs,
      beforeClose: before,
      afterClose: [],
      originalHash,
      recognizedPitches: detail.scores[0].notes.map((n) => n.midi),
      ...(reload ? { reload } : {}),
      errors,
    });
    console.log(
      "PASS",
      mode,
      Math.round(shutdownMs) +
        "ms; no engine left; recovered and retried 16 notes",
    );
  } catch (e) {
    await page
      ?.screenshot({ path: "evidence/recognition-close-failure.png" })
      .catch(() => {});
    await fs.writeFile(
      "evidence/recognition-close-failure.json",
      JSON.stringify({ mode, error: e.message, completed: results }, null, 2),
    );
    throw e;
  } finally {
    if (app) await app.close().catch(() => {});
    // Fallback cleanup is scoped to child processes carrying this exact unique QA path.
    for (const p of ownProcesses()) {
      owned.add(p.pid);
      try {
        process.kill(p.pid, "SIGTERM");
      } catch {}
    }
    await delay(3500);
    for (const p of ownProcesses())
      if (owned.has(p.pid)) {
        try {
          process.kill(p.pid, "SIGKILL");
        } catch {}
      }
    await fs.rm(root, { recursive: true, force: true });
  }
}
await fs.writeFile(
  "evidence/recognition-close-qa.json",
  JSON.stringify({ passed: true, results }, null, 2),
);
