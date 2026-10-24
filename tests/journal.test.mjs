import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyJournal,
  readJournal,
  recordPractice,
  recordBarPasses,
  forgetPieceSpots,
  savePassage,
  removePassage,
  mergeRanges,
  barsCovered,
  recentDays,
  practiceStreak,
  formatMinutes,
  totalMinutes,
  dayKey,
  JOURNAL_DAYS,
  JOURNAL_PIECES,
} from "../src/journal.mjs";

const at = (day, time = "12:00") => new Date(`${day}T${time}:00`).toISOString();

test("bar ranges merge, and neighbouring ranges join", () => {
  assert.deepEqual(mergeRanges([[9, 12], [1, 4], [5, 8], [20, 18]]), [
    [1, 12],
    [18, 20],
  ]);
  assert.equal(barsCovered([[1, 12], [18, 20]]), 15);
  assert.deepEqual(mergeRanges([]), []);
});

test("practice adds minutes to the day and the piece, and remembers the bar", () => {
  let j = emptyJournal();
  j = recordPractice(j, {
    id: "abc-1",
    title: "Appassionata",
    minutes: 12.345,
    from: 1,
    to: 40,
    at: at("2026-09-20", "09:00"),
  });
  j = recordPractice(j, {
    id: "abc-1",
    minutes: 5,
    from: 38,
    to: 61,
    at: at("2026-09-20", "18:00"),
  });
  const day = j.days["2026-09-20"];
  assert.equal(day.minutes, 17.35);
  assert.equal(day.pieces["abc-1"], 17.35);
  const piece = j.pieces["abc-1"];
  assert.equal(piece.sessions, 2);
  assert.equal(piece.bar, 61);
  assert.equal(piece.title, "Appassionata");
  assert.deepEqual(piece.ranges, [[1, 61]]);
  assert.equal(totalMinutes(j), 17.35);
});

test("a stretch played backwards still covers its bars, and tiny ones are ignored", () => {
  let j = recordPractice(emptyJournal(), {
    id: "p",
    minutes: 2,
    from: 30,
    to: 25,
    at: at("2026-09-21"),
  });
  assert.deepEqual(j.pieces.p.ranges, [[25, 30]]);
  assert.equal(j.pieces.p.bar, 25);
  const same = recordPractice(j, { id: "p", minutes: 0.01, from: 1, to: 2 });
  assert.equal(same, j);
});

test("practice without a valid piece id still counts for the day", () => {
  const j = recordPractice(emptyJournal(), {
    id: "",
    minutes: 3,
    from: 1,
    to: 2,
    at: at("2026-09-22"),
  });
  assert.equal(j.days["2026-09-22"].minutes, 3);
  assert.deepEqual(j.pieces, {});
});

test("recording never changes the journal it was given", () => {
  const before = emptyJournal();
  const after = recordPractice(before, { id: "x", minutes: 1, from: 1, to: 1 });
  assert.deepEqual(before, emptyJournal());
  assert.notEqual(after, before);
});

test("reading recovers each entry on its own", () => {
  const good = {
    minutes: 4,
    sessions: 2,
    last: "2026-09-20T10:00:00.000Z",
    bar: 12,
    ranges: [[5, 8], [1, 4]],
  };
  const { journal, invalid } = readJournal({
    days: {
      "2026-09-20": { minutes: 4, pieces: { ok: 4 } },
      "2026-02-30": { minutes: 1 },
      "2026-09-21": { minutes: -1 },
    },
    pieces: {
      ok: good,
      "bad id!": good,
      neg: { ...good, bar: 0 },
      ranges: { ...good, ranges: [[1]] },
    },
  });
  assert.equal(invalid, true);
  assert.deepEqual(Object.keys(journal.days), ["2026-09-20"]);
  assert.deepEqual(Object.keys(journal.pieces), ["ok"]);
  assert.deepEqual(journal.pieces.ok.ranges, [[1, 8]]);
  assert.deepEqual(readJournal(undefined).journal, emptyJournal());
  assert.equal(readJournal({}).invalid, false);
  assert.equal(readJournal([]).invalid, true);
});

test("the journal keeps a bounded number of days and pieces", () => {
  const days = {};
  const start = new Date("2024-01-01T12:00:00Z");
  for (let i = 0; i < JOURNAL_DAYS + 10; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days[d.toISOString().slice(0, 10)] = { minutes: 1 };
  }
  const pieces = {};
  for (let i = 0; i < JOURNAL_PIECES + 5; i++)
    pieces["p" + i] = {
      minutes: 1,
      sessions: 1,
      last: new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString(),
      bar: 1,
      ranges: [],
    };
  const { journal } = readJournal({ days, pieces });
  assert.equal(Object.keys(journal.days).length, JOURNAL_DAYS);
  assert.ok(!("2024-01-01" in journal.days), "oldest days go first");
  assert.equal(Object.keys(journal.pieces).length, JOURNAL_PIECES);
  assert.ok(!("p0" in journal.pieces), "least recently played pieces go first");
});

