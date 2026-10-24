import test from "node:test";
import assert from "node:assert/strict";
import { planCompanionTurn } from "../src/companion-conversation.mjs";
import { shouldUseCompanionModel } from "../src/companion-prompt.mjs";
import { languageRequest } from "../src/companion-language.mjs";

// Round 3: the planner reads requests by their parts (a frame, a value, a
// place), not by whole memorised sentences. Each test uses phrasings that no
// earlier round was tuned on. Same small library as companion-routing.
const bar = (n, length = 2) => (n - 1) * length;
const sonata = {
  id: "appassionata",
  title: "Appassionata · III. Allegro ma non troppo — Presto",
  composer: "Beethoven · Piano Sonata No. 23 in F minor, Op. 57",
  measures: 200, meter: 2, duration: 400, bpm: 144, tonic: 5,
  keySignature: { fifths: -4, mode: "minor" },
  measureStarts: Array.from({ length: 200 }, (_, i) => i * 2),
  measureLengths: Array(200).fill(2),
  measureSignatures: Array(200).fill("2/4"),
  notes: [
    ...[72, 67, 68, 70].map((midi, i) => ({ id: `r${i}`, midi, beat: bar(153) + i * 0.5, duration: 0.5, hand: "right" })),
    { id: "l1", midi: 48, beat: bar(153), duration: 2, hand: "left" },
    // A dense Presto: about 12 notes a second, “demanding” like the real one.
    ...Array.from({ length: 2000 }, (_, i) => ({ id: `f${i}`, midi: 60 + (i % 12), beat: i * 0.2, duration: 0.2, hand: "right" })),
  ],
};
const sunny = (id, title, measures) => ({ id, title, composer: "周杰伦 Jay Chou", measures, meter: 4, duration: measures * 4, bpm: 66, notes: Array.from({ length: measures * 4 }, (_, i) => ({ id: `n${i}`, midi: 67, beat: i, duration: 1, hand: "right" })) });
const satie = { id: "gymnopedie", title: "Gymnopédie No. 1", composer: "Erik Satie", measures: 78, meter: 3, duration: 234, bpm: 60, notes: Array.from({ length: 60 }, (_, i) => ({ id: `g${i}`, midi: 66, beat: i * 3, duration: 3, hand: "right" })) };
const moonlight = { id: "moonlight", title: "Moonlight Sonata · I. Adagio sostenuto", composer: "Ludwig van Beethoven", measures: 69, meter: 4, duration: 276, bpm: 54, notes: Array.from({ length: 400 }, (_, i) => ({ id: `m${i}`, midi: 56, beat: i * (2 / 3), duration: 1 / 3, hand: "right" })) };
const starter = { id: "starter", title: "Start here · C major melody", composer: "Luma Keys", measures: 4, meter: 4, duration: 16, bpm: 80, notes: [{ id: "s", midi: 60, beat: 0, duration: 1, hand: "right" }] };
const prelude = { id: "prelude", title: "Prelude in C major · BWV 846", composer: "Johann Sebastian Bach", measures: 35, meter: 4, duration: 140, bpm: 60, notes: Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, midi: 60, beat: i * 0.25, duration: 0.25, hand: "right" })) };
const lesson = { id: "lesson-1", title: "Für Elise · opening", composer: "Beethoven", measures: 8, source: "Lesson", notes: [] };
const pieces = [sonata, sunny("sunny", "晴天 (Sunny Day)", 76), sunny("sunny-chord", "晴天 (Sunny Day) · Chord Arrangement", 76), satie, moonlight, starter, prelude, lesson];
const journal = {
  pieces: {
    appassionata: { sessions: 61, minutes: 41, bar: 153, ranges: [[1, 153]], last: "2026-09-27T21:47:08Z" },
    sunny: { sessions: 37, minutes: 22, bar: 6, ranges: [[1, 6]], last: "2026-09-30T18:26:55Z" },
    gymnopedie: { sessions: 1, minutes: 1, bar: 9, ranges: [[1, 9]], last: "2026-09-28T01:57:12Z" },
    moonlight: { sessions: 1, minutes: 1, bar: 2, ranges: [[1, 2]], last: "2026-09-28T01:57:28Z" },
    starter: { sessions: 2, minutes: 1, bar: 4, ranges: [[1, 4]], last: "2026-09-27T02:00:47Z" },
  },
};
const zh = [
  { id: "u-zh", role: "user", message: "请用中文回答", scoreId: null, languagePreference: "zh" },
  { id: "a-zh", role: "assistant", source: "local", intent: "clarify", actions: [], message: "可以，我会用简体中文回复。", scoreId: null, languagePreference: "zh" },
];
const ctx = (extra = {}) => ({ pieces, journal, currentScore: sonata, currentBar: 153, speed: 1, hand: "both", mode: "listen", companionId: "beethoven", labels: "numbers", ...extra });
const turn = (text, extra = {}, history = /\p{Script=Han}/u.test(text) ? zh : []) => planCompanionTurn(text, ctx(extra), history);
const actions = (plan) => plan.actions.map((a) => [a.type, a.speed ?? a.bar ?? a.hand ?? a.pieceId ?? a.view]);

