import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function verifyRecognitionReload(page, prefix = "pdf-lifecycle") {
  const errors = [],
    ids = [],
    checks = [];
  const pageError = (e) => errors.push(e.message);
  page.on("pageerror", pageError);
  const job = (id) =>
    page.evaluate(async (id) => (await fetch("/api/jobs/" + id)).json(), id);
  const upload = async () => {
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/import"),
    );
    await page
      .locator("input[type=file]")
      .setInputFiles("tests/Starter melody.pdf");
    const { jobId } = await (await response).json();
    assert.ok(jobId);
    ids.push(jobId);
    await expect(
      page.getByRole("button", { name: "Cancel recognition", exact: true }),
    ).toBeVisible();
    return jobId;
  };
  try {
    const id = await upload();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "PDF import status" }),
    ).toContainText("Reading Starter melody.pdf");
    await page.reload();
    await expect(
      page.getByRole("status", { name: "PDF import status" }),
    ).toContainText("Reading Starter melody.pdf");
    await page.getByRole("button", { name: "View imports" }).click();
    await page
      .getByRole("button", { name: "Cancel recognition", exact: true })
      .click();
    const card = page.locator(`[data-import-id="${id}"]`);
    await expect(card).toContainText("Cancelled · original kept");
    assert.equal((await job(id)).status, "cancelled");
    assert.equal((await job(id)).scores.length, 0);
    await page.reload();
    await page.getByRole("button", { name: "View imports" }).click();
    await expect(card).toContainText("Cancelled · original kept");
    await page.screenshot({ path: `evidence/${prefix}-cancelled.png` });
    checks.push(
      "Reload rediscovers live recognition; cancel survives reload without invented notes",
    );
    await card.getByRole("button", { name: "Retry recognition" }).click();
    await page
      .getByRole("button", { name: "Cancel recognition", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect
      .poll(async () => (await job(id)).status, {
        timeout: 120000,
        intervals: [500, 1000, 2000],
      })
      .toBe("done");
    await expect(
      page.getByRole("status", { name: "PDF import status" }),
    ).toContainText("Your PDF is ready to review");
    assert.equal(
      await page.getByRole("dialog").count(),
      0,
      "Background completion must not interrupt practice with a modal",
    );
    await page.getByRole("button", { name: "View imports" }).click();
    // (Since the SCR-10 card, a finished import already in the Library
    // offers "Review first" beside "Open at bar 1".)
    await card.getByRole("button", { name: /^Review (first|notes)/ }).click();
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 16);
    assert.deepEqual(
      (await job(id)).scores[0].notes.map((n) => n.midi),
      [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60],
    );
    await page
      .getByRole("button", { name: "Original PDF", exact: true })
      .click();
    await page.locator('canvas[data-ready="true"]').waitFor();
    await page.screenshot({ path: `evidence/${prefix}-retried.png` });
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect.poll(async () => (await job(id)).dismissed).toBe(true);
    checks.push(
      "Retry uses kept original, yields 16 exact pitches, renders original PDF, and completion stays unobtrusive",
    );
    const cancelled = await upload();
    await page
      .getByRole("button", { name: "Cancel recognition", exact: true })
      .click();
    const second = page.locator(`[data-import-id="${cancelled}"]`);
    await expect(second).toContainText("Cancelled · original kept");
    await second.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(second).toHaveCount(0);
    await page.reload();
    assert.equal((await job(cancelled)).dismissed, true);
    assert.equal((await job(cancelled)).hasOriginal, true);
    assert.equal((await job(id)).scores.length, 1);
    checks.push(
      "Dismissing a notice preserves its PDF and completed library music after reload",
    );
    assert.deepEqual(errors, []);
    return { checks, ids, errors };
  } finally {
    for (const id of ids)
      await page
        .evaluate(async (id) => {
          await fetch("/api/jobs/" + id + "/cancel", { method: "POST" });
          await fetch("/api/jobs/" + id + "/dismiss", { method: "POST" });
        }, id)
        .catch(() => {});
    page.off("pageerror", pageError);
  }
}
