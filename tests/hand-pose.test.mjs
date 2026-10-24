import test from "node:test";
import assert from "node:assert/strict";
import {
  handTimeline,
  handMotion,
  handPose,
  handPoses,
  handPlan,
  poseSignature,
  keyCentre,
  DEFAULT_CLOCK,
  HAND_BUILD,
} from "../src/hand-pose.mjs";
import { scenarioInputs, posesAt, poseOptions } from "../scripts/hand-lab-scenario.mjs";
import { fingerForm, drawHand } from "../src/hand-draw.mjs";
import { clockMap } from "../src/tempo.mjs";
import { demos } from "../src/music.mjs";
import { readFileSync, readdirSync } from "node:fs";

const note = (id, midi, beat, duration, hand = "right") => ({
  id,
  midi,
  beat,
  duration,
  hand,
});
const close = (a, b, message) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

test("written Appassionata holds survive contiguous reattacks without hiding the hand", () => {
  const notes = [note("a", 64, 0, 1.5), note("b", 64, 1.5, 0.5), note("c", 64, 2, 1.5)];
  const snapshot = structuredClone(notes);
  const steps = handTimeline(notes, new Map(notes.map(n => [n.id, 3])), "right");
  const clock = { key: "written-144", speed: 1, toSeconds: b => b * 60 / 144, toBeat: s => s * 144 / 60 };
  const plan = handPlan(steps, "right", { clock });
  close(plan.engagements[0].release, 0.625, "first written dotted-quarter end");
  close(plan.engagements[1].release, 5 / 6, "second written eighth-note end");
  assert.equal(plan.engagements[0].articulation, "continuous-contact", "zero-gap reattack states its physical limitation");
  assert.deepEqual(plan.guidanceIntervals, [], "ordinary repeats keep Natural visible");
  for (const beat of [1.3, 1.4999, 1.5, 1.9, 1.9999, 2]) {
    const pose = handPose(steps, beat, "right", { keyWidth: 40, keysHeight: 190, bedHeight: 250, clock });
    assert.equal(pose.guidanceOnly, false, `visible at ${beat}`);
    assert.equal(pose.fingers[2].state, "down", `written contact at ${beat}`);
  }
  assert.deepEqual(notes, snapshot, "score timings are not mutated");
});

test("a repeated note uses only its written rest for the lift", () => {
  const steps = handTimeline([note("a", 60, 0, 0.45), note("b", 60, 0.5, 0.45)], new Map([["a", 1], ["b", 1]]), "right");
  const clock = { key: "written-100", speed: 1, toSeconds: b => b * 0.6, toBeat: s => s / 0.6 };
  const plan = handPlan(steps, "right", { clock });
  close(plan.engagements[0].release, 0.27, "the 30 ms gap cannot borrow from the note");
  for (const beat of [0.38, 0.4499]) assert.equal(handMotion(steps, beat, "right", { clock }).fingers[0].down, true);
  assert.equal(handMotion(steps, 0.475, "right", { clock }).fingers[0].down, false, "lift inside the actual rest");
  assert.equal(handMotion(steps, 0.5, "right", { clock }).fingers[0].down, true, "next attack is unchanged");
});

test("the actual Appassionata opening keeps both hands visible through every repeat", () => {
  const notes = [[0, 1.5], [1.5, 0.5], [2, 1.5], [3.5, 0.5], [4, 0.75], [4.75, 0.25], [5, 0.75], [5.75, 0.25], [6, 0.75]]
    .flatMap(([beat, duration], i) => [[46, "left"], [55, "left"], [64, "right"], [73, "right"]]
      .map(([midi, hand], j) => note(`n${i * 4 + j}`, midi, beat, duration, hand)));
  for (const speed of [0.5, 1]) {
    const input = scenarioInputs({ id: "Appassionata-opening", bpm: 144, notes }, { speed });
    for (let frame = 0; frame <= 720; frame++) {
      const beat = frame / 120;
      const poses = posesAt(input, beat, { keyWidth: 40, keysHeight: 190, bedHeight: 250 });
      for (const hand of ["left", "right"]) {
        const pose = poses[hand];
        assert.equal(pose.guidanceOnly, false, `${hand} visible at ${beat}, speed ${speed}`);
        const expected = notes.filter(n => n.hand === hand && n.beat <= beat && beat < n.beat + n.duration).map(n => n.midi);
        const motion = handMotion(input.steps[hand], beat, hand, { clock: input.clock });
        assert.deepEqual(motion.fingers.filter(f => f.down).map(f => f.midi).sort((a, b) => a - b), expected,
          `all written keys held at ${beat}`);
      }
    }
  }
});

test("wait mode hovers at a contiguous repeat while listen mode preserves contact", () => {
  const steps = handTimeline([note("a", 60, 0, 1), note("b", 60, 1, 1)], new Map([["a", 1], ["b", 1]]), "right");
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
  assert.equal(handPose(steps, 0.9999, "right", geometry).fingers[0].state, "down");
  assert.equal(handPose(steps, 1, "right", geometry).fingers[0].state, "down");
  assert.equal(handPose(steps, 1, "right", { ...geometry, waiting: true }).fingers[0].state, "ready");
});

test("a zero-gap different-key reuse stays visible and travels after release instead of teleporting", () => {
  const steps = handTimeline([note("a", 60, 0, 1), note("b", 62, 1, 1)], new Map([["a", 3], ["b", 3]]), "right");
  const plan = handPlan(steps, "right");
  close(plan.engagements[0].release, 0.5, "the old written hold is intact");
  close(plan.contacts[1].onset, 0.5, "the new score attack is intact");
  assert.equal(plan.engagements[1].articulation, "late-contact");
  assert.ok(plan.engagements[1].contactAt > 0.5);
  assert.deepEqual(plan.guidanceIntervals, [], "an incompatible finger change does not hide the hand");
  let previous = handMotion(steps, 0.4999 / 0.5, "right").fingers[2].x;
  for (let t = 0.5; t < plan.engagements[1].contactAt; t += 0.0001) {
    const finger = handMotion(steps, t / 0.5, "right").fingers[2];
    assert.equal(finger.down, false, "the physical contact is honestly late");
    assert.ok(Math.abs(finger.x - previous) < 0.02, "no instantaneous key reassignment");
    previous = finger.x;
  }
  const landed = handMotion(steps, plan.engagements[1].contactAt / 0.5, "right").fingers[2];
  assert.equal(landed.down, true);
  assert.equal(landed.midi, 62);
  close(landed.x, keyCentre(62), "the delayed physical landing reaches its actual key");
});

test("an overlapping same-key reattack transfers physical ownership without changing either score duration", () => {
  const notes = [note("old", 60, 0, 2), note("new", 60, 1, 1)];
  const snapshot = structuredClone(notes);
  const steps = handTimeline(notes, new Map([["old", 3], ["new", 1]]), "right");
  for (const beat of [1, 1.1, 1.9]) {
    const motion = handMotion(steps, beat, "right");
    assert.deepEqual(motion.fingers.filter(f => f.down).map(f => [f.finger, f.midi]), [[1, 60]], "only the latest attack owns the physical key");
  }
  assert.equal(handMotion(steps, 0.9999, "right").fingers[2].down, true, "the old owner holds until the exact new attack");
  const plan = handPlan(steps, "right");
  close(plan.engagements[0].end, 1, "original written end remains available");
  close(plan.engagements[0].release, 0.5, "ownership transfers at the new attack, never before");
  assert.deepEqual(plan.contacts.map(c => [c.onset, c.end]), [[0, 1], [0.5, 1]]);
  assert.deepEqual(notes, snapshot);
});

test("an expired impossible contact cannot replace the current wait chord or leave a stale key target", () => {
  const notes = [note("a", 60, 0, 1), note("impossible", 84, 1, 0.1), note("current", 60, 1.1, 1)];
  const steps = handTimeline(notes, new Map(notes.map(n => [n.id, 3])), "right");
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
  const plan = handPlan(steps, "right");
  assert.ok(plan.engagements[1].contactAt > 0.55, "the fixture cannot physically arrive before the note ends");
  for (const since of [0, 0.1, 2]) {
    const wait = handPose(steps, 1.1, "right", { ...geometry, waiting: true, settle: { since } });
    assert.equal(wait.fingers[2].state, "ready");
    assert.equal(wait.fingers[2].landing?.midi, 60, "wait reconstructs the written current chord");
  }
  for (const beat of [1.1, 1.2, 1.3, 1.6, 2]) {
    const pose = handPose(steps, beat, "right", geometry);
    assert.ok(pose.fingers.every(f => f.landing?.midi !== 84), `expired key has no footprint at ${beat}`);
    assert.ok(pose.marks.every(k => k.midi !== 84), `expired key has no marker at ${beat}`);
  }
  assert.ok(handPose(steps, 1.05, "right", geometry).marks.some(k => k.midi === 84), "the impossible note retains written-time key guidance");
  assert.equal(handPlan(steps, "right").engagements[1].articulation, "missed-contact");
  close(plan.contacts[1].end, 0.55, "the written short note duration is unchanged");
});

test("an octave chord transition spends the written gap, never the held notes", () => {
  const notes = [60, 64, 67].flatMap((midi, i) => [note(`a${i}`, midi, 0, 1.5), note(`b${i}`, midi + 12, 2, 1.5)]);
  const steps = handTimeline(notes, new Map([0, 1, 2].flatMap(i => [[`a${i}`, [1, 3, 5][i]], [`b${i}`, [1, 3, 5][i]]])), "right");
  const clock = { key: "transition-100", speed: 1, toSeconds: b => b * 0.6, toBeat: s => s / 0.6 };
  const plan = handPlan(steps, "right", { clock });
  for (const e of plan.engagements.filter(e => e.onset === 0)) close(e.release, 0.9, `${e.midi} written end`);
  assert.ok(plan.plans[0].tDepart >= 0.9 - 1e-9, "the palm waits for all three releases");
  assert.ok(plan.plans[0].tArrive <= 1.2, "the real gap accommodates the travel");
  assert.equal(plan.plans[0].steal, 0);
  assert.deepEqual(plan.guidanceIntervals, [], "a feasible transition keeps Natural visible");
  const held = handMotion(steps, 1.45, "right", { clock });
  assert.deepEqual(held.fingers.filter(f => f.down).map(f => f.midi), [60, 64, 67]);
});

test("a hand's timeline carries held keys into the next chord", () => {
  const notes = [
    note("bass", 48, 0, 4, "left"),
    note("a", 64, 0, 1),
    note("b", 65, 1, 1),
    note("c", 60, 0, 4),
  ];
  const fingering = new Map([
    ["bass", 5],
    ["a", 3],
    ["b", 4],
    ["c", 1],
  ]);
  const right = handTimeline(notes, fingering, "right");
  assert.deepEqual(
    right.map((s) => s.beat),
    [0, 1],
  );
  assert.deepEqual(
    right[1].keys.map((k) => [k.finger, k.midi, k.struck]),
    [
      [1, 60, false],
      [4, 65, true],
    ],
    "the held C keeps the thumb while F is struck",
  );
  const left = handTimeline(notes, fingering, "left");
  assert.equal(left.length, 1);
  assert.equal(left[0].keys[0].finger, 5);
  assert.equal(handTimeline(notes, new Map(), "right").length, 2, "unassigned keys remain available as guidance");
});

test("simultaneous unison voices preserve their longest hold in either input order", () => {
  const long = note("long", 60, 0, 4);
  const short = note("short", 60, 0, 1);
  const later = note("later", 64, 2, 1);
  const fingering = new Map([
    ["long", 1],
    ["short", 1],
    ["later", 3],
  ]);
  for (const notes of [
    [long, short, later],
    [short, long, later],
  ]) {
    const steps = handTimeline(notes, fingering, "right");
    assert.equal(steps[0].keys.length, 1, "one physical key at the attack");
    assert.deepEqual(steps[0].keys[0], {
      finger: 1,
      midi: 60,
      end: 4,
      struck: true,
    });
    assert.deepEqual(
      steps[1].keys.find((k) => k.midi === 60),
      { finger: 1, midi: 60, end: 4, struck: false },
      "short voice ending does not release long voice",
    );
  }
});

test("a later same-pitch attack replaces its old finger and hold without duplicates", () => {
  const notes = [
    note("old", 60, 0, 8),
    note("held", 67, 0, 4),
    note("again", 60, 1, 1),
    note("later", 64, 2, 1),
  ];
  const fingering = new Map([
    ["old", 1],
    ["held", 5],
    ["again", 2],
    ["later", 3],
  ]);
  const steps = handTimeline(notes, fingering, "right");
  assert.deepEqual(steps[1].keys, [
    { finger: 2, midi: 60, end: 2, struck: true },
    { finger: 5, midi: 67, end: 4, struck: false },
  ]);
  assert.equal(
    steps[2].keys.some((k) => k.midi === 60),
    false,
    "new attack's end replaces the original long hold",
  );
  assert.equal(
    steps[2].keys.find((k) => k.midi === 67)?.finger,
    5,
    "another held key is preserved",
  );
});

test("free fingers rest at their slots beside the playing ones, or between them", () => {
  // The hand's frame (the palm and its slots, about a key apart, wider in an
  // octave) places the fingers the notes leave free.
  const SLOT = [0, -2.4, -1.35, -0.45, 0.45, 1.35];
  const free = (hand, notes, fingering) => {
    const steps = handTimeline(notes, new Map(fingering), hand);
    const motion = handMotion(steps, 0.2, hand);
    const pose = handPose(steps, 0.2, hand, { keyWidth: 40, keysHeight: 190, bedHeight: 250 });
    return { motion, pose, x: motion.fingers.map((f) => f.x), dir: hand === "left" ? -1 : 1 };
  };
  const slotted = ({ motion, x, dir }, spread, fingers) => {
    const centre = motion.palm.C + motion.palm.lean;
    for (const f of fingers) close(x[f - 1], centre + dir * SLOT[f] * spread, `finger ${f} at its slot`);
  };
  // Right hand, thumb on C4: 2–5 rise from beside it, a slot apart.
  const right = free("right", [note("a", 60, 0, 1)], [["a", 1]]);
  close(right.x[0], keyCentre(60), "the thumb on C4");
  slotted(right, 1, [2, 3, 4, 5]);
  for (let f = 1; f < 5; f++) assert.ok(right.x[f] > right.x[f - 1] + 0.5, `finger ${f + 1} above finger ${f}`);
  // Left hand, little finger on C3: 4..1 rise toward G3.
  const left = free("left", [note("a", 48, 0, 1, "left")], [["a", 5]]);
  close(left.x[4], keyCentre(48), "the little finger on C3");
  slotted(left, 1, [1, 2, 3, 4]);
  for (let f = 4; f > 0; f--) assert.ok(left.x[f - 1] > left.x[f] + 0.5, `left finger ${f} above finger ${f + 1}`);
  assert.ok(left.x[0] < keyCentre(55) + 0.5, "the hand spans about C3–G3");
  // An octave: the frame opens (spread 1.3) and 2, 3, 4 sit between.
  const octave = free("right", [note("a", 60, 0, 1), note("b", 72, 0, 1)], [["a", 1], ["b", 5]]);
  slotted(octave, 1.3, [2, 3, 4]);
  const mid = (keyCentre(60) + keyCentre(72)) / 2;
  assert.ok(Math.abs(octave.x[2] - mid) < 0.6, "the middle finger about halfway");
  for (let f = 1; f < 5; f++) assert.ok(octave.x[f] > octave.x[f - 1], "in order");
  // The drawn pads follow their slots (a curled finger hangs a little aside).
  for (const c of [right, left, octave])
    c.pose.fingers.forEach((f, i) =>
      assert.ok(Math.abs((c.pose.x + f.axis.at(-1).x) / 40 - c.x[i]) < 0.45, `pad ${f.finger} near its place`),
    );
});

