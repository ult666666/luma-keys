import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyKeyboardStage } from "./keyboard-stage-checks.mjs";
const prefix = "native-keyboard-stage-2.4";
// The keyboard stage story in the packaged app, with its own muted library.
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-keyboard-stage-"));
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
const app = await electron.launch({
  executablePath: path.resolve(
    "release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys",
  ),
  env: { ...process.env, LUMA_QA_ROOT: root },
});
let page;
const events = [];
const record = (event, details = {}) => {
  events.push({ at: new Date().toISOString(), event, ...details });
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
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await focusOwned();
  const traceVisibility = () => {
    window.__stageVisibility = [];
    window.__stageKeys = [];
    const record = (event) =>
      window.__stageVisibility.push({
        t: performance.now(),
        event,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
      });
    for (const event of ["focus", "blur", "visibilitychange"])
      window.addEventListener(event, () => record(event), true);
    for (const type of ["keydown", "keyup"])
      window.addEventListener(
        type,
        (e) => {
          if (e.code !== "KeyA") return;
          const entry = {
            t: performance.now(),
            type,
            key: e.key,
            code: e.code,
            clock: window.lumaClock?.(),
            focused: document.hasFocus(),
          };
          window.__stageKeys.push(entry);
          if (window.__stageKeys.length > 80) window.__stageKeys.shift();
          setTimeout(() => {
            entry.flashes = [
              ...document.querySelectorAll(
                '.piano-key[data-midi="60"] .key-flash',
              ),
            ].map((n) => n.dataset.kind);
          }, 0);
        },
        true,
      );
    record("installed");
  };
  await page.addInitScript(traceVisibility);
  await page.evaluate(traceVisibility);
  const reload = page.reload.bind(page);
  page.reload = async (options) => {
    const response = await reload(options);
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await focusOwned();
    record("refocused-after-reload");
    return response;
  };
  const screenshot = page.screenshot.bind(page);
  page.screenshot = async (options) => {
    await focusOwned();
    return screenshot(options);
  };
  const sampleState = async () => ({
    page: await page.evaluate(() => ({
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      now: performance.now(),
    })),
    native: await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({
        visible: w.isVisible(),
        focused: w.isFocused(),
        minimized: w.isMinimized(),
      })),
    ),
  });
  const result = await verifyKeyboardStage(page, prefix, {
    beforeMotionSample: async (name) => {
      record("motion-before-focus", { name, state: await sampleState() });
      await focusOwned();
      record("motion-ready", { name, state: await sampleState() });
    },
    afterMotionSample: async (name) =>
      record("motion-after", { name, state: await sampleState() }),
  });
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native keyboard stage",
    version,
    result.checks.length,
    "checks",
  );
} catch (e) {
  record("failure", { message: e.message });
  await fs.writeFile(
    `evidence/${prefix}-failure.json`,
    JSON.stringify({ error: e.message }, null, 2),
  );
  await page
    ?.screenshot({
      path: `evidence/${prefix}-failure.png`,
      fullPage: true,
    })
    .catch(() => {});
  throw e;
} finally {
  const visibility = await page
    ?.evaluate(() => ({
      state: document.visibilityState,
      focused: document.hasFocus(),
      events: window.__stageVisibility,
      keys: window.__stageKeys,
    }))
    .catch(() => null);
  const native = await app
    .evaluate(({ app, BrowserWindow }) => ({
      version: app.getVersion(),
      windows: BrowserWindow.getAllWindows().map((w) => ({
        visible: w.isVisible(),
        focused: w.isFocused(),
        minimized: w.isMinimized(),
      })),
    }))
    .catch(() => null);
  await fs.writeFile(
    `evidence/${prefix}-diagnostics.json`,
    JSON.stringify({ events, visibility, native }, null, 2),
  );
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
