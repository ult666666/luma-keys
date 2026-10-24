import {
  barStart,
  barEnd,
  degree,
  noteName,
  solfege,
  usesFlats,
} from "./music.mjs";

import { conversationLanguage, languageRequest, openedAtStart } from "./companion-language.mjs";
import { normalizeRequestText, stripRequestFrame } from "./maestro.mjs";

// A score-reading lesson planner, not a performance assessment. The caller
// fingerprints the current score and validates/persists the returned lesson.
// Actions are proposals only; this module never starts transport or edits music.
const EPS = 1e-5;
const hands = ["left", "right", "both"];
const clean = (value, max = 2000) =>
  typeof value === "string"
    ? value
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi, "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
const normal = (value) =>
  stripRequestFrame(normalizeRequestText(clean(value)), { light: true })
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?。？！]+$/g, "")
    .trim()
    // “ok, teach me that bar”, “好，教我这一段”: an interjection before a
    // request is not part of it (a lone “ok” stays as it is).
    .replace(/^(?:(?:ok(?:ay)?|alright|all right|so|well|now|and|then|yes|yeah|sure|great|cool)[\s,，.!！]+(?=\S)|(?:please|can you|could you|would you|will you)\s+|请你?|請你?|(?:好的?|好吧|那就|那么|那麼|嗯)[\s,，]*(?=\S))+/, "")
    // “next bar please”, “下一小节吧”: a closing courtesy is not part of it.
    .replace(/(?:[,，]?\s+(?:please|now|then)|[吧呢呀啊])$/, "");
const result = (message, actions = [], lesson) => ({
  message,
  intent: "lesson",
  actions,
  ...(lesson ? { lesson } : {}),
});
const handName = (hand, zh) =>
  ({
    left: zh ? "左手" : "left hand",
    right: zh ? "右手" : "right hand",
    both: zh ? "双手" : "both hands",
  })[hand];
