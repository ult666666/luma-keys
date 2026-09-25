import React, { useState, useEffect, useRef, useMemo } from "react";
import { flushSync } from "react-dom";
import { useRecognition } from "./useRecognition.js";
import { InputNotes } from "./input-notes.mjs";
import { bindMIDIInputs } from "./midi-input.mjs";
import {
  planListenStart,
  listenNoteDuration,
  listenWindowNotes,
} from "./listen-start.mjs";
import {
  practiceGroupAtOrAfter,
  practiceGroupAt,
  stepPracticeBeat,
} from "./practice-reading.mjs";
import {
  Music2,
  Library,
  BookOpen,
  Sparkles,
  Settings2,
  Upload,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Keyboard,
  Headphones,
  Repeat2,
  Check,
  CheckCircle2,
  Download,
  X,
  Search,
  SlidersHorizontal,
  Heart,
  Clock3,
  Target,
  Hand,
  FileMusic,
  FileText,
  LoaderCircle,
  Maximize2,
  Sun,
  Moon,
  ArrowRight,
  Trash2,
  HelpCircle,
  Plus,
  Timer,
  Dices,
  RefreshCw,
  Save,
  Trophy,
  TrendingUp,
} from "lucide-react";
import {
  demos,
  degree,
  solfege,
  noteName,
  keyboardLayout,
  groups,
  PITCHES,
  barStart,
  barEnd,
  measureAt,
  countInLength,
  metronomeEvents,
  countInNumber,
  meterHint,
  usesFlats,
  pulsePattern,
  keyLabel,
} from "./music.mjs";
import { piano } from "./audio.js";
import Pet from "./Pet.jsx";
import PdfPreview from "./PdfPreview.jsx";
import ScoreDisplay from "./ScoreDisplay.jsx";
import ReadingScore from "./ReadingScore.jsx";
import KeyboardGuide from "./KeyboardGuide.jsx";
import {
  generateExercise,
  LEVELS,
  EXERCISE_KEYS,
  METERS,
  BAR_CHOICES,
  exerciseSummary,
  levelFor,
} from "./exercise.mjs";
import { gradePerformance, levelAdvice } from "./performance.mjs";
import { defaultReading, HISTORY_LIMIT } from "./preferences.mjs";
import { readingPrep } from "./reading-prep.mjs";
import { coachingTips, companionLine } from "./coaching.mjs";
import ExercisesScreen from "./screens/ExercisesScreen.jsx";
import LibraryScreen from "./screens/LibraryScreen.jsx";
import ProgressScreen, { practiceStreak } from "./screens/ProgressScreen.jsx";
import "./reader.css";
import "./practice.css";
const LESSONS = demos();
const KEYS = {
  a: 60,
  w: 61,
  s: 62,
  e: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  y: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72,
  o: 73,
  l: 74,
  p: 75,
  ";": 76,
  "'": 77,
};
const fmt = (t) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function resumeListening(notes, from, end, secondsPerBeat) {
  const plan = planListenStart(notes, from, end);
  for (const { note, duration } of plan.continuations)
    piano.play(note.midi, duration * secondsPerBeat * 0.94, note.velocity);
  return plan.index;
}
// Perform mode counts one bar of the meter in force before the starting bar.
// From the beginning, pickups shorten the count-in exactly as Listen does.
function countInPlan(score, from) {
  if (from < 1e-6) {
    const length = countInLength(score);
    return {
      length,
      events: metronomeEvents(score, -length - 1e-6, -1e-6).map((e) => ({
        offset: e.beat + length,
        accent: e.accent,
        count: e.count,
      })),
    };
  }
  let at = 0;
  const events = pulsePattern(score, measureAt(score, from)).map((p, i) => {
    const event = { offset: at, accent: i === 0, count: i + 1 };
    at += p;
    return event;
  });
  return { length: at, events };
}
const snapshotOf = (p) =>
  JSON.stringify({
    theme: p.theme,
    pet: p.pet,
    stats: p.stats,
    volume: p.volume,
    reading: p.reading,
    history: p.history,
  });
export function recommendedLevel(history) {
  let level = 1;
  for (const entry of LEVELS)
    if (levelAdvice(history, entry.level).ready)
      level = Math.min(LEVELS.length, entry.level + 1);
  return level;
}
const verdictFor = (result) =>
  result.accuracy >= 0.95 && result.precision >= 0.7
    ? "Fluent reading"
    : result.accuracy >= 0.9
      ? "Solid reading"
      : result.accuracy >= 0.75
        ? "Getting there"
        : "Slow it down";
const msLabel = (beats, secondsPerBeat) =>
  `${beats > 0 ? "+" : "−"}${Math.round(Math.abs(beats) * secondsPerBeat * 1000)} ms`;
