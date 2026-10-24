// The hands over the keys. For any moment of a piece this says where each of
// a hand's five fingers is, which of them are down on keys, and the shape of
// the hand around them, so the stage can show how a passage is played: the
// suggested fingering, the hand's position on the keyboard, and each move to
// a new position just before it is needed.
//
// The arm places a *position* (a palm frame over a run of chords) and only
// the fingers move inside it. Positions, the moves between them and every
// finger's engagements are planned once per timeline in real seconds (the
// score's tempo map at the practice speed), so a move takes the same time at
// any tempo: at slow practice the hand waits, then moves at natural speed.
// A sounding finger stays exactly on its key through its written duration.
// Movement preparation never borrows time from a note. The pose is a pure
// function of its inputs, so seeking equals playing.
// The original motion design supplies the constrained movement vocabulary.
// Unrepresentable contacts use key guidance; they never create a rolled attack.
import { keyboardLayout, isBlack } from "./music.mjs";

const EPS = 1e-6;
const WHITE_COUNT = 52;
const LAYOUT = new Map(keyboardLayout(21, 108).map((k) => [k.midi, k]));

// A key's centre in white-key widths from the left end of the 88 keys.
export function keyCentre(midi) {
  const k = LAYOUT.get(midi);
  return k ? ((k.left + k.width / 2) / 100) * WHITE_COUNT : null;
}

const handOf = (n) => (n.hand === "left" ? "left" : "right");

// One hand's positions in order: at each onset, the finger on each key being
// struck and on each key still held from before (a held key keeps its finger
// until that key is attacked again). Every written key is retained, including
// unassigned or conflicting fingering, so feasibility cannot silently drop music.
export function handTimeline(notes, fingering, hand) {
  const mine = (notes || [])
    .filter(
      (n) => handOf(n) === hand && LAYOUT.has(n.midi),
    )
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const steps = [];
  let held = new Map();
  for (let i = 0; i < mine.length;) {
    const beat = mine[i].beat;
    const keys = new Map();
    for (const [midi, n] of held)
      if (n.beat + n.duration > beat + EPS) keys.set(midi, n);
    // Written voices can share one physical key. Their simultaneous attack
    // holds until the longest voice ends, independent of input order.
    const attacks = new Map();
    for (; i < mine.length && Math.abs(mine[i].beat - beat) < EPS; i++) {
      const n = mine[i];
      const prior = attacks.get(n.midi);
      if (!prior || n.beat + n.duration > prior.beat + prior.duration)
        attacks.set(n.midi, n);
    }
    for (const n of attacks.values()) {
      // A later attack replaces that pitch's former hold, even when the
      // suggested finger changes. Two fingers cannot hold the same key.
      keys.set(n.midi, n);
    }
    held = keys;
    steps.push({
      beat,
      keys: [...keys]
        .map(([_midi, n]) => ({
          finger: fingering?.get(n.id) ?? null,
          midi: n.midi,
          end: n.beat + n.duration,
          struck: Math.abs(n.beat - beat) < EPS,
        }))
        .sort((a, b) => (a.finger ?? 6) - (b.finger ?? 6) || a.midi - b.midi),
    });
  }
  return steps;
}

// Index of the last step starting at or before `beat` (-1 before the first).
function stepAt(steps, beat) {
  let lo = 0,
    hi = steps.length - 1,
    found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (steps[mid].beat <= beat + EPS) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}


