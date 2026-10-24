import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE,
  P,
  PHYSICS,
  addBond,
  bondLevel,
  box,
  bubbleSize,
  bubbleTtl,
  chooseRail,
  classifyClicks,
  createSpeech,
  drowsiness,
  edgeSlot,
  figureRect,
  flushQueue,
  gapBand,
  gapFree,
  gapTargetX,
  inside,
  modalSpot,
  nextBlink,
  nextPoke,
  petTrack,
  placeBubble,
  rectsIntersect,
  releaseVelocity,
  seatAt,
  seatScale,
  speechGate,
  springStep,
  stepPhysics,
  takeNews,
  textUnits,
  todayKey,
  POKES,
} from "../src/buddy-brain.mjs";
import { beatBob, buildCues, cueBetween, endingFor, streakStep } from "../src/buddy-cues.mjs";
import { LINES, companionLine } from "../src/buddy-lines.mjs";

test("rect helpers: intersection, viewport containment and day keys", () => {
  const a = box(0, 0, 10, 10);
  assert.ok(rectsIntersect(a, box(5, 5, 10, 10)));
  assert.ok(!rectsIntersect(a, box(10, 0, 10, 10)), "touching edges do not overlap");
  assert.ok(!rectsIntersect(a, box(9, 9, 10, 10), 2), "slack ignores a sliver");
  assert.ok(!rectsIntersect(a, null));
  assert.ok(inside(box(8, 8, 50, 50), 100, 100, 8));
  assert.ok(!inside(box(7, 8, 50, 50), 100, 100, 8));
  assert.equal(todayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("the figure rect scales about the bottom centre of the 78 px box", () => {
  const r = figureRect(100, 200, 0.5);
  assert.equal(r.width, SIZE / 2);
  assert.equal(r.bottom, 200 + SIZE);
  assert.equal((r.left + r.right) / 2, 100 + SIZE / 2);
  const s = seatAt(500, 160);
  assert.deepEqual(s, { x: 500 - SIZE / 2, y: 160 - SIZE });
  assert.equal(seatScale("cue", 29), 0.45);
  assert.equal(seatScale("cue", 78), 0.6);
  assert.equal(seatScale("header", 200), 1.6);
  assert.equal(seatScale("gap"), 0.82);
});

test("rail choice: dialogs first, then the practice seats, then the header seat or the edge", () => {
  assert.equal(chooseRail({ modal: "results", view: "practice", gapOk: true }), "results");
  assert.equal(chooseRail({ modal: "settings", view: "library" }), "modal");
  assert.equal(chooseRail({ view: "practice", gapOk: true, cueSeat: true }), "gap");
  assert.equal(chooseRail({ view: "practice", playing: true, gapOk: true, cueSeat: true }), "cue");
  assert.equal(chooseRail({ view: "practice", playing: true, gapOk: true }), "gap");
  assert.equal(chooseRail({ view: "practice", gapOk: false, cueSeat: true }), "cue");
  assert.equal(chooseRail({ view: "practice" }), "corner", "focus mode with no seats: tucked away");
  assert.equal(chooseRail({ view: "practice", bow: true, gapOk: true, playing: false }), "bow");
  assert.equal(chooseRail({ view: "practice", tucked: true, gapOk: true, cueSeat: true }), "cue");
  assert.equal(chooseRail({ view: "library", headerSeat: true }), "header");
  assert.equal(chooseRail({ view: "progress", headerSeat: false }), "edge");
});

test("the header gap band runs from the title text to the view switch", () => {
  // Measured at 1440: title ends ~351, view switch starts 1042.
  const band = gapBand({ infoRight: 351, actionsLeft: 1042, headerTop: 68, headerBottom: 137 });
  assert.equal(band.left, 375);
  assert.equal(band.right, 1018);
  assert.ok(band.ok);
  assert.equal(band.feet, 135);
  assert.equal(band.scale, 0.82);
  const narrow = gapBand({ infoRight: 500, actionsLeft: 600, headerTop: 68, headerBottom: 137 });
  assert.ok(!narrow.ok, "under 112 px the companion uses the cue seat instead");
  // A short header shrinks the companion so it never pokes into the app bar.
  assert.ok(gapBand({ infoRight: 0, actionsLeft: 900, headerTop: 68, headerBottom: 110 }).scale < 0.82);
  // Resting place and pointer following.
  assert.equal(gapTargetX(band, null, 137), band.right - 104);
  assert.equal(gapTargetX(band, { x: 600, y: 100 }, 137), 600);
  assert.equal(gapTargetX(band, { x: 600, y: 400 }, 137), band.right - 104, "far below the header it rests");
  const half = (SIZE * 0.82) / 2;
  assert.equal(gapTargetX(band, { x: 0, y: 90 }, 137), band.left + half, "clamped inside the band");
});

test("the edge rail steps around no-go rects and peeks when nothing is free", () => {
  const vw = 1440,
    vh = 900;
  const free = edgeSlot({ wantY: 300, vw, vh, noGo: [] });
  assert.deepEqual(free, { x: vw - SIZE - 14, y: 300, peek: false });
  const blocker = box(1300, 280, 140, 120);
  const moved = edgeSlot({ wantY: 300, vw, vh, noGo: [blocker] });
  assert.ok(!moved.peek);
  assert.ok(!rectsIntersect(box(moved.x, moved.y, SIZE, SIZE), blocker));
  assert.ok(Math.abs(moved.y - 300) <= 22 * 6);
  const left = edgeSlot({ side: "left", wantY: 300, vw, vh, noGo: [] });
  assert.equal(left.x, 14);
  const wall = edgeSlot({ wantY: 300, vw, vh, noGo: [box(0, 0, vw, vh)] });
  assert.ok(wall.peek);
  assert.ok(wall.hide, "nothing free, not even a peek: out of sight");
  // A column of controls reaching to 30 px from the edge: the peek shows
  // only what fits beside them, never over them.
  // (A peek leans 14° inward: its head reaches 17 px past its box.)
  const column = edgeSlot({ wantY: 300, vw, vh, noGo: [box(0, 0, vw - 50, vh)] });
  assert.ok(column.peek && !column.hide);
  assert.equal(column.x, vw - 31);
  assert.ok(!rectsIntersect(box(column.x - 17, column.y, SIZE, SIZE), box(0, 0, vw - 50, vh)));
  assert.ok(edgeSlot({ wantY: 300, vw, vh, noGo: [box(0, 0, vw - 30, vh)] }).hide, "under 20 px to show: hidden");
  const open = edgeSlot({ wantY: 300, vw, vh, noGo: [box(0, 0, vw - 80, vh)] });
  assert.equal(open.x, vw - SIZE * 0.58, "never more than 42 % of the figure past the edge... the usual peek");
});

test("the edge rail judges every control, at 1024 a busy column hides it", () => {
  // Exercises at 1024 scrolled: the Length "16" button and the Key select
  // reach x 975; the old edge slot sat on both.
  const vw = 1024,
    vh = 700;
  const controls = [box(880, 60, 95, 34), box(735, 120, 240, 40), box(735, 170, 240, 40), box(733, 240, 242, 46), box(733, 300, 242, 40), box(733, 360, 242, 40), box(733, 420, 242, 40), box(733, 480, 242, 40), box(733, 540, 242, 40)];
  const slot = edgeSlot({ wantY: 98, vw, vh, noGo: controls });
  const fig = box(slot.x, slot.y, SIZE, SIZE);
  for (const c of controls) assert.ok(!rectsIntersect(fig, c), JSON.stringify(slot));
});

test("the gap band steps around a notice in the header", () => {
  const band = gapBand({ infoRight: 351, actionsLeft: 1042, headerTop: 68, headerBottom: 137 });
  const toast = box(346, 68, 335, 50);
  const free = gapFree(band, [toast]);
  assert.equal(free.length, 1, "only the stretch right of the notice is wide enough");
  const x = gapTargetX(band, { x: 520, y: 90 }, 137, band.scale, [toast]);
  const half = (SIZE * band.scale) / 2;
  assert.ok(x - half >= toast.right + 8, `stands clear of the notice (${x})`);
  // A notice that fills the band: no spot (the rail moves to the cue seat).
  assert.equal(gapTargetX(band, null, 137, band.scale, [box(300, 60, 800, 60)]), null);
  // Below the band it does not matter.
  assert.equal(gapTargetX(band, null, 137, band.scale, [box(300, 400, 800, 60)]), band.right - 104);
});

test("beside a dialog: outside the left edge, else on the top edge, else out of sight", () => {
  const vw = 1440,
    vh = 900;
  assert.equal(modalSpot(box(300, 100, 800, 600), vw, vh).bubble, "left");
  assert.equal(modalSpot(box(300, 100, 800, 600), vw, vh).x, 214);
  const top = modalSpot(box(40, 200, 1300, 600), vw, vh);
  assert.equal(top.y, 200 - SIZE);
  assert.equal(top.bubble, "up");
  assert.equal(modalSpot(box(300, 100, 800, 600), vw, vh, true).bubble, "up", "the report card prefers its top edge");
  const full = modalSpot(box(82, 35, 860, 630), 1024, 700);
  assert.ok(full.hide, "a dialog that fills the window hides the companion");
  for (const r of [box(300, 100, 800, 600), box(40, 200, 1300, 600)]) {
    const spot = modalSpot(r, vw, vh);
    assert.ok(!rectsIntersect(box(spot.x, spot.y, SIZE, SIZE), r), "never on the dialog");
  }
});

test("beside a dialog it never stays on the music behind the backdrop", () => {
  // Import at 1440 (measured): dialog 415..1025 × 127..773 over the Numbers
  // score (131..320), runway and keys. Outside-left was on the score.
  const vw = 1440,
    vh = 900;
  const dialog = box(415, 127, 610, 646);
  const music = [box(18, 131, 1404, 190), box(18, 330, 1404, 470), box(18, 810, 1404, 90)];
  const spot = modalSpot(dialog, vw, vh, false, [dialog, ...music]);
  const fig = figureRect(spot.x, spot.y, spot.s ?? 1);
  assert.ok(!spot.hide);
  assert.equal(spot.bubble, "up", "perched on the dialog's top edge");
  for (const m of [dialog, ...music]) assert.ok(!rectsIntersect(fig, m, 2), JSON.stringify(spot));
  // Accompaniment at 1440: dialog top 45; beside it, lifted clear of the score.
  const backing = box(370, 45, 700, 800);
  const lifted = modalSpot(backing, vw, vh, false, [backing, ...music]);
  const lf = figureRect(lifted.x, lifted.y, lifted.s ?? 1);
  assert.ok(!lifted.hide);
  for (const m of music) assert.ok(!rectsIntersect(lf, m, 2), JSON.stringify(lifted));
  assert.ok(lf.bottom <= 131, "feet above the score");
  // Music everywhere around a full-height dialog: out of sight.
  const full = modalSpot(box(207, 20, 610, 660), 1024, 700, false, [box(0, 20, 1024, 680)]);
  assert.ok(full.hide);
  // Without music around, PET-2's order holds.
  assert.equal(modalSpot(box(300, 100, 800, 600), vw, vh, false, []).x, 214);
});

test("bubble placement tries the preferred side, the other side, above and below, else null", () => {
  const vw = 1440,
    vh = 900;
  const fig = figureRect(800, 60, 0.82);
  const right = placeBubble(fig, 20, [], vw, vh, { prefer: "right" });
  assert.equal(right.side, "right");
  assert.ok(right.rect.left >= fig.right);
  const blockedRight = placeBubble(fig, 20, [box(fig.right, 0, 400, 400)], vw, vh, { prefer: "right" });
  assert.equal(blockedRight.side, "left");
  const nothing = placeBubble(fig, 20, [box(0, 0, vw, vh)], vw, vh);
  assert.equal(nothing, null);
  // Never outside the window: at the right edge it flips left.
  const edge = placeBubble(figureRect(vw - 92, 400), 30, [], vw, vh, { prefer: "right" });
  assert.equal(edge.side, "left");
  assert.ok(inside(edge.rect, vw, vh, 8));
  // A long line wraps within the max width; CJK counts wider.
  assert.ok(bubbleSize(120).h > bubbleSize(20).h);
  assert.equal(bubbleSize(200).w, 230);
  assert.ok(textUnits("早上好") > 3);
  assert.equal(bubbleTtl("hi"), 1800);
  assert.equal(bubbleTtl("x".repeat(60)), 3300);
  assert.equal(bubbleTtl("x".repeat(200)), 4500);
});

test("speech gate: user lines always, nothing while playing, budgets for the rest", () => {
  let s = createSpeech();
  const ask = (priority, text, now, extra = {}) => {
    const r = speechGate(s, { priority, text, now, ...extra });
    s = r.state;
    return r.verdict;
  };
  assert.equal(ask(P.USER, "hi", 0), "say");
  assert.equal(ask(P.USER, "hi", 1, { quiet: true }), "face");
  assert.equal(ask(P.MUSIC, "♪", 2), "drop", "musical reactions never speak");
  assert.equal(ask(P.AMBIENT, "Library time!", 1000), "say");
  assert.equal(ask(P.AMBIENT, "Warm-up?", 60000), "news", "ambient lines are 3 min apart");
  assert.equal(ask(P.AMBIENT, "Library time!", 200000), "drop", "never the same ambient line twice in 10 min");
  assert.equal(ask(P.AMBIENT, "Warm-up?", 200000), "say");
  assert.equal(ask(P.ACHIEVE, "Goal!", 201000), "say");
  assert.equal(ask(P.ACHIEVE, "Streak!", 203000), "news", "achievements are 8 s apart");
  // While playing: achievements queue, everything else is dropped.
  assert.equal(ask(P.ACHIEVE, "50 in a row!", 300000, { playing: true }), "queue");
  assert.equal(ask(P.AMBIENT, "Nice.", 300000, { playing: true }), "drop");
  const fresh = flushQueue(s, 310000);
  assert.equal(fresh.text, "50 in a row!");
  assert.equal(fresh.state.queue, null);
  const stale = flushQueue({ ...s, queue: { text: "old", at: 0 } }, 30000);
  assert.equal(stale.text, null, "a queued line older than 20 s is dropped");
  // The held-back news is said by the next poke, once.
  const news = takeNews({ ...s, news: { text: "Warm-up?", at: 1000 } }, 2000);
  assert.equal(news.text, "Warm-up?");
  assert.equal(news.state.news, null);
  // Global cap: 6 bubbles per 5 minutes.
  let c = createSpeech();
  let said = 0;
  for (let i = 0; i < 10; i++) {
    const r = speechGate(c, { priority: P.ACHIEVE, text: `a${i}`, now: i * 9000 });
    c = r.state;
    if (r.verdict === "say") said++;
  }
  assert.equal(said, 6);
});

test("click sequences: 1 pokes, 2 quick open chat, a late 3rd cancels it, 4 or 6 tickle", () => {
  assert.equal(classifyClicks([0]), "poke");
  assert.equal(classifyClicks([0, 200], 200), "pending");
  assert.equal(classifyClicks([0, 200], 480), "chat");
  assert.equal(classifyClicks([0, 400], 700), "poke", "two slow clicks are two pokes");
  assert.equal(classifyClicks([0, 200, 400], 680), "poke", "a third click cancels the chat");
  assert.equal(classifyClicks([0, 150, 300, 450]), "tickle");
  assert.equal(classifyClicks([0, 150, 300, 450, 600, 750]), "tickle");
  assert.equal(classifyClicks([0, 700, 1400, 2100]), "poke", "four clicks over 2.1 s are not a tickle");
  assert.equal(classifyClicks([]), "none");
});

test("petting needs three direction flips of 3 px or more within 1.2 s", () => {
  let s = null;
  const strokes = [100, 110, 100, 110, 100];
  strokes.forEach((x, i) => (s = petTrack(s, x, i * 150)));
  assert.ok(s.petting);
  let jitter = null;
  [100, 101, 100, 101, 100, 101].forEach((x, i) => (jitter = petTrack(jitter, x, i * 100)));
  assert.ok(!jitter.petting, "tiny tremors are not strokes");
  let slow = null;
  [100, 110, 100, 110, 100].forEach((x, i) => (slow = petTrack(slow, x, i * 700)));
  assert.ok(!slow.petting, "flips spread over more than 1.2 s are not petting");
});

test("pokes rotate and never repeat back-to-back", () => {
  let prev = "";
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const next = nextPoke(prev);
    assert.notEqual(next, prev);
    assert.ok(POKES.includes(next));
    seen.add(next);
    prev = next;
  }
  assert.equal(seen.size, POKES.length);
  assert.equal(nextPoke("hop", () => 0.999), POKES.filter((p) => p !== "hop").at(-1));
});

test("toss physics: gravity, bouncing walls, restitution, drag, clamped spin and settling", () => {
  const bounds = { left: 0, right: 1362, top: 0, floor: 750 };
  // Straight drop bounces with less height each time and settles.
  let b = { x: 600, y: 100, vx: 0, vy: 0, angle: 0 };
  let bounces = 0,
    landed = false,
    t = 0;
  while (!landed && t < 10) {
    b = stepPhysics(b, 1 / 120, bounds);
    if (b.bounced) bounces++;
    landed = b.landed;
    t += 1 / 120;
  }
  assert.ok(landed, "it comes to rest");
  assert.ok(bounces >= 1);
  assert.equal(b.y, bounds.floor);
  assert.ok(t < 4, `settles quickly (${t.toFixed(2)} s)`);
  // A sideways throw hits the wall and comes back slower.
  const hit = stepPhysics({ x: 1360, y: 300, vx: 3000, vy: 0, angle: 0 }, 1 / 60, bounds);
  assert.equal(hit.x, bounds.right);
  assert.ok(hit.vx < 0 && Math.abs(hit.vx) < 3000 * PHYSICS.restitution + 1);
  assert.ok(hit.bounced);
  // Spin is vx × 0.08°/px, clamped to ±720°/s.
  const spun = stepPhysics({ x: 600, y: 100, vx: 50000, vy: 0, angle: 0 }, 0.1, { ...bounds, right: 1e9 });
  assert.ok(Math.abs(spun.angle) <= 72 + 1e-9);
  // Drag slows flight.
  const slower = stepPhysics({ x: 600, y: 100, vx: 1000, vy: 0, angle: 0 }, 0.5, { ...bounds, right: 1e9 });
  assert.ok(slower.vx < 1000);
});

test("the held spring converges without overshooting wildly, at any frame rate", () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    let p = 0,
      v = 0,
      max = 0;
    for (let t = 0; t < 1.5; t += dt) {
      [p, v] = springStep(p, v, 100, dt);
      max = Math.max(max, p);
    }
    assert.ok(Math.abs(p - 100) < 1, `dt ${dt}: ${p}`);
    assert.ok(max < 115, `overshoot ${max}`);
  }
  const v = releaseVelocity(
    [
      { x: 0, y: 0, t: 0 },
      { x: 50, y: 0, t: 50 },
      { x: 100, y: 10, t: 100 },
    ],
    110,
  );
  assert.equal(Math.round(v.vx), 1000);
  assert.equal(releaseVelocity([{ x: 0, y: 0, t: 0 }], 10).speed, 0);
});

