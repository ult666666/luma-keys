import { planMaestroCommand, resumeMaestroPiece, resolveMaestroPiece, resumeMaestroQuery, findMaestroQuery, normalizeRequestText, stripRequestFrame, fillerOnlyReference } from "./maestro.mjs";
import { planCompanionLesson } from "./companion-coach.mjs";
import { COMPANIONS } from "./companions.mjs";
import { conversationLanguage, conversationLanguagePreference, languageRequest, companionActionLabel, isConversationLanguage, languageAcknowledgement } from "./companion-language.mjs";

// This is the offline conversation adapter. It plans existing local actions;
// it does not call a model, execute actions, or infer that an action succeeded.
export const COMPANION_HISTORY_LIMITS = Object.freeze({
  messages: 60,
  message: 4000,
  bytes: 200 * 1024,
  actions: 40,
});
const companionIds = new Set(COMPANIONS.map((p) => p.id));
const intents = new Set([
  "search",
  "resume",
  "command",
  "help",
  "clarify",
  "guidance",
  "conversation",
  "lesson",
]);
const scoped = new Set([
  "seek-bar",
  "repeat-bars",
  "set-speed",
  "set-hand",
  "set-mode",
]);
const size = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const plain = (value, max = 4000) =>
  typeof value === "string"
    ? value
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi, "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : "";
const scoreId = (score) =>
  typeof score?.id === "string" && score.id.length <= 100 ? score.id : null;
const has = (value, key) => Object.hasOwn(value, key);
const fail = (message) => {
  throw new Error(`Invalid companion history: ${message}`);
};

function hash(text) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

/** A content fingerprint, not an authentication token. Recompute on score edits. */
export function scoreContextId(score) {
  if (!score || typeof score !== "object") return null;
  const notes = (Array.isArray(score.notes) ? score.notes : []).map((n) => [
    n.id,
    n.beat,
    n.duration,
    n.midi,
    n.hand,
  ]);
  return `score-v1-${hash(
    JSON.stringify([
      score.id ?? null,
      score.title,
      score.composer,
      score.measures,
      score.duration,
      score.bpm,
      score.tonic,
      score.keySignature,
      score.timeSignature,
      score.measureMap,
      score.measureStarts,
      score.measureLengths,
      score.measurePulses,
      score.measureSignatures,
      score.meter,
      score.meterPulses,
      score.pickup,
      score.meterMap,
      score.tempoMap,
      score.tempos,
      score.pedals,
      notes,
    ]),
  )}`;
}

function object(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail("expected a plain object");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key))
      fail("unknown field");
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (d.get || d.set || typeof d.value === "function")
      fail("executable value");
  }
}
function text(value, max, strict, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !plain(value, max)) fail("missing text");
  const cleaned = plain(value, max);
  if (
    strict &&
    (value.length > max || plain(value, value.length) !== value.trim())
  )
    fail("text must be bounded plain text");
  return cleaned;
}
function identifier(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(value))
    fail("invalid identifier");
  return value;
}
function integer(value) {
  if (!Number.isInteger(value) || value < 1 || value > 1e6) fail("invalid bar");
  return value;
}
function actionValue(value, strict = true) {
  const common = ["id", "type", "label", "scoreId", "scoreRevision"];
  const fields = {
    "open-piece": ["pieceId", "bar"],
    "seek-bar": ["bar"],
    "repeat-bars": ["from", "to"],
    "set-speed": ["speed"],
    "set-hand": ["hand"],
    "set-mode": ["mode"],
    navigate: ["view"],
    "show-help": ["topic"],
    "open-settings": [],
    "import-score": [],
  };
  if (!value || !has(fields, value.type)) fail("unknown action");
  object(value, [...common, ...fields[value.type]]);
  const out = {
    id: text(value.id, 160, strict),
    type: value.type,
    label: text(value.label, 240, strict),
    scoreId: identifier(value.scoreId ?? null, true),
  };
  if (value.scoreRevision !== undefined)
    out.scoreRevision = identifier(value.scoreRevision, true);
  const oneOf = (key, options) => {
    if (!options.includes(value[key])) fail(`invalid ${key}`);
    out[key] = value[key];
  };
  if (value.type === "open-piece") out.pieceId = identifier(value.pieceId);
  if (["open-piece", "seek-bar"].includes(value.type))
    out.bar = integer(value.bar);
  if (value.type === "repeat-bars") {
    out.from = integer(value.from);
    out.to = integer(value.to);
    if (out.from > out.to) fail("reversed bar range");
  }
  if (value.type === "set-speed") {
    if (
      !Number.isFinite(value.speed) ||
      value.speed < 0.25 ||
      value.speed > 1.25 ||
      Math.abs(value.speed * 20 - Math.round(value.speed * 20)) > 1e-8
    )
      fail("invalid speed");
    out.speed = value.speed;
  }
  if (value.type === "set-hand") oneOf("hand", ["left", "right", "both"]);
  if (value.type === "set-mode") oneOf("mode", ["listen", "wait", "perform"]);
  if (value.type === "navigate")
    oneOf("view", ["practice", "library", "exercises", "progress"]);
  if (value.type === "show-help") oneOf("topic", ["numbers", "commands"]);
  return out;
}

function lessonValue(value, message) {
  object(value, [
    "version",
    "scoreId",
    "scoreRevision",
    "from",
    "to",
    "hand",
    "step",
    "simple",
    "language",
  ]);
  if (
    value.version !== 1 ||
    ![0, 1, 2].includes(value.step) ||
    !["left", "right", "both"].includes(value.hand) ||
    typeof value.simple !== "boolean"
  )
    fail("invalid lesson");
  const lesson = {
    version: 1,
    scoreId: identifier(value.scoreId, true),
    scoreRevision: identifier(value.scoreRevision, true),
    from: integer(value.from),
    to: integer(value.to),
    hand: value.hand,
    step: value.step,
    simple: value.simple,
  };
  if (
    lesson.from > lesson.to ||
    lesson.to - lesson.from > 7 ||
    lesson.scoreId !== message.scoreId ||
    lesson.scoreRevision !== message.scoreRevision ||
    message.source !== "local" ||
    message.intent !== "lesson" ||
    message.kind
  )
    fail("lesson does not match reply");
  if (value.language !== undefined) {
    if (!["en", "zh"].includes(value.language)) fail("invalid lesson language");
    lesson.language = value.language;
  }
  return lesson;
}

function messageValue(value, strict) {
  object(value, [
    "id",
    "role",
    "message",
    "scoreId",
    "scoreRevision",
    "source",
    "intent",
    "actions",
    "companionId",
    "kind",
    "lesson",
    "languagePreference",
  ]);
  if (!["user", "assistant"].includes(value.role)) fail("invalid message role");
  const out = {
    id: identifier(value.id),
    role: value.role,
    message: text(value.message, COMPANION_HISTORY_LIMITS.message, strict),
    scoreId: identifier(value.scoreId ?? null, true),
  };
  if (value.scoreRevision !== undefined)
    out.scoreRevision = identifier(value.scoreRevision, true);
  if (value.companionId !== undefined) {
    if (!companionIds.has(value.companionId)) fail("invalid companion");
    out.companionId = value.companionId;
  }
  if (value.languagePreference !== undefined) {
    if (!isConversationLanguage(value.languagePreference)) fail("invalid language preference");
    out.languagePreference = value.languagePreference;
  }
  if (value.role === "user") {
    if (
      value.actions !== undefined ||
      value.source !== undefined ||
      value.intent !== undefined ||
      value.kind !== undefined ||
      value.lesson !== undefined
    )
      fail("user message contains assistant fields");
  } else {
    if (
      !["local", "on-device"].includes(value.source) ||
      !intents.has(value.intent)
    )
      fail("invalid reply source or intent");
    if (
      !Array.isArray(value.actions) ||
      value.actions.length > COMPANION_HISTORY_LIMITS.actions
    )
      fail("too many actions");
    if (value.source === "on-device" && value.actions.length)
      fail("model replies cannot contain actions");
    out.source = value.source;
    out.intent = value.intent;
    out.actions = value.actions.map((a) => actionValue(a, strict));
    if (value.kind !== undefined) {
      if (
        !["receipt", "interrupted"].includes(value.kind) ||
        out.actions.length ||
        (value.kind === "receipt" && value.source !== "local")
      )
        fail("invalid message kind");
      out.kind = value.kind;
    }
  }
  if (value.lesson !== undefined) out.lesson = lessonValue(value.lesson, out);
  return out;
}

function parsed(value) {
  if (typeof value !== "string") return value;
  if (new TextEncoder().encode(value).length > COMPANION_HISTORY_LIMITS.bytes)
    fail("history exceeds 200KB");
  try {
    return JSON.parse(value);
  } catch {
    fail("invalid JSON");
  }
}

/** Strict persistence boundary: throws instead of silently discarding damaged data. */
export function validateCompanionHistory(value) {
  const input = parsed(value);
  if (!Array.isArray(input) || input.length > COMPANION_HISTORY_LIMITS.messages)
    fail("expected at most 60 messages");
  const result = input.map((m) => messageValue(m, true));
  const seen = new Set();
  for (const m of result) {
    for (const id of [m.id, ...(m.actions || []).map((a) => a.id)]) {
      if (seen.has(id)) fail("duplicate message or action identifier");
      seen.add(id);
    }
  }
  if (size(result) > COMPANION_HISTORY_LIMITS.bytes)
    fail("history exceeds 200KB");
  return result;
}

/** Forgiving UI hydration; disk writes must use the strict validator above. */
export function readCompanionHistory(value) {
  let input;
  try {
    input = parsed(value);
  } catch {
    return [];
  }
  if (!Array.isArray(input)) return [];
  const result = [],
    seen = new Set();
  for (const entry of input
    .slice(-COMPANION_HISTORY_LIMITS.messages)
    .reverse()) {
    try {
      const m = messageValue(entry, false);
      const ids = [m.id, ...(m.actions || []).map((a) => a.id)];
      if (ids.some((id) => seen.has(id)) || new Set(ids).size !== ids.length)
        continue;
      ids.forEach((id) => seen.add(id));
      result.unshift(m);
    } catch {
      /* Invalid messages do not become actionable UI. */
    }
  }
  while (result.length && size(result) > COMPANION_HISTORY_LIMITS.bytes)
    result.shift();
  return result;
}

