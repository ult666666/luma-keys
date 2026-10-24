// Lint the hands: run handPoses over hand-lab scenarios (or read a pose
// dump) and check every frame against the design guards of
// docs/HAND_MOTION_DESIGN.md §6 — G1 finger length, G2 palm width, G3 finger
// order, G4 speed, G5 contact exactness, G6 pad clearance, G7 two hands, G8
// continuity, G9 feasible down set, G13 never late — separating **model**
// violations (must be zero) from frames the model flags as **forced**
// (`pose.forced || pose.forcedFinger`). It also reports the repaint fraction
// and position changes per second, and keeps the pre-spec checks (finger
// length/order/speed, early release, hand overlap…) as a "legacy" section.
//
//   node scripts/hand-lab-lint.mjs --all [scenarioDir]        S01–S12 + scale-c-major at speeds 1.0 and 0.5
//   node scripts/hand-lab-lint.mjs --scenario S01.json        one scenario (both speeds; wait/pause frames for S01, S07, S12)
//   node scripts/hand-lab-lint.mjs poses.json                 a dump from hand-lab-poses.mjs or hand-lab-capture.mjs --json
//   options: [--speeds 1,0.5] [--fps 120] [--kw 36] [--kh 85] [--wait S01,S07] [--json report.json] [--quiet]
//
// G1 measures every length in the hand's own proportions (hand-pose.mjs
// HAND_BUILD): across the keys in key widths u, in depth in depth units v,
// so the fingers (knuckle → pad) and the thumb (MCP → pad, and its
// metacarpal CMC → MCP) are judged on one projected scale against their
// natural lengths.
//
// G5 checks each down pad at its key's contact: x at the key's centre, depth
// 0.68·keysHeight on a white key and 0.53 on a black one, the thumb and the
// little finger nearer the player (their own depth: min(0.45u, 0.2h) and
// min(HAND_BUILD.littleFront·v, 0.2h), × 0.3 and × 0.2 on a black key), and
// fingers 2–5 on a white key in a position with black keys further in by
// HAND_BUILD.whiteIn·v × the finger's `inward`. A key held from frame to
// frame keeps its exact contact: a held pad that moves at all is a
// violation ("held contact slides").
//
// Exit code 1 when any model violation is found. As a module it exports
// lintScenario(scenario, options) and lintFrames(frames, context) for tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { keyCentre, HAND_BUILD } from "../src/hand-pose.mjs";
import { isBlack } from "../src/music.mjs";
import { scenarioInputs, sampleFrames, posesAt, labGeometry } from "./hand-lab-scenario.mjs";

// ---- design constants (§4.2, §6.1, §8) --------------------------------------
// Natural lengths in the hand's own proportions: fingers 2–5 knuckle → pad,
// [1] the visible thumb MCP → pad; and the thumb's metacarpal.
const REACH = HAND_BUILD.reach;
const META = HAND_BUILD.metacarpal;
// A length in the hand's own proportions (keys): across in u, in depth in v.
const handLen = (a, b, u, v) => Math.hypot((b.x - a.x) / u, (b.y - a.y) / v);
const SLOT = [0, -2.4, -1.35, -0.45, 0.45, 1.35];
const DEV = [null, [-2.2, 1.4], [-0.8, 0.8], [-0.8, 0.9], [-0.8, 1.0], [-0.8, 1.5]];
const PIN_DEV = [null, [-2.2, 3.3], [-1.6, 0.8], [-1.6, 0.9], [-1.6, 1.0], [-0.8, 1.5]];
const OVER_DEV = [null, [-2.2, 3.3], [-2.2, 0.8], [-2.2, 0.9], [-2.2, 1.0], [-0.8, 1.5]];
const SPREADS = [1, 1.1, 1.2, 1.3, 1.4];
const HYST = 0.2;
export const GUARDS = {
  ratioMin: 0.55, // G1 fingers 2–5 knuckle → pad, × REACH (hand proportions)
  ratioMax: 1.3,
  thumbMin: 0.55, // G1 thumb MCP → pad (the visible thumb), × REACH[1]
  thumbMax: 1.1,
  metaMax: 1.1, // G1 thumb CMC → MCP (the metacarpal, inside the palm), × META
  rowMax: 1.22, // G2 knuckle row / rest row
  palmHalfMax: 2.45, // G2 drawn palm half-width, × the knuckle spacing w (pose.span): the knuckle row at its widest (1.22 × 3.1 w) and a finger's half width beyond each end
  orderMargin: 0.2, // G3, × u
  palmCap: 130, // G4 mean keys/s
  palmQuick: 60, // G4 mean keys/s unless the move stole or capped
  fingerCap: 30, // G4 finger-relative mean keys/s
  exact: 1e-4, // G5 px
  overlap: 0.04, // G5 a release may trail the written end by OVERLAP s
  padGap: 0.05, // G6, × u beyond the half widths
  padLift: 0.35, // G6 swap exception, × v of vertical separation
  handPads: 0.5, // G7, × u between pads of different hands
  liftFlip: 0.5, // G7 z may change only with palm.lift ≥ this
  continuity: 160, // G8 keys/s (palm 130 + finger 30)
  continuitySlack: 0.5, // G8 px
  flipJump: 0.35, // G8 px between adjacent 1-ms samples at a state flip
};
const LEGACY = {
  fingerLengthMin: 0.4,
  fingerLengthMax: 1.35,
  palmWidthMax: 5.2, // keys (4.6 for the former 0.84-key knuckle spacing)
  tipSpeedMax: 85,
  handOverlapMax: 0.75,
  stateFlipMinGap: 0.03,
};
const GUARD_NAMES = {
  G1: "finger length",
  G2: "palm width",
  G3: "finger order",
  G4: "speed",
  G5: "contact exactness",
  G6: "pad clearance",
  G7: "two hands",
  G8: "continuity",
  G9: "feasible down set",
  G13: "never late",
};
const EPS = 1e-6;
const tipOf = (f) => f.axis[f.axis.length - 1];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const forcedPose = (p) => !!(p && (p.forced || p.forcedFinger));
const dirOf = (hand) => (hand === "left" ? -1 : 1);

