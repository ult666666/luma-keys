import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { demos } from "../src/music.mjs";
import { setPianoVolume } from "./piano-volume.mjs";
import { loopInput, setLoopRange, openReview } from "./practice-tools.mjs";
import { openFromLibrary } from "./library-open.mjs";

const fixture = {
  ...demos()[0],
  id: "phrase-practice-fixture",
  title: "Pickup phrase practice",
  composer: "Luma Keys regression fixture",
  bpm: 90,
  meter: 3,
  pickup: 0.5,
  duration: 13,
  measures: 5,
  measureStarts: [0, 0.5, 3.5, 6.5, 10.5],
  measureLengths: [0.5, 3, 3, 4, 2.5],
  xml: undefined,
  notes: [
    [0, 60, 0.03125],
    [0.03125, 62, 0.03125],
    [0.0625, 64, 0.4375],
    [0.5, 65, 1],
    [1.5, 67, 1],
    [2.5, 69, 1],
    [3.5, 71, 1],
    [4.5, 72, 1],
    [5.5, 74, 1],
    [6.5, 76, 1],
    [7.5, 77, 1],
    [8.5, 79, 1],
    [9.5, 81, 1],
    [10.5, 83, 1],
    [11.5, 84, 1],
    [12.5, 86, 0.5],
  ].map(([beat, midi, duration], i) => ({
    id: `phrase-note-${i}`,
    beat,
    midi,
    duration,
    hand: "right",
    velocity: 0.7,
    measure:
      beat < 0.5 ? 1 : beat < 3.5 ? 2 : beat < 6.5 ? 3 : beat < 10.5 ? 4 : 5,
  })),
};

const restFixture = {
  ...fixture,
  id: "phrase-rest-fixture",
  title: "Written rests at every speed",
  meter: 4,
  pickup: 0,
  duration: 8,
  measures: 2,
  measureStarts: [0, 4],
  measureLengths: [4, 4],
  notes: Array.from({ length: 16 }, (_, i) => ({
    id: `rest-note-${i}`,
    beat: (2 * i + 1) * 0.03125,
    duration: 0.03125,
    midi: 60 + (i % 7),
    hand: "right",
    velocity: 0.7,
    measure: 1,
  })),
};

