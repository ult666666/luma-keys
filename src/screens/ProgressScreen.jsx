import {
  ArrowRight,
  Flame,
  Target,
  Trophy,
  TrendingUp,
  Timer,
} from "lucide-react";
import { LEVELS } from "../exercise.mjs";
import { levelAdvice } from "../performance.mjs";
import { levelStats } from "./ExercisesScreen.jsx";
import { relativeDay } from "./LibraryScreen.jsx";

const localDay = (value) => new Date(value).toLocaleDateString("en-CA");
export function practiceStreak(history, now = new Date()) {
  const days = new Set(history.map((h) => localDay(h.at)));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Accuracy of the last runs as bars, with the on-time share as a line.
function TrendChart({ runs }) {
  const width = 640,
    height = 170,
    left = 34,
    right = 8,
    top = 12,
    bottom = 26;
  const plotW = width - left - right,
    plotH = height - top - bottom;
  const y = (v) => top + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const step = plotW / Math.max(1, runs.length);
  const barW = Math.max(4, Math.min(22, step * 0.62));
  const points = runs
    .map((r, i) => `${left + step * i + step / 2},${y(r.timing)}`)
    .join(" ");
  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Accuracy and timing of the last ${runs.length} graded runs`}
    >
      {[50, 75, 90, 100].map((v) => (
        <g key={v}>
          <line
            x1={left}
            x2={width - right}
            y1={y(v)}
            y2={y(v)}
            className={v === 90 ? "grid target" : "grid"}
          />
          <text x={left - 6} y={y(v) + 3} className="axis">
            {v}
          </text>
        </g>
      ))}
      {runs.map((r, i) => (
        <rect
          key={r.at + i}
          x={left + step * i + (step - barW) / 2}
          y={y(r.accuracy)}
          width={barW}
          height={Math.max(1, top + plotH - y(r.accuracy))}
          className={`bar${r.accuracy >= 90 ? " clean" : r.accuracy >= 75 ? " shaky" : " trouble"}`}
        >
          <title>
            {`${r.title} · ${Math.round(r.accuracy)}% right · ${Math.round(r.timing)}% on time · ♩ = ${r.tempo}`}
          </title>
        </rect>
      ))}
      {runs.length > 1 && <polyline className="line" points={points} />}
      {runs.map((r, i) => (
        <circle
          key={"c" + r.at + i}
          cx={left + step * i + step / 2}
          cy={y(r.timing)}
          r={2.5}
          className="dot"
        />
      ))}
      <text x={left} y={height - 8} className="axis">
        oldest
      </text>
      <text x={width - right} y={height - 8} className="axis end">
        latest
      </text>
    </svg>
  );
}

export default function ProgressScreen({
  history,
  stats,
  recommended,
  onOpenRun,
}) {
  const graded = history.filter((h) => h.mode === "perform");
  const today = graded.filter((h) => localDay(h.at) === localDay(Date.now()));
  const recent = graded.slice(-10);
  const average = recent.length
    ? Math.round(recent.reduce((s, h) => s + h.accuracy, 0) / recent.length)
    : null;
  const streak = practiceStreak(history);
  return (
    <section className="screen progress-screen" aria-label="Progress">
      <header className="screen-header">
        <div>
          <h1>Progress</h1>
          <p>
            Every Play in time run is graded and kept here. Aim for three clean
            runs at a level before moving up.
          </p>
        </div>
      </header>
      <div className="progress-stats stat-tiles">
        <div>
          <Flame size={15} />
          <strong>{streak}</strong>
          <span>day streak</span>
        </div>
        <div>
          <Timer size={15} />
          <strong>{today.length}</strong>
          <span>runs today</span>
        </div>
        <div>
          <Target size={15} />
          <strong>{average == null ? "—" : `${average}%`}</strong>
          <span>last 10 runs</span>
        </div>
        <div>
          <Trophy size={15} />
          <strong>{graded.length}</strong>
          <span>graded runs</span>
        </div>
        <div>
          <TrendingUp size={15} />
          <strong>{recommended}</strong>
          <span>level next</span>
        </div>
      </div>
      {graded.length ? (
        <>
          <div className="progress-panel-card">
            <div className="panel-heading">
              <h2 className="section-title">
                Last {Math.min(30, graded.length)} runs
              </h2>
              <span className="legend">
                <i className="swatch bar" /> notes right
                <i className="swatch line" /> on time
              </span>
            </div>
            <TrendChart runs={graded.slice(-30)} />
          </div>
          <div className="progress-columns">
            <div className="progress-panel-card">
              <h2 className="section-title">Levels</h2>
              <table className="level-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Runs</th>
                    <th>Best</th>
                    <th>Recent</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((level) => {
                    const s = levelStats(history, level.level);
                    const cleared = levelAdvice(history, level.level).ready;
                    return (
                      <tr
                        key={level.level}
                        className={
                          level.level === recommended ? "recommended" : ""
                        }
                      >
                        <td>
                          <b>{level.level}</b> {level.title}
                        </td>
                        <td>{s ? s.runs : "—"}</td>
                        <td>{s ? `${s.best}%` : "—"}</td>
                        <td>{s ? `${s.recent}%` : "—"}</td>
                        <td>
                          {cleared
                            ? "Cleared"
                            : level.level === recommended
                              ? "Recommended"
                              : s
                                ? "In progress"
                                : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="progress-panel-card">
              <h2 className="section-title">Recent runs</h2>
              <ul className="run-list">
                {graded
                  .slice(-20)
                  .reverse()
                  .map((h, i) => (
                    <li key={h.at + i}>
                      <div className="run-main">
                        <strong>{h.title}</strong>
                        <span>
                          {relativeDay(h.at)}
                          {h.level ? ` · level ${h.level}` : ""} · ♩ = {h.tempo}
                          {h.complete ? "" : " · stopped early"}
                        </span>
                      </div>
                      <div className="run-score">
                        <b
                          className={
                            h.accuracy >= 90
                              ? "clean"
                              : h.accuracy >= 75
                                ? "shaky"
                                : "trouble"
                          }
                        >
                          {Math.round(h.accuracy)}%
                        </b>
                        <small>{Math.round(h.timing)}% on time</small>
                      </div>
                      {(h.exercise || h.scoreId) && (
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => onOpenRun(h)}
                          title={
                            h.exercise
                              ? "Read this exact exercise again"
                              : "Open this piece"
                          }
                        >
                          Open <ArrowRight size={12} />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state static">
          <span>
            <Timer size={22} />
          </span>
          <strong>No graded runs yet.</strong>
          <small>
            Choose Play in time on the Practice screen, press Play, and read
            along with the count-in. Your first report card will land here.
          </small>
        </div>
      )}
      <p className="progress-footnote">
        {Math.floor(stats.minutes || 0)} minutes of practice recorded ·{" "}
        {stats.correct} correct notes in Wait for me and Play in time.
      </p>
    </section>
  );
}
