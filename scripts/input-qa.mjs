import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { installInputHarness, verifyInputs } from "./input-checks.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1480, height: 1020 } });
const cleanup = await trackTestData(page);
try {
  await installInputHarness(page);
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyInputs(page);
  await fs.writeFile(
    "evidence/input-qa.json",
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS", result.checks);
} catch (e) {
  await page.screenshot({ path: "evidence/input-qa-failure.png" });
  throw e;
} finally {
  await browser.close();
  await cleanup();
}
