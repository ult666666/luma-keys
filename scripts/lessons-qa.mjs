import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifyElise } from "./lesson-checks.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  const checks = await verifyElise(page);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/export") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Export practice notes" }).click();
  const exported = await (await response).json();
  const s = JSON.parse(await fs.readFile(exported.backup, "utf8"));
  assert.equal(s.notes.length, 53);
  assert.equal(s.pickup, 0.5);
  assert.equal(s.measureLengths.at(-1), 1);
  assert.equal(s.notes.filter((n) => n.hand === "left").length, 18);
  checks.push(
    "Numbered export and JSON keep all 53 notes, hands, pickup and final bar",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/lessons-qa.json",
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log(checks.map((c) => "PASS " + c).join("\n"));
} finally {
  await browser.close();
  await cleanup();
}