test("faces: drowsiness and blink timing", () => {
  assert.equal(drowsiness(10000), "awake");
  assert.equal(drowsiness(46000), "sleepy");
  assert.equal(drowsiness(76000), "asleep");
  const gaps = [];
  for (let i = 0; i < 500; i++) gaps.push(nextBlink().in);
  assert.ok(Math.min(...gaps) >= 2600 && Math.max(...gaps) <= 6000);
  const r = nextBlink(() => 0.5, true);
  assert.ok(r.in >= 8000 && r.in <= 12000 && !r.double);
  // 60 s of idle at 2.6–6 s apart (with ~15 % doubles) is 10–23 blinks.
  assert.ok(60000 / 6000 >= 10 && (60000 / 2600) * 1.0 <= 23.1);
});

test("bond: hearts by XP, never decreasing, five long pets a day", () => {
  assert.equal(bondLevel(0), 0);
  assert.equal(bondLevel(19), 0);
  assert.equal(bondLevel(20), 1);
  assert.equal(bondLevel(599), 4);
  assert.equal(bondLevel(10000), 5);
  let bond = {};
  for (let i = 0; i < 8; i++) bond = addBond(bond, "cat", 1, "2026-09-30", { pet: true });
  assert.equal(bond.cat.xp, 5);
  assert.equal(bond.cat.pets, 5);
  bond = addBond(bond, "cat", 1, "2026-10-01", { pet: true });
  assert.equal(bond.cat.xp, 6, "a new day allows new pets");
  bond = addBond(bond, "cat", -50, "2026-10-01");
  assert.equal(bond.cat.xp, 6, "bond never decreases");
  bond = addBond(bond, "liszt", 10, "2026-10-01");
  assert.equal(bond.liszt.xp, 10);
  assert.equal(bond.cat.xp, 6);
});

