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
  };
  const issues = [];
  const object = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  if (!object(value)) return { preferences, issues: ["Saved settings"] };
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
