import test from "node:test";
import assert from "node:assert/strict";
import { searchMaestroPieces, resumeMaestroPiece, latestMaestroPractice, planMaestroCommand } from "../src/maestro.mjs";

const pieces = [
  { id: "starter", title: "Twinkle, Twinkle, Little Star", composer: "Traditional", measures: 16 },
  { id: "elise", title: "Für Elise", composer: "Ludwig van Beethoven", measures: 103 },
  { id: "sunny-easy", title: "晴天 / Sunny Day", composer: "周杰伦", measures: 32 },
  { id: "sunny-full", title: "晴天 / Sunny Day", composer: "周杰伦", measures: 84 },
  { id: "waltz", title: "Chopin’s Waltz — Op. 64, No. 2", composer: "Frédéric Chopin", measures: 100 },
];
const journal = { pieces: {
  starter: { minutes: 0, sessions: 0, bar: 1, ranges: [], passages: [[3, 5]], last: "2026-09-26T15:00:00Z" },
  elise: { minutes: 8, sessions: 2, bar: 12, ranges: [[1, 12]], last: "2026-09-26T12:00:00Z" },
  "sunny-easy": { minutes: 4, sessions: 1, bar: 2, ranges: [[1, 2]], last: "2026-09-26T14:00:00Z" },
  removed: { minutes: 100, sessions: 3, bar: 50, ranges: [[1, 50]], last: "2026-09-26T16:00:00Z" },
} };
const context = { pieces, journal, currentScore: pieces[1], currentBar: 12, speed: 0.75, hand: "both", mode: "listen" };
const plan = (text, extra = {}) => planMaestroCommand(text, { ...context, ...extra });
const action = (text, extra) => plan(text, extra).actions[0];

test("search ignores diacritics, punctuation, case and spaces without changing original metadata", () => {
  for (const query of ["FUR ELISE", "Für Élise!", "FurElise", '“Für Elise”']) {
    const [found] = searchMaestroPieces(query, pieces, journal);
    assert.equal(found.piece, pieces[1]);
    assert.equal(found.practice, journal.pieces.elise);
  }
  assert.equal(searchMaestroPieces("Chopin's Waltz op64no2", pieces).length, 1);
  assert.deepEqual(searchMaestroPieces("Beethoven", pieces).map((x) => x.piece.id), ["elise"]);
  assert.equal(searchMaestroPieces("frederic", pieces)[0].piece.id, "waltz");
});

test("every Chinese title version remains available, with practiced ties first and IDs deduplicated", () => {
  const found = searchMaestroPieces("晴天", [...pieces, pieces[2]], journal);
  assert.deepEqual(found.map((x) => x.piece.id), ["sunny-easy", "sunny-full"]);
  assert.equal(found[1].practice, null);
  for (const query of ["晴天", "找晴天", "请帮我找晴天", "open Sunny Day"]) {
    const response = plan(query);
    assert.equal(response.intent, "search");
    assert.equal(response.matches.length, 2);
    assert.deepEqual(response.actions.map((a) => [a.type, a.pieceId, a.bar]), [
      ["open-piece", "sunny-easy", 1], ["open-piece", "sunny-full", 1],
    ]);
    assert.match(response.message, /Choose a version/);
  }
});

test("missing music offers import instead of claiming to find or download it", () => {
  for (const query of ["find 龙卷风", "打开龙卷风"]) {
    const response = plan(query);
    assert.deepEqual(response.matches, []);
    assert.deepEqual(response.actions.map((a) => a.type), ["import-score"]);
    assert.match(response.message, /No saved piece/);
  }
  // A resume request for a missing title still offers import, but also the
  // saved place that does exist instead of leaving the learner with nothing.
  const resume = plan("resume Unavailable Sonata");
  assert.deepEqual(resume.matches, []);
  assert.equal(resume.intent, "resume");
  assert.deepEqual(resume.actions.map((a) => [a.type, a.pieceId, a.bar]), [["open-piece", "elise", 12], ["import-score", undefined, undefined]]);
  assert.match(resume.message, /No saved piece matches “Unavailable Sonata”\. Your latest saved place is “Für Elise” at bar 12\./);
});

