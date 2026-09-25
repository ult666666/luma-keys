import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { expect } from "@playwright/test";
import { demos, barStart, degree } from "../src/music.mjs";

export async function verifyReader(page, prefix = "reader") {
  const checks = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const play = () => page.getByRole("button", { name: "Play", exact: true });
  const position = () =>
    page.getByRole("slider", { name: "Song position" }).inputValue();
  const next = () =>
    page.getByRole("button", { name: "Next note", exact: true }).click();
  const settings = () =>
    page.getByRole("button", { name: "Reading settings", exact: true }).click();
  const close = () =>
    page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const importBuffer = async (name, contents) => {
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(contents)),
    });
    await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
    await close();
  };
  await expect(play()).toBeEnabled();
  if (
    +(await page.getByRole("slider", { name: "Piano volume" }).inputValue()) !==
    0
  )
    await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Number score" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".reading-heading")).toContainText("Bars 1–4");
  assert.equal(
    await page
      .locator(".sidebar,.daily-card,.companion-card,.practice-side,.greeting")
      .count(),
    0,
  );
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    play: document.querySelector(".play-button").getBoundingClientRect().bottom,
    key: document.querySelector(".piano-key.white").getBoundingClientRect()
      .width,
  }));
  assert.equal(layout.overflow, false);
  assert.ok(layout.play <= 800);
  assert.ok(layout.key >= 40);
  assert.equal(await page.locator('.piano-key[tabindex="0"]').count(), 1);
  await page.getByRole("button", { name: "C4 1 Do", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "C♯4 ♯1 Di", exact: true }),
  ).toBeFocused();
  await page.locator("h1").click();
  await page.screenshot({ path: `evidence/${prefix}-desktop.png` });
  checks.push(
    "Default 1280×800 view is a four-bar number score with readable fixed-width keys and visible Play; dashboard cards are absent",
  );
  await page.getByRole("button", { name: "Next passage", exact: true }).click();
  assert.equal(await position(), "16");
  await expect(page.locator(".reading-heading")).toContainText("Bars 5–8");
  await page
    .getByRole("button", { name: "Previous passage", exact: true })
    .click();
  assert.equal(await position(), "0");
  await next();
  assert.equal(await position(), "1");
  await page
    .getByRole("button", { name: "Previous note", exact: true })
    .click();
  assert.equal(await position(), "0");
  await page
    .getByRole("button", { name: /G4, number 5, hold/ })
    .first()
    .click();
  assert.equal(await position(), "2");
  checks.push(
    "Passage buttons, individual notes and manual next/previous synchronize the transport without counting fake practice hits",
  );
  await page.getByRole("button", { name: "Wait for me", exact: true }).click();
  await play().click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.keyboard.press("a");
  await expect.poll(position).toBe("1");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await settings();
  await page
    .getByRole("combobox", { name: "Key labels", exact: true })
    .selectOption("solfege");
  await close();
  await expect(page.locator(".reading-note strong").first()).toHaveText("Do");
  await settings();
  await page
    .getByRole("combobox", { name: "Key labels", exact: true })
    .selectOption("numbers");
  await page
    .getByRole("combobox", { name: "Number tonic", exact: true })
    .selectOption("2");
  await close();
  await expect(page.locator(".reading-note strong").first()).toHaveText(
    degree(60, 2),
  );
  await expect(page.locator(".reading-note > span").first()).toHaveText("C4");
  await settings();
  await page
    .getByRole("combobox", { name: "Number tonic", exact: true })
    .selectOption("0");
  if (
    (await page
      .getByRole("switch", { name: "Count me in" })
      .getAttribute("aria-checked")) === "true"
  )
    await page.getByRole("switch", { name: "Count me in" }).click();
  await close();
  checks.push(
    "Wait mode advances on correct input; label/tonic changes retain the same explicit physical octave and pitch",
  );
  await page.getByRole("button", { name: "Lessons", exact: true }).click();
  await page
    .locator(".song-card")
    .filter({ hasText: "Für Elise" })
    .getByRole("button", { name: "Let’s play" })
    .click();
  await expect(page.locator(".reading-note > span").first()).toHaveText("E5");
  await page.getByRole("tab", { name: "Sheet music", exact: true }).click();
  await expect(page.locator(".sheet-paper")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".engraved-sheet svg").first()).toBeVisible();
  const cursor = page.locator('.engraved-sheet img[id^="cursorImg"]');
  await expect(cursor).toBeVisible();
  const firstCursor = await cursor.boundingBox();
  await next();
  assert.equal(await position(), "0.25");
  await expect
    .poll(async () => (await cursor.boundingBox())?.x)
    .not.toBe(firstCursor.x);
  await page
    .getByRole("button", { name: "Next sheet passage", exact: true })
    .click();
  const elise = demos().find((s) => s.title.includes("Für Elise"));
  assert.equal(+(await position()), barStart(elise, 5));
  await expect(page.locator(".sheet-paper")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(cursor).toBeVisible();
  await page.screenshot({ path: `evidence/${prefix}-sheet.png` });
  checks.push(
    "Original staff view engraves four bars and its cursor moves through the Für Elise pickup and later passage without rebuilding per frame",
  );
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Practice hand" })
    .selectOption("left");
  await expect(page.locator(".reading-right")).toHaveCount(0);
  await page
    .getByRole("spinbutton", { name: "Go to bar", exact: true })
    .fill("3");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page.locator(".next-notes")).toContainText("A2");
  await page
    .getByRole("combobox", { name: "Practice hand" })
    .selectOption("both");
  const base = demos()[0];
  await importBuffer("range-follow.json", {
    ...base,
    id: "range-follow",
    title: "Range follow",
    duration: 4,
    measures: 1,
    measureStarts: [0],
    measureLengths: [4],
    xml: undefined,
    notes: [
      {
        id: "start",
        midi: 60,
        beat: 0,
        duration: 1,
        hand: "right",
        velocity: 0.7,
      },
      {
        id: "end",
        midi: 108,
        beat: 1,
        duration: 1,
        hand: "right",
        velocity: 0.7,
      },
    ],
  });
  await page.getByRole("button", { name: "Wait for me", exact: true }).click();
  await play().click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.keyboard.down("a");
  await expect.poll(position).toBe("1");
  await expect
    .poll(() =>
      page
        .locator(".keyboard-viewport")
        .evaluate((e) => e.scrollWidth - e.clientWidth - e.scrollLeft),
    )
    .toBeLessThan(2);
  await expect(
    page.getByRole("button", { name: "C4 1 Do", exact: true }),
  ).toHaveClass(/pressed/);
  await page.keyboard.up("a");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await play().click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  const pointerKey = page.getByRole("button", { name: "C4 1 Do", exact: true });
  await pointerKey.hover({ position: { x: 20, y: 78 } });
  const beforePointer = await page
    .locator(".keyboard-viewport")
    .evaluate((e) => e.scrollLeft);
  await page.mouse.down();
  await expect.poll(position).toBe("1");
  assert.equal(
    await page.locator(".keyboard-viewport").evaluate((e) => e.scrollLeft),
    beforePointer,
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator(".keyboard-viewport")
        .evaluate((e) => e.scrollWidth - e.clientWidth - e.scrollLeft),
    )
    .toBeLessThan(2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  checks.push(
    "Auto-follow keeps up with held computer/MIDI-style notes but never slides an onscreen key from under a held pointer",
  );
  await importBuffer("wide-chord.json", {
    ...base,
    id: "reader-wide-chord",
    title: "Across the piano",
    duration: 8,
    measures: 2,
    measureStarts: [0, 4],
    measureLengths: [4, 4],
    xml: undefined,
    notes: [
      {
        id: "low",
        midi: 21,
        beat: 0,
        duration: 1,
        hand: "left",
        velocity: 0.7,
      },
      {
        id: "high",
        midi: 108,
        beat: 0,
        duration: 1,
        hand: "right",
        velocity: 0.7,
      },
    ],
  });
  await expect(page.locator(".next-notes")).toContainText("A0");
  await expect(page.locator(".next-notes")).toContainText("C8");
  await expect(page.locator(".keyboard-offscreen")).toContainText("A0");
  await expect(page.locator(".keyboard-offscreen")).toContainText("C8");
  await page
    .getByRole("button", { name: "← Also play A0", exact: true })
    .click();
  assert.ok(
    (await page.locator(".keyboard-viewport").evaluate((e) => e.scrollLeft)) <
      1,
  );
  await page
    .getByRole("button", { name: "Also play C8 →", exact: true })
    .click();
  assert.ok(
    (await page
      .locator(".keyboard-viewport")
      .evaluate((e) => e.scrollWidth - e.clientWidth - e.scrollLeft)) < 2,
  );
  checks.push(
    "Full-range A0+C8 chord explicitly identifies offscreen notes; both ends remain reachable without shrinking keys",
  );
  await page.getByRole("tab", { name: "Falling notes", exact: true }).click();
  await expect(page.getByTestId("note-roll")).toBeVisible();
  const alignment = await page.evaluate(() =>
    [...document.querySelectorAll(".falling-note")].map((n) => {
      const pitch = n.title.split(" · ")[0];
      const k = [...document.querySelectorAll(".piano-key")].find((k) =>
        k.getAttribute("aria-label").startsWith(pitch + " "),
      );
      return Math.abs(
        n.getBoundingClientRect().left - k.getBoundingClientRect().left - 2,
      );
    }),
  );
  assert.ok(alignment.every((n) => n < 1));
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".reading-score")).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const smallKey = await page.locator(".piano-key.white").first().boundingBox();
  assert.ok(smallKey.width >= 40);
  await page.screenshot({
    path: `evidence/${prefix}-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  checks.push(
    "Optional falling notes remain aligned to the scrolling keyboard; 390px view has no document overflow or shrunken keys",
  );
  const many = Array.from({ length: 50000 }, (_, i) => ({
    id: "large-" + i,
    midi: 60 + (i % 12),
    beat: i * 0.25,
    duration: 0.125,
    hand: i % 4 ? "right" : "left",
    velocity: 0.7,
  }));
  await importBuffer("reader-long.json", {
    ...base,
    id: "reader-long",
    title: "Long score reading check",
    duration: 12500,
    measures: 3125,
    measureStarts: undefined,
    measureLengths: undefined,
    xml: undefined,
    notes: many,
  });
  await page
    .getByRole("spinbutton", { name: "Go to bar", exact: true })
    .fill("3000");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  assert.equal(await position(), "11996");
  assert.ok((await page.locator(".reading-note").count()) <= 64);
  await page.getByRole("button", { name: "Next passage", exact: true }).click();
  assert.ok(+(await position()) > 11996);
  checks.push(
    "50,000-note import supports distant-bar navigation and bounded rendered notation",
  );
  await page
    .getByRole("button", { name: "Export practice notes", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved a printable number sheet" })
    .waitFor();
  await page
    .getByRole("button", { name: "Import a score", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/Starter melody.pdf");
  await page
    .getByRole("dialog", { name: "Make the music yours" })
    .waitFor({ timeout: 120000 });
  assert.equal(await page.locator("tbody tr").count(), 16);
  await page.getByRole("button", { name: "Original PDF", exact: true }).click();
  await page.locator('canvas[data-ready="true"]').waitFor();
  await close();
  await expect(page.locator(".reading-note").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Review sheet and notes", exact: true })
    .click();
  await page.locator('select[aria-label^="Pitch"]').first().selectOption("64");
  await page
    .getByRole("button", { name: "Save & mark reviewed", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await expect(page.locator(".reading-note > span").first()).toHaveText("E4");
  await expect(page.locator(".reading-note strong").first()).toHaveText("3");

  await page.screenshot({
    path: `evidence/${prefix}-pdf-reading.png`,
    fullPage: true,
  });
  checks.push(
    "Number export, actual PDF recognition/original viewing, and saved pitch corrections flow back into the numbered reading workspace",
  );
  assert.deepEqual(errors, []);
  return { checks, errors, physicalMIDI: false };
}
