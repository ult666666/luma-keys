import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifyStudioDesign } from "./studio-design-checks.mjs";

const prefix = "studio-2.5";
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
  const result = await verifyStudioDesign(page, prefix);
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS studio design", result.checks.length, "groups");
} catch (error) {
  await page?.waitForTimeout(550).catch(() => {});
  await page
    .screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: false })
    .catch(() => {});
  await fs.writeFile(
    `evidence/${prefix}-failure.json`,
    JSON.stringify(
      { error: error.message, evidence: error.studioEvidence },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await page
    .evaluate(async () => window.lumaFlushPreferences?.())
    .catch(() => {});
  await browser.close();
  await cleanup?.();
}
