import { XMLParser, XMLValidator } from "fast-xml-parser";
import { unzipSync, strFromU8 } from "fflate";
import * as midiPackage from "@tonejs/midi";
const Midi = midiPackage.Midi || midiPackage.default?.Midi;
export const PITCHES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export const NUMBERS = [
  "1",
  "♯1",
  "2",
  "♯2",
  "3",
  "4",
  "♯4",
  "5",
  "♯5",
  "6",
  "♯6",
  "7",
];
export const SOLFEGE = [
  "Do",
  "Di",
  "Re",
  "Ri",
  "Mi",
  "Fa",
  "Fi",
  "Sol",
  "Si",
  "La",
  "Li",
  "Ti",
];
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export const noteName = (m) =>
  PITCHES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const degree = (m, tonic = 0) => NUMBERS[(((m - tonic) % 12) + 12) % 12];
export const solfege = (m, tonic = 0) =>
  SOLFEGE[(((m - tonic) % 12) + 12) % 12];
// One bar map drives import review, transport loops and printable practice sheets.
// Older saved scores without a map retain their original constant-meter behavior.
export function barStart(score, bar) {
  const i = Math.max(0, Math.floor(bar) - 1);
  const starts = score.measureStarts;
  if (!starts?.length) return i * (score.meter || 4);
  if (i < starts.length) return starts[i];
  const last = starts.length - 1;
  return (
    starts[last] +
    (i - last) * (score.measureLengths?.[last] || score.meter || 4)
  );
}
export function barEnd(score, bar) {
  const i = Math.max(0, Math.floor(bar) - 1);
  if (score.measureStarts?.[i + 1] != null) return score.measureStarts[i + 1];
  if (score.measureLengths?.[i] != null)
    return barStart(score, bar) + score.measureLengths[i];
  if (!score.measureLengths?.length && bar === score.measures)
    return Math.max(barStart(score, bar), score.duration);
  return barStart(score, bar + 1);
}
export function measureAt(score, beat) {
  const b = Math.max(0, beat);
  const starts = score.measureStarts;
  if (!starts?.length) return Math.floor(b / (score.meter || 4) + 1e-6) + 1;
  // Binary search avoids scanning the whole score every animation frame.
  let lo = 0,
    hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (starts[mid] <= b + 1e-6) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, lo - 1);
  if (i < starts.length - 1) return i + 1;
  const length = score.measureLengths?.[i] || score.meter || 4;
  return i + 1 + Math.floor(Math.max(0, b - starts[i]) / length + 1e-6);
}
export function keyboardLayout(low = 48, high = 84) {
  const whites = [];
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
  const w = 100 / whites.length;
  return Array.from({ length: high - low + 1 }, (_, i) => {
    const midi = low + i,
      b = isBlack(midi);
    let idx = whites.filter((n) => n < midi).length;
    return {
      midi,
      black: b,
      left: b ? idx * w - w * 0.31 : idx * w,
      width: b ? w * 0.62 : w,
    };
  });
}
const array = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
function tree(items) {
  return items
    .filter((x) => !Object.keys(x)[0].startsWith("?"))
    .map((x) => {
      let tag = Object.keys(x).find((k) => k !== ":@");
      if (tag === "#text")
        return { tag, text: String(x[tag]), children: [], attrs: {} };
      return {
        tag,
        attrs: x[":@"] || {},
        children: tree(array(x[tag])),
        text: "",
      };
    });
}
const kids = (n, t) => n.children.filter((c) => c.tag === t);
const one = (n, t) => kids(n, t)[0];
const txt = (n) =>
  n ? (n.tag === "#text" ? n.text : n.children.map(txt).join("")) : "";
const value = (n, t, def = "") => txt(one(n, t)) || def;
const attr = (n, k, d = "") => n?.attrs["@_" + k] ?? d;
const descendants = (n, t) => [
  ...kids(n, t),
  ...n.children.flatMap((c) => descendants(c, t)),
];
const allTags = (n) => n.children.flatMap((c) => [c.tag, ...allTags(c)]);
// Beats are rounded so triplets summed from different divisions still line up as one chord.
const round = (x) => Math.round(x * 1e6) / 1e6;
const numberOf = (s) => {
  const t = String(s ?? "").trim();
  return t === "" ? NaN : Number(t);
};
const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAX_XML_BYTES = 30000000;
// Entities are left unexpanded by the parser (safer), so decode the standard ones for display text.
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const l = e.toLowerCase();
    if (l[0] === "#") {
      const c =
        l[1] === "x" ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
      try {
        return String.fromCodePoint(c);
      } catch {
        return m;
      }
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[l];
  });
const listBars = (bars) =>
  bars.slice(0, 6).join(", ") + (bars.length > 6 ? "…" : "");
