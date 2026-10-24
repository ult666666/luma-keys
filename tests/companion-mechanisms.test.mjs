// Round 4: the general mechanisms behind the companion's local routing and
// prompt facts, each tested on many phrasings (English and Chinese, slang,
// typos), not on one evaluator sentence.
import test from "node:test";
import assert from "node:assert/strict";
import { planCompanionTurn, appendCompanionExchange, followUpTarget } from "../src/companion-conversation.mjs";
import { shouldUseCompanionModel, makeCompanionContext, buildCompanionPrompt, classifyCompanionMessage, glossaryFor, keySpeller, describeWrittenNotes } from "../src/companion-prompt.mjs";
import { planMaestroCommand, stripRequestFrame, normalizeRequestText, resolveMaestroPiece, mentionedMaestroPieces, searchMaestroPieces } from "../src/maestro.mjs";
import { languageRequest, conversationLanguagePreference, correctLanguageNames } from "../src/companion-language.mjs";
import { withoutActionClaims, withoutInventedTuplets, withRightComposers, withoutClaims } from "../src/companion-local-runtime.mjs";

// A library shaped like a learner's: a long sonata movement, one song in
// three editions, a pop song, a Satie piece, the Moonlight, an unplayed Bach
// prelude, a tiny starter piece and a built-in lesson.
const notesAt = (bar, length, list) => list.map(([midi, offset, duration, hand], i) => ({ id: `${bar}-${i}`, midi, beat: (bar - 1) * length + offset, duration, hand }));
const piece = (id, title, composer, measures, extra = {}) => ({ id, title, composer, measures, meter: 4, duration: measures * 4, bpm: 80, notes: [{ id: `${id}-n`, midi: 60, beat: 0, duration: 1, hand: "right" }], source: "MusicXML", ...extra });
const sonata = piece("appassionata", "Appassionata · III. Allegro ma non troppo — Presto", "Beethoven · Piano Sonata No. 23 in F minor, Op. 57", 569, { keySignature: { fifths: -4, mode: "minor" }, bpm: 144, notes: Array.from({ length: 14000 }, (_, i) => ({ id: `a${i}`, midi: 60 + (i % 12), beat: i * 0.16, duration: 0.25, hand: i % 2 ? "left" : "right" })) });
const sunny = piece("sunny", "晴天 (Sunny Day)", "周杰伦 Jay Chou", 76, { keySignature: { fifths: 1, mode: "major" } });
const chord = piece("sunny-chord", "晴天 (Sunny Day) · Chord Arrangement", "周杰伦 Jay Chou · chord arrangement for Luma Keys", 76);
const concert = piece("sunny-concert", "晴天 (Sunny Day) · Concert Arrangement", "周杰伦 Jay Chou · concert arrangement for Luma Keys", 66);
const tornado = piece("tornado", "龙卷风 · 邓紫棋版", "周杰伦 Jay Chou", 71, { keySignature: { fifths: 2, mode: "major" } });
const satie = piece("gymnopedie", "Gymnopédie No. 1", "Erik Satie", 78, { meter: 3, duration: 234, bpm: 60 });
const moonlight = piece("moonlight", "Moonlight Sonata · I. Adagio sostenuto", "Ludwig van Beethoven", 69, { keySignature: { fifths: 4, mode: "minor" }, bpm: 54, notes: Array.from({ length: 600 }, (_, i) => ({ id: `m${i}`, midi: 56 + (i % 3) * 4, beat: i / 3, duration: 1 / 3, hand: "right" })) });
const bach = piece("bach", "Prelude in C major · BWV 846", "Johann Sebastian Bach", 35, { keySignature: { fifths: 0, mode: "major" }, notes: Array.from({ length: 560 }, (_, i) => ({ id: `b${i}`, midi: 60 + (i % 8), beat: i * 0.25, duration: 0.25, hand: "right" })) });
const starter = piece("starter", "Start here · C major melody", "Luma Keys · your first 16 notes", 4);
const lesson = { id: "lesson-twinkle", title: "Twinkle, Little Star", composer: "Traditional", measures: 12, source: "Lesson", notes: [] };
const pieces = [sonata, sunny, chord, concert, tornado, satie, moonlight, bach, starter, lesson];
const at = (iso) => `2026-09-${iso}T12:00:00Z`;
const journal = { pieces: {
  appassionata: { sessions: 61, minutes: 41, bar: 536, ranges: [[1, 536]], last: at("27") },
  sunny: { sessions: 37, minutes: 22, bar: 6, ranges: [[1, 6]], last: at("20") },
  "sunny-chord": { sessions: 13, minutes: 6, bar: 67, ranges: [[1, 67]], last: at("18") },
  "sunny-concert": { sessions: 2, minutes: 3, bar: 64, ranges: [[1, 64]], last: at("17") },
  tornado: { sessions: 109, minutes: 24, bar: 48, ranges: [[1, 48]], last: at("29") },
  gymnopedie: { sessions: 1, minutes: 1, bar: 9, ranges: [[1, 9]], last: at("15") },
  moonlight: { sessions: 1, minutes: 1, bar: 2, ranges: [[1, 2]], last: at("14") },
  starter: { sessions: 3, minutes: 1, bar: 4, ranges: [[1, 4]], last: at("10") },
} };
const ctx = (open, extra = {}) => ({ pieces, journal, currentScore: open, currentBar: 1, speed: 0.75, hand: "both", mode: "listen", companionId: "mozart", labels: "numbers", ...extra });
const zhSeed = (open) => appendCompanionExchange([], "请用中文回答", planCompanionTurn("请用中文回答", ctx(open), []));
const turn = (text, open = sonata, extra = {}, history = []) => planCompanionTurn(text, ctx(open, extra), history);
const acts = (plan) => plan.actions.map((a) => a.type === "repeat-bars" ? [a.type, a.from, a.to] : a.type === "open-piece" ? [a.type, a.pieceId, a.bar] : [a.type, a.bar ?? a.hand ?? a.speed ?? a.mode]);

