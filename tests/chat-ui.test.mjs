import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_COPY_KEYS,
  CHAT_HEARTS_KEY,
  CHAT_TEXT_SIZE_KEY,
  chatCopy,
  chatGroups,
  chatSource,
  chatStarters,
  chatStatus,
  chatUiLanguage,
  readChatHearts,
  readChatTextSize,
  toggleChatHeart,
  writeChatHearts,
  writeChatTextSize,
} from "../src/chat-ui.mjs";
import { planCompanionTurn } from "../src/companion-conversation.mjs";
import { shouldUseCompanionModel } from "../src/companion-prompt.mjs";

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}
const throwing = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

test("the panel speaks English, Simplified or Traditional Chinese", () => {
  assert.equal(chatUiLanguage("zh"), "zh");
  assert.equal(chatUiLanguage("zh-Hant"), "zh-Hant");
  for (const other of ["en", "ja", "ar", "fr", undefined]) assert.equal(chatUiLanguage(other), "en");
  for (const language of ["en", "zh", "zh-Hant"]) {
    const copy = chatCopy(language);
    assert.deepEqual(Object.keys(copy).sort(), [...CHAT_COPY_KEYS].sort(), `${language} has every key`);
    for (const state of ["ready", "thinking", "writing", "checking", "offline"]) {
      assert.ok(copy.status[state], `${language} status ${state}`);
      assert.ok(copy.statusLong[state], `${language} long status ${state}`);
    }
  }
  assert.equal(chatCopy("zh-Hant").close, "關閉");
  assert.equal(chatCopy("zh").close, "关闭");
  assert.equal(chatCopy("ar").close, "Close");
});

test("every control the brief names has an accessible name in each language", () => {
  for (const language of ["en", "zh", "zh-Hant"]) {
    const copy = chatCopy(language);
    for (const key of ["stop", "retry", "copy", "close", "minimize", "options", "send", "like", "dismiss"])
      assert.ok(typeof copy[key] === "string" && copy[key].trim(), `${language}.${key}`);
  }
  assert.match(chatCopy("en").stop, /Stop/);
  assert.match(chatCopy("en").retry, /Retry/);
  assert.match(chatCopy("en").copy, /Copy/);
});

test("the status beside the name follows the model and the reply", () => {
  assert.equal(chatStatus({ available: true }), "ready");
  assert.equal(chatStatus({ available: false, reason: "checking" }), "checking");
  assert.equal(chatStatus({ available: false, reason: "connection" }), "offline");
  assert.equal(chatStatus({ available: true, pending: true }), "thinking");
  assert.equal(chatStatus({ available: true, pending: true, text: true }), "writing");
});

test("empty-state suggestions are about the open bar and route as before", () => {
  const en = chatStarters({ language: "en", bar: 50, model: true });
  assert.equal(en.length, 4);
  assert.deepEqual(en.map((s) => s.id), ["teach", "resume", "focus", "find"]);
  assert.equal(en[0].message, "Teach me bar 50");
  assert.equal(en[3].prefill, true);
  assert.equal(en[3].label, "Find a piece…");
  assert.equal(chatStarters({ language: "en", bar: 3, model: false })[2].id, "numbers");
  assert.equal(chatStarters({ language: "zh", bar: 7 })[0].message, "教我第7小节");
  assert.equal(chatStarters({ language: "zh-Hant", bar: 7 })[0].label, "教我第7小節");
  assert.equal(chatStarters({ language: "en", bar: 0 })[0].message, "Teach me bar 1");
  assert.equal(chatStarters({ language: "en", bar: "x" })[0].message, "Teach me bar 1");

  // The phrases are ones the local planner already answers from the score.
  const score = {
    id: "song",
    title: "Song",
    measures: 8,
    beatsPerBar: 4,
    tempo: 90,
    notes: [{ pitch: 60, start: 0, duration: 1, hand: "right", measure: 1 }],
  };
  const context = { pieces: [score], currentScore: score, journal: { pieces: {} }, currentBar: 1, speed: 1, hand: "both", mode: "listen" };
  for (const language of ["en", "zh", "zh-Hant"])
    for (const starter of chatStarters({ language, bar: 1, model: false }).filter((s) => !s.prefill)) {
      const turn = planCompanionTurn(starter.message, context, []);
      assert.equal(shouldUseCompanionModel(turn), false, `${language} “${starter.message}” stays local (${turn.intent})`);
    }
  const focus = chatStarters({ language: "en", bar: 1, model: true }).find((s) => s.id === "focus");
  assert.equal(shouldUseCompanionModel(planCompanionTurn(focus.message, context, [])), true, "the open question goes to the model");
});

