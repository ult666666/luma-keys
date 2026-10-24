import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifyHandBeauty } from "./hand-beauty-checks.mjs";

const prefix = "beauty-2.4";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage({ deviceScaleFactor: 2 });
let cleanup;
try {
  cleanup = await trackTestData(page);
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyHandBeauty(page, prefix);
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log(
    "PASS hand beauty",
    result.checks.length,
    "groups",
    result.measurements.performance,
  );
} catch (error) {
  await page
    .screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: true })
    .catch(() => {});
  await fs.writeFile(
    `evidence/${prefix}-failure.json`,
    JSON.stringify(
      { error: error.message, evidence: error.handEvidence },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await page
    .evaluate(async () => {
      await window.lumaFlushPreferences?.();
    })
    .catch(() => {});
  await browser.close();
  await cleanup?.();
}
