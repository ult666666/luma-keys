import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { setPianoVolume } from "./piano-volume.mjs";
import { connectMidi } from "./piano-input.mjs";
import { loopInput } from "./practice-tools.mjs";

const EASY = "晴天 / Sunny Day — QA easy piano";
const CONCERT = "晴天 / Sunny Day — QA concert arrangement";
const fixture = (title, suffix) => ({
  id: `maestro-${suffix}`,
  title,
  composer: "Luma QA",
  bpm: 60,
  tonic: 0,
  meter: 3,
  pickup: 1,
  duration: 16,
  measures: 6,
  measureStarts: [0, 1, 4, 7, 10, 13],
  measureLengths: [1, 3, 3, 3, 3, 3],
  reviewed: true,
  warnings: [],
  notes: Array.from({ length: 16 }, (_, i) => ({
    id: `${suffix}-${i}`,
    midi: [60, 62, 64, 65][i % 4],
    beat: i,
    duration: 0.8,
    hand: "right",
    velocity: 0.65,
  })),
});

// Since 2.17 the companion chat is a docked side panel, not a modal dialog:
// <aside role="complementary" aria-label="Beethoven companion">. The app-bar
// button opens it (openMaestro, which pauses playback once), Minimize tucks
// it into a "Chat with Beethoven" pocket and Close removes it. Since 2.35
// the transcript is temporary: it stays in app memory while the dock is
// closed or minimized and disappears on reload or quit. Every reply is a
// .chat-message-assistant in one transcript, so "the answer" is the latest.
// The panel's own words follow the conversation (and draft) language, so a
// Chinese draft relabels Send as 发送 and the box as 问问贝多芬 (chat-ui.mjs).
const CHAT_LABELS = {
  send: /^(Send|发送|傳送)$/,
  stop: /^(Stop reply|停止回复|停止回覆)$/,
  close: /^(Close|关闭|關閉)$/,
  minimize: /^(Minimize|最小化)$/,
  options: /^(Options|选项|選項)$/,
};
export function companionChat(page, name = "Beethoven") {
  const button = (label) =>
    page.getByRole("button", { name: label, exact: true });
  const dock = () =>
    page.getByRole("complementary", { name: `${name} companion`, exact: true });
  const control = (key) =>
    dock().getByRole("button", { name: CHAT_LABELS[key] });
  // "Ask Beethoven" in English; the id keeps it findable in every language.
  const input = () => page.locator("[data-companion-dock] #maestro-question");
  const pocket = () => button(`Chat with ${name}`);
  const messages = () => page.locator("[data-companion-dock] .chat-message");
  const answer = () =>
    page.locator("[data-companion-dock] .chat-message-assistant").last();
  const open = async () => {
    if (!(await input().isVisible())) await button(name).click();
    await expect(input()).toBeVisible();
  };
  const close = async () => {
    if (!(await dock().count())) return;
    // A minimized dock shows only its pocket; restore it to reach Close.
    if (await pocket().isVisible()) await pocket().click();
    await control("close").click();
    await expect(dock()).toHaveCount(0);
  };
  // Sends one message and waits for its question and reply to join the
  // transcript (a practice command answers synchronously).
  const ask = async (text) => {
    await open();
    const before = await messages().count();
    await input().fill(text);
    await control("send").click();
    await expect(messages()).toHaveCount(before + 2);
    await expect(
      page.locator("[data-companion-dock] .chat-pending"),
    ).toHaveCount(0);
    return answer();
  };
  return {
    button,
    dock,
    control,
    input,
    pocket,
    messages,
    answer,
    open,
    close,
    ask,
  };
}