test("musical cues from a fixture score: phrase ends, loud downbeats and leaps", () => {
  const notes = [];
  // 8 bars of 4/4; bar 3 starts forte; a 12-semitone leap in bar 5.
  for (let bar = 1; bar <= 8; bar++)
    for (let beat = 0; beat < 4; beat++)
      notes.push({ id: `${bar}-${beat}`, midi: 60 + beat, beat: (bar - 1) * 4 + beat, duration: 1, hand: "right", measure: bar, velocity: bar === 3 && beat === 0 ? 0.9 : 0.6 });
  notes.push({ id: "leap", midi: 75, beat: 16.5, duration: 0.5, hand: "right", measure: 5, velocity: 0.6 });
  notes.push({ id: "bass", midi: 36, beat: 16, duration: 4, hand: "left", measure: 5, velocity: 0.95 });
  const score = { notes, measures: 8, meter: 4, duration: 32 };
  const cues = buildCues(score, null);
  assert.deepEqual(cues.phraseEnds.map((p) => p.beat), [15.75, 31.75]);
  assert.equal(cues.phraseEnds.at(-1).strength, 1);
  assert.deepEqual(cues.loud.map((c) => c.bar), [3, 5], "the left hand's forte downbeat counts too");
  assert.ok(cues.leaps.some((l) => l.beat === 16 && l.size >= 10), JSON.stringify(cues.leaps));
  const planned = buildCues(score, { phrases: [{ first: 1, last: 2, strength: 0.5 }, { first: 3, last: 8, strength: 1 }] });
  assert.deepEqual(planned.phraseEnds.map((p) => p.beat), [7.75, 31.75]);
  assert.equal(cueBetween(cues.phraseEnds, 15, 16).beat, 15.75);
  assert.equal(cueBetween(cues.phraseEnds, 15.75, 16), null, "the start of the window is exclusive");
  assert.equal(cueBetween([], 0, 10), null);
  assert.deepEqual(buildCues(null), { phraseEnds: [], loud: [], leaps: [] });
});

