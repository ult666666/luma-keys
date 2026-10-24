import { barStart, barEnd, measureAt } from "./music.mjs";
import { bpmAt, tempoMap } from "./tempo.mjs";
import { sourceMarkings } from "./expression.mjs";

// Expressive playback: how the app's piano *performs* a score, as opposed to
// what the score says. Pitches, written rhythm and the notation are never
// changed. Everything here is a playback-only plan, built once per score:
//
//  - a character chosen from the piece (nocturne, ballad, baroque, ...),
//  - phrase shaping: a swell toward each phrase's high point and a breath
//    (small ritardando) at its end, a longer one at the final cadence,
//  - voicing: the top line sings, inner voices and figuration step back,
//  - section dynamics inferred from texture (or given by the score file),
//  - a melody lead and a gentle roll for wide chords, deterministic
//    micro-variation so repeated notes are never machine-identical,
//  - a harmony-following sustain pedal where the score marks none.
//
// Tempo shaping is returned as an alternative tempo map. The caller decides
// where it applies (Listen only), so graded modes keep a steady pulse.

const EPS = 1e-6;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const round = (n, places = 4) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export const CHARACTERS = Object.freeze({
  nocturne: Object.freeze({
    name: "Nocturne",
    zh: "夜曲",
    summary: "A singing top line, deep pedal and lingering phrase ends.",
    rubato: 0.16,
    push: 0.03,
    arc: 0.16,
    section: 0.14,
    meter: 0.035,
    melody: 0.14,
    inner: 0.22,
    bass: 0.04,
    pedal: "harmony",
    roll: 0.022,
    lead: 0.014,
    finalRit: 0.36,
    finalDim: 0.3,
    human: 0.03,
    jitter: 0.004,
    legato: 1,
  }),
  ballad: Object.freeze({
    name: "Ballad",
    zh: "抒情",
    summary:
      "Verses held back, choruses opened up, pedal through each harmony.",
    rubato: 0.12,
    push: 0.028,
    arc: 0.12,
    section: 0.2,
    meter: 0.05,
    melody: 0.14,
    inner: 0.18,
    bass: 0.03,
    pedal: "harmony",
    roll: 0.014,
    lead: 0.012,
    finalRit: 0.28,
    finalDim: 0.24,
    human: 0.028,
    jitter: 0.004,
    legato: 0.98,
  }),
  baroque: Object.freeze({
    name: "Baroque",
    zh: "巴洛克",
    summary: "A steady pulse, swells that follow the harmony, light pedal.",
    rubato: 0.05,
    push: 0,
    arc: 0.08,
    section: 0.16,
    meter: 0.05,
    melody: 0.04,
    inner: 0.06,
    bass: 0.05,
    pedal: "harmony",
    roll: 0,
    lead: 0.004,
    finalRit: 0.26,
    finalDim: 0.12,
    human: 0.018,
    jitter: 0.003,
    legato: 0.92,
  }),
  dramatic: Object.freeze({
    name: "Dramatic",
    zh: "戏剧",
    summary: "A driving pulse, strong downbeats and clear articulation.",
    rubato: 0.05,
    push: 0.012,
    arc: 0.09,
    section: 0.18,
    meter: 0.07,
    melody: 0.08,
    inner: 0.1,
    bass: 0.05,
    pedal: "none",
    roll: 0.008,
    lead: 0.008,
    finalRit: 0.1,
    finalDim: 0,
    human: 0.022,
    jitter: 0.003,
    legato: 0.94,
  }),
  lesson: Object.freeze({
    name: "Clear",
    zh: "清晰",
    summary: "Even and clear, with a little shape to each phrase.",
    rubato: 0.03,
    push: 0,
    arc: 0.06,
    section: 0,
    meter: 0.04,
    melody: 0.06,
    inner: 0.08,
    bass: 0.02,
    pedal: "none",
    roll: 0,
    lead: 0.006,
    finalRit: 0.12,
    finalDim: 0.08,
    human: 0.015,
    jitter: 0.002,
    legato: 0.94,
  }),
});

