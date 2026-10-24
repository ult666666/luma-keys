import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const prefix = "native-conversation-model-2.9";
const root = await fs.mkdtemp(path.resolve(`.qa-runs/${prefix}-`));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library/preferences.json"),
  JSON.stringify({ volume: 0, companion: "beethoven" }),
);
let app, page;
const errors = [],
  replies = [];
const result = { passed: false, root, replies, errors };
try {
  app = await electron.launch({
    executablePath: path.resolve(
      "release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys",
    ),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  result.version = await app.evaluate(({ app }) => app.getVersion());
  assert.equal(result.version, "2.9.0");
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ app, BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.show();
      w.focus();
      w.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  result.availability = await page.evaluate(async () =>
    (await fetch("/api/companion/model")).json(),
  );
  assert.equal(
    result.availability.available,
    true,
    "This Mac's packaged model must be available",
  );
  await button("Beethoven").click();
  await expect(page.locator(".chat-identity")).toContainText(
    "On-device conversation",
  );
  const input = page.getByRole("textbox", {
    name: "Ask Beethoven",
    exact: true,
  });
  const history = () =>
    page.evaluate(
      async () =>
        (await (await fetch("/api/companion/history")).json()).messages,
    );
  for (const [index, question] of [
    "I'm a beginner. Give me one short practical suggestion for the current bar, using only the written notes you can see.",
    "请用中文把刚才的建议说得更简单一点，只给我一个练习步骤。",
  ].entries()) {
    await input.fill(question);
    const start = Date.now();
    await button("Ask").click();
    await expect(button("Stop reply")).toBeVisible();
    for (let attempt = 0; attempt < 3; attempt++) {
      let state = "waiting";
      await expect.poll(async () => {
        if ((await history()).filter((m) => m.source === "on-device").length === index + 1)
          return state = "reply";
        if (await page.locator(".chat-model-notice[role=alert]").count())
          return state = "error";
        return "waiting";
      }, { timeout: 95000 }).not.toBe("waiting");
      if (state === "reply") break;
      const notice = await page.locator(".chat-model-notice[role=alert]").innerText();
      (result.recoveries ||= []).push({ question: index + 1, attempt: attempt + 1, notice });
      if (attempt === 2) throw Error(`Model did not recover: ${notice}`);
      await button("Try again").click();
      await expect(button("Stop reply")).toBeVisible();
    }
    await expect(button("Stop reply")).toHaveCount(0);
    await expect(page.locator(".chat-composer-foot")).toContainText(
      "Saved on this Mac",
    );
    const messages = await history();
    const answer = messages.filter((m) => m.source === "on-device").at(-1);
    assert.equal(
      answer.kind,
      undefined,
      "Reply should finish without interruption",
    );
    assert.deepEqual(answer.actions, []);
    assert.ok(answer.message.trim().length > 0 && answer.message.length <= 4000);
    if (index === 1) assert.match(answer.message, /[\u3400-\u9fff]/);
    replies.push({
      question,
      response: answer.message,
      elapsedMs: Date.now() - start,
      companionId: answer.companionId,
    });
  }
  const before = await history();
  await page.screenshot({
    path: `evidence/${prefix}-conversation.png`,
    fullPage: false,
  });
  await button("Close dialog").click();
  await expect(button("Play")).toBeVisible();
  await page.reload();
  await expect(button("Play")).toBeEnabled();
  await button("Beethoven").click();
  await expect(input).toBeEnabled();
  assert.deepEqual(
    await history(),
    before,
    "Real responses and user turns survive reload exactly",
  );
  assert.equal(before.filter((m) => m.role === "user").length, 2);
  assert.equal(errors.length, 0);
  const stat = await fs.stat(
    path.join(root, "Library/companion/conversation.json"),
  );
  assert.equal(stat.mode & 0o777, 0o600);
  result.checks = [
    "Bundled native helper reports available",
    "Actual English and Chinese model replies stream and finish",
    "Replies cannot carry practice actions",
    "Conversation survives reload with exactly two user turns",
    "Playing remains paused and no page errors",
    "Saved history is owner-readable only",
  ];
  result.passed = true;
  console.log(
    `PASS actual on-device chat ${result.version}: ${replies.map((r) => r.elapsedMs + "ms").join(", ")}`,
  );
} catch (error) {
  result.error = error.message;
  await page
    ?.screenshot({ path: `evidence/${prefix}-failure.png`, fullPage: false })
    .catch(() => {});
  throw error;
} finally {
  await app?.close().catch((error) => errors.push(error.message));
  await fs.writeFile(
    `evidence/${prefix}-qa.json`,
    JSON.stringify(result, null, 2),
  );
}