test("a hand holds its written note, then travels in the actual gap and hovers ready", () => {
  // C4 ends at 0.25 s; the next C arrives at 0.5 s. Travel may use that rest.
  const notes = [note("a", 60, 0, 0.5), note("b", 72, 1, 1)];
  const steps = handTimeline(
    notes,
    new Map([
      ["a", 1],
      ["b", 1],
    ]),
    "right",
  );
  const at = (beat) => handMotion(steps, beat, "right");
  const plan = handPlan(steps, "right");
  assert.equal(plan.plans.length, 1);
  const move = plan.plans[0];
  assert.equal(move.kind, "TRAVEL");
  // The hover shrinks and travel compresses to fit the written rest.
  close(move.hover, 0.02, "hover at its minimum");
  assert.ok(move.tArrive <= 0.5 - 0.02 + 1e-9, "arrives before the onset");
  const thumb = plan.engagements.find((e) => e.midi === 60);
  close(thumb.release, 0.25, "the thumb keeps its whole written note");
  assert.equal(thumb.releaseKind, "end");
  close(at(0).fingers[0].x, keyCentre(60), "on C at first");
  assert.equal(at(0.3).fingers[0].down, true, "the thumb holds its key");
  close(at(0.3).fingers[0].x, keyCentre(60), "still on C before the move");
  const mid = at(0.9);
  assert.ok(mid.glide > 0 && mid.glide < 1, "travelling");
  assert.equal(mid.fingers[0].down, false, "a finger moving to a new key is lifted");
  assert.ok(mid.fingers[0].lift > 0);
  assert.ok(mid.fingers[0].ready, "and about to strike");
  close(at(1).fingers[0].x, keyCentre(72), "exact on C5 as it sounds");
  assert.equal(at(1).fingers[0].down, true);
  assert.equal(at(2.5).fingers[0].down, false, "up once the note ends");
  // Before the first note the hand waits over it, ready.
  const before = at(-1);
  assert.equal(before.fingers[0].down, false);
  assert.equal(before.fingers[0].ready, true);
  assert.ok(Math.abs(before.fingers[0].x - keyCentre(60)) < 0.5, "waiting over C");
  assert.equal(handMotion([], 0, "right"), null);
  // Long silences: the hand rests (idle 1.5 s), not right after the note.
  assert.equal(at(5).rest, true);
  assert.equal(at(1.2).rest, false);
});

test("a held key stays down while the other fingers move around it", () => {
  const notes = [
    note("held", 60, 0, 4),
    note("a", 64, 0, 1),
    note("b", 65, 1, 1),
  ];
  const steps = handTimeline(
    notes,
    new Map([
      ["held", 1],
      ["a", 3],
      ["b", 4],
    ]),
    "right",
  );
  const mid = handMotion(steps, 0.8, "right");
  assert.ok(mid.glide > 0);
  close(mid.fingers[0].x, keyCentre(60), "the thumb stays on C");
  assert.equal(mid.fingers[0].down, true);
});

// Projected finger length / reach (G1), in the hand's own proportions
// (across in u, in depth in v): fingers 2–5 from the knuckle, the thumb from
// its MCP joint, each against its natural length (HAND_BUILD.reach).
const handLen = (pose, a, b) => Math.hypot((b.x - a.x) / pose.unit, (b.y - a.y) / pose.verticalUnit);
const ratioOf = (pose, finger) => {
  const f = pose.fingers[finger - 1];
  return handLen(pose, f.axis[finger === 1 ? 1 : 0], f.axis.at(-1)) / HAND_BUILD.reach[finger];
};
// A finger's slot (pose-local x) at the pose's frame.
const SLOT_TEST = [0, -2.4, -1.35, -0.45, 0.45, 1.35];
const slotX = (pose, finger) =>
  pose.dir * (pose.palm.C + pose.palm.lean + SLOT_TEST[finger] * pose.palm.spread) * pose.unit - pose.x;

test("a drawn hand: fingertips on their keys, thumbs inward, anatomical lengths", () => {
  const u = 36;
  const geometry = { keyWidth: u, keysHeight: 200, bedHeight: 270 };
  const notes = [
    note("r", 61, 0, 1),
    note("r2", 64, 0, 1),
    note("l", 48, 0, 1, "left"),
  ];
  const fingering = new Map([
    ["r", 2],
    ["r2", 4],
    ["l", 5],
  ]);
  const right = handPose(handTimeline(notes, fingering, "right"), 0.2, "right", geometry);
  const left = handPose(handTimeline(notes, fingering, "left"), 0.2, "left", geometry);
  const tip = (pose, finger) => pose.fingers[finger - 1].axis.at(-1);
  // Fingertips on keys sit at those keys (x local to the hand).
  close(tip(right, 2).x + right.x, keyCentre(61) * u, "index on C#");
  close(tip(right, 4).x + right.x, keyCentre(64) * u, "ring on E");
  close(tip(left, 5).x + left.x, keyCentre(48) * u, "left little finger on C");
  // A black key is played further in than a white one.
  assert.ok(tip(right, 2).y < tip(right, 4).y);
  // Thumbs on the inside of each hand, fingers pressing marked down.
  assert.ok(tip(right, 1).x < tip(right, 2).x, "right thumb on the left");
  assert.ok(tip(left, 1).x > tip(left, 2).x, "left thumb on the right");
  assert.equal(right.fingers[1].state, "down");
  assert.equal(right.fingers[2].state, "up");
  // Every finger stays within its anatomical length (G1).
  for (const pose of [right, left])
    for (let f = 1; f <= 5; f++) {
      const r = ratioOf(pose, f);
      assert.ok(r >= 0.55 && r <= (f === 1 ? 1.1 : 1.3), `finger ${f} length ratio ${r.toFixed(2)}`);
    }
  // The back of the hand lies below the fingertips.
  assert.ok(Math.min(...right.back.map((p) => p.y)) > Math.min(...right.fingers.map((f) => f.axis.at(-1).y)));
  // A resting finger hangs near its slot rather than across the keys.
  assert.ok(Math.abs(tip(right, 3).x - slotX(right, 3)) < 0.3 * u, "middle finger near its slot");
  // Still: the same pose again changes nothing; no notes, no hand.
  const again = handPose(handTimeline(notes, fingering, "right"), 0.3, "right", geometry);
  assert.equal(again.signature, right.signature);
  assert.equal(handPose([], 0, "right", geometry), null);
});

test("travel starts as late as natural speed allows and the same leap takes the same seconds at 60 and 120 bpm", () => {
  // Two octaves up after a long rest (LH little finger, 8 beats apart).
  const notes = [note("a", 48, 0, 1, "left"), note("b", 72, 8, 1, "left")];
  const steps = handTimeline(
    notes,
    new Map([
      ["a", 5],
      ["b", 5],
    ]),
    "left",
  );
  const TB = 4; // seconds at the default 0.5 s per beat
  const at = (s) => handMotion(steps, s / 0.5, "left");
  assert.equal(at(TB - 1.5).glide, 0, "still in place 1.5 s before");
  assert.ok(at(TB - 1.2).glide > 0, "on its way 1.2 s before (arrives 1.0 s early)");
  const move = handPlan(steps, "left").plans[0];
  assert.equal(move.kind, "TRAVEL");
  close(move.tArrive, TB - 1.0, "arrives at most 1.0 s early");
  // A step of one key waits until the stroke.
  const near = handTimeline(
    [note("c", 60, 0, 1), note("d", 62, 8, 1)],
    new Map([
      ["c", 1],
      ["d", 2],
    ]),
    "right",
  );
  assert.equal(handMotion(near, (TB - 0.5) / 0.5, "right").glide, 0);
  assert.ok(handMotion(near, (TB - 0.2) / 0.5, "right").glide > 0);
  // The same leap at 60 and at 120 bpm: identical departure-to-arrival seconds.
  const slow = handPlan(steps, "left", { clock: clockMap({ id: "sixty", bpm: 60 }) }).plans[0];
  const fast = handPlan(steps, "left", { clock: clockMap({ id: "onetwenty", bpm: 120 }) }).plans[0];
  close(slow.tArrive - slow.tDepart, fast.tArrive - fast.tDepart, "same move, same seconds");
});

test("repeated attacks, key changes, and releases have continuous fingertip geometry", () => {
  const geometry = { keyWidth: 36, keysHeight: 225, bedHeight: 300 };
  const fixtures = [
    { notes: [note("a", 60, 0, 1), note("b", 60, 1, 1)], fingers: [1, 1] },
    { notes: [note("a", 60, 0, 1), note("b", 62, 1, 1)], fingers: [1, 2] },
  ];
  const tips = (pose) =>
    pose.fingers.map((f) => ({
      x: f.axis.at(-1).x + pose.x,
      y: f.axis.at(-1).y,
    }));
  for (const fixture of fixtures) {
    const steps = handTimeline(
      fixture.notes,
      new Map(fixture.notes.map((n, i) => [n.id, fixture.fingers[i]])),
      "right",
    );
    let previous = tips(handPose(steps, -0.2, "right", geometry));
    let biggest = 0;
    // Includes the pre-first strike, a repeated-finger lift, the next onset,
    // and the final release. A 5.6px flag-driven pop used to occur here.
    for (let i = -199; i <= 2200; i++) {
      const current = tips(handPose(steps, i / 1000, "right", geometry));
      current.forEach((tip, f) => {
        biggest = Math.max(
          biggest,
          Math.hypot(tip.x - previous[f].x, tip.y - previous[f].y),
        );
      });
      previous = current;
    }
    assert.ok(
      biggest < 0.35,
      `continuous 0.001-beat samples, largest movement ${biggest}px`,
    );
    const release = handPose(steps, 2, "right", geometry);
    const after = handPose(steps, 2.00001, "right", geometry);
    close(
      after.fingers[fixture.fingers[1] - 1].axis.at(-1).y,
      release.fingers[fixture.fingers[1] - 1].axis.at(-1).y,
      "release begins without a pop",
    );
  }
});

test("a held fingertip remains anchored through several other finger changes", () => {
  const notes = [
    note("held", 60, 0, 4),
    note("a", 64, 0, 1),
    note("b", 65, 1, 1),
    note("c", 67, 2, 1),
  ];
  const steps = handTimeline(
    notes,
    new Map([
      ["held", 1],
      ["a", 2],
      ["b", 3],
      ["c", 4],
    ]),
    "right",
  );
  const geometry = { keyWidth: 36, keysHeight: 225, bedHeight: 300 };
  const y = handPose(steps, 0, "right", geometry).fingers[0].axis.at(-1).y;
  for (let beat = 0; beat < 3; beat += 0.03) {
    const pose = handPose(steps, beat, "right", geometry);
    const thumb = pose.fingers[0];
    close(
      pose.x + thumb.axis.at(-1).x,
      keyCentre(60) * 36,
      "held C retains its X",
    );
    close(thumb.axis.at(-1).y, y, "held C retains its contact depth");
    assert.equal(thumb.state, "down");
  }
});

test("a finger retiring into the resting hand is lifted before it leaves its key", () => {
  const steps = handTimeline(
    [note("a", 60, 0, 1), note("b", 62, 1, 1)],
    new Map([
      ["a", 1],
      ["b", 2],
    ]),
    "right",
  );
  const geometry = { keyWidth: 36, keysHeight: 225, bedHeight: 300 };
  for (const beat of [0, 0.3, 0.5, 0.75, 0.9]) {
    const pose = handPose(steps, beat, "right", geometry);
    const thumb = pose.fingers[0];
    if (thumb.state === "down")
      close(
        pose.x + thumb.axis.at(-1).x,
        keyCentre(60) * 36,
        "a down thumb is on C",
      );
    else
      assert.ok(
        handMotion(steps, beat, "right").fingers[0].lift > 0,
        "resting transition visibly lifts",
      );
  }
});

test("reduced motion holds one static pose until the next onset without lift or anticipation", () => {
  const notes = [note("a", 60, 0, 0.5), note("b", 84, 2, 1)];
  const steps = handTimeline(
    notes,
    new Map([
      ["a", 1],
      ["b", 1],
    ]),
    "right",
  );
  const geometry = {
    keyWidth: 36,
    keysHeight: 225,
    bedHeight: 300,
    reducedMotion: true,
  };
  const positions = (pose) =>
    pose.fingers.map((f) => f.axis.map((p) => ({ x: pose.x + p.x, y: p.y })));
  const initial = handPose(steps, 0, "right", geometry);
  for (const beat of [0.4, 0.7, 1.4, 1.999]) {
    const pose = handPose(steps, beat, "right", geometry);
    assert.deepEqual(
      positions(pose),
      positions(initial),
      "no departure or released-finger bobbing",
    );
    assert.equal(pose.glide, 0);
    assert.equal(pose.reducedMotion, true);
    assert.equal(pose.beat, beat);
  }
  const arrived = handPose(steps, 2, "right", geometry);
  close(
    arrived.x + arrived.fingers[0].axis.at(-1).x,
    keyCentre(84) * 36,
    "new onset is immediately exact",
  );
  assert.equal(arrived.fingers[0].state, "down");
  assert.ok(
    handPose(steps, 1.4, "right", { ...geometry, reducedMotion: false }).glide >
      0,
    "normal motion still glides",
  );
  assert.deepEqual(
    positions(handPose(steps, 0, "right", geometry)),
    positions(initial),
    "seeking backwards is deterministic",
  );
});

test("illustrated fingers have articulated joints and taper without changing key contacts", () => {
  const notes = [note("a", 60, 0, 1), note("b", 64, 0, 1), note("c", 67, 0, 1)];
  const steps = handTimeline(
    notes,
    new Map([
      ["a", 1],
      ["b", 3],
      ["c", 5],
    ]),
    "right",
  );
  const pose = handPose(steps, 0, "right", {
    keyWidth: 64,
    keysHeight: 225,
    bedHeight: 300,
  });
  for (const finger of pose.fingers) {
    const joints = finger.finger === 1 ? 3 : 4;
    assert.equal(
      finger.axis.length,
      joints,
      "thumb has two segments; other fingers have three",
    );
    assert.equal(finger.widths.length, joints);
    for (let i = 1; i < joints; i++)
      assert.ok(finger.widths[i - 1] > finger.widths[i], "slim taper");
  }
  for (const [finger, midi] of [
    [1, 60],
    [3, 64],
    [5, 67],
  ]) {
    close(
      pose.x + pose.fingers[finger - 1].axis.at(-1).x,
      keyCentre(midi) * 64,
      "key target unchanged",
    );
  }
  // The thumb is two links from its CMC, which sits in the palm between the
  // knuckle row and the wrist; its phalanx is never longer than its link.
  const [cmc, mcp, tip] = pose.fingers[0].axis;
  assert.ok(cmc.y > pose.knuckleY && cmc.y < pose.wrist.y, "the CMC lies in the palm, behind the knuckles");
  assert.ok(pose.dir * cmc.x < 0 && pose.dir * cmc.x > pose.dir * pose.back[13].x - 0.2 * 64, "on the thumb side of the palm");
  assert.ok(Math.hypot(tip.x - mcp.x, tip.y - mcp.y) <= 1.6 * 64 + 1e-6, "phalanx within its length");
  assert.ok(Math.hypot(mcp.x - cmc.x, mcp.y - cmc.y) > 0.2 * 64, "a real metacarpal link");
});

test("a preparation footprint stays on its destination key while the finger travels", () => {
  const steps = handTimeline(
    [note("a", 60, 0, 1), note("b", 72, 2, 1)],
    new Map([
      ["a", 1],
      ["b", 1],
    ]),
    "right",
  );
  const geometry = { keyWidth: 44, keysHeight: 225, bedHeight: 300 };
  for (const beat of [1.4, 1.6, 1.85]) {
    const pose = handPose(steps, beat, "right", geometry);
    const thumb = pose.fingers[0];
    assert.equal(thumb.state, "ready");
    assert.equal(thumb.landing.midi, 72);
    close(
      pose.x + thumb.landing.x,
      keyCentre(72) * 44,
      "destination stays fixed",
    );
    close(
      thumb.landing.y,
      225 * 0.68 + Math.min(0.45 * 44, 0.2 * 225),
      "destination is the playing area",
    );
    assert.ok(
      pose.x + thumb.axis.at(-1).x < keyCentre(72) * 44,
      "moving tip is not confused with destination",
    );
  }
  const reduced = handPose(steps, 1.85, "right", {
    ...geometry,
    reducedMotion: true,
  });
  assert.equal(
    reduced.fingers[0].landing,
    null,
    "no anticipation in reduced motion",
  );
});

test("an octave opens the knuckle row without changing exact down contacts", () => {
  const geometry = { keyWidth: 44, keysHeight: 225, bedHeight: 300 };
  const steps = handTimeline(
    [note("a", 60, 0, 2), note("b", 72, 0, 2)],
    new Map([
      ["a", 1],
      ["b", 5],
    ]),
    "right",
  );
  const pose = handPose(steps, 0, "right", geometry);
  assert.ok(pose.fan > 1.15 && pose.fan <= 1.18, "the hand opens moderately");
  assert.ok(
    pose.knuckles.at(-1).x - pose.knuckles[0].x > 2.5 * pose.span * 1.15,
  );
  for (const [finger, midi] of [
    [1, 60],
    [5, 72],
  ]) {
    const f = pose.fingers[finger - 1];
    assert.equal(f.state, "down");
    close(
      pose.x + f.axis.at(-1).x,
      keyCentre(midi) * 44,
      "unchanged exact pitch contact",
    );
    // (The thumb and the little finger play nearer the player than the
    // long fingers, the little finger on its curved tip: a white key's
    // front, by HAND_BUILD.littleFront depth units.)
    close(
      f.axis.at(-1).y,
      225 * 0.68 + (finger === 1 ? Math.min(0.45 * 44, 0.2 * 225) : Math.min(HAND_BUILD.littleFront * 44, 0.2 * 225)),
      "unchanged exact contact depth",
    );
  }
  for (let i = 1; i < pose.knuckles.length; i++)
    assert.ok(
      pose.knuckles[i].x > pose.knuckles[i - 1].x,
      "knuckles stay in anatomical order",
    );
});

