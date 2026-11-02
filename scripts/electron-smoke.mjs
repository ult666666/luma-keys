// Electron smoke test. Opens the app in Electron with a throwaway library,
// opens Für Elise on the Sheet music tab, plays for four seconds and checks
// that the song position advances, the green sheet cursor follows the notes
// and the window renders audio. CI runs it on Linux under Xvfb, so an
// Electron upgrade is opened, not only installed.
//
//   npm run build && npm run qa:electron
//   LUMA_APP="release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys" npm run qa:electron
//   xvfb-run -a npm run qa:electron -- --output-dir .qa-runs/ci-electron
//
// Without LUMA_APP it launches the unpackaged app (`electron .`), which serves
// the renderer from dist/. Evidence: report.json and playing.png in the output
// folder (default .qa-runs/electron-<time>).
import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sheetCursorOptions } from "../src/sheet-follow.mjs";
import { openFromLibrary } from "./library-open.mjs";
import { ready } from "./settings-ui.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const USAGE = "Usage: npm run qa:electron -- [--output-dir PATH]";
const PLAY_MS = 4000;
const SAMPLE_MS = 250;

function parseArgs(args) {
  let outputDir;
  for (let i = 0; i < args.length; i++) {
    if (
      args[i] === "--output-dir" &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    )
      outputDir = args[++i];
    else throw Error(`Unexpected argument ${args[i]}. ${USAGE}`);
  }
  return {
    outputDir: path.resolve(
      ROOT,
      outputDir ||
        `.qa-runs/electron-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    ),
  };
}

// "#33e02f" at alpha 0.5 becomes [51, 224, 47, 128] in the cursor PNG.
function expectedCursorPixel() {
  const [{ color, alpha }] = sheetCursorOptions();
  const hex = color.replace("#", "");
  return [0, 2, 4]
    .map((i) => parseInt(hex.slice(i, i + 2), 16))
    .concat(Math.round(alpha * 255));
}

const { outputDir } = parseArgs(process.argv.slice(2));
await fs.mkdir(outputDir, { recursive: true });
const qaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "luma-electron-"));
const packaged = process.env.LUMA_APP;
const linuxFlags =
  process.platform === "linux"
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [];
const report = {
  passed: false,
  target: packaged ? "packaged app" : "unpackaged app (electron .)",
  checks: [],
  errors: [],
  consoleErrors: [],
};
const deadline = setTimeout(() => {
  console.error("FAIL: the Electron smoke test passed its 3-minute deadline.");
  process.exit(1);
}, 180000);
deadline.unref();

// A launch failure is recorded like any other, so report.json is always written
// and the throwaway library is removed.
let app, page;
try {
  app = await electron.launch({
    executablePath: packaged
      ? path.resolve(ROOT, packaged)
      : (await import("electron")).default,
    args: packaged ? linuxFlags : [...linuxFlags, ROOT],
    cwd: ROOT,
    env: { ...process.env, LUMA_QA_ROOT: qaRoot },
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(message.text());
  });
  page.setDefaultTimeout(30000);
  report.versions = await app.evaluate(() => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
  }));
  await ready(page);
  const health = await page.evaluate(
    async () => await (await fetch("/api/health")).json(),
  );
  report.app = { version: health.version, omr: health.omr };
  report.checks.push(
    `Luma Keys ${health.version} opens in Electron ${report.versions.electron} and Play is enabled`,
  );

  await openFromLibrary(page, "Für Elise");
  await page.getByRole("tab", { name: "Sheet music", exact: true }).click();
  await expect(page.locator(".sheet-paper")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const cursor = page.locator('.engraved-sheet img[id^="cursorImg"]');
  await expect(cursor).toBeVisible();
  report.checks.push(
    "Für Elise opens from the Library and engraves on the Sheet music tab",
  );

  // OSMD paints the cursor as a PNG from the cursor options. Its middle pixel
  // shows whether the explicit colour and opacity reached the sheet.
  report.cursorPixel = await cursor.evaluate(async (img) => {
    await img.decode().catch(() => {});
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0);
    const { data } = context.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
    );
    return Array.from(data);
  });
  const expected = expectedCursorPixel();
  if (report.cursorPixel.some((value, i) => Math.abs(value - expected[i]) > 3))
    throw Error(
      `The cursor pixel is [${report.cursorPixel}], expected about [${expected}].`,
    );
  report.checks.push(
    `The sheet cursor is ${sheetCursorOptions()[0].color} at alpha ${sheetCursorOptions()[0].alpha}`,
  );

  const slider = page.getByRole("slider", { name: "Song position" });
  const startPosition = Number(await slider.inputValue());
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  report.samples = [];
  for (let t = SAMPLE_MS; t <= PLAY_MS; t += SAMPLE_MS) {
    await page.waitForTimeout(SAMPLE_MS);
    const box = await cursor.boundingBox();
    report.samples.push({
      ms: t,
      position: Number(await slider.inputValue()),
      cursorX: box ? Math.round(box.x) : null,
    });
    if (t === PLAY_MS / 2 + SAMPLE_MS * 2) {
      report.audible = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) =>
          w.webContents.isCurrentlyAudible(),
        ),
      );
      await page.screenshot({ path: path.join(outputDir, "playing.png") });
    }
  }
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const endPosition = report.samples.at(-1).position;
  if (!(endPosition > startPosition + 1))
    throw Error(
      `The song position moved from ${startPosition} to ${endPosition} beats only.`,
    );
  report.checks.push(
    `Playback advances the song position from ${startPosition} to ${endPosition.toFixed(2)} beats in ${PLAY_MS / 1000} s`,
  );
  const xs = report.samples.map((s) => s.cursorX).filter((x) => x !== null);
  const moves = xs.filter((x, i) => i > 0 && x > xs[i - 1]).length;
  if (moves < 4)
    throw Error(
      `The cursor moved right ${moves} times in ${PLAY_MS / 1000} s.`,
    );
  report.checks.push(
    `The cursor follows the notes (${moves} moves to the right)`,
  );
  if (!report.audible)
    throw Error("The window rendered no audio during playback.");
  report.checks.push("The window renders audio during playback");
  if (report.errors.length)
    throw Error(`Uncaught page errors: ${report.errors.join(" | ")}`);
  report.checks.push("No uncaught page errors");
  report.passed = true;
} catch (error) {
  report.failure = error.message;
  if (page)
    await page
      .screenshot({ path: path.join(outputDir, "failure.png") })
      .catch(() => {});
} finally {
  await fs.writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (app) {
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
    try {
      app.process().kill("SIGKILL");
    } catch {}
  }
  await fs.rm(qaRoot, { recursive: true, force: true });
}
for (const check of report.checks) console.log(`  ok  ${check}`);
if (!report.passed) {
  console.error(`FAIL: ${report.failure}`);
  console.error(`Evidence: ${outputDir}`);
  process.exit(1);
}
console.log(`PASS: Electron smoke test. Evidence: ${outputDir}`);
process.exit(0);
