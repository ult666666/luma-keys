import { BookOpen, Check, ChevronDown, Dices, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  LEVELS,
  EXERCISE_KEYS,
  METERS,
  BAR_CHOICES,
  levelFor,
  randomSeed,
  resolveExercise,
} from "../exercise.mjs";
import { EXERCISE_DEFAULTS } from "../preferences.mjs";
import { levelAdvice } from "../performance.mjs";
import DraftNumber from "../DraftNumber.jsx";
import { Segmented } from "./ui.jsx";

// Only graded Perform runs contribute to these results.
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

const STAGES = [
  { title: "Foundations", range: "01–04", levels: LEVELS.slice(0, 4) },
  { title: "Reading & rhythm", range: "05–08", levels: LEVELS.slice(4, 8) },
  {
    title: "Chords & coordination",
    range: "09–12",
    levels: LEVELS.slice(8, 12),
  },
];
const keyName = (fifths) =>
  EXERCISE_KEYS.find((key) => key.fifths === fifths)?.name ?? "C major";
const handsWord = (hands) =>
  hands === "both"
    ? "Both hands"
    : `${hands === "left" ? "Left" : "Right"} hand`;
const customized = (options, keys) =>
  keys.some((key) => options[key] !== "auto");

// A teaching illustration, never a preview of the randomly generated score.
function ExerciseMotif({ level }) {
  const chords = level.level >= 9;
  const quick = level.level === 6 || level.level >= 10;
  const skips = level.level === 3 || level.level === 8;
  const notes = skips ? [66, 46, 66, 36, 56] : [66, 61, 56, 51, 46];
  return (
    <div className="exercise-motif" aria-hidden="true">
      <svg viewBox="0 0 300 104" focusable="false">
        <g
          className="exercise-motif-staff"
          fill="none"
          stroke="currentColor"
          strokeWidth=".7"
        >
          {[46, 56, 66, 76, 86].map((y) => (
            <path key={y} d={`M22 ${y}H277`} />
          ))}
        </g>
        <g
          className="exercise-motif-notes"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {notes.map((y, i) => (
            <g key={i} transform={`translate(${43 + i * 47} ${y})`}>
              <ellipse rx="7" ry="4.7" transform="rotate(-22)" stroke="none" />
              <path d="M6-2V-27" />
              {chords && (
                <ellipse
                  cy="10"
                  rx="7"
                  ry="4.7"
                  transform="rotate(-22 0 10)"
                  stroke="none"
                />
              )}
              {quick && <path d="M6-27q11 5 8 13" fill="none" />}
            </g>
          ))}
          {level.level === 12 && (
            <path d="M190 14q11 5 8 13m39-18q11 5 8 13" fill="none" />
          )}
        </g>
        <path
          className="exercise-motif-phrase"
          d="M34 23Q150-3 268 23"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <g className="exercise-motif-piano" transform="translate(225 75)">
          <rect width="65" height="24" rx="4" />
          {[13, 26, 39, 52].map((x) => (
            <path key={x} d={`M${x} 1V23`} />
          ))}
          {[10, 23, 49].map((x) => (
            <rect
              key={x}
              x={x}
              width="6"
              height="13"
              rx="1"
              className="exercise-motif-black"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default function ExercisesScreen({
  history,
  options,
  onChange,
  onStart,
  recommended,
}) {
  // Resolve Auto once for this visit. The same seed reaches the generator,
  // so the starting settings shown here are the settings that actually open.
  const [seed] = useState(randomSeed);
  const { config } = resolveExercise({ ...options, seed });
  const level = levelFor(options.level);
  const stats = levelStats(history, level.level);
  const advice = levelAdvice(history, level.level);
  const hasOverrides = customized(options, [
    "hands",
    "bars",
    "fifths",
    "meter",
    "tempo",
  ]);
  const customMusic = customized(options, ["fifths", "meter", "tempo"]);
  const set = (key, value) => onChange({ ...options, [key]: value });
  const numeric = (value) => (value === "auto" ? "auto" : Number(value));
  const tips = level.tips.map((tip, index) => {
    if (
      index === 0 &&
      level.level <= 2 &&
      customized(options, ["hands", "fifths"])
    )
      return "Locate the first notes in the score, then follow the finger guide.";
    if (index === 0 && level.level === 5 && options.fifths !== "auto")
      return "Check the key signature for sharps or flats in every octave.";
    return tip;
  });

  return (
    <section
      className="screen exercises-screen exercise-workspace"
      aria-label="Exercises"
    >
      <header className="screen-header exercise-header">
        <div>
          <span className="screen-eyebrow">Sight-reading</span>
          <h1>Exercises</h1>
          <p>Choose a level, then start a fresh study.</p>
        </div>
      </header>
      <div className="exercise-desk">
        <aside
          className="exercise-panel exercise-setup"
          aria-label="Exercise options"
        >
          <div className="exercise-detail-heading">
            <span className="exercise-detail-level">Level {level.level}</span>
            {advice.ready ? (
              <span className="exercise-detail-cleared">
                <Check size={12} aria-hidden="true" />
                Cleared
              </span>
            ) : null}
          </div>
          <div className="exercise-selected-lesson" key={level.level}>
            <h2>{level.title}</h2>
            <p className="exercise-summary">
              {hasOverrides && (
                <span className="exercise-focus-label">Level focus: </span>
              )}
              {level.summary}
            </p>
            <ExerciseMotif level={level} />
          </div>
          <p className="exercise-results">
            {stats ? (
              <>
                <strong>Best {stats.best}%</strong>
                <span>
                  Recent {stats.recent}% · {stats.runs}{" "}
                  {stats.runs === 1 ? "run" : "runs"}
                </span>
              </>
            ) : (
              "No graded runs yet"
            )}
          </p>
          <form
            className="exercise-form"
            onSubmit={(event) => {
              event.preventDefault();
              onStart({ ...options, seed }, { fresh: true });
            }}
          >
            <div className="exercise-choice">
              <span>
                Hands{" "}
                <small>
                  {handsWord(config.hands)}
                  {options.hands !== "auto" ? " · custom" : ""}
                </small>
              </span>
              <Segmented
                label="Exercise hands"
                value={options.hands}
                onPick={(value) => set("hands", value)}
                choices={[
                  ["auto", "Auto", `${handsWord(level.hands)} (level)`],
                  ["right", "Right"],
                  ["left", "Left"],
                  ["both", "Both"],
                ]}
              />
            </div>
            <div className="exercise-choice">
              <span>
                Length{" "}
                <small>
                  {options.bars === "auto"
                    ? `${level.bars} bars`
                    : `${options.bars} bars · custom`}
                </small>
              </span>
              <Segmented
                label="Exercise length"
                value={options.bars}
                onPick={(value) => set("bars", value)}
                choices={[
                  ["auto", "Auto", `${level.bars} bars (level)`],
                  ...BAR_CHOICES.map((bars) => [
                    bars,
                    String(bars),
                    `${bars} bars`,
                  ]),
                ]}
              />
            </div>
            <details className="exercise-customize">
              <summary>
                <span>
                  Customize{" "}
                  <small>{customMusic ? "Custom" : "Level settings"}</small>
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="exercise-grid">
                <label>
                  <span>Key</span>
                  <select
                    aria-label="Exercise key"
                    value={options.fifths}
                    onChange={(event) =>
                      set("fifths", numeric(event.target.value))
                    }
                  >
                    <option value="auto">
                      {options.fifths === "auto"
                        ? `Auto · ${keyName(config.fifths)}`
                        : "Auto · level keys"}
                    </option>
                    {EXERCISE_KEYS.map((key) => (
                      <option key={key.fifths} value={key.fifths}>
                        {key.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Meter</span>
                  <select
                    aria-label="Exercise meter"
                    value={options.meter}
                    onChange={(event) => set("meter", event.target.value)}
                  >
                    <option value="auto">
                      {options.meter === "auto"
                        ? `Auto · ${config.meter}`
                        : "Auto · level meters"}
                    </option>
                    {Object.keys(METERS).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="exercise-tempo-field">
                  <span>Tempo</span>
                  <span className="exercise-tempo">
                    <select
                      aria-label="Exercise tempo mode"
                      value={options.tempo === "auto" ? "auto" : "custom"}
                      onChange={(event) =>
                        set(
                          "tempo",
                          event.target.value === "auto" ? "auto" : level.tempo,
                        )
                      }
                    >
                      <option value="auto">♩ = {level.tempo} (level)</option>
                      <option value="custom">Custom</option>
                    </select>
                    {options.tempo !== "auto" && (
                      <DraftNumber
                        aria-label="Exercise tempo"
                        min={30}
                        max={200}
                        value={options.tempo}
                        onCommit={(value) => set("tempo", value)}
                      />
                    )}
                  </span>
                </label>
              </div>
            </details>
            <div
              className="exercise-settings-summary"
              aria-label="Starting settings"
              aria-live="polite"
            >
              <strong>This exercise</strong>
              <span>
                {handsWord(config.hands)} · {config.bars} bars
              </span>
              <span>
                {keyName(config.fifths)} · {config.meter} · ♩ = {config.tempo}
              </span>
              {!customMusic && (
                <small>Auto selects from this level’s keys and meters.</small>
              )}
            </div>
            {hasOverrides && (
              <button
                type="button"
                className="exercise-reset"
                onClick={() =>
                  onChange({
                    ...options,
                    ...EXERCISE_DEFAULTS,
                    level: level.level,
                  })
                }
              >
                <RotateCcw size={12} aria-hidden="true" />
                Use level defaults
              </button>
            )}
            <button type="submit" className="primary exercise-start">
              <Dices size={16} aria-hidden="true" />
              Start exercise
            </button>
          </form>
          <details className="exercise-guide">
            <summary>
              <span>
                <BookOpen size={13} aria-hidden="true" />
                Level guide
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <ol>
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ol>
          </details>
        </aside>
        <div className="exercise-curriculum" aria-label="Exercise levels">
          {STAGES.map((stage) => (
            <section
              className="exercise-stage"
              key={stage.title}
              aria-label={stage.title}
            >
              <h2>
                <span>{stage.title}</span>
                <small>{stage.range}</small>
              </h2>
              <ol className="exercise-level-grid" start={stage.levels[0].level}>
                {stage.levels.map((entry) => {
                  const result = levelStats(history, entry.level);
                  const cleared = levelAdvice(history, entry.level).ready;
                  const selected = level.level === entry.level;
                  const isRecommended = entry.level === recommended;
                  return (
                    <li key={entry.level}>
                      <button
                        type="button"
                        className="exercise-level"
                        aria-pressed={selected}
                        aria-label={`Level ${entry.level}: ${entry.title}, ${handsWord(entry.hands)}${result ? `, best ${result.best}%` : ""}${isRecommended ? ", recommended" : ""}${cleared ? ", cleared" : ""}`}
                        title="Double-click to start"
                        onClick={() => set("level", entry.level)}
                        onDoubleClick={() =>
                          onStart(
                            {
                              ...options,
                              level: entry.level,
                              seed,
                            },
                            { fresh: true },
                          )
                        }
                      >
                        <span
                          className="exercise-level-number"
                          aria-hidden="true"
                        >
                          {String(entry.level).padStart(2, "0")}
                        </span>
                        <span className="exercise-level-copy">
                          <strong>{entry.title}</strong>
                          <small>
                            {handsWord(entry.hands)} · {entry.bars} bars
                          </small>
                          {(isRecommended || cleared || result) && (
                            <span className="exercise-level-status">
                              {isRecommended ? (
                                "Recommended"
                              ) : cleared ? (
                                <>
                                  <Check size={10} aria-hidden="true" />
                                  Cleared
                                </>
                              ) : (
                                `Best ${result.best}%`
                              )}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