test("jointed contours remain finite and end at the exact fingertip at every key size", () => {
  const steps = handTimeline(
    [note("a", 61, 0, 2), note("b", 67, 0, 2)],
    new Map([
      ["a", 2],
      ["b", 5],
    ]),
    "right",
  );
  for (const keyWidth of [30, 44, 68]) {
    const pose = handPose(steps, 0, "right", {
      keyWidth,
      keysHeight: 225,
      bedHeight: 300,
    });
    for (const finger of pose.fingers) {
      const form = fingerForm(finger.axis, finger.widths);
      const tip = finger.axis.at(-1);
      assert.ok(
        form.points.length >= finger.axis.length,
        "each phalanx has a shaped contour",
      );
      assert.equal(
        form.joints.length,
        2,
        "two visible interphalangeal details",
      );
      assert.ok(form.joints.every((i) => i > 0 && i < form.points.length - 1));
      assert.ok(
        form.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      );
      assert.ok(form.halves.every((h) => h > 0));
      close(
        form.end.x + form.into.x * form.tipHalf,
        tip.x,
        "contour reaches exact tip X",
      );
      close(
        form.end.y + form.into.y * form.tipHalf,
        tip.y,
        "contour reaches exact tip Y",
      );
    }
  }
});

test("idle fingertips rest at their slots beside a reaching index in either hand", () => {
  const geometry = { keyWidth: 68, keysHeight: 180, bedHeight: 235 };
  for (const hand of ["right", "left"]) {
    const indexMidi = hand === "right" ? 65 : 55;
    const steps = handTimeline(
      [note("thumb", 60, 0, 4, hand), note("index", indexMidi, 0, 2, hand)],
      new Map([
        ["thumb", 1],
        ["index", 2],
      ]),
      hand,
    );
    const pose = handPose(steps, 0, hand, geometry);
    const tips = pose.fingers.map((f) => f.axis.at(-1));
    close(pose.x + tips[0].x, keyCentre(60) * 68, "thumb's assigned contact is unchanged");
    close(pose.x + tips[1].x, keyCentre(indexMidi) * 68, "index's assigned contact is unchanged");
    close(tips[1].y, 180 * 0.68, "contact stays in the white-key playing area");
    for (let f = 3; f <= 5; f++) {
      assert.equal(pose.fingers[f - 1].state, "up");
      assert.ok(
        Math.abs(tips[f - 1].x - slotX(pose, f)) < 0.45 * 68,
        `idle finger ${f} rests at its slot, making room for the reaching index (${((tips[f - 1].x - slotX(pose, f)) / 68).toFixed(2)} u off)`,
      );
    }
    assert.ok(tips[2].y > tips[1].y, "idle middle finger curls behind the reaching index");
    for (let i = 2; i < 5; i++) {
      const padGap = (pose.fingers[i - 1].widths.at(-1) + pose.fingers[i].widths.at(-1)) / 2;
      assert.ok(
        Math.hypot(tips[i].x - tips[i - 1].x, tips[i].y - tips[i - 1].y) > padGap + 3,
        "resting pads have a visible two-dimensional gap",
      );
    }
    assert.equal(handPose(steps, 0, hand, geometry).signature, pose.signature, "no history-dependent layout");
  }
});

test("idle spacing stays continuous when fingers retire, approach, or cross the thumb", () => {
  const geometry = { keyWidth: 68, keysHeight: 180, bedHeight: 235 };
  const fixtures = [
    {
      notes: [note("held", 60, 0, 4), note("a", 65, 0, 2), note("b", 67, 2, 2)],
      fingers: [1, 2, 3],
    },
    {
      notes: [note("held", 64, 0, 4), note("a", 60, 0, 0.36), note("b", 65, 1, 1)],
      fingers: [3, 1, 1],
    },
  ];
  for (const fixture of fixtures) {
    const steps = handTimeline(
      fixture.notes,
      new Map(fixture.notes.map((n, i) => [n.id, fixture.fingers[i]])),
      "right",
    );
    let previous = null;
    let largest = 0;
    for (let i = 0; i <= 2200; i++) {
      const pose = handPose(steps, i / 1000, "right", geometry);
      const tips = pose.fingers.map((f) => ({
        x: pose.x + f.axis.at(-1).x,
        y: f.axis.at(-1).y,
      }));
      if (previous)
        tips.forEach((p, f) => {
          largest = Math.max(
            largest,
            Math.hypot(p.x - previous[f].x, p.y - previous[f].y),
          );
        });
      previous = tips;
    }
    assert.ok(
      largest < 0.75,
      `no idle-tip snap; largest 0.001-beat movement ${largest}px`,
    );
    const first = handPose(steps, 0, "right", geometry);
    handPose(steps, 1.95, "right", geometry);
    assert.equal(
      handPose(steps, 0, "right", geometry).signature,
      first.signature,
      "seeking backward reproduces the same spacing",
    );
  }
});

test("unused fingers rest curled at their slots without opening a single-note hand", () => {
  const geometry = { keyWidth: 44, keysHeight: 225, bedHeight: 300 };
  for (const hand of ["right", "left"]) {
    const steps = handTimeline([note("held", 60, 0, 2, hand)], new Map([["held", 3]]), hand);
    const pose = handPose(steps, 0.2, hand, geometry);
    assert.equal(pose.fan, 1, "a single note does not spread the palm");
    for (const finger of pose.fingers.filter((f) => f.finger > 1 && f.finger !== 3)) {
      const [root, pip, dip, tip] = finger.axis;
      assert.ok(root.y - tip.y > geometry.keyWidth * 0.45, "resting fingers have a visible projected length");
      assert.ok(root.y - tip.y < geometry.keyWidth, "resting fingers are foreshortened instead of fully reaching");
      assert.ok(pip.y < dip.y && dip.y < tip.y, "the distal finger curls back from the middle joint");
      assert.ok(
        Math.abs(tip.x - slotX(pose, finger.finger)) < 0.3 * geometry.keyWidth,
        "resting fingers stay at their slots",
      );
      assert.equal(finger.state, "up");
    }
  }
});

test("a released octave relaxes its spread within 0.2 s and never claims a held contact", () => {
  const steps = handTimeline(
    [note("a", 60, 0, 1), note("b", 72, 0, 1)],
    new Map([
      ["a", 1],
      ["b", 5],
    ]),
    "right",
  );
  const geometry = { keyWidth: 44, keysHeight: 225, bedHeight: 300 };
  const held = handPose(steps, 0.4, "right", geometry);
  // Released at 0.5 s (beat 1); 0.2 s later is beat 1.4.
  const released = handPose(steps, 1.4, "right", geometry);
  assert.ok(held.fan > 1.15);
  assert.equal(released.fan, 1, "a past chord does not freeze the open palm through a rest");
  assert.ok(handPose(steps, 1.1, "right", geometry).fan > 1, "it relaxes over the curl, not at once");
  assert.ok(released.fingers.every((f) => f.state === "up" && f.landing === null));
  assert.ok(
    released.fingers[4].axis.at(-1).y > held.fingers[4].axis.at(-1).y,
    "released little finger settles toward the palm",
  );
});

test("a held white contact stays exact while neighbouring fingers approach black keys", () => {
  const notes = [
    note("held", 60, 0, 5),
    note("first", 64, 0, 1),
    note("black", 66, 2, 1),
    note("last", 68, 3, 1),
  ];
  const steps = handTimeline(
    notes,
    new Map([
      ["held", 1],
      ["first", 2],
      ["black", 3],
      ["last", 4],
    ]),
    "right",
  );
  for (const keyWidth of [30, 44, 68]) {
    const geometry = { keyWidth, keysHeight: 180, bedHeight: 235 };
    const reference = handPose(steps, 0, "right", geometry).fingers[0].axis.at(
      -1,
    );
    for (let i = 0; i < 400; i++) {
      const pose = handPose(steps, i / 100, "right", geometry);
      const thumb = pose.fingers[0];
      close(
        pose.x + thumb.axis.at(-1).x,
        keyCentre(60) * keyWidth,
        "fixed held pitch",
      );
      close(
        thumb.axis.at(-1).y,
        reference.y,
        "black-key neighbours cannot slide a held white contact",
      );
      assert.equal(thumb.state, "down");
    }
  }
});

test("black-key contacts remain on the black surface at every supported bed size", () => {
  for (const hand of ["left", "right"])
    for (const finger of [1, 2, 3, 4, 5]) {
      const steps = handTimeline(
        [note("key", 61, 0, 2, hand)],
        new Map([["key", finger]]),
        hand,
      );
      for (const keyWidth of [30, 44, 68])
        for (const [keysHeight, bedHeight] of [
          [180, 235],
          [225, 300],
        ]) {
          const pose = handPose(steps, 0.2, hand, {
            keyWidth,
            keysHeight,
            bedHeight,
          });
          const tip = pose.fingers[finger - 1].axis.at(-1);
          close(
            pose.x + tip.x,
            keyCentre(61) * keyWidth,
            "the correct black key",
          );
          assert.ok(
            tip.y > keysHeight * 0.45 && tip.y < keysHeight * 0.6,
            "pad is behind the black-key front edge",
          );
        }
    }
});

test("thumb articulation and wrist geometry mirror without extending the palm", () => {
  const geometry = { keyWidth: 44, keysHeight: 225, bedHeight: 300 };
  const poses = ["right", "left"].map((hand) =>
    handPose(
      handTimeline(
        [note("a", 60, 0, 2, hand), note("b", hand === "right" ? 65 : 55, 0, 2, hand)],
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
        hand,
      ),
      0.2,
      hand,
      geometry,
    ),
  );
  for (const pose of poses) {
    // The thumb reaching a fourth beyond the index: its metacarpal (CMC →
    // MCP, inside the palm and its web) no longer than 1.1 × 1.7 keys, the
    // phalanges (MCP → pad, the visible thumb) within G1's 0.55–1.10 × 1.6
    // keys, the MCP standing out from the CMC–pad line on the side away from
    // the palm (a knuckle, never one straight spoke), the joint behind the
    // pad.
    const [cmc, mcp, tip] = pose.fingers[0].axis;
    const u = geometry.keyWidth;
    const distal = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
    assert.ok(distal >= 0.55 * 1.6 * u && distal <= 1.1 * 1.6 * u, "visible thumb length");
    assert.ok(Math.hypot(mcp.x - cmc.x, mcp.y - cmc.y) <= 1.1 * 1.7 * u, "metacarpal length");
    const side = (tip.x - cmc.x) * (mcp.y - cmc.y) - (tip.y - cmc.y) * (mcp.x - cmc.x);
    assert.ok(side * pose.dir < 0, "MCP on the side away from the palm");
    const chord = Math.hypot(tip.x - cmc.x, tip.y - cmc.y);
    assert.ok(Math.abs(side) / chord >= 0.15 * u, "the MCP stands out from the CMC–pad line: a knuckle, not a spoke");
    assert.ok(mcp.y > tip.y, "the joint lies behind the pad");
    assert.equal(pose.keysHeight, geometry.keysHeight, "renderer can mask only below the keyboard");
    assert.ok(pose.palmDepth < geometry.keyWidth * 1.8, "compact palm independent of wrist tail");
    const wristDepth = Math.max(...pose.back.map((p) => p.y)) - pose.knuckleY;
    assert.ok(
      wristDepth > pose.palmDepth && wristDepth - pose.palmDepth < pose.verticalUnit * 0.2,
      "a short anatomical wrist ends just beyond the palm; the drawing alone continues under the rail",
    );
  }
  poses[0].fingers.forEach((f, i) =>
    f.axis.forEach((p, j) => {
      close(p.x, -poses[1].fingers[i].axis[j].x, "left/right anatomical mirror X");
      close(p.y, poses[1].fingers[i].axis[j].y, "left/right anatomical mirror depth");
    }),
  );
});

test("wrist anatomy does not stretch when empty space below the keys changes", () => {
  for (const hand of ["left", "right"]) {
    const notes = [
      note("a", 60, 0, 2, hand),
      note("b", hand === "right" ? 67 : 53, 0, 2, hand),
    ];
    const steps = handTimeline(
      notes,
      new Map([
        ["a", 1],
        ["b", 5],
      ]),
      hand,
    );
    for (const keyWidth of [32, 44, 68]) {
      const compact = handPose(steps, 0.2, hand, {
        keyWidth,
        keysHeight: 180,
        bedHeight: 235,
      });
      const taller = handPose(steps, 0.2, hand, {
        keyWidth,
        keysHeight: 180,
        bedHeight: 350,
      });
      assert.deepEqual(
        compact.back,
        taller.back,
        "extra canvas space must not create a long forearm",
      );
      assert.deepEqual(
        compact.fingers,
        taller.fingers,
        "extra canvas space must not distort thumb articulation or contacts",
      );
    }
  }
});

test("a wide octave reaches with an articulated outer finger rather than a straight spoke", () => {
  for (const hand of ["left", "right"]) {
    const pitches =
      hand === "right"
        ? [
            [60, 1],
            [72, 5],
          ]
        : [
            [48, 5],
            [60, 1],
          ];
    const notes = pitches.map(([midi], i) => note(String(i), midi, 0, 2, hand));
    const steps = handTimeline(
      notes,
      new Map(notes.map((n, i) => [n.id, pitches[i][1]])),
      hand,
    );
    const pose = handPose(steps, 0.2, hand, {
      keyWidth: 60,
      keysHeight: 180,
      bedHeight: 235,
    });
    const axis = pose.fingers[4].axis;
    const proximal = { x: axis[1].x - axis[0].x, y: axis[1].y - axis[0].y };
    const distal = { x: axis[3].x - axis[2].x, y: axis[3].y - axis[2].y };
    const cosine =
      (proximal.x * distal.x + proximal.y * distal.y) /
      (Math.hypot(proximal.x, proximal.y) * Math.hypot(distal.x, distal.y));
    assert.ok(
      Math.acos(cosine) > Math.PI / 12,
      "the visible joints bend by more than 15 degrees at a wide reach",
    );
    for (const [midi, finger] of pitches)
      close(
        pose.x + pose.fingers[finger - 1].axis.at(-1).x,
        keyCentre(midi) * 60,
        "curvature never moves the required key contact",
      );
  }
});

test("curled contour edges stay finite and continuous through release", () => {
  const notes = [
    note("held", 60, 0, 4),
    note("a", 65, 0, 2),
    note("b", 67, 2, 2),
  ];
  const steps = handTimeline(
    notes,
    new Map([
      ["held", 1],
      ["a", 2],
      ["b", 3],
    ]),
    "right",
  );
  let previous = null,
    largest = 0;
  for (let i = 3900; i <= 4400; i++) {
    const pose = handPose(steps, i / 1000, "right", {
      keyWidth: 68,
      keysHeight: 180,
      bedHeight: 235,
    });
    const shapes = pose.fingers.map((finger) => {
      const form = fingerForm(finger.axis, finger.widths);
      const contour = form.envelope || form;
      const tip = finger.axis.at(-1);
      close(
        form.end.x + form.into.x * form.tipHalf,
        tip.x,
        "articulation retains exact pad X",
      );
      close(
        form.end.y + form.into.y * form.tipHalf,
        tip.y,
        "articulation retains exact pad Y",
      );
      return contour.points.flatMap((p, j) =>
        [-1, 1].map((side) => ({
          x: pose.x + p.x + side * contour.normals[j].x * contour.halves[j],
          y: p.y + side * contour.normals[j].y * contour.halves[j],
        })),
      );
    });
    shapes.forEach((shape, f) =>
      shape.forEach((p, j) => {
        assert.ok(
          Number.isFinite(p.x) && Number.isFinite(p.y),
          "finite projected silhouette",
        );
        if (previous)
          largest = Math.max(
            largest,
            Math.hypot(p.x - previous[f][j].x, p.y - previous[f][j].y),
          );
      }),
    );
    previous = shapes;
  }
  assert.ok(
    largest < 2,
    `no contour-edge reversal; largest 0.001-beat movement ${largest}px`,
  );
});