// Pieces that are well known enough to deserve their own touch. Matched on
// title/composer text; the score file's own `performance` block wins.
const PIECES = [
  {
    test: /gymnop/,
    character: "nocturne",
    tweak: { rubato: 0.2, arc: 0.14, melody: 0.16, finalRit: 0.4 },
    note: "Lent et douloureux: unhurried, each bar allowed to ring.",
  },
  {
    test: /moonlight|mondschein|quasi una fantasia/,
    character: "nocturne",
    tweak: { rubato: 0.12, melody: 0.22, inner: 0.28, arc: 0.18 },
    note: "Even triplets underneath, the melody carried above them.",
  },
  {
    test: /bwv\s*846|prelude in c major/,
    character: "baroque",
    tweak: { arc: 0.1, section: 0.2 },
    note: "Each bar is one harmony: the swell follows the harmonic tension.",
  },
  {
    test: /appassionata/,
    character: "dramatic",
    tweak: { meter: 0.08, section: 0.22 },
    note: "Stormy and driven; the pulse never sags.",
  },
  {
    test: /龙卷风|龍捲風|tornado/,
    character: "ballad",
    tweak: { section: 0.24, melody: 0.16 },
    note: "Punchy intro chords, a restrained verse and a chorus that opens up.",
  },
  {
    test: /晴天|sunny day/,
    character: "ballad",
    tweak: { rubato: 0.1 },
    note: "Nostalgic and light, with the chorus lifted.",
  },
  {
    test: /你离开的事实|truth that you leave/,
    character: "ballad",
    tweak: { rubato: 0.13, arc: 0.14 },
    note: "Tender verses that build to a full-hearted chorus.",
  },
];

const POP =
  /周杰伦|周杰倫|jay chou|邓紫棋|鄧紫棋|g\.?e\.?m\.?|pianoboy|高至豪|everyonepiano|\bpop\b|ballad/;