// This is a serial browser/native story. Its caller must isolate data and clean
// up its UI imports and preference changes after completion.
export async function verifyPhrasePractice(page, prefix = "phrase-practice") {
  const checks = [],
    errors = [],
    measurements = {};
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const position = async () =>
    +(await page.getByRole("slider", { name: "Song position" }).inputValue());
  const seek = (beat) =>
    page.getByRole("slider", { name: "Song position" }).fill(String(beat));
  const close = () => button("Close dialog").click();
  const next = () => button("Next note").click();
  const previous = () => button("Previous note").click();
  const repeat = () => button("Repeat these bars").click();
  // (Since 2.39 the range lives in the Practice tools drawer: read by
  // attribute, which also finds it while the drawer is closed.)
  const start = loopInput(page, "start");
  const end = loopInput(page, "end");
  const expectCue = (pitch) =>
    expect(page.locator(".next-notes")).toContainText(pitch);
  const range = async (a, b) => {
    await expect(start).toHaveValue(String(a));
    await expect(end).toHaveValue(String(b));
    assert.ok(
      await page.locator(".reading-loop-shade").count(),
      "The active phrase must be visible on the manuscript",
    );
    for (let bar = a; bar <= b; bar++) {
      const label = button(`Seek to bar ${bar}`);
      if (await label.count())
        await expect(label).toHaveClass(/reading-bar-in-loop/);
    }
  };
  const noRange = async () => {
    await expect(start).toHaveCount(0);
    await expect(page.locator(".reading-loop-shade")).toHaveCount(0);
    await expect(page.locator(".reading-bar-in-loop")).toHaveCount(0);
  };
  const body = page.locator(".keyboard-guide-body");
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(button("Play")).toBeEnabled();
    await setPianoVolume(page);
    const beforeStats = await page.evaluate(
      async () => (await (await fetch("/api/preferences")).json()).stats,
    );
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await close();
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-both")
      .click();
    await button("Wait for me").click();
    await button("Start over").click();
    await expectCue("C4");
    await next();
    await expectCue("D4");
    await expect(page.locator('.reading-note[aria-label^="D4,"]')).toHaveClass(
      /reading-current/,
    );
    await next();
    await expectCue("E4");
    await expect(page.locator('.reading-note[aria-label^="E4,"]')).toHaveClass(
      /reading-current/,
    );
    await previous();
    await expectCue("D4");
    checks.push(
      "Manual reading visits every close onset in order, including .03125-beat notes, and keeps the required-note cue accurate",
    );

    await button("Next passage").click();
    assert.equal(await position(), 10.5);
    await repeat();
    await range(5, 5);
    assert.equal(await position(), 10.5);
    await expectCue("B5");
    await next();
    assert.equal(await position(), 11.5);
    await button("Start over").click();
    assert.equal(await position(), 10.5);
    await button("Listen & follow").click();
    assert.equal(await position(), 10.5);
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-right")
      .click();
    assert.equal(await position(), 10.5);
    await button("Wait for me").click();
    assert.equal(await position(), 10.5);
    await openReview(page);
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await button("Save & mark reviewed").click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await range(5, 5);
    assert.equal(await position(), 10.5);
    await expectCue("B5");
    checks.push(
      "Repeat these bars selects the visible final bar using real pickup/meter boundaries; Start over, mode/hand changes and review/save stay inside that phrase",
    );

    await setLoopRange(page, 2, 3);
    await range(2, 3);
    assert.equal(await position(), 0.5);
    await expectCue("F4");
    await seek(5.5);
    await expectCue("D5");
    await next();
    assert.equal(await position(), 0.5);
    await expectCue("F4");
    await previous();
    assert.equal(await position(), 5.5);
    await expectCue("D5");
    await expect(page.locator(".reader-cue-label")).not.toContainText(
      "FINISHED",
    );
    await button("Start over").click();
    assert.equal(await position(), 0.5);
    measurements.numericPhrase = {
      firstBeat: 0.5,
      lastOnset: 5.5,
      bars: [2, 3],
    };
    await page.screenshot({
      path: `evidence/${prefix}-selected-phrase.png`,
      fullPage: true,
    });
    checks.push(
      "Numeric phrase edits move the score and cue to the selected start; acoustic Next/Previous wrap within selected onsets without a contradictory finish cue",
    );

    await seek(10.5);
    await noRange();
    await expectCue("B5");
    await seek(0);
    await button("Seek to bar 2").click();
    await button("Seek to bar 4").click({ modifiers: ["Shift"] });
    await range(2, 4);
    assert.equal(await position(), 0.5);
    await page.locator('.reading-note[aria-label^="G4,"]').click();
    assert.equal(await position(), 1.5);
    await range(2, 4);
    await page.locator('.reading-note[aria-label^="C4,"]').click();
    assert.equal(await position(), 0);
    await noRange();
    checks.push(
      "Shift-click extends a phrase from the last clicked bar; exploring an inside note preserves it, while outside notes or timeline seeks leave repeat mode clearly",
    );

    await repeat();
    await range(1, 4);
    await button("Next passage").click();
    assert.equal(await position(), 10.5);
    await noRange();
    await repeat();
    await range(5, 5);
    await button("Toggle phrase loop").click();
    await noRange();
    await button("Start over").click();
    assert.equal(await position(), 0);
    await expectCue("C4");
    const afterStats = await page.evaluate(
      async () => (await (await fetch("/api/preferences")).json()).stats,
    );
    assert.equal(
      afterStats.correct,
      beforeStats.correct,
      "Manual navigation must not award correct-note practice hits",
    );
    assert.equal(
      afterStats.sessions,
      beforeStats.sessions,
      "Manual navigation must not create playback sessions",
    );
    checks.push(
      "Outside passage navigation exits the old phrase; disabling Repeat restores full-score Start over without inventing practice statistics",
    );

    await seek(0.03125);
    await expectCue("D4");
    await button("Play").click();
    await expect(page.locator(".reader-play-status, .maestro-live-status")).toContainText(
      "Waiting for your notes",
    );
    await page.locator("h1").click();
    await page.keyboard.down("a");
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    assert.equal(
      await position(),
      0.03125,
      "The preceding C4 must not satisfy the required D4 merely because its onset is nearby",
    );
    await expectCue("D4");
    await page.keyboard.up("a");
    await page.keyboard.down("s");
    await expect.poll(position).toBe(0.0625);
    await expectCue("E4");
    await page.keyboard.up("s");
    await page.keyboard.down("d");
    await expect.poll(position).toBe(0.5);
    await expectCue("F4");
    await page.keyboard.up("d");
    await button("Pause").click();
    await button("Start over").click();
    assert.equal(await position(), 0);
    checks.push(
      "Live Wait for me rejects a nearby wrong onset and accepts D4 then E4 at their precise written beats without skipping either note",
    );

    if (await button("Show keyboard guide").count())
      await button("Show keyboard guide").click();
    await page.locator("h1").click();
    await page.keyboard.down("a");
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    await page.locator(".piano-keys").evaluate((element) => {
      window.__phraseKeyButtons = [...element.querySelectorAll(".piano-key")];
    });
    await button("Hide keyboard guide").click();
    await expect(body).toBeHidden();
    await expect(button("Show keyboard guide")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    await page.keyboard.up("a");
    await expect(page.locator('.piano-key[data-midi="60"]')).not.toHaveClass(
      /pressed/,
    );
    const collapsed = await page.evaluate(() => ({
      keys: document.querySelectorAll(".piano-key").length,
      retained: window.__phraseKeyButtons.every(
        (button, i) => button === document.querySelectorAll(".piano-key")[i],
      ),
      allUnavailable: [...document.querySelectorAll(".piano-key")].every(
        (button) => button.disabled && button.tabIndex === -1,
      ),
    }));
    assert.deepEqual(collapsed, {
      keys: 88,
      retained: true,
      allUnavailable: true,
    });
    await next();
    await expectCue("D4");
    await expect(body).toBeHidden();
    await expect(button("Play")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Sight-reading score" }),
    ).toBeVisible();
    await page.screenshot({
      path: `evidence/${prefix}-score-only.png`,
      fullPage: true,
    });
    measurements.collapsed = collapsed;
    checks.push(
      "Hiding the keyboard preserves live computer ownership and acoustic stepping, removes hidden keys from focus, and retains all 88 button identities",
    );

    await page.getByRole("tab", { name: "Falling notes", exact: true }).click();
    await expect(body).toBeVisible();
    await expect(button("Hide keyboard guide")).toHaveCount(0);
    await expect(button("Show keyboard guide")).toHaveCount(0);
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    await expect(body).toBeHidden();
    await openFromLibrary(page, "Twinkle, Little Star");
    await expect(body).toBeHidden();
    const controlledId = await button("Show keyboard guide").getAttribute(
      "aria-controls",
    );
    assert.equal(await body.getAttribute("id"), controlledId);
    await button("Show keyboard guide").click();
    await expect(body).toBeVisible();
    await expect(button("Hide keyboard guide")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.locator(".piano-key")).toHaveCount(88);
    await expect(page.locator('.piano-key[tabindex="0"]')).toHaveCount(1);
    checks.push(
      "Falling notes temporarily reveals the keyboard; Number score and score changes retain the user's collapsed preference, with an accessible way to restore it",
    );

    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}-rests.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(restFixture)),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await close();
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    // In the studio a dense bar is divided between its onsets onto lines that
    // fit the width (1.7), so walk the lines and check every rest on each.
    const rests = page.locator(".reading-right .reading-rest");
    await expect(rests.first()).toBeVisible();
    const restGeometry = [];
    let restOverflow = { document: false, score: false };
    for (let line = 0; line < 12; line++) {
      const here = await rests.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const labels = [...element.querySelectorAll("span,small")].map(
            (label) => {
              const labelRect = label.getBoundingClientRect();
              return {
                text: label.textContent.trim(),
                left: labelRect.left - rect.left,
                right: labelRect.right - rect.right,
                top: labelRect.top - rect.top,
                bottom: labelRect.bottom - rect.bottom,
              };
            },
          );
          return {
            label: element.getAttribute("aria-label"),
            duration: element.querySelector("small").textContent.trim(),
            width: rect.width,
            labels,
          };
        }),
      );
      restGeometry.push(...here);
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth > innerWidth,
        score:
          document.querySelector(".reading-scroll").scrollWidth >
          document.querySelector(".reading-scroll").clientWidth,
      }));
      restOverflow = {
        document: restOverflow.document || overflow.document,
        score: restOverflow.score || overflow.score,
      };
      const next = button("Next passage");
      if (await next.isDisabled()) break;
      const was = await position();
      await next.click();
      await expect.poll(position).not.toBe(was);
      await expect(rests.first()).toBeVisible();
    }
    const tally = (duration) =>
      restGeometry.filter(
        (rest) => rest.label === `Rest for ${duration} quarter-note beats`,
      );
    assert.equal(restGeometry.length, 18);
    for (const [duration, count] of [
      ["0.031", 16],
      ["3", 1],
      ["4", 1],
    ]) {
      assert.equal(tally(duration).length, count, duration);
      assert.ok(tally(duration).every((rest) => rest.duration === `♩ ${duration}`));
    }
    for (const rest of restGeometry)
      for (const label of rest.labels) {
        assert.ok(
          label.left >= -1 &&
            label.right <= 1 &&
            label.top >= -1 &&
            label.bottom <= 1,
          `Rest text must remain inside its visible container: ${JSON.stringify({ rest, label })}`,
        );
      }
    assert.equal(
      restOverflow.document,
      false,
      "Dense rests must never widen the page",
    );
    assert.equal(
      restOverflow.score,
      false,
      "Dense music is divided onto lines that fit rather than scrolled sideways",
    );
    measurements.rests = {
      count: restGeometry.length,
      minimumWidth: Math.min(...restGeometry.map((rest) => rest.width)),
      restOverflow,
    };
    assert.ok(
      measurements.rests.minimumWidth >= 20,
      "even the shortest rest keeps a readable width",
    );
    await page.screenshot({
      path: `evidence/${prefix}-rest-durations.png`,
      fullPage: true,
    });
    checks.push(
      "Opening, interior and trailing rests show accurate beat durations; dense short rests stay legible on lines that fit the width, without clipped labels or any sideways scrolling",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await button("Hide keyboard guide").click();
    await expect(body).toBeHidden();
    await repeat();
    await range(1, 2);
    const narrowControls = await page
      .locator(
        '.reading-header button, .reading-header input, input[aria-label="Loop start bar"], input[aria-label="Loop end bar"]',
      )
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label:
                element.getAttribute("aria-label") ||
                element.textContent.trim(),
              left: rect.left,
              right: rect.right,
              width: rect.width,
            };
          }),
      );
    assert.ok(
      narrowControls.length >= 3,
      "Check actual phrase controls at the narrow viewport",
    );
    for (const control of narrowControls)
      assert.ok(
        control.left >= -1 && control.right <= 391 && control.width > 0,
        `Phrase control must fit the 390px viewport: ${JSON.stringify(control)}`,
      );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await next();
    await expectCue("C4");
    await expect(body).toBeHidden();
    measurements.narrowControls = narrowControls;
    await page.screenshot({
      path: `evidence/${prefix}-narrow-score-only.png`,
      fullPage: true,
    });
    checks.push(
      "At 390px, phrase selection and manual stepping remain usable with the keyboard collapsed and no controls extending beyond the page",
    );
    assert.deepEqual(errors, []);
    return {
      checks,
      errors,
      measurements,
      audioOutput: "Piano volume set to zero",
      physicalHardwareTested: false,
    };
  } catch (error) {
    error.phraseEvidence = {
      errors,
      measurements,
      position: await position().catch(() => null),
    };
    throw error;
  } finally {
    for (const key of ["a", "s", "d"])
      await page.keyboard.up(key).catch(() => {});
    if (
      await button("Pause")
        .count()
        .catch(() => 0)
    )
      await button("Pause")
        .click()
        .catch(() => {});
    await page
      .evaluate(() => {
        delete window.__phraseKeyButtons;
      })
      .catch(() => {});
    await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => {});
    page.off("pageerror", onError);
  }
}