test("the beat bob peaks halfway through each beat; streaks and endings", () => {
  assert.equal(beatBob(4), 0);
  assert.ok(Math.abs(beatBob(4.5) - 1) < 1e-9);
  assert.ok(beatBob(4.25) < beatBob(4.5));
  let run = 0,
    milestones = [];
  for (let i = 0; i < 30; i++) {
    const s = streakStep(run, i === 12 ? "miss" : i % 3 ? "hit" : "late");
    run = s.run;
    if (s.milestone) milestones.push(s.milestone);
  }
  assert.deepEqual(milestones, [10, 10], "a miss resets the run, which can reach 10 again");
  assert.equal(endingFor({ accuracy: 0.97, complete: true }).tier, "ovation");
  assert.equal(endingFor({ accuracy: 0.97, complete: false }).tier, "keepgoing");
  assert.equal(endingFor({ accuracy: 0.9, complete: true }).tier, "great");
  assert.equal(endingFor({ accuracy: 0.7, complete: true }).tier, "good");
  assert.equal(endingFor({ accuracy: 0.5, complete: true }).tier, "keepgoing");
  assert.equal(endingFor({ accuracy: 0.9, complete: true, best: true }).line, "finish:best");
  assert.equal(endingFor({ accuracy: 0.5, complete: true, best: true }).line, "finish:keepgoing");
});