test("recent days and the streak follow the calendar", () => {
  let j = emptyJournal();
  for (const d of ["2026-09-22", "2026-09-23", "2026-09-25"])
    j = recordPractice(j, { id: "a", minutes: 10, from: 1, to: 2, at: at(d) });
  const now = new Date("2026-09-25T20:00:00");
  const week = recentDays(j, 7, now);
  assert.equal(week.length, 7);
  assert.equal(week.at(-1).day, "2026-09-25");
  assert.deepEqual(
    week.map((d) => d.minutes),
    [0, 0, 0, 10, 10, 0, 10],
  );
  assert.equal(practiceStreak(j, [], now), 1);
  // A graded run on the 24th fills the gap.
  assert.equal(practiceStreak(j, [{ at: at("2026-09-24") }], now), 4);
  // Before today's practice, yesterday's streak still stands.
  assert.equal(practiceStreak(j, [], new Date("2026-09-26T08:00:00")), 1);
  assert.equal(practiceStreak(emptyJournal(), [], now), 0);
  assert.equal(dayKey(new Date("2026-09-25T23:30:00")), "2026-09-25");
});

test("minutes read naturally", () => {
  assert.equal(formatMinutes(0), "0 min");
  assert.equal(formatMinutes(0.3), "under a minute");
  assert.equal(formatMinutes(0.3, { short: true }), "<1 min");
  assert.equal(formatMinutes(12.4), "12 min");
  assert.equal(formatMinutes(65), "1 h 05 min");
});

test("a phrase that came round covers all its bars", () => {
  const j = recordPractice(emptyJournal(), {
    id: "p",
    minutes: 3,
    from: 10,
    to: 11,
    cover: [[10, 14], ["x", 2]],
    at: at("2026-09-23"),
  });
  assert.deepEqual(j.pieces.p.ranges, [[10, 14]]);
  assert.equal(j.pieces.p.bar, 11);
  assert.equal(j.pieces.p.sessions, 1);
});

test("passages are kept per piece, in bar order, through practice and reading", async () => {
  const { savePassage, removePassage, JOURNAL_PASSAGES } = await import(
    "../src/journal.mjs"
  );
  let j = savePassage(emptyJournal(), {
    id: "apa",
    title: "Appassionata",
    from: 140,
    to: 118,
    at: at("2026-09-26"),
  });
  j = savePassage(j, { id: "apa", from: 29, to: 33 });
  j = savePassage(j, { id: "apa", from: 29, to: 33 });
  assert.deepEqual(j.pieces.apa.passages, [
    [29, 33],
    [118, 140],
  ]);
  assert.equal(j.pieces.apa.title, "Appassionata");
  assert.equal(j.pieces.apa.sessions, 0);
  // Practice keeps them, and so does reading the journal back.
  j = recordPractice(j, { id: "apa", minutes: 2, from: 118, to: 125 });
  assert.equal(j.pieces.apa.passages.length, 2);
  const read = readJournal(JSON.parse(JSON.stringify(j)));
  assert.equal(read.invalid, false);
  assert.deepEqual(read.journal.pieces.apa.passages, j.pieces.apa.passages);
  j = removePassage(j, { id: "apa", from: 29, to: 33 });
  assert.deepEqual(j.pieces.apa.passages, [[118, 140]]);
  j = removePassage(j, { id: "apa", from: 118, to: 140 });
  assert.equal(j.pieces.apa.passages, undefined);
  // A full list takes no more, and a damaged list is not trusted.
  let full = emptyJournal();
  for (let i = 1; i <= JOURNAL_PASSAGES; i++)
    full = savePassage(full, { id: "p", from: i * 10, to: i * 10 + 3 });
  assert.equal(savePassage(full, { id: "p", from: 1, to: 2 }), full);
  const bad = readJournal({
    pieces: {
      p: {
        minutes: 1,
        sessions: 1,
        last: "2026-09-26T10:00:00.000Z",
        bar: 1,
        ranges: [],
        passages: [[9, 3]],
      },
    },
  });
  assert.equal(bad.invalid, true);
  assert.deepEqual(bad.journal.pieces, {});
});