test("resting fingers have rounded forward contours even on wide shallow keys", () => {
  for (const hand of ["left", "right"]) {
    const steps = handTimeline(
      [note("middle", 60, 0, 1, hand)],
      new Map([["middle", 3]]),
      hand,
    );
    for (const keyWidth of [30, 44, 68])
      for (const [keysHeight, bedHeight] of [
        [180, 235],
        [225, 300],
      ]) {
        const pose = handPose(steps, 1.5, hand, {
          keyWidth,
          keysHeight,
          bedHeight,
        });
        for (const finger of pose.fingers.slice(1)) {
          const form = fingerForm(finger.axis, finger.widths);
          const outline = form.envelope || form;
          for (let i = 1; i < outline.points.length; i++) {
            assert.ok(
              outline.points[i].y <= outline.points[i - 1].y + 0.001,
              "a relaxed finger contour does not fold back into sharp side corners",
            );
          }
        }
      }
  }
});

test("zoomed keys retain substantial anatomy even when the palm continues below the front rail", () => {
  for (const hand of ["left", "right"]) {
    const pitches =
      hand === "left"
        ? [
            [46, 4],
            [55, 1],
          ]
        : [
            [64, 1],
            [70, 4],
          ];
    const notes = pitches.map(([midi], i) => note(String(i), midi, 0, 3, hand));
    const steps = handTimeline(
      notes,
      new Map(notes.map((n, i) => [n.id, pitches[i][1]])),
      hand,
    );
    const compact = handPose(steps, 0.15, hand, {
      keyWidth: 68,
      keysHeight: 180,
      bedHeight: 235,
    });
    assert.equal(
      compact.unit,
      68,
      "horizontal size continues to follow key width",
    );
    assert.ok(
      compact.verticalUnit > compact.unit * 0.6 &&
        compact.verticalUnit <= compact.unit,
      "zoom must not flatten the hand to a narrow horizontal strip",
    );
    assert.ok(
      Math.max(...compact.knuckles.map((p) => p.y)) < 235,
      "the knuckle arch stays in the visible canvas, with natural partial rail cropping",
    );
    assert.ok(
      compact.palmDepth > compact.unit,
      "the palm remains vertically substantial rather than squeezed into the rail",
    );
    for (const [midi, finger] of pitches) {
      const f = compact.fingers[finger - 1],
        tip = f.axis.at(-1);
      const black = midi % 12 === 10;
      close(
        compact.x + tip.x,
        keyCentre(midi) * 68,
        "zoom keeps the physical pitch contact exact",
      );
      close(
        tip.y,
        180 * (black ? 0.53 : 0.68) +
          (finger === 1 ? Math.min(0.45 * 68, 0.2 * 180) * (black ? 0.3 : 1) : 0),
        "contact depth is independent of anatomical foreshortening",
      );
      assert.equal(f.state, "down");
    }
    const ordinary = handPose(steps, 0.15, hand, {
      keyWidth: 44,
      keysHeight: 225,
      bedHeight: 300,
    });
    assert.equal(
      ordinary.verticalUnit,
      ordinary.unit,
      "normal-sized keyboard retains its original proportions",
    );
    const shallow = handPose(steps, 0.15, hand, {
      keyWidth: 68,
      keysHeight: 136,
      bedHeight: 184,
    });
    assert.ok(
      shallow.verticalUnit >= shallow.unit * 0.6,
      "the compact136px workspace retains at least60% projected depth at maximum zoom",
    );
    for (const [midi, finger] of pitches)
      close(
        shallow.x + shallow.fingers[finger - 1].axis.at(-1).x,
        keyCentre(midi) * 68,
        "compact layout keeps the same exact contact",
      );
  }
});

test("the hands' clock maps beats to real seconds through the tempo map, practice speed and count-in", () => {
  const score = {
    id: "clock",
    bpm: 120,
    tempos: [
      { beat: 0, bpm: 120 },
      { beat: 8, bpm: 60 },
    ],
  };
  const full = clockMap(score, 1);
  close(full.toSeconds(4), 2, "120 bpm: half a second per beat");
  close(full.toSeconds(10), 6, "two beats at 60 after four seconds at 120");
  close(full.toBeat(6), 10, "and back");
  const half = clockMap(score, 0.5);
  close(half.toSeconds(10), 12, "half speed takes twice the real time");
  close(half.toBeat(12), 10, "and back at half speed");
  assert.equal(half.key, "clock|0.5|");
  assert.equal(clockMap(score, 0.5), half, "memoised per score and speed");
  assert.notEqual(clockMap({ ...score }, 0.5), half, "a new score object gets its own map");
  close(half.toSeconds(-2), -2, "before beat 0 the opening tempo holds, at the practice speed");
  const counted = clockMap(score, 0.5, 0.75);
  assert.equal(counted.key, "clock|0.5|0.75");
  close(counted.toSeconds(-4), -3, "a count-in runs at its own rate");
  close(counted.toBeat(-3), -4, "and back");
  close(counted.toSeconds(2), 2, "after beat 0 the score's tempo at the practice speed");
  const nil = clockMap(null, 1);
  assert.equal(nil.key, "nil|1|");
  close(nil.toSeconds(3), 1.5, "no score: 120 bpm");
  close(DEFAULT_CLOCK.toSeconds(3), 1.5, "the default clock is 0.5 s per beat");
  close(DEFAULT_CLOCK.toBeat(1.5), 3, "and back");
});

test("the hand-motion fixtures are short lab scenarios the lint can read", async () => {
  const dir = new URL("./fixtures/hand-motion/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(files, [
    "S01.json",
    "S04.json",
    "S06.json",
    "S07.json",
    "S09.json",
    "S11.json",
    "S12.json",
    "scale.json",
  ]);
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    assert.ok(fixture.notes.length > 0 && fixture.notes.length <= 60, `${file}: ≤ 60 notes`);
    assert.ok(fixture.bpm > 0 && Array.isArray(fixture.pedals), `${file}: tempo and pedals`);
    for (const n of fixture.notes)
      assert.ok(
        Number.isFinite(n.midi) && Number.isFinite(n.beat) && n.duration > 0 && fixture.hands.includes(n.hand),
        `${file}: note ${n.id}`,
      );
  }
  const { lintScenario } = await import("../scripts/hand-lab-lint.mjs");
  const scale = JSON.parse(readFileSync(new URL("scale.json", dir), "utf8"));
  const [report] = lintScenario(scale, { speeds: [1], fps: 60, waitChecks: false });
  assert.deepEqual(Object.keys(report.guards), ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G13"]);
  assert.ok(report.frames > 100, "the lint samples the whole scale in real time");
  assert.equal(report.guards.G13.model, 0, "every struck key is down and exact at its onset");
});

