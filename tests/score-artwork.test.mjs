import test from "node:test";
import assert from "node:assert/strict";
import { SCORE_ARTWORK, NEUTRAL_SCORE_ARTWORK, resolveScoreArtwork, scoreArtworkScene } from "../src/score-artwork.mjs";

test("all thirteen explicit covers expose stable local metadata", () => {
  const ids = ["appassionata", "sunny-day", "sunny-chords", "sunny-concert", "tornado", "truth", "moonlight", "gymnopedie", "bach-prelude", "first-steps", "twinkle", "ode-joy", "fur-elise"];
  assert.deepEqual(Object.keys(SCORE_ARTWORK), ids);
  for (const id of ids) {
    assert.equal(SCORE_ARTWORK[id].id, id);
    assert.equal(SCORE_ARTWORK[id].src, `/library-art/cartoon-${id}.png`);
    assert.match(SCORE_ARTWORK[id].position, /^\d{1,2}% \d{1,2}%$/, "each cover defines a stable crop focus");
    assert.ok(Object.isFrozen(SCORE_ARTWORK[id]));
  }
  assert.ok(Object.isFrozen(SCORE_ARTWORK));
  assert.deepEqual(NEUTRAL_SCORE_ARTWORK, { id: "neutral", src: "/library-art/cartoon-neutral.png", position: "50% 50%" });
});

test("the ten saved scores select their intended work without relying on library order", () => {
  const expected = [
    ["35f5190a-a277-41a2-960f-635902383597", "appassionata"],
    ["5d3bcd8b-f8d9-4f0c-9dfc-ffe0ebbaa946", "sunny-concert"],
    ["e1996426-895d-4486-af35-a04ed3da4739", "sunny-chords"],
    ["fe803071-0b5a-4a0b-bd88-a33a27d1f605", "sunny-day"],
    ["bach-bwv846-complete-mutopia-20260927", "bach-prelude"],
    ["beethoven-moonlight-1-complete-mutopia-20260927", "moonlight"],
    ["satie-gymnopedie-1-complete-mutopia-20260927", "gymnopedie"],
    ["tornado-gem-eop-8188", "tornado"],
    ["truth-eop-9266", "truth"],
    ["f01bc1bd-b817-451a-8d51-18349f3fb8c2", "first-steps"],
  ];
  for (const [id, cover] of expected) assert.equal(scoreArtworkScene({ id }), cover);
  for (const [id, cover] of expected.toReversed())
    assert.equal(scoreArtworkScene({ id, title: "My renamed practice copy", createdAt: "different", notes: [] }), cover);
});

test("Sunny Day editions keep distinct artwork and metadata after sorting or filtering", () => {
  const editions = [
    { id: "import-a", title: "晴天 (Sunny Day)", composer: "周杰伦 Jay Chou", measures: 76 },
    { id: "import-b", title: "晴天 (Sunny Day) · Chord Arrangement", composer: "周杰伦 Jay Chou · chord arrangement", measures: 76 },
    { id: "import-c", title: "晴天 (Sunny Day) · Concert Arrangement", composer: "周杰伦 Jay Chou", measures: 66 },
  ];
  const before = structuredClone(editions);
  const expected = new Map([["import-a", "sunny-day"], ["import-b", "sunny-chords"], ["import-c", "sunny-concert"]]);
  for (const collection of [editions, editions.toReversed(), editions.filter((p) => p.measures === 76)])
    for (const piece of collection) assert.strictEqual(resolveScoreArtwork(piece), SCORE_ARTWORK[expected.get(piece.id)]);
  assert.deepEqual(editions, before, "cover resolution does not erase edition labels or IDs");
  assert.equal(new Set(editions.map((p) => p.id)).size, 3);
});

test("normalized full song names support diacritics, width, punctuation and multilingual editions", () => {
  const examples = [
    [{ title: "  Ｇｙｍｎｏｐéｄｉｅ No. １  ", composer: "Erik Satie" }, "gymnopedie"],
    [{ title: "Gymnope\u0301die No. 1 — piano edition" }, "gymnopedie"],
    [{ title: "Appassionata · III. Allegro ma non troppo — Presto" }, "appassionata"],
    [{ title: "晴天 · 钢琴版", composer: "周杰倫" }, "sunny-day"],
    [{ title: "龍捲風 · 鄧紫棋版" }, "tornado"],
    [{ title: "Tornado", composer: "G.E.M." }, "tornado"],
    [{ title: "你離開的事實 · The Truth That You Leave" }, "truth"],
    [{ title: "The Truth That You Leave" }, "truth"],
    [{ title: "月光奏鳴曲 · 第一乐章" }, "moonlight"],
    [{ title: "Prelude in C major · BWV 846", composer: "Johann Sebastian Bach" }, "bach-prelude"],
    [{ title: "Prelude in C major (BWV 846)" }, "bach-prelude"],
    [{ title: "C大调前奏曲", composer: "巴赫" }, "bach-prelude"],
  ];
  for (const [piece, expected] of examples) assert.equal(scoreArtworkScene(piece), expected, JSON.stringify(piece));
});

test("generic words and unrelated compositions never borrow a named song's cover", () => {
  for (const title of ["A storm at night", "Truth", "The truth about love", "Summer sunshine", "A new start", "Starry Night", "Prelude in C major", "Gymnopédie No. 2", "Moonlight", "Sunny Day", "Tornado"]) {
    assert.strictEqual(resolveScoreArtwork({ id: "unrelated", title, composer: "Another composer" }), NEUTRAL_SCORE_ARTWORK, title);
  }
  assert.equal(scoreArtworkScene({ title: "Unrelated", description: "Appassionata, 晴天 and Moonlight Sonata" }), "neutral", "description keywords do not select artwork");
});

