import assert from "node:assert/strict";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { chromium } from "@playwright/test";
import { startServer } from "../server.mjs";
import { verifySightReading } from "./sight-reading-checks.mjs";
import { installLocalOnlyRoutes } from "./qa-browser-network.mjs";

const { temporaryRoot, outputDir, endpoint } = workerData;
const missing = (name) => path.join(temporaryRoot, "absent-engines", name);
const phase = (name) => parentPort.postMessage({ type: "phase", name });
let api;
let browser;
try {
  phase("server-startup");
  const dataDir = path.join(temporaryRoot, "Library");
  api = await startServer({
    port: 0,
    dataDir,
    logDir: path.join(temporaryRoot, "Logs"),
    engine: missing("Audiveris"),
    tessdata: missing("tessdata"),
    companionHelper: missing("companion-model"),
    companionEngineDir: missing("companion-llm"),
    companionRuntime: missing("companion-runtime.mjs"),
  });
  parentPort.postMessage({ type: "listening", port: api.port });
  const origin = `http://127.0.0.1:${api.port}`;
  const healthResponse = await fetch(`${origin}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(path.resolve(health.dataDir), dataDir);
  browser = await chromium.connect(endpoint);
  const context = await browser.newContext({
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const policy = await installLocalOnlyRoutes(context, origin, (state) =>
    parentPort.postMessage({ type: "network-policy", ...state }),
  );
  const page = await context.newPage();
  const pending = new Set();
  page.on("request", (request) => pending.add(request));
  page.on("requestfinished", (request) => pending.delete(request));
  page.on("requestfailed", (request) => pending.delete(request));
  phase("navigation");
  try {
    // Startup can leave a best-effort diagnostics request pending. The story
    // waits for the actual Play control, not an unrelated network-idle state.
    await page.goto(origin, { waitUntil: "load" });
  } catch (e) {
    console.error(
      "Pending navigation requests:",
      [...pending].map((request) => new URL(request.url()).pathname),
    );
    await page
      .screenshot({
        path: path.join(outputDir, "screenshots", "navigation-failure.png"),
        timeout: 3000,
      })
      .catch(() => {});
    throw e;
  }
  phase("sight-reading");
  const result = await verifySightReading(page, "browser", {
    evidenceDir: path.join(outputDir, "screenshots"),
  });
  assert.deepEqual(
    policy,
    { externalRequests: 0, blockedRedirects: 0, blockedWebSockets: 0 },
    "Only direct owned-origin requests",
  );
  await context.close();
  await browser.close();
  browser = undefined;
  await api.shutdown();
  api.server.closeAllConnections();
  await new Promise((resolve, reject) =>
    api.server.close((e) => (e ? reject(e) : resolve())),
  );
  api = undefined;
  parentPort.postMessage({
    type: "result",
    value: { ...result, ...policy },
  });
} finally {
  if (browser) await browser.close();
  if (api) {
    await api.shutdown();
    api.server.closeAllConnections();
    await new Promise((resolve) => api.server.close(resolve));
  }
  parentPort.close();
}