function metadataText(score) {
  return [score.title, score.composer, score.description, score.genre, score.style]
    .filter((v) => typeof v === "string")
    .join(" ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** The character this score is performed with, plus any per-piece touch. */
export function characterFor(score = {}) {
  const meta = metadataText(score || {});
  const requested = score?.performance?.character;
  const piece = PIECES.find((p) => p.test.test(meta));
  let id;
  if (typeof requested === "string" && CHARACTERS[requested]) id = requested;
  else if (piece) id = piece.character;
  else if (/\bbach\b|\bbwv\b|handel|händel|scarlatti|baroque/.test(meta))
    id = "baroque";
  else if (
    /satie|nocturne|chopin|debussy|clair de lune|\badagio\b|\blargo\b|\blent\b|\blento\b/.test(
      meta,
    )
  )
    id = "nocturne";
  else if (POP.test(meta)) id = "ballad";
  else if (score?.exercise || (score?.measures ?? 0) <= 16) id = "lesson";
  else if ((score?.bpm ?? 90) >= 120) id = "dramatic";
  else if ((score?.bpm ?? 90) <= 72) id = "nocturne";
  else id = "ballad";
  const profile = {
    ...CHARACTERS[id],
    ...(piece && piece.character === id ? piece.tweak : {}),
  };
  return {
    id,
    profile,
    name: profile.name,
    zh: profile.zh,
    summary: profile.summary,
    note: piece && piece.character === id ? piece.note : "",
  };
}

// A stable pseudo-random value in [-1, 1] for a string. The same note gets
// the same small variation every time it is played.
function wobble(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

// 0 at a phrase's start, 1 at its high point (a little past the middle),
// back to 0 at its end.
function arcShape(p) {
  const peak = 0.62;
  if (p <= 0) return 0;
  if (p >= 1) return 0;
  return p < peak
    ? Math.sin(((p / peak) * Math.PI) / 2)
    : Math.cos((((p - peak) / (1 - peak)) * Math.PI) / 2);
}

function sanitizeSections(score) {
  const raw = score?.performance?.sections;
  if (!Array.isArray(raw)) return [];
  const measures = score.measures || 1;
  return raw
    .filter(
      (s) =>
        s &&
        Number.isInteger(s.from) &&
        Number.isInteger(s.to) &&
        s.from >= 1 &&
        s.to >= s.from &&
        s.from <= measures &&
        Number.isFinite(s.level) &&
        s.level >= 0.3 &&
        s.level <= 1.6,
    )
    .map((s) => ({
      from: s.from,
      to: Math.min(measures, s.to),
      level: s.level,
      toLevel:
        Number.isFinite(s.toLevel) && s.toLevel >= 0.3 && s.toLevel <= 1.6
          ? s.toLevel
          : s.level,
      phrase:
        Number.isInteger(s.phrase) && s.phrase >= 1 && s.phrase <= 16
          ? s.phrase
          : null,
      label: typeof s.label === "string" ? s.label.slice(0, 60) : "",
      pedal: s.pedal === false ? false : s.pedal === "bar" ? "bar" : true,
      rubato: Number.isFinite(s.rubato) ? clamp(s.rubato, 0, 3) : 1,
    }))
    .sort((a, b) => a.from - b.from);
}

// Phrases as [firstBar, lastBar, strength]. Sections restart the grouping;
// otherwise four-bar groups, with a half-phrase breath where the melody
// holds a long note in the middle of a group.
function phrasesOf(score, sections, melodyHold) {
  const measures = Math.max(1, score.measures || 1);
  const starts = new Set([1]);
  const lengths = new Map();
  for (const s of sections) {
    starts.add(s.from);
    if (s.to + 1 <= measures) starts.add(s.to + 1);
    if (s.phrase) lengths.set(s.from, s.phrase);
  }
  const explicit = Array.isArray(score?.performance?.phrases)
    ? score.performance.phrases.filter(
        (p) =>
          Array.isArray(p) &&
          Number.isInteger(p[0]) &&
          Number.isInteger(p[1]) &&
          p[0] >= 1 &&
          p[1] >= p[0] &&
          p[1] <= measures,
      )
    : [];
  if (explicit.length)
    return explicit
      .map(([a, b]) => ({ first: a, last: b, strength: 1 }))
      .sort((x, y) => x.first - y.first);
  const ordered = [...starts].sort((a, b) => a - b);
  const phrases = [];
  let length = 4;
  for (let i = 0; i < ordered.length; i++) {
    const regionStart = ordered[i];
    const regionEnd = (ordered[i + 1] ?? measures + 1) - 1;
    if (lengths.has(regionStart)) length = lengths.get(regionStart);
    else if (i === 0) length = 4;
    for (let a = regionStart; a <= regionEnd; a += length) {
      const b = Math.min(regionEnd, a + length - 1);
      const mid = a + Math.floor((b - a + 1) / 2) - 1;
      if (b - a + 1 >= 4 && melodyHold(mid)) {
        phrases.push({ first: a, last: mid, strength: 0.5 });
        phrases.push({ first: mid + 1, last: b, strength: melodyHold(b) ? 1 : 0.7 });
      } else
        phrases.push({ first: a, last: b, strength: melodyHold(b) ? 1 : 0.7 });
    }
  }
  return phrases;
}

function stdev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
  );
}

function zscores(values) {
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const sd = stdev(values) || 1;
  return values.map((v) => (v - mean) / sd);
}

function validNotes(score) {
  return (Array.isArray(score?.notes) ? score.notes : [])
    .filter(
      (n) =>
        n &&
        typeof n.id === "string" &&
        Number.isInteger(n.midi) &&
        Number.isFinite(n.beat) &&
        Number.isFinite(n.duration) &&
        n.duration > 0,
    )
    .slice()
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

// Sustain pedal that follows the harmony: a change on every bar line and
// wherever the bass moves to a new pitch class, the pedal going down just
// after the new bass sounds (a legato pedal). Rhythmic, rest-filled bars
// are left dry so their punch survives.
export function harmonyPedals(score, notes, { minSpan = 1, sections = [], written = [] } = {}) {
  const measures = Math.max(1, score.measures || 1);
  const spans = [];
  const byBar = new Map();
  for (const n of notes) {
    const bar = Math.min(measures, measureAt(score, n.beat));
    if (!byBar.has(bar)) byBar.set(bar, []);
    byBar.get(bar).push(n);
  }
  const sectionAt = (bar) => sections.find((s) => bar >= s.from && bar <= s.to);
  const blocked = (a, b) =>
    written.some((p) => p.start < b - EPS && p.end > a + EPS);
  for (let bar = 1; bar <= measures; bar++) {
    const start = barStart(score, bar);
    const end = Math.min(score.duration ?? Infinity, barEnd(score, bar));
    const length = end - start;
    if (!(length > EPS)) continue;
    const section = sectionAt(bar);
    if (section && section.pedal === false) continue;
    if (blocked(start, end)) continue;
    // Include notes still ringing from earlier bars.
    const inBar = notes.filter(
      (n) => n.beat < end - EPS && n.beat + n.duration > start + EPS,
    );
    if (!inBar.length) continue;
    // How much of the bar is covered by written sound.
    const intervals = inBar
      .map((n) => [Math.max(start, n.beat), Math.min(end, n.beat + n.duration)])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0,
      cursor = start;
    for (const [a, b] of intervals) {
      if (b <= cursor) continue;
      covered += b - Math.max(a, cursor);
      cursor = Math.max(cursor, b);
    }
    if (covered / length < 0.6) continue;
    const own = byBar.get(bar) || [];
    const lowHand = own.some((n) => n.hand === "left")
      ? own.filter((n) => n.hand === "left")
      : own;
    const changes = [start];
    let bassPc = null;
    const perBar = section?.pedal === "bar";
    for (let pulse = start; pulse < end - EPS; pulse += 1) {
      const attacks = lowHand.filter(
        (n) => n.beat >= pulse - EPS && n.beat < pulse + 1 - EPS,
      );
      if (!attacks.length) continue;
      const lowest = attacks.reduce((a, b) => (b.midi < a.midi ? b : a));
      const pc = lowest.midi % 12;
      if (bassPc === null) {
        bassPc = pc;
        continue;
      }
      if (
        !perBar &&
        pc !== bassPc &&
        lowest.beat - changes.at(-1) >= minSpan - EPS &&
        end - lowest.beat >= Math.min(1, minSpan) - EPS
      ) {
        changes.push(lowest.beat);
        bassPc = pc;
      }
    }
    changes.push(end);
    for (let i = 0; i < changes.length - 1; i++) {
      const a = changes[i] + 0.04,
        b = changes[i + 1];
      if (b - a > 0.2) spans.push({ start: round(a), end: round(b) });
    }
  }
  const merged = [...written.map((p) => ({ start: p.start, end: p.end })), ...spans]
    .sort((a, b) => a.start - b.start);
  const clean = [];
  for (const span of merged) {
    const last = clean.at(-1);
    if (last && span.start < last.end - EPS) {
      if (span.end > last.end) last.end = span.end;
      continue;
    }
    clean.push({ ...span });
  }
  return clean;
}

/** Build the expressive plan for a score. Returns
 *  { character, notes: Map(id → {velocity, gate, delay}), tempos, pedals }
 * where `tempos` is a complete replacement tempo map for Listen playback and
 * `pedals` is null when the written pedalling is kept unchanged. */
export function buildPerformance(score, options = {}) {
  const character = characterFor(score || {});
  const result = {
    character,
    notes: new Map(),
    tempos: null,
    steadyTempos: null,
    pedals: null,
    phrases: [],
  };
  const notes = validNotes(score);
  if (!notes.length || notes.length > 50000 || !Number.isFinite(score.duration))
    return result;
  const P = { ...character.profile, ...(options.profile || {}) };
  const measures = Math.max(1, score.measures || 1);
  const sections = sanitizeSections(score);
  const marks = sourceMarkings(score);
  const barOf = (beat) => Math.min(measures, measureAt(score, beat));
  const barLength = (bar) =>
    Math.max(EPS, barEnd(score, bar) - barStart(score, bar));

  // --- Texture per bar -------------------------------------------------
  const bars = Array.from({ length: measures + 1 }, () => ({
    notes: [],
    right: [],
    left: [],
  }));
  for (const n of notes) {
    const bar = barOf(n.beat);
    bars[bar].notes.push(n);
    (n.hand === "left" ? bars[bar].left : bars[bar].right).push(n);
  }
  // Does the top line hold (or rest) through the end of this bar? That is
  // where a phrase naturally breathes.
  const melodyHold = (bar) => {
    if (bar < 1 || bar > measures) return false;
    const end = barEnd(score, bar);
    const right = bars[bar].right.length ? bars[bar].right : bars[bar].notes;
    if (!right.length) return true;
    const last = right.reduce((a, b) => (b.beat > a.beat ? b : a));
    return (
      last.beat + last.duration >= end - EPS - 0.05 &&
      (last.duration >= 1.5 || end - last.beat >= 1.5)
    ) || last.beat + last.duration <= end - 1 + EPS;
  };
  const phrases = phrasesOf(score, sections, melodyHold);
  result.phrases = phrases;
  const phraseAt = (bar) =>
    phrases.find((p) => bar >= p.first && bar <= p.last) || {
      first: bar,
      last: bar,
      strength: 0.5,
    };

  // Section intensity from texture: more notes, more simultaneous sound and
  // a higher top line read as a louder section.
  const perBeat = [],
    tops = [],
    onsets = [];
  for (let bar = 1; bar <= measures; bar++) {
    const list = bars[bar].notes;
    const length = barLength(bar);
    perBeat.push(list.length / length);
    onsets.push(new Set(list.map((n) => Math.round(n.beat * 1000))).size / length);
    const right = bars[bar].right;
    tops.push(
      right.length
        ? right.reduce((a, n) => a + n.midi, 0) / right.length
        : list.length
          ? list.reduce((a, n) => a + n.midi, 0) / list.length
          : 60,
    );
  }
  const za = zscores(perBeat),
    zb = zscores(tops),
    zc = zscores(onsets);
  const rawIntensity = za.map((v, i) => 0.42 * v + 0.33 * zb[i] + 0.25 * zc[i]);
  const intensity = rawIntensity.map((_, i) => {
    let sum = 0,
      weight = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j < 0 || j >= rawIntensity.length) continue;
      const w = [0.12, 0.22, 0.32, 0.22, 0.12][k + 2];
      sum += rawIntensity[j] * w;
      weight += w;
    }
    return Math.tanh(sum / weight / 1.2);
  });
  const velocities = notes.map((n) => (Number.isFinite(n.velocity) ? n.velocity : 0.72));
  const writtenDynamics = stdev(velocities) > 0.03;
  const sectionWeight = P.section * (writtenDynamics ? 0.3 : 1);
  const sectionAt = (bar) => sections.find((s) => bar >= s.from && bar <= s.to);
  const levelAt = (beat) => {
    const bar = barOf(beat);
    const local = 1 + sectionWeight * (intensity[bar - 1] ?? 0) * (sections.length ? 0.35 : 1);
    const section = sectionAt(bar);
    if (!section) return local;
    const a = barStart(score, section.from),
      b = barEnd(score, section.to);
    const p = clamp((beat - a) / Math.max(EPS, b - a), 0, 1);
    const level = section.level + (section.toLevel - section.level) * p;
    return local * (writtenDynamics ? 1 + (level - 1) * 0.35 : level);
  };

  // --- Roles: melody, bass, figuration ----------------------------------
  const onsetGroups = new Map();
  for (const n of notes) {
    const key = `${Math.round(n.beat * 10000)}:${n.hand}`;
    if (!onsetGroups.has(key)) onsetGroups.set(key, []);
    onsetGroups.get(key).push(n);
  }
  const figurative = new Map();
  for (let bar = 1; bar <= measures; bar++)
    for (const hand of ["left", "right"]) {
      const list = bars[bar][hand];
      const times = [...new Set(list.map((n) => round(n.beat, 4)))].sort((a, b) => a - b);
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      const max = gaps.length ? Math.max(...gaps) : Infinity;
      figurative.set(`${bar}:${hand}`, times.length >= 6 && max <= 0.5 + EPS);
    }
  // Skyline: the highest right-hand note sounding at each right-hand onset.
  const right = notes.filter((n) => n.hand === "right");
  const melodyIds = new Set();
  {
    let active = [];
    for (const n of right) {
      active = active.filter((m) => m.beat + m.duration > n.beat + 0.02);
      const peers = onsetGroups.get(`${Math.round(n.beat * 10000)}:right`) || [n];
      const highest = Math.max(
        ...peers.map((m) => m.midi),
        ...active.filter((m) => m.beat < n.beat - EPS).map((m) => m.midi),
      );
      if (n.midi >= highest) melodyIds.add(n.id);
      active.push(n);
    }
  }
  const leftBass = new Set();
  {
    // The lowest left-hand attack in each beat is the bass.
    const byBeat = new Map();
    for (const n of notes) {
      if (n.hand !== "left") continue;
      const key = Math.floor(n.beat + EPS);
      const current = byBeat.get(key);
      if (!current || n.midi < current.midi) byBeat.set(key, n);
    }
    for (const n of notes)
      if (n.hand === "left" && Math.abs(n.beat - byBeat.get(Math.floor(n.beat + EPS)).beat) < EPS
        && n.midi === byBeat.get(Math.floor(n.beat + EPS)).midi)
        leftBass.add(n.id);
  }
  const hasLeft = notes.some((n) => n.hand === "left");

  // --- Per-note shaping --------------------------------------------------
  const lastBarStart = barStart(score, Math.max(1, measures - 1));
  for (const n of notes) {
    const bar = barOf(n.beat);
    const base = Number.isFinite(n.velocity) ? n.velocity : 0.72;
    let v = base * levelAt(n.beat);
    // Phrase swell.
    const phrase = phraseAt(bar);
    const pa = barStart(score, phrase.first),
      pb = barEnd(score, phrase.last);
    const p = clamp((n.beat - pa) / Math.max(EPS, pb - pa), 0, 1);
    v *= 1 + P.arc * (arcShape(p) - 0.45);
    // Metre: downbeats lean, off-beats lighten.
    const pos = n.beat - barStart(score, bar);
    const frac = pos - Math.floor(pos + EPS);
    if (pos < EPS) v *= 1 + P.meter;
    else if (Math.abs(pos - barLength(bar) / 2) < EPS && barLength(bar) >= 4 - EPS)
      v *= 1 + P.meter * 0.4;
    else if (frac > 0.01) v *= 1 - P.meter * 0.5;
    // Voicing.
    const fig = figurative.get(`${bar}:${n.hand}`);
    if (n.hand === "right" || !hasLeft) {
      if (melodyIds.has(n.id)) v *= 1 + P.melody * (fig ? 0.25 : 1);
      else v *= 1 - P.inner * (fig ? 1 : 0.7);
    } else if (leftBass.has(n.id)) v *= 1 + P.bass;
    else v *= 1 - P.inner * (fig ? 0.9 : 0.6);
    // The very end relaxes.
    if (n.beat >= lastBarStart - EPS && P.finalDim > 0) {
      const x = clamp((n.beat - lastBarStart) / Math.max(EPS, score.duration - lastBarStart), 0, 1);
      v *= 1 - P.finalDim * Math.sqrt(x) * 0.6;
    }
    v *= 1 + P.human * wobble(`v:${n.id}`);
    // Timing: the melody leads its chord by a few milliseconds; wide
    // chords roll upward; a tiny, fixed variation for everything else.
    let delay = P.jitter * (wobble(`t:${n.id}`) + 1) * 0.5;
    const group = onsetGroups.get(`${Math.round(n.beat * 10000)}:${n.hand}`) || [n];
    const other = onsetGroups.get(
      `${Math.round(n.beat * 10000)}:${n.hand === "left" ? "right" : "left"}`,
    );
    const melodyHere = [...group, ...(other || [])].some((m) => melodyIds.has(m.id));
    if (melodyHere && !melodyIds.has(n.id)) delay += P.lead;
    if (P.roll > 0 && group.length >= 2) {
      const low = Math.min(...group.map((m) => m.midi)),
        high = Math.max(...group.map((m) => m.midi));
      if (high - low >= 15 || (n.beat >= lastBarStart - EPS && high - low >= 10)) {
        const order = group
          .slice()
          .sort((a, b) => a.midi - b.midi)
          .findIndex((m) => m.id === n.id);
        delay += Math.min(5, order) * P.roll;
      }
    }
    const shaped = {
      velocity: round(clamp(v, 0.06, 1), 3),
      delay: round(delay, 4),
    };
    if (melodyIds.has(n.id) && P.legato >= 0.98) shaped.gate = P.legato;
    else if (P.legato < 0.94 && n.duration <= 0.5 && !melodyIds.has(n.id))
      shaped.gate = P.legato;
    result.notes.set(n.id, shaped);
  }

  // Shaping moves loudness around; it should not make the whole piece
  // quieter or louder than written. Restore the written average level.
  {
    const shaped = [...result.notes.values()];
    const before = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const after = shaped.reduce((a, x) => a + x.velocity, 0) / shaped.length;
    const gain = after > EPS ? clamp(before / after, 0.8, 1.25) : 1;
    if (Math.abs(gain - 1) > 0.005)
      for (const x of shaped) x.velocity = round(clamp(x.velocity * gain, 0.06, 1), 3);
  }

  // --- Tempo shaping ------------------------------------------------------
  const fermatas = marks.fermatas;
  const words = marks.tempoWords;
  const final = Math.min(8, barLength(measures) * 2);
  const factor = (beat, steady) => {
    const bar = barOf(beat);
    const section = sectionAt(bar);
    const scale = (steady ? 0.35 : 1) * (section ? section.rubato : 1);
    let f = 1;
    const phrase = phraseAt(bar);
    const pa = barStart(score, phrase.first),
      pb = Math.min(score.duration, barEnd(score, phrase.last));
    const p = clamp((beat - pa) / Math.max(EPS, pb - pa), 0, 1);
    if (!steady) f *= 1 + P.push * (arcShape(p) - 0.5);
    const window = Math.min(2, barLength(phrase.last) / 2);
    const x = (beat - (pb - window)) / window;
    if (x > 0 && x <= 1) f *= 1 - P.rubato * phrase.strength * scale * x * x;
    const fx = (beat - (score.duration - final)) / final;
    if (fx > 0) f *= 1 - P.finalRit * (steady ? 0.6 : 1) * fx ** 1.6;
    for (const fm of fermatas)
      if (beat >= fm.beat - EPS && beat < fm.beat + Math.max(0.5, fm.duration) - EPS) {
        f *= 0.55;
        break;
      }
    let rit = null;
    for (const w of words) {
      if (w.beat > beat + EPS) break;
      rit = w.kind === "rit" ? w : null;
    }
    if (rit) {
      const y = clamp((beat - rit.beat) / 6, 0, 1);
      if (beat - rit.beat < 12) f *= 1 - 0.18 * y;
    }
    return clamp(f, 0.45, 1.1);
  };
  const buildTempos = (steady) => {
    const written = tempoMap(score).map((s) => s.beat);
    const cuts = new Set(written.map((b) => round(b, 5)));
    for (let b = 0; b < score.duration - EPS; b += 0.25) cuts.add(round(b, 5));
    const ordered = [...cuts].filter((b) => b < score.duration).sort((a, b) => a - b);
    const tempos = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i],
        b = ordered[i + 1] ?? score.duration;
      const mid = (a + b) / 2;
      const bpm = round(bpmAt(score, a + EPS) * factor(mid, steady), 2);
      if (tempos.length && Math.abs(tempos.at(-1).bpm - bpm) < 0.05) continue;
      tempos.push({ beat: a, bpm: clamp(bpm, 10, 500) });
    }
    return tempos;
  };
  if (!options.noTempo) {
    result.tempos = buildTempos(false);
    result.steadyTempos = buildTempos(true);
  }

  // --- Pedal -------------------------------------------------------------
  if (P.pedal !== "none") {
    const written = Array.isArray(score.pedals) ? score.pedals : [];
    const coverage =
      written.reduce((a, p) => a + Math.max(0, p.end - p.start), 0) /
      Math.max(EPS, score.duration);
    if (coverage < 0.2)
      result.pedals = harmonyPedals(score, notes, {
        minSpan: character.id === "baroque" ? 2 : 1,
        sections,
        written,
      });
  }
  return result;
}

