import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { verifyConversation } from "./conversation-checks.mjs";
import { installConversationHarness } from "./conversation-checks.mjs";

const prefix = process.env.LUMA_QA_PREFIX || "native-conversation-2.9";
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(`.qa-runs/${prefix}-`));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library/preferences.json"),
  JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: 0,
    stats: { correct: 0, minutes: 0, sessions: 0 },
  }),
);
const legacyBytes = await fs.readFile(
  path.join(root, "Library/preferences.json"),
  "utf8",
);
let app, page, version, failure;
const events = [];
const record = (event, detail = {}) => {
  events.push({ at: new Date().toISOString(), event, ...detail });
  if (events.length > 100) events.shift();
};
const focusOwned = () =>
  app.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
  });
try {
  app = await electron.launch({
    executablePath:
      process.env.LUMA_APP ||
      path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys"),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  app.process().on("exit", (code, signal) => record("exit", { code, signal }));
  app
    .process()
    .stderr.on("data", (chunk) =>
      record("stderr", { text: chunk.toString().slice(-1500) }),
    );
  page = await app.firstWindow();
  page.on("pageerror", (error) =>
    record("page-error", { message: error.message }),
  );
  page.on("crash", () => record("page-crash"));
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(800);
  assert.equal(
    await fs.readFile(path.join(root, "Library/preferences.json"), "utf8"),
    legacyBytes,
    "Hydrating old preferences must not rewrite the file",
  );
  // The legacy file predates reading.colours (its "mint" theme is from before
  // 2.27), so it opens with the calm neutral palette.
  await expect(page.locator(".app")).toHaveClass(/\btheme-neutral\b/);
  await expect(page.locator(".app")).toHaveAttribute(
    "data-companion-style",
    "neutral",
  );
  await installConversationHarness(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await focusOwned();
  const screenshot = page.screenshot.bind(page);
  page.screenshot = async (options) => {
    await focusOwned();
    return screenshot(options);
  };
  await page.waitForTimeout(800);
  assert.equal(
    await fs.readFile(path.join(root, "Library/preferences.json"), "utf8"),
    legacyBytes,
    "Reloading old preferences must not rewrite the file",
  );
  await assert.rejects(
    fs.stat(path.join(root, "Library/companion/conversation.json")),
    { code: "ENOENT" },
  );
  const result = await verifyConversation(page, prefix);
  // Since 2.35 chat is temporary: after a whole story of messages, streams,
  // stops and retries there is still no conversation file in the Library.
  await assert.rejects(
    fs.stat(path.join(root, "Library/companion/conversation.json")),
    { code: "ENOENT" },
  );
  result.checks.unshift(
    "Legacy preferences open with neutral colours and remain byte-for-byte unchanged, and the temporary chat creates no history file before or after a full conversation.",
  );
  version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native conversation",
    version,
    result.checks.length,
    "groups",
  );
} catch (error) {
  await page?.waitForTimeout(550).catch(() => {});
  failure = error.message;
  await page
    ?.screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: false })
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
  await app
    ?.close()
    .catch((error) => record("close-error", { message: error.message }));
  await fs.writeFile(
    `evidence/${prefix}-diagnostics.json`,
    JSON.stringify({ version, failure, events }, null, 2),
  );
  await fs.rm(root, { recursive: true, force: true });
}
