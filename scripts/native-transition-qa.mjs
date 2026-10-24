import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const prefix = process.env.LUMA_EVIDENCE_PREFIX || "native-transition-2.4";
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
let app, page;
const errors = [];
const result = { checks: [] };
const focusOwned = () =>
  app.evaluate(({ app, BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      w.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
  });
try {
  app = await electron.launch({
    executablePath: path.resolve(
      "release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys",
    ),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.addInitScript(() => {
    window.__transitionQA = { forceSkip: true, transitions: [], unhandled: [] };
    window.addEventListener("unhandledrejection", (e) => {
      window.__transitionQA.unhandled.push(String(e.reason));
      // Deliberately do not preventDefault or handle transition.ready here.
    });
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (update) => {
      const record = { forced: window.__transitionQA.forceSkip, updates: 0 };
      window.__transitionQA.transitions.push(record);
      const transition = original(() => {
        record.updates++;
        return update();
      });
      if (record.forced) transition.skipTransition();
      return transition;
    };
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await focusOwned();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  page.on("pageerror", (e) => errors.push(e.message));
  const tab = (name) => page.getByRole("tab", { name, exact: true });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await tab("Falling notes").click();
  await expect(tab("Falling notes")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".runway-tall")).toBeVisible();
  await tab("Number score").click();
  await expect(page.locator(".reading-score")).toBeVisible();
  await button("Note runway").click();
  await expect(page.locator('[data-testid="note-roll"]')).toHaveCount(0);
  await button("Note runway").click();
  await expect(page.locator('[data-testid="note-roll"]')).toBeVisible();
  await button("Hide keyboard guide").click();
  await expect(button("Show keyboard guide")).toBeVisible();
  await button("Show keyboard guide").click();
  await expect(button("Hide keyboard guide")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__transitionQA.transitions.filter(
            (t) => t.forced && t.updates === 1,
          ).length,
      ),
    )
    .toBeGreaterThanOrEqual(6);
  result.checks.push(
    "Explicitly skipped view/keyboard/runway transitions still commit every requested layout without unhandled ready rejections",
  );
  await page.evaluate(() => {
    window.__transitionQA.forceSkip = false;
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const click = (name) =>
        // (Since 2.39 the tabs show short words; their names are labels.)
        tabs
          .find(
            (t) =>
              (t.getAttribute("aria-label") || t.textContent.trim()) === name,
          )
          .click();
      click("Sheet music");
      click("Falling notes");
    });
    await expect(tab("Falling notes")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".runway-tall")).toBeVisible();
    await tab("Number score").click();
    await expect(page.locator(".reading-score")).toBeVisible();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__transitionQA.transitions.filter(
            (t) => !t.forced && t.updates === 1,
          ).length,
      ),
    )
    .toBe(9);
  await page.waitForTimeout(200);
  result.trace = await page.evaluate(() => window.__transitionQA);
  assert.deepEqual(result.trace.unhandled, []);
  assert.deepEqual(errors, []);
  assert.ok(result.trace.transitions.every((t) => t.updates === 1));
  result.checks.push(
    "Three immediate Sheet→Falling replacements retain the final requested view, return to Number, and execute each update once without unhandled errors",
  );
  await focusOwned();
  await page.screenshot({ path: `evidence/${prefix}.png` });
  result.version = await app.evaluate(({ app }) => app.getVersion());
  result.passed = true;
  console.log(
    "PASS native transition cancellation",
    result.version,
    result.checks.length,
    "groups",
  );
} catch (e) {
  result.failure = e.message;
  result.errors = errors;
  throw e;
} finally {
  await fs.writeFile(
    `evidence/${prefix}.json`,
    JSON.stringify(result, null, 2),
  );
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