// ---- numbers -------------------------------------------------------------------
// Smooth arrival and departure (zero end velocity and acceleration).
const ease = (t) => t * t * t * (10 + t * (-15 + t * 6));
const easeV = (t) => 30 * t * t * (1 - t) * (1 - t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease01 = (x) => ease(clamp(x, 0, 1));
const lerp = (a, b, k) => a + (b - a) * k;
// The palm decelerates a little longer than it accelerates.
const pathEase = (s) => ease(Math.pow(clamp(s, 0, 1), 0.85));
const pathEaseV = (s) =>
  s <= 0 || s >= 1 ? 0 : easeV(Math.pow(s, 0.85)) * 0.85 * Math.pow(s, -0.15);

// ---- the design's constants (docs/HAND_MOTION_DESIGN.md §8) ---------------------
// Finger slots across the palm (keys, hand space: + toward finger 5), and how
// far each finger reaches from its slot: freely, while pinned on a key the
// palm leans past, and crossing over a pinned thumb.
const SLOT = [0, -2.4, -1.35, -0.45, 0.45, 1.35];
const DEV = [null, [-2.2, 1.4], [-0.8, 0.8], [-0.8, 0.9], [-0.8, 1.0], [-0.8, 1.5]];
const PIN_DEV = [null, [-2.2, 3.3], [-1.6, 0.8], [-1.6, 0.9], [-1.6, 1.0], [-0.8, 1.5]];
const OVER_DEV = [null, [-2.2, 3.3], [-2.2, 0.8], [-2.2, 0.9], [-2.2, 1.0], [-0.8, 1.5]];
const SPREADS = [1, 1.1, 1.2, 1.3, 1.4];
// A frame is chosen at the smallest spread that reaches. A wide set (six
// keys or more, an octave) takes the smallest spread where every finger is
// within this share of its reach, so it opens the hand instead of straining
// both outer fingers at a closed one.
const COMFORT = 0.6;
const WIDE_SPAN = 6;
// The drawn knuckle row opens with the spread (1.4 → 1.216, within the
// palm's 1.22 limit).
const FAN_PER_SPREAD = 0.54;
const HYST = 0.2;
const TRAIL_EXTRA = 0.4;
const REACH_FREE = 0.75;
const LEAN_MAX = 1.0;
const LEAN_SMOOTH = 0.4;
const V_QUICK = 60;
const V_CAP = 130;
const V_FINGER = 30;
const ARRIVE_MIN = 0.02;
const ARRIVE_EARLY_MAX = 1.0;
const LEAN_EARLY_MAX = 0.5;
const HOLD_REF = 0.5;
const DWELL_MIN = 0.02;
const SLIDE_MAX = 2.5;
const PASS_REACH = 4.5;
const PASS_IOI = 0.12;
const OVERLAP = 0.04;
const RELEASE_S = 0.08;
const CURL_S = 0.2;
const CURL_SWAP = 0.1;
const CURL_HOLD_IF_NEXT_WITHIN = 0.3;
const REPEAT_GAP = 0.08;
const SWAP_LEAD = 0.15;
const SWAP_WINDOW = 0.3;
// The planner's reach (keys): the knuckle spacing and the outer fingers'
// sideways reach it plans positions with (§4.2 ratio guard).
const PLAN_SPAN = 0.84;
const PLAN_LATERAL = [0, 0.95, 1.12, 1.25, 1.16, 0.96].map((r) => 1.26 * r);
const PREP_MAX = 1.0;
const NUMBER_FADE = 0.12;
const REST_IDLE = 1.0;
const REST_NEXT = 1.5;
const REST_RAMP = 0.8;
const LIFT_REST = 0.15;
const HOVER_WAIT = 0.3;
// Wait mode: a replay of the way to the chord covers at most this many
// seconds before it; then the waiting hand breathes (× v, period in s).
const REPLAY_MAX = 1.5;
const BREATH = 0.03;
const BREATH_PERIOD = 1.5;
const UNDER_RANGE = 0.9;
// A free pad never sits on a down thumb's pad: centres at least this far
// apart (× u), enough for two finger-number rings side by side.
const PAD_READ = 0.6;
// Two hands' thumbs keep at least this far apart (keys).
const THUMB_GAP = 1.0;

// Travel time for a palm move of d keys (seconds, any tempo).
const travelTime = (d) => clamp(0.08 + 0.085 * Math.log2(1 + Math.abs(d)), 0.12, 0.45);
const arrive = (ioi) => clamp(0.12 * ioi, 0.03, 0.15);
const strokeOf = (ioi) => clamp(ioi, 0.06, 0.25);
const hopTime = (d) => clamp(0.1 + 0.06 * Math.abs(d), 0.12, 0.32);
const rollStep = (d) => clamp(Math.abs(d) / 100, 0.04, 0.08);

// The clock a pose is planned in when the caller gives none: 0.5 s per beat
// (♩ = 120), so beat-based fixtures keep their meaning.
export const DEFAULT_CLOCK = Object.freeze({
  key: "default",
  speed: 1,
  toSeconds: (beat) => beat * 0.5,
  toBeat: (seconds) => seconds / 0.5,
});

// ---- positions ------------------------------------------------------------------
const keyId = (k) => `${k.midi}@${k.end}`;
function contactOf(k, dir, step) {
  const x = keyCentre(k.midi);
  return {
    finger: k.finger,
    midi: k.midi,
    x,
    X: x * dir,
    black: isBlack(k.midi),
    struck: k.struck,
    endBeat: k.end,
    id: keyId(k),
    step,
    eng: null,
    pedal: false,
    rolled: false,
  };
}
// A contact's reach inside a set: a thumb beyond a finger is tucked under, a
// finger below the thumb trails it.
function devFor(c, set) {
  if (c.finger === 1)
    return set.some((k) => k.finger > 1 && k.X < c.X - EPS) ? PIN_DEV[1] : DEV[1];
  const thumb = set.find((k) => k.finger === 1);
  return thumb && thumb.X > c.X + EPS ? PIN_DEV[c.finger] : DEV[c.finger];
}
function reachInterval(contacts, s, extra, scale) {
  let lo = -Infinity,
    hi = Infinity;
  for (const c of contacts) {
    const dev = devFor(c, contacts);
    lo = Math.max(lo, c.X - SLOT[c.finger] * s - dev[1] * scale - extra);
    hi = Math.min(hi, c.X - SLOT[c.finger] * s - dev[0] * scale + extra);
  }
  if (scale === 1) {
    // The ratio guard (§4.2): the outer fingers' sideways reach. A finger 2
    // or 5 reaches at most this far sideways from its knuckle, and the
    // knuckle row cannot open beyond ROW_MAX; the thumb reaches about 4.9
    // keys from the palm's centre at most. (The planner's own reach, in
    // keys: it decides where positions break, so it stays fixed while the
    // drawing's build changes; the drawing reaches at least this far.)
    const fan = 1 + FAN_PER_SPREAD * (s - 1);
    const room = Math.max(0, (ROW_MAX - fan) * 3.1 * PLAN_SPAN);
    for (const c of contacts) {
      if (c.finger === 5) lo = Math.max(lo, c.X - (ROOT[5] * PLAN_SPAN * fan + room + PLAN_LATERAL[5]));
      else if (c.finger === 2) hi = Math.min(hi, c.X + (-ROOT[2] * PLAN_SPAN * fan + room + PLAN_LATERAL[2]));
      else if (c.finger === 1) hi = Math.min(hi, c.X + 1.1 * PLAN_SPAN * fan + THUMB_REACH);
    }
  }
  return [lo, hi];
}
// The palm frames that reach every contact: the centre C of the feasible
// interval [lo, hi] at the chosen spread, or null when no spread reaches.
function fitFrame(contacts, hyst = 0) {
  let first = null;
  let min = Infinity,
    max = -Infinity;
  for (const c of contacts) {
    min = Math.min(min, c.X);
    max = Math.max(max, c.X);
  }
  const wide = max - min >= WIDE_SPAN;
  let best = null,
    bestStrain = Infinity;
  for (const s of SPREADS) {
    const [lo, hi] = reachInterval(contacts, s, hyst, 1);
    if (lo > hi + EPS) continue;
    const fit = { C: (lo + hi) / 2, lo, hi, spread: s };
    if (!first) first = fit;
    if (!wide) return fit;
    const [a, b] = reachInterval(contacts, s, 0, COMFORT);
    if (a <= b + EPS) return fit;
    // No comfortable spread yet: remember the one that strains the fingers
    // least (largest share of any finger's reach used at the frame's centre).
    let strain = 0;
    for (const c of contacts) {
      const dev = c.X - (fit.C + SLOT[c.finger] * s);
      const lim = devFor(c, contacts)[dev < 0 ? 0 : 1];
      strain = Math.max(strain, lim ? dev / lim : 0);
    }
    if (strain < bestStrain - 1e-9) {
      best = fit;
      bestStrain = strain;
    }
  }
  return best || first;
}
// Least travel inside the central 40 % of the feasible interval.
const settle = (prevC, fit) => {
  const m = 0.3 * (fit.hi - fit.lo);
  return clamp(prevC, fit.lo + m, fit.hi - m);
};
// Fingering's crossing rule: a struck thumb beyond a previously struck
// finger 2–5 (under), or a finger 2–5 struck below the previous thumb (over).
function crossingPair(prev, step, dir) {
  const ps = prev.keys.filter((k) => k.struck),
    ss = step.keys.filter((k) => k.struck);
  for (const a of ps)
    for (const b of ss) {
      const pa = keyCentre(a.midi) * dir,
        pb = keyCentre(b.midi) * dir;
      if (b.finger === 1 && a.finger > 1 && pb > pa + EPS)
        return { kind: "under", reach: pb - pa, crossed: a, crosser: b };
      if (a.finger === 1 && b.finger > 1 && pb < pa - EPS)
        return { kind: "over", reach: pa - pb, crossed: a, crosser: b };
    }
  return null;
}
function segment(steps, dir) {
  const positions = [];
  const stepPos = new Array(steps.length);
  const stepContacts = new Array(steps.length);
  const crossings = new Array(steps.length).fill(null);
  const released = new Set();
  let run = null,
    union = [];
  for (let i = 0; i < steps.length; i++) {
    const contacts = steps[i].keys
      .filter((k) => k.struck || !released.has(keyId(k)))
      .map((k) => contactOf(k, dir, i));
    stepContacts[i] = contacts;
    const cross = i > 0 ? crossingPair(steps[i - 1], steps[i], dir) : null;
    crossings[i] = cross;
    const fit = run && !cross ? fitFrame([...union, ...contacts], HYST) : null;
    if (fit) {
      run.i1 = i;
      run.lo = fit.lo;
      run.hi = fit.hi;
      run.spread = fit.spread;
      run.C = positions.length ? settle(positions.at(-1).C, fit) : fit.C;
      union.push(...contacts);
      stepPos[i] = run.index;
      continue;
    }
    if (run) {
      thumbHome(run, union);
      positions.push(run);
    }
    const prevC = run ? run.C : null;
    let keep = contacts.slice();
    const pedal = [],
      roll = [];
    let groups = null;
    const sk = keep.filter((c) => c.struck);
    const centroid = sk.length
      ? sk.reduce((s, c) => s + c.X, 0) / sk.length
      : keep[0].X;
    let f;
    while (!(f = fitFrame(keep))) {
      const held = keep
        .filter((c) => !c.struck)
        .sort((a, b) => Math.abs(b.X - centroid) - Math.abs(a.X - centroid));
      if (!held.length) {
        // Unrepresentable contacts were separated into key guidance before
        // segmentation. This is a defensive neutral frame, never a roll.
        f = fitFrame(sk.slice(0, 1));
        break;
      }
      held[0].pedal = true;
      pedal.push(held[0]);
      released.add(held[0].id);
      keep = keep.filter((c) => c !== held[0]);
    }
    run = {
      index: positions.length,
      i0: i,
      i1: i,
      C: prevC == null ? f.C : settle(prevC, f),
      lo: f.lo,
      hi: f.hi,
      spread: f.spread,
      cross,
      pedal,
      roll,
      groups,
      released: new Set(released),
    };
    stepPos[i] = run.index;
    union = keep.slice();
  }
  if (run) {
    thumbHome(run, union);
    positions.push(run);
  }
  return { positions, stepPos, stepContacts, crossings };
}

// A thumb held or struck far out from its slot draws the position toward
// it: the frame moves toward the thumb as far as every other contact of the
// position stays within its reach (the position's strict frame, no
// hysteresis), so the thumb plays near its own place instead of reaching
// out of a frame centred elsewhere (in C position the thumb sits on C and 2
// over D; the far finger of an extended position reaches, and the in-
// position lean carries the hand to it). A position the thumb does not
// play, or plays from inside its slot, keeps its frame.
const THUMB_HOME = 0.12;
// (A position moves at most this far (keys), and only for a thumb that
// reaches out by at most THUMB_HOME_FAR: a thumb farther out — an octave, a
// wide chord — is met step by step instead, by the in-position lean while it
// plays, so a hand hovering ahead of its next position never drifts into
// the other hand's keys.)
const THUMB_HOME_MAX = 0.35;
const THUMB_HOME_FAR = 1.0;
// (Per step, the hand leans toward such a thumb by at most this much, keys.)
const THUMB_LEAN_MAX = 1.5;
function thumbHome(run, contacts) {
  if (run.groups) return;
  const s = run.spread;
  let dmin = Infinity;
  for (const c of contacts) if (c.finger === 1 && !c.pedal) dmin = Math.min(dmin, c.X - (run.C + SLOT[1] * s));
  if (!(dmin < -THUMB_HOME) || dmin < -THUMB_HOME_FAR) return;
  const [lo, hi] = reachInterval(contacts, s, 0, 1);
  if (!(lo <= hi + EPS)) return;
  const C = Math.min(run.C, Math.max(run.C + dmin + THUMB_HOME, lo, run.C - THUMB_HOME_MAX));
  if (C < run.C - 1e-9) {
    run.homeFrom = run.C;
    run.C = C;
  }
}
// A move into or out of a position drawn toward its thumb must stay the move
// it was: one of another kind (a pass, lean, slide or leap that would become
// another), one that would be capped or forced, or one that would cut a
// note noticeably shorter (more than a twentieth of the time between the two
// chords) keeps the position's own frame (the motion and timing a passage
// had are never traded for a shorter thumb).
const worsePlan = (was, now) =>
  was.kind !== now.kind ||
  (!was.forced && now.forced) ||
  (!was.capped && now.capped) ||
  now.steal > was.steal + Math.max(0.006, 0.05 * was.ioi);
function settleThumbHomes(m) {
  const moved = m.positions.filter((p) => p.homeFrom != null);
  if (!moved.length) return;
  const planAll = () => m.positions.slice(0, -1).map((_, k) => planBoundary(m, k));
  const swap = () => {
    for (const p of moved) [p.C, p.homeFrom] = [p.homeFrom, p.C];
  };
  swap();
  const was = planAll();
  swap();
  // (Each pass only gives frames back, so this ends.)
  for (let pass = 0; pass <= moved.length; pass++) {
    let undone = false;
    m.positions.forEach((p, k) => {
      if (p.homeFrom == null) return;
      if ([k - 1, k].some((j) => j >= 0 && j < m.plans.length && worsePlan(was[j], m.plans[j]))) {
        p.C = p.homeFrom;
        p.homeFrom = null;
        undone = true;
      }
    });
    if (!undone) break;
    m.plans = planAll();
  }
}

// A position opened for a wide chord or reach closes again while the phrase
// around a step does not need it (§4.2 plan-level centring): per step, the
// smallest spread at which the position's own centre still reaches every
// key of the steps from PHRASE_BACK before to PHRASE_AHEAD after it (the
// position's strict reach, no hysteresis). A position entered by a pass or
// a lean over held keys starts at its full spread (the move was planned
// with it); the far keys of the phrase open the hand again in time.
const PHRASE_BACK = 0.5;
const PHRASE_AHEAD = 1.2;
function localSpreads(m) {
  const out = m.positions.length ? new Array(m.steps.length).fill(1) : [];
  m.positions.forEach((run, k) => {
    for (let i = run.i0; i <= run.i1; i++) out[i] = run.spread;
    if (!(run.spread > 1) || run.groups) return;
    const entry = k > 0 ? m.plans[k - 1].kind : null;
    const keep = (c) => !c.pedal && !(c.rolled && run.roll.includes(c));
    for (let i = run.i0; i <= run.i1; i++) {
      if (i === run.i0 && (entry === "CROSS" || entry === "LEAN")) continue;
      const window = [];
      for (let j = run.i0; j <= run.i1; j++) {
        const d = m.onset[j] - m.onset[i];
        if (d >= -PHRASE_BACK - 1e-9 && d <= PHRASE_AHEAD + 1e-9) for (const c of m.stepContacts[j]) if (keep(c)) window.push(c);
      }
      // (No closer than the phrase's own frame would open: a wide phrase
      // keeps the comfortable spread fitFrame gives it.)
      const own = fitFrame(window, 0);
      if (!own) continue;
      for (const sp of SPREADS) {
        if (sp >= run.spread - 1e-9) break;
        if (sp < own.spread - 1e-9) continue;
        const [lo, hi] = reachInterval(window, sp, 0, 1);
        if (lo <= run.C + EPS && run.C <= hi + EPS) {
          out[i] = sp;
          break;
        }
      }
    }
  });
  return out;
}

// The forearm rocks toward a reaching finger, smoothed over neighbouring
// steps so a tremolo does not rock per note (§4.2.1).
function leanTargets(m) {
  const out = new Array(m.steps.length).fill(0);
  for (const run of m.positions) {
    const raw = [];
    for (let i = run.i0; i <= run.i1; i++) {
      let num = 0,
        den = 0;
      const spread = m.spreadLocal[i];
      for (const c of m.stepContacts[i]) {
        if (c.pedal || (c.rolled && run.roll.includes(c))) continue;
        const dev = c.X - (run.C + SLOT[c.finger] * spread);
        const excess = Math.sign(dev) * Math.max(0, Math.abs(dev) - REACH_FREE);
        const w = c.struck ? 1 : 0.5;
        num += w * excess;
        den += w;
      }
      let lean = den ? clamp(num / den, -LEAN_MAX, LEAN_MAX) : 0;
      // A thumb on a key far outside its slot draws the hand toward it, as
      // far as the step's other contacts still reach (§4.2 plan-level
      // centring, per step: the octave in a frame centred for a wider
      // passage), so the thumb plays from beside the hand.
      const keep = (c) => !c.pedal && !(c.rolled && run.roll.includes(c));
      const live = m.stepContacts[i].filter(keep);
      let dmin = Infinity;
      for (const c of live) if (c.finger === 1) dmin = Math.min(dmin, c.X - (run.C + SLOT[1] * spread));
      if (dmin < -THUMB_HOME) {
        // (The hand leans as the step comes, while the keys of the step
        // before are still down to it: those reach too.)
        const before = i > run.i0 ? m.stepContacts[i - 1].filter((c) => keep(c) && m.clock.toSeconds(c.endBeat) >= m.onset[i] - 1e-6 && !live.some((k) => k.finger === c.finger)) : [];
        const [lo] = reachInterval([...live, ...before], spread, 0, 1);
        // (Not for a quick thumb note in a quick passage, where the hand
        // stays and the thumb reaches: fully from 0.45 s between notes or
        // of the thumb's own hold, none from 0.25 s down.)
        let hold = 0;
        for (const c of live) if (c.finger === 1) hold = Math.max(hold, m.clock.toSeconds(c.endBeat) - m.onset[i]);
        const gap = Math.max(hold, Math.min(i > 0 ? m.onset[i] - m.onset[i - 1] : Infinity, i + 1 < m.onset.length ? m.onset[i + 1] - m.onset[i] : Infinity));
        const want = Math.max(dmin + THUMB_HOME, lo - run.C, -THUMB_LEAN_MAX) * ease01((gap - 0.25) / 0.2);
        if (want < lean) lean = want;
      }
      raw.push({ t: m.onset[i], v: lean });
    }
    raw.forEach((x, j) => {
      let num = 0,
        den = 0;
      for (const y of raw) {
        const w = Math.max(0, 1 - Math.abs(y.t - x.t) / LEAN_SMOOTH);
        num += w * y.v;
        den += w;
      }
      out[run.i0 + j] = den ? num / den : 0;
    });
  }
  return out;
}

// Black keys bring the knuckle row toward the fallboard, per position.
function forwardOf(m, run) {
  let black = 0,
    sum = 0;
  for (let i = run.i0; i <= run.i1; i++)
    for (const c of m.stepContacts[i]) {
      if (c.pedal) continue;
      const w = c.struck ? 1 : 0.5;
      sum += w;
      if (c.black) black += w * (c.finger === 1 ? 1.5 : 1);
    }
  return sum ? clamp(black / sum, 0, 1) : 0;
}

// ---- moves between positions (§4.3) ------------------------------------------------
function planBoundary(m, k) {
  const A = m.positions[k],
    B = m.positions[k + 1];
  const lastI = A.i1,
    firstI = B.i0;
  const onsetA = m.onset[lastI],
    onsetB = m.onset[firstI],
    ioi = onsetB - onsetA;
  const h = arrive(ioi);
  const second = firstI + 1 < m.steps.length ? m.onset[firstI + 1] : null;
  const nextDeadline = second != null ? second - arrive(second - onsetB) : Infinity;
  const pedalIds = new Set(B.pedal.map((c) => c.id));
  const rollIds = new Set(B.roll.map((c) => c.id));
  const firstC = m.stepContacts[firstI];
  const carried = new Set(firstC.filter((c) => !c.struck && !c.pedal).map((c) => c.midi));
  const pins = m.stepContacts[lastI].filter(
    (c) =>
      !carried.has(c.midi) &&
      !pedalIds.has(c.id) &&
      !B.released.has(c.id) &&
      !A.released.has(c.id),
  );
  const strikers = firstC.filter((c) => c.struck && !rollIds.has(c.id));
  const entryC = B.groups ? B.groupC[0] : B.C;
  const d = entryC - A.C;
  const cross =
    B.cross && B.cross.reach <= PASS_REACH + EPS && ioi >= PASS_IOI - EPS ? B.cross : null;
  let earliest = Math.max(onsetA, A.rollEnd ?? -Infinity) + DWELL_MIN;
  for (const c of B.pedal) {
    const s = c.eng.onsetVis;
    earliest = Math.max(earliest, s + Math.max(0.03, 0.35 * (onsetB - s)));
  }
  const latest = onsetB - h;
  // A finger needed at the next attack still owns its whole written hold.
  const effEnd = new Map(pins.map(p => [p, p.eng.end]));
  const holding = pins.filter((p) => !strikers.some((q) => q.finger === p.finger));
  const pinEnd = pins.length ? Math.max(...pins.map((p) => effEnd.get(p))) : -Infinity;
  const holdEnd = holding.length ? Math.max(...holding.map((p) => p.eng.end)) : -Infinity;
  const plan = {
    k,
    kind: "TRAVEL",
    onsetA,
    onsetB,
    ioi,
    d,
    from: A.C,
    to: B.C,
    segs: [],
    tDepart: onsetB,
    tArrive: onsetB,
    hover: 0,
    steal: 0,
    forced: false,
    capped: false,
    releases: new Map(),
    pins,
  };
  const reachOK = (C, table, extra = 0) =>
    strikers.every((s) => {
      const dv = table[s.finger];
      const v = s.X - (C + SLOT[s.finger] * B.spread);
      return v >= dv[0] - extra - EPS && v <= dv[1] + extra + EPS;
    });
  const twoPhase = (kind, Clim) => {
    const d1 = Clim - A.C;
    // A finger still down on a key of A that strikes again in B (it hops to
    // its next key) holds the hand until it lets go: the lean waits for it
    // when it would carry that key beyond its finger's reach (P6: a little
    // finger left behind a lean piles the free fingers into its way).
    let start = earliest;
    for (const p of pins) {
      if (holding.includes(p)) continue;
      const dv = (kind === "CROSS" ? PIN_DEV : DEV)[p.finger];
      const extra = kind === "CROSS" ? 0 : TRAIL_EXTRA;
      const dev = p.X - (Clim + SLOT[p.finger] * B.spread);
      if (dev < dv[0] - extra - EPS || dev > dv[1] + extra + EPS)
        start = Math.max(start, effEnd.get(p));
    }
    const dur1 = Math.max(Math.abs(d1) / V_CAP, Math.min(travelTime(d1), latest - start));
    const tArrive = Math.max(start + dur1, Math.min(latest, onsetB - LEAN_EARLY_MAX));
    const tDepart = tArrive - dur1;
    const tRel = Math.max(holdEnd + OVERLAP, tArrive + 0.001);
    const d2 = B.C - Clim;
    const dur2 = Math.max(0.06, Math.min(travelTime(d2), nextDeadline - tRel));
    Object.assign(plan, { kind, tDepart, tArrive, hover: onsetB - tArrive, Clim, tRel, dur2 });
    // A lean squeezed between fast notes runs at the cap: say so.
    if (dur1 < Math.abs(d1) / V_QUICK - EPS) plan.capped = true;
    plan.segs.push({ t0: tDepart, t1: tArrive, C1: Clim, amp: 0 });
    if (Math.abs(d2) > 1e-9) plan.segs.push({ t0: tRel, t1: tRel + dur2, C1: B.C, amp: 0 });
    return plan;
  };
  const pinLimits = (table, extra) => {
    let lo = -Infinity,
      hi = Infinity;
    for (const p of holding) {
      const dv = table[p.finger];
      lo = Math.max(lo, p.X - SLOT[p.finger] * B.spread - dv[1] - extra);
      hi = Math.min(hi, p.X - SLOT[p.finger] * B.spread - dv[0] + extra);
    }
    return [lo, hi];
  };
  const done = (p) => {
    // Keys B cannot hold go to the pedal as the hand departs for B.
    for (const c of B.pedal) plan.releases.set(c.eng, { t: p.tDepart, kind: "pedal", pedal: true });
    return p;
  };
  if (!B.groups && cross && holding.length && holdEnd >= onsetB - EPS) {
    const [lo, hi] = pinLimits(PIN_DEV, 0);
    let Clim = clamp(B.C, lo, hi);
    if (!reachOK(Clim, OVER_DEV)) {
      // A wider pass (an arpeggio's 4 → 1 under a third): the held finger
      // trails as far as a finger crossing over the thumb may reach, the
      // striker lands within its reach plus the hysteresis a position
      // allows (the lint's G9 measures the same), and the palm leans only
      // as far as the striker needs — still a pass, not a leap.
      const [plo, phi] = pinLimits(OVER_DEV, 0);
      let slo = -Infinity,
        shi = Infinity;
      for (const q of strikers) {
        const dv = OVER_DEV[q.finger];
        slo = Math.max(slo, q.X - SLOT[q.finger] * B.spread - dv[1] - HYST);
        shi = Math.min(shi, q.X - SLOT[q.finger] * B.spread - dv[0] + HYST);
      }
      const a = Math.max(plo, slo),
        b = Math.min(phi, shi);
      Clim = a <= b ? clamp(A.C, a, b) : NaN;
    }
    if (Number.isFinite(Clim) && Math.abs(Clim - A.C) > 1e-9) {
      plan.crosser = cross.crosser;
      plan.crossKind = cross.kind;
      return done(twoPhase("CROSS", Clim));
    }
  }
  // A slide carries held keys along only as far as their fingers reach.
  const slideHolds = () => {
    const dur = travelTime(d);
    const t0 = onsetB - dur / 2;
    for (const p of holding) {
      const tr = Math.max(t0, Math.min(p.eng.end + OVERLAP, onsetB + dur / 2));
      const C = A.C + d * pathEase((tr - t0) / dur);
      const [lo, hi] = reachInterval([p], A.spread, TRAIL_EXTRA, 1);
      if (C < lo - EPS || C > hi + EPS) return false;
    }
    return true;
  };
  const slide = !cross && Math.abs(d) <= SLIDE_MAX + EPS && slideHolds();
  if (slide) {
    const dur = travelTime(d);
    Object.assign(plan, {
      kind: "SLIDE",
      tDepart: onsetB - dur / 2,
      tArrive: onsetB + dur / 2,
      hover: 0,
    });
    plan.segs.push({ t0: plan.tDepart, t1: plan.tArrive, C1: entryC, amp: 0 });
    return done(plan);
  }
  if (!B.groups && !cross && holding.length && holdEnd >= onsetB - EPS) {
    const [lo, hi] = pinLimits(DEV, TRAIL_EXTRA);
    // (pinLimits is the DEV reach; the drawn reach bounds it too.)
    const Clim = clamp(B.C, lo, hi);
    if (reachOK(Clim, DEV) && Math.abs(Clim - A.C) > 1e-9) return done(twoPhase("LEAN", Clim));
  }
  // TRAVEL: everything else, including crossings that are leaps or too fast
  // for a pass.
  const Tn = travelTime(d);
  const amp = Math.min(1, 0.25 + Math.abs(d) / 8);
  const pedalCase = (B.pedal.length > 0 || B.roll.length > 0) && !pins.length;
  if (pedalCase) {
    // Leave a sounding key to the pedal as late as natural speed allows.
    const floor = Math.max(earliest, onsetA + Math.max(0.03, 0.35 * ioi));
    let dur = Tn,
      hover = h,
      tDepart = latest - Tn;
    if (tDepart < floor) {
      const avail = latest - floor;
      dur = Math.max(Math.abs(d) / V_CAP, Math.min(Tn, Math.max(avail, Math.abs(d) / V_QUICK)));
      plan.capped = dur <= Math.abs(d) / V_QUICK + EPS;
      tDepart = latest - dur;
      if (tDepart < floor) {
        tDepart = floor;
        dur = Math.max(onsetB - tDepart, 1e-3);
        hover = 0;
        plan.forced = dur < Math.abs(d) / V_CAP - EPS;
      }
    }
    Object.assign(plan, { kind: "TRAVEL", tDepart, tArrive: tDepart + dur, hover: onsetB - (tDepart + dur), amp });
    plan.segs.push({ t0: tDepart, t1: tDepart + dur, C1: entryC, amp });
    return done(plan);
  }
  const tFree = pins.length ? Math.min(pinEnd, onsetB) : Math.max(onsetA, earliest - DWELL_MIN);
  const freeTime = latest - tFree;
  if (freeTime >= Tn) {
    const tArrive = clamp(onsetB - ARRIVE_EARLY_MAX, tFree + Tn, latest);
    const tDepart = tArrive - Tn;
    for (const p of pins)
      if (p.eng.end > tDepart + EPS) plan.releases.set(p.eng, { t: tDepart, kind: "travel" });
    Object.assign(plan, { kind: "TRAVEL", tDepart, tArrive, hover: onsetB - tArrive, amp });
    plan.segs.push({ t0: tDepart, t1: tArrive, C1: entryC, amp });
    return done(plan);
  }
  // Not enough free time: reduce hover and compress the movement, never the
  // written contact. An impossible deadline is reported instead of stolen.
  let deficit = Tn - freeTime;
  const take = (amount) => {
    const a = Math.min(deficit, Math.max(0, amount));
    deficit -= a;
    return a;
  };
  let dur = Tn,
    steal = 0;
  take(h - ARRIVE_MIN);
  const hold = tFree - onsetA;
  {
    const share = 0.5 * Math.min(1, HOLD_REF / Math.max(hold, 1e-3));
    dur -= take(Math.min(deficit * share + 1e-12, Tn - Math.abs(d) / V_QUICK));
  }
  dur -= take(dur - Math.abs(d) / V_QUICK);
  {
    const c = take(dur - Math.abs(d) / V_CAP);
    dur -= c;
    if (c > 0) plan.capped = true;
  }
  if (deficit > EPS) {
    const windowLeft = onsetB - tFree;
    if (windowLeft < dur - EPS) {
      dur = Math.max(windowLeft, Math.abs(d) / V_CAP, 1e-3);
      plan.forced = true;
    }
  }
  const tDepart = tFree;
  const tArrive = tDepart + dur;
  for (const p of pins) {
    const t = Math.max(onsetA + DWELL_MIN, Math.min(p.eng.end, tDepart));
    if (p.eng.end > t + EPS) plan.releases.set(p.eng, { t, kind: "travel" });
  }
  Object.assign(plan, {
    kind: "TRAVEL",
    tDepart,
    tArrive,
    hover: onsetB - tArrive,
    steal,
    amp,
  });
  plan.segs.push({ t0: tDepart, t1: tArrive, C1: entryC, amp });
  return done(plan);
}

// ---- a track of values blended over windows (lean, spread, forward) ------------------
// transitions: [{ a, b, v }] in time order; before the first, `v0`.
function makeTrack(v0, transitions) {
  const a = [],
    b = [],
    v = [],
    s = [];
  let prevA = -Infinity,
    prevB = -Infinity,
    prevV = v0,
    prevS = v0;
  for (const tr of transitions) {
    const ta = Math.max(tr.a, prevA);
    const tb = Math.max(tr.b, ta + 1e-3);
    // The value at this transition's start, if the previous one is unfinished.
    const start = ta < prevB ? lerp(prevS, prevV, ease01((ta - prevA) / (prevB - prevA))) : prevV;
    a.push(ta);
    b.push(tb);
    v.push(tr.v);
    s.push(start);
    prevA = ta;
    prevB = tb;
    prevV = tr.v;
    prevS = start;
  }
  return { v0, a, b, v, s };
}
function trackAt(tr, t) {
  let lo = 0,
    hi = tr.a.length - 1,
    j = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (tr.a[mid] <= t) {
      j = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (j < 0) return [tr.v0, 0];
  if (t >= tr.b[j]) return [tr.v[j], 0];
  const span = tr.b[j] - tr.a[j];
  const x = (t - tr.a[j]) / span;
  return [lerp(tr.s[j], tr.v[j], ease(x)), ((tr.v[j] - tr.s[j]) * easeV(x)) / span];
}

// ---- the palm path: one C¹ curve through every plan (§4.3 buildPath) -----------------
const evalSeg = (seg, t) => {
  const D = seg.t1o - seg.t0;
  const s = clamp((t - seg.t0) / D, 0, 1);
  const delta = seg.C1 - seg.Cs;
  let C, v;
  if (seg.v0 === 0) {
    C = seg.Cs + delta * pathEase(s);
    v = (delta / D) * pathEaseV(s);
  } else {
    const s2 = s * s,
      s3 = s2 * s;
    C = seg.Cs + seg.v0 * D * (s - 2 * s2 + s3) + delta * (3 * s2 - 2 * s3);
    v = seg.v0 * (1 - 4 * s + 3 * s2) + (delta / D) * (6 * s - 6 * s2);
  }
  const k = Math.min(1, s / 0.3);
  const lift = lerp(seg.Lcut, seg.amp * Math.sin(Math.PI * s), k);
  const ride = lerp(seg.Rcut, Math.sin(Math.PI * s), k);
  return { C, v, s, lift, ride };
};
function buildPath(m) {
  const raw = [];
  for (const plan of m.plans) for (const seg of plan.segs) raw.push({ ...seg, plan });
  // Roll sweeps between the frames of a chord's groups.
  for (const pos of m.positions)
    if (pos.groups)
      for (let g = 1; g < pos.groups.length; g++)
        raw.push({ t0: pos.rollAt[g - 1], t1: pos.rollAt[g], C1: pos.groupC[g], amp: 0, roll: true, plan: null });
  raw.sort((p, q) => p.t0 - q.t0);
  const segs = [];
  let C = m.C0;
  for (const r of raw) {
    if (!(r.t1 > r.t0 + 1e-4)) r.t1 = r.t0 + 1e-3;
    // A later plan that departs before an earlier one has started is the
    // earlier one's successor: the earlier segment is superseded.
    while (segs.length && segs.at(-1).t0 >= r.t0 - 1e-9) segs.pop();
    let Cs = C,
      v0 = 0,
      Lcut = 0,
      Rcut = 0;
    const prev = segs.at(-1);
    if (prev) {
      if (r.t0 < prev.t1o) {
        // Truncate the earlier segment here and start with its velocity.
        const at = evalSeg(prev, r.t0);
        prev.t1 = r.t0;
        Cs = at.C;
        Lcut = at.lift;
        Rcut = at.ride;
        const delta = r.C1 - Cs;
        const vmax = (2 * delta) / (r.t1 - r.t0);
        v0 = delta >= 0 ? clamp(at.v, 0, vmax) : clamp(at.v, vmax, 0);
        if (Math.abs(v0) < 1e-9) v0 = 0;
      } else Cs = prev.C1;
    }
    segs.push({ ...r, Cs, v0, Lcut, Rcut, t1o: r.t1 });
    C = r.C1;
  }
  m.segs = segs;
  m.evalSeg = evalSeg;
}
function segIndex(segs, t) {
  let lo = 0,
    hi = segs.length - 1,
    j = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (segs[mid].t0 <= t) {
      j = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return j;
}

// ---- the model: everything that depends only on (steps, clock, hand) ----------------
const models = new WeakMap();
function modelFor(steps, clock, hand) {
  let byKey = models.get(steps);
  if (!byKey) models.set(steps, (byKey = new Map()));
  const key = `${clock.key}|${hand}`;
  let m = byKey.get(key);
  if (!m) byKey.set(key, (m = buildModel(steps, clock, hand)));
  return m;
}
// Index of the last of `times` at or before t (-1 before the first).
function lastAtOrBefore(times, t) {
  let lo = 0,
    hi = times.length - 1,
    j = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] <= t + 1e-9) {
      j = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return j;
}

function guidanceIntervalAt(m, t) {
  const interval = m.guidanceIntervals[lastAtOrBefore(m.guidanceStarts, t)];
  return interval && t < interval.end ? interval : null;
}

// A neighbouring hand's influence reaches zero before it becomes hidden,
// then returns smoothly. Sampling transport time keeps seek results exact.
function collisionVisibility(m, t) {
  const i = lastAtOrBefore(m.guidanceStarts, t);
  const previous = m.guidanceIntervals[i], next = m.guidanceIntervals[i + 1];
  if (previous && t < previous.end) return 0;
  const after = previous ? ease01((t - previous.end) / 0.12) : 1;
  const before = next ? ease01((next.start - t) / 0.12) : 1;
  return Math.min(after, before);
}

function buildModel(steps, clock, hand) {
  const dir = hand === "left" ? -1 : 1;
  const m = { steps, clock, hand, dir };
  // Keep the score's complete contact timeline separate from the skeleton's
  // safe internal anchors. A fallback anchor is never displayed or labelled as
  // a suggested finger. This leaves the audio and written onsets untouched.
  m.guidanceIntervals = [];
  m.contacts = steps.flatMap((s) => s.keys.filter(k => k.struck).map(k => ({
    ...k, beat: s.beat, onset: clock.toSeconds(s.beat), end: clock.toSeconds(k.end),
  })));
  steps = steps.map((s, i) => {
    const contacts = s.keys.map(k => contactOf(k, dir, i));
    const assigned = s.keys.every(k => Number.isInteger(k.finger) && k.finger >= 1 && k.finger <= 5);
    const distinct = new Set(s.keys.map(k => k.finger)).size === s.keys.length;
    const longs = contacts.filter(k => k.finger > 1);
    const ordered = longs.every(a => longs.every(b => a.finger >= b.finger || a.X < b.X + EPS));
    const reason = s.keys.length > 5 ? "More than five simultaneous keys"
      : !assigned ? "Fingering unavailable for this chord"
      : !distinct ? "This fingering needs one finger on two keys"
      : !ordered ? "This fingering crosses held fingers"
      : !fitFrame(contacts) ? "This span exceeds the hand model" : null;
    if (!reason) return s;
    m.guidanceIntervals.push({ start: clock.toSeconds(s.beat) - PREP_MAX, end: Math.max(...s.keys.map(k => clock.toSeconds(k.end))), reason });
    const anchor = s.keys.find(k => k.struck) || s.keys[0];
    return { ...s, keys: [{ ...anchor, finger: Number.isInteger(anchor.finger) && anchor.finger >= 1 && anchor.finger <= 5 ? anchor.finger : 3 }] };
  });
  m.onset = steps.map((s) => clock.toSeconds(s.beat));
  Object.assign(m, segment(steps, dir));
  // Engagements: one per struck key, extended by the steps that hold it.
  const engs = [];
  const byFinger = [[], [], [], [], [], []];
  const current = new Map();
  m.stepContacts.forEach((contacts, i) => {
    for (const c of contacts) {
      if (c.struck) {
        const e = {
          finger: c.finger,
          midi: c.midi,
          x: c.x,
          X: c.X,
          black: c.black,
          i,
          lastStep: i,
          pos: m.stepPos[i],
          onset: m.onset[i],
          onsetVis: m.onset[i],
          end: clock.toSeconds(c.endBeat),
          endBeat: c.endBeat,
          beat: steps[i].beat,
          id: c.id,
          release: Infinity,
          releaseKind: "end",
          pedal: false,
          swap: false,
          rolled: c.rolled,
          rollAt: null,
          dev: 0,
          hop: null,
          staccato: false,
        };
        engs.push(e);
        byFinger[c.finger].push(e);
        current.set(c.finger, e);
        c.eng = e;
      } else {
        const e = current.get(c.finger);
        if (e && e.midi === c.midi) {
          e.lastStep = i;
          c.eng = e;
        }
      }
    }
  });
  // Contacts that could not be matched (should not happen) get a stand-in.
  for (const contacts of m.stepContacts)
    for (const c of contacts)
      if (!c.eng)
        c.eng = { finger: c.finger, midi: c.midi, X: c.X, onset: -Infinity, onsetVis: -Infinity, end: clock.toSeconds(c.endBeat), release: -Infinity };
  m.engs = engs;
  m.byFinger = byFinger;
  // Rolled chords: the bass group lands on the beat, each later group a
  // little after the one before, the palm sweeping between their frames.
  for (const pos of m.positions) {
    pos.forward = forwardOf(m, pos);
    if (!pos.groups) continue;
    pos.groupC = pos.groups.map((g, j) =>
      j === pos.groups.length - 1 ? pos.C : (fitFrame(g) || { C: pos.C }).C,
    );
    pos.rollAt = [m.onset[pos.i0]];
    for (let g = 1; g < pos.groups.length; g++)
      pos.rollAt.push(pos.rollAt[g - 1] + rollStep(pos.groupC[g] - pos.groupC[g - 1]));
    pos.rollEnd = pos.rollAt.at(-1);
    pos.groups.forEach((g, j) => {
      for (const c of g) {
        c.eng.rollAt = pos.rollAt[j];
        c.eng.onsetVis = pos.rollAt[j];
        if (j < pos.groups.length - 1) c.eng.rollRelease = pos.rollAt[j + 1];
      }
    });
  }
  // How far in each engagement plays a white key: its position's share.
  for (const e of engs) e.inward = e.finger === 1 || e.black ? 0 : m.positions[e.pos]?.forward || 0;
  m.C0 = m.positions.length
    ? m.positions[0].groups
      ? m.positions[0].groupC[0]
      : m.positions[0].C
    : 0;
  m.plans = [];
  for (let k = 0; k + 1 < m.positions.length; k++) m.plans.push(planBoundary(m, k));
  settleThumbHomes(m);
  m.C0 = m.positions.length ? (m.positions[0].groups ? m.positions[0].groupC[0] : m.positions[0].C) : 0;
  // Each plan's window (departure to final arrival) and the position it leads to.
  for (const plan of m.plans) {
    plan.w0 = Math.min(...plan.segs.map((s) => s.t0));
    plan.w1 = Math.max(...plan.segs.map((s) => s.t1));
    const B = m.positions[plan.k + 1];
    if (B.groups) plan.w1 = Math.max(plan.w1, B.rollEnd);
  }
  buildPath(m);
  // Lean, spread and forward between steps and positions.
  m.spreadLocal = localSpreads(m);
  m.lean = leanTargets(m);
  const leanTr = [];
  for (let j = 1; j < steps.length; j++) {
    const pa = m.stepPos[j - 1],
      pb = m.stepPos[j];
    if (pa === pb) {
      const W = Math.max(0.15, 0.3 * Math.min(m.onset[j] - m.onset[j - 1], 1));
      leanTr.push({ a: m.onset[j] - W, b: m.onset[j], v: m.lean[j] });
    } else {
      // Across a move the lean changes over the whole approach.
      const plan = m.plans[pb - 1];
      leanTr.push({ a: plan.w0, b: Math.max(plan.w1, plan.onsetB, plan.w0 + 0.01), v: m.lean[j] });
    }
  }
  m.leanTrack = makeTrack(m.lean[0] || 0, leanTr);
  const posTr = (value) =>
    makeTrack(
      m.positions.length ? value(m.positions[0]) : 1,
      m.plans.map((plan) => ({ a: plan.w0, b: Math.max(plan.w1, plan.w0 + 0.01), v: value(m.positions[plan.k + 1]) })),
    );
  // The spread: between positions over the move, inside one as the phrase
  // opens or closes the hand (over the stroke window before the step).
  {
    const tr = [];
    for (let j = 1; j < steps.length; j++) {
      const pa = m.stepPos[j - 1],
        pb = m.stepPos[j];
      if (pa !== pb) {
        const plan = m.plans[pb - 1];
        tr.push({ a: plan.w0, b: Math.max(plan.w1, plan.w0 + 0.01), v: m.spreadLocal[j] });
      } else if (Math.abs(m.spreadLocal[j] - m.spreadLocal[j - 1]) > 1e-9) {
        const W = Math.max(0.25, 0.4 * Math.min(m.onset[j] - m.onset[j - 1], 1));
        tr.push({ a: m.onset[j] - W, b: m.onset[j], v: m.spreadLocal[j] });
      }
    }
    m.spreadTrack = makeTrack(m.spreadLocal.length ? m.spreadLocal[0] : 1, tr);
  }
  m.forwardTrack = posTr((p) => p.forward);
  // How far each position was drawn toward its thumb (keys, hand space): a
  // hand crowded by the other gives it back (geometry()).
  m.homeTrack = posTr((p) => (p.homeFrom != null ? p.C - p.homeFrom : 0));
  // A rolled chord's lower group stays down only while the sweep to the
  // next group keeps it within its finger's reach: no hand holds a bass a
  // dozen keys below the chord it rolls into (the pedal ring keeps the
  // sound). Released at the reach limit, the finger lifts from where a
  // hand can be, never from a stretched spoke.
  for (const pos of m.positions) {
    if (!pos.groups) continue;
    for (let g = 0; g + 1 < pos.groups.length; g++)
      for (const c of pos.groups[g]) {
        const e = c.eng;
        if (!e || e.rollRelease == null) continue;
        const lim = PIN_DEV[e.finger];
        const t0 = e.onsetVis + DWELL_MIN;
        let ok = t0;
        for (let t = t0; t < e.rollRelease; t += 0.002) {
          const j = segIndex(m.segs, t);
          const seg = j >= 0 ? m.segs[j] : null;
          const C = !seg ? m.C0 : t < seg.t1 ? m.evalSeg(seg, t).C : seg.C1;
          const dev = e.X - (C + trackAt(m.leanTrack, t)[0] + SLOT[e.finger] * trackAt(m.spreadTrack, t)[0]);
          if (dev < lim[0] - EPS || dev > lim[1] + EPS) break;
          ok = t;
        }
        if (ok + 0.002 < e.rollRelease) e.rollRelease = ok;
      }
  }
  // Releases: the written end, with optional reachable legato overlap.
  // The older movement rules may shorten only that synthetic overlap.
  const nextOnsetAfter = (t) => {
    const j = lastAtOrBefore(m.onset, t + 1e-6);
    return j + 1 < m.onset.length ? m.onset[j + 1] : Infinity;
  };
  const planRelease = new Map();
  for (const plan of m.plans) for (const [e, r] of plan.releases) planRelease.set(e, r);
  // A pass or lean may support a short legato overlap across positions.
  for (const plan of m.plans)
    if (plan.kind === "CROSS" || plan.kind === "LEAN") for (const p of plan.pins) p.eng.crossPin = true;
  const byKey = new Map();
  for (const e of engs) {
    if (!byKey.has(e.midi)) byKey.set(e.midi, []);
    const list = byKey.get(e.midi);
    e.keyIndex = list.length;
    list.push(e);
  }
  for (const f of [1, 2, 3, 4, 5]) byFinger[f].forEach((e, j) => (e.next = byFinger[f][j + 1] || null));
  for (const e of engs) {
    const ioi = nextOnsetAfter(e.onset) - e.onset;
    e.ioi = ioi;
    e.staccato = Number.isFinite(ioi) && e.end - e.onset < 0.6 * ioi;
    const floor = e.onsetVis + Math.max(DWELL_MIN, Number.isFinite(ioi) ? 0.35 * ioi : 0);
    let rel = e.end,
      kind = "end";
    // Legato: a key ending on the next attack is let go just after it.
    const j = lastAtOrBefore(m.onset, e.end + 1e-4);
    if (j > e.i && Math.abs(m.onset[j] - e.end) < 1e-4) {
      const needed = steps[j].keys.some((k) => k.struck && k.finger === e.finger);
      // Only when the hand can still hold it together with the new chord.
      const together = [
        ...m.stepContacts[j].filter((c) => !c.pedal && !(c.rolled && c.eng.rollRelease != null)),
        { finger: e.finger, X: e.X, black: e.black },
      ];
      // Synthetic legato must not leave a long finger pinned across another
      // long finger landing on the next chord. X already runs thumb-to-little
      // for either hand. This only declines the extra 40 ms, never shortens
      // a written hold.
      const longFingers = together.filter(c => c.finger > 1);
      const ordered = longFingers.every(a => longFingers.every(b =>
        a.finger >= b.finger || a.X <= b.X + EPS));
      // A white-key thumb can tuck in front of the crossing finger. A thumb
      // on a black key cannot use that extra depth, so a planned wrist pass
      // must not bypass the simultaneous-reach check (Appassionata bar 267).
      const thumb = together.find(c => c.finger === 1);
      // Once the incoming thumb has crossed the outgoing long finger, the
      // written release is enough. An optional tail adds crossed constraints
      // that the planar reach proxy can accept but the 3D hand cannot hold.
      // This only declines synthetic overlap; written overlaps stay intact.
      const crossingRoom = e.crossPin && e.finger !== 1 && (!thumb || !thumb.black);
      const thumbMustRelease = e.finger === 1 && together.some(c => c.finger > 1 && c.X < e.X - EPS);
      const longFingerMustRelease = e.finger > 1 && thumb?.struck && thumb.X > e.X + EPS;
      if (!needed && !thumbMustRelease && !longFingerMustRelease && ordered && (crossingRoom || fitFrame(together, HYST))) {
        rel = e.end + OVERLAP;
        kind = "overlap";
      }
    }
    const pr = planRelease.get(e);
    if (pr && pr.t < rel) {
      rel = pr.t;
      kind = pr.kind;
      e.pedal = !!pr.pedal;
    }
    if (e.rollRelease != null && e.rollRelease < rel) {
      rel = e.rollRelease;
      kind = "roll";
      e.pedal = true;
    }
    const n = e.next;
    if (n) {
      if (n.midi === e.midi) {
        const t = Math.max(floor, n.onsetVis - REPEAT_GAP);
        if (t < rel) {
          rel = t;
          kind = "repeat";
          e.pedal = false;
        }
      } else {
        const t = n.onsetVis - hopTime(Math.abs(n.x - e.x));
        if (t < rel) {
          rel = Math.max(t, floor);
          kind = "hop";
          e.pedal = false;
        }
      }
    }
    // The same key struck next by another finger: an exchange.
    const same = byKey.get(e.midi);
    const after = same[e.keyIndex + 1];
    if (after && after.finger !== e.finger && after.onsetVis - Math.min(rel, after.onsetVis) <= SWAP_WINDOW + EPS) {
      const t = Math.max(floor, after.onsetVis - SWAP_LEAD);
      if (t < rel) {
        rel = t;
        kind = "swap";
        e.swap = true;
        e.pedal = false;
      }
    }
    if (n) rel = Math.min(rel, n.onsetVis);
    if (after) rel = Math.min(rel, after.onsetVis);
    // A contiguous same-key reattack cannot include a lift without either
    // shortening the old note or delaying the new one. Keep contact and name
    // that limitation in diagnostics; do not hide an ordinary repeated note.
    if (n?.midi === e.midi && n.onsetVis - e.end < REPEAT_GAP - EPS)
      e.articulation = n.onsetVis <= e.end + EPS ? "continuous-contact" : "short-gap-repeat";
    // A later attack of this pitch transfers physical key ownership. The
    // earlier voice keeps its score end, but two fingers cannot own one key.
    e.contactEnd = Math.min(e.end, after?.onsetVis ?? Infinity);
    if (rel < e.contactEnd) {
      // Pedal/roll plans describe unrepresentable holds; retain all original
      // contacts as guidance rather than claiming an early physical release.
      if (kind === "travel" || kind === "pedal" || kind === "roll")
        m.guidanceIntervals.push({ start: rel, end: e.contactEnd,
          reason: "This move cannot preserve the held contact" });
      rel = e.contactEnd;
      kind = "end";
    }
    if (e.contactEnd < e.end && rel >= e.contactEnd) kind = "reattack";
    e.release = rel;
    e.releaseKind = kind;
    if (rel >= e.contactEnd - EPS) e.pedal = false;
  }
  // Written attacks remain authoritative. An incompatible physical deadline
  // gets a separate, bounded arrival instead of an early release, teleport,
  // or hidden hand. Ordinary available gaps still arrive at the written beat.
  for (const list of byFinger) {
    let previous = null;
    for (const e of list) {
      const entry = e.pos > 0 && e.i === m.positions[e.pos].i0 ? m.plans[e.pos - 1] : null;
      const palmArrival = entry?.kind === "TRAVEL" ? entry.tArrive : e.onsetVis;
      const fingerArrival = previous && previous.midi !== e.midi
        ? previous.release + 1.875 * Math.abs(e.x - previous.x) / V_CAP : e.onsetVis;
      e.contactAt = Math.max(e.onsetVis, palmArrival, fingerArrival, previous?.contactAt ?? -Infinity);
      if (e.contactAt >= e.contactEnd) e.articulation = "missed-contact";
      else {
        if (e.contactAt > e.onsetVis + EPS) e.articulation = "late-contact";
        previous = e;
      }
    }
  }
  // An arrival beyond the note's ownership window cannot become a later
  // physical event. Preserve its written-time key marker and diagnostics,
  // while subsequent fingers plan from the last representable contact.
  m.missedEngs = engs.filter(e => e.articulation === "missed-contact");
  for (let f = 1; f <= 5; f++) byFinger[f] = byFinger[f].filter(e => e.articulation !== "missed-contact");
  // A white key played further in keeps clear of a black key within a key
  // of it that another finger plays at the same time (or is landing on, or
  // has just let go of): their pads never meet (G6), so that white key is
  // played only a little further in.
  {
    const blacks = engs.filter((o) => o.black).sort((a, b) => a.onsetVis - b.onsetVis);
    const starts = blacks.map((o) => o.onsetVis);
    for (const e of engs) {
      if (e.finger === 1 || e.black || !(e.inward > IN_BESIDE_BLACK)) continue;
      const a0 = e.onsetVis - BESIDE_LEAD,
        a1 = e.release + BESIDE_TRAIL;
      for (let j = lastAtOrBefore(starts, a1 + BESIDE_LEAD); j >= 0; j--) {
        const o = blacks[j];
        if (o.onsetVis < a0 - 10) break;
        if (o.finger === e.finger || Math.abs(o.X - e.X) > 1 + EPS) continue;
        if (o.onsetVis - BESIDE_LEAD < a1 && o.release + BESIDE_TRAIL > a0) {
          e.inward = IN_BESIDE_BLACK;
          break;
        }
      }
    }
  }
  // Times a finger is down, merged: where the octave frame may relax.
  const spans = engs.map((e) => [e.onsetVis, e.release]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    const last = merged.at(-1);
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  m.downStart = merged.map((s) => s[0]);
  m.downEnd = merged.map((s) => s[1]);
  // Deviations at the visual onsets, against the palm actually there.
  for (const e of engs) {
    const p = palmAt(m, e.contactAt);
    e.dev = e.X - (p.C + p.lean + SLOT[e.finger] * p.spreadEff);
  }
  for (const e of engs) {
    const p = palmAt(m, e.release);
    e.devRelease = e.X - (p.C + p.lean + SLOT[e.finger] * p.spreadEff);
    // A hidden fallback anchor is not a real held fingertip. When guidance
    // ends, its retiring finger must rejoin the reachable resting frame.
    if (m.guidanceIntervals.some(iv => iv.start <= e.release && iv.end >= e.release - EPS))
      e.devRelease = clamp(e.devRelease, ...DEV[e.finger]);
  }
  // Aim and preparation for every engagement (§4.4).
  for (const f of [1, 2, 3, 4, 5]) {
    const list = byFinger[f];
    list.forEach((n, j) => {
      const e = j > 0 ? list[j - 1] : null;
      const prevAttack = n.i > 0 ? m.onset[n.i - 1] : -Infinity;
      const ioiPrev = n.onset - prevAttack;
      n.ioiPrev = ioiPrev;
      const stroke = strokeOf(ioiPrev);
      const cross = m.crossings[n.i];
      const crosses = cross && cross.crosser.finger === f && cross.crosser.midi === n.midi;
      n.hop =
        e && e.midi !== n.midi
          ? {
              d: Math.abs(n.x - e.x),
              over: !!(crosses && cross.kind === "over"),
              under: !!(crosses && cross.kind === "under"),
            }
          : null;
      // (A finger crossing over the thumb, from another key or from its
      // slot, arcs over it.)
      n.over = !!(crosses && cross.kind === "over");
      const reach = n.hop ? Math.max(stroke, hopTime(n.hop.d)) : stroke;
      n.aimStart = Math.min(
        n.contactAt - 0.005,
        Math.max(n.contactAt - reach, e ? e.release : -Infinity),
      );
      // A finger never reaches across a neighbour that is holding a key
      // between its old key and its new one: it sets off as that finger
      // lets go (fingers 2–5 do not cross).
      if (n.hop && e && f > 1)
        for (const g of [f - 1, f + 1]) {
          if (g < 2 || g > 5) continue;
          for (const o of byFinger[g]) {
            if (o.onsetVis > n.aimStart || o.release <= n.aimStart || o.release >= n.onsetVis) continue;
            const lo = Math.min(e.X, n.X),
              hi = Math.max(e.X, n.X);
            if (o.X > lo + EPS && o.X < hi - EPS)
              n.aimStart = Math.min(n.onsetVis - 0.005, Math.max(n.aimStart, o.release));
          }
        }
      let prep;
      if (ioiPrev < 0.15) prep = Math.max(n.onset - 2 * ioiPrev, e ? e.release : -Infinity);
      else prep = Math.max(e ? e.release + RELEASE_S : -Infinity, n.onset - PREP_MAX, prevAttack);
      // Ready (with its cues) no later than the finger starts to move; in an
      // exchange on one key, not before the old finger has let go (one ring).
      n.prepStart = Math.min(prep, n.aimStart);
      const before = n.keyIndex > 0 ? byKey.get(n.midi)[n.keyIndex - 1] : null;
      if (before && before.swap && before.finger !== f) n.prepStart = Math.max(n.prepStart, Math.min(before.release, n.onsetVis));
      // Where the finger is, relative to its slot, as the aim begins.
      if (e) {
        const since = n.aimStart - e.release;
        const relaxCurl = ease01((since - 0.03) / (e.swap ? CURL_SWAP : CURL_S));
        n.devStart = e.devRelease * (1 - relaxCurl);
        n.blackStart = e.black ? 1 - relaxCurl : 0;
        n.inStart = (e.inward || 0) * (1 - ease01(since / RELEASE_S));
      } else {
        n.devStart = 0;
        n.blackStart = 0;
        n.inStart = 0;
      }
      // Lift peak: a repeat barely lifts, a finger-over rises high, a hand
      // in flight carries its fingers up.
      const entering = n.i === m.positions[n.pos].i0 && n.pos > 0 && m.plans[n.pos - 1].amp > 0;
      const approach = n.pos > 0 ? m.plans[n.pos - 1] : null;
      n.lateApproach = entering && approach?.tArrive > n.onsetVis + EPS;
      n.peak =
        e && e.midi === n.midi
          ? 0.35
          : n.hop?.over
            ? 0.9
            : entering
              ? 0.85
              : 0.6 + 0.2 * clamp((0.15 - ioiPrev) / 0.1, 0, 1);
      // A finger moving to a new key spreads its reach over the whole aim
      // (the descent overlaps its slow end); an aim from the slot reaches in
      // the first 70 % and then descends.
      n.lateralShare = n.hop ? 1 : 0.7;
      // A hop faster than a finger can move on its own is flagged.
      const window = n.lateralShare * (n.contactAt - n.aimStart);
      const rel = window > 0 ? Math.abs(n.dev - n.devStart) / window : Infinity;
      const abs = n.hop && e ? n.hop.d / Math.max(1e-3, n.onsetVis - e.release) : 0;
      n.forcedFinger = n.contactAt > n.onsetVis + EPS || rel > V_FINGER || abs > V_FINGER;
    });
  }
  m.stepEnd = steps.map((s) => Math.max(...s.keys.map((k) => clock.toSeconds(k.end))));
  // Plans in departure order (their windows are searched per frame) and the
  // keys let go to the pedal, by release.
  m.planStart = m.plans.map((p) => p.w0);
  for (let k = 1; k < m.planStart.length; k++) m.planStart[k] = Math.max(m.planStart[k], m.planStart[k - 1]);
  m.pedalEngs = engs.filter((e) => e.pedal).sort((a, b) => a.release - b.release);
  const intervals = [];
  for (const iv of m.guidanceIntervals.sort((a, b) => a.start - b.start)) {
    const previous = intervals.at(-1);
    if (previous && iv.start <= previous.end + EPS) previous.end = Math.max(previous.end, iv.end);
    else intervals.push({ ...iv });
  }
  m.guidanceIntervals = intervals;
  m.guidanceStarts = intervals.map(iv => iv.start);
  return m;
}

// The palm at time t: its frame, path, lean and the plan it is in.
function palmAt(m, t) {
  let C = m.C0,
    v = 0,
    lift = 0,
    ride = 0,
    moving = false,
    tau = 0,
    flying = false,
    seg = null;
  const j = segIndex(m.segs, t);
  if (j >= 0) {
    seg = m.segs[j];
    if (t < seg.t1) {
      const at = m.evalSeg(seg, t);
      C = at.C;
      v = at.v;
      lift = at.lift;
      ride = at.ride;
      tau = at.s;
      moving = true;
      flying = seg.amp > 0;
    } else C = seg.C1;
  }
  const [lean, leanV] = trackAt(m.leanTrack, t);
  const [spread] = trackAt(m.spreadTrack, t);
  const [forward] = trackAt(m.forwardTrack, t);
  // An octave frame relaxes once nothing is down and nothing is due soon.
  let open = 1;
  const d = lastAtOrBefore(m.downStart, t);
  const down = d >= 0 && t < m.downEnd[d];
  if (!down) {
    const lastEnd = d >= 0 ? m.downEnd[d] : -Infinity;
    const k = lastAtOrBefore(m.onset, t - 1e-9);
    const toNext = k + 1 < m.onset.length ? m.onset[k + 1] - t : Infinity;
    open = Math.max(1 - ease01((t - lastEnd) / CURL_S), ease01((0.5 - toNext) / 0.2));
  }
  const spreadEff = 1 + (spread - 1) * open;
  return {
    C,
    v,
    lean,
    leanV,
    spread,
    spreadEff,
    forward,
    lift,
    ride,
    moving,
    tau,
    flying,
    seg,
    plan: seg && t < seg.t1 ? seg.plan : null,
  };
}

// ---- one hand at one moment (§4.4–4.9) -----------------------------------------------
function relaxAt(m, t, counting) {
  const i = lastAtOrBefore(m.onset, t);
  if (i < 0) {
    if (counting) return 0;
    return ease01((m.onset[0] - t - 3.0) / REST_RAMP);
  }
  const idle = t - m.stepEnd[i];
  const toNext = i + 1 < m.onset.length ? m.onset[i + 1] - t : Infinity;
  if (idle < 0) return 0;
  return ease01((idle - REST_IDLE) / REST_RAMP) * ease01((toNext - REST_NEXT) / REST_RAMP);
}
function lastEngagement(list, t) {
  let lo = 0,
    hi = list.length - 1,
    j = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid].contactAt <= t + 1e-9) {
      j = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return j;
}
const pedalAt = (pedals, beat) =>
  (pedals || []).some((p) => p && p.start <= beat + EPS && beat < (p.end ?? Infinity) - EPS);

function fingerAt(m, f, t, palm, ctx) {
  const list = m.byFinger[f];
  const j = lastEngagement(list, t);
  const e = j >= 0 ? list[j] : null;
  const n = list[j + 1] || null;
  const slotX = palm.C + palm.lean + SLOT[f] * palm.spreadEff;
  const out = {
    finger: f,
    X: slotX,
    state: "up",
    lift: 0,
    curl: 1,
    extend: 0,
    press: 0,
    number: 0,
    midi: null,
    black: 0,
    inward: 0,
    target: null,
    aimTau: 0,
    descent: 0,
    forcedFinger: false,
    releaseKind: null,
    rollAt: null,
    next: n,
    eng: e,
  };
  if (e && t < e.release) {
    out.X = e.X;
    out.state = "down";
    out.curl = 0;
    out.extend = 1;
    out.press = 1 - 0.3 * ease01((t - e.contactAt) / 0.06);
    out.number = 1;
    out.midi = e.midi;
    out.black = e.black ? 1 : 0;
    out.inward = e.inward || 0;
    out.forcedFinger = !!(n && n.onsetVis <= t + EPS && n.contactAt > t) ||
      (e.articulation === "late-contact" && t < e.contactAt + RELEASE_S);
    return out;
  }
  let since = Infinity;
  if (e) {
    since = t - e.release;
    out.since = since;
    const relaxCurl = ease01((since - 0.03) / (e.swap ? CURL_SWAP : CURL_S));
    const liftOff = ease01(since / RELEASE_S);
    const keepReady = n && n.onsetVis - e.release < CURL_HOLD_IF_NEXT_WITHIN;
    out.curl = keepReady ? 0.3 * relaxCurl : relaxCurl;
    const liftRel = e.swap ? 0.7 : e.staccato ? 0.8 : 0.5;
    out.lift = liftRel * liftOff * (1 - relaxCurl) + LIFT_REST * relaxCurl;
    out.X = slotX + e.devRelease * (1 - relaxCurl);
    // A finger needed again soon stays half ready instead of folding away.
    out.extend = 1 - (keepReady ? 0.3 : 1) * relaxCurl;
    out.black = e.black ? 1 - relaxCurl : 0;
    out.inward = (e.inward || 0) * (1 - liftOff);
    out.number = e.swap ? 0 : Math.max(0, 1 - since / NUMBER_FADE);
    if (t < e.end - EPS) out.releaseKind = e.releaseKind;
  } else {
    out.lift = LIFT_REST;
  }
  // Two hands close together fold their free fingers; a resting hand curls.
  // (A finger just let go folds in as it lifts, not at once.)
  const fold = (ctx.crowd || 0) * (e ? ease01(since / CURL_S) : 1);
  out.curl = Math.max(out.curl, fold);
  if (ctx.relax > 0) {
    out.curl += (1 - out.curl) * ctx.relax;
    out.lift = out.lift * (1 - ctx.relax) + LIFT_REST * ctx.relax;
  }
  if (n) {
    if (n.rollAt != null && n.rollAt > n.onset + EPS && t >= n.onset - EPS) out.rollAt = n.rollAt;
    if (t >= n.prepStart) {
      out.state = "ready";
      // (The ramp is never longer than the time left before the strike, so
      // the ring is full when the finger lands — review-2 fix 8.)
      let alpha = ease01((t - n.prepStart) / clamp(n.onsetVis - n.prepStart, 0.02, 0.15));
      if (ctx.ahead > 0 && ctx.beat != null) alpha = Math.min(alpha, clamp(1 - (n.beat - ctx.beat) / ctx.ahead, 0, 1));
      out.target = { X: n.X, midi: n.midi, black: n.black, inward: n.inward || 0, alpha };
      out.number = Math.max(out.number, alpha);
    }
    if (t >= n.aimStart) {
      const tau = clamp((t - n.aimStart) / (n.contactAt - n.aimStart), 0, 1);
      const lateral = ease01(tau / n.lateralShare);
      const descent = ease01((tau - 0.7) / 0.3);
      out.X = slotX + n.devStart + (n.dev - n.devStart) * lateral;
      out.lift = Math.max(out.lift * (1 - ease01(tau / 0.7)), n.peak * ease01(tau / 0.3)) * (1 - descent);
      out.extend = Math.max(out.extend, lateral);
      out.curl = Math.min(out.curl, 1 - lateral);
      out.black = lerp(n.blackStart, n.black ? 1 : 0, lateral);
      out.inward = lerp(n.inStart || 0, n.inward || 0, lateral);
      out.aimTau = tau;
      out.descent = descent;
      out.forcedFinger = n.forcedFinger;
      if (t >= n.onsetVis && t < n.contactAt) out.releaseKind = "late-contact";
      // A finger crossing over the thumb reaches over it, its pad passing on
      // the fallboard side of the thumb's (the thumb plays nearer the player).
      if (n.over) out.arc = Math.sin(Math.PI * lateral) * (1 - descent);
    }
  }
  // A crowded thumb tucks toward its own palm, out of the other hand's way.
  if (f === 1 && fold > 0) out.X += 0.9 * fold * (1 - ease01(out.aimTau / (n?.lateralShare || 0.7)));
  // Fingers ride the palm's flight a little raised.
  if (palm.ride > 0) {
    const gate = (e ? ease01(since / RELEASE_S) : 1) * (1 - out.descent);
    out.lift = Math.max(out.lift, 0.6 * palm.ride * gate);
  }
  // An impossible late palm arrival does not stretch a preparing finger to
  // its distant key. The footprint still names that key; the free pad waits
  // within reach while the bounded palm approach finishes after the onset.
  if (n?.lateApproach && out.state !== "down") {
    const [lo, hi] = DEV[f];
    out.X = slotX + clamp(out.X - slotX, lo, hi);
    out.forcedFinger = true;
  }
  return out;
}

// How much a finger is on its key, continuously: 1 while down, easing out
// over its lift-off and in over its descent (the larger of the two, so a
// finger striking again just after it let go is on its key as it lands).
const onKey = (f) =>
  f.state === "down" || f.exact
    ? 1
    : Math.max(
        f.since != null && f.since < RELEASE_S ? 1 - ease01(f.since / RELEASE_S) : 0,
        f.aimTau > 0 ? f.descent || 0 : 0,
      );

// The thumb passes beneath the hand: how far under the index and middle
// pads it is (0–1).
function underOf(fingers) {
  const thumb = fingers[0];
  // (An index beside a middle finger that is down sits on its thumb side,
  // where the drawing keeps it, whatever its own slot says.)
  const indexX = lerp(fingers[1].X, Math.min(fingers[1].X, fingers[2].X - 0.55), onKey(fingers[2]));
  const pad = Math.min(indexX, fingers[2].X);
  return clamp((thumb.X - (pad - UNDER_RANGE)) / UNDER_RANGE, 0, 1);
}

// A passing thumb is pulled toward the palm; it lands on its key as the
// stroke ends, and a thumb just let go tucks in as it lifts.
const tuckOf = (thumb, under) =>
  thumb.state === "down"
    ? 0
    : under * Math.min(1 - thumb.descent, thumb.since != null ? ease01(thumb.since / RELEASE_S) : 1);

function motionAt(m, now, opts, palm, ctx) {
  const t = m.clock.toSeconds(now);
  const fingers = [1, 2, 3, 4, 5].map((f) => fingerAt(m, f, t, palm, ctx));
  const under = underOf(fingers);
  fingers[0].under = under;
  fingers[0].tuck = tuckOf(fingers[0], under);
  for (const f of fingers.slice(1)) {
    f.under = 0;
    f.tuck = 0;
  }
  return fingers;
}

// The static picture of one step (reduced motion, §4.9).
function staticFingers(m, t) {
  let i = lastAtOrBefore(m.onset, t);
  const before = i < 0;
  if (before) i = 0;
  const pos = m.positions[m.stepPos[i]];
  const palm = {
    C: pos.C,
    lean: m.lean[i] || 0,
    spread: m.spreadLocal[i],
    spreadEff: m.spreadLocal[i],
    forward: pos.forward,
    lift: 0,
    ride: 0,
    v: 0,
    leanV: 0,
    moving: false,
    tau: 0,
    flying: false,
    plan: null,
  };
  const fingers = [1, 2, 3, 4, 5].map((f) => {
    const slotX = palm.C + palm.lean + SLOT[f] * palm.spread;
    const c = before ? null : m.stepContacts[i].find((k) => k.finger === f && !k.pedal && !(k.eng.rollRelease != null));
    const base = {
      finger: f,
      X: slotX,
      state: "up",
      lift: 0,
      curl: 1,
      extend: 0,
      press: 0,
      number: 0,
      midi: null,
      black: 0,
      inward: 0,
      target: null,
      aimTau: 0,
      descent: 0,
      under: 0,
      tuck: 0,
      forcedFinger: false,
      releaseKind: null,
      rollAt: null,
      eng: null,
    };
    if (!c) return base;
    const e = c.eng;
    return {
      ...base,
      X: c.X,
      exact: true,
      state: t >= e.onsetVis && t < e.release ? "down" : "up",
      curl: 0,
      extend: 1,
      number: t >= e.onsetVis && t < e.release ? 1 : 0,
      midi: c.midi,
      black: c.black ? 1 : 0,
      inward: e.inward || 0,
      releaseKind: t >= e.release && t < e.end ? e.releaseKind : null,
      eng: e,
    };
  });
  return { palm, fingers, step: i, position: pos.index };
}

// ---- pose geometry (§5.1) --------------------------------------------------------------
// The hand's build, in its own proportions: across the keys in white-key
// widths (u; a white key is about 23.5 mm, so a medium adult hand), in
// depth in depth units (v = min(u, 0.3·keysHeight), the keyboard's own
// foreshortening). A length in these proportions — `handLen`, used for the
// fingers and the thumb alike — is hypot(dx / u, dy / v): a finger pointing
// up the keys and the thumb lying across them are measured on one scale.
// Knuckle spacing (× u: index to little knuckle 2.6 keys apart, centre to
// centre, as on a medium adult hand; the palm reaches a finger's half width
// beyond them, about 3.5 keys — some 8 cm — across), how far each fingertip
// reaches beyond its knuckle with the finger curved to play (the middle
// finger longest, index ≈ ring, the little finger shortest; the thumb's
// visible MCP → pad shorter than the index), where the knuckles sit along
// their arch, and each finger's width at its root and at its tip (× u, for
// clearances).
const SPAN = 0.84;
const REACH = [0, 1.0, 1.3, 1.43, 1.34, 1.1];
const REST_REACH = [0, 0, 0.74, 0.8, 0.72, 0.72];
const ARCH = [0, 0, 0.14, 0, 0.09, 0.3];
const ROOT = [0, 0, -1.55, -0.52, 0.52, 1.55];
const WIDTH = [
  [0, 0],
  [0.78, 0.5],
  [0.61, 0.46],
  [0.63, 0.48],
  [0.59, 0.45],
  [0.51, 0.39],
];
const HANG = [0, 0, 0.16, 0.02, -0.1, -0.22];
// A free finger squeezed between two playing neighbours curls in to this
// much less of its resting reach.
const SQUEEZE_CURL = 0.4;
// The knuckle row sits this many depth units behind the white contacts, so a
// curved finger on a white key shows about 1.2–1.4 keys of its length and is
// well inside its reach (ratio 0.85–1.1).
const ROW_DEPTH = 1.22;
// The little finger, the shortest, plays on its curved tip near the front of
// a white key, this many depth units (at most 0.2·keysHeight) nearer the
// player than the long fingers, as the thumb does; on a black key 0.2 of it,
// so its pad stays on the black key's surface. Its knuckle, set back on the
// arch, then shows about a key of a curved finger (ratio ≈ 0.9), the
// shortest of the four, instead of a straight one stretched up the key.
const LITTLE_FRONT = 0.5;
// Black keys bring the knuckle row this many depth units toward the
// fallboard per position (its black-key share, §4.5.10).
const FORWARD = 0.9;
// ... and the long fingers and the little finger, moving in with the hand,
// play their white keys this much further in (× v × the position's share),
// between the black keys, so they keep their curve instead of folding up
// under a palm that moved past them. Per engagement (the share of the
// position the key is struck in), so a held contact never moves; the thumb
// keeps its own depth.
const WHITE_IN = 0.6;
// (Beside a black key another finger plays, a white key goes in at most this
// share, so the two pads keep apart; "beside" spans the neighbour's aim and
// its lift-off, s.)
const IN_BESIDE_BLACK = 0.2;
const BESIDE_LEAD = 0.3;
const BESIDE_TRAIL = 0.25;
// A finger's length (handLen) stays within this share of its reach.
const RATIO_MIN = 0.58;
const RATIO_MAX = 1.26;
// The knuckle row widens at most this much beyond its resting width.
const ROW_MAX = 1.218;
// The thumb's reach from the palm's centre at most (keys; the planner's).
const THUMB_REACH = 4.6;
// The thumb as a hand shows it from above: its metacarpal lies inside the
// palm, along the palm's thumb side (the thenar), from the CMC low in the
// palm to the MCP joint at the palm's edge beside the index knuckle; only
// the two phalanges (MCP → pad) show as the thumb, shorter than the index
// and angled out from it. All in the hand's proportions (keys across, v in
// depth). CMC: × w·fan toward the thumb from the hand's centre, × palmDepth
// below the knuckle row.
const THUMB_CMC = [0.56, 0.49];
// The MCP at rest: this far (keys) outside the index knuckle, × palmDepth
// below the knuckle row (on the palm's thumb-side edge, about level with
// the index knuckle).
const THUMB_MCP = [0.27, 0.08];
// The relaxed thumb (MCP → pad): its length and its angle from the palm's
// forward axis toward the thumb side (radians).
const THUMB_LEN = 1.12;
const THUMB_ANGLE = 0.66;
// The thumb's pivot: this far beyond the resting MCP on the relaxed thumb's
// line, low in the palm; and how much longer the visible thumb draws per key
// its pad reaches beyond the relaxed place (little: a reaching thumb opens
// the web and swings out, it does not grow).
const THUMB_PIVOT = 1.9;
const THUMB_STRAIGHTEN = 0.1;
// The visible thumb's length (MCP → pad): it bends and straightens within
// this band (soft limits; the hard band is G1's, 0.55–1.10 × THUMB_LEN_G1).
const THUMB_SHORT = 0.88;
const THUMB_LONG = 1.15;
const THUMB_HARD = [0.8, 1.21];
// A thumb on a black key plays bent, from a base the hand has brought in
// toward the fallboard: its visible length band shrinks by this share and
// its base (CMC and the MCP's resting place) comes in this many depth units
// (× its black-key share, continuous as it aims and lets go), so in a third
// or a chord over black keys it is no longer than the index beside it.
const THUMB_BLACK_FLEX = 0.15;
const THUMB_BLACK_IN = 0.3;
// The visible thumb's natural length for G1 (its band is 0.55–1.10 of it,
// never longer than the index's reach).
const THUMB_LEN_G1 = 1.15;
// The metacarpal (CMC → MCP) at most (soft, approaching the hard value; G1
// allows 1.1 × META_G1); beyond it the thumb's base slides out with the
// pad (the palm opens on its thumb side), by up to THUMB_SLIDE (keys).
const THUMB_META = 1.5;
const THUMB_META_HARD = 1.59;
const META_G1 = 1.45;
const THUMB_SLIDE = 4.5;
// The MCP stands outside the line from the CMC to the pad by at least this
// much (keys), or this share of the CMC–pad distance if more, so a reaching
// thumb keeps its knuckle: never a straight spoke.
const THUMB_KNUCKLE = 0.18;
const THUMB_KNUCKLE_PER = 0.075;
// A free thumb's pad keeps at least this far (× u) above the thumb's base
// as the motion knows it.
const THUMB_CLEAR = 0.7;
// A length in the hand's own proportions (px in, keys out).
const handLen = (dx, dy, u, v) => Math.hypot(dx / u, dy / v);
// The hand's build as checks read it (scripts/hand-lab-lint.mjs G1, tests):
// each finger's reach (knuckle → pad; [1] the thumb's MCP → pad) and the
// thumb's metacarpal, all in the hand's own proportions.
export const HAND_BUILD = Object.freeze({
  reach: Object.freeze([0, THUMB_LEN_G1, ...REACH.slice(2)]),
  metacarpal: META_G1,
  span: SPAN,
  // The little finger's white-key contact, this many depth units nearer the
  // player than the long fingers' (contactDepth).
  littleFront: LITTLE_FRONT,
  // A white key in a position with black keys is played this much further in
  // (× v × the finger's `inward`, its position's black-key share; fingers
  // 2–5).
  whiteIn: WHITE_IN,
});

// Where a finger's pad meets a key, in depth (px from the fallboard): the
// long fingers at 0.68·keysHeight on a white key and 0.53 on a black one;
// the thumb and the little finger nearer the player (their own depth on a
// white key; on a black key 0.3 of it for the thumb and 0.2 for the little
// finger, which keeps them on its surface and clear of a neighbour's pad).
// The same for every frame of an engagement, so a held contact never moves.
export function contactDepth(finger, black, { keyWidth: u, keysHeight: h }) {
  const v = Math.min(u, h * 0.3);
  const own = finger === 1 ? Math.min(0.45 * u, 0.2 * h) : finger === 5 ? Math.min(LITTLE_FRONT * v, 0.2 * h) : 0;
  return h * 0.68 + (h * 0.53 - h * 0.68) * black + own * (1 - (finger === 5 ? 0.8 : 0.7) * black);
}
// A thumb passing under the hand is drawn this far toward the palm (× v).
const TUCK = 0.5;
// A finger crossing over the thumb arcs this far toward the fallboard (× v).
const OVER_ARC = 0.55;

// A finger just let go is drawn in to its length over this long (s), so one
// released far from the hand (a rolled chord's bass) draws in, never jumps.
const FREE_PULL = 0.06;
const mfDown = (mf) => mf.state === "down" || !!mf.exact;

// How far a free pad dy behind a neighbour (negative: in front of it)
// moves back to be `want` behind it; continuous in dy and in want.
// Smooth too (no kink where the push starts or ends), so a pad drawn back
// past a neighbour eases into and out of the move instead of snapping: the
// pad's depth behind its neighbour, dy + backOff, rises from dy (in front
// by `want` or more) through `want` (level) to dy again (2·want behind).
const backOff = (dy, want) => {
  if (!(want > 0)) return 0;
  const x = dy / want;
  if (x <= -1 || x >= 2) return 0;
  if (x >= 0) return want * (1 - x / 2) ** 2;
  const s = x + 1;
  return want * (-3 * s ** 3 + 4 * s * s + s - 1 - x);
};

// x kept within [lo, hi]; beyond, it approaches the hard limit (loHard < lo,
// hiHard > hi) without reaching it. Smooth (C¹), so nothing driven by it jerks.
const softBand = (x, lo, hi, loHard, hiHard) =>
  x > hi
    ? hi + (hiHard - hi) * Math.tanh((x - hi) / (hiHard - hi))
    : x < lo
      ? lo - (lo - loHard) * Math.tanh((lo - x) / (lo - loHard))
      : x;
// A smooth max(x, floor): equal to x from floor + soft up, to floor from
// floor − soft down, a parabola between (C¹).
const softFloor = (x, floor, soft) =>
  x >= floor + soft ? x : x <= floor - soft ? floor : floor + (x - floor + soft) ** 2 / (4 * soft);

// The thumb's MCP joint for its pad `tip` (pose space, px), as a hand shows
// it from above: the metacarpal lies in the palm along its thumb side, from
// the CMC (`cmc`, low in the palm) to the MCP at the palm's edge beside the
// index knuckle (`index`), and only the phalanges (MCP → pad) show as the
// thumb, about as long as the index and angled out from it.
// A relaxed pad puts the MCP at its resting place; a pad reaching out draws
// it outward (the thumb abducts, the web opens) and a pad tucked under the
// palm draws it in. The visible thumb bends and straightens within its
// length band, and its knuckle stands outside the line from the CMC to the
// pad, so a reaching thumb is never one straight spoke. A pad beyond what
// the metacarpal reaches slides the thumb's base out with it (`cmc.x`,
// mutated: the palm opens on its thumb side). Every step is continuous in
// the pad, the knuckle row and the palm frame, so the joint never pops.
function thumbJoint(tip, cmc, index, { dir, u, v, knuckleY, palmDepth, flex = 1 }) {
  // Hand space in the hand's own proportions: X (keys) toward finger 5, Y
  // (depth units) toward the player; the thumb is measured on the fingers'
  // scale, so a thumb lying across the keys is no longer than one pointing
  // up them.
  const P = { X: (dir * tip.x) / u, Y: tip.y / v };
  const C0 = { X: (dir * cmc.x) / u, Y: cmc.y / v };
  const C = { ...C0 };
  // The MCP at rest, and the line a relaxed thumb lies along.
  const R = { X: (dir * index.x) / u - THUMB_MCP[0], Y: (knuckleY + THUMB_MCP[1] * palmDepth) / v };
  const sx = Math.sin(THUMB_ANGLE),
    sy = Math.cos(THUMB_ANGLE);
  // The thumb points at its pad from a pivot on that line beyond the MCP,
  // low in the palm where no pad ever goes: the MCP lies on the line from
  // the pad toward the pivot, a thumb's length from the pad. So it rests
  // where it should for a relaxed pad, follows a reaching pad outward (the
  // web opens) and a tucked one inward, the thumb's angle from the index
  // stays natural, and the joint is never undefined (a pad never reaches
  // the pivot).
  const O = { X: R.X + THUMB_PIVOT * sx, Y: R.Y + THUMB_PIVOT * sy };
  const aX = P.X - O.X,
    aY = P.Y - O.Y;
  const reach = Math.max(1e-6, Math.hypot(aX, aY));
  // (A little longer as the pad reaches farther from the pivot, as the
  // thumb straightens; within its band, so the joint is always a thumb's
  // length from the pad.)
  const len = softBand(
    flex * (THUMB_LEN + THUMB_STRAIGHTEN * (reach - THUMB_LEN - THUMB_PIVOT)),
    flex * THUMB_SHORT,
    flex * THUMB_LONG,
    flex * THUMB_HARD[0],
    flex * THUMB_HARD[1],
  );
  const M = { X: P.X - (len * aX) / reach, Y: P.Y - (len * aY) / reach };
  // The visible thumb (MCP → pad) within its length band.
  const fit = () => {
    let vx = P.X - M.X,
      vy = P.Y - M.Y;
    let L = Math.hypot(vx, vy);
    // (A pad on its own joint has no direction: the relaxed one is taken.)
    if (!(L > 1e-6)) {
      vx = -sx;
      vy = -sy;
      L = 1;
    }
    const k = softBand(L, flex * THUMB_SHORT, flex * THUMB_LONG, flex * THUMB_HARD[0], flex * THUMB_HARD[1]) / L;
    M.X = P.X - vx * k;
    M.Y = P.Y - vy * k;
  };
  // The knuckle outside the CMC–pad line (on the side away from the palm),
  // the farther the longer the reach. (Only for a pad well away from the
  // CMC: a thumb folded back over its base is no spoke, and there the line
  // has no direction.)
  const knuckle = () => {
    const dx = P.X - C.X,
      dy = P.Y - C.Y;
    const l = Math.hypot(dx, dy);
    const weight = ease01((l - 0.6) / 0.6);
    if (!(weight > 0)) return;
    const nX = dy / l,
      nY = -dx / l;
    const off = (M.X - C.X) * nX + (M.Y - C.Y) * nY;
    const want = Math.max(THUMB_KNUCKLE, THUMB_KNUCKLE_PER * l);
    const push = (softFloor(off, want, 0.12) - off) * weight;
    M.X += nX * push;
    M.Y += nY * push;
  };
  // The metacarpal within its length: the base slides out toward the MCP
  // (and in under the palm after a thumb tucked beneath it, where it lies
  // hidden; continuous through the middle, where it does not slide).
  const base = () => {
    let dy = M.Y - C0.Y;
    const L = Math.hypot(M.X - C0.X, dy);
    if (!(L > THUMB_META)) return;
    const target = softBand(L, 0, THUMB_META, 0, THUMB_META_HARD);
    // (An MCP brought far in toward the fallboard draws the base up the
    // palm's side with it, so the metacarpal never stretches in depth.)
    const up = Math.max(0, Math.abs(dy) - 0.97 * target);
    C.Y = C0.Y + Math.sign(dy) * up;
    dy = M.Y - C.Y;
    const reach = Math.sqrt(Math.max(0, target * target - dy * dy));
    const slide = softBand(Math.max(0, Math.abs(M.X - C0.X) - reach), 0, 0.8 * THUMB_SLIDE, 0, THUMB_SLIDE);
    C.X = C0.X + (M.X < C0.X ? -slide : slide);
  };
  fit();
  knuckle();
  fit();
  base();
  knuckle();
  fit();
  base();
  cmc.x = dir * C.X * u;
  cmc.y = C.Y * v;
  return { x: dir * M.X * u, y: M.Y * v };
}

// A free thumb rests beside the index, outside it, as a teacher wants it:
// never tucked behind an index that has moved toward the thumb's place (the
// index playing the key next to it, as in C position playing D with 2). It
// stands at least THUMB_BESIDE (keys) outside the index and middle pads, so
// it is not counted under the hand. It does not while its next key lies
// past the index (a thumb-under on its way) or just after it let go of one
// there, in a crowd, or while it is on its key; it hands over to its own
// aim as that begins, so it lands exactly. Eased in after a release and with
// each gate, and smooth (C¹) in the index's place, so the thumb never jumps.
// (Applied before two thumbs meeting between the hands are resolved, so
// the yield still keeps them apart.)
const THUMB_BESIDE = UNDER_RANGE + 0.05;
// (Over this long after a release (s), so a thumb let go under the hand
// relaxes out as it would, never darts out.)
const THUMB_BESIDE_IN = 0.4;
function thumbBeside(fingers, crowd) {
  const t = fingers[0];
  if (t.state === "down" || t.exact || !(t.under > 0)) return fingers;
  // The index pad as `under` measures it (underOf).
  const indexX = lerp(fingers[1].X, Math.min(fingers[1].X, fingers[2].X - 0.55), onKey(fingers[2]));
  const pad = Math.min(indexX, fingers[2].X);
  const past = (X) => ease01((X - (fingers[1].X - 0.65)) / 0.3);
  const passing = Math.max(
    t.next ? past(t.next.X) : 0,
    t.eng && t.since != null ? past(t.eng.X) * (1 - ease01(t.since / THUMB_BESIDE_IN)) : 0,
  );
  const gate =
    (1 - passing) *
    // (Only a thumb near the index's edge: one well under is meant to be.)
    (1 - ease01((t.under - 0.5) / 0.3)) *
    (t.since != null ? ease01(t.since / THUMB_BESIDE_IN) : 1) *
    (1 - (t.aimTau > 0 ? ease01(t.aimTau / (t.next?.lateralShare || 0.7)) : 0)) *
    (1 - ease01(crowd / 0.25));
  if (!(gate > 0)) return fingers;
  const limit = pad - THUMB_BESIDE;
  const X = lerp(t.X, -softFloor(-t.X, -limit, 0.1), gate);
  if (!(X < t.X)) return fingers;
  const under = clamp((X - (pad - UNDER_RANGE)) / UNDER_RANGE, 0, 1);
  const out = fingers.slice();
  out[0] = { ...t, X, under, tuck: (t.tuck || 0) * (under / t.under) };
  return out;
}

function geometry(m, motion, opts) {
  const { palm, fingers, crowd = 0, zTop = false, relax = 0 } = motion;
  const { keyWidth: u, keysHeight: h, bedHeight } = opts;
  const dir = m.dir;
  const w = SPAN * u;
  const v = Math.min(u, h * 0.3);
  const verticalSpan = SPAN * v;
  const yWhite = h * 0.68;
  const yBlack = h * 0.53;
  // The thumb plays nearer the player than the long fingers (its pad meets
  // the key's front third), and so does the little finger, on its curved
  // tip; on a black key a little, so they stay on its surface (§5.1
  // thumbDepth; contactDepth).
  // (In a position with black keys the hand moves in, and the long fingers
  // and the little finger play their white keys further in with it.)
  const keyY = (f, black, inward = 0) =>
    contactDepth(f, black, opts) - (f > 1 ? WHITE_IN * v * (inward || 0) * (1 - black) : 0);
  // (A hand drawn toward its thumb gives that back as the other hand comes
  // close: the two hands never meet for a shorter thumb.)
  let centre = (palm.C + palm.lean - (motion.home || 0) * crowd) * dir * u;
  const local = (X) => X * dir * u - centre;
  const spread = palm.spreadEff;
  const fan = Math.round((1 + FAN_PER_SPREAD * (spread - 1)) * 1e9) / 1e9;
  // A wide span (a ninth, a tenth) brings the thumb's base toward the keys,
  // so its chord shortens (FLATTEN; the knuckle row keeps its depth, so the
  // long fingers keep their curve).
  const flatten = 0.3 * v * clamp((spread - 1.2) / 0.2, 0, 1);
  // (The row stays behind the white contacts — behind them as far in as the
  // position's black keys bring them.)
  const knuckleY = clamp(
    yWhite +
      ROW_DEPTH * v -
      FORWARD * v * palm.forward +
      0.4 * v * (fan - 1) -
      0.15 * v * relax -
      0.3 * v * (motion.topRaise ?? crowd * (zTop ? 1 : 0)),
    h * 0.69 - WHITE_IN * v * palm.forward,
    Math.max(h * 0.69, bedHeight - v * 0.65),
  );
  const palmDepth = v * 1.78;
  const roll = motion.roll || 0;
  const wrist = { x: 0.1 * u * roll * dir, y: knuckleY + palmDepth + v * 0.12 };
  // Knuckles: the anatomical row, each following 60 % of its finger's reach.
  const slotOf = (f) => palm.C + palm.lean + SLOT[f] * spread;
  const follow = [0, 0, 0, 0, 0, 0];
  for (let f = 2; f <= 5; f++) {
    const m_ = fingers[f - 1];
    const dev = m_.X - slotOf(f);
    follow[f] = clamp(0.6 * dev * u, -0.9 * u, 0.9 * u) * m_.extend;
  }
  // The row stays within its anatomical width: outer follows give way.
  const base = (f) => ROOT[f] * w * fan;
  const limit = ROW_MAX * 3.1 * w;
  let width = base(5) + follow[5] - (base(2) + follow[2]);
  if (width > limit) {
    const out5 = Math.max(0, follow[5]),
      out2 = Math.max(0, -follow[2]);
    const total = out5 + out2;
    const cut = Math.min(width - limit, total);
    if (total > 0) {
      follow[5] -= (cut * out5) / total;
      follow[2] += (cut * out2) / total;
    }
  }
  const knuckles = [2, 3, 4, 5].map((f) => ({
    x: dir * (base(f) + follow[f]),
    y: knuckleY + ARCH[f] * verticalSpan + 0.06 * v * roll * (ROOT[f] / 1.55),
  }));
  // Keep the knuckles in order with room between them (hand space). A
  // knuckle following its trailing finger into its neighbour's place moves
  // that neighbour along (the knuckle of a free finger gives way most, the
  // index only as far as the row's width allows), so the row turns toward
  // the reaching fingers instead of bunching up behind them.
  {
    const minGap = 0.55 * w;
    const K = (i) => dir * knuckles[i].x;
    const setK = (i, X) => (knuckles[i].x = dir * X);
    const hold = [2, 3, 4, 5].map((f) => {
      const mf = fingers[f - 1];
      return mf.state === "down" || mf.exact ? 1 : clamp(mf.extend * (1 - mf.curl), 0, 1);
    });
    // ... and no gap opens wider than a quarter beyond its resting width:
    // a free neighbour comes along.
    const maxGap = (i) => 1.25 * (ROOT[i + 2] - ROOT[i + 1]) * w * fan;
    for (let pass = 0; pass < 3; pass++)
      for (const i of [1, 2, 3, 2, 1]) {
        // (Two held knuckles share the move; the share never jumps as a
        // finger's hold reaches 1.)
        const ga = 1 - hold[i - 1] + 0.02,
          gb = 1 - hold[i] + 0.02;
        const deficit = K(i - 1) + minGap - K(i);
        if (deficit > 0) {
          let moveA = (deficit * ga) / (ga + gb);
          if (i - 1 === 0) moveA = Math.min(moveA, Math.max(0, K(0) - (K(3) - limit)));
          setK(i - 1, K(i - 1) - moveA);
          setK(i, K(i) + deficit - moveA);
          continue;
        }
        const excess = K(i) - K(i - 1) - maxGap(i);
        if (excess > 0) {
          const moveA = (excess * ga) / (ga + gb);
          setK(i - 1, K(i - 1) + moveA);
          setK(i, K(i) - (excess - moveA));
        }
      }
    for (let i = 1; i < 4; i++) if (K(i) < K(i - 1) + minGap) setK(i, K(i - 1) + minGap);
  }
  // The whole hand leans toward an outer finger that reaches further than
  // its knuckle can follow within the row (the little finger at the edge of
  // an octave): the contacts stay exact, the palm shifts a little.
  {
    const rowW = ROW_MAX * 3.1 * w;
    const k2 = dir * knuckles[0].x,
      k5 = dir * knuckles[3].x;
    // (Signed: how far beyond its reach the finger is, px.)
    const reachOf = (f) => {
      const mf = fingers[f - 1];
      const weight = mf.state === "down" || mf.exact ? 1 : mf.extend * (1 - mf.curl);
      if (!(weight > 0)) return null;
      // (Sideways, in key widths: the hand's own proportions.)
      const reachX = 0.968 * RATIO_MAX * REACH[f] * u;
      const hx = (mf.X - (palm.C + palm.lean)) * u;
      const d =
        f === 5
          ? hx - k5 - reachX - Math.max(0, k2 + rowW - k5)
          : k2 - hx - reachX - Math.max(0, k2 - (k5 - rowW));
      return { weight, d };
    };
    const r5 = reachOf(5),
      r2 = reachOf(2);
    const over = (r) => (r ? r.weight * Math.max(0, r.d) : 0);
    const shift = clamp(over(r5) - over(r2), -u, u);
    centre += dir * shift;
  }
  // Fingertips.
  const tips = fingers.map((mf) => {
    const f = mf.finger;
    if (mf.state === "down" || mf.exact) return { x: local(mf.X), y: keyY(f, mf.black, mf.inward) };
    const play = { x: local(mf.X), y: keyY(f, mf.black, mf.inward) };
    let rest;
    // A free thumb relaxes in beside the index, a little back from the keys.
    // (Measured from its slot, so a thumb yielding to the other hand keeps
    // its yield.)
    if (f === 1)
      rest = {
        // (Nearer the index in a wide frame, whose slot lies far out.)
        x: play.x + (0.55 + 0.3 * clamp((spread - 1.1) / 0.3, 0, 1)) * (dir * (ROOT[2] * w * fan - 0.8 * u) - local(slotOf(1))),
        y: yWhite + u * 0.16 + 0.5 * v,
      };
    else {
      const k = knuckles[f - 2];
      const neighbourCurl = f === 5 ? v * 0.26 * fingers[3].extend * (1 - fingers[3].curl) : 0;
      // (A free finger with no room beside it — its neighbours on, or
      // landing on, keys less than two pads apart — curls in further, out
      // of their way.)
      let squeeze = 0;
      if (f === 3 || f === 4) {
        const a = fingers[f - 2],
          b = fingers[f];
        const held = (g) => (g.state === "down" || g.exact ? 1 : g.extend * (1 - g.curl));
        const room = dir * (b.X - a.X);
        squeeze = Math.min(held(a), held(b)) * ease01((1.3 - room) / 0.3);
      }
      const reach = REST_REACH[f] * (1 - SQUEEZE_CURL * squeeze);
      rest = { x: k.x + dir * HANG[f] * w, y: k.y - REACH[f] * v * reach + neighbourCurl };
    }
    const k = mf.extend * (1 - mf.curl);
    return {
      x: lerp(rest.x, play.x, k),
      y: lerp(rest.y, play.y, k) + 0.2 * v * mf.lift + TUCK * v * (mf.tuck || 0) - OVER_ARC * v * (mf.arc || 0),
    };
  });
  const fixed = fingers.map((mf) => (mf.state === "down" || mf.exact ? 1 : mf.extend * (1 - mf.curl)));
  // How freely a pad gives way in the order repair. A finger aiming past a
  // neighbour that is down gives way fully until it descends (it may not
  // reach across it), easing in after its own release so nothing jumps.
  const isDown = (i) => fingers[i].state === "down" || fingers[i].exact;
  const freeOf = (i, j) => {
    const mf = fingers[i];
    if (isDown(i)) return 0;
    const aim =
      mf.aimTau > 0 && isDown(j)
        ? (1 - (mf.descent || 0)) * (mf.since != null ? ease01(mf.since / RELEASE_S) : 1)
        : 0;
    return Math.max(1 - fixed[i], aim);
  };
  // Order repair (hand space): free pads give way outward from fixed ones so
  // the fingers never cross and keep a little room; the thumb counts too
  // unless it is passing under the hand.
  const under = fingers[0].under || 0;
  const gapX = 0.55 * u;
  const H = (i) => dir * tips[i].x;
  const setH = (i, X) => (tips[i].x = dir * X);
  // A thumb on its way under the hand is left out of the row.
  // (A thumb's key past the index pad, smoothly; as it aims there, while it
  // is down there, and fading as it leaves.)
  const t0 = fingers[0];
  const pastIndex = (X) => ease01((X - (fingers[1].X - 0.65)) / 0.3);
  const across = Math.max(
    t0.state === "down" ? pastIndex(t0.X) : 0,
    t0.state !== "down" && t0.eng && t0.since != null ? pastIndex(t0.eng.X) * (1 - ease01(t0.since / CURL_S)) : 0,
    t0.target && t0.aimTau > 0 ? pastIndex(t0.target.X) * ease01(t0.aimTau / 0.3) : 0,
  );
  // (Eased in `under`, so a thumb coming out from under the hand rejoins
  // the row without a dart at the moment it clears the index.)
  const thumbRow = (1 - under * under * (3 - 2 * under)) * (1 - across);
  // Pad clearance: a free pad near a fixed neighbour tucks toward the palm.
  const padClearance = () => {
  for (let i = 0; i < 5; i++) {
    if (fixed[i] >= 0.999) continue;
    for (let j = 0; j < 5; j++) {
      if (j === i) continue;
      // A thumb passing under the hand neither pushes nor is pushed.
      // (Eased, so the push comes on and goes off smoothly as one finger
      // extends and the other folds.)
      const lead = clamp((fixed[j] - fixed[i]) * 2, 0, 1);
      const weight = lead * lead * (3 - 2 * lead) * (i === 0 || j === 0 ? 1 - under : 1);
      if (!(weight > 0)) continue;
      const need = ((WIDTH[i + 1][1] + WIDTH[j + 1][1]) / 2 + 0.08) * u;
      const dx = Math.abs(tips[i].x - tips[j].x);
      if (dx >= 2 * need) continue;
      // Smooth in dx, and always enough for clearance (a free pad at least
      // 0.35 v behind, or apart by the pads' widths).
      const want = 0.4 * v * ease01((2 * need - dx) / (1.5 * need));
      tips[i].y += backOff(tips[i].y - tips[j].y, want) * weight;
    }
  }
  };
  for (let pass = 0; pass < 10; pass++)
    for (const i of [1, 2, 3, 4, 3, 2, 1]) {
      // (A thumb yielding to the other hand may come closer to its index.)
      const gap = i === 1 ? Math.max(0, gapX - (t0.yieldX || 0) * u) : gapX;
      const deficit = (H(i - 1) + gap - H(i)) * (i === 1 ? thumbRow : 1);
      if (!(deficit > 0)) continue;
      // The index anchors the thumb's place in the row; only the thumb gives.
      if (i === 1) {
        setH(0, H(0) - deficit * (1 - fixed[0]));
        continue;
      }
      // (A finger aiming at a key is free to give way until it descends: it
      // may not reach across a neighbour that is down.)
      const fa = freeOf(i - 1, i),
        fb = freeOf(i, i - 1);
      // (Two pads both nearly on their keys give way less and less, so the
      // repair fades out as they land instead of stopping at once.)
      const give = deficit * clamp((fa + fb) / 0.1, 0, 1);
      if (!(give > 0)) continue;
      const share = fb / (fa + fb);
      setH(i, H(i) + give * share);
      setH(i - 1, H(i - 1) - give * (1 - share));
    }
  // With no room for the margin (a free pad squeezed between a held finger
  // trailing a pass and a neighbour just let go), the free pad still never
  // crosses the held one; it folds back in depth instead (below).
  for (let i = 1; i < 4; i++) {
    const d = H(i + 1) - H(i) - 0.03 * u;
    if (d >= 0) continue;
    if (isDown(i) && !isDown(i + 1)) setH(i + 1, H(i + 1) - d * Math.min(1, 4 * freeOf(i + 1, i)));
    else if (isDown(i + 1) && !isDown(i)) setH(i, H(i) + d * Math.min(1, 4 * freeOf(i, i + 1)));
  }
  padClearance();
  // Two free pads squeezed together: the outer one folds back.
  for (let i = 2; i <= 4; i++) {
    const a = i - 1,
      b = i;
    // (A free outer pad beside one still on its key folds back too.)
    const free = Math.max(1 - Math.max(fixed[a], fixed[b]), (1 - fixed[b]) * fixed[a]);
    if (!(free > 0)) continue;
    const need = ((WIDTH[a + 1][1] + WIDTH[b + 1][1]) / 2 + 0.08) * u;
    const dx = Math.abs(tips[a].x - tips[b].x);
    if (dx >= 2 * need) continue;
    const want = 0.4 * v * ease01((2 * need - dx) / (1.5 * need));
    tips[b].y += backOff(tips[b].y - tips[a].y, want) * free;
  }
  // A thumb on its key plays at the key's front; a free finger beside or
  // over it (the index after a thumb-under, a finger crossing over the
  // thumb) hovers over the keys beyond it, toward the fallboard — never on
  // the thumb's pad, so both numbers stay readable. Eased with the thumb's
  // landing and lift-off and with the finger's own release and descent.
  {
    const thumbOn = onKey(fingers[0]);
    if (thumbOn > 0) {
      const R = PAD_READ * u;
      for (let i = 1; i < 5; i++) {
        if (isDown(i)) continue;
        const mf = fingers[i];
        // (A finger crossing over the thumb already arcs over it, and one
        // the moving hand carries past it rides over it, lifted: the bump
        // gives way to both, so a quick pass never jumps across it.)
        const w =
          thumbOn *
          (mf.since != null ? ease01(mf.since / RELEASE_S) : 1) *
          (mf.aimTau > 0 ? 1 - (mf.descent || 0) : 1) *
          (1 - (mf.arc || 0)) *
          (1 - ease01((Math.abs(palm.v || 0) - 10) / 20));
        if (!(w > 0)) continue;
        // (A smooth bump over |dx| < 1.3 R that clears the circle of radius
        // R everywhere, so a pad passing the thumb rises without a jerk;
        // the rise eases in from the bump's edge, so a pad coming in from
        // behind the thumb is drawn forward, never thrown.)
        const dx = Math.abs(tips[i].x - tips[0].x);
        if (dx >= 1.3 * R) continue;
        const want = tips[0].y - R * (1 - ease01((dx / R - 0.6) / 0.7));
        const edge = 1 - ease01((dx / R - 1) / 0.3);
        if (tips[i].y > want) tips[i].y -= (tips[i].y - want) * w * edge;
      }
    }
  }
  // Knuckles yield toward a stretched finger (and away from a cramped one),
  // so every finger stays within its anatomical length: first sideways
  // toward the pad (within the row's width, the row may narrow), then in
  // depth (the finger flattens).
  const rowW = ROW_MAX * 3.1 * w;
  const minGapK = 0.35 * w;
  const HK = (i) => dir * knuckles[i].x;
  const setHK = (i, X) => (knuckles[i].x = dir * X);
  // (Lengths in the hand's own proportions: across in u, in depth in v.)
  const fitDepth = (f, k, tip) => {
    const max = RATIO_MAX * REACH[f],
      min = RATIO_MIN * REACH[f];
    const dx = (tip.x - k.x) / u;
    const L = Math.hypot(dx, (k.y - tip.y) / v);
    if (L > max) k.y = tip.y + v * Math.sqrt(Math.max(0, max * max - dx * dx));
    else if (L < min && Math.abs(dx) < min) k.y = tip.y + v * Math.sqrt(min * min - dx * dx);
  };
  for (let f = 2; f <= 5; f++) {
    const i = f - 2,
      k = knuckles[i],
      tip = tips[f - 1];
    const reachX = Math.sqrt(1 - 0.25 * 0.25) * RATIO_MAX * REACH[f] * u;
    const dX = dir * (tip.x - k.x);
    if (Math.abs(dX) > reachX) {
      let room;
      if (dX > 0) room = f === 5 ? HK(0) + rowW - HK(3) : HK(i + 1) - minGapK - HK(i);
      else room = f === 2 ? HK(i) - (HK(3) - rowW) : HK(i) - (HK(i - 1) + minGapK);
      if (f === 5 && dX < 0) room = 1.5 * u;
      if (f === 2 && dX > 0) room = 1.5 * u;
      const move = Math.min(Math.abs(dX) - reachX, Math.max(0, room));
      setHK(i, HK(i) + Math.sign(dX) * move);
      // The row narrows behind a knuckle that moved inward.
      for (let j = i - 1; j >= 0; j--) if (HK(j) > HK(j + 1) - minGapK) setHK(j, HK(j + 1) - minGapK);
      for (let j = i + 1; j < 4; j++) if (HK(j) < HK(j - 1) + minGapK) setHK(j, HK(j - 1) + minGapK);
    }
  }
  // The row never ends wider than the palm allows.
  if (HK(3) - HK(0) > rowW) {
    const a = fixed[1],
      b = fixed[4];
    const excess = HK(3) - HK(0) - rowW;
    const share = a + b > 0 ? a / (a + b) : 0.5;
    setHK(3, HK(3) - excess * share);
    setHK(0, HK(0) + excess * (1 - share));
    for (let j = 1; j < 3; j++) setHK(j, clamp(HK(j), HK(0) + minGapK * j, HK(3) - minGapK * (3 - j)));
  }
  for (let f = 2; f <= 5; f++) fitDepth(f, knuckles[f - 2], tips[f - 1]);
  // A free finger never draws longer than it is: its pad comes in toward
  // its knuckle (contacts are exact and never move). The pull grows as the
  // finger lets go of its key (and fades as it lands on one), so a finger
  // released far from the hand draws in, never jumps in.
  for (let f = 2; f <= 5; f++) {
    const mf = fingers[f - 1];
    if (mfDown(mf) || fixed[f - 1] >= 0.999) continue;
    // (Fully, too, as soon as it aims at its next key.)
    const pull = mf.since != null ? Math.max(ease01(mf.since / FREE_PULL), ease01((mf.aimTau || 0) / 0.15)) : 1;
    if (!(pull > 0)) continue;
    const k = knuckles[f - 2],
      tip = tips[f - 1];
    const max = 0.995 * RATIO_MAX * REACH[f];
    const L = handLen(tip.x - k.x, tip.y - k.y, u, v);
    if (L > max) {
      const s = 1 - (1 - max / L) * pull;
      tip.x = k.x + (tip.x - k.x) * s;
      tip.y = k.y + (tip.y - k.y) * s;
    }
  }
  // The thumb (§5.1, as a hand shows it from above): the CMC low on the
  // palm's thumb side, the metacarpal inside the palm along that side, the
  // MCP at the palm's edge; the phalanges (MCP → pad) are the visible thumb.
  const tipT = tips[0];
  // (A thumb on a black key: bent, its MCP's resting place brought in; and
  // in a wide span the whole thumb chain comes toward the keys.)
  // (Not a thumb passing or held under the palm: it lies beneath the hand.)
  const thumbBlack = clamp(t0.black || 0, 0, 1) * (1 - under);
  const baseIn = THUMB_BLACK_IN * v * thumbBlack + flatten;
  const cmc = { x: -dir * THUMB_CMC[0] * w * fan, y: knuckleY - flatten + THUMB_CMC[1] * palmDepth };
  // A free thumb never draws longer than it is: a pad aiming at a key still
  // out of reach waits at full stretch (its footprint marks the key) until
  // the palm brings it there. A thumb on its key is exact and never moves.
  // (Fading in after a release and out over the final aim, so the pad
  // leaves and lands on its key without a jump.) The pad's reach is
  // measured from the thumb's base as the motion knows it, so the pads are
  // where they always were; only the drawn joints follow the palm.
  // (Where the motion's thumb base has always been — the knuckle row's
  // former depth — so the free pad's path is the motion's own; only the
  // drawn joints follow the bigger hand.)
  const reachFrom = { x: -dir * 1.1 * w * fan, y: knuckleY - flatten - (ROW_DEPTH - 0.88) * v + 0.55 * palmDepth };
  if (!(t0.state === "down" || t0.exact)) {
    const reach = 3.1 * u;
    const chord = Math.hypot(tipT.x - reachFrom.x, tipT.y - reachFrom.y);
    const weight =
      (t0.since != null ? ease01(t0.since / CURL_S) : 1) *
      (1 - (t0.aimTau > 0 ? ease01(t0.aimTau / (t0.next?.lateralShare || 0.7)) : 0));
    if (chord > reach && weight > 0) {
      const k = 1 - (1 - reach / chord) * weight;
      tipT.x = reachFrom.x + (tipT.x - reachFrom.x) * k;
      tipT.y = reachFrom.y + (tipT.y - reachFrom.y) * k;
    }
    // Nor does a free pad come down onto the thumb's base (a thumb tucked
    // under a hand far toward the fallboard): it passes above it. (A smooth
    // bump over the base, met smoothly.)
    if (weight > 0) {
      const dmin = THUMB_CLEAR * u,
        span = 1.2 * dmin;
      const dxc = (tipT.x - reachFrom.x) / span;
      if (Math.abs(dxc) < 1) {
        const floor = dmin * (1 - dxc * dxc) ** 2;
        const above = reachFrom.y - tipT.y;
        const k = 0.25 * dmin;
        const h = clamp(0.5 + (0.5 * (floor - above)) / k, 0, 1);
        const lifted = above + (floor - above) * h + k * h * (1 - h);
        tipT.y -= (lifted - above) * weight;
      }
    }
  }
  // (Bent on a black key only where it is not stretched: a thumb whose base
  // must already slide out to reach, an octave, keeps its full length, so
  // the palm does not open further for a shorter thumb.)
  const joint = { dir, u, v, knuckleY: knuckleY - baseIn, palmDepth };
  let flex = 1;
  if (thumbBlack > 0) {
    const probe = { ...cmc };
    thumbJoint(tipT, probe, knuckles[0], joint);
    const slide = Math.abs(probe.x - cmc.x) / u;
    flex = 1 - THUMB_BLACK_FLEX * thumbBlack * (1 - ease01((slide - 1.3) / 0.6));
  }
  const mcp = thumbJoint(tipT, cmc, knuckles[0], { ...joint, flex });
  const out = [];
  for (let f = 1; f <= 5; f++) {
    const mf = fingers[f - 1],
      tip = tips[f - 1];
    const landing =
      mf.target && !opts.reducedMotion
        ? {
            x: local(mf.target.X),
            y: keyY(f, mf.target.black ? 1 : 0, mf.target.inward),
            midi: mf.target.midi,
            alpha: mf.target.alpha,
          }
        : null;
    const [rootW, tipW] = WIDTH[f];
    const extra = {
      lift: mf.lift,
      press: mf.press,
      number: mf.number,
      under: f === 1 ? under : 0,
      // (How far in the finger plays a white key, for checks; its depth is in
      // the axis.)
      inward: mf.inward || 0,
    };
    if (mf.releaseKind) extra.releaseKind = mf.releaseKind;
    if (mf.rollAt != null) extra.rollAt = mf.rollAt;
    // How far a thumb gives way to the other hand's thumb (keys; for checks).
    if (mf.yieldX) extra.yield = mf.yieldX;
    if (f === 1) {
      out.push({
        finger: f,
        axis: [cmc, mcp, tip],
        widths: [rootW * u, rootW * u * 0.79, tipW * u],
        state: mf.state,
        landing,
        ...extra,
      });
    } else {
      const root = knuckles[f - 2];
      const dx = tip.x - root.x,
        dy = tip.y - root.y;
      const curl = 1 - fixed[f - 1];
      const bow = dir * (f - 3.2) * u * 0.032;
      const pip = {
        x: root.x + dx * 0.33 + bow,
        y: (root.y + dy * 0.61) * (1 - curl) + (tip.y - v * 0.12) * curl - 0.08 * v * mf.lift,
      };
      const dip = {
        x: root.x + dx * 0.8 + bow * 0.45,
        y: (root.y + dy * 0.91) * (1 - curl) + (tip.y - v * 0.05) * curl,
      };
      out.push({
        finger: f,
        axis: [root, pip, dip, tip],
        widths: [rootW * u, rootW * u * 0.94, tipW * u * 1.08, tipW * u],
        state: mf.state,
        landing,
        ...extra,
      });
    }
  }
  const [index, middle, ring, little] = knuckles;
  // How far the knuckle row as a whole has moved from its resting place
  // (hand space).
  const turn = [2, 3, 4, 5].reduce((sum, f, i) => sum + (dir * knuckles[i].x - ROOT[f] * w * fan) / 4, 0);
  const between = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2 + verticalSpan * 0.25,
  });
  // A little finger spread out sideways (an octave, a wide reach) leaves the
  // palm as a finger of its own: the palm's outer corner turns in under its
  // root and the cleft beside the ring finger deepens, so the palm's edge
  // stays convex and no web reaches up the little finger (0 for a finger
  // pointing up the keys or curled in, 1 lying across them; smooth in its
  // pad and knuckle).
  const spreadFive = (() => {
    const tip = tips[4];
    const dX = (dir * (tip.x - little.x)) / u,
      dY = (little.y - tip.y) / v;
    const reach = Math.hypot(dX, dY);
    const angle = Math.atan2(dX, Math.max(dY, 1e-6 - reach));
    return ease01((angle - 0.45) / 0.6) * ease01((reach - 0.4) / 0.4);
  })();
  // (The palm reaches a finger's half width beyond the outer knuckles: about
  // 3.5 keys across them at rest, the breadth of a medium adult hand.)
  const back = [
    { x: index.x - dir * w * 0.52, y: index.y + verticalSpan * 0.18 },
    index,
    between(index, middle),
    middle,
    between(middle, ring),
    ring,
    { ...between(ring, little), y: between(ring, little).y + verticalSpan * 0.18 * spreadFive },
    little,
    { x: little.x + dir * w * (0.5 - 0.32 * spreadFive), y: little.y + verticalSpan * (0.18 + 0.36 * spreadFive) },
    // The palm's sides follow the knuckle row's ends; lower down they turn
    // with the row about the wrist (half its shift at the heel of the hand,
    // a quarter at the wrist).
    ...[
      [dir * little.x + (0.32 - 0.08 * spreadFive) * w, 0.36],
      [1.5 * w + 0.5 * turn, 0.75],
      [1.22 * w + 0.25 * turn, 1],
      [-1.18 * w + 0.25 * turn, 1],
      [-1.46 * w + 0.5 * turn, 0.7],
      [dir * index.x - 0.46 * w, 0.39],
      [dir * index.x - 0.52 * w, 0.19],
    ].map(([x, y]) => ({
      x: dir * x,
      y: y === 1 ? wrist.y : knuckleY + y * palmDepth,
    })),
  ];
  const pose = {
    beat: motion.beat,
    seconds: motion.t,
    glide: motion.glide,
    reducedMotion: !!opts.reducedMotion,
    x: centre,
    dir,
    unit: u,
    verticalUnit: v,
    span: w,
    fan,
    knuckleY,
    keysHeight: h,
    palmDepth,
    fingers: out,
    back,
    knuckles,
    wrist,
    rest: motion.rest,
    signature: "",
    palm: {
      C: palm.C,
      lean: palm.lean,
      x: (palm.C + palm.lean) * dir,
      spread,
      fan,
      forward: palm.forward,
      moving: palm.moving,
      tau: palm.tau,
      lift: motion.lift,
      speed: Math.abs(palm.v + palm.leanV),
      roll,
      relax,
      crowd,
      // px, + toward the player; the compositor's (not in the signature).
      bob: (motion.bob || 0) * v,
    },
    zTop,
    forced: motion.forced,
    forcedFinger: motion.forcedFinger,
    position: motion.position,
    travel: motion.travel,
    marks: motion.marks,
    pedal: motion.pedal,
    guidanceOnly: motion.guidanceOnly,
    guidanceReason: motion.guidanceReason,
    guidance: motion.guidance,
  };
  pose.signature = poseSignature(pose);
  return pose;
}