test("six voices: every line is short, filled and never repeats back-to-back", () => {
  const ctx = { name: "Luma", title: "龙卷风", bar: 17, minutes: 12, n: 25, acc: 92, a: 3, b: 6 };
  for (const [companion, events] of Object.entries(LINES))
    for (const event of Object.keys(events)) {
      const a = companionLine(companion, event, ctx),
        b = companionLine(companion, event, ctx);
      for (const line of [a, b]) {
        assert.ok(line.length > 0 && line.length <= 70, `${companion} ${event}: ${line}`);
        assert.ok(!/\{\w+\}/.test(line), `${companion} ${event} left a placeholder`);
      }
      assert.notEqual(a, b, `${companion} ${event} repeated itself`);
    }
  // Unknown events fall back to the shared table.
  for (const event of ["finish:keepgoing", "finish:best", "miss:run", "welcome"]) {
    const line = companionLine("beethoven", event, ctx);
    assert.ok(line.length > 0 && line.length <= 70 && !/\{\w+\}/.test(line), `${event}: ${line}`);
  }
  // The poke lines no longer teach the chat by accident.
  for (const companion of Object.keys(LINES))
    for (let i = 0; i < 6; i++) assert.ok(!/double-click/i.test(companionLine(companion, "poke", ctx)));
});