export function serializeCompanionHistory(history) {
  return JSON.stringify(validateCompanionHistory(history));
}

export function appendCompanionExchange(history, input, turn) {
  const previous = readCompanionHistory(history);
  const assistant = messageValue({ ...turn, role: "assistant" }, true);
  const user = {
    id: `${assistant.id}:u`,
    role: "user",
    message: plain(input),
    scoreId: assistant.scoreId,
  };
  if (assistant.scoreRevision !== undefined)
    user.scoreRevision = assistant.scoreRevision;
  if (assistant.companionId !== undefined)
    user.companionId = assistant.companionId;
  if (assistant.languagePreference !== undefined)
    user.languagePreference = assistant.languagePreference;
  if (!user.message) return previous;
  return readCompanionHistory([...previous, user, assistant]);
}

// Greetings, fillers and courtesies around a request are not part of it:
// “ok open that one”, “yo where'd I stop”, “open the Bach then”.
const normalized = (value) =>
  stripRequestFrame(normalizeRequestText(plain(value, 500)), { light: true })
    .toLowerCase()
    .replace(/[.!?。？！]+$/g, "")
    .trim()
    .replace(/^(?:(?:please|could you|can you)\s+|请你?|請你?)+/, "");
function selection(request) {
  const english =
    request.match(
      /^(?:(?:choose|select|open|use|resume|continue)\s+)?(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d+(?:st|nd|rd|th)?)(?:\s+(?:one|piece|version|arrangement|option))?$/,
    ) || request.match(/^(?:option|choice|version)\s+(\d+)$/);
  const chinese = request.match(
    /^(?:(?:选择|選擇|选|選|打开|打開|继续|繼續)\s*)?第?([一二三四五六七八九十两兩\d]+)(?:个|個|首|个版本|個版本|版)$/,
  );
  const word = english?.[1] || chinese?.[1];
  if (!word) return null;
  const words = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
  ];
  const han = {
    一: 1,
    二: 2,
    两: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return {
    index:
      word === "last"
        ? -1
        : words.includes(word)
          ? words.indexOf(word) + 1
          : han[word] || Number(word.replace(/(?:st|nd|rd|th)$/, "")),
    resume: /^(?:resume|continue|继续|繼續)/.test(request),
  };
}
function latestChoices(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "assistant" || m.kind === "receipt") continue;
    if (["search", "resume"].includes(m.intent))
      return m.actions.filter((a) => a.type === "open-piece");
    // A later prose answer may itself describe choices. Do not interpret its
    // ordinal references as selections from an older library result.
    if (
      ["conversation", "command", "help", "guidance", "lesson"].includes(
        m.intent,
      )
    )
      return [];
  }
  return [];
}

// This grammar only combines existing explicit controls; it never asks a model
// to invent action arguments. Validate every clause before exposing any button.
function compoundControls(request, context, zh) {
  const start = /^(?:repeat\b|loop\b|(?:go|jump|skip|seek)\b|bar\b|measure\b|(?:set|change)\s+speed\b|speed\b|slower\b|faster\b|slow down\b|speed up\b|(?:use|play|practi[cs]e)\s+(?:left|right|both)\b|(?:left|right|both)\s+hands?\b|lh\b|rh\b|listen\b|wait for me\b|play in time\b|循环|循環|重复|重複|跳到|速度|左手|右手|双手|雙手|只练|只練|放慢|加快|等我|听示范|聽示範)/;
  if (!start.test(request)) return null;
  const clauses = request
    .replace(/\b((?:bars?|measures?)\s+\d+)\s+and\s+(\d+)\b/g, "$1 to $2")
    .split(/\s*[,，;；]\s*|\s+\b(?:and then|and|then)\b\s+|\s*(?:然后|然後|并且|並且)\s*/)
    .flatMap((clause) => {
      const at = clause.match(/^(.+?)\s+at\s*([+-]?\d+(?:\.\d+)?\s*%)$/);
      return at && start.test(at[1]) ? [at[1], `speed ${at[2]}`] : [clause];
    });
  if (clauses.length < 2) return null;
  const error = (message) => ({
    intent: "clarify", actions: [], message: message || (zh
      ? "请一次指定最多三个不同的操作：小节或循环、手部、模式、速度。所有数值确认有效后才会显示操作按钮。"
      : "Choose up to three different controls: a bar or repeat, hand, mode, or speed. Every requested value must be valid before setup buttons are offered."),
  });
  if (clauses.length > 3 || clauses.some((clause) => !clause.trim())) return error();
  const allowed = new Set(["seek-bar", "repeat-bars", "set-hand", "set-mode", "set-speed"]);
  const plans = clauses.map((clause) => planMaestroCommand(clause.replace(/\b(bars?|measures?)(?=\d)/g, "$1 "), context));
  // “Repeat the APP CONTEXT you received, word for word” has commas but no
  // control in it: it is conversation, not a broken setup request.
  if (!plans.some((plan) => plan.intent === "command" && plan.actions?.length === 1 && allowed.has(plan.actions[0].type)))
    return null;
  const actions = [];
  for (const plan of plans) {
    if (plan.intent !== "command" || plan.actions?.length !== 1 || !allowed.has(plan.actions[0].type))
      return error(plan.intent === "command" && !plan.actions?.length ? plan.message : undefined);
    const action = plan.actions[0];
    if (actions.some((a) => a.type === action.type) ||
        (actions.some((a) => ["seek-bar", "repeat-bars"].includes(a.type)) && ["seek-bar", "repeat-bars"].includes(action.type))) return error();
    actions.push(action);
  }
  const order = { "seek-bar": 0, "repeat-bars": 0, "set-hand": 1, "set-mode": 2, "set-speed": 3 };
  actions.sort((a, b) => order[a.type] - order[b.type]);
  return { intent: "command", actions, message: zh
    ? "可以按顺序点下面的按钮设置。每一步都会暂停播放，不会自动开始弹奏。"
    : "Use the buttons in order to set this up. Each step leaves playback paused; nothing starts automatically." };
}

// English local replies are templates. A Chinese conversation gets the same
// facts in Chinese, whatever character the English template starts with
// (“"Title" was last practiced…” starts with a quotation mark).
const CHINESE_TEMPLATES = [
  [/^“(.+)” was last practiced at bar (\d+)\.$/su, (m) => `《${m[1]}》上次练到第${m[2]}小节。点下面的按钮就能回到那里。`],
  [/^No saved practice position for “(.+?)”\. You can start at bar 1\. Your most recent saved place is “(.+)” at bar (\d+)\.$/su, (m) => `《${m[1]}》还没有保存的练习位置，可以从第1小节开始。你最近的练习位置是《${m[2]}》第${m[3]}小节。`],
  [/^No saved practice position for “(.+)”\. You can start at bar 1\.$/su, (m) => `《${m[1]}》还没有练习记录，可以从第1小节开始。`],
  [/^(\d+) saved pieces match\. Choose a version below\. Saved places: (.+)\.$/su, (m) => `找到${m[1]}个版本，请选一个。各版本的位置：${m[2].split("; ").map((part) => {
    const found = part.match(/^“(.+)” (?:bar (\d+)|not practised yet)$/su);
    return found ? `《${found[1]}》${found[2] ? `第${found[2]}小节` : "还没练过"}` : part;
  }).join("；")}。`],
  [/^There is no saved practice position yet\. Open a piece from the library\.$/, () => "还没有保存的练习位置，可以先到曲库选一首曲子。"],
  [/^(\d+) saved pieces match\. Choose a version below\.$/, (m) => `找到${m[1]}个版本，请选一个。`],
  [/^Found “(.+)” in your library\.$/su, (m) => `曲库里有《${m[1]}》。`],
  [/^No saved piece matches “(.+)”\. Your latest saved place is “(.+)” at bar (\d+)\.$/su, (m) => `曲库里没有匹配“${m[1]}”的乐谱。你最近的练习位置是《${m[2]}》第${m[3]}小节。`],
  [/^No saved piece matches “(.+)”\. Import its PDF, MusicXML or MIDI to add it\.$/su, (m) => `曲库里没有匹配“${m[1]}”的乐谱，可以导入PDF、MusicXML或MIDI文件。`],
  [/^Which piece\? Enter a title or composer/, () => "想找哪一首？输入曲名或作曲家，例如“找晴天”或“找贝多芬”。"],
  [/^Open a score to see guidance for its current bar\.$/, () => "先打开一份乐谱，才能看当前小节的提示。"],
  [/^There is no written-score tip for this bar\./, () => "这一小节没有乐谱提示。可以选一段来练，或告诉我要循环哪几小节。"],
  [/^Local tools do not support open-ended chat\./, () => "现在只能用本地练习工具，不能自由聊天。可以说“找晴天”“我上次练到哪了”“循环第4到8小节”或“慢一点”。"],
  [/^Find a piece, resume practice, or ask to change a bar, hand or speed\.$/, () => "可以找曲子、回到上次的位置，或调整小节、手和速度。"],
  [/^Try “find Für Elise”/, () => "可以试试“找致爱丽丝”“继续”“跳到第8小节”“循环第4到8小节”“慢一点”或“右手”。"],
  [/^Open a score before choosing a bar\.$/, () => "先打开一份乐谱，再选择小节。"],
  [/^Choose a PDF, MusicXML or MIDI file\.$/, () => "可以选择PDF、MusicXML或MIDI文件。"],
  [/^Listen & follow plays the written notes for you: set it up below, then press Play to hear (the piece|bars? ([\d–]+))\.$/, (m) => `“示范播放”会按乐谱弹给你听：先用下面的按钮设置好，再按播放，就能听到${m[2] ? `第${m[2]}小节` : "整首曲子"}。`],
  [/^Listen & follow is on: press Play to hear (the piece|bars? ([\d–]+))\.$/, (m) => `现在就是“示范播放”模式：按播放就能听到${m[2] ? `第${m[2]}小节` : "整首曲子"}。`],
];
function chineseTemplate(message) {
  for (const [pattern, render] of CHINESE_TEMPLATES) {
    const match = message.match(pattern);
    if (match) return render(match);
  }
  return null;
}

