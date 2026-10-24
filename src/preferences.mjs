// Reading settings the app restores on the next launch. Each field falls back
// to its default alone, so one bad value never resets the others.
import { emptyJournal, readJournal } from "./journal.mjs";
import { COMPANIONS } from "./companions.mjs";
import { readBackingMap } from "./backing-settings.mjs";
// The companion's own memory (reading.buddyState): quiet mode, the side it
// keeps, the chat hint, bond per companion and the treat jar.
export const STREAK_MILESTONES = Object.freeze([3, 7, 14, 30, 100]);
export function defaultBuddyState() {
  return {
    quiet: false,
    hintSeen: false,
    side: "right",
    lastSeen: "",
    bond: {},
    // goalDay: the last day the daily goal paid out (a treat and bond).
    treats: { jar: 0, day: "", earnedToday: 0, milestones: [], goalDay: "" },
  };
}
/** '' or a real calendar date written YYYY-MM-DD. */
export function isDayKey(v) {
  if (v === "") return true;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
}
/** Each subfield falls back to its default alone; anything unusable sets
 * `invalid` so the settings file is flagged. */
export function readBuddyState(
  value,
  ids = COMPANIONS.map((profile) => profile.id),
) {
  const state = defaultBuddyState();
  if (value === undefined) return { state, invalid: false };
  const isObject = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const int = (lo, hi) => (v) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!isObject(value)) return { state, invalid: true };
  let invalid = false;
  const take = (into, from, key, ok) => {
    if (from[key] === undefined) return;
    if (ok(from[key])) into[key] = from[key];
    else invalid = true;
  };
  take(state, value, "quiet", (v) => typeof v === "boolean");
  take(state, value, "hintSeen", (v) => typeof v === "boolean");
  take(state, value, "side", (v) => v === "right" || v === "left");
  take(state, value, "lastSeen", isDayKey);
  if (value.bond !== undefined) {
    if (!isObject(value.bond)) invalid = true;
    else
      for (const [id, entry] of Object.entries(value.bond)) {
        if (!ids.includes(id) || !isObject(entry)) {
          invalid = true;
          continue;
        }
        const bond = { xp: 0, pets: 0, petDay: "" };
        take(bond, entry, "xp", int(0, 1e7));
        take(bond, entry, "pets", int(0, 5));
        take(bond, entry, "petDay", isDayKey);
        state.bond[id] = bond;
      }
  }
  if (value.treats !== undefined) {
    const t = value.treats;
    if (!isObject(t)) invalid = true;
    else {
      take(state.treats, t, "jar", int(0, 12));
      take(state.treats, t, "day", isDayKey);
      take(state.treats, t, "earnedToday", int(0, 10));
      take(state.treats, t, "goalDay", isDayKey);
      if (t.milestones !== undefined) {
        if (
          Array.isArray(t.milestones) &&
          t.milestones.every((m) => STREAK_MILESTONES.includes(m))
        )
          state.treats.milestones = [...new Set(t.milestones)].sort(
            (a, b) => a - b,
          );
        else invalid = true;
      }
    }
  }
  return { state, invalid };
}
export const EXERCISE_DEFAULTS = Object.freeze({
  level: 1,
  fifths: "auto",
  hands: "auto",
  bars: "auto",
  meter: "auto",
  tempo: "auto",
});
export const defaultReading = () => ({
  labels: "numbers",
  tonic: 0,
  tonicFollow: false,
  countIn: true,
  metronome: false,
  keyboardCollapsed: false,
  keyLane: true,
  // A pair of hands over the keys showing the suggested fingering.
  keyHands: true,
  handDisplay: "natural",
  readingView: "numbers",
  speed: 0.75,
  mode: "listen",
  hand: "both",
  exercise: { ...EXERCISE_DEFAULTS },
  last: { scoreId: null, exercise: null },
  coach: true,
  companion: "beethoven",
  // Legacy (read, still written for older builds): whether the app took the
  // companion's room colours. `colours` decides now.
  companionStyle: true,
  // The app's colours: one calm neutral palette by default. "companion"
  // borrows the chosen companion's room; a theme id keeps that custom room.
  colours: "neutral",
  welcomeSeen: false,
  // Minutes a day to aim for (the Progress screen's ring).
  goal: 20,
  // Practising one hand, the piano plays the other softly.
  accompany: true,
  // The room around the piano: dry, a room, or a concert hall.
  room: "room",
  interpretation: "concert",
  // The companion walks beside you around the app and reacts to practice.
  buddy: true,
  // Its own memory: quiet mode, the side it keeps, bond and treats.
  buddyState: defaultBuddyState(),
  backing: {},
});
// Colour themes a reader can pick by hand (the companion rooms' palettes).
export const COLOUR_THEMES = Object.freeze([
  "mint",
  "lavender",
  "rose",
  "ocean",
  "walnut",
]);
export const COLOUR_CHOICES = Object.freeze([
  "neutral",
  "companion",
  ...COLOUR_THEMES,
]);
export const HISTORY_LIMIT = 400;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const inList = (list) => (v) => list.includes(v);
const between =
  (lo, hi, integer = false) =>
  (v) =>
    Number.isFinite(v) &&
    v >= lo &&
    v <= hi &&
    (!integer || Number.isInteger(v));
