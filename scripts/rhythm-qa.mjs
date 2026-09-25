import { chromium } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  await page.evaluate(async () => {
    // Vite may version the live module after a source edit. Observe that same
    // instance instead of importing a second, unused piano without its query.
    const loadedAudio =
      performance
        .getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname === "/src/audio.js")
        .at(-1)?.name || "/src/audio.js";
    const { piano } = await import(loadedAudio);
    await piano.prepare();
    window.__piano = piano;
    window.__ticks = [];
    const tick = piano.tick.bind(piano);
    piano.tick = (accent, delay = 0) => {
      window.__ticks.push({ at: piano.ctx.currentTime + delay, accent, delay });
      return tick(accent, delay);
    };
  });
  async function loadMeter(numerator) {
    const m = new midiPackage.Midi();
    m.header.setTempo(120);
    m.header.timeSignatures.push({ ticks: 0, timeSignature: [numerator, 8] });
    const t = m.addTrack();
    for (let bar = 0; bar < 4; bar++)
      t.addNote({
        midi: 60 + bar,
        ticks: bar * numerator * 240,
        durationTicks: numerator * 240,
      });
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: `Gentle ${numerator}-8.mid`,
      mimeType: "audio/midi",
      buffer: Buffer.from(m.toArray()),
    });
    await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
    await page.getByRole("button", { name: "Save & mark reviewed" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("1");
    await page.evaluate(() => (window.__ticks = []));
  }
  await loadMeter(6);
  assert.equal(
    await page.locator(".meter-hint").innerText(),
    "6/8 · 2 pulses per bar",
  );
  await page.getByRole("switch", { name: "Gentle metronome" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.getByText("Count in · 1", { exact: false }).waitFor();
  await page.getByText("Count in · 2", { exact: false }).waitFor();
  await page.waitForFunction(() => window.__ticks.length >= 6);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const compound = await page.evaluate(() => window.__ticks.slice(0, 6));
  assert.deepEqual(
    compound.map((t) => t.accent),
    [true, false, true, false, true, false],
  );
  const intervals = compound.slice(1).map((t, i) => t.at - compound[i].at);
  assert.ok(
    intervals.every((d) => Math.abs(d - 0.75) < 0.035),
    JSON.stringify(intervals),
  );
  assert.ok(
    compound.some((t) => t.delay > 0.03),
    "Clicks were not scheduled ahead",
  );
  assert.equal(await page.evaluate(() => window.__piano.clicks.size), 0);
  checks.push(
    "6/8 count-in and playback use two pulses per bar, 0.75 s apart at quarter-note tempo 120",
  );
  checks.push(
    "Clicks scheduled ahead on audio clock; pause cancels pending oscillators",
  );
  await loadMeter(5);
  assert.equal(
    await page.locator(".meter-hint").innerText(),
    "5/8 · 5 pulses per bar",
  );
  await page.getByRole("switch", { name: "Count me in" }).click();
  await page.getByRole("button", { name: "Toggle phrase loop" }).click();
  await page.getByRole("spinbutton", { name: "Loop end bar" }).fill("2");
  await page.getByRole("spinbutton", { name: "Loop start bar" }).fill("2");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.waitForFunction(() => window.__ticks.length >= 11);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const odd = await page.evaluate(() => window.__ticks.slice(0, 11));
  assert.deepEqual(
    odd.map((t) => t.accent),
    [true, false, false, false, false, true, false, false, false, false, true],
  );
  const oddIntervals = odd.slice(1).map((t, i) => t.at - odd[i].at);
  assert.ok(
    oddIntervals.every((d) => Math.abs(d - 0.25) < 0.06),
    JSON.stringify(oddIntervals),
  );
  assert.equal(await page.evaluate(() => window.__piano.clicks.size), 0);
  checks.push(
    "5/8 loop starts at beat 2.5, clicks every eighth note, and accents each repeated bar",
  );
  await page.evaluate(() => {
    window.__piano.tick(true, 1);
    window.__piano.stop();
  });
  assert.equal(await page.evaluate(() => window.__piano.clicks.size), 0);
  checks.push("Stop also cancels deliberately scheduled future clicks");
  await page.screenshot({
    path: "evidence/rhythm-5-8-loop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/rhythm-qa.json",
    JSON.stringify(
      {
        passed: true,
        checks,
        compoundTicks: compound,
        compoundIntervals: intervals,
        oddMeterTicks: odd,
        oddMeterIntervals: oddIntervals,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(checks.map((c) => "PASS " + c).join("\n"));
} catch (error) {
  const diagnostic = await page
    .evaluate(() => ({
      ticks: window.__ticks,
      audioState: window.__piano?.ctx.state,
      audioTime: window.__piano?.ctx.currentTime,
      caption: document.querySelector(".roll-caption")?.textContent,
      modules: performance
        .getEntriesByType("resource")
        .filter((r) => r.name.includes("audio.js"))
        .map((r) => r.name),
    }))
    .catch(() => ({}));
  await fs.writeFile(
    "evidence/rhythm-qa-failure.json",
    JSON.stringify({ error: error.message, diagnostic }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await cleanup();
}
