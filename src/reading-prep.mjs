// What a sight reader checks before the first note: key, meter, tempo, range,
// the smallest note value, and anything that tends to trip a first reading.
import { groups, keyLabel, noteName, usesFlats } from "./music.mjs";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const EPS = 1e-6;
const mod = (n, m) => ((n % m) + m) % m;

export function intervalName(semitones) {
  const s = Math.abs(semitones);
  if (s === 0) return "unison";
  if (s <= 2) return "step";
  if (s <= 4) return "third";
  if (s <= 6) return "fourth";
  if (s <= 8) return "fifth";
  if (s <= 10) return "sixth";
  if (s === 11) return "seventh";
  if (s === 12) return "octave";
  return "leap of more than an octave";
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function readingPrep(score, hand = "both") {
  const flats = usesFlats(score);
  const notes = score.notes.filter((n) => hand === "both" || n.hand === hand);
  const fifths = Number.isInteger(score.keySignature?.fifths)
    ? score.keySignature.fifths
    : null;
  let key = keyLabel(score);
  let scale = null;
  if (fifths != null) {
    const tonic = mod(fifths * 7, 12);
    scale = new Set(MAJOR.map((x) => (x + tonic) % 12));
  } else if (notes.every((n) => MAJOR.includes(n.midi % 12))) {
    key = "C major";
    scale = new Set(MAJOR);
  }
  const signatureText =
    fifths == null
      ? ""
      : fifths === 0
        ? "no sharps or flats"
        : fifths > 0
          ? `${fifths}♯`
          : `${-fifths}♭`;
  const signature =
    score.measureSignatures?.[0] ||
    (Number.isInteger(score.meter) ? `${score.meter}/4` : "");
  const hands = {};
  for (const h of ["right", "left"]) {
    const own = notes.filter((n) => n.hand === h);
    if (!own.length) continue;
    const pitches = own.map((n) => n.midi);
    hands[h] = {
      low: noteName(Math.min(...pitches), flats),
      high: noteName(Math.max(...pitches), flats),
      count: own.length,
    };
  }
  const shortest = notes.length ? Math.min(...notes.map((n) => n.duration)) : 1;
  const rhythm =
    shortest <= 0.25 + EPS
      ? "sixteenths"
      : shortest <= 0.5 + EPS
        ? "eighths"
        : shortest <= 1 + EPS
          ? "quarters"
          : "long notes";
  const dotted = notes.some((n) =>
    [0.75, 1.5, 3].some((d) => Math.abs(n.duration - d) < EPS),
  );
  const offbeat = notes.some(
    (n) => Math.abs(mod(n.beat, 1) - 0.5) < EPS && n.duration >= 1 - EPS,
  );
  const accidentals = { count: 0, bars: [] };
  if (scale)
    for (const n of notes)
      if (!scale.has(mod(n.midi, 12))) {
        accidentals.count++;
        if (!accidentals.bars.includes(n.measure))
          accidentals.bars.push(n.measure);
      }
  const leap = { semitones: 0, bar: null, hand: null };
  const chords = [];
  for (const h of ["right", "left"]) {
    const own = groups(notes.filter((n) => n.hand === h));
    if (own.some((g) => g.notes.length > 1)) chords.push(h);
    const voice = (g) =>
      h === "right"
        ? Math.max(...g.notes.map((n) => n.midi))
        : Math.min(...g.notes.map((n) => n.midi));
    for (let i = 1; i < own.length; i++) {
      const d = Math.abs(voice(own[i]) - voice(own[i - 1]));
      if (d > leap.semitones) {
        leap.semitones = d;
        leap.bar = own[i].notes[0].measure;
        leap.hand = h;
      }
    }
  }
  const watch = [];
  if (rhythm === "sixteenths") watch.push("Sixteenth notes");
  else if (rhythm === "eighths") watch.push("Eighth notes");
  if (dotted) watch.push("Dotted rhythms");
  if (offbeat) watch.push("Off-beat entries");
  if (accidentals.count)
    watch.push(
      `${plural(accidentals.count, "accidental")} (bar${accidentals.bars.length === 1 ? "" : "s"} ${accidentals.bars.slice(0, 4).join(", ")}${accidentals.bars.length > 4 ? "…" : ""})`,
    );
  if (leap.semitones >= 7)
    watch.push(
      `A ${intervalName(leap.semitones)} in bar ${leap.bar}${hand === "both" && leap.hand ? ` (${leap.hand} hand)` : ""}`,
    );
  if (chords.length)
    watch.push(
      chords.length === 2
        ? "Chords in both hands"
        : `Chords in the ${chords[0]} hand`,
    );
  if (
    Array.isArray(score.measureSignatures) &&
    new Set(score.measureSignatures).size > 1
  )
    watch.push("Time signature changes");
  if (score.pickup > 0) watch.push("Starts with a pickup");
  return {
    key,
    signatureText,
    signature,
    tempo: score.bpm,
    hands,
    rhythm,
    dotted,
    offbeat,
    accidentals,
    leap,
    chords,
    watch,
    flats,
  };
}
