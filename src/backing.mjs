import { barStart, barEnd, measureAt, pulsePattern } from "./music.mjs";
import { planListenStart } from "./listen-start.mjs";
import { textureMap } from "./interpretation.mjs";

const EPS = 1e-6;
const MAX_NOTES = 50_000;
const MAX_EVENTS = 75_000;
const MAX_KIT_BARS = 10_000;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const STYLES = ["auto", "piano", "acoustic", "strings"];
const names = { piano: "Written piano", acoustic: "Acoustic backing", strings: "Soft strings" };

function popMetadata(score) {
  const metadata = [score.title, score.composer, score.genre, score.style]
    .filter((value) => typeof value === "string").join(" ").normalize("NFKD")
    .replace(/\p{M}/gu, "").toLowerCase();
  return /晴天|龙卷风|龍捲風|周杰伦|周杰倫|邓紫棋|鄧紫棋|\bsunny\s+day\b|\btornado\b|\bjay\s+chou\b|\bg\.?\s*e\.?\s*m\.?\b|\bpop\b/.test(metadata);
}

function timeline(score, duration, warnings) {
  const meter = Number.isFinite(score.meter) && score.meter > 0 && score.meter <= 32 ? score.meter : 4;
  const starts = score.measureStarts;
  const validStarts = Array.isArray(starts) && starts.length > 0 && starts.length <= 100_000
    && starts[0] === 0 && starts.every((n, i) => Number.isFinite(n) && n >= 0 && n <= duration && (!i || n > starts[i - 1]));
  if (starts != null && !validStarts) warnings.push("Invalid bar positions were replaced with the score's regular meter.");
  const map = { meter, duration, measures: validStarts ? starts.length : Math.max(1, Math.ceil(duration / meter)),
    measureStarts: validStarts ? starts : undefined,
    measureLengths: validStarts && Array.isArray(score.measureLengths) ? score.measureLengths.map((n) => Number.isFinite(n) && n > 0 && n <= 32 ? n : meter) : undefined,
    measurePulses: score.measurePulses, meterPulses: score.meterPulses,
    pickup: Number.isFinite(score.pickup) && score.pickup > 0 && score.pickup <= meter ? score.pickup : 0 };
  return map;
}

function pulses(map, bar) {
  const start = barStart(map, bar), end = Math.min(map.duration, barEnd(map, bar));
  let pattern = pulsePattern(map, bar);
  if (!Array.isArray(pattern) || !pattern.length || pattern.length > 32 || pattern.some((x) => !Number.isFinite(x) || x <= 0) || pattern.reduce((a, b) => a + b, 0) > 32)
    pattern = Array.from({ length: Math.ceil(map.meter) }, (_, i) => Math.min(1, map.meter - i));
  const nominal = pattern.reduce((a, b) => a + b, 0);
  let offset = bar === 1 && map.pickup ? -Math.max(0, nominal - map.pickup) : 0;
  const result = [];
  for (let i = 0; i < 128 && start + offset < end - EPS; i++) {
    const length = pattern[i % pattern.length];
    if (start + offset + length > start + EPS)
      result.push({ beat: start + offset, length, count: i % pattern.length, end });
    offset += length;
  }
  return result;
}

function mergedActivity(notes) {
  const intervals = [];
  for (const note of notes) {
    const previous = intervals.at(-1), end = note.beat + note.duration;
    if (previous && note.beat <= previous.end + EPS) previous.end = Math.max(previous.end, end);
    else intervals.push({ start: note.beat, end });
  }
  return intervals;
}

/** Arrange only written pitches; percussion is a quiet generated meter pattern.
 * Pitched events retain sourceIds so callers can avoid doubling the source hand.
 * All times are quarter-note beats, independent of tempo and practice speed.
 */
