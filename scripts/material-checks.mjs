import assert from "node:assert/strict";
import { expect } from "@playwright/test";

const animations = (locator) =>
  locator.evaluate((element) =>
    element.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect.getTiming();
      return {
        name: animation.animationName || animation.constructor.name,
        state: animation.playState,
        duration: timing.duration,
        finite: Number.isFinite(timing.iterations),
      };
    }),
  );
const playingAnimations = (items) =>
  items.filter((item) => item.state === "running" || item.state === "pending");
const stableBox = (before, after, label) => {
  assert.ok(before && after, `${label} must remain mounted`);
  for (const field of ["x", "y", "width", "height"])
    assert.ok(
      Math.abs(before[field] - after[field]) < 0.75,
      `${label} ${field} moved from ${before[field]} to ${after[field]}`,
    );
};

// This story changes only controls and built-in lessons. Run on an isolated QA
// library and invoke serially with other preference-changing browser stories.
export async function verifyMaterials(page, prefix = "material") {
  const checks = [],
    errors = [],
    measurements = {};
  const pageError = (error) => errors.push(error.message);
  page.on("pageerror", pageError);
  page.setDefaultTimeout(15000);
  const play = () => page.getByRole("button", { name: "Play", exact: true });
  const pause = () => page.getByRole("button", { name: "Pause", exact: true });
  const position = () =>
    page.getByRole("slider", { name: "Song position" }).inputValue();
  const key = (midi) => page.locator(`.piano-key[data-midi="${midi}"]`);
  const startOver = () =>
    page.getByRole("button", { name: "Start over", exact: true }).click();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(play()).toBeEnabled();
    await page.getByRole("slider", { name: "Piano volume" }).fill("0");
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page
      .locator(".piece-row")
      .filter({ hasText: "Twinkle, Little Star" })
      .getByRole("button", { name: /^(open|reading)$/i })
      .click();
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    await page
      .getByRole("button", { name: "Listen & follow", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Practice hand" })
      .selectOption("both");
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Key labels" })
      .selectOption("numbers");
    await page
      .getByRole("combobox", { name: "Number tonic" })
      .selectOption("0");
    const countIn = page.getByRole("switch", { name: "Count me in" });
    if ((await countIn.getAttribute("aria-checked")) === "true")
      await countIn.click();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await startOver();
    await expect(page.locator(".piano-key")).toHaveCount(88);
    measurements.desktop = await page.evaluate(() => {
      window.scrollTo(0, 0);
      return {
        transportBottom: document
          .querySelector(".reader-controls")
          .getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    assert.equal(measurements.desktop.overflow, false);
    assert.ok(
      measurements.desktop.transportBottom <= 800,
      `The complete transport must fit at 1280×800 (bottom ${measurements.desktop.transportBottom})`,
    );

    const white = key(60);
    await white.scrollIntoViewIfNeeded();
    const whiteBox = await white.boundingBox();
    assert.ok(
      Math.abs(whiteBox.width - 42) < 0.75,
      "White keys stay 42px wide",
    );
    const whitePoint = {
      x: whiteBox.x + whiteBox.width / 2,
      y: whiteBox.y + whiteBox.height - 16,
    };
    const hit = (point) =>
      page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest(".piano-key")
            ?.getAttribute("data-midi"),
        point,
      );
    assert.equal(await hit(whitePoint), "60");
    await page.mouse.move(whitePoint.x, whitePoint.y);
    await page.mouse.down();
    await expect(white).toHaveClass(/pressed/);
    stableBox(whiteBox, await white.boundingBox(), "C4 hit target");
    const resonance = white.locator(".key-resonance");
    await expect(resonance).toBeAttached();
    const keyMotion = await animations(white);
    assert.ok(
      playingAnimations(keyMotion).length,
      "A real key attack should animate",
    );
    assert.ok(
      keyMotion.every((item) => item.finite),
      "Key attack effects must end",
    );
    const surface = await white.locator(".key-surface").evaluate((element) => ({
      transform: getComputedStyle(element).transform,
      pointerEvents: getComputedStyle(element).pointerEvents,
    }));
    assert.equal(surface.pointerEvents, "none");
    assert.equal(
      await resonance.evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
      "none",
    );
    assert.equal(
      await hit(whitePoint),
      "60",
      "Decoration cannot steal the key's pointer target",
    );
    await page.mouse.up();
    await expect(white).not.toHaveClass(/pressed/);
    await expect
      .poll(async () => playingAnimations(await animations(white)).length)
      .toBe(0);
    stableBox(whiteBox, await white.boundingBox(), "Released C4 hit target");
    measurements.keyMotion = keyMotion;
    measurements.keySurface = surface;
    checks.push(
      "Real key attacks have finite motion on a non-interactive inner surface; the 42px pointer hit target stays fixed and key-up releases",
    );

    const black = key(61),
      blackBox = await black.boundingBox(),
      blackPoint = {
        x: blackBox.x + blackBox.width / 2,
        y: blackBox.y + blackBox.height / 2,
      };
    assert.equal(
      await hit(blackPoint),
      "61",
      "Black key remains above overlapping white keys",
    );
    await page.mouse.move(blackPoint.x, blackPoint.y);
    await page.mouse.down();
    await expect(black).toHaveClass(/pressed/);
    await expect(white).not.toHaveClass(/pressed/);
    stableBox(blackBox, await black.boundingBox(), "C-sharp hit target");
    await page.mouse.up();
    await expect(black).not.toHaveClass(/pressed/);
    await expect
      .poll(async () => playingAnimations(await animations(black)).length)
      .toBe(0);
    const gutterPoint = {
      x: whitePoint.x,
      y: whiteBox.y + whiteBox.height + 8,
    };
    assert.equal(
      await hit(gutterPoint),
      undefined,
      "Scrollbar gutter does not masquerade as a playable key",
    );
    checks.push(
      "Black keys retain their own hit targets and release state; the scrollbar gutter stays outside the playable surface",
    );

    const scoreBox = await page.locator(".reading-score").boundingBox(),
      transportBox = await page.locator(".reader-controls").boundingBox();
    await page
      .getByRole("button", { name: "Next passage", exact: true })
      .click();
    assert.equal(await position(), "16");
    const pageMotion = await animations(page.locator(".reading-sheet"));
    assert.ok(
      playingAnimations(pageMotion).length,
      "Passage navigation should have a visible entrance",
    );
    assert.ok(
      pageMotion.every((item) => item.finite),
      "Page motion must settle",
    );
    stableBox(
      scoreBox,
      await page.locator(".reading-score").boundingBox(),
      "Score frame",
    );
    stableBox(
      transportBox,
      await page.locator(".reader-controls").boundingBox(),
      "Transport",
    );
    // Both opening notes of Twinkle bar five are G4. Clicking the second onset
    // while the page is entering must seek beat 17, not the first G4 at beat 16.
    const second = page.locator(".reading-right .reading-note").nth(1);
    const noteBox = await second.boundingBox();
    await page.mouse.click(
      noteBox.x + noteBox.width / 2,
      noteBox.y + noteBox.height / 2,
    );
    await expect.poll(position).toBe("17");
    await expect
      .poll(
        async () =>
          playingAnimations(await animations(page.locator(".reading-sheet")))
            .length,
      )
      .toBe(0);
    measurements.pageMotion = pageMotion;
    checks.push(
      "Passage entrance is finite, leaves the score frame and transport still, and preserves the intended note seek during motion",
    );

    await startOver();
    await expect(white).toHaveClass(/lit/);
    await expect(white).not.toHaveClass(/pressed/);
    await expect
      .poll(async () => playingAnimations(await animations(white)).length)
      .toBe(0);
    await white.focus();
    // Actual keyboard navigation establishes :focus-visible modality; simply
    // focusing by script after a mouse click would not exercise that state.
    await page.keyboard.press("ArrowRight");
    await expect(black).toBeFocused();
    const focus = await black.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: parseFloat(style.outlineWidth),
        style: style.outlineStyle,
      };
    });
    assert.ok(
      focus.width > 0 && focus.style !== "none",
      "Keyboard focus must remain visible on the new material",
    );
    await page.locator("h1").click();
    await expect
      .poll(
        async () =>
          playingAnimations(await animations(page.locator(".reading-score")))
            .length,
      )
      .toBe(0);
    await page.screenshot({
      path: `evidence/${prefix}-desktop.png`,
      fullPage: true,
    });
    checks.push(
      "Upcoming keys stay quietly highlighted without endless attack motion; keyboard focus remains visible",
    );

    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("1");
    await startOver();
    await white.evaluate((button) => {
      const nodes = [],
        events = [];
      const record = (event) => {
        if (
          event.animationName !== "piano-resonance" ||
          !event.target.matches(".key-resonance")
        )
          return;
        let node = nodes.indexOf(event.target);
        if (node === -1) node = nodes.push(event.target) - 1;
        events.push({
          node,
          beat: +document.querySelector('[aria-label="Song position"]').value,
          retainedButton:
            button === document.querySelector('.piano-key[data-midi="60"]'),
        });
      };
      button.addEventListener("animationstart", record);
      window.__materialRepeated = {
        events,
        cleanup: () => button.removeEventListener("animationstart", record),
      };
    });
    await play().click();
    await pause().waitFor();
    await expect
      .poll(() => page.evaluate(() => window.__materialRepeated.events.length))
      .toBeGreaterThanOrEqual(2);
    await pause().click();
    const repeated = await page.evaluate(() => {
      const result = window.__materialRepeated.events.slice(0, 2);
      window.__materialRepeated.cleanup();
      delete window.__materialRepeated;
      return result;
    });
    assert.ok(repeated.every((event) => event.retainedButton));
    assert.notEqual(
      repeated[0].node,
      repeated[1].node,
      "The second contiguous C4 must have a fresh resonance identity",
    );
    assert.ok(
      repeated[0].beat >= 0 &&
        repeated[0].beat < 1 &&
        repeated[1].beat >= 1 &&
        repeated[1].beat < 2,
      `Both opening C4 onsets should trigger their own attack: ${JSON.stringify(repeated)}`,
    );
    await page
      .getByRole("button", { name: "Wait for me", exact: true })
      .click();
    await play().click();
    await pause().waitFor();
    assert.equal(await position(), "0");
    await expect(white).toHaveClass(/lit/);
    await expect(white).not.toHaveClass(/sounding|pressed/);
    assert.equal(
      await resonance.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
      "none",
      "A waiting target must not show an attack before input",
    );
    await page.keyboard.down("a");
    await expect.poll(position).toBe("1");
    await expect(white).toHaveClass(/sounding/);
    await page.keyboard.up("a");
    await pause().click();
    await page
      .getByRole("button", { name: "Listen & follow", exact: true })
      .click();
    measurements.repeatedNoteAttacks = repeated;
    checks.push(
      "Repeated listen-mode C4 notes retrigger separate resonance identities on the same key button; wait-mode targets only attack after actual input",
    );

    await page
      .getByRole("button", { name: "Next passage", exact: true })
      .click();
    assert.equal(await position(), "16");
    assert.ok(
      playingAnimations(await animations(page.locator(".reading-sheet")))
        .length,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(
        async () =>
          playingAnimations(await animations(page.locator(".reading-score")))
            .length,
      )
      .toBe(0);
    await page
      .getByRole("button", { name: "Previous passage", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Next passage", exact: true })
      .click();
    assert.equal(await position(), "16");
    assert.equal(
      playingAnimations(await animations(page.locator(".reading-score")))
        .length,
      0,
    );
    await startOver();
    await page
      .getByRole("button", { name: "Wait for me", exact: true })
      .click();
    await play().click();
    await pause().waitFor();
    await page.keyboard.down("a");
    await expect.poll(position).toBe("1");
    await expect(white).toHaveClass(/pressed/);
    assert.equal(
      await white
        .locator(".key-surface")
        .evaluate((element) => getComputedStyle(element).transform),
      "none",
    );
    assert.equal(playingAnimations(await animations(white)).length, 0);
    assert.equal(
      playingAnimations(await animations(page.locator(".reading-score")))
        .length,
      0,
    );
    assert.ok(
      await page.locator(".reading-current").count(),
      "Reduced motion retains the current note cue",
    );
    await page.keyboard.up("a");
    await expect(white).not.toHaveClass(/pressed/);
    await pause().click();
    await page.screenshot({
      path: `evidence/${prefix}-reduced-motion.png`,
      fullPage: true,
    });
    checks.push(
      "A live reduced-motion change cancels page motion and disables later page/key effects while retaining current-note cues, correct-input advancement and note release",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await startOver();
    const mobile = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      whiteWidth: document
        .querySelector('.piano-key[data-midi="60"]')
        .getBoundingClientRect().width,
      keys: document.querySelectorAll(".piano-key").length,
    }));
    assert.equal(mobile.overflow, false);
    assert.equal(mobile.keys, 88);
    assert.ok(Math.abs(mobile.whiteWidth - 42) < 0.75);
    measurements.mobile = mobile;
    await page.screenshot({
      path: `evidence/${prefix}-mobile.png`,
      fullPage: true,
    });
    checks.push(
      "390px layout keeps all 88 fixed-width keys in their viewport without document-wide horizontal overflow",
    );
    assert.deepEqual(errors, []);
    return {
      checks,
      errors,
      measurements,
      audioOutput: "Piano volume set to zero; physical hardware not required",
    };
  } finally {
    await page
      .evaluate(() => {
        window.__materialRepeated?.cleanup();
        delete window.__materialRepeated;
      })
      .catch(() => {});
    await page.mouse.up().catch(() => {});
    await page.keyboard.up("a").catch(() => {});
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
    page.off("pageerror", pageError);
  }
}
