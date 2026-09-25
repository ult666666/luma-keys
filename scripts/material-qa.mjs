import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifyMaterials } from "./material-checks.mjs";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage();
let cleanup;
try {
  cleanup = await trackTestData(page);
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyMaterials(page);
  await fs.writeFile(
    "evidence/material-qa.json",
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS", result.checks);
} catch (error) {
  await page
    .screenshot({ path: "evidence/material-failure.png", fullPage: true })
    .catch(() => {});
  await fs.writeFile(
    "evidence/material-failure.json",
    JSON.stringify(
      {
        error: error.message,
        body: await page
          .locator("body")
          .innerText()
          .catch(() => "unavailable"),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await cleanup?.();
}