// The repaint key (§5.2): everything the drawer (hand-draw.mjs) reads, in the
// buckets it reads it (`drawable` there quantises identically), and nothing
// else: per finger its axis points, state, landing point and alpha, lift,
// press, number and under; the palm outline, knuckle row, wrist, fan, roll and
// relax; the key unit; rest. Not in it: x, palm.lift, zTop, marks,
// pedal, glide, beat, seconds, crowd (its effects are already in the points).
export function poseSignature(pose) {
  const r = (x) => Math.round(x * 2) / 2;
  const q = (x, n) => Math.round((x || 0) * n);
  const p = (pt) => `${r(pt.x)},${r(pt.y)}`;
  return [
    pose.fingers
      .map(
        (f) =>
          f.axis.map(p).join(";") +
          f.state +
          (f.landing ? `>${p(f.landing)}~${q(f.landing.alpha, 10)}` : "") +
          `/${q(f.lift, 20)}/${q(f.press, 10)}/${q(f.number, 10)}/${q(f.under, 20)}`,
      )
      .join(" "),
    pose.back.map(p).join(";"),
    r(pose.knuckleY),
    r(pose.wrist.y),
    q(pose.fan, 100),
    q(pose.palm?.roll, 20),
    q(pose.palm?.relax, 20),
    r(pose.unit),
    pose.dir,
    pose.rest ? "rest" : "",
    pose.guidanceOnly ? "guidance" : "",
  ].join("|");
}

