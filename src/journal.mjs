import { readSpots, recordPasses, forgetSpots } from "./trouble-spots.mjs";
// The practice journal: minutes per day and per piece, which bars each piece
// has been played through, and where it was left. It lives in the settings
// file, so every part is read on its own and a damaged entry is dropped
// rather than discarding the rest.
export const JOURNAL_DAYS = 400;
export const JOURNAL_PIECES = 200;
export const JOURNAL_RANGES = 200;
// Passages a pianist keeps coming back to (saved repeats), per piece.
export const JOURNAL_PASSAGES = 20;
// Generated exercises have no library id; they share one journal entry.
export const EXERCISES_ID = "exercises";

export const emptyJournal = () => ({ days: {}, pieces: {} });
export const dayKey = (value) => new Date(value).toLocaleDateString("en-CA");

const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const minutesOk = (v) => Number.isFinite(v) && v >= 0 && v <= 1e7;
const barOk = (v) => Number.isInteger(v) && v >= 1 && v <= 100000;
const idOk = (v) => typeof v === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(v);
const round = (v) => Math.round(v * 100) / 100;
const passageOk = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
  barOk(p[0]) &&
  barOk(p[1]) &&
  p[0] <= p[1];
function dayOk(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(key + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === key;
}

// Sorted, non-overlapping bar ranges; neighbours (5–8 and 9–12) join up.
export function mergeRanges(ranges) {
  const sorted = ranges
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of sorted) {
    const last = merged.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}
export const barsCovered = (ranges = []) =>
  ranges.reduce((sum, [a, b]) => sum + b - a + 1, 0);

function readPiece(value) {
  if (!object(value)) return null;
  const { minutes, sessions, last, bar, ranges, title, passages } = value;
  if (!minutesOk(minutes)) return null;
  if (!Number.isInteger(sessions) || sessions < 0 || sessions > 1e9)
    return null;
  if (
    typeof last !== "string" ||
    last.length > 40 ||
    !Number.isFinite(Date.parse(last))
  )
    return null;
  if (!barOk(bar)) return null;
  if (
    !Array.isArray(ranges) ||
    ranges.length > JOURNAL_RANGES ||
    !ranges.every(
      (r) => Array.isArray(r) && r.length === 2 && barOk(r[0]) && barOk(r[1]),
    )
  )
    return null;
  if (title !== undefined && (typeof title !== "string" || title.length > 300))
    return null;
  if (
    passages !== undefined &&
    (!Array.isArray(passages) ||
      passages.length > JOURNAL_PASSAGES ||
      !passages.every(passageOk))
  )
    return null;
  // Trouble spots are the one part that can be damaged on its own: the
  // minutes and bars of a piece are worth more than a bad bar memory.
  let invalid = false;
  let spots = null;
  if (value.spots !== undefined) {
    const read = readSpots(value.spots);
    invalid = read.invalid;
    if (Object.keys(read.spots).length) spots = read.spots;
  }
  return {
    piece: {
      minutes,
      sessions,
      last,
      bar,
      ranges: mergeRanges(ranges),
      ...(title !== undefined ? { title } : {}),
      ...(passages?.length
        ? { passages: passages.map(([a, b]) => [a, b]) }
        : {}),
      ...(spots ? { spots } : {}),
    },
    invalid,
  };
}
function readDay(value) {
  if (!object(value) || !minutesOk(value.minutes)) return null;
  const pieces = {};
  if (value.pieces !== undefined) {
    if (!object(value.pieces)) return null;
    for (const [id, minutes] of Object.entries(value.pieces)) {
      if (!idOk(id) || !minutesOk(minutes)) return null;
      pieces[id] = minutes;
    }
  }
  return { minutes: value.minutes, pieces };
}
// Recover what can be read; `invalid` says whether anything was dropped.
export function readJournal(value) {
  const journal = emptyJournal();
  if (!object(value)) return { journal, invalid: true };
  let invalid = false;
  if (value.days !== undefined) {
    if (!object(value.days)) invalid = true;
    else
      for (const [key, day] of Object.entries(value.days)) {
        const read = dayOk(key) ? readDay(day) : null;
        if (read) journal.days[key] = read;
        else invalid = true;
      }
  }
  if (value.pieces !== undefined) {
    if (!object(value.pieces)) invalid = true;
    else
      for (const [id, piece] of Object.entries(value.pieces)) {
        const read = idOk(id) ? readPiece(piece) : null;
        if (read) {
          journal.pieces[id] = read.piece;
          if (read.invalid) invalid = true;
        } else invalid = true;
      }
  }
  return { journal: prune(journal), invalid };
}
function prune(journal) {
  const days = Object.keys(journal.days).sort();
  for (const key of days.slice(0, Math.max(0, days.length - JOURNAL_DAYS)))
    delete journal.days[key];
  const pieces = Object.entries(journal.pieces).sort((a, b) =>
    a[1].last < b[1].last ? -1 : a[1].last > b[1].last ? 1 : 0,
  );
  for (const [id] of pieces.slice(
    0,
    Math.max(0, pieces.length - JOURNAL_PIECES),
  ))
    delete journal.pieces[id];
  return journal;
}
// One stretch of practice: minutes played on a piece, from one bar to
// another (plus any bars in `cover`, such as a phrase that came round).
// Returns a new journal; the old one is left as it was.
export function recordPractice(
  journal,
  { id, title, minutes, from, to, at, cover = [] },
) {
  if (!Number.isFinite(minutes) || minutes < 0.05) return journal;
  const when = new Date(at ?? Date.now());
  const key = dayKey(when);
  const day = journal.days[key] || { minutes: 0, pieces: {} };
  const next = {
    days: {
      ...journal.days,
      [key]: {
        minutes: round(day.minutes + minutes),
        pieces: idOk(id)
          ? { ...day.pieces, [id]: round((day.pieces[id] || 0) + minutes) }
          : day.pieces,
      },
    },
    pieces: { ...journal.pieces },
  };
  if (idOk(id)) {
    const piece = journal.pieces[id] || {
      minutes: 0,
      sessions: 0,
      last: when.toISOString(),
      bar: 1,
      ranges: [],
    };
    const a = Math.max(1, Math.trunc(from) || 1);
    const b = Math.max(1, Math.trunc(to) || a);
    const extra = cover.filter(
      (r) => Array.isArray(r) && barOk(r[0]) && barOk(r[1]),
    );
    let ranges = mergeRanges([...piece.ranges, [a, b], ...extra]);
    // A very scattered piece keeps its widest stretches.
    if (ranges.length > JOURNAL_RANGES)
      ranges = mergeRanges(
        ranges
          .sort((x, y) => y[1] - y[0] - (x[1] - x[0]))
          .slice(0, JOURNAL_RANGES),
      );
    next.pieces[id] = {
      minutes: round(piece.minutes + minutes),
      sessions: piece.sessions + 1,
      last: when.toISOString(),
      bar: b,
      ranges,
      ...(typeof title === "string" && title
        ? { title: title.slice(0, 300) }
        : piece.title
          ? { title: piece.title }
          : {}),
      ...(piece.passages ? { passages: piece.passages } : {}),
      ...(piece.spots ? { spots: piece.spots } : {}),
    };
  }
  return prune(next);
}
// Judged passes of a piece's bars ([{ bar, clean }], in order) from Wait for
// me or Play in time. Returns a new journal; the old one is left as it was.
export function recordBarPasses(journal, { id, title, passes, at }) {
  if (!idOk(id) || !Array.isArray(passes) || !passes.length) return journal;
  const piece = journal.pieces[id] || {
    minutes: 0,
    sessions: 0,
    last: new Date(at ?? Date.now()).toISOString(),
    bar: 1,
    ranges: [],
  };
  const before = piece.spots || {};
  const spots = recordPasses(before, passes, { at });
  if (spots === before) return journal;
  return {
    days: journal.days,
    pieces: {
      ...journal.pieces,
      [id]: {
        ...piece,
        ...(typeof title === "string" && title && !piece.title
          ? { title: title.slice(0, 300) }
          : {}),
        spots,
      },
    },
  };
}
// Forget the trouble in bars first..last of a piece.
export function forgetPieceSpots(journal, { id, first, last }) {
  const piece = journal.pieces[id];
  if (!piece?.spots) return journal;
  const spots = forgetSpots(piece.spots, first, last);
  if (spots === piece.spots) return journal;
  const { spots: _, ...rest } = piece;
  return {
    days: journal.days,
    pieces: {
      ...journal.pieces,
      [id]: Object.keys(spots).length ? { ...rest, spots } : rest,
    },
  };
}
// Keep a passage (bars a–b) to come back to; a piece keeps up to
// JOURNAL_PASSAGES of them, in bar order. Returns a new journal.
export function savePassage(journal, { id, title, from, to, at }) {
  if (!idOk(id)) return journal;
  const a = Math.max(1, Math.trunc(Math.min(from, to)) || 1);
  const b = Math.max(a, Math.trunc(Math.max(from, to)) || a);
  const piece = journal.pieces[id] || {
    minutes: 0,
    sessions: 0,
    last: new Date(at ?? Date.now()).toISOString(),
    bar: 1,
    ranges: [],
  };
  const others = (piece.passages || []).filter(([x, y]) => x !== a || y !== b);
  if (others.length >= JOURNAL_PASSAGES) return journal;
  const passages = [...others, [a, b]].sort(
    (p, q) => p[0] - q[0] || p[1] - q[1],
  );
  return {
    days: journal.days,
    pieces: {
      ...journal.pieces,
      [id]: {
        ...piece,
        ...(typeof title === "string" && title && !piece.title
          ? { title: title.slice(0, 300) }
          : {}),
        passages,
      },
    },
  };
}
export function removePassage(journal, { id, from, to }) {
  const piece = journal.pieces[id];
  if (!piece?.passages) return journal;
  const passages = piece.passages.filter(([x, y]) => x !== from || y !== to);
  if (passages.length === piece.passages.length) return journal;
  const { passages: _, ...rest } = piece;
  return {
    days: journal.days,
    pieces: {
      ...journal.pieces,
      [id]: passages.length ? { ...rest, passages } : rest,
    },
  };
}
// The last `count` days, oldest first, with their minutes (0 when unplayed).
export function recentDays(journal, count, now = new Date()) {
  const out = [];
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (count - 1));
  for (let i = 0; i < count; i++) {
    const key = dayKey(cursor);
    out.push({
      day: key,
      date: new Date(cursor),
      minutes: journal.days[key]?.minutes || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
// Days in a row with practice, ending today (or yesterday, before today's
// practice). Graded runs count too, for history kept before the journal.
export function practiceStreak(journal, history = [], now = new Date()) {
  const days = new Set(
    Object.entries(journal.days)
      .filter(([, d]) => d.minutes >= 0.5)
      .map(([key]) => key),
  );
  for (const h of history) days.add(dayKey(h.at));
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
export const totalMinutes = (journal) =>
  Object.values(journal.days).reduce((sum, d) => sum + d.minutes, 0);
// "1 h 05 min", "12 min", "under a minute" (or "<1 min" when short).
export function formatMinutes(minutes, { short = false } = {}) {
  const m = Math.round(minutes);
  if (minutes > 0 && m < 1) return short ? "<1 min" : "under a minute";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