// ---- the motion model (docs/HAND_MOTION_DESIGN.md §9, new tests) ------------------

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/hand-motion/${name}.json`, import.meta.url), "utf8"));
const LAB = { keyWidth: 36, keysHeight: 172.8, bedHeight: 226.8 };
// The app's keyboards: a usual one, and the flatter one of a wide window.
const APP_KEYS = [
  { keyWidth: 45, keysHeight: 166, bedHeight: (166 * 6.3) / 4.8 },
  { keyWidth: 68, keysHeight: 136, bedHeight: (136 * 6.3) / 4.8 },
];
// Both hands of a lab scenario at a moment (real seconds), as the app computes them.
const posesAtSeconds = (inputs, seconds, extra = {}) =>
  posesAt(inputs, inputs.clock.toBeat(seconds), LAB, extra);
const tipX = (pose, finger) => (pose.x + pose.fingers[finger - 1].axis.at(-1).x) / pose.unit;
const exactOnKey = (pose, finger, midi) => {
  const f = pose.fingers[finger - 1];
  return f.state === "down" && Math.abs(pose.x + f.axis.at(-1).x - keyCentre(midi) * pose.unit) < 1e-6;
};
const engagementOf = (plan, midi, onset) =>
  plan.engagements.find((e) => e.midi === midi && Math.abs(e.onset - onset) < 1e-6);

test("time is seconds: the same move lasts the same at 60, 120 and 180 bpm", () => {
  // A 7-key leap (thumb C4 → C5) four beats later.
  const steps = handTimeline(
    [note("a", 60, 0, 1), note("b", 72, 4, 1)],
    new Map([
      ["a", 1],
      ["b", 1],
    ]),
    "right",
  );
  const moves = [60, 120, 180].map((bpm) => handPlan(steps, "right", { clock: clockMap({ id: `t${bpm}`, bpm }) }).plans[0]);
  const d = Math.abs(moves[0].d);
  const natural = Math.min(0.45, Math.max(0.12, 0.08 + 0.085 * Math.log2(1 + d)));
  for (const move of moves) {
    assert.equal(move.kind, "TRAVEL");
    close(move.tArrive - move.tDepart, natural, "travel time is a function of distance only");
  }
  assert.ok(Math.abs(d - 7) < 1, `about seven keys (${d.toFixed(2)})`);
  // At half speed the hand waits twice as long, then moves at the same speed.
  const full = handPlan(steps, "right", { clock: clockMap({ id: "half", bpm: 120 }, 1) }).plans[0];
  const half = handPlan(steps, "right", { clock: clockMap({ id: "half", bpm: 120 }, 0.5) }).plans[0];
  close(half.tArrive - half.tDepart, full.tArrive - full.tDepart, "same move at half speed");
  close(half.onsetB - 1.0, half.tArrive, "arrives 1 s early either way");
  close(
    half.tDepart - half.onsetA,
    full.tDepart - full.onsetA + (full.onsetB - full.onsetA),
    "the extra time is all spent waiting",
  );
});

test("a sounding finger stays on its key until its written end inside a position", () => {
  // C D E (1 2 3) eighths at ♩ = 100: 0, 0.3, 0.6 s.
  const steps = handTimeline(
    [note("c", 60, 0, 0.5), note("d", 62, 0.5, 0.5), note("e", 64, 1, 0.5)],
    new Map([
      ["c", 1],
      ["d", 2],
      ["e", 3],
    ]),
    "right",
  );
  const clock = clockMap({ id: "cde", bpm: 100 });
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250, clock };
  for (const s of [0.3, 0.45, 0.5999]) {
    const pose = handPose(steps, clock.toBeat(s), "right", geometry);
    assert.ok(exactOnKey(pose, 2, 62), `index down and exact on D at ${s} s`);
  }
  const plan = handPlan(steps, "right", { clock });
  assert.equal(plan.positions.length, 1, "one position, fingers only");
  for (const e of plan.engagements) {
    assert.ok(e.release >= e.end - 1e-9, `${e.midi} held to its written end`);
    assert.notEqual(e.releaseKind, "travel");
  }
});

test("an incoming thumb crossing a long finger declines only the optional legato tail", () => {
  for (const speed of [0.5, 1]) {
    const source = fixture("scale");
    const snapshot = structuredClone(source.notes);
    const inputs = scenarioInputs(source, { speed });
    const plan = handPlan(inputs.steps.right, "right", { clock: inputs.clock });
    const outgoing = engagementOf(plan, 71, inputs.clock.toSeconds(3));
    const incoming = engagementOf(plan, 72, inputs.clock.toSeconds(3.5));
    close(outgoing.release, outgoing.end, "B4 ends exactly when its written duration ends");
    close(incoming.contactAt, incoming.onset, "C5 keeps its written attack");
    assert.equal(outgoing.releaseKind, "end");
    const before = handMotion(inputs.steps.right, 3.5 - 1e-4, "right", { clock: inputs.clock });
    const after = handMotion(inputs.steps.right, 3.5 + 1e-4, "right", { clock: inputs.clock });
    assert.equal(before.fingers[3].down, true, "the outgoing ring keeps its entire written hold");
    assert.equal(after.fingers[3].down, false, "no artificial second contact across the incoming thumb");
    assert.equal(after.fingers[0].down, true, "the new thumb is down on time");
    assert.deepEqual(source.notes, snapshot, "the original score remains unchanged");
  }
  for (const hand of ["left", "right"]) {
    const notes = [note("long", hand === "right" ? 71 : 61, 0, 1.2, hand),
      note("thumb", hand === "right" ? 72 : 60, 1, 1, hand)];
    const snapshot = structuredClone(notes);
    const steps = handTimeline(notes, new Map([["long", 4], ["thumb", 1]]), hand);
    const held = handPlan(steps, hand).engagements[0];
    close(held.end, 0.6, `${hand}: original written overlap is still 100 ms`);
    assert.ok(held.release >= held.end, `${hand}: a genuine written overlap is never shortened`);
    assert.equal(handMotion(steps, 1.1, hand).fingers[3].down, true);
    assert.deepEqual(notes, snapshot);
  }
});

test("a thumb-under leans the palm under the held finger, tucks the thumb and finishes after the release", () => {
  const inputs = scenarioInputs(fixture("scale"));
  const R = (s) => posesAtSeconds(inputs, s).right;
  close(R(0.822).palm.C, 27.55, "phase 1 has leaned the palm under E4");
  for (const s of [0.62, 0.7, 0.8, 0.85, 0.899]) assert.ok(exactOnKey(R(s), 3, 64), `E4 held exact at ${s} s`);
  for (const s of [0.76, 0.8, 0.85]) {
    const thumb = R(s).fingers[0];
    assert.notEqual(thumb.state, "down");
    assert.ok(thumb.under > 0.5, `thumb passing under the hand at ${s} s (${thumb.under.toFixed(2)})`);
  }
  assert.ok(exactOnKey(R(0.9), 1, 65), "thumb exact on F4 at its onset");
  assert.notEqual(R(0.9).fingers[2].state, "down", "E4 releases at its written end as the thumb crosses it");
  assert.notEqual(R(0.93).fingers[2].state, "down", "no optional crossed contact after the written release");
  close(R(1.1).palm.C, 28.45, "phase 2 has finished the move");
  assert.ok(exactOnKey(R(1.1), 1, 65), "the thumb never moved off F4");
});

test("synthetic legato does not cross two long fingers or shorten a written hold", () => {
  for (const hand of ["right", "left"]) {
    const make = (duration = 2, nextFinger = 2) => {
      const notes = [[0, [60, 64, 67], [1, 3, 5]], [2, [62, 65, 69], [1, 3, 5]],
        [4, [64, 67, 72], [1, nextFinger, 5]]].flatMap(([beat, pitches, fingers]) =>
        pitches.map((midi, i) => ({
          ...note(`${beat}-${i}`, hand === "right" ? midi : 120 - midi, beat,
            beat === 2 && i === 1 ? duration : 2, hand), finger: fingers[i],
        })));
      const steps = handTimeline(notes, new Map(notes.map(n => [n.id, n.finger])), hand);
      const clock = clockMap({ id: `long-order-${hand}-${duration}-${nextFinger}`, bpm: 80 });
      const plan = handPlan(steps, hand, { clock });
      const old = engagementOf(plan, hand === "right" ? 65 : 55, 1.5);
      return { steps, clock, old };
    };
    const { steps, clock, old } = make();
    close(old.release, old.end, `${hand}: old middle releases at its written end`);
    assert.equal(old.releaseKind, "end");
    const geometry = { ...LAB, clock };
    assert.ok(exactOnKey(handPose(steps, clock.toBeat(old.end - 0.0001), hand, geometry), 3, old.midi));
    assert.notEqual(handPose(steps, clock.toBeat(old.end + 0.01), hand, geometry).fingers[2].state, "down");
    const held = make(3, 4).old;
    close(held.end, 3.75, `${hand}: written hold duration is unchanged`);
    assert.ok(held.release >= held.end - 1e-9, `${hand}: a real held note is not shortened`);
    const ordered = make(2, 4).old;
    close(ordered.release, ordered.end + 0.04, `${hand}: ordered fingers keep ordinary legato`);
  }
});

test("Appassionata bar 267 releases an unreachable black-thumb overlap at the written end", () => {
  const source = JSON.parse(readFileSync(new URL("./fixtures/hand-appassionata-crossing.json", import.meta.url)));
  for (const hand of ["left", "right"]) {
    const notes = source.notes.map(n => ({ ...n, hand,
      midi: hand === "left" ? n.midi : 146 - n.midi }));
    const steps = handTimeline(notes, new Map(notes.map(n => [n.id, n.finger])), hand);
    const clock = clockMap({ ...source, id: `${source.id}-${hand}` }, source.speed);
    const plan = handPlan(steps, hand, { clock });
    const old = engagementOf(plan, notes[1].midi, clock.toSeconds(531.5));
    close(old.end, clock.toSeconds(532), `${hand}: original half-beat duration`);
    close(old.release, old.end, `${hand}: do not add an unreachable 40 ms tail`);
    assert.equal(old.releaseKind, "end");
    const poseAt = seconds => handPose(steps, clock.toBeat(seconds), hand, { ...LAB, clock });
    assert.ok(exactOnKey(poseAt(old.end - 0.001), 1, notes[1].midi));
    const after = poseAt(old.end + 0.01);
    assert.notEqual(after.fingers[0].state, "down");
    assert.ok(exactOnKey(after, 4, notes[2].midi), `${hand}: the ring lands on time`);
    // The preceding reachable black-thumb crossing still overlaps normally.
    const prior = engagementOf(plan, notes[0].midi, clock.toSeconds(531));
    close(prior.release, prior.end + 0.04, `${hand}: nearby legato is retained`);
    const unthumbed = [note("index", hand === "left" ? 72 : 60, 0, 1, hand),
      note("ring", hand === "left" ? 67 : 65, 1, 1, hand)];
    const noThumb = handTimeline(unthumbed, new Map([["index", 2], ["ring", 4]]), hand);
    const first = handPlan(noThumb, hand, { clock }).engagements[0];
    close(first.release, first.end + 0.04, `${hand}: no-thumb legato is unaffected`);
  }
});

test("a finger-over lifts above a tucked thumb", () => {
  const inputs = scenarioInputs(fixture("scale"));
  const R = (s) => posesAtSeconds(inputs, s).right;
  // F5 (1) at 5.4 s, E5 (3) at 5.7 s.
  const mid = R(5.6);
  assert.ok(mid.fingers[2].lift >= 0.6, `finger 3 high mid-hop (${mid.fingers[2].lift.toFixed(2)})`);
  const late = R(5.65);
  assert.ok(exactOnKey(late, 1, 77), "the thumb stays down on F5");
  assert.ok(late.fingers[0].under > 0, "tucked under the leaning hand");
  for (let s = 5.42; s < 5.74; s += 0.01) {
    const pose = R(s);
    const a = pose.fingers[0].axis.at(-1),
      b = pose.fingers[2].axis.at(-1);
    const apart = Math.hypot(a.x - b.x, a.y - b.y) >= 0.45 * pose.unit || Math.abs(a.y - b.y) >= 0.35 * pose.verticalUnit;
    assert.ok(apart, `pads apart, or the crossing finger above, at ${s.toFixed(2)} s`);
  }
  assert.ok(exactOnKey(R(5.7), 3, 76), "E5 exact at its onset");
});

test("a position does not move for arpeggios, tremolos or substitutions", () => {
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
  const arpeggio = handTimeline(
    [note("c", 60, 0, 0.5), note("e", 64, 0.5, 0.5), note("g", 67, 1, 0.5), note("c2", 72, 1.5, 0.5)],
    new Map([
      ["c", 1],
      ["e", 2],
      ["g", 3],
      ["c2", 5],
    ]),
    "right",
  );
  assert.equal(handPlan(arpeggio, "right").plans.length, 0, "one position for C E G C");
  const xs = [];
  for (let b = 0; b <= 2; b += 0.01) xs.push(handPose(arpeggio, b, "right", geometry).x / 40);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 0.4, "the palm only rocks toward the reaching fingers");
  // An octave/dyad tremolo with a substitution on one key (S04-like, LH).
  const notes = [];
  const fingering = new Map();
  for (let i = 0; i < 12; i++) {
    const b = i * 0.25;
    const pair = i % 2 ? [[68, 2], [65, 3]] : [[72, 1], [60, 5]];
    pair.forEach(([midi, f], j) => {
      const id = `t${i}${j}`;
      notes.push(note(id, midi, b, 0.25, "left"));
      fingering.set(id, f);
    });
  }
  const tremolo = handTimeline(notes, fingering, "left");
  const clock = clockMap({ id: "tremolo", bpm: 144 });
  const poses = [];
  for (let b = 0.75; b <= 2.25; b += 0.02) poses.push(handPose(tremolo, b, "left", { ...geometry, clock }));
  const px = poses.map((p) => p.x);
  assert.ok(Math.max(...px) - Math.min(...px) <= 0.05 * 40 + 1e-9, "the lean varies by at most 0.05 key");
  const ky = poses.map((p) => p.knuckleY);
  assert.ok(Math.max(...ky) - Math.min(...ky) < 1e-6, "no knuckle-row bob");
});

test("small shifts straddle the onset without cutting the previous note", () => {
  // S11, right hand: a 1.1-key shift into the long position at 250 ms (IOI 83).
  const inputs = scenarioInputs(fixture("S11"));
  const plan = handPlan(inputs.steps.right, "right", { clock: inputs.clock });
  const slides = plan.plans.filter((p) => p.kind === "SLIDE");
  assert.ok(slides.length > 0, "the shift is a slide");
  for (const p of slides) {
    assert.ok(p.tDepart < p.onsetB && p.tArrive > p.onsetB, "straddling the onset");
    assert.ok(!(p.steal > 0), "nothing stolen");
    for (const e of plan.engagements)
      if (e.onset < p.onsetB && e.end > p.tDepart) assert.ok(e.release >= e.end - 1e-9 || !["travel"].includes(e.releaseKind), `${e.midi} held to its end`);
    let prev = null;
    for (let s = p.tDepart; s <= p.tArrive; s += 0.002) {
      const m = handMotion(inputs.steps.right, inputs.clock.toBeat(s), "right", { clock: inputs.clock });
      const x = m.palm.C;
      if (prev != null) assert.ok(Math.abs(x - prev) / 0.002 <= 25, `palm ${(Math.abs(x - prev) / 0.002).toFixed(1)} keys/s`);
      prev = x;
    }
  }
});
test("an unreachable hold retains its written key contact through fallback", () => {
  const inputs = scenarioInputs(fixture("S07"));
  for (const s of [1, 1.5, 2.99]) {
    const pose = posesAtSeconds(inputs, s).left;
    assert.equal(pose.guidanceOnly, true);
    assert.ok(pose.guidance.some(k => k.midi === 38 && k.state === "down"), `D2 still held at ${s} s`);
  }
  assert.ok(!posesAtSeconds(inputs, 3.0).left.guidance.some(k => k.midi === 38));
});

test("a chord wider than a hand preserves simultaneous key guidance", () => {
  const notes = [note("a1", 33, 1, 2, "left"), note("a2", 45, 1, 2, "left"), note("fs3", 54, 1, 2, "left")];
  const steps = handTimeline(notes, new Map([["a1", 5], ["a2", 3], ["fs3", 1]]), "left");
  const plan = handPlan(steps, "left");
  assert.equal(plan.positions[0].roll, null);
  assert.deepEqual(plan.contacts.map(k => k.onset), [0.5, 0.5, 0.5]);
  const geometry = { keyWidth: 36, keysHeight: 172, bedHeight: 227 };
  for (const beat of [1, 1.01, 1.1, 2.9]) {
    const pose = handPose(steps, beat, "left", geometry);
    assert.equal(pose.guidanceOnly, true);
    assert.deepEqual(pose.guidance.filter(k => k.state === "down").map(k => k.midi), [33, 45, 54]);
  }
});

test("an impossible zero-gap leap preserves the hold and reports the missed physical deadline", () => {
  // A held note (finger 3), then a jump at its exact end: no time is free.
  const result = (gap, d) => {
    const steps = handTimeline(
      [note("a", 48, 0, gap / 0.5, "right"), note("b", 48 + Math.round((d * 12) / 7), gap / 0.5, 0.5, "right")],
      new Map([
        ["a", 3],
        ["b", 1],
      ]),
      "right",
    );
    return { plan: handPlan(steps, "right"), steps };
  };
  const gaps = [0.1, 0.2, 0.35, 0.5, 0.75, 1.0];
  const dists = [4, 7, 10, 16];
  const speed = (p) => Math.abs(p.d) / (p.tArrive - p.tDepart);
  for (const d of dists) {
    for (const gap of gaps) {
      const { plan, steps } = result(gap, d);
      const p = plan.plans[0];
      assert.equal(p.kind, "TRAVEL");
      close(plan.engagements[0].release, gap, "the entire note survives");
      close(p.tDepart, gap, "the palm leaves only at release");
      assert.equal(p.steal, 0);
      assert.equal(p.forced, true, "no physically reachable deadline is claimed");
      assert.ok(speed(p) <= 130 + 1e-6, "even a late move respects the speed cap");
      assert.ok(p.tArrive > gap, "the physical arrival is honestly late");
      const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
      const held = handPose(steps, (gap - 0.0001) / 0.5, "right", geometry);
      assert.equal(held.fingers[2].state, "down", "held immediately before the boundary");
      const onset = handPose(steps, gap / 0.5, "right", geometry);
      assert.equal(onset.guidanceOnly, false, "the hand remains visible through a late physical arrival");
      close(plan.contacts[1].onset, gap, "the score's new attack is unchanged");
      assert.equal(plan.engagements[1].articulation, "late-contact");
      assert.ok(plan.engagements[1].contactAt >= p.tArrive - 1e-9);
      assert.ok(onset.marks.some(k => k.midi === 48 + Math.round(d * 12 / 7)), "the exact destination stays marked");
    }
  }
});
test("repeated keys preserve written ends and alternating fingers never share the key", () => {
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
  // Same finger: E4 (3) twice, 0.5 s apart.
  const same = handTimeline(
    [note("a", 64, 0, 1), note("b", 64, 1, 1)],
    new Map([
      ["a", 3],
      ["b", 3],
    ]),
    "right",
  );
  const repeat = handPlan(same, "right").engagements[0];
  assert.equal(repeat.releaseKind, "end");
  close(repeat.release, 0.5, "the re-strike does not shorten the first note");
  assert.equal(repeat.articulation, "continuous-contact");
  // Alternating fingers on one key: 3 then 1, 0.5 s apart.
  const swap = handTimeline(
    [note("a", 64, 0, 1), note("b", 64, 1, 1)],
    new Map([
      ["a", 3],
      ["b", 1],
    ]),
    "right",
  );
  const first = handPlan(swap, "right").engagements[0];
  assert.equal(first.releaseKind, "end");
  close(first.release, 0.5, "the old finger retains its written hold");
  for (let s = 0.3; s <= 0.6; s += 0.001) {
    const pose = handPose(swap, s / 0.5, "right", geometry);
    const a = pose.fingers[2].axis.at(-1),
      b = pose.fingers[0].axis.at(-1);
    const apart = Math.hypot(a.x - b.x, a.y - b.y) >= 0.5 * pose.unit || Math.abs(a.y - b.y) >= 0.35 * pose.verticalUnit;
    assert.ok(apart, `the two pads never share the key point (${s.toFixed(3)} s)`);
    const rings = pose.fingers.filter((f) => f.number > 0.05 && f.state !== "up" && (f.state === "down" ? f.axis.at(-1) : f.landing) && Math.abs((f.state === "down" ? f.axis.at(-1).x : f.landing.x) - (keyCentre(64) * 40 - pose.x)) < 1);
    assert.ok(rings.length <= 1, `one ring on the key at ${s.toFixed(3)} s`);
  }
});

test("rests relax, dim and wake in seconds", () => {
  // A note, a 13-second rest, a note 5 keys away (0.5 s per beat).
  const steps = handTimeline(
    [note("a", 60, 0, 1), note("b", 69, 28, 1)],
    new Map([
      ["a", 1],
      ["b", 1],
    ]),
    "right",
  );
  const at = (s) => handMotion(steps, s / 0.5, "right");
  // The note ends at 0.5 s: idle 1.4 s ≈ 1.9 s on the clock.
  assert.equal(at(1.7).rest, false, "not yet");
  assert.equal(at(2.1).rest, true, "dims after about 1.4 s idle");
  const entry = 14;
  assert.equal(at(entry - 2.1).rest, true, "still resting 2.1 s before");
  assert.equal(at(entry - 1.7).rest, false, "awake 1.9 s before the entry");
  const move = handPlan(steps, "right").plans[0];
  close(move.tArrive, entry - 1.0, "arrives 1.0 s early and hovers");
  assert.ok(entry - move.tDepart < 1.5 && entry - move.tDepart > 1.1, "departs about 1.3 s before");
  // A 2.57-s rest never dims.
  const short = handTimeline(
    [note("a", 60, 0, 1), note("b", 62, 1 + 2.57 / 0.5, 1)],
    new Map([
      ["a", 1],
      ["b", 2],
    ]),
    "right",
  );
  for (let s = 0; s < 3.2; s += 0.01) assert.equal(handMotion(short, s / 0.5, "right").rest, false, `no dimming at ${s.toFixed(2)} s`);
});

test("before the first note the hand is placed and never dims while counting; numbers light 1 s ahead", () => {
  const steps = handTimeline([note("a", 64, 0, 1)], new Map([["a", 3]]), "right");
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
  const counted = (beat) => handPose(steps, beat, "right", { ...geometry, counting: true });
  for (const beat of [-12, -8, -4, -2.5]) assert.equal(counted(beat).rest, false, `awake while counting (${beat})`);
  assert.equal(handPose(steps, -12, "right", geometry).rest, true, "a long silence before playing dims without a count");
  // 0.5 s per beat: the middle finger's number and mark from 1 s ahead.
  assert.equal(counted(-2.2).fingers[2].state, "up", "1.1 s ahead: nothing yet");
  const ready = counted(-1.6);
  assert.equal(ready.fingers[2].state, "ready", "0.8 s ahead: ready");
  assert.ok(ready.marks.some((m) => m.midi === 64 && m.finger === 3), "and its key is marked");
  close(ready.x + ready.fingers[2].landing.x, keyCentre(64) * 40, "landing on E");
  // The hand already stands over its first position.
  const placed = counted(-6);
  assert.ok(Math.abs(placed.x / 40 - (keyCentre(64) + 0.45)) < 1.6, "placed over the first notes");
});

test("wait mode shows strikers hovering ready, not down; a listen pause keeps sounding fingers down", () => {
  const steps = handTimeline(
    [note("held", 60, 0, 4), note("a", 64, 0, 1), note("b", 67, 1, 1)],
    new Map([
      ["held", 1],
      ["a", 3],
      ["b", 5],
    ]),
    "right",
  );
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
  // Waiting for the chord at beat 1: G (5) hovers ready, the held C stays down.
  const wait = handPose(steps, 1, "right", { ...geometry, frozen: true, waiting: true });
  assert.equal(wait.fingers[4].state, "ready", "the striker hovers");
  assert.ok(wait.fingers[4].lift > 0.25, "lifted over its key");
  close(wait.x + wait.fingers[4].axis.at(-1).x, keyCentre(67) * 40, "right over G");
  assert.equal(wait.fingers[4].landing.alpha, 1, "its footprint is full");
  assert.ok(exactOnKey(wait, 1, 60), "the held key stays down");
  assert.equal(wait.rest, false);
  // A listen pause mid-note is the plain frame: sounding fingers stay down.
  const plain = handPose(steps, 0.5, "right", geometry);
  const paused = handPose(steps, 0.5, "right", { ...geometry, frozen: true });
  assert.equal(paused.signature, plain.signature, "pausing changes nothing");
  assert.ok(exactOnKey(paused, 3, 64) && exactOnKey(paused, 1, 60));
});

test("wait mode reconstructs the current chord without replay or drifting", () => {
  const inputs = scenarioInputs(fixture("S07"));
  const expected = posesAt(inputs, 1, LAB, { waiting: true });
  for (const since of [0, 0.2, 0.4, 1.4, 3, 30]) {
    const actual = posesAt(inputs, 1, LAB, { waiting: true, settle: { since } });
    assert.deepEqual(actual, expected, `transport pose unchanged after ${since} seconds`);
  }
  assert.ok(expected.left.guidance.filter(k => k.struck).every(k => k.state === "ready"));
});

test("two hands fold, raise and layer; z-order never flips while two still hands overlap", () => {
  const inputs = scenarioInputs(fixture("S09"));
  let lastTop = null,
    lastOverlap = false,
    crowded = 0;
  const box = (p) => {
    const xs = p.back.map((q) => p.x + q.x);
    return [Math.min(...xs), Math.max(...xs)];
  };
  for (let s = -1; s <= 2.6; s += 1 / 120) {
    const { left: L, right: R } = posesAtSeconds(inputs, s);
    if (!L || !R) continue;
    assert.notEqual(L.zTop, R.zTop, "exactly one hand on top");
    const [l0, l1] = box(L),
      [r0, r1] = box(R);
    const overlap = Math.min(l1, r1) > Math.max(l0, r0);
    const top = L.zTop ? "left" : "right";
    if (overlap && lastOverlap && lastTop && top !== lastTop)
      assert.ok(Math.max(L.palm.lift, R.palm.lift) >= 0.5, `z changes only with a hand in the air (${s.toFixed(3)} s)`);
    lastTop = top;
    lastOverlap = overlap;
    if (L.palm.crowd > 0.5) {
      crowded++;
      assert.equal(L.palm.crowd, R.palm.crowd, "crowding is mutual");
      const under = L.zTop ? R : L;
      assert.ok(under.palm.lift <= 0.1 + 1e-9, "the hand underneath stays down");
    }
  }
  assert.ok(crowded > 10, "the passage crowds the hands");
});

test("black keys move the knuckle row forward per position without moving white contacts", () => {
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250 };
  const white = handTimeline([note("a", 60, 0, 1), note("b", 64, 0, 1)], new Map([["a", 1], ["b", 3]]), "right");
  const black = handTimeline([note("a", 61, 0, 1), note("b", 66, 0, 1)], new Map([["a", 1], ["b", 3]]), "right");
  const w = handPose(white, 0.2, "right", geometry),
    b = handPose(black, 0.2, "right", geometry);
  assert.ok(b.palm.forward > 0.9 && w.palm.forward === 0);
  assert.ok(b.knuckleY < w.knuckleY - 0.5 * geometry.keyWidth, "the row moves toward the fallboard on black keys");
  // A mixed passage: one forward value for the whole position, white keys exact.
  const mixed = handTimeline(
    [note("c", 60, 0, 4), note("d", 62, 0, 1), note("ds", 63, 1, 1), note("e", 64, 2, 1)],
    new Map([
      ["c", 1],
      ["d", 2],
      ["ds", 3],
      ["e", 4],
    ]),
    "right",
  );
  const rows = new Set();
  for (let beat = 0; beat < 3; beat += 0.05) {
    const pose = handPose(mixed, beat, "right", geometry);
    rows.add(pose.knuckleY.toFixed(6));
    assert.ok(exactOnKey(pose, 1, 60), "the held white contact stays exact");
    close(pose.fingers[0].axis.at(-1).y, 190 * 0.68 + Math.min(0.45 * 40, 0.2 * 190), "at the white depth");
  }
  assert.equal(rows.size, 1, "no per-note bob");
});

test("finger lengths and palm width stay anatomical through every fixture", () => {
  for (const name of ["scale", "S01", "S04", "S06", "S07", "S09", "S11", "S12"]) {
    const inputs = scenarioInputs(fixture(name));
    const t0 = inputs.clock.toSeconds(inputs.firstBeat) - 0.5,
      t1 = inputs.clock.toSeconds(inputs.endBeat) + 0.5;
    for (let s = t0; s <= t1; s += 0.001) {
      const both = posesAtSeconds(inputs, s);
      for (const pose of [both.left, both.right]) {
        if (!pose || pose.forced || pose.guidanceOnly) continue;
        for (let f = 1; f <= 5; f++) {
          const r = ratioOf(pose, f);
          if (!(r >= 0.55 - 1e-9 && r <= (f === 1 ? 1.1 : 1.3) + 1e-9))
            assert.fail(`${name} ${s.toFixed(3)} s finger ${f} length ratio ${r.toFixed(3)}`);
        }
        const xs = pose.knuckles.map((k) => k.x);
        const row = (Math.max(...xs) - Math.min(...xs)) / (3.1 * pose.span);
        if (row > 1.22 + 1e-9) assert.fail(`${name} ${s.toFixed(3)} s knuckle row ${row.toFixed(3)}`);
      }
    }
  }
});

// A canvas stand-in that records every call and property write, with Path2D
// recorded as its own command list, so two paintings can be compared.
function recordPainting(pose, hand = "right") {
  const log = [];
  const value = (v) =>
    v instanceof MockPath ? { path: v.ops } : v && v.gradient ? { gradient: v.gradient } : v;
  let gradients = 0;
  const gradient = (kind, args) => {
    const g = { gradient: `${kind}#${gradients++}` };
    g.addColorStop = (...a) => log.push(["stop", g.gradient, ...a]);
    log.push([kind, ...args]);
    return g;
  };
  const ctx = new Proxy(
    {},
    {
      get(_, name) {
        if (name === "createLinearGradient") return (...a) => gradient("linear", a);
        if (name === "createRadialGradient") return (...a) => gradient("radial", a);
        return (...a) => log.push([name, ...a.map(value)]);
      },
      set(_, name, v) {
        log.push(["=", name, value(v)]);
        return true;
      },
    },
  );
  drawHand(ctx, pose, hand, { width: 12 * pose.unit, height: 230, dpr: 1 });
  return JSON.stringify(log);
}
class MockPath {
  constructor() {
    this.ops = [];
    for (const name of ["moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "arc", "ellipse", "closePath", "rect"])
      this[name] = (...a) => this.ops.push([name, ...a]);
  }
}

test("signature is a pure function of what the drawer reads", () => {
  const saved = globalThis.Path2D;
  globalThis.Path2D = MockPath;
  try {
    // Equal signatures paint identically, across every frame of three fixtures.
    const bySignature = new Map();
    let compared = 0,
      distinct = 0;
    for (const name of ["scale", "S01", "S06"]) {
      const inputs = scenarioInputs(fixture(name));
      const t0 = inputs.clock.toSeconds(inputs.firstBeat) - 0.5,
        t1 = inputs.clock.toSeconds(inputs.endBeat);
      for (let s = t0; s <= t1; s += 1 / 120) {
        const both = posesAtSeconds(inputs, s);
        for (const hand of ["left", "right"]) {
          const pose = both[hand];
          if (!pose) continue;
          const key = `${hand}|${pose.signature}`;
          const seen = bySignature.get(key);
          if (!seen) {
            bySignature.set(key, { pose, painting: null, others: 0 });
            continue;
          }
          if (seen.others >= 2 || JSON.stringify(seen.pose.fingers) === JSON.stringify(pose.fingers)) continue;
          seen.others++;
          seen.painting ??= recordPainting(seen.pose, hand);
          assert.equal(recordPainting(pose, hand), seen.painting, `${name} ${hand} ${s.toFixed(3)} s: one signature, one painting`);
          compared++;
        }
      }
    }
    distinct = bySignature.size;
    assert.ok(compared > 200, `poses that differ below the buckets were compared (${compared})`);
    assert.ok(distinct > 500, `many distinct signatures were sampled (${distinct})`);

    // Every field the drawer reads changes the signature and the painting;
    // fields outside the signature never change the painting.
    const inputs = scenarioInputs(fixture("scale"));
    const base = posesAtSeconds(inputs, 0.75).right; // thumb passing under, E4 down, a ready footprint
    assert.equal(base.fingers[2].state, "down");
    assert.ok(base.fingers.some((f) => f.landing), "a footprint to perturb");
    const original = recordPainting(base);
    const copy = () => structuredClone(base);
    const ready = base.fingers.findIndex((f) => f.landing);
    const up = base.fingers.findIndex((f) => f.state !== "down");
    const read = {
      "a pad": (p) => (p.fingers[1].axis.at(-1).x += 1),
      "a knuckle": (p) => (p.fingers[3].axis[0].y += 1),
      "the thumb's MCP": (p) => (p.fingers[0].axis[1].x += 1),
      state: (p) => (p.fingers[up].state = "down"),
      "landing point": (p) => (p.fingers[ready].landing.x += 1),
      "landing alpha": (p) => (p.fingers[ready].landing.alpha = p.fingers[ready].landing.alpha > 0.5 ? 0.2 : 0.9),
      lift: (p) => (p.fingers[up].lift += 0.2),
      press: (p) => (p.fingers[2].press = p.fingers[2].press > 0.5 ? 0.3 : 1),
      number: (p) => (p.fingers[2].number = p.fingers[2].number > 0.5 ? 0.3 : 1),
      under: (p) => (p.fingers[0].under = p.fingers[0].under > 0.5 ? 0.2 : 0.9),
      "palm outline": (p) => (p.back[13].x += 1),
      knuckleY: (p) => (p.knuckleY += 1),
      "wrist.y": (p) => (p.wrist.y += 1),
      roll: (p) => (p.palm.roll += 0.2),
      relax: (p) => (p.palm.relax += 0.3),
      unit: (p) => (p.unit += 1),
    };
    for (const [field, change] of Object.entries(read)) {
      const p = copy();
      change(p);
      assert.notEqual(poseSignature(p), base.signature, `${field} is in the signature`);
      assert.notEqual(recordPainting(p), original, `${field} is painted`);
    }
    const unread = {
      x: (p) => (p.x += 40),
      "palm.lift": (p) => (p.palm.lift = 0.8),
      "palm.crowd": (p) => (p.palm.crowd = 0.7),
      zTop: (p) => (p.zTop = !p.zTop),
      marks: (p) => (p.marks = [{ midi: 70, finger: 4, kind: "land", strength: 1 }]),
      pedal: (p) => (p.pedal = [{ midi: 50, kind: "pedal", until: 9 }]),
      glide: (p) => (p.glide = 0.5),
      beat: (p) => (p.beat += 1),
      seconds: (p) => (p.seconds += 1),
      forced: (p) => (p.forced = !p.forced),
      knuckles: (p) => (p.knuckles = []),
      verticalUnit: (p) => (p.verticalUnit += 3),
      keysHeight: (p) => (p.keysHeight += 10),
      "a sub-bucket shift": (p) => (p.knuckleY += (Math.round(p.knuckleY * 2) / 2 - p.knuckleY) / 2),
    };
    for (const [field, change] of Object.entries(unread)) {
      const p = copy();
      change(p);
      assert.equal(recordPainting(p), original, `${field} is not painted`);
      assert.equal(poseSignature(p), base.signature, `${field} is not in the signature`);
    }
  } finally {
    globalThis.Path2D = saved;
  }
});

test("C¹ truncation: overlapping plans keep palm velocity continuous", () => {
  // Three single notes 2.5 keys apart at IOI 83 ms: the second slide departs
  // before the first has arrived and takes over at its velocity.
  const notes = [59, 63, 67].map((m, i) => note(`n${i}`, m, i * 0.25, 0.25));
  const steps = handTimeline(notes, new Map(notes.map((n) => [n.id, 3])), "right");
  const clock = clockMap({ id: "chain", bpm: 180 });
  const plan = handPlan(steps, "right", { clock });
  assert.deepEqual(plan.plans.map((p) => p.kind), ["SLIDE", "SLIDE"]);
  assert.ok(plan.path[0].t1 < plan.path[0].planned, "the first slide is cut short");
  assert.ok(plan.path[1].v0 > 0, "the next one starts at the cut velocity");
  const at = (s) => handMotion(steps, clock.toBeat(s), "right", { clock }).palm.C;
  let prevV = null;
  for (let s = -0.2; s <= 0.6; s += 0.002) {
    const v = (at(s + 0.001) - at(s - 0.001)) / 0.002;
    if (prevV != null) assert.ok(Math.abs(v - prevV) <= 5, `velocity jump ${Math.abs(v - prevV).toFixed(2)} keys/s at ${s.toFixed(3)} s`);
    prevV = v;
  }
});
test("every frame of the stress fixtures passes the guards", async () => {
  const { lintScenario } = await import("../scripts/hand-lab-lint.mjs");
  const forced = {};
  for (const name of ["scale", "S01", "S04", "S06", "S07", "S09", "S11", "S12"]) {
    for (const report of lintScenario(fixture(name), { speeds: [1, 0.5], fps: 120, waitChecks: ["S01", "S07", "S12"].includes(name) })) {
      assert.equal(report.model, 0, `${name} ${report.mode} ×${report.speed}: ${JSON.stringify(report.summary)}`);
      forced[`${name}×${report.speed}`] = (report.forcedFrames.left + report.forcedFrames.right) || 0;
    }
  }
  // The impossible drop remains visible with an explicit physical deadline.
  const drop = scenarioInputs(fixture("S04"));
  const dropPlans = ["left", "right"].map(hand => handPlan(drop.steps[hand], hand, { clock: drop.clock })).filter(Boolean);
  assert.ok(dropPlans.some(plan => plan.plans.some(p => p.forced) && plan.engagements.some(e => e.articulation === "late-contact")), "the S04 drop reports its impossible physical deadline");
  assert.equal(forced["scale×1"], 0, "a scale is never forced");
});

test("handPoses equals handPose per hand and seeks reproduce signatures with the other hand supplied", () => {
  const inputs = scenarioInputs(fixture("S09"));
  const options = poseOptions(inputs, LAB);
  const beats = [-1, 0.2, 1.3, 2.9, 4.1, 0.2, -1];
  const seen = new Map();
  for (const beat of beats) {
    const both = handPoses(inputs.steps, beat, options);
    for (const hand of ["left", "right"]) {
      const other = hand === "left" ? "right" : "left";
      const alone = handPose(inputs.steps[hand], beat, hand, { ...options, other: { steps: inputs.steps[other], hand: other } });
      assert.deepEqual(alone, both[hand], `${hand} at ${beat}`);
      const key = `${hand}@${beat}`;
      if (seen.has(key)) assert.equal(both[hand].signature, seen.get(key), "seeking back reproduces the pose");
      seen.set(key, both[hand].signature);
    }
  }
  const hidden = handPoses(inputs.steps, 0.3, { ...options, visible: (hand) => hand === "right" });
  assert.equal(hidden.left, null, "a hand that is not shown has no pose");
  assert.ok(hidden.right);
  assert.equal(handPoses({ left: [], right: inputs.steps.right }, 0.3, options).left, null, "nothing to play, no pose");
});

test("count-in rate: negative beats use countInSecondsPerBeat", () => {
  const steps = handTimeline([note("a", 64, 0, 1)], new Map([["a", 3]]), "right");
  const score = { id: "count", bpm: 120 };
  const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 250, counting: true };
  // The count runs at 1 s per beat while the piece is at 0.5 s per beat: the
  // finger is ready 1 s (one count beat) before the first note.
  const counted = clockMap(score, 1, 1);
  const plain = clockMap(score, 1);
  const finger = (clock, beat) => handPose(steps, beat, "right", { ...geometry, clock }).fingers[2].state;
  assert.equal(finger(counted, -0.9), "ready", "0.9 count beats = 0.9 s ahead");
  assert.equal(finger(counted, -1.2), "up", "1.2 s ahead: not yet");
  assert.equal(finger(plain, -1.9), "ready", "without the count rate 1.9 beats is 0.95 s");
  close(counted.toSeconds(-2), -2, "the clock map uses the count rate before beat 0");
});

test("the coach strip shows the next attack beside a hold when it is under a second away", async () => {
  const { deriveHandCoach, coachNotes } = await import("../src/hand-coach.mjs");
  const { secondsBetween } = await import("../src/tempo.mjs");
  const notes = [note("c", 60, 0, 4), note("e", 64, 3, 1)];
  const fingering = new Map([
    ["c", 1],
    ["e", 3],
  ]);
  const score = { id: "coach", bpm: 120, notes };
  const strip = (beat, speed = 1) => {
    const c = deriveHandCoach(notes, fingering, beat, {}).right;
    const gap = c.gapBeats == null ? null : secondsBetween(score, beat, beat + c.gapBeats, speed);
    return coachNotes(c, gap).map((n) => `${n.phase === "next" ? "Next" : n.phase === "hold" ? "Hold" : "Play"} ${n.label} ${n.finger}`);
  };
  // 0.5 s per beat: E is 1.5 s away at beat 0, 0.5 s away at beat 2.
  assert.deepEqual(strip(1), ["Hold C4 1"], "a far attack waits");
  assert.deepEqual(strip(2.1), ["Hold C4 1", "Next E4 3"], "Hold C (1) · Next E (3)");
  assert.deepEqual(strip(2.1, 0.4), ["Hold C4 1"], "seconds, not beats: at 40 % speed it is 1.1 s away");
  assert.deepEqual(strip(3.05), ["Hold C4 1", "Play E4 3"], "at the attack the strip is the chord itself");
  // Without a time to judge by, nothing is added.
  assert.deepEqual(coachNotes(deriveHandCoach(notes, fingering, 2.1, {}).right, null).length, 1);
});

// Review 2 (graphics): no drawn joint jumps between two 120-fps frames while
// the pads around it move smoothly — the thumb's MCP never swings across its
// CMC–pad line, knuckles never jump when a neighbour's hold reaches 1, a
// finger let go far from the hand draws in, and a thumb giving way to the
// other hand never jumps at its key. A joint may move at most a few times
// as far as its own pad and the hand do (plus 8 px) between frames. On the
// lab's keys and on the app's two keyboards (kw 45 / kh 166, and the
// flatter kw 68 / kh 136).
test("no drawn joint pops between frames (thumb MCP, knuckles, released fingers)", () => {
  const worst = [];
  for (const geometry of [LAB, ...APP_KEYS]) {
    for (const name of ["scale", "S01", "S04", "S06", "S07", "S09", "S11", "S12"]) {
      const inputs = scenarioInputs(fixture(name));
      const t0 = inputs.clock.toSeconds(inputs.firstBeat) - 0.5,
        t1 = inputs.clock.toSeconds(inputs.endBeat) + 0.3;
      let prev = null;
      for (let t = t0; t <= t1; t += 1 / 120) {
        const both = posesAt(inputs, inputs.clock.toBeat(t), geometry);
        for (const hand of ["left", "right"]) {
          const p = both[hand],
            q = prev?.[hand];
          if (!p || !q || p.guidanceOnly || q.guidanceOnly || p.forced || q.forced || p.forcedFinger || q.forcedFinger) continue;
          const dx = Math.abs(p.x - q.x);
          p.fingers.forEach((f, i) => {
            const g = q.fingers[i];
            const at = (pose, pt) => [pose.x + pt.x, pt.y];
            const move = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
            const tip = move(at(p, f.axis.at(-1)), at(q, g.axis.at(-1)));
            for (let j = 0; j < f.axis.length - 1; j++) {
              const d = move(at(p, f.axis[j]), at(q, g.axis[j]));
              const bound = 3 * tip + 2 * dx + 8;
              if (d > bound) worst.push(`kw ${geometry.keyWidth} ${name} ${hand} ${t.toFixed(3)} s finger ${f.finger} joint ${j} moved ${d.toFixed(1)} px (pad ${tip.toFixed(1)}, hand ${dx.toFixed(1)})`);
            }
          });
        }
        prev = both;
      }
    }
  }
  assert.deepEqual(worst.slice(0, 5), [], `${worst.length} joint pops`);
});

test("an arpeggio's 4 → 1 under a third is a pass: the held finger keeps its note while the thumb tucks under", () => {
  // Tornado bar 6, left hand: D4(1) A3(2) F♯3(4) D3(1) at ♩ = 76 (IOI 197 ms).
  const inputs = scenarioInputs(fixture("S01"));
  const plan = handPlan(inputs.steps.left, "left", { clock: inputs.clock }).plans.find((p) => Math.abs(p.onsetB - 5.921) < 0.002);
  assert.equal(plan.kind, "CROSS", "a pass, not a leap");
  assert.equal(plan.steal, 0, "nothing stolen from F♯3");
  const L = (s) => posesAtSeconds(inputs, s).left;
  for (const s of [5.75, 5.85, 5.915]) assert.ok(exactOnKey(L(s), 4, 54), `F♯3 held at ${s} s`);
  let under = 0;
  for (let s = 5.76; s < 5.92; s += 0.01) under = Math.max(under, L(s).fingers[0].under);
  assert.ok(under > 0.5, "the thumb passes beneath the hand");
  assert.ok(exactOnKey(L(5.922), 1, 50), "D3 exact at its onset");
  const outgoing = handPlan(inputs.steps.left, "left", { clock: inputs.clock }).engagements
    .find(e => e.midi === 54 && e.end > 5.9 && e.end < 5.93);
  close(outgoing.release, outgoing.end, "the crossed F♯3 contact ends exactly at its written release");
  assert.notEqual(L(5.95).fingers[3].state, "down", "no optional crossed contact after F♯3 ends");
});

test("a rolled chord's bass lets go at its finger's reach, never drawn as a stretched spoke", () => {
  // Moonlight bar 58, left hand: A1 | A2 F♯3 rolled; and the three-group F♯1 | F♯2 | A3.
  // (Within its reach, in the hand's own proportions: G1's 1.3 × its
  // natural length — never the 4–7-key spoke a rolled bass once drew.)
  const inputs = scenarioInputs(fixture("S06"));
  const plan = handPlan(inputs.steps.left, "left", { clock: inputs.clock });
  for (const pos of plan.positions.filter((p) => p.roll)) {
    const t0 = pos.rollAt[0],
      t1 = pos.rollAt.at(-1) + 0.25;
    for (let s = t0; s <= t1; s += 0.004) {
      const pose = posesAtSeconds(inputs, s).left;
      for (const f of pose.fingers.slice(1)) {
        const r = ratioOf(pose, f.finger);
        assert.ok(r <= 1.3, `finger ${f.finger} drawn ${r.toFixed(2)} × its reach at ${s.toFixed(3)} s`);
      }
    }
  }
});

test("finger numbers stay readable: a struck thumb shows its filled 1 at once, and rings never cover each other", () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          calls.push([key, ...args]);
          if (key === "createLinearGradient" || key === "createRadialGradient") return { addColorStop() {} };
          if (key === "measureText") return { width: 6 };
          return undefined;
        };
      },
      set(target, key, value) {
        target[key] = value;
        if (key === "globalAlpha") calls.push(["alpha", value]);
        return true;
      },
    },
  );
  globalThis.Path2D ??= class {
    constructor() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    closePath() {}
    arc() {}
    ellipse() {}
    addPath() {}
  };
  const rings = (pose, hand) => {
    calls.length = 0;
    drawHand(ctx, pose, hand, { width: 600, height: 400, dpr: 1 });
    const out = [];
    let alpha = 1;
    for (const c of calls) {
      if (c[0] === "alpha") alpha = c[1];
      if (c[0] === "fillText" && /^[1-5]$/.test(String(c[1]))) out.push({ n: +c[1], x: c[2], y: c[3], alpha });
    }
    return out;
  };
  // The scale's thumb-under lands on F4 at 0.9 s: its ring is there at once.
  const scale = scenarioInputs(fixture("scale"));
  const struck = posesAtSeconds(scale, 0.9005).right;
  const one = rings(struck, "right").find((r) => r.n === 1);
  assert.ok(one && one.alpha > 0.99, "the filled 1 shows at the strike");
  // A finger hovering over (or crossing) a down thumb: rings side by side.
  for (const [name, hand, from, to] of [
    ["scale", "right", 0.9, 1.25],
    ["scale", "right", 5.4, 5.75],
  ]) {
    const inputs = scenarioInputs(fixture(name));
    for (let s = from; s < to; s += 0.01) {
      const pose = posesAtSeconds(inputs, s)[hand];
      const r = rings(pose, hand).filter((q) => q.alpha > 0.3);
      for (let i = 0; i < r.length; i++)
        for (let j = i + 1; j < r.length; j++) {
          const d = Math.hypot(r[i].x - r[j].x, r[i].y - r[j].y);
          assert.ok(d >= 2 * Math.min(pose.unit * 0.24, 10.5) * 0.98, `${name} ${s.toFixed(2)} s: rings ${r[i].n} and ${r[j].n} ${d.toFixed(1)} px apart`);
        }
    }
  }
});

