import { trackTestData } from "./qa-cleanup.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const b = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await b.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let checkpoints = [];
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  await page
    .getByRole("button", { name: "Import a score", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "not-a-score.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("no sheet here"),
    });
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /valid PDF/);
  checkpoints.push("Invalid PDF returns actionable error");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("combobox", { name: "Practice hand" })
    .selectOption("left");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "There are no notes for this hand" })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Practice hand" })
    .selectOption("both");
  checkpoints.push("Empty-hand practice cannot silently play");
  await page.getByRole("switch", { name: "Count me in" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("button", { name: "Toggle phrase loop" }).click();
  await page.getByRole("spinbutton", { name: "Loop end bar" }).fill("1");
  await page
    .getByRole("combobox", { name: "Practice speed" })
    .selectOption("1.25");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.waitForTimeout(2700);
  assert.ok(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()) <
      2,
  );
  assert.equal(
    await page.getByRole("button", { name: "Pause", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  checkpoints.push("Bar loop wraps and continues playing");
  await page.locator("h1").click();
  await page.keyboard.down("a");
  await page.waitForTimeout(80);
  assert.equal(await page.locator(".middle-c.pressed").count(), 1);
  await page.keyboard.up("a");
  assert.equal(await page.locator(".middle-c.pressed").count(), 0);
  await page.keyboard.down("a");
  await page.waitForTimeout(60);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.locator(".piano-key.pressed").count(), 0);
  await page.keyboard.up("a");
  checkpoints.push("Note-off and focus loss release held keys");
  await page.getByRole("button", { name: "A little guidance" }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  checkpoints.push("Guide modal supports Escape");
  assert.deepEqual(errors, []);
  console.log(checkpoints.map((c) => "PASS " + c).join("\n"));
  await fs.writeFile(
    "evidence/extended-qa.json",
    JSON.stringify({ passed: true, checkpoints, errors }, null, 2),
  );
} finally {
  await b.close();
  await cleanup();
}
