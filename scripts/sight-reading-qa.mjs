import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifySightReading } from "./sight-reading-checks.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  const result = await verifySightReading(page);
  await fs.writeFile(
    "evidence/sight-reading-qa.json",
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS", result.checks);
} catch (e) {
  await page.screenshot({
    path: "evidence/sight-reading-failure.png",
    fullPage: true,
  });
  await fs.writeFile(
    "evidence/sight-reading-failure.json",
    JSON.stringify(
      { error: e.message, body: await page.locator("body").innerText() },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
  await cleanup();
}
