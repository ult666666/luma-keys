import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { setPianoVolume } from "./piano-volume.mjs";
import { connectMidi } from "./piano-input.mjs";
import { setLoopRange } from "./practice-tools.mjs";
import { companionChat } from "./maestro-checks.mjs";

const PROFILES = [
  { id: "beethoven", name: "Beethoven", theme: "walnut", room: "room" },
  { id: "langlang", name: "Lang Lang", theme: "ocean", room: "hall" },
  { id: "mozart", name: "Mozart", theme: "lavender", room: "dry" },
  { id: "liszt", name: "Liszt", theme: "rose", room: "hall" },
  { id: "cat", name: "Luma", theme: "mint", room: "room" },
  { id: "bunny", name: "Mochi", theme: "rose", room: "room" },
];
const TITLE = "QA companion practice preservation";
const FIXTURE = {
  id: "companion-practice",
  title: TITLE,
  composer: "Luma QA",
  bpm: 60,
  tonic: 0,
  meter: 4,
  duration: 24,
  measures: 6,
  reviewed: true,
  warnings: [],
  notes: Array.from({ length: 24 }, (_, i) => ({
    id: `companion-note-${i}`,
    midi: [60, 62, 64, 65][i % 4],
    beat: i,
    duration: 0.8,
    hand: "right",
    velocity: 0.65,
  })),
};

