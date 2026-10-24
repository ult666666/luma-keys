import { expect } from "@playwright/test";

// Since 2.39 the app opens on the Practice screen, colours and companions
// are chosen from Reading settings and the volume sits in Practice tools.
// These helpers keep the settings stories reading as they did.
export const ready = (page) =>
  expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled({
    timeout: 30000,
  });
export async function inReadingSettings(page, action) {
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.waitFor();
  try {
    return await action(dialog);
  } finally {
    if (await dialog.isVisible())
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
  }
}
export const colourChoice = (page, name) =>
  page
    .getByRole("group", { name: "Colours", exact: true })
    .getByRole("button", { name, exact: true });
// Choose a companion in the salon (opened from Reading settings); choosing
// closes the salon itself.
export async function chooseCompanion(page, name) {
  await inReadingSettings(page, async (dialog) => {
    await dialog
      .getByRole("button", { name: "Companions", exact: true })
      .click();
    const salon = page.getByRole("dialog", { name: "Companions" });
    await salon.waitFor();
    await salon
      .getByRole("button", { name: new RegExp(`^Preview ${name},`) })
      .click();
    await salon.getByRole("button", { name: `Choose ${name}` }).click();
    await expect(salon).toBeHidden();
  });
}
