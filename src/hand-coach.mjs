// Concise reading cues for the suggested fingering, not a judgement of the
// player's technique. Pitch names stay separate from finger numbers 1–5.
import { noteName } from "./music.mjs";

export const FINGER_NAMES = Object.freeze({
  1: "thumb",
  2: "index",
  3: "middle",
  4: "ring",
  5: "little",
});

const EPS = 1e-6;
const indexes = new WeakMap();
const handOf = (note) => (note.hand === "left" ? "left" : "right");
const validFinger = (finger) =>
  Number.isInteger(finger) && finger >= 1 && finger <= 5;
const upperBound = (items, beat) => {
  let low = 0,
    high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle].beat <= beat) low = middle + 1;
    else high = middle;
  }
  return low;
};

// Score note arrays are immutable: replacing them after edits rebuilds this
// index. Clock ticks then inspect at most 88 pitch streams per hand instead of
// scanning a long score. Finger maps are read afresh, so revised suggestions
// do not require rebuilding timing information.
function indexNotes(notes) {
  let index = indexes.get(notes);
  if (index) return index;
  index = {};
  for (const hand of ["right", "left"]) {
    const sorted = notes
      .filter(
        (n) =>
          handOf(n) === hand &&
          Number.isInteger(n.midi) &&
          n.midi >= 21 &&
          n.midi <= 108 &&
          Number.isFinite(n.beat) &&
          Number.isFinite(n.duration) &&
          n.duration > EPS,
      )
      .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    const groups = [];
    const pitches = new Map();
    for (let i = 0; i < sorted.length;) {
      const beat = sorted[i].beat;
      const unisons = new Map();
      for (; i < sorted.length && sorted[i].beat - beat < EPS; i++) {
        const note = sorted[i];
        const same = unisons.get(note.midi);
        if (same) {
          same.ids.push(note.id);
          same.end = Math.max(same.end, note.beat + note.duration);
        } else
          unisons.set(note.midi, {
            ids: [note.id],
            midi: note.midi,
            beat,
            end: note.beat + note.duration,
          });
      }
      const keys = [...unisons.values()].sort((a, b) => a.midi - b.midi);
      for (const key of keys) {
        key.ids = [...new Set(key.ids)];
        const stream = pitches.get(key.midi) || [];
        // Reattacking a key replaces its previous hold. It must not reappear
        // after the newer, shorter note is released.
        if (stream.length)
          stream.at(-1).end = Math.min(stream.at(-1).end, beat);
        stream.push(key);
        pitches.set(key.midi, stream);
      }
      groups.push({ beat, keys });
    }
    index[hand] = { groups, pitches };
  }
  indexes.set(notes, index);
  return index;
}

function physicalKeysAt(index, beat) {
  const keys = [];
  for (const stream of index.pitches.values()) {
    const key = stream[upperBound(stream, beat + EPS) - 1];
    if (key && key.end > beat + EPS) keys.push(key);
  }
  return keys.sort((a, b) => a.midi - b.midi);
}

function hasNotesInRange(index, start, end) {
  for (const stream of index.pitches.values()) {
    const after = upperBound(stream, start + EPS);
    const previous = stream[after - 1];
    const key =
      previous && previous.end > start + EPS ? previous : stream[after];
    if (key && key.beat < end - EPS) return true;
  }
  return false;
}

function cuesFor(
  keys,
  fingering,
  now,
  phase,
  { start, end, flats, attackWindow },
) {
  const cues = keys.map((key) => {
    const guesses = key.ids.map((id) => fingering?.get(id));
    const known = [...new Set(guesses.filter(validFinger))];
    const finger = known.length === 1 ? known[0] : null;
    const until = Math.min(key.end, end);
    return {
      ids: [...key.ids],
      midi: key.midi,
      label: noteName(key.midi, flats),
      finger,
      fingerName: finger == null ? null : FINGER_NAMES[finger],
      phase:
        phase === "next"
          ? "next"
          : now - key.beat <= attackWindow + EPS
            ? "attack"
            : "hold",
      beat: key.beat,
      end: until,
      remainingBeats: Math.max(0, until - Math.max(now, key.beat, start)),
    };
  });
  // A stale or external fingering map may put one finger on two keys. Show
  // both pitches without that contradictory suggestion; never invent a fix.
  const uses = new Map();
  for (const cue of cues)
    if (cue.finger != null)
      uses.set(cue.finger, (uses.get(cue.finger) || 0) + 1);
  for (const cue of cues)
    if (uses.get(cue.finger) > 1) {
      cue.finger = null;
      cue.fingerName = null;
    }
  return cues;
}