test("greetings, fillers, forms of address and courtesies around a request are not part of it", () => {
  for (const [text, core] of [
    ["yo where'd i stop", "where'd i stop"], ["hey Mozart, slower", "slower"], ["ok so loop 4 to 8 for me", "loop 4 to 8"],
    ["lol left hand pls", "left hand"], ["umm can you open the bach then", "open the bach"], ["老师，慢一点吧", "慢一点"],
    ["嗯那个，循环第5到8小节", "循环第5到8小节"], ["贝多芬老师慢一点", "慢一点"], ["wait for me", "wait for me"], ["k", "k"],
  ]) assert.equal(stripRequestFrame(normalizeRequestText(text)), core, text);
  // Everyday spellings even out; a movement number “iii” stays.
  assert.equal(normalizeRequestText("slow it waaay down, lemme try lefty pls"), "slow it way down, let me try left hand please");
  assert.equal(normalizeRequestText("movement iii"), "movement iii");
  assert.equal(normalizeRequestText("循环45到48小结"), "循环45到48小节");
  assert.equal(normalizeRequestText("做个小结"), "做个小结", "a summary is not a bar");
  assert.equal(normalizeRequestText("这个小结再来一遍"), "这个小节再来一遍");
});

test("resume: words that name no piece mean the open piece, never a false “no match” or an import", () => {
  const cases = [
    ["烦死了，又忘了上次弹到哪了", chord, 67], ["我又不记得这首弹到哪儿了", tornado, 48], ["remind me where I got to in this arrangement", chord, 67],
    ["where did I stop in this version lol", concert, 64], ["这首巴赫我之前弹到哪了？", bach, null], ["how far did i get in the satie last time", satie, 9],
    ["yo where'd i stop last time on this?", bach, null], ["where was i in this beethoven piece", moonlight, 2], ["上回在这个版本练到哪了", sunny, 6],
  ];
  for (const [text, open, bar] of cases) {
    const plan = turn(text, open, {}, open === bach || /[一-鿿]/.test(text) ? [] : []);
    assert.equal(plan.intent, "resume", text);
    assert.doesNotMatch(plan.message, /No saved piece matches|曲库里没有匹配|Import|导入/, text);
    assert.ok(!plan.actions.some((a) => a.type === "import-score"), text);
    if (bar) assert.deepEqual(plan.actions[0] && [plan.actions[0].pieceId, plan.actions[0].bar], [open.id, bar], text);
    else {
      assert.match(plan.message, /No saved practice position|还没有保存的练习位置/, text);
      assert.match(plan.message, /龙卷风/, `${text}: the latest saved place elsewhere`);
    }
  }
});

