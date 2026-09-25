import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { demos } from "../src/music.mjs";
export async function verifyBackups(page, prefix = "backup") {
  const checks = [];
  const health = await page.evaluate(
    async () => await (await fetch("/api/health")).json(),
  );
  assert.ok(
    health.dataDir.includes("/.qa-runs/"),
    "Recovery QA may only write to its isolated library",
  );
  const upload = async (name, score) => {
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/import"),
    );
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(score)),
      });
    return response;
  };
  // A real previous failure: these files passed import and blanked the review UI.
  const legacy = {
    title: "Recovered starlight",
    composer: "Your music",
    bpm: 90,
    meter: 4,
    notes: [
      { id: "same", midi: 64, beat: 4, duration: 1, hand: "right" },
      { id: "same", midi: 60, beat: 0, duration: 1, hand: "right" },
      { midi: 48, beat: 0, duration: 2, hand: "left" },
    ],
  };
  const response = await upload("older-practice.json", legacy);
  assert.equal(response.status(), 200);
  const { score } = await response.json();
  await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 3);
  await page
    .getByText(/Missing or shortened timing metadata was restored/)
    .waitFor();
  assert.deepEqual(
    await page
      .locator('select[aria-label^="Pitch"]')
      .evaluateAll((es) => es.map((e) => +e.value)),
    [48, 60, 64],
  );
  await page.locator('select[aria-label^="Pitch"]').nth(1).selectOption("62");
  await page.getByRole("button", { name: "Save & mark reviewed" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Review sheet and notes" }).click();
  assert.deepEqual(
    await page
      .locator('select[aria-label^="Pitch"]')
      .evaluateAll((es) => es.map((e) => +e.value)),
    [48, 62, 64],
  );
  await page.screenshot({ path: `evidence/${prefix}-restored-review.png` });
  await page.getByRole("button", { name: "Close dialog" }).click();
  checks.push(
    "Older backup imports, sorts chords, restores timing and supports independent note editing",
  );
  const exported = page.waitForResponse((r) => r.url().endsWith("/api/export"));
  await page.getByRole("button", { name: "Export practice notes" }).click();
  const out = await (await exported).json();
  const backup = JSON.parse(await fs.readFile(out.backup, "utf8"));
  assert.deepEqual(
    backup.notes.map((n) => n.midi),
    [48, 62, 64],
  );
  assert.equal(backup.duration, 5);
  checks.push("Restored backup exports corrected notes and total duration");
  const bad = await upload("damaged-practice.json", {
    ...legacy,
    notes: [null],
  });
  assert.equal(bad.status(), 400);
  await page.getByText(/Note 1 has an invalid pitch/).waitFor();
  await page.screenshot({ path: `evidence/${prefix}-invalid-import.png` });
  await page.getByRole("button", { name: "Close dialog" }).click();
  assert.equal(
    await page
      .getByRole("heading", { name: "Recovered starlight", exact: true })
      .count(),
    1,
  );
  checks.push(
    "Invalid note import shows an actionable error and retains the current piece",
  );
  const files = new Map([
    [
      "qa-broken-date.json",
      JSON.stringify({
        ...demos()[0],
        id: "qa-broken-date",
        createdAt: { bad: true },
      }),
    ],
    ["qa-truncated.json", '{"notes":'],
  ]);
  try {
    for (const [name, content] of files)
      await fs.writeFile(path.join(health.dataDir, name), content, {
        flag: "wx",
      });
    await page.reload();
    const recovery = page.getByRole("status", { name: "Library recovery" });
    await recovery.waitFor();
    await recovery.getByText("Show affected files").click();
    await recovery.getByText("qa-broken-date.json", { exact: true }).waitFor();
    await recovery.getByText("qa-truncated.json", { exact: true }).waitFor();
    await page.getByRole("button", { name: /My sheet music/ }).click();
    await page
      .getByRole("heading", { name: "Recovered starlight", exact: true })
      .waitFor();
    await page.screenshot({
      path: `evidence/${prefix}-recovery-library.png`,
      fullPage: true,
    });
    for (const [name, content] of files)
      assert.equal(
        await fs.readFile(path.join(health.dataDir, name), "utf8"),
        content,
      );
    checks.push(
      "Damaged files stay byte-for-byte intact; healthy library scores remain available",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Recovery banner fits mobile width",
    );
    await page.screenshot({
      path: `evidence/${prefix}-recovery-small.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const repaired = {
      ...demos()[0],
      id: "qa-broken-date",
      title: "Repaired moonlight",
    };
    await fs.writeFile(
      path.join(health.dataDir, "qa-broken-date.json"),
      JSON.stringify(repaired),
    );
    await fs.rm(path.join(health.dataDir, "qa-truncated.json"));
    await recovery.getByRole("button", { name: "Check library again" }).click();
    await recovery.waitFor({ state: "hidden" });
    await page
      .getByRole("heading", { name: "Repaired moonlight", exact: true })
      .waitFor();
    checks.push(
      "Repair and retry clears the notice and restores the score without relaunching",
    );
  } finally {
    for (const name of files.keys())
      await fs.rm(path.join(health.dataDir, name), { force: true });
  }
  await page
    .getByRole("button", { name: "Practice studio", exact: true })
    .click();
  return checks;
}