const autoOr = (check) => (v) => v === "auto" || check(v);
function readReading(value) {
  const reading = defaultReading();
  if (!object(value)) return { reading, invalid: true };
  let invalid = false;
  const rules = {
    labels: inList(["numbers", "solfege", "letters"]),
    tonic: between(0, 11, true),
    tonicFollow: (v) => typeof v === "boolean",
    countIn: (v) => typeof v === "boolean",
    metronome: (v) => typeof v === "boolean",
    keyboardCollapsed: (v) => typeof v === "boolean",
    keyLane: (v) => typeof v === "boolean",
    keyHands: (v) => typeof v === "boolean",
    handDisplay: inList(["natural", "focus", "off"]),
    readingView: inList(["numbers", "sheet", "falling"]),
    // 25% to 125% in steps of 5%.
    speed: (v) =>
      between(0.25, 1.25)(v) && Math.abs(v * 20 - Math.round(v * 20)) < 1e-9,
    mode: inList(["listen", "wait", "perform"]),
    hand: inList(["both", "right", "left"]),
    coach: (v) => typeof v === "boolean",
    companion: inList(COMPANIONS.map((profile) => profile.id)),
    companionStyle: (v) => typeof v === "boolean",
    colours: inList(COLOUR_CHOICES),
    welcomeSeen: (v) => typeof v === "boolean",
    goal: between(5, 240, true),
    accompany: (v) => typeof v === "boolean",
    room: inList(["dry", "room", "hall"]),
    interpretation: inList(["concert", "written"]),
    buddy: (v) => typeof v === "boolean",
  };
  for (const [key, check] of Object.entries(rules)) {
    if (value[key] === undefined) continue;
    if (check(value[key])) reading[key] = value[key];
    else invalid = true;
  }
  // Migrate the old toggle, and keep a compatible mirror for older builds.
  if (value.handDisplay === undefined)
    reading.handDisplay = reading.keyHands ? "natural" : "off";
  reading.keyHands = reading.handDisplay !== "off";
  if (value.exercise !== undefined) {
    if (!object(value.exercise)) invalid = true;
    else {
      for (const [key, check] of Object.entries(EXERCISE_RULES)) {
        if (value.exercise[key] === undefined) continue;
        if (check(value.exercise[key]))
          reading.exercise[key] = value.exercise[key];
        else invalid = true;
      }
    }
  }
  if (value.last !== undefined) {
    const last = readLast(value.last);
    if (last) reading.last = last;
    else invalid = true;
  }
  const backing = readBackingMap(value.backing);
  reading.backing = backing.settings;
  invalid ||= backing.invalid;
  const buddyState = readBuddyState(
    value.buddyState,
    COMPANIONS.map((profile) => profile.id),
  );
  reading.buddyState = buddyState.state;
  invalid ||= buddyState.invalid;
  return { reading, invalid };
}
const EXERCISE_RULES = {
  level: between(1, 12, true),
  fifths: autoOr(between(-7, 7, true)),
  hands: autoOr(inList(["right", "left", "both"])),
  bars: autoOr(inList([4, 8, 12, 16])),
  meter: autoOr(inList(["4/4", "3/4", "2/4", "6/8"])),
  tempo: autoOr(between(30, 200, true)),
};
// An exact exercise: its seed plus the choices that shaped it.
export function readExerciseRef(e) {
  if (!object(e) || !between(1, 1e9, true)(e.seed)) return null;
  const exercise = { seed: e.seed };
  for (const [key, check] of Object.entries(EXERCISE_RULES)) {
    const v = e[key] === undefined ? EXERCISE_DEFAULTS[key] : e[key];
    if (!check(v)) return null;
    exercise[key] = v;
  }
  return exercise;
}
// The place to reopen: a library or lesson score, or an exact exercise seed.
function readLast(value) {
  if (!object(value)) return null;
  const last = { scoreId: null, exercise: null };
  if (value.scoreId != null) {
    if (
      typeof value.scoreId !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(value.scoreId)
    )
      return null;
    last.scoreId = value.scoreId;
  }
  if (value.exercise != null) {
    last.exercise = readExerciseRef(value.exercise);
    if (!last.exercise) return null;
  }
  return last;
}
// One line per graded run. Damaged entries are dropped rather than repaired.
export function validHistoryEntry(entry) {
  if (!object(entry)) return false;
  const text = (v, limit) => typeof v === "string" && v.length <= limit;
  return (
    text(entry.at, 40) &&
    Number.isFinite(Date.parse(entry.at)) &&
    text(entry.title, 300) &&
    (entry.scoreId == null ||
      (text(entry.scoreId, 80) && /^[a-zA-Z0-9-]+$/.test(entry.scoreId))) &&
    (entry.level == null || between(1, 12, true)(entry.level)) &&
    (entry.fifths == null || between(-7, 7, true)(entry.fifths)) &&
    (entry.seed == null || between(1, 1e9, true)(entry.seed)) &&
    between(0, 100)(entry.accuracy) &&
    between(0, 100)(entry.timing) &&
    between(0, 100000, true)(entry.notes) &&
    between(1, 1000)(entry.tempo) &&
    ["perform", "wait"].includes(entry.mode) &&
    typeof entry.complete === "boolean" &&
    between(1, 100000, true)(entry.bars) &&
    (entry.exercise == null || readExerciseRef(entry.exercise) !== null)
  );
}
function readHistory(value) {
  if (!Array.isArray(value)) return { entries: [], invalid: true };
  const entries = value.filter(validHistoryEntry).map((entry) => ({
    at: entry.at,
    title: entry.title,
    scoreId: entry.scoreId ?? null,
    level: entry.level ?? null,
    fifths: entry.fifths ?? null,
    seed: entry.seed ?? null,
    accuracy: entry.accuracy,
    timing: entry.timing,
    notes: entry.notes,
    tempo: entry.tempo,
    mode: entry.mode,
    complete: entry.complete,
    bars: entry.bars,
    exercise: entry.exercise == null ? null : readExerciseRef(entry.exercise),
  }));
  return {
    entries: entries.slice(-HISTORY_LIMIT),
    invalid: entries.length !== value.length,
  };
}
// Recover fields independently, so one damaged setting does not discard the rest.
export function readPreferences(value) {
  const preferences = {
    theme: "mint",
    pet: "cat",
    volume: 0.65,
    stats: {
      correct: 0,
      minutes: 0,
      sessions: 0,
      dailyMinutes: 0,
      practiceDate: "",
    },
    reading: defaultReading(),
    history: [],
    journal: emptyJournal(),
  };
  const issues = [];
  if (!object(value)) return { preferences, issues: ["Saved settings"] };
  if (value.reading !== undefined) {
    const reading = readReading(value.reading);
    preferences.reading = reading.reading;
    if (reading.invalid) issues.push("Reading preferences");
  }
  if (value.history !== undefined) {
    const history = readHistory(value.history);
    preferences.history = history.entries;
    if (history.invalid) issues.push("Practice history");
  }
  if (value.journal !== undefined) {
    const journal = readJournal(value.journal);
    preferences.journal = journal.journal;
    if (journal.invalid) issues.push("Practice journal");
  }
  for (const [key, allowed, label] of [
    ["theme", COLOUR_THEMES, "Color theme"],
    ["pet", ["cat", "bunny"], "Companion"],
  ]) {
    if (value[key] === undefined) continue;
    if (allowed.includes(value[key])) preferences[key] = value[key];
    else issues.push(label);
  }
  if (value.volume !== undefined) {
    if (Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1)
      preferences.volume = value.volume;
    else issues.push("Piano volume");
  }
  if (value.stats !== undefined) {
    if (!object(value.stats)) issues.push("Practice progress");
    else {
      for (const [key, max, integer, label] of [
        ["correct", 1e12, true, "Correct-note total"],
        ["sessions", 1e9, true, "Practice-session total"],
        ["minutes", 1e9, false, "Practice minutes"],
        ["dailyMinutes", 1440, false, "Today’s practice minutes"],
      ]) {
        const v = value.stats[key];
        if (v === undefined) continue;
        if (
          Number.isFinite(v) &&
          v >= 0 &&
          v <= max &&
          (!integer || Number.isInteger(v))
        )
          preferences.stats[key] = v;
        else issues.push(label);
      }
      const date = value.stats.practiceDate;
      if (date !== undefined) {
        const parsed =
          typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? new Date(date + "T00:00:00Z")
            : null;
        if (
          date === "" ||
          (parsed &&
            Number.isFinite(+parsed) &&
            parsed.toISOString().slice(0, 10) === date)
        )
          preferences.stats.practiceDate = date;
        else issues.push("Practice date");
      }
    }
  }
  return { preferences, issues };
}
export function validatePreferences(value) {
  const result = readPreferences(value);
  if (result.issues.length)
    throw Error(
      "Invalid settings: " +
        result.issues.join(", ") +
        ". Choose supported settings and nonnegative numeric progress.",
    );
  return result.preferences;
}

