import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { launchAtMainEntry } from "./qa-main-entry.mjs";

// 2.43: the packaged app when its Library folder cannot be opened (here, a
// file sits where the folder should be). It must explain the problem in
// plain words with Try Again / Quit instead of a stack trace, never touch
// the file, quit cleanly on Quit, and open normally on Try Again once the
// file is moved. Install the dialog answer while main is paused at entry;
// injecting it after launch races startup and can leave a native modal open.
const executablePath =
  process.env.LUMA_APP ||
  path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys");
await fs.mkdir(".qa-runs", { recursive: true });
const checks = [];
const dialogs = {};
const roots = [];
async function scenario(name, answer) {
  const root = await fs.mkdtemp(
    path.resolve(`.qa-runs/library-access-${name}-`),
  );
  roots.push(root);
  const blocker = path.join(root, "Library");
  const capture = path.join(root, "dialog.json");
  await fs.writeFile(blocker, "a file in the way");
  const hook = ({ blocker, capture, answer }) => {
    const { app, dialog } = require("electron");
    const fsm = require("node:fs");
    const shown = [];
    dialog.showMessageBoxSync = (options) => {
      shown.push({
        message: options.message,
        detail: options.detail,
        buttons: options.buttons,
      });
      fsm.writeFileSync(
        capture,
        JSON.stringify({ version: app.getVersion(), shown }),
      );
      if (answer === 0) fsm.renameSync(blocker, blocker + " (moved)");
      return answer;
    };
  };
  let app, browser;
  try {
    app = await launchAtMainEntry(
      executablePath,
      { ...process.env, LUMA_QA_ROOT: root },
      `(${hook.toString()})(${JSON.stringify({ blocker, capture, answer })})`,
    );
    if (answer === 0) {
      browser = await chromium.connectOverCDP(await app.endpoint());
      const context = browser.contexts()[0];
      const page =
        context.pages()[0] ||
        (await context.waitForEvent("page", { timeout: 60000 }));
      await page
        .getByRole("button", { name: "Play", exact: true })
        .waitFor({ timeout: 60000 });
      assert.equal(
        await fs.readFile(blocker + " (moved)", "utf8"),
        "a file in the way",
      );
      assert.ok((await fs.stat(blocker)).isDirectory());
      const health = await page.evaluate(async () =>
        (await fetch("/api/health")).json(),
      );
      assert.equal(health.dataDir, blocker);
      assert.equal(health.writable, true);
    } else {
      const exit = await Promise.race([
        app.exit,
        new Promise((r) => setTimeout(() => r(null), 20000)),
      ]);
      assert.ok(exit, "Quit closes the app");
      assert.equal(exit.code, 0, `clean exit ${JSON.stringify(exit)}`);
      assert.equal(await fs.readFile(blocker, "utf8"), "a file in the way");
    }
    dialogs[name] = JSON.parse(await fs.readFile(capture, "utf8"));
    console.log(
      `Library access ${name}: ${dialogs[name].shown.length} dialog, version ${dialogs[name].version}`,
    );
  } finally {
    await browser?.close().catch(() => {});
    await app?.close();
    if (app) await fs.writeFile(path.join(root, "launch.log"), app.stderr());
  }
  return dialogs[name];
}
try {
  const { shown, version } = await scenario("try-again", 0);
  assert.equal(shown.length, 1, "one explanation before Try Again");
  const [dialog] = shown;
  assert.equal(dialog.message, "Luma Keys can’t open its Library folder");
  assert.deepEqual(dialog.buttons, ["Try Again", "Quit"]);
  assert.match(dialog.detail, /not a folder is in the way/);
  assert.match(dialog.detail, /Nothing has been changed or deleted/);
  assert.ok(!/\n\s+at /.test(dialog.detail), "no stack trace");
  checks.push(
    "A file in place of the Library gets a plain explanation naming the folder, with Try Again and Quit and no stack trace",
    "Try Again after moving the file opens a fresh, writable Library; the file itself is untouched",
  );
  const quit = await scenario("quit", 1);
  assert.equal(quit.version, version);
  assert.equal(quit.shown.length, 1, "one explanation before Quit");
  assert.deepEqual(quit.shown[0].buttons, ["Try Again", "Quit"]);
  checks.push(
    "Quit closes the app cleanly (exit 0) and leaves the file untouched",
  );
  await fs.writeFile(
    "evidence/native-library-access-qa.json",
    JSON.stringify({ passed: true, version, checks, dialog, roots }, null, 2),
  );
  console.log("PASS native library access", version, checks.length, "checks");
} catch (error) {
  await fs.writeFile(
    "evidence/native-library-access-failure.json",
    JSON.stringify(
      { passed: false, error: error.stack, checks, dialogs, roots },
      null,
      2,
    ),
  );
  throw error;
}