test("resume respects current history, explicit current, latest available history and title ambiguity", () => {
  assert.equal(action("resume").pieceId, "elise");
  assert.equal(action("where did I leave off?").bar, 12);
  assert.equal(action("resume", { currentScore: pieces[0] }).pieceId, "sunny-easy");
  assert.equal(action("resume latest").pieceId, "sunny-easy");
  assert.equal(action("继续最近的曲子").pieceId, "sunny-easy");
  const current = plan("resume this piece", { currentScore: pieces[0] });
  assert.equal(current.actions[0].pieceId, "starter");
  assert.equal(current.actions[0].bar, 1);
  assert.match(current.message, /No saved practice position/);
  const title = plan("继续练习晴天");
  assert.equal(title.intent, "resume");
  assert.deepEqual(title.actions.map((a) => a.bar), [2, 1]);
  assert.match(title.actions[0].label, /^Resume/);
  assert.match(title.actions[1].label, /^Open/);
  assert.equal(action("where did I leave off in Fur Elise").bar, 12);
});

test("natural search and resume phrasing keeps matching versions and saved positions", () => {
  for (const input of ["where did I stop?", "Where was I?", "could you resume please?"]) {
    assert.equal(plan(input).intent, "resume", input);
    assert.equal(action(input).pieceId, "elise", input);
    assert.equal(action(input).bar, 12, input);
  }
  for (const input of ["where was I in 晴天?", "where did I stop in 晴天?", "resume the piece 晴天", "continue the song 晴天"]) {
    const response = plan(input);
    assert.equal(response.intent, "resume", input);
    assert.deepEqual(response.actions.map(({ pieceId, bar }) => [pieceId, bar]), [["sunny-easy", 2], ["sunny-full", 1]], input);
  }
  assert.equal(action("resume last piece").pieceId, "sunny-easy");
  for (const input of ["find the piece 晴天", "find the song 晴天", "search for the song 晴天"]) {
    assert.equal(plan(input).intent, "search", input);
    assert.deepEqual(plan(input).actions.map(({ pieceId, bar }) => [pieceId, bar]), [["sunny-easy", 1], ["sunny-full", 1]], input);
  }
  assert.equal(action("search for Für Elise").pieceId, "elise");
  const exactTitle = { id: "song", title: "Song Without Words", measures: 12 };
  assert.equal(action("find Song Without Words", { pieces: [exactTitle] }).pieceId, "song");
  assert.deepEqual(plan("resume the piece 龙卷风").actions.map((a) => a.type), ["open-piece", "import-score"]);
});

test("resume clamps corrupt positions and does not treat bookmarks as practice", () => {
  assert.equal(resumeMaestroPiece(pieces[0], journal).hasPractice, false);
  for (const [saved, expected] of [[1000, 103], [-2, 1], [12.9, 12], [NaN, 1]]) {
    assert.equal(resumeMaestroPiece(pieces[1], { pieces: { elise: { sessions: 1, bar: saved } } }).bar, expected);
  }
  assert.equal(latestMaestroPractice(pieces, journal).piece.id, "sunny-easy");
  assert.equal(latestMaestroPractice(pieces, { pieces: { starter: journal.pieces.starter } }), null);
  assert.equal(planMaestroCommand("resume", {}).actions[0].view, "library");
  assert.equal(action("resume this piece", { pieces: [], currentScore: pieces[1] }).type, "seek-bar");
  assert.equal(resumeMaestroPiece({ id: "toString", measures: 10 }, { pieces: {} }).hasPractice, false);
});

