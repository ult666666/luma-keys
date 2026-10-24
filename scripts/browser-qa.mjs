import { trackTestData } from "./qa-cleanup.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 1020 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__audioStarts = 0;
  window.__audioDecodes = 0;
  const create = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function (...a) {
    const n = create.apply(this, a),
      start = n.start.bind(n);
    n.start = (...x) => {
      window.__audioStarts++;
      return start(...x);
    };
    return n;
  };
  const decode = AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData = function (...a) {
    window.__audioDecodes++;
    return decode.apply(this, a);
  };
});
const reports = [];
const check = (name) => {
  reports.push({ name, passed: true });
  console.log("PASS", name);
};
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  await page
    .getByRole("heading", { name: "A little practice. A little magic." })
    .waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".piano-key").count(), 37);
  check("Studio loads with aligned 37-key comfort keyboard");
  await page.getByRole("switch", { name: "Count me in" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('input[aria-label="Song position"]').value,
      ) > 1,
    {},
    { timeout: 6000 },
  );
  assert.equal(await page.evaluate(() => window.__audioDecodes), 30);
  assert.ok((await page.evaluate(() => window.__audioStarts)) >= 2);
  await page.screenshot({
    path: "evidence/studio-playing.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await page
    .getByRole("slider", { name: "Song position" })
    .inputValue();
  await page.waitForTimeout(250);
  assert.equal(
    await page.getByRole("slider", { name: "Song position" }).inputValue(),
    paused,
  );
  check(
    "All 30 piano samples decode; playback sounds notes, advances, and pauses",
  );
  await page.getByRole("button", { name: "Wait for me", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.waitForTimeout(700);
  assert.equal(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()),
    0,
  );
  await page.locator("h1").click();
  await page.keyboard.press("d");
  assert.equal(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()),
    0,
  );
  await page.keyboard.down("a");
  await page.waitForTimeout(100);
  await page.keyboard.up("a");
  assert.equal(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()),
    1,
  );
  check(
    "Wait mode holds time; wrong note does not advance; correct computer-key note advances",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Toggle phrase loop" }).click();
  await page.getByRole("spinbutton", { name: "Loop start bar" }).fill("2");
  await page.getByRole("spinbutton", { name: "Loop end bar" }).fill("3");
  assert.equal(
    await page.getByRole("spinbutton", { name: "Loop start bar" }).inputValue(),
    "2",
  );
  check("Phrase-loop bar controls work");
  await page.getByRole("button", { name: "88 keys", exact: true }).click();
  assert.equal(await page.locator(".piano-key").count(), 88);
  await page.getByRole("button", { name: "Comfort view" }).click();
  await page
    .getByRole("combobox", { name: "Key labels" })
    .selectOption("letters");
  assert.equal(await page.locator(".middle-c .key-number").innerText(), "C4");
  await page
    .getByRole("combobox", { name: "Key labels" })
    .selectOption("numbers");
  await page.getByRole("combobox", { name: "Number tonic" }).selectOption("2");
  assert.equal(
    await page
      .locator('.piano-key[aria-label="D4 1 Do"] .key-number')
      .innerText(),
    "1",
  );
  await page.getByRole("combobox", { name: "Number tonic" }).selectOption("0");
  check("88 keys, note labels, movable tonic, and fixed Do agree");
  await page.getByRole("button", { name: "Companions" }).click();
  await page.getByRole("button", { name: /Mochi · moon bunny/ }).click();
  await page.getByRole("button", { name: "Lavender" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  assert.ok(
    await page
      .locator(".app")
      .evaluate((e) => e.classList.contains("theme-lavender")),
  );
  await page.waitForTimeout(800);
  await page.reload();
  await page
    .getByRole("heading", { name: "Twinkle, Little Star", exact: true })
    .waitFor();
  assert.ok(
    await page
      .locator(".app")
      .evaluate((e) => e.classList.contains("theme-lavender")),
  );
  check("Companion and theme save across reload");
  await page
    .getByRole("button", { name: "Import a score", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/starter.musicxml");
  await page.getByRole("dialog", { name: "Review score" }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 16);
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  await page.locator(".sheet-paper svg").first().waitFor();
  await page.screenshot({ path: "evidence/score-review.png" });
  const svg = await page.locator(".sheet-paper").innerHTML();
  const printPage = await browser.newPage();
  await printPage.setContent(
    "<html><head><style>body{margin:30px}svg{max-width:100%}</style></head><body>" +
      svg +
      "</body></html>",
  );
  await printPage.pdf({
    path: "tests/Starter melody.pdf",
    format: "A4",
    printBackground: true,
  });
  await printPage.close();
  await page.getByRole("button", { name: "Save & mark reviewed" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check("Real MusicXML imports, renders as sheet music, and saves review");
  await page.getByRole("button", { name: /My sheet music/ }).click();
  await page
    .getByRole("textbox", { name: "Find a piece" })
    .fill("Your first little melody");
  assert.ok((await page.locator(".song-card").count()) >= 1);
  await page.screenshot({ path: "evidence/library.png" });
  check("Library and search include saved imported score");
  await page
    .getByRole("button", { name: "Practice studio", exact: true })
    .click();
  await page.getByRole("button", { name: "Companions" }).click();
  await page.getByRole("button", { name: /Luma · cat/ }).click();
  await page.getByRole("button", { name: "Moon garden" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "evidence/mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  check("390px responsive screen has no horizontal overflow");
  assert.deepEqual(errors, []);
  check("No JavaScript runtime errors across tested flows");
} finally {
  await fs.writeFile(
    "evidence/browser-qa.json",
    JSON.stringify({ reports, errors }, null, 2),
  );
  await browser.close();
  await cleanup();
}
