import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { trackTestData } from "./qa-cleanup.mjs";
import {
  installResumeAudioHarness,
  verifyResumeAudio,
} from "./resume-audio-checks.mjs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage();
let cleanup;
try {
  cleanup = await trackTestData(page);
  await installResumeAudioHarness(page);
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyResumeAudio(page);
  await fs.writeFile(
    "evidence/resume-audio-qa.json",
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS resume audio", result.checks.length);
} catch (error) {
  await page.screenshot({
    path: "evidence/resume-audio-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  await cleanup?.();
}
