import assert from "node:assert/strict";
import test from "node:test";
import {
  pitchRange,
  fitKeyboard,
  notesInWindow,
  keyLights,
  dynamicMark,
  hasDynamics,
  velocityScale,
  judgePress,
  WHITE_COUNT,
  cameraFrame,
  clampCenter,
  inView,
  handZones,
} from "../src/keyboard-stage.mjs";

const note = (midi, beat, duration = 1, extra = {}) => ({
  id: `${midi}@${beat}`,
  midi,
  beat,
  duration,
  hand: midi < 60 ? "left" : "right",
  velocity: 0.72,
  ...extra,
});

test("the piece's range fits the window without scrolling when keys stay readable", () => {
  // 晴天 concert arrangement: E1 to E6 in a 1448px stage.
  const fit = fitKeyboard({ low: 28, high: 88 }, 1448);
  assert.ok(fit.fits);
  assert.ok(fit.keyWidth >= 30 && fit.keyWidth <= 64, String(fit.keyWidth));
  assert.equal(fit.stripWidth, fit.keyWidth * WHITE_COUNT);
  // The framed window starts at or before the padded low key and reaches the high one.
  const firstVisible = fit.scrollLeft / fit.keyWidth;
  assert.ok(firstVisible <= fit.first + 1e-6);
  assert.ok(firstVisible + 1448 / fit.keyWidth >= fit.last + 1 - 1e-6);
});

test("a small range grows the keys to the maximum and fills the window with neighbours", () => {
  const fit = fitKeyboard({ low: 60, high: 69 }, 1200);
  assert.equal(fit.keyWidth, 64);
  assert.ok(fit.fits);
  // Twinkle's C4–A4 stays centred.
  const center = fit.scrollLeft / fit.keyWidth + 1200 / fit.keyWidth / 2;
  assert.ok(Math.abs(center - (fit.first + fit.last + 1) / 2) < 1e-6);
});

test("a full-range piece keeps readable keys and scrolls instead of shrinking", () => {
  const fit = fitKeyboard({ low: 21, high: 108 }, 1200);
  assert.equal(fit.keyWidth, 30);
  assert.equal(fit.fits, false);
  assert.ok(fit.stripWidth > 1200);
  // Narrow screens ask for bigger minimum keys.
  assert.equal(fitKeyboard({ low: 60, high: 72 }, 390, { minKey: 40 }).keyWidth, 40);
});

test("the strip never leaves empty space beside the 88 keys", () => {
  const huge = fitKeyboard({ low: 60, high: 62 }, 4000);
  assert.ok(huge.stripWidth >= 4000);
  assert.equal(huge.scrollLeft, 0);
  const high = fitKeyboard({ low: 100, high: 108 }, 1000);
  assert.ok(high.scrollLeft + 1000 <= high.stripWidth + 1e-6);
});

test("pitch range ignores notes outside the piano", () => {
  assert.equal(pitchRange([]), null);
  assert.deepEqual(pitchRange([note(64, 0), note(40, 1), note(200, 2)]), {
    low: 40,
    high: 64,
  });
});

test("the note window includes long notes that started before it", () => {
  const notes = [note(48, 0, 8), note(60, 1), note(62, 2), note(64, 6)];
  assert.deepEqual(
    notesInWindow(notes, 3, 5).map((n) => n.midi),
    [48],
  );
  assert.deepEqual(
    notesInWindow(notes, 1.5, 6.5).map((n) => n.midi),
    [48, 60, 62, 64],
  );
});

test("key lights show what sounds now, how much of it remains, and what is coming", () => {
  const notes = [note(60, 0, 2), note(64, 1.5), note(67, 3)];
  const lights = keyLights(notes, 0.5, { ahead: 2 });
  assert.equal(lights.get(60).on, true);
  assert.ok(Math.abs(lights.get(60).hold - 0.75) < 1e-9);
  assert.equal(lights.get(64).on, false);
  assert.ok(Math.abs(lights.get(64).soon - 0.5) < 1e-9);
  assert.equal(lights.get(64).soonHand, "right");
  assert.equal(lights.has(67), false, "beyond the look-ahead");
  // A repeated pitch can be sounding and approaching at the same time.
  const repeated = keyLights([note(60, 0, 1), note(60, 1, 1)], 0.5, {
    ahead: 1,
  });
  assert.equal(repeated.get(60).on, true);
  assert.ok(repeated.get(60).soon > 0.49);
});