test("resume: edition words and Chinese composer and work names pick the right piece from the library's own metadata", () => {
  for (const [text, id, bar] of [
    ["晴天那个音乐会版本我练到第几小节啦", "sunny-concert", 64], ["晴天的和弦版我练到哪了", "sunny-chord", 67], ["where did i leave the concert arrangement of sunny day?", "sunny-concert", 64],
    ["where was I in the chord version of sunny day", "sunny-chord", 67], ["贝多芬那首月光我上回练到第几小节了", "moonlight", 2], ["我在热情奏鸣曲练到哪了", "appassionata", 536],
    ["where did I get to in tornado", "tornado", 48], ["yo where was i in the appassionata", "appassionata", 536], ["what bar was i on in gymnopedie", "gymnopedie", 9],
  ]) {
    const plan = turn(text, starter);
    assert.equal(plan.intent, "resume", text);
    assert.deepEqual([plan.actions[0].pieceId, plan.actions[0].bar], [id, bar], text);
  }
  // A real title the library lacks is still named as missing, with the import.
  for (const text of ["where did I stop in Für Elise", "resume the piece called Kiss the Rain", "我在卡农练到哪了", "resume “Clair de Lune”"]) {
    const plan = turn(text, satie);
    assert.ok(plan.actions.some((a) => a.type === "import-score"), text);
  }
});

test("search: filler and short words never pick or invent a piece", () => {
  for (const [text, id] of [["open the Satie one", "gymnopedie"], ["ok open the bach then", "bach"], ["find the moonlight one please", "moonlight"], ["打开那首龙卷风", "tornado"], ["open the concert version of 晴天", "sunny-concert"]]) {
    const plan = turn(text, sonata);
    assert.equal(plan.intent, "search", text);
    assert.deepEqual(plan.actions.map((a) => a.pieceId), [id], text);
  }
  for (const text of ["k", "kk", "ok", "lol", "no"]) assert.deepEqual(searchMaestroPieces(text, pieces, journal).map((m) => m.piece.id), [], text);
  for (const text of ["k", "kk", "ok", "lol", "no", "c", "C!"]) assert.notEqual(turn(text).intent, "search", text);
  assert.equal(resolveMaestroPiece("this arrangement", ctx(chord)).kind, "current");
  assert.equal(resolveMaestroPiece("这首巴赫", ctx(bach)).kind, "matches");
  assert.equal(resolveMaestroPiece("忘了", ctx(chord)).kind, "current");
  assert.equal(resolveMaestroPiece("Für Elise", ctx(chord)).kind, "missing");
});

test("carry-over: an elliptical follow-up keeps the last piece question and changes only the piece", () => {
  for (const [first, follow, id, bar] of [
    ["where was i in the gymnopedie?", "and moonlight?", "moonlight", 2], ["where did I stop in tornado", "what about the chord one?", "sunny-chord", 67],
    ["龙卷风我上次停在哪", "那晴天的和弦版呢？", "sunny-chord", 67], ["我在月光练到哪了", "还有热情奏鸣曲呢", "appassionata", 536], ["where did i leave off in satie", "how about the concert version of sunny day", "sunny-concert", 64],
  ]) {
    const one = turn(first, sonata, { currentBar: 200 });
    const next = turn(follow, sonata, { currentBar: 200 }, appendCompanionExchange([], first, one));
    assert.equal(next.intent, "resume", follow);
    assert.deepEqual([next.actions[0].pieceId, next.actions[0].bar], [id, bar], follow);
    // “open that one” after it opens that piece.
    const open = turn("ok open that one", sonata, {}, appendCompanionExchange(appendCompanionExchange([], first, one), follow, next));
    assert.deepEqual(open.actions.map((a) => a.pieceId), [id], follow);
  }
  // After a search, the follow-up is a search; stray words are not a piece.
  const found = turn("find gymnopedie");
  assert.equal(turn("and the bach?", sonata, {}, appendCompanionExchange([], "find gymnopedie", found)).intent, "search");
  for (const text of ["左手呢？", "and slower?", "what about bar 12?", "and the left hand"]) assert.equal(followUpTarget(text) === null || turn(text, sonata, {}, appendCompanionExchange([], "where was i in the gymnopedie?", turn("where was i in the gymnopedie?"))).intent !== "resume", true, text);
});

