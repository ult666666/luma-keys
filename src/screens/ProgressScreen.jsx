import {
  AlertCircle,
  ArrowRight,
  Clock3,
  Flame,
  Music2,
  Target,
  Trophy,
  TrendingUp,
  Timer,
  ChevronDown,
  Check,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LEVELS } from "../exercise.mjs";
import { levelAdvice } from "../performance.mjs";
import {
  dayKey,
  formatMinutes,
  practiceStreak,
  recentDays,
  totalMinutes,
} from "../journal.mjs";
import { levelStats } from "./ExercisesScreen.jsx";
import { relativeDay } from "./LibraryScreen.jsx";
import { CoverageBar, PieceOutline, SpotMarks } from "../PieceMap.jsx";
import {
  clearedBars,
  describeSpot,
  spotBars,
  spotLabel,
  troubleSpots,
} from "../trouble-spots.mjs";
import { Ring, WeekDots, weekOf } from "./ui.jsx";
import ScoreArtwork from "./ScoreArtwork.jsx";
import { pieceProgressSummary } from "../progress-summary.mjs";
import { practiceEntries } from "../library-selectors.mjs";

const localDay = (value) => new Date(value).toLocaleDateString("en-CA");
const WEEKS_KEY = "luma.progress.weeks";
const readLocal = (key) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const writeLocal = (key, value) => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* private window: the toggle still works for this visit */
  }
};
const WEEKDAY = (date) =>
  date.toLocaleDateString(undefined, { weekday: "narrow" });

