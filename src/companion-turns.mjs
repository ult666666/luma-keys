// Pure transcript edits for one on-device reply (the React hook in
// companion-model.js applies them). Kept separate so they can be tested
// without a browser.
import { conversationLanguage } from "./companion-language.mjs";

const NOTES = {
  stopped: {
    zh: "（回复已停止。）",
    "zh-Hant": "（回覆已停止。）",
    en: "(Reply stopped.)",
  },
  failed: {
    zh: "（这次没有回复，可以点“再试一次”。）",
    "zh-Hant": "（這次沒有回覆，可以點「再試一次」。）",
    en: "(No reply this time. You can try again.)",
  },
};

/** The learner's question for a reply. A retried question moves to the end,
 * next to its new answer, if other messages arrived after it. */
export function withQuestion(history, request, retry = false) {
  const userId = `${request.id}:u`;
  const existing = history.find((m) => m.id === userId);
  const user = existing || {
    id: userId,
    role: "user",
    message: request.body.message,
    companionId: request.companionId,
    scoreId: request.scoreId,
    scoreRevision: request.scoreRevision,
    ...(request.body.languagePreference ? { languagePreference: request.body.languagePreference } : {}),
  };
  const rest = history.filter((m) => m.id !== userId && (!retry || m.id !== request.id));
  if (!retry && existing) return history;
  return [...rest, user];
}

/** The reply in place after its question. A reply stopped or failed before
 * any text still answers the question, with a short note in its language,
 * so two questions never stack without an answer between them. */
export function withReply(history, request, text, { interrupted = false, failed = false } = {}) {
  const value = String(text ?? "").trim();
  let message = value;
  if (!message) {
    if (!interrupted) return history;
    const language = request.body.languagePreference || conversationLanguage([], request.body.message);
    const notes = failed ? NOTES.failed : NOTES.stopped;
    message = notes[language] || notes[language === "zh-Hant" ? "zh-Hant" : "en"];
  }
  const reply = {
    id: request.id,
    role: "assistant",
    source: "on-device",
    intent: "conversation",
    companionId: request.companionId,
    scoreId: request.scoreId,
    scoreRevision: request.scoreRevision,
    ...(request.body.languagePreference ? { languagePreference: request.body.languagePreference } : {}),
    message,
    actions: [],
    ...(interrupted ? { kind: "interrupted" } : {}),
  };
  const rest = history.filter((m) => m.id !== request.id);
  const at = rest.findIndex((m) => m.id === `${request.id}:u`);
  // Directly after its question; at the end when the question is missing.
  return at < 0 ? [...rest, reply] : [...rest.slice(0, at + 1), reply, ...rest.slice(at + 1)];
}