test("language: request shapes and typo'd names switch, persist, and negations or mentions do not", () => {
  for (const [text, code] of [
    ["can we do this in mandarin?", "zh"], ["pls reply in englsh from now", "en"], ["could you switch to englsh pls", "en"], ["can we talk in mandrin", "zh"],
    ["hey can u answer in chineese", "zh"], ["in english from now on", "en"], ["let's keep going in english", "en"], ["switch back to english", "en"], ["以后用英语跟我说吧", "en"], ["可以换回中文吗", "zh"],
  ]) assert.equal(languageRequest(text), code, text);
  // Content plus a language keeps its question but sets the preference.
  for (const [text, code] of [["explain this bar in chinese", "zh"], ["tell me about this piece in english please", "en"], ["can you do this bar in spanish", "es"]]) {
    assert.equal(languageRequest(text), null, text);
    assert.equal(conversationLanguagePreference([], text), code, text);
  }
  for (const text of ["Do not answer in English", "don't explain it in english", "I am learning to speak Chinese", "Is Chinese harder than English?", "the engine is broken", "my teacher speaks french"])
    assert.equal(conversationLanguagePreference([], text), null, text);
  assert.equal(correctLanguageNames("Responda em português e italiano"), "Responda em português e italiano");
  // The switch holds for the next message in the other script.
  const history = appendCompanionExchange([], "pls reply in englsh from now", turn("pls reply in englsh from now"));
  assert.equal(conversationLanguagePreference(history, "左手怎么练比较好"), "en");
});

test("speed: a speed word and one value, slang, hedges and Chinese numerals set it; questions and statements do not", () => {
  for (const [text, pct] of [
    ["slow it waaay down, like 50", 50], ["can we bring it down to around 65 pls", 65], ["take the speed to about seventy", 70], ["速度给我降到七十左右", 70],
    ["放慢到五十吧", 50], ["speed it up to 90 please", 90], ["slow down to like 55", 55], ["速度大概六十就行", 60],
  ]) assert.deepEqual(acts(turn(text)), [["set-speed", pct / 100]], text);
  assert.deepEqual(acts(turn("slow it waaay down", sonata, { speed: 0.75 })), [["set-speed", 0.65]], "an intensified step is bigger");
  for (const text of ["why is 50 so slow?", "this piece is slow", "is 60 too fast for bar 12?", "don't slow it down to 50", "slow down bar 50", "I practised 60 minutes slowly"])
    assert.ok(!turn(text).actions.some((a) => a.type === "set-speed"), text);
});

test("hand, loop and bar commands: slang, typos, courtesies and relative moves", () => {
  for (const [text, hand] of [["lemme try just lefty", "left"], ["ok just my right for now", "right"], ["left only for a bit", "left"], ["先单练左手部分", "left"], ["我想先单独弹右手", "right"], ["righty pls", "right"]])
    assert.deepEqual(acts(turn(text, tornado)), [["set-hand", hand]], text);
  for (const [text, from, to] of [["循环一下45到48小结", 45, 48], ["can you loop 150 through 152 for me", 150, 152], ["loop from 44 to 47 pls", 44, 47], ["帮我把150到156小结循环起来", 150, 156], ["repeat 20 thru 24 lol", 20, 24], ["把第10到12小节反复弹几遍", 10, 12]])
    assert.deepEqual(acts(turn(text, sonata, { currentBar: 153 })), [["repeat-bars", from, to]], text);
  for (const [text, bar] of [["往后跳两小节", 155], ["往前退两小节", 151], ["skip ahead 2 bars", 155], ["jump two bars ahead", 155], ["2 bars back", 151], ["go back a bar", 152], ["skip 3 bars", 156], ["jump back a couple of bars", 151], ["后退一小节", 152], ["go up to bar 30", 30]])
    assert.deepEqual(acts(turn(text, sonata, { currentBar: 153 })), [["seek-bar", bar]], text);
});

test("a message that ends in a command runs that command; one that does not stays conversation", () => {
  for (const [text, type] of [["ugh this is so hard, slow it down", "set-speed"], ["烦死了，慢一点", "set-speed"], ["not left hand, right hand", "set-hand"], ["this bar is a mess, loop 4 to 8", "repeat-bars"], ["ok that was rough so go back a bar", "seek-bar"]])
    assert.deepEqual(planMaestroCommand(text, ctx(sonata, { currentBar: 10 })).actions.map((a) => a.type), [type], text);
  for (const text of ["slower, or should I keep going?", "I hate this bar, it's so hard", "left hand or right hand?"])
    assert.ok(!planMaestroCommand(text, ctx(sonata)).actions.length || planMaestroCommand(text, ctx(sonata)).intent !== "command", text);
});