/**
 * Current and next physical keys, separately for each hand.
 *
 * `play` means at least one current note began within attackWindow beats;
 * other current notes can still have phase `hold`. `next` means no note is
 * sounding in that hand. Missing suggestions use null, never a guessed finger.
 * `start`/`end` optionally limit a phrase; notes crossing its start still hold.
 */
export function deriveHandCoach(notes, fingeringMap, beat, options = {}) {
  const {
    hand = "both",
    start = -Infinity,
    end = Infinity,
    flats = false,
    attackWindow = 0.125,
  } = options;
  const empty = () => ({
    state: "empty",
    current: [],
    upcoming: [],
    gapBeats: null,
    hasNotes: false,
  });
  const result = { right: empty(), left: empty() };
  if (!Array.isArray(notes) || !Number.isFinite(beat) || end <= start)
    return result;
  const index = indexNotes(notes);
  const settings = {
    start,
    end,
    flats,
    attackWindow: Math.max(0, attackWindow),
  };
  for (const side of ["right", "left"]) {
    if (hand !== "both" && hand !== side) continue;
    const mine = index[side];
    if (!hasNotesInRange(mine, start, end)) continue;
    const current =
      beat >= start - EPS && beat < end - EPS
        ? cuesFor(
            physicalKeysAt(mine, beat),
            fingeringMap,
            beat,
            "current",
            settings,
          )
        : [];
    let nextBeat = null,
      nextKeys = [];
    if (beat < end - EPS) {
      // Before a selected phrase, prepare its carried keys as well as any
      // attack on its first beat. No cue leaks out of the repeated interval.
      if (Number.isFinite(start) && beat < start - EPS) {
        nextKeys = physicalKeysAt(mine, start);
        if (nextKeys.length) nextBeat = start;
      }
      if (nextBeat == null) {
        const nextIndex = Math.max(
          upperBound(mine.groups, beat + EPS),
          upperBound(mine.groups, start - EPS * 2),
        );
        const next = mine.groups[nextIndex];
        if (next && next.beat < end - EPS) {
          nextBeat = next.beat;
          nextKeys = next.keys;
        }
      }
    }
    const upcoming = cuesFor(nextKeys, fingeringMap, beat, "next", settings);
    result[side] = {
      state: current.length
        ? current.some((n) => n.phase === "attack")
          ? "play"
          : "hold"
        : upcoming.length
          ? "next"
          : "rest",
      current,
      upcoming,
      gapBeats: nextBeat == null ? null : Math.max(0, nextBeat - beat),
      hasNotes: true,
    };
  }
  return result;
}

// While a hand is playing or holding, its next attack joins the strip
// ("Hold C 1 · Next E 3") once it is due within this many real seconds (at
// the practice speed), so the strip prepares it like the hands do.
export const NEXT_WITHIN_SECONDS = 1;

/** The cues one hand's strip shows: its current keys, plus the next attack
 * when it is near (`gapSeconds` real seconds away); otherwise what comes next. */
export function coachNotes(c, gapSeconds) {
  if (!c.current.length) return c.upcoming;
  const soon = gapSeconds != null && gapSeconds < NEXT_WITHIN_SECONDS;
  return soon ? [...c.current, ...c.upcoming] : c.current;
}

/** A compact strip without changing the full note-level cue data.
 * Only a complete, known voicing/fingering match can use a repeat cue.
 * Current attacks and holds stay visible; the cue still means a new attack. */
export function coachGuidance(c, gapSeconds) {
  const notes = coachNotes(c, gapSeconds);
  const repeat =
    c.current.length > 0 &&
    c.current.length === c.upcoming.length &&
    gapSeconds != null &&
    gapSeconds < NEXT_WITHIN_SECONDS &&
    c.current.every(
      (note) =>
        (note.phase === "attack" || note.phase === "hold") &&
        validFinger(note.finger) &&
        c.upcoming.some(
          (next) =>
            next.phase === "next" &&
            next.midi === note.midi &&
            next.finger === note.finger,
        ),
    );
  return repeat
    ? { notes: c.current, repeat: c.upcoming }
    : { notes, repeat: null };
}