function decodeText(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    bytes = bytes.subarray(3);
  else if (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  ) {
    const le = bytes[0] === 0xff;
    let body = bytes.slice(2);
    if (!le)
      for (let i = 0; i + 1 < body.length; i += 2) {
        const b = body[i];
        body[i] = body[i + 1];
        body[i + 1] = b;
      }
    return new TextDecoder("utf-16le").decode(body);
  }
  const head = strFromU8(bytes.subarray(0, 200), true);
  const enc = head
    .match(/^<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1]
    ?.toLowerCase();
  if (enc && /^(iso-8859-1|latin-?1|windows-1252|cp1252)$/.test(enc)) {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return strFromU8(bytes, true);
    }
  }
  return strFromU8(bytes);
}
export function unpackXML(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!bytes.length) throw Error("The file is empty.");
  if (bytes[0] === 80 && bytes[1] === 75) {
    const tooLarge = new Set();
    let files;
    // Only extract the container and XML files so embedded images or oversized entries cannot exhaust memory.
    try {
      files = unzipSync(bytes, {
        filter: (f) => {
          if (f.name.startsWith("__MACOSX/")) return false;
          if (f.name === "META-INF/container.xml") return true;
          if (!/\.(musicxml|xml)$/i.test(f.name)) return false;
          if (f.originalSize > MAX_XML_BYTES) {
            tooLarge.add(f.name);
            return false;
          }
          return true;
        },
      });
    } catch {
      throw Error(
        "This compressed MusicXML (.mxl) file is damaged or incomplete.",
      );
    }
    let root;
    if (files["META-INF/container.xml"]) {
      const container = strFromU8(files["META-INF/container.xml"]);
      root = container.match(/full-path\s*=\s*["']([^"']+)["']/)?.[1];
    }
    if (root && tooLarge.has(root))
      throw Error("Score is too large. Import a shorter piece.");
    root = files[root]
      ? root
      : Object.keys(files).find(
          (k) => /\.(musicxml|xml)$/i.test(k) && !k.startsWith("META-INF"),
        );
    if (!root || !files[root]) {
      if (tooLarge.size)
        throw Error("Score is too large. Import a shorter piece.");
      throw Error("This archive does not contain a MusicXML score.");
    }
    return decodeText(files[root]);
  }
  if (bytes.length > MAX_XML_BYTES)
    throw Error("Score is too large. Import a shorter piece.");
  return decodeText(bytes);
}
function timeQuarters(time) {
  if (one(time, "senza-misura")) return null;
  const beats = kids(time, "beats").map(txt),
    types = kids(time, "beat-type").map(txt);
  if (!beats.length || beats.length !== types.length) return null;
  let q = 0;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i].split("+").reduce((s, x) => s + numberOf(x), 0),
      t = numberOf(types[i]);
    if (!(b > 0) || !(t > 0) || !Number.isFinite(b)) return null;
    q += (b * 4) / t;
  }
  return q;
}
const BEAT_UNITS = {
  maxima: 32,
  long: 16,
  breve: 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  "16th": 0.25,
  "32nd": 0.125,
  "64th": 0.0625,
};
const NOTE_TYPES = { ...BEAT_UNITS, "128th": 1 / 32, "256th": 1 / 64 };
// Fallback when an exporter omits <duration>: the written type, dots and tuplet ratio give the length.
function writtenQuarters(n) {
  const base = NOTE_TYPES[value(n, "type").trim()];
  if (!base) return NaN;
  const tm = one(n, "time-modification");
  let ratio = tm
    ? numberOf(value(tm, "normal-notes")) / numberOf(value(tm, "actual-notes"))
    : 1;
  if (!(ratio > 0) || !Number.isFinite(ratio)) ratio = 1;
  return base * (2 - 0.5 ** kids(n, "dot").length) * ratio;
}
const ACCIDENTAL_ALTER = {
  sharp: 1,
  flat: -1,
  natural: 0,
  "double-sharp": 2,
  "sharp-sharp": 2,
  "flat-flat": -2,
  "natural-sharp": 1,
  "natural-flat": -1,
};
const keyStepAlters = (f) =>
  Object.fromEntries(
    [...(f > 0 ? "FCGDAEB" : "BEADGCF")]
      .slice(0, Math.min(7, Math.abs(f)))
      .map((s) => [s, Math.sign(f)]),
  );
// A transposing part's written key is reported in concert pitch, spelled with at most six sharps or flats.
const concertFifths = (k) => {
  if (!k.transpose) return k.fifths;
  let f = k.fifths + ((((k.transpose * 7) % 12) + 12) % 12);
  while (f > 6) f -= 12;
  return f;
};
function metronomeTempo(metro) {
  const perMinute = Number(
    value(metro, "per-minute").match(/\d+(\.\d+)?/)?.[0],
  );
  const units = kids(metro, "beat-unit");
  if (!(perMinute > 0) || units.length !== 1) return null;
  const unit = BEAT_UNITS[txt(units[0]).trim()];
  if (!unit) return null;
  const dots = kids(metro, "beat-unit-dot").length;
  return perMinute * unit * (2 - 0.5 ** dots);
}
const ORNAMENT_WARNING =
  "Trills, turns and other ornaments are practiced as their main written note.";