// ---- the thumb as a hand shows it (review-1 F5) ------------------------------------
// Its metacarpal lies inside the palm (the palm's thumb side, the thenar,
// follows it); only the phalanges (MCP → pad) show as the thumb, within G1's
// 0.55–1.10 × its natural length in the hand's own proportions (shorter than
// the index's reach); a reach beyond them opens the web, never a straight
// spoke; the thumb stays at a natural angle from the index and turns
// smoothly; a thumb passing under the hand stays hidden beneath it.

// The painted shapes of a pose: the paths drawHand fills, as polygons
// (curves flattened), in its order — thumb, fingers 5–2, thenar, palm.
function flattenPath(ops) {
  const polys = [];
  let cur = null,
    pen = null;
  const push = (x, y) => {
    if (!cur) polys.push((cur = []));
    cur.push({ x, y });
    pen = { x, y };
  };
  for (const [op, ...a] of ops) {
    if (op === "moveTo") {
      polys.push((cur = []));
      push(a[0], a[1]);
    } else if (op === "lineTo") push(a[0], a[1]);
    else if (op === "quadraticCurveTo") {
      const p = pen;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8,
          s = 1 - t;
        push(s * s * p.x + 2 * s * t * a[0] + t * t * a[2], s * s * p.y + 2 * s * t * a[1] + t * t * a[3]);
      }
    } else if (op === "bezierCurveTo") {
      const p = pen;
      for (let i = 1; i <= 12; i++) {
        const t = i / 12,
          s = 1 - t;
        push(
          s * s * s * p.x + 3 * s * s * t * a[0] + 3 * s * t * t * a[2] + t * t * t * a[4],
          s * s * s * p.y + 3 * s * s * t * a[1] + 3 * s * t * t * a[3] + t * t * t * a[5],
        );
      }
    } else if (op === "arc" || op === "ellipse") {
      const arc = op === "arc";
      const [cx, cy] = a;
      const rx = a[2],
        ry = arc ? a[2] : a[3];
      const a0 = arc ? a[3] : a[5],
        a1 = arc ? a[4] : a[6],
        ccw = arc ? a[5] : a[7];
      let sweep = a1 - a0;
      if (ccw) while (sweep > 0) sweep -= 2 * Math.PI;
      else while (sweep < 0) sweep += 2 * Math.PI;
      for (let i = 0; i <= 16; i++) {
        const t = a0 + (sweep * i) / 16;
        push(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
      }
    }
  }
  return polys;
}
// Inside a filled path (nonzero winding over all its subpaths), or within
// `slack` px of its edge.
function insidePath(pt, polys, slack = 0) {
  let w = 0;
  const cross = (a, b) => (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y);
  let near = Infinity;
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      if (a.y <= pt.y) {
        if (b.y > pt.y && cross(a, b) > 0) w++;
      } else if (b.y <= pt.y && cross(a, b) < 0) w--;
      if (slack > 0) {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const t = clamp01(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1));
        near = Math.min(near, Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy));
      }
    }
  return w !== 0 || near <= slack;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function paintedShapes(pose, hand) {
  const saved = globalThis.Path2D;
  globalThis.Path2D = MockPath;
  const fills = [];
  const ctx = new Proxy(
    {},
    {
      get(_, name) {
        if (name === "fill") return (p) => p instanceof MockPath && fills.push(flattenPath(p.ops));
        if (name === "createLinearGradient" || name === "createRadialGradient") return () => ({ addColorStop() {} });
        if (name === "measureText") return () => ({ width: 6 });
        return () => {};
      },
      set: () => true,
    },
  );
  try {
    drawHand(ctx, pose, hand, { width: 12 * pose.unit, height: 400, dpr: 1 });
  } finally {
    globalThis.Path2D = saved;
  }
  assert.equal(fills.length, 7, "thumb, four fingers, thenar and palm are filled");
  return { thumb: fills[0], fingers: fills.slice(1, 5), thenar: fills[5], palm: fills[6] };
}
// The visible thumb's angle from the index's axis (the palm's forward axis),
// toward the thumb side, in the hand's own proportions (depth ÷ v), degrees.
const thumbAngle = (pose) => {
  const [, mcp, tip] = pose.fingers[0].axis;
  return (
    (Math.atan2((-pose.dir * (tip.x - mcp.x)) / pose.unit, -(tip.y - mcp.y) / pose.verticalUnit) * 180) / Math.PI
  );
};
// A still chord of one hand at 60 bpm (fingers by position), held 4 beats.
const stillChord = (midis, fingers, hand = "right") => {
  const notes = midis.map((m, i) => note(`n${i}`, m, 0, 4, hand));
  return handTimeline(notes, new Map(notes.map((n, i) => [n.id, fingers[i]])), hand);
};

