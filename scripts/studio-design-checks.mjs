import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { setPianoVolume } from "./piano-volume.mjs";
import { openFromLibrary } from "./library-open.mjs";
import { colourChoice, inReadingSettings } from "./settings-ui.mjs";
import { companionChat } from "./maestro-checks.mjs";

const TITLE = "Evening study — four bars for the studio design check";
const FIXTURE = {
  id: "studio-design-study",
  title: TITLE,
  composer: "Luma QA",
  bpm: 60,
  tonic: 0,
  meter: 4,
  duration: 16,
  measures: 4,
  measureStarts: [0, 4, 8, 12],
  measureLengths: [4, 4, 4, 4],
  reviewed: true,
  warnings: [],
  notes: Array.from({ length: 16 }, (_, i) => ({
    id: `studio-${i}`,
    midi: [60, 62, 64, 65][i % 4],
    beat: i,
    duration: 0.8,
    hand: "right",
    velocity: 0.65,
  })),
};

export async function verifyStudioDesign(page, prefix = "studio-2.5") {
  const checks = [],
    measurements = {},
    errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const screen = (name) => page.getByRole("region", { name, exact: true });
  const dialog = (name) => page.getByRole("dialog", { name, exact: true });
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true });
  const position = () =>
    page.getByRole("slider", { name: "Song position" }).inputValue();
  const reached = (beat) =>
    page.waitForFunction(
      (beat) =>
        Number(document.querySelector('[aria-label="Song position"]').value) >=
        beat,
      beat,
    );
  const close = () => button("Close dialog").click();
  // Since 2.24 the daily goal is a row of minute pills (a group of pressed
  // buttons, SCR-9), not a select.
  const goalChoice = (minutes) =>
    page
      .getByRole("group", { name: "Daily practice goal", exact: true })
      .getByRole("button", { name: String(minutes), exact: true });
  // Since 2.33 the exercise hands and length are segmented buttons.
  const segment = (group, name) =>
    page
      .getByRole("group", { name: group, exact: true })
      .getByRole("button", { name, exact: true });
  // Since 2.33 the levels are cards ("Level 4: Both hands, long bass notes,
  // Both hands"), pressed when selected, rather than a combobox.
  const levelCard = (level) =>
    screen("Exercises").getByRole("button", {
      name: new RegExp(`^Level ${level}:`),
    });
  const shot = async (name) => {
    // Capture the settled design, retaining the app's real motion during checks.
    // Native view transitions and CSS entry motion may still run after a click.
    if (await button("Dismiss notification").count())
      await button("Dismiss notification").click();
    await page.locator(".modal").evaluateAll((panels) => {
      for (const panel of panels)
        panel.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
    await page.waitForTimeout(550);
    return page.screenshot({
      path: `evidence/${prefix}-${name}.png`,
      fullPage: false,
    });
  };
  const go = async (name) => {
    await nav(name).click();
    await expect(nav(name)).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".app")).toHaveAttribute(
      "data-screen",
      name.toLowerCase(),
    );
  };
  const bounds = async (name, locator = page.locator(".app-main")) => {
    const result = await locator.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        width: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        left: rect.left,
        right: rect.right,
        client: el.clientWidth,
        scroll: el.scrollWidth,
      };
    });
    assert.ok(
      result.pageWidth <= result.width + 1,
      `${name}: document overflows ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.left >= -1 && result.right <= result.width + 1,
      `${name}: panel exceeds viewport ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.scroll <= result.client + 1,
      `${name}: panel content overflows ${JSON.stringify(result)}`,
    );
    measurements[name] = result;
  };
  const readableOnPanel = async (name, locator) => {
    const colors = await locator.evaluate((el) => ({
      foreground: getComputedStyle(el).color,
      background: getComputedStyle(el.closest(".modal, .exercise-panel"))
        .backgroundColor,
    }));
    const luminance = (css) => {
      const values = css
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const a = luminance(colors.foreground),
      b = luminance(colors.background);
    const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    measurements[name] = { ...colors, contrast };
    assert.ok(
      contrast >= 4.5,
      `${name}: text contrast ${contrast.toFixed(2)} on panel`,
    );
  };
  const assertDialogKeyboard = async (name, trigger) => {
    const d = dialog(name);
    await expect(d).toBeVisible();
    assert.equal(await page.locator(".app-main").getAttribute("inert"), "");
    await d.getByRole("button", { name: "Close dialog", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await d.evaluate((el) => el.contains(document.activeElement)),
      true,
    );
    await page.keyboard.press("Tab");
    await expect(
      d.getByRole("button", { name: "Close dialog", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("a");
    assert.equal(await page.locator(".piano-key.pressed").count(), 0);
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(trigger).toBeFocused();
  };
  // Since 2.13 the Library (and since 2.31 Progress) greets with the chosen
  // companion's interactive portrait (LibraryCompanion) and a "Talk with
  // <name>" button, where a decorative aria-hidden .studio-companion scene
  // used to sit.
  const libraryCompanion = () =>
    screen("Library").locator(".library-companion-visit");
  // Since 2.23, with "Companion follows me" on (the default), the roaming
  // companion (.buddy) is the figure on screen and the painted header
  // portrait steps aside (contract C3, html[data-buddy="on"]); both show the
  // chosen companion.
  const expectRoamingCompanion = async (id) => {
    await expect(page.locator(".buddy")).toHaveAttribute("data-character", id);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.buddy), {
        timeout: 15000,
      })
      .toBe("on");
    await expect(page.locator(".buddy .buddy-hit")).toBeVisible();
    await expect(
      libraryCompanion().locator(".companion-presence"),
    ).toBeHidden();
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(button("Play")).toBeEnabled();
    // Since 2.39 the app opens on Practice; a fresh library also shows the
    // first-run welcome there, which can be dismissed.
    await expect(page.locator(".app")).toHaveAttribute(
      "data-screen",
      "practice",
    );
    await expect(button("Dismiss welcome")).toBeVisible();
    await button("Dismiss welcome").click();
    await expect(button("Dismiss welcome")).toHaveCount(0);
    await setPianoVolume(page);
    await go("Library");
    await expect(screen("Library").locator(".empty-state")).toBeVisible();
    assert.ok(
      (await screen("Library").locator(".piece-row").count()) > 0,
      "starter pieces remain available",
    );
    const companionId = await page
      .locator(".app")
      .getAttribute("data-companion");
    await expect(
      libraryCompanion().locator(".companion-presence"),
    ).toHaveAttribute("data-character", companionId);
    await expect(screen("Library").locator(".companion-presence")).toHaveCount(
      1,
    );
    const companionName = (
      await libraryCompanion()
        .locator(".library-companion-talk span")
        .innerText()
    ).trim();
    await expect(button(`Talk with ${companionName}`)).toBeVisible();
    await expectRoamingCompanion(companionId);
    await bounds("library-empty-desktop", screen("Library"));
    await shot("library-empty-desktop");
    await go("Progress");
    await expect(screen("Progress").locator(".piece-progress li")).toHaveCount(
      0,
    );
    await expect(
      screen("Progress").locator(".panel-empty").first(),
    ).toBeVisible();
    await bounds("progress-empty-desktop", screen("Progress"));
    await shot("progress-empty-desktop");
    checks.push(
      "Fresh start opens Practice with a dismissible welcome; Library offers starter pieces, an import action and the current companion with its Talk button; Progress has a usable empty state without fabricated practice.",
    );

    await button("Import a score").click();
    await expect(
      dialog("Import a score").getByRole("button", {
        name: "Choose a file",
        exact: true,
      }),
    ).toBeVisible();
    await bounds("import-desktop", dialog("Import a score"));
    await shot("import-desktop");
    await assertDialogKeyboard("Import a score", button("Import a score"));
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}-study.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(FIXTURE)),
    });
    await expect(dialog("Review score")).toBeVisible();
    await readableOnPanel(
      "review-cell-contrast",
      dialog("Review score").locator("td").first(),
    );
    await shot("review-desktop");
    await close();
    await go("Library");
    const search = page.getByRole("textbox", {
      name: "Find a piece",
      exact: true,
    });
    await search.fill("studio design check");
    await expect(screen("Library").locator(".piece-row")).toHaveCount(1);
    await expect(screen("Library").locator(".piece-row h3")).toHaveText(TITLE);
    await search.fill("no-such-studio-piece-91837");
    await expect(screen("Library").locator(".piece-row")).toHaveCount(0);
    await expect(screen("Library").locator(".empty-state")).toBeVisible();
    await shot("library-no-results-desktop");
    // The no-results state offers its own way back: Clear filters.
    await screen("Library")
      .locator(".empty-state")
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    assert.ok(
      (await screen("Library").locator(".piece-row").count()) > 1,
      "Clear filters brings the collection back",
    );
    await search.fill("studio design check");
    // Since 2.13 a Library card opens from its title ("Open <title>").
    await openFromLibrary(page, TITLE);
    await expect(page.locator(".app")).toHaveAttribute(
      "data-screen",
      "practice",
    );
    checks.push(
      "Import, score review, search, no-results recovery (Clear filters) and opening the matching score remain functional.",
    );

    await button("Reading settings").click();
    for (const name of ["Count me in", "Metronome"]) {
      const toggle = page.getByRole("switch", { name, exact: true });
      if ((await toggle.getAttribute("aria-checked")) === "true")
        await toggle.click();
    }
    await goalChoice(10).click();
    await expect(goalChoice(10)).toHaveAttribute("aria-pressed", "true");
    // Since 2.27 the colour themes are the "Colours" choices (Neutral, five
    // palettes, Match companion); a palette applies as theme-<id>.
    await colourChoice(page, "Ocean").click();
    await expect(colourChoice(page, "Ocean")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".app")).toHaveClass(/theme-ocean/);
    await bounds("settings-desktop", dialog("Settings"));
    await shot("settings-desktop");
    await assertDialogKeyboard("Settings", button("Reading settings"));
    await page.evaluate(async () => window.lumaFlushPreferences?.());
    await page.reload();
    await expect(button("Play")).toBeEnabled();
    await expect(page.locator(".app")).toHaveClass(/theme-ocean/);
    await expect(page.locator(".app")).toHaveAttribute(
      "data-colours",
      "custom",
    );
    const mochi = companionChat(page, "Mochi");
    await inReadingSettings(page, async (settings) => {
      await expect(goalChoice(10)).toHaveAttribute("aria-pressed", "true");
      await colourChoice(page, "Sage").click();
      await expect(page.locator(".app")).toHaveClass(/theme-mint/);
      // As chooseCompanion (settings-ui.mjs) does, with a capture of the
      // salon before choosing.
      await settings
        .getByRole("button", { name: "Companions", exact: true })
        .click();
      const salon = dialog("Companions");
      await expect(salon).toBeVisible();
      const preview = salon.getByRole("button", { name: /^Preview Mochi,/ });
      await preview.click();
      await expect(preview).toHaveAttribute("aria-pressed", "true");
      await shot("companions-desktop");
      await salon.getByRole("button", { name: "Choose Mochi" }).click();
      await expect(salon).toBeHidden();
    });
    await expect(page.locator(".app")).toHaveAttribute(
      "data-companion",
      "bunny",
    );
    // A fixed palette stays fixed when the companion changes (2.27).
    await expect(page.locator(".app")).toHaveClass(/theme-mint/);
    // Choosing a companion opens its chat, docked since 2.17.
    await expect(mochi.dock()).toBeVisible();
    await mochi.close();
    await go("Library");
    await expect(
      libraryCompanion().locator(".companion-presence"),
    ).toHaveAttribute("data-character", "bunny");
    await expect(button("Talk with Mochi")).toBeVisible();
    await expectRoamingCompanion("bunny");
    await go("Exercises");
    await expect(
      screen("Exercises").locator(".studio-companion .companion-bunny"),
    ).toHaveCount(1);
    await expect(button("Talk to Mochi")).toBeVisible();
    await go("Practice");
    await button("Reading settings").click();
    await expect(goalChoice(10)).toHaveAttribute("aria-pressed", "true");
    await button("Reading guide").click();
    await readableOnPanel(
      "reading-guide-contrast",
      dialog("How to read with Luma Keys").locator(".guide-grid p").first(),
    );
    await bounds("reading-guide-desktop", dialog("How to read with Luma Keys"));
    await shot("reading-guide-desktop");
    await page.keyboard.press("Escape");
    await expect(dialog("How to read with Luma Keys")).toHaveCount(0);
    checks.push(
      "Goal/colours survive reload; companion selection reaches the docked chat and the Library and Exercises illustrations; Settings, Import and Reading guide remain readable and keyboard-accessible.",
    );

    await button("Listen & follow").click();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("0.5");
    await page.getByRole("slider", { name: "Song position" }).fill("4");
    await button("Play").click();
    await expect(button("Pause")).toBeVisible();
    await page.waitForTimeout(3300); // A real >3s practice session is required by the journal.
    await button("Pause").click();
    assert.ok(Number(await position()) >= 4 && Number(await position()) < 8);
    await go("Library");
    await page
      .getByRole("textbox", { name: "Find a piece", exact: true })
      .fill("");
    await expect(screen("Library").locator(".continue-card")).toContainText(
      TITLE,
    );
    await expect(button("Continue at bar 2")).toBeVisible();
    await shot("library-populated-desktop");
    await button("Continue at bar 2").click();
    await expect.poll(position).toBe("4");
    await go("Progress");
    const row = screen("Progress")
      .locator(".piece-progress li")
      .filter({ hasText: TITLE });
    await expect(row).toHaveCount(1);
    // The row's Continue button is named for the piece and its saved bar.
    const resume = row.getByRole("button", {
      name: `Continue ${TITLE} at bar 2`,
      exact: true,
    });
    await expect(resume).toBeVisible();
    await bounds("progress-populated-desktop", screen("Progress"));
    await shot("progress-populated-desktop");
    await resume.click();
    await expect.poll(position).toBe("4");
    checks.push(
      "A real muted practice session populates Library and Progress; both Continue actions reopen the saved second bar.",
    );

    await go("Exercises");
    await levelCard(4).click();
    await expect(levelCard(4)).toHaveAttribute("aria-pressed", "true");
    await expect(
      screen("Exercises").locator(".exercise-detail-level"),
    ).toHaveText("Level 4");
    await segment("Exercise hands", "Right").click();
    await expect(segment("Exercise hands", "Right")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await segment("Exercise length", "4").click();
    await expect(segment("Exercise length", "4")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Since 2.33 key, meter and tempo sit under the Customize disclosure.
    await screen("Exercises").locator(".exercise-customize > summary").click();
    await page
      .getByRole("combobox", { name: "Exercise tempo mode", exact: true })
      .selectOption("custom");
    const tempo = page.getByRole("spinbutton", {
      name: "Exercise tempo",
      exact: true,
    });
    // A whole value in range applies as typed (DraftNumber); Enter would
    // submit the exercise form and start it.
    await tempo.fill("72");
    await expect(
      screen("Exercises").locator(".exercise-settings-summary"),
    ).toContainText("♩ 72");
    await readableOnPanel(
      "exercise-summary-contrast",
      page.locator(".exercise-summary"),
    );
    await bounds("exercises-desktop", screen("Exercises"));
    await shot("exercises-desktop");
    await button("Start exercise").click();
    await expect(page.locator(".app")).toHaveAttribute(
      "data-screen",
      "practice",
    );
    await expect(page.locator(".reader-exercise-line")).toContainText(
      /level 4/i,
    );
    await expect(page.locator(".piece-count-detail")).toHaveText("4 bars");
    await expect(button("Play")).toBeEnabled();
    checks.push(
      "Exercise level, hand, length and custom tempo remain selectable and Start exercise opens a playable generated score of that level and length.",
    );

    await go("Library");
    await page
      .getByRole("textbox", { name: "Find a piece", exact: true })
      .fill("studio design check");
    await openFromLibrary(page, TITLE);
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    if (await button("Show keyboard guide").count())
      await button("Show keyboard guide").click();
    await expect(page.locator(".piano-key")).toHaveCount(88);
    await expect(page.locator(".studio-companion")).toHaveCount(0);
    const practice = await page.evaluate(() => {
      const key = document
        .querySelector(".piano-key.white")
        .getBoundingClientRect();
      return {
        playBottom: document
          .querySelector(".play-button")
          .getBoundingClientRect().bottom,
        keyWidth: key.width,
        // The key bed's key row, which the stage measures for the hands.
        keyLength:
          document.querySelector(".key-bed > .piano-keys")?.clientHeight ??
          key.height,
        hands: document
          .querySelector('[aria-label="Hands"]')
          ?.getAttribute("aria-pressed"),
        keyCount: document.querySelectorAll(".piano-key").length,
      };
    });
    assert.ok(
      practice.playBottom <= 800,
      `Play clipped: ${practice.playBottom}`,
    );
    // Since 2.30 the white keys are capped by the 3-D hands' proportions
    // (at most key length / 4.5, about 28 px at 1280×800) instead of
    // growing to 40 px; 20 px is the stage's desktop minimum.
    assert.ok(practice.keyWidth >= 20, `Keys squeezed: ${practice.keyWidth}`);
    if (practice.hands === "true")
      assert.ok(
        practice.keyWidth <= practice.keyLength / 4.5 + 0.5,
        `Keys wider than the hands allow: ${JSON.stringify(practice)}`,
      );
    await bounds("practice-desktop");
    measurements.practice = practice;
    await shot("practice-desktop");
    await button("Play in time").click();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("1.25");
    const song = page.getByRole("slider", { name: "Song position" });
    // Since 2.24 a short early stop in Play in time is a pause with a notice,
    // not a report card (a card needs ≥8 judged notes over ≥2 bars, or a
    // completed run).
    await song.fill("0");
    await button("Play").click();
    await reached(1.1);
    await button("Pause").click();
    await expect(page.locator(".toast-text")).toContainText(
      /^Paused at bar 1\. Space plays on from here\./,
    );
    await expect(page.locator(".results-dialog")).toHaveCount(0);
    // A real timed run over three bars produces the readable report.
    await song.fill("0");
    await button("Play").click();
    await reached(9.5);
    await button("Pause").click();
    await expect(page.locator(".results-dialog")).toBeVisible();
    await expect(
      page.locator(".results-dialog .report-sentence"),
    ).toContainText(/\d+ of \d+/);
    await expect(page.locator(".results-note")).toContainText(
      "This card covers",
    );
    // Since 2.24 the card's figures are rings and one sentence
    // (.report-sentence) rather than a .results-summary list; an early stop's
    // card is "a first look" with a .results-note naming the bars it covers.
    await readableOnPanel(
      "results-metric-contrast",
      page.locator(".results-dialog .report-sentence"),
    );
    await readableOnPanel(
      "results-note-contrast",
      page.locator(".results-note"),
    );
    await shot("report-desktop");
    await close();
    await button("Listen & follow").click();
    checks.push(
      "The 1280×800 practice view retains all 88 keyboard controls at the hands' proportions and reachable Play; a short timed stop is a pause, and a real three-bar timed run produces a readable report.",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ["Library", "Exercises", "Progress"]) {
      await go(name);
      if (name === "Library")
        await page
          .getByRole("textbox", { name: "Find a piece", exact: true })
          .fill("");
      await bounds(`${name.toLowerCase()}-mobile`, screen(name));
      await shot(`${name.toLowerCase()}-mobile`);
    }
    await button("Reading settings").click();
    await bounds("settings-mobile", dialog("Settings"));
    await goalChoice(15).click();
    await expect(goalChoice(15)).toHaveAttribute("aria-pressed", "true");
    await shot("settings-mobile");
    await close();
    await button("Import a score").click();
    await bounds("import-mobile", dialog("Import a score"));
    await expect(
      dialog("Import a score").getByRole("button", {
        name: "Choose a file",
        exact: true,
      }),
    ).toBeVisible();
    await shot("import-mobile");
    await page.keyboard.press("Escape");
    checks.push(
      "Library, Exercises, Progress, Settings and Import fit 390px; the mobile goal control and file entry remain usable.",
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await go("Library");
    await page.waitForTimeout(350);
    assert.equal(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      true,
    );
    const movingDecor = await screen("Library").evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter(
          (a) =>
            a.playState === "running" &&
            a.effect?.getTiming().iterations === Infinity,
        )
        .map((a) => a.animationName || "anonymous"),
    );
    assert.deepEqual(
      movingDecor,
      [],
      "Reduced motion must stop perpetual decorative motion",
    );
    await nav("Exercises").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".app")).toHaveAttribute(
      "data-screen",
      "exercises",
    );
    await levelCard(2).focus();
    await page.keyboard.press("Enter");
    await expect(levelCard(2)).toHaveAttribute("aria-pressed", "true");
    await expect(
      screen("Exercises").locator(".exercise-detail-level"),
    ).toHaveText("Level 2");
    assert.ok(
      !/NaN|\[object Object\]/.test(await page.locator("body").innerText()),
    );
    assert.deepEqual(errors, []);
    checks.push(
      "Live reduced-motion mode stops perpetual decoration, while keyboard navigation and exercise controls keep working without renderer errors.",
    );
    return { checks, measurements, errors };
  } catch (error) {
    error.studioEvidence = { checks, measurements, errors };
    throw error;
  } finally {
    page.off("pageerror", onError);
    await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => {});
  }
}