function ResultsModal({
  results,
  score,
  flats,
  pet,
  tips = [],
  onRepeat,
  onAgain,
  onNext,
  onLevelUp,
  close,
}) {
  const { result, entry, reason } = results;
  const percent = Math.round(result.accuracy * 100);
  const secondsPerBeat = 60 / (score.bpm * (entry.tempo / score.bpm));
  const problems = result.bars.filter((b) => b.problems > 0);
  const happy = result.accuracy >= 0.9;
  return (
    <Modal
      eyebrow="REPORT CARD"
      className={`results-dialog${happy ? " celebrate" : ""}`}
      title={`${percent}% · ${verdictFor(result)}`}
      subtitle={`${score.title} · bars ${measureAt(score, results.from)}–${measureAt(score, Math.max(results.from, results.end - 1e-4))} · ♩ = ${entry.tempo}${results.hand === "both" ? "" : ` · ${results.hand} hand`}`}
      close={close}
    >
      <div
        className="results-summary"
        role="group"
        aria-label="Performance summary"
      >
        <div>
          <strong>
            {result.matched}
            <small> / {result.total}</small>
          </strong>
          <span>notes right</span>
        </div>
        <div>
          <strong>{Math.round(result.precision * 100)}%</strong>
          <span>on time</span>
        </div>
        <div>
          <strong>{result.missed}</strong>
          <span>missed</span>
        </div>
        <div>
          <strong>{result.extra}</strong>
          <span>wrong notes</span>
        </div>
        <div>
          <strong>
            {result.matched ? msLabel(result.offset, secondsPerBeat) : "—"}
          </strong>
          <span>
            {result.offset > 0.02
              ? "tends late"
              : result.offset < -0.02
                ? "tends early"
                : "steady"}
          </span>
        </div>
      </div>
      <div className="results-coach">
        <span className="coach-avatar" aria-hidden="true">
          <Pet kind={pet} happy={happy} />
        </span>
        <ul className="results-tips" aria-label="Coaching tips">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
      {reason !== "complete" && (
        <p className="results-note">
          Stopped early: {result.unreached} written note
          {result.unreached === 1 ? " was" : "s were"} not reached. Only the
          notes you passed are graded.
        </p>
      )}
      <div className="results-bars" aria-label="Accuracy by bar">
        {result.bars.map((bar) => (
          <button
            type="button"
            key={bar.bar}
            className={`results-bar ${bar.problems === 0 ? "clean" : bar.problems <= 1 ? "shaky" : "trouble"}`}
            title={`Bar ${bar.bar}: ${bar.on + bar.early + bar.late} of ${bar.total} right, ${bar.missed} missed, ${bar.extra} wrong, ${bar.early} early, ${bar.late} late. Click to repeat this bar.`}
            aria-label={`Bar ${bar.bar}, ${bar.on + bar.early + bar.late} of ${bar.total} right`}
            onClick={() => onRepeat(bar.bar, bar.bar)}
          >
            <span>{bar.bar}</span>
            <i
              style={{
                "--fill": `${bar.total ? ((bar.on + bar.early + bar.late) / bar.total) * 100 : 100}%`,
              }}
            />
          </button>
        ))}
      </div>
      {result.notes.some((n) => n.status === "missed") && (
        <p className="results-missed">
          Missed:{" "}
          {result.notes
            .filter((n) => n.status === "missed")
            .slice(0, 12)
            .map((n) => `${noteName(n.midi, flats)} (bar ${n.bar})`)
            .join(", ")}
          {result.missed > 12 ? "…" : ""}
        </p>
      )}
      <div className="results-actions">
        {result.worst && (
          <button
            className={problems.length ? "primary" : "secondary"}
            onClick={() => onRepeat(result.worst.first, result.worst.last)}
          >
            <Repeat2 size={16} /> Repeat{" "}
            {result.worst.first === result.worst.last
              ? `bar ${result.worst.first}`
              : `bars ${result.worst.first}–${result.worst.last}`}
          </button>
        )}
        <button className="secondary" onClick={onAgain}>
          <RotateCcw size={15} /> Play it again
        </button>
        {score.exercise && (
          <button
            className={result.worst ? "secondary" : "primary"}
            onClick={onNext}
          >
            <Dices size={15} /> Next exercise
          </button>
        )}
        {score.exercise && onLevelUp && (
          <button className="secondary" onClick={onLevelUp}>
            <TrendingUp size={15} /> Try level {score.exercise.level + 1}
          </button>
        )}
      </div>
    </Modal>
  );
}
async function api(url, opts) {
  const r = await fetch("/api" + url, opts);
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not save. Please try again.");
  return d;
}
const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function LogoMark() {
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="30" height="30" rx="9" className="logo-bg" />
      <rect x="8" y="9" width="4" height="14" rx="1.5" className="logo-key" />
      <rect x="14" y="9" width="4" height="14" rx="1.5" className="logo-key" />
      <rect x="20" y="9" width="4" height="14" rx="1.5" className="logo-key" />
      <circle cx="22" cy="8" r="3.2" className="logo-dot" />
    </svg>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
  eyebrow = "",
  className = "",
}) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const fn = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const list = [
          ...ref.current.querySelectorAll(
            'button,input,select,a[href],[tabindex="0"]',
          ),
        ].filter((x) => !x.disabled);
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Review({ score, onSave, close, notify, initialBar = 1 }) {
  const flats = usesFlats(score);
  const [notes, setNotes] = useState(() => score.notes.map((n) => ({ ...n })));
  const pageForBar = (bar, ns) => {
    const index = ns.findIndex((n) => n.beat >= barStart(score, bar) - 1e-6);
    return Math.floor((index < 0 ? Math.max(0, ns.length - 1) : index) / 32);
  };
  const [page, setPage] = useState(() => pageForBar(initialBar, score.notes));
  const [focusBar, setFocusBar] = useState(initialBar);
  const [barInput, setBarInput] = useState(String(initialBar));
  const [tab, setTab] = useState("notes");
  const [saving, setSaving] = useState(false);
  const pages = Math.ceil(notes.length / 32);
  function goToBar(value) {
    const bar = Math.max(
      1,
      Math.min(score.measures, Math.floor(Number(value)) || 1),
    );
    setFocusBar(bar);
    setBarInput(String(bar));
    setPage(pageForBar(bar, notes));
  }
  function edit(id, key, v) {
    setNotes((ns) =>
      ns.map((n) =>
        n.id === id
          ? {
              ...n,
              [key]: v,
              ...(key === "beat" ? { measure: measureAt(score, v) } : {}),
            }
          : n,
      ),
    );
  }
  async function save() {
    if (!notes.length) {
      notify("Keep at least one note in the score.");
      return;
    }
    setSaving(true);
    try {
      const updated = {
        ...score,
        measures: Math.max(
          score.measureStarts?.length || 1,
          ...notes.map((n) => measureAt(score, n.beat + n.duration - 1e-4)),
        ),
        notes: notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi),
        // Reviewing notes must not trim the written rests after the last sound.
        duration: Math.max(
          score.duration,
          ...notes.map((n) => n.beat + n.duration),
        ),
        notationEdited:
          score.notationEdited ||
          JSON.stringify(notes) !== JSON.stringify(score.notes),
        reviewed: true,
      };
      await onSave(updated);
      close();
      notify("Score reviewed. Your practice is ready.");
    } catch (e) {
      notify(e.message);
    }
    setSaving(false);
  }
  return (
    <Modal
      wide
      title="Make the music yours"
      subtitle="Compare with your sheet, listen, and correct any notes before you practice."
      close={close}
    >
      <div className="review-notice">
        <HelpCircle size={18} />
        <div>
          {score.source === "PDF"
            ? "PDF recognition can miss notes, rhythm, clefs, or accidentals. Please check each passage."
            : "Check the pitch, octave, hand, and rhythm of your imported notes."}
          {score.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      </div>
      <div className="tabs">
        <button
          className={tab === "notes" ? "selected" : ""}
          onClick={() => setTab("notes")}
        >
          Recognized notes · {notes.length}
        </button>
        {score.xml && (
          <button
            className={tab === "sheet" ? "selected" : ""}
            onClick={() => setTab("sheet")}
          >
            Sheet music
          </button>
        )}
        {score.originalId && (
          <button
            className={tab === "pdf" ? "selected" : ""}
            onClick={() => setTab("pdf")}
          >
            Original PDF
          </button>
        )}
      </div>
      {tab !== "pdf" && (
        <form
          className="review-jump"
          onSubmit={(e) => {
            e.preventDefault();
            goToBar(barInput);
          }}
        >
          <label htmlFor="review-bar">Review from bar</label>
          <input
            id="review-bar"
            aria-label="Review from bar"
            type="number"
            min="1"
            max={score.measures}
            value={barInput}
            onChange={(e) => setBarInput(e.target.value)}
          />
          <span>of {score.measures}</span>
          <button type="submit" className="secondary">
            Go <ArrowRight size={14} />
          </button>
        </form>
      )}
      {tab === "pdf" ? (
        <PdfPreview id={score.originalId} />
      ) : tab === "sheet" ? (
        <>
          {score.notationEdited && (
            <p className="notation-warning">
              This is the original recognized notation. Your saved note
              corrections are used in playback and the numbered export.
            </p>
          )}
          <ScoreDisplay
            xml={score.xml}
            startBar={focusBar}
            onNavigate={goToBar}
          />
        </>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bar</th>
                  <th>Number</th>
                  <th>Pitch & octave</th>
                  <th>Hand</th>
                  <th>Beat</th>
                  <th>Length</th>
                  <th>Hear</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {notes.slice(page * 32, (page + 1) * 32).map((n) => (
                  <tr key={n.id}>
                    <td>{n.measure}</td>
                    <td className="number-cell">
                      {degree(n.midi, 0, flats)}{" "}
                      <small>{solfege(n.midi, 0, flats)}</small>
                    </td>
                    <td>
                      <select
                        aria-label={`Pitch ${n.id}`}
                        value={n.midi}
                        onChange={(e) => edit(n.id, "midi", +e.target.value)}
                      >
                        {Array.from({ length: 88 }, (_, i) => (
                          <option key={i} value={i + 21}>
                            {noteName(i + 21, flats)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Hand ${n.id}`}
                        value={n.hand}
                        onChange={(e) => edit(n.id, "hand", e.target.value)}
                      >
                        <option value="right">Right</option>
                        <option value="left">Left</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Beat ${n.id}`}
                        type="number"
                        min="0"
                        step="0.25"
                        value={n.beat}
                        onChange={(e) => edit(n.id, "beat", +e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Duration ${n.id}`}
                        type="number"
                        min="0.125"
                        step="0.125"
                        value={n.duration}
                        onChange={(e) =>
                          edit(n.id, "duration", +e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Hear ${noteName(n.midi, flats)}`}
                        onClick={async () => {
                          await piano.init();
                          piano.play(n.midi, 0.6);
                        }}
                      >
                        <Volume2 size={16} />
                      </button>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Remove note ${n.id}`}
                        onClick={() => {
                          setNotes((ns) => ns.filter((x) => x.id !== n.id));
                          setPage((p) =>
                            Math.min(
                              p,
                              Math.max(
                                0,
                                Math.ceil((notes.length - 1) / 32) - 1,
                              ),
                            ),
                          );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="add-note-row">
            <button
              className="secondary"
              onClick={() => {
                const beat = notes.length
                  ? Math.max(...notes.map((n) => n.beat + n.duration))
                  : 0;
                setNotes((ns) => [
                  ...ns,
                  {
                    id: crypto.randomUUID(),
                    midi: 60,
                    beat,
                    duration: 1,
                    hand: "right",
                    measure: measureAt(score, beat),
                    velocity: 0.7,
                  },
                ]);
                setPage(Math.floor(notes.length / 32));
              }}
            >
              <Plus size={14} /> Add a missing note
            </button>
            <span>Change its beat to place it in the right passage.</span>
          </div>
          <div className="pagination">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} /> Previous
            </button>
            <span>
              {page + 1} / {Math.max(1, pages)}
            </span>
            <button
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
      <div className="modal-footer">
        <span>Changes stay on this Mac.</span>
        <button className="primary" disabled={saving} onClick={save}>
          <Check size={17} />
          {saving ? "Saving…" : "Save & mark reviewed"}
        </button>
      </div>
    </Modal>
  );
}
export default function App() {
  const [view, setView] = useState("practice"),
    [score, setScore] = useState(LESSONS[0]),
    [library, setLibrary] = useState([]),
    [libraryIssues, setLibraryIssues] = useState([]),
    [settingsIssues, setSettingsIssues] = useState([]),
    [savingSettings, setSavingSettings] = useState(false),
    [settingsLoading, setSettingsLoading] = useState(true),
    [settingsLoadError, setSettingsLoadError] = useState(""),
    [beat, setBeat] = useState(0),
    [playing, setPlaying] = useState(false),
    [loadingSound, setLoadingSound] = useState(false),
    [mode, setMode] = useState("listen"),
    [hand, setHand] = useState("both"),
    [speed, setSpeed] = useState(0.75),
    [volume, setVolume] = useState(0.65),
    [metronome, setMetronome] = useState(false),
    [countIn, setCountIn] = useState(true),
    [loop, setLoop] = useState(false),
    [loopA, setLoopA] = useState(1),
    [loopB, setLoopB] = useState(4),
    [labels, setLabels] = useState("numbers"),
    [tonic, setTonic] = useState(0),
    [readingView, setReadingView] = useState("numbers"),
    [keyboardCollapsed, setKeyboardCollapsed] = useState(false),
    [pressed, setPressed] = useState(new Set()),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [uploading, setUploading] = useState(false),
    [jobAction, setJobAction] = useState(""),
    [importProgress, setImportProgress] = useState(""),
    [importError, setImportError] = useState(""),
    [midiStatus, setMidiStatus] = useState("Connect keyboard"),
    [query, setQuery] = useState(""),
    [theme, setTheme] = useState("mint"),
    [pet, setPet] = useState("cat"),
    [stats, setStats] = useState({ correct: 0, minutes: 0, sessions: 0 }),
    [sessionHits, setSessionHits] = useState(0),
    [sessionMisses, setSessionMisses] = useState(0),
    [prefLoaded, setPrefLoaded] = useState(false),
    [engineReady, setEngineReady] = useState(null),
    [sustain, setSustain] = useState(false),
    [tonicFollow, setTonicFollow] = useState(false),
    [history, setHistory] = useState([]),
    [exerciseOptions, setExerciseOptions] = useState(
      () => defaultReading().exercise,
    ),
    [results, setResults] = useState(null),
    [performCount, setPerformCount] = useState(0),
    [lastScore, setLastScore] = useState(() => defaultReading().last),
    [libraryLoaded, setLibraryLoaded] = useState(false),
    [coach, setCoach] = useState(true),
    [welcomeSeen, setWelcomeSeen] = useState(false),
    [lastResult, setLastResult] = useState(null);
  const inputRef = useRef(),
    state = useRef({}),
    transport = useRef({
      beat: 0,
      playing: false,
      start: 0,
      origin: 0,
      index: 0,
      tickUntil: -Infinity,
      matched: new Set(),
    }),
    inputNotes = useRef(new InputNotes()),
    computerNotes = useRef(new Map()),
    pedalInputs = useRef(new Set()),
    playRequest = useRef(null),
    midiRef = useRef(),
    midiConnecting = useRef(false),
    toastTimer = useRef(),
    practiceStart = useRef(0),
    lastPreferences = useRef(null),
    preferenceWrites = useRef(Promise.resolve()),
    preferenceTimer = useRef(),
    preferenceState = useRef(),
    reviewImport = useRef(null),
    seenJobs = useRef(new Map()),
    recording = useRef(null),
    resultsTimer = useRef(),
    resultsToken = useRef(),
    restored = useRef(false);
  const recognition = useRecognition(api, (jobs) => {
    let libraryChanged = false;
    for (const job of jobs) {
      const previous = seenJobs.current.get(job.id);
      seenJobs.current.set(job.id, job.status);
      if (job.status === "done" && previous !== "done") libraryChanged = true;
      if (job.id === reviewImport.current && job.status !== "processing") {
        reviewImport.current = null;
        if (job.status === "done") {
          if (modal === "import") void reviewRecognized(job.id);
          else notify("Your PDF is ready. Open imports to review the notes.");
        }
      }
    }
    if (libraryChanged) refreshLibrary().catch((e) => notify(e.message));
  });
  const activeImport = recognition.jobs.find(
    (job) => job.status === "processing",
  );
  const pendingImports = recognition.jobs.filter(
    (job) => !job.dismissed && job.status !== "processing",
  );
  const importing = uploading || !!activeImport;
  const reading = useMemo(
    () => ({
      labels,
      tonic,
      tonicFollow,
      countIn,
      metronome,
      keyboardCollapsed,
      readingView,
      speed,
      mode,
      hand,
      exercise: exerciseOptions,
      last: lastScore,
      coach,
      welcomeSeen,
    }),
    [
      labels,
      tonic,
      tonicFollow,
      countIn,
      metronome,
      keyboardCollapsed,
      readingView,
      speed,
      mode,
      hand,
      exerciseOptions,
      lastScore,
      coach,
      welcomeSeen,
    ],
  );
  const preferenceSnapshot = snapshotOf({
    theme,
    pet,
    stats,
    volume,
    reading,
    history,
  });
  preferenceState.current = {
    ready: prefLoaded,
    snapshot: preferenceSnapshot,
  };
  const notes = useMemo(
    () => score.notes.filter((n) => hand === "both" || n.hand === hand),
    [score, hand],
  );
  const chordGroups = useMemo(() => groups(notes), [notes]);
  const phraseNotes = useMemo(
    () =>
      loop
        ? notes.filter(
            (n) =>
              n.beat >= barStart(score, loopA) - 1e-6 &&
              n.beat < barEnd(score, loopB) - 1e-6,
          )
        : notes,
    [notes, loop, score, loopA, loopB],
  );
  const phraseGroups = useMemo(() => groups(phraseNotes), [phraseNotes]);
  // Wait mode asks for new attacks; Listen also includes notes already held
  // across the selected bar's start, both for sound and keyboard guidance.
  const listenNotes = useMemo(
    () =>
      loop
        ? listenWindowNotes(notes, barStart(score, loopA), barEnd(score, loopB))
        : notes,
    [notes, loop, score, loopA, loopB],
  );
  // Fast passages need a closer preview so successive notes remain distinct.
  // Geometry uses actual duration; a large minimum block would imply a hold
  // through rests and overlap repeated notes on the same key.
  const rollBeats = useMemo(
    () =>
      Math.max(
        1.5,
        Math.min(
          8,
          score.notes.reduce(
            (shortest, n) => Math.min(shortest, n.duration),
            1,
          ) * 12,
        ),
      ),
    [score],
  );
  const layout = useMemo(() => keyboardLayout(21, 108), []);
  const keyMap = useMemo(
    () => new Map(layout.map((k) => [k.midi, k])),
    [layout],
  );
  state.current = {
    score,
    notes,
    chordGroups,
    phraseGroups,
    phraseNotes,
    hand,
    mode,
    speed,
    countIn,
    metronome,
    loop,
    loopA,
    loopB,
    playing,
    beat,
  };
  function notify(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }
  async function refreshLibrary() {
    const result = await api("/library");
    setLibrary(result.scores);
    setLibraryIssues(result.issues);
    return result.scores;
  }
  function savePreferences(snapshot) {
    lastPreferences.current = snapshot;
    const write = preferenceWrites.current
      .catch(() => {})
      .then(async () => {
        const result = await api(
          "/preferences",
          json("PUT", JSON.parse(snapshot)),
        );
        setSettingsIssues([]);
        if (result.recoveryFile)
          notify(
            "Settings saved. Your previous file is kept in Library / Settings recovery.",
          );
      })
      .catch((e) => {
        if (lastPreferences.current === snapshot)
          lastPreferences.current = null;
        notify("Could not save settings: " + e.message);
        throw e;
      });
    preferenceWrites.current = write;
    return write;
  }
  function applySettings({ preferences: p, issues }) {
    // Older servers or backups may lack the reading and history fields.
    p = {
      ...p,
      reading: { ...defaultReading(), ...(p.reading || {}) },
      history: Array.isArray(p.history) ? p.history : [],
    };
    const today = new Date().toLocaleDateString("en-CA");
    const progress = {
      ...p.stats,
      dailyMinutes: p.stats.practiceDate === today ? p.stats.dailyMinutes : 0,
      practiceDate: today,
    };
    // Hydration alone must never replace a damaged or older settings file.
    lastPreferences.current = snapshotOf({
      theme: p.theme,
      pet: p.pet,
      stats: progress,
      volume: p.volume,
      reading: p.reading,
      history: p.history,
    });
    setTheme(p.theme);
    setPet(p.pet);
    setStats(progress);
    setVolume(p.volume);
    piano.setVolume(p.volume);
    setLabels(p.reading.labels);
    setTonic(p.reading.tonic);
    setTonicFollow(p.reading.tonicFollow);
    setCountIn(p.reading.countIn);
    setMetronome(p.reading.metronome);
    setKeyboardCollapsed(p.reading.keyboardCollapsed);
    setReadingView(p.reading.readingView);
    setSpeed(p.reading.speed);
    setMode(p.reading.mode);
    setHand(p.reading.hand);
    setExerciseOptions(p.reading.exercise);
    setLastScore(p.reading.last);
    setCoach(p.reading.coach);
    setWelcomeSeen(p.reading.welcomeSeen);
    setHistory(p.history);
    setSettingsIssues(issues);
    setPrefLoaded(true);
    setSettingsLoadError("");
  }
  async function reloadSettings() {
    stop();
    setSettingsLoading(true);
    try {
      applySettings(await api("/settings"));
    } catch (e) {
      setSettingsLoadError(e.message);
    } finally {
      setSettingsLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    piano.prepare().catch((e) => {
      if (!cancelled) notify(e.message);
    });
    api("/library")
      .then((s) => {
        if (cancelled) return;
        setLibrary(s.scores);
        setLibraryIssues(s.issues);
      })
      .catch((e) => {
        if (!cancelled) notify("Local library unavailable: " + e.message);
      })
      .finally(() => {
        if (!cancelled) setLibraryLoaded(true);
      });
    api("/health")
      .then((h) => {
        if (!cancelled) setEngineReady(h.omr);
      })
      .catch((e) => {
        if (!cancelled) notify("Recognition status unavailable: " + e.message);
      });
    api("/settings")
      .then(({ preferences: p, issues }) => {
        if (cancelled) return;
        applySettings({ preferences: p, issues });
      })
      .catch((e) => {
        if (!cancelled) setSettingsLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
      piano.stop();
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!prefLoaded) return;
    const snapshot = preferenceSnapshot;
    if (snapshot === lastPreferences.current) return;
    preferenceTimer.current = setTimeout(
      () => savePreferences(snapshot).catch(() => {}),
      500,
    );
    return () => clearTimeout(preferenceTimer.current);
  }, [preferenceSnapshot, prefLoaded]);
  useEffect(() => () => clearTimeout(resultsTimer.current), []);
  // Reopen on the last piece or the exact last exercise, once, after both the
  // settings and the library are known.
  useEffect(() => {
    if (!prefLoaded || !libraryLoaded || restored.current) return;
    restored.current = true;
    const last = lastScore;
    if (!last) return;
    try {
      if (last.exercise) choose(generateExercise(last.exercise));
      else if (last.scoreId) {
        const found =
          library.find((x) => x.id === last.scoreId) ||
          LESSONS.find((x) => x.id === last.scoreId);
        if (found && found.id !== LESSONS[0].id) choose(found);
      }
    } catch (e) {
      notify("Could not reopen your last exercise: " + e.message);
    }
  }, [prefLoaded, libraryLoaded]);
  useEffect(() => {
    // Electron awaits this before closing its window or loopback server.
    const flush = async () => {
      if (!preferenceState.current.ready) return;
      flushSync(() => stop());
      clearTimeout(preferenceTimer.current);
      const snapshot = preferenceState.current.snapshot;
      if (snapshot !== lastPreferences.current) await savePreferences(snapshot);
      await preferenceWrites.current;
    };
    window.lumaFlushPreferences = flush;
    // Read-only clock for timing tests: audio time against the transport.
    const clock = () => {
      const t = transport.current;
      return {
        now: piano.ctx?.currentTime ?? null,
        start: t.start,
        origin: t.origin,
        beat: t.beat,
        playing: t.playing,
        countingIn: !!(
          t.countIn &&
          piano.ctx &&
          piano.ctx.currentTime < t.start
        ),
        secondsPerBeat: t.countIn?.secondsPerBeat ?? null,
      };
    };
    window.lumaClock = clock;
    return () => {
      if (window.lumaFlushPreferences === flush)
        delete window.lumaFlushPreferences;
      if (window.lumaClock === clock) delete window.lumaClock;
    };
  }, []);
  function stop({ keepInputs = false } = {}) {
    const t = transport.current;
    t.playing = false;
    t.countIn = null;
    recording.current = null;
    setPerformCount(0);
    setPlaying(false);
    playRequest.current = null;
    setLoadingSound(false);
    if (keepInputs) piano.stopPlayback();
    else {
      piano.stop();
      inputNotes.current.clear();
      computerNotes.current.clear();
      pedalInputs.current.clear();
      setSustain(false);
      setPressed(new Set());
    }
    if (practiceStart.current) {
      const minutes = (Date.now() - practiceStart.current) / 60000;
      setStats((s) => ({
        ...s,
        minutes: s.minutes + minutes,
        dailyMinutes:
          (s.practiceDate === new Date().toLocaleDateString("en-CA")
            ? s.dailyMinutes || 0
            : 0) + minutes,
        practiceDate: new Date().toLocaleDateString("en-CA"),
      }));
      practiceStart.current = 0;
    }
  }
  function seek(to) {
    stop();
    transport.current.beat = to;
    transport.current.matched = new Set();
    setBeat(to);
  }
  function seekReading(to) {
    // Exploring outside a repeat returns to the whole piece. The score, cue
    // and next Play action should all refer to the position the reader chose.
    if (
      loop &&
      (to < barStart(score, loopA) - 1e-6 || to >= barEnd(score, loopB) - 1e-6)
    )
      setLoop(false);
    seek(to);
  }
  function repeatBars(first, last) {
    const a = Math.max(1, Math.min(score.measures, Math.trunc(first) || 1));
    const b = Math.max(a, Math.min(score.measures, Math.trunc(last) || a));
    setLoopA(a);
    setLoopB(b);
    setLoop(true);
    seek(barStart(score, a));
  }
  function clearRepeat() {
    stop();
    setLoop(false);
  }
  function restartReading() {
    seek(loop ? barStart(score, loopA) : 0);
  }
  function choose(s) {
    stop();
    setScore(s);
    setLastResult(null);
    setLastScore(
      s.exercise
        ? {
            scoreId: null,
            exercise: { ...s.exercise.request, seed: s.exercise.seed },
          }
        : { scoreId: s.id ?? null, exercise: null },
    );
    if (tonicFollow) setTonic(s.tonic ?? 0);
    setBeat(0);
    transport.current.beat = 0;
    setLoop(false);
    setLoopA(1);
    setLoopB(Math.min(4, s.measures));
    setSessionHits(0);
    setSessionMisses(0);
    setView("practice");
  }
  async function start() {
    if (settingsLoading) return;
    if (transport.current.playing || playRequest.current) {
      if (recording.current) finishPerformance("stopped");
      else stop();
      return;
    }
    if (!notes.length) {
      notify(
        "There are no notes for this hand. Choose both hands or the other hand.",
      );
      return;
    }
    if (mode !== "listen" && !phraseGroups.length) {
      notify(
        "There are no new notes for this hand in these bars. Widen the loop or choose another hand.",
      );
      return;
    }
    const request = Symbol();
    playRequest.current = request;
    setLoadingSound(true);
    try {
      await piano.init();
      if (
        playRequest.current !== request ||
        document.hidden ||
        handlers.current.modal
      )
        return;
      const {
        score,
        notes,
        phraseGroups,
        mode,
        speed,
        countIn,
        loop,
        loopA,
        loopB,
      } = state.current;
      const t = transport.current;
      let from = t.beat;
      if (from >= score.duration - 1e-6) from = 0;
      if (
        loop &&
        (from < barStart(score, loopA) || from >= barEnd(score, loopB))
      )
        from = barStart(score, loopA);
      let startTime = piano.ctx.currentTime;
      t.countIn = null;
      if (mode === "wait") {
        const next =
          practiceGroupAtOrAfter(phraseGroups, from) || phraseGroups[0];
        from = next.beat;
        t.matched = new Set();
      } else if (mode === "perform") {
        // A performance starts at a bar line, after one bar of count-in.
        const phraseStart = loop ? barStart(score, loopA) : 0;
        const phraseEnd = loop ? barEnd(score, loopB) : score.duration;
        from = Math.max(
          phraseStart,
          barStart(score, measureAt(score, Math.max(from, phraseStart))),
        );
        if (from >= phraseEnd - 1e-6) from = phraseStart;
        const secondsPerBeat = 60 / (score.bpm * speed);
        const plan = countInPlan(score, from);
        const countStart = piano.ctx.currentTime + 0.06;
        for (const event of plan.events)
          piano.tick(
            event.accent,
            countStart + event.offset * secondsPerBeat - piano.ctx.currentTime,
          );
        t.countIn = { start: countStart, plan, secondsPerBeat };
        t.countShown = 0;
        startTime = countStart + plan.length * secondsPerBeat;
        recording.current = {
          from,
          end: phraseEnd,
          secondsPerBeat,
          notes: [],
        };
        setPerformCount(1);
      } else if (countIn && from === 0) from = -countInLength(score);
      t.beat = from;
      t.origin = from;
      t.start = startTime;
      t.playing = true;
      t.index =
        mode === "listen"
          ? resumeListening(
              notes,
              from,
              loop ? barEnd(score, loopB) : score.duration,
              60 / (score.bpm * speed),
            )
          : notes.length;
      t.tickUntil = from - 1e-6;
      setBeat(from);
      setPlaying(true);
      practiceStart.current = Date.now();
      setStats((s) => ({ ...s, sessions: s.sessions + 1 }));
    } catch (e) {
      if (playRequest.current === request) notify(e.message);
    } finally {
      if (playRequest.current === request) {
        playRequest.current = null;
        setLoadingSound(false);
      }
    }
  }
  useEffect(() => {
    let frame,
      last = 0;
    function update() {
      const s = state.current,
        t = transport.current;
      if (t.playing && s.mode === "listen" && piano.ctx) {
        const b =
          t.origin +
          ((piano.ctx.currentTime - t.start) * s.score.bpm * s.speed) / 60;
        t.beat = b;
        const secondsPerBeat = 60 / (s.score.bpm * s.speed);
        const end = s.loop ? barEnd(s.score, s.loopB) : s.score.duration;
        while (
          t.index < s.notes.length &&
          s.notes[t.index].beat <= b + 0.08 / secondsPerBeat
        ) {
          const n = s.notes[t.index++];
          const duration = listenNoteDuration(n, b, end);
          if (n.beat >= b - 0.15 && n.beat < end - 1e-6 && duration > 1e-6)
            piano.play(
              n.midi,
              duration * secondsPerBeat * 0.94,
              n.velocity,
              Math.max(0, (n.beat - b) * secondsPerBeat),
            );
        }
        const tickThrough = Math.min(end - 1e-6, b + 0.08 / secondsPerBeat);
        if (s.metronome || b < 0) {
          // A short look-ahead schedules clicks on the audio clock, including
          // fractional beats. Never burst missed clicks after a stalled frame.
          for (const event of metronomeEvents(
            s.score,
            Math.max(t.tickUntil, b - 0.1 / secondsPerBeat),
            tickThrough,
          )) {
            if (s.metronome || event.beat < 0)
              piano.tick(
                event.accent,
                Math.max(0, (event.beat - b) * secondsPerBeat),
              );
          }
        }
        t.tickUntil = tickThrough;
        if (b >= end) {
          if (s.loop) {
            piano.stopPlayback();
            const from = barStart(s.score, s.loopA);
            t.origin = from;
            t.start = piano.ctx.currentTime;
            t.beat = from;
            t.index = resumeListening(s.notes, from, end, secondsPerBeat);
            t.tickUntil = from - 1e-6;
          } else {
            stop();
            t.beat = s.score.duration;
            setBeat(s.score.duration);
            notify("Beautiful. Every little practice counts.");
          }
        } else if (performance.now() - last > 30) {
          setBeat(b);
          last = performance.now();
        }
      }
      if (t.playing && s.mode === "perform" && piano.ctx && t.countIn) {
        const now = piano.ctx.currentTime;
        const secondsPerBeat = t.countIn.secondsPerBeat;
        const end = s.loop ? barEnd(s.score, s.loopB) : s.score.duration;
        if (now < t.start - 1e-4) {
          const elapsed = (now - t.countIn.start) / secondsPerBeat;
          const count =
            t.countIn.plan.events
              .filter((e) => e.offset <= elapsed + 1e-6)
              .at(-1)?.count || 1;
          if (count !== t.countShown) {
            t.countShown = count;
            setPerformCount(count);
          }
        } else {
          if (t.countShown) {
            t.countShown = 0;
            setPerformCount(0);
          }
          const b = t.origin + (now - t.start) / secondsPerBeat;
          t.beat = b;
          // The click always sounds while performing; no written notes play.
          const tickThrough = Math.min(end - 1e-6, b + 0.08 / secondsPerBeat);
          for (const event of metronomeEvents(
            s.score,
            Math.max(t.tickUntil, b - 0.1 / secondsPerBeat),
            tickThrough,
          ))
            piano.tick(
              event.accent,
              Math.max(0, (event.beat - b) * secondsPerBeat),
            );
          t.tickUntil = Math.max(t.tickUntil, tickThrough);
          // Half a beat of grace lets a slightly late final note be counted.
          if (b >= end + 0.5) handlers.current.finishPerformance("complete");
          else if (performance.now() - last > 30) {
            setBeat(Math.min(b, end));
            last = performance.now();
          }
        }
      }
      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);
  async function noteOn(midi, velocity = 0.75, source = "preview") {
    if (
      settingsLoading ||
      modal ||
      document.hidden ||
      !Number.isInteger(midi) ||
      midi < 21 ||
      midi > 108
    )
      return;
    const entry = inputNotes.current.press(midi, source);
    if (!entry) return;
    try {
      await piano.init();
      if (!inputNotes.current.current(entry)) return;
      entry.voice = piano.play(midi, null, velocity);
      setPressed((p) => new Set(p).add(midi));
      const s = state.current,
        t = transport.current;
      if (t.playing && s.mode === "perform" && recording.current) {
        // Time against the audio clock, not the last animation frame.
        recording.current.notes.push({
          midi,
          beat:
            t.origin +
            (piano.ctx.currentTime - t.start) /
              recording.current.secondsPerBeat,
        });
        return;
      }
      if (t.playing && s.mode === "wait") {
        const group = practiceGroupAt(s.chordGroups, t.beat);
        if (!group) return;
        if (group.notes.some((n) => n.midi === midi)) {
          if (t.matched.has(midi)) return;
          t.matched.add(midi);
          setSessionHits((h) => h + 1);
          setStats((v) => ({ ...v, correct: v.correct + 1 }));
          if (group.notes.every((n) => t.matched.has(n.midi))) {
            const index = s.chordGroups.indexOf(group);
            let next = s.chordGroups[index + 1];
            if (s.loop && (!next || next.beat >= barEnd(s.score, s.loopB)))
              next = s.chordGroups.find(
                (g) =>
                  g.beat >= barStart(s.score, s.loopA) - 1e-6 &&
                  g.beat < barEnd(s.score, s.loopB) - 1e-6,
              );
            t.matched = new Set();
            if (next) {
              t.beat = next.beat;
              setBeat(next.beat);
            } else {
              stop({ keepInputs: true });
              t.beat = s.score.duration;
              setBeat(s.score.duration);
              notify("You played the whole piece. Luma is proud of you.");
            }
          }
        } else setSessionMisses((v) => v + 1);
      }
    } catch (e) {
      if (inputNotes.current.discard(entry)) notify(e.message);
    }
  }
  function noteOff(midi, source = "preview") {
    const entry = inputNotes.current.release(midi, source);
    if (!entry) return;
    piano.release(entry.voice);
    setPressed((p) => {
      const next = new Set(p);
      next.delete(midi);
      return next;
    });
  }
  function updatePedal(down, source) {
    if (down && !modal && !document.hidden) pedalInputs.current.add(source);
    else pedalInputs.current.delete(source);
    const downNow = pedalInputs.current.size > 0;
    piano.sustain(downNow);
    setSustain(downNow);
  }
  function releaseInputSources(prefix = "") {
    for (const source of pedalInputs.current)
      if (source.startsWith(prefix)) pedalInputs.current.delete(source);
    const down = pedalInputs.current.size > 0;
    piano.sustain(down);
    setSustain(down);
    const released = inputNotes.current.releaseSources((source) =>
      source.startsWith(prefix),
    );
    for (const entry of released) piano.release(entry.voice);
    if (!prefix || prefix === "computer:") computerNotes.current.clear();
    setPressed((p) => {
      const next = new Set(p);
      for (const entry of released) next.delete(entry.midi);
      return next;
    });
  }
  function finishPerformance(reason) {
    const rec = recording.current;
    const s = state.current,
      t = transport.current;
    if (!rec) {
      stop();
      return;
    }
    const complete = reason === "complete";
    const stoppedAt = complete ? rec.end : t.beat;
    stop({ keepInputs: complete });
    if (complete) {
      t.beat = rec.end;
      setBeat(rec.end);
    }
    const result = gradePerformance(
      s.phraseNotes.filter((n) => n.beat >= rec.from - 1e-6),
      rec.notes,
      {
        score: s.score,
        start: rec.from,
        end: rec.end,
        stoppedAt,
        secondsPerBeat: rec.secondsPerBeat,
      },
    );
    if (!result.total) {
      if (!complete)
        notify(
          "Stopped before the first note. Play after the count-in to be graded.",
        );
      return;
    }
    const exercise = s.score.exercise;
    const entry = {
      at: new Date().toISOString(),
      title: String(s.score.title).slice(0, 300),
      scoreId: /^[a-zA-Z0-9-]{1,80}$/.test(s.score.id || "")
        ? s.score.id
        : null,
      level: exercise?.level ?? null,
      fifths: exercise?.fifths ?? null,
      seed: exercise?.seed ?? null,
      accuracy: Math.round(result.accuracy * 1000) / 10,
      timing: Math.round(result.precision * 1000) / 10,
      notes: result.total,
      tempo: Math.max(1, Math.round(s.score.bpm * s.speed)),
      mode: "perform",
      complete: complete && result.complete,
      bars: Math.max(
        1,
        measureAt(s.score, Math.max(0, rec.end - 1e-4)) -
          measureAt(s.score, rec.from) +
          1,
      ),
      exercise: exercise ? { ...exercise.request, seed: exercise.seed } : null,
    };
    setHistory((h) => [...h, entry].slice(-HISTORY_LIMIT));
    setStats((v) => ({ ...v, correct: v.correct + result.matched }));
    setLastResult(result);
    const token = Symbol();
    resultsToken.current = token;
    const show = () => {
      if (resultsToken.current !== token) return;
      setResults({
        result,
        entry,
        reason,
        hand: s.hand,
        from: rec.from,
        end: rec.end,
      });
      setModal("results");
    };
    clearTimeout(resultsTimer.current);
    // Let the last note ring for a moment before the card appears.
    if (complete) resultsTimer.current = setTimeout(show, 700);
    else show();
  }
  function openRun(entry) {
    const found =
      library.find((x) => x.id === entry.scoreId) ||
      LESSONS.find((x) => x.id === entry.scoreId);
    if (found) choose(found);
    else if (entry.exercise) startExercise(entry.exercise);
    else notify("That piece is no longer in your library.");
  }
  function startExercise(input) {
    try {
      const generated = generateExercise(input);
      setWelcomeSeen(true);
      choose(generated);
      setReadingView((v) => v);
      setModal(null);
      notify(`New exercise · ${exerciseSummary(generated.exercise)}`);
      return generated;
    } catch (e) {
      notify("Could not make an exercise: " + e.message);
      return null;
    }
  }
  const handlers = useRef();
  handlers.current = {
    noteOn,
    noteOff,
    start,
    stop,
    modal,
    releaseInputSources,
    updatePedal,
    finishPerformance,
    newExercise: () => startExercise({ ...exerciseOptions, seed: undefined }),
  };
  useEffect(() => {
    if (modal) {
      releaseInputSources();
      if (playRequest.current) stop();
    }
  }, [modal]);
  useEffect(() => {
    const down = (e) => {
      if (e.key === "Meta" || e.metaKey) {
        handlers.current.releaseInputSources("computer:");
        return;
      }
      const target = e.target;
      const typing =
        /TEXTAREA|SELECT/.test(target.tagName) ||
        (target.tagName === "INPUT" &&
          !["range", "checkbox", "radio", "button", "submit", "reset"].includes(
            target.type,
          ));
      if (
        handlers.current.modal ||
        typing ||
        target.isContentEditable ||
        e.repeat ||
        e.metaKey ||
        e.ctrlKey
      )
        return;
      if (e.code === "Space") {
        if (target.closest("button, a, input, [role=button]")) return;
        e.preventDefault();
        handlers.current.start();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        handlers.current.newExercise?.();
      } else if (KEYS[e.key.toLowerCase()] !== undefined) {
        e.preventDefault();
        const midi = KEYS[e.key.toLowerCase()];
        const source = "computer:" + (e.code || e.key.toLowerCase());
        computerNotes.current.set(e.code || e.key.toLowerCase(), midi);
        handlers.current.noteOn(midi, 0.75, source);
      }
    };
    const up = (e) => {
      if (e.key === "Meta") {
        handlers.current.releaseInputSources("computer:");
        return;
      }
      const key = e.code || e.key.toLowerCase();
      const midi = computerNotes.current.get(key);
      if (midi !== undefined) {
        computerNotes.current.delete(key);
        handlers.current.noteOff(midi, "computer:" + key);
      }
    };
    const blur = () => {
      handlers.current.releaseInputSources();
      if (playRequest.current) handlers.current.stop();
    };
    const visibility = () => {
      if (document.hidden) handlers.current.stop();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      midiRef.current?.dispose();
      midiRef.current = null;
      inputNotes.current.clear();
      playRequest.current = null;
    };
  }, []);
  async function connectMIDI() {
    if (midiConnecting.current) return;
    midiConnecting.current = true;
    try {
      if (!navigator.requestMIDIAccess)
        throw Error("MIDI needs the desktop app or Chrome.");
      if (midiRef.current) {
        midiRef.current.refresh();
        return;
      }
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiRef.current = bindMIDIInputs(access, {
        noteOn: (...args) => handlers.current.noteOn(...args),
        noteOff: (...args) => handlers.current.noteOff(...args),
        pedal: (...args) => handlers.current.updatePedal(...args),
        disconnect: (prefix) => handlers.current.releaseInputSources(prefix),
        status: (names) =>
          setMidiStatus(names.length ? names.join(", ") : "No keyboard found"),
      });
      notify(
        access.inputs.size
          ? "Keyboard connected. Play a note!"
          : "Plug in a USB MIDI keyboard. It will connect automatically.",
      );
    } catch (e) {
      notify("MIDI: " + e.message);
    } finally {
      midiConnecting.current = false;
    }
  }
  async function reviewRecognized(id) {
    try {
      const job = await api("/jobs/" + id);
      if (!job.scores.length)
        throw Error(
          "This score is no longer in the library. Import the PDF again if you removed it.",
        );
      await refreshLibrary();
      choose(job.scores[0]);
      setModal("review");
      await api("/jobs/" + id + "/dismiss", { method: "POST" });
      await recognition.refresh();
      notify(
        job.scores.length > 1
          ? "All recognized parts are in your library. Review each before practicing."
          : "Your music is ready to review.",
      );
    } catch (e) {
      setImportError(e.message);
      notify(e.message);
    }
  }
  async function importAction(id, action) {
    setJobAction(id);
    setImportError("");
    if (action === "cancel") reviewImport.current = null;
    try {
      await api("/jobs/" + id + "/" + action, { method: "POST" });
      if (action === "retry") reviewImport.current = id;
      await recognition.refresh();
    } catch (e) {
      setImportError(e.message);
    } finally {
      setJobAction("");
    }
  }
  async function importFile(file) {
    if (!file || importing) return;
    stop();
    setModal("import");
    setImportError("");
    setUploading(true);
    setImportProgress("Bringing your music into orbit…");
    try {
      const data = new FormData();
      data.append("score", file);
      const result = await api("/import", { method: "POST", body: data });
      if (result.score) {
        await refreshLibrary();
        choose(result.score);
        setModal("review");
        notify("Your music is ready to review.");
      } else {
        reviewImport.current = result.jobId;
        await recognition.refresh();
      }
    } catch (e) {
      setImportError(e.message);
    } finally {
      setUploading(false);
    }
  }
  async function saveScore(s) {
    if (!library.find((x) => x.id === s.id))
      s = {
        ...s,
        id: crypto.randomUUID(),
        source: s.source === "Exercise" ? "Exercise" : "Edited lesson",
        createdAt: new Date().toISOString(),
      };
    const saved = await api("/scores/" + s.id, json("PUT", s));
    await refreshLibrary();
    setScore(saved.score);
    if (loop) {
      const first = Math.min(loopA, saved.score.measures);
      const last = Math.min(loopB, saved.score.measures);
      setLoopA(first);
      setLoopB(last);
      seek(barStart(saved.score, first));
    } else seek(0);
  }
  async function download() {
    try {
      await api("/export", json("POST", { score, tonic }));
      notify(
        "Saved a printable number sheet and backup to Desktop / Luma Keys / Exports.",
      );
    } catch (e) {
      notify(e.message);
    }
  }
  const playbackStart = loop ? barStart(score, loopA) : 0;
  const playbackEnd = loop ? barEnd(score, loopB) : score.duration;
  const current =
    beat < playbackEnd - 1e-6
      ? practiceGroupAtOrAfter(phraseGroups, Math.max(playbackStart, beat))
      : undefined;
  const heldNotes = useMemo(
    () =>
      mode === "listen" && beat >= playbackStart && beat < playbackEnd
        ? listenNotes.filter(
            (n) => n.beat <= beat && n.beat + n.duration > beat,
          )
        : [],
    [mode, listenNotes, beat, playbackStart, playbackEnd],
  );
  const currentNotes = current?.notes || heldNotes;
  const holding = !current?.notes.length && heldNotes.length > 0;
  const finished = beat >= playbackEnd;
  function stepReading(direction) {
    seek(
      stepPracticeBeat(phraseGroups, beat, direction, {
        start: playbackStart,
        end: playbackEnd,
        loop,
      }),
    );
  }
  const soundEvents = useMemo(
    () => (playing && mode === "listen" ? heldNotes : []),
    [playing, mode, heldNotes],
  );
  const active = useMemo(
    () =>
      new Set(
        playing && mode !== "listen"
          ? currentNotes.map((n) => n.midi)
          : soundEvents.map((n) => n.midi),
      ),
    [playing, mode, soundEvents, currentNotes],
  );
  const flats = usesFlats(score);
  const prep = useMemo(() => readingPrep(score, hand), [score, hand]);
  const currentIndex = current ? phraseGroups.indexOf(current) : -1;
  const upcoming =
    currentIndex >= 0 &&
    phraseGroups[currentIndex + 1] &&
    phraseGroups[currentIndex + 1].beat < playbackEnd - 1e-6
      ? phraseGroups[currentIndex + 1]
      : null;
  const petName = pet === "bunny" ? "Mochi" : "Luma";
  const firstRun = history.length === 0 && !score.exercise;
  const coachText = coach
    ? companionLine({
        name: petName,
        result: lastResult,
        firstRun,
        mode,
        playing,
        streak: practiceStreak(history),
      })
    : null;
  const showWelcome = coach && !welcomeSeen && firstRun;
  const midiConnected =
    midiStatus !== "Connect keyboard" && midiStatus !== "No keyboard found";
  const inLibrary = library.some((x) => x.id === score.id);
  const recommended = useMemo(() => recommendedLevel(history), [history]);
  const sheetPassage = score.measures <= 8 ? score.measures : 4;
  const visibleNotes = (mode === "wait" ? phraseNotes : listenNotes).filter(
    (n) => n.beat + n.duration > beat - 0.25 && n.beat < beat + rollBeats + 1,
  );
  const time = (Math.max(0, beat) * 60) / score.bpm;
  const totalTime = (score.duration * 60) / score.bpm;
  const label = (m) =>
    labels === "letters"
      ? noteName(m, flats)
      : labels === "solfege"
        ? solfege(m, tonic, flats)
        : degree(m, tonic, flats);
  return (
    <div className={`app theme-${theme}`}>
      <main
        className="reader-main app-main"
        inert={modal ? true : undefined}
        aria-hidden={modal ? true : undefined}
      >
        <header className="app-bar">
          <button
            className="app-brand"
            aria-label="Luma Keys"
            onClick={() => setView("practice")}
          >
            <LogoMark />
            <span>
              Luma<b>Keys</b>
            </span>
          </button>
          <nav className="app-nav" aria-label="Main navigation">
            {[
              ["practice", "Practice"],
              ["exercises", "Exercises"],
              ["library", "Library"],
              ["progress", "Progress"],
            ].map(([id, title]) => (
              <button
                key={id}
                className={view === id ? "selected" : ""}
                aria-current={view === id ? "page" : undefined}
                onClick={() => {
                  if (id !== "practice") stop();
                  setView(id);
                }}
              >
                {title}
              </button>
            ))}
          </nav>
          <div className="app-bar-actions">
            <button
              className={`midi-status${midiConnected ? " connected" : ""}`}
              aria-label="Connect piano"
              title={
                midiConnected
                  ? "MIDI keyboard connected"
                  : "Connect a USB MIDI keyboard"
              }
              onClick={connectMIDI}
            >
              <Keyboard size={14} />
              <span>
                {midiStatus === "Connect keyboard"
                  ? "Connect piano"
                  : midiStatus}
                {sustain && " · sustain"}
              </span>
            </button>
            <button
              className="secondary small app-import"
              aria-label="Import a score"
              title="Import a PDF, MusicXML, MIDI or Luma JSON file"
              onClick={() => {
                setImportError("");
                setModal("import");
              }}
            >
              <Upload size={15} />
              <span>Import a score</span>
            </button>
            <button
              className="icon-button"
              aria-label="Reading settings"
              title="Settings"
              onClick={() => {
                stop();
                setModal("settings");
              }}
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>
        {(activeImport || pendingImports.length > 0) && (
          <section
            className="import-notice"
            aria-label="PDF import status"
            role="status"
          >
            {activeImport ? (
              <LoaderCircle size={19} className="spin" />
            ) : (
              <FileMusic size={19} />
            )}
            <div>
              <strong>
                {activeImport
                  ? `Reading ${activeImport.name}`
                  : pendingImports[0].status === "done"
                    ? "Your PDF is ready to review"
                    : "A PDF import needs your attention"}
              </strong>
              <span>
                {activeImport
                  ? activeImport.progress
                  : `${pendingImports.length} saved import${pendingImports.length === 1 ? "" : "s"} · originals kept on your Mac`}
              </span>
            </div>
            <button
              className="secondary small"
              onClick={() => {
                setImportError("");
                setModal("import");
              }}
            >
              View imports <ArrowUpRight size={14} />
            </button>
          </section>
        )}
        {settingsLoading && (
          <p className="settings-loading" role="status">
            Loading your saved settings…
          </p>
        )}
        {settingsLoadError && (
          <section
            className="library-recovery"
            aria-label="Settings unavailable"
            role="status"
          >
            <div>
              <strong>Your settings file could not be opened.</strong>
              <p>
                Your music is available, but changes and progress are temporary.
                Restore access to Desktop / Luma Keys / Library /
                preferences.json, then reload your saved settings.
              </p>
              <details>
                <summary>Show details</summary>
                <p>{settingsLoadError}</p>
              </details>
            </div>
            <button
              className="secondary small"
              disabled={settingsLoading}
              onClick={reloadSettings}
            >
              Reload saved settings
            </button>
          </section>
        )}
        {settingsIssues.length > 0 && (
          <section
            className="library-recovery"
            aria-label="Settings recovery"
            role="status"
          >
            <div>
              <strong>Your saved settings need a little care.</strong>
              <p>
                Luma kept the settings it could read and used defaults for the
                rest. Your original file is untouched; a copy will be kept when
                you save.
              </p>
              <details>
                <summary>Settings using defaults</summary>
                <ul>
                  {settingsIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </details>
            </div>
            <button
              className="secondary small"
              disabled={savingSettings}
              onClick={async () => {
                setSavingSettings(true);
                try {
                  await savePreferences(preferenceSnapshot);
                } catch {
                } finally {
                  setSavingSettings(false);
                }
              }}
            >
              {savingSettings ? "Saving…" : "Save recovered settings"}
            </button>
          </section>
        )}
        {libraryIssues.length > 0 && (
          <section
            className="library-recovery"
            aria-label="Library recovery"
            role="status"
          >
            <div>
              <strong>
                {libraryIssues.length === 1
                  ? "One saved score needs attention."
                  : `${libraryIssues.length} saved scores need attention.`}
              </strong>
              <p>
                You can keep practicing. These files could not be opened and are
                still untouched in Desktop / Luma Keys / Library. Reimport the
                original music or restore a complete backup.
              </p>
              <details>
                <summary>Show affected files</summary>
                <ul>
                  {libraryIssues.map((issue) => (
                    <li key={issue.file}>
                      <b>{issue.file}</b>
                      <span>{issue.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
            <button
              className="secondary small"
              onClick={() => refreshLibrary().catch((e) => notify(e.message))}
            >
              Check library again
            </button>
          </section>
        )}
        {view === "practice" && (
          <section className="practice-screen" aria-label="Practice">
            <header className="piece-header reader-score-heading">
              <div className="piece-info">
                <h1>{score.title}</h1>
                <p>
                  {score.composer} · {score.measures}{" "}
                  {score.measures === 1 ? "bar" : "bars"}
                </p>
                <ul className="prep-chips" aria-label="At a glance">
                  {prep.key && (
                    <li className="chip chip-key" title="Key signature">
                      {prep.key}
                      {prep.signatureText ? ` · ${prep.signatureText}` : ""}
                    </li>
                  )}
                  {prep.signature && (
                    <li className="chip" title="Time signature">
                      {prep.signature}
                    </li>
                  )}
                  <li className="chip" title="Quarter notes per minute">
                    ♩ = {prep.tempo}
                  </li>
                  {prep.hands.right && (
                    <li className="chip chip-right" title="Right-hand range">
                      RH {prep.hands.right.low}–{prep.hands.right.high}
                    </li>
                  )}
                  {prep.hands.left && (
                    <li className="chip chip-left" title="Left-hand range">
                      LH {prep.hands.left.low}–{prep.hands.left.high}
                    </li>
                  )}
                  {prep.watch.map((item) => (
                    <li
                      className="chip chip-watch"
                      key={item}
                      title="Worth a look before you start"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                {score.exercise && (
                  <p className="reader-exercise-line">
                    <span>
                      Exercise #{score.exercise.seed} · level{" "}
                      {score.exercise.level}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        startExercise({
                          ...score.exercise.request,
                          seed: undefined,
                        })
                      }
                    >
                      <RefreshCw size={12} /> Another like this
                    </button>
                    {!inLibrary && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await saveScore(score);
                            notify("Kept in your library.");
                          } catch (e) {
                            notify(e.message);
                          }
                        }}
                      >
                        <Save size={12} /> Keep in library
                      </button>
                    )}
                  </p>
                )}
              </div>
              <div className="piece-actions">
                <div
                  className="reader-tabs view-switch"
                  role="tablist"
                  aria-label="Music view"
                >
                  {[
                    ["numbers", "Number score"],
                    ["sheet", "Sheet music"],
                    ["falling", "Falling notes"],
                  ].map(([id, title]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={readingView === id}
                      tabIndex={readingView === id ? 0 : -1}
                      onKeyDown={(e) => {
                        if (
                          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            e.key,
                          )
                        )
                          return;
                        e.preventDefault();
                        const tabs = ["numbers", "sheet", "falling"];
                        const index =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? 2
                              : (tabs.indexOf(id) +
                                  (e.key === "ArrowRight" ? 1 : 2)) %
                                3;
                        setReadingView(tabs[index]);
                        e.currentTarget.parentElement.children[index].focus();
                      }}
                      onClick={() => setReadingView(id)}
                    >
                      {title}
                    </button>
                  ))}
                </div>
                <div className="piece-buttons">
                  <button
                    className="secondary small"
                    title={`A fresh exercise at level ${exerciseOptions.level} (press N)`}
                    onClick={() =>
                      startExercise({ ...exerciseOptions, seed: undefined })
                    }
                  >
                    <Dices size={15} /> New exercise
                  </button>
                  <button
                    className="icon-button"
                    title="Review sheet and notes"
                    aria-label="Review sheet and notes"
                    onClick={() => {
                      stop();
                      setModal("review");
                    }}
                  >
                    <FileMusic size={18} />
                  </button>
                  <button
                    className="icon-button"
                    title="Export practice notes"
                    aria-label="Export practice notes"
                    onClick={download}
                  >
                    <Download size={18} />
                  </button>
                  <button
                    className="icon-button"
                    title="How to read"
                    aria-label="How to read"
                    onClick={() => {
                      stop();
                      setModal("guide");
                    }}
                  >
                    <HelpCircle size={18} />
                  </button>
                </div>
              </div>
            </header>
            {!score.reviewed && (
              <button
                className="review-banner"
                onClick={() => {
                  stop();
                  setModal("review");
                }}
              >
                <HelpCircle size={14} /> Imported score · check the notes before
                practicing <ArrowRight size={14} />
              </button>
            )}
            {showWelcome && (
              <section className="welcome-card" aria-label="Welcome">
                <span className="coach-avatar large" aria-hidden="true">
                  <Pet kind={pet} happy />
                </span>
                <div>
                  <strong>Hi, I’m {petName}. Let’s read something new.</strong>
                  <span>
                    Level 1 is five notes in the right hand. I’ll count you in,
                    listen, and tell you how it went.
                  </span>
                </div>
                <div className="welcome-actions">
                  <button
                    className="primary small"
                    onClick={() =>
                      startExercise({
                        ...exerciseOptions,
                        level: 1,
                        seed: undefined,
                      })
                    }
                  >
                    <Dices size={14} /> Start Level 1
                  </button>
                  <button
                    className="secondary small"
                    onClick={() => {
                      setImportError("");
                      setModal("import");
                    }}
                  >
                    Import my own sheet
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Dismiss welcome"
                    title="Not now"
                    onClick={() => setWelcomeSeen(true)}
                  >
                    <X size={15} />
                  </button>
                </div>
              </section>
            )}
            {readingView !== "falling" && (
              <div className="score-stage">
                {readingView === "numbers" && (
                  <ReadingScore
                    mode={mode}
                    hand={hand}
                    score={score}
                    notes={notes}
                    beat={beat}
                    tonic={tonic}
                    labels={labels}
                    flats={flats}
                    onSeek={seekReading}
                    loopRange={loop ? { first: loopA, last: loopB } : null}
                    onRepeat={repeatBars}
                    onClearRepeat={clearRepeat}
                  />
                )}
                {readingView === "sheet" &&
                  (score.xml ? (
                    <div className="reader-sheet">
                      {score.notationEdited && (
                        <p className="reader-sheet-warning">
                          The engraved sheet is the original import. Your
                          corrections appear in Number score.
                        </p>
                      )}
                      <ScoreDisplay
                        xml={score.xml}
                        startBar={
                          1 +
                          Math.floor(
                            (Math.min(
                              score.measures,
                              measureAt(score, Math.max(0, beat)),
                            ) -
                              1) /
                              sheetPassage,
                          ) *
                            sheetPassage
                        }
                        passageBars={sheetPassage}
                        transportScore={score}
                        compact
                        beat={beat}
                        onNavigate={(bar) => seekReading(barStart(score, bar))}
                      />
                    </div>
                  ) : (
                    <div className="reader-sheet-empty">
                      <FileMusic size={28} />
                      <h2>No engraved sheet for this piece</h2>
                      <p>
                        Use the number score, or import MusicXML / a PDF for
                        staff notation. Generated exercises always include sheet
                        music.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => setReadingView("numbers")}
                      >
                        Read the numbers
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="reader-controls control-dock">
              <div className="dock-row dock-main">
                <div className="reader-cue dock-cue" aria-label="Next notes">
                  <div className="reader-cue-label">
                    <span>
                      {finished
                        ? "FINISHED"
                        : holding
                          ? "HOLD"
                          : currentNotes.length
                            ? "PLAY NEXT"
                            : "REST"}
                    </span>
                    <small>
                      Bar{" "}
                      {Math.min(
                        score.measures,
                        measureAt(score, Math.max(0, beat)),
                      )}
                    </small>
                  </div>
                  <div className="next-notes">
                    {currentNotes.length ? (
                      currentNotes.map((n) => (
                        <div key={n.id} className={n.hand}>
                          <strong>{label(n.midi)}</strong>
                          <span>
                            {noteName(n.midi, flats)}
                            <small>{n.hand === "left" ? "LH" : "RH"}</small>
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="reader-finished">
                        {finished ? (
                          <>
                            <CheckCircle2 size={20} />{" "}
                            {loop ? "Phrase complete" : "Piece complete"}
                          </>
                        ) : (
                          "Rest — let the music breathe"
                        )}
                      </span>
                    )}
                    {upcoming && currentNotes.length > 0 && (
                      <div className="next-then" aria-label="Then">
                        <small>then</small>
                        {upcoming.notes.map((n) => (
                          <b key={n.id} className={n.hand}>
                            {label(n.midi)}
                            <i>{noteName(n.midi, flats)}</i>
                          </b>
                        ))}
                      </div>
                    )}
                  </div>
                  {coach && !playing && (
                    <span className="coach-avatar" aria-hidden="true">
                      <Pet kind={pet} happy={lastResult?.accuracy >= 0.9} />
                    </span>
                  )}
                  <span className="reader-play-status" role="status">
                    {!playing && coachText
                      ? coachText
                      : playing
                        ? mode === "perform"
                          ? performCount
                            ? "Count in · " + performCount
                            : "Play in time · the click keeps the pulse"
                          : beat < 0
                            ? "Count in · " + countInNumber(score, beat)
                            : mode === "wait"
                              ? "Waiting for your notes"
                              : "Listen and read ahead"
                        : mode === "perform"
                          ? "Play starts a count-in from this bar"
                          : mode === "wait" && sessionHits > 0
                            ? `${sessionHits} notes · ${Math.round((sessionHits / (sessionHits + sessionMisses)) * 100)}% accuracy`
                            : "Click a note to start there"}
                  </span>
                </div>
                <div className="dock-transport">
                  <button
                    className="icon-button"
                    aria-label="Start over"
                    title={loop ? "Start this phrase again" : "Start over"}
                    onClick={restartReading}
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Previous note"
                    title="Previous note"
                    onClick={() => stepReading(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className={`play-button${playing ? " playing" : ""}`}
                    aria-label={playing ? "Pause" : "Play"}
                    title={playing ? "Pause (Space)" : "Play (Space)"}
                    onClick={start}
                    disabled={loadingSound || settingsLoading}
                  >
                    {loadingSound || settingsLoading ? (
                      <LoaderCircle className="spin" size={20} />
                    ) : playing ? (
                      <Pause size={20} fill="currentColor" />
                    ) : (
                      <Play size={20} fill="currentColor" />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next note"
                    title="Next note"
                    onClick={() => stepReading(1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className={`icon-button ${loop ? "on" : ""}`}
                    aria-label="Toggle phrase loop"
                    aria-pressed={loop}
                    title={
                      loop ? "Stop repeating these bars" : "Repeat a phrase"
                    }
                    onClick={() => {
                      if (loop) clearRepeat();
                      else repeatBars(loopA, loopB);
                    }}
                  >
                    <Repeat2 size={19} />
                  </button>
                </div>
                <div
                  className="segmented"
                  role="group"
                  aria-label="Practice mode"
                >
                  <button
                    className={mode === "listen" ? "selected" : ""}
                    title="The piano plays; you read ahead"
                    onClick={() => {
                      restartReading();
                      setMode("listen");
                    }}
                  >
                    <Headphones size={14} /> Listen & follow
                  </button>
                  <button
                    className={mode === "wait" ? "selected" : ""}
                    title="The cursor waits for each correct note"
                    onClick={() => {
                      restartReading();
                      setMode("wait");
                    }}
                  >
                    <Keyboard size={15} /> Wait for me
                  </button>
                  <button
                    className={mode === "perform" ? "selected" : ""}
                    title="Count-in, click, and a report card on pitch and timing"
                    onClick={() => {
                      restartReading();
                      setMode("perform");
                    }}
                  >
                    <Timer size={15} /> Play in time
                  </button>
                </div>
              </div>
              <div className="dock-row dock-timeline">
                <div className="timeline">
                  <input
                    aria-label="Song position"
                    type="range"
                    min="0"
                    max={score.duration}
                    step="any"
                    value={Math.max(0, beat)}
                    onChange={(e) => seekReading(+e.target.value)}
                    style={{
                      "--progress": `${(Math.max(0, beat) / score.duration) * 100}%`,
                    }}
                  />
                  <span>
                    {fmt(time)} <i>/</i> {fmt(totalTime)}
                  </span>
                </div>
                <div className="dock-settings">
                  <select
                    className="dock-select"
                    aria-label="Practice hand"
                    value={hand}
                    onChange={(e) => {
                      restartReading();
                      setHand(e.target.value);
                    }}
                  >
                    <option value="both">Both hands</option>
                    <option value="right">Right hand</option>
                    <option value="left">Left hand</option>
                  </select>
                  <div className="speed-control">
                    <label htmlFor="speed">Practice speed</label>
                    <select
                      id="speed"
                      className="dock-select"
                      value={speed}
                      onChange={(e) => {
                        stop();
                        setSpeed(+e.target.value);
                      }}
                    >
                      {[0.25, 0.5, 0.65, 0.75, 1, 1.25].map((x) => (
                        <option key={x} value={x}>
                          {Math.round(x * 100)}% · ♩ ={" "}
                          {Math.round(score.bpm * x)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="volume">
                    <button
                      className="icon-button"
                      aria-label={volume ? "Mute" : "Unmute"}
                      disabled={settingsLoading}
                      onClick={() => {
                        const v = volume ? 0 : 0.65;
                        setVolume(v);
                        piano.setVolume(v);
                      }}
                    >
                      {volume ? <Volume2 size={17} /> : <VolumeX size={17} />}
                    </button>
                    <input
                      aria-label="Piano volume"
                      disabled={settingsLoading}
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={volume}
                      onChange={(e) => {
                        setVolume(+e.target.value);
                        piano.setVolume(+e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>
              {loop && (
                <div className="dock-row loop-options">
                  <Repeat2 size={14} /> Repeat bars{" "}
                  <input
                    aria-label="Loop start bar"
                    type="number"
                    min="1"
                    max={loopB}
                    value={loopA}
                    onChange={(e) => {
                      repeatBars(Math.min(loopB, +e.target.value), loopB);
                    }}
                  />{" "}
                  to{" "}
                  <input
                    aria-label="Loop end bar"
                    type="number"
                    min={loopA}
                    max={score.measures}
                    value={loopB}
                    onChange={(e) => {
                      repeatBars(loopA, Math.max(loopA, +e.target.value));
                    }}
                  />
                  <span>Next / previous wraps within this phrase.</span>
                </div>
              )}
            </div>
            <KeyboardGuide
              collapsed={keyboardCollapsed}
              onCollapsedChange={setKeyboardCollapsed}
              scoreId={score.id}
              targets={currentNotes}
              active={active}
              soundEvents={soundEvents}
              soundEpoch={transport.current.start}
              pressed={pressed}
              tonic={tonic}
              labels={labels}
              flats={flats}
              onNoteOn={noteOn}
              onNoteOff={noteOff}
              onRelease={releaseInputSources}
              roll={
                readingView === "falling" ? (
                  <div className="roll" data-testid="note-roll">
                    {layout
                      .filter((k) => !k.black)
                      .map((k) => (
                        <div
                          className="lane"
                          key={k.midi}
                          style={{ left: k.left + "%", width: k.width + "%" }}
                        />
                      ))}
                    {Array.from(
                      { length: Math.ceil(rollBeats) + 1 },
                      (_, i) => (
                        <div
                          className="beat-line"
                          key={i}
                          style={{
                            bottom:
                              ((i - (((beat % 1) + 1) % 1)) / rollBeats) * 100 +
                              "%",
                          }}
                        />
                      ),
                    )}
                    {visibleNotes.map((n) => {
                      const k = keyMap.get(n.midi);
                      if (!k) return null;
                      return (
                        <div
                          key={n.id}
                          title={`${noteName(n.midi, flats)} · ${label(n.midi)} · ${n.duration} quarter-note beat${n.duration === 1 ? "" : "s"}`}
                          className={`falling-note ${n.hand} ${n.duration / rollBeats < 0.1 ? "short" : ""} ${n.duration / rollBeats < 0.045 ? "tiny" : ""} ${active.has(n.midi) && n.beat <= beat ? "hitting" : ""}`}
                          style={{
                            left: `calc(${k.left}% + 2px)`,
                            width: `calc(${k.width}% - 4px)`,
                            height: `max(2px, calc(${(n.duration / rollBeats) * 100}% - 2px))`,
                            bottom: ((n.beat - beat) / rollBeats) * 100 + "%",
                          }}
                        >
                          <span>{label(n.midi)}</span>
                          <small>{noteName(n.midi, flats)}</small>
                        </div>
                      );
                    })}
                    <div className="strike-line" />
                    {active.size > 0 && <div className="strike-glow" />}
                  </div>
                ) : null
              }
            />
            <p className="practice-hints">
              <kbd>Space</kbd> play / pause · <kbd>N</kbd> new exercise ·{" "}
              <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd>… play C4
              upward · Shift-click a bar number to repeat a range
            </p>
          </section>
        )}
        {view === "exercises" && (
          <ExercisesScreen
            history={history}
            options={exerciseOptions}
            onChange={setExerciseOptions}
            recommended={recommended}
            onStart={(input) => startExercise(input)}
          />
        )}
        {view === "library" && (
          <LibraryScreen
            library={library}
            lessons={LESSONS}
            history={history}
            query={query}
            onQuery={setQuery}
            currentId={score.id}
            onOpen={choose}
            onImport={() => {
              setImportError("");
              setModal("import");
            }}
            onRemove={async (s) => {
              try {
                await api("/scores/" + s.id, { method: "DELETE" });
                await refreshLibrary();
                notify(
                  "Removed from your library. Original import is kept in the Library folder.",
                );
              } catch (e) {
                notify(e.message);
              }
            }}
          />
        )}
        {view === "progress" && (
          <ProgressScreen
            history={history}
            stats={stats}
            recommended={recommended}
            onOpenRun={openRun}
          />
        )}
      </main>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xml,.musicxml,.mxl,.mid,.midi,.json"
        hidden
        onChange={(e) => {
          importFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Sparkles size={17} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "results" && results && (
        <ResultsModal
          results={results}
          score={score}
          flats={flats}
          pet={pet}
          tips={coachingTips(results.result, {
            secondsPerBeat: 60 / (score.bpm * speed),
            speed,
            prep,
            nextLevelReady:
              !!score.exercise &&
              score.exercise.level < LEVELS.length &&
              levelAdvice(history, score.exercise.level).ready,
          })}
          close={() => setModal(null)}
          onRepeat={(first, last) => {
            setModal(null);
            repeatBars(first, last);
          }}
          onAgain={() => {
            setModal(null);
            restartReading();
          }}
          onNext={() => {
            setModal(null);
            startExercise({ ...score.exercise.request, seed: undefined });
          }}
          onLevelUp={
            score.exercise &&
            score.exercise.level < LEVELS.length &&
            levelAdvice(history, score.exercise.level).ready
              ? () => {
                  const level = score.exercise.level + 1;
                  setModal(null);
                  setExerciseOptions((o) => ({ ...o, level }));
                  startExercise({
                    ...score.exercise.request,
                    level,
                    seed: undefined,
                  });
                }
              : null
          }
        />
      )}
      {modal === "settings" && (
        <Modal
          title="Settings"
          subtitle="Reading, timing and appearance. Everything is saved on this Mac."
          close={() => setModal(null)}
        >
          <section className="settings-section practice-settings reader-settings">
            <h3>Reading</h3>
            <label>
              Key labels
              <select
                aria-label="Key labels"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
              >
                <option value="numbers">Numbers · 1 2 3</option>
                <option value="solfege">Solfege · Do Re Mi</option>
                <option value="letters">Notes · C D E</option>
              </select>
            </label>
            <label>
              Number 1 is
              <select
                aria-label="Number tonic"
                value={tonic}
                onChange={(e) => setTonic(+e.target.value)}
              >
                {PITCHES.map((p, i) => (
                  <option key={p} value={i}>
                    {p}
                    {i === 0 ? " · fixed Do" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="toggle-row">
              <span title="Number 1 becomes the tonic of each piece’s key signature">
                Number 1 follows the key
              </span>
              <button
                className={`toggle ${tonicFollow ? "active" : ""}`}
                role="switch"
                aria-checked={tonicFollow}
                aria-label="Number 1 follows the key"
                onClick={() => {
                  const next = !tonicFollow;
                  setTonicFollow(next);
                  if (next) setTonic(score.tonic ?? 0);
                }}
              >
                <i />
              </button>
            </div>
          </section>
          <section className="settings-section practice-settings reader-settings">
            <h3>Timing</h3>
            <div className="toggle-row">
              <span>Count me in</span>
              <button
                className={`toggle ${countIn ? "active" : ""}`}
                role="switch"
                aria-checked={countIn}
                aria-label="Count me in"
                onClick={() => setCountIn((v) => !v)}
              >
                <i />
              </button>
            </div>
            <div className="toggle-row">
              <span>Gentle metronome</span>
              <button
                className={`toggle ${metronome ? "active" : ""}`}
                role="switch"
                aria-checked={metronome}
                aria-label="Gentle metronome"
                onClick={() => {
                  if (metronome) piano.stopTicks();
                  setMetronome((v) => !v);
                }}
              >
                <i />
              </button>
            </div>
            <p
              className="meter-hint"
              title="The metronome follows the written meter. Tempo is measured in quarter notes per minute."
            >
              {meterHint(score, beat)} · Play in time always counts in and
              clicks.
            </p>
          </section>
          <section className="settings-section practice-settings reader-settings">
            <h3>Appearance & help</h3>
            <div className="toggle-row">
              <span title="A small companion with a line of advice under the score">
                Companion tips
              </span>
              <button
                className={`toggle ${coach ? "active" : ""}`}
                role="switch"
                aria-checked={coach}
                aria-label="Companion tips"
                onClick={() => setCoach((v) => !v)}
              >
                <i />
              </button>
            </div>
            <div className="reader-settings-links">
              <button
                className="secondary"
                onClick={() => setModal("companion")}
              >
                <Sparkles size={16} /> Companions & moods
              </button>
              <button className="secondary" onClick={() => setModal("guide")}>
                <HelpCircle size={16} /> Reading guide
              </button>
            </div>
          </section>
          {score.practiceTips?.length > 0 && (
            <details className="reader-lesson-tips">
              <summary>Tips for this piece</summary>
              <ol>
                {score.practiceTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ol>
            </details>
          )}
        </Modal>
      )}
      {modal === "import" && (
        <Modal
          title="Import a score"
          subtitle="PDF, MusicXML, MIDI or a Luma backup. Everything is processed here, on your Mac."
          close={() => setModal(null)}
        >
          <div
            className={`upload-drop ${importing ? "processing" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!importing) importFile(e.dataTransfer.files[0]);
            }}
          >
            {importing ? (
              <>
                <LoaderCircle size={35} className="spin" />
                <h3>{activeImport?.progress || importProgress}</h3>
                <p>
                  {activeImport?.name ||
                    "Reading notes, rhythm, and all the little details."}
                  <br />
                  You can close this panel and keep practicing.
                  <br />
                  Quitting the app stops recognition; your PDF stays here for
                  retry.
                </p>
                <div className="indeterminate" />
                {activeImport && (
                  <button
                    className="secondary small"
                    disabled={!!jobAction}
                    onClick={() => importAction(activeImport.id, "cancel")}
                  >
                    {jobAction === activeImport.id
                      ? "Stopping…"
                      : "Cancel recognition"}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="upload-orb">
                  <FileMusic size={32} />
                  <span>✦</span>
                </div>
                <h3>Drop your sheet music here</h3>
                <p>PDF, MusicXML, MIDI, or Luma JSON · up to 30 MB</p>
                <button
                  className="primary"
                  onClick={() => inputRef.current.click()}
                >
                  <Upload size={17} /> Choose a file
                </button>
              </>
            )}
          </div>
          {importError && (
            <div className="error-box" role="alert">
              {importError}
            </div>
          )}
          {recognition.error && (
            <div className="error-box" role="alert">
              Import status unavailable: {recognition.error}{" "}
              <button className="secondary small" onClick={recognition.refresh}>
                Check again
              </button>
            </div>
          )}
          {recognition.issues.length > 0 && (
            <p className="import-receipt-warning">
              Some saved import status could not be read. Originals are still in
              Library / imports; completed music is in your library.
            </p>
          )}
          {pendingImports.length > 0 && (
            <section className="saved-imports" aria-label="Saved PDF imports">
              <h3>
                Your saved imports <span>{pendingImports.length}</span>
              </h3>
              {pendingImports.map((job) => (
                <article
                  className="saved-import"
                  key={job.id}
                  data-import-id={job.id}
                >
                  <div className="saved-import-icon">
                    <FileMusic size={23} />
                  </div>
                  <div className="saved-import-copy">
                    <strong>{job.name}</strong>
                    <span className="saved-import-state">
                      {job.status === "done"
                        ? "Ready to review"
                        : job.status === "interrupted"
                          ? "Interrupted · original kept"
                          : job.status === "cancelled"
                            ? "Cancelled · original kept"
                            : "Needs another look"}
                    </span>
                    {job.error && <p>{job.error}</p>}
                    {job.persistenceError && (
                      <p role="alert">{job.persistenceError}</p>
                    )}
                    {!job.hasOriginal && job.status !== "done" && (
                      <p>
                        The original PDF is missing. Choose the file again
                        above.
                      </p>
                    )}
                    <div className="saved-import-actions">
                      {job.status === "done" ? (
                        <button
                          className="primary small"
                          disabled={!!jobAction}
                          onClick={() => reviewRecognized(job.id)}
                        >
                          Review notes <ArrowRight size={14} />
                        </button>
                      ) : (
                        <button
                          className="secondary small"
                          disabled={
                            importing || !!jobAction || !job.hasOriginal
                          }
                          onClick={() => importAction(job.id, "retry")}
                        >
                          <RotateCcw size={14} /> Retry recognition
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={!!jobAction}
                        onClick={() => importAction(job.id, "dismiss")}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              <p className="import-history-note">
                Dismiss hides a notice. It keeps your original PDF and saved
                music.
              </p>
            </section>
          )}
          <div className="import-tips">
            <div>
              <CheckCircle2 size={17} />
              <p>
                <strong>A clear sheet makes happy notes.</strong>
                <span>
                  Use a straight, high-contrast scan. Printed notation works
                  best.
                </span>
              </p>
            </div>
            <div>
              <FileText size={17} />
              <p>
                <strong>Have a MusicXML or MIDI file?</strong>
                <span>Import it for the most reliable pitch and rhythm.</span>
              </p>
            </div>
            <div>
              <Heart size={17} />
              <p>
                <strong>We’ll check the notes together.</strong>
                <span>
                  Review the recognized score before you start to practice.
                </span>
              </p>
            </div>
          </div>
          <div className="local-status">
            <i className={engineReady ? "ready" : ""} />
            {engineReady
              ? "Local recognition engine ready"
              : "Checking local recognition engine"}
            <span>No account. No cloud upload.</span>
          </div>
        </Modal>
      )}
      {modal === "review" && (
        <Review
          score={score}
          initialBar={Math.min(
            score.measures,
            measureAt(score, Math.max(0, beat)),
          )}
          close={() => setModal(null)}
          onSave={saveScore}
          notify={notify}
        />
      )}
      {modal === "companion" && (
        <Modal
          title="A little world of your own."
          subtitle="Choose the friend and atmosphere that make you want to return."
          close={() => setModal(null)}
        >
          <div className="companion-options">
            {["cat", "bunny"].map((k) => (
              <button
                className={pet === k ? "selected" : ""}
                key={k}
                onClick={() => setPet(k)}
                disabled={settingsLoading}
              >
                <Pet kind={k} happy={pet === k} />
                <strong>
                  {k === "cat" ? "Luma · cosmic cat" : "Mochi · moon bunny"}
                </strong>
                <span>
                  {k === "cat"
                    ? "A curious, quietly encouraging friend."
                    : "A soft little soul with very big ears."}
                </span>
              </button>
            ))}
          </div>
          <h3 className="section-title">Set the mood</h3>
          <div className="theme-options">
            {[
              ["mint", "Moon garden", "#baf1cc"],
              ["lavender", "Lavender dusk", "#c5b6f3"],
              ["rose", "Rose nebula", "#f4b9ca"],
            ].map(([id, name, color]) => (
              <button
                key={id}
                className={theme === id ? "selected" : ""}
                onClick={() => setTheme(id)}
                disabled={settingsLoading}
              >
                <i style={{ background: color }} />
                {name}
                {theme === id && <Check size={16} />}
              </button>
            ))}
          </div>
          <p className="subtle-note">
            Your companion grows with every correct note in “Wait for me” mode.
          </p>
        </Modal>
      )}
      {modal === "guide" && (
        <Modal
          wide
          title="How to read with Luma Keys"
          subtitle="Four screens, three ways to practise, and a few shortcuts."
          close={() => setModal(null)}
        >
          <div className="guide-grid">
            <article>
              <span>01</span>
              <h3>Numbers are note names.</h3>
              <p>
                1 = C / Do, 2 = D / Re, 3 = E / Mi, 4 = F / Fa, 5 = G / Sol, 6 =
                A / La, 7 = B / Ti. These are{" "}
                <strong>not finger numbers</strong>. ♯1 is the black key just
                above C; in flat keys the same key reads ♭2. C4 is middle C and
                C5 is one octave higher. Switch to Sheet music to read the same
                bars as staff notation.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Three ways to practise.</h3>
              <p>
                <strong>Listen & follow</strong> plays the piano while the
                cursor moves. <strong>Wait for me</strong> holds each note until
                you play it, so chords need every shown pitch.{" "}
                <strong>Play in time</strong> counts a bar in, keeps a click
                going, and grades pitch and timing bar by bar afterwards. Slow
                it down with Practice speed; nothing changes pitch.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Exercises make new music.</h3>
              <p>
                The Exercises screen holds twelve levels. Start makes a piece
                nobody has played before; New exercise on the Practice screen
                (or the N key) does the same at your saved level. Another like
                this keeps the same choices, Keep in library saves a piece you
                like, and three clean Play in time runs unlock the next level.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Use your real keyboard.</h3>
              <p>
                Connect a USB MIDI keyboard with Connect piano. The keyboard
                guide scrolls to nearby notes; use the overview or the octave
                arrows to reach all 88 keys, or hide the guide for more room.
                For an acoustic piano use Next / Previous note at your own pace.
                Computer keys A W S E D F T G Y H U J K play C4 upward. The app
                never listens through a microphone.
              </p>
            </article>
            <article>
              <span>05</span>
              <h3>A phrase at a time.</h3>
              <p>
                Choose Repeat these bars above the score, or click a bar number
                and Shift-click another to repeat that range; the report card
                can set the weakest bars for you. Isolate a hand, slow down, and
                add the other hand when it feels comfortable. A few unhurried
                minutes count.
              </p>
            </article>
            <article>
              <span>06</span>
              <h3>Your music and progress stay here.</h3>
              <p>
                Library lists your imports, kept exercises and the starter
                pieces. Progress keeps every graded run with a trend chart and
                per-level results, and can reopen the exact exercise you played.
                Scores and settings live in Desktop / Luma Keys / Library. PDF
                recognition needs a clear scan and a review.
              </p>
            </article>
          </div>
          <button className="primary" onClick={() => setModal(null)}>
            Back to the music <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