export async function verifyCompanions(page, prefix = "companion-2.7") {
  const checks = [],
    measurements = {},
    errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  // Modal dialogs (Settings, Review score, the Companions salon). The dock's
  // Options popover is also role="dialog", so match the modal itself.
  const dialog = () => page.locator('.modal[role="dialog"]');
  const salon = () =>
    page.getByRole("dialog", { name: "Companions", exact: true });
  // Salon cards are named "Preview <name>, <tagline>".
  const preview = (name) =>
    page.getByRole("button", { name: new RegExp(`^Preview ${name},`) });
  const app = () => page.locator(".app");
  const current = async () => {
    const id = await app().getAttribute("data-companion");
    const p = PROFILES.find((p) => p.id === id);
    assert.ok(p, `Unknown selected companion: ${id}`);
    return p;
  };
  const prefs = () =>
    page.evaluate(async () => {
      await window.lumaFlushPreferences?.();
      return (await fetch("/api/preferences")).json();
    });
  const scores = () =>
    page.evaluate(async () => (await fetch("/api/scores")).json());
  const snapshot = () =>
    page.evaluate(() => ({
      title: document.querySelector(".piece-info h1")?.textContent,
      beat: document.querySelector('[aria-label="Song position"]')?.value,
      speed: document.querySelector("select#speed")?.value,
      hand: document
        .querySelector('[aria-label="Practice hand"] [aria-checked="true"]')
        ?.className.match(/hand-(\w+)/)?.[1],
      mode: [
        ...document.querySelectorAll('[aria-label="Practice mode"] button'),
      ].find((el) => el.classList.contains("selected"))?.textContent,
      loop: document
        .querySelector('[aria-label="Toggle phrase loop"]')
        ?.getAttribute("aria-pressed"),
      from: document.querySelector('[aria-label="Loop start bar"]')?.value,
      to: document.querySelector('[aria-label="Loop end bar"]')?.value,
      playing: window.lumaClock().playing,
    }));
  // (Since 2.27 the app's colours are a reading choice, reading.colours:
  // "neutral" (the default, also for files from before it), a custom palette,
  // or "companion" ("Match <name>"). companionStyle is only a legacy mirror of
  // colours === "companion", and the top-level theme only mirrors a custom
  // palette, so the profile is read from colours, not from theme.)
  const profileState = async () => {
    const p = await prefs();
    return {
      id: p.reading.companion,
      colours: p.reading.colours,
      style: p.reading.companionStyle,
      room: p.reading.room,
    };
  };
  const close = async () => {
    if (await dialog().count()) await button("Close dialog").click();
    await expect(dialog()).toHaveCount(0);
  };
  // (Since 2.17 the assistant is the docked chat, named "<name> companion".)
  const chatFor = (p) => companionChat(page, p.name);
  const openAssistant = async () => {
    const chat = chatFor(await current());
    await chat.open();
    return chat;
  };
  const closeAssistant = async () => chatFor(await current()).close();
  // (Since 2.17 "Change companion" lives in the dock's Options menu.)
  const openSalon = async () => {
    const chat = await openAssistant();
    await chat.control("options").click();
    await chat
      .dock()
      .getByRole("button", { name: /^(Change companion|换个伙伴|換個夥伴)$/ })
      .click();
    await expect(salon()).toBeVisible();
    return chat;
  };
  // Choosing closes the salon and opens the dock for the new companion.
  const choose = async (p, sound = true) => {
    await openSalon();
    await preview(p.name).click();
    await page
      .getByRole("checkbox", { name: "Match piano sound", exact: true })
      .setChecked(sound);
    await button(`Choose ${p.name}`).click();
    await expect(salon()).toHaveCount(0);
    await expect(chatFor(p).dock()).toBeVisible();
    await chatFor(p).close();
  };
  // Settings › Colours: Neutral, Sage, Lavender, Rose, Ocean, Walnut or
  // "Match <companion>". Exactly one choice is pressed.
  const pickColours = async (name) => {
    await button("Reading settings").click();
    const group = page.getByRole("group", { name: "Colours", exact: true });
    await group.getByRole("button", { name, exact: true }).click();
    await expect(
      group.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
    await close();
  };
  const send = (data) =>
    page.evaluate((data) => window.__inputQA.a.onmidimessage({ data }), data);
  const shot = async (name, resetScroll = true) => {
    if (await button("Dismiss notification").count())
      await button("Dismiss notification").click();
    if (resetScroll)
      await dialog().evaluateAll((ds) =>
        ds.forEach((d) => d.scrollTo({ top: 0, behavior: "instant" })),
      );
    await page.waitForTimeout(550);
    await page.screenshot({
      path: `evidence/${prefix}-${name}.png`,
      fullPage: false,
    });
  };
  const contrast = async (name, locator) => {
    const colors = await locator.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const rgba = (css) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const foreground = rgba(getComputedStyle(el).color);
      let parent = el,
        background;
      while (parent) {
        background = rgba(getComputedStyle(parent).backgroundColor);
        if (background[3] >= 254) break;
        parent = parent.parentElement;
      }
      return { foreground, background };
    });
    const luminance = (rgb) =>
      rgb
        .slice(0, 3)
        .map((v) => v / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(colors.foreground),
      b = luminance(colors.background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    measurements[name] = { ...colors, ratio };
    assert.ok(
      ratio >= 4.5,
      `${name}: normal text contrast ${ratio.toFixed(2)}`,
    );
  };
  const bounds = async (name) => {
    const info = await page.evaluate(() => {
      const d = document.querySelector('.modal[role="dialog"]');
      const r = d?.getBoundingClientRect();
      return {
        width: innerWidth,
        page: document.documentElement.scrollWidth,
        dialog: r && {
          left: r.left,
          right: r.right,
          client: d.clientWidth,
          scroll: d.scrollWidth,
        },
        cards: [...document.querySelectorAll(".salon-choice")].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width };
        }),
      };
    });
    assert.ok(
      info.page <= info.width + 1,
      `${name}: page overflows ${JSON.stringify(info)}`,
    );
    if (info.dialog) {
      assert.ok(
        info.dialog.left >= -1 && info.dialog.right <= info.width + 1,
        `${name}: dialog exceeds viewport`,
      );
      assert.ok(
        info.dialog.scroll <= info.dialog.client + 1,
        `${name}: dialog content overflows`,
      );
    }
    assert.ok(
      info.cards.every(
        (c) => c.left >= 0 && c.right <= info.width + 1 && c.width >= 44,
      ),
      `${name}: companion choices clipped or too small`,
    );
    measurements[name] = info;
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(button("Play")).toBeEnabled();
    await setPianoVolume(page);
    await button("Reading settings").click();
    for (const name of ["Count me in", "Metronome"]) {
      const toggle = page.getByRole("switch", { name, exact: true });
      if ((await toggle.getAttribute("aria-checked")) === "true")
        await toggle.click();
    }
    await close();
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(FIXTURE)),
    });
    await expect(
      page.getByRole("dialog", { name: "Review score", exact: true }),
    ).toBeVisible();
    await close();
    await button("Wait for me").click();
    await page
      .getByRole("radiogroup", { name: "Practice hand", exact: true })
      .locator(".hand-right")
      .click();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("0.65");
    // (The repeat range lives in Practice tools since 2.39.)
    if (
      (await button("Toggle phrase loop").getAttribute("aria-pressed")) !==
      "true"
    )
      await button("Toggle phrase loop").click();
    await setLoopRange(page, 2, 4);
    await page.getByRole("slider", { name: "Song position" }).fill("10");
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const musical = await snapshot(),
      savedScores = await scores();
    assert.equal(musical.beat, "10");
    const original = await profileState();
    assert.deepEqual(original, {
      id: "beethoven",
      colours: "neutral",
      style: false,
      room: "room",
    });
    await openSalon();
    await expect(
      page.getByRole("checkbox", { name: "Match piano sound", exact: true }),
    ).toBeChecked();
    for (const p of PROFILES) {
      await preview(p.name).click();
      await expect(preview(p.name)).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".companion-salon")).toHaveAttribute(
        "data-preview",
        p.id,
      );
      await expect(button(`Choose ${p.name}`)).toBeEnabled();
      assert.deepEqual(
        await profileState(),
        original,
        `Preview ${p.name} saved changes before Choose`,
      );
      assert.deepEqual(
        await snapshot(),
        musical,
        `Preview ${p.name} changed practice`,
      );
    }
    await preview("Mozart").click();
    await bounds("salon-desktop");
    await shot("salon-preview-mozart");
    await page.keyboard.press("Escape");
    await expect(salon()).toHaveCount(0);
    assert.deepEqual(await profileState(), original);
    assert.deepEqual(await snapshot(), musical);
    await expect(app()).toHaveAttribute("data-companion", "beethoven");
    checks.push(
      "All six companions preview without changing saved appearance, room or practice; cancel discards the preview.",
    );

    // (Since 2.27 choosing a companion never recolours the app on its own:
    // with the default neutral colours only the avatar, name and room change.)
    await choose(PROFILES[2]); // Mozart: Dry.
    await expect(button("Mozart")).toBeVisible();
    await expect(app()).toHaveAttribute("data-companion", "mozart");
    await expect(app()).toHaveAttribute("data-companion-style", "neutral");
    await expect(app()).toHaveClass(/\btheme-neutral\b/);
    assert.deepEqual(await profileState(), {
      id: "mozart",
      colours: "neutral",
      style: false,
      room: "dry",
    });
    assert.deepEqual(await snapshot(), musical);
    // "Match Mozart" lends the companion's room palette, and from then on
    // every companion chosen brings its own room.
    await pickColours("Match Mozart");
    await expect(app()).toHaveAttribute("data-companion-style", "mozart");
    await expect(app()).toHaveClass(/\btheme-lavender\b/);
    const palette = {};
    for (const p of PROFILES) {
      await choose(p);
      await expect(button(p.name)).toBeVisible();
      await expect(app()).toHaveAttribute("data-companion", p.id);
      await expect(app()).toHaveAttribute("data-companion-style", p.id);
      await expect(app()).toHaveClass(new RegExp(`\\btheme-${p.theme}\\b`));
      await expect(
        button(p.name).locator(`[data-character="${p.id}"]`),
      ).toHaveCount(1);
      assert.deepEqual(await profileState(), {
        id: p.id,
        colours: "companion",
        style: true,
        room: p.room,
      });
      assert.deepEqual(
        await snapshot(),
        musical,
        `Choosing ${p.name} changed the reading state`,
      );
      await expect(button("Wait for me")).toHaveClass(/selected/);
      assert.deepEqual(
        await scores(),
        savedScores,
        `Choosing ${p.name} changed library data`,
      );
      palette[p.id] = await app().evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        chrome: getComputedStyle(el.querySelector(".app-bar")).backgroundColor,
        controls: getComputedStyle(el.querySelector(".control-dock"))
          .backgroundColor,
      }));
    }
    assert.equal(
      new Set(PROFILES.slice(0, 4).map((p) => JSON.stringify(palette[p.id])))
        .size,
      4,
      "The four artist rooms must produce distinct visible palettes",
    );
    measurements.palettes = palette;
    checks.push(
      "With neutral colours a new companion changes only avatar, name and room; after “Match <companion>” every companion brings its complete room palette and requested reverb, always preserving the score, exact beat, phrase, hand, speed and paused mode.",
    );

    await choose(PROFILES[2]); // Mozart: Dry.
    await choose(PROFILES[3], false); // Liszt palette, keep Dry.
    assert.deepEqual(await profileState(), {
      id: "liszt",
      colours: "companion",
      style: true,
      room: "dry",
    });
    await expect(app()).toHaveClass(/\btheme-rose\b/);
    await button("Reading settings").click();
    await expect(
      page
        .getByRole("group", { name: "Piano room" })
        .getByRole("button", { name: "Dry", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await close();
    // (The old "Colour theme" group is now Settings › Colours.)
    await pickColours("Ocean");
    assert.deepEqual(await profileState(), {
      id: "liszt",
      colours: "ocean",
      style: false,
      room: "dry",
    });
    assert.equal(
      (await prefs()).theme,
      "ocean",
      "A custom palette keeps the legacy top-level theme pointing at it",
    );
    await expect(app()).toHaveAttribute("data-companion-style", "custom");
    await expect(app()).toHaveClass(/\btheme-ocean\b/);
    // (Since 2.27 choosing the companion again keeps the reader's custom
    // palette; only "Match Liszt" — formerly "Restore Liszt's colours" —
    // brings the companion's colours back.)
    await choose(PROFILES[3], false);
    assert.deepEqual(await profileState(), {
      id: "liszt",
      colours: "ocean",
      style: false,
      room: "dry",
    });
    await expect(app()).toHaveClass(/\btheme-ocean\b/);
    await pickColours("Match Liszt");
    assert.deepEqual(await profileState(), {
      id: "liszt",
      colours: "companion",
      style: true,
      room: "dry",
    });
    await expect(app()).toHaveAttribute("data-companion-style", "liszt");
    await expect(app()).toHaveClass(/\btheme-rose\b/);
    assert.deepEqual(await snapshot(), musical);
    checks.push(
      "Disabling Match piano sound retains Dry; a custom palette overrides the companion's and survives choosing the companion again, and “Match Liszt” restores its colours, all without altering practice.",
    );

    const persisted = await profileState();
    const beforeReload = await prefs();
    await page.reload();
    await expect(button("Play")).toBeEnabled();
    await expect(button("Liszt")).toBeVisible();
    assert.deepEqual(await profileState(), persisted);
    await expect(app()).toHaveClass(/\btheme-rose\b/);
    const afterReload = await prefs();
    for (const k of ["speed", "hand", "mode", "labels", "tonic", "last"])
      assert.deepEqual(
        afterReload.reading[k],
        beforeReload.reading[k],
        `Reload changed ${k}`,
      );
    await expect(page.locator(".piece-info h1")).toHaveText(TITLE);
    await expect(button("Wait for me")).toHaveClass(/selected/);
    assert.deepEqual(await scores(), savedScores);
    const liszt = await openAssistant();
    await expect(liszt.dock()).toBeVisible();
    await expect(liszt.dock().getByRole("heading", { level: 2 })).toContainText(
      "Liszt",
    );
    await expect(
      page.getByRole("textbox", { name: "Ask Liszt", exact: true }),
    ).toBeVisible();
    await shot("liszt-assistant");
    await closeAssistant();
    checks.push(
      "The selected companion, custom room choice, colour choice and saved musical controls restore after reload with a correctly named assistant.",
    );

    await connectMidi(page, "QA piano A");
    // The input status button; main is inert (hidden from roles) under a modal.
    const midiStatus = page.locator(".midi-status");
    await page.locator(".piece-info h1").click();
    await page.keyboard.down("a");
    await send([144, 67, 100]);
    await send([176, 64, 127]);
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    // (Since 2.17 the salon opens from the docked chat, and opening the dock
    // already releases held notes. The dock is not modal, so a MIDI keyboard
    // still sounds beside it: hold a MIDI note and the pedal there and check
    // that opening the salon itself releases them.)
    const lisztChat = await openAssistant();
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    await page.keyboard.up("a");
    await lisztChat.control("options").click();
    await send([144, 67, 100]);
    await send([176, 64, 127]);
    await expect(page.locator('.piano-key[data-midi="67"]')).toHaveClass(
      /pressed/,
    );
    await expect(midiStatus).toContainText("sustain");
    await lisztChat
      .dock()
      .getByRole("button", { name: /^(Change companion|换个伙伴|換個夥伴)$/ })
      .click();
    await expect(salon()).toBeVisible();
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    await expect(midiStatus).not.toContainText("sustain");
    const guarded = await snapshot();
    const soundStarts = await page.evaluate(() => window.__inputQA.starts);
    await preview("Lang Lang").focus();
    await page.keyboard.press("a");
    await page.keyboard.press("n");
    await page.keyboard.press("[");
    await send([144, 72, 90]);
    await send([176, 64, 127]);
    await page.waitForTimeout(80);
    assert.equal(
      await page.evaluate(() => window.__inputQA.starts),
      soundStarts,
    );
    assert.deepEqual(await snapshot(), guarded);
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(preview("Lang Lang")).toHaveAttribute("aria-pressed", "true");
    await button("Close dialog").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await salon().evaluate((el) => el.contains(document.activeElement)),
      true,
    );
    await page.keyboard.press("Tab");
    await expect(button("Close dialog")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(salon()).toHaveCount(0);
    // (Escape returns to the chat the salon was opened from: the dock comes
    // back and its message box takes focus.)
    await expect(lisztChat.input()).toBeFocused();
    await send([128, 67, 0]);
    await send([128, 72, 0]);
    await send([176, 64, 0]);
    await send([144, 60, 90]);
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    await send([128, 60, 0]);
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    await lisztChat.close();
    checks.push(
      "Opening the salon releases held notes and pedal (even MIDI held beside the non-modal dock); inside the modal salon computer and simulated MIDI input are guarded, previews work by keyboard, Tab remains trapped and Escape returns focus to the chat with piano input restored.",
    );

    await page.getByRole("slider", { name: "Song position" }).fill("10");
    const assistant = await openAssistant();
    const ask = page.getByRole("textbox", { name: "Ask Liszt", exact: true });
    await expect(ask).toBeFocused();
    const beforeCommand = await snapshot();
    const silent = await page.evaluate(() => window.__inputQA.starts);
    await ask.pressSequentially("slower");
    await page.waitForTimeout(80);
    assert.equal(
      await page.evaluate(() => window.__inputQA.starts),
      silent,
      "Typing a command must not play the piano",
    );
    // (MIDI sounds beside the non-modal dock, but leaves the draft alone.)
    await send([144, 74, 100]);
    await expect(page.locator('.piano-key[data-midi="74"]')).toHaveClass(
      /pressed/,
    );
    await send([128, 74, 0]);
    await expect(ask).toHaveValue("slower");
    const beforeReply = await assistant.messages().count();
    await ask.press("Enter");
    await expect(assistant.messages()).toHaveCount(beforeReply + 2);
    // (The old "Liszt response" region is now a practice receipt in the
    // transcript.)
    await expect(assistant.answer()).toHaveClass(/chat-receipt/);
    await expect(assistant.answer()).toContainText("Speed set to");
    await assistant.close();
    const afterCommand = await snapshot();
    assert.ok(Number(afterCommand.speed) < Number(beforeCommand.speed));
    assert.equal(afterCommand.beat, beforeCommand.beat);
    assert.equal(afterCommand.hand, beforeCommand.hand);
    assert.equal(afterCommand.playing, false);
    checks.push(
      "The renamed assistant accepts typed commands, keeps typing silent and slows the current passage without changing its position or starting playback.",
    );

    // (Since the four-screen rebuild each screen has its own companion art and
    // a "Talk with/to <name>" button. One companion per screen: while
    // "Companion follows me" is on (the default kept here), the roaming
    // companion takes the header seat and the painted stand-in steps aside,
    // so the visible figure is the roaming companion. Exercises lost its
    // heading paragraph (its subtitle is the eyebrow) and Progress's "today"
    // label moved to the goal card.)
    const screenArt = {
      Library: ".library-screen .studio-header-art",
      Exercises: ".exercise-header .studio-header-art",
      Progress: ".progress-screen .progress-companion",
    };
    const description = {
      Library: ".library-screen .studio-heading p",
      Exercises: ".exercise-header .screen-eyebrow",
      Progress: ".progress-screen .studio-heading p",
    };
    for (const artist of [PROFILES[2], PROFILES[1]]) {
      await choose(artist, false);
      for (const screen of ["Library", "Exercises", "Progress"]) {
        await button(screen).click();
        const view = page.getByRole("region", { name: screen, exact: true });
        await expect(view).toBeVisible();
        await expect(
          page
            .locator(`${screenArt[screen]} [data-character="${artist.id}"]`)
            .first(),
        ).toBeAttached();
        await expect(
          view.getByRole("button", {
            name: new RegExp(`^Talk (with|to) ${artist.name}$`),
          }),
        ).toBeVisible();
        await expect(page.locator(".buddy")).toHaveAttribute(
          "data-character",
          artist.id,
        );
        await expect(page.locator(".buddy")).toBeVisible();
        await bounds(`${artist.id}-${screen.toLowerCase()}`);
        await page.waitForTimeout(300);
        await contrast(
          `${artist.id}-${screen.toLowerCase()}-description`,
          page.locator(description[screen]),
        );
        if (screen === "Library")
          await contrast(
            `${artist.id}-continue-description`,
            page.locator(".continue-copy p").first(),
          );
        if (screen === "Exercises")
          await contrast(
            `${artist.id}-exercise-summary`,
            page.locator(".exercise-summary"),
          );
        if (screen === "Progress")
          await contrast(
            `${artist.id}-progress-stat`,
            page.locator(".progress-today-copy > span"),
          );
        await shot(`${artist.id}-${screen.toLowerCase()}`);
      }
      await button("Practice").click();
    }
    await choose(PROFILES[2], false);
    await button("Listen & follow").click();
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    await button("Play").click();
    await expect(button("Pause")).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const running = await page.locator(".beethoven-avatar").evaluateAll((els) =>
      els.flatMap((el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.playState === "running")
          .map((a) => a.animationName || "anonymous"),
      ),
    );
    assert.deepEqual(
      running,
      [],
      "Reduced motion must stop active companion gestures",
    );
    // (Opening the dock already pauses once. The dock is not modal, so play
    // again beside it and check that opening the salon pauses playback.)
    const mozart = await openAssistant();
    await button("Play").click();
    await expect(button("Pause")).toBeVisible();
    await mozart.control("options").click();
    await mozart
      .dock()
      .getByRole("button", { name: /^(Change companion|换个伙伴|換個夥伴)$/ })
      .click();
    await expect(salon()).toBeVisible();
    assert.equal(await page.evaluate(() => window.lumaClock().playing), false);
    await preview("Lang Lang").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await bounds("salon-mobile");
    await expect(button("Choose Lang Lang")).toBeEnabled();
    await button("Choose Lang Lang").scrollIntoViewIfNeeded();
    const mobileAction = await button("Choose Lang Lang").boundingBox();
    assert.ok(
      mobileAction.y >= 0 && mobileAction.y + mobileAction.height <= 844,
      "The scrolled mobile Choose button must be fully reachable",
    );
    measurements.mobileAction = mobileAction;
    await shot("salon-mobile-actions", false);
    const mobileRunning = await salon().evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running")
        .map((a) => a.animationName || "anonymous"),
    );
    assert.deepEqual(mobileRunning, []);
    await shot("salon-mobile");
    await close();
    await mozart.close();
    checks.push(
      "The chosen artist follows Library, Exercises and Progress artwork, talk buttons and the roaming companion with readable text; active gestures honor live reduced motion, opening the Salon pauses playback, and all six choices fit the narrow modal without horizontal overflow.",
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await button("Reading settings").click();
    await button("Companions").click();
    await expect(salon()).toBeVisible();
    await preview("Beethoven").click();
    await button("Choose Beethoven").click();
    await expect(salon()).toHaveCount(0);
    // Choosing opens the dock for the new companion; close it to practise.
    await chatFor(PROFILES[0]).close();
    await expect(app()).toHaveAttribute("data-companion", "beethoven");
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      page: document.documentElement.scrollWidth,
      playBottom: document.querySelector(".play-button").getBoundingClientRect()
        .bottom,
      keys: document.querySelectorAll(".piano-key").length,
    }));
    assert.equal(layout.keys, 88);
    assert.ok(
      layout.playBottom <= 800,
      `Play is clipped at ${layout.playBottom}`,
    );
    assert.ok(layout.page <= layout.width + 1);
    measurements.practice = layout;
    await contrast("beethoven-active-navigation", button("Practice"));
    await shot("beethoven-practice");
    assert.deepEqual(await scores(), savedScores);
    assert.deepEqual(errors, []);
    checks.push(
      "Settings opens the same Salon; returning to practice retains all 88 keyboard targets, reachable transport at 1280×800, and the untouched saved score.",
    );
    return { checks, measurements, errors };
  } catch (error) {
    error.companionEvidence = { checks, measurements, errors };
    throw error;
  } finally {
    page.off("pageerror", onError);
  }
}
