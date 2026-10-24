import { XMLParser, XMLValidator } from "fast-xml-parser";
import { barStart } from "./music.mjs";

// These are deliberately modest performance choices, not extra note lengths
// in the score. The caller keeps the written timeline and applies the gate
// only to a scheduled key release (a written pedal can still sustain it).
const GATES = { staccato: 0.55, staccatissimo: 0.32, tenuto: 1 };
const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTALS = {
  sharp: 1, flat: -1, natural: 0, "double-sharp": 2,
  "sharp-sharp": 2, "flat-flat": -2, "natural-sharp": 1,
  "natural-flat": -1,
};
const LENGTHS = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1,
  eighth: 0.5, "16th": 0.25, "32nd": 0.125, "64th": 0.0625,
  "128th": 0.03125, "256th": 0.015625,
};
const children = (n, tag) => (n?.children || []).filter((c) => c.tag === tag);
const child = (n, tag) => children(n, tag)[0];
const text = (n) => n?.text || "";
const value = (n, tag, fallback = "") => text(child(n, tag)) || fallback;
const attribute = (n, key) => n?.attributes?.[`@_${key}`];
const descendants = (n, tag) => (n?.children || []).flatMap((c) => [
  ...(c.tag === tag ? [c] : []), ...descendants(c, tag),
]);
const round = (n) => Math.round(n * 1e6) / 1e6;
const keyFor = (beat, midi) => `${Math.round(beat * 10000)}:${midi}`;
const velocity = (n) => Number.isFinite(n.velocity) ? n.velocity : 0.72;
const dynamicVelocity = (n) => Number.isFinite(n) && n >= 0
  ? Math.round(Math.min(1, Math.max(0.1, n * 0.9 / 127)) * 100) / 100
  : null;
const lowerBound = (list, beat) => {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid].beat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

function tree(nodes) {
  return nodes.flatMap((n) => {
    const tag = Object.keys(n).find((k) => k !== ":@" && k !== "#text");
    if (!tag || !Array.isArray(n[tag])) return [];
    return [{
      tag, attributes: n[":@"] || {}, children: tree(n[tag]),
      text: n[tag].filter((v) => v["#text"] != null)
        .map((v) => String(v["#text"])).join(""),
    }];
  });
}