test("dynamic marks follow the importer's velocity scale", () => {
  const velocity = (d) => (d * 0.9) / 127;
  assert.deepEqual(
    [36, 54, 71, 89, 106, 124].map((d) => dynamicMark(velocity(d))),
    ["pp", "p", "mp", "mf", "f", "ff"],
  );
  assert.equal(hasDynamics([note(60, 0), note(62, 1)]), false);
  assert.equal(hasDynamics([note(60, 0, 1, { velocity: 0.38 })]), true);
  assert.equal(
    hasDynamics([note(60, 0), note(62, 1, 1, { velocity: 0.88 })]),
    true,
  );
  const scale = velocityScale([
    note(60, 0, 1, { velocity: 0.38 }),
    note(62, 1, 1, { velocity: 0.88 }),
  ]);
  assert.equal(scale(0.38), 0.55);
  assert.equal(scale(0.88), 1);
  assert.equal(velocityScale([note(60, 0)])(0.72), 0.85);
});

test("presses are judged with the report card's timing windows", () => {
  const notes = [note(60, 0), note(62, 1), note(64, 2)];
  const secondsPerBeat = 0.5; // on time within 0.2 beat, counted within 0.5
  const judge = (midi, beat, mode = "perform") =>
    judgePress({ midi, beat, mode, notes, secondsPerBeat }).kind;
  assert.equal(judge(62, 1.05), "hit");
  assert.equal(judge(62, 0.7), "early");
  assert.equal(judge(62, 1.4), "late");
  assert.equal(judge(65, 1), "miss");
  assert.equal(judge(62, 2.2), "miss", "too far from any D");
  // Listen mode praises playing along and never scolds free play.
  assert.equal(judge(64, 2.1, "listen"), "hit");
  assert.equal(judge(71, 2.1, "listen"), "play");
  // Wait mode checks only the notes it is waiting for.
  const targets = [note(60, 0), note(64, 0)];
  assert.equal(
    judgePress({ midi: 64, beat: 0, mode: "wait", targets }).kind,
    "hit",
  );
  assert.equal(
    judgePress({ midi: 62, beat: 0, mode: "wait", targets }).kind,
    "miss",
  );
});

test("the camera frames the coming notes as large as they fit", () => {
  const n = (midi, beat, hand = "right") => ({ midi, beat, duration: 0.5, hand });
  // One hand around middle C: keys at their largest.
  const close = cameraFrame([n(60, 0), n(64, 0.5), n(67, 1)], 1240, { maxKey: 68 });
  assert.equal(close.keyWidth, 68);
  assert.ok(inView(close.first, close.last, close.center, close.keyWidth, 1240));
  // Both hands four octaves apart: zoomed out just enough to show both.
  const wide = cameraFrame([n(36, 0, "left"), n(84, 0)], 1240, { maxKey: 68 });
  assert.ok(wide.keyWidth < 40 && wide.keyWidth >= 30, String(wide.keyWidth));
  assert.ok(inView(wide.first, wide.last, wide.center, wide.keyWidth, 1240));
  // Never beyond the ends of the keyboard, and nothing to frame is no frame.
  const low = cameraFrame([n(21, 0)], 1240, { maxKey: 68 });
  assert.equal(low.center, clampCenter(0, low.keyWidth, 1240));
  assert.equal(cameraFrame([], 1240), null);
});

