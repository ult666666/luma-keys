import test from "node:test";
import assert from "node:assert/strict";
import { withQuestion, withReply } from "../src/companion-turns.mjs";
import { readCompanionHistory, validateCompanionHistory } from "../src/companion-conversation.mjs";
import { companionModelHistory } from "../src/companion-prompt.mjs";

const request = (id, message, extra = {}) => ({
  id,
  companionId: "mozart",
  scoreId: "song",
  scoreRevision: "rev-1",
  body: { message, companionId: "mozart", context: {}, history: [], ...extra },
});
const local = (id, message) => ({ id, role: "assistant", source: "local", intent: "command", kind: "receipt", actions: [], scoreId: "song", message });
const user = (id, message) => ({ id, role: "user", scoreId: "song", message });

test("a reply stopped before any text answers its question with a short note in its language", () => {
  const asked = withQuestion([], request("chat-1", "How do I play bar 6?"));
  const stopped = withReply(asked, request("chat-1", "How do I play bar 6?"), "", { interrupted: true });
  assert.deepEqual(stopped.map((m) => [m.id, m.role, m.kind ?? null, m.message]), [
    ["chat-1:u", "user", null, "How do I play bar 6?"],
    ["chat-1", "assistant", "interrupted", "(Reply stopped.)"],
  ]);
  const zh = withReply(withQuestion([], request("chat-2", "这段怎么练？", { languagePreference: "zh" })), request("chat-2", "这段怎么练？", { languagePreference: "zh" }), "", { interrupted: true, failed: true });
  assert.equal(zh.at(-1).message, "（这次没有回复，可以点“再试一次”。）");
  assert.equal(zh.at(-1).languagePreference, "zh");
  // The note is valid stored history and never reaches the model.
  assert.doesNotThrow(() => validateCompanionHistory(zh));
  assert.deepEqual(companionModelHistory(zh, { companionId: "mozart", scoreId: "song" }).map((m) => m.id), ["chat-2:u"]);
  // A completed reply with no text changes nothing.
  assert.deepEqual(withReply(asked, request("chat-1", "x"), "   "), asked);
});

test("retrying moves the question next to its new answer and replaces the stopped reply", () => {
  const first = request("chat-1", "Tips for bar 5?");
  let history = withReply(withQuestion([], first), first, "Keep the bass", { interrupted: true });
  history = [...history, user("u-local", "slower"), local("r-local", "Speed set to 70%.")];
  const retried = withQuestion(history, first, true);
  assert.deepEqual(retried.map((m) => m.id), ["u-local", "r-local", "chat-1:u"], "the old partial reply is gone and the question is last");
  const answered = withReply(retried, first, "Hold the bass note through the bar.");
  assert.deepEqual(answered.map((m) => m.id), ["u-local", "r-local", "chat-1:u", "chat-1"]);
  assert.equal(answered.at(-1).kind, undefined);
  assert.equal(readCompanionHistory(answered).length, 4);
  // Without later messages the order is unchanged.
  const simple = withReply(withQuestion([], first), first, "", { interrupted: true });
  assert.deepEqual(withQuestion(simple, first, true).map((m) => m.id), ["chat-1:u"]);
});

test("a new question is appended once, and a reply lands directly after its own question", () => {
  const a = request("chat-a", "first");
  const once = withQuestion([], a);
  assert.equal(withQuestion(once, a), once, "asking the same request twice does not duplicate it");
  const later = [...once, user("u-2", "another"), local("r-2", "Done.")];
  assert.deepEqual(withReply(later, a, "Answer.").map((m) => m.id), ["chat-a:u", "chat-a", "u-2", "r-2"]);
  assert.deepEqual(withReply([user("u-x", "x")], request("chat-z", "lost"), "Answer.").map((m) => m.id), ["u-x", "chat-z"], "a missing question puts the reply at the end");
});