test("the poke bag plays all five reactions before repeating, never twice in a row", async () => {
  const { pokeFromBag } = await import("../src/buddy-brain.mjs");
  let bag = [],
    prev = "";
  const all = [];
  for (let i = 0; i < 50; i++) {
    const d = pokeFromBag(bag, prev);
    assert.notEqual(d.kind, prev);
    all.push(d.kind);
    bag = d.bag;
    prev = d.kind;
  }
  for (let i = 0; i < 50; i += 5) assert.equal(new Set(all.slice(i, i + 5)).size, 5, all.slice(i, i + 5).join());
});

test("treats: the goal once a day, each streak milestone once, two great runs a day, a jar of 12", async () => {
  const { earnTreats, feedTreat, TREAT_MAX } = await import("../src/buddy-brain.mjs");
  const day1 = "2026-10-01",
    day2 = "2026-10-02";
  let r = earnTreats(undefined, day1, { goal: true });
  assert.deepEqual(r.reasons, ["goal"]);
  assert.equal(r.treats.jar, 1);
  assert.equal(r.treats.goalDay, day1);
  r = earnTreats(r.treats, day1, { goal: true });
  assert.equal(r.earned, 0, "the goal pays once a day");
  r = earnTreats(r.treats, day2, { goal: true });
  assert.equal(r.earned, 1, "and again the next day");
  // Streak milestones: each once, ever; a long streak catches up.
  r = earnTreats(r.treats, day2, { streak: 7 });
  assert.deepEqual(r.reasons, ["streak:3", "streak:7"]);
  r = earnTreats(r.treats, day2, { streak: 8 });
  assert.equal(r.earned, 0);
  assert.deepEqual(r.treats.milestones, [3, 7]);
  // Runs: complete and ≥ 90 %, two a day.
  const great = { run: { accuracy: 0.93, complete: true } };
  assert.equal(earnTreats(r.treats, day2, { run: { accuracy: 0.89, complete: true } }).earned, 0);
  assert.equal(earnTreats(r.treats, day2, { run: { accuracy: 0.99, complete: false } }).earned, 0);
  r = earnTreats(r.treats, day2, great);
  r = earnTreats(r.treats, day2, great);
  assert.equal(r.treats.earnedToday, 2);
  assert.equal(earnTreats(r.treats, day2, great).earned, 0, "two great runs a day");
  const next = earnTreats(r.treats, "2026-10-03", great);
  assert.equal(next.earned, 1, "the run allowance resets at the day rollover");
  assert.equal(next.treats.earnedToday, 1);
  // The jar holds 12; what paid out is still recorded.
  const full = earnTreats({ jar: TREAT_MAX, day: day1, earnedToday: 0, milestones: [] }, day1, { goal: true, streak: 30 });
  assert.equal(full.earned, 0);
  assert.equal(full.treats.jar, 12);
  assert.deepEqual(full.treats.milestones, [3, 7, 14, 30]);
  // Feeding takes one treat; an empty jar feeds nothing.
  assert.equal(feedTreat({ jar: 2, day: day1 }).jar, 1);
  assert.equal(feedTreat({ jar: 0 }), null);
  assert.equal(feedTreat(null), null);
  // The input is never changed.
  const before = { jar: 1, day: day1, earnedToday: 0, milestones: [3] };
  earnTreats(before, day2, { streak: 7, goal: true });
  assert.deepEqual(before, { jar: 1, day: day1, earnedToday: 0, milestones: [3] });
});

