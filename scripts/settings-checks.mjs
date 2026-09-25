import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
export async function verifySettings(page, prefix = "settings") {
  const origin = new URL(page.url()).origin;
  const health = await page.evaluate(
    async () => await (await fetch("/api/health")).json(),
  );
  assert.ok(
    health.dataDir.includes("/.qa-runs/"),
    "Settings QA requires an isolated library",
  );
  const file = path.join(health.dataDir, "preferences.json");
  const before = await fs.readFile(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  const checks = [];
  let writes = 0;
  const onRequest = (r) => {
    if (r.url().endsWith("/api/preferences") && r.method() === "PUT") writes++;
  };
  page.on("request", onRequest);
  const seed = async (raw) => {
    await page.goto(origin + "/api/health");
    await fs.writeFile(file, raw);
    writes = 0;
    await page.goto(origin);
    await page
      .getByRole("heading", { name: "A little practice. A little magic." })
      .waitFor();
    await page.waitForTimeout(1000);
    assert.equal(writes, 0, "startup must not save over the source settings");
    assert.equal(await fs.readFile(file, "utf8"), raw);
  };
  const read = async () => JSON.parse(await fs.readFile(file, "utf8"));
  const recover = async (raw) => {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/preferences") && r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save recovered settings" }).click();
    const result = await (await response).json();
    assert.ok(result.ok);
    assert.ok(result.recoveryFile);
    assert.equal(await fs.readFile(result.recoveryFile, "utf8"), raw);
    await page
      .getByRole("status", { name: "Settings recovery" })
      .waitFor({ state: "hidden" });
  };
  try {
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString(
      "en-CA",
    );
    await seed(
      JSON.stringify({
        theme: "lavender",
        pet: "bunny",
        volume: 0,
        stats: {
          correct: 75,
          minutes: 12.5,
          sessions: 4,
          dailyMinutes: 6,
          practiceDate: yesterday,
        },
      }),
    );
    await page.locator(".theme-lavender").waitFor();
    assert.equal(
      await page.getByRole("slider", { name: "Piano volume" }).inputValue(),
      "0",
    );
    await page.getByText("LEVEL 2", { exact: true }).waitFor();
    assert.match(await page.locator(".daily-card p").innerText(), /^0\s/);
    assert.equal(
      await page.getByRole("status", { name: "Settings recovery" }).count(),
      0,
    );
    checks.push(
      "Valid preferences, mute and level persist; stale daily progress resets on screen without rewriting the file",
    );
    const partial = JSON.stringify({
      theme: "rose",
      pet: "bunny",
      volume: { bad: true },
      stats: {
        correct: 75,
        minutes: 12.5,
        sessions: -1,
        dailyMinutes: "4",
        practiceDate: new Date().toLocaleDateString("en-CA"),
      },
    });
    await seed(partial);
    const notice = page.getByRole("status", { name: "Settings recovery" });
    await notice.waitFor();
    await notice.getByText("Settings using defaults").click();
    await notice.getByText("Piano volume", { exact: true }).waitFor();
    await page.locator(".theme-rose").waitFor();
    await page.getByText("LEVEL 2", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("slider", { name: "Piano volume" }).inputValue(),
      "0.65",
    );
    await page.screenshot({
      path: `evidence/${prefix}-partial-recovery.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `evidence/${prefix}-small-recovery.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await recover(partial);
    const recovered = await read();
    assert.equal(recovered.stats.correct, 75);
    assert.equal(recovered.stats.minutes, 12.5);
    assert.equal(recovered.stats.sessions, 0);
    checks.push(
      "Damaged fields use defaults while valid theme, companion and progress survive; the original file is preserved on explicit repair",
    );
    await page.getByRole("button", { name: "Mute", exact: true }).click();
    await page
      .getByRole("button", { name: "Companions & moods", exact: true })
      .click();
    await page.getByRole("button", { name: /Luma · cosmic cat/ }).click();
    await page.getByRole("button", { name: /Lavender/ }).click();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect
      .poll(async () => {
        const p = await read();
        return [p.theme, p.pet, p.volume];
      })
      .toEqual(["lavender", "cat", 0]);
    await page.reload();
    await page.locator(".theme-lavender").waitFor();
    assert.equal(
      await page.getByRole("slider", { name: "Piano volume" }).inputValue(),
      "0",
    );
    await page.getByRole("switch", { name: "Count me in" }).click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () => +document.querySelector('[aria-label="Song position"]').value > 0.2,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect
      .poll(async () => {
        const p = await read();
        return (
          p.stats.sessions === 1 &&
          p.stats.minutes > 12.5 &&
          p.stats.dailyMinutes > 0 &&
          p.stats.correct === 75
        );
      })
      .toBe(true);
    assert.ok(
      !/NaN|\[object Object\]/.test(await page.locator("body").innerText()),
    );
    checks.push(
      "Theme, companion and mute changes save; playback increments numeric session/minute totals after recovery",
    );
    for (const raw of ["null", '{"theme":"lavender","stats":']) {
      await seed(raw);
      await page.getByRole("status", { name: "Settings recovery" }).waitFor();
      await recover(raw);
    }
    checks.push(
      "Null and truncated settings show recovery instead of startup errors or silent data replacement",
    );
    await page.screenshot({
      path: `evidence/${prefix}-recovered-studio.png`,
      fullPage: true,
    });
  } finally {
    page.off("request", onRequest);
    await page.goto(origin + "/api/health");
    if (before) await fs.writeFile(file, before);
    else await fs.rm(file, { force: true });
    await page.goto(origin);
  }
  return checks;
}
