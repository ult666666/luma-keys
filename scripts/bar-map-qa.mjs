import { chromium } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { clickInPieceTools } from "./practice-tools.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const cleanup = await trackTestData(page);
try {
  const midi = new midiPackage.Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push(
    { ticks: 0, timeSignature: [4, 4] },
    { ticks: 1920, timeSignature: [3, 4] },
    { ticks: 4800, timeSignature: [5, 4] },
  );
  const right = midi.addTrack();
  for (const [beat, pitch] of [
    [0, 60],
    [4, 62],
    [7, 64],
    [9, 65],
    [10, 67],
    [14, 69],
    [15, 71],
  ])
    right.addNote({ midi: pitch, ticks: beat * 480, durationTicks: 360 });
  midi.addTrack().addNote({ midi: 48, ticks: 0, durationTicks: 480 });
  await page.goto("http://127.0.0.1:5188");
  await page
    .getByRole("button", { name: "Import a score", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "Changing meters.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(midi.toArray()),
  });
  await page.getByRole("dialog", { name: "Review score" }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 8);
  await page.getByRole("button", { name: "Save & mark reviewed" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push("Import and review real MIDI with 4/4 → 3/4 → 5/4");
  await page.getByRole("button", { name: "Toggle phrase loop" }).click();
  await page.getByRole("spinbutton", { name: "Loop end bar" }).fill("3");
  await page.getByRole("spinbutton", { name: "Loop start bar" }).fill("3");
  await page.getByRole("button", { name: "Wait for me", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  assert.equal(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()),
    7,
  );
  assert.equal(
    (await page.locator(".next-card .soft-tag").innerText()).trim(),
    "Bar 3",
  );
  await page.locator("h1").click();
  await page.keyboard.press("d");
  await page.waitForFunction(
    () => +document.querySelector('[aria-label="Song position"]').value === 9,
  );
  await page.keyboard.press("f");
  await page.waitForFunction(
    () => +document.querySelector('[aria-label="Song position"]').value === 7,
  );
  checks.push("Wait mode starts at beat 7 and wraps 7 → 9 → 7 within bar 3");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Practice hand" })
    .locator(".hand-left")
    .click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "There are no new notes for this hand in these bars" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Pause", exact: true }).count(),
    0,
  );
  checks.push(
    "Empty left-hand phrase gives guidance instead of jumping outside the loop",
  );
  await page
    .getByRole("radiogroup", { name: "Practice hand" })
    .locator(".hand-both")
    .click();
  await page
    .getByRole("button", { name: "Listen & follow", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Practice speed" })
    .selectOption("1.25");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  assert.equal(await page.locator(".falling-note").count(), 2);
  const samples = await page.evaluate(async () => {
    const values = [];
    for (let i = 0; i < 80; i++) {
      values.push({
        beat: +document.querySelector('[aria-label="Song position"]').value,
        hint: document.querySelector(".next-notes").textContent,
      });
      await new Promise((r) => setTimeout(r, 40));
    }
    return values;
  });
  const beats = samples.map((s) => s.beat);
  assert.ok(
    samples.every((s) => /E4|F4/.test(s.hint)),
    "Next-note hint left the phrase",
  );
  checks.push("Falling notes and next-note hints stay inside the phrase");
  assert.ok(
    beats.every((b) => b >= 7 && b < 10.01),
    JSON.stringify(beats),
  );
  assert.ok(
    beats.some((b, i) => i > 0 && beats[i - 1] - b > 1),
    "Loop never wrapped",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  checks.push("Listen mode repeatedly wraps at beat 10, matching the 3/4 bar");
  const exported = page.waitForResponse(
    (r) => r.url().endsWith("/api/export") && r.request().method() === "POST",
  );
  await clickInPieceTools(page, "Export practice notes");
  const out = await (await exported).json();
  const html = await fs.readFile(out.html, "utf8");
  assert.match(html, /Bar 3<\/header>.*?Beat 1<\/span>.*?Beat 3<\/span>/);
  assert.match(html, /Bar 4<\/header>.*?Beat 1<\/span>.*?Beat 5<\/span>/);
  const backup = JSON.parse(await fs.readFile(out.backup, "utf8"));
  assert.deepEqual(backup.measureStarts, [0, 4, 7, 10, 15]);
  assert.deepEqual(backup.measureLengths, [4, 3, 3, 5, 5]);
  checks.push(
    "Printed numbered sheet and JSON backup preserve changing bar lengths",
  );
  await page.screenshot({
    path: "evidence/overnight-meter-loop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/bar-map-qa.json",
    JSON.stringify(
      { passed: true, checks, errors, sampledLoopBeats: beats },
      null,
      2,
    ),
  );
  console.log(checks.map((c) => "PASS " + c).join("\n"));
} finally {
  await browser.close();
  await cleanup();
}