// ---- G9 feasibility (§4.2 fitFrame with devFor; the ratio guard is G1's) -----
function devFor(c, set, over) {
  const thumb = set.find((k) => k.finger === 1);
  if (c.finger === 1) return set.some((k) => k.finger > 1 && k.X < c.X) ? PIN_DEV[1] : DEV[1];
  if (thumb && thumb.X > c.X) return (over ? OVER_DEV : PIN_DEV)[c.finger];
  return DEV[c.finger];
}
export function fitFrame(contacts, hyst = 0, over = false) {
  for (const s of SPREADS) {
    let lo = -Infinity, hi = Infinity;
    for (const c of contacts) {
      const [d0, d1] = devFor(c, contacts, over);
      lo = Math.max(lo, c.X - SLOT[c.finger] * s - d1 - hyst);
      hi = Math.min(hi, c.X - SLOT[c.finger] * s - d0 + hyst);
    }
    if (lo <= hi) return { C: (lo + hi) / 2, lo, hi, spread: s };
  }
  return null;
}

// ---- timeline in seconds ------------------------------------------------------
function timelineOf(steps, clock) {
  return (steps || []).map((s) => ({
    beat: s.beat,
    t: clock.toSeconds(s.beat),
    keys: s.keys.map((k) => ({ ...k, endT: clock.toSeconds(k.end) })),
  }));
}
function stepIndex(timeline, beat) {
  let lo = 0, hi = timeline.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (timeline[mid].beat <= beat + EPS) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}
// The keys finger f may legitimately be down on at time t: the current
// step's key for f, or the previous step's (released at end + OVERLAP).
function allowedDown(timeline, i, finger, t) {
  const out = [];
  if (i < 0) return out;
  for (const k of timeline[i].keys) if (k.finger === finger && t < k.endT + GUARDS.overlap + EPS) out.push(k);
  if (!out.length && i > 0)
    for (const k of timeline[i - 1].keys) if (k.finger === finger && t < k.endT + GUARDS.overlap + EPS) out.push(k);
  return out;
}

// Expected contact point of a key for finger f (px, pose-local x added back).
// (The thumb and the little finger play nearer the player than the long
// fingers: their own depth on a white key, 0.3 (thumb) or 0.2 (little
// finger) of it on a black key. In a
// position with black keys, fingers 2–5 play a white key further in, by
// whiteIn × v × the finger's `inward` — fixed for each struck key, which the
// held-contact check below holds to.)
function keyYs(pose, black, finger, inward = 0) {
  const h = pose.keysHeight, u = pose.unit;
  const v = pose.verticalUnit ?? Math.min(u, 0.3 * h);
  const y = black ? 0.53 * h : 0.68 * h;
  const own = finger === 1 ? Math.min(0.45 * u, 0.2 * h) : finger === 5 ? Math.min(HAND_BUILD.littleFront * v, 0.2 * h) : 0;
  const deeper = finger > 1 && !black ? (HAND_BUILD.whiteIn ?? 0) * v * Math.max(0, Math.min(1, inward || 0)) : 0;
  return [y + own * (black ? (finger === 5 ? 0.2 : 0.3) : 1) - deeper];
}
function exactOn(pose, f, midi) {
  const tip = tipOf(f);
  const dx = Math.abs(pose.x + tip.x - keyCentre(midi) * pose.unit);
  const dy = Math.min(...keyYs(pose, isBlack(midi), f.finger, f.inward).map((y) => Math.abs(tip.y - y)));
  return { ok: dx <= GUARDS.exact && dy <= GUARDS.exact, dx, dy };
}

