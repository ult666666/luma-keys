// Tempo over the course of a score. A score may carry `tempos`, a list of
// { beat, bpm } changes (the first normally at beat 0); without it, `bpm`
// holds for the whole piece. Times here are score seconds at 100% speed,
// counted from beat 0. Before beat 0 (a count-in) the opening tempo holds.
const EPS = 1e-9;
const cache = new WeakMap();

export function tempoMap(score) {
  if (score && typeof score === "object") {
    const hit = cache.get(score);
    if (hit) return hit;
  }
  const opening =
    Number.isFinite(score?.bpm) && score.bpm > 0 ? score.bpm : 120;
  const changes = (Array.isArray(score?.tempos) ? score.tempos : [])
    .filter(
      (t) =>
        Number.isFinite(t?.beat) &&
        t.beat >= 0 &&
        Number.isFinite(t?.bpm) &&
        t.bpm >= 10 &&
        t.bpm <= 500,
    )
    .slice()
    .sort((a, b) => a.beat - b.beat);
  const map = [{ beat: 0, bpm: opening, at: 0 }];
  for (const change of changes) {
    const last = map.at(-1);
    if (change.beat <= last.beat + EPS) {
      // Several marks at one moment: the last one written wins.
      last.bpm = change.bpm;
      continue;
    }
    if (Math.abs(change.bpm - last.bpm) < 1e-9) continue;
    map.push({
      beat: change.beat,
      bpm: change.bpm,
      at: last.at + ((change.beat - last.beat) * 60) / last.bpm,
    });
  }
  if (score && typeof score === "object") cache.set(score, map);
  return map;
}

function segmentAtBeat(map, beat) {
  let lo = 0,
    hi = map.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (map[mid].beat <= beat + EPS) lo = mid;
    else hi = mid - 1;
  }
  return map[lo];
}
function segmentAtTime(map, seconds) {
  let lo = 0,
    hi = map.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (map[mid].at <= seconds + EPS) lo = mid;
    else hi = mid - 1;
  }
  return map[lo];
}

// Score seconds (at 100% speed) from beat 0 to `beat`.
export function secondsAt(score, beat) {
  const map = tempoMap(score);
  if (!(beat > 0)) return ((beat || 0) * 60) / map[0].bpm;
  const s = segmentAtBeat(map, beat);
  return s.at + ((beat - s.beat) * 60) / s.bpm;
}

// The beat reached after `seconds` of score time from beat 0.
export function beatAtSeconds(score, seconds) {
  const map = tempoMap(score);
  if (!(seconds > 0)) return ((seconds || 0) * map[0].bpm) / 60;
  const s = segmentAtTime(map, seconds);
  return s.beat + ((seconds - s.at) * s.bpm) / 60;
}

// Output latency can put the audible clock before a resumed phrase starts.
// Keep the reader at its start until that audio arrives, rather than briefly
// turning back a page. Count-ins still begin at their negative origin.
export function audibleTransportBeat(transport, score, speed, audibleTime) {
  return Math.max(
    transport.origin,
    beatAtSeconds(
      score,
      transport.originAt + Math.max(0, audibleTime - transport.start) * speed,
    ),
  );
}

// Quarter-note tempo in force at a beat.
export function bpmAt(score, beat) {
  return segmentAtBeat(tempoMap(score), Math.max(0, beat || 0)).bpm;
}

export const hasTempoChanges = (score) => tempoMap(score).length > 1;

// Real seconds between two beats at a practice speed (1 = as written).
export const secondsBetween = (score, from, to, speed = 1) =>
  (secondsAt(score, to) - secondsAt(score, from)) / (speed > 0 ? speed : 1);

// The hands' clock: beats ↔ real seconds at a practice speed, so a hand's
// motion can be planned in the seconds a player actually has. Before beat 0
// (a count-in) the count-in's own rate applies when one is given. Memoised
// per score object and (speed, count-in rate), so `key` identifies the
// mapping and callers can cache plans by it.
const clocks = new WeakMap();
const NIL = {};
export function clockMap(score, speed = 1, countInSecondsPerBeat = null) {
  const rate = speed > 0 && Number.isFinite(speed) ? speed : 1;
  const count =
    Number.isFinite(countInSecondsPerBeat) && countInSecondsPerBeat > 0
      ? countInSecondsPerBeat
      : null;
  const owner = score && typeof score === "object" ? score : NIL;
  let byKey = clocks.get(owner);
  if (!byKey) clocks.set(owner, (byKey = new Map()));
  const key = `${score?.id ?? "nil"}|${rate}|${count ?? ""}`;
  let clock = byKey.get(key);
  if (clock) return clock;
  clock = {
    key,
    speed: rate,
    toSeconds: (beat) =>
      beat < 0 && count != null
        ? beat * count
        : secondsAt(score, beat) / rate,
    toBeat: (seconds) =>
      seconds < 0 && count != null
        ? seconds / count
        : beatAtSeconds(score, seconds * rate),
  };
  byKey.set(key, clock);
  return clock;
}

// Every distinct tempo, in order, for display ("♩ = 144 → 176").
export function tempoSummary(score) {
  const map = tempoMap(score);
  return map.map((s) => Math.round(s.bpm));
}
