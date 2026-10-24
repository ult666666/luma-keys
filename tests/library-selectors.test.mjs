import test from "node:test";
import assert from "node:assert/strict";
import {
  hasRecordedPractice,
  libraryCollection,
  libraryView,
  practiceEntries,
} from "../src/library-selectors.mjs";

const saved = Object.freeze([
  Object.freeze({
    id: "saved-a",
    title: "晴天 · Sunny Day",
    composer: "Jay Chou",
    createdAt: "2026-01-01",
  }),
  Object.freeze({
    id: "saved-b",
    title: "Prelude",
    composer: "Bach",
    createdAt: "2026-01-03",
  }),
]);
const starters = Object.freeze([
  Object.freeze({ id: "starter-a", title: "Prelude", composer: "Bach" }),
]);

test("collection counts saved and starter scores separately and each identity once", () => {
  const collection = libraryCollection(
    [...saved, saved[0]],
    [...starters, saved[1]],
  );
  assert.deepEqual(collection.saved, saved);
  assert.deepEqual(collection.starters, starters);
  assert.equal(collection.all.length, 3);
  assert.equal(
    collection.all.filter((piece) => piece.title === "Prelude").length,
    2,
  );
});

test("a saved passage or resume place alone is not recorded practice", () => {
  const bookmark = {
    bar: 6,
    passages: [[6, 8]],
    minutes: 0,
    sessions: 0,
    ranges: [],
  };
  assert.equal(hasRecordedPractice(bookmark), false);
  assert.equal(hasRecordedPractice(null), false);
  assert.equal(hasRecordedPractice({ ...bookmark, minutes: 0.1 }), true);
  assert.equal(hasRecordedPractice({ ...bookmark, sessions: 1 }), true);
  assert.equal(hasRecordedPractice({ ...bookmark, ranges: [[2, 3]] }), true);
});

test("search, activity filter and counts use the same collection without mutating scores", () => {
  const journal = {
    pieces: {
      "saved-a": { minutes: 2, last: "2026-10-14" },
      "saved-b": { minutes: 0, sessions: 0, ranges: [], passages: [[1, 4]] },
      "starter-a": { sessions: 1, last: "2026-10-13" },
    },
  };
  const view = libraryView({
    library: saved,
    lessons: starters,
    journal,
    query: "ｐＲｅＬｕＤｅ",
    filter: "practised",
  });
  assert.equal(view.total, 3);
  assert.equal(view.visible, 1);
  assert.deepEqual(view.saved, []);
  assert.deepEqual(
    view.starters.map((piece) => piece.id),
    ["starter-a"],
  );
  const unplayed = libraryView({
    library: saved,
    lessons: starters,
    journal,
    filter: "unplayed",
  });
  assert.deepEqual(
    unplayed.saved.map((piece) => piece.id),
    ["saved-b"],
  );
  assert.deepEqual(
    libraryView({ library: saved, lessons: starters, journal, query: "晴天" })
      .saved,
    [saved[0]],
  );
  assert.deepEqual(
    saved.map((piece) => piece.id),
    ["saved-a", "saved-b"],
  );
});

test("history distinguishes available scores, removed scores, and combined exercises", () => {
  const journal = Object.freeze({
    pieces: Object.freeze({
      "saved-a": Object.freeze({ minutes: 3, last: "2026-10-12", bar: 2 }),
      removed: Object.freeze({
        minutes: 4,
        last: "2026-10-13",
        title: "Old score",
      }),
      exercises: Object.freeze({
        minutes: 5,
        last: "2026-10-14",
        title: "Exercises",
      }),
    }),
  });
  const entries = practiceEntries(
    journal,
    libraryCollection(saved, starters).all,
  );
  assert.deepEqual(
    entries.map(({ id, kind }) => [id, kind]),
    [
      ["exercises", "exercises"],
      ["removed", "removed"],
      ["saved-a", "piece"],
    ],
  );
  assert.equal(entries[2].score, saved[0]);
  assert.equal(entries[0].entry, journal.pieces.exercises);
  assert.equal(entries[1].score, null);
});
