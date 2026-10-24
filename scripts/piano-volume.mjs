import { expect } from "@playwright/test";

// Since 2.39 the piano volume and mute live in the Practice tools drawer, so
// a harness that wants a silent instance opens the drawer, sets the slider
// and closes it again. Reading the value needs no drawer.
export async function setPianoVolume(page, value = "0") {
  const slider = page.locator('input[aria-label="Piano volume"]');
  const trigger = page.getByRole("button", {
    name: "Practice tools",
    exact: true,
  });
  const opened = !(await slider.isVisible());
  if (opened) {
    await trigger.click();
    await expect(slider).toBeVisible();
  }
  await slider.fill(String(value));
  await expect(slider).toHaveValue(String(value));
  if (opened) {
    await page.getByRole("button", { name: "Close practice tools" }).click();
    await expect(slider).toBeHidden();
  }
}
export const pianoVolume = (page) =>
  page.locator('input[aria-label="Piano volume"]').inputValue();