// ---- two hands (§4.7) -----------------------------------------------------------------
// The time each position claims the keyboard: from the departure toward it to
// the moment the hand has left it — airborne (lift 0.5) in a flight, or
// arrived at its next position in a move along the keys — so a hand still
// over its old place keeps its layer until it is in the air.
function occupancy(m) {
  const leaves = (plan) => {
    const seg = plan.segs[0];
    if (seg && seg.amp >= 0.5) return seg.t0 + (Math.asin(0.5 / seg.amp) / Math.PI) * (seg.t1 - seg.t0);
    return Math.max(plan.w0, plan.w1);
  };
  return m.positions.map((p, k) => ({
    k,
    x: p.C * m.dir,
    spread: p.spread,
    t0: k === 0 ? -Infinity : m.plans[k - 1].w0,
    t1: k + 1 < m.positions.length ? leaves(m.plans[k]) : Infinity,
    travel: k === 0 ? 0 : Math.abs(m.plans[k - 1].d),
  }));
}
const overlaps = new WeakMap();
function overlapIntervals(L, R) {
  let byR = overlaps.get(L);
  if (!byR) overlaps.set(L, (byR = new WeakMap()));
  let list = byR.get(R);
  if (list) return list;
  list = [];
  const a = occupancy(L),
    b = occupancy(R);
  for (const p of a)
    for (const q of b) {
      const t0 = Math.max(p.t0, q.t0),
        t1 = Math.min(p.t1, q.t1);
      if (!(t1 > t0)) continue;
      const half = (s) => 1.35 * s + 0.9;
      if (half(p.spread) + half(q.spread) + 0.2 <= Math.abs(q.x - p.x)) continue;
      let top;
      if (p.t0 !== q.t0) top = p.t0 > q.t0 ? "left" : "right";
      else top = p.travel > q.travel ? "left" : "right";
      list.push({ t0, t1, top });
    }
  list.sort((x, y) => x.t0 - y.t0);
  byR.set(R, list);
  return list;
}

