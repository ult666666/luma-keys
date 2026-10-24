import test from "node:test";
import assert from "node:assert/strict";
import { buddyLine, buddySay, onBuddy, BUDDY_EVENTS } from "../src/buddy.mjs";

test("companion lines fill context and never repeat back-to-back", () => {
  const context = { name: "Liszt", title: "龙卷风", bar: 17, minutes: 12, character: "ballad", n: 25 };
  for (const event of BUDDY_EVENTS) {
    const a = buddyLine(event, context),
      b = buddyLine(event, context);
    assert.ok(a.length > 0 && a.length <= 140, event);
    assert.ok(!/\{\w+\}/.test(a), `${event} left a placeholder: ${a}`);
    assert.notEqual(a, b, `${event} repeated itself`);
  }
  assert.equal(buddyLine("no-such-event", context), "");
  // Missing context leaves no dangling punctuation or doubled spaces.
  assert.ok(!/\s[.,!?]|\s{2}/.test(buddyLine("welcome", {})));
});

test("the bus delivers bounded reactions and survives a failing listener", () => {
  const seen = [];
  const offBad = onBuddy(() => {
    throw Error("broken");
  });
  const off = onBuddy((event) => seen.push(event));
  buddySay("  Hello!  ", { mood: "listening", burst: "hearts" });
  buddySay("");
  buddySay("x".repeat(500));
  off();
  offBad();
  buddySay("after unsubscribe");
  assert.equal(seen.length, 2);
  assert.equal(seen[0].text, "Hello!");
  assert.equal(seen[0].mood, "listening");
  assert.equal(seen[0].burst, "hearts");
  assert.equal(seen[1].text.length, 140);
});