test("the thumb's metacarpal lies inside the palm: only its phalanges are drawn as the thumb", () => {
  const cases = [];
  for (const geometry of [LAB, ...APP_KEYS]) {
    for (const hand of ["right", "left"]) {
      const flip = (m) => (hand === "right" ? m : 120 - m);
      for (const [midis, fingers] of [
        [[60, 64, 67], [1, 3, 5]],
        [[60, 69], [1, 5]],
        [[60, 72], [1, 5]],
      ])
        cases.push({ label: `${hand} ${midis.join("-")} kw ${geometry.keyWidth}`, hand, pose: handPose(stillChord(midis.map(flip), fingers, hand), 1, hand, geometry) });
    }
    for (const name of ["scale", "S01", "S06", "S07", "S12"]) {
      const inputs = scenarioInputs(fixture(name));
      const t0 = inputs.clock.toSeconds(inputs.firstBeat),
        t1 = inputs.clock.toSeconds(inputs.endBeat);
      for (let t = t0; t <= t1; t += 0.05) {
        const both = posesAt(inputs, inputs.clock.toBeat(t), geometry);
        for (const hand of ["left", "right"]) if (both[hand]) cases.push({ label: `${name} ${hand} ${t.toFixed(2)} s kw ${geometry.keyWidth}`, hand, pose: both[hand] });
      }
    }
  }
  const bad = [];
  for (const { label, hand, pose } of cases) {
    if (pose.guidanceOnly) continue;
    const shapes = paintedShapes(pose, hand);
    const [cmc, mcp, tip] = pose.fingers[0].axis;
    const u = pose.unit;
    // The metacarpal is inside the palm and its thenar (its last stretch may
    // meet the thumb's own root), to within a twentieth of a key.
    for (let i = 0; i <= 10; i++) {
      const q = { x: cmc.x + ((mcp.x - cmc.x) * i) / 10, y: cmc.y + ((mcp.y - cmc.y) * i) / 10 };
      const covered =
        insidePath(q, shapes.palm, 0.05 * u) ||
        insidePath(q, shapes.thenar, 0.05 * u) ||
        (i >= 8 && insidePath(q, shapes.thumb, 0.05 * u));
      if (!covered) {
        bad.push(`${label}: metacarpal point ${i}/10 outside the palm`);
        break;
      }
    }
    // The painted thumb is the phalanges: it stays within its width of the
    // MCP → pad line (no limb from the CMC).
    const off = (q) => {
      const dx = tip.x - mcp.x,
        dy = tip.y - mcp.y;
      const t = clamp01(((q.x - mcp.x) * dx + (q.y - mcp.y) * dy) / (dx * dx + dy * dy || 1));
      return Math.hypot(q.x - mcp.x - t * dx, q.y - mcp.y - t * dy);
    };
    const far = Math.max(...shapes.thumb.flat().map(off));
    if (far > 0.5 * u) bad.push(`${label}: thumb painted ${(far / u).toFixed(2)} keys off its MCP → pad line`);
    // (A thumb folded in brings its MCP near the CMC; its root then covers
    // that point without being a limb from it.)
    if (Math.hypot(mcp.x - cmc.x, mcp.y - cmc.y) > 0.6 * u && insidePath(cmc, shapes.thumb))
      bad.push(`${label}: the thumb's painted shape reaches its CMC`);
  }
  assert.ok(cases.length > 1000, "many poses checked");
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${cases.length} poses`);
});

test("the visible thumb keeps its length, a knuckle and a natural angle from the index, on every keyboard", () => {
  const bad = [];
  let visible = 0;
  for (const geometry of [LAB, ...APP_KEYS])
    for (const name of ["scale", "S01", "S04", "S06", "S07", "S09", "S11", "S12"]) {
      const inputs = scenarioInputs(fixture(name));
      const t0 = inputs.clock.toSeconds(inputs.firstBeat) - 0.5,
        t1 = inputs.clock.toSeconds(inputs.endBeat) + 0.3;
      const last = { left: null, right: null };
      for (let t = t0; t <= t1; t += 1 / 120) {
        const both = posesAt(inputs, inputs.clock.toBeat(t), geometry);
        for (const hand of ["left", "right"]) {
          const pose = both[hand];
          if (!pose) continue;
          if (pose.guidanceOnly) {
            assert.ok(pose.guidanceReason, "hidden scaffolds must have an explicit contact limitation");
            const expected = inputs.notes.filter(n => n.hand === hand && n.beat <= inputs.clock.toBeat(t) + 1e-8 && n.beat + n.duration > inputs.clock.toBeat(t) + 1e-8);
            for (const n of expected) assert.ok(pose.guidance.some(k => k.midi === n.midi && k.state === "down"), `guidance retains ${n.id}`);
            last[hand] = null;
            continue;
          }
          const at = `kw ${geometry.keyWidth} ${name} ${hand} ${t.toFixed(3)} s`;
          const u = pose.unit;
          const thumb = pose.fingers[0];
          const [cmc, mcp, tip] = thumb.axis;
          const L1 = Math.hypot(mcp.x - cmc.x, mcp.y - cmc.y);
          // G1, in the hand's own proportions: the visible thumb (MCP → pad),
          // never longer than the index's reach, and the metacarpal (CMC → MCP).
          const T2 = handLen(pose, mcp, tip) / HAND_BUILD.reach[1],
            T1 = handLen(pose, cmc, mcp) / HAND_BUILD.metacarpal;
          if (!(T2 >= 0.55 - 1e-6 && T2 <= 1.1 + 1e-6)) bad.push(`${at}: visible thumb ${T2.toFixed(3)} × its length`);
          if (T2 * HAND_BUILD.reach[1] > HAND_BUILD.reach[2] + 1e-6) bad.push(`${at}: visible thumb longer than the index's reach`);
          if (T1 > 1.1 + 1e-6) bad.push(`${at}: metacarpal ${T1.toFixed(3)} × its length`);
          const L2 = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
          // Never one straight spoke: a reaching chain keeps a bend at its MCP.
          if (L1 > 0.3 * u && Math.hypot(tip.x - cmc.x, tip.y - cmc.y) >= 0.995 * (L1 + L2)) bad.push(`${at}: thumb drawn as a straight spoke`);
          // A natural angle from the index while the thumb shows, turning
          // smoothly from frame to frame.
          const angle = thumbAngle(pose);
          const shows = (thumb.under || 0) < 0.5;
          if (shows) {
            visible++;
            if (angle < -10 || angle > 75) bad.push(`${at}: thumb at ${angle.toFixed(0)}° from the index`);
          }
          const was = last[hand];
          if (was && shows && was.shows && !pose.forced && !was.forced && Math.abs(angle - was.angle) > 20)
            bad.push(`${at}: thumb turned ${Math.abs(angle - was.angle).toFixed(0)}° in one frame`);
          last[hand] = { angle, shows, forced: pose.forced || pose.forcedFinger };
        }
      }
    }
  assert.ok(visible > 10000, "the thumb shows in most frames");
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} frames`);
});

test("a relaxed thumb rests beside the index; a wider reach opens the web instead of stretching the thumb", () => {
  for (const geometry of [LAB, ...APP_KEYS])
    for (const hand of ["right", "left"]) {
      const flip = (m) => (hand === "right" ? m : 120 - m);
      const poseOf = (midis, fingers) => handPose(stillChord(midis.map(flip), fingers, hand), 1, hand, geometry);
      const chord = poseOf([60, 64, 67], [1, 3, 5]),
        sixth = poseOf([60, 69], [1, 5]),
        octave = poseOf([60, 72], [1, 5]);
      const u = geometry.keyWidth;
      const at = `${hand} kw ${u}`;
      // C-E-G with 1 3 5: the MCP at the palm's thumb-side edge, just outside
      // the index knuckle and about level with it; the visible thumb shorter
      // than the index's reach (the hand's own proportions), about 25–50° out
      // from the index.
      {
        const [, mcp, tip] = chord.fingers[0].axis;
        const out = -chord.dir * (mcp.x - chord.knuckles[0].x) / u;
        const depth = (mcp.y - chord.knuckleY) / chord.palmDepth;
        assert.ok(out > 0.15 && out < 0.75, `${at}: MCP ${out.toFixed(2)} keys outside the index knuckle`);
        assert.ok(depth > 0 && depth < 0.45, `${at}: MCP ${depth.toFixed(2)} of the palm below the knuckles`);
        assert.ok(handLen(chord, mcp, tip) < HAND_BUILD.reach[2], `${at}: a thumb shorter than the index`);
        const angle = thumbAngle(chord);
        assert.ok(angle > 25 && angle < 50, `${at}: ${angle.toFixed(0)}° from the index`);
      }
      // Wider reaches: the C–A sixth is the little finger's reach (the frame
      // stays over the thumb, which keeps its place); the octave opens the
      // web (the MCP moves out). The visible thumb stays within G1, with its
      // knuckle.
      const outOf = (pose) => -pose.dir * pose.fingers[0].axis[1].x / u;
      assert.ok(Math.abs(outOf(sixth) - outOf(chord)) < 0.2, `${at}: the thumb keeps its place for a sixth`);
      assert.ok(outOf(octave) > outOf(sixth) + 0.5, `${at}: the MCP moves out as the thumb reaches an octave`);
      for (const pose of [chord, sixth, octave]) {
        const [cmc, mcp, tip] = pose.fingers[0].axis;
        const r = handLen(pose, mcp, tip) / HAND_BUILD.reach[1];
        assert.ok(r <= 1.1 && r >= 0.55, `${at}: visible thumb within G1 (${r.toFixed(2)})`);
        const a1 = Math.atan2(mcp.y - cmc.y, mcp.x - cmc.x),
          a2 = Math.atan2(tip.y - mcp.y, tip.x - mcp.x);
        const bend = (Math.abs(((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180) / Math.PI;
        assert.ok(bend >= 12, `${at}: the thumb bends ${bend.toFixed(0)}° at its MCP`);
      }
    }
});

test("a thumb passing under the hand stays hidden beneath the palm and fingers", () => {
  const inputs = scenarioInputs(fixture("scale"));
  for (const geometry of [LAB, ...APP_KEYS])
    // (Until 50 ms before it lands at 0.9 s: then its pad comes out from
    // under the hand onto F4, as it descends.)
    for (let s = 0.76; s <= 0.85 + 1e-9; s += 0.01) {
      const pose = posesAt(inputs, inputs.clock.toBeat(s), geometry).right;
      const thumb = pose.fingers[0];
      assert.ok(thumb.under > 0.9 && thumb.state !== "down", `passing under at ${s.toFixed(2)} s`);
      const shapes = paintedShapes(pose, "right");
      const [, mcp, tip] = thumb.axis;
      for (let i = 0; i <= 10; i++) {
        const q = { x: mcp.x + ((tip.x - mcp.x) * i) / 10, y: mcp.y + ((tip.y - mcp.y) * i) / 10 };
        assert.ok(
          insidePath(q, shapes.palm) || insidePath(q, shapes.thenar) || shapes.fingers.some((f) => insidePath(q, f)),
          `kw ${geometry.keyWidth} ${s.toFixed(2)} s: thumb point ${i}/10 shows`,
        );
      }
    }
});

test("a free thumb rests beside the index in C position, never tucked behind it (Twinkle, as the app plays it)", () => {
  // Twinkle, the first lesson: 1 1 4 4 5 5 4 | 4 4 3 3 2 2 1 in one
  // extended C position. While 2 plays D (and while 3 plays E), the thumb
  // waits over C: visible, outside the index, not under the hand.
  const twinkle = demos().find((s) => s.title.startsWith("Twinkle"));
  const inputs = scenarioInputs(twinkle);
  for (const geometry of [LAB, ...APP_KEYS]) {
    const u = geometry.keyWidth;
    for (const beat of [12, 12.5, 13, 13.5, 22, 22.5, 28, 30, 30.5]) {
      const pose = posesAt(inputs, beat, geometry).right;
      const [thumb, index] = pose.fingers;
      const at = `kw ${u} beat ${beat}`;
      assert.notEqual(thumb.state, "down", `${at}: the thumb is free`);
      assert.ok((thumb.under || 0) < 0.05, `${at}: thumb under ${thumb.under.toFixed(2)}`);
      const gap = (pose.dir * (index.axis.at(-1).x - thumb.axis.at(-1).x)) / u;
      assert.ok(gap > 0.6, `${at}: thumb pad ${gap.toFixed(2)} keys outside the index pad`);
    }
    // The thumb still lands exactly on C, and nothing jumps on the way
    // (120 fps through bars 3–4 and 7–8: the pad moves < 0.12 key per frame).
    const c = posesAt(inputs, 14, geometry).right.fingers[0];
    assert.equal(c.state, "down");
    let last = null;
    for (const [from, to] of [[8, 16], [24, 32]])
      for (let t = inputs.clock.toSeconds(from); t <= inputs.clock.toSeconds(to); t += 1 / 120) {
        const pose = posesAt(inputs, inputs.clock.toBeat(t), geometry).right;
        const tip = pose.fingers[0].axis.at(-1);
        const x = pose.x + tip.x;
        if (last && last.t > t - 0.02) assert.ok(Math.hypot(x - last.x, tip.y - last.y) < 0.12 * u, `kw ${u} ${t.toFixed(3)} s: thumb jumps`);
        last = { t, x, y: tip.y };
      }
  }
  // A thumb on its way under the hand is still left to pass under it (the
  // scale's thumb-under: covered by "a thumb passing under the hand ...").
});

// Proportions review 2 (P1): the little finger plays on its curved tip near
// the front of a white key — about a key of it shows, the shortest of the
// playing fingers — never a straight finger stretched up the key as far as
// the middle finger. In the beginner pieces, on the lab's keys and on the
// app's two keyboards.
test("the little finger plays on its curved tip near the front of a white key, the shortest playing finger", () => {
  const twinkle = scenarioInputs(demos().find((s) => s.title.startsWith("Twinkle")));
  // "Start here": C D E F G A B C | C B A G F E D C, 1 2 3 1 2 3 4 5 | 5 4 3 2 1 3 2 1.
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const melody = [...scale, ...scale.slice().reverse()].map((m, i) => note(`s${i}`, m, i, 1));
  const startFingers = [1, 2, 3, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 3, 2, 1];
  const start = handTimeline(melody, new Map(melody.map((n, i) => [n.id, startFingers[i]])), "right");
  let checked = 0;
  for (const geometry of [LAB, ...APP_KEYS]) {
    const poses = [];
    for (let t = twinkle.clock.toSeconds(twinkle.firstBeat); t <= twinkle.clock.toSeconds(twinkle.endBeat); t += 1 / 30)
      poses.push(["Twinkle", t, posesAt(twinkle, twinkle.clock.toBeat(t), geometry).right]);
    for (let beat = 0; beat < 16; beat += 1 / 15) poses.push(["Start here", beat, handPose(start, beat, "right", geometry)]);
    poses.push(["C-E-G right", 1, handPose(stillChord([60, 64, 67], [1, 3, 5], "right"), 1, "right", geometry)]);
    poses.push(["C-E-G left", 1, handPose(stillChord([48, 52, 55], [5, 3, 1], "left"), 1, "left", geometry)]);
    for (const [label, at, pose] of poses) {
      const little = pose?.fingers[4];
      if (!little || little.state !== "down") continue;
      checked++;
      const where = `kw ${geometry.keyWidth} ${label} @${at.toFixed(2)}`;
      const len = (f) => handLen(pose, f.axis[0], f.axis.at(-1));
      const l5 = len(little);
      assert.ok(l5 >= 0.9 && l5 <= 1.15, `${where}: the playing little finger shows ${l5.toFixed(2)} keys`);
      for (const f of pose.fingers.slice(1, 4))
        if (f.state === "down") assert.ok(len(f) >= l5 - 1e-9, `${where}: finger ${f.finger} (${len(f).toFixed(2)}) shorter than the little finger (${l5.toFixed(2)})`);
      // Near the front of its white key: nearer the player than a long finger plays.
      assert.ok(little.axis.at(-1).y > pose.keysHeight * 0.68 + 0.3 * pose.verticalUnit, `${where}: the little finger plays near the key's front`);
    }
  }
  assert.ok(checked > 300, `many playing little fingers checked (${checked})`);
});

