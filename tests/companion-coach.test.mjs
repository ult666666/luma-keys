import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planCompanionLesson, lessonAnchor } from "../src/companion-coach.mjs";
import { scoreContextId } from "../src/companion-conversation.mjs";
import { parseMusicXML } from "../src/music.mjs";

const note = (id, midi, beat, duration = 1, hand = "right") => ({
  id,
  midi,
  beat,
  duration,
  hand,
});
const score = (notes, extra = {}) => ({
  id: "lesson-test",
  title: "Small study",
  measures: 3,
  duration: 12,
  meter: 4,
  measureStarts: [0, 4, 8],
  measureLengths: [4, 4, 4],
  measureSignatures: ["4/4", "4/4", "4/4"],
  tonic: 0,
  keySignature: { fifths: 0, mode: "major" },
  notes,
  ...extra,
});
const study = score([
  note("r1", 60, 0),
  note("r2", 62, 1),
  note("r3", 64, 3),
  note("l1", 48, 0, 4, "left"),
  note("r4", 65, 4, 4),
  note("r5", 67, 8, 4),
]);
const context = (s = study, extra = {}) => ({
  currentScore: s,
  currentBar: 1,
  hand: "both",
  mode: "listen",
  speed: 0.75,
  tonic: s.tonic,
  labels: "numbers",
  scoreRevision: scoreContextId(s),
  ...extra,
});
const plan = (input, history = [], ctx = context()) =>
  planCompanionLesson(input, ctx, history);
const historyOf = (turn, prior = []) => [
  ...prior,
  { role: "assistant", intent: "lesson", ...turn },
];

test("the exact teaching request gives a bounded real passage and separate paused proposals", () => {
  const turn = plan("Can you teach me this piece and break it down?");
  assert.equal(turn.intent, "lesson");
  assert.deepEqual(turn.lesson, {
    version: 1,
    scoreId: study.id,
    scoreRevision: scoreContextId(study),
    from: 1,
    to: 1,
    hand: "both",
    step: 0,
    simple: false,
    language: "en",
  });
  assert.match(turn.message, /3 bars.*one- or two-bar passages/s);
  assert.match(turn.message, /C4 \(1\)/);
  assert.match(turn.message, /D4 \(2\)/);
  assert.match(turn.message, /Rest for 1 count from count 3/);
  assert.match(turn.message, /4 in C4 identifies its octave/);
  assert.deepEqual(
    turn.actions.map((a) => a.type),
    ["repeat-bars", "set-hand", "set-mode"],
  );
  assert.ok(
    turn.actions.every(
      (a) => !["play", "open-piece", "edit-score"].includes(a.type),
    ),
  );
  assert.doesNotMatch(
    turn.message,
    /Hello|midi|duration:|beat:|You played|You completed|I heard/i,
  );
});

test("next, I got it and simpler retain exact passage, then advance without claiming assessment", () => {
  let turn = plan("teach me this"),
    history = historyOf(turn);
  turn = plan("next step", history);
  assert.equal(turn.lesson.step, 1);
  assert.match(turn.message, /left hand on its own/);
  assert.match(turn.message, /C3 \(1\).*4 counts/);
  assert.equal(turn.actions.find((a) => a.type === "set-hand").hand, "left");
  history = historyOf(turn, history);
  turn = plan("I got it", history);
  assert.equal(turn.lesson.step, 2);
  assert.match(turn.message, /bring both hands together/);
  history = historyOf(turn, history);
  const simple = plan("simpler", history);
  assert.equal(simple.lesson.step, 0);
  assert.equal(simple.lesson.simple, true);
  assert.equal(simple.lesson.to, simple.lesson.from);
  assert.match(simple.message, /first groups/);
  const expand = plan("next step", historyOf(simple, history));
  assert.equal(expand.lesson.step, 0);
  assert.equal(expand.lesson.simple, false);
  assert.match(expand.message, /Right hand:/);
  turn = plan("next step", history);
  assert.equal(turn.lesson.from, 2);
  assert.equal(turn.lesson.step, 0);
  assert.doesNotMatch(
    turn.message,
    /well done|perfect|you (?:played|completed|mastered)/i,
  );
  const direct = plan("next bar", history);
  assert.equal(direct.lesson.from, 2);
});

