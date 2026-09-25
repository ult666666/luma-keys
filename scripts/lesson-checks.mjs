import assert from "node:assert/strict";

export async function verifyElise(page, evidencePrefix = "lessons") {
  await page
    .getByRole("button", { name: "Little lessons", exact: true })
    .click();
  const card = page.locator(".song-card").filter({ hasText: "Für Elise" });
  await card.getByRole("button", { name: /play/i }).click();
  await page
    .getByRole("heading", { name: "Für Elise · opening", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".meter-hint").innerText(),
    "3/8 · 3 pulses per bar",
  );
  assert.equal(
    await page
      .getByRole("region", { name: "Your practice path" })
      .locator("li")
      .count(),
    3,
  );
  await page.getByRole("button", { name: "Review sheet and notes" }).click();
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
    .getByRole("combobox", { name: "Practice hand" })
    .selectOption("left");
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
    .getByRole("combobox", { name: "Practice hand" })
    .selectOption("both");
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
    "3/8 meter and three beginner practice steps are visible",
    "Left-hand wait mode starts at A2 in bar 3 and advances to E3",
    "Repeated E5 blocks are separated with no visual overlap",
  ];
}
