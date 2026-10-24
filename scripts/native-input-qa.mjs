import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { installInputHarness, verifyInputs } from "./input-checks.mjs";
const prefix = process.env.LUMA_QA_PREFIX || "native-input";
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(`.qa-runs/${prefix}-`));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library", "preferences.json"),
  JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: 0,
    stats: {
      correct: 0,
      minutes: 0,
      sessions: 0,
      dailyMinutes: 0,
      practiceDate: "",
    },
  }),
);
const events = [];
let app, page, child, version, failure;
let stage = "launch";
const record = (event, details = {}) => {
  events.push({ at: new Date().toISOString(), stage, event, ...details });
  if (events.length > 240) events.shift();
};
const focusOwnedWindow = async () => {
  const windows = await app.evaluate(({ app, BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
    return windows.map((window) => ({
      id: window.id,
      visible: window.isVisible(),
      focused: window.isFocused(),
    }));
  });
  record("owned-windows-focused", { windows });
};
try {
  app = await electron.launch({
    executablePath: path.resolve(
      "release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys",
    ),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  child = app.process();
  record("launched", { pid: child?.pid });
  for (const name of ["stdout", "stderr"])
    child?.[name]?.on("data", (chunk) =>
      record(`process-${name}`, { text: chunk.toString().slice(-4000) }),
    );
  child?.on("exit", (code, signal) => record("process-exit", { code, signal }));
  child?.on("error", (error) =>
    record("process-error", { message: error.message }),
  );
  app.on("close", () => record("electron-application-close"));
  app.on("console", (message) =>
    record("main-console", {
      type: message.type(),
      text: message.text().slice(-4000),
    }),
  );
  app.context().on("close", () => record("browser-context-close"));
  version = await app.evaluate(({ app, BrowserWindow }) => {
    const report = (event, details = {}) =>
      console.log("LUMA_INPUT_DIAG " + JSON.stringify({ event, ...details }));
    for (const event of ["before-quit", "will-quit", "quit"])
      app.on(event, () => report(event));
    app.on("child-process-gone", (_event, details) =>
      report("child-process-gone", details),
    );
    process.on("uncaughtExceptionMonitor", (error) =>
      report("uncaught-exception", { message: error.message }),
    );
    const attach = (window) => {
      const id = window.id;
      for (const event of [
        "close",
        "closed",
        "unresponsive",
        "responsive",
        "focus",
        "blur",
      ])
        window.on(event, () => report(`window-${event}`, { id }));
      window.webContents.on("render-process-gone", (_event, details) =>
        report("render-process-gone", { id, ...details }),
      );
      window.webContents.on("did-fail-load", (_event, code, description) =>
        report("did-fail-load", { id, code, description }),
      );
    };
    BrowserWindow.getAllWindows().forEach(attach);
    app.on("browser-window-created", (_event, window) => attach(window));
    return app.getVersion();
  });
  page = await app.firstWindow();
  page.on("close", () => record("page-close"));
  page.on("crash", () => record("page-crash"));
  page.on("pageerror", (error) =>
    record("page-error", { message: error.message }),
  );
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      record("page-console", {
        type: message.type(),
        text: message.text().slice(-2000),
      });
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) record("navigation", { url: frame.url() });
  });
  stage = "startup";
  await focusOwnedWindow();
  // Finish initial navigation before instrumentation reload, so it cannot abort
  // Electron's first loadURL and open its startup-error dialog.
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await installInputHarness(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await focusOwnedWindow();
  stage = "input-checks";
  const result = await verifyInputs(page, prefix);
  stage = "complete";
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native input flows:",
    result.checks.length,
    "checks; version",
    version,
  );
} catch (e) {
  failure = { message: e.message, stack: e.stack };
  record("failure", failure);
  await page
    ?.screenshot({ path: `evidence/${prefix}-qa-failure.png` })
    .catch(() => {});
  throw e;
} finally {
  stage = "owned-cleanup";
  await app
    ?.close()
    .catch((error) =>
      record("cleanup-close-error", { message: error.message }),
    );
  await fs.writeFile(
    `evidence/${prefix}-diagnostics.json`,
    JSON.stringify(
      {
        root,
        version,
        failure,
        stage,
        process: {
          pid: child?.pid,
          exitCode: child?.exitCode,
          signalCode: child?.signalCode,
        },
        page: page ? { closed: page.isClosed(), url: page.url() } : null,
        events,
      },
      null,
      2,
    ),
  );
  await fs.rm(root, { recursive: true, force: true });
}