test("library: another piece, my stuff, easier or calmer, and superlatives are answered from the library", () => {
  for (const [text, open] of [
    ["im kinda bored of this song, what else could i work on?", sunny], ["what else do I have that's calmer than this?", sonata], ["gimme something easier from my stuff", sonata],
    ["ugh i'm sick of this one, got anything else in my library?", tornado], ["太累了，换首别的吧，有没有轻松点的", sonata], ["我还有什么别的曲子可以练", tornado], ["got anything calmer in my library?", sonata],
  ]) {
    const plan = turn(text, open);
    assert.equal(plan.intent, "search", text);
    assert.ok(plan.actions.length && plan.actions.every((a) => a.type === "open-piece" && a.pieceId !== open.id), text);
    assert.ok(!plan.actions.some((a) => a.pieceId === "lesson-twinkle"), text);
  }
  // Easier than the open piece means gentler than it.
  const easier = turn("this appassionata is way too hard, i wanna cry. gimme something easier from my stuff", sonata);
  assert.match(easier.message, /^That one is a beast/);
  for (const [text, first] of [["which of my pieces is the shortest?", "starter"], ["what's the longest piece I've got?", "appassionata"], ["我曲库里最短的是哪首", "starter"], ["which one's the hardest in my library", "appassionata"]])
    assert.equal(turn(text).actions[0].pieceId, first, text);
  for (const text of ["what's the hardest bar here?", "这首最难的是哪一段？", "what's the easiest way to practise this?"])
    assert.notEqual(turn(text).intent, "search", text);
});

test("the lesson planner keeps to passages: bored-and-else and multi-week plans go elsewhere", () => {
  assert.notEqual(turn("im kinda bored of this song, what else could i work on?", sunny).intent, "lesson");
  assert.equal(turn("so bored of this passage, any fun way to practise it?", sunny).intent, "lesson");
  for (const text of ["my recital is in two weeks, I can practise 40 min a day, how should I plan bar 12?", "I have an exam in 3 weeks and only 30 minutes a day of practice for this piece", "下个月要演出，我每天只有20分钟练琴，怎么安排？"])
    assert.notEqual(turn(text, moonlight, { currentBar: 12 }).intent, "lesson", text);
  assert.equal(turn("I only have 10 minutes to practise, what should I do with this bar?", moonlight, { currentBar: 12 }).intent, "lesson");
});

