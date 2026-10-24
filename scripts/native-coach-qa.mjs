import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const run = path.resolve(
  process.env.LUMA_COACH_RUN || ".qa-runs/companion-coach-2.10-20260927-124749",
);
const root = await fs.mkdtemp(path.join(run, "native-coach-"));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library/preferences.json"),
  JSON.stringify({
    volume: 0,
    theme: "lavender",
    reading: {
      companion: "mozart",
      companionStyle: true,
      welcomeSeen: true,
      countIn: false,
      labels: "numbers",
      tonic: 0,
    },
  }),
);
const checks = [],
  replies = [],
  errors = [];
let app, page;
const result = { passed: false, root, checks, replies, errors };
try {
  app = await electron.launch({
    executablePath: path.resolve(
      "release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys",
    ),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  result.version = await app.evaluate(({ app }) => app.getVersion());
  assert.equal(result.version, "2.10.0");
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ app, BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.show();
      w.focus();
      w.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await expect(button("Play")).toBeEnabled();
  await button("Import a score").click();
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(run, "model-eval/SunnyDayChord.fixture.json"));
  await page
    .getByRole("dialog", { name: "Review score", exact: true })
    .waitFor();
  await button("Close dialog").click();
  await button("Mozart").click();
  const input = page.getByRole("textbox", { name: "Ask Mozart", exact: true });
  const history = () =>
    page.evaluate(
      async () =>
        (await (await fetch("/api/companion/history")).json()).messages,
    );
  const saved = () =>
    expect(page.locator(".chat-composer-foot")).toContainText(
      "Saved on this Mac",
    );
  const ask = async (text, { model = false } = {}) => {
    const before = await history(),
      start = Date.now();
    await input.fill(text);
    await button("Ask").click();
    if (model) await expect(button("Stop reply")).toBeVisible();
    await expect
      .poll(
        async () => {
          const h = await history();
          return (
            h.length > before.length &&
            h.at(-1)?.role === "assistant" &&
            h.at(-1)?.message
          );
        },
        { timeout: 95000 },
      )
      .toBeTruthy();
    await expect(button("Stop reply")).toHaveCount(0);
    await saved();
    const last = (await history()).at(-1);
    assert.equal(last.kind, undefined);
    replies.push({
      question: text,
      source: last.source,
      response: last.message,
      lesson: last.lesson,
      elapsedMs: Date.now() - start,
    });
    return last;
  };
  result.availability = await page.evaluate(async () =>
    (await fetch("/api/companion/model")).json(),
  );
  assert.equal(result.availability.available, true);
  const hello = await ask("HI!", { model: true });
  const bro = await ask("Bro!", { model: true });
  assert.notEqual(hello.message, bro.message);
  assert.equal(hello.source, "on-device");
  assert.equal(bro.source, "on-device");
  checks.push(
    "Actual packaged local model answers the two screenshot greetings with distinct replies.",
  );
  for (const question of [
    "Can you teach me this?",
    "Can you teach me this piece and break it down?",
  ]) {
    const turn = await ask(question);
    assert.equal(turn.source, "local");
    assert.equal(turn.intent, "lesson");
    assert.equal(turn.lesson.from, 1);
    assert.ok(!/starts \+|=pitch|duration=/.test(turn.message));
  }
  checks.push(
    "Both screenshot teaching requests produce saved, score-grounded lessons without raw note fields.",
  );
  const turn = await ask("Teach me bar 8");
  assert.equal(turn.lesson.from, 8);
  let latest = page
    .locator(".chat-message-assistant")
    .filter({ has: page.locator(".chat-lesson-heading") })
    .last();
  await latest
    .getByRole("button", { name: "Right hand only", exact: true })
    .click();
  await saved();
  await expect(page.locator(".chat-score-context")).toContainText("Bar 8 / 76");
  await expect(page.locator(".chat-score-context")).toContainText("Right hand");
  assert.equal(
    (
      await page
        .getByRole("radiogroup", {
          name: "Practice hand",
          exact: true,
          includeHidden: true,
        })
        .locator('[aria-checked="true"]')
        .getAttribute("class")
    )?.match(/hand-(\w+)/)?.[1],
    "right",
  );
  await page
    .getByRole("button", { name: "Wait for me", exact: true })
    .last()
    .click();
  await saved();
  await expect(page.locator(".chat-score-context")).toContainText("Bar 8 / 76");
  await ask("Next step");
  latest = page
    .locator(".chat-message-assistant")
    .filter({ has: page.locator(".chat-lesson-heading") })
    .last();
  await latest
    .getByRole("button", { name: "Left hand only", exact: true })
    .click();
  await saved();
  await expect(page.locator(".chat-score-context")).toContainText("Left hand");
  const speedButton = latest.getByRole("button", { name: /% speed/ });
  await expect(speedButton).toHaveCount(1);
  await speedButton.click();
  await saved();
  await expect(page.locator(".chat-score-context")).toContainText("60%");
  await expect(page.locator(".chat-score-context")).toContainText("Bar 8 / 76");
  assert.equal(
    await page
      .getByRole("button", { name: "Pause", exact: true, includeHidden: true })
      .count(),
    0,
  );
  assert.equal(
    await page.locator('[aria-label="Loop start bar"]').inputValue(),
    "8",
  );
  assert.equal(
    await page.locator('[aria-label="Loop end bar"]').inputValue(),
    "8",
  );
  checks.push(
    "Lesson hand, wait mode and slower speed prepare bar8 while chat remains open and playback stays paused.",
  );
  const combine = await ask("Next step");
  assert.equal(combine.lesson.step, 2);
  assert.equal(combine.lesson.from, 8);
  const advance = await ask("I got it");
  assert.equal(advance.lesson.step, 0);
  assert.equal(advance.lesson.from, 9);
  checks.push(
    "The lesson progresses from each hand to both hands, then advances one passage without claiming an assessed performance.",
  );
  await ask("教我第十二小节");
  await page.getByRole("button", { name: "试试左手", exact: true }).click();
  await saved();
  const chinese = (await history()).at(-1);
  assert.equal(chinese.lesson.from, 12);
  assert.equal(chinese.lesson.language, "zh");
  assert.equal(chinese.lesson.hand, "left");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await saved();
  assert.equal((await history()).at(-1).lesson.step, 1);
  checks.push(
    "Chinese follow-ups and hand chips retain the discussed passage even when transport is on a different bar.",
  );
  const pet = button("Say hello to Mozart");
  await pet.click();
  await expect(page.locator(".chat-pet-reply")).not.toHaveText(
    "Tap Mozart to say hello",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pet.focus();
  await page.keyboard.press("Enter");
  const animations = await pet.evaluate(
    (el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running").length,
  );
  assert.equal(animations, 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  checks.push(
    "Pet pointer/keyboard greetings work with live reduced motion and no running portrait animation.",
  );
  await page.screenshot({
    path: path.join(run, "screenshots/native-chinese-lesson.png"),
  });
  const beforeReload = await history();
  await button("Close dialog").click();
  await page.reload();
  await expect(button("Play")).toBeEnabled();
  await button("Mozart").click();
  await expect(input).toBeEnabled();
  assert.deepEqual(await history(), beforeReload);
  await saved();
  checks.push(
    "Native reload preserves the full mixed model/lesson transcript and validated lesson metadata exactly.",
  );
  await ask("Teach me this piece and break it down?");
  await page.screenshot({
    path: path.join(run, "screenshots/native-mozart-coach.png"),
  });
  assert.deepEqual(errors, []);
  result.passed = true;
} catch (error) {
  result.error = error.stack;
  await page
    ?.screenshot({
      path: path.join(run, "screenshots/native-coach-failure.png"),
    })
    .catch(() => {});
  throw error;
} finally {
  await fs.writeFile(
    path.join(run, "reports/native-coach.json"),
    JSON.stringify(result, null, 2),
  );
  await app?.close().catch(() => {});
}
console.log("PASS", checks.length, "packaged coach groups");