// The chart's drawing width follows its box, so axis text stays at 10 px.
function useBoxWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) >= 1 ? w : prev));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Accuracy of the last runs as bars, with the on-time share as a line.
// With fewer than three runs, dashed ghost bars hold the empty places.
function TrendChart({ runs }) {
  const [box, measured] = useBoxWidth();
  const width = Math.max(240, measured),
    height = 160,
    left = 30,
    right = 8,
    top = 12,
    bottom = 24;
  const plotW = width - left - right,
    plotH = height - top - bottom;
  const y = (v) => top + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const slots = Math.max(3, runs.length);
  const ghosts = slots - runs.length;
  const step = plotW / slots;
  const barW = Math.max(4, Math.min(22, step * 0.62));
  const points = runs
    .map((r, i) => `${left + step * i + step / 2},${y(r.timing)}`)
    .join(" ");
  return (
    <div className="trend-chart-box" ref={box}>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Accuracy and timing of the last ${runs.length} graded run${runs.length === 1 ? "" : "s"}`}
      >
        {/* 0 is the floor the bars stand on (no label). */}
        {[0, 50, 75, 90, 100].map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={width - right}
              y1={y(v)}
              y2={y(v)}
              className={v === 90 ? "grid target" : "grid"}
            />
            {v > 0 && v < 100 && (
              <text x={left - 6} y={y(v) + 3} className="axis">
                {v}
              </text>
            )}
          </g>
        ))}
        {runs.map((r, i) => {
          // A short bar keeps square-ish corners, not a floating pill.
          const h = Math.max(1, top + plotH - y(r.accuracy));
          return (
            <rect
              key={r.at + i}
              x={left + step * i + (step - barW) / 2}
              y={top + plotH - h}
              width={barW}
              height={h}
              rx={Math.min(4, barW / 3, h / 2)}
              className={`bar${r.accuracy >= 90 ? " clean" : r.accuracy >= 75 ? " shaky" : " trouble"}`}
            >
              <title>
                {`${r.title} · ${Math.round(r.accuracy)}% right · ${Math.round(r.timing)}% on time · ♩ = ${r.tempo}`}
              </title>
            </rect>
          );
        })}
        {Array.from({ length: ghosts }, (_, g) => {
          const i = runs.length + g;
          return (
            <rect
              key={"ghost" + i}
              x={left + step * i + (step - barW) / 2}
              y={y(35)}
              width={barW}
              height={top + plotH - y(35)}
              rx={Math.min(4, barW / 3)}
              className="bar ghost"
            />
          );
        })}
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
        <text x={left} y={height - 8} className="axis start">
          oldest
        </text>
        <text x={width - right} y={height - 8} className="axis end">
          latest
        </text>
      </svg>
      {ghosts > 0 && (
        <p className="trend-ghost-note">
          <strong>
            {runs.length < 2
              ? "Your next graded run draws the first line."
              : "One more graded run fills the chart."}
          </strong>{" "}
          Choose Play in time in Practice.
        </p>
      )}
    </div>
  );
}

// Minutes a day for the last two weeks, with the daily goal as a line.
function DaysChart({ days, goal }) {
  const most = Math.max(goal, ...days.map((d) => d.minutes), 1);
  const today = dayKey(new Date());
  const met = days.filter((d) => d.minutes >= goal).length;
  const tip = (d) =>
    `${d.date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · ${d.minutes > 0 ? formatMinutes(d.minutes) : "no practice"}`;
  return (
    <div
      className="journal-days"
      role="img"
      aria-label={`Practice minutes, last ${days.length} days. Daily goal: ${goal} minutes, met on ${met} day${met === 1 ? "" : "s"}. ${days.map(tip).join("; ")}.`}
      style={{
        "--goal-share": (goal / most).toFixed(4),
        "--days": days.length,
      }}
    >
      <div className="jd-plot">
        <i className="jd-goal" aria-hidden="true">
          <small>{goal} min</small>
        </i>
        {days.map((d, i) => {
          const share = Math.min(1, d.minutes / most);
          const hasBar = d.minutes >= 0.5;
          return (
            <span
              key={d.day}
              className={`jd-col${d.day === today ? " today" : ""}${d.minutes >= goal ? " met" : ""}`}
              title={tip(d)}
              style={{ "--i": i, "--h": hasBar ? share.toFixed(4) : 0 }}
            >
              {hasBar ? <i className="jd-bar" /> : <i className="jd-dot" />}
              <span className="jd-value" aria-hidden="true">
                {hasBar ? Math.round(d.minutes) : ""}
              </span>
            </span>
          );
        })}
      </div>
      <div className="jd-labels" aria-hidden="true">
        {days.map((d) => (
          <small key={d.day} className={d.day === today ? "today" : undefined}>
            {WEEKDAY(d.date)}
          </small>
        ))}
      </div>
    </div>
  );
}

// A calendar of the last weeks: one square a day, brighter for more practice.
function Heatmap({ journal, weeks = 12, goal, stamp = false, onToggle }) {
  const now = new Date();
  // Columns are weeks (Monday first), the last one holding today.
  const end = new Date(now);
  end.setHours(12, 0, 0, 0);
  const weekday = (end.getDay() + 6) % 7;
  const days = recentDays(journal, weeks * 7 - (6 - weekday), now);
  const cells = [...days, ...Array.from({ length: 6 - weekday }, () => null)];
  // Under half a minute counts as no practice, as in the chart and week dots.
  const level = (m) =>
    m < 0.5 ? 0 : m < goal * 0.25 ? 1 : m < goal * 0.6 ? 2 : m < goal ? 3 : 4;
  // A month's name over the week it begins in, with room to be read.
  const months = [];
  for (let w = 0; w < weeks; w++) {
    const first = cells[w * 7];
    if (!first || (w > 0 && first.date.getDate() > 7)) continue;
    if (months.length && w - months.at(-1).w < 3) months.pop();
    months.push({
      w,
      label: first.date.toLocaleDateString(undefined, { month: "short" }),
    });
  }
  const todayKey = dayKey(now);
  const practisedDays = days.filter((d) => d.minutes >= 0.5).length;
  return (
    <div className="journal-heat" style={{ "--weeks": weeks }}>
      <div className="jh-months" aria-hidden="true">
        {months.map((m) => (
          <span key={m.w} style={{ gridColumn: m.w + 1 }}>
            {m.label}
          </span>
        ))}
      </div>
      <div
        className="jh-grid"
        role="img"
        aria-label={`Practice calendar, last ${weeks} weeks: ${practisedDays} day${practisedDays === 1 ? "" : "s"} with practice`}
      >
        {cells.map((d, i) =>
          d ? (
            <i
              key={d.day}
              className={`lv${level(d.minutes)}${d.minutes >= goal ? " met" : ""}${d.day === todayKey ? " today" : ""}${d.day === todayKey && stamp ? " stamp" : ""}`}
              title={`${d.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.minutes >= 0.5 ? formatMinutes(d.minutes) : "no practice"}${d.minutes >= goal ? " · goal met" : ""}`}
            />
          ) : (
            <i key={"f" + i} className="future" />
          ),
        )}
      </div>
      <div className="jh-foot">
        <button
          type="button"
          className="jh-toggle"
          aria-pressed={weeks > 12}
          onClick={onToggle}
        >
          {weeks > 12 ? "Show 12 weeks" : "Show 6 months"}
        </button>
        <span className="jh-legend" aria-hidden="true">
          Less <i className="lv0" />
          <i className="lv1" />
          <i className="lv2" />
          <i className="lv3" />
          <i className="lv4 met" /> Goal
        </span>
      </div>
    </div>
  );
}

export default function ProgressScreen({
  history,
  stats,
  journal,
  goal,
  pieces,
  recommended,
  onOpenRun,
  onOpenPiece,
  onOpenPassage,
  onBrowseLibrary,
  onBrowseExercises,
}) {
  const graded = history.filter((h) => h.mode === "perform");
  const today = graded.filter((h) => localDay(h.at) === localDay(Date.now()));
  const recent = graded.slice(-10);
  const average = recent.length
    ? Math.round(recent.reduce((s, h) => s + h.accuracy, 0) / recent.length)
    : null;
  const streak = practiceStreak(journal, history);
  const todayMinutes = journal.days[dayKey(new Date())]?.minutes || 0;
  // "This week" is Monday to today, the same days the week dots show.
  const week = weekOf(journal).filter((d) => !d.future);
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const weekDays = week.filter((d) => d.minutes >= 0.5).length;
  const total = Math.max(totalMinutes(journal), stats.minutes || 0);
  const goalMet = todayMinutes >= goal;
  const firstDay = Object.entries(journal.days)
    .filter(([, d]) => d.minutes > 0)
    .map(([day]) => day)
    .sort()[0];
  const since = firstDay
    ? new Date(`${firstDay}T12:00:00`).toLocaleDateString(
        undefined,
        new Date(`${firstDay}T12:00:00`).getFullYear() ===
          new Date().getFullYear()
          ? { month: "long" }
          : { month: "long", year: "numeric" },
      )
    : null;
  const [showRuns, setShowRuns] = useState(5);
  const [activity, setActivity] = useState("days");
  const [weeks, setWeeks] = useState(() =>
    readLocal(WEEKS_KEY) === "26" ? 26 : 12,
  );
  const toggleWeeks = () =>
    setWeeks((w) => {
      const next = w > 12 ? 12 : 26;
      writeLocal(WEEKS_KEY, String(next));
      return next;
    });
  // The first time today's goal is met, today's square is stamped, once.
  const [stamp, setStamp] = useState(false);
  useEffect(() => {
    if (!goalMet) return;
    const key = `luma.progress.stamped.${dayKey(new Date())}`;
    if (readLocal(key)) return;
    writeLocal(key, "1");
    setStamp(true);
  }, [goalMet]);
  const practised = practiceEntries(journal, pieces);
  const availableCount = practised.filter(
    ({ kind }) => kind === "piece",
  ).length;
  const removedCount = practised.filter(
    ({ kind }) => kind === "removed",
  ).length;
  return (
    <section
      className="screen progress-screen progress-cute"
      aria-label="Progress"
    >
      <header className="screen-header progress-header">
        <div className="studio-heading">
          <h1>Progress</h1>
          <p>
            {formatMinutes(total)} recorded{since ? ` · since ${since}` : ""}
          </p>
        </div>
        {streak > 0 && (
          <span
            className="progress-streak"
            aria-label={`${streak} day${streak === 1 ? "" : "s"} in a row`}
          >
            <Flame size={17} aria-hidden="true" />
            <strong>{streak}</strong> day{streak === 1 ? "" : "s"} in a row
          </span>
        )}
      </header>
      <div className={`progress-today${goalMet ? " goal-met" : ""}`}>
        <div className="progress-today-goal">
          <Ring
            value={todayMinutes / goal}
            size={84}
            stroke={6}
            className={goalMet ? "gilt" : ""}
            label={`${Math.round(todayMinutes * 10) / 10} of ${goal} minutes today`}
          >
            <b>{Math.floor(todayMinutes)}</b>
            <small>/ {goal} min</small>
          </Ring>
          <div className="progress-today-copy">
            <span>Today</span>
            <h2>
              {goalMet ? (
                <>
                  <Check size={17} aria-hidden="true" /> Goal reached
                </>
              ) : (
                `${Math.ceil(goal - todayMinutes)} min to your goal`
              )}
            </h2>
            <small>Practice time recorded · daily goal {goal} min</small>
          </div>
        </div>
        <div className="progress-week">
          <span>
            This week <b>{formatMinutes(weekMinutes)}</b>
          </span>
          <WeekDots journal={journal} goal={goal} />
          <small>
            {weekDays} day{weekDays === 1 ? "" : "s"} practised
          </small>
        </div>
      </div>
      <div className="progress-pieces pieces-card">
        <div className="panel-heading">
          <h2 className="section-title">Practice history</h2>
          {practised.length > 0 && (
            <span className="progress-piece-count">
              {availableCount} in Library
              {removedCount > 0 ? ` · ${removedCount} removed` : ""}
              {practised.some(({ kind }) => kind === "exercises")
                ? " · exercise history"
                : ""}
            </span>
          )}
        </div>
        <p className="progress-record-note">
          Visited bars include listening and practice. A saved place records
          where to resume; neither measures accuracy.
        </p>
        {practised.length ? (
          <ul className="piece-progress">
            {practised.map(({ id, entry, score, kind }, i) => {
              const progress = pieceProgressSummary(entry, score);
              const title =
                kind === "exercises"
                  ? "Generated exercises"
                  : score?.title || entry.title || "Removed piece";
              const spots = score
                ? troubleSpots(entry.spots, { measures: score.measures })
                : [];
              const cleared = clearedBars(entry.spots);
              return (
                <li key={id} style={{ "--i": i }}>
                  <ScoreArtwork
                    piece={score || { title }}
                    className="progress-piece-art"
                  />
                  <div className="piece-progress-title">
                    <strong title={title}>{title}</strong>
                    <span>
                      {formatMinutes(entry.minutes)} recorded · {entry.sessions}{" "}
                      session
                      {entry.sessions === 1 ? "" : "s"} ·{" "}
                      {relativeDay(entry.last)}
                    </span>
                    {score ? (
                      <div className="progress-piece-coverage">
                        <CoverageBar
                          score={score}
                          ranges={progress.ranges}
                          bar={progress.resumeBar}
                        />
                        <small>
                          {progress.coveredBars} of {score.measures} bars
                          visited · saved at bar {progress.resumeBar}
                        </small>
                      </div>
                    ) : (
                      <small className="progress-removed">
                        {kind === "exercises"
                          ? "Combined time across generated studies. Choose a level to start a new one."
                          : `${progress.coveredBars} bars visited · no longer in Library`}
                      </small>
                    )}
                    {score && (spots.length > 0 || cleared > 0) && (
                      <div
                        className="progress-piece-spots"
                        role="group"
                        aria-label={`Trouble spots in ${title}`}
                      >
                        <AlertCircle size={12} aria-hidden="true" />
                        <span>
                          {spots.length
                            ? "Trouble spots"
                            : "Trouble spots cleared"}
                        </span>
                        {spots.map((spot) => (
                          <button
                            key={`${spot.first}-${spot.last}`}
                            type="button"
                            title={`Open repeating ${spotLabel(spot)} at 70% or slower · ${describeSpot(spot)}`}
                            aria-label={`Drill ${spotLabel(spot)} of ${title}, ${describeSpot(spot)}`}
                            onClick={() =>
                              onOpenPassage?.(score, spot.first, spot.last, {
                                drill: true,
                              })
                            }
                          >
                            {spot.first === spot.last
                              ? spot.first
                              : `${spot.first}–${spot.last}`}
                          </button>
                        ))}
                        {cleared > 0 && (
                          <small>
                            {cleared} bar{cleared === 1 ? "" : "s"} cleared
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                  {score && (
                    <div className="progress-piece-actions">
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => onOpenPiece(score, progress.resumeBar)}
                        aria-label={`Continue ${title} at bar ${progress.resumeBar}`}
                        title={`Open at bar ${progress.resumeBar}`}
                      >
                        Continue <ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                  {kind === "exercises" && onBrowseExercises && (
                    <div className="progress-piece-actions">
                      <button
                        type="button"
                        className="secondary small"
                        onClick={onBrowseExercises}
                      >
                        Exercises <ArrowRight size={12} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {score && (
                    <details className="progress-piece-detail">
                      <summary>
                        Piece map <ChevronDown size={12} aria-hidden="true" />
                      </summary>
                      <div className="piece-progress-map">
                        <PieceOutline score={score} columns={160} />
                        <SpotMarks
                          score={score}
                          spots={spotBars(entry.spots, score.measures)}
                          className="piece-progress-spots"
                        />
                        <CoverageBar
                          score={score}
                          ranges={progress.ranges}
                          bar={progress.resumeBar}
                        />
                        <small>
                          Filled: bars visited · ring: saved place
                          {spots.length > 0 ? " · warm: trouble spots" : ""}
                        </small>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="panel-empty">
            <Music2 size={20} aria-hidden="true" />
            <div>
              <strong>Make room for a few minutes of music.</strong>
              <span>
                Open a piece to begin. Your time and saved place will appear
                here.
              </span>
            </div>
            {onBrowseLibrary && (
              <button
                type="button"
                className="primary small"
                onClick={onBrowseLibrary}
              >
                Choose a piece <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="progress-panel-card progress-activity">
        <div className="panel-heading">
          <h2 className="section-title">Activity</h2>
          <div
            className="progress-activity-switch"
            role="group"
            aria-label="Activity view"
          >
            <button
              type="button"
              aria-pressed={activity === "days"}
              onClick={() => setActivity("days")}
            >
              Two weeks
            </button>
            <button
              type="button"
              aria-pressed={activity === "calendar"}
              onClick={() => setActivity("calendar")}
            >
              Calendar
            </button>
          </div>
        </div>
        {activity === "days" ? (
          <DaysChart days={recentDays(journal, 14)} goal={goal} />
        ) : (
          <Heatmap
            journal={journal}
            goal={goal}
            weeks={weeks}
            stamp={stamp}
            onToggle={toggleWeeks}
          />
        )}
      </div>
      <details className="progress-graded">
        <summary>
          <span>
            <Target size={17} aria-hidden="true" /> Graded runs{" "}
            <small>{graded.length}</small>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        {graded.length ? (
          <>
            <div className="progress-stats stat-tiles">
              <div>
                <Timer size={15} />
                <strong>{today.length}</strong>
                <span>runs today</span>
              </div>
              <div>
                <Target size={15} />
                <strong>{average == null ? "—" : `${average}%`}</strong>
                <span>note accuracy · last {recent.length}</span>
              </div>
              <div>
                <Trophy size={15} />
                <strong>{graded.length}</strong>
                <span>graded runs</span>
              </div>
              <div>
                <TrendingUp size={15} />
                <strong>{recommended}</strong>
                <span>recommended level</span>
              </div>
            </div>
            <div className="progress-panel-card">
              <div className="panel-heading">
                <h2 className="section-title">
                  Last {Math.min(30, graded.length)} run
                  {Math.min(30, graded.length) === 1 ? "" : "s"}
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
                    .slice(0, showRuns)
                    .map((h, i) => (
                      <li key={h.at + i}>
                        <div className="run-main">
                          <strong>{h.title}</strong>
                          <span>
                            {relativeDay(h.at)}
                            {h.level ? ` · level ${h.level}` : ""} · ♩ ={" "}
                            {h.tempo}
                            {h.complete === false ? " · stopped early" : ""}
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
                            aria-label={`Open ${h.title}${h.exercise ? " exercise" : ""}`}
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
                {Math.min(20, graded.length) > showRuns && (
                  <button
                    type="button"
                    className="secondary small run-more"
                    onClick={() => setShowRuns(20)}
                  >
                    Show {Math.min(20, graded.length) - showRuns} more
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state static compact journal-graded-empty">
            <span>
              <Timer size={20} />
            </span>
            <div>
              <strong>No graded runs yet</strong>
              <small>
                Choose Play in time in Practice to record note accuracy and
                timing.
              </small>
            </div>
          </div>
        )}
      </details>
      <p className="progress-footnote">
        {total >= 0.5 && (
          <span className="journal-total">
            <Clock3 size={13} aria-hidden="true" />
            {formatMinutes(total)} at the piano
            {since ? ` since ${since}` : ""}.
          </span>
        )}{" "}
        {stats.correct} correct notes played in Wait for me and Play in time.
      </p>
    </section>
  );
}