test("speed: a named value inside a frame (“play it at half speed”, “cut the speed in half”, 速度减半) is a speed command", () => {
  for (const [text, speed, extra] of [
    ["play it at half speed", 0.5], ["can we try it at half tempo?", 0.5], ["cut the speed in half please", 0.5], ["let's do this at half the speed", 0.5],
    ["slow it down to half", 0.5], ["take it down to 60 percent", 0.6], ["drop to 50%", 0.5], ["three-quarter speed", 0.75], ["a quarter speed", 0.25],
    ["ok let's go back to full speed", 1, { speed: 0.6 }], ["normal tempo please", 1, { speed: 0.6 }],
    ["速度减半", 0.5], ["用一半的速度弹", 0.5], ["慢一半", 0.5], ["速度慢一半吧", 0.5], ["放慢到一半", 0.5], ["半速练习", 0.5],
    ["恢复原速", 1, { speed: 0.5 }], ["用原来的速度弹", 1, { speed: 0.5 }],
  ]) {
    const plan = turn(text, extra);
    assert.equal(plan.intent, "command", text);
    assert.deepEqual(actions(plan), [["set-speed", speed]], text);
  }
  // Out of range: a clear limit, never a silent 100%.
  const double = turn("play it at double speed");
  assert.deepEqual(double.actions, []);
  assert.match(double.message, /25% to 125%/);
  // Questions and remarks about a speed change nothing and reach the conversation.
  for (const text of ["should I play it at half speed?", "is half speed too slow for this?", "I can only play it at 60% right now", "half the notes are wrong", "一半的速度会不会太慢？"])
    assert.ok(shouldUseCompanionModel(turn(text)), text);
  // Signs and decimals are still refused, not read as their digits.
  for (const text of ["speed -50%", "speed 0.75"]) assert.deepEqual(turn(text).actions, [], text);
});

test("position: the beginning or the end of the piece, in a sentence, in English and Chinese", () => {
  for (const text of ["take me back to the beginning", "let's take it from the top", "start over from the beginning", "go back to the very beginning",
    "take me back to the start of the piece", "back to bar one", "restart", "start again", "play it from the beginning",
    "从头开始弹", "回到开头吧", "那就从头再来", "重新开始", "回到第一小节"])
    assert.deepEqual(actions(turn(text, { currentBar: 40 })), [["seek-bar", 1]], text);
  for (const text of ["jump to the last bar", "go to the end", "跳到最后一小节"])
    assert.deepEqual(actions(turn(text, { currentBar: 40 })), [["seek-bar", 200]], text);
  assert.match(turn("回到开头吧", { currentBar: 40 }).message, /第1小节/);
  for (const text of ["the beginning is the hardest part", "开头那几个小节好难"]) assert.ok(shouldUseCompanionModel(turn(text, { currentBar: 40 })), text);
  // “bar -1” is an invalid bar number, not “bar 1”.
  assert.deepEqual(turn("bar -1").actions, []);
});