// ---- Piece suggestions come from the learner's own library, never from a
// model's memory of famous pieces. Built-in lessons are a last resort.
const SUGGESTION_REQUEST = [
  // “which Beethoven piece should I learn next?”
  /\b(?:what|which)\s+(?:[\p{L}'’-]+\s+){0,2}?(?:piece|song|music|sonata|work)s?\s+(?:should|can|could|shall|do|would)\s+(?:i|we|you)\s+(?:play|practi[cs]e|learn|try|recommend|suggest)\b/u,
  /\b(?:find|show|give|get|pick|suggest|recommend)\s+(?:me\s+)?(?:something|a piece|a song|one|another one)\s+(?:easy|easier|simple|simpler|new|different|fun|else|harder|more challenging)\b/,
  /\b(?:a|another|some|any)\s+(?:new|different|easier|harder|simpler|easy|fun|other)\s+(?:piece|song)s?\b(?:\s+(?:to|for me to)\s+(?:try|play|learn|practi[cs]e))?/,
  /(?:我)?(?:想|要)(?:弹|彈|练|練)(?:点|點|些|一首|首)?(?:简单|簡單|容易|轻松|輕鬆|新|别的|別的|好听|好聽)(?:的|一点|一點)?(?:曲子|歌)?/,
  // “有没有简单一点的曲子推荐？”, “简单的曲子有哪些”
  /(?:有没有|有沒有|有什么|有什麼|有哪些)(?:比较|比較|更)?(?:简单|簡單|容易|轻松|輕鬆|好听|好聽|新|别的|別的|其他)?(?:一点|一點|点|點|些)?的?(?:曲子|歌|钢琴曲|鋼琴曲)|(?:简单|簡單|容易|轻松|輕鬆)(?:一点|一點|点|點|些)?的(?:曲子|歌|钢琴曲|鋼琴曲)|(?:曲子|歌|钢琴曲|鋼琴曲)(?:推荐|推薦)/,
  /\bwhat\s+(?:should|can|could|shall)\s+(?:i|we)\s+play\b(?!\s+(?:in|on|at|here|there|with|for|first|next)\b)/,
  /\b(?:suggest|recommend)\s+(?:me\s+)?(?:a|some|another|one|something|any|a few)\b/,
  /\b(?:pick|choose)\s+(?:a|another|something)\s+(?:piece|song|for me)\b/,
  /\b(?:shall|should|can|could|let'?s|lets|wanna|want to)\s+(?:we\s+|i\s+)?play\s+(?:some|a|another|something|anything|a few)\b(?!\s+(?:bars?|measures?|notes?|chords?|scales?|of)\b)/,
  /\bany\s+(?:piece|song)\s+(?:suggestions|recommendations|ideas)\b/,
  /^(?:(?:give me|i want|i'd like|i need|find me|try)\s+)?something\s+(?:(?:a\s+(?:bit|little)\s+)?(?:more\s+)?(?:easy|easier|simple|simpler|new|different|fun|harder|challenging|difficult|tougher|calm|calmer|relaxing|gentle|quiet|slow|slower|lively|upbeat|fast|faster|happy|cheerful|romantic|classical|modern|pop))(?:\s+to\s+(?:play|practi[cs]e|learn|try))?(?:\s+please)?$/,
  /(?:来|來|换|換|有没有|有沒有)?(?:一首|首|点|點)?(?:难一点|難一點|难一些|難一些|更难|更難|有挑战|有挑戰|安静|安靜|舒缓|舒緩|轻快|輕快|欢快|歡快|抒情)(?:一点|一點|一些|些)?的?(?:曲子|歌|钢琴曲|鋼琴曲)/,
  /(?:今天|现在|現在|接下来|接下來|下面)?(?:我|我们|我們)?(?:应该|應該|该|該|要|可以|能)?(?:弹|彈|练|練)(?:点|點|些)?(?:什么|什麼|啥|哪首)(?:曲子|歌|好|呢|吧)?(?:$|[?？。！!，,])/,
  /(?:推荐|推薦)(?:一首|几首|幾首|一些|点|點|下)?(?:曲子|歌|钢琴曲|鋼琴曲|作品)/,
  /(?:来|來|一起)(?:弹|彈)(?:几首|幾首|一首|点|點|些)(?:曲子|歌)?/,
  /有(?:什么|什麼|哪些)(?:曲子|歌)(?:可以|能)?(?:弹|彈|练|練)/,
  /(?:选|選|换|換|挑)一首/,
  // What comes after this piece: “what should I learn next?”, “what should I
  // practise after this?”, “once I've got this one down, what…”, “练完这首之后…
  // 练什么”, “除了这首还有什么可以练的”.
  // “Next” alone after “play/practise/work on” is often the next step or bar
  // (“what should I work on next time?”), so only learning verbs take it.
  /\bwhat\s+(?:should|can|could|shall|do you think|would you have)\s+(?:i|we)\s+(?:learn|pick up|move on to|tackle|start)\s+(?:next|after(?:wards)?(?:\s+(?:this|that|it)(?:\s+(?:one|piece|song))?)?|then|later)\b(?!\s+(?:time|session|lesson|week|day|bar|measure|passage))/,
  /\bwhat\s+(?:should|can|could|shall|do you think|would you have)\s+(?:i|we)\s+(?:play|practi[cs]e|study|work on|try)\s+after(?:wards)?(?:\s+(?:this|that|it)(?:\s+(?:one|piece|song))?)?\s*$/,
  /\b(?:what|which)\s+(?:piece|song|one\s+)?(?:should|could)?\s*come\s+next\b|\bwhat(?:'s| is)\s+(?:the\s+)?next\s+(?:piece|song)\b/,
  /\b(?:after|once)\s+(?:this|that|i(?:'ve| have| am|'m)?\s+(?:got|finished|learned|learnt|mastered|done|nailed)(?:\s+(?:with\s+)?(?:this|that|it)(?:\s+(?:one|piece|song))?)?(?:\s+down)?)\b.*\b(?:what|which|anything|something)\b/,
  /\b(?:besides|apart from|other than|except)\s+(?:this|that|it)(?:\s+(?:one|piece|song))?(?=\s*[,?]|\s*$|\s+(?:what|which|is there|are there|do i|anything|something|can|could|should))/,
  /(?:练完|練完|弹完|彈完|学完|學完|练好|練好|弹好|彈好|练熟|練熟)(?:了)?(?:这首|這首|这个|這個|它)?(?:之后|之後|以后|以後|后|後)?.*(?:练|練|弹|彈|学|學)(?:点|點|些)?(?:什么|什麼|哪首|啥|哪个|哪個)/,
  /除了(?:这首|這首|这个|這個|它)(?:曲子|歌)?(?:之外|以外)?[，,\s]*(?:我)?(?:还|還)?(?:有|能|可以|可|该|該).*(?:什么|什麼|哪首|啥|哪些|别的|別的)/,
  /(?:下一首|接下来|接下來|然后|然後)(?:我)?(?:该|該|应该|應該|可以|能)?(?:练|練|弹|彈|学|學)(?:点|點|些)?(?:什么|什麼|哪首|啥)/,
  // Another piece in general words: “what else could I work on?”, “what else
  // do I have?”, “anything else to play?”, “something different”, “gimme
  // something from my stuff”, “got anything calmer?”.
  /\bwhat\s+else\s+(?:can|could|should|shall|would|do|might)\s+(?:i|we)\s+(?:play|practi[cs]e|work on|learn|try|do|pick|start)\b/,
  /\bwhat\s+else\s+(?:do|did)\s+(?:i|we)\s+(?:have|own|got)\b|\bwhat\s+else\s+(?:is|s)\s+there\b|\bwhat\s+else\s+(?:have i got|i ve got|is in my)\b/,
  /\b(?:anything|something)\s+else\s+(?:to|i\s+(?:can|could)|we\s+(?:can|could))\s+(?:play|practi[cs]e|work on|learn|try)\b|\b(?:anything|something)\s+else\s+(?:in|from)\s+my\b/,
  /\b(?:play|try|learn|practi[cs]e|work on|give me|show me|pick|suggest|recommend|need|want|like|do)\s+(?:something|anything|a piece|a song|one)\s+(?:else|different|new)\b(?![^?.!]*\b(?:bars?|measures?|passage|section|hands?|fingers?)\b)|^(?:something|anything)\s+(?:else|different|new)$/,
  /\b(?:from|in|out of)\s+(?:my|the)\s+(?:stuff|library|collection|pieces|songs|scores|list|repertoire)\b/,
  /\b(?:got|have|has|any)\s+(?:you\s+)?(?:got\s+)?(?:anything|something|a piece|a song)\s+(?:a\s+(?:bit|little)\s+)?(?:more\s+)?(?:easier|simpler|calmer|gentler|quieter|slower|softer|harder|tougher|faster|livelier|happier|shorter|longer|different|new|else)\b/,
  /\b(?:other|another|different)\s+(?:piece|song|tune)s?\b/,
  /(?:还有|還有|有没有|有沒有)(?:什么|什麼|哪些|哪首)?(?:别的|別的|其他|其它)(?:的)?(?:曲子|歌|钢琴曲|鋼琴曲|可以|能)?|(?:换|換|来|來)(?:点|點|首|一首)(?:别的|別的|其他|其它|新的|不一样的|不一樣的)|(?:我)?(?:还|還)有(?:什么|什麼|哪些)(?:曲子|歌)|(?:还|還)(?:能|可以)(?:练|練|弹|彈)(?:点|點|些)?(?:什么|什麼|啥)/,
];
// After this piece, or besides it: the open piece is not a suggestion then.
const OTHER_PIECE = /\b(?:else|other|another|different|next|after(?:wards)?|besides|apart from|other than|except|once i|instead|than this|than that)\b|别的|別的|其他|其它|之后|之後|以后|以後|接下来|接下來|下一首|然后|然後|除了|练完|練完|弹完|彈完|学完|學完|练好|練好|练熟|練熟|换|換/;
// “What/which …?” asks for a choice, so the reply opens with a pick, not “Sure!”.
const WH_QUESTION = /\b(?:what|which)\b|什么|什麼|哪|啥/;
const CONFUSED_LEADS = {
  beethoven: ["Hm?", "嗯？"],
  mozart: ["Oh?", "哦？"],
  liszt: ["Ah?", "嗯？"],
  langlang: ["Hey!", "嘿！"],
  cat: ["Mrr?", "喵？"],
  bunny: ["Mm?", "嗯？"],
};
const SUGGESTION_LEADS = {
  mozart: ["Gladly!", "好呀！"],
  beethoven: ["Good. Let’s choose.", "好，挑一首。"],
  liszt: ["With pleasure!", "乐意之至！"],
  langlang: ["Let’s go!", "来吧！"],
  cat: ["Mm, fine by me.", "嗯，可以呀。"],
  bunny: ["Okay, let’s pick one.", "好呀，我们挑一首。"],
};
const PICK_LEADS = {
  mozart: ["Let me think!", "让我想想！"],
  beethoven: ["Here is my advice.", "听我的。"],
  liszt: ["Allow me.", "我来推荐。"],
  langlang: ["I’ve got ideas!", "我有主意了！"],
  cat: ["Hmm, let me look.", "嗯……我看看。"],
  bunny: ["Let’s look together.", "我们一起看看吧。"],
};
// Listing the library is not a recommendation: a short, neutral opener.
const LIST_LEADS = {
  mozart: ["Let’s see!", "我看看！"],
  beethoven: ["Here.", "在这儿。"],
  liszt: ["Behold!", "请看！"],
  langlang: ["Check these out!", "看看这些！"],
  cat: ["Mm.", "嗯。"],
  bunny: ["Here they are.", "都在这儿啦。"],
};
// A frustrated or tired learner asking for something else gets a kind word
// first, not “Gladly!”.
const EMPATHY_LEADS = {
  mozart: ["That one is a beast — let's give your hands a kinder piece.", "这首确实难啃，我们换首轻松点的吧。"],
  beethoven: ["Hard music, hard day. Here is something gentler.", "这首确实难。来首温和些的。"],
  liszt: ["Even I needed gentler evenings. Here are kinder pieces.", "再厉害的人也需要轻松的时候。看看这些温和的曲子。"],
  langlang: ["Totally get it — let's switch it up.", "懂你！我们换换口味。"],
  cat: ["Mm, too much for today. Something softer, then.", "嗯，今天太累了。那来点轻松的。"],
  bunny: ["That's a lot. Let's pick something gentler.", "这首确实很累人。我们挑首轻松点的。"],
};
const BORED_LEADS = {
  mozart: ["Bored? Then it's time for new tunes!", "腻了？那就换点新鲜的！"],
  beethoven: ["Fresh music, then.", "那就换首新的。"],
  liszt: ["A new stage, a new delight!", "换个舞台，换种乐趣！"],
  langlang: ["Fresh ears time — let's mix it up!", "换换耳朵！来点新的。"],
  cat: ["Mm, something new to chase, then.", "嗯，那就找点新东西玩。"],
  bunny: ["A change can help. Let's look.", "换一换也好，我们看看。"],
};
const UPSET = /\b(?:cry|crying|tears|too hard|way too hard|so hard|frustrat\w*|hate|stuck|tired|exhausted|give up|quit|annoy\w*|stress\w*|overwhelm\w*)\b|哭|太难|太難|好难|好難|烦|煩|累|崩溃|崩潰|放弃|放棄|受不了/i;
const BORED = /\b(?:bored|boring|sick of|tired of|done with)\b|无聊|無聊|腻了|膩了|没意思|沒意思/i;
const leadFor = (request, context, zh) =>
  BORED.test(request) ? (BORED_LEADS[context.companionId] || BORED_LEADS.beethoven)[zh ? 1 : 0]
    : UPSET.test(request) ? (EMPATHY_LEADS[context.companionId] || EMPATHY_LEADS.beethoven)[zh ? 1 : 0]
    : ((WH_QUESTION.test(request) ? PICK_LEADS : SUGGESTION_LEADS)[context.companionId] ||
      (WH_QUESTION.test(request) ? PICK_LEADS : SUGGESTION_LEADS).beethoven)[zh ? 1 : 0];
/** Notes per second at the written tempo: a rough, honest “how busy is it”. */
export function pieceLevel(piece) {
  const notes = Array.isArray(piece?.notes) ? piece.notes.length : 0;
  const beats = Number.isFinite(piece?.duration) && piece.duration > 0
    ? piece.duration
    : (Number.isInteger(piece?.measures) ? piece.measures : 1) * (piece?.meter || 4);
  const bpm = Number.isFinite(piece?.bpm) && piece.bpm > 0 ? piece.bpm : 100;
  const density = notes / Math.max(1, (beats * 60) / bpm);
  return { density, level: density < 3 ? "gentle" : density < 6.5 ? "moderate" : "demanding" };
}
export function isLibraryPiece(piece) {
  return Boolean(piece && typeof piece.id === "string" && piece.source !== "Lesson" && !piece.exercise);
}
const NOT_A_PIECE_REQUEST =
  /(?:这|這)(?:一)?(?:段|小节|小節|句)|左手|右手|双手|雙手|手指|音阶|音階|琶音|和弦|节奏|節奏|指法|技巧|基本功|\b(?:scales?|arpeggios?|chords?|technique|left hand|right hand|rhythm|fingering|exercises?)\b|\b(?:this|that|these|those|the|my)\s+(?:bar|measure|passage|section|phrase|part|loop|run)s?\b|\b(?:bars?|measures?)\s+\d/;
// “What pieces do I have?”, “我有哪些曲子？”: the library itself.
const LIBRARY_LIST_REQUEST =
  /^(?:what|which)\s+(?:pieces|songs|music|scores)\s+(?:do i have|have i got|are in my library|are there|can i (?:play|choose from))\b|^what(?:'s| is)\s+(?:in\s+)?my\s+library\b|^what\s+else\s+(?:is|do i have)\s+in\s+my\s+library\b|^what\s+else\s+(?:can|could)\s+i\s+play\b|^(?:list|show me|show)\s+(?:all\s+)?(?:of\s+)?my\s+(?:pieces|songs|scores|music|library)\b|^(?:my|all my)\s+(?:pieces|songs)$|\bhow many\s+(?:pieces|songs|scores)\s+(?:do i have|have i got|are (?:there )?in my library|in my library)\b|(?:我|曲库|曲庫|库|庫)(?:里|裡)?(?:都|一共)?(?:有|存了|存着|存著)(?:哪些|什么|什麼|几首|幾首|多少)(?:曲子|歌|乐谱|樂譜|作品)|(?:曲库|曲庫)(?:里|裡)(?:都)?有(?:什么|什麼|哪些)|^列出(?:我的)?(?:曲子|曲库|曲庫|乐谱|樂譜)/;
// Composers a learner may name, with Chinese names for the same people.
// Composers a learner may name, with Chinese names for the same people, a
// rough year of their main piano writing, a family (concert music, modern
// piano/film, pop) and a character used to find the closest piece in the
// learner's library when the composer is missing from it.
const COMPOSER_NAMES = [
  ["Beethoven", /beethoven|贝多芬|貝多芬/, "贝多芬", 1805, "art", "neutral"], ["Mozart", /mozart|莫扎特/, "莫扎特", 1782, "art", "light"], ["Chopin", /chopin|肖邦|蕭邦/, "肖邦", 1835, "art", "lyrical"],
  ["Bach", /\bbach\b|巴赫/, "巴赫", 1722, "art", "neutral"], ["Satie", /satie|萨蒂|薩蒂/, "萨蒂", 1890, "art", "lyrical"], ["Liszt", /liszt|李斯特/, "李斯特", 1845, "art", "virtuosic"], ["Debussy", /debussy|德彪西/, "德彪西", 1900, "art", "lyrical"],
  ["Schubert", /schubert|舒伯特/, "舒伯特", 1822, "art", "lyrical"], ["Schumann", /schumann|舒曼/, "舒曼", 1840, "art", "lyrical"], ["Haydn", /haydn|海顿|海頓/, "海顿", 1780, "art", "light"],
  ["Tchaikovsky", /tchaikovsky|柴可夫斯基/, "柴可夫斯基", 1876, "art", "lyrical"], ["Brahms", /brahms|勃拉姆斯/, "勃拉姆斯", 1870, "art", "neutral"], ["Rachmaninoff", /rachmanino(?:ff|v)|拉赫玛尼诺夫/, "拉赫玛尼诺夫", 1905, "art", "virtuosic"],
  ["Hisaishi", /hisaishi|久石让|久石讓/, "久石让", 1995, "modern", "lyrical"], ["Einaudi", /einaudi/, "Einaudi", 2000, "modern", "lyrical"], ["Yiruma", /yiruma/, "Yiruma", 2001, "modern", "lyrical"], ["Joplin", /joplin/, "Joplin", 1902, "art", "light"],
  ["Clementi", /clementi/, "克莱门蒂", 1790, "art", "light"], ["Czerny", /czerny|车尔尼|車爾尼/, "车尔尼", 1825, "art", "light"], ["Grieg", /grieg|格里格/, "格里格", 1875, "art", "lyrical"], ["Ravel", /ravel|拉威尔/, "拉威尔", 1910, "art", "lyrical"],
  ["Pachelbel", /pachelbel|帕赫贝尔/, "帕赫贝尔", 1690, "art", "neutral"], ["Jay Chou", /周杰伦|周杰倫|jay chou/, "周杰伦", 2004, "pop", "neutral"], ["G.E.M.", /邓紫棋|鄧紫棋|\bg\.?e\.?m\b/, "邓紫棋", 2015, "pop", "neutral"],
];
const FAMILY_GAP = { "art:modern": 60, "modern:pop": 60, "art:pop": 200 };
const styleDistance = (a, b) =>
  Math.abs(a[3] - b[3]) + (a[4] === b[4] ? 0 : FAMILY_GAP[[a[4], b[4]].sort().join(":")] ?? 200);
/** Up to two library pieces by the composers nearest in era and family to a
 * composer the learner does not have (Chopin → Beethoven's Moonlight, Satie),
 * one per composer; a lyrical composer's nearest is the calmer piece. */
function closestPieces(wanted, pieces, context) {
  const byComposer = new Map();
  for (const piece of pieces) {
    const known = COMPOSER_NAMES.find(([, pattern]) => pattern.test(`${piece.title} ${piece.composer || ""}`.toLowerCase()));
    if (!known || wanted.some((w) => w[0] === known[0])) continue;
    if (!byComposer.has(known[0])) byComposer.set(known[0], { composer: known, pieces: [] });
    byComposer.get(known[0]).pieces.push(piece);
  }
  const character = wanted[0][5];
  const last = (p) => Date.parse(context.journal?.pieces?.[p.id]?.last) || 0;
  return [...byComposer.values()]
    .sort((a, b) => Math.min(...wanted.map((w) => styleDistance(w, a.composer))) - Math.min(...wanted.map((w) => styleDistance(w, b.composer))))
    .slice(0, 2)
    .map(({ composer, pieces: own }) => ({
      composer,
      piece: [...own].sort((a, b) =>
        character === "lyrical" ? pieceLevel(a).density - pieceLevel(b).density
          : character === "virtuosic" ? pieceLevel(b).density - pieceLevel(a).density
            : last(b) - last(a) || a.title.localeCompare(b.title))[0],
    }));
}
function composerAnswer(request, context, zh) {
  const named = COMPOSER_NAMES.filter(([, pattern]) => pattern.test(request));
  if (!named.length) return null;
  // A question about the person (“Mozart, what's your favourite piece?”,
  // “who was Liszt?”) is conversation, not a library search.
  const suggestion = SUGGESTION_REQUEST.some((pattern) => pattern.test(request));
  const libraryish = /\b(?:any|more|other|another)\s+(?:[\p{L}.'’-]+\s+){0,2}?(?:by\s+)?(?:beethoven|mozart|chopin|bach|satie|liszt|debussy|schubert|schumann|haydn|tchaikovsky|brahms|rachmanino(?:ff|v)|hisaishi|einaudi|yiruma|joplin|clementi|czerny|grieg|ravel|pachelbel|jay chou|g\.?e\.?m\.?)\b|\b(?:any|anything|do i have|in my library|which|what)\b.*\b(?:pieces?|songs?|music|works?|sonatas?)\b|\b(?:any|anything|something|pieces?|songs?|music)\s+(?:by|from)\b|\bin my library\b|\bdo i have any\b|有(?:没有|沒有|哪些|什么|什麼)|哪些|哪首|几首|幾首|的(?:曲子|作品|歌|钢琴曲|鋼琴曲)/.test(request);
  // “If not, what's closest?”, “没有的话推荐个风格接近的”: a request for an
  // alternative, not a question about the composer's life or style.
  const alternative = /\b(?:closest|close to|similar|like (?:him|her|them|that|chopin|this)|instead|otherwise|if not|in (?:the|a) similar style|same style|alternative)\b|接近|类似|類似|差不多|相近|相似|像他|像她|替代|代替|没有的话|沒有的話|不然/.test(request);
  const aboutPerson = !alternative && /\b(?:about|who|when|born|died|life|biography|history|style|wrote|write|favou?rite)\b|\byou(?:r)?\b|关于|關於|是谁|是誰|生平|哪一年|哪年|风格|風格|写了|寫了|你/.test(request);
  if (!suggestion && !alternative && !(libraryish && !aboutPerson)) return null;
  if (!suggestion && alternative && !libraryish && aboutPerson) return null;
  const pieces = (Array.isArray(context.pieces) ? context.pieces : []).filter(
    (p) => isLibraryPiece(p) && typeof p.title === "string" && Number.isInteger(p.measures) && p.measures > 0,
  );
  const matching = pieces.filter((p) => named.some(([, pattern]) => pattern.test(`${p.title} ${p.composer || ""}`.toLowerCase())));
  const who = named.map(([name, , chinese]) => (zh ? chinese : name)).join(zh ? "、" : " or ");
  const lead = suggestion ? leadFor(request, context, zh) : (LIST_LEADS[context.companionId] || LIST_LEADS.beethoven)[zh ? 1 : 0];
  if (!matching.length) {
    // Offer the nearest pieces the learner already has, then the import.
    const near = closestPieces(named, pieces, context);
    const by = (entry) => (zh ? entry.composer[2] : entry.composer[0]);
    const listed = near.map((entry) => (zh ? `《${entry.piece.title}》（${by(entry)}）` : `“${entry.piece.title}” (${by(entry)})`));
    return {
      intent: "search",
      message: zh
        ? `曲库里还没有${who}的曲子。${listed.length ? `风格最接近的是${listed.join("和")}，点下面的按钮就能打开；也可以导入${who}的乐谱（PDF、MusicXML或MIDI）。` : "可以导入PDF、MusicXML或MIDI文件，或者先看看曲库里的其他曲子。"}`
        : `There's no ${who} in your library yet. ${listed.length ? `Closest in style: ${listed.join(" and ")}. Tap one to open it, or import a ${who} score (PDF, MusicXML or MIDI).` : "Import a PDF, MusicXML or MIDI file, or pick something else from your library."}`,
      actions: [
        ...near.map(({ piece }) => {
          const entry = resumeMaestroPiece(piece, context.journal);
          return { type: "open-piece", pieceId: piece.id, bar: entry.bar, label: `${entry.hasPractice ? "Resume" : "Open"} ${piece.title} · bar ${entry.bar}` };
        }),
        { type: "import-score", label: "Import a score" },
        ...(near.length ? [] : [{ type: "navigate", view: "library", label: "Open library" }]),
      ],
    };
  }
  // “Which Beethoven piece should I learn next?” while one is open: the others.
  const currentId = scoreId(context.currentScore);
  const rest = OTHER_PIECE.test(request) || /\blearn\b|学|學/.test(request) ? matching.filter((p) => p.id !== currentId) : matching;
  return listPieces(rest.length ? rest : matching, context, zh, zh ? `${lead}你曲库里${who}的曲子有` : `${lead} From ${who} in your library`);
}
// Kinds of music a learner asks for by name: “any Chinese pop songs?”,
// “有没有流行歌”, “something classical”. Matched through the composer table.
const GENRES = [
  ["pop", /\b(?:pop|k-?pop|c-?pop|mandopop|chinese songs?|chinese pop)\b|流行|华语|華語|中文歌|周杰伦|周杰倫/i, ["pop"], "pop songs", "流行歌"],
  ["classical", /\bclassical\b|古典/i, ["art"], "classical pieces", "古典曲子"],
  ["film", /\b(?:film|movie|anime|ghibli|soundtrack)\b|电影|電影|动画|動畫|动漫|動漫|配乐|配樂/i, ["modern"], "film and modern piano pieces", "影视和现代钢琴曲"],
];
function genreAnswer(request, context, zh) {
  const genre = GENRES.find(([, pattern]) => pattern.test(request));
  if (!genre) return null;
  // A request or a question about the library, not “I love pop music”.
  const asks = /\b(?:any|anything|something|do i have|have i got|which|what|recommend|suggest|could i|can i|can we|shall we|let'?s)\b|有没有|有沒有|有什么|有什麼|有哪些|哪些|推荐|推薦|来一首|來一首|来点|來點|想弹|想彈|想练|想練/.test(request);
  if (!asks || /\b(?:who|why|history|what is|what's)\b|是什么|是什麼|为什么|為什麼/.test(request)) return null;
  const pieces = (Array.isArray(context.pieces) ? context.pieces : []).filter(
    (p) => isLibraryPiece(p) && typeof p.title === "string" && Number.isInteger(p.measures) && p.measures > 0,
  );
  const familyOf = (p) => COMPOSER_NAMES.find(([, pattern]) => pattern.test(`${p.title} ${p.composer || ""}`.toLowerCase()))?.[4];
  const matching = pieces.filter((p) => genre[2].includes(familyOf(p)));
  const lead = (LIST_LEADS[context.companionId] || LIST_LEADS.beethoven)[zh ? 1 : 0];
  if (matching.length) {
    // One edition per song (the one practised most recently), so three
    // arrangements of 晴天 do not fill the list.
    const base = (title) => title.split(/\s*(?:·|•|\(|（|—|–|\s-\s)\s*/u)[0].trim().toLowerCase();
    const last = (p) => Date.parse(context.journal?.pieces?.[p.id]?.last) || 0;
    const works = new Map();
    for (const p of matching) if (!works.has(base(p.title)) || last(p) > last(works.get(base(p.title)))) works.set(base(p.title), p);
    return listPieces([...works.values()], context, zh, zh ? `${lead}你曲库里的${genre[4]}有` : `${lead} The ${genre[3]} in your library`);
  }
  return {
    intent: "search",
    message: zh ? `曲库里还没有${genre[4]}。可以导入PDF、MusicXML或MIDI文件，或者先看看曲库里的其他曲子。` : `There are no ${genre[3]} in your library yet. Import a PDF, MusicXML or MIDI file, or pick something else from your library.`,
    actions: [{ type: "import-score", label: "Import a score" }, { type: "navigate", view: "library", label: "Open library" }],
  };
}
function listPieces(pool, context, zh, heading, limit = 3) {
  const practice = (p) => context.journal?.pieces && Object.hasOwn(context.journal.pieces, p.id) ? context.journal.pieces[p.id] : null;
  const last = (p) => Date.parse(practice(p)?.last) || 0;
  const currentId = scoreId(context.currentScore);
  const ranked = [...pool].sort((a, b) => (b.id === currentId) - (a.id === currentId) || last(b) - last(a) || a.title.localeCompare(b.title));
  const chosen = ranked.slice(0, limit);
  const items = chosen.map((p) => {
    const entry = resumeMaestroPiece(p, context.journal);
    return zh
      ? `《${p.title}》${entry.hasPractice ? `（上次第${entry.bar}小节）` : "（还没练过）"}`
      : `“${p.title}”${entry.hasPractice ? ` (saved at bar ${entry.bar})` : " (new)"}`;
  });
  const more = pool.length - chosen.length;
  return {
    intent: "search",
    message: zh
      ? `${heading}：${items.join("、")}${more > 0 ? `，另外还有${more}首` : ""}。点下面的按钮就能打开。`
      : `${heading}: ${items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0]}${more > 0 ? `, plus ${more} more` : ""}. Tap one below to open it.`,
    actions: chosen.map((p) => {
      const entry = resumeMaestroPiece(p, context.journal);
      return { type: "open-piece", pieceId: p.id, bar: entry.bar, label: `${entry.hasPractice ? "Resume" : "Open"} ${p.title} · bar ${entry.bar}` };
    }),
  };
}
function libraryList(request, context, zh) {
  if (!LIBRARY_LIST_REQUEST.test(request)) return null;
  const all = (Array.isArray(context.pieces) ? context.pieces : []).filter(
    (p) => isLibraryPiece(p) && typeof p.title === "string" && Number.isInteger(p.measures) && p.measures > 0,
  );
  const lead = (LIST_LEADS[context.companionId] || LIST_LEADS.beethoven)[zh ? 1 : 0];
  if (!all.length)
    return {
      intent: "search",
      message: zh ? `${lead}曲库还是空的，可以先导入PDF、MusicXML或MIDI文件。` : `${lead} Your library is empty so far. Import a PDF, MusicXML or MIDI file to start.`,
      actions: [{ type: "import-score", label: "Import a score" }],
    };
  const others = /\belse\b|别的|別的|其他/.test(request) ? all.filter((p) => p.id !== scoreId(context.currentScore)) : all;
  return listPieces(others.length ? others : all, context, zh,
    zh ? `${lead}你的曲库里有${all.length}首` : `${lead} You have ${all.length} piece${all.length === 1 ? "" : "s"} in your library`, 4);
}
// “Mozart, which piece should I learn?” talks to the companion; it does not
// ask for pieces by Mozart.
const VOCATIVE = /^(?:(?:hey|hi|ok|okay|so|dear)\s+)?(?:beethoven|mozart|liszt|lang lang|langlang|luma|mochi|贝多芬|貝多芬|莫扎特|李斯特|郎朗|露玛|露瑪|麻薯)\s*[,，!！:：]\s*/i;
// “Which of my pieces is the shortest?”, “我曲库里最难的是哪首？”: the library
// sorted by the asked measure. Sorting a list is not left to a model.
const SUPERLATIVES = [
  ["shortest", /\b(?:shortest|fewest bars|quickest (?:one|piece|song) to (?:learn|play))\b|最短|最少小节|最少小節/, (p) => p.measures, 1],
  ["longest", /\b(?:longest|most bars)\b|最长|最長|最多小节|最多小節/, (p) => p.measures, -1],
  ["easiest", /\b(?:easiest|simplest|gentlest|least difficult)\b|最简单|最簡單|最容易|最轻松|最輕鬆|最不难|最不難/, (p) => pieceLevel(p).density, 1],
  ["hardest", /\b(?:hardest|most difficult|toughest|most demanding|most challenging)\b|最难|最難|最有挑战|最有挑戰/, (p) => pieceLevel(p).density, -1],
  ["calmest", /\b(?:calmest|most relaxing|quietest|most peaceful)\b|最安静|最安靜|最舒缓|最舒緩|最放松|最放鬆/, (p) => pieceLevel(p).density, 1],
];
function superlativeAnswer(request, context, zh) {
  const found = SUPERLATIVES.find(([, pattern]) => pattern.test(request));
  if (!found) return null;
  // About pieces, not “the hardest bar” or “最难的小节”.
  if (!/\b(?:pieces?|songs?|scores?|ones?|library|my|which|what)\b|曲|首|歌|谱|譜|哪/.test(request) ||
      /\b(?:bars?|measures?|passages?|sections?|parts?|notes?|chords?|hands?|fingers?|this|that|about|ways?|how|tips?|methods?|thing|things)\b|小节|小節|段|部分|左手|右手|和弦|音符|这首|這首|这个|這個|方法|怎么|怎麼|如何/.test(request)) return null;
  const [name, , measure, direction] = found;
  const pool = (Array.isArray(context.pieces) ? context.pieces : []).filter(
    (p) => isLibraryPiece(p) && typeof p.title === "string" && Number.isInteger(p.measures) && p.measures > 0,
  );
  if (!pool.length) return null;
  const ranked = [...pool].sort((a, b) => direction * (measure(a) - measure(b)) || a.title.localeCompare(b.title)).slice(0, 3);
  const bars = name === "shortest" || name === "longest";
  const detail = (p) => bars
    ? (zh ? `${p.measures}小节` : `${p.measures} bars`)
    : (zh ? `${{ gentle: "轻松", moderate: "中等", demanding: "有挑战" }[pieceLevel(p).level]}，${p.measures}小节` : `${pieceLevel(p).level}, ${p.measures} bars`);
  const word = zh ? { shortest: "最短", longest: "最长", easiest: "最轻松", hardest: "最有挑战", calmest: "最安静" }[name] : name;
  const [first, ...rest] = ranked;
  return {
    intent: "search",
    message: zh
      ? `你曲库里${word}的是《${first.title}》（${detail(first)}）${rest.length ? `，其次是${rest.map((p) => `《${p.title}》（${detail(p)}）`).join("和")}` : ""}。点下面的按钮就能打开。`
      : `Your ${word} piece is “${first.title}” (${detail(first)})${rest.length ? `; next come ${rest.map((p) => `“${p.title}” (${detail(p)})`).join(" and ")}` : ""}. Tap one below to open it.`,
    actions: ranked.map((p) => {
      const entry = resumeMaestroPiece(p, context.journal);
      return { type: "open-piece", pieceId: p.id, bar: entry.bar, label: `${entry.hasPractice ? "Resume" : "Open"} ${p.title} · bar ${entry.bar}` };
    }),
  };
}
function suggestPieces(input, context, zh) {
  const request = input.replace(VOCATIVE, "");
  const listing = libraryList(request, context, zh) || superlativeAnswer(request, context, zh) || composerAnswer(request, context, zh) || genreAnswer(request, context, zh);
  if (listing) return listing;
  if (NOT_A_PIECE_REQUEST.test(request) || !SUGGESTION_REQUEST.some((pattern) => pattern.test(request)))
    return null;
  const all = (Array.isArray(context.pieces) ? context.pieces : []).filter(
    (p) => p && typeof p.id === "string" && typeof p.title === "string" && Number.isInteger(p.measures) && p.measures > 0,
  );
  const own = all.filter(isLibraryPiece);
  const pool = own.length ? own : all;
  const lead = leadFor(request, context, zh);
  if (!pool.length)
    return {
      intent: "search",
      message: zh ? `${lead}曲库还是空的，可以先导入PDF、MusicXML或MIDI文件。` : `${lead} Your library is empty so far. Import a PDF, MusicXML or MIDI file to start.`,
      actions: [{ type: "import-score", label: "Import a score" }],
    };
  const easy = /\b(?:easy|easier|simple|simpler|beginner)\b|简单|簡單|容易|轻松|輕鬆|入门|入門|不难|不難/.test(request);
  const hard = !easy && /\b(?:harder|challenging|difficult|tougher|advanced|a challenge)\b|难一点|難一點|难一些|難一些|更难|更難|有挑战|有挑戰|有难度|有難度/.test(request);
  const calm = !easy && !hard && /\b(?:calm|calmer|relaxing|gentle|quiet|peaceful|soothing|slow|slower|dreamy)\b|安静|安靜|舒缓|舒緩|放松|放鬆|抒情|柔和|慢一点的|慢一點的/.test(request);
  const fresh = /\b(?:new|different|learn)\b|新的|换一首|換一首|学|學/.test(request);
  // “What next / after this / besides this?”: never the open piece itself.
  const other = fresh || OTHER_PIECE.test(request);
  const practice = (p) => context.journal?.pieces && Object.hasOwn(context.journal.pieces, p.id) ? context.journal.pieces[p.id] : null;
  const saved = (p) => resumeMaestroPiece(p, context.journal);
  const last = (p) => Date.parse(practice(p)?.last) || 0;
  const currentId = scoreId(context.currentScore);
  // The same work in another arrangement is not “something else” either.
  const base = (title) => title.split(/\s*(?:·|•|\(|（|—|–|\s-\s)\s*/u)[0].trim().toLowerCase();
  const current = context.currentScore && typeof context.currentScore.title === "string" ? base(context.currentScore.title) : null;
  let ranked = other ? pool.filter((p) => p.id !== currentId && base(p.title) !== current) : [...pool];
  if (!ranked.length) ranked = pool.filter((p) => p.id !== currentId);
  // Something to learn next: not a piece already played to its end, new
  // pieces first, and nearest in difficulty to the open one.
  const finished = (p) => saved(p).hasPractice && saved(p).bar >= p.measures - 1;
  const target = context.currentScore ? pieceLevel(context.currentScore).density : 0;
  const gap = (p) => (target > 0 ? Math.abs(Math.log(Math.max(0.1, pieceLevel(p).density) / target)) : 0);
  // “Something easier” than the open piece: gentler than it, never itself.
  if ((easy || calm) && context.currentScore && target > 0) {
    const gentler = ranked.filter((p) => p.id !== currentId && base(p.title) !== current && pieceLevel(p).density < target);
    if (gentler.length) ranked = gentler;
  }
  if (easy || calm) ranked.sort((a, b) => Number(finished(a)) - Number(finished(b)) || pieceLevel(a).density - pieceLevel(b).density || a.title.localeCompare(b.title));
  else if (hard) ranked.sort((a, b) => Number(finished(a)) - Number(finished(b)) || pieceLevel(b).density - pieceLevel(a).density || a.title.localeCompare(b.title));
  else if (fresh)
    ranked.sort((a, b) => Number(finished(a)) - Number(finished(b)) || Number(saved(a).hasPractice) - Number(saved(b).hasPractice) || gap(a) - gap(b) || last(a) - last(b) || a.title.localeCompare(b.title));
  else ranked.sort((a, b) => (b.id === currentId) - (a.id === currentId) || last(b) - last(a) || a.title.localeCompare(b.title));
  // One edition per work: three Sunny Day arrangements are one suggestion.
  const chosen = [], works = new Set();
  for (const piece of ranked) {
    if (works.has(base(piece.title))) continue;
    works.add(base(piece.title));
    chosen.push(piece);
    if (chosen.length === 3) break;
  }
  const items = chosen.map((p) => {
    const entry = saved(p);
    return zh
      ? `《${p.title}》${entry.hasPractice ? `（上次第${entry.bar}小节）` : "（还没练过）"}`
      : `“${p.title}”${entry.hasPractice ? ` (saved at bar ${entry.bar})` : " (new)"}`;
  });
  const list = zh ? items.join("、") : items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items.at(-1)}` : items[0];
  return {
    intent: "search",
    message: zh
      ? `${lead}${easy ? "你曲库里比较轻松的有" : hard ? "你曲库里最有挑战的有" : calm ? "你曲库里比较安静舒缓的有" : other && current ? "除了这首，你曲库里还可以练" : "从你的曲库里挑一首吧"}：${list}。点下面的按钮就能打开。`
      : `${lead} ${easy ? "The gentlest pieces in your library" : hard ? "The most demanding pieces in your library" : calm ? "The calmest pieces in your library" : other && current ? "Besides this one, from your library" : "From your library"}: ${list}. Tap one below to open it.`,
    actions: chosen.map((p) => {
      const entry = saved(p);
      return {
        type: "open-piece",
        pieceId: p.id,
        bar: entry.bar,
        label: `${entry.hasPractice ? "Resume" : "Open"} ${p.title} · bar ${entry.bar}`,
      };
    }),
  };
}

// ---- Conversational carry-over: an elliptical follow-up keeps the last
// piece question and changes only the piece.
/** The piece an elliptical follow-up names (“and moonlight?”, “what about
 * the chord version”, “那月光呢”, “还有晴天呢”), or null. */
export function followUpTarget(input) {
  const text = normalizeRequestText(plain(input, 300)).toLowerCase().trim()
    .replace(/[?？!！。.~～…\s\p{Extended_Pictographic}\u{FE0F}]+$/gu, "");
  const en = text.match(/^(?:(?:ok(?:ay)?|yeah|yes|hmm+|cool|nice|great|thanks|got it|right|alright)[\s,，.!]+)?(?:and|what about|how about|and what about|and how about|also|plus|same for|same with|and for|and in|now|ok and|then)\s+(?:in\s+|for\s+|with\s+)?(.{2,80})$/u);
  if (en) return en[1].trim();
  const zh = text.match(/^(?:好的?|嗯+|哦|噢|那|那么|那麼|还有|還有|另外|再)*[\s,，]*(.{1,30}?)(?:呢|嘞|咧)$/u)
    || text.match(/^(?:那|还有|還有|另外)[\s,，]*(.{2,30})$/u);
  return zh ? zh[1].trim() : null;
}
function carryOver(input, context, previous) {
  const target = followUpTarget(input);
  if (!target) return null;
  const last = previous.findLast((m) => m.role === "assistant" && m.kind !== "receipt");
  if (!last || !["resume", "search"].includes(last.intent)) return null;
  const ref = resolveMaestroPiece(target, context);
  // “那这首呢？”: the open piece itself; stray words (“左手呢”) are not a piece.
  if (ref.kind === "current" && (last.intent === "search" || !(fillerOnlyReference(target) || ref.matches))) return null;
  if (ref.kind === "missing") return null;
  return last.intent === "resume" ? resumeMaestroQuery(target, context) : findMaestroQuery(target, context);
}

/** Plan one offline turn. Returned actions are proposals, never execution receipts. */
export function planCompanionTurn(input, context = {}, history = []) {
  const request = normalized(input),
    previous = readCompanionHistory(history);
  const language = conversationLanguage(previous, input);
  const languagePreference = conversationLanguagePreference(previous, input);
  const zh = ["zh", "zh-Hant"].includes(language);
  const currentId = scoreId(context.currentScore),
    revision = scoreContextId(context.currentScore);
  const knownPieces = Array.isArray(context.pieces) ? context.pieces : [];
  const id = `turn-${hash(JSON.stringify([plain(input), currentId, revision, previous.at(-1)?.id || "", context.speed, context.hand, context.mode, context.currentBar]))}`;
  function finish(plan) {
    const actions = (plan.actions || [])
      .slice(0, COMPANION_HISTORY_LIMITS.actions)
      .map((a, index) => {
        const target =
          a.type === "open-piece"
            ? knownPieces.find((p) => p.id === a.pieceId)
            : context.currentScore;
        return actionValue({
          ...a,
          id: `${id}:a${index + 1}`,
          label: plain(companionActionLabel(a, language), 240),
          scoreId: currentId,
          scoreRevision:
            scoped.has(a.type) || a.type === "open-piece"
              ? scoreContextId(target)
              : null,
        });
      });
    let message = plain(plan.message) || (zh ? "可以说出曲名，或告诉我想练哪一段。" : "Try a piece title or a practice command.");
    const translated = zh ? chineseTemplate(message) : null;
    if (translated) message = translated;
    else if (zh && /^[A-Za-z“"]/.test(message)) {
      const a = actions.length === 1 ? actions[0] : null;
      if (a?.type === "set-speed") message = `可以把速度设为${Math.round(a.speed * 100)}%。`;
      else if (a?.type === "set-hand") message = `接下来可以${{ left: "只练左手", right: "只练右手", both: "双手一起练" }[a.hand]}。`;
      else if (a?.type === "set-mode") message = `可以切换到${{ listen: "示范播放", wait: "等我弹对", perform: "演奏" }[a.mode]}模式。`;
      else if (a?.type === "seek-bar") message = `可以跳到第${a.bar}小节。`;
      else if (a?.type === "repeat-bars") message = `可以循环第${a.from === a.to ? a.from : `${a.from}–${a.to}`}小节。`;
      else if (a?.type === "show-help" && a.topic === "numbers") message = "谱面数字1–7表示音高，指法数字1–5表示手指；两只手都是1拇指、2食指、3中指、4无名指、5小指。";
      else if (actions.length && actions.every((item) => item.type === "open-piece")) message = actions.length > 1 ? `找到${actions.length}个版本，请选一个。` : `可以打开这份乐谱，从第${a.bar}小节开始。`;
      else if (a?.type === "navigate") message = a.view === "library" ? "可以先到曲库选择一份乐谱。" : "可以打开对应页面。";
      else if (a?.type === "open-settings") message = "可以打开设置。";
      else if (a?.type === "import-score") message = plan.intent === "search" ? "曲库里没有匹配的乐谱，可以导入PDF、MusicXML或MIDI文件。" : "可以选择PDF、MusicXML或MIDI文件。";
      else if (/^Use whole bar numbers from 1 to (\d+)/.test(message)) message = `请输入1到${message.match(/^Use whole bar numbers from 1 to (\d+)/)[1]}之间的整数小节号，起点不能在终点之后。`;
      else if (/^Choose a speed from/.test(message)) message = "速度可选25%到125%，每次增减5%，例如“speed 75%”。";
      else if (/^Speed is already/.test(message)) message = `速度已经是${message.match(/\d+%/)?.[0] || "当前限制"}，不能再往这个方向调整。`;
    }
    if ((plan.actions || []).length > actions.length)
      message += zh
        ? `只显示前${actions.length}个结果，可以输入更具体的曲名或作曲家。`
        : ` Showing the first ${actions.length} choices. Use a more specific title or composer to narrow the list.`;
    const result = {
      id,
      message,
      actions,
      intent: plan.intent || "command",
      source: "local",
      scoreId: currentId,
      scoreRevision: revision,
      ...(languagePreference ? { languagePreference } : {}),
    };
    if (plan.lesson) result.lesson = lessonValue(plan.lesson, result);
    if (companionIds.has(context.companionId))
      result.companionId = context.companionId;
    return result;
  }
  const clarify = (message) => {
    const translations = {
      "Which piece do you mean? Search for its title first.": "你指哪首曲子？先搜索一下曲名。",
      "Several versions were listed. Choose a version button, or say “the first one” or “the second one”.": "刚才列出了几个版本，可以点版本按钮，或说“第一个”“第二个”。",
      "That saved version is no longer in Library. Search again to see the available versions.": "这份乐谱已不在曲库里，请重新搜索。",
      "That saved version has changed since it was listed. Search again before choosing a bar.": "这份乐谱已经修改过，请重新搜索后再选择小节。",
      "The saved bar is outside this version of the score. Search for the piece again.": "保存的小节位置超出了当前版本，请重新搜索曲子。",
      "Which bars should repeat? For example, “repeat bars 4–8”.": "你想循环哪几小节？例如“循环第4到8小节”。",
      "The piece has changed since that passage was discussed. Give the bar numbers for the current score.": "刚才讨论后乐谱有了变化，请告诉我当前乐谱的小节号。",
      "Choose the action button above, or name the piece, bar, speed or hand you want.": "可以点上面的操作按钮，或告诉我曲名、小节、速度和要练的手。",
    };
    const count = message.match(/^There are (\d+) choices in the last result\./);
    return finish({ message: zh ? translations[message] || (count ? `刚才有${count[1]}个版本，请选择1到${count[1]}。` : message) : message, actions: [], intent: "clarify" });
  };
  const requestedLanguage = languageRequest(input);
  if (requestedLanguage) return clarify(languageAcknowledgement(requestedLanguage));
  const compound = compoundControls(request, context, zh);
  if (compound) return finish(compound);
  // Explanations of these two numbering systems are fixed application facts.
  // Keep them exact even when an on-device language model is available.
  const pitchNumbers =
    /(?:pitch|note|score)\s*(?:numbers?|digits?)|音符数字|音符數字|音高数字|音高數字|简谱数字|簡譜數字/.test(
      request,
    );
  const fingerNumbers =
    /finger(?:ing)?(?:\s*(?:numbers?|digits?))?|手指数字|手指數字|指法数字|指法數字/.test(
      request,
    );
  const numberExplanation =
    /explain|difference|versus|\bvs\b|mean|区别|區別|说明|說明|解释|解釋/.test(
      request,
    );
  if (pitchNumbers && fingerNumbers && numberExplanation) {
    const explanation = planMaestroCommand("explain the numbers", context);
    explanation.message = zh
      ? "音符数字1–7表示相对于所选“1”的音高，C4等音名还标明具体八度；它们不是指法。两只手都一样：手指1是拇指，2是食指，3是中指，4是无名指，5是小指，不能用音符数字推断手指。"
      : "Pitch numbers 1–7 name pitches relative to your selected Number 1; labels such as C4 also identify the octave. On each hand, finger 1 is the thumb, 2 the index, 3 the middle, 4 the ring and 5 the little finger; pitch numbers do not determine fingering.";
    return finish(explanation);
  }
  // “and moonlight?”, “what about the concert version?”, “那月光呢？” after a
  // resume or search answer asks the same thing about another piece.
  const carried = carryOver(input, context, previous);
  if (carried) return finish(carried);
  const lesson = planCompanionLesson(
    input,
    { ...context, scoreRevision: revision, language },
    previous,
  );
  if (lesson) return finish(lesson);
  const choices = latestChoices(previous),
    selected = selection(request);
  const pronoun =
    /^(?:(?:open|resume|continue)(?:\s+practicing)?\s+)?(?:it|that one|that piece|that version|the same piece|这个|這個|那首|那首曲子|这首|這首)$/.test(
      request,
    ) ||
    /^(?:打开|打開|继续|繼續)(?:这个|這個|那首|那首曲子|这首|這首)$/.test(
      request,
    );
  if (selected || pronoun) {
    if (!choices.length)
      return clarify("Which piece do you mean? Search for its title first.");
    if (pronoun && choices.length > 1)
      return clarify(
        "Several versions were listed. Choose a version button, or say “the first one” or “the second one”.",
      );
    const index = selected
      ? selected.index === -1
        ? choices.length
        : selected.index
      : 1;
    if (!Number.isInteger(index) || index < 1 || index > choices.length)
      return clarify(
        `There are ${choices.length} choices in the last result. Choose a number from 1 to ${choices.length}.`,
      );
    const choice = choices[index - 1],
      piece = knownPieces.find((p) => p.id === choice.pieceId);
    if (!piece)
      return clarify(
        "That saved version is no longer in Library. Search again to see the available versions.",
      );
    if (choice.scoreRevision && choice.scoreRevision !== scoreContextId(piece))
      return clarify(
        "That saved version has changed since it was listed. Search again before choosing a bar.",
      );
    const resume =
      selected?.resume || /^(?:resume|continue|继续|繼續)/.test(request);
    const saved = resumeMaestroPiece(piece, context.journal);
    const bar = resume ? saved.bar : choice.bar;
    if (!Number.isInteger(bar) || bar < 1 || bar > piece.measures)
      return clarify(
        "The saved bar is outside this version of the score. Search for the piece again.",
      );
    const verb = resume && saved.hasPractice ? "Resume" : "Open";
    return finish({
      message:
        resume && !saved.hasPractice
          ? `No saved practice position for “${piece.title}”. You can start at bar 1.`
          : `${verb} “${piece.title}” at bar ${bar}.`,
      actions: [
        {
          type: "open-piece",
          pieceId: piece.id,
          bar,
          label: `${verb} ${piece.title} · bar ${bar}`,
        },
      ],
      intent: resume ? "resume" : "search",
    });
  }
  if (
    /^(?:repeat|loop)\s+(?:that|that bar|that passage|that section|those bars)$/.test(
      request,
    ) ||
    /^(?:重复|重複|循环|循環)(?:那段|那个小节|那個小節)$/.test(request)
  ) {
    const prior = [...previous]
      .reverse()
      .find(
        (m) =>
          m.role === "assistant" &&
          m.actions?.some((a) => ["seek-bar", "repeat-bars"].includes(a.type)),
      );
    const action = prior?.actions.find((a) =>
      ["seek-bar", "repeat-bars"].includes(a.type),
    );
    if (!action)
      return clarify(
        "Which bars should repeat? For example, “repeat bars 4–8”.",
      );
    if (
      action.scoreId !== currentId ||
      !action.scoreRevision ||
      action.scoreRevision !== revision
    )
      return clarify(
        "The piece has changed since that passage was discussed. Give the bar numbers for the current score.",
      );
    const from = action.type === "seek-bar" ? action.bar : action.from;
    const to = action.type === "seek-bar" ? action.bar : action.to;
    return finish(planMaestroCommand(`repeat bars ${from}–${to}`, context));
  }
  const latestReply = previous.findLast((m) => m.role === "assistant" && m.kind !== "receipt");
  if (
    /^(?:again|do that|do it|same again|yes|yes please|好的|好|再来|再來)$/.test(
      request,
    ) && latestReply?.actions?.length
  )
    return clarify(
      "Choose the action button above, or name the piece, bar, speed or hand you want.",
    );
  // A bare “?” or “…” asks what to do next: concrete options and buttons
  // beat a model guess.
  if (/^(?:[?？]+|[.。…·]{2,}[?？!！]*|…+|(?:huh|hm+|eh)[?？!！.…]*)$/i.test(String(input ?? "").trim())) {
    const lead = (CONFUSED_LEADS[context.companionId] || CONFUSED_LEADS.beethoven)[zh ? 1 : 0];
    const score = context.currentScore;
    const saved = score ? resumeMaestroPiece(score, context.journal) : null;
    const actions = [];
    if (saved?.hasPractice && saved.bar !== context.currentBar && knownPieces.some((p) => p.id === score.id))
      actions.push({ type: "open-piece", pieceId: score.id, bar: saved.bar, label: `Resume ${score.title} · bar ${saved.bar}` });
    actions.push({ type: "show-help", topic: "commands", label: "Command guide" });
    return finish({
      intent: "help",
      actions,
      message: zh
        ? `${lead}不知道从哪儿开始？可以说“教我这一小节”“我上次练到哪了”或“慢一点”，也可以直接告诉我哪里难。`
        : `${lead} Not sure where to start? Try “teach me this bar”, “where did I stop?” or “slower”, or just tell me what feels hard.`,
    });
  }
  if (
    /^(?:hi|hello|hey|bro|yo|你好|您好|嗨|谢谢|謝謝|thanks|thank you)$/.test(
      request,
    )
  ) {
    const thanks = /thanks|thank you|谢谢|謝謝/.test(request);
    return finish({
      message: thanks
        ? zh
          ? "不客气。想继续的话，说“教我这一小节”。"
          : "You’re welcome. Say “teach me this bar” when you want to continue."
        : zh
          ? "我在。想一起读一个小节，还是找回上次练到的地方？"
          : "I’m here. Want to read a bar together, or find your saved place?",
      actions: [],
      intent: "help",
    });
  }
  const suggestion = suggestPieces(request, context, zh);
  if (suggestion) return finish(suggestion);
  if (
    /^(?:find (?:a |the )?(?:piece|song)|search(?: for)? (?:a )?(?:piece|song)|找(?:一首)?(?:曲子|歌曲)|找曲)$/.test(
      request,
    )
  )
    return finish({
      message:
        "Which piece? Enter a title or composer, for example “find 晴天” or “find Beethoven”.",
      actions: [{ type: "navigate", view: "library", label: "Open library" }],
      intent: "clarify",
    });
  if (
    /^(?:help me (?:practise|practice)(?: (?:these bars|this (?:bar|passage|section)))?|how (?:do|should) i (?:practise|practice) (?:this|these bars)|explain (?:this bar|these bars|this passage)|帮我练(?:习)?(?:这几小节|这几小節|这段|这一小节)?|幫我練(?:習)?(?:這幾小節|這段|這一小節)?|解释(?:这一小节|这几小节|这段)|解釋(?:這一小節|這幾小節|這段))$/.test(
      request,
    )
  ) {
    if (!context.currentScore)
      return finish({
        message: "Open a score to see guidance for its current bar.",
        actions: [{ type: "navigate", view: "library", label: "Open library" }],
        intent: "guidance",
      });
    const guide =
      context.guide instanceof Map
        ? context.guide.get(context.currentBar)
        : context.guide;
    const title = plain(guide?.title, 160),
      detail = plain(guide?.text, 2000);
    if (!title && !detail)
      return finish({
        message:
          "There is no written-score tip for this bar. Select a passage to practise, or ask to repeat its bar numbers.",
        actions: [],
        intent: "guidance",
      });
    const bar =
      Number.isInteger(context.currentBar) &&
      context.currentBar >= 1 &&
      context.currentBar <= context.currentScore.measures
        ? `Bar ${context.currentBar}`
        : "Current passage";
    const hand = { left: "left hand", right: "right hand", both: "both hands" }[
      context.hand
    ];
    return finish({
      message: `${bar}${hand ? ` · ${hand}` : ""}. ${[title, detail].filter(Boolean).join(". ")}`,
      actions: [],
      intent: "guidance",
    });
  }
  const alias = /^(?:make it slower|slower again)$/.test(request)
    ? "slower"
    : /^(?:make it faster|faster again)$/.test(request)
      ? "faster"
      : input;
  const plan = planMaestroCommand(plain(alias, 500), context);
  // The command parser accepts a bare percentage. A question ending in “50%”
  // is still a question, not an invalid attempt to change playback speed.
  if (plan.intent === "command" && !plan.actions?.length &&
      /^(?:why\b|how\b|what\b|is\b|are\b|does\b|do\b|should\b|为什么|為什麼|为何|為何|是不是|是否)/.test(request))
    return finish({ intent: "help", actions: [], message: zh
      ? "可以聊聊这个问题；当前练习设置没有改变。"
      : "We can talk about that; the current practice settings are unchanged." });
  // Unknown conversational questions must not masquerade as a missing title.
  const explicitSearch =
    /^(?:(?:find|search(?:\s+for)?|look for|open|play|show me)\s+|查找|搜索|搜尋|寻找|尋找|打开|打開|播放|找)/.test(
      request,
    );
  if (plan.intent === "search" && !plan.matches?.length && !explicitSearch)
    return finish({
      message:
        "Local tools do not support open-ended chat. I can find saved scores and set up practice. Try “find 晴天”, “where did I stop?”, “repeat bars 4–8” or “slower”.",
      actions: [],
      intent: "help",
    });
  return finish(plan);
}