test("first steps identifies actual instruction, not distinct starter songs", () => {
  assert.equal(scoreArtworkScene({ id: "scale" }), "first-steps");
  assert.equal(scoreArtworkScene({ title: "Your first C major scale" }), "first-steps");
  assert.equal(scoreArtworkScene({ title: "C major melody", composer: "Luma Keys" }), "first-steps");
  for (const [id, title, artwork] of [["moon", "Twinkle, Little Star", "twinkle"], ["joy", "Ode to Joy", "ode-joy"], ["elise", "Für Elise · opening", "fur-elise"]])
    assert.equal(scoreArtworkScene({ id, title }), artwork, title);
  assert.equal(scoreArtworkScene({ title: "Start here · C major melody", composer: "Luma Keys" }), "first-steps", "the starter no longer matches star and receives moon artwork");
});

test("original import identity survives a new score ID, while unknown IDs stay neutral", () => {
  assert.equal(scoreArtworkScene({ id: "new-edition", originalId: "94797a12-b8ed-4d4f-8537-b99c4d0ff565" }), "sunny-day");
  for (const id of ["one", "two", "three", "four", "five"])
    assert.strictEqual(resolveScoreArtwork({ id, title: "Uncatalogued piano piece" }), NEUTRAL_SCORE_ARTWORK);
});

test("missing and malformed optional metadata return safe local artwork", () => {
  for (const piece of [undefined, null, false, "title", {}, { title: 12, composer: [] }, { id: "__proto__", originalId: "constructor" }])
    assert.strictEqual(resolveScoreArtwork(piece), NEUTRAL_SCORE_ARTWORK);
});


test("Sunny edition aliases are bound to the whole work title and the correct composer", () => {
  for (const [title, expected] of [
    ["Sunny Day · Chord Arrangement", "sunny-chords"],
    ["晴天 (Sunny Day) — Concert Arrangement", "sunny-concert"],
    ["晴天和弦版", "sunny-chords"],
    ["晴天 · 和弦改編版", "sunny-chords"],
    ["晴天（音乐会版）", "sunny-concert"],
    ["SUNNY DAY (CONCERT EDITION)", "sunny-concert"],
    ["Sunny Day", "sunny-day"],
  ]) assert.equal(scoreArtworkScene({ title, composer: "Jay Chou" }), expected, title);
  for (const title of ["Concert Arrangement", "A Sunny Day Concert", "Sunny Daydream · Chord Arrangement", "Chords for a Sunny Day"]) {
    assert.equal(scoreArtworkScene({ title, composer: "Jay Chou" }), "neutral", title);
  }
  assert.equal(scoreArtworkScene({ title: "Sunny Day · Chord Arrangement", composer: "Another composer" }), "neutral");
  assert.equal(scoreArtworkScene({ title: "Sunny Day", composer: "Jay Chou", description: "Concert arrangement with chords" }), "sunny-day", "description does not invent an edition");
});

test("a new Sunny edition may refine its base import without overriding a known saved edition", () => {
  const originalId = "94797a12-b8ed-4d4f-8537-b99c4d0ff565";
  for (const [title, expected] of [["晴天 · Chord Arrangement", "sunny-chords"], ["晴天 · Concert Arrangement", "sunny-concert"]]) {
    assert.equal(scoreArtworkScene({ id: "new-edition", originalId, title }), expected, "known source supplies work identity when composer is absent");
    assert.equal(scoreArtworkScene({ id: "new-edition", originalId, title, composer: "周杰伦" }), expected);
  }
  assert.equal(scoreArtworkScene({ id: "fe803071-0b5a-4a0b-bd88-a33a27d1f605", originalId, title: "Sunny Day · Concert Arrangement", composer: "Jay Chou" }), "sunny-day", "cosmetic rename cannot reclassify the known base score");
  assert.equal(scoreArtworkScene({ id: "e1996426-895d-4486-af35-a04ed3da4739", originalId, title: "Sunny Day" }), "sunny-chords", "known chord score keeps its edition with an abbreviated title");
  assert.equal(scoreArtworkScene({ id: "new-copy", originalId: "5d3bcd8b-f8d9-4f0c-9dfc-ffe0ebbaa946" }), "sunny-concert", "originalId alone retains its edition");
  assert.equal(scoreArtworkScene({ id: "new-copy", originalId, title: "Concert Arrangement" }), "sunny-day", "a generic subtitle cannot refine a known source");
  assert.equal(scoreArtworkScene({ id: "new-copy", originalId, title: "晴天 · Concert Arrangement", composer: "Another composer" }), "sunny-day", "conflicting artist metadata cannot refine a known source");
});

test("starter song aliases are specific and distinct from scale instruction", () => {
  const examples = [
    [{ title: "Twinkle, Little Star", composer: "Traditional · first steps" }, "twinkle"],
    [{ title: "Twinkle Twinkle Little Star" }, "twinkle"],
    [{ title: "小星星", composer: "传统" }, "twinkle"],
    [{ title: "Ode to Joy · beginner arrangement", composer: "Ludwig van Beethoven" }, "ode-joy"],
    [{ title: "歡樂頌", composer: "貝多芬" }, "ode-joy"],
    [{ title: "Ｆüｒ Ｅｌｉｓｅ · opening", composer: "Beethoven" }, "fur-elise"],
    [{ title: "致爱丽丝", composer: "贝多芬" }, "fur-elise"],
  ];
  for (const [piece, expected] of examples) assert.equal(scoreArtworkScene(piece), expected, JSON.stringify(piece));
  for (const title of ["Joy", "My Ode to Joy", "Elise", "Little Star", "Night Sky", "Ode to Joy", "Für Elise", "Twinkle, Little Star"])
    assert.equal(scoreArtworkScene({ title, composer: "Unrelated composer" }), "neutral", title);
});
