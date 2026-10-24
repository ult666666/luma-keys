import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const prefix = process.env.LUMA_PERF_LABEL || "native-stage-performance-2.4";
const notes = [];
for (let bar = 0; bar < 400; bar++)
  for (let i = 0; i < 16; i++) {
    notes.push({
      id: `r${bar}-${i}`,
      midi: 72 + ((i * 5) % 12),
      beat: bar * 4 + i / 4,
      duration: 0.25,
      hand: "right",
      velocity: 0.7,
    });
    if (i % 2 === 0)
      notes.push({
        id: `l${bar}-${i}`,
        midi: 48 + ((i * 7) % 12),
        beat: bar * 4 + i / 4,
        duration: 0.5,
        hand: "left",
        velocity: 0.7,
      });
  }
const fixture = {
  id: "stage-dense",
  title: "Stage dense",
  composer: "Keyboard stage QA",
  bpm: 120,
  tonic: 0,
  meter: 4,
  notes,
  duration: 1600,
  measures: 400,
  measureStarts: Array.from({ length: 400 }, (_, i) => i * 4),
  measureLengths: Array(400).fill(4),
  reviewed: true,
  warnings: [],
};
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/stage-performance-"));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library/preferences.json"),
  JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: 0,
    stats: { correct: 0, minutes: 0, sessions: 0 },
  }),
);
let app, page;
const results = { samples: [] };
const focusOwned = () =>
  app.evaluate(({ app, BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      w.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
  });
const state = async () => ({
  native: await app.evaluate(({ app, BrowserWindow, screen }) => ({
    version: app.getVersion(),
    windows: BrowserWindow.getAllWindows().map((w) => ({
      bounds: w.getBounds(),
      content: w.getContentBounds(),
      visible: w.isVisible(),
      focused: w.isFocused(),
      minimized: w.isMinimized(),
      display: screen.getDisplayMatching(w.getBounds()),
    })),
  })),
  page: await page.evaluate(() => ({
    visible: document.visibilityState,
    focused: document.hasFocus(),
    viewport: { width: innerWidth, height: innerHeight },
    dpr: devicePixelRatio,
    companion: document.querySelector(".app")?.dataset.companion,
    clock: window.lumaClock?.(),
    backing: window.lumaBackingState?.(),
    keys: document.querySelectorAll(".piano-key").length,
    score: document.querySelector(".reading-score")?.className,
    runway: !!document.querySelector('[data-testid="note-roll"]'),
  })),
});
try {
  app = await electron.launch({
    executablePath:
      process.env.LUMA_APP ||
      path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys"),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  page = await app.firstWindow();
  const button = (name) => page.getByRole("button", { name, exact: true });
  await expect(button("Play")).toBeEnabled();
  await focusOwned();
  if (process.env.LUMA_PERF_COMPANION) {
    const { companionFor } = await import("../src/companions.mjs");
    const profile = companionFor(process.env.LUMA_PERF_COMPANION);
    await button("Beethoven").click();
    await button("Change companion").click();
    await button(`Preview ${profile.name}`).click();
    await button(`Choose ${profile.name}`).click();
    await button("Close dialog").click();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await button("Reading settings").click();
  await page
    .getByRole("combobox", { name: "Key labels" })
    .selectOption("numbers");
  await page.getByRole("combobox", { name: "Number tonic" }).selectOption("0");
  const count = page.getByRole("switch", { name: "Count me in" });
  if ((await count.getAttribute("aria-checked")) === "true")
    await count.click();
  await button("Close dialog").click();
  await button("Import a score").click();
  await page.locator("input[type=file]").setInputFiles({
    name: "stage-dense.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole("dialog", { name: "Review score" }).waitFor();
  await button("Close dialog").click();
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  await button("Listen & follow").click();
  await page
    .getByRole("radiogroup", { name: "Practice hand" })
    .locator(".hand-both")
    .click();
  await page
    .getByRole("combobox", { name: "Practice speed" })
    .selectOption("1");
  if ((await button("Hands").getAttribute("aria-pressed")) !== "true")
    await button("Hands").click();
  if (!(await page.locator('[data-testid="note-roll"]').count()))
    await button("Note runway").click();
  if (process.env.LUMA_PERF_BACKING) {
    await button("Accompaniment").click();
    await page
      .getByRole("button", { name: process.env.LUMA_PERF_BACKING })
      .click();
    await page.getByRole("checkbox", { name: "Enable accompaniment" }).check();
    await button("Close dialog").click();
  }
  for (let i = 0; i < 3; i++) {
    await button("Start over").click();
    await focusOwned();
    await button("Play").click();
    await button("Pause").waitFor();
    const before = await state();
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const ticks = [],
            start = performance.now();
          const tick = (t) => {
            ticks.push(t);
            if (t - start < 2500) requestAnimationFrame(tick);
            else resolve(ticks.slice(1).map((v, i) => v - ticks[i]));
          };
          requestAnimationFrame(tick);
        }),
    );
    const after = await state();
    await button("Pause").click();
    frames.sort((a, b) => a - b);
    results.samples.push({
      before,
      after,
      count: frames.length,
      median: frames[Math.floor(frames.length * 0.5)],
      p95: frames[Math.floor(frames.length * 0.95)],
      max: frames.at(-1),
      over33ms: frames.filter((v) => v > 33.4).length,
    });
  }
  results.passed = results.samples.every(
    (s) =>
      s.median <= 25 &&
      s.p95 <= 60 &&
      (!process.env.LUMA_PERF_BACKING ||
        (s.after.page.backing?.active &&
          s.after.page.backing.audio.started > 0 &&
          s.after.page.backing.audio.bankStatus === "ready")),
  );
  await focusOwned();
  await page.screenshot({ path: `evidence/${prefix}.png` });
  console.log(
    JSON.stringify(
      {
        passed: results.passed,
        version: results.samples[0].before.native.version,
        samples: results.samples.map(
          ({ count, median, p95, max, over33ms }) => ({
            count,
            median,
            p95,
            max,
            over33ms,
          }),
        ),
      },
      null,
      2,
    ),
  );
  if (!results.passed) process.exitCode = 1;
} catch (e) {
  results.failure = e.message;
  throw e;
} finally {
  await fs.writeFile(
    `evidence/${prefix}.json`,
    JSON.stringify(results, null, 2),
  );
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
