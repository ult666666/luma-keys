import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cleanup = await trackTestData(page);
const notes = Array.from({ length: 50000 }, (_, i) => ({
  id: `large-${i}`,
  midi: [48, 52, 55, 60, 64, 67, 72, 76][i % 8],
  beat: Math.floor(i / 8) / 2,
  duration: 0.4,
  hand: i % 8 < 3 ? "left" : "right",
  measure: Math.floor(Math.floor(i / 8) / 8) + 1,
  velocity: 0.5,
}));
const score = {
  id: "large-fixture",
  title: "Large score · 50,000 notes",
  composer: "QA fixture",
  bpm: 120,
  meter: 4,
  notes,
  duration: 3124.9,
  measures: 782,
  source: "QA",
  warnings: [],
  reviewed: false,
};
try {
  await page.goto("http://127.0.0.1:5188");
  await page
    .getByRole("button", { name: "Import a score", exact: true })
    .click();
  const start = performance.now();
  await page.locator("input[type=file]").setInputFiles({
    name: "large-score.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(score)),
  });
  await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
  const importMs = performance.now() - start;
  assert.equal(await page.locator("tbody tr").count(), 32);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert.equal(await page.locator(".pagination span").innerText(), "2 / 1563");
  const saveStart = performance.now();
  await page.getByRole("button", { name: "Save & mark reviewed" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 15000 });
  const saveMs = performance.now() - saveStart;
  await page.getByRole("switch", { name: "Count me in" }).click();
  await page.getByRole("slider", { name: "Song position" }).fill("3000");
  assert.match(
    await page.locator(".next-card .soft-tag").innerText(),
    /Bar 751/,
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const gaps = [];
        const started = performance.now();
        let previous = started;
        function frame(t) {
          gaps.push(t - previous);
          previous = t;
          if (t - started > 2500) resolve(gaps);
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
  );
  const visibleNotes = await page.locator(".falling-note").count();
  assert.ok(visibleNotes > 0 && visibleNotes < 180, String(visibleNotes));
  const advancedBeat = +(await page
    .getByRole("slider", { name: "Song position" })
    .inputValue());
  assert.ok(advancedBeat > 3002 && advancedBeat < 3010, String(advancedBeat));
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.ok(importMs < 15000 && saveMs < 15000);
  const maxFrameGapMs = Math.max(...frames.slice(1));
  assert.ok(maxFrameGapMs < 500, String(maxFrameGapMs));
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    noteCount: notes.length,
    importMs,
    saveMs,
    visibleNotes,
    advancedBeat,
    frames: frames.length,
    maxFrameGapMs,
    p95FrameGapMs: [...frames].sort((a, b) => a - b)[
      Math.floor(frames.length * 0.95)
    ],
    environment:
      "Headless Chrome on this Mac; synthetic eight-note chords; not a guarantee for scanned full-book notation",
    checks: [
      "50,000-note JSON imports and review paginates",
      "Save review succeeds",
      "Seek near end retains correct bar and playback",
      "Only nearby falling notes enter the DOM",
      "Playback remains responsive",
    ],
    errors,
  };
  await fs.writeFile(
    "evidence/large-score-qa.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await cleanup();
}