// P2: a third or a chord over black keys is not a stretch for the thumb: with
// the hand in toward the fallboard (the long fingers playing their white keys
// further in, the thumb bent on its black key), the visible thumb is no
// longer than the index playing beside it, about a key at most.
test("a thumb on a black key in a third or a chord is no longer than the index playing beside it", () => {
  const sets = [
    // Right hand thirds and fourths with 1–2 (thumb on black, index on white, both black, …), one per two beats.
    { hand: "right", chords: [[[66, 1], [69, 2]], [[64, 1], [66, 2]], [[66, 1], [68, 2]], [[61, 1], [64, 2]], [[61, 1], [63, 2]]] },
    // The Gymnopédie left hand: 4 2 1 on B3 D4 F#4 and A3 C#4 F#4.
    { hand: "left", chords: [[[59, 4], [62, 2], [66, 1]], [[57, 4], [61, 2], [66, 1]], [[59, 4], [62, 2], [66, 1]]] },
  ];
  let both = 0;
  for (const { hand, chords } of sets) {
    const notes = [];
    const fingering = new Map();
    chords.forEach((chord, k) =>
      chord.forEach(([midi, finger], j) => {
        const id = `${k}-${j}`;
        notes.push(note(id, midi, 2 * k, 1.5, hand));
        fingering.set(id, finger);
      }),
    );
    const steps = handTimeline(notes, fingering, hand);
    for (const geometry of [LAB, ...APP_KEYS])
      for (let beat = 0; beat < 2 * chords.length; beat += 0.05) {
        const pose = handPose(steps, beat, hand, geometry);
        const [thumb, index] = pose.fingers;
        if (thumb.state !== "down" || index.state !== "down") continue;
        both++;
        const lt = handLen(pose, thumb.axis[1], thumb.axis[2]),
          li = handLen(pose, index.axis[0], index.axis.at(-1));
        const at = `${hand} kw ${geometry.keyWidth} beat ${beat.toFixed(2)}`;
        assert.ok(lt <= li + 0.02, `${at}: thumb ${lt.toFixed(2)} longer than the index ${li.toFixed(2)}`);
        assert.ok(lt <= 1.2, `${at}: thumb ${lt.toFixed(2)} keys`);
        assert.ok(li >= 0.9, `${at}: the index folded up to ${li.toFixed(2)} keys`);
      }
  }
  assert.ok(both > 500, `thumb and index down together (${both} poses)`);
});

// P3: a little finger spread to an octave leaves the palm as a finger of its
// own: the palm's outer corner turns in under its root and the cleft beside
// the ring finger deepens (no web up the little finger); pointing up the keys
// it keeps the palm's corner beside its root.
test("a little finger spread to an octave leaves the palm at its knuckle, with no web", () => {
  for (const geometry of [LAB, ...APP_KEYS])
    for (const hand of ["right", "left"]) {
      const flip = (m) => (hand === "right" ? m : 120 - m);
      const corner = (midis, fingers) => {
        const pose = handPose(stillChord(midis.map(flip), fingers, hand), 1, hand, geometry);
        const little = pose.knuckles[3],
          c = pose.back[8];
        return { out: (pose.dir * (c.x - little.x)) / pose.span, down: (c.y - little.y) / (0.84 * pose.verticalUnit) };
      };
      const at = `${hand} kw ${geometry.keyWidth}`;
      const octave = corner([60, 72], [1, 5]),
        chord = corner([60, 64, 67], [1, 3, 5]);
      assert.ok(octave.out < 0.3 && octave.down > 0.4, `${at}: the palm's corner under a spread little finger (${octave.out.toFixed(2)}, ${octave.down.toFixed(2)})`);
      assert.ok(chord.out > 0.45 && chord.down < 0.25, `${at}: the palm's corner beside a little finger pointing up the keys`);
    }
});

// P4: a thumb beneath the palm is hidden by it; nothing of it is painted on
// the back of the hand (a dark stripe there reads as a bruise).
test("a thumb under the palm leaves no shadow on the back of the hand", () => {
  const saved = globalThis.Path2D;
  globalThis.Path2D = MockPath;
  try {
    const inputs = scenarioInputs(fixture("scale"));
    let hidden = 0;
    for (let s = 0.7; s <= 0.85; s += 0.01) {
      const pose = posesAt(inputs, inputs.clock.toBeat(s), LAB).right;
      if (!(pose.fingers[0].under > 0.5)) continue;
      hidden++;
      const log = recordPainting(pose, "right");
      assert.ok(!/rgba\(196, 128, 100/.test(log), `${s.toFixed(2)} s: a stripe of the thumb painted over the palm`);
    }
    assert.ok(hidden > 5, "the thumb passes under the hand");
  } finally {
    globalThis.Path2D = saved;
  }
});

// P6: a lean toward the next position waits for a finger that still holds a
// key of the old one and hops on: the palm stays over both held keys until
// that finger lets go, so the free fingers never pile up against it (S12's
// left hand before the bar-33 leap: 5 holds G2 and 1 holds D3, then 5 leaps
// to C2 while 1 still holds D3).
test("a lean waits for a finger still holding a key of the old position before it moves", () => {
  // 1 s per beat as in S12 (the default clock is 0.5 s per beat: beats × 2).
  const notes = [note("g2", 43, -4, 4, "left"), note("d3", 50, -3.5, 3.5, "left"), note("c2", 36, 0, 4, "left"), note("c3", 48, 0.5, 3.5, "left")];
  const steps = handTimeline(notes, new Map([["g2", 5], ["d3", 1], ["c2", 5], ["c3", 1]]), "left");
  const plan = handPlan(steps, "left");
  const g2 = plan.engagements.find((e) => e.midi === 43);
  close(g2.release, 0, "the little finger holds G2 to its written end");
  const geometry = APP_KEYS[0];
  const still = handPose(steps, -1.0 / 0.5, "left", geometry).x;
  for (let s = -1.0; s < -1e-9; s += 0.01) {
    const pose = handPose(steps, s / 0.5, "left", geometry);
    const at = `${s.toFixed(2)} s`;
    if (s < g2.release - 1e-6) assert.ok(Math.abs(pose.x - still) < 0.02 * pose.unit, `${at}: the palm leaves while the little finger still holds G2`);
    // The free fingers keep their lengths and their order (no pile of pads).
    const xs = [];
    for (const f of pose.fingers.slice(1, 4)) {
      const r = handLen(pose, f.axis[0], f.axis.at(-1)) / HAND_BUILD.reach[f.finger];
      assert.ok(r <= 1.1, `${at}: free finger ${f.finger} stretched to ${r.toFixed(2)}× its reach`);
      xs.push(pose.dir * f.axis.at(-1).x);
    }
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 0.3 * pose.unit, `${at}: fingers ${i + 1} and ${i + 2} pile up`);
  }
  assert.equal(handPose(steps, -0.1 / 0.5, "left", geometry).fingers[0].state, "down", "the thumb holds D3 to its written end");
});
