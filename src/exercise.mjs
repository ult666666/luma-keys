// Graded sight-reading exercises. Every exercise is engraved as MusicXML so the
// staff view, the number score and playback all read the same music. A seed
// reproduces an exercise exactly; a new seed is a piece nobody has seen before.
import { parseMusicXML } from "./music.mjs";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const mod = (n, m) => ((n % m) + m) % m;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const EPS = 1e-9;

export function seededRandom(seed) {
  let a = Number(seed) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randomSeed = () => 1 + Math.floor(Math.random() * 999999);
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const chance = (rng, p) => rng() < p;
function weighted(rng, items, weight = (x) => x.weight ?? 1) {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export const EXERCISE_KEYS = [
  { fifths: 0, name: "C major" },
  { fifths: 1, name: "G major" },
  { fifths: -1, name: "F major" },
  { fifths: 2, name: "D major" },
  { fifths: -2, name: "B♭ major" },
  { fifths: 3, name: "A major" },
  { fifths: -3, name: "E♭ major" },
  { fifths: 4, name: "E major" },
  { fifths: -4, name: "A♭ major" },
];
export const keyName = (fifths) =>
  EXERCISE_KEYS.find((k) => k.fifths === fifths)?.name || "C major";

export const METERS = {
  "4/4": { beats: 4, beatType: 4, pulses: [1, 1, 1, 1], strong: [0, 2] },
  "3/4": { beats: 3, beatType: 4, pulses: [1, 1, 1], strong: [0] },
  "2/4": { beats: 2, beatType: 4, pulses: [1, 1], strong: [0] },
  "6/8": {
    beats: 6,
    beatType: 8,
    pulses: [1.5, 1.5],
    strong: [0, 1],
    compound: true,
  },
};
export const RANGES = ["five", "octave", "wide"];
export const LEFT_PATTERNS = ["melody", "long", "fifths", "chords", "broken"];
export const RHYTHM_TAGS = ["eighth", "dotted", "syncopated", "sixteenth"];
export const BAR_CHOICES = [4, 8, 12, 16];

// A teacher's progression: one new idea per level, everything before it kept.
export const LEVELS = [
  {
    level: 1,
    title: "First five notes",
    summary:
      "Right hand in the C position. Steps, repeated notes, quarter and half notes.",
    hands: "right",
    fifths: [0],
    range: "five",
    maxLeap: 1,
    repeat: 0.18,
    rhythm: [],
    rests: false,
    bars: 4,
    meters: ["4/4"],
    tempo: 60,
    left: "melody",
    tips: [
      "Keep your eyes on the score, not your hands. Thumb rests on C4 and each finger owns one key.",
      "Say the numbers or letters out loud before you play the passage in time.",
    ],
  },
  {
    level: 2,
    title: "Left hand, first five",
    summary: "The same steps in the bass clef, one octave below middle C.",
    hands: "left",
    fifths: [0],
    range: "five",
    maxLeap: 1,
    repeat: 0.18,
    rhythm: [],
    rests: false,
    bars: 4,
    meters: ["4/4", "3/4"],
    tempo: 60,
    left: "melody",
    tips: [
      "Little finger rests on C3, thumb on G3. Bass-clef C3 sits in the second space from the top.",
      "Count the beats aloud; a half note in the left hand is easy to cut short.",
    ],
  },
  {
    level: 3,
    title: "Skips and rests",
    summary: "Thirds join the steps and quarter rests appear. 3/4 time begins.",
    hands: "right",
    fifths: [0],
    range: "five",
    maxLeap: 2,
    repeat: 0.1,
    rhythm: [],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4"],
    tempo: 66,
    left: "melody",
    tips: [
      "A skip on the staff is line-to-line or space-to-space; a step alternates. Read the shape, then the note.",
      "Rests are music too: lift the hand and keep counting through them.",
    ],
  },
  {
    level: 4,
    title: "Both hands, long bass notes",
    summary:
      "The left hand holds the root of each chord while the right hand reads steps and skips.",
    hands: "both",
    fifths: [0],
    range: "five",
    maxLeap: 2,
    repeat: 0.1,
    rhythm: [],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4"],
    tempo: 66,
    left: "long",
    tips: [
      "Read both staves as one system: find the bass note first, then follow the melody above it.",
      "Try Listen & follow once, then Play in time at 75% before full speed.",
    ],
  },
  {
    level: 5,
    title: "G and F major",
    summary: "One sharp or one flat. Fourths appear and 2/4 joins the meters.",
    hands: "both",
    fifths: [1, -1],
    range: "five",
    maxLeap: 3,
    repeat: 0.08,
    rhythm: [],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4", "2/4"],
    tempo: 69,
    left: "long",
    tips: [
      "Check the key signature before the first note: F♯ in G major, B♭ in F major, for every octave.",
      "Move your hand to the new five-finger position and keep it there; the eyes do the traveling.",
    ],
  },
  {
    level: 6,
    title: "Eighth notes",
    summary: "Pairs of eighth notes in the right hand across a full octave.",
    hands: "right",
    fifths: [0, 1, -1],
    range: "octave",
    maxLeap: 3,
    repeat: 0.06,
    rhythm: ["eighth"],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4", "2/4"],
    tempo: 72,
    left: "melody",
    tips: [
      "Count “1 & 2 &”. Beamed pairs share one beat; keep the pulse steady when they arrive.",
      "The range now reaches the octave, so the thumb will need to pass or the hand shift. Plan it as you read ahead.",
    ],
  },
  {
    level: 7,
    title: "Hands together",
    summary: "Eighth-note melodies over root-and-fifth patterns.",
    hands: "both",
    fifths: [0, 1, -1],
    range: "octave",
    maxLeap: 4,
    repeat: 0.06,
    rhythm: ["eighth"],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4", "2/4"],
    tempo: 72,
    left: "fifths",
    tips: [
      "The left hand alternates or holds the root and fifth: learn its shape once, then give the eyes to the melody.",
      "If one hand stumbles, use Repeat these bars and slow down rather than stopping.",
    ],
  },
  {
    level: 8,
    title: "D and B♭ major, wider reach",
    summary:
      "Two sharps or flats, leaps up to a sixth and dotted quarter notes.",
    hands: "both",
    fifths: [2, -2, 1, -1],
    range: "wide",
    maxLeap: 5,
    repeat: 0.05,
    rhythm: ["eighth", "dotted"],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4"],
    tempo: 76,
    left: "fifths",
    tips: [
      "A dotted quarter plus an eighth fills two beats: feel “1 (2) &”.",
      "For leaps, look at the interval on the page, not at the keyboard; trust the hand shape.",
    ],
  },
  {
    level: 9,
    title: "Block chords",
    summary:
      "Triads in the left hand with smooth voice leading; the melody keeps moving.",
    hands: "both",
    fifths: [0, 1, -1, 2, -2],
    range: "wide",
    maxLeap: 5,
    repeat: 0.05,
    rhythm: ["eighth", "dotted"],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4", "2/4"],
    tempo: 76,
    left: "chords",
    tips: [
      "Read a chord as one shape: bottom note plus the stack above it. Most chords move by one note between bars.",
      "Play chords lightly so the melody sings on top.",
    ],
  },
  {
    level: 10,
    title: "Broken chords",
    summary:
      "Alberti bass and arpeggios under the melody. A and E♭ major arrive.",
    hands: "both",
    fifths: [3, -3, 2, -2],
    range: "wide",
    maxLeap: 5,
    repeat: 0.05,
    rhythm: ["eighth", "dotted"],
    rests: true,
    bars: 8,
    meters: ["4/4", "3/4", "2/4", "6/8"],
    tempo: 80,
    left: "broken",
    tips: [
      "Broken chords are still chords: see the triad, then let the fingers rock through it.",
      "6/8 has two big beats per bar; count “1-2-3 4-5-6” with weight on 1 and 4.",
    ],
  },
  {
    level: 11,
    title: "Accidentals and syncopation",
    summary: "Chromatic neighbor notes, off-beat rhythms and 6/8 time.",
    hands: "both",
    fifths: [0, 1, -1, 2, -2, 3, -3],
    range: "wide",
    maxLeap: 6,
    repeat: 0.05,
    rhythm: ["eighth", "dotted", "syncopated"],
    rests: true,
    accidentals: true,
    bars: 8,
    meters: ["4/4", "3/4", "6/8"],
    tempo: 80,
    left: "mixed",
    tips: [
      "An accidental lasts for the rest of the bar. A sharp before a note usually leads up by a half step.",
      "For syncopation, keep the metronome on and tap the off-beat quarter with a slight accent.",
    ],
  },
  {
    level: 12,
    title: "Sixteenths and independence",
    summary:
      "Sixteenth-note figures over an independent bass line, up to four sharps or flats.",
    hands: "both",
    fifths: [4, -4, 3, -3, 2, -2],
    range: "wide",
    maxLeap: 7,
    repeat: 0.04,
    rhythm: ["eighth", "dotted", "syncopated", "sixteenth"],
    rests: true,
    accidentals: true,
    bars: 12,
    meters: ["4/4", "3/4", "2/4", "6/8"],
    tempo: 84,
    left: "melody",
    tips: [
      "Subdivide: “1 e & a”. Sixteenth groups belong to one beat, so read them as a unit.",
      "Two independent lines: read the downbeats of both hands first, then fill in the motion between them.",
    ],
  },
];
export const levelFor = (level) =>
  LEVELS[clamp(Math.round(Number(level) || 1), 1, LEVELS.length) - 1];

// Rhythm cells fill one or more pulses. A bar is a sequence of cells, so every
// bar is complete and every beam group stays inside a beat.
const SIMPLE_CELLS = [
  { id: "q", span: 1, notes: [1], tag: "basic", weight: 5 },
  { id: "h", span: 2, notes: [2], tag: "basic", weight: 3 },
  { id: "hd", span: 3, notes: [3], tag: "basic", weight: 0.7 },
  { id: "w", span: 4, notes: [4], tag: "basic", weight: 0.5 },
  { id: "r", span: 1, notes: [{ rest: 1 }], tag: "rest", weight: 1.2 },
  { id: "ee", span: 1, notes: [0.5, 0.5], tag: "eighth", weight: 4 },
  { id: "qde", span: 2, notes: [1.5, 0.5], tag: "dotted", weight: 2 },
  { id: "eqe", span: 2, notes: [0.5, 1, 0.5], tag: "syncopated", weight: 2 },
  {
    id: "re",
    span: 1,
    notes: [{ rest: 0.5 }, 0.5],
    tag: "syncopated",
    weight: 1,
  },
  { id: "eds", span: 1, notes: [0.75, 0.25], tag: "sixteenth", weight: 2 },
  {
    id: "ssss",
    span: 1,
    notes: [0.25, 0.25, 0.25, 0.25],
    tag: "sixteenth",
    weight: 2,
  },
  { id: "sse", span: 1, notes: [0.25, 0.25, 0.5], tag: "sixteenth", weight: 2 },
  { id: "ess", span: 1, notes: [0.5, 0.25, 0.25], tag: "sixteenth", weight: 2 },
];
const COMPOUND_CELLS = [
  { id: "qd", span: 1, notes: [1.5], tag: "basic", weight: 3 },
  { id: "eee", span: 1, notes: [0.5, 0.5, 0.5], tag: "basic", weight: 4 },
  { id: "qe", span: 1, notes: [1, 0.5], tag: "basic", weight: 2 },
  { id: "eq", span: 1, notes: [0.5, 1], tag: "dotted", weight: 1 },
  { id: "hd", span: 2, notes: [3], tag: "basic", weight: 1 },
  { id: "rqd", span: 1, notes: [{ rest: 1.5 }], tag: "rest", weight: 1 },
  {
    id: "ssee",
    span: 1,
    notes: [0.25, 0.25, 0.5, 0.5],
    tag: "sixteenth",
    weight: 2,
  },
  {
    id: "esse",
    span: 1,
    notes: [0.5, 0.25, 0.25, 0.5],
    tag: "sixteenth",
    weight: 1,
  },
];
function startAllowed(cell, pulse, meter) {
  if (cell.span === 1) return true;
  if (meter.compound) return pulse === 0;
  if (cell.span >= 3) return pulse === 0;
  return meter.beats === 3 ? pulse <= 1 : pulse % 2 === 0;
}
const barLength = (meter) => meter.pulses.reduce((a, b) => a + b, 0);

function buildRhythm(
  rng,
  meter,
  tags,
  { first, last, penultimate, rests, group },
) {
  const length = barLength(meter);
  if (last) return [{ duration: length, rest: false, group: group.next++ }];
  const cells = meter.compound ? COMPOUND_CELLS : SIMPLE_CELLS;
  const events = [];
  let pulse = 0,
    restCells = 0;
  while (pulse < meter.pulses.length) {
    const candidates = cells.filter(
      (cell) =>
        (cell.tag === "basic" || cell.tag === "rest" || tags.has(cell.tag)) &&
        pulse + cell.span <= meter.pulses.length &&
        startAllowed(cell, pulse, meter) &&
        !(penultimate && cell.span === meter.pulses.length) &&
        (cell.tag !== "rest" || (rests && restCells === 0 && pulse > 0)) &&
        (cell.id !== "re" || pulse > 0 || !first),
    );
    const cell = weighted(rng, candidates);
    const id = group.next++;
    for (const n of cell.notes)
      events.push(
        typeof n === "object"
          ? { duration: n.rest, rest: true, group: id }
          : { duration: n, rest: false, group: id },
      );
    if (cell.tag === "rest") restCells++;
    pulse += cell.span;
  }
  return events;
}

// Beams: consecutive notes shorter than a quarter inside one cell. Sixteenths
// carry a second beam; a lone sixteenth after a dotted eighth gets a hook.
function assignBeams(events) {
  let i = 0;
  while (i < events.length) {
    let j = i;
    while (
      j < events.length &&
      !events[j].rest &&
      events[j].duration < 1 - EPS &&
      events[j].group === events[i].group
    )
      j++;
    const run = events.slice(i, j);
    if (run.length >= 2) {
      run.forEach((event, k) => {
        event.beams = {
          1: k === 0 ? "begin" : k === run.length - 1 ? "end" : "continue",
        };
      });
      let k = 0;
      while (k < run.length) {
        if (run[k].duration > 0.25 + EPS) {
          k++;
          continue;
        }
        let m = k;
        while (m < run.length && run[m].duration <= 0.25 + EPS) m++;
        if (m - k >= 2)
          for (let x = k; x < m; x++)
            run[x].beams[2] =
              x === k ? "begin" : x === m - 1 ? "end" : "continue";
        else run[k].beams[2] = k > 0 ? "backward hook" : "forward hook";
        k = m;
      }
    }
    i = Math.max(j, i + 1);
  }
  return events;
}

const CHORD_ROOTS = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5 };
const OPENINGS = [
  ["I", "IV", "V", "I"],
  ["I", "V", "I", "V"],
  ["I", "IV", "I", "V"],
  ["I", "I", "IV", "V"],
  ["I", "vi", "IV", "V"],
  ["I", "V", "vi", "IV"],
  ["I", "ii", "V", "I"],
];
const CLOSINGS = [
  ["I", "IV", "V", "I"],
  ["I", "V", "V", "I"],
  ["IV", "I", "V", "I"],
  ["vi", "IV", "V", "I"],
  ["I", "ii", "V", "I"],
];
function progression(rng, bars, simple) {
  const ok = (p) => !simple || p.every((c) => ["I", "IV", "V"].includes(c));
  const chords = [];
  const groups = Math.max(1, Math.ceil(bars / 4));
  for (let g = 0; g < groups; g++)
    chords.push(
      ...pick(rng, (g === groups - 1 ? CLOSINGS : OPENINGS).filter(ok)),
    );
  return chords.slice(0, bars).map((name) => ({
    name,
    root: CHORD_ROOTS[name],
    tones: [0, 2, 4].map((t) => mod(CHORD_ROOTS[name] + t, 7)),
  }));
}

function makeKey(fifths) {
  const alters = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const order = fifths > 0 ? "FCGDAEB" : "BEADGCF";
  for (const letter of order.slice(0, Math.abs(fifths)))
    alters[letter] = Math.sign(fifths);
  const pitchClass = mod(fifths * 7, 12);
  return {
    fifths,
    alters,
    letter: mod(4 * fifths, 7),
    // Right-hand tonic between A3 and A♭4, so positions sit around middle C.
    tonicMidi: 60 + mod(pitchClass + 3, 12) - 3,
  };
}
// Diatonic index 0 is the hand's tonic; 7 is the octave above.
function spell(key, tonicMidi, index, chromatic = 0) {
  const letter = LETTERS[mod(key.letter + index, 7)];
  const alter = key.alters[letter] + chromatic;
  const midi =
    tonicMidi + 12 * Math.floor(index / 7) + MAJOR[mod(index, 7)] + chromatic;
  return {
    midi,
    step: letter,
    alter,
    octave: Math.floor((midi - alter) / 12) - 1,
    chromatic,
  };
}
// Hands keep separate registers: the melody never drops below the leading
// tone under its tonic, the bass never rises past the sixth above its tonic.
// Unisons between hands would otherwise merge into one written note.
const RH_RANGES = { five: [0, 4], octave: [0, 7], wide: [-1, 9] };
const LH_RANGES = { five: [0, 4], octave: [-3, 4], wide: [-4, 5] };

// A melody is a constrained random walk: mostly steps, occasional skips, a
// recoil after any leap, chord tones on strong beats, and a cadence at the end.
function createWalker(rng, { lo, hi, maxLeap, repeat }) {
  const state = { d: null, direction: 0, recoil: 0 };
  const candidates = (tones) => {
    const list = [];
    for (let i = lo; i <= hi; i++) if (tones.includes(mod(i, 7))) list.push(i);
    return list;
  };
  const nearest = (list, target, limitFrom = null) => {
    let allowed = list;
    if (limitFrom != null)
      allowed = list.filter((i) => Math.abs(i - limitFrom) <= maxLeap);
    if (!allowed.length) allowed = list;
    if (!allowed.length) return null;
    let best = allowed[0];
    for (const i of allowed)
      if (
        Math.abs(i - target) < Math.abs(best - target) ||
        (Math.abs(i - target) === Math.abs(best - target) && chance(rng, 0.5))
      )
        best = i;
    return best;
  };
  return {
    first(tones) {
      const list = candidates(tones);
      const span = hi - lo;
      const inner = list.filter(
        (i) => i >= lo + span * 0.15 - EPS && i <= hi - span * 0.15 + EPS,
      );
      const pool = inner.length ? inner : list;
      const tonics = pool.filter((i) => mod(i, 7) === 0);
      state.d =
        tonics.length && chance(rng, 0.55)
          ? pick(rng, tonics)
          : pick(rng, pool);
      return state.d;
    },
    next({
      tones,
      strong,
      approach = false,
      final = false,
      home = false,
      budget = Infinity,
    }) {
      if (state.d == null) return this.first(tones);
      const previous = state.d;
      const tonic = nearest(candidates([0]), previous);
      const homeTarget = home ? tonic : null;
      let d;
      if (final) {
        d = nearest(candidates([0]), previous, previous);
        if (d == null || Math.abs(d - previous) > maxLeap)
          d = nearest(candidates([0, 2, 4]), previous, previous);
      } else if (approach) {
        d = nearest(
          [tonic - 1, tonic + 1, tonic - 3, tonic + 4].filter(
            (i) => i >= lo && i <= hi && Math.abs(i - tonic) <= maxLeap,
          ),
          previous,
          previous,
        );
      } else {
        let interval;
        if (state.recoil) {
          interval = -state.recoil * (chance(rng, 0.75) ? 1 : 2);
          state.recoil = 0;
        } else if (chance(rng, repeat)) interval = 0;
        else {
          const magnitudes = [];
          for (let m = 1; m <= maxLeap; m++)
            magnitudes.push({
              m,
              weight: [0, 10, 4, 1.6, 1.2, 0.7, 0.4, 0.6][m] || 0.3,
            });
          let m = weighted(rng, magnitudes).m;
          let up;
          if (
            homeTarget != null &&
            homeTarget !== previous &&
            chance(rng, 0.85)
          ) {
            up = homeTarget > previous;
            m = Math.min(m, Math.abs(homeTarget - previous));
          } else if (previous - lo < 2) up = chance(rng, 0.85);
          else if (hi - previous < 2) up = chance(rng, 0.15);
          else if (state.direction && m === 1)
            up = chance(rng, 0.62) ? state.direction > 0 : state.direction < 0;
          else up = chance(rng, 0.5);
          interval = up ? m : -m;
        }
        d = previous + interval;
        if (d < lo || d > hi) d = clamp(previous - interval, lo, hi);
        if (strong && chance(rng, 0.85)) {
          const chordTone = nearest(candidates(tones), d, previous);
          if (chordTone != null) d = chordTone;
        }
      }
      if (d == null) d = previous;
      // Never wander farther from the tonic than the remaining notes can cover.
      if (!final && tonic != null && Math.abs(d - tonic) > budget) {
        const towards = Math.sign(tonic - previous);
        d =
          towards === 0
            ? previous
            : previous +
              towards * Math.min(maxLeap, Math.abs(tonic - previous));
      }
      state.recoil = Math.abs(d - previous) >= 3 ? Math.sign(d - previous) : 0;
      state.direction = Math.sign(d - previous) || state.direction;
      state.d = d;
      return d;
    },
  };
}

function strongOffsets(meter) {
  const offsets = [];
  let at = 0;
  meter.pulses.forEach((p, i) => {
    if (meter.strong.includes(i)) offsets.push(at);
    at += p;
  });
  return offsets;
}

function melodyBars(rng, config, key, tonicMidi, range, chords, meter, tags) {
  const walker = createWalker(rng, {
    lo: range[0],
    hi: range[1],
    maxLeap: config.maxLeap,
    repeat: config.repeat,
  });
  const strong = strongOffsets(meter);
  const group = { next: 1 };
  const bars = [];
  for (let b = 0; b < config.bars; b++) {
    const events = assignBeams(
      buildRhythm(rng, meter, tags, {
        first: b === 0,
        last: b === config.bars - 1,
        penultimate: b === config.bars - 2,
        rests: config.rests,
        group,
      }),
    );
    let at = 0;
    for (const event of events) {
      event.offset = at;
      event.bar = b;
      event.strong = strong.some((s) => Math.abs(s - at) < EPS);
      at += event.duration;
    }
    bars.push(events);
  }
  // Pitches are chosen once every rhythm is known, so the walk can budget its
  // remaining notes and always arrive on the tonic by step or allowed leap.
  const notes = bars.flat().filter((e) => !e.rest);
  notes.forEach((event, i) => {
    const remaining = notes.length - 1 - i;
    event.degree = walker.next({
      tones: chords[event.bar].tones,
      strong: event.strong,
      approach: remaining === 1,
      final: remaining === 0,
      home: event.bar >= config.bars - 2,
      budget: Math.max(0, (remaining - 1) * config.maxLeap - 1),
    });
  });
  // Chromatic approach notes: a weak-beat note a whole step below or above a
  // strong-beat chord tone becomes its chromatic neighbor.
  notes.forEach((event, i) => {
    const next = notes[i + 1];
    if (!next || event.strong || !next.strong) return;
    if (!config.accidentals || !chance(rng, 0.35)) return;
    const gap =
      spell(key, tonicMidi, next.degree).midi -
      spell(key, tonicMidi, event.degree).midi;
    const letter = LETTERS[mod(key.letter + event.degree, 7)];
    if (next.degree - event.degree === 1 && gap === 2 && key.alters[letter] < 1)
      event.chromatic = 1;
    else if (
      event.degree - next.degree === 1 &&
      gap === -2 &&
      key.alters[letter] > -1
    )
      event.chromatic = -1;
  });
  for (const event of notes)
    event.pitches = [spell(key, tonicMidi, event.degree, event.chromatic || 0)];
  return bars;
}

function bassIndex(root) {
  return root <= 4 ? root : root - 7;
}
function voicings(root) {
  const b = bassIndex(root);
  const shapes = [
    [b, b + 2, b + 4],
    [b + 2, b + 4, b + 7],
    [b + 4, b + 7, b + 9],
  ];
  const result = [];
  for (const shape of shapes) {
    let v = shape.slice();
    while (v[2] > 5) v = v.map((i) => i - 7);
    while (v[0] < -6) v = v.map((i) => i + 7);
    if (v[2] <= 5 && v[0] >= -6) result.push(v);
  }
  return result;
}
function accompanimentBars(
  rng,
  config,
  key,
  tonicMidi,
  chords,
  meter,
  pattern,
) {
  const length = barLength(meter);
  const bars = [];
  let previous = null;
  const group = { next: 1 };
  const event = (duration, indices, id) => ({
    duration,
    rest: false,
    group: id,
    pitches: indices.map((i) => spell(key, tonicMidi, i)),
  });
  for (let b = 0; b < config.bars; b++) {
    const chord = chords[b];
    const root = bassIndex(chord.root);
    const fifth = root + 4 <= 5 ? root + 4 : root - 3;
    const last = b === config.bars - 1;
    const id = group.next++;
    const options = voicings(chord.root);
    let voicing = options[0] || [root, root + 2, root + 4];
    if (pattern === "chords") {
      if (options.length) {
        if (!previous) voicing = options[0];
        else {
          const distance = (v) =>
            v.reduce((sum, i, k) => sum + Math.abs(i - previous[k]), 0) +
            rng() * 0.01;
          voicing = options.reduce((best, v) =>
            distance(v) < distance(best) ? v : best,
          );
        }
      }
      previous = voicing;
    }
    let events;
    if (last) {
      const indices =
        pattern === "chords" || pattern === "broken"
          ? voicing
          : pattern === "fifths"
            ? [root, fifth]
            : [root];
      events = [event(length, indices, id)];
    } else if (pattern === "long") {
      if (meter.compound)
        events = chance(rng, 0.3)
          ? [event(1.5, [root], id), event(1.5, [fifth], group.next++)]
          : [event(3, [root], id)];
      else if (meter.beats === 4)
        events = chance(rng, 0.35)
          ? [event(2, [root], id), event(2, [fifth], group.next++)]
          : [event(4, [root], id)];
      else if (meter.beats === 3)
        events = chance(rng, 0.3)
          ? [event(2, [root], id), event(1, [fifth], group.next++)]
          : [event(3, [root], id)];
      else events = [event(2, [root], id)];
    } else if (pattern === "fifths") {
      const dyad = [root, fifth];
      const alternate = chance(rng, 0.5);
      if (meter.compound)
        events = alternate
          ? [event(1.5, [root], id), event(1.5, [fifth], group.next++)]
          : [event(3, dyad, id)];
      else if (alternate)
        events = meter.pulses.map((_, i) =>
          event(1, [i % 2 ? fifth : root], group.next++),
        );
      else if (meter.beats === 4)
        events = [event(2, dyad, id), event(2, dyad, group.next++)];
      else events = [event(length, dyad, id)];
    } else if (pattern === "chords") {
      if (meter.compound)
        events = chance(rng, 0.4)
          ? [event(1.5, voicing, id), event(1.5, voicing, group.next++)]
          : [event(3, voicing, id)];
      else if (meter.beats === 4)
        events = chance(rng, 0.3)
          ? [event(4, voicing, id)]
          : chance(rng, 0.25)
            ? meter.pulses.map(() => event(1, voicing, group.next++))
            : [event(2, voicing, id), event(2, voicing, group.next++)];
      else if (meter.beats === 3)
        events = chance(rng, 0.35)
          ? meter.pulses.map(() => event(1, voicing, group.next++))
          : [event(3, voicing, id)];
      else
        events = chance(rng, 0.4)
          ? [event(1, voicing, id), event(1, voicing, group.next++)]
          : [event(2, voicing, id)];
    } else {
      // Broken chords: Alberti bass and simple arpeggios in the current shape.
      const [r, t, f] = voicing;
      const eighths = (indices) => indices.map((i) => event(0.5, [i], id));
      if (meter.compound) events = eighths([r, t, f, r, t, f]);
      else if (meter.beats === 4)
        events = chance(rng, 0.7)
          ? eighths([r, f, t, f, r, f, t, f])
          : [r, f, t, f].map((i) => event(1, [i], group.next++));
      else if (meter.beats === 3)
        events = chance(rng, 0.5)
          ? eighths([r, f, t, f, t, f])
          : [r, t, f].map((i) => event(1, [i], group.next++));
      else events = eighths([r, f, t, f]);
    }
    let at = 0;
    for (const e of events) {
      e.offset = at;
      at += e.duration;
    }
    bars.push(assignBeams(events));
  }
  return bars;
}

const TYPES = [
  [4, "whole", 0],
  [3, "half", 1],
  [2, "half", 0],
  [1.5, "quarter", 1],
  [1, "quarter", 0],
  [0.75, "eighth", 1],
  [0.5, "eighth", 0],
  [0.25, "16th", 0],
];
const DIVISIONS = 4;
const escapeXML = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const ACCIDENTALS = { "-1": "flat", 0: "natural", 1: "sharp" };
function xmlEvent(event, staff, voice) {
  const [, type, dots] = TYPES.find(
    ([d]) => Math.abs(d - event.duration) < EPS,
  ) || [event.duration, "quarter", 0];
  const units = Math.round(event.duration * DIVISIONS);
  const tail = `<duration>${units}</duration><voice>${voice}</voice><type>${type}</type>${"<dot/>".repeat(dots)}`;
  if (event.rest) return `<note><rest/>${tail}<staff>${staff}</staff></note>`;
  return event.pitches
    .map((p, i) => {
      const pitch = `<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ""}<octave>${p.octave}</octave></pitch>`;
      const accidental = p.chromatic
        ? `<accidental>${ACCIDENTALS[p.alter] || (p.alter > 0 ? "double-sharp" : "flat-flat")}</accidental>`
        : "";
      const beams =
        i === 0 && event.beams
          ? Object.entries(event.beams)
              .map(([n, v]) => `<beam number="${n}">${v}</beam>`)
              .join("")
          : "";
      return `<note>${i ? "<chord/>" : ""}${pitch}${tail}<staff>${staff}</staff>${accidental}${beams}</note>`;
    })
    .join("");
}

// Sounding MIDI bounds of each hand for a configuration.
export function exerciseRegisters(config) {
  const key = makeKey(config.fifths);
  const bounds = (tonicMidi, [lo, hi]) => [
    spell(key, tonicMidi, lo).midi,
    spell(key, tonicMidi, hi).midi,
  ];
  return {
    right: bounds(key.tonicMidi, RH_RANGES[config.range]),
    left:
      config.hands === "left" || config.left === "melody"
        ? bounds(key.tonicMidi - 12, LH_RANGES[config.range])
        : [
            spell(key, key.tonicMidi - 12, -6).midi,
            spell(key, key.tonicMidi - 12, 5).midi,
          ],
  };
}

export function exerciseTitle(config) {
  return `Sight reading · Level ${config.level} · ${keyName(config.fifths)}`;
}
export function exerciseSummary(config) {
  const hands =
    config.hands === "both"
      ? "both hands"
      : config.hands === "left"
        ? "left hand"
        : "right hand";
  return `${keyName(config.fifths)} · ${config.meter} · ${config.bars} bars · ${hands} · ♩ = ${config.tempo}`;
}

export function resolveExercise(input = {}) {
  const level = levelFor(input.level);
  const seed =
    Number.isInteger(input.seed) && input.seed > 0 ? input.seed : randomSeed();
  const rng = seededRandom(seed);
  const auto = (v) => v == null || v === "auto" || v === "";
  const fifths = auto(input.fifths)
    ? pick(rng, level.fifths)
    : clamp(Math.round(Number(input.fifths)) || 0, -7, 7);
  const meter =
    auto(input.meter) || !METERS[input.meter]
      ? pick(rng, level.meters)
      : input.meter;
  const hands = ["right", "left", "both"].includes(input.hands)
    ? input.hands
    : level.hands;
  const bars = BAR_CHOICES.includes(Number(input.bars))
    ? Number(input.bars)
    : level.bars;
  const tempo =
    Number.isFinite(Number(input.tempo)) && !auto(input.tempo)
      ? clamp(Math.round(Number(input.tempo)), 30, 200)
      : level.tempo;
  const range = RANGES.includes(input.range) ? input.range : level.range;
  const maxLeap =
    Number.isInteger(Number(input.maxLeap)) && !auto(input.maxLeap)
      ? clamp(Number(input.maxLeap), 1, 7)
      : level.maxLeap;
  const rhythm = Array.isArray(input.rhythm)
    ? input.rhythm.filter((tag) => RHYTHM_TAGS.includes(tag))
    : level.rhythm;
  const rests = typeof input.rests === "boolean" ? input.rests : level.rests;
  const accidentals =
    typeof input.accidentals === "boolean"
      ? input.accidentals
      : !!level.accidentals;
  let left = LEFT_PATTERNS.includes(input.left) ? input.left : level.left;
  if (left === "mixed" || !left) left = pick(rng, ["chords", "broken"]);
  return {
    config: {
      level: level.level,
      seed,
      fifths,
      meter,
      hands,
      bars,
      tempo,
      range,
      maxLeap,
      rhythm,
      rests,
      accidentals,
      left,
      repeat: level.repeat,
      request: {
        level: level.level,
        fifths: auto(input.fifths) ? "auto" : fifths,
        hands: ["right", "left", "both"].includes(input.hands)
          ? input.hands
          : "auto",
        bars: BAR_CHOICES.includes(Number(input.bars)) ? bars : "auto",
        meter: auto(input.meter) || !METERS[input.meter] ? "auto" : meter,
        tempo:
          Number.isFinite(Number(input.tempo)) && !auto(input.tempo)
            ? tempo
            : "auto",
      },
    },
    rng,
    level,
  };
}

export function exerciseXML(config, rng = seededRandom(config.seed)) {
  const key = makeKey(config.fifths);
  const meter = METERS[config.meter];
  const chords = progression(rng, config.bars, config.level <= 5);
  const tags = new Set(config.rhythm);
  const right =
    config.hands !== "left"
      ? melodyBars(
          rng,
          config,
          key,
          key.tonicMidi,
          RH_RANGES[config.range],
          chords,
          meter,
          tags,
        )
      : null;
  let left = null;
  if (config.hands !== "right") {
    const lhTags = new Set(
      config.hands === "left"
        ? config.rhythm
        : config.rhythm.filter((t) => t === "eighth"),
    );
    const pattern = config.hands === "left" ? "melody" : config.left;
    left =
      pattern === "melody"
        ? melodyBars(
            rng,
            config,
            key,
            key.tonicMidi - 12,
            LH_RANGES[config.range],
            chords,
            meter,
            lhTags,
          )
        : accompanimentBars(
            rng,
            config,
            key,
            key.tonicMidi - 12,
            chords,
            meter,
            pattern,
          );
  }
  const staves = right && left ? 2 : 1;
  const clef = (n, sign) =>
    `<clef${staves > 1 ? ` number="${n}"` : ""}><sign>${sign}</sign><line>${sign === "G" ? 2 : 4}</line></clef>`;
  const measures = [];
  for (let b = 0; b < config.bars; b++) {
    let body = "";
    if (b === 0)
      body += `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${config.fifths}</fifths><mode>major</mode></key><time><beats>${meter.beats}</beats><beat-type>${meter.beatType}</beat-type></time>${staves > 1 ? `<staves>2</staves>${clef(1, "G")}${clef(2, "F")}` : clef(1, right ? "G" : "F")}</attributes><direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${config.tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${config.tempo}"/></direction>`;
    if (right) body += right[b].map((e) => xmlEvent(e, 1, 1)).join("");
    if (left) {
      if (right)
        body += `<backup><duration>${Math.round(barLength(meter) * DIVISIONS)}</duration></backup>`;
      body += left[b].map((e) => xmlEvent(e, staves, staves)).join("");
    }
    if (b === config.bars - 1)
      body +=
        '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    measures.push(`<measure number="${b + 1}">${body}</measure>`);
  }
  const title = exerciseTitle(config);
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${escapeXML(title)}</work-title></work><identification><creator type="composer">Luma Keys exercise #${config.seed}</creator><encoding><software>Luma Keys</software></encoding></identification><part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;
}

export function generateExercise(input = {}) {
  const { config, rng, level } = resolveExercise(input);
  const xml = exerciseXML(config, rng);
  const score = parseMusicXML(xml, exerciseTitle(config));
  return {
    ...score,
    title: exerciseTitle(config),
    composer: `Luma Keys exercise #${config.seed} · ${level.title}`,
    description: `${level.summary} ${exerciseSummary(config)}.`,
    source: "Exercise",
    reviewed: true,
    practiceTips: level.tips,
    exercise: config,
  };
}