// ---- the frame-local guards (G1–G3, G5, G6, G9) for one hand ------------------
function frameLocal(pose, hand, ctx, add) {
  const u = pose.unit, v = pose.verticalUnit ?? Math.min(u, 0.3 * pose.keysHeight);
  const dir = pose.dir ?? dirOf(hand);
  const fingers = pose.fingers;
  // G1 finger length, in the hand's own proportions.
  for (const f of fingers) {
    const tip = tipOf(f);
    if (f.finger === 1) {
      const mcp = f.axis[1];
      const ratio = handLen(mcp, tip, u, v) / REACH[1];
      if (ratio < GUARDS.thumbMin || ratio > GUARDS.thumbMax) add("G1", "thumb length", `thumb MCP→tip ${ratio.toFixed(2)}× its length (${f.state})`);
      // The metacarpal is never drawn stretched (it lies in the palm; a
      // reach beyond it opens the web or the palm instead).
      const meta = handLen(f.axis[0], mcp, u, v) / META;
      if (meta > GUARDS.metaMax) add("G1", "thumb metacarpal", `thumb CMC→MCP ${meta.toFixed(2)}× its length (${f.state})`);
    } else {
      const ratio = handLen(f.axis[0], tip, u, v) / REACH[f.finger];
      if (ratio < GUARDS.ratioMin || ratio > GUARDS.ratioMax) add("G1", "finger length", `finger ${f.finger} ${ratio.toFixed(2)}× its reach (${f.state})`);
    }
  }
  // G2 palm width.
  if (pose.knuckles?.length >= 4) {
    const xs = pose.knuckles.map((k) => k.x);
    const rest = (1.55 + 1.55) * (pose.span ?? 0.84 * u);
    const row = (Math.max(...xs) - Math.min(...xs)) / rest;
    if (row > GUARDS.rowMax) add("G2", "knuckle row", `knuckle row ${row.toFixed(2)}× rest`);
  }
  if (pose.back?.length) {
    const xs = pose.back.map((p) => p.x);
    const half = (Math.max(...xs) - Math.min(...xs)) / 2 / (pose.span ?? 0.95 * u);
    if (half > GUARDS.palmHalfMax) add("G2", "palm half", `palm half ${half.toFixed(2)}w`);
  }
  // G3 finger order (hand space), thumb inside the span only when under or pinned.
  const X = fingers.map((f) => dir * tipOf(f).x);
  // Two pads both down are where the fingering puts them (exact contacts),
  // and two pads apart in depth (a black and a white key a semitone apart)
  // sit closer than the margin without crossing: only a reversal counts.
  for (let i = 1; i < 4; i++) {
    const gap = X[i + 1] - X[i];
    const bothDown = fingers[i].state === "down" && fingers[i + 1].state === "down";
    const apartInDepth = Math.abs(tipOf(fingers[i]).y - tipOf(fingers[i + 1]).y) >= GUARDS.padLift * v;
    if (bothDown || apartInDepth ? gap < 0 : gap < GUARDS.orderMargin * u)
      add("G3", "2–5 order", `fingers ${i + 1}<${i + 2} gap ${(gap / u).toFixed(2)}u`);
  }
  const thumb = fingers[0];
  if (X[0] - X[1] > 0.02 * u && !(thumb.under > 0) && thumb.state !== "down")
    add("G3", "thumb inside", `thumb ${((X[0] - X[1]) / u).toFixed(2)}u past the index, not under and not pinned`);
  // G6 pad clearance.
  for (let i = 0; i < 5; i++)
    for (let j = i + 1; j < 5; j++) {
      const a = fingers[i], b = fingers[j];
      const need = ((a.widths?.at(-1) ?? 0.45 * u) + (b.widths?.at(-1) ?? 0.45 * u)) / 2 + GUARDS.padGap * u;
      const ta = tipOf(a), tb = tipOf(b);
      const d = dist(ta, tb);
      if (d >= need) continue;
      if ((a.finger === 1 && a.under > 0) || (b.finger === 1 && b.under > 0)) continue;
      if ((a.state !== "down" || b.state !== "down") && Math.abs(ta.y - tb.y) >= GUARDS.padLift * v) continue;
      add("G6", "pads", `pads ${a.finger}/${b.finger} ${(d / u).toFixed(2)}u apart (need ${(need / u).toFixed(2)})`);
    }
  // G5 contact exactness and the down set (G9).
  if (!ctx.timeline) return;
  const i = stepIndex(ctx.timeline, ctx.beat);
  const down = [];
  for (const f of fingers) {
    if (f.state !== "down") continue;
    const allowed = allowedDown(ctx.timeline, i, f.finger, ctx.t);
    if (ctx.waiting && i >= 0 && Math.abs(ctx.timeline[i].beat - ctx.beat) < EPS) {
      const struck = ctx.timeline[i].keys.find((k) => k.finger === f.finger && k.struck);
      if (struck) add("G5", "wait shows chord down", `wait mode shows finger ${f.finger} down on the chord to play (${struck.midi})`);
    }
    if (!allowed.length) {
      add("G5", "down without a key", `finger ${f.finger} down with no sounding key`);
      continue;
    }
    const fits = allowed.map((k) => ({ k, ...exactOn(pose, f, k.midi) }));
    const best = fits.find((r) => r.ok) || fits.sort((a, b) => a.dx + a.dy - b.dx - b.dy)[0];
    if (!best.ok) add("G5", "not exact", `finger ${f.finger} down ${best.dx.toFixed(4)}/${best.dy.toFixed(4)} px off ${best.k.midi}`);
    down.push({ finger: f.finger, midi: best.k.midi, X: dir * keyCentre(best.k.midi) });
  }
  // A sounding note whose finger is up: only a named release rule may do that.
  if (i >= 0 && !ctx.waiting) {
    for (const k of ctx.timeline[i].keys) {
      if (ctx.t >= k.endT - EPS) continue;
      const f = fingers[k.finger - 1];
      if (!f || f.state === "down") continue;
      if (k.struck && ctx.t < ctx.timeline[i].t + EPS) continue; // G13's job
      // Named release rules (§4.4): the finger says which, a pedal ring marks
      // the key, or a rolled chord's upper group has not landed yet.
      const explained = f.releaseKind || f.released || (f.rollAt != null && ctx.t < f.rollAt + EPS) || (pose.pedal || []).some((p) => p.midi === k.midi);
      ctx.early(hand, k, !!explained);
      if (!explained) add("G5", "early release", `finger ${k.finger} up while ${k.midi} sounds (${((k.endT - ctx.t) * 1000).toFixed(0)} ms left, no release rule)`);
    }
  }
  if (down.length >= 2 && !fitFrame(down, HYST) && !fitFrame(down, HYST, true))
    add("G9", "infeasible", `down set ${down.map((c) => `${c.finger}:${c.midi}`).join(" ")} fits no frame`);
}

// Add a violation found outside lintFrames (G13 at exact onsets) to a report.
function bump(report, guard, where, forced, kind) {
  const g = report.guards[guard];
  const bucket = forced ? "forced" : "model";
  g[bucket]++;
  g[forced ? "forcedFrames" : "modelFrames"]++;
  g.kinds[`${bucket}:${kind}`] = (g.kinds[`${bucket}:${kind}`] || 0) + 1;
  if (forced) g.firstForced ??= { ...where, kind }; else g.first ??= { ...where, kind };
  report[bucket]++;
  report.summary[guard] = { model: g.model, forced: g.forced };
}