test("bond gains report level-ups; practice minutes count only while they are real", async () => {
  const { gainBond, minuteXp } = await import("../src/buddy-brain.mjs");
  let g = gainBond({}, "bunny", 15, "2026-10-01");
  assert.deepEqual([g.from, g.to], [0, 0]);
  g = gainBond(g.bond, "bunny", 5, "2026-10-01");
  assert.deepEqual([g.from, g.to], [0, 1], "20 XP is the first heart");
  g = gainBond(g.bond, "bunny", 0, "2026-10-01");
  assert.equal(g.to, 1);
  // Six long pets in a day: the sixth adds nothing and returns the same map.
  let bond = {};
  for (let i = 0; i < 5; i++) bond = gainBond(bond, "cat", 1, "2026-10-01", { pet: true }).bond;
  const capped = gainBond(bond, "cat", 1, "2026-10-01", { pet: true });
  assert.equal(capped.bond, bond);
  assert.equal(minuteXp(10.4, 11.2), 1);
  assert.equal(minuteXp(10.4, 10.9), 0);
  assert.equal(minuteXp(0, 340), 0, "a settings load is not practice");
  assert.equal(minuteXp(12, 30, 120), 18, "a long run, credited at the stop");
  assert.equal(minuteXp(30, 12), 0);
  assert.equal(minuteXp(undefined, 3), 0);
});