test("judged bar passes become trouble spots on the piece, and practice keeps them", () => {
  let j = recordPractice(emptyJournal(), {
    id: "spot-1",
    title: "Sonata",
    minutes: 3,
    from: 1,
    to: 8,
    at: at("2026-10-05", "09:00"),
  });
  const untouched = j;
  j = recordBarPasses(j, {
    id: "spot-1",
    passes: [
      { bar: 4, clean: false },
      { bar: 5, clean: true },
      { bar: 4, clean: false },
    ],
    at: at("2026-10-05", "09:10"),
  });
  assert.notEqual(j, untouched);
  assert.deepEqual(untouched.pieces["spot-1"].spots, undefined, "the old journal is untouched");
  assert.deepEqual(j.pieces["spot-1"].spots, {
    4: { p: 2, s: 2, r: "xx", last: "2026-10-05" },
    5: { p: 1, s: 0, r: ".", last: "2026-10-05" },
  });
  assert.equal(j.pieces["spot-1"].minutes, 3, "minutes are not touched");
  assert.equal(j.pieces["spot-1"].sessions, 1);
  // More practice later keeps the memory and the title.
  j = recordPractice(j, {
    id: "spot-1",
    minutes: 2,
    from: 1,
    to: 12,
    at: at("2026-10-06", "09:00"),
  });
  assert.equal(j.pieces["spot-1"].spots[4].r, "xx");
  assert.equal(j.pieces["spot-1"].title, "Sonata");
  // Saving and forgetting a passage keep it too.
  j = savePassage(j, { id: "spot-1", from: 3, to: 5, at: at("2026-10-06") });
  j = removePassage(j, { id: "spot-1", from: 3, to: 5 });
  assert.equal(j.pieces["spot-1"].spots[4].s, 2);
  // Nothing to record leaves the same journal.
  assert.equal(recordBarPasses(j, { id: "spot-1", passes: [] }), j);
  assert.equal(recordBarPasses(j, { id: "bad id!", passes: [{ bar: 1, clean: true }] }), j);
  assert.equal(recordBarPasses(j, { id: "spot-1", passes: [{ bar: 0, clean: true }] }), j);
  // A piece unknown to the journal starts an entry just for its spots.
  const fresh = recordBarPasses(emptyJournal(), {
    id: "new-piece",
    title: "New",
    passes: [{ bar: 2, clean: false }],
    at: at("2026-10-05"),
  });
  assert.equal(fresh.pieces["new-piece"].minutes, 0);
  assert.equal(fresh.pieces["new-piece"].title, "New");
  assert.deepEqual(Object.keys(fresh.pieces["new-piece"].spots), ["2"]);
});

test("forgetting spots removes a range, and the field goes when empty", () => {
  let j = recordBarPasses(emptyJournal(), {
    id: "f",
    passes: [
      { bar: 2, clean: false },
      { bar: 2, clean: false },
      { bar: 9, clean: false },
    ],
    at: at("2026-10-05"),
  });
  const before = j;
  j = forgetPieceSpots(j, { id: "f", first: 3, last: 1 });
  assert.notEqual(j, before);
  assert.deepEqual(Object.keys(j.pieces.f.spots), ["9"]);
  assert.deepEqual(Object.keys(before.pieces.f.spots), ["2", "9"]);
  assert.equal(forgetPieceSpots(j, { id: "f", first: 20, last: 30 }), j);
  assert.equal(forgetPieceSpots(j, { id: "missing", first: 1, last: 2 }), j);
  j = forgetPieceSpots(j, { id: "f", first: 9, last: 9 });
  assert.equal("spots" in j.pieces.f, false);
});

test("damaged spots are dropped and flagged while the piece survives", () => {
  const piece = {
    minutes: 5,
    sessions: 2,
    last: "2026-10-05T09:00:00.000Z",
    bar: 7,
    ranges: [[1, 7]],
  };
  const { journal, invalid } = readJournal({
    pieces: {
      ok: { ...piece, spots: { 3: { p: 2, s: 2, r: "xx", last: "2026-10-05" } } },
      partly: {
        ...piece,
        spots: {
          3: { p: 2, s: 2, r: "xx", last: "2026-10-05" },
          4: { p: 1, s: 2, r: "x", last: "2026-10-05" },
        },
      },
      wrecked: { ...piece, spots: "all of them" },
      none: { ...piece, spots: {} },
    },
  });
  assert.equal(invalid, true);
  assert.deepEqual(Object.keys(journal.pieces), ["ok", "partly", "wrecked", "none"]);
  assert.deepEqual(journal.pieces.ok.spots, { 3: { p: 2, s: 2, r: "xx", last: "2026-10-05" } });
  assert.deepEqual(Object.keys(journal.pieces.partly.spots), ["3"]);
  assert.equal("spots" in journal.pieces.wrecked, false);
  assert.equal("spots" in journal.pieces.none, false);
  assert.equal(journal.pieces.wrecked.minutes, 5);
  const clean = readJournal({
    pieces: { ok: { ...piece, spots: { 3: { p: 2, s: 2, r: "xx", last: "2026-10-05" } } } },
  });
  assert.equal(clean.invalid, false);
});
