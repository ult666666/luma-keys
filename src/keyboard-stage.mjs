// The keyboard stage is the main practice indicator: it fits the piece's range
// to the window, lights keys ahead of their notes and judges each key press.
// Everything here is pure so the geometry and the verdicts can be tested.
import { keyboardLayout } from "./music.mjs";
import { timingWindows } from "./performance.mjs";

const EPS = 1e-6;
export const WHITE_COUNT = 52;
const LAYOUT = keyboardLayout(21, 108);
const WHITES = LAYOUT.filter((k) => !k.black).map((k) => k.midi);
const whiteAtOrBelow = (m) => {
  let index = 0;
  for (let i = 0; i < WHITES.length && WHITES[i] <= m; i++) index = i;
  return index;
};
const whiteAtOrAbove = (m) => {
  const index = WHITES.findIndex((w) => w >= m);
  return index < 0 ? WHITES.length - 1 : index;
};

// Lowest and highest playable pitch, or null for an empty list.
export function pitchRange(notes) {
  let low = Infinity,
    high = -Infinity;
  for (const n of notes || []) {
    if (!Number.isInteger(n.midi) || n.midi < 21 || n.midi > 108) continue;
    if (n.midi < low) low = n.midi;
    if (n.midi > high) high = n.midi;
  }
  return low <= high ? { low, high } : null;
}

// Size the keys so the whole range (plus a white key either side) is visible
// without scrolling when possible. Keys never shrink below minKey, and the
// 88-key strip always at least fills the window. Returns the key width, the
// scroll offset that frames the range, and whether the range fits.
export function fitKeyboard(
  range,
  width,
  { minKey = 30, maxKey = 64, pad = 1 } = {},
) {
  const available = Math.max(1, width || 0);
  const { low, high } = range || { low: 48, high: 84 };
  const first = Math.max(0, whiteAtOrBelow(low) - pad);
  const last = Math.min(WHITE_COUNT - 1, whiteAtOrAbove(high) + pad);
  const need = last - first + 1;
  let keyWidth = Math.min(maxKey, Math.max(minKey, available / need));
  keyWidth = Math.max(keyWidth, available / WHITE_COUNT);
  const visible = available / keyWidth;
  const fits = visible + EPS >= need;
  // Center the needed keys; clamp so the strip never shows empty space.
  let start = (first + last + 1) / 2 - visible / 2;
  start = Math.max(0, Math.min(WHITE_COUNT - visible, start));
  return {
    keyWidth,
    stripWidth: keyWidth * WHITE_COUNT,
    scrollLeft: Math.max(0, start * keyWidth),
    fits,
    first,
    last,
  };
}

// The keyboard's camera: which stretch of the 88 keys to show, and how big.
// It frames the given notes (those sounding now and coming up, both hands)
// with `pad` white keys of margin, as large as fits up to maxKey; never
// smaller than minKey. `center` is in white-key units along the keyboard.
export function cameraFrame(
  notes,
  viewWidth,
  { minKey = 30, maxKey = 68, pad = 1.5 } = {},
) {
  const range = pitchRange(notes);
  if (!range || !(viewWidth > 0)) return null;
  const first = whiteAtOrBelow(range.low);
  const last = whiteAtOrAbove(range.high);
  const need = last - first + 1 + 2 * pad;
  let keyWidth = Math.min(maxKey, Math.max(minKey, viewWidth / need));
  keyWidth = Math.max(keyWidth, viewWidth / WHITE_COUNT);
  return {
    keyWidth,
    center: clampCenter((first + last + 1) / 2, keyWidth, viewWidth),
    first,
    last,
  };
}
// Keep a camera centre where the view stays on the keyboard.
export function clampCenter(center, keyWidth, viewWidth) {
  const half = viewWidth / keyWidth / 2;
  if (half * 2 >= WHITE_COUNT) return WHITE_COUNT / 2;
  return Math.max(half, Math.min(WHITE_COUNT - half, center));
}
// Is a white-key range [first, last] inside the view at this zoom and centre?
export function inView(first, last, center, keyWidth, viewWidth, margin = 0.6) {
  const half = viewWidth / keyWidth / 2;
  return first - margin >= center - half && last + 1 + margin <= center + half;
}

