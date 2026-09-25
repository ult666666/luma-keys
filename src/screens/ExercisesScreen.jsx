import { ArrowRight, Check, Dices, Sparkles } from "lucide-react";
import {
  LEVELS,
  EXERCISE_KEYS,
  METERS,
  BAR_CHOICES,
  levelFor,
} from "../exercise.mjs";
import { levelAdvice } from "../performance.mjs";

// Level statistics from graded Play in time runs.
export function levelStats(history, level) {
  const runs = history.filter((h) => h.level === level && h.mode === "perform");
  if (!runs.length) return null;
  const recent = runs.slice(-3);
  return {
    runs: runs.length,
    best: Math.round(Math.max(...runs.map((h) => h.accuracy))),
    recent: Math.round(
      recent.reduce((sum, h) => sum + h.accuracy, 0) / recent.length,
    ),
  };
}

const levelKeys = (entry) => {
  const names = entry.fifths
    .slice(0, 3)
    .map((f) =>
      EXERCISE_KEYS.find((k) => k.fifths === f)?.name.replace(" major", ""),
    )
    .filter(Boolean);
  return `${names.join(", ")}${entry.fifths.length > 3 ? "…" : ""} major`;
};
export default function ExercisesScreen({
  history,
  options,
  onChange,
  onStart,
  recommended,
}) {
  const level = levelFor(options.level);
  const advice = levelAdvice(history, level.level);
  const set = (key, value) => onChange({ ...options, [key]: value });
  const numeric = (v) => (v === "auto" ? "auto" : Number(v));
  return (
    <section className="screen exercises-screen" aria-label="Exercises">
      <header className="screen-header">
        <div>
          <h1>Exercises</h1>
          <p>
            Twelve levels of music nobody has played before. Pick a level, read
            it once in time, and let the next piece appear. Three clean runs
            unlock the level after.
          </p>
        </div>
      </header>
      <div className="exercises-layout">
        <ol className="level-list" aria-label="Sight-reading path">
          {LEVELS.map((entry) => {
            const stats = levelStats(history, entry.level);
            const cleared = levelAdvice(history, entry.level).ready;
            const selected = options.level === entry.level;
            return (
              <li
                key={entry.level}
                className={`level-card${selected ? " selected" : ""}${entry.level === recommended ? " recommended" : ""}${cleared ? " cleared" : ""}`}
              >
                <button
                  type="button"
                  className="level-select"
                  aria-pressed={selected}
                  onClick={() => set("level", entry.level)}
                >
                  <span className="level-number">
                    {String(entry.level).padStart(2, "0")}
                  </span>
                  <span className="level-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.summary}</small>
                    <span
                      className="level-chips"
                      aria-label="Level ingredients"
                    >
                      <em>{levelKeys(entry)}</em>
                      <em>{entry.meters.join(" · ")}</em>
                      <em>
                        {entry.hands === "both"
                          ? "both hands"
                          : `${entry.hands} hand`}
                      </em>
                    </span>
                  </span>
                </button>
                <div className="level-meta">
                  {entry.level === recommended && <em>Recommended</em>}
                  {cleared && (
                    <em className="level-cleared">
                      <Check size={11} /> Cleared
                    </em>
                  )}
                  <span className="level-runs">
                    {stats
                      ? `${stats.runs} run${stats.runs === 1 ? "" : "s"} · best ${stats.best}% · recent ${stats.recent}%`
                      : "Not yet played"}
                  </span>
                  <i
                    className="level-bar"
                    aria-hidden="true"
                    style={{ "--best": `${stats ? stats.best : 0}%` }}
                  />
                </div>
                <button
                  type="button"
                  className="secondary small level-start"
                  onClick={() =>
                    onStart({ ...options, level: entry.level, seed: undefined })
                  }
                >
                  Start <ArrowRight size={13} />
                </button>
              </li>
            );
          })}
        </ol>
        <aside className="exercise-panel" aria-label="Exercise options">
          <span className="eyebrow">LEVEL {level.level}</span>
          <h2>{level.title}</h2>
          <p className="exercise-summary">
            {level.summary}
            {advice.ready && (
              <strong>
                {" "}
                Your last three runs were clean; the next level is ready.
              </strong>
            )}
          </p>
          <form
            className="exercise-form"
            onSubmit={(e) => {
              e.preventDefault();
              onStart({ ...options, seed: undefined });
            }}
          >
            <label className="exercise-level">
              <span>Level</span>
              <select
                aria-label="Exercise level"
                value={options.level}
                onChange={(e) => set("level", Number(e.target.value))}
              >
                {LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    {l.level} · {l.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="exercise-grid">
              <label>
                <span>Key</span>
                <select
                  aria-label="Exercise key"
                  value={options.fifths}
                  onChange={(e) => set("fifths", numeric(e.target.value))}
                >
                  <option value="auto">Level’s keys</option>
                  {EXERCISE_KEYS.map((k) => (
                    <option key={k.fifths} value={k.fifths}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Hands</span>
                <select
                  aria-label="Exercise hands"
                  value={options.hands}
                  onChange={(e) => set("hands", e.target.value)}
                >
                  <option value="auto">Level’s hands</option>
                  <option value="right">Right hand</option>
                  <option value="left">Left hand</option>
                  <option value="both">Both hands</option>
                </select>
              </label>
              <label>
                <span>Length</span>
                <select
                  aria-label="Exercise length"
                  value={options.bars}
                  onChange={(e) => set("bars", numeric(e.target.value))}
                >
                  <option value="auto">Level’s length</option>
                  {BAR_CHOICES.map((b) => (
                    <option key={b} value={b}>
                      {b} bars
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Meter</span>
                <select
                  aria-label="Exercise meter"
                  value={options.meter}
                  onChange={(e) => set("meter", e.target.value)}
                >
                  <option value="auto">Level’s meters</option>
                  {Object.keys(METERS).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="exercise-tempo-field">
                <span>Tempo ♩ =</span>
                <span className="exercise-tempo">
                  <select
                    aria-label="Exercise tempo mode"
                    value={options.tempo === "auto" ? "auto" : "custom"}
                    onChange={(e) =>
                      set(
                        "tempo",
                        e.target.value === "auto" ? "auto" : level.tempo,
                      )
                    }
                  >
                    <option value="auto">Level’s tempo ({level.tempo})</option>
                    <option value="custom">Custom</option>
                  </select>
                  {options.tempo !== "auto" && (
                    <input
                      aria-label="Exercise tempo"
                      type="number"
                      min="30"
                      max="200"
                      value={options.tempo}
                      onChange={(e) =>
                        set(
                          "tempo",
                          Math.max(
                            30,
                            Math.min(200, Math.round(+e.target.value) || 30),
                          ),
                        )
                      }
                    />
                  )}
                </span>
              </label>
            </div>
            <button type="submit" className="primary exercise-start">
              <Dices size={16} /> Start exercise
            </button>
          </form>
          <div className="exercise-tips">
            <h3>
              <Sparkles size={13} /> How to practise this level
            </h3>
            <ol>
              {level.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}
