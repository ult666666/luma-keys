import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { trackTestData } from "./qa-cleanup.mjs";
import { verifyBacking, installBackingHarness } from "./backing-checks.mjs";

const prefix = "backing-2.8";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage({ deviceScaleFactor: 2 });
let cleanup, assetDirectory;
const ownedAssets = new Set();
const collect = async (response) => {
  if (
    new URL(response.url()).pathname !== "/api/backing-assets" ||
    response.request().method() !== "POST"
  )
    return;
  const result = await response.json().catch(() => null);
  if (/^[0-9a-f-]{36}$/.test(result?.id)) ownedAssets.add(result.id);
};
try {
  cleanup = await trackTestData(page);
  const health = await (await fetch("http://127.0.0.1:5189/api/health")).json();
  if (!health.dataDir.includes("/.qa-runs/"))
    throw Error("Backing QA requires an isolated library");
  assetDirectory = path.join(health.dataDir, "accompaniment");
  page.on("response", collect);
  await installBackingHarness(page);
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyBacking(page, prefix);
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS accompaniment", result.checks.length, "groups");
} catch (error) {
  await page.waitForTimeout(550).catch(() => {});
  await page
    .screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: false })
    .catch(() => {});
  await fs.writeFile(
    `evidence/${prefix}-failure.json`,
    JSON.stringify(
      { error: error.message, evidence: error.backingEvidence },
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
  // Only this page's uploaded UUIDs, inside the explicitly isolated library.
  for (const id of ownedAssets) {
    const metadataPath = path.join(assetDirectory, `${id}.json`);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    if (
      metadata.id !== id ||
      ![".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(metadata.extension)
    )
      throw Error("Unexpected owned asset metadata");
    await fs.rm(path.join(assetDirectory, `${id}${metadata.extension}`), {
      force: true,
    });
    await fs.rm(metadataPath, { force: true });
  }
}
