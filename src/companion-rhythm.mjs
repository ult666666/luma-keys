const patterns = [
  ["beethoven", "Quick start", [0, 0.5, 1, 2]],
  ["langlang", "Skip and step", [0, 0.5, 1.5, 2, 3]],
  ["mozart", "Light steps", [0, 1, 1.5, 2.5, 3]],
  ["liszt", "Quick pairs", [0, 0.5, 1, 2, 2.5, 3]],
  ["cat", "Steady paws", [0, 1, 2, 3]],
  ["bunny", "Little hops", [0, 0.5, 2, 2.5]],
].map(([id, title, onsets]) =>
  Object.freeze({ id, title, onsets: Object.freeze(onsets), beats: 4 }),
);

export function rhythmFor(character) {
  return patterns.find((pattern) => pattern.id === character) || patterns[0];
}

const finiteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

function validPattern(pattern) {
  return (
    pattern?.beats === 4 &&
    Array.isArray(pattern.onsets) &&
    pattern.onsets.length >= 2 &&
    pattern.onsets.length <= 32 &&
    pattern.onsets[0] === 0 &&
    Array.from(pattern.onsets).every(
      (onset, index, onsets) =>
        finiteNumber(onset) &&
        onset >= 0 &&
        onset < 4 &&
        (!index || onset > onsets[index - 1]),
    )
  );
}

const missingMarks = (total) =>
  Array.from({ length: total }, (_, index) => ({
    index,
    offsetMs: null,
    kind: "missing",
  }));

function rejected(total, summary) {
  return {
    complete: false,
    marks: missingMarks(total),
    matched: 0,
    total,
    meanErrorMs: null,
    summary,
  };
}

// With a missed tap, find the nearest ordered subset of the pattern. Later
// correct taps then stay attached to their beats instead of shifting left.
function alignTaps(onsets, taps, beatMs) {
  const costs = Array.from({ length: onsets.length + 1 }, () =>
    Array(taps.length + 1).fill(Infinity),
  );
  const take = Array.from({ length: onsets.length + 1 }, () =>
    Array(taps.length + 1).fill(false),
  );
  costs[1][1] = 0;
  for (let note = 2; note <= onsets.length; note++) {
    for (let tap = 1; tap <= Math.min(note, taps.length); tap++) {
      costs[note][tap] = costs[note - 1][tap];
      if (tap < 2) continue;
      const error = Math.abs(taps[tap - 1] - onsets[note - 1] * beatMs);
      const candidate = costs[note - 1][tap - 1] + error;
      if (candidate < costs[note][tap]) {
        costs[note][tap] = candidate;
        take[note][tap] = true;
      }
    }
  }
  const assignment = new Map([[0, 0]]);
  let tap = taps.length;
  for (let note = onsets.length; note > 1; note--) {
    if (take[note][tap]) assignment.set(note - 1, --tap);
  }
  return assignment;
}

/**
 * Grade a completed or partial four-beat attempt. The first tap is the origin,
 * not a reaction-time test. `complete` describes tap coverage; `matched` counts
 * on-time taps. Error is signed per mark and absolute on average, excluding the
 * anchor. Missing marks have null offsets; absent timing has a null mean.
 */
export function gradeRhythm(pattern, tapsMs, bpm) {
  if (!validPattern(pattern))
    return rejected(0, "Choose a four-beat pattern and try again.");
  const total = pattern.onsets.length;
  if (!finiteNumber(bpm) || bpm < 30 || bpm > 240)
    return rejected(total, "Choose a tempo from 30 to 240 BPM and try again.");
  if (
    !Array.isArray(tapsMs) ||
    tapsMs.length > total ||
    !Array.from(tapsMs).every(
      (tap, index, taps) =>
        finiteNumber(tap) &&
        tap >= 0 &&
        tap <= Number.MAX_SAFE_INTEGER &&
        (!index || tap > taps[index - 1]),
    )
  )
    return rejected(total, "Start again and tap once for each marked note.");
  if (!tapsMs.length)
    return rejected(total, "Tap once to start, then follow the marked notes.");

  const beatMs = 60_000 / bpm;
  const taps = tapsMs.map((tap) => tap - tapsMs[0]);
  const assignment = alignTaps(pattern.onsets, taps, beatMs);
  const marks = missingMarks(total).map((mark) => {
    if (!assignment.has(mark.index)) return mark;
    const offsetMs =
      taps[assignment.get(mark.index)] - pattern.onsets[mark.index] * beatMs;
    return {
      index: mark.index,
      offsetMs,
      kind:
        Math.abs(offsetMs) <= beatMs * 0.18 + 1e-7
          ? "on-time"
          : offsetMs < 0
            ? "early"
            : "late",
    };
  });
  const measured = marks.filter(
    (mark) => mark.index > 0 && mark.offsetMs !== null,
  );
  const missing = marks.filter((mark) => mark.kind === "missing").length;
  const early = marks.some((mark) => mark.kind === "early");
  const late = marks.some((mark) => mark.kind === "late");
  const summary = missing
    ? `${missing} ${missing === 1 ? "tap is" : "taps are"} missing. Count all four beats and tap every marked note.`
    : early && late
      ? "Some taps are early and others late. Count evenly and try a slower tempo."
      : early
        ? "Your later taps arrive early. Wait for each marked beat before tapping."
        : late
          ? "Your later taps arrive late. Keep counting evenly through the pattern."
          : "Steady timing. Repeat at the same tempo.";
  return {
    complete: missing === 0,
    marks,
    matched: marks.filter((mark) => mark.kind === "on-time").length,
    total,
    meanErrorMs: measured.length
      ? measured.reduce((sum, mark) => sum + Math.abs(mark.offsetMs), 0) /
        measured.length
      : null,
    summary,
  };
}