// ---- lint a frame sequence ------------------------------------------------------
// frames: [{ t, beat, left, right }]; context: { label, speed, inputs?, mode }
export function lintFrames(frames, context = {}) {
  const { label = "frames", speed = 1, inputs = null, mode = "run" } = context;
  const guards = Object.fromEntries(Object.keys(GUARD_NAMES).map((g) => [g, { model: 0, forced: 0, modelFrames: 0, forcedFrames: 0, kinds: {}, first: null, firstForced: null, lastFrame: null }]));
  const legacy = {};
  const legacyFirst = {};
  const early = { left: { count: 0, unexplained: 0, ms: 0 }, right: { count: 0, unexplained: 0, ms: 0 } };
  const forcedFrames = { left: 0, right: 0 };
  const hands = ["left", "right"];
  const timelines = inputs ? Object.fromEntries(hands.map((h) => [h, timelineOf(inputs.steps[h], inputs.clock)])) : {};
  const record = (guard, frame, hand, kind, detail, forced) => {
    const g = guards[guard];
    const where = { t: +frame.t.toFixed(4), beat: +frame.beat.toFixed(4), hand, kind, detail };
    const bucket = forced ? "forced" : "model";
    g[bucket]++;
    g.kinds[`${bucket}:${kind}`] = (g.kinds[`${bucket}:${kind}`] || 0) + 1;
    const key = `${frame.t}|${hand}`;
    if (g.lastFrame !== key) { g.lastFrame = key; g[forced ? "forcedFrames" : "modelFrames"]++; }
    if (forced) g.firstForced ??= where; else g.first ??= where;
  };
  const legacyAdd = (kind, frame, hand, detail) => {
    legacy[kind] = (legacy[kind] || 0) + 1;
    legacyFirst[kind] ??= { t: +frame.t.toFixed(4), beat: +frame.beat.toFixed(4), hand, detail };
  };
  const stateChanges = {};
  const sigs = { left: { changes: 0, distinct: new Set(), frames: 0, last: null }, right: { changes: 0, distinct: new Set(), frames: 0, last: null } };
  const positions = { left: { changes: 0, known: false, last: null }, right: { changes: 0, known: false, last: null } };
  // Fallback frames have no drawn skeleton. Check their actual key guidance
  // against the written timeline before excluding only that hidden geometry.
  for (const frame of frames) for (const hand of hands) {
    const pose = frame[hand];
    if (!pose?.guidanceOnly) continue;
    if (!pose.guidanceReason) record("G5", frame, hand, "unexplained guidance", "key-only fallback needs a reason", false);
    const timeline = timelines[hand];
    if (!timeline) continue;
    const i = stepIndex(timeline, frame.beat);
    if (i < 0) continue;
    for (const k of timeline[i].keys) {
      if (k.endT <= frame.t + EPS) continue;
      const state = mode === "wait" && k.struck && Math.abs(timeline[i].beat - frame.beat) < EPS ? "ready" : "down";
      const shown = pose.guidance?.find(g => g.midi === k.midi);
      if (!shown || shown.state !== state || shown.finger !== k.finger || shown.end !== k.end)
        record("G5", frame, hand, "missing guidance contact", `written key ${k.midi} must retain its finger, end and ${state} contact`, false);
    }
  }
  frames = frames.map(frame => ({ ...frame, ...Object.fromEntries(hands.map(hand => [hand, frame[hand]?.guidanceOnly ? null : frame[hand]])) }));
  let previous = null;
  let lastZ = null, lastOverlap = false;
  for (const frame of frames) {
    const dt = previous ? frame.t - previous.t : 0;
    for (const hand of hands) {
      const pose = frame[hand];
      if (!pose) continue;
      const forced = forcedPose(pose);
      if (forced) forcedFrames[hand]++;
      const u = pose.unit;
      const add = (guard, kind, detail) => record(guard, frame, hand, kind, detail, forced);
      frameLocal(pose, hand, {
        timeline: timelines[hand],
        beat: frame.beat,
        t: frame.t,
        waiting: mode === "wait",
        early: (h, k, explained) => {
          early[h].count++;
          if (!explained) early[h].unexplained++;
          if (dt > 0) early[h].ms += dt * 1000;
        },
      }, add);
      // Repaints and positions.
      const s = sigs[hand];
      s.frames++;
      s.distinct.add(pose.signature);
      if (s.last != null && s.last !== pose.signature) s.changes++;
      s.last = pose.signature;
      if (pose.position?.index != null) {
        const p = positions[hand];
        p.known = true;
        if (p.last != null && p.last !== pose.position.index) p.changes++;
        p.last = pose.position.index;
      }
      // G8 continuity and legacy speed/flicker between consecutive frames.
      const before = previous?.[hand];
      if (before && dt > 0) {
        const exempt = forced || forcedPose(before);
        // The palm may peak above its mean cap (a capped move peaks ≈ 1.9×
        // its mean): allow the palm's own speed (pose.palm.speed, keys/s)
        // plus the finger cap, never less than the spec's 130 + 30.
        const palmV = Math.max(GUARDS.palmCap, pose.palm?.speed ?? 0, before.palm?.speed ?? 0);
        const bound = (palmV + GUARDS.fingerCap) * u * dt + GUARDS.continuitySlack;
        pose.fingers.forEach((f, i) => {
          const a = tipOf(before.fingers[i]), b = tipOf(f);
          const moved = Math.hypot(b.x + pose.x - (a.x + before.x), b.y - a.y);
          // G5: a key held from one frame to the next keeps its exact contact
          // (the same key, the same depth: a held contact never slides).
          if (f.state === "down" && before.fingers[i].state === "down" && Math.abs(b.x + pose.x - (a.x + before.x)) < GUARDS.exact && Math.abs(b.y - a.y) > GUARDS.exact)
            add("G5", "held contact slides", `finger ${f.finger} held on its key moved ${(b.y - a.y).toFixed(4)} px in depth`);
          if (moved > bound && !exempt) add("G8", "tip speed", `finger ${f.finger} tip moved ${moved.toFixed(1)} px in ${(dt * 1000).toFixed(1)} ms (bound ${bound.toFixed(1)})`);
          if (moved / u / dt > LEGACY.tipSpeedMax) legacyAdd("tip-speed", frame, hand, `finger ${f.finger} ${(moved / u / dt).toFixed(0)} keys/s`);
          const was = before.fingers[i].state;
          if (was !== f.state) {
            const key = `${hand}${f.finger}`;
            const last = stateChanges[key];
            if (last != null && frame.t - last < LEGACY.stateFlipMinGap) legacyAdd("state-flicker", frame, hand, `finger ${f.finger} ${was}→${f.state} ${((frame.t - last) * 1000).toFixed(0)} ms after its previous change`);
            stateChanges[key] = frame.t;
            if (context.flipProbe && !exempt) {
              const jump = context.flipProbe(hand, f.finger, previous, frame);
              if (jump != null && jump > GUARDS.flipJump) add("G8", "flip jump", `finger ${f.finger} ${was}→${f.state} jumps ${jump.toFixed(2)} px at the flip`);
            }
          }
        });
      }
      legacyFrame(pose, hand, frame, timelines[hand], legacyAdd);
    }
    // G7 two hands.
    const L = frame.left, R = frame.right;
    if (L && R) {
      const box = (p) => {
        const xs = (p.back?.length ? p.back : p.fingers.map(tipOf)).map((q) => p.x + q.x);
        return [Math.min(...xs), Math.max(...xs)];
      };
      const [l0, l1] = box(L), [r0, r1] = box(R);
      const overlap = Math.min(l1, r1) - Math.max(l0, r0) > 0;
      const forced = forcedPose(L) || forcedPose(R);
      const add = (kind, detail) => record("G7", frame, "both", kind, detail, forced);
      const z = L.zTop === true && R.zTop !== true ? "left" : R.zTop === true && L.zTop !== true ? "right" : L.zTop && R.zTop ? "both" : null;
      if (overlap && (z == null || z === "both")) add("zTop", z === "both" ? "both hands zTop while the palms overlap" : "palms overlap with no zTop");
      if (overlap && lastOverlap && z !== lastZ && lastZ != null && z != null) {
        const lifted = Math.max(L.palm?.lift ?? 0, R.palm?.lift ?? 0) >= GUARDS.liftFlip;
        if (!lifted) add("z flip", `z order flipped ${lastZ}→${z} while two still hands overlap`);
      }
      lastZ = z;
      lastOverlap = overlap;
      // Pads apart applies to hands side by side; where the palms overlap
      // (hands crossed, or one passing over the other) or the top hand is
      // airborne over the other, the layering rules.
      const airborne = (L.zTop && (L.palm?.lift ?? 0) >= GUARDS.liftFlip) || (R.zTop && (R.palm?.lift ?? 0) >= GUARDS.liftFlip);
      const crossed = L.x > R.x || overlap || airborne;
      if (!crossed) {
        let nearest = Infinity;
        for (const a of L.fingers) for (const b of R.fingers) {
          const ta = tipOf(a), tb = tipOf(b);
          nearest = Math.min(nearest, Math.hypot(ta.x + L.x - tb.x - R.x, ta.y - tb.y));
        }
        if (nearest < GUARDS.handPads * L.unit) add("pads", `pads of the two hands ${(nearest / L.unit).toFixed(2)}u apart`);
      }
      if (!L.rest && !R.rest) {
        const lb = (p) => { const xs = p.fingers.slice(1).map((f) => p.x + tipOf(f).x); return [Math.min(...xs) - 0.6 * p.unit, Math.max(...xs) + 0.6 * p.unit]; };
        const [a0, a1] = lb(L), [b0, b1] = lb(R);
        const o = (Math.min(a1, b1) - Math.max(a0, b0)) / L.unit;
        const layered = L.zTop != null && R.zTop != null && L.zTop !== R.zTop;
        if (o > LEGACY.handOverlapMax && !layered) legacyAdd("hand-overlap", frame, "both", `palms overlap ${o.toFixed(2)} keys without layering`);
      }
    } else { lastZ = null; lastOverlap = false; }
    previous = frame;
  }
  // G4 speed: palm moves and finger hops, by mean speed over each motion run.
  const moves = { left: [], right: [] };
  for (const hand of hands) {
    for (const run of motionRuns(frames, hand, (p) => p.x / p.unit, 0.3)) {
      moves[hand].push(run);
      const forced = run.frames.some((f) => forcedPose(f[hand]));
      const where = run.frames[0];
      const told = run.frames.some((f) => f[hand].travel?.steal > 0 || f[hand].travel?.capped);
      if (run.mean > GUARDS.palmCap) record("G4", where, hand, "palm cap", `palm ${run.distance.toFixed(2)} keys in ${(run.duration * 1000).toFixed(0)} ms = ${run.mean.toFixed(0)} keys/s mean (cap ${GUARDS.palmCap})`, forced);
      else if (run.mean > GUARDS.palmQuick && !told) record("G4", where, hand, "palm quick", `palm ${run.distance.toFixed(2)} keys in ${(run.duration * 1000).toFixed(0)} ms = ${run.mean.toFixed(0)} keys/s mean without a steal/cap (quick ${GUARDS.palmQuick})`, forced);
    }
    // Finger moves: a finger preparing a stroke (state ready), relative to
    // the palm. A free curled finger nudged aside by its neighbour is not a
    // move of its own.
    for (let i = 0; i < 5; i++) {
      const rel = (p) => (p.fingers[i].state !== "ready" ? NaN : (p.dir ?? dirOf(hand)) * tipOf(p.fingers[i]).x / p.unit);
      for (const run of motionRuns(frames, hand, rel, 1)) {
        if (run.mean <= GUARDS.fingerCap) continue;
        // A thumb giving way to the other hand's thumb moves with that thumb:
        // not a move of its own.
        if (i === 0) {
          const y = run.frames.map((f) => f[hand].fingers[0].yield || 0);
          if (Math.max(...y) - Math.min(...y) > 0.05) continue;
        }
        const forced = run.frames.some((f) => f[hand].forcedFinger || f[hand].forced);
        record("G4", run.frames[0], hand, "finger hop", `finger ${i + 1} ${run.distance.toFixed(2)} keys in ${(run.duration * 1000).toFixed(0)} ms = ${run.mean.toFixed(0)} keys/s relative to the palm (cap ${GUARDS.fingerCap})`, forced);
      }
    }
  }
  // Forced episodes, with the speed they demanded.
  const forcedEpisodes = [];
  for (const hand of hands) {
    let start = null;
    frames.forEach((f, k) => {
      const on = forcedPose(f[hand]);
      if (on && start == null) start = k;
      if ((!on || k === frames.length - 1) && start != null) {
        const end = on ? k : k - 1;
        const run = moves[hand].find((m) => m.t0 <= frames[end].t + EPS && m.t1 >= frames[start].t - EPS);
        forcedEpisodes.push({ hand, t0: +frames[start].t.toFixed(3), t1: +frames[end].t.toFixed(3), frames: end - start + 1, palmMean: run ? +run.mean.toFixed(1) : null, passage: label });
        start = null;
      }
    });
  }
  const duration = frames.length > 1 ? frames.at(-1).t - frames[0].t : 0;
  const summary = {};
  let model = 0, forced = 0;
  for (const [g, r] of Object.entries(guards)) { delete r.lastFrame; model += r.model; forced += r.forced; if (r.model || r.forced) summary[g] = { model: r.model, forced: r.forced }; }
  return {
    label,
    speed,
    mode,
    frames: frames.length,
    duration: +duration.toFixed(3),
    model,
    forced,
    summary,
    guards,
    forcedFrames,
    forcedEpisodes,
    earlyReleases: early,
    repaint: Object.fromEntries(hands.map((h) => [h, sigs[h].frames ? { frames: sigs[h].frames, repaints: sigs[h].changes, fraction: +(sigs[h].changes / sigs[h].frames).toFixed(3), distinct: sigs[h].distinct.size, distinctFraction: +(sigs[h].distinct.size / sigs[h].frames).toFixed(3) } : null])),
    positions: Object.fromEntries(hands.map((h) => [h, {
      changes: positions[h].known ? positions[h].changes : null,
      perSecond: positions[h].known && duration ? +(positions[h].changes / duration).toFixed(2) : null,
      moves: moves[h].length,
      movesPerSecond: duration ? +(moves[h].length / duration).toFixed(2) : 0,
    }])),
    legacy,
    legacyFirst,
  };
}