test("prompt facts: the library, the saved-place line, named pieces and a ready comparison", () => {
  const context = (open, request) => makeCompanionContext({ currentScore: open, currentBar: 1, journal, pieces, request, history: [] });
  const prompt = (open, message) => buildCompanionPrompt({ message, companionId: "mozart", context: context(open, message), history: [] }).prompt;
  const plain = prompt(sunny, "How do I practise these bars?");
  assert.match(plain, /The learner's library \(exact titles;[^\n]*“龙卷风 · 邓紫棋版” — 周杰伦 Jay Chou, 71 bars, [a-z]+, saved at bar 48/);
  assert.match(plain, /“Start here · C major melody” — Luma Keys, 4 bars/);
  // An unplayed open piece says so, and where the latest saved place is.
  assert.match(prompt(bach, "where did I stop?"), /no saved place yet[^\n]*most recent saved place is in another piece: “龙卷风 · 邓紫棋版”, bar 48/);
  const compare = prompt(bach, "is the gymnopedie harder than the bach prelude?");
  assert.match(compare, /Piece named in the message: “Gymnopédie No\. 1” by Erik Satie — 78 bars/);
  assert.match(compare, /Comparison \(the app's difficulty measure is notes per second at the written tempo\)/);
  for (const message of ["is moonlight harder than this one?", "这首和月光比起来，哪个更难？", "what about the tornado?"])
    assert.match(prompt(bach, message), /Piece named in the message: “(?:Moonlight|龙卷风)/, message);
  assert.deepEqual(mentionedMaestroPieces("周杰伦的歌", pieces), [], "a composer of four songs names none of them");
  assert.deepEqual(mentionedMaestroPieces("晴天的音乐会版", pieces).map((p) => p.id), ["sunny-concert"]);
});

test("note spelling follows the key signature and the chord the notes make", () => {
  const dMajor = keySpeller({ keySignature: { fifths: 2, mode: "major" } });
  assert.equal(dMajor(70), "B♭4", "♭6 in D major");
  assert.equal(dMajor(65), "F4", "♭3 in D major");
  assert.equal(dMajor(66), "F♯4");
  assert.equal(dMajor(63, [59, 66]), "D♯4", "B–D♯–F♯ stacks in thirds");
  const cSharpMinor = keySpeller({ keySignature: { fifths: 4, mode: "minor" } });
  assert.equal(cSharpMinor(60), "B♯3", "the leading note");
  const fMinor = keySpeller({ keySignature: { fifths: -4, mode: "minor" } });
  assert.deepEqual([fMinor(64), fMinor(68), fMinor(61)], ["E4", "A♭4", "D♭4"]);
  assert.equal(keySpeller({}), null);
  // In a D-major score the borrowed chord reads B♭ major, never A♯.
  const score = { ...tornado, meter: 4, notes: notesAt(2, 4, [[50, 0, 4, "left"], [58, 0, 4, "left"], [62, 0, 4, "left"], [77, 0, 4, "right"]]) };
  const view = makeCompanionContext({ currentScore: score, currentBar: 2, journal, pieces, request: "what chord is this?", history: [] });
  const text = buildCompanionPrompt({ message: "what chord is this?", companionId: "liszt", context: view, history: [] }).prompt;
  assert.match(text, /B♭ major \(B♭–D–F, borrowed ♭VI of D major\)/);
  assert.doesNotMatch(text, /A♯/);
});

test("written notes: chords and octaves are struck together, a long note is one tied note, leaps have a direction", () => {
  const [line, notable] = describeWrittenNotes([
    { bar: 9, offset: 0, pitch: "F♯4", number: "5", hand: "right", duration: 12, held: false },
    { bar: 9, offset: 0, pitch: "E♭2", number: "1", hand: "left", duration: 0.5, held: false },
    { bar: 9, offset: 0, pitch: "E♭3", number: "1", hand: "left", duration: 0.5, held: false },
    { bar: 9, offset: 0.5, pitch: "B♭3", number: "5", hand: "left", duration: 0.5, held: false },
    { bar: 9, offset: 1, pitch: "E♭2", number: "1", hand: "left", duration: 0.5, held: false },
  ], { from: 9, to: 9 }, { barBeats: 3 });
  assert.match(line, /right hand F♯4 \(struck once and held for 12 beats, tied over the barline into bar 12\)/);
  assert.match(line, /left hand E♭2\+E♭3 together as an octave \(eighth\), B♭3 \(eighth\), E♭2 \(eighth\)/);
  assert.match(notable, /leaps up a twelfth \(E♭2→B♭3\)/);
  assert.match(describeWrittenNotes([{ bar: 1, offset: 0, pitch: "B♭3", number: "5", hand: "left", duration: 0.5, held: false }, { bar: 1, offset: 0.5, pitch: "E♭2", number: "1", hand: "left", duration: 0.5, held: false }], { from: 1, to: 1 })[1], /leaps down a twelfth \(B♭3→E♭2\)/);
  const repeated = describeWrittenNotes(Array.from({ length: 4 }, (_, i) => [{ bar: 1, offset: i, pitch: "A1", number: "1", hand: "left", duration: 1, held: false }, { bar: 1, offset: i, pitch: "A2", number: "1", hand: "left", duration: 1, held: false }]).flat(), { from: 1, to: 1 }, { barBeats: 4 })[0];
  assert.match(repeated, /A1\+A2 together as an octave \(quarter\) 4 times in a row/);
});

test("reply sizing: a pause or a puzzled look is short; a coding question is off-topic with or without code; detail never unlocks it", () => {
  for (const text of ["...", "…", "。。。", "?", "huh?", "嗯？"]) assert.equal(classifyCompanionMessage(text).short, true, text);
  for (const text of ["C++里指针和引用有什么区别？详细讲讲", "whats the difference between pointers and references, explain in detail", "Java的接口和抽象类有什么区别，详细一点", "how does recursion work? step by step please", "explain linked lists in detail"]) {
    const kind = classifyCompanionMessage(text);
    assert.equal(kind.offTopic, "code", text);
    assert.equal(kind.detail, false, text);
  }
  for (const text of ["any pointers for this bar?", "what is C# major?", "how do I count this rhythm in detail?"]) assert.equal(classifyCompanionMessage(text).offTopic, null, text);
});

test("compound tempo and expression markings define every term in the run", () => {
  const terms = (text) => glossaryFor(text).map((entry) => entry[1].split(":")[0]);
  assert.deepEqual(terms("这首的速度标记Adagio sostenuto是什么意思？"), ["Adagio", "Sostenuto"]);
  assert.deepEqual(terms("what does adagio sostenuto mean exactly?"), ["Adagio", "Sostenuto"]);
  assert.deepEqual(terms("标题里的 Allegro ma non troppo 到底是什么意思？"), ["Allegro", "Ma non troppo"]);
  assert.deepEqual(terms("what is legato e staccato?").sort(), ["Legato", "Staccato"]);
  assert.deepEqual(terms("presto是什么"), ["Presto"]);
});

test("runtime: a claimed change becomes the command that does it; advice and instructions stand", () => {
  for (const [text, language, hint] of [
    ["Ah, let us breathe into bar 6 and slow our tempo to a gentle fifty percent. Count steadily.", "en", /^Type “speed 50%” here and the app will set it\. Count steadily\.$/],
    ["乐意为您从第 45 小节循环至第 48 小节，让旋律多转几圈。", "zh", /^输入“循环第45到48小节”，应用就会设好循环。$/],
    ["Sure, Mochi can focus on the left hand for you at bar 29. Play slowly.", "en", /^Type “left hand” here and the app will switch to it\. Play slowly\.$/],
    ["I have set the loop to bars 4–8 for you.", "en", /^Type “loop 4–8” here/],
    ["我帮你把速度调到60%，慢慢来。", "zh", /^在聊天里输入“速度60%”/],
    ["I'll take you to bar 12 now.", "en", /^Type “go to bar 12” here/],
    ["The speed is now set to 70%, so breathe.", "en", /^Type “speed 70%” here/],
  ]) assert.match(withoutActionClaims(text, language), hint, text);
  for (const text of ["Try slowing your left hand to 25% speed just for bar 300.", "Type “speed 50%” and the app will set it.", "你可以输入“速度60%”来放慢。", "Shall we slow it down to 60%?", "Let's start at bar 12 and count aloud.", "Loop bars 4–8 three times, then add the right hand.", "我们先把这一段慢慢弹三遍。"])
    assert.equal(withoutActionClaims(text), text, text);
});

test("runtime: invented triplets, wrong composers and descriptions of unheard playing are removed", () => {
  assert.equal(withoutInventedTuplets("别着急。试着把右手的三连音看作一个整体。先慢慢数拍。"), "别着急。先慢慢数拍。");
  assert.equal(withoutInventedTuplets("There are no triplets here; count 1 e and a."), "There are no triplets here; count 1 e and a.");
  const works = [{ keys: ["Prelude in C major", "BWV 846", "C大调前奏曲"], by: ["Bach", "巴赫"] }, { keys: ["Gymnopédie"], by: ["Satie", "萨蒂"] }];
  assert.equal(withRightComposers("莫扎特的《C 大调前奏曲 BWV 846》很安静。", works), "巴赫的《C 大调前奏曲 BWV 846》很安静。");
  assert.equal(withRightComposers("Try Mozart's Prelude in C major tonight.", works), "Try Bach's Prelude in C major tonight.");
  assert.equal(withRightComposers("the Gymnopédie by Debussy", works), "the Gymnopédie by Satie");
  assert.equal(withRightComposers("Chopin's preludes are lovely too.", works), "Chopin's preludes are lovely too.");
  assert.equal(withoutClaims("Well done! Your right-hand leap now sings with clarity. Keep going!"), "Well done! Keep going!");
  assert.equal(withoutClaims("Let your melody sing over the triplets."), "Let your melody sing over the triplets.");
});

test("model routing: the new local answers never reach the model; open questions still do", () => {
  // A bare pause gets the same concrete local options as a bare “?”.
  for (const text of ["…", "...", "。。。", "??"]) {
    const plan = turn(text);
    assert.equal(shouldUseCompanionModel(plan), false, text);
    assert.match(plan.message, /Not sure where to start/, text);
  }
  for (const text of ["and moonlight?", "k", "is the gymnopedie harder than the bach prelude?", "bruh this rhythm is so confusing, any tips?"]) {
    const history = appendCompanionExchange([], "where was i in the gymnopedie?", turn("where was i in the gymnopedie?"));
    const plan = turn(text, sonata, {}, text === "and moonlight?" ? history : []);
    assert.equal(shouldUseCompanionModel(plan), text !== "and moonlight?", text);
  }
});
