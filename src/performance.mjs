// Grade a timed performance against the written notes. Pitch and timing are
// judged per note; bars summarize where the reading broke down.
import { measureAt } from "./music.mjs";

const EPS = 1e-6;

// Timing windows scale with tempo: at least a tenth of a beat and 100 ms for
// "on time", and at least four tenths of a beat and 250 ms to count at all.
export function timingWindows(secondsPerBeat) {
  const spb = secondsPerBeat > 0 ? secondsPerBeat : 0.5;
  return {
    onTime: Math.max(0.1, 0.1 / spb),
    accept: Math.max(0.4, 0.25 / spb),
  };
}

export function gradePerformance(
  expected,
  played,
  {
    score,
    start = 0,
    end = Infinity,
    stoppedAt = Infinity,
    secondsPerBeat = 0.5,
  } = {},
) {
  const windows = timingWindows(secondsPerBeat);
  const reached = Math.min(end, stoppedAt);
  const notes = expected
    .filter((n) => n.beat >= start - EPS && n.beat < end - EPS)
    .map((n) => ({
      id: n.id,
      midi: n.midi,
      beat: n.beat,
      hand: n.hand,
      bar: score ? measureAt(score, n.beat) : 1,
      status: n.beat <= reached + EPS ? "missed" : "unreached",
      dt: null,
    }))
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const attempts = played
    .filter((p) => Number.isInteger(p.midi) && Number.isFinite(p.beat))
    .map((p) => ({ midi: p.midi, beat: p.beat, matched: false }))
    .sort((a, b) => a.beat - b.beat);
  // Match closest pairs first, so a repeated pitch takes the nearest attempt.
  const pairs = [];
  for (const note of notes) {
    if (note.status === "unreached") continue;
    for (const attempt of attempts)
      if (attempt.midi === note.midi) {
        const dt = attempt.beat - note.beat;
        if (Math.abs(dt) <= windows.accept + EPS)
          pairs.push({ note, attempt, dt });
      }
  }
  pairs.sort(
    (a, b) => Math.abs(a.dt) - Math.abs(b.dt) || a.note.beat - b.note.beat,
  );
  for (const pair of pairs) {
    if (pair.note.dt !== null || pair.attempt.matched) continue;
    pair.attempt.matched = true;
    pair.note.dt = pair.dt;
    pair.note.status =
      Math.abs(pair.dt) <= windows.onTime + EPS
        ? "on"
        : pair.dt < 0
          ? "early"
          : "late";
  }
  const extras = attempts
    .filter(
      (a) =>
        !a.matched &&
        a.beat >= start - windows.accept &&
        a.beat <= reached + windows.accept,
    )
    .map((a) => ({
      midi: a.midi,
      beat: a.beat,
      bar: score ? measureAt(score, Math.max(0, a.beat)) : 1,
    }));
  const covered = notes.filter((n) => n.status !== "unreached");
  const count = (status) => covered.filter((n) => n.status === status).length;
  const matched = count("on") + count("early") + count("late");
  const offsets = covered.filter((n) => n.dt !== null).map((n) => n.dt);
  const bars = new Map();
  const barEntry = (bar) => {
    if (!bars.has(bar))
      bars.set(bar, {
        bar,
        total: 0,
        on: 0,
        early: 0,
        late: 0,
        missed: 0,
        extra: 0,
      });
    return bars.get(bar);
  };
  for (const note of covered) {
    const entry = barEntry(note.bar);
    entry.total++;
    entry[note.status]++;
  }
  for (const extra of extras) barEntry(extra.bar).extra++;
  const summary = [...bars.values()].sort((a, b) => a.bar - b.bar);
  for (const entry of summary)
    entry.problems =
      entry.missed * 2 + entry.extra + (entry.early + entry.late) * 0.5;
  let worst = null;
  const troubled = summary.filter((b) => b.problems > 0);
  if (troubled.length) {
    const top = troubled.reduce((a, b) => (b.problems > a.problems ? b : a));
    const before = summary.find((b) => b.bar === top.bar - 1);
    const after = summary.find((b) => b.bar === top.bar + 1);
    const neighbor =
      before?.problems > 0 && (!after || before.problems >= after.problems)
        ? before
        : after?.problems > 0
          ? after
          : null;
    worst = neighbor
      ? {
          first: Math.min(top.bar, neighbor.bar),
          last: Math.max(top.bar, neighbor.bar),
        }
      : { first: top.bar, last: top.bar };
  }
  return {
    total: covered.length,
    unreached: notes.length - covered.length,
    matched,
    on: count("on"),
    early: count("early"),
    late: count("late"),
    missed: count("missed"),
    extra: extras.length,
    accuracy: covered.length ? matched / covered.length : 0,
    precision: matched ? count("on") / matched : 0,
    // Mean signed offset in beats: positive means the notes arrived late.
    offset: offsets.length
      ? offsets.reduce((a, b) => a + b, 0) / offsets.length
      : 0,
    complete: stoppedAt >= end - EPS,
    windows,
    notes,
    extras,
    bars: summary,
    worst,
  };
}

// A run counts toward a level when it covers the whole exercise. Three recent
// clean runs suggest the next level; a weak run suggests staying.
export function levelAdvice(
  history,
  level,
  { runs = 3, target = 0.9, timing = 0.6 } = {},
) {
  const recent = history
    .filter((h) => h.level === level && h.complete !== false)
    .slice(-runs);
  if (recent.length < runs) return { ready: false, recent };
  const ready = recent.every(
    (h) => h.accuracy >= target * 100 - EPS && h.timing >= timing * 100 - EPS,
  );
  return { ready, recent };
}
