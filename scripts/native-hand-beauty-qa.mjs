import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyHandBeauty } from "./hand-beauty-checks.mjs";

const prefix = "native-beauty-2.4";
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-beauty-2.4-"));
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
let app, page;
const focusOwned = async () =>
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
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled({ timeout: 45000 });
  await focusOwned();
  // Evidence capture needs a visible owned native surface. This hook does not
  // run within the rAF samples or change their assertions.
  const screenshot = page.screenshot.bind(page);
  page.screenshot = async (options) => {
    await focusOwned();
    return screenshot(options);
  };
  const result = await verifyHandBeauty(page, prefix);
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native hand beauty",
    version,
    result.checks.length,
    "groups",
    result.measurements.performance,
  );
} catch (error) {
  await page
    ?.screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: true })
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
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