export function buildBacking(score = {}, { style = "auto", hand = "both" } = {}) {
  score ||= {};
  const warnings = [];
  if (!STYLES.includes(style)) { warnings.push("Unknown backing style. Using the written piano part."); style = "piano"; }
  const explicitAcoustic = style === "acoustic";
  if (style === "auto") style = popMetadata(score) ? "acoustic" : "piano";
  if (!["both", "right", "left"].includes(hand)) { hand = "both"; warnings.push("Unknown practice hand. Using the left-hand backing part."); }
  const sourceHand = hand === "left" ? "right" : "left";
  const raw = Array.isArray(score.notes) ? score.notes : [];
  if (raw.length > MAX_NOTES) warnings.push("Backing uses the first 50,000 written notes.");
  const valid = [];
  let ignored = false, derivedEnd = 0;
  for (let i = 0; i < Math.min(raw.length, MAX_NOTES); i++) {
    const n = raw[i];
    if (!n || !Number.isInteger(n.midi) || n.midi < 21 || n.midi > 108 || !Number.isFinite(n.beat) || n.beat < 0 || n.beat > 1e7 || !Number.isFinite(n.duration) || n.duration <= EPS || !Number.isFinite(n.beat + n.duration) || !["left", "right"].includes(n.hand)) { ignored = true; continue; }
    derivedEnd = Math.max(derivedEnd, Math.min(1e7, n.beat + n.duration));
    valid.push({ id: typeof n.id === "string" && n.id ? n.id : `note-${i}`, midi: n.midi, beat: n.beat, duration: n.duration, hand: n.hand,
      velocity: clamp(Number.isFinite(n.velocity) ? n.velocity : 0.72, 0.03, 1) });
  }
  if (ignored) warnings.push("Invalid written notes were omitted from the backing.");
  const duration = Number.isFinite(score.duration) && score.duration >= 0 ? Math.min(1e7, score.duration) : derivedEnd;
  const all = valid.filter((n) => n.beat < duration - EPS).map((n) => ({ ...n, duration: Math.min(n.duration, duration - n.beat) }))
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi || a.id.localeCompare(b.id));
  const unisons = new Map();
  for (const n of all) {
    if (n.hand !== sourceHand) continue;
    const key = `${n.beat}:${n.midi}`, previous = unisons.get(key);
    if (previous) {
      previous.duration = Math.max(previous.duration, n.duration);
      previous.velocity = Math.max(previous.velocity, n.velocity);
      if (!previous.sourceIdSet.has(n.id)) { previous.sourceIds.push(n.id); previous.sourceIdSet.add(n.id); }
    } else unisons.set(key, { ...n, sourceIds: [n.id], sourceIdSet: new Set([n.id]) });
  }
  const source = [...unisons.values()];
  const events = [];
  let capped = false;
  const emit = (event) => {
    if (events.length >= MAX_EVENTS) { capped = true; return; }
    if (event.beat < 0 || event.beat >= duration - EPS) return;
    const length = Math.min(event.duration, duration - event.beat);
    if (!(length > EPS)) return;
    events.push({ ...event, duration: length, velocity: clamp(event.velocity, 0.01, 1) });
  };
  const pitched = (note, instrument, gain) => ({ id: `${instrument}:${note.id}:${note.beat}:${note.midi}`, beat: note.beat, duration: note.duration,
    midi: note.midi, velocity: note.velocity * gain, instrument, sourceIds: [...note.sourceIds] });
  if (style === "piano") for (const note of source) emit(pitched(note, "piano", 0.55));
  if (style === "strings") {
    let lastAttack = -Infinity, acceptedBeat = -Infinity;
    let held = [];
    for (const note of source) {
      held = held.filter((end) => end > note.beat + EPS);
      if (note.duration < 0.25 || held.length >= 4 || (note.beat !== acceptedBeat && note.beat - lastAttack < 0.5 - EPS)) continue;
      if (note.beat !== acceptedBeat) { acceptedBeat = note.beat; lastAttack = note.beat; }
      emit(pitched(note, "strings", 0.33));
      held.push(note.beat + note.duration);
    }
  }
  if (style === "acoustic") {
    const map = timeline(score, duration, warnings);
    const pulseCache = new Map();
    const grid = (bar) => { if (!pulseCache.has(bar)) pulseCache.set(bar, pulses(map, bar)); return pulseCache.get(bar); };
    // Verse/chorus shape and rhythmic "band hit" bars, from the score itself.
    const texture = textureMap({ ...score, duration, measures: map.measures });
    const lift = (bar) => texture.intensity[bar - 1] ?? 0;
    const dry = (bar) => !!texture.dry[bar - 1];
    const byBar = new Map();
    for (const note of source) {
      const bar = Math.min(map.measures, measureAt(map, note.beat));
      if (!byBar.has(bar)) byBar.set(bar, []);
      byBar.get(bar).push(note);
      emit(pitched(note, "guitar", 0.5 * (1 + 0.18 * lift(bar))));
    }
    // Bass follows the harmony, not the arpeggio: the lowest note of each
    // beat, only when it is a new bass (another pitch class, near the bottom
    // of the bar) or a downbeat. It is held until the next bass note.
    // Rhythmic hit bars double each lowest hit. Octaves change register only.
    const register = (midi) => { let m = midi; while (m > 50) m -= 12; return Math.max(28, m); };
    for (const [bar, list] of byBar) {
      const barLow = Math.min(...list.map((n) => n.midi));
      const barEndBeat = Math.min(duration, barEnd(map, bar));
      const chosen = [];
      if (dry(bar)) {
        const onsets = new Map();
        for (const n of list) if (!onsets.has(n.beat) || n.midi < onsets.get(n.beat).midi) onsets.set(n.beat, n);
        for (const n of onsets.values()) if (n.midi <= barLow + 7) chosen.push({ note: n, hold: n.duration });
      } else {
        let current = null;
        for (const pulse of grid(bar)) {
          const attacks = list.filter((n) => n.beat >= pulse.beat - EPS && n.beat < pulse.beat + pulse.length - EPS);
          if (!attacks.length) continue;
          const low = attacks.reduce((a, b) => (b.midi < a.midi ? b : a));
          const fresh = !current || (low.midi % 12 !== current.midi % 12 && low.midi <= barLow + 7);
          if (pulse.count === 0 ? low.midi <= barLow + 7 || !current : fresh) {
            chosen.push({ note: low });
            current = low;
          }
        }
        // A whole-bar harmony in a common-time bar gets a second, lighter
        // pulse on beat three, as a bass player would.
        const pattern = grid(bar);
        if (chosen.length === 1 && pattern.length >= 4 && Math.abs(chosen[0].note.beat - pattern[0].beat) < EPS) {
          const third = pattern[2];
          chosen.push({ note: { ...chosen[0].note, beat: third.beat, id: `${chosen[0].note.id}:3` }, echo: true });
        }
        chosen.sort((a, b) => a.note.beat - b.note.beat);
        for (let i = 0; i < chosen.length; i++) {
          const next = chosen[i + 1]?.note.beat ?? barEndBeat;
          chosen[i].hold = Math.max(0.25, Math.min(2, next - chosen[i].note.beat) * 0.94);
        }
      }
      for (const { note, hold, echo } of chosen)
        emit({ ...pitched(note, "bass", (echo ? 0.3 : 0.4) * (1 + 0.2 * lift(bar))), id: `bass:${note.id}:${note.beat}`,
          beat: note.beat, duration: hold ?? note.duration, midi: register(note.midi) });
    }
    const activityNotes = source.length ? source : explicitAcoustic ? all : [];
    const intervals = mergedActivity(activityNotes), bars = new Set();
    let limitedBars = false;
    for (const interval of intervals) {
      const first = measureAt(map, interval.start), last = Math.min(map.measures, measureAt(map, Math.max(interval.start, interval.end - 1e-5)));
      for (let bar = first; bar <= last; bar++) {
        if (bars.size >= MAX_KIT_BARS && !bars.has(bar)) { limitedBars = true; break; }
        bars.add(bar);
      }
      if (limitedBars) break;
    }
    if (limitedBars) warnings.push("Percussion is limited to 10,000 active bars.");
    let intervalIndex = 0;
    const activeAt = (beat) => {
      while (intervalIndex < intervals.length && intervals[intervalIndex].end <= beat + EPS) intervalIndex++;
      const span = intervals[intervalIndex];
      return span && span.start <= beat + EPS && span.end > beat + EPS;
    };
    const lastBar = Math.max(0, ...bars);
    const drum = (instrument, bar, beat, velocity, pulseEnd) =>
      emit({ id: `${instrument}:${bar}:${beat}`, beat, duration: Math.min(instrument === "hat" ? 0.12 : 0.2, pulseEnd - beat),
        velocity: velocity * (1 + 0.28 * lift(bar)), instrument, sourceIds: [] });
    for (const bar of [...bars].sort((a, b) => a - b)) {
      const start = barStart(map, bar);
      const pattern = grid(bar);
      if (dry(bar) && source.length) {
        // Band hits: the kit plays with the written stabs and stays out of
        // the rests.
        const hits = [...new Set((byBar.get(bar) || []).map((n) => n.beat))].sort((a, b) => a - b);
        for (const beat of hits) drum(beat - start < EPS ? "kick" : hits.indexOf(beat) % 2 ? "snare" : "kick", bar, beat, 0.2, Math.min(duration, barEnd(map, bar)));
        continue;
      }
      if (bar === lastBar) {
        if (pattern[0] && activeAt(pattern[0].beat)) drum("kick", bar, pattern[0].beat, 0.2, pattern[0].end);
        continue;
      }
      const level = lift(bar);
      for (const pulse of pattern) {
        const eighths = level > -0.3;
        for (const [beat, half] of [[pulse.beat, false], [pulse.beat + pulse.length / 2, true]]) {
          if (beat < start - EPS || beat >= pulse.end - EPS || !activeAt(beat)) continue;
          if (!half || eighths) drum("hat", bar, beat, half ? 0.09 : level < -0.3 ? 0.1 : 0.14, pulse.end);
          if (half) {
            // A chorus adds a push on the "and" of beat two.
            if (level > 0.35 && pulse.count === 1) drum("kick", bar, beat, 0.17, pulse.end);
            continue;
          }
          if (pulse.count === 0) drum("kick", bar, beat, 0.24, pulse.end);
          else if (pulse.count % 2 === 1) drum("snare", bar, beat, level < -0.3 ? 0.11 : 0.17, pulse.end);
          else if (level > -0.3 && pulse.count === 2) drum("kick", bar, beat, 0.15, pulse.end);
        }
      }
    }
  }
  if (capped) warnings.push("Backing was limited to 75,000 events.");
  const noSustainedNotes = style === "strings" && source.length > 0 && events.length === 0;
  const description = noSustainedNotes
    ? "The written accompaniment notes are too short for this sustained string layer. Choose Piano or Acoustic."
    : source.length
    ? `${sourceHand === "left" ? "Left" : "Right"}-hand notes from this score${style === "acoustic" ? ", with guitar, a bass line that follows the harmony and drums that follow the verse and chorus" : style === "strings" ? ", voiced softly by strings" : ", played softly on piano"}.`
    : events.length ? "This score has no separate accompaniment part. A quiet beat follows its written activity."
      : `No ${sourceHand}-hand accompaniment notes are written in this score.`;
  if (!source.length) warnings.push(events.length ? "No harmony was added; this backing contains percussion only." : "Choose Acoustic explicitly for a quiet beat without adding harmony.");
  return { events: events.sort((a, b) => a.beat - b.beat || a.instrument.localeCompare(b.instrument) || (a.midi ?? 0) - (b.midi ?? 0) || a.id.localeCompare(b.id)),
    style, label: names[style], description, sourceHand, warnings };
}

/** Resume sustained pitched layers without replaying an old drum attack. */
export function backingAt(events, from, end) {
  const plan = planListenStart(events, from, end);
  return { ...plan, continuations: plan.continuations.filter(({ note }) => Number.isInteger(note.midi)) };
}