const and = (items, zh) =>
  items.length < 2
    ? items[0] || ""
    : zh
      ? items.join("、")
      : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function whole(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = {
    零: 0,
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
  };
  if (Object.hasOwn(digits, value)) return digits[value];
  const tens = value.match(
    /^([一二三四五六七八九])?十([一二三四五六七八九])?$/,
  );
  return tens ? (digits[tens[1]] || 1) * 10 + (digits[tens[2]] || 0) : NaN;
}
function requestedBars(request) {
  const token = "(-?[0-9零一二三四五六七八九十两兩]+(?:\\.[0-9]+)?)";
  const match =
    request.match(
      new RegExp(
        `\\b(?:bars?|measures?)\\s+${token}(?:\\s*(?:[–—~～-]|to|through|and)\\s*${token})?`,
        "i",
      ),
    ) ||
    request.match(
      new RegExp(
        `(?<![这這那哪下上每同])第?\\s*${token}(?:\\s*(?:[–—~～-]|至|到)\\s*${token})?\\s*(?:小节|小節)`,
      ),
    );
  return match
    ? { from: whole(match[1]), to: whole(match[2] || match[1]) }
    : null;
}
function requestedHand(request) {
  if (/both hands|hands together|双手|雙手|两手|兩手|左右手/.test(request))
    return "both";
  if (/left hand|\blh\b|左手/.test(request)) return "left";
  if (/right hand|\brh\b|右手/.test(request)) return "right";
  return null;
}
function previousLesson(history) {
  const turns = (Array.isArray(history) ? history : []).slice(-60);
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn?.role !== "assistant" || turn.kind === "receipt") continue;
    // Switching the reply language does not abandon the current lesson.
    if (turn.intent === "clarify" && !turn.actions?.length &&
        turns[i - 1]?.role === "user" && languageRequest(turns[i - 1].message)) continue;
    if (turn.intent === "lesson" && turn.lesson) return turn.lesson;
    // A new search, conversational topic or ambiguous reference ends the chain.
    if (!["command"].includes(turn.intent)) return null;
  }
  return null;
}
function validLesson(value, score, revision) {
  return (
    value?.version === 1 &&
    value.scoreId === score.id &&
    typeof revision === "string" &&
    revision.length > 0 &&
    value.scoreRevision === revision &&
    Number.isInteger(value.from) &&
    value.from >= 1 &&
    Number.isInteger(value.to) &&
    value.to >= value.from &&
    value.to <= score.measures &&
    value.to - value.from < 2 &&
    hands.includes(value.hand) &&
    [0, 1, 2].includes(value.step) &&
    typeof value.simple === "boolean"
  );
}
function number(value) {
  const nearest = Math.round(value);
  if (Math.abs(value - nearest) < 0.001) return String(nearest);
  // Triplets inside a half-note count and eighth subdivisions read as
  // fractions too (“1⅙”, not “1.167”).
  for (const [den, glyphs] of [
    [2, { 1: "½" }],
    [3, { 1: "⅓", 2: "⅔" }],
    [4, { 1: "¼", 3: "¾" }],
    [6, { 1: "⅙", 5: "⅚" }],
    [8, { 1: "⅛", 3: "⅜", 5: "⅝", 7: "⅞" }],
  ]) {
    const scaled = Math.round(value * den);
    if (Math.abs(value * den - scaled) < 0.002 && glyphs[scaled % den])
      return `${Math.floor(value) || ""}${glyphs[scaled % den]}`;
  }
  return String(Math.round(value * 1000) / 1000);
}
function meterAt(score, bar) {
  const signature = score.measureSignatures?.[bar - 1] || score.timeSignature;
  const parsed =
    typeof signature === "string" && signature.match(/^(\d+)\/(2|4|8|16|32)$/);
  const denominator = parsed ? Number(parsed[2]) : 4;
  const unit = 4 / denominator;
  const start = barStart(score, bar),
    end = barEnd(score, bar);
  const counts = (end - start) / unit;
  const nominal = parsed
    ? Number(parsed[1])
    : Math.max(counts, (score.meter || 4) / unit);
  const pickup = bar === 1 && score.pickup > 0 && counts < nominal - EPS;
  return {
    start,
    end,
    unit,
    counts,
    denominator,
    nominal,
    pickup,
    offset: pickup ? nominal - counts : 0,
  };
}
function meterText(meter, zh) {
  const unit = {
    2: zh ? "二分音符" : "half note",
    4: zh ? "四分音符" : "quarter note",
    8: zh ? "八分音符" : "eighth note",
    16: zh ? "十六分音符" : "sixteenth note",
    32: zh ? "三十二分音符" : "thirty-second note",
  }[meter.denominator];
  if (zh)
    return `${meter.pickup ? "这是弱起小节，只有" : "这一小节有"}${number(meter.counts)}拍；这里每一拍按一个${unit}来数${meter.pickup ? `，从第${number(meter.offset + 1)}拍进入` : ""}。`;
  return `${meter.pickup ? "This pickup has only" : "This bar has"} ${number(meter.counts)} ${Math.abs(meter.counts - 1) < EPS ? "count" : "counts"}; count each ${unit}${meter.pickup ? `, entering on count ${number(meter.offset + 1)}` : ""}.`;
}
function noteLabel(midi, context, zh) {
  const score = context.currentScore,
    flats = usesFlats(score);
  const tonic =
    Number.isInteger(context.tonic) && context.tonic >= 0 && context.tonic < 12
      ? context.tonic
      : Number.isInteger(score.tonic)
        ? score.tonic
        : 0;
  const name = noteName(midi, flats);
  if (context.labels === "letters") return name;
  if (context.labels === "solfege")
    return zh
      ? `${name}（${solfege(midi, tonic, flats)}）`
      : `${name} (${solfege(midi, tonic, flats)})`;
  return zh
    ? `${name}（${degree(midi, tonic, flats)}）`
    : `${name} (${degree(midi, tonic, flats)})`;
}
function notesFor(score, start, end) {
  const unique = new Map();
  for (const n of Array.isArray(score.notes) ? score.notes : []) {
    if (
      !Number.isInteger(n.midi) ||
      n.midi < 0 ||
      n.midi > 127 ||
      !["left", "right"].includes(n.hand) ||
      !Number.isFinite(n.beat) ||
      n.beat < 0 ||
      !Number.isFinite(n.duration) ||
      n.duration <= 0 ||
      n.beat >= end - EPS ||
      n.beat + n.duration <= start + EPS
    )
      continue;
    const key = `${n.hand}:${Math.round(n.beat * 1e6)}:${n.midi}`;
    const old = unique.get(key);
    if (!old || old.duration < n.duration) unique.set(key, n);
  }
  return [...unique.values()].sort(
    (a, b) => a.beat - b.beat || a.midi - b.midi,
  );
}
function handDescription(notes, hand, meter, context, zh, limit, explainClipping = true) {
  const selected = notes.filter(
    (n) =>
      n.hand === hand &&
      n.beat < meter.end - EPS &&
      n.beat + n.duration > meter.start + EPS,
  );
  const who = handName(hand, zh);
  if (!selected.length)
    return zh
      ? `${who}在这一小节休息，数完${number(meter.counts)}拍再往下看。`
      : `The ${who} rests for this whole bar; keep counting all ${number(meter.counts)} counts.`;
  const position = (beat) =>
    number((beat - meter.start) / meter.unit + meter.offset + 1);
  const duration = (n, held = false) =>
    (Math.min(meter.end, n.beat + n.duration) - (held ? meter.start : n.beat)) /
    meter.unit;
  const amount = (n, held) =>
    `${number(duration(n, held))}${zh ? "拍" : ` ${duration(n, held) <= 1 + EPS ? "count" : "counts"}`}`;
  const label = (n) => noteLabel(n.midi, context, zh);
  const events = [],
    groups = new Map();
  const carries = selected.filter((n) => n.beat < meter.start - EPS);
  if (carries.length) {
    const items = carries
      .slice(0, 4)
      .map((n) =>
        zh
          ? `${label(n)}再保持${amount(n, true)}`
          : `${label(n)} for ${amount(n, true)} more`,
      );
    events.push({
      at: meter.start,
      text: zh
        ? `延续上小节的音：${and(items, zh)}，不要重新按下${carries.length > 4 ? "；其余延音看乐谱" : ""}。`
        : `Keep holding ${and(items, zh)} from the previous bar; do not strike ${carries.length === 1 ? "it" : "them"} again${carries.length > 4 ? ". Follow the other held notes in the score" : ""}.`,
    });
  }
  for (const n of selected) {
    if (n.beat < meter.start - EPS) continue;
    const key = Math.round(n.beat * 1e6);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const group of groups.values()) {
    const listed = group.slice(0, 4),
      extra = group.length - listed.length;
    const sameLength = group.every(
      (n) => Math.abs(duration(n) - duration(group[0])) < EPS,
    );
    let text;
    if (zh)
      text = `第${position(group[0].beat)}拍${group.length > 1 ? "同时" : ""}弹${and(listed.map(label), true)}${extra ? `及乐谱中的另外${extra}个音` : ""}；${sameLength ? `保持${amount(group[0])}` : listed.map((n) => `${label(n)}保持${amount(n)}`).join("，")}。`;
    else
      text = `On count ${position(group[0].beat)}, play ${and(listed.map(label), false)}${extra ? ` and the other ${extra} written keys` : ""}${group.length > 1 ? " together" : ""}; ${
        sameLength
          ? `hold for ${amount(group[0])}`
          : `hold ${and(
              listed.map((n) => `${label(n)} for ${amount(n)}`),
              false,
            )}`
      }.`;
    const continuing = group.filter(
      (n) => n.beat + n.duration > meter.end + EPS,
    );
    if (continuing.length)
      text += zh
        ? ` ${and(continuing.slice(0, 4).map(label), true)}还要延续到下一小节。`
        : ` Keep ${and(continuing.slice(0, 4).map(label), false)} held across the barline.`;
    events.push({ at: group[0].beat, text });
  }
  let cursor = meter.start;
  for (const n of selected) {
    const begin = Math.max(meter.start, n.beat);
    if (begin > cursor + EPS)
      events.push({
        at: cursor,
        text: zh
          ? `从第${position(cursor)}拍起休息${number((begin - cursor) / meter.unit)}拍。`
          : `Rest for ${number((begin - cursor) / meter.unit)} ${(begin - cursor) / meter.unit <= 1 + EPS ? "count" : "counts"} from count ${position(cursor)}.`,
      });
    cursor = Math.max(cursor, Math.min(meter.end, n.beat + n.duration));
  }
  if (cursor < meter.end - EPS)
    events.push({
      at: cursor,
      text: zh
        ? `最后休息${number((meter.end - cursor) / meter.unit)}拍。`
        : `Finish with ${number((meter.end - cursor) / meter.unit)} ${(meter.end - cursor) / meter.unit <= 1 + EPS ? "count" : "counts"} of rest.`,
    });
  events.sort((a, b) => a.at - b.at);
  const clipped = events.length > limit;
  return `${zh ? `${who}：` : `${who[0].toUpperCase() + who.slice(1)}: `}${events
    .slice(0, limit)
    .map((e) => e.text)
    .join(
      " ",
    )}${clipped && explainClipping ? (zh ? " 这里只拆开前几组，其余按乐谱继续。" : " These are the first groups; continue with the remaining notes in the score.") : ""}`;
}

