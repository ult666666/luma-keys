import assert from "node:assert/strict";
import { openReview } from "./practice-tools.mjs";
import { openFromLibrary } from "./library-open.mjs";
import { inReadingSettings } from "./settings-ui.mjs";

export async function verifyElise(page, evidencePrefix = "lessons") {
  // (Since 2.39 the lessons are starter pieces in the Library, and the meter
  // hint and a piece's tips sit in Settings.)
  await openFromLibrary(page, "Für Elise · opening");
  await inReadingSettings(page, async (dialog) => {
    assert.match(
      await dialog.locator(".meter-hint").innerText(),
      /^3\/8 · 3 pulses per bar/,
    );
    await dialog.getByText("Tips for this piece", { exact: true }).click();
    assert.equal(await dialog.locator(".reader-lesson-tips li").count(), 3);
  });
  await openReview(page);
  await page
    .getByRole("button", { name: "Recognized notes · 53", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  await page.locator(".sheet-paper svg").first().waitFor();
  assert.equal(
    await page
      .getByText("This score could not be engraved.", { exact: false })
      .count(),
    0,
  );
  await page.screenshot({
    path: `evidence/${evidencePrefix}-elise-notation.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("radiogroup", { name: "Practice hand" })
    .locator(".hand-left")
    .click();
  await page.getByRole("button", { name: "Wait for me", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  assert.equal(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()),
    2,
  );
  assert.match(await page.locator(".next-notes").innerText(), /A2/);
  await page.getByRole("button", { name: "A2 6 La", exact: true }).click();
  await page.waitForFunction(
    () =>
      +document.querySelector('[aria-label="Song position"]').value === 2.25,
  );
  assert.match(await page.locator(".next-notes").innerText(), /E3/);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Practice hand" })
    .locator(".hand-both")
    .click();
  await page
    .getByRole("button", { name: "Listen & follow", exact: true })
    .click();
  await page.getByRole("button", { name: "Start over" }).click();
  const repeated = await page
    .locator('.falling-note[title^="E5 ·"]')
    .evaluateAll((ns) =>
      ns
        .map((n) => {
          const r = n.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        })
        .sort((a, b) => a.top - b.top),
    );
  assert.ok(repeated.length >= 3);
  assert.ok(
    repeated.every((n, i) => i === 0 || n.top >= repeated[i - 1].bottom + 1),
    JSON.stringify(repeated),
  );
  await page.screenshot({
    path: `evidence/${evidencePrefix}-elise-studio.png`,
    fullPage: true,
  });
  return [
    "Für Elise has 53 notes and engraved two-staff notation",
    "3/8 meter and three beginner practice tips are shown in Settings",
    "Left-hand wait mode starts at A2 in bar 3 and advances to E3",
    "Repeated E5 blocks are separated with no visual overlap",
  ];
}
