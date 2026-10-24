import { trackTestData } from "./qa-cleanup.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1480, height: 1020 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const cleanup = await trackTestData(p);
try {
  await p.goto("http://127.0.0.1:5188");
  await p.getByRole("button", { name: "Import a score", exact: true }).click();
  await p.locator("input[type=file]").setInputFiles("tests/Starter melody.pdf");
  await p
    .getByRole("dialog", { name: "Review score" })
    .waitFor({ timeout: 120000 });
  assert.equal(await p.locator("tbody tr").count(), 16);
  await p.getByRole("button", { name: "Original PDF", exact: true }).click();
  await p.locator('canvas[data-ready="true"]').waitFor();
  const pixels = await p.locator("canvas").evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100 && d[i + 3] > 0) ink++;
    return ink;
  });
  assert.ok(pixels > 1000);
  await p.screenshot({ path: "evidence/pdf-original-rendered.png" });
  await p.getByRole("button", { name: "Recognized notes · 16" }).click();
  const pitches = await p
    .locator('select[aria-label^="Pitch"]')
    .evaluateAll((els) => els.map((e) => +e.value));
  assert.deepEqual(
    pitches,
    [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60],
  );
  await p.getByRole("button", { name: "Save & mark reviewed" }).click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/pdf-ui-qa.json",
    JSON.stringify(
      {
        passed: true,
        notes: pitches.length,
        pitches,
        originalCanvasInkPixels: pixels,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS full PDF recognition, 16 exact pitches, original PDF canvas renders.",
  );
} finally {
  await b.close();
  await cleanup();
}
