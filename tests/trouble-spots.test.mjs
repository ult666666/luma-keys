import test from "node:test";
import assert from "node:assert/strict";
import {
  JOURNAL_SPOTS,
  SPOT_RECENT,
  barCleared,
  barTrouble,
  barTroubled,
  clearedBars,
  describeSpot,
  forgetSpots,
  readSpots,
  recordPasses,
  spotBars,
  spotLabel,
  troubleSpots,
} from "../src/trouble-spots.mjs";

const at = (day, time = "12:00") => new Date(`${day}T${time}:00`);
const spot = (r, extra = {}) => ({
  p: r.length,
  s: (r.match(/x/g) || []).length,
  r,
  last: "2026-10-05",
  ...extra,
});
// Several judged passes of one bar, in order ("x" slipped, "." clean).
const passes = (bar, outcomes) =>
  [...outcomes].map((o) => ({ bar, clean: o === "." }));

test("passes are remembered per bar with a bounded recent window", () => {
  let spots = recordPasses({}, passes(4, "x.x"), { at: at("2026-10-01") });
  assert.deepEqual(spots, { 4: { p: 3, s: 2, r: "x.x", last: "2026-10-01" } });
  spots = recordPasses(spots, passes(4, "......x...."), {
    at: at("2026-10-05"),
  });
  const entry = spots[4];
  assert.equal(entry.p, 14);
  assert.equal(entry.s, 3);
  assert.equal(entry.r.length, SPOT_RECENT);
  assert.equal(entry.r, "...x....", "the latest passes are kept, latest last");
  assert.equal(entry.last, "2026-10-05");
});

test("nothing recordable leaves the same memory; bad passes are skipped", () => {
  const before = { 2: spot("xx") };
  assert.equal(recordPasses(before, []), before);
  assert.equal(recordPasses(before, "nope"), before);
  assert.equal(
    recordPasses(before, [
      { bar: 0, clean: true },
      { bar: 1.5, clean: false },
    ]),
    before,
  );
  assert.equal(recordPasses(before, [{ bar: 3 }]), before);
  assert.equal(
    recordPasses(before, [{ bar: 3, clean: true }], { at: "not a date" }),
    before,
  );
  const after = recordPasses(before, [
    { bar: 3, clean: true },
    { bar: "7", clean: false },
  ]);
  assert.notEqual(after, before);
  assert.deepEqual(Object.keys(after), ["2", "3"]);
  assert.deepEqual(before, { 2: spot("xx") }, "the old memory is untouched");
});

test("trouble weighs the latest passes most and clears after three clean passes", () => {
  assert.equal(barTrouble(spot("x")), 1);
  assert.equal(barTrouble(spot(".")), 0);
  // weights 1..5 over "x.xx.": slips at 1, 3 and 4 of 15.
  assert.ok(Math.abs(barTrouble(spot("x.xx.")) - 8 / 15) < 1e-9);
  // The same slips, older, trouble less: "xx..." is 3 of 15.
  assert.ok(barTrouble(spot("xx..")) < barTrouble(spot("..xx")));
  assert.equal(barCleared(spot("xx...")), true);
  assert.equal(barTrouble(spot("xx...")), 0, "a cleared bar has no trouble");
  assert.equal(barCleared(spot("xx..")), false);
  assert.equal(barCleared(spot("..")), false, "two passes cannot clear");
});

test("a spot needs two recent slips and a real slip rate", () => {
  assert.equal(barTroubled(spot("x")), false, "one slip is not a pattern");
  assert.equal(barTroubled(spot("xx")), true);
  assert.equal(barTroubled(spot(".x.x.x.x")), true);
  assert.equal(barTroubled(spot("xx......")), false, "cleared");
  assert.equal(
    barCleared(spot("xx..")),
    false,
    "two clean passes do not clear",
  );
  assert.equal(
    barTroubled(spot("xx..")),
    false,
    "but two clean passes already outweigh two older slips: 3 of 10",
  );
  assert.equal(barTroubled(spot("xxx..")), true, "6 of 15, right at the line");
  assert.equal(barTroubled(spot(".xx.")), true, "5 of 10");
  assert.equal(barTroubled(spot("x......x")), false, "one old slip, one new");
  assert.equal(barTroubled(spot("xx.....x")), false, "rate too low: 11 of 36");
  assert.equal(barTroubled(null), false);
});

test("troubled bars group into spots, a lone clean bar joins neighbours, and long runs split", () => {
  const spots = {
    3: spot("xx"),
    12: spot("x.x"),
    14: spot("xxx"),
    20: spot("xx"),
    21: spot("xx"),
    22: spot("xx"),
    23: spot("xx"),
    24: spot("xx"),
    25: spot("xx"),
    40: spot("xx..."), // cleared
    41: spot("x"), // a single slip
  };
  const found = troubleSpots(spots, { limit: null });
  assert.deepEqual(
    found.map((s) => [s.first, s.last]),
    [
      [20, 22],
      [23, 25],
      [12, 14],
      [3, 3],
    ],
    "strongest first; 20–25 splits into two balanced spots",
  );
  const bridged = found.find((s) => s.first === 12);
  assert.deepEqual(bridged.bars, [12, 14], "bar 13 is not itself troubled");
  assert.equal(bridged.worst, 14);
  assert.equal(bridged.slips, 3);
  assert.equal(bridged.passes, 3);
  assert.equal(troubleSpots(spots).length, 3, "three by default");
  assert.deepEqual(
    troubleSpots(spots, { measures: 13 }).map((s) => [s.first, s.last]),
    [
      [3, 3],
      [12, 12],
    ],
    "a shorter replacement score hides later bars; bar 3 (slipped twice of two) outranks bar 12",
  );
  assert.deepEqual(troubleSpots(null), []);
  assert.deepEqual(troubleSpots({}), []);
});

