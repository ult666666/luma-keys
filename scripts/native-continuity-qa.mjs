import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  installResumeAudioHarness,
  verifyResumeAudio,
} from "./resume-audio-checks.mjs";
import { verifyOverlapMotion } from "./overlap-motion-checks.mjs";
import { verifyChordReading } from "./chord-reading-checks.mjs";
const baseline = process.argv.includes("--baseline");
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-continuity-"));
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
const events = [];
let app, page, child, version, failure, audio, overlap, chords;
let stage = "launch";
const startedAt = Date.now();
const record = (event, details = {}) => {
  events.push({
    at: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    stage,
    event,
    ...details,
  });
  if (events.length > 400) events.shift();
};
const setStage = (next) => {
  stage = next;
  record("stage");
};
const snapshot = () => ({
  startedAt: new Date(startedAt).toISOString(),
  recordedAt: new Date().toISOString(),
  root,
  version,
  stage,
  process: {
    pid: child?.pid,
    exitCode: child?.exitCode,
    signalCode: child?.signalCode,
  },
  page: page ? { closed: page.isClosed(), url: page.url() } : null,
  failure,
  completed: { audio, overlap, chords },
  events,
});
const saveDiagnostics = (
  file = "evidence/native-continuity-diagnostics.json",
) => fs.writeFile(file, JSON.stringify(snapshot(), null, 2));
const focusOwnedWindow = async () => {
  const windows = await app.evaluate(({ app, BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    for (const w of windows) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      w.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
    return windows.map((w) => ({
      id: w.id,
      visible: w.isVisible(),
      focused: w.isFocused(),
      bounds: w.getBounds(),
    }));
  });
  record("owned-window-focused", { windows });
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
  child?.stdout?.on("data", (chunk) =>
    record("process-stdout", { text: chunk.toString().slice(-4000) }),
  );
  child?.stderr?.on("data", (chunk) =>
    record("process-stderr", { text: chunk.toString().slice(-4000) }),
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
  app
    .context()
    .browser()
    ?.on("disconnected", () => record("browser-disconnected"));
  version = await app.evaluate(({ app, BrowserWindow }) => {
    const report = (event, details = {}) =>
      console.log(
        "LUMA_NATIVE_DIAG " +
          JSON.stringify({ at: new Date().toISOString(), event, ...details }),
      );
    app.on("before-quit", (event) =>
      report("before-quit", { prevented: event.defaultPrevented }),
    );
    app.on("will-quit", (event) =>
      report("will-quit", { prevented: event.defaultPrevented }),
    );
    app.on("quit", (_event, code) => report("quit", { code }));
    app.on("child-process-gone", (_event, details) =>
      report("child-process-gone", details),
    );
    process.on("uncaughtExceptionMonitor", (error) =>
      report("main-uncaught-exception", {
        message: error.message,
        stack: error.stack,
      }),
    );
    const attached = new Set();
    const attach = (w) => {
      if (attached.has(w.id)) return;
      attached.add(w.id);
      const id = w.id;
      w.on("close", (event) =>
        report("window-close", { id, prevented: event.defaultPrevented }),
      );
      for (const event of [
        "closed",
        "unresponsive",
        "responsive",
        "focus",
        "blur",
        "show",
        "hide",
        "minimize",
      ])
        w.on(event, () => report("window-" + event, { id }));
      w.webContents.on("render-process-gone", (_event, details) =>
        report("render-process-gone", { id, ...details }),
      );
      w.webContents.on(
        "did-fail-load",
        (_event, code, description, url, mainFrame) =>
          report("did-fail-load", { id, code, description, url, mainFrame }),
      );
      w.webContents.on("destroyed", () =>
        report("web-contents-destroyed", { id }),
      );
    };
    BrowserWindow.getAllWindows().forEach(attach);
    app.on("browser-window-created", (_event, w) => attach(w));
    return app.getVersion();
  });
  setStage("initial-window");
  page = await app.firstWindow();
  page.on("close", () => record("page-close"));
  page.on("crash", () => record("page-crash"));
  page.on("pageerror", (error) =>
    record("page-error", { message: error.message, stack: error.stack }),
  );
  page.on("console", (message) => {
    if (
      ["error", "warning"].includes(message.type()) ||
      message.text().startsWith("LUMA_PAGE_DIAG ")
    )
      record("page-console", {
        type: message.type(),
        text: message.text().slice(-4000),
      });
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      record("main-frame-navigated", { url: frame.url() });
  });
  page.on("requestfailed", (request) =>
    record("request-failed", {
      url: request.url(),
      failure: request.failure(),
    }),
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await focusOwnedWindow();
  await page.addInitScript(() => {
    const report = (event, details = {}) =>
      console.log(
        "LUMA_PAGE_DIAG " +
          JSON.stringify({
            event,
            visibility: document.visibilityState,
            ...details,
          }),
      );
    document.addEventListener("visibilitychange", () =>
      report("visibilitychange"),
    );
    window.addEventListener("pagehide", () => report("pagehide"));
    window.addEventListener("beforeunload", () => report("beforeunload"));
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest?.("button");
        if (button)
          report("click", {
            label: (
              button.getAttribute("aria-label") ||
              button.textContent ||
              ""
            )
              .trim()
              .slice(0, 100),
          });
      },
      true,
    );
  });
  setStage("instrumentation-reload");
  await installResumeAudioHarness(page);
  await page.reload();
  setStage("resume-audio");
  await focusOwnedWindow();
  audio = await verifyResumeAudio(page, "native-resume-audio", baseline);
  record("phase-passed", { checks: audio.checks?.length });
  setStage("overlap-motion");
  if (!baseline) await focusOwnedWindow();
  overlap = baseline
    ? null
    : await verifyOverlapMotion(page, "native-overlap-motion");
  record("phase-passed", { checks: overlap?.checks?.length });
  setStage("chord-reading");
  if (!baseline) await focusOwnedWindow();
  chords = baseline
    ? null
    : await verifyChordReading(page, "native-chord-reading");
  record("phase-passed", { checks: chords?.checks?.length });
  setStage("complete");
  await fs.writeFile(
    `evidence/${baseline ? "resume-audio-baseline" : "native-continuity-qa"}.json`,
    JSON.stringify(
      {
        version,
        ...(baseline ? { baseline: true } : { passed: true }),
        audio,
        overlap,
        chords,
      },
      null,
      2,
    ),
  );
  console.log(
    baseline ? "BASELINE" : "PASS native continuity",
    version,
    audio,
    overlap?.checks,
  );
} catch (error) {
  failure = {
    message: error.message,
    stack: error.stack,
    stage,
    ...(error.overlapEvidence
      ? { overlapEvidence: error.overlapEvidence }
      : {}),
    ...(error.chordEvidence ? { chordEvidence: error.chordEvidence } : {}),
  };
  record("failure", { message: error.message });
  // Persist before any additional page operation or cleanup can obscure the
  // original native process/renderer state. A failed screenshot is diagnostic,
  // never a reason to skip a musical assertion or declare this run successful.
  await saveDiagnostics("evidence/native-continuity-failure.json");
  await page
    ?.screenshot({
      path: "evidence/native-continuity-failure.png",
      fullPage: true,
      timeout: 5000,
    })
    .catch((error) =>
      record("failure-screenshot-error", { message: error.message }),
    );
  await saveDiagnostics("evidence/native-continuity-failure.json");
  throw error;
} finally {
  setStage("cleanup");
  try {
    await app?.close();
    record("owned-app-close-resolved");
    await fs.rm(root, { recursive: true, force: true });
  } catch (error) {
    record("cleanup-error", { message: error.message });
    if (!failure) throw error;
  } finally {
    await saveDiagnostics();
    if (failure)
      await saveDiagnostics("evidence/native-continuity-failure.json");
  }
}