// Where each hand is, and where it has to go next. A hand's position spans
// the notes it plays from now to `reach` beats on (or, while it rests, its
// next notes). A jump is its first later note more than `leap` semitones
// outside that span within `ahead` beats; the next position spans the notes
// from there for `reach` beats. Pitches are MIDI numbers.
export function handZones(
  notes,
  beat,
  { reach = 1, ahead = 4, leap = 5, longest } = {},
) {
  const zones = {};
  const nearby = notesInWindow(notes, beat, beat + ahead + reach, longest);
  for (const hand of ["right", "left"]) {
    const mine = nearby
      .filter((n) => (n.hand === "left" ? "left" : "right") === hand)
      .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    if (!mine.length) continue;
    const start = Math.max(beat, mine[0].beat);
    const resting = mine[0].beat > beat + reach + EPS;
    const now = mine.filter((n) => n.beat <= start + reach + EPS);
    let lo = Math.min(...now.map((n) => n.midi));
    let hi = Math.max(...now.map((n) => n.midi));
    const later = mine.filter((n) => n.beat > start + reach + EPS);
    const jump = later.find((n) => n.midi < lo - leap || n.midi > hi + leap);
    let next = null;
    if (jump && jump.beat <= beat + ahead + EPS) {
      const group = later.filter(
        (n) => n.beat >= jump.beat - EPS && n.beat <= jump.beat + reach + EPS,
      );
      next = {
        lo: Math.min(...group.map((n) => n.midi)),
        hi: Math.max(...group.map((n) => n.midi)),
        beat: jump.beat,
      };
    }
    zones[hand] = { lo, hi, resting, next };
  }
  return zones;
}

export const longestNote = (notes) =>
  (notes || []).reduce((m, n) => Math.max(m, n.duration || 0), 0);

// Index of the first note starting at or after `beat` in a beat-sorted list.
function lowerBound(notes, beat) {
  let lo = 0,
    hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].beat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Notes overlapping [from, to) in a beat-sorted list. `longest` bounds how far
// back a note can start and still be sounding, so long scores stay cheap.
export function notesInWindow(notes, from, to, longest = longestNote(notes)) {
  const out = [];
  if (!notes?.length || !(to > from)) return out;
  for (let i = lowerBound(notes, from - longest - EPS); i < notes.length; i++) {
    const n = notes[i];
    if (n.beat >= to) break;
    if (n.beat + n.duration > from + EPS) out.push(n);
  }
  return out;
}

// What each key should show at `beat`: a note sounding now (with the share of
// its length still to hold) and the closest note arriving within `ahead`
// beats (1 at the moment it lands). Keyed by MIDI pitch.
export function keyLights(notes, beat, { ahead = 2, longest } = {}) {
  const lights = new Map();
  const reach = Math.max(EPS, ahead);
  for (const n of notesInWindow(notes, beat, beat + reach + EPS, longest)) {
    const light = lights.get(n.midi) || {
      midi: n.midi,
      hand: n.hand,
      velocity: n.velocity ?? 0.72,
      on: false,
      hold: 0,
      soon: 0,
      soonHand: null,
    };
    const end = n.beat + n.duration;
    if (n.beat <= beat + EPS && end > beat + EPS) {
      const hold = Math.min(1, Math.max(0, (end - beat) / n.duration));
      if (!light.on || hold > light.hold) {
        light.on = true;
        light.hold = hold;
        light.hand = n.hand;
        light.velocity = n.velocity ?? 0.72;
      }
    } else if (n.beat > beat + EPS) {
      const soon = Math.max(0, Math.min(1, 1 - (n.beat - beat) / reach));
      if (soon > light.soon) {
        light.soon = soon;
        light.soonHand = n.hand;
        if (!light.on) light.velocity = n.velocity ?? 0.72;
      }
    }
    lights.set(n.midi, light);
  }
  return lights;
}