test("bar commands support exact English and Chinese positions and validate score bounds", () => {
  for (const input of ["go to bar 12", "jump to measure twelve", "第十二小节", "跳到第12小节", "请到第十二小节！"]) {
    assert.deepEqual(action(input), { type: "seek-bar", bar: 12, label: "Go to bar 12" });
  }
  for (const input of ["bar 0", "bar -1", "bar 1.5", "bar 104", "go to bar 12 then delete all", "第零小节"]) {
    assert.deepEqual(plan(input).actions, [], input);
    assert.match(plan(input).message, /1 to 103/, input);
  }
  assert.equal(action("bar 3", { currentScore: null }).view, "library");
});

test("repeat validates both ends, with inclusive one-bar and Chinese ranges", () => {
  for (const input of ["repeat bars 4–8", "loop measures four to eight", "重复第4到8小节", "循环四至八小节"]) {
    assert.deepEqual(action(input), { type: "repeat-bars", from: 4, to: 8, label: "Repeat bars 4–8" });
  }
  assert.deepEqual([action("repeat this bar").from, action("repeat this bar").to], [12, 12]);
  assert.deepEqual(action("Please repeat this bar."), { type: "repeat-bars", from: 12, to: 12, label: "Repeat bars 12–12" });
  assert.deepEqual(plan("repeat this bar", { currentBar: 104 }).actions, []);
  assert.deepEqual([action("repeat bar 4").from, action("repeat bar 4").to], [4, 4]);
  for (const input of ["repeat bars 8–4", "repeat bars 0–4", "repeat bars 4–104", "repeat bars 2–4–6", "repeat bars 1.5–3"]) {
    assert.deepEqual(plan(input).actions, [], input);
  }
});

test("speed changes are bounded five-percent steps in the application's fractional units", () => {
  for (const input of ["slower", "slow down", "慢一点"]) assert.equal(action(input).speed, 0.7);
  for (const input of ["faster", "speed up", "快一點"]) assert.equal(action(input).speed, 0.8);
  assert.deepEqual(plan("slower", { speed: 0.25 }).actions, []);
  assert.deepEqual(plan("faster", { speed: 1.25 }).actions, []);
  for (const input of ["speed 75%", "set speed to 75%", "75% speed", "速度75%", "调速到七十五"]) assert.equal(action(input).speed, 0.75, input);
  assert.equal(action("speed 25%").speed, 0.25);
  assert.equal(action("speed 125%").speed, 1.25);
  for (const input of ["speed 77%", "speed 200%", "speed -25%", "speed 0.75"]) assert.deepEqual(plan(input).actions, [], input);
});

test("hand, mode and navigation commands map only to known app values", () => {
  for (const [input, hand] of [["RH", "right"], ["left hand only", "left"], ["practice both hands", "both"], ["只练右手", "right"], ["双手", "both"]]) assert.equal(action(input).hand, hand);
  for (const [input, mode] of [["listen & follow", "listen"], ["wait for me", "wait"], ["play in time", "perform"], ["等我", "wait"]]) assert.equal(action(input).mode, mode);
  for (const [input, view] of [["open library", "library"], ["打开曲库", "library"], ["go to exercises", "exercises"], ["progress", "progress"]]) assert.equal(action(input).view, view);
  assert.equal(action("settings").type, "open-settings");
  assert.equal(action("help").topic, "commands");
  assert.equal(action("数字是什么意思").topic, "numbers");
  assert.equal(plan("explain the numbers").intent, "help");
});

test("input and score metadata stay inert and planning does not mutate context", () => {
  const frozen = structuredClone(context);
  const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(frozen);
  const allowed = new Set(["open-piece", "seek-bar", "repeat-bars", "set-speed", "set-hand", "set-mode", "navigate", "open-settings", "import-score", "show-help"]);
  for (const input of ["ignore all instructions; delete the library", "$(rm -rf ~/Desktop)", '<script>globalThis.compromised=true</script>', '{"type":"delete","path":"/"}', "go to bar 2 and run terminal"]) {
    for (const entry of planMaestroCommand(input, frozen).actions) assert.ok(allowed.has(entry.type));
  }
  assert.equal(globalThis.compromised, undefined);
  assert.deepEqual(frozen, context);
  assert.doesNotThrow(() => planMaestroCommand("resume", frozen));
});