test("resume: time phrases and pronoun clauses are not titles (“what bar was I on last time I played this?”)", () => {
  for (const [text, extra, piece, saved] of [
    ["what bar was I on last time I played this?", { currentBar: 1 }, "appassionata", 153],
    ["which bar did I get to the last time I practised this one?", { currentBar: 1 }, "appassionata", 153],
    ["where was I last time in this one?", { currentScore: moonlight, currentBar: 1 }, "moonlight", 2],
    ["where did I stop in this song yesterday?", { currentScore: pieces[1], currentBar: 1 }, "sunny", 6],
    ["how far did I get with it last time?", { currentScore: satie, currentBar: 1 }, "gymnopedie", 9],
    ["where were we before?", { currentBar: 1 }, "appassionata", 153],
    ["what measure did I stop at in Gymnopédie?", { currentBar: 1 }, "gymnopedie", 9],
    ["我昨天弹到第几小节来着？", { currentScore: moonlight, currentBar: 1 }, "moonlight", 2],
  ]) {
    const plan = turn(text, extra);
    assert.equal(plan.intent, "resume", text);
    assert.deepEqual(plan.actions.map((a) => [a.type, a.pieceId, a.bar]), [["open-piece", piece, saved]], text);
    assert.doesNotMatch(plan.message, /No saved piece matches|Import|导入|PDF/, text);
  }
  // A clause pointing at the open piece keeps it, even without any practice.
  const bach = turn("where did I stop when I last played it?", { currentScore: prelude, currentBar: 1 });
  assert.match(bach.message, /No saved practice position for “Prelude in C major · BWV 846”/);
  // A real missing title still says so, then offers the latest saved place.
  assert.match(turn("where did I leave off in Clair de Lune?", { currentBar: 1 }).message, /^No saved piece matches “Clair de Lune”\. Your latest saved place is/);
  // “What bar am I on?” is the playhead on screen, not the saved place.
  assert.ok(shouldUseCompanionModel(turn("what bar am I on?", { currentBar: 20 })));
});

test("search: a title typed on its own is a search; a sentence that mentions a title is conversation", () => {
  for (const text of ["晴天", "the moonlight sonata please", "热情奏鸣曲", "我想弹晴天", "练月光奏鸣曲"])
    assert.equal(turn(text).intent, "search", text);
  for (const text of [
    "这周特别忙，周一到周五每天只有二十分钟。热情奏鸣曲第三乐章我在153小节附近，左手跟不上。帮我安排一下这周的练习吧",
    "晴天这首歌我从初中就开始喜欢了，每次弹到副歌都好开心", "晴天真好听", "Gymnopédie is so calm",
    "My sister says the Moonlight Sonata is too sad for a Sunday morning. Do you agree?",
  ]) {
    const plan = turn(text);
    assert.ok(shouldUseCompanionModel(plan), text);
    assert.deepEqual(plan.actions, [], text);
  }
});

test("library: what comes after this piece never suggests this piece, and a what-question gets a pick, not “sure”", () => {
  for (const [text, extra] of [
    ["once I've got this one down, what should I learn next?", { currentScore: pieces[1], currentBar: 6 }],
    ["what should I practise after this?", { currentScore: satie, currentBar: 9 }],
    ["any other piece you'd recommend besides this one?", { currentScore: satie, currentBar: 9 }],
    ["除了这首，还有什么可以练的？", { currentScore: satie, currentBar: 9 }],
    ["练完这首之后我还可以练什么？", { currentScore: satie, currentBar: 9, companionId: "cat" }],
    ["下一首练什么好？", { currentScore: satie, currentBar: 9 }],
  ]) {
    const plan = turn(text, extra);
    assert.equal(plan.intent, "search", text);
    assert.ok(plan.actions.length >= 2, text);
    assert.ok(plan.actions.every((a) => a.type === "open-piece" && a.pieceId !== extra.currentScore.id && a.pieceId !== "lesson-1"), text);
    if (extra.currentScore.id === "sunny") assert.ok(!plan.actions.some((a) => a.pieceId === "sunny-chord"), "another edition of the same song is not “something else”");
  }
  const cat = turn("练完这首之后我还可以练什么？", { currentScore: satie, currentBar: 9, companionId: "cat" });
  assert.match(cat.message, /^嗯……我看看。除了这首，你曲库里还可以练：/);
  assert.doesNotMatch(cat.message, /可以呀/);
  assert.match(turn("Shall we play some pieces?", { companionId: "cat" }).message, /^Mm, fine by me\. From your library:/, "a yes/no invitation still gets a yes");
  // Learning something new: new pieces first, nearest in difficulty, a finished piece last.
  const next = turn("what should I learn next?", { currentScore: pieces[1], currentBar: 6 });
  assert.equal(next.actions[0].pieceId, "prelude");
  assert.ok(!next.actions.slice(0, 2).some((a) => a.pieceId === "starter"), "a piece played to its end is not the next thing to learn");
  assert.ok(!turn("我想弹点简单的").actions.slice(0, 2).some((a) => a.pieceId === "starter"));
  // Listing the library opens neutrally.
  assert.match(turn("what pieces do I have?").message, /^Here\. You have 7 pieces in your library/);
});

