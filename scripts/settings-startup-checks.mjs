import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
export async function verifySettingsStartup(page, prefix = "settings-startup") {
  const origin = new URL(page.url()).origin;
  const health = await page.evaluate(
    async () => await (await fetch("/api/health")).json(),
  );
  assert.ok(health.dataDir.includes("/.qa-runs/"));
  const file = path.join(health.dataDir, "preferences.json");
  const before = await fs.readFile(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  const raw = JSON.stringify({
    theme: "lavender",
    pet: "bunny",
    volume: 0,
    stats: { correct: 75, minutes: 12.5, sessions: 4 },
  });
  const checks = [];
  let release;
  try {
    await page.goto(origin + "/api/health");
    await fs.rm(file, { force: true });
    await fs.mkdir(file);
    await page.goto(origin);
    const notice = page.getByRole("status", { name: "Settings unavailable" });
    await notice.waitFor();
    await page.waitForTimeout(5200);
    await expect(notice).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: `evidence/${prefix}-unreadable.png`,
      fullPage: true,
    });
    assert.ok(
      (await fs.stat(file)).isDirectory(),
      "unreadable settings are never overwritten",
    );
    await fs.rmdir(file);
    await fs.writeFile(file, raw);
    await notice.getByRole("button", { name: "Reload saved settings" }).click();
    await notice.waitFor({ state: "hidden" });
    await page.locator(".theme-lavender").waitFor();
    assert.equal(
      await page.getByRole("slider", { name: "Piano volume" }).inputValue(),
      "0",
    );
    checks.push(
      "An unreadable settings file leaves a lasting warning; restore and reload resumes saved settings without relaunching",
    );
    await page.goto(origin + "/api/health");
    let seen;
    const requestSeen = new Promise((r) => (seen = r));
    const gate = new Promise((r) => (release = r));
    await page.route("**/api/settings", async (route) => {
      seen();
      await gate;
      await route.continue();
    });
    await page.goto(origin);
    await requestSeen;
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("slider", { name: "Piano volume" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Mute", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Companions & moods", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Rose nebula", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /Luma · cosmic cat/ }),
    ).toBeDisabled();
    await page.screenshot({ path: `evidence/${prefix}-loading.png` });
    release();
    await page.locator(".theme-lavender").waitFor();
    await expect(
      page.getByRole("button", { name: "Rose nebula", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    await page.unroute("**/api/settings");
    assert.equal(await fs.readFile(file, "utf8"), raw);
    checks.push(
      "Delayed loading disables practice and preference edits until the saved state is ready, preventing overwritten early changes",
    );
  } finally {
    release?.();
    await page.unroute("**/api/settings");
    await page.goto(origin + "/api/health");
    if ((await fs.stat(file).catch(() => null))?.isDirectory())
      await fs.rmdir(file);
    if (before) await fs.writeFile(file, before);
    else await fs.rm(file, { force: true });
    await page.goto(origin);
  }
  return checks;
}