/** Where “this passage” is when no bar was named: an active repeat loop, else
 * the saved place while a reopened piece still sits at its start (the app is
 * offering “Resume bar N”), else the playhead. A request that names a bar
 * (“this bar”) keeps the playhead inside the loop. */
export function lessonAnchor(request, context = {}, score = context.currentScore) {
  const bars = Number.isInteger(score?.measures) && score.measures > 0 ? score.measures : 1;
  const clamp = (n) => Math.max(1, Math.min(bars, Math.trunc(n) || 1));
  const playhead = clamp(context.currentBar);
  const loop = context.loop;
  const validLoop =
    loop && Number.isInteger(loop.from) && Number.isInteger(loop.to) &&
    loop.from >= 1 && loop.from <= loop.to && loop.to <= bars;
  const namesBar = /\b(?:this|the current|current)\s+(?:bar|measure)\b|\b(?:bar|measure)\s+\d|(?:这|這|当前|當前)(?:一|个|個)?(?:小节|小節)|第\s*[零一二三四五六七八九十百两兩\d]+\s*(?:小节|小節)/.test(String(request || ""));
  if (validLoop && !(namesBar && playhead >= loop.from && playhead <= loop.to))
    return { bar: loop.from, source: "loop", loop: { from: loop.from, to: loop.to } };
  const saved = context.resumeBar;
  // A learner who just chose “Open at bar 1” means bar 1.
  if (playhead === 1 && Number.isInteger(saved) && saved > 1 && saved <= bars && !context.openedAtStart)
    return { bar: saved, source: "saved" };
  return { bar: playhead, source: "playhead" };
}

// ------------------------------------------------- note lists and plans ---

