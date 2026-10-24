import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { installInputHarness, verifyInputs } from "./input-checks.mjs";

const directory = path.resolve(".qa-runs/concert-grand-2.12");
await fs.mkdir(directory, { recursive: true });
const qaRoot = await fs.mkdtemp(path.join(directory, "native-"));
await fs.mkdir(path.join(qaRoot, "Library"));
const preferences = JSON.stringify({
  volume: 0,
  theme: "mint",
  pet: "cat",
  stats: { correct: 0, minutes: 0, sessions: 0 },
});
await fs.writeFile(path.join(qaRoot, "Library/preferences.json"), preferences);
const report = {
  passed: false,
  functionalPassed: false,
  performancePassed: null,
  qaRoot,
  checks: [],
  errors: [],
  samples: [],
};
let app, page;
const focusOwned = () =>
  app.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
  });
try {
  app = await electron.launch({
    executablePath:
      process.env.LUMA_APP ||
      path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys"),
    env: { ...process.env, LUMA_QA_ROOT: qaRoot },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(45000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  report.version = await app.evaluate(({ app }) => app.getVersion());
  const button = (name) => page.getByRole("button", { name, exact: true });
  await expect(button("Play")).toBeEnabled();
  await focusOwned();
  await page.waitForTimeout(750);
  assert.equal(
    await fs.readFile(path.join(qaRoot, "Library/preferences.json"), "utf8"),
    preferences,
    "Legacy hydration must not rewrite saved preferences",
  );
  await installInputHarness(page);
  await page.reload();
  await expect(button("Play")).toBeEnabled();
  await focusOwned();
  const screenshot = page.screenshot.bind(page);
  page.screenshot = async (options) => {
    await focusOwned();
    return screenshot({ ...options, fullPage: false });
  };
  const state = () =>
    page.evaluate(() => {
      if (typeof window.lumaAudioState !== "function")
        throw Error("Native piano diagnostics missing");
      return window.lumaAudioState();
    });
  const clock = () => page.evaluate(() => window.lumaClock());
  report.before = await state();
  assert.equal(
    (await clock()).playing,
    false,
    "Fresh launch must not autoplay",
  );
  report.checks.push(
    "Legacy settings stay byte-identical through initial hydration and the fresh packaged app never autoplays.",
  );

  // These established behavioural regressions exercise the actual new engine,
  // including computer/MIDI ownership, sustain, modal guards and async startup.
  const input = await verifyInputs(
    page,
    "../.qa-runs/concert-grand-2.12/native-grand-input",
  );
  report.checks.push(...input.checks);
  report.input = input;
  await expect(button("Play")).toBeEnabled();
  report.afterInputs = await state();
  assert.equal(
    report.afterInputs.prepared,
    true,
    "New grand sample engine prepared in packaged app",
  );
  assert.ok(
    report.afterInputs.decodedBytes > 0,
    "Real decoded grand buffers are resident",
  );
  assert.ok(
    report.afterInputs.decodedBytes <= report.afterInputs.maxDecodedBytes,
    "Decoded sample cache is bounded",
  );
  assert.equal(
    report.afterInputs.fallbacks,
    0,
    "No silent fallback piano in native regressions",
  );
  report.checks.push(
    "The packaged input flows use the prepared grand with resident decoded samples, bounded cache and no fallback voices.",
  );

  await button("Reading settings").click();
  const phrasing = page.getByRole("group", {
    name: "Piano phrasing",
    exact: true,
  });
  await expect(
    page.getByText("Yamaha C5 grand · Six recorded touch levels · Stereo", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    phrasing.getByRole("button", { name: /^Expressive/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await phrasing.getByRole("button", { name: /^As written/ }).click();
  await expect(
    phrasing.getByRole("button", { name: /^As written/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    phrasing.getByRole("button", { name: /^Expressive/ }),
  ).toHaveAttribute("aria-pressed", "false");
  await button("Close dialog").click();
  await page.evaluate(() => window.lumaFlushPreferences());
  await page.reload();
  await expect(button("Play")).toBeEnabled();
  await focusOwned();
  assert.equal((await clock()).playing, false);
  await button("Reading settings").click();
  await expect(
    phrasing.getByRole("button", { name: /^As written/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await phrasing.getByRole("button", { name: /^Expressive/ }).click();
  await expect(
    phrasing.getByRole("button", { name: /^Expressive/ }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const label of ["Count me in", "Metronome"]) {
    const toggle = page.getByRole("switch", { name: label, exact: true });
    if ((await toggle.getAttribute("aria-checked")) === "true")
      await toggle.click();
  }
  await page.screenshot({
    path: path.join(directory, "native-grand-settings.png"),
    fullPage: false,
  });
  await button("Close dialog").click();
  await page.evaluate(() => window.lumaFlushPreferences());
  const saved = JSON.parse(
    await fs.readFile(path.join(qaRoot, "Library/preferences.json"), "utf8"),
  );
  assert.equal(saved.reading.interpretation, "concert");
  report.checks.push(
    "Sound settings accurately identify the six-layer grand; As written survives reload, Expressive/As written selection is exclusive, and Expressive persists without autoplay.",
  );

  const tailFixture = {
    id: "grand-tail",
    title: "Grand completion tail",
    composer: "Isolated QA fixture",
    bpm: 120,
    tonic: 0,
    meter: 1,
    duration: 1,
    measures: 1,
    measureStarts: [0],
    measureLengths: [1],
    reviewed: true,
    warnings: [],
    notes: [
      {
        id: "tail",
        midi: 48,
        beat: 0,
        duration: 1,
        hand: "right",
        velocity: 0.8,
      },
    ],
  };
  await button("Import a score").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "grand-tail.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tailFixture)),
  });
  await page
    .getByRole("dialog", { name: "Review score", exact: true })
    .waitFor();
  await button("Close dialog").click();
  await button("Listen & follow").click();
  await page
    .getByRole("radiogroup", { name: "Practice hand", exact: true })
    .locator(".hand-both")
    .click();
  await button("Start over").click();
  await button("Play").click();
  await expect
    .poll(async () => (await clock()).playing, { timeout: 120000 })
    .toBe(true);
  await expect
    .poll(async () => (await clock()).playing, {
      intervals: [25, 25, 25],
      timeout: 10000,
    })
    .toBe(false);
  report.completionTail = await state();
  assert.ok(
    report.completionTail.active > 0,
    "Natural completion lets the final scheduled release ring",
  );
  await page
    .getByRole("slider", { name: "Song position", exact: true })
    .fill("0");
  assert.equal(
    (await state()).active,
    0,
    "Manual seek explicitly stops the remaining tail",
  );
  report.checks.push(
    "Natural completion preserves the final note's release tail, while a manual seek stops it immediately.",
  );

  const notes = [];
  for (let bar = 0; bar < 400; bar++)
    for (let i = 0; i < 16; i++) {
      notes.push({
        id: `r-${bar}-${i}`,
        midi: 60 + ((i * 5) % 24),
        beat: bar * 4 + i / 4,
        duration: 0.25,
        hand: "right",
        velocity: [0.25, 0.5, 0.75, 1][i % 4],
      });
      if (i % 2 === 0)
        notes.push({
          id: `l-${bar}-${i}`,
          midi: 36 + ((i * 7) % 24),
          beat: bar * 4 + i / 4,
          duration: 0.5,
          hand: "left",
          velocity: [0.35, 0.6, 0.9][i % 3],
        });
    }
  const score = {
    id: "grand-native-dense",
    title: "Grand audio regression · dense coda",
    composer: "Isolated QA fixture",
    bpm: 120,
    tonic: 0,
    meter: 4,
    duration: 1600,
    measures: 400,
    measureStarts: Array.from({ length: 400 }, (_, i) => i * 4),
    measureLengths: Array(400).fill(4),
    notes,
    reviewed: true,
    warnings: [],
  };
  await button("Import a score").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "grand-native-dense.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(score)),
  });
  await page
    .getByRole("dialog", { name: "Review score", exact: true })
    .waitFor();
  await button("Close dialog").click();
  await button("Reading settings").click();
  for (const label of ["Count me in", "Metronome"]) {
    const toggle = page.getByRole("switch", { name: label, exact: true });
    if ((await toggle.getAttribute("aria-checked")) === "true")
      await toggle.click();
  }
  await button("Close dialog").click();
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  await button("Listen & follow").click();
  await page
    .getByRole("radiogroup", { name: "Practice hand", exact: true })
    .locator(".hand-both")
    .click();
  await page
    .getByRole("combobox", { name: "Practice speed", exact: true })
    .selectOption("1");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (let iteration = 0; iteration < 3; iteration++) {
    await button("Start over").click();
    await focusOwned();
    const begun = Date.now();
    await button("Play").click();
    await expect
      .poll(async () => (await clock()).playing, { timeout: 120000 })
      .toBe(true);
    const startupMs = Date.now() - begun;
    await expect.poll(async () => (await clock()).mapped).toBeGreaterThan(0.1);
    const before = await state();
    const timing = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const frames = [],
            start = performance.now();
          const tick = (time) => {
            frames.push(time);
            if (time - start < 2500) requestAnimationFrame(tick);
            else
              resolve({
                frames: frames.slice(1).map((t, i) => t - frames[i]),
                visible: document.visibilityState,
                focused: document.hasFocus(),
              });
          };
          requestAnimationFrame(tick);
        }),
    );
    const after = await state();
    timing.frames.sort((a, b) => a - b);
    const sample = {
      iteration,
      startupMs,
      before,
      after,
      visible: timing.visible,
      focused: timing.focused,
      count: timing.frames.length,
      median: timing.frames[Math.floor(timing.frames.length * 0.5)],
      p95: timing.frames[Math.floor(timing.frames.length * 0.95)],
      max: timing.frames.at(-1),
      over33ms: timing.frames.filter((x) => x > 33.4).length,
    };
    report.samples.push(sample);
    await button("Pause").click();
    await expect.poll(async () => (await clock()).playing).toBe(false);
    await page.waitForTimeout(160);
    assert.equal(
      after.fallbacks,
      0,
      "Dense velocity changes must remain sampled",
    );
    assert.ok(
      after.decodedBytes <= after.maxDecodedBytes,
      "Dense playback keeps decoded cache within budget",
    );
    const stopped = await state();
    assert.equal(stopped.active, 0, "Pause releases the dense playback voices");
  }
  report.checks.push(
    "Three foreground 9600-note runs keep cache usage bounded while switching recorded velocity layers; Pause releases playback.",
  );
  // Seek after a queued start must not leak a delayed strike from the old origin.
  await page.evaluate(() => window.__inputQA.gate());
  await button("Play").click();
  await expect
    .poll(() => page.evaluate(() => window.__inputQA.waiters.length))
    .toBeGreaterThan(0);
  await page
    .getByRole("slider", { name: "Song position", exact: true })
    .fill("32");
  await page.evaluate(() => window.__inputQA.release());
  await page.waitForTimeout(300);
  assert.equal(
    (await clock()).playing,
    false,
    "Seek cancels pending async Play",
  );
  assert.equal(
    (await state()).active,
    0,
    "Cancelled startup cannot create late voices",
  );
  report.checks.push(
    "Seeking while audio startup is awaiting its gate cancels the old origin with no delayed voices.",
  );
  report.final = await state();
  await page.screenshot({
    path: path.join(directory, "native-grand.png"),
    fullPage: false,
  });
  assert.deepEqual(report.errors, []);
  report.functionalPassed = true;
  report.performancePassed = report.samples.every(
    (sample) => sample.count >= 80 && sample.median <= 25 && sample.p95 <= 60,
  );
  report.passed = report.functionalPassed && report.performancePassed;
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        functionalPassed: report.functionalPassed,
        performancePassed: report.performancePassed,
        version: report.version,
        checks: report.checks.length,
        samples: report.samples.map((s) => ({
          startupMs: s.startupMs,
          count: s.count,
          median: s.median,
          p95: s.p95,
        })),
      },
      null,
      2,
    ),
  );
  // Keep every functional check reachable, while retaining the same strict
  // frame limits and a failing overall exit status when those limits fail.
  assert.ok(
    report.performancePassed,
    `Native foreground frame regression: ${JSON.stringify(
      report.samples.map(({ count, median, p95 }) => ({ count, median, p95 })),
    )}`,
  );
} catch (error) {
  report.failure = error.stack;
  await page
    ?.screenshot({
      path: path.join(directory, "native-grand-failure.png"),
      fullPage: false,
    })
    .catch(() => {});
  throw error;
} finally {
  await app?.close();
  await fs.writeFile(
    path.join(directory, "native-grand-report.json"),
    JSON.stringify(report, null, 2),
  );
}