// Written dynamics arrive as MIDI-style velocities (MusicXML dynamics × 0.9 / 127).
// The cut points sit halfway between the standard marks.
const MARKS = [
  [0.32, "pp"],
  [0.44, "p"],
  [0.57, "mp"],
  [0.69, "mf"],
  [0.82, "f"],
];
export function dynamicMark(velocity) {
  const v = Number.isFinite(velocity) ? velocity : 0.72;
  for (const [limit, mark] of MARKS) if (v < limit) return mark;
  return "ff";
}
// Imports without dynamics give every note the same default loudness; only
// show a marking when the score actually varies or states one.
export function hasDynamics(notes) {
  const seen = new Set();
  for (const n of notes || []) {
    seen.add(Math.round((n.velocity ?? 0.72) * 100));
    if (seen.size > 1) return true;
  }
  return seen.size === 1 && !seen.has(72);
}
// Accented notes (a written sf, fz or accent): played noticeably louder than
// the same hand's music on both sides, at least `lift` above the median
// loudness of that hand's notes within `window` beats before and after. A
// crescendo rises evenly, so it is never louder than what follows it.
export function accentedNotes(notes, { window = 2, lift = 0.1 } = {}) {
  const accented = new Set();
  const median = (list) => {
    const sorted = list.map((x) => x.velocity).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  for (const hand of ["left", "right"]) {
    const list = (notes || [])
      .filter(
        (n) =>
          (n.hand === "left" ? "left" : "right") === hand &&
          Number.isFinite(n.velocity),
      )
      .sort((a, b) => a.beat - b.beat);
    let lo = 0,
      hi = 0;
    for (const n of list) {
      while (list[lo].beat < n.beat - window) lo++;
      while (hi < list.length && list[hi].beat <= n.beat + window) hi++;
      const around = list.slice(lo, hi);
      const before = around.filter((x) => x.beat < n.beat - 1e-6);
      const after = around.filter((x) => x.beat > n.beat + 1e-6);
      if (!before.length || !after.length) continue;
      if (
        n.velocity >= median(before) + lift &&
        n.velocity >= median(after) + lift
      )
        accented.add(n.id);
    }
  }
  return accented;
}
// The written dynamics as marks along the piece: each level where it settles
// (p, mf, ff…), and a hairpin where the music swells or fades from one level
// to the next. Levels come from the notes' written loudness (the loudest
// note at each moment, accents aside), smoothed over a beat either side.
const LEVELS = ["pp", "p", "mp", "mf", "f", "ff"];
export function dynamicMarks(
  notes,
  { accents = accentedNotes(notes), settle = 2, ramp = 1.5 } = {},
) {
  const byBeat = new Map();
  for (const n of notes || []) {
    if (!Number.isFinite(n.velocity) || accents.has(n.id)) continue;
    const key = Math.round(n.beat * 1000) / 1000;
    byBeat.set(key, Math.max(byBeat.get(key) ?? 0, n.velocity));
  }
  const onsets = [...byBeat].sort((a, b) => a[0] - b[0]);
  if (!onsets.length) return [];
  let lo = 0,
    hi = 0;
  const levels = onsets.map(([beat]) => {
    while (onsets[lo][0] < beat - 1) lo++;
    while (hi < onsets.length && onsets[hi][0] <= beat + 1) hi++;
    const around = onsets
      .slice(lo, hi)
      .map(([, v]) => v)
      .sort((a, b) => a - b);
    return { beat, mark: dynamicMark(around[Math.floor(around.length / 2)]) };
  });
  // Runs of one mark; a run shorter than `settle` beats is a passing step.
  const runs = [];
  for (const { beat, mark } of levels) {
    const last = runs.at(-1);
    if (last && last.mark === mark) last.end = beat;
    else runs.push({ mark, start: beat, end: beat });
  }
  const pieceEnd = onsets.at(-1)[0];
  const settled = runs.filter(
    (r, i) => (runs[i + 1]?.start ?? pieceEnd + settle) - r.start >= settle,
  );
  let merged = [];
  for (const r of settled) {
    const last = merged.at(-1);
    if (last && last.mark === r.mark) last.end = r.end;
    else merged.push({ ...r });
  }
  // A short level on the way from one level to another (p, mp, mf, f over a
  // few bars) is a step of a crescendo or diminuendo, not a marking.
  const rank = (r) => LEVELS.indexOf(r.mark);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 1; i < merged.length - 1; i++) {
      const [a, b, c] = [merged[i - 1], merged[i], merged[i + 1]];
      const short = c.start - b.start < 2 * settle;
      const passing =
        (rank(a) < rank(b) && rank(b) < rank(c)) ||
        (rank(a) > rank(b) && rank(b) > rank(c));
      if (short && passing) {
        merged = [...merged.slice(0, i), ...merged.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  const between = (a, b) => {
    let count = 0;
    for (const [beat] of onsets) if (beat > a + 1e-6 && beat < b - 1e-6) count++;
    return count;
  };
  const marks = [];
  merged.forEach((r, i) => {
    const prev = merged[i - 1];
    // Several steps between two levels are a hairpin; a rest is not.
    if (prev && r.start - prev.end >= ramp && between(prev.end, r.start) >= 2)
      marks.push({
        kind:
          LEVELS.indexOf(r.mark) > LEVELS.indexOf(prev.mark) ? "cresc" : "dim",
        beat: prev.end,
        end: r.start,
      });
    marks.push({ kind: "level", beat: r.start, mark: r.mark });
  });
  return marks;
}
// The sustain pedal at a beat: the span holding it down, if any.
export function pedalAt(pedals, beat) {
  for (const p of pedals || [])
    if (p.start <= beat + 1e-6 && beat < p.end - 1e-6) return p;
  return null;
}
// Spread the piece's own loudness range over a visible brightness range.
export function velocityScale(notes) {
  let low = Infinity,
    high = -Infinity;
  for (const n of notes || []) {
    const v = n.velocity ?? 0.72;
    if (v < low) low = v;
    if (v > high) high = v;
  }
  if (!(high > low + 0.01)) return () => 0.85;
  return (v) =>
    0.55 + 0.45 * Math.max(0, Math.min(1, ((v ?? 0.72) - low) / (high - low)));
}

// Judge one key press for the keyboard's instant feedback.
// perform: against the written onsets with the report card's windows;
// wait: against the notes the cursor is waiting for;
// listen: against notes sounding or starting near the press; otherwise neutral.
export function judgePress({
  midi,
  beat,
  mode,
  notes = [],
  targets = [],
  secondsPerBeat = 0.5,
}) {
  if (mode === "wait")
    return targets.some((n) => n.midi === midi)
      ? { kind: "hit" }
      : { kind: "miss" };
  const windows = timingWindows(secondsPerBeat);
  let best = null;
  for (const n of notesInWindow(
    notes,
    beat - windows.accept,
    beat + windows.accept + EPS,
  )) {
    if (n.midi !== midi) continue;
    const dt = beat - n.beat;
    if (Math.abs(dt) <= windows.accept + EPS) {
      if (!best || Math.abs(dt) < Math.abs(best)) best = dt;
    } else if (mode === "listen" && n.beat <= beat && n.beat + n.duration > beat)
      best ??= 0;
  }
  if (mode === "listen")
    return best === null ? { kind: "play" } : { kind: "hit", dt: best };
  if (best === null) return { kind: "miss" };
  if (Math.abs(best) <= windows.onTime + EPS) return { kind: "hit", dt: best };
  return { kind: best < 0 ? "early" : "late", dt: best };
}
