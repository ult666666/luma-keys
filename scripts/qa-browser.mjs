import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { runOwnedCommand, runWorkerTask } from "./qa-lifecycle.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const HELP = `Usage: npm run qa:browser -- [--output-dir NEW_PATH] [--timeout-seconds 1..600]

Build and verify the five sight-reading stories on an owned loopback server.
Uses a disposable library and no optional engines. Node 24, macOS/Linux and
Playwright Chromium are required: npx playwright install chromium --only-shell
Default output: a unique .qa-runs/browser-* directory. Default deadline: 180s.
`;

export function parseArgs(args) {
  const result = { timeoutMs: 180000, help: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (seen.has(option)) throw new Error(`Duplicate option: ${option}`);
    seen.add(option);
    if (option === "--help") result.help = true;
    else if (option === "--output-dir" || option === "--timeout-seconds") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`Missing argument for ${option}`);
      if (option === "--output-dir") result.outputDir = value;
      else {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 600)
          throw new Error(
            "Timeout must be an integer from 1 through 600 seconds",
          );
        result.timeoutMs = Number(value) * 1000;
      }
    } else throw new Error(`Unknown option: ${option}`);
  }
  return result;
}

export async function createOutputDirectory(
  requested,
  { cwd = process.cwd() } = {},
) {
  if (requested === undefined) {
    const root = path.join(cwd, ".qa-runs");
    await fs.mkdir(root, { recursive: true });
    return fs.mkdtemp(path.join(root, "browser-"));
  }
  const destination = path.resolve(cwd, requested);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.mkdir(destination);
  } catch (e) {
    if (e.code === "EEXIST")
      throw new Error(`Output destination already exists: ${destination}`);
    throw e;
  }
  return destination;
}

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise(
      (_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)),
    ),
  ]).finally(() => clearTimeout(timer));
};

export async function runBrowserQa({
  outputDir,
  timeoutMs,
  signal,
  onPhase = () => {},
}) {
  const started = Date.now();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(
    () => controller.abort(new Error("QA work deadline exceeded")),
    timeoutMs,
  );
  const report = {
    schemaVersion: 1,
    status: "failed",
    deadlineSeconds: timeoutMs / 1000,
    phases: [],
    checks: [],
    externalRequests: 0,
    blockedRedirects: 0,
    blockedWebSockets: 0,
    cleanup: {
      workerStopped: true,
      browserClosed: true,
      temporaryDataRemoved: true,
    },
  };
  let temporaryRoot;
  let browserServer;
  let endpoint;
  let buildLog = "";
  let workerLog = "";
  let failure;
  const phase = (name) => {
    report.phases.push(name);
    onPhase(name);
  };
  const cleanText = (text) => {
    let value = String(text);
    if (temporaryRoot)
      value = value.split(temporaryRoot).join("<temporary-library-root>");
    if (endpoint)
      value = value.split(endpoint).join("<owned-browser-endpoint>");
    return value;
  };
  try {
    temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "luma-browser-qa-"),
    );
    report.cleanup.temporaryDataRemoved = false;
    await fs.mkdir(path.join(outputDir, "screenshots"));
    phase("build");
    await runOwnedCommand(
      process.execPath,
      [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build"],
      {
        cwd: ROOT,
        signal: controller.signal,
        onOutput: (chunk) => (buildLog = (buildLog + chunk).slice(-131072)),
      },
    );
    controller.signal.throwIfAborted();
    phase("browser-startup");
    browserServer = await chromium.launchServer({
      headless: true,
      // The controller must finish receipts and owned-library cleanup before
      // exiting. Playwright's default SIGINT handler exits the parent directly.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      timeout: Math.max(1, Math.min(10000, timeoutMs - (Date.now() - started))),
    });
    report.cleanup.browserClosed = false;
    endpoint = browserServer.wsEndpoint();
    controller.signal.throwIfAborted();
    report.cleanup.workerStopped = false;
    try {
      const result = await runWorkerTask(
        new URL("./qa-browser-worker.mjs", import.meta.url),
        {
          temporaryRoot,
          outputDir,
          endpoint,
        },
        {
          signal: controller.signal,
          onOutput: (chunk) => (workerLog = (workerLog + chunk).slice(-131072)),
          onMessage: (message) => {
            if (message?.type === "phase") phase(message.name);
            if (message?.type === "listening") report.ownedPort = message.port;
            if (message?.type === "terminated-by-controller")
              report.workerForced = true;
            if (message?.type === "network-policy") {
              report.externalRequests = message.externalRequests;
              report.blockedRedirects = message.blockedRedirects;
              report.blockedWebSockets = message.blockedWebSockets;
            }
          },
        },
      );
      report.checks = result.checks;
      report.externalRequests = result.externalRequests;
      report.blockedRedirects = result.blockedRedirects;
      report.blockedWebSockets = result.blockedWebSockets;
      if (!Array.isArray(result.checks) || result.checks.length !== 5)
        throw new Error("Expected all five sight-reading checks");
      if (result.externalRequests !== 0)
        throw new Error("Story attempted an external request");
    } catch (e) {
      report.cleanup.workerStopped = e.workerStopped !== false;
      throw e;
    }
    report.cleanup.workerStopped = true;
    controller.signal.throwIfAborted();
  } catch (e) {
    failure = e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    phase("cleanup");
    if (browserServer) {
      try {
        try {
          await within(
            browserServer.close(),
            3000,
            "Browser graceful close timed out",
          );
        } catch {
          report.browserForced = true;
          await within(browserServer.kill(), 3000, "Browser kill timed out");
        }
        report.cleanup.browserClosed = true;
      } catch (e) {
        failure ||= e;
        report.cleanupError = cleanText(e.message);
      }
    }
    if (temporaryRoot && report.cleanup.workerStopped) {
      try {
        await within(
          fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 2 }),
          3000,
          "Temporary data cleanup timed out",
        );
        report.cleanup.temporaryDataRemoved = true;
      } catch (e) {
        failure ||= e;
        report.cleanupError = cleanText(e.message);
      }
    }
  }
  report.elapsedMs = Date.now() - started;
  if (signal?.aborted) failure ||= signal.reason || new Error("QA cancelled");
  report.status =
    !failure && Object.values(report.cleanup).every(Boolean)
      ? "passed"
      : "failed";
  if (failure) report.error = cleanText(failure.message);
  report.screenshots = (
    await fs.readdir(path.join(outputDir, "screenshots")).catch(() => [])
  )
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => `screenshots/${name}`);
  await fs.writeFile(path.join(outputDir, "build.log"), cleanText(buildLog));
  await fs.writeFile(path.join(outputDir, "worker.log"), cleanText(workerLog));
  await fs.writeFile(
    path.join(outputDir, "qa-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}

async function main() {
  let options;
  let outputDir;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) return console.log(HELP);
    if (!["darwin", "linux"].includes(process.platform))
      throw new Error("Browser QA supports macOS and Linux hosts");
    if (Number(process.versions.node.split(".")[0]) < 24)
      throw new Error("Browser QA requires Node 24 or newer");
    outputDir = await createOutputDirectory(options.outputDir);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
    return;
  }
  const controller = new AbortController();
  let interrupted;
  const interrupt = (name) => {
    interrupted ||= name;
    controller.abort(new Error(`QA cancelled by ${name}`));
  };
  const int = () => interrupt("SIGINT");
  const term = () => interrupt("SIGTERM");
  process.on("SIGINT", int);
  process.on("SIGTERM", term);
  try {
    const report = await runBrowserQa({
      ...options,
      outputDir,
      signal: controller.signal,
      onPhase: (name) => console.log(`Browser QA: ${name}`),
    });
    console.log(`Browser QA ${report.status}; evidence: ${outputDir}`);
    if (report.error) console.error(report.error);
    process.exitCode = interrupted
      ? interrupted === "SIGINT"
        ? 130
        : 143
      : report.status === "passed"
        ? 0
        : 1;
  } catch (e) {
    console.error(`Browser QA could not save evidence: ${e.message}`);
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", int);
    process.removeListener("SIGTERM", term);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  await main();