function writtenLength(note, divisions) {
  const stored = Number(value(note, "duration", "NaN")) / divisions;
  if (Number.isFinite(stored) && stored > 0) return stored;
  const base = LENGTHS[value(note, "type")];
  const tm = child(note, "time-modification");
  const ratio = tm
    ? Number(value(tm, "normal-notes")) / Number(value(tm, "actual-notes"))
    : 1;
  return base * (2 - 0.5 ** children(note, "dot").length) *
    (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
}

const sourceCache = new WeakMap();
function sourceExpression(score) {
  if (score && typeof score === "object" && sourceCache.has(score))
    return sourceCache.get(score);
  let parsed = null;
  try { parsed = parseSource(score); } catch { parsed = null; }
  if (score && typeof score === "object") sourceCache.set(score, parsed);
  return parsed;
}

function parseSource(score) {
  const xml = score?.xml;
  if (typeof xml !== "string" || xml.length > 32 * 1024 * 1024 ||
      !xml.includes("score-partwise") || XMLValidator.validate(xml) !== true)
    return null;
  const root = tree(new XMLParser({
    preserveOrder: true, ignoreAttributes: false, trimValues: true,
    processEntities: false,
  }).parse(xml)).find((n) => n.tag === "score-partwise");
  if (!root) return null;
  const notes = new Map(), marks = [], crescendos = [], fermatas = [],
    tempoWords = [];
  let count = 0;
  for (const [part, p] of children(root, "part").entries()) {
    let divisions = 1, transpose = 0;
    for (const [index, measure] of children(p, "measure").entries()) {
      let cursor = 0, lastOnset = 0, lastDuration = 0;
      const start = barStart(score, index + 1);
      for (const n of measure.children) {
        if (n.tag === "attributes") {
          const d = Number(value(n, "divisions", "NaN"));
          if (d > 0 && Number.isFinite(d)) divisions = d;
          const t = child(n, "transpose");
          if (t) transpose = Number(value(t, "chromatic", "0")) +
            12 * Number(value(t, "octave-change", "0"));
        } else if (n.tag === "backup" || n.tag === "forward") {
          const length = Number(value(n, "duration", "NaN")) / divisions;
          if (!(length >= 0) || !Number.isFinite(length)) return null;
          cursor = Math.max(0, cursor + length * (n.tag === "backup" ? -1 : 1));
        } else if (n.tag === "direction" || n.tag === "sound") {
          const offset = Number(value(n, "offset", "0")) / divisions;
          const beat = round(start + cursor + (Number.isFinite(offset) ? offset : 0));
          const staff = Number(value(n, "staff", "0")) || 0;
          for (const sound of n.tag === "sound" ? [n] : descendants(n, "sound")) {
            const raw = attribute(sound, "dynamics");
            const level = raw == null ? null : dynamicVelocity(Number(raw));
            if (level != null) marks.push({ part, staff, beat, level });
          }
          if (descendants(n, "words").some((w) => /^cresc(?:\.|endo)?$/i.test(text(w).trim())))
            crescendos.push({ part, staff, beat });
          for (const w of descendants(n, "words")) {
            const words = text(w).trim().toLowerCase();
            if (/\b(rit|ritard|ritardando|rall|rallentando|allarg|allargando|ritenuto|riten)\b\.?/.test(words))
              tempoWords.push({ beat, kind: "rit" });
            else if (/\ba tempo\b|\btempo i\b|\btempo primo\b/.test(words))
              tempoWords.push({ beat, kind: "a-tempo" });
          }
        } else if (n.tag === "note") {
          if (++count > 100000) return null;
          if (child(n, "grace")) continue;
          const chord = !!child(n, "chord");
          let duration = writtenLength(n, divisions);
          if (chord && !(duration > 0)) duration = lastDuration;
          // An untimed note makes later positions ambiguous. Leave this XML
          // untouched instead of transferring markings to a different note.
          if (!(duration > 0) || !Number.isFinite(duration)) return null;
          const onset = chord ? lastOnset : cursor;
          if (!chord) { lastOnset = onset; cursor = onset + duration; }
          lastDuration = duration;
          if (child(n, "rest") || child(n, "cue") || child(n, "unpitched")) continue;
          const pitch = child(n, "pitch"), step = value(pitch, "step").toUpperCase();
          const octave = Number(value(pitch, "octave", "NaN"));
          if (!(step in STEPS) || !Number.isInteger(octave)) continue;
          const alter = child(pitch, "alter")
            ? Number(value(pitch, "alter"))
            : (ACCIDENTALS[value(n, "accidental")] || 0);
          const midi = Math.round((octave + 1) * 12 + STEPS[step] + alter + transpose);
          const beat = round(start + onset), key = keyFor(beat, midi);
          if (descendants(n, "fermata").length && fermatas.length < 2000)
            fermatas.push({ beat, duration: round(duration) });
          const articulations = descendants(n, "articulations").flatMap((a) =>
            a.children.map((c) => c.tag));
          const gates = [...new Set(articulations.filter((a) => a in GATES))];
          const record = {
            part, staff: Number(value(n, "staff", "1")) || 1,
            beat, midi, duration: round(duration),
            tied: children(n, "tie").length > 0 || descendants(n, "tied").length > 0,
            gate: gates.length === 1 ? GATES[gates[0]] : null,
            accent: articulations.includes("accent") || articulations.includes("strong-accent"),
            explicitVelocity: attribute(n, "dynamics") == null ? null
              : dynamicVelocity(Number(attribute(n, "dynamics"))),
          };
          if (!notes.has(key)) notes.set(key, []);
          notes.get(key).push(record);
        }
      }
    }
  }
  marks.sort((a, b) => a.beat - b.beat);
  const partMarks = new Map();
  for (const mark of marks) {
    if (!partMarks.has(mark.part)) partMarks.set(mark.part, []);
    partMarks.get(mark.part).push(mark);
  }
  // Exporters often encode sf only as note-level dynamics, including every
  // member of a chord. Comparing just with the other chord members would
  // miss those accents because all members have the same stronger velocity.
  for (const records of notes.values()) for (const record of records) {
    const list = partMarks.get(record.part) || [];
    const level = list[lowerBound(list, record.beat + 1e-6) - 1]?.level;
    if (level != null && record.explicitVelocity > level + 0.04)
      record.accent = true;
  }
  fermatas.sort((a, b) => a.beat - b.beat);
  tempoWords.sort((a, b) => a.beat - b.beat);
  return { notes, marks, crescendos, fermatas, tempoWords };
}

/** Written holds and tempo words (rit./a tempo) from the score's MusicXML.
 * Returns empty lists when there is no readable source. */
export function sourceMarkings(score) {
  const source = sourceExpression(score);
  return {
    fermatas: source?.fermatas || [],
    tempoWords: source?.tempoWords || [],
  };
}

function matchedSource(note, source) {
  const records = source?.notes.get(keyFor(note.beat, note.midi));
  if (!records?.length || records.some((r) =>
    Math.abs(r.beat - note.beat) > 0.0001 ||
    Math.abs(r.duration - note.duration) > 0.0001)) return null;
  // Conflicting unisons cannot be assigned to one original voice safely.
  if (records.some((r) => r.part !== records[0].part ||
      r.staff !== records[0].staff || r.gate !== records[0].gate)) return null;
  return {
    ...records[0], tied: records.some((r) => r.tied),
    accent: records.some((r) => r.accent),
  };
}

/** Playback-only interpretation. Build once per score/style; never per frame.
 * Map entries may contain gate (fraction of the written key hold), velocity,
 * or both. Missing fields retain ordinary playback behavior. "written" and
 * "literal" keep all authored velocities; no style edits timing or pitches.
 */
export function buildExpression(score, { style = "concert" } = {}) {
  const result = new Map();
  if (!Array.isArray(score?.notes) || score.notes.length > 50000) return result;
  const source = sourceExpression(score); // Damaged XML is optional.
  const matches = new Map(), groups = new Map();
  const put = (id, field) => result.set(id, { ...result.get(id), ...field });
  for (const n of score.notes) {
    if (typeof n.id !== "string" || !Number.isFinite(n.beat) ||
        !Number.isFinite(n.duration) || n.duration <= 0 ||
        !Number.isInteger(n.midi)) continue;
    const match = matchedSource(n, source);
    if (match) {
      matches.set(n.id, match);
      // Do not detach the first segment of a tied chain or guess which tied
      // release an articulation describes.
      if (!match.tied && match.gate != null) put(n.id, { gate: match.gate });
    }
    const key = `${Math.round(n.beat * 10000)}:${n.hand}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  if (style !== "concert") return result;

  // This is voicing, not a replacement dynamic map. Keep the melody on top
  // of the right hand and bass at the bottom of the left; keep octaves and
  // explicitly louder/marked accents at their authored strength.
  for (const chord of groups.values()) {
    if (chord.length < 2) continue;
    const high = Math.max(...chord.map((n) => n.midi));
    const low = Math.min(...chord.map((n) => n.midi));
    const levels = chord.map(velocity).sort((a, b) => a - b);
    const median = levels[Math.floor((levels.length - 1) / 2)];
    for (const n of chord) {
      const outside = n.hand === "left" ? low : high;
      const octaveDoubling = Math.abs(n.midi - outside) % 12 === 0;
      if (n.midi === outside || octaveDoubling || velocity(n) >= 0.93 ||
          velocity(n) > median + 0.04 ||
          matches.get(n.id)?.accent) continue;
      put(n.id, { velocity: round(velocity(n) * 0.92) });
    }
  }

  // A textual crescendo is sometimes exported with a flat numeric map,
  // even when the next printed dynamic is the same ff. Concert mode gives
  // only that explicitly bounded span a small approach to its written level.
  // This 14% dip-to-target is an interpretation, not recovered performance
  // data. Existing shaped ramps and authored accents are left intact.
  const scopes = new Map(), spans = new Map(), approaches = new Map();
  if (source) for (const mark of source.crescendos) {
    const scopeKey = `${mark.part}:${mark.staff}`;
    if (!scopes.has(scopeKey)) scopes.set(scopeKey, {
      marks: source.marks.filter((m) => m.part === mark.part &&
        (!mark.staff || !m.staff || m.staff === mark.staff)),
      notes: score.notes.filter((n) => {
        const match = matches.get(n.id);
        return match && match.part === mark.part && !match.tied &&
          (!mark.staff || match.staff === mark.staff);
      }).sort((a, b) => a.beat - b.beat),
    });
    const scope = scopes.get(scopeKey);
    const i = lowerBound(scope.marks, mark.beat + 1e-6);
    const previous = scope.marks[i - 1], next = scope.marks[i];
    if (!previous || !next || next.beat - mark.beat > 32 ||
        Math.abs(previous.level - next.level) > 0.015) continue;
    // Repeated text before one destination does not stack or multiply the
    // effect. The most recent instruction determines the approach.
    const spanKey = `${scopeKey}:${next.beat}`;
    const old = spans.get(spanKey);
    if (!old || mark.beat > old.mark.beat)
      spans.set(spanKey, { mark, previous, next, scope });
  }
  for (const { mark, previous, next, scope } of spans.values()) {
    const selected = scope.notes.slice(lowerBound(scope.notes, mark.beat - 1e-6),
      lowerBound(scope.notes, next.beat - 1e-6));
    if (!selected.length || selected.some((n) =>
      velocity(n) < previous.level - 0.015)) continue;
    for (const n of selected) {
      if (matches.get(n.id).accent || velocity(n) > previous.level + 0.04) continue;
      const progress = Math.min(1, Math.max(0, (n.beat - mark.beat) / (next.beat - mark.beat)));
      const old = approaches.get(n.id);
      if (!old || mark.beat > old.beat)
        approaches.set(n.id, { note: n, beat: mark.beat, factor: 0.86 + 0.14 * progress });
    }
  }
  for (const [id, { note, factor }] of approaches) {
    const base = result.get(id)?.velocity ?? velocity(note);
    put(id, { velocity: round(base * factor) });
  }
  return result;
}