// ---- forward compatibility ---------------------------------------------------
// The fields this version reads, at each level of the settings file. A field
// written by a newer version (or a future feature) is not one of them.
export const KNOWN_PREFERENCE_KEYS = Object.freeze({
  top: Object.freeze(["theme", "pet", "volume", "stats", "reading", "history", "journal"]),
  stats: Object.freeze(["correct", "minutes", "sessions", "dailyMinutes", "practiceDate"]),
  reading: Object.freeze(Object.keys(defaultReading())),
  journal: Object.freeze(["days", "pieces"]),
  day: Object.freeze(["minutes", "pieces"]),
  piece: Object.freeze(["minutes", "sessions", "last", "bar", "ranges", "title", "passages", "spots"]),
});
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// Carry forward, from the file as it was, the fields this version does not
// know — at the top level, in stats, reading and the journal, and on each day
// and piece still present — so editing settings here never erases what a
// newer version stored (opening a recovered older app, or a newer one later).
// Fields this version knows are never carried: removing a passage or a
// trouble spot still removes it. Neither input is changed.
export function mergeUnknownPreferences(previous, next) {
  if (!plain(previous) || !plain(next)) return next;
  const K = KNOWN_PREFERENCE_KEYS;
  const unknown = (from, known) =>
    plain(from) ? Object.fromEntries(Object.entries(from).filter(([k]) => !known.includes(k))) : {};
  const out = { ...unknown(previous, K.top), ...next };
  for (const key of ["stats", "reading"])
    if (plain(next[key])) out[key] = { ...unknown(previous[key], K[key]), ...next[key] };
  if (plain(next.journal)) {
    const pj = plain(previous.journal) ? previous.journal : {};
    const journal = { ...unknown(pj, K.journal), ...next.journal };
    for (const [list, known] of [["days", K.day], ["pieces", K.piece]]) {
      if (!plain(next.journal[list])) continue;
      const before = plain(pj[list]) ? pj[list] : {};
      journal[list] = Object.fromEntries(
        Object.entries(next.journal[list]).map(([id, entry]) => [
          id,
          plain(entry) ? { ...unknown(before[id], known), ...entry } : entry,
        ]),
      );
    }
    out.journal = journal;
  }
  return out;
}