// Maximal runs of frames in which value(pose) changes faster than `threshold`
// per second (NaN breaks a run): { frames, t0, t1, distance, duration, mean }.
function motionRuns(frames, hand, value, threshold) {
  const runs = [];
  let run = null;
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1][hand], b = frames[k][hand];
    const dt = frames[k].t - frames[k - 1].t;
    const va = a ? value(a) : NaN, vb = b ? value(b) : NaN;
    const moving = dt > 0 && Number.isFinite(va) && Number.isFinite(vb) && Math.abs(vb - va) / dt > threshold;
    if (moving) {
      if (!run) run = { k0: k - 1, start: va, frames: [frames[k - 1]] };
      run.frames.push(frames[k]);
      run.k1 = k;
      run.end = vb;
    } else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  return runs.map((r) => {
    const t0 = frames[r.k0].t, t1 = frames[r.k1].t;
    const distance = Math.abs(r.end - r.start);
    return { frames: r.frames, t0, t1, distance, duration: t1 - t0, mean: t1 > t0 ? distance / (t1 - t0) : 0 };
  });
}

// The pre-spec checks, unchanged in spirit (bounds in LEGACY).
function legacyFrame(pose, hand, frame, timeline, add) {
  const dir = pose.dir ?? dirOf(hand);
  const u = pose.unit;
  const tips = pose.fingers.map(tipOf);
  pose.fingers.forEach((f) => {
    const ratio = dist(f.axis[0], tipOf(f)) / (REACH[f.finger] * u);
    if (f.finger !== 1 && (ratio < LEGACY.fingerLengthMin || ratio > LEGACY.fingerLengthMax))
      add("finger-length", frame, hand, `finger ${f.finger} length ${ratio.toFixed(2)}× reach (state ${f.state})`);
  });
  for (let i = 1; i < 4; i++)
    if (dir * (tips[i + 1].x - tips[i].x) < -0.05 * u)
      add("finger-order", frame, hand, `finger ${i + 2} left of finger ${i + 1} by ${(Math.abs(tips[i + 1].x - tips[i].x) / u).toFixed(2)} keys`);
  const thumbInside = dir * (tips[0].x - tips[1].x) > 0.05 * u;
  const thumbTucked = pose.fingers[0].tucked || pose.fingers[0].under || tips[0].y < tips[1].y - 0.4 * u;
  if (thumbInside && !thumbTucked && pose.fingers[0].state !== "down")
    add("thumb-crossing", frame, hand, `thumb ${((dir * (tips[0].x - tips[1].x)) / u).toFixed(2)} keys past the index without being tucked`);
  const row = pose.knuckles && pose.knuckles.length >= 4 ? pose.knuckles : tips.slice(1);
  const width = (Math.max(...row.map((p) => p.x)) - Math.min(...row.map((p) => p.x))) / u + 1.2;
  if (width > LEGACY.palmWidthMax) add("palm-width", frame, hand, `palm ${width.toFixed(2)} keys wide`);
  pose.fingers.forEach((f) => {
    if (f.state !== "down") return;
    const x = (pose.x + tipOf(f).x) / u;
    const off = Math.abs(x * 2 - Math.round(x * 2)) / 2;
    if (off > 0.02) add("contact", frame, hand, `finger ${f.finger} down ${off.toFixed(3)} keys off a key centre`);
  });
  if (!timeline) return;
  const i = stepIndex(timeline, frame.beat);
  if (i < 0) return;
  for (const k of timeline[i].keys) {
    const sinceOnset = frame.t - (k.struck ? timeline[i].t : -Infinity);
    const toEnd = k.endT - frame.t;
    const f = pose.fingers[k.finger - 1];
    if (f && f.state !== "down" && !f.released && sinceOnset > 0.04 && toEnd > 0.04)
      add("early-release", frame, hand, `finger ${k.finger} is ${f.state} while midi ${k.midi} still sounds (${(toEnd * 1000).toFixed(0)} ms left)`);
  }
}

