import { expect } from "@playwright/test";

// Since 2.13 the Library shows illustrated cards; each card's title opens
// the piece ("Open <title>"). Opens the first card whose title starts with
// `title`, from the Library screen, and waits for Practice to show it.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function openFromLibrary(page, title) {
  const library = page.getByRole("button", { name: "Library", exact: true });
  if ((await library.getAttribute("aria-current")) !== "page")
    await library.click();
  await page
    .getByRole("button", { name: new RegExp(`^Open ${escape(title)}`) })
    .first()
    .click();
  await expect(page.locator(".reader-score-heading h1")).toContainText(title);
}