// A worker prepares the same complete models used by the frame loop. Functions
// stay in this module; the structured-cloneable graph preserves engagement and
// contact aliases, Infinity, maps and all floating-point values exactly.
export function serialiseHandPlans(timelines, clock = DEFAULT_CLOCK) {
  const prepared = { clockKey: clock.key, left: null, right: null, overlaps: null };
  const models_ = {};
  for (const hand of ["left", "right"]) {
    const steps = timelines?.[hand];
    if (!steps?.length) continue;
    const m = modelFor(steps, clock, hand);
    // Prepare the wait-mode index as well, rather than on its first RAF.
    replayStart(m, 0);
    models_[hand] = m;
    const { clock: unusedClock, evalSeg: unusedEval, ...data } = m;
    prepared[hand] = data;
  }
  if (models_.left && models_.right)
    prepared.overlaps = overlapIntervals(models_.left, models_.right);
  return prepared;
}

export function adoptHandPlans(timelines, clock, prepared) {
  if (!clock || prepared?.clockKey !== clock.key)
    throw new Error("Hand plan clock does not match the requested practice speed.");
  const adopted = {};
  // Validate the whole result before changing either hand's cache.
  for (const hand of ["left", "right"]) {
    const steps = timelines?.[hand];
    const data = prepared[hand];
    if (!steps?.length) {
      if (data) throw new Error("Hand plan contains an unexpected hand.");
      continue;
    }
    if (!data || data.hand !== hand || data.steps !== steps || data.onset?.length !== steps.length)
      throw new Error("Hand plan does not match its note timeline.");
    adopted[hand] = { ...data, clock, evalSeg };
  }
  for (const hand of ["left", "right"]) {
    const m = adopted[hand];
    if (!m) continue;
    let byKey = models.get(m.steps);
    if (!byKey) models.set(m.steps, (byKey = new Map()));
    byKey.set(`${clock.key}|${hand}`, m);
  }
  if (adopted.left && adopted.right && Array.isArray(prepared.overlaps)) {
    let byR = overlaps.get(adopted.left);
    if (!byR) overlaps.set(adopted.left, (byR = new WeakMap()));
    byR.set(adopted.right, prepared.overlaps);
  }
}