// ---- G13 at exact onsets, and the 1-ms flip probe (scenario mode) ------------------
function neverLate(inputs, geometry, add) {
  for (const hand of ["left", "right"]) {
    for (const step of inputs.steps[hand] || []) {
      const both = posesAt(inputs, step.beat, geometry, {});
      const pose = both[hand];
      const struck = step.keys.filter((k) => k.struck);
      if (!pose) { if (struck.length) add(hand, step, pose, `no pose at an onset`); continue; }
      if (pose.guidanceOnly) {
        for (const k of struck)
          if (!pose.guidance?.some(g => g.midi === k.midi && g.state === "down" && g.finger === k.finger))
            add(hand, step, pose, `key ${k.midi} missing at its written onset`);
        continue;
      }
      for (const k of struck) {
        const f = pose.fingers[k.finger - 1];
        // A rolled chord's upper groups land after the beat by design (§4.5.7).
        if (f.state !== "down" && f.rollAt != null) continue;
        if (f.state !== "down") { add(hand, step, pose, `finger ${k.finger} ${f.state} at the onset of ${k.midi}`); continue; }
        const r = exactOn(pose, f, k.midi);
        if (!r.ok) add(hand, step, pose, `finger ${k.finger} ${r.dx.toFixed(4)}/${r.dy.toFixed(4)} px off ${k.midi} at its onset`);
      }
    }
  }
}
function flipProbe(inputs, geometry, extra) {
  return (hand, finger, a, b) => {
    const samples = [];
    const t0 = a.t - 0.001, t1 = b.t + 0.001;
    for (let t = t0; t <= t1 + 1e-9; t += 0.001) {
      const pose = posesAt(inputs, inputs.clock.toBeat(t), geometry, extra)[hand];
      if (!pose || pose.guidanceOnly) return null;
      const f = pose.fingers[finger - 1];
      const tip = tipOf(f);
      samples.push({ state: f.state, x: pose.x + tip.x, y: tip.y });
    }
    let worst = 0;
    for (let k = 1; k < samples.length; k++) {
      if (samples[k].state === samples[k - 1].state) continue;
      const jump = Math.hypot(samples[k].x - samples[k - 1].x, samples[k].y - samples[k - 1].y);
      const near = [k - 1 > 0 ? [samples[k - 2], samples[k - 1]] : null, k + 1 < samples.length ? [samples[k], samples[k + 1]] : null]
        .filter(Boolean)
        .map(([p, q]) => Math.hypot(q.x - p.x, q.y - p.y));
      worst = Math.max(worst, jump - (near.length ? Math.max(...near) : 0));
    }
    return worst;
  };
}

