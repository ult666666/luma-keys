// Cut a hand-lab scenario out of a saved piece by bar range.
//   node scripts/hand-lab-passage.mjs <library.json> <firstBar> <lastBar> [out.json] [hands=left,right]
// or regenerate a whole shortlist of passages:
//   node scripts/hand-lab-passage.mjs --shortlist stress-shortlist.json --library <Library dir> --out-dir <dir> [--only S01,S04]
// Beats are re-based so the passage starts at 0; one bar of lead-in notes is
// kept (negative beats) so the hands arrive the way they do in the app.
// The piece's tempo map and pedal spans come along, re-based the same way:
// `bpm` is the tempo in force at the passage's first bar (it also holds for
// the lead-in, since a tempo map starts at beat 0) and `tempos` lists every
// change inside the passage; `pedals` are the pedal spans that touch it,
// clipped to it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { barStart, barEnd } from "../src/music.mjs";
import { bpmAt, tempoMap } from "../src/tempo.mjs";

const round = (v) => +v.toFixed(4);

export function cutPassage(score, first, last, hands = ["left", "right"]) {
  const from = barStart(score, first), to = barEnd(score, last);
  const lead = barStart(score, Math.max(1, first - 1));
  const notes = score.notes
    .filter((n) => hands.includes(n.hand) && n.beat >= lead - 1e-6 && n.beat < to - 1e-6)
    .map((n) => ({ id: n.id, midi: n.midi, beat: round(n.beat - from), duration: round(Math.min(n.duration, to - n.beat)), hand: n.hand }));
  const bpm = bpmAt(score, from);
  const tempos = [{ beat: 0, bpm }];
  for (const t of tempoMap(score)) if (t.beat > from + 1e-6 && t.beat < to - 1e-6) tempos.push({ beat: round(t.beat - from), bpm: t.bpm });
  const pedals = (Array.isArray(score.pedals) ? score.pedals : [])
    .filter((p) => Number.isFinite(p?.start) && Number.isFinite(p?.end) && p.end > lead + 1e-6 && p.start < to - 1e-6)
    .map((p) => ({ start: round(Math.max(p.start, lead) - from), end: round(Math.min(p.end, to) - from) }));
  return {
    title: `${score.title} · bars ${first}–${last}`,
    bpm,
    tempos,
    pedals,
    hands,
    notes,
    passage: {
      scoreId: score.id, firstBar: first, lastBar: last, startBeat: 0, endBeat: round(to - from), leadBeat: round(lead - from),
      sourceStartBeat: round(from), leadBpm: bpmAt(score, lead),
    },
  };
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (flag("shortlist")) {
    const list = JSON.parse(fs.readFileSync(flag("shortlist"), "utf8"));
    const library = flag("library") || list.library;
    const outDir = flag("out-dir") || ".";
    const only = flag("only") ? flag("only").split(",") : null;
    for (const p of list.passages) {
      if (only && !only.includes(p.id)) continue;
      const score = JSON.parse(fs.readFileSync(path.join(library, `${p.scoreId}.json`), "utf8"));
      const hands = (p.hands || ["L", "R"]).map((h) => (h === "L" || h === "left" ? "left" : "right"));
      const scenario = cutPassage(score, p.firstBar, p.lastBar, hands);
      const out = { title: scenario.title, bpm: scenario.bpm, tempos: scenario.tempos, pedals: scenario.pedals, hands: scenario.hands, notes: scenario.notes, passage: scenario.passage, id: p.id, why: p.why, category: p.category };
      fs.writeFileSync(path.join(outDir, `${p.id}.json`), JSON.stringify(out));
      const changes = scenario.tempos.length > 1 ? ` (${scenario.tempos.map((t) => t.bpm).join("→")})` : "";
      console.error(`${p.id}: ${scenario.notes.length} notes, beats ${scenario.passage.leadBeat}…${scenario.passage.endBeat}, ♩=${scenario.bpm}${changes}, ${scenario.pedals.length} pedal spans`);
    }
  } else {
    const [file, a, b, out, handList] = args;
    if (!file || !a || !b) { console.error("usage: <library.json> <firstBar> <lastBar> [out.json] [hands] | --shortlist f --library dir --out-dir dir"); process.exit(2); }
    const score = JSON.parse(fs.readFileSync(file, "utf8"));
    const scenario = cutPassage(score, +a, +b, (handList || "left,right").split(","));
    const json = JSON.stringify(scenario);
    if (out) fs.writeFileSync(out, json); else process.stdout.write(json + "\n");
    console.error(`${scenario.notes.length} notes, beats ${scenario.passage.leadBeat}…${scenario.passage.endBeat}, ♩=${scenario.bpm}, ${scenario.tempos.length - 1} tempo changes, ${scenario.pedals.length} pedal spans`);
  }
}
