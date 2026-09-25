import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { trackTestData } from "./qa-cleanup.mjs";
import { barStart, demos } from "../src/music.mjs";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const cleanup = await trackTestData(page);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(15000);
const cursor = page.locator('.engraved-sheet img[id^="cursorImg"]');
const waitForSheet = async () => {
  await expect(page.locator(".sheet-paper")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(cursor).toBeVisible();
};
const measureIds = () =>
  page
    .locator(".engraved-sheet g.vf-measure")
    .evaluateAll((measures) =>
      [...new Set(measures.map((measure) => +measure.id))].sort(
        (a, b) => a - b,
      ),
    );
const cursorInMeasure = async (index) => {
  await expect
    .poll(async () => {
      const marker = await cursor.boundingBox();
      const measure = await page
        .locator(`.engraved-sheet g.vf-measure[id="${index}"]`)
        .first()
        .boundingBox();
      if (!marker || !measure) return false;
      const center = marker.x + marker.width / 2;
      return center >= measure.x && center <= measure.x + measure.width;
    })
    .toBe(true);
};
const nextNote = () =>
  page.getByRole("button", { name: "Next note", exact: true }).click();
const checks = [];
try {
  await page.goto("http://127.0.0.1:5188");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page
    .locator(".piece-row")
    .filter({ hasText: "Für Elise" })
    .getByRole("button", { name: "Open" })
    .click();
  await page.getByRole("tab", { name: "Sheet music", exact: true }).click();
  await waitForSheet();
  assert.deepEqual(await measureIds(), [0, 1, 2, 3]);
  const originalSVG = await page
    .locator(".engraved-sheet svg")
    .first()
    .elementHandle();
  const initialCursor = await cursor.boundingBox();
  await nextNote();
  await expect(page.getByRole("slider", { name: "Song position" })).toHaveValue(
    "0.25",
  );
  await expect
    .poll(async () => (await cursor.boundingBox())?.x)
    .not.toBe(initialCursor.x);
  assert.equal(await originalSVG.evaluate((svg) => svg.isConnected), true);
  checks.push(
    "Für Elise pickup shows exactly four source measures and moves the cursor without replacing the engraving",
  );

  await page
    .getByRole("button", { name: "Next sheet passage", exact: true })
    .click();
  await waitForSheet();
  const elise = demos().find((score) => score.title.includes("Für Elise"));
  await expect(page.getByRole("slider", { name: "Song position" })).toHaveValue(
    String(barStart(elise, 5)),
  );
  assert.deepEqual(await measureIds(), [4, 5, 6, 7]);
  await cursorInMeasure(4);
  await nextNote();
  await cursorInMeasure(4);
  await page.screenshot({ path: "evidence/sheet-focus-elise.png" });
  await page
    .getByRole("button", { name: "Next sheet passage", exact: true })
    .click();
  await waitForSheet();
  assert.deepEqual(await measureIds(), [8]);
  await cursorInMeasure(8);
  await page
    .getByRole("button", { name: "Previous sheet passage", exact: true })
    .click();
  await waitForSheet();
  assert.deepEqual(await measureIds(), [4, 5, 6, 7]);
  await cursorInMeasure(4);
  checks.push(
    "Forward, final, and backward passages keep the cursor on the correct written measure, including implicit pickups",
  );

  await page
    .getByRole("button", { name: "Import a score", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "sheet-focus-pickup.musicxml",
    mimeType: "application/xml",
    buffer: await fs.readFile("tests/fixtures/pickup-two-parts.musicxml"),
  });
  await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("tab", { name: "Sheet music", exact: true }).click();
  await waitForSheet();
  // OSMD can renumber multi-part MusicXML's graphical measure IDs. Compare
  // against the rendered bar order instead of assuming printed labels start 0.
  const pickupMeasures = await measureIds();
  assert.equal(pickupMeasures.length, 4);
  await cursorInMeasure(pickupMeasures[0]);
  const pickupSVG = await page
    .locator(".engraved-sheet svg")
    .first()
    .elementHandle();
  await nextNote();
  await expect(page.getByRole("slider", { name: "Song position" })).toHaveValue(
    "1",
  );
  await cursorInMeasure(pickupMeasures[1]);
  assert.equal(await pickupSVG.evaluate((svg) => svg.isConnected), true);
  await nextNote();
  await expect(page.getByRole("slider", { name: "Song position" })).toHaveValue(
    "4",
  );
  await cursorInMeasure(pickupMeasures[2]);
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await cursorInMeasure(pickupMeasures[0]);
  await nextNote();
  await cursorInMeasure(pickupMeasures[1]);
  await page.screenshot({ path: "evidence/sheet-focus-pickup.png" });
  checks.push(
    "A shortened two-part pickup maps transport beat 1 to written bar 2 and beat 4 to bar 3; rewinding remains accurate without re-engraving",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/sheet-focus-qa.json",
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log("PASS", checks);
} finally {
  await browser.close();
  await cleanup();
}