// ---- one scenario: speeds 1.0/0.5, plus wait/pause frames ------------------------------
export function lintScenario(scenario, { speeds = [1, 0.5], fps = 120, kw = 36, kh = null, waitChecks = null, label = null } = {}) {
  const id = label || scenario.id || scenario.title || "scenario";
  const geometry = labGeometry(kw, kh);
  const reports = [];
  for (const speed of speeds) {
    const inputs = scenarioInputs(scenario, { speed });
    const frames = sampleFrames(inputs, { fps, kw, kh });
    const report = lintFrames(frames, { label: id, speed, inputs, mode: "run", flipProbe: flipProbe(inputs, geometry, {}) });
    neverLate(inputs, geometry, (hand, step, pose, detail) => {
      const frame = { t: inputs.clock.toSeconds(step.beat), beat: step.beat };
      const forced = forcedPose(pose);
      bump(report, "G13", { t: +frame.t.toFixed(4), beat: step.beat, hand, detail }, forced, "late");
    });
    reports.push(report);
  }
  const wants = waitChecks ?? ["S01", "S07", "S12"].includes(scenario.id);
  if (wants) {
    const inputs = scenarioInputs(scenario, { speed: 1 });
    const waitFrames = [], pauseFrames = [];
    const onsets = [...new Set([...inputs.steps.left, ...inputs.steps.right].map((s) => s.beat))].sort((a, b) => a - b);
    onsets.forEach((beat, k) => {
      waitFrames.push({ t: inputs.clock.toSeconds(beat), beat, ...posesAt(inputs, beat, geometry, { waiting: true }) });
      const next = onsets[k + 1];
      if (next != null) {
        const mid = (beat + next) / 2;
        pauseFrames.push({ t: inputs.clock.toSeconds(mid), beat: mid, ...posesAt(inputs, mid, geometry, { frozen: true }) });
      }
    });
    // Frame-local guards only (G1–G3, G5–G7, G9): each frame is its own still picture.
    const local = (frames, mode) => {
      const r = lintFrames([], { label: id, speed: 1, inputs, mode });
      for (const f of frames) {
        const single = lintFrames([f], { label: id, speed: 1, inputs, mode });
        for (const [g, x] of Object.entries(single.guards)) {
          if (g === "G4" || g === "G8") continue;
          const y = r.guards[g];
          y.model += x.model; y.forced += x.forced; y.modelFrames += x.modelFrames; y.forcedFrames += x.forcedFrames;
          for (const [k, n] of Object.entries(x.kinds)) y.kinds[k] = (y.kinds[k] || 0) + n;
          y.first ??= x.first; y.firstForced ??= x.firstForced;
        }
      }
      r.frames = frames.length;
      r.model = 0; r.forced = 0; r.summary = {};
      for (const [g, x] of Object.entries(r.guards)) { r.model += x.model; r.forced += x.forced; if (x.model || x.forced) r.summary[g] = { model: x.model, forced: x.forced }; }
      return r;
    };
    reports.push(local(waitFrames, "wait"), local(pauseFrames, "pause"));
    // Wait-mode replays (§4.8): after the host jumps to each chord, the way
    // there replays at natural speed for `settle.since` seconds, then the
    // hand holds and breathes. Each replay is a run of frames in its own
    // seconds: frame-local guards, G4 speed and G8 continuity (no timeline,
    // as the replayed instant is not the host's clock).
    const replay = { frames: 0, model: 0, forced: 0, summary: {}, guards: null, forcedFrames: { left: 0, right: 0 } };
    onsets.forEach((beat, k) => {
      if (k === 0) return;
      const frames = [];
      for (let n = 0; n <= 2 * fps; n++) {
        const since = n / fps;
        frames.push({ t: since, beat, ...posesAt(inputs, beat, geometry, { waiting: true, frozen: true, settle: { since } }) });
      }
      const r = lintFrames(frames, { label: id, speed: 1, inputs: null, mode: "replay" });
      replay.frames += r.frames;
      replay.model += r.model;
      replay.forced += r.forced;
      replay.forcedFrames.left += r.forcedFrames.left;
      replay.forcedFrames.right += r.forcedFrames.right;
      if (!replay.guards) replay.guards = r.guards;
      else
        for (const [g, x] of Object.entries(r.guards)) {
          const y = replay.guards[g];
          y.model += x.model; y.forced += x.forced; y.modelFrames += x.modelFrames; y.forcedFrames += x.forcedFrames;
          for (const [kind, c] of Object.entries(x.kinds)) y.kinds[kind] = (y.kinds[kind] || 0) + c;
          y.first ??= x.first; y.firstForced ??= x.firstForced;
        }
    });
    if (replay.guards) {
      for (const [g, x] of Object.entries(replay.guards)) if (x.model || x.forced) replay.summary[g] = { model: x.model, forced: x.forced };
      reports.push({ label: id, speed: 1, mode: "replay", ...replay });
    }
  }
  return reports;
}