test("spots of equal trouble put the most recently judged first", () => {
  const spots = {
    8: spot("xx", { last: "2026-10-01" }),
    30: spot("xx", { last: "2026-10-05" }),
  };
  assert.deepEqual(
    troubleSpots(spots).map((s) => s.first),
    [30, 8],
  );
});

test("the piece map gets each troubled bar with its recent slips", () => {
  const bars = spotBars({ 5: spot("x.x"), 6: spot("x"), 7: spot("xx...") }, 10);
  assert.deepEqual([...bars.keys()], [5]);
  assert.deepEqual(bars.get(5), { trouble: 4 / 6, slips: 2, passes: 3 });
  assert.equal(spotBars({ 50: spot("xx") }, 20).size, 0);
  assert.equal(spotBars(null).size, 0);
});

test("spots describe themselves plainly", () => {
  assert.equal(
    describeSpot({ slips: 3, passes: 5 }),
    "slipped 3 of the last 5 passes",
  );
  assert.equal(
    describeSpot({ slips: 2, passes: 2 }),
    "slipped the last 2 times",
  );
  assert.equal(describeSpot({ slips: 1, passes: 1 }), "slipped last time");
  assert.equal(describeSpot({ slips: 0, passes: 0 }), "");
  assert.equal(spotLabel({ first: 4, last: 4 }), "bar 4");
  assert.equal(spotLabel({ first: 4, last: 6 }), "bars 4–6");
});

test("forgetting removes a range and keeps the rest", () => {
  const before = { 4: spot("xx"), 5: spot("xx"), 9: spot("xx") };
  const after = forgetSpots(before, 5, 4);
  assert.deepEqual(Object.keys(after), ["9"]);
  assert.deepEqual(Object.keys(before), ["4", "5", "9"]);
  assert.equal(forgetSpots(before, 20, 30), before, "nothing to forget");
  assert.equal(forgetSpots(null, 1, 2), null);
});

test("cleared bars are counted once they were real spots", () => {
  assert.equal(
    clearedBars({ 1: spot("xx..."), 2: spot("x..."), 3: spot("xx") }),
    1,
  );
  assert.equal(clearedBars(null), 0);
});

test("reading drops damaged bars and flags them, keeping the rest", () => {
  const good = { p: 3, s: 2, r: "x.x", last: "2026-10-05" };
  const { spots, invalid } = readSpots({
    7: good,
    0: good,
    7.5: good,
    "-3": good,
    8: { ...good, s: 4 },
    9: { ...good, r: "x.y" },
    10: { ...good, r: "x".repeat(SPOT_RECENT + 1) },
    11: { ...good, last: "2026-02-30" },
    12: { ...good, p: 2 }, // fewer passes than remembered outcomes
    13: { ...good, s: 1 }, // fewer slips than remembered
    14: "x.x",
    15: { ...good, p: 1e9 + 1 },
    16: { p: 0, s: 0, r: "", last: "2026-10-05" },
  });
  assert.deepEqual(spots, {
    7: good,
    16: { p: 0, s: 0, r: "", last: "2026-10-05" },
  });
  assert.equal(invalid, true);
  assert.deepEqual(readSpots({ 7: good }), {
    spots: { 7: good },
    invalid: false,
  });
  assert.deepEqual(readSpots([]), { spots: {}, invalid: true });
  assert.deepEqual(readSpots("spots"), { spots: {}, invalid: true });
});

test("a piece keeps a bounded number of bars, troubled and recent first", () => {
  let spots = {};
  for (let bar = 1; bar <= JOURNAL_SPOTS + 20; bar++)
    spots[bar] = spot(bar % 3 === 0 ? "xx" : "x....", {
      last: bar <= 10 ? "2026-09-01" : "2026-10-05",
    });
  const read = readSpots(spots);
  assert.equal(read.invalid, false, "over-long memories are pruned quietly");
  const kept = Object.keys(read.spots).map(Number);
  assert.equal(kept.length, JOURNAL_SPOTS);
  for (let bar = 3; bar <= JOURNAL_SPOTS + 20; bar += 3)
    assert.ok(kept.includes(bar), `troubled bar ${bar} is kept`);
  assert.ok(
    !kept.includes(1) && !kept.includes(2),
    "stale clean bars go first",
  );
  // Recording into a full memory prunes the same way.
  const more = recordPasses(read.spots, passes(99999, "xx"));
  assert.equal(Object.keys(more).length, JOURNAL_SPOTS);
  assert.ok(more[99999]);
});