// The no-worker planner reuses written timelines at different speeds. Release
// their matching internal models when the outer speed cache evicts a result;
// other clocks and the current hand plan keep their own entries intact.
export function forgetHandPlans(timelines, clockKey) {
  let removed = 0;
  for (const hand of ["left", "right"]) {
    const steps = timelines?.[hand];
    if (!steps) continue;
    const byKey = models.get(steps);
    if (byKey?.delete(`${clockKey}|${hand}`)) removed++;
    if (byKey?.size === 0) models.delete(steps);
  }
  return removed;
}

function handState(m, now, options) {
  const t = m.clock.toSeconds(now);
  const reduced = !!options.reducedMotion;
  if (reduced) {
    const s = staticFingers(m, t);
    let waitK = null;
    if (options.waiting) {
      // Wait mode, still picture: the chord to play stands ready on its
      // keys (cream numbers and key marks), never shown as already down.
      const k = Math.min(lastAtOrBefore(m.onset, t - 1e-6) + 1, m.onset.length - 1);
      if (Math.abs(m.onset[k] - t) < 1e-4) {
        waitK = k;
        for (const f of s.fingers)
          if (f.eng && f.eng.i === k) {
            f.state = "ready";
            f.number = 1;
            f.releaseKind = null;
            f.target = { X: f.X, midi: f.midi, black: !!f.black, inward: f.inward || 0, alpha: 1 };
            f.next = f.eng;
          }
      }
    }
    return { m, t, now, reduced, ...s, waitK };
  }
  let tEval = t,
    waitK = null,
    hold = 1,
    breath = 0;
  if (options.waiting) {
    // Wait mode: the chord to play next hovers ready over its keys.
    let k = lastAtOrBefore(m.onset, t - 1e-6) + 1;
    if (k >= m.onset.length) k = m.onset.length - 1;
    // (A hand with nothing to play at the waiting chord shows its plain pose.)
    if (Math.abs(m.onset[k] - t) < 1e-4) {
      waitK = k;
      const end = m.onset[k] - 1e-4;
      tEval = end;
      // Waiting and seeking reconstruct this exact musical moment. Wall-clock
      // time since arrival must not replay the skipped passage or drift a pause.
    }
  }
  const palm = palmAt(m, tEval);
  if (waitK != null) {
    // The standing palm: where the plan has it at the chord when it is not
    // moving then (arrived and hovering, or leaned over a held finger in a
    // pass); otherwise the chord's own frame, never mid-flight.
    const pos = m.positions[m.stepPos[waitK]];
    const at = palmAt(m, m.onset[waitK] - 1e-4);
    const entry = pos.index > 0 && pos.i0 === waitK ? m.plans[pos.index - 1] : null;
    const still = at.moving || entry?.tArrive > m.onset[waitK] + EPS
      ? { C: pos.groups ? pos.groupC[0] : pos.C, lean: m.lean[waitK] || 0, forward: pos.forward, spread: m.spreadLocal[waitK] }
      : { C: at.C, lean: at.lean, forward: at.forward, spread: at.spreadEff };
    // (Only the standing palm's difference from the plan's is blended in, so
    // a replay that ends where the plan does is the plan's own motion.)
    palm.C += (still.C - at.C) * hold;
    palm.lean += (still.lean - at.lean) * hold;
    palm.forward += (still.forward - at.forward) * hold;
    palm.spread = palm.spreadEff = palm.spreadEff + (still.spread - at.spreadEff) * hold;
    if (hold >= 1) {
      palm.moving = false;
      palm.flying = false;
      palm.lift = palm.ride = palm.tau = palm.v = palm.leanV = 0;
    } else {
      palm.lift *= 1 - hold;
      palm.ride *= 1 - hold;
    }
  }
  const i = lastAtOrBefore(m.onset, tEval);
  return { m, t: tEval, tReal: t, now, reduced, palm, waitK, hold, breath, step: i, position: i >= 0 ? m.stepPos[i] : 0 };
}