test("only an active same-version lesson captures hand and bare bar follow-ups", () => {
  assert.equal(plan("left hand"), null);
  assert.equal(plan("bar 2"), null);
  const history = historyOf(plan("teach me this"));
  const left = plan("left hand", history);
  assert.equal(left.lesson.hand, "left");
  assert.match(left.message, /C3 \(1\)/);
  assert.doesNotMatch(left.message, /D4 \(2\)/);
  assert.equal(plan("bar 2", history).lesson.from, 2);
  for (const s of [
    { ...study, id: "other-version" },
    { ...study, notes: [...study.notes, note("new", 70, 1)] },
  ]) {
    const stale = plan("next step", history, context(s));
    assert.equal(stale.lesson, undefined);
    assert.deepEqual(stale.actions, []);
    assert.match(stale.message, /current lesson for this version/);
    assert.equal(plan("left hand", history, context(s)), null);
  }
  assert.equal(
    plan("next step", history, { ...context(), scoreRevision: undefined })
      .lesson,
    undefined,
  );
  const changedTopic = [
    ...history,
    {
      role: "assistant",
      intent: "conversation",
      message: "Would you like a story?",
    },
  ];
  assert.equal(plan("next step", changedTopic), null, "a conversational next step belongs to chat");
});

test("natural next-bar questions always use the next real passage, with or without a lesson", () => {
  const requests = [
    "What is the next bar?",
    "What’s the next passage?",
    "What's in the next measure?",
    "Show me the next bar",
    "Can you teach me the next passage?",
    "Explain the next bar",
    "下一小节是什么？",
    "教我下一小节",
    "请解释下一段",
    "可以教我下一个小节吗？",
    "下一小節怎麼彈？",
  ];
  const prior = historyOf(plan("teach me bars 1–2"));
  for (const input of requests) {
    const fresh = plan(input);
    assert.equal(fresh.intent, "lesson", input);
    assert.equal(fresh.lesson.from, 2, input);
    assert.equal(fresh.lesson.to, 2, input);
    assert.equal(fresh.lesson.step, 0, input);
    assert.match(fresh.message, /F4/, input);
    assert.equal(
      plan(input, [], context(study, { currentBar: 2 })).lesson.from,
      3,
      input,
    );
    const active = plan(input, prior);
    assert.equal(active.lesson.from, 3, input);
    assert.equal(active.lesson.to, 3, input);
    assert.match(active.message, /G4/, input);
    assert.doesNotMatch(active.message, /F4/, input);
  }
  const revised = { ...study, id: "new-piece" };
  assert.equal(
    plan("What is the next bar?", prior, context(revised)).lesson.from,
    2,
  );
  const final = plan(
    "What is the next bar?",
    [],
    context(study, { currentBar: 3 }),
  );
  assert.equal(final.lesson, undefined);
  assert.match(final.message, /final bar.*isn’t another bar/);
  assert.equal(final.actions[0].from, 3);
  assert.match(
    plan("下一小节是什么？", [], context(study, { currentBar: 3 })).message,
    /最后一小节/,
  );
});

