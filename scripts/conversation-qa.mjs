import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { trackTestData } from "./qa-cleanup.mjs";
import {
  verifyConversation,
  installConversationHarness,
} from "./conversation-checks.mjs";

const prefix = "conversation-2.9";
const health = await (await fetch("http://127.0.0.1:5189/api/health")).json();
if (!health.dataDir.includes("/.qa-runs/"))
  throw Error("Conversation QA requires an isolated library");
const conversationFile = path.join(
  health.dataDir,
  "companion/conversation.json",
);
const beforeHistory = await fs.readFile(conversationFile).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage({ deviceScaleFactor: 2 });
let cleanup;
const events = [];
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame())
    events.push({ at: Date.now(), type: "navigation", url: frame.url() });
});
page.on("console", (message) => {
  if (message.text().includes("[vite]") || message.type() === "error")
    events.push({
      at: Date.now(),
      type: message.type(),
      text: message.text().slice(0, 500),
    });
});
try {
  cleanup = await trackTestData(page);
  await installConversationHarness(page);
  await page.goto("http://127.0.0.1:5188");
  const result = await verifyConversation(page, prefix);
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log("PASS conversation", result.checks.length, "groups");
} catch (error) {
  await page
    .screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: false })
    .catch(() => {});
  await fs.writeFile(
    `evidence/${prefix}-failure.json`,
    JSON.stringify(
      { error: error.message, evidence: error.conversationEvidence },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await page.unrouteAll({ behavior: "wait" });
  await page
    .evaluate(async () => window.lumaFlushPreferences?.())
    .catch(() => {});
  await browser.close();
  await fs.writeFile(
    `evidence/${prefix}-diagnostics.json`,
    JSON.stringify(events, null, 2),
  );
  await cleanup?.();
  // Restore only this isolated session's conversation file, preserving original bytes.
  if (beforeHistory) await fs.writeFile(conversationFile, beforeHistory);
  else await fs.rm(conversationFile, { force: true });
}
