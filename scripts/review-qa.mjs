import { trackTestData } from "./qa-cleanup.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const cleanup = await trackTestData(p);
try {
  await p.goto("http://127.0.0.1:5188");
  await p.getByRole("button", { name: "Import a score", exact: true }).click();
  await p.locator("input[type=file]").setInputFiles("tests/starter.musicxml");
  await p.getByRole("dialog", { name: "Make the music yours" }).waitFor();
  await p.getByRole("button", { name: "Add a missing note" }).click();
  assert.equal(await p.locator("tbody tr").count(), 17);
  const pitch = p.locator('select[aria-label^="Pitch"]').last();
  await pitch.selectOption("72");
  const time = p.locator('input[aria-label^="Beat"]').last();
  await time.fill("16");
  await p.locator('button[aria-label^="Remove note"]').first().click();
  assert.equal(await p.locator("tbody tr").count(), 16);
  await p.getByRole("button", { name: "Save & mark reviewed" }).click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "Review sheet and notes" }).click();
  assert.equal(
    await p.locator('select[aria-label^="Pitch"]').last().inputValue(),
    "72",
  );
  await p.getByRole("button", { name: "Sheet music", exact: true }).click();
  await p.getByText("This is the original recognized notation.").waitFor();
  await p.getByRole("button", { name: "Close dialog" }).click();
  await p.getByRole("button", { name: "Export practice notes" }).click();
  await p
    .getByRole("status")
    .filter({ hasText: "Saved a printable number sheet" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS adding, removing, editing, persisting, and exporting recognized notes",
  );
  await fs.writeFile(
    "evidence/review-qa.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "Add missing note",
          "Remove incorrect note",
          "Edit pitch and beat",
          "Persist review changes",
          "Original notation warning after edits",
          "Export corrected numbered sheet",
        ],
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await b.close();
  await cleanup();
}
