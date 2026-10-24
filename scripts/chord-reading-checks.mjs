import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { demos, noteName } from "../src/music.mjs";
import { setPianoVolume } from "./piano-volume.mjs";

// Run serially on the caller's isolated library. The caller removes its imports
// and restores preferences after this real-control practice flow completes.
export async function verifyChordReading(page, prefix = "chord-reading") {
  const checks = [],
    errors = [],
    measurements = {};
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const play = () => page.getByRole("button", { name: "Play", exact: true });
  const pause = () => page.getByRole("button", { name: "Pause", exact: true });
  const position = () =>
    page.getByRole("slider", { name: "Song position" }).inputValue();
  const note = (midi) =>
    page.locator(`.reading-note[aria-label^="${noteName(midi)},"]`);
  const pianoKey = (midi) => page.locator(`.piano-key[data-midi="${midi}"]`);
  const heldPitches = [48, 60, 64, 67];
  const release = async () => {
    for (const key of ["a", "d", "g", "s"])
      await page.keyboard.up(key).catch(() => {});
    await page.mouse.up().catch(() => {});
  };
  const geometry = async (name, horizontal = true) => {
    const data = await page.locator(".reading-scroll").evaluate((element) => {
      const box = element.getBoundingClientRect();
      const area = {
        top: box.top + element.clientTop,
        bottom: box.top + element.clientTop + element.clientHeight,
        left: box.left + element.clientLeft,
        right: box.left + element.clientLeft + element.clientWidth,
      };
      return {
        area,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        notes: [...element.querySelectorAll(".reading-note")].map((button) => {
          const box = button.getBoundingClientRect(),
            duration = button.querySelector("small").getBoundingClientRect();
          return {
            label: button.getAttribute("aria-label"),
            hand: button
              .closest(".reading-hand")
              .classList.contains("reading-left")
              ? "left"
              : "right",
            box: {
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              right: box.right,
            },
            duration: {
              top: duration.top,
              bottom: duration.bottom,
              left: duration.left,
              right: duration.right,
            },
          };
        }),
      };
    });
    assert.equal(data.documentOverflow, false);
    assert.ok(
      data.scrollHeight <= data.clientHeight + 1,
      `${name}: score must not hide chord rows in an internal vertical scroller`,
    );
    assert.ok(data.notes.some((n) => n.hand === "left"));
    assert.ok(data.notes.some((n) => n.hand === "right"));
    assert.equal(data.notes.length, 5);
    for (const item of data.notes) {
      for (const [part, box] of [
        ["note", item.box],
        ["duration", item.duration],
      ]) {
        assert.ok(
          box.top >= data.area.top - 1 && box.bottom <= data.area.bottom + 1,
          `${name}: ${item.label} ${part} must be vertically visible`,
        );
        if (horizontal)
          assert.ok(
            box.left >= data.area.left - 1 && box.right <= data.area.right + 1,
            `${name}: ${item.label} ${part} must fit horizontally on desktop`,
          );
      }
    }
    measurements[name] = data;
  };
  const assertHolding = async () => {
    await expect(note(62)).toHaveClass(/reading-current/);
    await expect(note(62)).not.toHaveClass(/reading-holding/);
    await expect(page.locator(".reading-current")).toHaveCount(1);
    for (const midi of heldPitches) {
      await expect(note(midi)).toHaveClass(/reading-holding/);
      await expect(note(midi)).not.toHaveClass(/reading-current/);
      await expect(note(midi).locator(".reading-hold-label")).toHaveText(
        "hold",
      );
      await expect(note(midi)).toHaveAttribute("aria-label", /keep holding/);
      const attack = await note(midi)
        .locator("strong")
        .evaluate((element) => getComputedStyle(element).animationName);
      assert.equal(
        attack,
        "none",
        "A sustained reading note must not receive another onset animation",
      );
    }
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(play()).toBeEnabled();
    await setPianoVolume(page);
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...demos()[0],
          id: `${prefix}-fixture`,
          title: "Two-hand chord reading check",
          composer: "Luma Keys regression fixture",
          duration: 4,
          measures: 1,
          measureStarts: [0],
          measureLengths: [4],
          xml: undefined,
          notes: [
            ...heldPitches.map((midi) => ({
              id: `held-${midi}`,
              midi,
              beat: 0,
              duration: 4,
              hand: midi === 48 ? "left" : "right",
              velocity: 0.7,
              measure: 1,
            })),
            {
              id: "required-d4",
              midi: 62,
              beat: 1,
              duration: 1,
              hand: "right",
              velocity: 0.7,
              measure: 1,
            },
          ],
        }),
      ),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-both")
      .click();
    await page
      .getByRole("button", { name: "Wait for me", exact: true })
      .click();
    await geometry("initialChord");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `evidence/${prefix}-both-hands.png`,
      fullPage: true,
    });
    checks.push(
      "A right-hand triad and left-hand bass keep both hands' pitches and durations visible without a hidden vertical score region",
    );

    await play().click();
    await pause().waitFor();
    // Hold the bass on screen and use three computer keys for a real four-note
    // chord. No synthetic score seeking or practice hits are injected here.
    await pianoKey(48).scrollIntoViewIfNeeded();
    const bassBox = await pianoKey(48).boundingBox();
    await page.mouse.move(
      bassBox.x + bassBox.width / 2,
      bassBox.y + bassBox.height - 16,
    );
    await page.mouse.down();
    await expect(pianoKey(48)).toHaveClass(/pressed/);
    assert.equal(await position(), "0");
    for (const [computer, midi] of [
      ["a", 60],
      ["d", 64],
      ["g", 67],
    ]) {
      await page.keyboard.down(computer);
      await expect(pianoKey(midi)).toHaveClass(/pressed/);
    }
    await expect.poll(position).toBe("1");
    await assertHolding();
    await geometry("holdingChord");
    await page.screenshot({
      path: `evidence/${prefix}-held-notes.png`,
      fullPage: true,
    });
    await page.keyboard.down("s");
    await expect.poll(position).toBe("4");
    await expect(play()).toBeEnabled();
    await release();
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    checks.push(
      "Actual bass-plus-triad input advances wait mode to D4; earlier notes are marked hold, only D4 is current, and D4 input completes the phrase",
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("slider", { name: "Song position" }).fill("1");
    await play().click();
    await pause().waitFor();
    assert.equal(await position(), "1");
    await assertHolding();
    const animationCount = await page
      .locator(".reading-score")
      .evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      );
    assert.equal(animationCount, 0);
    await pause().click();
    await page.setViewportSize({ width: 390, height: 844 });
    // Let the score finish re-laying out for the narrow width first.
    await expect
      .poll(() =>
        page
          .locator(".reading-scroll")
          .evaluate((e) => e.scrollHeight - e.clientHeight),
      )
      .toBeLessThanOrEqual(1);
    await geometry("mobileReducedMotion", false);
    await assertHolding();
    await page.screenshot({
      path: `evidence/${prefix}-reduced-mobile.png`,
      fullPage: true,
    });
    checks.push(
      "Reduced-motion and 390px layouts preserve the held-versus-required note distinction, readable chord rows and horizontal containment",
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
    error.chordReadingEvidence = {
      errors,
      measurements,
      beat: await position().catch(() => null),
    };
    throw error;
  } finally {
    await release();
    if (
      await pause()
        .count()
        .catch(() => 0)
    )
      await pause()
        .click()
        .catch(() => {});
    await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => {});
    await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
    page.off("pageerror", onError);
  }
}
