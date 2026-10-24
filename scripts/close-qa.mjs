import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { setPianoVolume, pianoVolume } from "./piano-volume.mjs";
const executable =
  process.env.LUMA_APP ||
  path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys");
await fs.mkdir(".qa-runs", { recursive: true });
const results = [];
for (const mode of ["quit", "window-close", "failed-save"]) {
  const root = await fs.mkdtemp(path.resolve(".qa-runs/close-"));
  const folder = path.join(root, "Library");
  await fs.mkdir(folder);
  const file = path.join(folder, "preferences.json");
  // The normal-close cases change the visible volume to zero immediately before
  // exit. Mute the test webContents independently so this remains silent.
  const initialVolume = mode === "failed-save" ? 0 : 0.2;
  const initial = JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: initialVolume,
    stats: {
      correct: 0,
      minutes: 0,
      sessions: 0,
      dailyMinutes: 0,
      practiceDate: new Date().toLocaleDateString("en-CA"),
    },
  });
  await fs.writeFile(file, initial);
  let app,
    closed = false;
  try {
    app = await electron.launch({
      executablePath: executable,
      env: { ...process.env, LUMA_QA_ROOT: root },
    });
    app.on("close", () => (closed = true));
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setAudioMuted(true);
    });
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.isAudioMuted(),
      ),
      true,
    );
    const play = page.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeEnabled();
    assert.equal(await pianoVolume(page), String(initialVolume));
    if (mode === "failed-save") {
      await app.evaluate(({ dialog, app }) => {
        dialog.showMessageBox = async (...args) => {
          app.qaSaveWarning = args.at(-1);
          return { response: 0 };
        };
      });
      await fs.rm(file);
      await fs.mkdir(file);
    }
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    if (mode !== "failed-save")
      await page.getByRole("switch", { name: "Count me in" }).click();
    // (Since 2.27 the palettes are a Colours group in Reading settings.)
    await page
      .getByRole("group", { name: "Colours", exact: true })
      .getByRole("button", { name: /Rose/ })
      .click();
    if (mode !== "failed-save") {
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await play.click();
      await page.waitForFunction(
        () =>
          +document.querySelector('[aria-label="Song position"]').value > 0.8,
      );
      await expect(
        page.getByRole("button", { name: "Pause", exact: true }),
      ).toBeVisible();
      assert.equal(JSON.parse(await fs.readFile(file, "utf8")).volume, 0.2);
      // No Settings modal here: the transport remains active until exit, and
      // the close handler must flush this newly changed visible preference.
      await setPianoVolume(page, "0");
    }
    const requestClose = () =>
      app.evaluate(({ app, BrowserWindow }, mode) => {
        setTimeout(() => {
          if (mode === "window-close") BrowserWindow.getAllWindows()[0].close();
          else app.quit();
        }, 0);
      }, mode);
    if (mode === "failed-save") {
      await requestClose();
      await expect
        .poll(() => app.evaluate(({ app }) => app.qaSaveWarning?.message || ""))
        .toMatch(/could not be saved/);
      assert.equal(closed, false);
      assert.ok((await fs.stat(file)).isDirectory());
      const prompt = await app.evaluate(({ app }) => app.qaSaveWarning);
      assert.deepEqual(prompt.buttons, ["Keep open", "Close without saving"]);
      await page.screenshot({
        path: "evidence/close-save-failure-kept-open.png",
      });
      await fs.rmdir(file);
      await fs.writeFile(file, initial);
      const ended = app.waitForEvent("close", { timeout: 10000 });
      await requestClose();
      await ended;
      const saved = JSON.parse(await fs.readFile(file, "utf8"));
      assert.equal(saved.theme, "rose");
      results.push({
        mode,
        passed: true,
        check:
          "A failed save offers a choice; Keep open preserves the window and retry after repair saves the pending theme",
        dialogSelection: "Simulated Keep open in isolated test instance",
      });
    } else {
      const began = performance.now();
      const ended = app.waitForEvent("close", { timeout: 10000 });
      await requestClose();
      await ended;
      const saved = JSON.parse(await fs.readFile(file, "utf8"));
      assert.equal(saved.theme, "rose");
      assert.equal(saved.volume, 0);
      assert.equal(saved.stats.sessions, 1);
      assert.ok(
        saved.stats.minutes > 0 && saved.stats.dailyMinutes > 0,
        "Active practice time must be recorded before exit",
      );
      results.push({
        mode,
        passed: true,
        closeMs: performance.now() - began,
        saved,
        check:
          "Immediate exit flushes the latest visible volume change, selected theme and active session minutes",
        audioOutput:
          "Muted through the isolated test webContents before playback",
      });
    }
    assert.deepEqual(errors, []);
  } catch (e) {
    await fs.writeFile(
      "evidence/close-qa-failure.json",
      JSON.stringify({ mode, error: e.message, completed: results }, null, 2),
    );
    throw e;
  } finally {
    // This is only the unique test instance; never act on the personal app.
    if (app && !closed) {
      const gone = app
        .waitForEvent("close", { timeout: 10000 })
        .catch(() => {});
      await app.evaluate(({ app }) => app.exit()).catch(() => {});
      await gone;
    }
    // (Retried, and never allowed to replace the story's own result: an app
    // still flushing its cache must not turn a real failure into ENOTEMPTY.)
    await fs
      .rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      })
      .catch((error) => console.warn("cleanup:", error.message));
  }
}
await fs.writeFile(
  "evidence/close-qa.json",
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log(results);
