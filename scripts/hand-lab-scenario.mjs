// Shared by the hand lab page (scripts/hand-lab.html), the pose dumper
// (scripts/hand-lab-poses.mjs) and the lint (scripts/hand-lab-lint.mjs):
// one scenario → the same inputs the app gives the hands. Browser-safe (no
// node imports), so the lab page loads it through the dev server.
//
// Scenario JSON: { id?, title, bpm, tempos?: [{beat,bpm}], pedals?: [{start,end}],
//   notes: [{ id, midi, beat, duration, hand }], fingering?: { [noteId]: finger },
//   hands?: ["left","right"], speed?, low?, high?, passage? }
// Beats are scenario beats (re-based so the passage starts at 0; lead-in
// notes are negative). Without `fingering` each hand is fingered on its own
// notes with the app's fingerScore(), in the scenario's real seconds.
import { handTimeline, handPoses } from "../src/hand-pose.mjs";
import { fingerScore } from "../src/fingering.mjs";
import { secondsAt, clockMap } from "../src/tempo.mjs";

const handOf = (n) => (n.hand === "left" ? "left" : "right");

export function scenarioInputs(scenario, { speed } = {}) {
  const hands = scenario.hands || ["left", "right"];
  const notes = scenario.notes
    .map((n, i) => ({ id: n.id ?? `n${i}`, ...n }))
    .filter((n) => hands.includes(handOf(n)));
  const score = {
    id: scenario.id ?? scenario.passage?.scoreId ?? scenario.title ?? "scenario",
    bpm: scenario.bpm || 100,
    ...(Array.isArray(scenario.tempos) ? { tempos: scenario.tempos } : null),
    pedals: Array.isArray(scenario.pedals) ? scenario.pedals : [],
    duration: Math.max(...notes.map((n) => n.beat + n.duration)),
    notes,
  };
  let fingering;
  if (scenario.fingering) fingering = new Map(Object.entries(scenario.fingering).map(([id, f]) => [id, +f]));
  else fingering = fingerScore(notes, (b) => secondsAt(score, b));
  const steps = {
    left: hands.includes("left") ? handTimeline(notes, fingering, "left") : [],
    right: hands.includes("right") ? handTimeline(notes, fingering, "right") : [],
  };
  const rate = +(speed ?? scenario.speed ?? 1) || 1;
  const clock = clockMap(score, rate, null);
  const onsets = notes.map((n) => n.beat);
  const ends = notes.map((n) => n.beat + n.duration);
  return {
    scenario,
    notes,
    score,
    hands,
    fingering,
    steps,
    speed: rate,
    clock,
    firstBeat: Math.min(...onsets),
    lastBeat: Math.max(...onsets),
    endBeat: Math.max(...ends),
  };
}

// The handPoses option object the app would pass for this scenario.
export function poseOptions(inputs, geometry, extra = {}) {
  const { keyWidth, keysHeight, bedHeight } = geometry;
  return {
    keyWidth,
    keysHeight,
    bedHeight,
    reducedMotion: !!extra.reducedMotion,
    clock: inputs.clock,
    speed: inputs.speed,
    frozen: !!(extra.frozen || extra.waiting),
    waiting: !!extra.waiting,
    counting: !!extra.counting,
    settle: extra.settle ?? null,
    ahead: extra.ahead ?? inputs.scenario.ahead ?? null,
    pedals: inputs.score.pedals,
  };
}

// Both hands at a beat, as the app's frame loop computes them.
export function posesAt(inputs, beat, geometry, extra = {}) {
  return handPoses(inputs.steps, beat, poseOptions(inputs, geometry, extra));
}

// The lab's key geometry for a white-key width (px).
// (kh overrides the key height, for the app's flatter keyboard at a wide zoom;
// the bed keeps the same proportion to the keys.)
export const labGeometry = (kw, kh = null) =>
  kh ? { keyWidth: kw, keysHeight: kh, bedHeight: kh * (6.3 / 4.8) } : { keyWidth: kw, keysHeight: kw * 4.8, bedHeight: kw * 6.3 };

// Frames sampled uniformly in real seconds (fps) — the lint's default range is
// 1 s before the first onset to 0.5 s after the last written end — or in beats
// (dtBeats, the lab's own stepping). Each frame is { t, beat, left, right }.
export function sampleFrames(inputs, { fps = 120, dtBeats = null, fromBeat = null, toBeat = null, kw = 36, kh = null, extra = {} } = {}) {
  const geometry = labGeometry(kw, kh);
  const { clock } = inputs;
  const frames = [];
  if (dtBeats) {
    const from = fromBeat ?? inputs.firstBeat, to = toBeat ?? inputs.endBeat;
    for (let b = from; b <= to + 1e-9; b += dtBeats) {
      const beat = +b.toFixed(6);
      frames.push({ t: clock.toSeconds(beat), beat, ...posesAt(inputs, beat, geometry, extra) });
    }
    return frames;
  }
  const t0 = fromBeat != null ? clock.toSeconds(fromBeat) : clock.toSeconds(inputs.firstBeat) - 1;
  const t1 = toBeat != null ? clock.toSeconds(toBeat) : clock.toSeconds(inputs.endBeat) + 0.5;
  const n = Math.floor((t1 - t0) * fps + 1e-9);
  for (let k = 0; k <= n; k++) {
    const t = t0 + k / fps;
    const beat = clock.toBeat(t);
    frames.push({ t, beat, ...posesAt(inputs, beat, geometry, extra) });
  }
  return frames;
}