// Where a wait-mode replay toward chord k starts (§4.8): the previous chord,
// but no earlier than just before chord k's preparation, nor 1.5 s ahead.
function replayStart(m, k) {
  if (!m.stepPrep) {
    // Per chord: its earliest preparation, and the last release before it.
    m.stepPrep = m.onset.map((s) => s);
    m.stepFree = m.onset.map(() => -Infinity);
    for (const f of [1, 2, 3, 4, 5])
      for (const e of m.byFinger[f]) {
        m.stepPrep[e.i] = Math.min(m.stepPrep[e.i], e.prepStart);
        if (!Number.isFinite(e.release)) continue;
        const j = lastAtOrBefore(m.onset, e.release - 1e-4) + 1;
        if (j < m.onset.length) m.stepFree[j] = Math.max(m.stepFree[j], e.release);
      }
  }
  const end = m.onset[k] - 1e-4;
  return Math.min(end, Math.max(k > 0 ? m.onset[k - 1] : -Infinity, m.stepPrep[k] - 0.1, m.onset[k] - REPLAY_MAX));
}

function finishHand(st, options, crowd, zTop) {
  const { m } = st;
  const t = st.t;
  let fingers, relax;
  if (st.reduced) {
    fingers = st.fingers;
    relax = relaxAt(m, t, !!options.counting);
  } else {
    relax = st.waitK != null ? 0 : relaxAt(m, t, !!options.counting);
    const ctx = { crowd, relax, ahead: options.ahead, beat: st.waitK != null ? null : st.now };
    fingers = motionAt(m, st.now, options, st.palm, ctx).map((f) => f);
    // motionAt evaluates at the hand's real time; re-evaluate for wait mode.
    if (st.waitK != null) {
      const at = [1, 2, 3, 4, 5].map((f) => fingerAt(m, f, t, st.palm, ctx));
      const k = st.waitK;
      // The chord's fingers aim but never descend: they hover over their
      // keys. (During a replay they get there at the aim's own pace and
      // settle onto the standing picture as the palm does, `hold` 0 → 1.)
      const w = st.hold;
      for (const f of at) {
        const requested = m.stepContacts[k].find(c => c.struck && c.finger === f.finger)?.eng;
        const n = requested || f.next;
        if (n && n.i === k && (requested || f.state !== "down" || f.eng?.end <= st.tReal + EPS)) {
          f.next = n;
          // The finger's own aim (0 until it starts, so a finger just let go
          // leaves its key as it would), completed by the settle at the end.
          const lateral = t >= n.aimStart ? ease01(f.aimTau / n.lateralShare) : 0;
          const end = w ** 8;
          const g = w * lateral + end * (1 - lateral);
          f.X = lerp(f.X, n.X, g);
          if (w >= 1 || t >= n.prepStart) f.state = "ready";
          f.lift = Math.max(f.lift * (1 - w), HOVER_WAIT * (lateral + (1 - lateral) * end));
          f.extend = lerp(f.extend, 1, g);
          f.curl = lerp(f.curl, 0, g);
          f.black = lerp(f.black, n.black ? 1 : 0, g);
          f.inward = lerp(f.inward || 0, n.inward || 0, g);
          f.descent = 0;
          f.arc = (f.arc || 0) * (1 - w);
          if (f.state === "ready") {
            const alpha = lerp(f.target ? f.target.alpha : 0, 1, g);
            f.target = { X: n.X, midi: n.midi, black: n.black, inward: n.inward || 0, alpha };
            f.number = lerp(f.number, 1, g);
          }
        }
      }
      const under = underOf(at);
      at[0].under = under;
      at[0].tuck = tuckOf(at[0], under);
      for (const f of at.slice(1)) {
        f.under = 0;
        f.tuck = 0;
      }
      fingers = at;
    } else if (options.frozen && !options.waiting && options.settle && options.settle.since >= 0) {
      // A listen pause: preparation markers fade in over the standing frame.
      const a = ease01(options.settle.since / 0.3);
      for (const f of fingers) {
        const n = f.next;
        if (f.state === "up" && n && n.onsetVis - t <= PREP_MAX + 1) {
          f.state = "ready";
          f.target = { X: n.X, midi: n.midi, black: n.black, inward: n.inward || 0, alpha: a };
          f.number = Math.max(f.number, a);
        }
      }
    }
  }
  const rest = relax > 0.5;
  const palm = st.palm;
  // Wrist roll: toward the little-finger side when 4 and 5 play.
  let rollSum = 0,
    rollW = 0;
  for (const f of fingers)
    if (f.state === "down") {
      const e = f.eng;
      const w = e ? ease01((t - e.onsetVis) / 0.12) * (1 - ease01((t - e.release + 0.12) / 0.12)) : 1;
      rollSum += w * ((f.finger - 3) / 2);
      rollW += w;
    }
  const roll = st.reduced || !(rollW > 0) ? 0 : (rollSum / Math.max(1, rollW)) * Math.min(1, rollW);
  // Palm lift: a flight with no finger down; a resting hand rises a little.
  let lift = 0;
  // (Rising as the last finger leaves its key — over its own lift-off — so a
  // hand whose path is already in the air does not jump up at the release.)
  let held = 0;
  for (const f of fingers)
    held = Math.max(held, f.state === "down" ? 1 : f.since != null ? 1 - ease01(f.since / RELEASE_S) : 0);
  if (!st.reduced) lift = palm.lift * (1 - held);
  // (Reduced motion: one still picture per step, no rising either.)
  if (!st.reduced) lift = Math.max(lift, 0.2 * relax);
  if (crowd > 0.5 && !zTop) lift = Math.min(lift, lerp(1, 0.1, ease01((crowd - 0.4) / 0.2)));
  // Plan flags while the palm is in a forced move.
  let forced = false,
    travel = null;
  if (!st.reduced && st.waitK == null)
    for (let k = Math.max(0, lastAtOrBefore(m.planStart, t) - 2); k < m.plans.length; k++) {
      const plan = m.plans[k];
      if (t < plan.w0 - 1e-9) break;
      if (t < Math.max(plan.w1, plan.onsetB)) {
        if (plan.forced && t < plan.w1) forced = true;
        travel = { kind: plan.kind, steal: plan.steal, capped: plan.capped || false, forced: plan.forced, roll: !!m.positions[plan.k + 1].groups };
      }
    }
  if (!st.reduced) {
    // A rolled chord: the hand sweeps from group to group in a few tens of
    // milliseconds, faster than a finger aims on its own — flagged as forced
    // for the sweep itself. Each lower group lets go at its finger's reach
    // (buildModel), so the hand is never stretched across the chord.
    const pos = m.positions[st.position];
    if (pos?.groups && t >= m.onset[pos.i0] && t < pos.rollEnd + CURL_S) {
      const sweeping = t < pos.rollEnd + 0.02;
      travel = { kind: "ROLL", steal: 0, capped: true, forced: sweeping, roll: true };
      if (sweeping) forced = true;
    }
  }
  const forcedFinger = fingers.some((f) => f.forcedFinger);
  forced ||= fingers.some(f => (f.next?.articulation === "late-contact" && t + EPS >= f.next.onsetVis && t < f.next.contactAt) ||
    (f.eng?.articulation === "late-contact" && t >= f.eng.contactAt && t < f.eng.contactAt + RELEASE_S));
  forced ||= m.missedEngs.some(e => t + EPS >= e.onsetVis && t < e.contactEnd);
  // Key marks: the finger heading for each key (and rolled chords).
  const marks = [];
  for (const e of m.missedEngs)
    if (t + EPS >= e.onsetVis && t < e.contactEnd)
      marks.push({ midi: e.midi, finger: e.finger, kind: "contact", strength: 1 });
  for (const f of fingers) {
    if (f.state !== "ready" || !f.target) continue;
    const n = f.next;
    marks.push({
      midi: f.target.midi,
      finger: f.finger,
      kind: n?.rolled ? "roll" : "land",
      strength: f.target.alpha,
    });
  }
  if (st.reduced && st.waitK == null) {
    // A static cue for the next chord's keys.
    const k = lastAtOrBefore(m.onset, t) + 1;
    if (k < m.steps.length && m.onset[k] - t <= PREP_MAX)
      for (const c of m.stepContacts[k]) if (c.struck) marks.push({ midi: c.midi, finger: c.finger, kind: c.rolled ? "roll" : "land", strength: 1 });
  }
  // Keys let go while they still sound: rings until the written end.
  const pedal = [];
  for (const e of m.pedalEngs) {
    if (e.release > t) break;
    if (t < e.end)
      pedal.push({ midi: e.midi, kind: pedalAt(options.pedals, m.clock.toBeat(t)) ? "pedal" : "free", until: e.end });
  }
  let glide = 0;
  if (!st.reduced) {
    if (palm.moving) glide = Math.max(glide, palm.tau);
    for (const f of fingers) glide = Math.max(glide, f.aimTau || 0);
  }
  const pos = m.positions[st.position] || m.positions[0];
  const guidanceTime = st.tReal ?? t;
  const fallback = guidanceIntervalAt(m, guidanceTime);
  const guidance = [];
  if (fallback) {
    const at = lastAtOrBefore(m.onset, guidanceTime);
    const keys = new Map();
    if (at >= 0) for (const k of m.steps[at].keys) {
      if (m.clock.toSeconds(k.end) <= guidanceTime + EPS) continue;
      keys.set(k.midi, { ...k, state: options.waiting && k.struck && Math.abs(m.onset[at] - guidanceTime) < 1e-4 ? "ready" : "down" });
    }
    const next = at + 1;
    if (next < m.steps.length && m.onset[next] - guidanceTime <= PREP_MAX + EPS)
      for (const k of m.steps[next].keys) if (k.struck && !keys.has(k.midi)) keys.set(k.midi, { ...k, state: "ready" });
    guidance.push(...[...keys.values()].sort((a, b) => a.midi - b.midi));
    marks.splice(0, marks.length, ...guidance.map(k => ({ midi: k.midi, finger: k.finger, kind: k.state === "down" ? "contact" : "land", strength: 1 })));
    pedal.length = 0;
  }
  return {
    t: st.tReal ?? t,
    beat: st.now,
    palm,
    fingers,
    guidanceOnly: !!fallback,
    guidanceReason: fallback?.reason ?? null,
    guidance,
    // Reduced motion keeps one static picture per step: the hand dims (rest)
    // but does not curl or sink.
    relax: st.reduced ? 0 : relax,
    rest,
    roll,
    lift,
    crowd,
    zTop,
    forced,
    forcedFinger,
    travel,
    marks,
    pedal,
    glide,
    bob: st.reduced ? 0 : bobAt(m, st),
    home: st.reduced ? 0 : trackAt(m.homeTrack, t)[0],
    position: { index: pos.index, C: pos.C * m.dir, spread: pos.spread },
  };
}

