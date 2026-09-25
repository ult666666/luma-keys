import {
  degree,
  solfege,
  noteName,
  groups,
  barStart,
  measureAt,
  usesFlats,
} from "./music.mjs";
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function numberedSheet(score, tonic = 0, flats = usesFlats(score)) {
  const byBar = new Map();
  for (const g of groups(score.notes)) {
    const bar = measureAt(score, g.beat);
    if (!byBar.has(bar)) byBar.set(bar, []);
    byBar.get(bar).push(g);
  }
  return `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(score.title)} · Luma Keys</title><style>body{font:14px -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#23392d;background:#f6f8f2;margin:0;padding:48px;line-height:1.6}main{max-width:950px;margin:auto}.brand{letter-spacing:4px;text-transform:uppercase;font-size:11px;color:#567460}h1{font-size:36px;letter-spacing:-1px;line-height:1.2;margin:16px 0}.subtitle{color:#667c6c;margin-bottom:30px}.legend{border:1px solid #c9d8c9;padding:20px;border-radius:12px;margin:25px 0;display:flex;justify-content:space-between;gap:8px}.legend div{text-align:center}.legend b{display:block;font-size:24px}.legend small{font-size:11px}.bar{break-inside:avoid;background:#fff;border:1px solid #dce4db;border-radius:12px;margin:16px 0;padding:18px}.bar>header{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6e8b75;margin-bottom:12px}.notes{display:flex;flex-wrap:wrap;gap:12px}.chord{display:flex;gap:6px;position:relative;padding-bottom:22px}.note{min-width:70px;text-align:center;padding:10px;background:#eff4ec;border-radius:7px}.note.left{background:#f0ebf8}.note b{font-size:28px;display:block;font-weight:500;line-height:1.3}.note span{font-size:11px;display:block}.note small{font-size:9px;color:#728775}.onset{position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:9px;color:#7c9080}.help{font-size:12px;color:#637c6b}.print{background:#264b37;color:white;border:0;border-radius:6px;padding:10px 18px;font:inherit;cursor:pointer;float:right}.warning{border-left:3px solid #b4a975;padding:10px 16px;background:#f0eddf;font-size:12px}@media print{body{background:white;padding:0;font-size:12px}.print{display:none}h1{font-size:28px}.bar{box-shadow:none}.note{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media(max-width:600px){body{padding:20px}.legend{gap:3px;padding:12px}.legend small{font-size:9px}.note{min-width:55px}}</style><main><button class="print" onclick="window.print()">Print / Save PDF</button><div class="brand">luma keys · your piano practice companion</div><h1>${escape(score.title)}</h1><div class="subtitle">${escape(score.composer)} · ♩ = ${score.bpm} · ${score.measures} bars</div><p class="help">Numbers name notes, not fingers. The pitch label tells you the exact key: C4 is middle C; C5 is one octave higher. Notes grouped side by side at the same beat form a chord. Mint = right hand; lavender = left hand. Durations use quarter-note beats. ♩ = gives the quarter-note tempo per minute.</p><div class="legend">${[60, 62, 64, 65, 67, 69, 71].map((m) => `<div><b>${degree(m, tonic, flats)}</b><small>${solfege(m, tonic, flats)} · ${noteName(m, flats)}</small></div>`).join("")}</div>${!score.reviewed ? '<p class="warning">This imported score has not been marked reviewed. Check it against the original sheet before practicing.</p>' : ""}${score.warnings?.length ? '<p class="help">' + score.warnings.map(escape).join("<br>") + "</p>" : ""}${score.practiceTips?.length ? '<section class="bar"><header>Your practice path</header><ol>' + score.practiceTips.map((tip) => `<li>${escape(tip)}</li>`).join("") + "</ol></section>" : ""}${[...byBar].map(([bar, gs]) => `<section class="bar"><header>Bar ${bar}</header><div class="notes">${gs.map((g) => `<div class="chord">${g.notes.map((n) => `<div class="note ${n.hand === "left" ? "left" : ""}"><b>${degree(n.midi, tonic, flats)}</b><span>${noteName(n.midi, flats)} · ${solfege(n.midi, tonic, flats)}</span><small>${n.duration} beat${n.duration === 1 ? "" : "s"}</small></div>`).join("")}<span class="onset">Beat ${Number((g.beat - barStart(score, bar) + 1).toFixed(3))}</span></div>`).join("")}</div></section>`).join("")}<p class="help">A little practice. A little magic. · Saved from Luma Keys · Number 1 = ${noteName(60 + tonic, flats)} · ${new Date().toLocaleDateString()}</p></main></html>`;
}
// Validate both incoming backups and saved library entries. Return a fresh,
// playable score; reading the library never rewrites a user's source file.
export function validatePractice(s) {
  const object = (v) => v && typeof v === "object" && !Array.isArray(v);
  const text = (v, limit) => typeof v === "string" && v.length <= limit;
  const id = (v) => text(v, 80) && /^[a-zA-Z0-9-]+$/.test(v);
  const maxBeat = 3200000;
  if (
    !object(s) ||
    !text(s.title, 500) ||
    !s.title.trim() ||
    !text(s.composer, 1000) ||
    (s.id != null && !id(s.id)) ||
    (s.originalId != null && !id(s.originalId)) ||
    (s.source != null && !text(s.source, 200)) ||
    (s.description != null && !text(s.description, 5000)) ||
    (s.createdAt != null &&
      (!text(s.createdAt, 100) || !Number.isFinite(Date.parse(s.createdAt)))) ||
    (s.warnings != null &&
      (!Array.isArray(s.warnings) ||
        s.warnings.length > 500 ||
        s.warnings.some((w) => !text(w, 5000)))) ||
    (s.xml != null && !text(s.xml, 30 * 1024 * 1024)) ||
    (s.practiceTips != null &&
      (!Array.isArray(s.practiceTips) ||
        s.practiceTips.length > 10 ||
        s.practiceTips.some((tip) => !text(tip, 1000)))) ||
    ["reviewed", "notationEdited"].some(
      (k) => s[k] != null && typeof s[k] !== "boolean",
    ) ||
    (s.tonic != null &&
      (!Number.isInteger(s.tonic) || s.tonic < 0 || s.tonic > 11)) ||
    (s.pickup != null &&
      (!Number.isFinite(s.pickup) || s.pickup < 0 || s.pickup > 32)) ||
    (s.keySignature != null &&
      (!object(s.keySignature) ||
        !Number.isInteger(s.keySignature.fifths) ||
        Math.abs(s.keySignature.fifths) > 14 ||
        !text(s.keySignature.mode, 100)))
  )
    throw Error(
      "Invalid practice file metadata. Restore a complete Luma Keys backup or reimport the original score.",
    );
  if (!Array.isArray(s.notes) || !s.notes.length || s.notes.length > 100000)
    throw Error("Practice file needs between 1 and 100,000 notes.");
  if (!Number.isFinite(s.bpm) || s.bpm < 10 || s.bpm > 400)
    throw Error("Choose a tempo between 10 and 400 BPM.");
  if (!Number.isFinite(s.meter) || s.meter < 1 / 256 || s.meter > 32)
    throw Error("Invalid beats per measure.");
  const validPulses = (pattern) =>
    Array.isArray(pattern) &&
    pattern.length > 0 &&
    pattern.length <= 64 &&
    pattern.every((p) => Number.isFinite(p) && p >= 1 / 256 && p <= 32) &&
    pattern.reduce((a, b) => a + b, 0) <= 32;
  if (
    (s.meterPulses != null && !validPulses(s.meterPulses)) ||
    (s.measurePulses != null &&
      (!Array.isArray(s.measurePulses) ||
        s.measurePulses.length !== s.measureStarts?.length ||
        !s.measurePulses.every(validPulses))) ||
    (s.measureSignatures != null &&
      (!Array.isArray(s.measureSignatures) ||
        s.measureSignatures.length !== s.measureStarts?.length ||
        s.measureSignatures.some((x) => !text(x, 200))))
  )
    throw Error("Practice file contains an invalid metronome pattern.");
  if (
    s.measureStarts != null &&
    (!Array.isArray(s.measureStarts) ||
      !s.measureStarts.length ||
      s.measureStarts.length > 100000 ||
      s.measureStarts[0] !== 0 ||
      s.measureStarts.some(
        (b, i) =>
          !Number.isFinite(b) ||
          b < 0 ||
          b > maxBeat ||
          (i > 0 && b <= s.measureStarts[i - 1]),
      ))
  )
    throw Error("Practice file contains invalid bar positions.");
  if (
    s.measureLengths != null &&
    (!Array.isArray(s.measureLengths) ||
      !s.measureStarts ||
      s.measureLengths.length !== s.measureStarts.length ||
      s.measureLengths.some(
        (length, i) =>
          !Number.isFinite(length) ||
          length < 1 / 256 ||
          length > 10000 ||
          (i + 1 < s.measureStarts.length &&
            Math.abs(s.measureStarts[i] + length - s.measureStarts[i + 1]) >
              0.00001),
      ))
  )
    throw Error("Practice file contains invalid bar lengths.");
  if (
    (s.duration != null &&
      (!Number.isFinite(s.duration) ||
        s.duration <= 0 ||
        s.duration > maxBeat)) ||
    (s.measures != null &&
      (!Number.isInteger(s.measures) || s.measures < 1 || s.measures > 100000))
  )
    throw Error(
      "Practice file contains an invalid total duration or bar count.",
    );
  const usedIds = new Set();
  let noteEnd = 0;
  const notes = s.notes
    .map((n, i) => {
      if (
        !object(n) ||
        !Number.isInteger(n.midi) ||
        n.midi < 21 ||
        n.midi > 108 ||
        !Number.isFinite(n.beat) ||
        n.beat < 0 ||
        n.beat > maxBeat ||
        !Number.isFinite(n.duration) ||
        n.duration <= 0 ||
        n.duration > 10000 ||
        n.beat + n.duration > maxBeat ||
        !["left", "right"].includes(n.hand)
      )
        throw Error(
          `Note ${i + 1} has an invalid pitch, rhythm or hand. Check the original score before importing again.`,
        );
      if (
        n.velocity != null &&
        (!Number.isFinite(n.velocity) || n.velocity < 0 || n.velocity > 1)
      )
        throw Error(
          `Note ${i + 1} has an invalid volume. Note velocity must be between 0 and 1.`,
        );
      let noteId = n.id;
      if (!id(noteId) || usedIds.has(noteId)) {
        noteId = `restored-${i}`;
        while (usedIds.has(noteId)) noteId += "-r";
      }
      usedIds.add(noteId);
      noteEnd = Math.max(noteEnd, n.beat + n.duration);
      return {
        id: noteId,
        midi: n.midi,
        beat: n.beat,
        duration: n.duration,
        hand: n.hand,
        measure: measureAt(s, n.beat),
        velocity: n.velocity ?? 0.72,
      };
    })
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const duration = Math.max(s.duration ?? 0, noteEnd);
  const measures = Math.max(
    s.measures ?? 1,
    s.measureStarts?.length ?? 1,
    measureAt(s, Math.max(0, duration - 1e-4)),
  );
  if (measures > 100000)
    throw Error("Practice file spans too many bars. Import a shorter passage.");
  const inferred =
    s.duration == null ||
    s.measures == null ||
    (s.duration != null && s.duration < noteEnd - 1e-6);
  const warnings = [...(s.warnings ?? [])];
  const recovery =
    "Missing or shortened timing metadata was restored from the notes. Check the ending and any silent bars against the original sheet.";
  if (inferred && !warnings.includes(recovery)) warnings.push(recovery);
  return {
    ...s,
    title: s.title.trim(),
    warnings,
    notes,
    duration,
    measures,
    tonic: s.tonic ?? 0,
    pickup: s.pickup ?? 0,
    source: s.source ?? "Practice backup",
    reviewed: inferred ? false : (s.reviewed ?? false),
  };
}