/** Per-bar texture used by generated accompaniment: `intensity` in [-1, 1]
 * (quiet verse → full chorus, or the score file's own sections) and `dry`
 * for rhythmic, rest-filled bars such as band hits. Index 0 is bar 1. */
export function textureMap(score) {
  const notes = validNotes(score);
  const measures = Math.max(1, score?.measures || 1);
  const intensity = new Array(measures).fill(0),
    dry = new Array(measures).fill(false);
  if (!notes.length || notes.length > 50000) return { intensity, dry };
  const byBar = Array.from({ length: measures + 1 }, () => []);
  for (const n of notes) byBar[Math.min(measures, measureAt(score, n.beat))].push(n);
  const perBeat = [],
    tops = [];
  for (let bar = 1; bar <= measures; bar++) {
    const start = barStart(score, bar),
      end = Math.min(score.duration ?? Infinity, barEnd(score, bar));
    const length = Math.max(EPS, end - start);
    const list = byBar[bar];
    perBeat.push(list.length / length);
    const right = list.filter((n) => n.hand === "right");
    const pool = right.length ? right : list;
    tops.push(pool.length ? pool.reduce((a, n) => a + n.midi, 0) / pool.length : 60);
    const intervals = notes
      .filter((n) => n.beat < end - EPS && n.beat + n.duration > start + EPS)
      .map((n) => [Math.max(start, n.beat), Math.min(end, n.beat + n.duration)])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0,
      cursor = start;
    for (const [a, b] of intervals) {
      if (b <= cursor) continue;
      covered += b - Math.max(a, cursor);
      cursor = Math.max(cursor, b);
    }
    dry[bar - 1] = list.length > 0 && covered / length < 0.6;
  }
  const za = zscores(perBeat),
    zb = zscores(tops);
  const raw = za.map((v, i) => 0.6 * v + 0.4 * zb[i]);
  for (let i = 0; i < measures; i++) {
    let sum = 0,
      weight = 0;
    for (let k = -1; k <= 1; k++) {
      const j = i + k;
      if (j < 0 || j >= measures) continue;
      const w = k ? 0.25 : 0.5;
      sum += raw[j] * w;
      weight += w;
    }
    intensity[i] = Math.tanh(sum / weight / 1.1);
  }
  for (const s of sanitizeSections(score))
    for (let bar = s.from; bar <= s.to; bar++) {
      const p = s.to > s.from ? (bar - s.from) / (s.to - s.from) : 0;
      const level = s.level + (s.toLevel - s.level) * p;
      intensity[bar - 1] = clamp((level - 1) / 0.25, -1, 1) * 0.75 + intensity[bar - 1] * 0.25;
    }
  return { intensity, dry };
}
