// Trouble spots: the bars of a piece that keep tripping you up. Wait for me
// and Play in time already judge every bar; this keeps a short memory of
// those judgements per bar, so the piece map can show where the trouble is
// and a drill can be set up there. It lives in the practice journal
// (journal.pieces[id].spots), so it is validated like the rest: a damaged
// bar is dropped, never repaired, and a piece keeps a bounded number of bars.
//
// A bar's memory: `p` passes judged, `s` of them slipped (lifetime), `r` the
// last few outcomes as a string ("x" slipped, "." clean, latest last) and
// `last`, the day it was last judged. A pass is clean when every note of the
// bar was played and nothing wrong was pressed; timing is judged elsewhere.

export const SPOT_RECENT = 8; // passes remembered per bar
export const JOURNAL_SPOTS = 240; // bars remembered per piece
export const SPOT_CLEAR = 3; // clean passes in a row that clear a bar
export const SPOT_MIN_SLIPS = 2; // recent slips before a bar is a spot
export const SPOT_THRESHOLD = 0.4; // recency-weighted slip rate for a spot

const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const barOk = (v) => Number.isInteger(v) && v >= 1 && v <= 100000;
function dayOk(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(key + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === key;
}
const dayOf = (value) => new Date(value).toLocaleDateString("en-CA");
const countSlips = (r) => (r.match(/x/g) || []).length;

function readSpot(value) {
  if (!object(value)) return null;
  const { p, s, r, last } = value;
  if (!Number.isInteger(p) || p < 0 || p > 1e9) return null;
  if (!Number.isInteger(s) || s < 0 || s > p) return null;
  if (typeof r !== "string" || r.length > SPOT_RECENT || !/^[.x]*$/.test(r))
    return null;
  if (r.length > p || countSlips(r) > s) return null;
  if (!dayOk(last)) return null;
  return { p, s, r, last };
}

// Recover what can be read; `invalid` says whether anything was dropped.
export function readSpots(value) {
  if (!object(value)) return { spots: {}, invalid: true };
  const spots = {};
  let invalid = false;
  for (const [key, entry] of Object.entries(value)) {
    const bar = /^\d{1,6}$/.test(key) ? Number(key) : NaN;
    const read = barOk(bar) ? readSpot(entry) : null;
    if (read) spots[bar] = read;
    else invalid = true;
  }
  return { spots: prune(spots), invalid };
}

// Judged passes of bars, in the order they happened: [{ bar, clean }].
// Returns a new memory, or the same one when nothing could be recorded.
export function recordPasses(spots, passes, { at = Date.now() } = {}) {
  const day = dayOf(at);
  if (!dayOk(day) || !Array.isArray(passes)) return spots;
  let next = null;
  for (const pass of passes) {
    if (!object(pass) || !barOk(pass.bar) || typeof pass.clean !== "boolean")
      continue;
    if (!next) next = { ...(spots || {}) };
    const prev = next[pass.bar] || { p: 0, s: 0, r: "", last: day };
    next[pass.bar] = {
      p: Math.min(1e9, prev.p + 1),
      s: Math.min(1e9, prev.s + (pass.clean ? 0 : 1)),
      r: (prev.r + (pass.clean ? "." : "x")).slice(-SPOT_RECENT),
      last: day,
    };
  }
  return next ? prune(next) : spots;
}

// Forget bars first..last of a piece (a spot the reader has learned, or
// does not want shown). The same memory comes back when nothing changes.
export function forgetSpots(spots, first, last) {
  if (!spots) return spots;
  const a = Math.min(first, last),
    b = Math.max(first, last);
  let next = null;
  for (const key of Object.keys(spots)) {
    const bar = Number(key);
    if (bar < a || bar > b) continue;
    if (!next) next = { ...spots };
    delete next[key];
  }
  return next || spots;
}

// Three clean passes in a row and the bar is learned (for now).
export const barCleared = (spot) =>
  !!spot &&
  spot.r.length >= SPOT_CLEAR &&
  spot.r.endsWith(".".repeat(SPOT_CLEAR));
export const recentSlips = (spot) => (spot ? countSlips(spot.r) : 0);
// How much a bar trips you lately: a recency-weighted share of slipped
// passes (the latest pass weighs most), 0 once the bar is cleared.
export function barTrouble(spot) {
  if (!spot || barCleared(spot) || !spot.r.length) return 0;
  let slipped = 0,
    total = 0;
  for (let i = 0; i < spot.r.length; i++) {
    const weight = i + 1;
    total += weight;
    if (spot.r[i] === "x") slipped += weight;
  }
  return slipped / total;
}
export const barTroubled = (spot) =>
  !!spot &&
  !barCleared(spot) &&
  recentSlips(spot) >= SPOT_MIN_SLIPS &&
  barTrouble(spot) >= SPOT_THRESHOLD - 1e-9;

// Bars that were spots and have since been cleared.
export const clearedBars = (spots) =>
  Object.values(spots || {}).filter(
    (spot) => spot.s >= SPOT_MIN_SLIPS && barCleared(spot),
  ).length;

// The troubled bars within a piece: Map of bar → { trouble, slips, passes }
// (slips and passes over the remembered recent window). For the piece map.
export function spotBars(spots, measures = Infinity) {
  const bars = new Map();
  for (const [key, spot] of Object.entries(spots || {})) {
    const bar = Number(key);
    if (bar > measures || !barTroubled(spot)) continue;
    bars.set(bar, {
      trouble: barTrouble(spot),
      slips: recentSlips(spot),
      passes: spot.r.length,
    });
  }
  return bars;
}

// The spots worth drilling, strongest first: runs of troubled bars (a lone
// clean bar between two troubled ones joins them), each at most `maxBars`
// wide. Each is { first, last, bars, trouble, worst, slips, passes, last }:
// `bars` are its troubled bars, `trouble` their summed trouble, and
// slips/passes describe its worst bar's recent window.
export function troubleSpots(
  spots,
  { measures = Infinity, limit = 3, maxBars = 4 } = {},
) {
  const troubled = Object.entries(spots || {})
    .map(([key, spot]) => [Number(key), spot])
    .filter(([bar, spot]) => bar <= measures && barTroubled(spot))
    .sort((a, b) => a[0] - b[0]);
  const groups = [];
  for (const [bar, spot] of troubled) {
    const group = groups.at(-1);
    if (group && bar - group.last <= 2) {
      group.last = bar;
      group.bars.push([bar, spot]);
    } else groups.push({ first: bar, last: bar, bars: [[bar, spot]] });
  }
  const out = [];
  for (const group of groups) {
    const span = group.last - group.first + 1;
    const chunks = Math.ceil(span / maxBars);
    const size = Math.ceil(span / chunks);
    for (let start = group.first; start <= group.last; start += size) {
      const end = Math.min(group.last, start + size - 1);
      const bars = group.bars.filter(([bar]) => bar >= start && bar <= end);
      if (!bars.length) continue;
      let worst = bars[0];
      let trouble = 0,
        day = "";
      for (const entry of bars) {
        const t = barTrouble(entry[1]);
        trouble += t;
        if (t > barTrouble(worst[1])) worst = entry;
        if (entry[1].last > day) day = entry[1].last;
      }
      out.push({
        first: bars[0][0],
        last: bars.at(-1)[0],
        bars: bars.map(([bar]) => bar),
        trouble,
        worst: worst[0],
        slips: recentSlips(worst[1]),
        passes: worst[1].r.length,
        day,
      });
    }
  }
  out.sort(
    (a, b) =>
      b.trouble - a.trouble ||
      (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) ||
      a.first - b.first,
  );
  return limit == null ? out : out.slice(0, limit);
}

// "slipped 3 of the last 5 passes" for a spot or a spotBars entry.
export function describeSpot({ slips, passes }) {
  if (!passes) return "";
  if (slips === passes)
    return passes === 1
      ? "slipped last time"
      : `slipped the last ${passes} times`;
  return `slipped ${slips} of the last ${passes} passes`;
}

export const spotLabel = (spot) =>
  spot.first === spot.last
    ? `bar ${spot.first}`
    : `bars ${spot.first}–${spot.last}`;

// Keep the troubled bars, then the most recently judged ones.
function prune(spots) {
  const entries = Object.entries(spots);
  if (entries.length <= JOURNAL_SPOTS) return spots;
  entries.sort((a, b) => {
    const ta = barTroubled(a[1]) ? 1 : 0,
      tb = barTroubled(b[1]) ? 1 : 0;
    if (ta !== tb) return tb - ta;
    if (a[1].last !== b[1].last) return a[1].last < b[1].last ? 1 : -1;
    return barTrouble(b[1]) - barTrouble(a[1]) || +a[0] - +b[0];
  });
  const kept = {};
  for (const [key, spot] of entries.slice(0, JOURNAL_SPOTS)) kept[key] = spot;
  return kept;
}