// ---- printing ---------------------------------------------------------------------------
export function formatReport(r, { verbose = true } = {}) {
  const guards = Object.entries(r.summary).map(([g, x]) => `${g} ${x.model}${x.forced ? `+${x.forced}f` : ""}`).join(", ") || "none";
  const rep = r.repaint ? ["left", "right"].map((h) => (r.repaint[h] ? `${h[0].toUpperCase()} ${r.repaint[h].fraction}` : null)).filter(Boolean).join(" ") : "";
  const pos = r.positions ? ["left", "right"].map((h) => `${h[0].toUpperCase()} ${r.positions[h].perSecond ?? "n/a"}/${r.positions[h].movesPerSecond}`).join(" ") : "";
  const tag = r.mode === "run" ? `×${r.speed}` : r.mode;
  const lines = [`${r.label} ${tag}: ${r.frames} frames · model ${r.model} (${guards}) · forced frames L ${r.forcedFrames?.left ?? 0} R ${r.forcedFrames?.right ?? 0}` + (r.mode === "run" ? ` · repaint ${rep} · positions/moves per s ${pos}` : "")];
  if (verbose)
    for (const [g, x] of Object.entries(r.guards)) {
      if (x.first) lines.push(`    ${g} ${GUARD_NAMES[g]} [${Object.entries(x.kinds).filter(([k]) => k.startsWith("model:")).map(([k, n]) => `${k.slice(6)} ${n}`).join(", ")}; ${x.modelFrames} hand-frames] first @${x.first.t}s (beat ${x.first.beat}) ${x.first.hand}: ${x.first.detail}`);
      if (x.firstForced) lines.push(`    ${g} forced first @${x.firstForced.t}s ${x.firstForced.hand}: ${x.firstForced.detail}`);
    }
  if (verbose && r.forcedEpisodes?.length)
    for (const e of r.forcedEpisodes.slice(0, 8)) lines.push(`    forced ${e.hand} ${e.t0}–${e.t1}s (${e.frames} frames, palm ${e.palmMean ?? "?"} keys/s) ${e.passage}`);
  if (verbose && r.legacy && Object.keys(r.legacy).length) lines.push(`    legacy ${JSON.stringify(r.legacy)}`);
  return lines.join("\n");
}

// ---- CLI ----------------------------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) { opt[a.slice(2)] = next; i++; } else opt[a.slice(2)] = "1";
    } else positional.push(a);
  }
  const speeds = (opt.speeds || "1,0.5").split(",").map(Number);
  const fps = +(opt.fps || 120), kw = +(opt.kw || 36), kh = opt.kh ? +opt.kh : null;
  const waitIds = opt.wait ? opt.wait.split(",") : null;
  const reports = [];
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const runScenario = (file) => {
    const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
    const id = scenario.id || path.basename(file, ".json");
    const list = lintScenario(scenario, { speeds, fps, kw, kh, label: id, waitChecks: waitIds ? waitIds.includes(id) : ["S01", "S07", "S12"].includes(id) });
    for (const r of list) { reports.push(r); if (!opt.quiet) console.log(formatReport(r)); }
  };
  if (opt.all) {
    const dir = opt.all !== "1" ? opt.all : positional[0] || path.join(root, ".qa-runs/hand-motion/scenarios");
    const files = fs.readdirSync(dir).filter((f) => /^(S\d\d|scale-c-major|scale)\.json$/.test(f)).sort();
    for (const f of files) runScenario(path.join(dir, f));
  } else if (opt.scenario) runScenario(opt.scenario);
  else if (positional[0]) {
    const dump = JSON.parse(fs.readFileSync(positional[0], "utf8"));
    const raw = Array.isArray(dump) ? dump : dump.frames || dump.poses;
    const frames = raw.map((f) => ({ ...f, t: f.t ?? f.beat * (f.secondsPerBeat ?? 0.6) }));
    const inputs = dump.scenario ? scenarioInputs(dump.scenario, { speed: dump.speed }) : null;
    const mode = dump.waiting ? "wait" : dump.frozen ? "pause" : "run";
    const label = dump.scenario?.id || path.basename(positional[0]);
    const r = lintFrames(frames, { label, speed: dump.speed ?? 1, inputs, mode });
    // G13 on a dump: the first frame at or after each struck onset.
    if (inputs && mode === "run") {
      for (const hand of ["left", "right"]) {
        for (const step of inputs.steps[hand]) {
          const t = inputs.clock.toSeconds(step.beat);
          const frame = frames.find((f) => f.t >= t - EPS);
          if (!frame || frame.t - t > 1 / 60) continue;
          const pose = frame[hand];
          for (const k of step.keys.filter((k) => k.struck)) {
            if (inputs.clock.toSeconds(k.end) <= frame.t) continue;
            const f = pose?.fingers[k.finger - 1];
            const bad = !f ? "no pose" : f.state !== "down" ? `finger ${k.finger} ${f.state}` : !exactOn(pose, f, k.midi).ok ? `finger ${k.finger} off ${k.midi}` : null;
            if (!bad) continue;
            bump(r, "G13", { t: +frame.t.toFixed(4), beat: +frame.beat.toFixed(4), hand, detail: `${bad} at its onset frame` }, forcedPose(pose), "late");
          }
        }
      }
    }
    reports.push(r);
    console.log(formatReport(r));
  } else {
    console.error("usage: hand-lab-lint.mjs --all [dir] | --scenario file.json | poses.json  [--speeds 1,0.5] [--fps 120] [--kw 36] [--json out]");
    process.exit(2);
  }
  const model = reports.reduce((s, r) => s + r.model, 0);
  const forced = reports.reduce((s, r) => s + r.forced, 0);
  console.log(`\n${reports.length} runs · model violations ${model} · forced ${forced}`);
  if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(reports.map(({ guards, ...rest }) => ({ ...rest, guards })), null, 1));
  process.exit(model ? 1 : 0);
}
