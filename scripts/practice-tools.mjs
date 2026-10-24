import { expect } from "@playwright/test";

// Since 2.39 the repeat range, speed ladder and saved passages live in the
// Practice tools drawer. These helpers open it for a change and close it
// again, so a story reads as it did when the inputs sat in the dock.
export const loopInput = (page, which) =>
  page.locator(`input[aria-label="Loop ${which} bar"]`);
const trigger = (page) =>
  page.getByRole("button", { name: "Practice tools", exact: true });
export async function openTools(page) {
  if ((await trigger(page).getAttribute("aria-expanded")) === "true")
    return false;
  await trigger(page).click();
  await expect(
    page.getByRole("region", { name: "Practice tools" }),
  ).toBeVisible();
  return true;
}
export async function closeTools(page) {
  if ((await trigger(page).getAttribute("aria-expanded")) !== "true") return;
  await page.getByRole("button", { name: "Close practice tools" }).click();
  await expect(
    page.getByRole("region", { name: "Practice tools" }),
  ).toBeHidden();
}
export async function withTools(page, action) {
  const opened = await openTools(page);
  try {
    return await action();
  } finally {
    if (opened) await closeTools(page);
  }
}
// The start field cannot pass the end field and vice versa, so the order of
// the two fills follows the direction of the move.
export async function setLoopRange(page, from, to) {
  await withTools(page, async () => {
    const start = loopInput(page, "start"),
      end = loopInput(page, "end");
    const currentStart = Number(await start.inputValue());
    const order = from <= currentStart ? ["start", "end"] : ["end", "start"];
    for (const which of order) {
      const input = which === "start" ? start : end;
      await input.fill(String(which === "start" ? from : to));
      await input.press("Enter");
    }
    await expect(start).toHaveValue(String(from));
    await expect(end).toHaveValue(String(to));
  });
}
export async function setLoopEnd(page, to) {
  await withTools(page, async () => {
    await loopInput(page, "end").fill(String(to));
    await loopInput(page, "end").press("Enter");
    await expect(loopInput(page, "end")).toHaveValue(String(to));
  });
}
export async function setLoopStart(page, from) {
  await withTools(page, async () => {
    await loopInput(page, "start").fill(String(from));
    await loopInput(page, "start").press("Enter");
    await expect(loopInput(page, "start")).toHaveValue(String(from));
  });
}

// Since 2.39 "Review sheet and notes" sits in the Piece drawer; it closes the
// drawer itself as it opens the review.
export async function openReview(page) {
  const review = page.getByRole("button", {
    name: "Review sheet and notes",
    exact: true,
  });
  if (!(await review.isVisible()))
    await page.getByRole("button", { name: "Piece", exact: true }).click();
  await review.click();
  await page.getByRole("dialog", { name: "Review score" }).waitFor();
}

// Click a button that lives in the Piece drawer (since 2.39), opening the
// drawer when it is closed and closing it again afterwards if it stays open.
export async function clickInPieceTools(page, name) {
  const target = page.getByRole("button", { name, exact: true });
  const trigger = page.getByRole("button", { name: "Piece", exact: true });
  if (!(await target.isVisible())) await trigger.click();
  await target.click();
  if (
    (await trigger.getAttribute("aria-expanded").catch(() => null)) === "true"
  )
    await page.getByRole("button", { name: "Close piece" }).click();
}