// The whole hand's small vertical motion on the compositor (× v, + toward
// the player): a waiting hand breathes; repeated chords at speed bounce the
// wrist toward the fallboard between strikes (§4.5.4).
function bobAt(m, st) {
  if (st.waitK != null) return BREATH * (st.breath || 0);
  const i = st.step;
  if (i < 0 || i + 1 >= m.onset.length) return 0;
  const ioi = m.onset[i + 1] - m.onset[i];
  if (!(ioi < 0.25)) return 0;
  if (!m.repeatChord) {
    const keysOf = (k) =>
      m.stepContacts[k]
        .filter((c) => c.struck)
        .map((c) => c.midi)
        .sort((a, b) => a - b)
        .join(",");
    const sets = m.onset.map((_, k) => keysOf(k));
    m.repeatChord = sets.map((s, k) => k + 1 < sets.length && s.includes(",") && s === sets[k + 1]);
  }
  if (!m.repeatChord[i]) return 0;
  return -0.05 * Math.sin((Math.PI * (st.t - m.onset[i])) / ioi);
}

// Both hands at one moment. `timelines` is { left, right } (handTimeline
// steps); `options` are handPose's, plus `visible(hand)` to skip a hand that
// is not shown. Both models are planned (and memoised) in the clock's real
// seconds, then the two hands are resolved together: crowding folds their
// free fingers, and the hand that moved into an overlap is drawn on top.
export function handPoses(timelines, now, options = {}) {
  const out = { left: null, right: null };
  const resolved = resolveHands(timelines, now, options);
  if (!resolved) return out;
  for (const hand of ["left", "right"]) {
    const st = resolved.live[hand];
    if (!st) continue;
    out[hand] = geometry(st.m, resolved.motions[hand], options);
  }
  return out;
}

// Both hands at one moment as handPoses has them, each with the motion
// behind its pose (a plain object in absolute keys, no model internals),
// for renderers that build their own hand from the motion — the 3-D hands
// (hand3d.mjs). `pose` is exactly handPoses' pose; `motion` is:
//   { hand, dir, t, beat, centre /*keys: the drawn palm centre, pose.x / u*/,
//     palm: { x /*keys, palm C + lean*/, spread, fan, forward, lift, roll, relax,
//             rest, crowd, zTop, topRaise, bob /*× v*/, moving, tau, flying, speed /*keys/s*/ },
//     fingers: [{ finger, x /*keys*/, state, lift, curl, extend, press, number, under,
//                 tuck, arc, black, inward, midi, descent, aimTau, since, heldFor, releaseIn, yieldX,
//                 contact /*px from the keys' back edge*/,
//                 target: null | { x, midi, black, inward, alpha, contact } }],
//     forced, forcedFinger }
// The motion is the same pure function of the inputs as the pose, so seeking
// equals playing for a renderer that reads only it and the pose.
export function handMotions(timelines, now, options = {}) {
  const out = { left: null, right: null };
  const resolved = resolveHands(timelines, now, options);
  if (!resolved) return out;
  for (const hand of ["left", "right"]) {
    const st = resolved.live[hand];
    if (!st) continue;
    const motion = resolved.motions[hand];
    const pose = geometry(st.m, motion, options);
    out[hand] = { pose, motion: plainMotion(st.m, hand, motion, pose, options) };
  }
  return out;
}

// Where a finger's pad meets a key in depth (px from the keys' back edge) for
// a key colour share `black` and a white key's `inward` share — the drawn
// pose's own contact (geometry's keyY).
function contactY(f, black, inward, opts) {
  const v = Math.min(opts.keyWidth, opts.keysHeight * 0.3);
  return contactDepth(f, black, opts) - (f > 1 ? WHITE_IN * v * (inward || 0) * (1 - black) : 0);
}

function plainMotion(m, hand, motion, pose, opts) {
  const dir = m.dir;
  const { palm } = motion;
  return {
    hand,
    dir,
    t: motion.t,
    beat: motion.beat,
    guidanceOnly: motion.guidanceOnly,
    guidanceReason: motion.guidanceReason,
    guidance: motion.guidance,
    centre: pose.x / opts.keyWidth,
    palm: {
      x: (palm.C + palm.lean) * dir,
      spread: palm.spreadEff,
      fan: pose.fan,
      forward: palm.forward,
      lift: motion.lift,
      roll: motion.roll || 0,
      relax: motion.relax || 0,
      rest: !!motion.rest,
      crowd: motion.crowd || 0,
      zTop: !!motion.zTop,
      topRaise: motion.topRaise ?? 0,
      bob: motion.bob || 0,
      moving: !!palm.moving,
      tau: palm.tau || 0,
      flying: !!palm.flying,
      speed: (palm.v || 0) + (palm.leanV || 0),
    },
    fingers: motion.fingers.map((f) => {
      const black = clamp(+f.black || 0, 0, 1);
      return {
        finger: f.finger,
        x: f.X * dir,
        state: f.state,
        exact: !!f.exact,
        lift: f.lift || 0,
        curl: f.curl ?? 0,
        extend: f.extend ?? 0,
        press: f.press || 0,
        number: f.number || 0,
        under: f.under || 0,
        tuck: f.tuck || 0,
        arc: f.arc || 0,
        black,
        inward: f.inward || 0,
        midi: f.midi ?? null,
        descent: f.descent || 0,
        aimTau: f.aimTau || 0,
        since: f.since ?? null,
        // Physical lateness is separate from the unchanged score clock.
        articulation: f.next && motion.t + EPS >= f.next.onsetVis && motion.t < f.next.contactAt
          ? f.next.articulation ?? null : f.eng?.articulation ?? null,
        contactAt: f.next && motion.t + EPS >= f.next.onsetVis && motion.t < f.next.contactAt
          ? f.next.contactAt : f.eng?.contactAt ?? null,
        // (Seconds a finger on its key has held it; how long until it lets go.)
        heldFor: f.state === "down" && f.eng ? Math.max(0, motion.t - f.eng.contactAt) : null,
        releaseIn: f.state === "down" && f.eng && Number.isFinite(f.eng.release) ? Math.max(0, f.eng.release - motion.t) : null,
        yieldX: f.yieldX || 0,
        contact: contactY(f.finger, black, f.inward, opts),
        target: f.target
          ? {
              x: f.target.X * dir,
              midi: f.target.midi,
              black: f.target.black ? 1 : 0,
              inward: f.target.inward || 0,
              alpha: f.target.alpha,
              contact: contactY(f.finger, f.target.black ? 1 : 0, f.target.inward, opts),
            }
          : null,
      };
    }),
    forced: !!motion.forced,
    forcedFinger: !!motion.forcedFinger,
  };
}

// Both hands' states and motions at one moment, resolved together (crowding,
// z-order, the thumbs' places): what handPoses and handMotions turn into
// poses. Null without key geometry.
function resolveHands(timelines, now, options) {
  const { keyWidth, keysHeight, bedHeight, visible } = options;
  if (!(keyWidth > 0) || !(keysHeight > 0) || !Number.isFinite(bedHeight)) return null;
  const clock = options.clock && typeof options.clock.toSeconds === "function" ? options.clock : DEFAULT_CLOCK;
  const live = {};
  for (const hand of ["left", "right"]) {
    const steps = timelines?.[hand];
    if (!steps?.length || (visible && !visible(hand))) continue;
    live[hand] = handState(modelFor(steps, clock, hand), now, options);
  }
  let crowd = 0;
  let top = "right";
  const visibleLift = st => {
    if (st.reduced) return 0;
    let held = 0;
    for (const list of st.m.byFinger) {
      const e = list[lastEngagement(list, st.t)];
      if (e) held = Math.max(held, st.t < e.release ? 1 : 1 - ease01((st.t - e.release) / RELEASE_S));
    }
    return (st.palm.lift || 0) * (1 - held);
  };
  // Hidden fallback anchors must not push or tuck the other, visible hand.
  const paired = live.left && live.right && [live.left, live.right].every(st => !guidanceIntervalAt(st.m, st.tReal ?? st.t));
  const collisionWeight = paired ? Math.min(...[live.left, live.right].map(st => collisionVisibility(st.m, st.tReal ?? st.t))) : 0;
  if (paired) {
    const L = live.left,
      R = live.right;
    const xL = (L.palm.C + L.palm.lean) * -1,
      xR = R.palm.C + R.palm.lean;
    const sL = L.palm.spreadEff ?? L.palm.spread,
      sR = R.palm.spreadEff ?? R.palm.spread;
    const gap = xR - (1.35 * sR + 0.6) - (xL + (1.35 * sL + 0.6));
    crowd = clamp(1 - gap / 1.5, 0, 1);
    // A hand in the air passes over the other: the other's fingers need not
    // fold for it, and the fold never follows a flight's own speed.
    crowd *= 1 - ease01((Math.max(visibleLift(L), visibleLift(R)) - 0.4) / 0.4);
    crowd *= collisionWeight;
    const flyingL = !L.reduced && L.palm.flying && visibleLift(L) >= 0.5;
    const flyingR = !R.reduced && R.palm.flying && visibleLift(R) >= 0.5;
    if (flyingL !== flyingR) top = flyingL ? "left" : "right";
    else {
      const t = L.t;
      for (const iv of overlapIntervals(L.m, R.m)) {
        if (iv.t0 > t) break;
        if (t < iv.t1) top = iv.top;
      }
    }
  }
  const motions = {};
  for (const hand of ["left", "right"]) {
    const st = live[hand];
    if (!st) continue;
    const zTop = paired ? top === hand : hand === "right";
    motions[hand] = finishHand(st, options, crowd, zTop);
  }
  // The top hand's knuckle row rises over a crowded neighbour; it is let
  // down while either hand takes off, so it is back at rest by the time
  // the airborne hand takes the top (lift 0.5) and a still hand's row never
  // drops at a z-order change.
  if (paired) {
    // (The palm path's own lift, as the z-order reads it.)
    const up = visibleLift;
    const air = 1 - ease01(Math.max(up(live.left), up(live.right)) / 0.5);
    for (const hand of ["left", "right"]) motions[hand].topRaise = crowd * (motions[hand].zTop ? 1 : 0) * air;
  }
  // A free thumb rests beside its index, not behind it.
  for (const hand of ["left", "right"])
    if (motions[hand] && !live[hand].reduced) motions[hand].fingers = thumbBeside(motions[hand].fingers, crowd);
  // Two thumbs meeting between the hands: the freer one tucks toward its
  // own palm (a thumb on its key never moves).
  if (paired && !live.left.reduced && !live.right.reduced) {
    const tl = motions.left.fingers[0],
      tr = motions.right.fingers[0];
    const xl = -tl.X,
      xr = tr.X;
    const palmL = -(motions.left.palm.C + motions.left.palm.lean),
      palmR = motions.right.palm.C + motions.right.palm.lean;
    // (Fading out as one hand passes over the other.)
    // (Not while a hand is in the air above the other.)
    const deficit =
      collisionWeight *
      (THUMB_GAP - (xr - xl)) *
      ease01((palmR - palmL - 1) / 5) *
      (1 - ease01((Math.max(motions.left.lift, motions.right.lift) - 0.5) / 0.4));
    if (deficit > 0) {
      const mobility = (f) =>
        f.state === "down"
          ? 0
          : (f.since != null ? ease01(f.since / CURL_S) : 1) *
            (1 - (f.aimTau > 0 ? ease01(f.aimTau / (f.next?.lateralShare || 0.7)) : 0));
      const ml = mobility(tl),
        mr = mobility(tr);
      if (ml + mr > 1e-6) {
        // (A thumb only just free — let go, or about to land — gives way
        // only as far as it is free, so no thumb jumps at its key.)
        const push = (Math.min(deficit, THUMB_GAP) * Math.min(1, ml + mr)) / (ml + mr);
        tl.X += (tl.yieldX = push * ml);
        tr.X += (tr.yieldX = push * mr);
        // A yielding thumb also tucks under its own hand.
        for (const f of [tl, tr]) f.tuck = Math.max(f.tuck || 0, 0.8 * clamp(f.yieldX / 0.6, 0, 1));
      }
    }
  }
  return { live, motions };
}

// One hand's pose: every finger's place in pixels relative to the hand's
// centre `x` (the canvas is placed there), with each finger's state — down
// on its key while it sounds, ready (with the landing footprint) while it
// prepares, up otherwise — and the cues the drawer and the stage read.
// `other` ({ steps, hand }) lets two-hand rules resolve as in handPoses.
export function handPose(steps, now, hand, options = {}) {
  const { other, ...rest } = options;
  const timelines = { [hand]: steps };
  if (other?.steps?.length && other.hand !== hand) timelines[other.hand] = other.steps;
  return handPoses(timelines, now, rest)[hand];
}

// The motion behind a pose, in keys (absolute x), for checks and the lab:
// `glide` (the palm's progress while it moves, or a finger's approach),
// `rest`, and per finger x, down/ready, lift and the target it aims for.
export function handMotion(steps, now, hand, options = {}) {
  if (!steps?.length) return null;
  const clock = options.clock && typeof options.clock.toSeconds === "function" ? options.clock : DEFAULT_CLOCK;
  const m = modelFor(steps, clock, hand);
  const st = handState(m, now, options);
  const motion = finishHand(st, options, 0, hand === "right");
  return {
    index: st.step ?? lastAtOrBefore(m.onset, motion.t),
    glide: motion.glide,
    rest: motion.rest,
    relax: motion.relax,
    seconds: motion.t,
    guidanceOnly: motion.guidanceOnly,
    guidanceReason: motion.guidanceReason,
    guidance: motion.guidance,
    palm: { C: motion.palm.C * m.dir, lean: motion.palm.lean * m.dir, moving: motion.palm.moving, lift: motion.lift },
    position: motion.position,
    forced: motion.forced,
    forcedFinger: motion.forcedFinger,
    fingers: motion.fingers.map((f) => ({
      finger: f.finger,
      x: f.X * m.dir,
      midi: f.midi,
      state: f.state,
      down: f.state === "down",
      ready: f.state === "ready",
      lift: f.lift,
      curl: f.curl,
      extend: f.extend,
      under: f.under || 0,
      number: f.number,
      releaseKind: f.releaseKind,
      target: f.target ? { midi: f.target.midi, x: f.target.X * m.dir, black: f.target.black, alpha: f.target.alpha } : null,
    })),
  };
}

// The plan behind a hand, for checks and the lab: positions (centre x in
// keys, spread, steps), boundary plans (kind, times in seconds) and every
// engagement's release.
export function handPlan(steps, hand, { clock = DEFAULT_CLOCK } = {}) {
  if (!steps?.length) return null;
  const m = modelFor(steps, clock, hand);
  return {
    contacts: m.contacts.map(c => ({ ...c })),
    guidanceIntervals: m.guidanceIntervals.map(iv => ({ ...iv })),
    positions: m.positions.map((p) => ({
      index: p.index,
      i0: p.i0,
      i1: p.i1,
      x: p.C * m.dir,
      spread: p.spread,
      forward: p.forward,
      pedal: p.pedal.map((c) => c.midi),
      roll: p.groups ? p.groups.map((g) => g.map((c) => c.midi)) : null,
      rollAt: p.rollAt || null,
      cross: p.cross ? p.cross.kind : null,
    })),
    plans: m.plans.map((p) => ({
      kind: p.kind,
      onsetA: p.onsetA,
      onsetB: p.onsetB,
      d: p.d * m.dir,
      tDepart: p.tDepart,
      tArrive: p.tArrive,
      hover: p.hover,
      steal: p.steal,
      forced: p.forced,
      capped: p.capped,
      Clim: p.Clim != null ? p.Clim * m.dir : null,
      tRel: p.tRel ?? null,
      dur2: p.dur2 ?? null,
    })),
    // The palm path: each segment's window (t1 < cut when a later plan took
    // over), start and target centre and starting velocity (keys/s).
    path: m.segs.map((g) => ({
      t0: g.t0,
      t1: g.t1,
      planned: g.t1o,
      from: g.Cs * m.dir,
      to: g.C1 * m.dir,
      v0: g.v0 * m.dir,
      roll: !!g.roll,
    })),
    engagements: m.engs.map((e) => ({
      finger: e.finger,
      midi: e.midi,
      onset: e.onset,
      onsetVis: e.onsetVis,
      contactAt: e.contactAt,
      contactLateBy: Math.max(0, e.contactAt - e.onsetVis),
      end: e.end,
      contactEnd: e.contactEnd,
      release: e.release,
      releaseKind: e.releaseKind,
      articulation: e.articulation ?? null,
      pedal: e.pedal,
      aimStart: e.aimStart,
      prepStart: e.prepStart,
      forcedFinger: e.forcedFinger,
    })),
  };
}
