import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { verifyElise } from "./lesson-checks.mjs";
import { verifyNotation } from "./notation-checks.mjs";
import { verifyBackups } from "./backup-checks.mjs";
const executable =
  process.env.LUMA_APP ||
  path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys");
await fs.mkdir(".qa-runs", { recursive: true });
const qaRoot = await fs.mkdtemp(path.resolve(".qa-runs/native-"));
const app = await electron.launch({
  executablePath: executable,
  args: [],
  env: { ...process.env, LUMA_QA_ROOT: qaRoot },
  timeout: 30000,
});
const errors = [];
const consoleErrors = [];
let page;
try {
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  await page
    .getByRole("heading", { name: "A little practice. A little magic." })
    .waitFor();
  await page.waitForTimeout(500);
  const health = await page.evaluate(
    async () => await (await fetch("/api/health")).json(),
  );
  assert.equal(health.omr, true);
  assert.equal(health.dataDir, path.join(qaRoot, "Library"));
  await page.getByRole("button", { name: "Export practice notes" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved a printable number sheet" })
    .waitFor();
  // Exercise the audio engine without sounding the test instance overnight.
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page.getByRole("switch", { name: "Count me in" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.waitForFunction(
    () => +document.querySelector('[aria-label="Song position"]').value > 1,
    {},
    { timeout: 8000 },
  );
  await page.screenshot({ path: "evidence/native-app.png", fullPage: true });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const lessonChecks = await verifyElise(page, "native");
  await page
    .getByRole("button", { name: "Import a score", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/Starter melody.pdf");
  await page
    .getByRole("dialog", { name: "Make the music yours" })
    .waitFor({ timeout: 120000 });
  assert.equal(await page.locator("tbody tr").count(), 16);
  await page.getByRole("button", { name: "Original PDF", exact: true }).click();
  await page.locator('canvas[data-ready="true"]').waitFor();
  assert.ok(await page.locator("canvas").evaluate((c) => c.width > 0));
  await page.screenshot({ path: "evidence/native-pdf-import.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  const notation = await verifyNotation(page, "native-notation");
  const backups = await verifyBackups(page, "native-backup");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/native-qa.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "Packaged app launches without terminal",
          "Bundled local recognition engine present",
          "Separate test library and Electron instance; user's open app preserved",
          "Printable number export saved",
          "Native audio playback advances (test-instance output muted)",
          "Actual PDF imports 16 notes in packaged app",
          "Original PDF is available",
          ...lessonChecks,
          ...notation.checks,
          ...backups,
        ],
        health,
        notationMeasurements: notation.measurements,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: native packaged app, audio, export, and full PDF recognition flow.",
  );
} catch (error) {
  const body = page
    ? await page
        .locator("body")
        .innerText()
        .catch(() => "unavailable")
    : "no window";
  if (page)
    await page
      .screenshot({ path: "evidence/native-qa-failure.png" })
      .catch(() => {});
  await fs.writeFile(
    "evidence/native-qa-failure.json",
    JSON.stringify(
      { passed: false, error: error.message, errors, consoleErrors, body },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await app.close();
  await fs.rm(qaRoot, { recursive: true, force: true });
}