test("current-bar note questions are local while general bar theory is not misread as score instruction", () => {
  for (const input of ["Can you explain this bar?", "解释这一小节", "请讲讲这段"]) {
    const turn = plan(input, [], context(study, { currentBar: 2 }));
    assert.equal(turn.intent, "lesson", input);
    assert.equal(turn.lesson.from, 2, input);
    assert.match(turn.message, /F4/, input);
    assert.ok(turn.actions.every((a) => a.type !== "play"));
  }
  // “Which notes?” is answered with the notes of both hands, not a lesson.
  for (const input of [
    "What notes do I play in this bar?",
    "What do I play in the current bar?",
    "这一小节弹什么音？",
    "這一小節有哪些音符？",
  ]) {
    const turn = plan(input, [], context(study, { currentBar: 2 }));
    assert.equal(turn.intent, "guidance", input);
    assert.equal(turn.lesson, undefined, input);
    assert.match(turn.message, /F4/, input);
    assert.deepEqual(turn.actions.map((a) => [a.type, a.from, a.to]), [["repeat-bars", 2, 2]], input);
  }
  assert.equal(
    plan("教我这一小节", [], context(study, { currentBar: 2 })).lesson.from,
    2,
  );
  for (const input of [
    "What is a bar?",
    "What’s a bar in music?",
    "Explain what a bar is",
    "什么是小节？",
    "小節是什麼？",
  ])
    assert.equal(plan(input), null, input);
});

test("ordinary commands, exact help and search remain the other router's responsibility", () => {
  const history = historyOf(plan("teach me this"));
  for (const input of [
    "find 晴天",
    "repeat bars 1–2",
    "go to bar 3",
    "slower",
    "Explain the numbers",
    "help",
    "Hello",
    "delete this score",
    "tell me a joke",
    "teach me French",
    "teach me how to cook",
    "teach me the language",
    "教我英语",
    "拆解汽车",
  ]) {
    assert.equal(plan(input, history), null, input);
  }
});

test("teaching-hand chip and typed phrases keep the lesson passage before setup is clicked", () => {
  const s = score([note("bar12", 60, 44, 4)], { measures: 20, duration: 80 });
  const ctx = context(s, { currentBar: 1 });
  const first = plan("teach me bar 12", [], ctx);
  const history = historyOf(first);
  for (const phrase of [
    "Teach me the left hand",
    "用左手练",
    "Teach me the right hand",
    "Teach me both hands",
  ]) {
    const turn = plan(phrase, history, ctx);
    assert.equal(turn.lesson.from, 12, phrase);
    assert.equal(turn.lesson.to, 12, phrase);
    assert.equal(turn.actions[0].from, 12, phrase);
  }
  assert.equal(plan("Teach me the left hand", [], ctx).lesson.from, 1);
  assert.equal(plan("Teach me this piece", history, ctx).lesson.from, 1);
});

test("two-bar requests are bounded, meter changes use the correct counting unit", () => {
  const s = score(
    [
      note("a", 60, 0, 3),
      note("b", 62, 3, 0.5),
      note("c", 64, 3.5, 1),
      note("d", 65, 6, 2),
    ],
    {
      duration: 8,
      measureStarts: [0, 3, 6],
      measureLengths: [3, 3, 2],
      measureSignatures: ["3/4", "6/8", "2/4"],
      meter: 3,
    },
  );
  const turn = plan("help me practise these two bars", [], context(s));
  assert.equal(turn.lesson.to, 2);
  assert.match(
    turn.message,
    /Bar 1: This bar has 3 counts; count each quarter note/,
  );
  assert.match(
    turn.message,
    /Bar 2: This bar has 6 counts; count each eighth note/,
  );
  assert.match(turn.message, /D4 \(2\); hold for 1 count/);
  assert.match(turn.message, /E4 \(3\); hold for 2 counts/);
  assert.equal(plan("teach me bars 1–3", [], context(s)).lesson.to, 2);
});

test("range validation rejects fractional, zero, negative, reversed and oversized bar requests", () => {
  for (const input of [
    "teach me bar 0",
    "teach me bar -1",
    "teach me bar 1.5",
    "teach me bars 3–2",
    "teach me bar 99",
  ]) {
    const turn = plan(input);
    assert.deepEqual(turn.actions, [], input);
    assert.equal(turn.lesson, undefined, input);
    assert.match(turn.message, /whole-bar range/, input);
  }
});

