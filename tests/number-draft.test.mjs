import test from "node:test";
import assert from "node:assert/strict";
import {
  liveValue,
  settledValue,
  repeatFromFirst,
  repeatFromLast,
} from "../src/number-draft.mjs";

// Replays typing into a DraftNumber: each keystroke commits only a whole
// value inside the live range; leaving the field settles what is left.
function type(keys, { value, min, max, settle }) {
  let text = "";
  for (const key of keys) {
    text += key;
    const n = liveValue(text, { min, max });
    if (n != null) value = n;
  }
  const n = settledValue(text, {
    min: settle?.min ?? min,
    max: settle?.max ?? max,
    fallback: value,
  });
  return n;
}

test("typing 12 into a last-bar field whose first bar is 3 gives 12, not 32 or 22", () => {
  assert.equal(type("12", { value: 4, min: 3, max: 71 }), 12);
  // The old field clamped every keystroke: "1" became 3, then "32".
  assert.equal(liveValue("1", { min: 3, max: 71 }), null);
  assert.equal(liveValue("12", { min: 3, max: 71 }), 12);
});

test("a first bar past the last bar settles there and takes the last bar along", () => {
  const first = type("10", { value: 1, min: 1, max: 4, settle: { min: 1, max: 71 } });
  assert.equal(first, 10);
  assert.deepEqual(repeatFromFirst(first, 4), [10, 10]);
  assert.deepEqual(repeatFromFirst(2, 4), [2, 4]);
  assert.deepEqual(repeatFromLast(10, 5), [5, 5]);
  assert.deepEqual(repeatFromLast(3, 12), [3, 12]);
});

test("an exercise tempo of 120 can be typed (the old field turned it into 200)", () => {
  assert.equal(type("120", { value: 80, min: 30, max: 200 }), 120);
  assert.equal(liveValue("1", { min: 30, max: 200 }), null);
  assert.equal(liveValue("12", { min: 30, max: 200 }), null);
  assert.equal(type("25", { value: 80, min: 30, max: 200 }), 30);
  assert.equal(type("999", { value: 80, min: 30, max: 200 }), 200);
});

test("empty or partial drafts fall back to the current value", () => {
  assert.equal(settledValue("", { min: 1, max: 9, fallback: 4 }), 4);
  assert.equal(settledValue("-", { min: 1, max: 9, fallback: 4 }), 4);
  assert.equal(liveValue("2.5", { min: 1, max: 9 }), null);
  assert.equal(settledValue("2.5", { min: 1, max: 9, fallback: 4 }), 3);
  assert.equal(liveValue(" 7 ", { min: 1, max: 9 }), 7);
});