const RHYTHM_NAMES = [
  [4, "whole notes", "全音符"], [3, "dotted half notes", "附点二分音符"], [2, "half notes", "二分音符"],
  [1.5, "dotted quarter notes", "附点四分音符"], [1, "quarter notes", "四分音符"],
  [0.75, "dotted eighth notes", "附点八分音符"], [2 / 3, "quarter-note triplets", "四分音符三连音"],
  [0.5, "eighth notes", "八分音符"], [0.375, "dotted sixteenth notes", "附点十六分音符"],
  [1 / 3, "eighth-note triplets", "八分音符三连音"], [0.25, "sixteenth notes", "十六分音符"],
  [1 / 6, "sixteenth-note triplets", "十六分音符三连音"], [0.125, "thirty-second notes", "三十二分音符"],
];
const rhythmOf = (beats, zh) => {
  const found = RHYTHM_NAMES.find(([value]) => Math.abs(beats - value) < 0.01);
  return found ? found[zh ? 2 : 1] : zh ? `${number(beats)}拍的音` : `notes of ${number(beats)} beats`;
};
/** “What notes are in this bar?”, “list the notes in bar 154”, “这一小节有哪些音”. */
function noteListingRequest(request) {
  const en =
    /^(?:(?:what|which)\s+(?:notes?|pitches|keys)\s+(?:are|is|do i(?:\s+(?:need|have) to)?\s+play|should i play|come|go|does (?:the |my )?(?:left|right) hand play|do (?:the |my )?(?:left|right) hand play|should (?:the |my )?(?:left|right) hand play)\s+(?:in|on|at|for|during)\b|what(?:'s| is| are)\s+the\s+(?:notes|pitches)\s+(?:in|of|for|on)\b|what do i play\s+(?:in|on|at|for)\b|(?:list|name|spell out|read out|read me|show me|give me|tell me|show)\s+(?:me\s+)?(?:all\s+)?(?:the\s+|your\s+)?(?:raw\s+)?(?:notes?|pitches|note data|note list)(?:\s+data)?(?:\s+you have)?\s+(?:in|of|for|on)\b)/.test(request) &&
    /\b(?:this|these|current|here|bars?\s+\d+|measures?\s+\d+)\b/.test(request);
  const zh =
    /(?:这|這|当前|當前|第\s*[零一二三四五六七八九十百两兩\d]+\s*)(?:一|个|個)?(?:小节|小節)(?:里|裡|的)?(?:左手|右手|双手|雙手)?(?:有|是|要|应该|應該|该|該)?(?:弹|彈)?(?:哪些|哪几个|哪幾個|什么|什麼|啥)(?:音|音符|音高)/.test(request) ||
    /^(?:把|请把|請把)?(?:这|這|当前|當前|第\s*[零一二三四五六七八九十百两兩\d]+\s*)(?:一|个|個)?(?:小节|小節)的(?:音|音符|音高)(?:一个一个|一個一個|一个个|一個個|都|全部)?(?:地)?(?:列出来|列出來|列一下|告诉我|告訴我|说出来|說出來|说一下|說一下|写出来|寫出來|报一下|報一下|念一下|讲一下|講一下)$/.test(request) ||
    /^列出(?:这|這|当前|當前|第\s*[零一二三四五六七八九十百两兩\d]+\s*)(?:一|个|個)?(?:小节|小節)的(?:音|音符)/.test(request) ||
    /^(?:这|這)(?:里|裡)(?:要)?(?:弹|彈)(?:哪些|什么|什麼|啥)(?:音|音符)/.test(request);
  return en || zh;
}
const PRACTICE_VERB =
  /\bhow\s+(?:do|should|can|would|could)\s+i\s+(?:practi[cs]e|work on|approach|tackle|get better at|improve)\b|\bhow\s+to\s+(?:practi[cs]e|work on|approach|tackle)\b|\bwhat(?:'s| is)\s+the\s+best\s+way\s+to\s+(?:practi[cs]e|learn|work on)\b|(?:怎么|怎麼|如何|怎样|怎樣|应该怎么|應該怎麼|该怎么|該怎麼)(?:练|練)(?!什么|什麼)/;
const PASSAGE_HERE =
  /\b(?:this|these|the current|that)\s+(?:(?:two|2|few)\s+)?(?:bars?|measures?|passage|section|phrase|part|bit|loop|run)\b|\bhere\b|\bbars?\s+\d+|\bmeasures?\s+\d+|(?:这|這)(?:一|几个|幾個|几|幾|个|個|两|兩)?(?:小节|小節|段|部分|句|里|裡)|第\s*[零一二三四五六七八九十百两兩\d]+\s*(?:小节|小節)/;
/** “How do I practise these bars?”, “这几个小节应该怎么练？”: a practice plan,
 * not a note-by-note lesson. General technique questions have no passage. */
function practicePlanRequest(request) {
  return PRACTICE_VERB.test(request) && PASSAGE_HERE.test(request) &&
    !/^(?:teach me|break (?:it|this)? ?down|walk me through)|教我|教教我|拆解|分解/.test(request);
}
function groupsOf(notes, hand, start, end) {
  const own = notes.filter((n) => n.hand === hand && n.beat < end - EPS && n.beat + n.duration > start + EPS);
  const carried = own.filter((n) => n.beat < start - EPS);
  const byOnset = new Map();
  for (const n of own) {
    if (n.beat < start - EPS) continue;
    const key = Math.round(n.beat * 1e6);
    if (!byOnset.has(key)) byOnset.set(key, []);
    byOnset.get(key).push(n);
  }
  return { carried, groups: [...byOnset.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g.sort((a, b) => a.midi - b.midi)) };
}
function groupLabel(group, context, zh) {
  const score = context.currentScore, flats = usesFlats(score);
  const tonic = Number.isInteger(context.tonic) && context.tonic >= 0 && context.tonic < 12
    ? context.tonic : Number.isInteger(score.tonic) ? ((score.tonic % 12) + 12) % 12 : 0;
  const names = group.map((n) => noteName(n.midi, flats)).join("+");
  if (context.labels === "letters") return names;
  const marks = group.map((n) => context.labels === "solfege" ? solfege(n.midi, tonic, flats) : degree(n.midi, tonic, flats)).join("+");
  return zh ? `${names}（${marks}）` : `${names} (${marks})`;
}
/** One hand of one bar in a line: repeats and alternations are folded. */
function handLine(notes, hand, meter, context, zh) {
  const { carried, groups } = groupsOf(notes, hand, meter.start, meter.end);
  const who = handName(hand, zh);
  const Who = zh ? who : who[0].toUpperCase() + who.slice(1);
  if (!groups.length)
    return carried.length
      ? zh ? `${who}：保持上一小节延续过来的${and(carried.slice(0, 4).map((n) => groupLabel([n], context, true)), true)}。`
        : `${Who}: keeps ${and(carried.slice(0, 4).map((n) => groupLabel([n], context, false)), false)} held from the previous bar.`
      : zh ? `${who}：这一小节休息。` : `${Who}: rests for the whole bar.`;
  const labels = groups.map((g) => groupLabel(g, context, zh));
  let listed;
  const distinct = [...new Set(labels)];
  if (labels.length >= 4 && distinct.length === 2 && labels.every((l, i) => l === labels[i % 2]))
    listed = zh ? `${labels[0]}和${labels[1]}交替${Math.ceil(labels.length / 2)}次` : `${labels[0]} and ${labels[1]} alternating, ${Math.ceil(labels.length / 2)} times`;
  else {
    const runs = [];
    for (const label of labels) {
      if (runs.at(-1)?.label === label) runs.at(-1).count++;
      else runs.push({ label, count: 1 });
    }
    const shown = runs.slice(0, 8).map(({ label, count }) => (count > 1 ? `${label}${zh ? "" : " "}×${count}` : label));
    const more = runs.slice(8).reduce((sum, r) => sum + r.count, 0);
    listed = zh ? shown.join("、") + (more ? `……还有${more}组` : "") : shown.join(", ") + (more ? `, and ${more} more` : "");
  }
  const lengths = groups.map((g) => Math.min(meter.end, g[0].beat + Math.max(...g.map((n) => n.duration))) - g[0].beat);
  const counts = new Map();
  for (const value of lengths) {
    const key = rhythmOf(value, zh);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const [common, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const rhythm = counts.size === 1
    ? zh ? `都是${common}` : `all ${common}`
    : n * 2 > lengths.length ? zh ? `大多是${common}` : `mostly ${common}` : zh ? "节奏有变化" : "mixed note values";
  const held = carried.length
    ? zh ? `（先保持上一小节的${and(carried.slice(0, 2).map((x) => groupLabel([x], context, true)), true)}）` : ` (keep ${and(carried.slice(0, 2).map((x) => groupLabel([x], context, false)), false)} held from the previous bar first)`
    : "";
  return zh ? `${who}：${listed}，${rhythm}${held}。` : `${Who}: ${listed} — ${rhythm}${held}.`;
}
/** The things a teacher points at first, per hand, for a practice plan. */
function handTip(notes, hand, start, end, context, zh) {
  const { groups } = groupsOf(notes, hand, start, end);
  if (!groups.length) return null;
  const outer = (g) => (hand === "right" ? g.at(-1) : g[0]);
  let leap = null;
  for (let i = 1; i < groups.length; i++) {
    // A note still held when the next one starts (a bass under a figure) is
    // another voice: the hand does not jump away from it.
    if (Math.max(...groups[i - 1].map((n) => n.beat + n.duration)) > groups[i][0].beat + EPS) continue;
    const a = outer(groups[i - 1]), b = outer(groups[i]);
    const size = Math.abs(b.midi - a.midi);
    // An octave or more is a real shift of the hand; smaller skips sit inside
    // a broken-chord shape.
    if (size >= 12 && (!leap || size > leap.size)) leap = { size, from: a, to: b };
  }
  const label = (n) => groupLabel([n], context, zh);
  if (leap) return zh ? `提前看好从${label(leap.from)}到${label(leap.to)}的跳跃` : `look ahead to the leap from ${label(leap.from)} to ${label(leap.to)}`;
  const chord = Math.max(...groups.map((g) => g.length));
  if (chord >= 3) return zh ? `每个和弦的${chord}个音一起按下，手先放好再弹` : `set all ${chord} notes of each chord down together, hand in place first`;
  // The value most notes use, not one quick note: a dotted figure in a bar
  // of triplets is still a bar of triplets.
  const tally = new Map();
  for (const g of groups) tally.set(Math.round(g[0].duration * 1000), (tally.get(Math.round(g[0].duration * 1000)) || 0) + 1);
  const common = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0] / 1000;
  if (common <= 0.34) return zh ? `${rhythmOf(common, true)}要弹得均匀` : `keep the ${rhythmOf(common, false)} even`;
  if (chord === 2) return zh ? "两个音要同时落下" : "let the two-note chords land together";
  return zh ? "一边弹一边数拍" : "count the beats aloud as you play";
}

export function lessonAnchorFor(request, context, history) {
  return lessonAnchor(request, { ...context, openedAtStart: context.openedAtStart ?? openedAtStart(history) }, context.currentScore);
}

function listOrPlan(kind, request, context, history, zh, requestedPassage) {
  const score = context.currentScore;
  if (!score || !Number.isInteger(score.measures) || score.measures < 1 || !Array.isArray(score.notes))
    return {
      message: zh ? "先打开一份乐谱，我才能看这一小节的音。" : "Open a score first, and I’ll read that bar with you.",
      intent: "guidance",
      actions: [],
    };
  if (requestedPassage && (!Number.isInteger(requestedPassage.from) || !Number.isInteger(requestedPassage.to) ||
      requestedPassage.from < 1 || requestedPassage.to < requestedPassage.from || requestedPassage.to > score.measures))
    return {
      message: zh ? `这份乐谱有${score.measures}小节，请选1到${score.measures}之间的小节。` : `This score has ${score.measures} bars. Choose bars from 1 to ${score.measures}.`,
      intent: "guidance",
      actions: [],
    };
  const anchor = requestedPassage ? null : lessonAnchorFor(request, context, history);
  const loop = anchor?.source === "loop" ? anchor.loop : null;
  const from = requestedPassage?.from ?? anchor.bar;
  const to = requestedPassage
    ? Math.min(requestedPassage.to, from + 1)
    : loop && kind === "plan" ? Math.min(loop.to, from + 3) : from;
  const start = barStart(score, from), end = barEnd(score, to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start))
    return { message: zh ? "这一段的小节时长不完整，请先检查导入的乐谱。" : "This passage has incomplete bar timing. Check the imported score first.", intent: "guidance", actions: [] };
  const notes = notesFor(score, start, end);
  const range = (a, b) => (a === b ? (zh ? `第${a}小节` : `bar ${a}`) : zh ? `第${a}–${b}小节` : `bars ${a}–${b}`);
  const where = !anchor || anchor.source === "playhead"
    ? ""
    : anchor.source === "loop"
      ? zh ? `你的循环是${range(loop.from, loop.to)}。` : `Your repeat is ${range(loop.from, loop.to)}. `
      : zh ? `你上次练到第${anchor.bar}小节。` : `You left off at bar ${anchor.bar} last time. `;
  if (kind === "list") {
    // “Which notes does the left hand play?” lists that hand only.
    const asked = /\bleft hand\b|左手/.test(request) && !/\bright hand\b|右手/.test(request) ? ["left"]
      : /\bright hand\b|右手/.test(request) && !/\bleft hand\b|左手/.test(request) ? ["right"] : ["right", "left"];
    const lines = [];
    for (let bar = from; bar <= to; bar++) {
      const meter = meterAt(score, bar);
      if (!Number.isFinite(meter.counts) || meter.counts <= 0) continue;
      const head = zh ? `第${bar}小节（${number(meter.counts)}拍）：` : `Bar ${bar} (${number(meter.counts)} ${Math.abs(meter.counts - 1) < EPS ? "count" : "counts"}):`;
      lines.push([head, ...asked.map((h) => handLine(notes, h, meter, context, zh))].join("\n"));
    }
    return {
      message: `${where}${lines.join("\n\n")}`,
      intent: "guidance",
      actions: loop ? [] : [{ type: "repeat-bars", from, to, label: zh ? `循环${range(from, to)}` : `Repeat ${range(from, to)}` }],
    };
  }
  // A practice plan: hands separately, then together, slowly, then faster.
  const present = ["right", "left"].filter((h) => notes.some((n) => n.hand === h && n.beat >= start - EPS));
  const current = Number.isFinite(context.speed) ? Math.round(context.speed * 20) * 5 : 75;
  const pct = Math.min(current, 60);
  const span = loop ? range(loop.from, loop.to) : range(from, to);
  const steps = present.map((h, i) => {
    const tip = handTip(notes, h, start, end, context, zh);
    return zh
      ? `${i + 1}. ${i ? "再" : "先"}${handName(h, true)}单独练，速度${pct}%：${tip}。${i ? "" : "连续弹对三遍再往下。"}`
      : `${i + 1}. ${handName(h, false)[0].toUpperCase() + handName(h, false).slice(1)} alone at ${pct}%: ${tip}.${i ? "" : " Three clean times in a row, then move on."}`;
  });
  if (present.length === 2)
    steps.push(zh
      ? `3. 双手合起来，还是${pct}%；连续两遍都稳了，再加快5%。`
      : `3. Hands together at ${pct}%; once it’s steady twice in a row, go up 5%.`);
  else if (!present.length)
    steps.push(zh ? "1. 这里没有新弹的音：数着拍保持住，再接下一小节。" : "1. Nothing new is played here: keep counting through it and connect it to the next bar.");
  const actions = [];
  if (!loop) actions.push({ type: "repeat-bars", from, to, label: zh ? `循环${range(from, to)}` : `Repeat ${range(from, to)}` });
  if (present[0] && present.length === 2 && context.hand !== present[0])
    actions.push({ type: "set-hand", hand: present[0], label: zh ? `只练${handName(present[0], true)}` : `${present[0] === "right" ? "Right" : "Left"} hand only` });
  if (pct < current) actions.push({ type: "set-speed", speed: pct / 100, label: zh ? `${pct}%速度` : `${pct}% speed` });
  return {
    message: `${where}${zh ? `${span}这样练：` : `Here’s a plan for ${span}:`}\n${steps.join("\n")}`,
    intent: "guidance",
    actions,
  };
}

/** Current-score teaching only. Call the normal command/search router for null. */
export function planCompanionLesson(input, context = {}, history = []) {
  const request = normal(input),
    zh = ["zh", "zh-Hant"].includes(context.language || conversationLanguage(history, input));
  const prior = previousLesson(history),
    requestedPassage = requestedBars(request);
  // A general technique, musical-style or unrelated question must reach chat.
  // Merely containing “how do I play” does not refer to the open score.
  // “This little passage”, “this phrase”, “my loop”, “这一小段”, “这个乐句”:
  // all name the passage in front of the learner, like “this bar” does.
  // “That bar” and “those bars” point at the same passage (“where was I?” →
  // Resume → “teach me that bar”).
  const currentPassage = Boolean(requestedPassage) ||
    /\b(?:(?:this|that|these|those|the current|current|the whole|the)\s+(?:(?:two|2|few)\s+)?(?:piece|song|score|bars?|passage|section|measures?)|(?:this|that|these|those)\s+(?:notes?|chords?))\b|\b(?:this|that|these|those|my|the current|the)\s+(?:(?:little|short|small|tricky|hard|difficult|fast)\s+)?(?:passage|phrase|loop|section)s?\b(?!\s*['"“‘:])|\b(?:this|that|these|those|my)\s+(?:(?:little|short|small|tricky|hard|difficult|fast)\s+)?(?:bit|part|excerpt|line|run)s?\b|(?:这|這|那)(?:首|段|几小节|幾小節|几个小节|幾個小節|些小节|些小節|两小节|兩小節|两个小节|兩個小節|一小节|一小節|个小节|個小節|小节|小節|份乐谱|份樂譜|一小段|小段|一段|个乐句|個樂句|乐句|樂句|一句|句|个片段|個片段|片段|部分|里|裡|儿|兒)|当前(?:乐谱|小节|段)|當前(?:樂譜|小節|段)|(?:循环|循環)(?:的)?(?:这|這)?(?:一)?(?:段|部分)/.test(request);
  // Bored of the passage asks for a fresh way to practise it; bored of the
  // piece and asking for something else asks for another piece.
  const otherPiece = /\b(?:else|another|different|other)\b|\bnew (?:piece|song)\b|别的|別的|其他|其它|换一首|換一首|换首|換首|换点|換點|来点别的|來點別的/i.test(request);
  const practiceVariation = currentPassage && !otherPiece && /boring|bored|monoton|无聊|無聊|枯燥|没意思|沒意思/i.test(request);
  // A plan over days or weeks, or for a performance, is a conversation about
  // the whole preparation, not a short session on one bar.
  const generalPlan = /\b(?:weeks?|weekly|months?|monthly|days|routine|schedule|curriculum|recital|audition|exam|competition|gig|performance|perform(?:ing)? (?:it|this)|concert(?!\s+(?:arrangement|version|edition))|nerves|nervous|stage fright)\b|每周|每週|一周|一週|两周|兩週|几周|幾週|一个月|一個月|每天|计划表|計劃表|演出|表演|音乐会(?!版)|音樂會(?!版)|比赛|比賽|考级|考級|考试|考試|汇报|匯報|紧张|緊張/.test(request);
  const timeLimitedPractice = !generalPlan && request.length <= 220 && /\b(?:practi[cs]e|practi[cs]ing|piano)\b|练琴|練琴|练习|練習|弹琴|彈琴/.test(request) &&
    /\b(?:only|just|have|got|spare|spend|plan|fit|limited|short|quick)\b|只有|只剩|只有|时间有限|時間有限|抽空|短时间|短時間/.test(request) &&
    /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|a few|a couple of)\s*(?:minutes?|mins?)\b|[零一二三四五六七八九十两兩\d]+分钟|[零一二三四五六七八九十两兩\d]+分鐘/.test(request);
  // “What notes are in this bar?” wants the notes of both hands at a glance;
  // “how do I practise these bars?” wants a plan. Neither is the stepwise
  // reading lesson that “teach me this bar” starts.
  const explicitTeach = /^(?:teach me|explain|walk me through|break)|教我|教教我|讲讲|講講|解释|解釋|拆解|分解/.test(request);
  if (!timeLimitedPractice && !practiceVariation && !explicitTeach) {
    if (noteListingRequest(request)) return listOrPlan("list", request, context, history, zh, requestedPassage);
    if (practicePlanRequest(request)) return listOrPlan("plan", request, context, history, zh, requestedPassage);
  }
  const next =
    /^(?:next(?: step)?|what(?:'s| is) next|continue the lesson|i got it|got it|i understand|下一步|下一步呢|接下来|接下來|继续教学|繼續教學|懂了|我懂了|明白了|学会了|學會了)$/.test(
      request,
    );
  const nextBar =
    /^(?:(?:what(?:'s| is)(?: in)?|show me|teach me|explain)\s+)?(?:the )?next (?:bar|passage|measure)$/.test(
      request,
    ) ||
    /^(?:(?:可以|能不能|能否)?(?:教我|教教我|讲讲|講講|解释|解釋|给我看看|給我看看|看看|带我看|帶我看))?下(?:一|一个|一個)?(?:小节|小節|段)(?:是(?:什么|什麼|甚麼)|怎么(?:弹|练)|怎麼(?:彈|練))?(?:吗|嗎|呢)?$/.test(
      request,
    );
  const currentBarQuestion =
    /^(?:explain (?:this|the current) (?:bar|passage|measure)|what (?:notes? (?:do|should) i play|do i play) (?:in|for) (?:this|the current) (?:bar|passage|measure)|(?:what|which) notes? (?:are|is) (?:in|on) (?:this|the current) (?:bar|passage|measure)|what are the notes (?:in|of) (?:this|the current) (?:bar|passage|measure))$/.test(
      request,
    ) ||
    /^(?:(?:解释|解釋|讲讲|講講)(?:这|這|当前|當前)(?:一|个|個)?(?:小节|小節|段)|(?:这|這|当前|當前)(?:一|个|個)?(?:小节|小節|段)(?:要|应该|應該)?(?:弹|彈)(?:什么|什麼|哪些)(?:音|音符)?|(?:这|這)(?:一|个|個)?(?:小节|小節|段)有哪些(?:音|音符))(?:吗|嗎|呢)?$/.test(
      request,
    );
  const briefClarification = /^(?:say (?:that|it) (?:more simply|in simpler words)(?:,? with (?:just )?one suggestion)?|give me (?:just )?one suggestion|说简单一点(?:，?只给我一个建议)?|說簡單一點(?:，?只給我一個建議)?|只给我一个建议|只給我一個建議)$/.test(request) && Boolean(previousLesson(history));
  const clarifyLesson = briefClarification || /^(?:what do you mean|what does that mean|explain that|什么意思|什麼意思|你是什么意思|你是什麼意思)$/.test(request) && Boolean(previousLesson(history));
  const simpler = clarifyLesson ||
    /^(?:simpler|make (?:it|this) simpler|simplify (?:it|this)|too (?:hard|difficult)|i don'?t understand|简单(?:一)?点|簡單(?:一)?點|再简单一点|太难了|太難了|我不懂)$/.test(
      request,
    );
  const teachingVerb = /^(?:teach me\b|help me (?:learn|practi[cs]e|play|read)\b|break\b|explain\b|walk me through\b|show me how to (?:play|practi[cs]e|read)\b|how (?:do|should|can) i (?:play|practi[cs]e|read)\b|(?:go|run|take me|talk me)\s+(?:through|over)\b)|教我|教教我|带我练|帶我練|帮我练|幫我練|带我过|帶我過|过一遍|過一遍|分解|拆解|讲讲|講講|讲一下|講一下|讲一讲|講一講|讲解|講解|解释一下|解釋一下|怎么练|怎麼練|如何练|如何練|怎么弹|怎麼彈|如何弹|如何彈/.test(request);
  const directCurrent = /^(?:teach me (?:this|these)|help me (?:learn|practi[cs]e|play) (?:this|these)|how (?:do|should|can) i (?:play|practi[cs]e|read) (?:this|these)|(?:break (?:it|this) down|break down this)|(?:teach me (?:the )?)?(?:left hand|right hand|both hands)|用(?:左|右|双|雙)手(?:练|練)|教我这首|教我這首)$/.test(request);
  const teaching = timeLimitedPractice || practiceVariation || currentBarQuestion ||
    (currentPassage && teachingVerb) || (directCurrent && !/^(?:left hand|right hand|both hands)$/.test(request) &&
      (prior || !/^(?:break (?:it|this) down|break down this)$/.test(request)));
  const requested = nextBar || currentBarQuestion ? null : requestedPassage,
    targetHand = requestedHand(request);
  const handFollowup =
    /^(?:(?:now|try|just|only|the)\s+)?(?:left hand|right hand|both hands|hands together|lh|rh|左手|右手|双手|雙手|两手|兩手)(?: only)?$/.test(
      request,
    );
  const barFollowup =
    /^(?:bars?|measures?)\s+[0-9–—~～\-\s]+$/.test(request) ||
    /^第?[零一二三四五六七八九十两兩0-9至到–—~～\-\s]+(?:小节|小節)$/.test(
      request,
    );
  // “Next” and “simpler” also continue ordinary conversation. Only a real
  // current (or stale) lesson gives those short replies score-reading meaning.
  if (!prior && !teaching && !nextBar && (next || simpler)) return null;
  if (
    !teaching &&
    !next &&
    !nextBar &&
    !simpler &&
    !(prior && (handFollowup || barFollowup))
  )
    return null;
  const score = context.currentScore;
  if (
    !score ||
    !Number.isInteger(score.measures) ||
    score.measures < 1 ||
    !Array.isArray(score.notes)
  )
    return result(
      zh
        ? "先打开一份乐谱，我会从当前小节开始，一步一步拆开。"
        : "Open a score first, and I’ll break the current bar into a few small steps.",
    );
  const revision =
    typeof context.scoreRevision === "string" ? context.scoreRevision : null;
  const priorValid = validLesson(prior, score, revision);
  const handTeaching =
    /^(?:teach me (?:the )?(?:left hand|right hand|both hands)|用(?:左|右|双|雙)手(?:练|練))$/.test(
      request,
    );
  const fresh =
    (teaching && !(priorValid && handTeaching)) || (nextBar && !priorValid);
  if (!teaching && (handFollowup || barFollowup) && !priorValid) return null;
  if (!teaching && !nextBar && !requested && !priorValid)
    return result(
      zh
        ? "这份乐谱还没有当前的分步练习，或曲谱版本已经改变。说“教我这一小节”，我会按现在的乐谱重新开始。"
        : "There isn’t a current lesson for this version of the score. Say “teach me this bar” to start from the music now open.",
    );
  if (
    requested &&
    (!Number.isInteger(requested.from) ||
      !Number.isInteger(requested.to) ||
      requested.from < 1 ||
      requested.to < requested.from ||
      requested.to > score.measures)
  )
    return result(
      zh
        ? `这份乐谱有${score.measures}小节，请选1到${score.measures}之间的完整小节范围。`
        : `This score has ${score.measures} bars. Choose a whole-bar range from 1 to ${score.measures}, in order.`,
    );
  // “Next bar” without a lesson stays literal (after the playhead); a new
  // lesson starts at the passage the learner is actually on.
  const anchor =
    nextBar && !priorValid
      ? { bar: Math.max(1, Math.min(score.measures, Math.trunc(context.currentBar) || 1)), source: "playhead" }
      : lessonAnchorFor(request, context, history);
  let from =
    requested?.from ??
    (priorValid && !fresh ? prior.from : anchor.bar);
  const anchored = !requested && !(priorValid && !fresh) && anchor.source !== "playhead";
  let to = requested
    ? Math.min(requested.to, from + 1)
    : priorValid && !fresh
      ? prior.to
      : Math.min(
          score.measures,
          from +
            (/\b(?:two|2) bars\b|两小节|兩小節|两个小节|兩個小節/.test(request)
              ? 1
              : 0),
        );
  let step =
    fresh || requested || targetHand
      ? 0
      : Math.min(2, prior.step + (next ? 1 : 0));
  let simple = timeLimitedPractice || simpler || (priorValid && !fresh && prior.simple);
  let hand =
    targetHand ||
    (priorValid && !fresh
      ? prior.hand
      : hands.includes(context.hand)
        ? context.hand
        : "both");
  if (simpler || timeLimitedPractice) {
    to = from;
    step = 0;
  }
  // After isolating one action, expand the same hand before changing hands.
  if (next && priorValid && prior.simple) {
    simple = false;
    step = prior.step;
  }
  if (nextBar && !priorValid) {
    if (from >= score.measures)
      return result(
        zh
          ? "当前已经是这份乐谱的最后一小节，没有下一小节。可以再练这一小节，或指定另一个小节。"
          : "You’re at the final bar of this score; there isn’t another bar after it. Repeat this bar, or choose another one.",
        [
          {
            type: "repeat-bars",
            from,
            to: from,
            label: zh ? "重复这一小节" : "Repeat this bar",
          },
        ],
      );
    from++;
    to = from;
    step = 0;
    simple = false;
  }
  if ((nextBar || (next && prior?.step === 2)) && priorValid) {
    if (prior.to >= score.measures)
      return result(
        zh
          ? "已经到这份乐谱的最后一小节了。可以再练这一段，或指定另一个小节。"
          : "This is the final passage in this score. Repeat it, or choose another bar.",
        [
          {
            type: "repeat-bars",
            from: prior.from,
            to: prior.to,
            label: zh ? "重复这一段" : "Repeat this passage",
          },
        ],
        { ...prior, language: zh ? "zh" : "en" },
      );
    from = prior.to + 1;
    to = Math.min(score.measures, from + prior.to - prior.from);
    step = 0;
  }
  const start = barStart(score, from),
    end = barEnd(score, to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start))
    return result(
      zh
        ? "这一段的小节时长不完整，请先检查导入的乐谱。"
        : "This passage has incomplete bar timing. Check the imported score before practising it.",
    );
  const notes = notesFor(score, start, end),
    present = [...new Set(notes.map((n) => n.hand))];
  const lesson = {
    version: 1,
    scoreId: score.id ?? null,
    scoreRevision: revision,
    from,
    to,
    hand,
    step,
    simple: Boolean(simple),
    language: zh ? "zh" : "en",
  };
  const bothPresent = present.includes("left") && present.includes("right");
  const focus =
    hand === "both"
      ? step === 2 && bothPresent
        ? "both"
        : step === 1 && bothPresent
          ? "left"
          : present.includes("right")
            ? "right"
            : present.includes("left")
              ? "left"
              : "both"
      : hand;
  const title = clean(score.title, 100) || (zh ? "当前乐谱" : "this score");
  const range =
    from === to
      ? zh
        ? `第${from}小节`
        : `bar ${from}`
      : zh
        ? `第${from}–${to}小节`
        : `bars ${from}–${to}`;
  // Say why this passage was chosen when it is not simply the playhead.
  // Teaching bar 1 of a piece the learner just opened at its start, while a
  // saved place exists: say where that place is, without moving there.
  const savedElsewhere = !anchored && !requested && anchor.source === "playhead" && from === 1 &&
    Number.isInteger(context.resumeBar) && context.resumeBar > 1 && context.resumeBar <= score.measures;
  const where = !anchored
    ? savedElsewhere
      ? zh
        ? `（你上次练到第${context.resumeBar}小节；想回到那里，说“继续”。）`
        : `(You left off at bar ${context.resumeBar} last time; say “resume” to go back there.) `
      : ""
    : anchor.source === "loop"
      ? zh
        ? `你的循环是第${anchor.loop.from === anchor.loop.to ? anchor.loop.from : `${anchor.loop.from}–${anchor.loop.to}`}小节。`
        : `Your repeat is ${anchor.loop.from === anchor.loop.to ? `bar ${anchor.loop.from}` : `bars ${anchor.loop.from}–${anchor.loop.to}`}. `
      : zh
        ? `你上次练到第${anchor.bar}小节。`
        : `You left off at bar ${anchor.bar} last time. `;
  if (timeLimitedPractice || briefClarification) return result(
    where + (zh
      ? `${timeLimitedPractice ? "时间短，就先看" : "只做这一件事：看"}${range}的第一个动作。`
      : `${timeLimitedPractice ? "For this short session, focus on" : "Just focus on"} the first written action in ${range}.`) +
      ` ${handDescription(notes, focus, meterAt(score, from), context, zh, 1, false)}`,
    [{ type: "repeat-bars", from, to: from, label: zh ? `循环第${from}小节` : `Repeat bar ${from}` },
      ...(focus !== context.hand && present.includes(focus) ? [{ type: "set-hand", hand: focus, label: zh ? `只练${handName(focus, true)}` : `Practise ${handName(focus, false)}` }] : [])],
    { ...lesson, to: from, simple: true },
  );
  if (practiceVariation) return result(
    where + (zh
      ? `先给${range}一个小目标：只看${handName(focus, true)}，按谱上的音、保持和休止慢练三遍，每遍结束停一下。最后一遍先轻声数拍，再弹；先不用改变指法或加音。`
      : `Give ${range} one small goal: practise the ${handName(focus, false)} part slowly three times, keeping its written notes, holds and rests, with a pause after each attempt. Count the rhythm aloud before the final attempt; keep the written fingering and notes.`),
    [{ type: "repeat-bars", from, to, label: zh ? `循环${range}` : `Repeat ${range}` },
      ...(focus !== hand ? [{ type: "set-hand", hand: focus, label: zh ? `只练${handName(focus, true)}` : `Practise ${handName(focus, false)}` }] : [])],
    lesson,
  );
  const opening =
    step === 0
      ? zh
        ? `先把《${title}》的${range}拆开${simple ? "，一次只看一个动作" : ""}。`
        : `Let’s start with ${range} of “${title}”${simple ? ", one small action at a time" : ""}.`
      : step === 1
        ? zh
          ? `下一步，${bothPresent && hand === "both" ? "单独看左手" : `用${handName(focus, true)}慢慢弹这一段`}。`
          : `Next, ${bothPresent && hand === "both" ? "look at the left hand on its own" : `play this passage slowly with the ${handName(focus, false)}`}.`
        : zh
          ? `现在把${range}${focus === "both" ? "的双手合起来" : "按节奏连起来"}。`
          : `Now ${focus === "both" ? "bring both hands together" : "join the notes in rhythm"} in ${range}.`;
  const paragraphs = [step === 0 ? `${where}${opening}` : opening];
  if (teaching && /\b(?:piece|song|whole)\b|这首|這首|全曲/.test(request))
    paragraphs.push(
      zh
        ? `这份乐谱有${score.measures}小节。我们每次练一两小节：先读音和节奏，再分别练手，最后连起来。`
        : `This score has ${score.measures} bars. We’ll work in one- or two-bar passages: read the notes and rhythm, practise each hand, then put the passage together.`,
    );
  const tonic =
    Number.isInteger(context.tonic) && context.tonic >= 0 && context.tonic < 12
      ? context.tonic
      : Number.isInteger(score.tonic)
        ? ((score.tonic % 12) + 12) % 12
        : 0;
  if (step === 0 && context.labels !== "letters") {
    const one = noteName(60 + tonic, usesFlats(score)).replace(/-?\d+$/, "");
    paragraphs.push(
      zh
        ? `这里1＝${one}；括号内是音高${context.labels === "solfege" ? "唱名" : "数字"}，不是手指。C4中的4表示八度。`
        : `Here 1 = ${one}. The brackets show ${context.labels === "solfege" ? "solfege" : "pitch numbers"}, not fingers; the 4 in C4 identifies its octave.`,
    );
  }
  for (let bar = from; bar <= to; bar++) {
    const meter = meterAt(score, bar);
    if (!Number.isFinite(meter.counts) || meter.counts <= 0) continue;
    const lines = [meterText(meter, zh)];
    for (const h of focus === "both" ? ["right", "left"] : [focus])
      lines.push(
        handDescription(
          notes,
          h,
          meter,
          context,
          zh,
          simple ? 1 : focus === "both" || from !== to ? 3 : 4,
        ),
      );
    paragraphs.push(
      `${from === to ? "" : zh ? `第${bar}小节：` : `Bar ${bar}: `}${lines.join(" ")}`,
    );
  }
  paragraphs.push(
    step === 2
      ? zh
        ? "先看清同一位置同时开始的音，再按写出的时值保持；如果卡住，说“简单一点”。"
        : "Line up notes that start together and keep their written lengths. Say “simpler” if you want to isolate the first action."
      : zh
        ? `先读${handName(focus, true)}这一部分；准备好后说“下一步”。`
        : `Read through the ${handName(focus, false)} part first. When you’re ready, say “next step”.`,
  );
  const actions = [
    {
      type: "repeat-bars",
      from,
      to,
      label: zh ? `重复${range}` : `Repeat ${range}`,
    },
  ];
  if (focus !== context.hand)
    actions.push({
      type: "set-hand",
      hand: focus,
      label: zh
        ? `只练${handName(focus, true)}`
        : focus === "both"
          ? "Both hands"
          : `${focus === "right" ? "Right" : "Left"} hand only`,
    });
  if (step === 1 || simpler) {
    const speed = Math.max(
      0.25,
      Math.min(
        0.6,
        Math.round(
          (Number.isFinite(context.speed) ? context.speed : 0.75) * 20,
        ) / 20,
      ),
    );
    if (speed < (context.speed ?? 0.75))
      actions.push({
        type: "set-speed",
        speed,
        label: zh
          ? `${Math.round(speed * 100)}%速度`
          : `${Math.round(speed * 100)}% speed`,
      });
  }
  if (step === 0 && context.mode !== "wait")
    actions.push({
      type: "set-mode",
      mode: "wait",
      label: zh ? "等我模式" : "Wait for me",
    });
  return result(paragraphs.join("\n\n"), actions, lesson);
}
