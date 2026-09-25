import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifyRecognitionReload } from "./recognition-checks.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1480, height: 1020 } });
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyRecognitionReload(page);
  await fs.writeFile(
    "evidence/recognition-qa.json",
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS", result.checks);
} catch (e) {
  await page.screenshot({ path: "evidence/recognition-qa-failure.png" });
  throw e;
} finally {
  await browser.close();
  await cleanup();
}