test("a reply's source label", () => {
  assert.equal(chatSource({ role: "user" }), null);
  assert.equal(chatSource({ role: "assistant", kind: "receipt" }), "receipt");
  assert.equal(chatSource({ role: "assistant", lesson: { from: 1 } }), "lesson");
  assert.equal(chatSource({ role: "assistant", source: "on-device" }), "on-device");
  assert.equal(chatSource({ role: "assistant", source: "local" }), "local");
});

test("consecutive messages from one speaker share a face; receipts stand alone", () => {
  const groups = chatGroups(
    [
      { id: "1", role: "user" },
      { id: "2", role: "assistant", companionId: "liszt" },
      { id: "3", role: "assistant", companionId: "liszt" },
      { id: "4", role: "assistant", companionId: "liszt", kind: "receipt" },
      { id: "5", role: "assistant", companionId: "mozart" },
      { id: "6", role: "assistant" },
      { id: "7", role: "user" },
      { id: "8", role: "user" },
    ],
    "mozart",
  );
  assert.deepEqual(
    groups.map((g) => [g.role, g.author, g.kind, g.messages.map((m) => m.id).join("")]),
    [
      ["user", "user", "bubble", "1"],
      ["assistant", "liszt", "bubble", "23"],
      ["assistant", "liszt", "receipt", "4"],
      ["assistant", "mozart", "bubble", "56"],
      ["user", "user", "bubble", "78"],
    ],
  );
  assert.deepEqual(chatGroups([]), []);
});

test("text size preference is remembered without conversation content", () => {
  const storage = memoryStorage();
  assert.equal(readChatTextSize(storage), "normal");
  assert.equal(writeChatTextSize(storage, "large"), true);
  assert.equal(storage.data.get(CHAT_TEXT_SIZE_KEY), "large");
  assert.equal(readChatTextSize(storage), "large");
  writeChatTextSize(storage, "huge");
  assert.equal(readChatTextSize(storage), "normal", "unknown sizes fall back to normal");
  assert.equal(readChatTextSize(throwing), "normal");
  assert.equal(writeChatTextSize(throwing, "large"), false);
  assert.equal(readChatTextSize(null), "normal");
});

test("hearts stay in memory and legacy saved reaction IDs are removed", () => {
  const storage = memoryStorage();
  let hearts = readChatHearts(storage);
  assert.equal(hearts.size, 0);
  hearts = toggleChatHeart(hearts, "a");
  hearts = toggleChatHeart(hearts, "b");
  assert.deepEqual([...hearts], ["a", "b"]);
  hearts = toggleChatHeart(hearts, "a");
  assert.deepEqual([...hearts], ["b"]);
  hearts = toggleChatHeart(hearts, "c", new Set(["c"]));
  assert.deepEqual([...hearts], ["c"], "replies that left the 60-message history lose their heart");
  assert.equal(writeChatHearts(storage, hearts), true);
  assert.deepEqual([...readChatHearts(storage)], []);
  assert.equal(storage.data.has(CHAT_HEARTS_KEY), false);
  assert.equal(readChatHearts(memoryStorage({ [CHAT_HEARTS_KEY]: "{not json" })).size, 0);
  assert.deepEqual([...readChatHearts(memoryStorage({ [CHAT_HEARTS_KEY]: JSON.stringify(["x", 3, null, "y"]) }))], []);
  assert.equal(readChatHearts(throwing).size, 0);
  assert.equal(writeChatHearts({ removeItem() { throw Error("blocked"); } }, hearts), false);
  let many = new Set();
  for (let i = 0; i < 260; i++) many = toggleChatHeart(many, `m${i}`);
  assert.equal(many.size, 200, "capped");
  assert.ok(many.has("m259") && !many.has("m0"), "the newest are kept");
});


test("temporary-chat copy explains reset and contains no saved-transcript promise", () => {
  for (const language of ["en", "zh", "zh-Hant"]) {
    const copy = chatCopy(language);
    assert.ok(copy.temporary && copy.newChat && copy.temporaryDetail && copy.cleared);
    assert.doesNotMatch(copy.privacy + copy.privacyOff, /60|保留最近|latest/i);
  }
  assert.match(chatCopy("en").temporaryDetail, /quit or reload/);
});

test("legacy reactions are deleted without reading their contents or touching text size", () => {
  const removed = [];
  const storage = { getItem() { throw Error("must not read history"); }, setItem() { throw Error("must not write history"); }, removeItem(key) { removed.push(key); } };
  assert.equal(readChatHearts(storage).size, 0);
  writeChatHearts(storage, new Set(["private-reply-id"]));
  assert.deepEqual(removed, [CHAT_HEARTS_KEY, CHAT_HEARTS_KEY]);
});
