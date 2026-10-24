import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { installInputHarness } from "./input-checks.mjs";
import { setPianoVolume } from "./piano-volume.mjs";
import { connectMidi } from "./piano-input.mjs";
import { openReview } from "./practice-tools.mjs";
import { companionChat } from "./maestro-checks.mjs";

// Controlled NDJSON transport exercises the real streaming UI deterministically.
// It never presents these fixtures as evidence of the actual Apple model.
export async function installConversationHarness(page) {
  await installInputHarness(page);
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const qa = (window.__conversationQA = {
      enabled: true,
      requests: [],
      warms: 0,
    });
    window.fetch = async (input, options = {}) => {
      const url = new URL(
        typeof input === "string" ? input : input.url,
        location.href,
      );
      if (qa.enabled && url.pathname === "/api/companion/model")
        return Response.json({ available: true, reason: "available" });
      // Opening the dock warms the model (2.28). Keep the real on-device model
      // unloaded: every reply in this story comes from the fixture below.
      if (qa.enabled && url.pathname === "/api/companion/warm") {
        qa.warms++;
        return Response.json({ ok: true }, { status: 202 });
      }
      if (!qa.enabled || url.pathname !== "/api/companion/chat")
        return nativeFetch(input, options);
      const request = {
        body: JSON.parse(options.body),
        aborted: false,
        finished: false,
      };
      qa.requests.push(request);
      return new Response(
        new ReadableStream({
          start(controller) {
            request.emit = (event) => {
              if (request.aborted || request.finished) return false;
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
              return true;
            };
            request.finish = () => {
              if (request.aborted || request.finished) return false;
              request.emit({ type: "done" });
              request.finished = true;
              controller.close();
              return true;
            };
            options.signal?.addEventListener(
              "abort",
              () => {
                request.aborted = true;
                if (!request.finished)
                  controller.error(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          },
        }),
        { headers: { "Content-Type": "application/x-ndjson" } },
      );
    };
  });
}

const TITLE = "晴天 / Sunny Day — QA conversation";
const fixture = (suffix) => ({
  id: `conversation-${suffix}`,
  title: `${TITLE} ${suffix}`,
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

// Since 2.17 the chat is a docked, non-modal side panel (see companionChat in
// maestro-checks.mjs). Since 2.35 it is temporary: the transcript lives only
// in renderer memory — it survives closing or minimizing the dock, but New
// chat, reloading or quitting clears it, and nothing is saved to the Library,
// the history API or browser storage (docs/TEMPORARY_CHAT_2.35.md). The old
// "Saved on this Mac" status, history persistence across reload, save-failure
// Retry and failed-history-read checks therefore became the checks below.
export async function verifyConversation(page, prefix = "conversation-2.9") {
  const checks = [],
    measurements = {},
    errors = [];
  const onError = (e) => errors.push(e.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const chat = companionChat(page);
  const { button, dock, control, input, pocket, messages, answer, open, ask } =
    chat;
  const close = chat.close;
  const position = () =>
    page.locator('[aria-label="Song position"]').inputValue();
  const practice = () =>
    page.evaluate(() => ({
      title: document.querySelector(".piece-info h1")?.textContent,
      beat: document.querySelector('[aria-label="Song position"]')?.value,
      speed: document.querySelector("select#speed")?.value,
      hand: document
        .querySelector('[aria-label="Practice hand"] [aria-checked="true"]')
        ?.getAttribute("aria-label"),
      loop: document
        .querySelector('[aria-label="Toggle phrase loop"]')
        ?.getAttribute("aria-pressed"),
      from: document.querySelector('[aria-label="Loop start bar"]')?.value,
      to: document.querySelector('[aria-label="Loop end bar"]')?.value,
    }));
  const library = () =>
    page.evaluate(async () =>
      (await (await fetch("/api/scores")).json()).map?.((s) => s.id),
    );
  // What the transcript shows, in order: each message's label and text.
  const transcript = () =>
    messages().evaluateAll((nodes) =>
      nodes.map((node) => [node.getAttribute("aria-label"), node.innerText]),
    );
  const notice = () =>
    page.locator("[data-companion-dock] .chat-notice:not(.chat-notice-quiet)");
  const retryReply = () =>
    dock().getByRole("button", { name: /^(Retry reply|再试一次|再試一次)$/ });
  const command = async (text) => {
    await ask(text);
    await close();
  };
  const shot = async (name) => {
    if (await button("Dismiss notification").count())
      await button("Dismiss notification").click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: `evidence/${prefix}-${name}.png`,
      fullPage: false,
    });
  };
  const bounds = async (name) => {
    const value = await page.evaluate(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          client: el.clientWidth,
          scroll: el.scrollWidth,
        };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        page: document.documentElement.scrollWidth,
        dock: rect("[data-companion-dock]"),
        composer: rect("[data-companion-dock] .chat-composer"),
        transcript: rect("[data-companion-dock] .chat-transcript"),
      };
    });
    assert.ok(
      value.page <= value.width + 1,
      `${name} page overflow ${JSON.stringify(value)}`,
    );
    for (const key of ["dock", "composer", "transcript"])
      if (value[key]) {
        const r = value[key];
        assert.ok(
          r.x >= -1 && r.right <= value.width + 1,
          `${name} ${key} horizontal bounds ${JSON.stringify(value)}`,
        );
        assert.ok(
          r.scroll <= r.client + 1,
          `${name} ${key} internal overflow ${JSON.stringify(value)}`,
        );
        assert.ok(
          r.y >= -1 && r.bottom <= value.height + 1,
          `${name} ${key} vertical bounds ${JSON.stringify(value)}`,
        );
      }
    measurements[name] = value;
  };
  const importPiece = async (suffix) => {
    await button("Import a score").click();
    await page.locator('input[type="file"]').setInputFiles({
      name: `${prefix}-${suffix}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture(suffix))),
    });
    await page
      .getByRole("dialog", { name: "Review score", exact: true })
      .waitFor();
    await button("Close dialog").click();
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(button("Play")).toBeEnabled();
    await setPianoVolume(page);
    await importPiece("easy");
    await importPiece("concert");
    await open();
    await expect(
      page.getByRole("textbox", { name: "Ask Beethoven", exact: true }),
    ).toBeFocused();
    await expect(dock().locator(".chat-session-bar")).toContainText(
      "Temporary chat",
    );
    await shot("welcome-desktop");
    const modelRequestsBeforeGuide = await page.evaluate(
      () => window.__conversationQA.requests.length,
    );
    await ask("Help me practise these bars");
    await expect(control("stop")).toHaveCount(0);
    assert.equal(
      await page.evaluate(() => window.__conversationQA.requests.length),
      modelRequestsBeforeGuide,
      "Current-bar guidance must use the written score directly",
    );
    // (The history API no longer holds messages; the source and lesson are
    // read from the reply itself: "From your score" and its bar heading.)
    await expect(answer().locator(".chat-source")).toHaveText(
      "From your score",
    );
    await expect(
      answer().locator(".chat-lesson-heading > span").first(),
    ).toHaveText("Bar 1");
    await expect(answer()).toContainText("Repeat bar 1");
    checks.push(
      "Current-bar help uses the exact written-score lesson, labelled “From your score”, with no model request or generation controls even when the model is available.",
    );
    await ask("find QA conversation");
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    const first = await answer()
      .locator(".chat-action strong")
      .nth(0)
      .innerText();
    const second = await answer()
      .locator(".chat-action strong")
      .nth(1)
      .innerText();
    assert.notEqual(first, second);
    await ask("找晴天");
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    const secondChinese = await answer()
      .locator(".chat-action strong")
      .nth(1)
      .innerText();
    await ask("the second one");
    await expect(answer().locator(".chat-action")).toHaveCount(1);
    await expect(answer()).toContainText(secondChinese);
    await shot("follow-up-choice");
    await answer().locator(".chat-action").click();
    await close();
    await expect(page.locator(".piece-info h1")).toHaveText(secondChinese);
    await expect(button("Play")).toBeVisible();
    assert.equal(await position(), "0");
    checks.push(
      "English and Chinese searches retain separate arrangements; a follow-up selects the second prior choice and opens it paused.",
    );

    await command("go to bar 3");
    assert.equal(await position(), "4");
    await command("repeat bars 3–4");
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    assert.equal(await position(), "4");
    const beforeSpeed = +(await page
      .getByRole("combobox", { name: "Practice speed" })
      .inputValue());
    await command("slower");
    assert.ok(
      +(await page
        .getByRole("combobox", { name: "Practice speed" })
        .inputValue()) < beforeSpeed,
    );
    assert.equal(await position(), "4");
    await command("go to bar 999");
    assert.equal(await position(), "4");
    await open();
    await expect(answer()).toContainText(/6|range|bar/i);
    const beforeMissing = await page.locator(".piece-info h1").textContent();
    await ask("find 龙卷风");
    await expect(answer().locator(".chat-action")).toHaveCount(1);
    // (Replies follow the request's language: “find 龙卷风” reads as Chinese.)
    await expect(
      answer().getByRole("button", { name: /^(Import a score|导入乐谱)$/ }),
    ).toBeVisible();
    assert.equal(
      await page.locator(".piece-info h1").textContent(),
      beforeMissing,
    );
    await shot("local-tools");
    await close();
    checks.push(
      "Explicit seek, phrase repeat, and slower commands update the real paused controls; invalid bars and missing pieces do not invent or change a score.",
    );

    await connectMidi(page);
    await page.keyboard.down("a");
    await expect(page.locator(".piano-key.pressed")).not.toHaveCount(0);
    await open();
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    await page.keyboard.up("a");
    const starts = await page.evaluate(() => window.__inputQA.starts),
      count = await messages().count(),
      held = await practice();
    await input().fill("qa");
    await input().press("Shift+Enter");
    await input().pressSequentially("asdf ");
    await expect(input()).toHaveValue("qa\nasdf ");
    await input().dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
      isComposing: true,
      bubbles: true,
    });
    await page.waitForTimeout(150);
    assert.equal(
      await messages().count(),
      count,
      "Composition Enter must not submit",
    );
    assert.equal(
      await page.evaluate(() => window.__inputQA.starts),
      starts,
      "Typing in the chat must stay silent",
    );
    assert.deepEqual(await practice(), held, "Typing must not drive practice");
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    // (Since 2.17 the dock is not modal and a MIDI keyboard stays playable
    // beside it — docs/COMPANION_MINI_2.17.md. The key sounds, but practice
    // does not advance and the draft is untouched.)
    await page.evaluate(() => {
      window.__inputQA.a.onmidimessage({ data: [144, 60, 100] });
      window.__inputQA.a.onmidimessage({ data: [176, 64, 127] });
    });
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /pressed/,
    );
    await page.evaluate(() => {
      window.__inputQA.a.onmidimessage({ data: [128, 60, 0] });
      window.__inputQA.a.onmidimessage({ data: [176, 64, 0] });
    });
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    assert.deepEqual(await practice(), held, "MIDI must not drive practice");
    assert.equal(await messages().count(), count);
    await expect(input()).toHaveValue("qa\nasdf ");
    await input().fill("");
    // (The old modal trapped Tab; the dock lets Tab leave it normally.)
    let left = false;
    for (let i = 0; i < 25 && !left; i++) {
      await page.keyboard.press("Tab");
      left = !(await dock().evaluate((el) =>
        el.contains(document.activeElement),
      ));
    }
    assert.ok(left, "Tab must be able to leave the non-modal dock");
    // Escape belongs to the dock while focus is in it: it minimizes the panel
    // to its pocket and returns focus to the launcher that opened it.
    await input().focus();
    await page.keyboard.press("Escape");
    await expect(input()).toBeHidden();
    await expect(pocket()).toBeVisible();
    await expect(page.locator(".maestro-launcher")).toBeFocused();
    checks.push(
      "Opening chat releases held notes; textarea typing, composition Enter and Shift+Enter cannot play or advance; MIDI sounds beside the non-modal dock without changing practice; Tab can leave it and Escape minimizes it with launcher focus restored.",
    );

    // (Since 2.35 the conversation is temporary, replacing the saved-history
    // check: it survives closing and minimizing within the session, is never
    // written to the history API or browser storage, and a reload clears it.)
    await open();
    await ask("find QA conversation");
    const kept = await transcript();
    assert.ok(kept.length >= 10, `transcript too short: ${kept.length}`);
    await close();
    await open();
    assert.deepEqual(await transcript(), kept);
    await control("minimize").click();
    await expect(pocket()).toBeFocused();
    await pocket().click();
    await expect(input()).toBeFocused();
    assert.deepEqual(await transcript(), kept);
    await expect(answer().locator(".chat-action")).toHaveCount(2);
    for (const card of await answer().locator(".chat-action").all())
      await expect(card).toBeEnabled();
    const stored = await page.evaluate(async () => {
      const response = await fetch("/api/companion/history", {
        cache: "no-store",
      });
      const storage = [localStorage, sessionStorage]
        .flatMap((area) =>
          Object.keys(area).map((key) => `${key}=${area.getItem(key)}`),
        )
        .join("\n");
      return { history: await response.json(), storage };
    });
    assert.deepEqual(stored.history, { messages: [], storage: "temporary" });
    for (const text of ["find QA conversation", "找晴天", "the second one"])
      assert.ok(
        !stored.storage.includes(text),
        `browser storage must not keep chat text: ${text}`,
      );
    await close();
    await page.reload();
    await expect(button("Play")).toBeEnabled();
    await open();
    await expect(messages()).toHaveCount(0);
    await expect(dock().locator(".chat-welcome")).toBeVisible();
    checks.push(
      "The temporary transcript keeps its order, text and enabled choices across closing and minimizing the dock, is absent from the history API and browser storage, and is gone after a reload.",
    );

    // New chat clears the conversation now, and only the conversation.
    await ask("find QA conversation");
    await ask("go to bar 2");
    await expect(messages()).toHaveCount(4);
    const beforeClear = { practice: await practice(), pieces: await library() };
    await input().fill("an unsent draft");
    await dock().getByRole("button", { name: "New chat", exact: true }).click();
    await expect(messages()).toHaveCount(0);
    await expect(dock().locator(".chat-welcome")).toBeVisible();
    await expect(input()).toHaveValue("");
    await expect(input()).toBeFocused();
    await expect(dock().getByRole("status").last()).toHaveText(
      "Chat cleared. Your music and progress are unchanged.",
    );
    assert.deepEqual(
      { practice: await practice(), pieces: await library() },
      beforeClear,
      "New chat must not change music or practice",
    );
    checks.push(
      "New chat clears messages and the draft, announces that music and progress are unchanged, and leaves the piece, position, speed, hand, loop and library exactly as they were.",
    );

    await ask("find QA conversation");
    const target = await answer()
      .locator(".chat-action strong")
      .first()
      .innerText();
    await answer().locator(".chat-action").first().click();
    await close();
    await openReview(page);
    await page
      .locator('select[aria-label^="Pitch"]')
      .first()
      .selectOption("67");
    await button("Save & mark reviewed").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await open();
    const oldCard = page
      .locator("[data-companion-dock] .chat-action")
      .filter({ has: page.locator("strong", { hasText: target }) })
      .first();
    await expect(oldCard).toBeDisabled();
    await expect(oldCard).toContainText("Piece changed");
    await ask("find QA conversation");
    await expect(
      answer().locator(".chat-action").filter({ hasText: target }),
    ).toBeEnabled();
    checks.push(
      "Editing a saved score disables its old conversation action; a fresh search creates an enabled action for the updated score.",
    );

    const startStream = async (text) => {
      const count = await page.evaluate(
        () => window.__conversationQA.requests.length,
      );
      await input().fill(text);
      await control("send").click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__conversationQA.requests.length),
        )
        .toBe(count + 1);
      await expect(control("stop")).toBeVisible();
      return count;
    };
    const emit = (index, text, done = false) =>
      page.evaluate(
        ({ index, text, done }) => {
          const r = window.__conversationQA.requests[index];
          r.emit({ type: "text", text });
          if (done) r.finish();
        },
        { index, text, done },
      );
    const beforeStreamBeat = await position();
    let request = await startStream(
      "How can I relax my wrists while practising?",
    );
    const context = await page.evaluate(
      (i) => window.__conversationQA.requests[i].body.context,
      request,
    );
    assert.ok(context.notes.length <= 12 && context.practice.bar >= 1);
    assert.equal(Object.hasOwn(context, "score"), false);
    await expect(
      page.locator("[data-companion-dock] .chat-action").last(),
    ).toBeDisabled();
    await emit(request, "Try a light touch.");
    await expect(answer()).toContainText("Try a light touch.");
    const longReply =
      "Try a light touch. " +
      "Play this short passage slowly, then release tension. ".repeat(16);
    await emit(request, longReply);
    await expect(answer()).toContainText(longReply);
    const log = page.locator("[data-companion-dock] .chat-transcript");
    await expect
      .poll(() =>
        log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
      )
      .toBeLessThan(3);
    await log.evaluate((el) => el.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(100);
    await emit(request, longReply + " Pause between phrases.");
    await expect(button("Latest messages")).toBeVisible();
    assert.equal(
      await log.evaluate((el) => el.scrollTop),
      0,
      "Streaming must not pull a reader away from older messages",
    );
    await button("Latest messages").click();
    await page.evaluate(() => {
      window.__deferChatScroll = (event) => {
        if (event.target?.classList?.contains("chat-transcript"))
          event.stopImmediatePropagation();
      };
      window.addEventListener("scroll", window.__deferChatScroll, true);
    });
    await log.evaluate((el) => el.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(100);
    await emit(request, longReply + " Pause between phrases. Take your time.");
    await expect(button("Latest messages")).toBeVisible();
    assert.equal(
      await log.evaluate((el) => el.scrollTop),
      0,
      "Reading position survives even when a native scroll event has not been delivered",
    );
    await page.evaluate(() => {
      window.removeEventListener("scroll", window.__deferChatScroll, true);
      delete window.__deferChatScroll;
    });
    await button("Latest messages").click();
    await emit(
      request,
      longReply + " Pause between phrases. Take your time.",
      true,
    );
    await expect(control("stop")).toHaveCount(0);
    // (The completed reply joins the temporary transcript, marked On device.)
    await expect(answer().locator(".chat-source")).toHaveText("On device");
    await expect(answer()).toHaveAttribute("aria-label", "Beethoven · On device");
    assert.equal(await position(), beforeStreamBeat);
    await expect(answer().locator(".chat-reply-copy p")).toHaveCount(1);
    checks.push(
      "A controlled model stream renders progressive text, sends a bounded current-piece excerpt, keeps the completed on-device reply in the transcript and cannot execute practice actions while pending.",
    );

    const countBeforeStop = await messages().count();
    // (Questions about "this passage" are now answered locally as a written-
    // score lesson, so the model stream is driven by a general question.)
    request = await startStream("What is a gentle warm-up before I practise?");
    await emit(request, "Begin with a relaxed hand.");
    await expect(answer()).toContainText("Begin with a relaxed hand.");
    await control("stop").click();
    // (The stopped notice is now "Stopped." with a "Retry reply" button, and
    // the partial reply is marked Stopped in the transcript.)
    await expect(notice()).toContainText("Stopped.");
    assert.equal(
      await page.evaluate(
        (i) => window.__conversationQA.requests[i].aborted,
        request,
      ),
      true,
    );
    await expect(answer()).toContainText("Begin with a relaxed hand.");
    await expect(answer().locator(".chat-source-stopped")).toHaveText(
      "Stopped",
    );
    await emit(request, "Late response must never be displayed", true);
    await page.waitForTimeout(150);
    await expect(dock()).not.toContainText(
      "Late response must never be displayed",
    );
    await retryReply().click();
    await expect
      .poll(() => page.evaluate(() => window.__conversationQA.requests.length))
      .toBe(request + 2);
    await emit(
      request + 1,
      "Start slowly and let the wrist stay comfortable.",
      true,
    );
    await expect(control("stop")).toHaveCount(0);
    assert.equal(
      await messages().count(),
      countBeforeStop + 2,
      "Retry replaces the interrupted answer without adding another user turn",
    );
    await expect(answer()).toContainText(
      "Start slowly and let the wrist stay comfortable.",
    );
    await expect(answer().locator(".chat-source-stopped")).toHaveCount(0);
    await expect(answer().locator(".chat-source")).toHaveText("On device");
    await expect(notice()).toHaveCount(0);
    request = await startStream(
      "What should I notice while listening to these bars?",
    );
    await emit(request, "Listen for an even pulse.");
    await expect(answer()).toContainText("Listen for an even pulse.");
    await close();
    assert.equal(
      await page.evaluate(
        (i) => window.__conversationQA.requests[i].aborted,
        request,
      ),
      true,
    );
    await open();
    await expect(answer()).toContainText("Listen for an even pulse.");
    await expect(answer().locator(".chat-source-stopped")).toHaveText(
      "Stopped",
    );
    await expect(control("stop")).toHaveCount(0);
    await close();
    await importPiece("retry-new");
    await open();
    await expect(notice()).toContainText(/Practice changed/);
    await expect(retryReply()).toBeDisabled();
    const requestCountAfterChange = await page.evaluate(
      () => window.__conversationQA.requests.length,
    );
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(() => window.__conversationQA.requests.length),
      requestCountAfterChange,
    );
    checks.push(
      "Stop and closing the dock abort the stream, keep clearly marked partial replies and reject late chunks; retry replaces the partial response without duplicating the user's question, and changing the piece disables stale retries.",
    );

    for (const [name, width, height] of [
      ["chat-desktop", 1280, 800],
      ["chat-mobile", 390, 844],
      ["chat-short", 1280, 580],
    ]) {
      await page.setViewportSize({ width, height });
      await input().fill("A long draft ".repeat(80));
      await bounds(name);
      await shot(name);
      await input().fill("");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(150);
    const animated = await page
      .locator(".companion-chat")
      .evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      );
    assert.equal(
      animated,
      0,
      "Reduced motion should stop decorative chat animation",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await close();
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      for (const name of ["Library", "Exercises", "Progress"]) {
        await button(name).click();
        await page.waitForTimeout(550);
        await bounds(`${name.toLowerCase()}-${width}`);
        await shot(`${name.toLowerCase()}-${width}`);
      }
    }
    checks.push(
      "Chat composer and transcript fit desktop, narrow and short windows, long drafts wrap, reduced motion disables decoration, and all three library screens avoid horizontal overflow.",
    );

    // (Replaces the failed-history-read check: since 2.35 the only stored
    // chat state is the legacy-history cleanup, reported by /api/health. A
    // failed cleanup is shown in the dock with Retry, chat stays usable, and
    // Retry asks the server to clean up again without sending any text.)
    await page.setViewportSize({ width: 1280, height: 800 });
    await button("Practice").click();
    let failCleanup = true;
    const cleanups = [];
    const healthRoute = async (route) => {
      if (!failCleanup) return route.continue();
      const response = await route.fetch();
      const json = await response.json();
      json.companionHistory = {
        ...json.companionHistory,
        cleanup: { ok: false, code: "HISTORY_CLEANUP_FAILED" },
      };
      return route.fulfill({ response, json });
    };
    const historyRoute = async (route) => {
      cleanups.push({
        method: route.request().method(),
        body: route.request().postData(),
      });
      return route.continue();
    };
    await page.route("**/api/health", healthRoute);
    await page.route("**/api/companion/history", historyRoute);
    await page.reload();
    await expect(button("Play")).toBeEnabled();
    await button("Beethoven").click();
    const cleanupError = page.locator(
      "[data-companion-dock] .chat-notice-error",
    );
    await expect(cleanupError).toContainText(
      "Earlier saved chat could not be cleared. Retry cleanup.",
    );
    await expect(input()).toBeEnabled();
    await expect(messages()).toHaveCount(0);
    failCleanup = false;
    await cleanupError
      .getByRole("button", { name: "Retry", exact: true })
      .click();
    await expect(cleanupError).toHaveCount(0);
    assert.deepEqual(cleanups, [{ method: "DELETE", body: null }]);
    await page.unroute("**/api/health", healthRoute);
    await page.unroute("**/api/companion/history", historyRoute);
    await ask("find QA conversation");
    await expect(answer().locator(".chat-action")).not.toHaveCount(0);
    await close();
    const playBounds = await button("Play").boundingBox();
    assert.ok(
      playBounds.y + playBounds.height <= 800,
      "Practice Play must remain visible at1280×800",
    );
    await expect(page.locator(".piano-key")).toHaveCount(88);
    await shot("practice-restored");
    checks.push(
      "A failed legacy-chat cleanup is reported in the dock without blocking chat; Retry cleans up without sending conversation text, and the piano still exposes 88 keys and a reachable Play control.",
    );
    assert.deepEqual(errors, []);
    return { checks, measurements, errors };
  } catch (error) {
    error.conversationEvidence = { checks, measurements, errors };
    throw error;
  } finally {
    page.off("pageerror", onError);
  }
}