test("welcomes: back today, then the late hour, a streak, the piece, the time of day", async () => {
  const { welcomeEvent } = await import("../src/buddy-brain.mjs");
  const today = "2026-10-01";
  const piece = { title: "Für Elise", bar: 17 };
  assert.equal(welcomeEvent({ hour: 9, today, lastSeen: today, streak: 5, piece }).event, "welcome:back");
  assert.equal(welcomeEvent({ hour: 23, today, lastSeen: "2026-09-30", streak: 5 }).event, "welcome:late");
  assert.equal(welcomeEvent({ hour: 3, today }).event, "welcome:late");
  const streak = welcomeEvent({ hour: 9, today, streak: 3, piece });
  assert.equal(streak.event, "welcome:streak");
  assert.equal(streak.ctx.n, 3);
  const at = welcomeEvent({ hour: 14, today, streak: 2, piece });
  assert.deepEqual(at, { event: "welcome:piece", ctx: { title: "Für Elise", bar: 17 } });
  assert.equal(welcomeEvent({ hour: 9, today, piece: { title: "Für Elise", bar: 1 } }).event, "welcome:morning", "bar 1 is not 'where we left it'");
  assert.equal(welcomeEvent({ hour: 5, today }).event, "welcome:morning");
  assert.equal(welcomeEvent({ hour: 11, today }).event, "welcome");
  assert.equal(welcomeEvent({ hour: 17, today }).event, "welcome:evening");
  assert.equal(welcomeEvent({ hour: 21, today }).event, "welcome:evening");
  assert.equal(welcomeEvent({ hour: 22, today }).event, "welcome:late");
  assert.equal(welcomeEvent().event, "welcome");
});

test("wrong notes: nothing in the first bars, a soft look when it's going badly, worried on a pair", async () => {
  const { missReaction } = await import("../src/buddy-brain.mjs");
  assert.equal(missReaction({ firstBars: true, recent: 4 }), "none");
  assert.equal(missReaction({ recent: 1, hits: 20, misses: 1 }), "wince");
  assert.equal(missReaction({ recent: 2, hits: 20, misses: 2 }), "worried");
  assert.equal(missReaction({ recent: 2, hits: 20, misses: 2, worriedReady: false }), "wince", "worried has a cooldown");
  assert.equal(missReaction({ recent: 4, hits: 3, misses: 6 }), "soft", "under 50 % after 8 notes: only a soft look");
  assert.equal(missReaction({ recent: 2, hits: 1, misses: 3 }), "worried", "too few notes to judge the run");
});

test("every companion has its own voice for each welcome, touch, finish and treat", () => {
  const events = [
    "welcome:morning", "welcome:evening", "welcome:late", "welcome:back", "welcome:streak", "welcome:piece",
    "poke", "tickle", "pet", "wake", "streak",
    "finish:ovation", "finish:great", "finish:good", "finish:keepgoing", "finish:best",
    "quiet:on", "treat", "treat:earned", "levelup", "hello",
  ];
  const ctx = { name: "Mochi", title: "Clair de lune, L. 32…", bar: 128, minutes: 240, n: 100, acc: 100, a: 120, b: 123 };
  for (const companion of ["beethoven", "mozart", "liszt", "langlang", "cat", "bunny"])
    for (const event of events) {
      const list = LINES[companion][event];
      assert.ok(list?.length >= 3, `${companion} ${event} has ${list?.length ?? 0} variants`);
      let prev = "";
      for (let i = 0; i < list.length * 2; i++) {
        const line = companionLine(companion, event, ctx);
        assert.ok(line.length > 0 && line.length <= 70, `${companion} ${event}: ${line} (${line.length})`);
        assert.ok(!/\{\w+\}/.test(line), `${companion} ${event} left a placeholder`);
        assert.notEqual(line, prev, `${companion} ${event} repeated itself`);
        prev = line;
      }
      // Never "proud" without a fact, never guilt.
      for (const line of list) assert.ok(!/proud of you|you should have|disappoint/i.test(line), line);
    }
  // Finishing below the bar always names a next step.
  for (const companion of Object.keys(LINES))
    for (const line of LINES[companion]["finish:keepgoing"]) assert.ok(/\{a\}|slow|wait|again|hand|loop/i.test(line), line);
});
