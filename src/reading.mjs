import { barStart, barEnd, measureAt } from "./music.mjs";

const EPS = 1e-6;
const lowerBound = (list, value, read = (n) => n) => {
  let lo = 0,
    hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (read(list[mid]) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// Construct this once per score/hand filter, not on every transport frame.
// Identical pitches at the same onset share one visual hold of the longest
// duration. Their sounding interval is unchanged (e.g. doubled piano voices).
export function indexReadingNotes(notes = []) {
  const hands = { right: [], left: [] };
  const sorted = notes
    .filter(
      (n) =>
        Number.isFinite(n.beat) &&
        n.beat >= 0 &&
        Number.isFinite(n.duration) &&
        n.duration > 0 &&
        Number.isInteger(n.midi),
    )
    .slice()
    .sort((a, b) => a.beat - b.beat || b.midi - a.midi);
  const seen = new Map();
  const onsets = [];
  let visualBeat = -Infinity;
  for (const n of sorted) {
    if (n.beat - visualBeat > EPS) {
      visualBeat = n.beat;
      onsets.push(visualBeat);
    }
    const hand = n.hand === "left" ? "left" : "right";
    const key = `${hand}:${visualBeat}:${n.midi}`;
    const prior = seen.get(key);
    if (prior)
      prior.duration = Math.max(
        prior.duration,
        n.beat + n.duration - prior.beat,
      );
    else {
      // The original onset remains intact for playback, seeking and duration.
      // Only visual grouping absorbs floating-point noise in simultaneous notes.
      const note = { ...n, hand, readingBeat: visualBeat };
      hands[hand].push(note);
      seen.set(key, note);
    }
  }
  for (const hand of Object.values(hands)) {
    let max = 0;
    hand.maxEnds = hand.map((n) => (max = Math.max(max, n.beat + n.duration)));
  }
  return { hands, onsets };
}

export function readingNotesBetween(index, hand, start, end) {
  const notes = index.hands[hand] || [];
  const first = lowerBound(notes.maxEnds || [], start + EPS);
  const last = lowerBound(notes, end - EPS, (n) => n.beat);
  return notes
    .slice(first, last)
    .filter((n) => n.beat + n.duration > start + EPS);
}

// Page by real measures, including pickups and changes of meter. Particularly
// dense pages split at note onsets so even a long imported score stays bounded.
export function readingPassage(
  score,
  index,
  beat = 0,
  barsPerPage = 4,
  maxOnsets = 32,
) {
  const measures = Math.max(1, Math.floor(score.measures || 1));
  const bar = Math.min(measures, measureAt(score, Math.max(0, beat)));
  const firstBar = Math.floor((bar - 1) / barsPerPage) * barsPerPage + 1;
  const lastBar = Math.min(measures, firstBar + barsPerPage - 1);
  const pageStart = barStart(score, firstBar);
  const pageEnd = barEnd(score, lastBar);
  // measureAt tolerates transport rounding; step clearly inside an exclusive
  // end boundary, including its meter-scaled fallback for old saved scores.
  const boundaryInset = Math.max(0.0001, (score.meter || 4) * 0.000004);
  const first = lowerBound(index.onsets, pageStart - EPS);
  const last = lowerBound(index.onsets, pageEnd - EPS);
  let start = pageStart,
    end = pageEnd;
  let detail = false;
  if (last - first > maxOnsets) {
    const at = Math.max(
      first,
      lowerBound(index.onsets, Math.max(pageStart, beat) + EPS) - 1,
    );
    const chunk = Math.floor((Math.min(at, last - 1) - first) / maxOnsets);
    const chunkStart = first + chunk * maxOnsets;
    start = chunk === 0 ? pageStart : index.onsets[chunkStart];
    end =
      chunkStart + maxOnsets < last
        ? index.onsets[chunkStart + maxOnsets]
        : pageEnd;
    detail = true;
  }
  return {
    start,
    end,
    firstBar: Math.min(measures, measureAt(score, start)),
    lastBar: Math.min(
      measures,
      measureAt(score, Math.max(start, end - boundaryInset)),
    ),
    previous: start > EPS ? start - boundaryInset : null,
    next: end < barEnd(score, measures) - EPS ? end : null,
    detail,
  };
}

export function readingBars(score, passage) {
  const result = [];
  for (let bar = passage.firstBar; bar <= passage.lastBar; bar++) {
    result.push({
      bar,
      start: Math.max(passage.start, barStart(score, bar)),
      end: Math.min(passage.end, barEnd(score, bar)),
      continuation: barStart(score, bar) < passage.start - EPS,
    });
  }
  return result;
}

export function readingGroups(notes, start, end) {
  const byBeat = new Map();
  const heldPitches = new Map();
  let visualBeat = -Infinity;
  for (const note of notes
    .slice()
    .sort((a, b) => (a.readingBeat ?? a.beat) - (b.readingBeat ?? b.beat))) {
    const onset = Math.max(start, note.readingBeat ?? note.beat);
    if (onset - visualBeat > EPS) visualBeat = onset;
    const at = visualBeat;
    if (note.beat < start - EPS) {
      // Overlapping voices of one held pitch share a single sounding key.
      // Keep the voice that lasts longest; never render thousands of duplicate
      // continuations from an unusually dense imported score.
      const held = heldPitches.get(note.midi);
      if (held) {
        if (note.beat + note.duration > held.note.beat + held.note.duration)
          held.group.notes[held.index] = held.note = note;
        continue;
      }
    }
    const key = at;
    let group = byBeat.get(key);
    if (!group) byBeat.set(key, (group = { beat: at, held: true, notes: [] }));
    if (note.beat >= start - EPS) group.held = false;
    else heldPitches.set(note.midi, { group, index: group.notes.length, note });
    group.notes.push(note);
  }
  return [...byBeat.values()]
    .sort((a, b) => a.beat - b.beat || Number(b.held) - Number(a.held))
    .map((g) => ({
      ...g,
      notes: g.notes.sort((a, b) => b.midi - a.midi),
      end: Math.min(end, Math.max(...g.notes.map((n) => n.beat + n.duration))),
    }));
}

// Readable spacing is piecewise rather than globally proportional: a brief
// ornament in a long bar still gets a full card. Every time-based visual uses
// this same monotonic mapping, so cursor, bars and silent intervals agree.
export function readingSpacing(
  start,
  end,
  onsets,
  minimumWidth = 500,
  minimumGap = 48,
) {
  const times = [start];
  for (const at of onsets.slice().sort((a, b) => a - b)) {
    if (at > times.at(-1) + EPS && at < end - EPS) times.push(at);
  }
  times.push(Math.max(start + EPS, end));
  const pixels = [0];
  for (let i = 1; i < times.length; i++) {
    pixels.push(
      pixels.at(-1) +
        Math.max(minimumGap, Math.min(144, (times[i] - times[i - 1]) * 48)),
    );
  }
  const naturalWidth = pixels.at(-1);
  const width = Math.max(minimumWidth, naturalWidth);
  const position = (beat) => {
    if (beat <= start) return 0;
    if (beat >= end) return 1;
    const i = Math.max(1, lowerBound(times, beat));
    const fraction = (beat - times[i - 1]) / (times[i] - times[i - 1]);
    return (
      (pixels[i - 1] + fraction * (pixels[i] - pixels[i - 1])) / naturalWidth
    );
  };
  return { width, times, position };
}

export function readingNoteDisplay(note, start) {
  const held = note.beat < start - EPS;
  return {
    held,
    seekBeat: Math.max(start, note.beat),
    duration: held
      ? Math.max(0, note.beat + note.duration - start)
      : note.duration,
  };
}

// A rest is only shown where this entire hand is silent. This avoids inventing
// rests between onsets when a sustained voice is still sounding.
export function readingRests(notes, start, end) {
  const intervals = notes
    .map((n) => [Math.max(start, n.beat), Math.min(end, n.beat + n.duration)])
    .filter(([a, b]) => b > a + EPS)
    .sort((a, b) => a[0] - b[0]);
  const result = [];
  let cursor = start;
  for (const [from, to] of intervals) {
    if (from > cursor + EPS)
      result.push({ beat: cursor, duration: from - cursor });
    cursor = Math.max(cursor, to);
  }
  if (cursor < end - EPS) result.push({ beat: cursor, duration: end - cursor });
  return result;
}

// Values are quarter-note lengths, independent of a time signature's pulse.
export function readingDuration(duration) {
  const fractions = [
    [1 / 8, "⅛"],
    [1 / 6, "⅙"],
    [1 / 4, "¼"],
    [1 / 3, "⅓"],
    [1 / 2, "½"],
    [2 / 3, "⅔"],
    [3 / 4, "¾"],
  ];
  const whole = Math.floor(duration + EPS);
  const remainder = duration - whole;
  if (Math.abs(remainder) < EPS * 2) return String(whole);
  const fraction = fractions.find(
    ([value]) => Math.abs(value - remainder) < 0.00001,
  );
  if (fraction) return `${whole || ""}${fraction[1]}`;
  return String(Math.round(duration * 1000) / 1000);
}
