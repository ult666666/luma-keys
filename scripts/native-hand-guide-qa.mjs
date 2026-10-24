import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { installInputHarness } from "./input-checks.mjs";
import { verifyHandGuide } from "./hand-guide-checks.mjs";

const prefix = process.env.LUMA_EVIDENCE_PREFIX || "native-instructive-2.4";
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
let app, page, version, failure;
const events = [];
const record = (event, detail = {}) => {
  events.push({ at: new Date().toISOString(), event, ...detail });
  if (events.length > 120) events.shift();
};
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
  app.process().on("exit", (code, signal) => record("exit", { code, signal }));
  app
    .process()
    .stderr.on("data", (chunk) =>
      record("stderr", { text: chunk.toString().slice(-2000) }),
    );
  app.on("close", () => record("app-close"));
  page = await app.firstWindow();
  page.on("close", () => record("page-close"));
  page.on("crash", () => record("page-crash"));
  page.on("pageerror", (error) =>
    record("page-error", { message: error.message }),
  );
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) record("navigation", { url: frame.url() });
  });
  await focusOwned();
  // Do not abort Electron's first loadURL while installing instrumentation.
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await installInputHarness(page);
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
  const result = await verifyHandGuide(page, prefix);
  version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native hand guide",
    version,
    result.checks.length,
    "groups",
  );
} catch (error) {
  failure = { message: error.message };
  await page
    ?.screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: false })
    .catch(() => {});
  await fs.writeFile(
    `evidence/${prefix}-failure.json`,
    JSON.stringify(
      { error: error.message, evidence: error.guideEvidence },
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