test("hand zones show where each hand plays and where it jumps next", () => {
  const n = (midi, beat, hand, duration = 0.25) => ({ midi, beat, duration, hand });
  const notes = [
    n(60, 0, "right"),
    n(64, 0.25, "right"),
    n(67, 0.5, "right"),
    n(65, 2, "right"), // a step, not a jump
    n(84, 3, "right"),
    n(88, 3, "right"),
    n(48, 0, "left", 2),
    n(36, 3.5, "left"),
  ];
  const zones = handZones(notes, 0, { ahead: 4 });
  assert.deepEqual(
    { lo: zones.right.lo, hi: zones.right.hi },
    { lo: 60, hi: 67 },
    "the right hand spans the notes of the next beat",
  );
  assert.deepEqual(zones.right.next, { lo: 84, hi: 88, beat: 3 });
  assert.equal(zones.left.lo, 48);
  assert.deepEqual(zones.left.next, { lo: 36, hi: 36, beat: 3.5 });
  // Far jumps beyond the look-ahead are not announced yet.
  assert.equal(handZones(notes, 0, { ahead: 2 }).right.next, null);
  // A hand resting until later shows where it will come in.
  const later = handZones([n(72, 3, "right")], 0, { ahead: 4 });
  assert.equal(later.right.resting, true);
  assert.equal(later.right.lo, 72);
  assert.equal(later.left, undefined);
});

test("accents stand out from the same hand's music around them", async () => {
  const { accentedNotes } = await import("../src/keyboard-stage.mjs");
  const run = (hand, from, velocities) =>
    velocities.map((velocity, i) => ({
      id: `${hand}${from + i}`,
      hand,
      beat: from + i * 0.5,
      velocity,
      midi: 60,
    }));
  const notes = [
    ...run("right", 0, [0.5, 0.5, 0.5, 0.8, 0.5, 0.5, 0.5]),
    // A steady crescendo has no accents.
    ...run("left", 0, [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]),
  ];
  assert.deepEqual([...accentedNotes(notes)], ["right3"]);
  // Too few neighbours to judge: nothing is marked.
  assert.equal(accentedNotes(run("right", 0, [0.3, 0.9])).size, 0);
  assert.equal(accentedNotes([]).size, 0);
});

test("the pedal is found by the beat it holds", async () => {
  const { pedalAt } = await import("../src/keyboard-stage.mjs");
  const pedals = [
    { start: 0, end: 9 },
    { start: 12, end: 14 },
  ];
  assert.deepEqual(pedalAt(pedals, 0), pedals[0]);
  assert.equal(pedalAt(pedals, 9), null);
  assert.deepEqual(pedalAt(pedals, 13.5), pedals[1]);
  assert.equal(pedalAt(undefined, 3), null);
});

test("dynamic marks settle on levels and join swells into hairpins", async () => {
  const { dynamicMarks } = await import("../src/keyboard-stage.mjs");
  let id = 0;
  const run = (from, beats, velocity, step = 0.5) =>
    Array.from({ length: Math.round(beats / step) }, (_, i) => ({
      id: "n" + id++,
      midi: 60 + (i % 5),
      beat: from + i * step,
      duration: step,
      hand: i % 2 ? "left" : "right",
      velocity: typeof velocity === "function" ? velocity(i) : velocity,
    }));
  const simple = dynamicMarks([...run(0, 8, 0.88), ...run(8, 8, 0.38)]);
  assert.deepEqual(
    simple.map((m) => [m.kind, m.beat, m.mark]),
    [
      ["level", 0, "ff"],
      ["level", 8, "p"],
    ],
  );
  // p, then a crescendo over six beats, then f.
  const swell = dynamicMarks([
    ...run(0, 8, 0.38),
    ...run(8, 6, (i) => 0.4 + (i / 12) * 0.38),
    ...run(14, 8, 0.78),
  ]);
  assert.deepEqual(
    swell.map((m) => [m.kind, m.mark ?? null]),
    [
      ["level", "p"],
      ["cresc", null],
      ["level", "f"],
    ],
  );
  const hairpin = swell[1];
  assert.ok(hairpin.beat >= 7 && hairpin.beat < 9, JSON.stringify(hairpin));
  assert.ok(hairpin.end > 12 && hairpin.end <= 15, JSON.stringify(hairpin));
  // After a rest the new level simply starts; there is no hairpin.
  const rest = dynamicMarks([...run(0, 6, 0.38), ...run(10, 6, 0.8)]);
  assert.deepEqual(
    rest.map((m) => m.kind),
    ["level", "level"],
  );
  // An accent is not a new level.
  const accent = run(0, 12, 0.38);
  accent[10].velocity = 0.96;
  assert.deepEqual(
    dynamicMarks(accent).map((m) => m.mark),
    ["p"],
  );
  assert.deepEqual(dynamicMarks([]), []);
});