const NOTATION_WARNINGS = {
  "trill-mark": ORNAMENT_WARNING,
  turn: ORNAMENT_WARNING,
  "inverted-turn": ORNAMENT_WARNING,
  "delayed-turn": ORNAMENT_WARNING,
  "delayed-inverted-turn": ORNAMENT_WARNING,
  mordent: ORNAMENT_WARNING,
  "inverted-mordent": ORNAMENT_WARNING,
  shake: ORNAMENT_WARNING,
  "wavy-line": ORNAMENT_WARNING,
  tremolo: "Tremolo marks are practiced as single held notes.",
  fermata:
    "Fermatas are not held longer in the practice timeline; pause as long as you like.",
  arpeggiate: "Rolled chords are practiced with all notes together.",
  glissando:
    "Glissandos and slides are practiced as their written start and end notes.",
  slide:
    "Glissandos and slides are practiced as their written start and end notes.",
};
const NAVIGATION_WORDS =
  /\bD\.\s?[CS]\.|\bda\s+capo\b|\bdal\s+segno\b|\bto\s+coda\b|\bfine\b/i;
// Keep one note per key and onset: unison notes shared by two voices would otherwise sound twice.
function dedupe(notes) {
  notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const out = [];
  for (const n of notes) {
    let prev = null;
    for (let i = out.length - 1; i >= 0 && n.beat - out[i].beat < 0.001; i--)
      if (out[i].midi === n.midi) {
        prev = out[i];
        break;
      }
    if (prev) {
      prev.duration = Math.max(prev.duration, n.duration);
      prev.velocity = Math.max(prev.velocity, n.velocity);
    } else out.push(n);
  }
  out.forEach((n, i) => (n.id = `n${i}`));
  return out;
}
export function parseMusicXML(xml, filename = "Imported score") {
  if (typeof xml !== "string" || !xml.trim())
    throw Error("The MusicXML file is empty.");
  xml = xml.replace(/^﻿/, "");
  if (XMLValidator.validate(xml) !== true)
    throw Error("The MusicXML file is incomplete or invalid.");
  const doc = tree(
    new XMLParser({
      ignoreAttributes: false,
      preserveOrder: true,
      trimValues: true,
      processEntities: false,
    }).parse(xml),
  );
  const root = doc.find((n) => n.tag === "score-partwise");
  if (!root)
    throw Error(
      doc.some((n) => n.tag === "score-timewise")
        ? "This MusicXML uses the timewise layout. Please export as MusicXML score-partwise (.musicxml or .mxl)."
        : "Please export as MusicXML score-partwise (.musicxml or .mxl).",
    );
  const parts = kids(root, "part");
  if (!parts.length) throw Error("No musical parts found.");
  // Warnings about specific notes collect the bars they occur in, so the review can point to them.
  const warnings = [],
    warnBars = new Map(),
    warn = (w, bar) => {
      warnings.push(w);
      if (bar) {
        const l = warnBars.get(w) || [];
        if (!l.includes(bar)) l.push(bar);
        warnBars.set(w, l);
      }
    };
  const raw = [],
    bars = [],
    keys = [],
    tempos = [],
    dynamics = [],
    partBars = [];
  let usedRight = false,
    navigation = false;
  parts.forEach((part, pi) => {
    let divisions = null,
      quarters = 4,
      transpose = 0,
      keyAlters = {},
      barRepeat = false;
    const keyUse = { honored: false, suspect: [] };
    // Two-staff parts (piano) are split by staff; single-staff parts are assigned by clef and order.
    const multiStaff =
      descendants(part, "staves").some((s) => numberOf(txt(s)) > 1) ||
      descendants(part, "staff").some((s) => numberOf(txt(s)) > 1);
    let partHand = "right";
    if (!multiStaff) {
      const sign = value(
        descendants(part, "clef")[0] || { children: [] },
        "sign",
      )
        .trim()
        .toUpperCase();
      partHand = sign === "F" || usedRight ? "left" : "right";
    }
    if (multiStaff || partHand === "right") usedRight = true;
    const measures = kids(part, "measure");
    partBars.push(measures.length);
    measures.forEach((measure, mi) => {
      const bar = (bars[mi] ??= {
        nominal: 0,
        extent: 0,
        restExtent: 0,
        implicit: false,
        number: attr(measure, "number", String(mi + 1)),
      });
      if (attr(measure, "implicit") === "yes") bar.implicit = true;
      const label = attr(measure, "number") || String(mi + 1);
      // Whole-bar rests (<rest measure="yes"/>) are kept apart: exporters often give them a full bar even inside a pickup.
      let cursor = 0,
        lastOnset = 0,
        lastDuration = 0,
        extent = 0,
        restExtent = 0,
        pitched = 0;
      const rhythm = (n) => {
        if (divisions == null) {
          warn(
            "The score did not declare rhythmic divisions, so quarter notes were assumed.",
          );
          divisions = 1;
        }
        return numberOf(value(n, "duration")) / divisions;
      };
      for (const n of measure.children) {
        if (n.tag === "attributes") {
          // <transpose> follows <key> in the schema, so read it first or the key would be taken as concert pitch.
          const tr = one(n, "transpose");
          if (tr) {
            const c = numberOf(value(tr, "chromatic", "0")),
              o = numberOf(value(tr, "octave-change", "0"));
            transpose =
              (Number.isFinite(c) ? c : 0) + 12 * (Number.isFinite(o) ? o : 0);
            if (transpose)
              warn(
                "A transposing instrument part was converted to sounding (concert) pitch.",
              );
          }
          const d = one(n, "divisions");
          if (d) {
            divisions = numberOf(txt(d));
            if (!(divisions > 0) || !Number.isFinite(divisions))
              throw Error("Score has invalid rhythmic divisions.");
          }
          const time = one(n, "time");
          if (time) {
            const q = timeQuarters(time);
            if (q == null)
              warn("A complex or free time signature was simplified to 4/4.");
            quarters = q ?? 4;
          }
          const key = one(n, "key");
          if (key) {
            const fifths = numberOf(value(key, "fifths"));
            if (Number.isInteger(fifths)) {
              keys.push({
                pi,
                mi,
                pos: cursor,
                fifths,
                mode: value(key, "mode", "major").trim(),
                transpose,
              });
              keyAlters = keyStepAlters(fifths);
            } else {
              keyAlters = {};
              warn(
                "A non-standard key signature was found; number labels start from C.",
              );
            }
          }
          for (const r of descendants(n, "measure-repeat"))
            barRepeat = attr(r, "type") === "start";
        } else if (n.tag === "backup" || n.tag === "forward") {
          const d = rhythm(n);
          if (!(d >= 0) || !Number.isFinite(d)) {
            warn("A damaged rhythm instruction was ignored.", label);
            continue;
          }
          cursor += n.tag === "backup" ? -d : d;
          if (cursor < -1e-6) {
            warn(
              "A voice moved before the start of the bar and was realigned. Check the rhythm there.",
              label,
            );
            cursor = 0;
          }
          extent = Math.max(extent, cursor);
        } else if (n.tag === "direction" || n.tag === "sound") {
          const sounds = n.tag === "sound" ? [n] : descendants(n, "sound");
          let tempo = null;
          for (const s of sounds) {
            const t = numberOf(attr(s, "tempo"));
            if (t > 0) tempo = t;
            const dyn = numberOf(attr(s, "dynamics"));
            if (dyn >= 0) dynamics.push({ pi, mi, pos: cursor, value: dyn });
            if (
              ["dacapo", "dalsegno", "tocoda", "fine", "segno", "coda"].some(
                (a) => attr(s, a) !== "",
              )
            )
              navigation = true;
            if (one(s, "swing"))
              warn("Swing feel is played with straight rhythm.");
          }
          if (tempo == null)
            for (const metro of descendants(n, "metronome")) {
              const t = metronomeTempo(metro);
              if (t) {
                tempo = t;
                break;
              }
            }
          if (tempo >= 10 && tempo <= 500)
            tempos.push({ pi, mi, pos: cursor, bpm: tempo });
          if (
            descendants(n, "words").some((w) => NAVIGATION_WORDS.test(txt(w)))
          )
            navigation = true;
          if (descendants(n, "pedal").length)
            warn(
              "Pedal marks are not applied; notes keep their written lengths in practice.",
              label,
            );
        } else if (n.tag === "harmony")
          warn(
            "Chord symbols are shown on the sheet but are not added as notes.",
          );
        else if (n.tag === "note") {
          if (one(n, "grace")) {
            warn(
              "Grace notes are omitted from the beginner practice timeline.",
              label,
            );
            continue;
          }
          const chord = !!one(n, "chord"),
            rest = one(n, "rest"),
            measureRest = attr(rest, "measure") === "yes";
          let duration = one(n, "duration") ? rhythm(n) : NaN;
          const start = chord ? lastOnset : cursor;
          if (!chord) lastOnset = start;
          if (chord && !(duration > 0)) duration = lastDuration;
          if (!(duration > 0) || !Number.isFinite(duration)) {
            const written = writtenQuarters(n);
            if (written > 0) {
              duration = written;
              warn(
                "A note without a stored length was timed from its written note value.",
                label,
              );
            } else if (measureRest) duration = quarters;
          }
          if (!(duration > 0) || !Number.isFinite(duration)) {
            warn("A note with missing rhythm was omitted.", label);
            continue;
          }
          lastDuration = duration;
          if (!chord) cursor = start + duration;
          if (measureRest) restExtent = Math.max(restExtent, start + duration);
          else extent = Math.max(extent, cursor, start + duration);
          for (const tag of new Set(kids(n, "notations").flatMap(allTags)))
            if (NOTATION_WARNINGS[tag]) warn(NOTATION_WARNINGS[tag], label);
          if (rest) continue;
          if (one(n, "cue")) {
            warn("Small cue notes are not included in practice.", label);
            continue;
          }
          if (one(n, "unpitched")) {
            warn("Unpitched (percussion) notes were omitted.");
            continue;
          }
          const pitch = one(n, "pitch");
          if (!pitch) {
            warn("A note with an unreadable pitch was omitted.", label);
            continue;
          }
          const step = value(pitch, "step").trim().toUpperCase(),
            octave = numberOf(value(pitch, "octave")),
            alterTag = one(pitch, "alter");
          let alter = numberOf(value(pitch, "alter", "0"));
          if (!Number.isFinite(alter)) alter = 0;
          if (!(step in STEPS) || !Number.isInteger(octave)) {
            warn("A note with an unreadable pitch was omitted.", label);
            continue;
          }
          // <alter> decides the sound; the printed <accidental> is only used when <alter> is missing.
          const accidentalAlter =
            ACCIDENTAL_ALTER[value(n, "accidental").trim()];
          if (accidentalAlter != null) {
            if (!alterTag && accidentalAlter) {
              alter = accidentalAlter;
              warn(
                "A written sharp or flat had no pitch value in the file, so the written accidental was used.",
                label,
              );
            } else if (alterTag && accidentalAlter !== alter)
              warn(
                "A written accidental disagrees with the stored pitch. The stored pitch is played; please compare with the sheet.",
                label,
              );
          }
          if (step in keyAlters) {
            if (alter === keyAlters[step]) keyUse.honored = true;
            else if (!alterTag && !one(n, "accidental"))
              keyUse.suspect.push(label);
          }
          let midi = (octave + 1) * 12 + STEPS[step] + alter + transpose;
          if (!Number.isInteger(midi)) {
            warn(
              "Microtonal accidentals were rounded to the nearest piano key.",
              label,
            );
            midi = Math.round(midi);
          }
          if (midi < 21 || midi > 108) {
            warn("A pitch outside the 88-key piano range was omitted.", label);
            continue;
          }
          pitched++;
          const staff = numberOf(value(n, "staff", "1")) || 1,
            voice = value(n, "voice", "1").trim();
          // <tie> carries playback; fall back to the visual <tied> when an exporter only wrote that.
          let tieTypes = kids(n, "tie").map((t) => attr(t, "type"));
          if (!tieTypes.length)
            tieTypes = kids(n, "notations")
              .flatMap((x) => kids(x, "tied"))
              .map((t) => attr(t, "type"));
          const noteDynamics = numberOf(attr(n, "dynamics"));
          raw.push({
            pi,
            mi,
            offset: start,
            duration,
            midi,
            staff,
            voice,
            hand: multiStaff ? (staff > 1 ? "left" : "right") : partHand,
            tieStart:
              tieTypes.includes("start") || tieTypes.includes("continue"),
            tieStop: tieTypes.includes("stop") || tieTypes.includes("continue"),
            dynamics: noteDynamics >= 0 ? noteDynamics : null,
            order: raw.length,
          });
        }
      }
      if (barRepeat && !pitched)
        warn(
          "A repeat-the-bar sign has no written notes in the file, so that bar is silent in practice.",
          label,
        );
      bar.extent = Math.max(bar.extent, extent);
      bar.restExtent = Math.max(bar.restExtent, restExtent);
      bar.nominal = Math.max(bar.nominal, quarters);
    });
    // Only flag a key signature as ignored when no note in the part ever carries its sharps or flats.
    if (!keyUse.honored)
      for (const b of keyUse.suspect)
        warn(
          "Notes that the key signature makes sharp or flat were stored without the sharp or flat, so they play as naturals. Please compare them with the sheet.",
          b,
        );
  });
  if (!bars.length)
    throw Error(
      "No playable piano notes were recognized. Try a clearer scan or a MusicXML export.",
    );
  for (const b of bars) if (b.extent <= 1e-6) b.extent = b.restExtent;
  // A first bar shorter than its time signature is a pickup even when the exporter forgot implicit="yes".
  if (
    bars.length > 1 &&
    !bars[0].implicit &&
    bars[0].extent > 1e-6 &&
    bars[0].extent < bars[0].nominal - 1e-6
  ) {
    bars[0].implicit = true;
    warn(
      "The first bar is shorter than the time signature, so it was treated as a pickup. Check that no notes are missing there.",
    );
  }
  // Every part shares the same bar starts, so a miscounted bar in one part cannot shift the others.
  const measureStarts = [],
    measureLengths = [],
    overfull = [],
    underfull = [];
  let t = 0;
  // A short bar followed by an implicit bar that completes it is one bar split at a repeat or section line.
  bars.forEach((b, i) => {
    measureStarts.push(round(t));
    const short = !b.implicit && b.extent > 1e-6 && b.extent < b.nominal - 1e-6,
      split =
        short &&
        bars[i + 1]?.implicit &&
        Math.abs(b.extent + bars[i + 1].extent - b.nominal) < 1e-6;
    if (!b.implicit && b.extent > b.nominal + 1e-6) overfull.push(b.number);
    else if (short && !split && i < bars.length - 1) underfull.push(b.number);
    const length =
      b.implicit || split
        ? b.extent || b.nominal
        : Math.max(b.extent, b.nominal);
    measureLengths.push(round(length));
    t += length;
  });
  if (overfull.length)
    warn(
      `Bar ${listBars(overfull)} holds more beats than its time signature. The notes were kept in order; please check the rhythm.`,
    );
  if (underfull.length)
    warn(
      `Bar ${listBars(underfull)} holds fewer beats than its time signature. Silence was added so later bars stay aligned.`,
    );
  if (new Set(partBars).size > 1)
    warn(
      "The instrument parts have different numbers of bars. Later bars may not line up; please review.",
    );
  const at = (e) => round(measureStarts[e.mi] + e.pos);
  raw.forEach((r) => {
    r.beat = round(measureStarts[r.mi] + r.offset);
    r.duration = round(r.duration);
  });
  raw.sort((a, b) => a.pi - b.pi || a.beat - b.beat || a.order - b.order);
  dynamics.sort((a, b) => a.pi - b.pi || at(a) - at(b));
  // Ties join only notes of the same part and pitch that touch in time, preferring the same staff and voice.
  const open = new Map();
  let notes = [];
  for (const r of raw) {
    const k = `${r.pi}:${r.midi}`,
      list = open.get(k) || [];
    let target = null;
    if (r.tieStop) {
      const touching = list.filter(
        (o) => Math.abs(o.beat + o.duration - r.beat) < 0.001,
      );
      target =
        touching.find((o) => o.staff === r.staff && o.voice === r.voice) ||
        touching[0] ||
        null;
    }
    if (target) {
      target.duration = round(target.duration + r.duration);
      if (!r.tieStart) list.splice(list.indexOf(target), 1);
      continue;
    }
    const dyn =
      r.dynamics ??
      dynamics.findLast((d) => d.pi === r.pi && at(d) <= r.beat + 1e-6)?.value;
    const note = {
      id: "",
      midi: r.midi,
      beat: Math.max(0, r.beat),
      duration: r.duration,
      hand: r.hand,
      measure: r.mi + 1,
      velocity:
        dyn == null
          ? 0.72
          : Math.round(Math.min(1, Math.max(0.1, (dyn * 0.9) / 127)) * 100) /
            100,
      staff: r.staff,
      voice: r.voice,
    };
    notes.push(note);
    if (r.tieStart) {
      list.push(note);
      open.set(k, list);
    }
  }
  notes = dedupe(notes).map(({ staff, voice, ...n }) => n);
  if (!notes.length)
    throw Error(
      "No playable piano notes were recognized. Try a clearer scan or a MusicXML export.",
    );
  if (
    parts.length > 2 ||
    (parts.length === 2 &&
      parts.some((p) =>
        descendants(p, "staff").some((s) => numberOf(txt(s)) > 1),
      ))
  )
    warn(
      `This score has ${parts.length} instrument parts. They were combined into one piano timeline; review the hand for each part.`,
    );
  if (
    navigation ||
    descendants(root, "repeat").length ||
    descendants(root, "ending").length ||
    descendants(root, "segno").length ||
    descendants(root, "coda").length
  )
    warn(
      "Repeats and navigation marks play once in written order. Use the phrase loop to repeat a passage.",
    );
  // Opening key: from the earliest bar, preferring the first part; transposed parts are converted to concert pitch.
  keys.sort((a, b) => a.mi - b.mi || a.pi - b.pi || a.pos - b.pos);
  const firstKey = keys[0];
  const tonic = firstKey
    ? (((firstKey.fifths * 7 + firstKey.transpose) % 12) + 12) % 12
    : 0;
  if (
    parts.some((_, pi) => {
      const f = keys.filter((k) => k.pi === pi).map((k) => k.fifths);
      return f.some((x) => x !== f[0]);
    })
  )
    warn(
      "The key signature changes during the piece. Number labels follow the opening key; you can change “Number 1 is” when the key changes.",
    );
  if (new Set(bars.map((b) => b.nominal)).size > 1)
    warn(
      "The time signature changes during the piece. Phrase loops follow the written bar lengths.",
    );
  tempos.sort((a, b) => at(a) - at(b) || a.pi - b.pi);
  const bpm = tempos[0]?.bpm ?? 80;
  if (new Set(tempos.map((x) => Math.round(x.bpm))).size > 1)
    warn(
      "Tempo changes are simplified to the first tempo; adjust practice speed as needed.",
    );
  const creators = descendants(root, "creator");
  const composer =
    creators.find((c) => attr(c, "type") === "composer") || creators[0];
  const title =
    value(one(root, "work") || root, "work-title") ||
    value(root, "movement-title");
  return {
    id: crypto.randomUUID(),
    title: title
      ? decodeEntities(title.trim())
      : filename.replace(/\.[^.]+$/, ""),
    composer:
      composer && txt(composer).trim()
        ? decodeEntities(txt(composer).trim())
        : "Your music",
    bpm: Math.round(bpm),
    tonic,
    meter: bars[0].nominal,
    notes,
    measures: bars.length,
    measureStarts,
    measureLengths,
    pickup: bars[0].implicit ? (measureStarts[1] ?? round(bars[0].extent)) : 0,
    keySignature: firstKey
      ? { fifths: concertFifths(firstKey), mode: firstKey.mode }
      : null,
    duration: Math.max(...notes.map((n) => n.beat + n.duration)),
    warnings: [...new Set(warnings)].map((w) =>
      warnBars.has(w) ? `${w} See bar ${listBars(warnBars.get(w))}.` : w,
    ),
    source: "MusicXML",
    reviewed: false,
    xml,
    createdAt: new Date().toISOString(),
  };
}
// 0.04 beats is about 20 ms at 120 BPM: wider than a human chord roll's usual spread, narrower than a 64th note.
const CHORD_WINDOW = 0.04;
const KEY_NAMES = {
  Cb: 11,
  Gb: 6,
  Db: 1,
  Ab: 8,
  Eb: 3,
  Bb: 10,
  F: 5,
  C: 0,
  G: 7,
  D: 2,
  A: 9,
  E: 4,
  B: 11,
  "F#": 6,
  "C#": 1,
};
export function parseMIDI(data, filename = "MIDI score") {
  let midi;
  try {
    midi = new Midi(data);
  } catch {
    throw Error(
      "This MIDI file could not be read. It may be damaged or not a standard MIDI file.",
    );
  }
  const ppq = midi.header.ppq;
  if (!(ppq > 0))
    throw Error("This MIDI file has no valid timing information.");
  const warnings = [
    "Hand assignments are estimated from MIDI tracks or pitch. Review them before practicing.",
  ];
  let tracks = midi.tracks.filter((t) => t.notes.length);
  const drums = tracks.filter(
    (t) => t.instrument?.percussion || t.channel === 9,
  );
  if (drums.length) {
    warnings.push("Drum tracks were left out of the piano practice.");
    tracks = tracks.filter((t) => !drums.includes(t));
  }
  // Two tracks: the higher-sounding one is the right hand. One or many tracks: split around middle C.
  const average = (t) =>
    t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;
  const rightTrack =
    tracks.length === 2
      ? average(tracks[0]) >= average(tracks[1])
        ? tracks[0]
        : tracks[1]
      : null;
  if (tracks.length > 2)
    warnings.push(
      `This MIDI file has ${tracks.length} instrument tracks. They were combined, and hands were split around middle C.`,
    );
  // A signature event begins a new bar. Explicit boundaries also preserve silent
  // bars, held notes spanning bars, and changes partway through a MIDI bar.
  const signatures = (midi.header.timeSignatures || [])
    .filter(
      (s) =>
        Number.isFinite(s.ticks) &&
        s.ticks >= 0 &&
        s.timeSignature?.[0] > 0 &&
        s.timeSignature?.[1] > 0,
    )
    .map((s) => ({
      beat: s.ticks / ppq,
      quarters: (s.timeSignature[0] * 4) / s.timeSignature[1],
    }))
    .filter(
      (s) => Number.isFinite(s.quarters) && s.quarters > 0 && s.quarters <= 32,
    )
    .sort((a, b) => a.beat - b.beat);
  if (!signatures.length || signatures[0].beat > 0)
    signatures.unshift({ beat: 0, quarters: 4 });
  let notes = [],
    shortened = false,
    outside = 0;
  tracks.forEach((track) =>
    track.notes.forEach((n) => {
      if (n.midi < 21 || n.midi > 108) {
        outside++;
        return;
      }
      let duration = n.durationTicks / ppq;
      if (!(duration > 0)) {
        duration = 0.125;
        shortened = true;
      }
      notes.push({
        id: "",
        midi: n.midi,
        beat: round(n.ticks / ppq),
        duration: round(duration),
        velocity: n.velocity,
        hand: rightTrack
          ? track === rightTrack
            ? "right"
            : "left"
          : n.midi < 60
            ? "left"
            : "right",
        measure: 1,
      });
    }),
  );
  if (!notes.length) throw Error("No piano notes found in this MIDI file.");
  if (shortened)
    warnings.push(
      "Some MIDI notes had no length and were given a very short one.",
    );
  if (outside)
    warnings.push(
      `${outside} note${outside > 1 ? "s" : ""} outside the 88-key piano range ${outside > 1 ? "were" : "was"} left out.`,
    );
  const duration = Math.max(...notes.map((n) => n.beat + n.duration));
  const measureStarts = [],
    measureLengths = [];
  let beat = 0,
    signature = 0,
    shortenedBar = false;
  while (beat < duration - 1e-6) {
    if (measureStarts.length >= 100000)
      throw Error(
        "This MIDI file spans too many bars. Export a shorter passage to practice.",
      );
    while (signatures[signature + 1]?.beat <= beat + 1e-6) signature++;
    let end = beat + signatures[signature].quarters;
    const next = signatures[signature + 1]?.beat;
    if (next != null && next < end - 1e-6) {
      end = next;
      shortenedBar = true;
    }
    measureStarts.push(round(beat));
    measureLengths.push(round(end - beat));
    beat = end;
  }
  const barMap = {
    meter: signatures[0].quarters,
    measureStarts,
    measureLengths,
  };
  for (const n of notes) n.measure = measureAt(barMap, n.beat);
  if (shortenedBar)
    warnings.push(
      "A time signature changes partway through a MIDI bar. That bar was shortened so the new signature starts a new bar.",
    );
  // Performed MIDI rolls chords over a few milliseconds; onsets within CHORD_WINDOW of a chord's first note join it (ends stay put).
  notes.sort((a, b) => a.beat - b.beat);
  let onset = -Infinity,
    onsetBar = 1,
    snapped = false;
  for (const n of notes) {
    if (n.measure === onsetBar && n.beat - onset < CHORD_WINDOW) {
      if (n.beat !== onset) {
        n.duration = round(n.beat + n.duration - onset);
        n.beat = onset;
        n.measure = onsetBar;
        snapped = true;
      }
    } else {
      onset = n.beat;
      onsetBar = n.measure;
    }
  }
  if (snapped)
    warnings.push(
      "Notes played a split second apart were lined up as one chord.",
    );
  notes = dedupe(notes);
  // MIDI plays at 120 BPM until a tempo event says otherwise.
  const tempos = midi.header.tempos || [];
  const opening =
    tempos.filter((x) => x.ticks <= 0).at(-1) ||
    (tempos[0]?.ticks < ppq ? tempos[0] : null);
  if (
    new Set(tempos.map((x) => Math.round(x.bpm))).size > 1 ||
    (tempos.length && !opening)
  )
    warnings.push("Tempo changes are simplified to the first tempo.");
  const keySig = (midi.header.keySignatures || [])
    .slice()
    .sort((a, b) => a.ticks - b.ticks)[0];
  return {
    id: crypto.randomUUID(),
    title: midi.name || filename.replace(/\.[^.]+$/, ""),
    composer: "Your music",
    bpm: Math.round(opening?.bpm || 120),
    tonic: KEY_NAMES[keySig?.key] ?? 0,
    ...barMap,
    notes,
    duration,
    measures: measureStarts.length,
    source: "MIDI",
    reviewed: false,
    warnings,
    createdAt: new Date().toISOString(),
  };
}
export function groups(notes) {
  const result = [];
  for (const note of notes) {
    let g = result.at(-1);
    if (!g || Math.abs(g.beat - note.beat) > 0.001) {
      g = { beat: note.beat, notes: [] };
      result.push(g);
    }
    g.notes.push(note);
  }
  return result;
}
export function demos() {
  const melody = (
    id,
    title,
    composer,
    pitches,
    durations,
    bpm,
    description,
  ) => {
    let beat = 0;
    const notes = pitches.map((m, i) => {
      const n = {
        id: `${id}-${i}`,
        midi: m,
        beat,
        duration: durations?.[i] || 1,
        hand: "right",
        measure: Math.floor(beat / 4) + 1,
        velocity: 0.7,
      };
      beat += n.duration;
      return n;
    });
    return {
      id,
      title,
      composer,
      bpm,
      tonic: 0,
      meter: 4,
      notes,
      duration: beat,
      measures: Math.ceil(beat / 4),
      description,
      source: "Lesson",
      reviewed: true,
      warnings: [],
    };
  };
  return [
    melody(
      "moon",
      "Twinkle, Little Star",
      "Traditional · first steps",
      [
        60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60, 67, 67, 65, 65,
        64, 64, 62, 67, 67, 65, 65, 64, 64, 62, 60, 60, 67, 67, 69, 69, 67, 65,
        65, 64, 64, 62, 62, 60,
      ],
      [
        1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1,
        1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2,
      ],
      80,
      "A familiar melody. A lovely place to begin.",
    ),
    melody(
      "joy",
      "Ode to Joy",
      "Beethoven · beginner arrangement",
      [
        64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 64, 64, 65,
        67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
      ],
      [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 0.5, 2, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1.5, 0.5, 2,
      ],
      88,
      "Five notes. One very joyful little achievement.",
    ),
    melody(
      "scale",
      "Your first C major scale",
      "Luma lessons · learn the numbers",
      [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60],
      null,
      65,
      "Meet Do, Re, Mi — one glowing key at a time.",
    ),
    melody(
      "elise",
      "Für Elise · opening",
      "Beethoven · a little challenge",
      [
        76, 75, 76, 75, 76, 71, 74, 72, 69, 48, 52, 57, 60, 64, 69, 71, 52, 56,
        59, 64, 68, 71, 72,
      ],
      Array(24).fill(0.5),
      66,
      "Explore sharps and a wider range, at your own pace.",
    ),
  ];
}
