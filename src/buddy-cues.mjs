// Musical moments the companion reacts to while music plays: phrase ends
// (a nod and a breath), loud downbeats (a hop) and big right-hand leaps (a
// gasp). Built once per score and plan; the rAF loop only asks "did the
// clock cross a cue since the last frame?" with a binary search.
import { barEnd, barStart, measureAt } from "./music.mjs";

const sorted = (list) => list.sort((a, b) => a.beat - b.beat);

/** `{ phraseEnds, loud, leaps }`, each a beat-sorted array of
 * `{ beat, strength? }`. `plan` is the expressive performance plan (its
 * `phrases` are `{ first, last, strength }` in bars) or null. */
export function buildCues(score, plan = null) {
  const empty = { phraseEnds: [], loud: [], leaps: [] };
  if (!score || !Array.isArray(score.notes)) return empty;
  const measures = Math.max(1, score.measures || 1);
  const phraseEnds = [];
  if (plan?.phrases?.length)
    for (const p of plan.phrases)
      phraseEnds.push({ beat: barEnd(score, p.last) - 0.25, strength: p.strength ?? 0.7, bar: p.last });
  else
    for (let b = 4; b <= measures; b += 4)
      phraseEnds.push({ beat: barEnd(score, b) - 0.25, strength: b === measures ? 1 : 0.7, bar: b });

  // Loud downbeats: the strongest note sounding on the first beat of a bar.
  const downbeat = new Map();
  for (const n of score.notes) {
    const bar = n.measure ?? measureAt(score, n.beat);
    if (Math.abs(n.beat - barStart(score, bar)) > 1e-3) continue;
    const v = plan?.notes?.get?.(n.id)?.velocity ?? n.velocity ?? 0.7;
    downbeat.set(bar, Math.max(downbeat.get(bar) ?? 0, v));
  }
  const loud = [];
  for (const [bar, v] of downbeat) if (v >= 0.82) loud.push({ beat: barStart(score, bar), bar, strength: v });

  // Leaps in the right hand's top voice: ≥ 10 semitones within a beat,
  // flagged half a beat early so the gasp lands as the leap does.
  const tops = new Map();
  for (const n of score.notes) {
    if (n.hand && n.hand !== "right") continue;
    const at = Math.round(n.beat * 1000) / 1000;
    if ((tops.get(at) ?? -1) < n.midi) tops.set(at, n.midi);
  }
  const onsets = [...tops].sort((a, b) => a[0] - b[0]);
  const leaps = [];
  for (let i = 1; i < onsets.length; i++) {
    const [b0, m0] = onsets[i - 1],
      [b1, m1] = onsets[i];
    if (b1 - b0 <= 1 + 1e-6 && Math.abs(m1 - m0) >= 10)
      leaps.push({ beat: Math.max(0, b1 - 0.5), size: Math.abs(m1 - m0) });
  }
  return { phraseEnds: sorted(phraseEnds), loud: sorted(loud), leaps: sorted(leaps) };
}

/** The first cue in `list` with from < beat ≤ to, or null. */
export function cueBetween(list, from, to) {
  if (!list?.length || !(to > from)) return null;
  let lo = 0,
    hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid].beat <= from) lo = mid + 1;
    else hi = mid;
  }
  return lo < list.length && list[lo].beat <= to ? list[lo] : null;
}

/** Beat-locked bob: 0 at each beat, 1 halfway. */
export function beatBob(beat) {
  const phase = beat - Math.floor(beat);
  return Math.sin(phase * Math.PI) ** 2;
}

/** Streak bookkeeping from verdicts: hit, early and late extend the run, a
 * miss resets it. Returns the new run and any milestone reached. */
export function streakStep(run, kind) {
  if (kind === "miss") return { run: 0, milestone: null };
  const next = run + 1;
  return { run: next, milestone: [10, 25, 50, 100, 200].includes(next) ? next : null };
}

/** The ending reaction for a graded run. `accuracy` is 0..1. */
export function endingFor({ accuracy = 0, complete = false, best = false } = {}) {
  const tier = !complete
    ? "keepgoing"
    : accuracy >= 0.95
      ? "ovation"
      : accuracy >= 0.85
        ? "great"
        : accuracy >= 0.65
          ? "good"
          : "keepgoing";
  return { tier, line: best && tier !== "keepgoing" ? "finish:best" : `finish:${tier}`, best };
}