test("chords preserve unequal releases, overlapping sustain prevents invented rests", () => {
  const s = score([
    note("long", 60, 0, 4),
    note("short", 64, 0, 1),
    note("later", 67, 2, 1),
    note("unison", 60, 0, 0.5),
  ]);
  const turn = plan("teach me this", [], context(s, { hand: "right" }));
  assert.match(
    turn.message,
    /C4 \(1\) and E4 \(3\) together; hold C4 \(1\) for 4 counts and E4 \(3\) for 1 count/,
  );
  assert.match(turn.message, /On count 3, play G4/);
  assert.doesNotMatch(
    turn.message,
    /Rest for|of rest|major chord|minor chord|thumb|index finger/,
  );
});

test("the parsed pickup and barline tie fixture keeps pickup phase and does not reattack a tie", () => {
  const xml = readFileSync(
    new URL("./fixtures/pickup-two-parts.musicxml", import.meta.url),
    "utf8",
  );
  const s = parseMusicXML(xml, "pickup.musicxml");
  const pickup = plan("teach me this", [], context(s, { hand: "right" }));
  assert.match(pickup.message, /pickup has only 1 count.*entering on count 3/);
  assert.match(pickup.message, /On count 3, play D5 \(5\)/);
  const middle = plan("teach me bar 3", [], context(s, { hand: "right" }));
  assert.match(
    middle.message,
    /Keep holding B4 \(3\) for 1 count more from the previous bar; do not strike it again/,
  );
  assert.doesNotMatch(middle.message, /On count 1, play B4/);
  assert.match(middle.message, /On count 2, play A4 \(2\)/);
  const left = plan("teach me bar 3 left hand", [], context(s));
  assert.match(left.message, /⅓ count/);
  assert.match(left.message, /On count 1⅓/);
});

test("a full rest bar and a carried full bar stay distinct; ties ending exactly at a boundary do not carry", () => {
  const held = score([note("tie", 60, 0, 8)]);
  const second = plan("teach me bar 2", [], context(held, { hand: "right" }));
  assert.match(second.message, /Keep holding C4 \(1\) for 4 counts more/);
  assert.doesNotMatch(second.message, /rests for this whole bar/);
  const third = plan("teach me bar 3", [], context(held, { hand: "right" }));
  assert.match(third.message, /rests for this whole bar/);
  assert.doesNotMatch(third.message, /Keep holding/);
  const across = plan("teach me this", [], context(held, { hand: "right" }));
  assert.match(across.message, /held across the barline/);
});