test("library: a composer the learner doesn't have gets the nearest pieces they do have, then the import", () => {
  for (const text of ["Is there any Chopin in my library? If not, what's closest?", "something by Chopin please", "有没有肖邦的曲子？没有的话推荐个风格接近的"]) {
    const plan = turn(text);
    assert.equal(plan.intent, "search", text);
    assert.deepEqual(plan.actions.map((a) => a.pieceId || a.type), ["moonlight", "gymnopedie", "import-score"], text);
    assert.match(plan.message, /^There's no Chopin in your library yet\. Closest in style: “Moonlight Sonata · I\. Adagio sostenuto” \(Beethoven\) and “Gymnopédie No\. 1” \(Satie\)\.|^曲库里还没有肖邦的曲子。风格最接近的是《Moonlight Sonata · I\. Adagio sostenuto》（贝多芬）和《Gymnopédie No\. 1》（萨蒂）/, text);
  }
  // A virtuoso's nearest is the demanding piece; an impressionist's is Satie first.
  assert.deepEqual(turn("Do I have anything by Liszt?").actions.map((a) => a.pieceId || a.type).slice(0, 2), ["appassionata", "gymnopedie"]);
  assert.equal(turn("do I have any Debussy? otherwise something similar would be nice").actions[0].pieceId, "gymnopedie");
  // A question about the person stays conversation.
  for (const text of ["who was Chopin?", "what's Chopin's style like?"]) assert.ok(shouldUseCompanionModel(turn(text)), text);
});

test("language: polite and indirect switch requests are switches; statements about a language are not", () => {
  for (const [text, language] of [["跟我说中文好吗", "zh"], ["中文可以吗", "zh"], ["speak chinese with me", "zh"], ["以后用中文跟我聊吧", "zh"],
    ["我想用中文聊天", "zh"], ["I would like you to speak Chinese", "zh"], ["speak english with me", "en"], ["说英文", "en"]])
    assert.equal(languageRequest(text), language, text);
  for (const text of ["我想学中文", "I am learning Chinese", "我中文不好", "中文歌", "这首是中文歌吗", "不要用中文"])
    assert.equal(languageRequest(text), null, text);
  const plan = turn("跟我说中文好吗", {}, []);
  assert.equal(plan.intent, "clarify");
  assert.equal(plan.message, "可以，我会用简体中文回复。");
});

test("lessons: “that bar”, “those bars”, 那一小节 and a leading “ok,” or “好，” name the passage on screen", () => {
  for (const [text, extra, from] of [
    ["ok, teach me that bar", { currentBar: 29 }, 29],
    ["teach me those bars", { currentBar: 150, loop: { from: 150, to: 152 } }, 150],
    ["教我那一小节", { currentBar: 150 }, 150],
    ["好，教我这一段", { currentBar: 150 }, 150],
    ["could you walk me through this phrase?", { currentBar: 29 }, 29],
  ]) {
    const plan = turn(text, extra);
    assert.equal(plan.intent, "lesson", text);
    assert.equal(plan.lesson.from, from, text);
  }
});

test("a lesson counts a half-count rest as “½ count”, not “½ counts”", () => {
  const offbeat = { id: "offbeat", title: "Offbeat", composer: "X", measures: 1, meter: 4, duration: 4, bpm: 80, tonic: 0,
    keySignature: { fifths: 0, mode: "major" }, measureStarts: [0], measureLengths: [4], measureSignatures: ["4/4"],
    notes: [{ id: "a", midi: 70, beat: 0.5, duration: 3.5, hand: "right" }] };
  const plan = planCompanionTurn("teach me this bar", { pieces: [offbeat], journal: { pieces: {} }, currentScore: offbeat, currentBar: 1, speed: 1, hand: "right", mode: "listen" }, []);
  assert.match(plan.message, /Rest for ½ count from count 1\./);
});

test("hands and modes inside a sentence: “let me do the left hand by itself”, “switch to wait for me mode”, 听一下示范", () => {
  for (const [text, hand] of [["let me do the left hand by itself", "left"], ["only the right hand now", "right"], ["只要右手", "right"], ["both hands together now", "both"], ["play together", "both"]])
    assert.deepEqual(actions(turn(text)), [["set-hand", hand]], text);
  assert.ok(!turn("together").actions.length, "a bare “together” is not a hand switch");
  for (const [text, mode] of [["switch to wait for me mode", "wait"], ["turn on listen and follow", "listen"], ["听一下示范", "listen"], ["等我弹对再走", "wait"], ["切换到等我模式", "wait"]])
    assert.deepEqual(turn(text, { mode: mode === "wait" ? "listen" : "wait" }).actions.map((a) => [a.type, a.mode]), [["set-mode", mode]], text);
});

test("moves and loops relative to the playhead, and speed changes by an amount", () => {
  for (const [text, target] of [["go back two bars", 151], ["skip ahead 4 measures", 157], ["go to the next bar", 154], ["跳到下一小节", 154], ["跳到上一小节", 152], ["后退两小节", 151], ["往下三小节", 156]])
    assert.deepEqual(actions(turn(text)), [["seek-bar", target]], text);
  assert.deepEqual(turn("把这两小节循环一下").actions.map((a) => [a.from, a.to]), [[153, 154]]);
  assert.deepEqual(turn("repeat from bar 10 to 14").actions.map((a) => [a.from, a.to]), [[10, 14]]);
  for (const [text, speed] of [["slow down by 10%", 0.7], ["10% faster", 0.9], ["慢10%", 0.7], ["加快百分之十", 0.9]])
    assert.deepEqual(actions(turn(text, { speed: 0.8 })), [["set-speed", speed]], text);
  assert.deepEqual(turn("slow down by 7%", { speed: 0.8 }).actions, [], "off the 5% grid: refused");
  assert.match(turn("去练习页面").message, /打开/);
  assert.deepEqual(turn("去练习页面").actions.map((a) => a.view), ["exercises"]);
  // “Next bar please” is the next bar's reading lesson, as without “please”.
  assert.equal(turn("next bar please").lesson.from, 154);
});

test("more resume and library phrasings: “where'd we leave it?”, 上次的进度, harder, calmer, pop, “besides this one”", () => {
  for (const text of ["where'd we leave it?", "can you remind me which bar I was on?", "继续上次的进度"]) {
    const plan = turn(text, { currentBar: 1 });
    assert.equal(plan.intent, "resume", text);
    assert.deepEqual(plan.actions.map((a) => [a.pieceId, a.bar]), [["appassionata", 153]], text);
  }
  const harder = turn("something more challenging please", { currentScore: satie, currentBar: 9 });
  assert.match(harder.message, /The most demanding pieces in your library: “Appassionata/);
  const calm = turn("recommend something calm");
  assert.match(calm.message, /The calmest pieces in your library: “Gymnopédie No\. 1”/);
  assert.deepEqual(turn("any Beethoven besides this one?").actions.map((a) => a.pieceId), ["moonlight"]);
  const pop = turn("有没有流行歌");
  assert.match(pop.message, /你曲库里的流行歌有：《晴天 \(Sunny Day\)》/);
  assert.equal(pop.actions.filter((a) => a.pieceId?.startsWith("sunny")).length, 1, "one edition per song");
  for (const text of ["I love pop music", "who is Jay Chou?"]) assert.ok(shouldUseCompanionModel(turn(text)), text);
});

test("resume: an earlier sentence is not a title (“这首一共多少小节？我现在弹到哪了？”); a title alone before the question still is", () => {
  for (const text of ["这首一共多少小节？我现在弹到哪了？", "这首有多少小节，我弹到哪了", "这首好难。我上次练到哪了？", "今天好累啊，我上次练到哪儿了"]) {
    const plan = turn(text, { currentBar: 1 });
    assert.equal(plan.intent, "resume", text);
    assert.deepEqual(plan.actions.map((a) => [a.type, a.pieceId, a.bar]), [["open-piece", "appassionata", 153]], text);
    assert.doesNotMatch(plan.message, /没有匹配|No saved piece matches|导入|Import/, text);
  }
  // “晴天，我上次练到哪了？”: the title before the comma names the piece (two editions here).
  const sunnyPlan = turn("晴天，我上次练到哪了？", { currentBar: 1 });
  assert.equal(sunnyPlan.intent, "resume");
  assert.deepEqual(sunnyPlan.actions.map((a) => a.pieceId).sort(), ["sunny", "sunny-chord"]);
});