export async function verifyMaestro(page, prefix = "maestro-2.6") {
  const checks = [],
    measurements = {},
    errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const chat = companionChat(page);
  const { button, dock, control, input, pocket, messages, answer, open, ask } =
    chat;
  const closePanel = chat.close;
  const position = () =>
    page.getByRole("slider", { name: "Song position" }).inputValue();
  const speed = () =>
    page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .inputValue();
  const command = async (text) => {
    await ask(text);
    await closePanel();
  };
  const snapshot = () =>
    page.evaluate(() => ({
      title: document.querySelector(".piece-info h1")?.textContent,
      beat: document.querySelector('[aria-label="Song position"]')?.value,
      // The speed select is labelled by <label for="speed">, not aria-label.
      speed: document.querySelector("select#speed")?.value,
      loop: document
        .querySelector('[aria-label="Toggle phrase loop"]')
        ?.getAttribute("aria-pressed"),
      // Since 2.39 these sit in the (rendered but hidden) Practice tools drawer.
      from: document.querySelector('[aria-label="Loop start bar"]')?.value,
      to: document.querySelector('[aria-label="Loop end bar"]')?.value,
    }));
  const send = (data) =>
    page.evaluate((data) => window.__inputQA.a.onmidimessage({ data }), data);
  const shot = async (name) => {
    // A toast may expire between a count and a Playwright click. Dismiss it
    // in one renderer turn so an already-removed notification cannot stall QA.
    await page.evaluate(() =>
      document.querySelector('[aria-label="Dismiss notification"]')?.click(),
    );
    await page.waitForTimeout(550);
    await page.screenshot({
      path: `evidence/${prefix}-${name}.png`,
      fullPage: false,
    });
  };
  // The dock must sit inside the window and its chat must not overflow
  // sideways; the page itself must not scroll horizontally.
  const bounds = async (name) => {
    const info = await page.evaluate(() => {
      const dock = document.querySelector("[data-companion-dock]");
      const chat = dock?.querySelector(".companion-chat");
      const r = dock?.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        pageWidth: document.documentElement.scrollWidth,
        dock: r
          ? {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              client: chat?.clientWidth,
              scroll: chat?.scrollWidth,
            }
          : null,
      };
    });
    assert.ok(
      info.pageWidth <= info.width + 1,
      `${name}: page overflow ${JSON.stringify(info)}`,
    );
    assert.ok(info.dock, `${name}: companion dock is not open`);
    assert.ok(
      info.dock.left >= -1 &&
        info.dock.right <= info.width + 1 &&
        info.dock.top >= -1 &&
        info.dock.bottom <= info.height + 1,
      `${name}: dock outside viewport ${JSON.stringify(info)}`,
    );
    assert.ok(
      info.dock.scroll <= info.dock.client + 1,
      `${name}: dock content overflows ${JSON.stringify(info)}`,
    );
    measurements[name] = info;
  };
  const importPiece = async (title, suffix, custom = null) => {
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}-${suffix}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(custom || fixture(title, suffix))),
    });
    await page
      .getByRole("dialog", { name: "Review score", exact: true })
      .waitFor();
    await button("Close dialog").click();
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(button("Play")).toBeEnabled();
    await setPianoVolume(page);
    await button("Reading settings").click();
    // (Since the roaming companion arrived, it takes the stage cue's seat while
    // "Companion follows me" is on — one companion per screen — and the cue's
    // conductor portrait gives way to it. This story checks the conductor
    // portrait itself, so it turns the roaming companion off.)
    for (const name of ["Count me in", "Metronome", "Companion follows me"]) {
      const toggle = page.getByRole("switch", { name, exact: true });
      if ((await toggle.getAttribute("aria-checked")) === "true")
        await toggle.click();
    }
    await button("Close dialog").click();
    await importPiece(EASY, "easy");
    await importPiece(CONCERT, "concert");
    await open();
    await expect(
      page.getByRole("textbox", { name: "Ask Beethoven", exact: true }),
    ).toBeFocused();
    await shot("intro-desktop");
    await ask("find Sunny Day");
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    await expect(answer()).toContainText("Choose a version");
    assert.equal((await snapshot()).title, CONCERT);
    await ask("找晴天");
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    assert.equal((await snapshot()).title, CONCERT);
    await bounds("ambiguity-desktop");
    await shot("arrangement-choices");
    await answer().locator(".chat-action").filter({ hasText: EASY }).click();
    await closePanel();
    await expect(page.locator(".piece-info h1")).toHaveText(EASY);
    await expect(button("Play")).toBeVisible();
    assert.equal(await position(), "0");
    checks.push(
      "English and Chinese searches present both available arrangements without silently choosing; selecting one opens it paused.",
    );

    const beforeMissing = await snapshot();
    // (Replies follow the request's language: “find 龙卷风” is read as
    // Chinese, so the honest miss and its import action may be in Chinese.)
    const importAction = () =>
      answer().getByRole("button", { name: /^(Import a score|导入乐谱)$/ });
    await ask("find 龙卷风");
    await expect(answer()).toContainText(
      /No saved piece matches “龙卷风”|曲库里没有匹配“龙卷风”/,
    );
    await expect(answer().locator(".chat-action")).toHaveCount(1);
    await expect(importAction()).toBeVisible();
    assert.deepEqual(await snapshot(), beforeMissing);
    await shot("missing-piece");
    await importAction().click();
    await expect(
      page.getByRole("dialog", { name: "Import a score", exact: true }),
    ).toBeVisible();
    await button("Close dialog").click();
    checks.push(
      "A missing piece is reported honestly and offers local import without creating a score or changing the current piece.",
    );

    await closePanel();
    await button("Listen & follow").click();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("0.5");
    await page.getByRole("slider", { name: "Song position" }).fill("1");
    await button("Play").click();
    await expect(button("Pause")).toBeVisible();
    await page.waitForTimeout(3300); // The journal records only real sessions lasting at least3s.
    await button("Pause").click();
    assert.ok(Number(await position()) >= 1 && Number(await position()) < 4);
    await command("repeat bars 3–4");
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    assert.equal(await position(), "4");
    await ask("resume");
    await expect(answer()).toContainText("bar 2");
    await expect(answer().locator(".chat-action")).toHaveCount(1);
    await shot("resume-saved-bar");
    await answer().locator(".chat-action").click();
    await closePanel();
    await expect(page.locator(".piece-info h1")).toHaveText(EASY);
    assert.equal(
      await position(),
      "1",
      "pickup score bar2 starts at beat1, not beat4",
    );
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(button("Play")).toBeVisible();
    // (Since 2.17 the panel has no "Recent practice" list; its one-tap resume
    // is the "Where did I leave off?" suggestion under the transcript.)
    await page.getByRole("slider", { name: "Song position" }).fill("7");
    assert.equal(await position(), "7");
    await open();
    const leftOff = messages();
    const beforeChip = await leftOff.count();
    await dock()
      .locator(".chat-quick")
      .getByRole("button", { name: "Where did I leave off?", exact: true })
      .click();
    await expect(leftOff).toHaveCount(beforeChip + 2);
    await expect(answer()).toContainText("bar 2");
    await answer()
      .getByRole("button", { name: `Resume ${EASY} · bar 2`, exact: true })
      .click();
    await closePanel();
    assert.equal(await position(), "1");
    checks.push(
      "Resume and the “Where did I leave off?” suggestion use a real saved bar, including a pickup; resuming the already-current score clears its old loop and stays paused.",
    );

    await command("go to bar 3");
    assert.equal(await position(), "4");
    await command("repeat bars 2–3");
    assert.equal(await position(), "1");
    await expect(loopInput(page, "start")).toHaveValue("2");
    await expect(loopInput(page, "end")).toHaveValue("3");
    for (const invalid of [
      "go to bar 0",
      "go to bar 999",
      "repeat bars 4–2",
      "speed 33%",
    ]) {
      const previous = await snapshot();
      await ask(invalid);
      await expect(answer().locator(".chat-action")).toHaveCount(0);
      await expect(answer()).toContainText(
        /Use whole bar numbers|Choose a speed/,
      );
      assert.deepEqual(
        await snapshot(),
        previous,
        `invalid request mutated practice: ${invalid}`,
      );
      await closePanel();
    }
    await command("go to bar 5");
    assert.equal(await position(), "10");
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    checks.push(
      "Jump/repeat honor the written bar map; invalid or reversed ranges and unsupported speeds leave practice unchanged; jumping outside a loop exits it.",
    );

    await command("slower");
    assert.equal(await speed(), "0.45");
    assert.equal(await position(), "10");
    await command("右手");
    await expect(
      page
        .getByRole("radiogroup", { name: "Practice hand", exact: true })
        .locator(".hand-right"),
    ).toHaveAttribute("aria-checked", "true");
    assert.equal(await position(), "0");
    await command("wait for me");
    await expect(button("Wait for me")).toHaveClass(/selected/);
    assert.equal(await position(), "0");
    await expect(button("Play")).toBeVisible();
    await command("both hands");
    await command("listen");
    checks.push(
      "Slower preserves the exact reading position; Chinese hand and mode commands mirror the existing practice controls without starting playback.",
    );

    const connect = await connectMidi(page, "QA piano A");
    await page.locator(".piece-info h1").click();
    await page.keyboard.down("a");
    await send([144, 67, 100]);
    await send([176, 64, 127]);
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    await expect(page.locator('.piano-key[data-midi="67"]')).toHaveClass(
      /pressed/,
    );
    await expect(connect).toContainText("sustain");
    await open();
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    await expect(connect).not.toContainText("sustain");
    await page.keyboard.up("a");
    const guarded = await snapshot();
    await expect(input()).toBeFocused();
    await input().fill("找晴天");
    const beforeIme = await messages().count();
    await input().evaluate((el) => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForTimeout(150);
    // The composer ignores Enter while an IME is composing; it neither sends
    // nor clears the draft.
    await expect(input()).toHaveValue("找晴天");
    assert.equal(
      await messages().count(),
      beforeIme,
      "IME confirmation must not submit prematurely",
    );
    await page.keyboard.press("Enter");
    await expect(messages()).toHaveCount(beforeIme + 2);
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    await expect(input()).toHaveValue("");
    const starts = await page.evaluate(() => window.__inputQA.starts);
    await input().pressSequentially("a s n []?. ");
    await expect(input()).toHaveValue("a s n []?. ");
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => window.__inputQA.starts),
      starts,
      "Typing in the chat must not play the computer piano",
    );
    assert.deepEqual(
      await snapshot(),
      guarded,
      "Typing in the chat must not trigger practice shortcuts",
    );
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    // (Since 2.17 the docked chat is not modal: a MIDI keyboard stays playable
    // beside it — docs/COMPANION_MINI_2.17.md. A key sounds and lights, but it
    // changes no practice state and leaves the draft and focus alone.)
    await send([144, 72, 100]);
    await expect(page.locator('.piano-key[data-midi="72"]')).toHaveClass(
      /pressed/,
    );
    await send([128, 72, 0]);
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    assert.deepEqual(await snapshot(), guarded);
    await expect(input()).toHaveValue("a s n []?. ");
    await expect(input()).toBeFocused();
    // (The dock does not trap focus: Tab can leave the panel normally.)
    await control("send").focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await dock().evaluate((el) => el.contains(document.activeElement)),
      false,
      "Tab past the last chat control leaves the non-modal dock",
    );
    await input().focus();
    // (Since 2.35 Escape minimizes the dock to its pocket and returns focus to
    // the opener; the conversation and draft stay for this session.)
    await page.keyboard.press("Escape");
    await expect(input()).toBeHidden();
    await expect(pocket()).toBeVisible();
    await expect(button("Beethoven")).toBeFocused();
    await send([144, 60, 90]);
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    await send([128, 60, 0]);
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    await pocket().click();
    await expect(input()).toHaveValue("a s n []?. ");
    await input().fill("");
    await closePanel();
    checks.push(
      "Opening Beethoven releases held computer/MIDI notes and pedal; typing and IME Enter cannot play, send or trigger shortcuts; the non-modal dock lets MIDI sound without changing practice, does not trap Tab, and Escape minimizes it with focus restored.",
    );

    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("1.25");
    await button("Start over").click();
    await open();
    // (Since 2.17 the playing-tips switch lives in the panel's Options popover.)
    await control("options").click();
    const tips = page.getByRole("checkbox", {
      name: "Beethoven playing tips",
      exact: true,
    });
    if (!(await tips.isChecked())) await tips.check();
    await expect(tips).toBeChecked();
    await page.keyboard.press("Escape"); // Escape closes Options first.
    await expect(tips).toHaveCount(0);
    await expect(input()).toBeVisible();
    await closePanel();
    await button("Play").click();
    await expect(button("Pause")).toBeVisible();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('[aria-label="Song position"]').value) >
        1.1,
    );
    await expect(page.locator(".maestro-stage-cue")).toContainText("Bar 2");
    await expect(
      page.locator(
        '.maestro-stage-cue .beethoven-avatar[data-mood="conducting"]',
      ),
    ).toBeVisible();
    const practice = await page.evaluate(() => ({
      keyCount: document.querySelectorAll(".piano-key").length,
      playBottom: document.querySelector(".play-button").getBoundingClientRect()
        .bottom,
      pageWidth: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    assert.equal(practice.keyCount, 88);
    assert.ok(
      practice.playBottom <= 800,
      `Transport clipped at${practice.playBottom}`,
    );
    assert.ok(practice.pageWidth <= practice.width + 1);
    measurements.practice = practice;
    await page.emulateMedia({ reducedMotion: "reduce" });
    const animatedAvatar = await page
      .locator(".beethoven-avatar")
      .evaluateAll((avatars) =>
        avatars.flatMap((el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running")
            .map((a) => a.animationName || "anonymous"),
        ),
      );
    assert.deepEqual(animatedAvatar, []);
    await shot("playing-reduced-motion");
    await open();
    // (Since 2.17 the dock is not modal: opening it pauses playback once and
    // Play stays available beside it, instead of the main controls going inert.)
    assert.equal(await page.evaluate(() => window.lumaClock().playing), false);
    await expect(button("Play")).toBeVisible();
    await expect(button("Play")).toBeEnabled();
    await closePanel();
    await expect(button("Play")).toBeVisible();
    checks.push(
      "The passive conductor appears during practice without clipping the 1280×800 transport; live reduced motion stops its animation, and opening the dock pauses playback while Play stays available.",
    );

    await importPiece("QA short report timing", "short", {
      id: "maestro-short",
      title: "QA short report timing",
      composer: "Luma QA",
      bpm: 200,
      tonic: 0,
      meter: 1,
      duration: 1,
      measures: 1,
      measureStarts: [0],
      measureLengths: [1],
      reviewed: true,
      warnings: [],
      notes: [
        {
          id: "short-0",
          midi: 60,
          beat: 0,
          duration: 0.5,
          hand: "right",
          velocity: 0.65,
        },
      ],
    });
    await button("Play in time").click();
    await button("Play").click();
    await page.waitForFunction(() => {
      const clock = window.lumaClock();
      return !clock.playing && clock.beat >= 1;
    });
    await button("Beethoven").click();
    await expect(input()).toBeVisible();
    await page.waitForTimeout(950); // Exceeds the delayed completion-report timer.
    await expect(input()).toBeVisible();
    await expect(page.locator(".results-dialog")).toHaveCount(0);
    await closePanel();

    await page.setViewportSize({ width: 390, height: 844 });
    await ask("继续晴天");
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    await bounds("mobile-panel");
    await expect(input()).toBeVisible();
    await expect(page.locator(".beethoven-avatar").first()).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await shot("mobile-arrangements");
    // The dock handles Escape while focus is inside it (the old modal listened
    // on the whole page); the screenshot helper may have dismissed a toast.
    await input().focus();
    await page.keyboard.press("Escape");
    await expect(pocket()).toBeVisible();
    await expect(button("Beethoven")).toBeFocused();
    await expect(page.locator(".piano-key")).toHaveCount(88);
    checks.push(
      "A completed run cannot replace an opened Beethoven dock with its delayed report; the bilingual chooser fits 390px and Escape restores focus to the opener.",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    const copy = fixture(EASY, "duplicate");
    copy.notes = copy.notes.map((note) => ({ ...note, midi: note.midi + 12 }));
    await importPiece(EASY, "duplicate", copy);
    await ask("find QA easy piano");
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    const copies = await answer()
      .locator(".chat-action")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label")),
      );
    assert.equal(new Set(copies).size, 2);
    assert.ok(copies.some((label) => /Saved copy 1$/.test(label)));
    assert.ok(copies.some((label) => /Saved copy 2$/.test(label)));
    assert.ok(
      !/·\s*·/.test(await answer().innerText()),
      "empty metadata must not leave duplicate separators",
    );
    await shot("exact-title-copies");
    const pitches = [];
    for (const copyLabel of copies) {
      await answer()
        .getByRole("button", { name: copyLabel, exact: true })
        .click();
      await closePanel();
      pitches.push(
        (
          await page
            .locator(".next-notes > div:not(.next-then) > span")
            .first()
            .innerText()
        ).split("\n")[0],
      );
      await ask("find QA easy piano");
      assert.deepEqual(
        await answer()
          .locator(".chat-action")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("aria-label")),
          ),
        copies,
      );
    }
    assert.deepEqual(
      new Set(pitches),
      new Set(["C4", "C5"]),
      "the identically titled cards must select distinct saved scores",
    );
    await closePanel();
    const importLines = await page
      .locator(".app-import span")
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      });
    assert.equal(
      importLines,
      1,
      "Import a score must remain on one toolbar line at1280px",
    );
    measurements.importLabelLines = importLines;
    assert.deepEqual(errors, []);
    checks.push(
      "Identically titled versions retain distinct stable accessible copy labels and open different saved music;1280px toolbar import text does not wrap.",
    );
    return { checks, measurements, errors };
  } catch (error) {
    error.maestroEvidence = { checks, measurements, errors };
    throw error;
  } finally {
    page.off("pageerror", onError);
    await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => {});
  }
}
