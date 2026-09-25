import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { verifySettings } from "./settings-checks.mjs";
import { verifySettingsStartup } from "./settings-startup-checks.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5188");
  const checks = [
    ...(await verifySettings(page)),
    ...(await verifySettingsStartup(page)),
  ];
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/settings-qa.json",
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log(checks);
} catch (e) {
  await page.screenshot({ path: "evidence/settings-qa-failure.png" });
  await fs.writeFile(
    "evidence/settings-qa-failure.json",
    JSON.stringify({ error: e.message, errors }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
