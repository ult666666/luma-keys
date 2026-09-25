// Reading settings the app restores on the next launch. Each field falls back
// to its default alone, so one bad value never resets the others.
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
  readingView: "numbers",
  speed: 0.75,
  mode: "listen",
  hand: "both",
  exercise: { ...EXERCISE_DEFAULTS },
  last: { scoreId: null, exercise: null },
});
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
    readingView: inList(["numbers", "sheet", "falling"]),
    speed: inList([0.25, 0.5, 0.65, 0.75, 1, 1.25]),
    mode: inList(["listen", "wait", "perform"]),
    hand: inList(["both", "right", "left"]),
  };
  for (const [key, check] of Object.entries(rules)) {
    if (value[key] === undefined) continue;
    if (check(value[key])) reading[key] = value[key];
    else invalid = true;
  }
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
    const e = value.exercise;
    if (!object(e) || !between(1, 1e9, true)(e.seed)) return null;
    const exercise = { seed: e.seed };
    for (const [key, check] of Object.entries(EXERCISE_RULES)) {
      const v = e[key] === undefined ? EXERCISE_DEFAULTS[key] : e[key];
      if (!check(v)) return null;
      exercise[key] = v;
    }
    last.exercise = exercise;
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
    between(1, 100000, true)(entry.bars)
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
  for (const [key, allowed, label] of [
    ["theme", ["mint", "lavender", "rose"], "Color theme"],
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
