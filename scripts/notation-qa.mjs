import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifyNotation } from "./notation-checks.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  const results = await verifyNotation(page);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/notation-qa.json",
    JSON.stringify({ passed: true, ...results, errors }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await page.screenshot({ path: "evidence/notation-failure.png" });
  await fs.writeFile(
    "evidence/notation-failure.json",
    JSON.stringify({ error: String(error), errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await cleanup();
}