test("active tonic, flat spelling, solfege and exact octaves are respected", () => {
  const s = score([note("low", 58, 0), note("high", 70, 1), note("e", 63, 2)], {
    tonic: 5,
    keySignature: { fifths: -1, mode: "major" },
  });
  const numbered = plan(
    "teach me this",
    [],
    context(s, { hand: "right", tonic: 10 }),
  );
  assert.match(numbered.message, /1 = B♭/);
  assert.match(numbered.message, /B♭3 \(1\)/);
  assert.match(numbered.message, /B♭4 \(1\)/);
  assert.match(numbered.message, /E♭4 \(4\)/);
  const solfege = plan(
    "teach me this",
    [],
    context(s, { labels: "solfege", tonic: 10 }),
  );
  assert.match(solfege.message, /B♭3 \(Do\)/);
  const letters = plan("teach me this", [], context(s, { labels: "letters" }));
  assert.match(letters.message, /B♭3/);
  assert.doesNotMatch(letters.message, /B♭3 \(|pitch numbers/);
});

test("Chinese teaching, hand, simpler and acknowledgement followups are plain and grounded", () => {
  let turn = plan("请教我这首曲子，帮我分解一下");
  assert.match(turn.message, /先把《Small study》的第1小节拆开/);
  assert.match(turn.message, /右手：第1拍弹C4（1）/);
  let history = historyOf(turn);
  turn = plan("我懂了", history);
  assert.equal(turn.lesson.step, 1);
  assert.match(turn.message, /单独看左手/);
  history = historyOf(turn, history);
  const simpler = plan("简单一点", history);
  assert.equal(simpler.lesson.simple, true);
  assert.match(simpler.message, /一次只看一个动作/);
  assert.equal(plan("第二区", history), null);
  assert.equal(plan("第二小节", history).lesson.from, 2);
  assert.equal(plan("教我第三小节右手").lesson.hand, "right");
  assert.equal(plan("Teach me the left hand").lesson.hand, "left");
  assert.equal(plan("用左手练").lesson.hand, "left");
  assert.equal(plan("用左手练").lesson.language, "zh");
});

// Small immutable copy of actual saved Sunny Day opening notes, read from the
// user's two distinct local arrangements during development on 2026-09-27.
// No test reads or writes Library, imported XML, recordings or practice history.
const sunnyMelody = score(
  [
    note("n0", 52, 0, 0.5, "left"),
    note("n1", 55, 0.5, 1, "left"),
    note("n2", 62, 1, 1),
    note("n3", 55, 1.5, 0.5, "left"),
    note("n4", 48, 2, 0.5, "left"),
    note("n5", 50, 2.5, 0.25, "left"),
    note("n6", 52, 2.75, 0.75, "left"),
    note("n7", 62, 3, 1),
    note("n8", 55, 3.5, 0.5, "left"),
  ],
  {
    id: "sunny-melody-fixture",
    title: "晴天 (Sunny Day)",
    measures: 76,
    duration: 304,
    tonic: 7,
    keySignature: { fifths: 1, mode: "major" },
  },
);
const sunnyConcert = score(
  [
    note("n0", 40, 0, 2, "left"),
    note("n1", 52, 0, 0.5, "left"),
    note("n2", 55, 0.5, 1, "left"),
    note("n3", 71, 1, 1),
    note("n4", 74, 1, 1),
    note("n5", 55, 1.5, 0.5, "left"),
    note("n6", 36, 2, 2, "left"),
    note("n7", 48, 2, 0.5, "left"),
    note("n8", 50, 2.5, 0.25, "left"),
    note("n9", 52, 2.75, 0.75, "left"),
    note("n10", 71, 3, 1),
    note("n11", 74, 3, 1),
  ],
  {
    id: "sunny-concert-fixture",
    title: "晴天 (Sunny Day) · Concert Arrangement",
    measures: 66,
    duration: 264,
    tonic: 7,
    keySignature: { fifths: 1, mode: "major" },
  },
);

test("real Sunny Day copies teach the exact selected arrangement, including opening rest and repeated pitch", () => {
  const melody = plan(
    "Can you teach me this piece and break it down?",
    [],
    context(sunnyMelody),
  );
  assert.match(melody.message, /76 bars/);
  assert.match(melody.message, /1 = G/);
  assert.match(melody.message, /Rest for 1 count from count 1/);
  assert.match(melody.message, /On count 2, play D4 \(5\); hold for 1 count/);
  assert.match(melody.message, /Rest for 1 count from count 3/);
  assert.match(melody.message, /On count 4, play D4 \(5\); hold for 1 count/);
  assert.doesNotMatch(melody.message, /B4|D5/);
  const concert = plan(
    "Can you teach me this piece and break it down?",
    [],
    context(sunnyConcert),
  );
  assert.match(concert.message, /66 bars/);
  assert.match(
    concert.message,
    /On count 2, play B4 \(3\) and D5 \(5\) together/,
  );
  assert.match(
    concert.message,
    /On count 4, play B4 \(3\) and D5 \(5\) together/,
  );
  assert.equal(
    plan("next step", historyOf(melody), context(sunnyConcert)).lesson,
    undefined,
  );
});

test("last passage completion proposes only replay and never silently wraps to the beginning", () => {
  let turn = plan("teach me bar 3"),
    history = historyOf(turn);
  for (let i = 0; i < 2; i++) {
    turn = plan("next step", history);
    history = historyOf(turn, history);
  }
  const final = plan("next step", history);
  assert.match(final.message, /final passage/);
  assert.deepEqual(final.actions, [
    { type: "repeat-bars", from: 3, to: 3, label: "Repeat this passage" },
  ]);
  assert.equal(final.lesson.from, 3);
});

test("malformed timing and unrelated requests do not invent instructions or mutate input", () => {
  assert.deepEqual(planCompanionLesson("hello", {}), null);
  assert.deepEqual(planCompanionLesson("teach me this", {}).actions, []);
  const broken = score([], {
    duration: undefined,
    measureStarts: [],
    measureLengths: [],
    measures: 1,
  });
  assert.match(
    plan("teach me this", [], context(broken)).message,
    /incomplete bar timing/,
  );
  const snapshot = structuredClone(study);
  plan("teach me this");
  assert.deepEqual(study, snapshot);
});

test("dense score guidance is finite and openly states it covers only the first groups", () => {
  const dense = score(
    Array.from({ length: 50_000 }, (_, i) =>
      note(
        `dense-${i}`,
        36 + (i % 24),
        Math.floor(i / 24) / 96,
        0.03125,
        i % 2 ? "left" : "right",
      ),
    ),
  );
  const first = plan("teach me these two bars", [], context(dense));
  assert.ok(first.message.length < 4000);
  assert.match(first.message, /first groups/);
  assert.match(first.message, /other \d+ written keys/);
  assert.deepEqual(first, plan("teach me these two bars", [], context(dense)));
});


test("explicit current-passage variety gets a grounded challenge while general boredom remains chat", () => {
  const turn = plan("How can I make practising these bars less boring?");
  assert.equal(turn.intent, "lesson");
  assert.equal(turn.lesson.from, 1);
  assert.equal(turn.lesson.to, 1);
  assert.match(turn.message, /three times/);
  assert.match(turn.message, /written notes, holds and rests/);
  assert.ok(turn.actions.some((a) => a.type === "repeat-bars" && a.from === 1 && a.to === 1));
  const simpler = plan("What do you mean?", historyOf(turn));
  assert.equal(simpler.intent, "lesson");
  assert.equal(simpler.lesson.simple, true);
  assert.equal(simpler.lesson.from, turn.lesson.from);
  assert.match(simpler.message, /C4/);
  assert.equal(plan("What do you mean?"), null, "general chat clarification still belongs to the model");
  const chinese = plan("这段练起来好无聊，怎么办？");
  assert.match(chinese.message, /慢练三遍/);
  assert.equal(chinese.lesson.language, "zh");
  for (const input of ["How can I make practice less boring?", "Why is practicing piano boring?", "练琴好无聊，怎么办？"])
    assert.equal(plan(input), null, input);
});

test("general music technique, broader plans and nonmusic questions are never the open-score lesson", () => {
  const history = historyOf(plan("teach me this bar"));
  for (const input of [
    "How do I play jazz?", "How should I practice scales?", "How do I play chess?",
    "Teach me piano", "Teach me this cooking technique", "How can I practise with a metronome?",
    "Should I practise this bar faster?", "Why does playing this passage feel awkward?",
    "I have twenty minutes to practise, please make a weekly plan.",
    "我想知道怎么练爵士。", "教我怎么弹吉他", "我每天只有五分钟练琴，安排一周计划。",
  ]) for (const previous of [[], history]) assert.equal(plan(input, previous), null, input);
  for (const input of ["next step", "I got it", "simpler", "I don't understand", "break it down", "下一步", "简单一点"])
    assert.equal(plan(input), null, input);
  for (const input of ["How do I play this passage?", "teach me these two bars", "请教我这首曲子，帮我分解一下", "教我第2小节"])
    assert.equal(plan(input).intent, "lesson", input);
});

test("time-limited piano practice and a short clarification use the actual written hand", () => {
  const melodyOnly = score([note("r1", 60, 0), note("r2", 67, 1)]);
  const ctx = context(melodyOnly);
  const turn = plan("Hi! I only have five minutes to practise today.", [], ctx);
  assert.equal(turn.intent, "lesson");
  assert.equal(turn.lesson.from, 1);
  assert.equal(turn.lesson.to, 1);
  assert.equal(turn.lesson.simple, true);
  assert.match(turn.message, /first written action in bar 1/);
  assert.match(turn.message, /Right hand: On count 1, play C4 \(1\); hold for 1 count/);
  assert.doesNotMatch(turn.message, /left hand|both hands|G4/i);
  assert.deepEqual(turn.actions.map((a) => a.type), ["repeat-bars", "set-hand"]);
  assert.equal(turn.actions[1].hand, "right");
  const simpler = plan("Can you say that more simply, with just one suggestion?", historyOf(turn), ctx);
  assert.equal(simpler.intent, "lesson");
  assert.match(simpler.message, /Just focus on the first written action in bar 1/);
  assert.match(simpler.message, /C4/);
  assert.doesNotMatch(simpler.message, /left hand|both hands|G4/i);
  assert.equal(plan("Can you say that more simply, with just one suggestion?", [], ctx), null, "unrelated general-chat clarification still uses the model");
  const chinese = plan("今天只有五分钟练琴。", [], { ...ctx, language: "zh" });
  assert.match(chinese.message, /第1小节.*右手.*C4/s);
  assert.doesNotMatch(chinese.message, /左手|双手/);
  const current = plan("I have 10 minutes to practise two bars", [], context(study, { currentBar: 3 }));
  assert.equal(current.lesson.from, 3);
  assert.equal(current.lesson.to, 3);
  assert.match(current.message, /G4/);
});

test("short sessions preserve rests, held notes, explicit filters and unrelated conversation", () => {
  const rests = score([note("later", 67, 2)]);
  const rest = plan("I have five minutes to practise", [], context(rests));
  assert.match(rest.message, /Rest for 2 counts from count 1/);
  assert.doesNotMatch(rest.message, /play G4/);
  const carried = score([note("held", 48, 0, 8, "left")]);
  const carry = plan("I have five minutes to practise", [], context(carried, { currentBar: 2 }));
  assert.match(carry.message, /Keep holding C3.*do not strike it again/);
  assert.equal(carry.actions.find((a) => a.type === "set-hand").hand, "left");
  const silentFilter = plan("I only have five minutes to practise", [], context(rests, { hand: "left" }));
  assert.match(silentFilter.message, /left hand rests for this whole bar/);
  assert.ok(silentFilter.actions.every((a) => a.type !== "set-hand"), "an explicit hand filter is not changed behind the request");
  for (const message of ["I have five minutes before dinner", "I am tired today", "How do I relax before practising?", "I practiced for ten minutes yesterday"]) assert.equal(plan(message), null, message);
});


test("“this little passage”, “this phrase”, “my loop” and 这一小段 name the passage in front of the learner", () => {
  for (const input of [
    "教我这一小段", "教我这一段", "教我这小段", "教我这个乐句", "教我这个片段", "教我这部分", "教我这里",
    "teach me this little passage", "teach me this phrase", "teach me my loop", "teach me this tricky bit",
    "walk me through this passage", "show me how to play this part", "explain this bar",
  ]) {
    const turn = plan(input, [], context(study, { currentBar: 2 }));
    assert.equal(turn?.intent, "lesson", input);
    assert.equal(turn.lesson.from, 2, input);
  }
  for (const input of ["这段好难啊", "这一小段好难", "I love this phrase", "Why does this part feel awkward?", "teach me the phrase 'arrive, then breathe'"])
    assert.equal(plan(input, [], context(study, { currentBar: 2 })), null, input);
});

test("a new lesson starts at the loop or the saved place of a reopened piece, and says so", () => {
  const long = score(
    Array.from({ length: 20 }, (_, i) => note(`n${i}`, 60 + (i % 7), i * 4)),
    { measures: 20, duration: 80, measureStarts: Array.from({ length: 20 }, (_, i) => i * 4), measureLengths: Array(20).fill(4), measureSignatures: Array(20).fill("4/4") },
  );
  const ctx = (extra) => context(long, extra);
  assert.deepEqual(lessonAnchor("teach me this passage", ctx({ currentBar: 1, resumeBar: 12 })), { bar: 12, source: "saved" });
  assert.deepEqual(lessonAnchor("teach me this passage", ctx({ currentBar: 5, resumeBar: 12 })), { bar: 5, source: "playhead" });
  assert.deepEqual(lessonAnchor("teach me this passage", ctx({ currentBar: 9, loop: { from: 8, to: 11 } })), { bar: 8, source: "loop", loop: { from: 8, to: 11 } });
  assert.deepEqual(lessonAnchor("teach me this bar", ctx({ currentBar: 9, loop: { from: 8, to: 11 } })), { bar: 9, source: "playhead" });
  assert.deepEqual(lessonAnchor("teach me this bar", ctx({ currentBar: 1, loop: { from: 8, to: 11 } })), { bar: 8, source: "loop", loop: { from: 8, to: 11 } });
  assert.equal(lessonAnchor("teach me this", ctx({ currentBar: 1, resumeBar: 40 })).source, "playhead", "a saved bar outside the score is ignored");
  assert.equal(lessonAnchor("teach me this", ctx({ currentBar: 3, loop: { from: 9, to: 4 } })).source, "playhead", "an invalid loop is ignored");
  const saved = plan("教我这一小段", [], ctx({ currentBar: 1, resumeBar: 12, language: "zh" }));
  assert.deepEqual([saved.lesson.from, saved.lesson.to], [12, 12]);
  assert.match(saved.message, /^你上次练到第12小节。先把《Small study》的第12小节拆开。/);
  assert.ok(saved.actions.some((a) => a.type === "repeat-bars" && a.from === 12 && a.to === 12));
  const looped = plan("teach me this phrase", [], ctx({ currentBar: 8, loop: { from: 8, to: 11 } }));
  assert.match(looped.message, /^Your repeat is bars 8–11\. Let’s start with bar 8 of “Small study”\./);
  const named = plan("教我第3小节", [], ctx({ currentBar: 1, resumeBar: 12, language: "zh" }));
  assert.equal(named.lesson.from, 3, "a named bar always wins");
  assert.doesNotMatch(named.message, /上次练到/);
  const next = plan("下一小节是什么？", [], ctx({ currentBar: 1, resumeBar: 12, language: "zh" }));
  assert.equal(next.lesson.from, 2, "“next bar” without a lesson stays literal");
  const continued = plan("Next step", historyOf(looped), ctx({ currentBar: 8, loop: { from: 8, to: 11 } }));
  assert.equal(continued.lesson.from, 8);
  assert.doesNotMatch(continued.message, /Your repeat is/, "later steps do not repeat the reason");
});

test("triplets inside a half-note count read as fractions, not decimals", () => {
  const cut = score(
    [note("g3", 55, 0, 1 / 3), note("c4", 60, 1 / 3, 1 / 3), note("e4", 64, 2 / 3, 1 / 3), note("g4", 67, 0, 3)],
    { measures: 1, duration: 4, measureStarts: [0], measureLengths: [4], measureSignatures: ["2/2"] },
  );
  const turn = plan("teach me this bar", [], context(cut));
  assert.match(turn.message, /hold G3 \(5\) for ⅙ count and G4 \(5\) for 1½ counts/);
  assert.match(turn.message, /On count 1⅙, play C4 \(1\); hold for ⅙ count/);
  assert.doesNotMatch(turn.message, /0\.167|1\.167/);
});
