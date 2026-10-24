import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { verifyRecovery } from "./recovery-checks.mjs";

// Browser run against the dev server on an isolated library copy.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyRecovery(page);
  await fs.writeFile(
    "evidence/recovery-qa.json",
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS recovery", result.checks.length, "checks");
} catch (e) {
  await page
    .screenshot({ path: "evidence/recovery-qa-failure.png" })
    .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
