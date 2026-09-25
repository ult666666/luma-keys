import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
const executable =
  process.env.LUMA_APP ||
  path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys");
const app = await electron.launch({
  executablePath: executable,
  args: [],
  timeout: 30000,
});
const errors = [];
let cleanup;
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  cleanup = await trackTestData(page, new URL(page.url()).origin);
  await page
    .getByRole("heading", { name: "A little practice. A little magic." })
    .waitFor();
  await page.waitForTimeout(500);
  const health = await page.evaluate(
    async () => await (await fetch("/api/health")).json(),
  );
  assert.equal(health.omr, true);
  assert.ok(health.dataDir.endsWith("/Desktop/Luma Keys/Library"));
  await page.getByRole("button", { name: "Export practice notes" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved a printable number sheet" })
    .waitFor();
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
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/native-qa.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "Packaged app launches without terminal",
          "Bundled local recognition engine present",
          "Library saved on Desktop",
          "Printable number export saved",
          "Native audio playback advances",
          "Actual PDF imports 16 notes in packaged app",
          "Original PDF is available",
        ],
        health,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: native packaged app, audio, export, and full PDF recognition flow.",
  );
} finally {
  if (cleanup) await cleanup();
  await app.close();
}
