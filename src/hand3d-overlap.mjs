// Two hands that would be drawn one over the other, kept apart (the 3-D
// hands, hand3d.mjs; no WebGL, node runs it for checks).
//
// The motion engine (hand-pose.mjs) can leave a hand that has finished
// playing where the other hand now plays — the left hand of Moonlight's bar
// 60 lingers over the triplets the right hand has taken over, waiting for
// its next bass note — and drawn there, the two read as one hand with ten
// fingers. A real pianist's free hand makes way: so here the hand that does
// not play where they meet (no finger on a key, none about to land close
// by) slides aside toward its own side of the keyboard — just far enough
// that the two stand apart — taking its free fingers with it. Its fingers
// still aim at the keys they are going to, and a hand that plays is never
// moved. Two hands that both play there (crossing, interleaved chords) are
// left as the engine has them, and two that both wait each give way half.
//
// Everything is a pure function of the two motions (the engine itself is
// untouched), so the same frame always gives the same picture; the renderer
// only eases the slide over a moment while the music plays.
//
//   const { left, right } = handSeparation(leftMotion, rightMotion, { need });  // keys to slide each (left −, right +)
//   const moved = slidMotion(motion, dx);                                  // the motion slid by dx keys

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export const SEPARATION = {
  // How far either side of its outermost digits a hand's outline reaches
  // (keys), and how much clear keyboard to leave between two hands.
  half: 0.55,
  gap: 0.3,
  // A finger about to land counts as playing where the hand is when its
  // key is within this many keys of it, or of the hand's centre (a key
  // further off is a leap: the hand is only on its way).
  near: 1.6,
  reach: 4,
  // A hand lifting into a flight toward the other (crossing over it) is not
  // moved: as its lift rises from the first to the second, and its speed
  // inward reaches `inward` keys/s, it gives way less. (A hand flying away
  // — off to its next keys — still keeps clear on its way.)
  flight: [0.2, 0.6],
  inward: 6,
  // An overlap deeper than this (keys) is a real crossing, not a hand left
  // behind: the slide fades out over the next `capFade` keys.
  cap: 5,
  capFade: 2,
};

// How much a hand plays where it is (0…1): a finger on its key (or exactly
// held), or one about to land close by.
export function engagement(m, S = SEPARATION) {
  if (!m?.fingers) return 0;
  let e = 0;
  for (const f of m.fingers) {
    if (f.state === "down" || f.exact) return 1;
    const c = m.centre ?? m.palm?.x;
    if (f.target && f.x != null && (Math.abs(f.target.x - f.x) < S.near || (c != null && Math.abs(f.target.x - c) < S.reach))) e = Math.max(e, clamp(f.target.alpha ?? 0, 0, 1));
  }
  return e;
}

// A hand's extent across the keys (keys, its digits' places ± its outline).
export function handExtent(m, S = SEPARATION) {
  let lo = Infinity,
    hi = -Infinity;
  for (const f of m?.fingers || []) {
    if (f.x == null || !Number.isFinite(f.x)) continue;
    lo = Math.min(lo, f.x);
    hi = Math.max(hi, f.x);
  }
  if (!(hi >= lo)) return null;
  return [lo - S.half, hi + S.half];
}

// How free each hand is to make way (0…1): not playing where it is, not
// in flight.
export function freedom(m, S = SEPARATION) {
  if (!m) return 0;
  const flying = smooth(((m.palm?.lift || 0) - S.flight[0]) / (S.flight[1] - S.flight[0]));
  // (The engine's palm speed is along the hand's own outward direction.)
  const inward = smooth(-(m.palm?.speed || 0) / S.inward);
  return (1 - engagement(m, S)) * (1 - flying * inward);
}

// How far the two hands' outlines overlap across the keys (keys; ≤ 0 when
// they stand clear), from their digits' places — a cheap first look.
export function motionOverlap(left, right, S = SEPARATION) {
  const L = handExtent(left, S),
    R = handExtent(right, S);
  return L && R ? L[1] + S.gap - R[0] : -Infinity;
}

// How far each hand slides (keys) to stand clear of the other: the left
// hand toward the bass (≤ 0), the right toward the treble (≥ 0). `need`:
// how far apart they must move (keys) — measured on the hands as drawn
// (overlapNeed), or else from their digits' places.
export function handSeparation(left, right, { need = null } = {}, S = SEPARATION) {
  if (!left || !right) return { left: 0, right: 0, need: 0, fl: 0, fr: 0 };
  const n = need ?? motionOverlap(left, right, S);
  const fl = freedom(left, S),
    fr = freedom(right, S);
  const free = fl + fr;
  if (!(n > 0) || !(free > 1e-4)) return { left: 0, right: 0, need: n, fl, fr };
  const amount = n * Math.min(1, free) * (1 - smooth((n - S.cap) / S.capFade));
  return { left: -amount * (fl / free), right: amount * (fr / free), need: n, fl, fr };
}

// How far apart (px) two hands' screen outlines must move across for none
// of their parts to meet, `gap` px clear: capsules { a, b, r } of the left
// hand and of the right. (Each part as its box: a little more than the
// least, never less.)
export function overlapNeed(leftCaps, rightCaps, gap = 0) {
  let need = -Infinity;
  const box = (c) => [Math.min(c.a.x, c.b.x) - c.r, Math.min(c.a.y, c.b.y) - c.r, Math.max(c.a.x, c.b.x) + c.r, Math.max(c.a.y, c.b.y) + c.r];
  const R = rightCaps.map(box);
  for (const c of leftCaps) {
    const a = box(c);
    for (const b of R) {
      if (a[3] + gap < b[1] || b[3] + gap < a[1]) continue;
      need = Math.max(need, a[2] + gap - b[0]);
    }
  }
  return need;
}

// The motion with its hand slid `dx` keys across: the palm and every digit
// not on a key (a digit on its key stays exactly there).
export function slidMotion(frame, dx) {
  if (!frame || !(Math.abs(dx) > 1e-6)) return frame;
  const m = frame.motion || frame;
  const moved = {
    ...m,
    centre: m.centre != null ? m.centre + dx : m.centre,
    palm: { ...m.palm, x: m.palm?.x != null ? m.palm.x + dx : m.palm?.x },
    fingers: m.fingers.map((f) => (f.state === "down" || f.exact || f.x == null ? f : { ...f, x: f.x + dx })),
    slid: dx,
  };
  return frame.motion ? { ...frame, motion: moved } : moved;
}
