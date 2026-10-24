import { libraryCollection } from "./library-selectors.mjs";
import { createViewTransitionRunner } from "./view-transition.mjs";
import { reportDiagnostic } from "./diagnostics-client.mjs";
import { readAudioRecovery, writeAudioRecovery, clearAudioRecovery, matchesAudioRecovery } from "./audio-recovery.mjs";
import { practiceTimeJump, ownsPracticeArrows } from "./practice-seek.mjs";
import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { flushSync } from "react-dom";
import PracticeTools from "./PracticeTools.jsx";
import ColourPicker, { colourOptions, ThemePreview } from "./ColourPicker.jsx";
import DraftNumber from "./DraftNumber.jsx";
import { repeatFromFirst, repeatFromLast } from "./number-draft.mjs";
import {
  focusedByPointer,
  installFocusIntent,
  keyOwner,
  restoreFocus,
} from "./focus-intent.mjs";
import { useRecognition } from "./useRecognition.js";
import { InputNotes } from "./input-notes.mjs";
import { buildExpression } from "./expression.mjs";
import { buildPerformance } from "./interpretation.mjs";
import {
  pianoNoteSeconds as soundSeconds,
  planPianoStart,
  planPianoWindow,
} from "./piano-phrasing.mjs";
import { bindMIDIInputs } from "./midi-input.mjs";
import MicrophonePanel from './MicrophonePanel.jsx';
import { createMicrophoneInput } from './microphone-input.mjs';
import { microphoneMatches, microphoneTargetMessage } from './microphone-match.mjs';
import { microphoneTargetSupport } from './microphone-detector.mjs';
import { setMicrophoneOutputMuted } from './audio-output.js';
import { createMicrophoneCoach } from './microphone-coach.mjs';
import { buddyPracticeSay, onBuddy } from './buddy.mjs';
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
  MessageCircle,
  Library,
  BookOpen,
  PawPrint,
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
  AlertCircle,
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
  Minus,
  Timer,
  Dices,
  RefreshCw,
  Save,
  Trophy,
  TrendingUp,
  Info,
  Piano,
  LibraryBig,
  ChartColumn,
  Command,
  Palette,
  Goal,
  History as HistoryIcon,
  AudioLines,
  Bookmark,
  Mic,
} from "lucide-react";
import {
  demos,
  degree,
  solfege,
  noteName,
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
import { BackingAudio } from "./backing-audio.js";
import { BackingRecording, recordingRate } from "./backing-recording.js";
import { buildBacking, backingAt } from "./backing.mjs";
import { defaultBacking, backingKey } from "./backing-settings.mjs";
import BackingPanelRaw from "./BackingPanel.jsx";
import Pet from "./Pet.jsx";
import CompanionPortrait from "./CompanionPortrait.jsx";
import CompanionSalon from "./CompanionSalon.jsx";
import { companionFor } from "./companions.mjs";
import MaestroPanelRaw from "./MaestroPanel.jsx";
import { useCompanionHistory } from "./companion-history.js";
import { useCompanionModel } from "./companion-model.js";
import { buildMaestroGuide, maestroPlayingCue } from "./maestro-guide.mjs";
import PdfPreviewRaw from "./PdfPreview.jsx";
import ScoreDisplayRaw from "./ScoreDisplay.jsx";
import ReadingScoreRaw from "./ReadingScore.jsx";
import KeyboardGuideRaw from "./KeyboardGuide.jsx";
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
import {
  secondsAt,
  beatAtSeconds,
  audibleTransportBeat,
  bpmAt,
  secondsBetween,
  tempoSummary,
} from "./tempo.mjs";
import { judgePress, dynamicMark, hasDynamics } from "./keyboard-stage.mjs";
import { defaultReading, HISTORY_LIMIT } from "./preferences.mjs";
import { readingPrep } from "./reading-prep.mjs";
import { coachingTips } from "./coaching.mjs";
import {
  emptyJournal,
  recordPractice,
  recordBarPasses,
  forgetPieceSpots,
  savePassage,
  removePassage,
  EXERCISES_ID,
  JOURNAL_PASSAGES,
} from "./journal.mjs";
import {
  troubleSpots,
  spotBars,
  describeSpot,
  spotLabel,
} from "./trouble-spots.mjs";
import ExercisesScreenRaw from "./screens/ExercisesScreen.jsx";
import LibraryScreenRaw from "./screens/LibraryScreen.jsx";
import ProgressScreenRaw from "./screens/ProgressScreen.jsx";
import { withBoundary } from "./ErrorBoundary.jsx";
import {
  VersionsList as VersionsListRaw,
  SettingsHistory as SettingsHistoryRaw,
  when as recoveredWhen,
} from "./RecoveryPanels.jsx";
// Each major part has its own crash boundary (ErrorBoundary.jsx): a fault in
// one shows a notice there, with Try again, and the rest keeps working. A new
// piece is a fresh start for the parts that show it.
const scoreKey = (props) => props.score?.id ?? props.score?.title ?? null;
const KeyboardGuide = withBoundary(KeyboardGuideRaw, { name: "keyboard", label: "The keyboard and hands", resetKey: scoreKey });
const ReadingScore = withBoundary(ReadingScoreRaw, { name: "number-score", label: "The number score", resetKey: scoreKey });
const ScoreDisplay = withBoundary(ScoreDisplayRaw, { name: "sheet", label: "The sheet music", resetKey: (p) => (p.xml ? `${p.xml.length}:${p.xml.slice(-64)}` : null) });
const PdfPreview = withBoundary(PdfPreviewRaw, { name: "pdf", label: "The original PDF", resetKey: (p) => p.id ?? null });
const ExercisesScreen = withBoundary(ExercisesScreenRaw, { name: "exercises", label: "Exercises" });
const LibraryScreen = withBoundary(LibraryScreenRaw, { name: "library", label: "The Library" });
const ProgressScreen = withBoundary(ProgressScreenRaw, { name: "progress", label: "Progress" });
const MaestroPanel = withBoundary(MaestroPanelRaw, { name: "companion-chat", label: "The companion" });
const BackingPanel = withBoundary(BackingPanelRaw, { name: "backing", label: "Accompaniment", resetKey: scoreKey });
// (The roaming companion is decoration: if it fails it simply steps away.)
const VersionsList = withBoundary(VersionsListRaw, { name: "versions", label: "Earlier versions" });
const SettingsHistory = withBoundary(SettingsHistoryRaw, { name: "settings-history", label: "Settings history" });
import { PieceTimeline } from "./PieceMap.jsx";
import { Ring, Seal, Segmented, WeekDots, useCountUp } from "./screens/ui.jsx";
import ScoreArtwork from "./screens/ScoreArtwork.jsx";
import { version as APP_VERSION } from "../package.json";
import "./reader.css";
import "./practice.css";
const LESSONS = demos();
const backingAudio = new BackingAudio(piano);
const backingRecording = new BackingRecording();
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
// Practice speeds: 25% to 125% in steps of 5%.
const SPEEDS = Array.from({ length: 21 }, (_, i) => (25 + i * 5) / 100);
// Audio runs independently once queued. Leave enough lead for a passage to
// engrave without losing its attacks; every queue is bounded by the phrase
// and is cancelled by pause, seek, speed changes and loop resets.
const AUDIO_SCHEDULE_AHEAD_SECONDS = 0.5;
// The transport runs on the context clock, ahead of the speakers by the
// output latency. What the reader sees follows the beat being heard.
const studioQuery = () =>
  window.matchMedia("(min-width: 900px) and (min-height: 620px)");
// Layout changes (views, the runway, the keyboard, screens) cross-fade and
// glide into place, unless the reader prefers reduced motion.
// `kind` names the change for transitions.css (nav-forward, nav-back,
// modal, chat, piece, choice, toast); unnamed changes cross-fade.
const withTransition = createViewTransitionRunner(flushSync);
const SCREENS = ["practice", "exercises", "library", "progress"];
// Seconds a note sounds from `from`: its written length (with a breath of
// separation), or up to the pedal's lift when the sustain pedal holds it.
// Practising one hand with the other playing along, the other hand is soft.
const playVelocity = (n, hand) =>
  hand !== "both" && n.hand !== hand ? (n.velocity ?? 0.72) * 0.5 : n.velocity;
function warmPianoWindow(list, index, hand, end, wrapFrom = null) {
  const upcoming = list.slice(index, index + 96).filter((n) => n.beat < end);
  if (wrapFrom != null && upcoming.length < 96) {
    upcoming.push(
      ...list
        .filter((n) => n.beat + n.duration > wrapFrom && n.beat < end)
        .slice(0, 96 - upcoming.length),
    );
  }
  return piano.warm(
    upcoming.map((n) => ({ midi: n.midi, velocity: playVelocity(n, hand) })),
  );
}
function resumeListening(
  notes,
  from,
  end,
  score,
  speed,
  hand = "both",
  when = piano.ctx.currentTime,
) {
  const plan = planPianoStart(notes, from, end, score);
  for (const { note, duration, elapsedBeats } of plan.continuations)
    piano.playAt(
      note.midi,
      soundSeconds(score, speed, from, from + duration, end, note),
      playVelocity(note, hand),
      // Held notes resume with the music, after any count-in.
      when,
      {
        elapsed: secondsBetween(
          score,
          note.beat,
          note.beat + elapsedBeats,
          speed,
        ),
      },
    );
  return plan.index;
}
function scheduleListening(t, s, now, end) {
  const plan = planPianoWindow(s.soundNotes, t.index, {
    score: s.score,
    speed: s.speed,
    origin: t.origin,
    start: t.start,
    now,
    end,
    aheadSeconds: AUDIO_SCHEDULE_AHEAD_SECONDS,
  });
  t.index = plan.index;
  for (const { note, duration, when } of plan.attacks)
    piano.playAt(note.midi, duration, playVelocity(note, s.hand), when);
}
// Schedule the other hand's notes for the next moment while performing.
function scheduleAccompaniment(t, s, now, end) {
  const list = s.otherNotes;
  if (!list?.length) return;
  if (t.accIndex >= (t.pianoAccWarmAt ?? -24) + 24) {
    t.pianoAccWarmAt = t.accIndex;
    warmPianoWindow(list, t.accIndex, s.hand, end).catch(() => {});
  }
  const b = transportBeat(t, s.score, s.speed, now);
  const ahead = transportBeat(
    t,
    s.score,
    s.speed,
    now + AUDIO_SCHEDULE_AHEAD_SECONDS,
  );
  while (t.accIndex < list.length && list[t.accIndex].beat <= ahead) {
    const n = list[t.accIndex++];
    if (n.beat < b - 0.15 || n.beat >= end - 1e-6) continue;
    const from = Math.max(n.beat, b);
    const duration = listenNoteDuration(n, from, end);
    if (duration <= 1e-6) continue;
    piano.playAt(
      n.midi,
      soundSeconds(s.score, s.speed, from, from + duration, end, n),
      playVelocity(n, s.hand),
      t.start +
        secondsBetween(s.score, t.origin, n.beat, s.speed) +
        (n.beat >= b ? n.pianoDelay || 0 : 0),
    );
  }
}
function beginBacking(t, s, from, end) {
  const events = s.backingPlan.events;
  t.backingIndex = events.length;
  if (!s.backingActive || s.mode === "wait" || s.backing.source !== "score")
    return;
  const plan = backingAt(events, from, end);
  t.backingIndex = plan.index;
  for (const { note, duration } of plan.continuations)
    backingAudio.play(
      note,
      secondsBetween(s.score, from, from + duration, s.speed),
      Math.max(0, t.start - piano.ctx.currentTime),
    );
}
function scheduleBacking(t, s, now, end) {
  if (!s.backingActive || s.mode === "wait") return;
  if (s.backing.source === "audio") {
    const beat = transportBeat(t, s.score, s.speed, piano.audibleTime());
    backingRecording.sync({
      track: s.backing.track,
      beat,
      bpm: bpmAt(s.score, beat),
      speed: s.speed,
      epoch: t.start,
      playing: now >= t.start,
      end,
    });
    return;
  }
  const b = transportBeat(t, s.score, s.speed, now);
  const ahead = transportBeat(
    t,
    s.score,
    s.speed,
    now + AUDIO_SCHEDULE_AHEAD_SECONDS,
  );
  const events = s.backingPlan.events;
  while (
    t.backingIndex < events.length &&
    events[t.backingIndex].beat <= ahead
  ) {
    const event = events[t.backingIndex++];
    if (
      event.beat < t.origin - 1e-6 ||
      event.beat < b - 0.15 ||
      event.beat >= end - 1e-6
    )
      continue;
    const from = Math.max(event.beat, b);
    const duration = Math.min(event.beat + event.duration, end) - from;
    if (duration > 1e-6)
      backingAudio.play(
        event,
        secondsBetween(s.score, from, from + duration, s.speed),
        Math.max(0, secondsBetween(s.score, b, event.beat, s.speed)),
      );
  }
}
// Where the transport is at a moment on the audio clock. The score's tempo
// map turns elapsed seconds into beats, so tempo changes are followed; the
// practice speed scales all of them alike.
const transportBeat = (t, score, speed, time) =>
  beatAtSeconds(score, t.originAt + (time - t.start) * speed);
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
// (The settings snapshot without its bookkeeping fields: the companion's
// last-seen day. JSON-escaped titles cannot contain the unescaped key.)
const withoutBookkeeping = (snapshot) =>
  snapshot.replace(/"lastSeen":"\d{4}-\d{2}-\d{2}"/, '"lastSeen":""');
const snapshotOf = (p) =>
  JSON.stringify({
    theme: p.theme,
    pet: p.pet,
    stats: p.stats,
    volume: p.volume,
    reading: p.reading,
    history: p.history,
    journal: p.journal,
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
        ? "Nearly there"
        : result.accuracy >= 0.4
          ? "Good start"
          : "Let’s take it slower";
const msLabel = (beats, secondsPerBeat) =>
  `${beats > 0 ? "+" : "−"}${Math.round(Math.abs(beats) * secondsPerBeat * 1000)} ms`;
export function ResultsModal({
  results,
  score,
  flats,
  history = [],
  tips = [],
  spots = null,
  onRepeat,
  onAgain,
  onNext,
  onLevelUp,
  close,
}) {
  const { result, entry, reason } = results;
  const complete = reason === "complete";
  const percent = Math.round(result.accuracy * 100);
  const shownPercent = Math.round(useCountUp(percent));
  const timing = Math.round(result.precision * 100);
  const secondsPerBeat = 60 / (score.bpm * (entry.tempo / score.bpm));
  // The bars this card covers: PRA-6's barsReached, else the graded bars.
  const gradedBars = result.bars.filter((b) => b.total > 0);
  const [firstBar, lastBar] =
    Array.isArray(results.barsReached) && results.barsReached.length === 2
      ? results.barsReached
      : gradedBars.length
        ? [gradedBars[0].bar, gradedBars.at(-1).bar]
        : [
            measureAt(score, results.from),
            measureAt(score, Math.max(results.from, results.end - 1e-4)),
          ];
  const barSpan = (a, b) => (a === b ? `bar ${a}` : `bars ${a}–${b}`);
  const span = complete
    ? barSpan(
        measureAt(score, results.from),
        measureAt(score, Math.max(results.from, results.end - 1e-4)),
      )
    : barSpan(firstBar, lastBar);
  const feel = !result.matched
    ? null
    : result.offset > 0.02
      ? "a touch late"
      : result.offset < -0.02
        ? "a touch early"
        : "steady";
  const worstFrom = result.worst?.first ?? null,
    worstTo = result.worst?.last ?? null;
  const missedNotes = result.notes.filter((n) => n.status === "missed");
  const mostMissed = result.bars.reduce(
    (top, b) => (b.missed > (top?.missed || 0) ? b : top),
    null,
  );
  // Personal best: better than every earlier complete run of this piece.
  const earlier = history.filter(
    (h) =>
      h.mode === "perform" &&
      h.complete &&
      entry.scoreId &&
      h.scoreId === entry.scoreId &&
      h.at !== entry.at,
  );
  const personalBest =
    complete &&
    earlier.length > 0 &&
    entry.accuracy > Math.max(...earlier.map((h) => h.accuracy));
  const gilt = complete && result.accuracy >= 0.95;
  const celebrate = complete && result.accuracy >= 0.9;
  const repeat = result.worst
    ? [result.worst.first, result.worst.last]
    : [firstBar, lastBar];
  const primary =
    result.accuracy < 0.75
      ? "repeat"
      : result.accuracy >= 0.9 && score.exercise
        ? "next"
        : "again";
  const actions = [
    (result.worst || primary === "repeat") && {
      id: "repeat",
      icon: <Repeat2 size={16} />,
      label: `Repeat ${barSpan(repeat[0], repeat[1])}`,
      run: () => onRepeat(repeat[0], repeat[1]),
    },
    {
      id: "again",
      icon: <RotateCcw size={15} />,
      label: "Play it again",
      run: onAgain,
    },
    score.exercise && {
      id: "next",
      icon: <Dices size={15} />,
      label: "Next exercise",
      run: onNext,
    },
  ].filter(Boolean);
  actions.sort((x, y) => (y.id === primary) - (x.id === primary));
  return (
    <Modal
      eyebrow={complete ? "REPORT CARD" : "PRACTICE RUN"}
      className={`results-dialog report-card${celebrate ? " celebrate" : ""}${complete ? "" : " first-look"}${gilt ? " gilt" : ""}`}
      title={
        complete
          ? `${percent}% · ${verdictFor(result)}`
          : `${firstBar === lastBar ? `Bar ${firstBar}` : `Bars ${firstBar}–${lastBar}`} · a first look`
      }
      subtitle={`${score.title} · ${span} · ♩ = ${entry.tempo}${results.hand === "both" ? "" : ` · ${results.hand} hand`}`}
      close={close}
    >
      {score.exercise && onLevelUp && complete && (
        <button
          type="button"
          className="results-level-banner"
          onClick={onLevelUp}
        >
          <span>
            Level {score.exercise.level} cleared · Climb to level{" "}
            {score.exercise.level + 1}
          </span>
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
      <div className="report-hero">
        <div className="report-figure report-figure-main">
          <span className="report-ring">
            <Ring
              value={result.accuracy}
              size={96}
              stroke={9}
              className={gilt ? "gilt" : ""}
              label={`${percent}% of notes right`}
            >
              <b>{shownPercent}%</b>
            </Ring>
            {personalBest && (
              <Seal className="report-best" label="Personal best">
                BEST
              </Seal>
            )}
          </span>
          <span className="report-label">Notes right</span>
        </div>
        <div className="report-figure">
          <Ring
            value={result.precision}
            size={72}
            stroke={7}
            className="timing"
            label={`${timing}% on time`}
          >
            <b>{timing}%</b>
          </Ring>
          <span className="report-label">On time</span>
        </div>
        <div className="report-figure report-feel">
          <strong>{feel ?? "—"}</strong>
          {feel && feel !== "steady" && (
            <small>{msLabel(result.offset, secondsPerBeat)}</small>
          )}
          <span className="report-label">Feel</span>
        </div>
      </div>
      <p className="report-sentence">
        <strong>
          {result.matched} of {result.total}
        </strong>{" "}
        · {result.missed} missed · {result.extra} extra
      </p>
      {!complete && <p className="results-note">This card covers {span}.</p>}
      {mostMissed && (
        <p className="results-bars-head">
          Most misses in bar {mostMissed.bar}
          <span> · click a bar to repeat it</span>
        </p>
      )}
      {mostMissed && spots?.get(mostMissed.bar) && (
        <p className="results-spot">
          <AlertCircle size={13} aria-hidden="true" /> Bar {mostMissed.bar} is
          a trouble spot · {describeSpot(spots.get(mostMissed.bar))}
        </p>
      )}
      <div className="results-bars" aria-label="Accuracy by bar">
        {result.bars.map((bar, i) => {
          const right = bar.on + bar.early + bar.late;
          const worst =
            worstFrom != null && bar.bar >= worstFrom && bar.bar <= worstTo;
          return (
            <button
              type="button"
              key={bar.bar}
              className={`results-bar ${bar.problems === 0 ? "clean" : bar.problems <= 1 ? "shaky" : "trouble"}${worst ? " worst" : ""}`}
              style={{ "--i": Math.min(i, 20) }}
              title={`Bar ${bar.bar} · ${right} of ${bar.total} right · click to repeat`}
              aria-label={`Bar ${bar.bar}, ${right} of ${bar.total} right${worst ? ", most trouble" : ""}. Repeat this bar.`}
              onClick={() => onRepeat(bar.bar, bar.bar)}
            >
              <span>{bar.bar}</span>
              <i
                style={{
                  "--fill": `${bar.total ? (right / bar.total) * 100 : 100}%`,
                }}
              />
            </button>
          );
        })}
      </div>
      {tips.length > 0 && (
        <ul className="results-tips" aria-label="Coaching tips">
          {tips.slice(0, 2).map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
      {missedNotes.length > 0 && (
        <details className="results-missed">
          <summary>
            Show the {missedNotes.length} missed note
            {missedNotes.length === 1 ? "" : "s"}
          </summary>
          <p>
            {missedNotes
              .slice(0, 60)
              .map((n) => `${noteName(n.midi, flats)} (bar ${n.bar})`)
              .join(", ")}
            {missedNotes.length > 60 ? "…" : ""}
          </p>
        </details>
      )}
      <div className="results-actions">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={a.id === primary ? "primary" : "secondary"}
            onClick={a.run}
          >
            {a.icon} {a.label}
          </button>
        ))}
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
  initialFocus = null,
  previewRoom = undefined,
}) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    // A dialog opened with a click hands focus back as a click, so Space
    // plays afterwards instead of reopening it.
    const openedByPointer = focusedByPointer(previous);
    (initialFocus
      ? ref.current?.querySelector(initialFocus)
      : ref.current
    )?.focus();
    const fn = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const list = [
          ...ref.current.querySelectorAll(
            'button,input,textarea,select,a[href],[tabindex="0"]',
          ),
        ].filter(
          (x) =>
            !x.disabled &&
            !x.closest("[hidden],[inert]") &&
            x.getClientRects().length,
        );
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
      const page =
        previous === document.body || previous === document.documentElement;
      if (previous?.isConnected && !page && !previous.closest("[inert]"))
        restoreFocus(previous, openedByPointer);
      // Opened from the page itself (a shortcut such as ?): focus returns
      // to the page, where Space still plays.
      else if (!page)
        restoreFocus(
          document.querySelector(".maestro-launcher"),
          openedByPointer,
        );
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
        data-preview-room={previewRoom || undefined}
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
      notify("Score changes saved.");
    } catch (e) {
      notify(e.message);
    }
    setSaving(false);
  }
  return (
    <Modal
      wide
      title="Review score"
      subtitle="Check the imported notes against the original score."
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
  const companionConversation = useCompanionHistory();
  const companionModel = useCompanionModel(companionConversation);
  const maestroOpener = useRef(null);
  const [microphone, setMicrophone] = useState({ phase: 'off', detector: null });
  const micInput = useRef(null), micCoach = useRef(null), micSession = useRef(0), micAutoStart = useRef(false), micContext = useRef(null);
  const micActive = microphone.phase === 'listening' || microphone.phase === 'requesting';
  const [testingSound, setTestingSound] = useState(false);
  const [recoveringAudio, setRecoveringAudio] = useState(false);
  const [soundMessage, setSoundMessage] = useState("");
  const soundTestRequest = useRef(0);
  // Includes notes already queued by the sound check, until playback takes over.
  const soundTestActive = useRef(false);
  const audioRecovering = useRef(false);
  const audioRecoveryPlace = useRef(undefined);
  if (audioRecoveryPlace.current === undefined) {
    try { audioRecoveryPlace.current = readAudioRecovery(window.sessionStorage); }
    catch { audioRecoveryPlace.current = null; }
  }
  const [view, setViewNow] = useState("practice"),
    [score, setScore] = useState(LESSONS[0]),
    [library, setLibrary] = useState([]),
    [libraryIssues, setLibraryIssues] = useState([]),
    // Recovery (2.44): removed pieces, version counts, the open versions
    // list and the settings history.
    [recovery, setRecovery] = useState({ removed: [], versions: {} }),
    [restoring, setRestoring] = useState(false),
    [versionsOf, setVersionsOf] = useState(null),
    [snapshots, setSnapshots] = useState(null),
    [settingsIssues, setSettingsIssues] = useState([]),
    [savingSettings, setSavingSettings] = useState(false),
    [settingsLoading, setSettingsLoading] = useState(true),
    [settingsLoadError, setSettingsLoadError] = useState(""),
    [beat, setBeat] = useState(0),
    [playing, setPlaying] = useState(false),
    [loadingSound, setLoadingSound] = useState(false),
    [mode, setModeNow] = useState("listen"),
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
    [keyLane, setKeyLane] = useState(true),
    [handDisplay, setHandDisplay] = useState("natural"),
    [flashes, setFlashes] = useState([]),
    [glanceOpen, setGlanceOpen] = useState(false),
    [pressed, setPressed] = useState(new Set()),
    [modal, setModalNow] = useState(null),
    [companionOpen, setCompanionOpenNow] = useState(false),
    [companionMinimized, setCompanionMinimizedNow] = useState(false),
    [fingerHelpOpen, setFingerHelpOpen] = useState(false),
    [toast, setToastNow] = useState(""),
    [uploading, setUploading] = useState(false),
    [jobAction, setJobAction] = useState(""),
    [importProgress, setImportProgress] = useState(""),
    [importError, setImportError] = useState(""),
    [midiStatus, setMidiStatus] = useState("Connect keyboard"),
    [query, setQuery] = useState(""),
    [theme, setTheme] = useState("mint"),
    [pet, setPet] = useState("cat"),
    [companion, setCompanion] = useState(() => defaultReading().companion),
    // The app's colours: "neutral" (default), "companion" (the chosen
    // companion's room) or a custom theme id. Choosing a companion never
    // changes this.
    [colours, setColours] = useState(() => defaultReading().colours),
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
    [goal, setGoal] = useState(() => defaultReading().goal),
    [accompany, setAccompany] = useState(() => defaultReading().accompany),
    [room, setRoom] = useState(() => defaultReading().room),
    [interpretation, setInterpretation] = useState(
      () => defaultReading().interpretation,
    ),
    [backingMap, setBackingMap] = useState(() => defaultReading().backing),
    [buddy, setBuddy] = useState(() => defaultReading().buddy),
    [practiceCue, setPracticeCue] = useState(null),
    [buddyState, setBuddyState] = useState(() => defaultReading().buddyState),
    [ladder, setLadder] = useState(false),
    [focus, setFocus] = useState(false),
    [journal, setJournal] = useState(emptyJournal),
    [lastResult, setLastResult] = useState(null);
  // Every visible change animates (transitions.css): screens slide toward
  // the chosen tab, panels and the chat glide in and out, a new choice
  // slides its pill, notices rise and fall. The state still changes at once
  // when motion is reduced or transitions are unavailable.
  const viewNow = useRef(view);
  const setView = useCallback((next) => {
    const target = typeof next === "function" ? next(viewNow.current) : next;
    if (target === viewNow.current) return;
    const forward = SCREENS.indexOf(target) >= SCREENS.indexOf(viewNow.current);
    viewNow.current = target;
    withTransition(
      () => setViewNow(target),
      forward ? "nav-forward" : "nav-back",
    );
  }, []);
  const setModal = useCallback(
    (next) => withTransition(() => setModalNow(next), "modal"),
    [],
  );
  const setCompanionOpen = useCallback(
    (next) => withTransition(() => setCompanionOpenNow(next), "chat"),
    [],
  );
  const setCompanionMinimized = useCallback(
    (next) => withTransition(() => setCompanionMinimizedNow(next), "chat"),
    [],
  );
  // Notices change at once: a View Transition here dropped clicks (PRA-3).
  const setToast = useCallback((next) => setToastNow(next), []);
  // Info and success notices that arrive while music plays wait for the stop.
  const heldToast = useRef(null);
  const setMode = useCallback(
    (next) => withTransition(() => setModeNow(next), "choice"),
    [],
  );
  const inputRef = useRef(),
    state = useRef({}),
    transport = useRef({
      beat: 0,
      playing: false,
      start: 0,
      origin: 0,
      originAt: 0,
      index: 0,
      tickUntil: -Infinity,
      matched: new Set(),
    }),
    inputNotes = useRef(new InputNotes()),
    keyVelocities = useRef(new Map()),
    flashSeq = useRef(0),
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
      keyLane,
      keyHands: handDisplay !== "off",
      handDisplay,
      readingView,
      speed,
      mode,
      hand,
      exercise: exerciseOptions,
      last: lastScore,
      coach,
      companion,
      // Legacy mirror for older builds; `colours` is what this build reads.
      companionStyle: colours === "companion",
      colours,
      welcomeSeen,
      goal,
      accompany,
      room,
      interpretation,
      buddy,
      buddyState,
      backing: backingMap,
    }),
    [
      labels,
      tonic,
      tonicFollow,
      countIn,
      metronome,
      keyboardCollapsed,
      keyLane,
      handDisplay,
      readingView,
      speed,
      mode,
      hand,
      exerciseOptions,
      lastScore,
      coach,
      companion,
      colours,
      welcomeSeen,
      goal,
      accompany,
      room,
      interpretation,
      buddy,
      buddyState,
      backingMap,
    ],
  );
  const preferenceSnapshot = snapshotOf({
    theme,
    pet,
    stats,
    volume,
    reading,
    history,
    journal,
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
  const pieceBackingKey = backingKey(score);
  const backing = useMemo(
    () => backingMap[pieceBackingKey] || defaultBacking(),
    [backingMap, pieceBackingKey],
  );
  const backingPlan = useMemo(
    () => buildBacking(score, { style: backing.style, hand }),
    [score, backing.style, hand],
  );
  const backingActive =
    backing.enabled &&
    (backing.source === "audio"
      ? !!backing.track
      : backingPlan.events.length > 0);
  const arrangedBacking = backingActive && backing.source === "score";
  const backingSourceIds = useMemo(
    () =>
      new Set(
        backingPlan.events.flatMap((event) =>
          Number.isInteger(event.midi) ? event.sourceIds : [],
        ),
      ),
    [backingPlan],
  );
  // What the piano plays: the hand being practised, and the other hand too
  // (softly) when it is asked to play along.
  const playsAlong = accompany && hand !== "both" && !backingActive;
  // Expressive playback (phrasing, voicing, rubato, pedal) is a plan built
  // once per score. "Written" keeps the literal, steady reading.
  const performancePlan = useMemo(
    () => (interpretation === "concert" ? buildPerformance(score) : null),
    [score, interpretation],
  );
  const pianoNotes = useMemo(() => {
    const expression = buildExpression(score, { style: interpretation });
    return score.notes.map((n) => {
      const mark = expression.get(n.id);
      const shaped = performancePlan?.notes.get(n.id);
      if (!mark && !shaped) return n;
      return {
        ...n,
        velocity: shaped?.velocity ?? mark?.velocity ?? n.velocity,
        pianoGate: mark?.gate ?? shaped?.gate,
        pianoDelay: shaped?.delay || 0,
      };
    });
  }, [score, interpretation, performancePlan]);
  // The score the transport and piano follow. Listen & follow breathes with
  // the phrase (a steadier curve under a generated backing; none against a
  // recording, whose playback rate follows the tempo). Graded modes keep the
  // written pulse. Only playback changes; the reader still shows the score.
  const playScore = useMemo(() => {
    if (!performancePlan) return score;
    const recordingBacking = backingActive && backing.source === "audio";
    const tempos =
      mode === "listen" && !recordingBacking
        ? arrangedBacking
          ? performancePlan.steadyTempos
          : performancePlan.tempos
        : null;
    if (!tempos && !performancePlan.pedals) return score;
    return {
      ...score,
      ...(tempos ? { tempos } : {}),
      ...(performancePlan.pedals ? { pedals: performancePlan.pedals } : {}),
    };
  }, [
    score,
    performancePlan,
    mode,
    backingActive,
    arrangedBacking,
    backing.source,
  ]);
  const soundNotes = useMemo(() => {
    const list = playsAlong
      ? pianoNotes
      : pianoNotes.filter((n) => hand === "both" || n.hand === hand);
    return arrangedBacking
      ? list.filter((n) => !backingSourceIds.has(n.id))
      : list;
  }, [playsAlong, pianoNotes, hand, arrangedBacking, backingSourceIds]);
  const otherNotes = useMemo(
    () => (playsAlong ? pianoNotes.filter((n) => n.hand !== hand) : []),
    [playsAlong, pianoNotes, hand],
  );
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
  // The studio layout (score, keyboard stage and transport in one view)
  // applies on desktop-sized windows; the score reads compactly there.
  const [studio, setStudio] = useState(() => studioQuery().matches);
  useEffect(() => {
    const query = studioQuery();
    const change = () => setStudio(query.matches);
    query.addEventListener("change", change);
    change();
    return () => query.removeEventListener("change", change);
  }, []);
  // The piano's room follows the setting (applied when sound starts).
  useEffect(() => piano.setRoom(room), [room]);
  useEffect(() => {
    backingAudio.setVolume(backing.volume);
    backingRecording.setVolume(backing.volume);
  }, [backing.volume]);
  // The main navigation's pill glides to the chosen screen. Measured only
  // when the screen or the window changes, never while music plays.
  const navRef = useRef();
  const [navPill, setNavPill] = useState(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const place = () => {
      const button = nav.querySelector(`[data-view="${view}"]`);
      if (!button) return;
      setNavPill((previous) => {
        const next = {
          width: `${button.offsetWidth}px`,
          transform: `translateX(${button.offsetLeft}px)`,
          opacity: 1,
        };
        return previous &&
          previous.width === next.width &&
          previous.transform === next.transform
          ? previous
          : next;
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [view]);
  // Recovery lists are read when they can be seen: the Library's removed
  // pieces and version counts, and Settings' history.
  useEffect(() => {
    if (view === "library") refreshRecovery();
  }, [view]);
  useEffect(() => {
    if (modal !== "settings") return;
    let current = true;
    api("/settings/snapshots")
      .then((r) => current && setSnapshots(r.snapshots))
      .catch(() => current && setSnapshots(null));
    return () => {
      current = false;
    };
  }, [modal]);
  // A new piece settles in: its title, score and stage rise softly into place.
  const pieceShown = useRef(null);
  useEffect(() => {
    const id = score.id ?? score.title;
    if (pieceShown.current === null) {
      pieceShown.current = id;
      return;
    }
    if (pieceShown.current === id) return;
    pieceShown.current = id;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document
      .querySelectorAll(
        ".practice-screen > .piece-header, .practice-screen > .score-stage, .practice-screen > .keyboard-stage",
      )
      .forEach((el, i) =>
        el.animate?.(
          [
            { opacity: 0, transform: "translateY(14px) scale(0.99)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: 460,
            delay: i * 70,
            easing: "cubic-bezier(0.2, 0.9, 0.3, 1)",
            fill: "backwards",
          },
        ),
      );
  }, [score]);
  // Only scores that state dynamics (or vary in loudness) show a marking.
  const showDynamics = useMemo(() => hasDynamics(score.notes), [score]);
  state.current = {
    score: playScore,
    notes,
    soundNotes,
    otherNotes,
    backing,
    backingPlan,
    backingActive,
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
    ladder,
    playing,
    beat,
  };
  // The keyboard stage reads this every animation frame: the audible beat
  // while music moves (the count-in included, so notes are seen arriving),
  // otherwise the transport position.
  const stageClock = useCallback(() => {
    const t = transport.current,
      s = state.current;
    if (!t.playing || !piano.ctx) return t.beat;
    if (s.mode === "listen")
      return audibleTransportBeat(t, s.score, s.speed, piano.audibleTime());
    if (s.mode === "perform" && t.countIn) {
      const heard = piano.audibleTime();
      return heard < t.start
        ? t.origin + (heard - t.start) / t.countIn.secondsPerBeat
        : transportBeat(t, s.score, s.speed, heard);
    }
    return t.beat;
  }, []);
  // A key's verdict shows briefly: a flash on the key and a spark above it.
  function flashKey(midi, kind) {
    const at = performance.now();
    setFlashes((list) => [
      ...list.filter((f) => at - f.at < 900).slice(-11),
      { id: ++flashSeq.current, midi, kind, at },
    ]);
    // Other parts (the companion) listen for each verdict (contract C5).
    try {
      window.dispatchEvent(
        new CustomEvent("luma:verdict", { detail: { midi, kind, at } }),
      );
    } catch {}
  }
  // Clean bars (PRA-7): presses per bar in Wait for me and Play in time.
  // A bar with a right note and nothing wrong earns a glint when it ends.
  const barMarks = useRef(new Map());
  // Bars judged this session in Wait for me ({ bar, clean }), banked into
  // the piece's trouble spots when playing stops.
  const passBuffer = useRef([]);
  function markBar(bar, problem) {
    const entry = barMarks.current.get(bar) || { hits: 0, problems: 0 };
    if (problem) entry.problems++;
    else entry.hits++;
    barMarks.current.set(bar, entry);
  }
  useEffect(() => {
    if (!flashes.length) return;
    const timer = setTimeout(
      () =>
        setFlashes((list) =>
          list.filter((f) => performance.now() - f.at < 850),
        ),
      900,
    );
    return () => clearTimeout(timer);
  }, [flashes]);
  // notify(message, { tone: info|success|error, ttl, action, detail }) (C6).
  // `action` is { label, run }; `detail` is a quieter second line.
  const toastSeq = useRef(0);
  function notify(message, { tone = "info", ttl, action, detail } = {}) {
    if (!message) return;
    const next = {
      message: String(message),
      tone,
      action: action || null,
      detail: detail ? String(detail) : "",
      id: ++toastSeq.current,
      ttl: ttl ?? (tone === "success" ? 2400 : tone === "error" ? 8000 : 5000),
    };
    // While music plays only errors interrupt; the latest other notice
    // waits for the stop.
    if (tone !== "error" && transport.current.playing) {
      heldToast.current = next;
      return;
    }
    // Anything held is older than this notice.
    heldToast.current = null;
    showToast(next);
  }
  function showToast(next) {
    setToast(next);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), next.ttl);
  }
  useEffect(() => {
    if (playing || !heldToast.current) return;
    const next = heldToast.current;
    heldToast.current = null;
    showToast(next);
  }, [playing]);
  async function refreshLibrary() {
    const result = await api("/library");
    setLibrary(result.scores);
    setLibraryIssues(result.issues);
    return result.scores;
  }
  // What can be put back: removed pieces and each piece's earlier versions.
  // (A missing list only hides the recovery entries; it never blocks practice.)
  function refreshRecovery() {
    return api("/recovery")
      .then(setRecovery)
      .catch(() => {});
  }
  async function restoreRemoved(item) {
    setRestoring(true);
    try {
      const { score: back } = await api(
        `/recovery/removed/${encodeURIComponent(item.file)}/restore`,
        { method: "POST" },
      );
      await refreshLibrary();
      notify(
        journal.pieces[back.id]
          ? `${back.title} is back in your library, with its practice history.`
          : `${back.title} is back in your library.`,
        { tone: "success" },
      );
    } catch (e) {
      notify(e.message, { tone: "error" });
    } finally {
      await refreshRecovery();
      setRestoring(false);
    }
  }
  function openVersions(piece) {
    setVersionsOf({ piece, versions: null, error: "" });
    setModal("versions");
    api(`/scores/${encodeURIComponent(piece.id)}/versions`)
      .then(({ versions }) =>
        setVersionsOf((v) =>
          v?.piece.id === piece.id ? { ...v, versions } : v,
        ),
      )
      .catch((e) =>
        setVersionsOf((v) =>
          v?.piece.id === piece.id ? { ...v, error: e.message } : v,
        ),
      );
  }
  async function restoreVersion(version) {
    const piece = versionsOf?.piece;
    if (!piece) return;
    setRestoring(true);
    try {
      const { score: restored } = await api(
        `/scores/${encodeURIComponent(piece.id)}/versions/${encodeURIComponent(version.file)}/restore`,
        { method: "POST" },
      );
      await refreshLibrary();
      // The piece open in Practice follows, as after a review save.
      if (score.id === restored.id) {
        stop();
        setScore(restored);
        if (loop) {
          const first = Math.min(loopA, restored.measures);
          const last = Math.min(loopB, restored.measures);
          setLoopA(first);
          setLoopB(last);
          seek(barStart(restored, first));
        } else seek(0);
      }
      setModal(null);
      notify(
        `Restored the version you had until ${recoveredWhen(version.replacedAt)}. The one it replaced is kept in Earlier versions.`,
        { tone: "success" },
      );
    } catch (e) {
      notify(e.message, { tone: "error" });
    } finally {
      await refreshRecovery();
      setRestoring(false);
    }
  }
  async function restoreSnapshot(snapshot, label) {
    setRestoring(true);
    stop();
    try {
      // Pending settings writes land first, so the restore replaces them;
      // and nothing more is queued until the restored settings are read
      // back, so a late save cannot land after the restore (2.44).
      await window.lumaFlushPreferences?.();
      clearTimeout(preferenceTimer.current);
      lastPreferences.current = preferenceState.current.snapshot;
      await api(
        `/settings/snapshots/${encodeURIComponent(snapshot.file)}/restore`,
        { method: "POST" },
      );
      await reloadSettings();
      notify(
        `Settings restored from ${label}. Your previous settings are kept in Settings history.`,
        { tone: "success" },
      );
    } catch (e) {
      notify(e.message, { tone: "error" });
    } finally {
      api("/settings/snapshots")
        .then((r) => setSnapshots(r.snapshots))
        .catch(() => {});
      setRestoring(false);
    }
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
        notify("That setting didn't save. It still applies until you quit.", {
          tone: "error",
          detail: e.message,
        });
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
      journal: p.journal || emptyJournal(),
    };
    const today = new Date().toLocaleDateString("en-CA");
    const progress = {
      ...p.stats,
      dailyMinutes: p.stats.practiceDate === today ? p.stats.dailyMinutes : 0,
      practiceDate: today,
    };
    // Hydration alone must never replace a damaged or older settings file.
    // (The snapshot is the live settings as they will be: the legacy
    // companionStyle flag is derived from the colour choice, as below.)
    lastPreferences.current = snapshotOf({
      theme: p.theme,
      pet: p.pet,
      stats: progress,
      volume: p.volume,
      reading: {
        ...p.reading,
        companionStyle: (p.reading.colours || "neutral") === "companion",
      },
      history: p.history,
      journal: p.journal,
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
    setKeyLane(p.reading.keyLane);
    setHandDisplay(p.reading.handDisplay);
    setReadingView(p.reading.readingView);
    setSpeed(p.reading.speed);
    setMode(p.reading.mode);
    setHand(p.reading.hand);
    setExerciseOptions(p.reading.exercise);
    setLastScore(p.reading.last);
    setCoach(p.reading.coach);
    setWelcomeSeen(p.reading.welcomeSeen);
    setGoal(p.reading.goal);
    setAccompany(p.reading.accompany);
    setRoom(p.reading.room);
    setInterpretation(p.reading.interpretation);
    setBuddy(p.reading.buddy);
    setBuddyState(p.reading.buddyState);
    setBackingMap(p.reading.backing);
    setCompanion(p.reading.companion);
    // Files from before `colours` existed open neutral (preferences.mjs).
    setColours(p.reading.colours || "neutral");
    setJournal(p.journal);
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
        if (!cancelled)
          notify("Couldn't open your library just now.", {
            tone: "error",
            detail: e.message,
            action: {
              label: "Try again",
              run: () =>
                refreshLibrary().catch((err) =>
                  notify("Couldn't open your library just now.", {
                    tone: "error",
                    detail: err.message,
                  }),
                ),
            },
          });
      })
      .finally(() => {
        if (!cancelled) setLibraryLoaded(true);
      });
    api("/health")
      .then((h) => {
        if (cancelled) return;
        setEngineReady(h.omr);
        if (h.writable === false)
          notify(
            "Luma Keys cannot write to its Library folder, so practice and settings will not be saved.",
            { tone: "error", ttl: 20000, detail: h.dataDir },
          );
        // (Another Luma Keys using the same Library: their saves could undo
        // each other's — 2.44.)
        if (h.sharedWith)
          notify(
            "Another copy of Luma Keys is using this Library. Quit one of them so their saves cannot undo each other.",
            { tone: "error", ttl: 20000, detail: h.dataDir },
          );
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
      backingAudio.stop();
      backingRecording.dispose();
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!prefLoaded) return;
    const snapshot = preferenceSnapshot;
    if (snapshot === lastPreferences.current) return;
    // Bookkeeping alone — the companion noting the day it last greeted you —
    // does not rewrite the settings file: opening the app writes nothing. It
    // is saved with the next real change, or when the app closes.
    if (
      lastPreferences.current &&
      withoutBookkeeping(snapshot) === withoutBookkeeping(lastPreferences.current)
    )
      return;
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
    // The app is usable now: one startup mark for the diagnostics log.
    reportDiagnostic("app-ready", {
      ms: Math.round(performance.now()),
      pieces: library.length,
    });
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
    const place = audioRecoveryPlace.current;
    if (!place || !prefLoaded || !libraryLoaded || !matchesAudioRecovery(place, score)) return;
    audioRecoveryPlace.current = null;
    clearAudioRecovery(window.sessionStorage);
    seek(Math.min(score.duration, place.beat));
    setLoopA(Math.min(score.measures, place.loopA));
    setLoopB(Math.min(score.measures, place.loopB));
    setLoop(place.loop);
    setSoundMessage("Audio restarted. Test sound, or press Play when ready.");
  }, [prefLoaded, libraryLoaded, score]);
  useEffect(() => {
    // Electron awaits this before closing its window or loopback server.
    const flush = async () => {
      companionModel.cancel();
      if (!preferenceState.current.ready) {
        await companionConversation.flush();
        return;
      }
      flushSync(() => stop());
      clearTimeout(preferenceTimer.current);
      const snapshot = preferenceState.current.snapshot;
      if (snapshot !== lastPreferences.current) await savePreferences(snapshot);
      await preferenceWrites.current;
      await companionConversation.flush();
    };
    window.lumaFlushPreferences = flush;
    // Read-only clock for timing tests: audio time against the transport.
    const clock = () => {
      const t = transport.current;
      return {
        now: piano.ctx?.currentTime ?? null,
        start: t.start,
        origin: t.origin,
        originAt: t.originAt,
        // The transport's beat now through the tempo map (changes included).
        mapped:
          t.playing && piano.ctx && piano.ctx.currentTime >= t.start
            ? transportBeat(
                t,
                state.current.score,
                state.current.speed,
                piano.ctx.currentTime,
              )
            : null,
        beat: t.beat,
        // How far the speakers trail the context clock (Bluetooth: ~0.25 s).
        latency: piano.ctx
          ? Math.max(0, piano.ctx.currentTime - piano.audibleTime())
          : 0,
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
    const audioStatus = () => piano.diagnostics();
    window.lumaAudioState = audioStatus;
    const backingStatus = () => ({
      settings: state.current.backing,
      active: state.current.backingActive,
      style: state.current.backingPlan?.style,
      events: state.current.backingPlan?.events.length,
      sourceHand: state.current.backingPlan?.sourceHand,
      audio: backingAudio.diagnostics,
      recording: {
        paused: backingRecording.audio.paused,
        currentTime: backingRecording.audio.currentTime,
        rate: backingRecording.audio.playbackRate,
        volume: backingRecording.volume,
        preservesPitch: backingRecording.audio.preservesPitch,
        starts: backingRecording.starts,
        seeks: backingRecording.seeks,
      },
    });
    window.lumaBackingState = backingStatus;
    return () => {
      if (window.lumaFlushPreferences === flush)
        delete window.lumaFlushPreferences;
      if (window.lumaClock === clock) delete window.lumaClock;
      if (window.lumaAudioState === audioStatus) delete window.lumaAudioState;
      if (window.lumaBackingState === backingStatus)
        delete window.lumaBackingState;
    };
  }, []);
  function stop({ keepInputs = false, letRing = false } = {}) {
    soundTestRequest.current++;
    soundTestActive.current = false;
    setTestingSound(false);
    micSession.current++;
    micInput.current?.setTarget(null);
    micCoach.current?.setTarget(null);
    const t = transport.current;
    t.playing = false;
    t.countIn = null;
    recording.current = null;
    setPerformCount(0);
    setPlaying(false);
    playRequest.current = null;
    setLoadingSound(false);
    backingAudio.stop();
    backingRecording.stop();
    if (keepInputs && letRing) piano.finishPlayback();
    else if (keepInputs) piano.stopPlayback();
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
      const s = state.current;
      // The journal keeps where each piece was left and the bars played
      // through; a repeated phrase counts once it has come round.
      if (s.score) {
        const played = [
          measureAt(s.score, Math.max(0, t.origin)),
          Math.min(s.score.measures, measureAt(s.score, Math.max(0, t.beat))),
        ];
        const loopSpan = s.loop
          ? secondsBetween(
              s.score,
              barStart(s.score, s.loopA),
              barEnd(s.score, s.loopB),
              s.speed,
            ) / 60
          : Infinity;
        const generated = s.score.exercise && !s.score.id;
        const entry = {
          id: generated ? EXERCISES_ID : s.score.id,
          title: generated ? "Exercises" : s.score.title,
          minutes,
          from: played[0],
          to: played[1],
          cover: minutes >= loopSpan ? [[s.loopA, s.loopB]] : [],
        };
        setJournal((j) => recordPractice(j, entry));
        // The bar Wait for me stopped in is judged too; then the session's
        // judged bars go to the piece's trouble spots (never an exercise's:
        // its bars are new every time).
        if (s.mode === "wait") {
          const bar = Math.min(
            s.score.measures,
            measureAt(s.score, Math.max(0, t.beat)),
          );
          const marks = barMarks.current.get(bar);
          if (marks && marks.hits + marks.problems > 0)
            passBuffer.current.push({ bar, clean: !marks.problems });
          barMarks.current.clear();
        }
        const passes = passBuffer.current;
        passBuffer.current = [];
        if (!generated && s.score.id && passes.length)
          setJournal((j) =>
            recordBarPasses(j, {
              id: s.score.id,
              title: s.score.title,
              passes,
            }),
          );
      }
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
  function jumpSeconds(seconds) {
    const s = state.current;
    const t = transport.current;
    const continuing =
      (t.playing || !!playRequest.current) && s.mode !== "perform";
    const audible = piano.ctx ? piano.audibleTime() : 0;
    // A count-in has a future audio start. Until it reaches that start,
    // jump from the displayed position rather than extrapolating backwards.
    const now =
      t.playing && s.mode !== "wait" && piano.ctx && audible >= t.start
        ? transportBeat(t, s.score, s.speed, audible)
        : t.beat;
    const startBeat = s.loop ? barStart(s.score, s.loopA) : 0;
    const endBeat = s.loop ? barEnd(s.score, s.loopB) : s.score.duration;
    const next = practiceTimeJump(score, now, seconds, s.speed, {
      start: startBeat,
      end: endBeat,
    });
    if (Math.abs(next - now) < 1e-7) return;
    // Flush the stopped position before restarting, so rapid jumps replace
    // queued audio and every view follows the same latest clock position.
    flushSync(() => seek(next));
    if (continuing && next < endBeat - 1e-6) start({ skipCountIn: true });
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
  // Drill a trouble spot: repeat it at a speed slow enough to get it right
  // (70% at most) and say so where the status reads.
  function drillSpot(first, last) {
    repeatBars(first, last);
    const slow = speed > 0.7 + 1e-9;
    if (slow) setSpeed(0.7);
    flashStatus(
      `Drill ${first === last ? `bar ${first}` : `bars ${first}–${last}`}${slow ? " at 70%" : ""} · Space plays`,
      3200,
    );
  }
  function forgetSpot(first, last) {
    if (!score.id) return;
    setJournal((j) => forgetPieceSpots(j, { id: score.id, first, last }));
  }
  function restartReading() {
    seek(loop ? barStart(score, loopA) : 0);
  }
  // Changing mode or hand keeps your place: back to this bar's downbeat
  // (within the repeat), or the start when finished or not yet begun.
  function rewindToBar() {
    if (beat <= 1e-6 || beat >= playbackEnd - 1e-6) {
      restartReading();
      return;
    }
    const bar = Math.min(score.measures, measureAt(score, Math.max(0, beat)));
    const from = loop
      ? Math.max(barStart(score, loopA), barStart(score, bar))
      : barStart(score, bar);
    seek(from);
  }
  // ⇧, and ⇧. : previous / next bar downbeat (wrapping inside a repeat).
  // Previous first returns to this bar's downbeat when past it.
  function stepBar(direction) {
    const first = loop ? loopA : 1,
      last = loop ? loopB : score.measures;
    const here = Math.min(score.measures, measureAt(score, Math.max(0, beat)));
    let bar =
      direction < 0 && beat > barStart(score, here) + 1e-6
        ? here
        : here + (direction < 0 ? -1 : 1);
    if (bar < first) bar = loop ? last : first;
    if (bar > last) bar = loop ? first : last;
    seek(barStart(score, bar));
  }
  // One step (5%) slower or faster; the music stops so it restarts in time.
  function changeSpeed(direction) {
    const nearest = SPEEDS.reduce(
      (best, x, i) =>
        Math.abs(x - speed) < Math.abs(SPEEDS[best] - speed) ? i : best,
      0,
    );
    const next =
      SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, nearest + direction))];
    if (Math.abs(next - speed) < 1e-9) return;
    stop();
    setSpeed(next);
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
  // Open a piece, optionally at a bar (Continue from the library or progress).
  function openAt(piece, bar = 1) {
    choose(piece);
    if (bar > 1) {
      const to = barStart(piece, Math.min(bar, piece.measures));
      transport.current.beat = to;
      setBeat(to);
    }
  }
  // Open a piece already repeating one of its saved passages; a drill (a
  // trouble spot from Library or Progress) also slows to 70% at most.
  function openPassage(piece, first, last, { drill = false } = {}) {
    choose(piece);
    const a = Math.max(1, Math.min(piece.measures, first));
    const b = Math.max(a, Math.min(piece.measures, last));
    setLoopA(a);
    setLoopB(b);
    setLoop(true);
    const to = barStart(piece, a);
    transport.current.beat = to;
    setBeat(to);
    if (drill) {
      const slow = speed > 0.7 + 1e-9;
      if (slow) setSpeed(0.7);
      flashStatus(
        `Drill ${a === b ? `bar ${a}` : `bars ${a}–${b}`}${slow ? " at 70%" : ""} · Space plays`,
        3200,
      );
    }
  }
  async function start({ skipCountIn = false } = {}) {
    if (settingsLoading || audioRecovering.current) return;
    if (transport.current.playing || playRequest.current) {
      if (recording.current) finishPerformance("stopped");
      else stop();
      return;
    }
    // Space at the end of the piece plays it again from bar 1.
    if (!loop && transport.current.beat >= score.duration - 1e-6) seek(0);
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
    soundTestRequest.current++;
    soundTestActive.current = false;
    piano.stopPlayback();
    setTestingSound(false);
    playRequest.current = request;
    setLoadingSound(true);
    try {
      if (micActive) {
        // Acoustic Wait needs the transport clock, not a decoded sample bank.
        await piano.resume();
      } else await piano.init();
      if (
        playRequest.current !== request ||
        document.hidden ||
        handlers.current.modal
      )
        return;
      const setup = state.current;
      if (setup.backingActive && setup.mode !== "wait") {
        if (setup.backing.source === "audio") {
          const track = setup.backing.track;
          const rates = tempoSummary(setup.score).map((bpm) =>
            recordingRate(track, bpm, setup.speed),
          );
          if (rates.some((rate) => rate < 0.25 || rate > 4))
            throw Error(
              "Adjust the recording tempo before playing at this practice speed.",
            );
          backingRecording.connect(piano.ctx, piano.output.input);
          await backingRecording.prepare(track);
        } else {
          await backingAudio.prepare();
          if (
            playRequest.current !== request ||
            document.hidden ||
            handlers.current.modal
          )
            return;
          await backingAudio.warm(setup.backingPlan.events);
        }
      }
      if (
        playRequest.current !== request ||
        document.hidden ||
        handlers.current.modal
      )
        return;
      const {
        score,
        notes,
        soundNotes,
        otherNotes,
        hand,
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
      const warmList = mode === "perform" ? otherNotes : soundNotes;
      const warmEnd = loop ? barEnd(score, loopB) : score.duration;
      const warmPlan = planPianoStart(warmList, from, warmEnd, score);
      if (!micActive) await piano.warm(
        [
          ...warmPlan.continuations.map((entry) => entry.note),
          ...warmList
            .slice(warmPlan.index, warmPlan.index + 96)
            .filter((n) => n.beat < warmEnd),
        ].map((n) => ({ midi: n.midi, velocity: playVelocity(n, hand) })),
      );
      if (
        playRequest.current !== request ||
        document.hidden ||
        handlers.current.modal
      )
        return;
      t.pianoWarmAt = null;
      t.pianoAccWarmAt = null;
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
        const secondsPerBeat = 60 / (bpmAt(score, from) * speed);
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
          // Timing windows follow the tempo in force at each note.
          secondsPerBeatAt: (beat) => 60 / (bpmAt(score, beat) * speed),
          notes: [],
        };
        setPerformCount(1);
      } else if (countIn && !skipCountIn && from < 1e-6)
        from = -countInLength(score);
      else if (countIn && !skipCountIn) {
        // Count me in from any bar, not only the first: a bar of clicks
        // before this bar, then this bar's beats up to the starting note,
        // all on the audio clock (as Play in time counts in).
        const barBeat = barStart(score, measureAt(score, from));
        const plan = countInPlan(score, barBeat);
        const secondsPerBeat = 60 / (bpmAt(score, barBeat) * speed);
        const downbeat =
          piano.ctx.currentTime + 0.06 + plan.length * secondsPerBeat;
        const at = (seconds) => seconds - piano.ctx.currentTime;
        for (const event of plan.events)
          piano.tick(
            event.accent,
            at(downbeat - (plan.length - event.offset) * secondsPerBeat),
          );
        for (const event of metronomeEvents(score, barBeat - 1e-6, from - 1e-6))
          piano.tick(
            event.accent,
            at(downbeat + secondsBetween(score, barBeat, event.beat, speed)),
          );
        startTime = downbeat + secondsBetween(score, barBeat, from, speed);
      }
      t.beat = from;
      t.origin = from;
      t.originAt = secondsAt(score, from);
      t.start = startTime;
      t.playing = true;
      t.index =
        mode === "listen"
          ? resumeListening(
              soundNotes,
              from,
              loop ? barEnd(score, loopB) : score.duration,
              score,
              speed,
              hand,
              startTime,
            )
          : soundNotes.length;
      // Performing one hand, the other plays along from the first bar.
      const along = planPianoStart(
        otherNotes,
        from,
        loop ? barEnd(score, loopB) : score.duration,
        score,
      );
      t.accIndex = mode === "perform" ? along.index : otherNotes.length;
      if (mode === "perform")
        for (const { note, duration, elapsedBeats } of along.continuations)
          piano.playAt(
            note.midi,
            soundSeconds(
              score,
              speed,
              from,
              from + duration,
              loop ? barEnd(score, loopB) : score.duration,
              note,
            ),
            playVelocity(note, hand),
            startTime,
            {
              elapsed: secondsBetween(
                score,
                note.beat,
                note.beat + elapsedBeats,
                speed,
              ),
            },
          );
      beginBacking(
        t,
        state.current,
        from,
        loop ? barEnd(score, loopB) : score.duration,
      );
      // Schedule the opening before a cold GPU/React redraw can delay the
      // first RAF. Future count-in attacks remain independently cancellable.
      const end = loop ? barEnd(score, loopB) : score.duration;
      if (mode === "listen")
        scheduleListening(t, state.current, startTime, end);
      if (mode === "perform")
        scheduleAccompaniment(t, state.current, startTime, end);
      if (
        state.current.backing.source === "score" &&
        startTime <= piano.ctx.currentTime
      )
        scheduleBacking(t, state.current, startTime, end);
      t.tickUntil = from - 1e-6;
      setBeat(from);
      setPlaying(true);
      practiceStart.current = Date.now();
      setStats((s) => ({ ...s, sessions: s.sessions + 1 }));
    } catch (e) {
      if (playRequest.current === request) {
        stop();
        reportSoundError(e);
      }
    } finally {
      if (playRequest.current === request) {
        playRequest.current = null;
        setLoadingSound(false);
      }
    }
  }
  function reportSoundError(error) {
    setSoundMessage(error.message);
    notify(error.message, {
      tone: "error",
      ...(error.code === "AUDIO_UNAVAILABLE" ? {
        ttl: 12000,
        action: { label: "Recover audio", run: () => handlers.current.recoverAudio() },
      } : {}),
    });
  }
  async function testPianoSound() {
    if (micActive || settingsLoading || recoveringAudio) return;
    stop();
    if (!volume) {
      setSoundMessage("Piano is muted. Raise the piano volume, then test again.");
      return;
    }
    const request = ++soundTestRequest.current;
    soundTestActive.current = true;
    setTestingSound(true);
    setSoundMessage("Preparing the piano…");
    try {
      await piano.init();
      if (request !== soundTestRequest.current || document.hidden || handlers.current.modal) return;
      const at = piano.ctx.currentTime + 0.03;
      [60, 64, 67].forEach((midi, i) => piano.playAt(midi, 0.24, 0.55, at + i * 0.3));
      setSoundMessage("Playing three notes. Nothing audible? Check your Mac’s output device and volume.");
    } catch (error) {
      if (request === soundTestRequest.current) reportSoundError(error);
    } finally {
      if (request === soundTestRequest.current) setTestingSound(false);
    }
  }
  async function recoverAudio() {
    if (audioRecovering.current) return;
    audioRecovering.current = true;
    const current = state.current;
    const place = { beat: transport.current.beat, loop: current.loop, loopA: current.loopA, loopB: current.loopB };
    setRecoveringAudio(true);
    setSoundMessage("Saving your place and restarting audio…");
    try {
      // A full reload rebuilds the piano, backing tracks and output gates together.
      // Never reload if the pending practice/settings write did not succeed.
      await window.lumaFlushPreferences();
      // An already-running import or companion action can finish during the
      // save. Keep the window open if it changed what we were about to restore.
      const latest = state.current;
      if (latest.score !== current.score || transport.current.beat !== place.beat ||
          latest.loop !== place.loop || latest.loopA !== place.loopA || latest.loopB !== place.loopB ||
          preferenceState.current.snapshot !== lastPreferences.current)
        throw Error("Your practice changed while audio was restarting. Please try Recover audio again.");
      if (!writeAudioRecovery(window.sessionStorage, current.score, place))
        throw Error("Could not keep your place for audio recovery. Please try again.");
      window.location.reload();
    } catch (error) {
      clearAudioRecovery(window.sessionStorage);
      audioRecovering.current = false;
      setRecoveringAudio(false);
      setSoundMessage(error.message);
      notify(error.message, { tone: "error" });
    }
  }
  useEffect(() => {
    let frame,
      last = 0;
    function update() {
      const s = state.current,
        t = transport.current;
      if (t.playing && piano.ctx && piano.ctx.state !== "running") {
        stop();
        reportSoundError(Object.assign(Error("Sound was interrupted. Your place is kept."), { code: "AUDIO_UNAVAILABLE" }));
        frame = requestAnimationFrame(update);
        return;
      }
      if (t.playing && s.mode === "listen" && piano.ctx) {
        const now = piano.ctx.currentTime;
        const b = transportBeat(t, s.score, s.speed, now);
        // During a count-in into a later bar the music has not started yet:
        // a pause there keeps the chosen place.
        t.beat = Math.max(t.origin, b);
        // Local beat length (tempo changes included) and delays in real time.
        const secondsPerBeat = 60 / (bpmAt(s.score, b) * s.speed);
        const after = (x) =>
          Math.max(0, secondsBetween(s.score, b, x, s.speed));
        const lookAhead = transportBeat(
          t,
          s.score,
          s.speed,
          now + AUDIO_SCHEDULE_AHEAD_SECONDS,
        );
        const end = s.loop ? barEnd(s.score, s.loopB) : s.score.duration;
        try {
          scheduleBacking(t, s, now, end);
        } catch (e) {
          stop();
          notify(e.message, { tone: "error" });
          frame = requestAnimationFrame(update);
          return;
        }
        if (t.index >= (t.pianoWarmAt ?? -24) + 24) {
          t.pianoWarmAt = t.index;
          warmPianoWindow(
            s.soundNotes,
            t.index,
            s.hand,
            end,
            s.loop ? barStart(s.score, s.loopA) : null,
          ).catch(() => {});
        }
        scheduleListening(t, s, now, end);
        const tickThrough = Math.min(end - 1e-6, lookAhead);
        if (s.metronome || b < 0) {
          // The same look-ahead schedules clicks on the audio clock, including
          // fractional beats. Never burst missed clicks after a stalled frame.
          for (const event of metronomeEvents(
            s.score,
            Math.max(t.tickUntil, b - 0.1 / secondsPerBeat),
            tickThrough,
          )) {
            if (s.metronome || event.beat < 0)
              piano.tick(event.accent, after(event.beat));
          }
        }
        // Never backwards: a count-in into a later bar already has its clicks.
        t.tickUntil = Math.max(t.tickUntil, tickThrough);
        if (b >= end) {
          if (s.loop) {
            piano.stopPlayback();
            backingAudio.stop();
            backingRecording.stop();
            // The speed ladder: each time round the phrase a step (5%)
            // faster, up to full speed. The transport uses it from here on.
            if (s.ladder && s.speed < 1 - 1e-9) {
              const next = Math.min(1, Math.round((s.speed + 0.05) * 20) / 20);
              s.speed = next;
              setSpeed(next);
              // No notice mid-music: the speed pill brightens (PRA-7).
              handlers.current.ladderStep?.(next);
            }
            setLoopPasses((n) => n + 1);
            const from = barStart(s.score, s.loopA);
            t.origin = from;
            t.originAt = secondsAt(s.score, from);
            t.start = piano.ctx.currentTime;
            t.beat = from;
            t.index = resumeListening(
              s.soundNotes,
              from,
              end,
              s.score,
              s.speed,
              s.hand,
            );
            t.pianoWarmAt = null;
            t.tickUntil = from - 1e-6;
            beginBacking(t, s, from, end);
            scheduleListening(t, s, t.start, end);
            if (s.backing.source === "score")
              scheduleBacking(t, s, t.start, end);
          } else {
            stop({ keepInputs: true, letRing: true });
            t.beat = s.score.duration;
            setBeat(s.score.duration);
          }
        } else if (performance.now() - last > 30) {
          setBeat(
            audibleTransportBeat(t, s.score, s.speed, piano.audibleTime()),
          );
          last = performance.now();
        }
      }
      if (t.playing && s.mode === "perform" && piano.ctx && t.countIn) {
        const now = piano.ctx.currentTime;
        const secondsPerBeat = t.countIn.secondsPerBeat;
        const end = s.loop ? barEnd(s.score, s.loopB) : s.score.duration;
        scheduleAccompaniment(t, s, now, end);
        try {
          scheduleBacking(t, s, now, end);
        } catch (e) {
          stop();
          notify(e.message, { tone: "error" });
          frame = requestAnimationFrame(update);
          return;
        }
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
          const b = transportBeat(t, s.score, s.speed, now);
          t.beat = b;
          const localBeat = 60 / (bpmAt(s.score, b) * s.speed);
          // The click always sounds while performing; written notes play only
          // for the other hand, when it is asked to play along.
          const tickThrough = Math.min(
            end - 1e-6,
            transportBeat(
              t,
              s.score,
              s.speed,
              now + AUDIO_SCHEDULE_AHEAD_SECONDS,
            ),
          );
          for (const event of metronomeEvents(
            s.score,
            Math.max(t.tickUntil, b - 0.1 / localBeat),
            tickThrough,
          ))
            piano.tick(
              event.accent,
              Math.max(0, secondsBetween(s.score, b, event.beat, s.speed)),
            );
          t.tickUntil = Math.max(t.tickUntil, tickThrough);
          // Half a beat of grace lets a slightly late final note be counted.
          if (b >= end + 0.5) handlers.current.finishPerformance("complete");
          else if (performance.now() - last > 30) {
            setBeat(
              Math.min(
                audibleTransportBeat(t, s.score, s.speed, piano.audibleTime()),
                end,
              ),
            );
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
      audioRecovering.current ||
      settingsLoading ||
      modal ||
      fingerHelpOpen ||
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
      piano.warm([{ midi, velocity }]).catch(() => {});
      entry.voice = micActive ? null : piano.play(midi, null, velocity);
      keyVelocities.current.set(midi, velocity);
      setPressed((p) => new Set(p).add(midi));
      const s = state.current,
        t = transport.current;
      if (t.playing && s.mode === "perform" && recording.current) {
        // Time against the audio clock, not the last animation frame.
        const rec = recording.current;
        const pressedAt = piano.ctx.currentTime;
        const played = {
          midi,
          beat:
            pressedAt < t.start
              ? t.origin + (pressedAt - t.start) / rec.secondsPerBeat
              : transportBeat(t, s.score, s.speed, pressedAt),
        };
        rec.notes.push(played);
        // Keys tried during the count-in are not judged.
        if (played.beat >= rec.from - 0.5) {
          const verdict = judgePress({
            midi,
            beat: played.beat,
            mode: "perform",
            notes: s.phraseNotes,
            secondsPerBeat: rec.secondsPerBeatAt(played.beat),
          });
          flashKey(midi, verdict.kind);
          markBar(
            measureAt(s.score, Math.max(0, played.beat)),
            verdict.kind === "miss",
          );
        }
        return;
      }
      if (t.playing && s.mode === "listen") {
        const heard = stageClock();
        const verdict = judgePress({
          midi,
          beat: heard,
          mode: "listen",
          notes: s.notes,
          secondsPerBeat: 60 / (bpmAt(s.score, heard) * s.speed),
        });
        if (verdict.kind === "hit") flashKey(midi, "hit");
      }
      if (t.playing && s.mode === "wait") {
        const group = practiceGroupAt(s.chordGroups, t.beat);
        if (!group) return;
        flashKey(
          midi,
          group.notes.some((n) => n.midi === midi) ? "hit" : "miss",
        );
        markBar(
          measureAt(s.score, Math.max(0, group.beat)),
          !group.notes.some((n) => n.midi === midi),
        );
        if (group.notes.some((n) => n.midi === midi)) {
          if (t.matched.has(midi)) return;
          t.matched.add(midi);
          setSessionHits((h) => h + 1);
          setStats((v) => ({ ...v, correct: v.correct + 1 }));
          if (group.notes.every((n) => t.matched.has(n.midi))) advanceWaitGroup(group);
        } else setSessionMisses((v) => v + 1);
      }
    } catch (e) {
      if (inputNotes.current.discard(entry))
        reportSoundError(e);
    }
  }
  function advanceWaitGroup(group) {
    const s = state.current, t = transport.current;
    // Invalidate queued acoustic attacks before React commits the next key.
    micInput.current?.setTarget(null);
    const index = s.chordGroups.indexOf(group);
    let next = s.chordGroups[index + 1];
    if (s.loop && (!next || next.beat >= barEnd(s.score, s.loopB))) {
      setLoopPasses(n => n + 1);
      // A one-bar phrase never changes bar, so its pass is judged here (a
      // longer phrase's last bar is judged when the bar changes).
      if (s.loopA === s.loopB) {
        const marks = barMarks.current.get(s.loopB);
        if (marks && marks.hits + marks.problems > 0) {
          passBuffer.current.push({ bar: s.loopB, clean: !marks.problems });
          barMarks.current.delete(s.loopB);
        }
      }
      next = s.chordGroups.find(g => g.beat >= barStart(s.score, s.loopA) - 1e-6 && g.beat < barEnd(s.score, s.loopB) - 1e-6);
    }
    t.matched = new Set();
    if (next) { t.beat = next.beat; setBeat(next.beat); }
    else { stop({ keepInputs: true }); t.beat = s.score.duration; setBeat(s.score.duration); }
  }
  function microphoneAttack(event) {
    const s = state.current, t = transport.current;
    if (!t.playing || s.mode !== 'wait' || view !== 'practice' || modal || fingerHelpOpen || document.hidden) return;
    const group = practiceGroupAt(s.chordGroups, t.beat);
    if (!group) return;
    const expected = group.notes.map(n => n.midi);
    if (microphoneMatches(event, expected)) {
      for (const midi of event.notes) flashKey(midi, 'hit');
      markBar(measureAt(s.score, group.beat), false);
      setSessionHits(h => h + event.notes.length);
      setStats(v => ({ ...v, correct: v.correct + event.notes.length }));
      micCoach.current?.observe({ kind: 'hit' });
      advanceWaitGroup(group);
    } else {
      for (const midi of event.notes) flashKey(midi, 'miss');
      setSessionMisses(v => v + 1);
      markBar(measureAt(s.score, group.beat), true);
      micCoach.current?.observe({ kind: 'miss', midi: event.notes[0] });
    }
  }
  function disconnectMicrophone() {
    micAutoStart.current = false;
    stop(); micInput.current?.stop();
  }
  async function enableMicrophone(device) {
    stop(); setModeNow('wait'); setView('practice');
    micAutoStart.current = true;
    const started = await micInput.current?.start(device);
    if (started) setModal(null);
    else micAutoStart.current = false;
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
    if (down && !modal && !fingerHelpOpen && !document.hidden)
      pedalInputs.current.add(source);
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
        secondsPerBeat: rec.secondsPerBeatAt,
      },
    );
    if (!result.total) {
      if (!complete)
        notify(
          "Stopped before the first note. Play after the count-in to be graded.",
        );
      return;
    }
    // The bars the run actually covered.
    const firstBar = measureAt(s.score, Math.max(0, rec.from));
    const lastBar = Math.max(
      firstBar,
      Math.min(
        s.score.measures,
        measureAt(
          s.score,
          Math.max(rec.from, Math.min(rec.end, stoppedAt) - 1e-4),
        ),
      ),
    );
    // A short early stop is a pause, not a verdict: no card, no history.
    if (!complete && (result.total < 8 || lastBar - firstBar + 1 < 2)) {
      const bar = Math.min(
        s.score.measures,
        measureAt(s.score, Math.max(0, stoppedAt)),
      );
      notify(`Paused at bar ${bar}. Space plays on from here.`);
      return;
    }
    const exercise = s.score.exercise;
    // Each bar the run covered is a judged pass for the trouble spots: clean
    // when nothing was missed or wrong (timing is reported, not remembered).
    // The bar an early stop landed in was only part-played, so it is skipped.
    if (s.score.id) {
      const passes = result.bars
        .filter((b) => b.total > 0 && (complete || b.bar !== lastBar))
        .map((b) => ({ bar: b.bar, clean: !b.missed && !b.extra }));
      if (passes.length)
        setJournal((j) =>
          recordBarPasses(j, {
            id: s.score.id,
            title: s.score.title,
            passes,
          }),
        );
    }
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
      tempo: Math.max(1, Math.round(bpmAt(s.score, rec.from) * s.speed)),
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
        // For an honest title on an early stop (SCR-4).
        barsReached: [firstBar, lastBar],
        stoppedAt,
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
  function startExercise(input, { fresh = false } = {}) {
    try {
      const generated = generateExercise(input);
      setWelcomeSeen(true);
      choose(generated);
      setReadingView((v) => v);
      setModal(null);
      // A seed reopens the exact exercise (Progress → Open), not a new one.
      notify(
        `${input.seed != null && !fresh ? `Exercise #${generated.exercise.seed} again` : "New exercise"} · ${exerciseSummary(generated.exercise)}`,
      );
      return generated;
    } catch (e) {
      notify("Could not make an exercise: " + e.message);
      return null;
    }
  }
  const handlers = useRef();
  handlers.current = {
    microphoneAttack,
    noteOn,
    noteOff,
    start,
    stop,
    modal: modal || fingerHelpOpen,
    releaseInputSources,
    updatePedal,
    finishPerformance,
    recoverAudio,
    ladderStep,
    newExercise: () => startExercise({ ...exerciseOptions, seed: undefined }),
    changeSpeed,
    stepReading,
    jumpSeconds,
    view,
    focus,
    leaveFocus: () => withTransition(() => setFocus(false)),
    // PRA-8 / PRA-9 practice keys.
    resume: () =>
      resumeBar ? seekReading(barStart(score, resumeBar)) : start(),
    restart: restartReading,
    toggleLoop: () => (loop ? clearRepeat() : repeatBars(loopA, loopB)),
    pickMode: (next) => {
      if (next === mode) return;
      rewindToBar();
      setMode(next);
    },
    cycleView,
    toggleFocus: () => changeFocus(!focus),
    stepBar,
    openShortcuts: () => {
      stop();
      setModal("shortcuts");
    },
  };
  // Keep sparse microphone encouragement in the existing instruction strip.
  // The shell button is the one persistent companion entry point.
  useEffect(() => {
    let timer;
    setPracticeCue(null);
    const unsubscribe = onBuddy(event => {
      if (!buddy || buddyState.quiet || event.source !== "microphone") return;
      setPracticeCue(event.text);
      clearTimeout(timer);
      timer = setTimeout(() => setPracticeCue(null), 5000);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [buddy, buddyState.quiet, companion, score.id]);
  micContext.current = {
    piece: { title: score.title, composer: score.composer || '', bars: score.measures, key: score.key || '' },
    practice: { bar: measureAt(score, Math.max(0, beat)), speedPercent: Math.round(speed * 100), hand, numberOne: noteName(60 + tonic).replace(/[0-9]/g, ''), labelMode: labels },
    ready: companionModel.availability.available && !companionModel.pending && !modal && !companionOpen && buddy && !buddyState.quiet,
  };
  useEffect(() => {
    micCoach.current = createMicrophoneCoach({ onCue: buddyPracticeSay, getContext: () => micContext.current, modelReady: () => micContext.current?.ready });
    micInput.current = createMicrophoneInput({
      onStatus: value => {
        if (value.phase === 'error') handlers.current.stop();
        setMicrophoneOutputMuted(value.phase === 'requesting' || value.phase === 'listening');
        setMicrophone(value);
      },
      onAttack: event => handlers.current.microphoneAttack(event),
    });
    const snapshot = () => micInput.current?.getState();
    window.lumaMicrophoneState = snapshot;
    const hidden = () => { if (document.hidden) { handlers.current.stop(); micInput.current?.stop(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      micCoach.current?.dispose(); piano.stop(); micInput.current?.stop(); setMicrophoneOutputMuted(false);
      if (window.lumaMicrophoneState === snapshot) delete window.lumaMicrophoneState;
    };
  }, []);
  useLayoutEffect(() => {
    const group = playing && mode === 'wait' && view === 'practice' && !modal && !fingerHelpOpen && !document.hidden && microphone.phase === 'listening'
      ? practiceGroupAt(chordGroups, transport.current.beat) : null;
    const key = group ? `${micSession.current}:${score.id || score.title}:${hand}:${loop}:${loopA}:${loopB}:${group.beat}` : null;
    const scope = micInput.current?.setTarget(key, group?.notes.map(n => n.midi) || []);
    micCoach.current?.setTarget(group && microphoneTargetSupport(group.notes.map(n => n.midi)).supported && !companionOpen && buddy && !buddyState.quiet ? {
      session: String(micSession.current), target: scope, expected: group.notes.map(n => n.midi), matched: [],
      bar: measureAt(score, group.beat), hand, companionId: companion,
    } : null);
  });
  useEffect(() => {
    if (micActive && (mode !== 'wait' || view !== 'practice')) disconnectMicrophone();
  }, [mode, view]);
  useEffect(() => {
    if (micAutoStart.current && microphone.phase === 'listening' && !modal && mode === 'wait') {
      micAutoStart.current = false; void start({ skipCountIn: true });
    }
  }, [microphone.phase, modal, mode]);
  useEffect(() => {
    if (!playing || !micActive || mode !== 'wait' || modal || companionOpen) return;
    const timer = setTimeout(() => micCoach.current?.observe({ kind: 'help' }), 8000);
    return () => clearTimeout(timer);
  }, [beat, playing, micActive, mode, modal, companionOpen]);
  useEffect(() => {
    if (modal || fingerHelpOpen) {
      releaseInputSources();
      if (playRequest.current) stop();
    }
  }, [modal, fingerHelpOpen]);
  useEffect(() => {
    const down = (e) => {
      if (audioRecovering.current) return;
      if (e.key === "Meta" || e.metaKey) {
        handlers.current.releaseInputSources("computer:");
        return;
      }
      const target = e.target;
      // Text fields keep every key. Space belongs to a control only when the
      // reader reached it with the keyboard; after a click it plays.
      const owner = keyOwner(target, {
        code: e.code,
        pointer: focusedByPointer(target),
      });
      const typing = owner === "text";
      // The chat keeps its keys. An open tools drawer keeps its letters but
      // not Space; its button (outside the drawer) follows the rule above,
      // so clicking Tools and pressing Space plays instead of reopening it.
      const drawer = target.closest?.(".practice-tools-panel");
      if (
        handlers.current.modal ||
        target.closest?.("[data-companion-dock], [data-colour-picker]") ||
        (drawer && !(e.code === "Space" && owner === "app")) ||
        typing ||
        target.isContentEditable ||
        e.repeat ||
        e.metaKey ||
        e.ctrlKey
      )
        return;
      if (e.key === "Escape" && handlers.current.focus) {
        e.preventDefault();
        handlers.current.leaveFocus();
        return;
      }
      const practicing = handlers.current.view === "practice";
      const letter = e.altKey ? "" : e.key.toLowerCase();
      if (
        practicing &&
        !e.altKey &&
        !e.shiftKey &&
        !e.defaultPrevented &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        !ownsPracticeArrows(target)
      ) {
        e.preventDefault();
        handlers.current.jumpSeconds(e.key === "ArrowRight" ? 5 : -5);
      } else if (e.code === "Space") {
        // Play and pause belong to the Practice screen, where the transport
        // is; elsewhere Space keeps its ordinary meaning (scrolling).
        if (owner === "control" || !practicing) return;
        e.preventDefault();
        if (e.shiftKey && practicing) handlers.current.resume();
        else handlers.current.start();
      } else if (
        practicing &&
        e.shiftKey &&
        (e.code === "Comma" || e.code === "Period")
      ) {
        e.preventDefault();
        handlers.current.stepBar(e.code === "Period" ? 1 : -1);
      } else if (practicing && !e.shiftKey && letter === "r") {
        e.preventDefault();
        handlers.current.restart();
      } else if (practicing && !e.shiftKey && letter === "b") {
        e.preventDefault();
        handlers.current.toggleLoop();
      } else if (practicing && !e.shiftKey && letter === "v") {
        e.preventDefault();
        handlers.current.cycleView();
      } else if (practicing && !e.shiftKey && letter === "z") {
        e.preventDefault();
        handlers.current.toggleFocus();
      } else if (practicing && !e.shiftKey && /^Digit[123]$/.test(e.code)) {
        e.preventDefault();
        handlers.current.pickMode(
          ["listen", "wait", "perform"][+e.code.slice(5) - 1],
        );
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        handlers.current.newExercise?.();
      } else if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        handlers.current.changeSpeed(e.key === "]" ? 1 : -1);
      } else if (
        (e.key === "," || e.key === ".") &&
        handlers.current.view === "practice"
      ) {
        e.preventDefault();
        handlers.current.stepReading(e.key === "." ? 1 : -1);
      } else if (e.key === "?") {
        e.preventDefault();
        handlers.current.openShortcuts();
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
      if (playRequest.current || soundTestActive.current) handlers.current.stop();
    };
    const visibility = () => {
      if (document.hidden) handlers.current.stop();
    };
    document.addEventListener("visibilitychange", visibility);
    const forgetFocusIntent = installFocusIntent(window);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      forgetFocusIntent();
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
      if (!navigator.requestMIDIAccess) notify(e.message, { tone: "error" });
      else
        notify(
          "Your piano isn't answering. Check the cable or power, then connect again.",
          {
            tone: "error",
            detail: e.message,
            action: { label: "Connect piano", run: () => connectMIDI() },
          },
        );
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
          : "Score imported. Review the notes.",
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
    setImportProgress("Importing score…");
    try {
      const data = new FormData();
      data.append("score", file);
      const result = await api("/import", { method: "POST", body: data });
      if (result.score) {
        await refreshLibrary();
        choose(result.score);
        setModal("review");
        notify("Score imported. Review the notes.");
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
  // Opening and closing tempo, when the piece changes speed.
  const tempoRun = useMemo(() => tempoSummary(score), [score]);
  const currentIndex = current ? phraseGroups.indexOf(current) : -1;
  const upcoming =
    currentIndex >= 0 &&
    phraseGroups[currentIndex + 1] &&
    phraseGroups[currentIndex + 1].beat < playbackEnd - 1e-6
      ? phraseGroups[currentIndex + 1]
      : null;
  const maestroPieces = useMemo(() => {
    const seen = new Map();
    for (const piece of [...library, ...LESSONS]) {
      if (piece.id && !seen.has(piece.id)) seen.set(piece.id, piece);
    }
    return [...seen.values()];
  }, [library]);
  const maestroGuide = useMemo(
    () => buildMaestroGuide(score, hand),
    [score, hand],
  );
  const maestroBar = Math.min(
    score.measures,
    measureAt(score, Math.max(0, beat)),
  );
  function openMaestro() {
    if (!document.activeElement?.closest("[data-companion-dock]")) {
      maestroOpener.current = document.activeElement;
      // Opened with a click (or from the page): closing hands focus back
      // as a click, so Space plays rather than reopening the chat.
      maestroOpener.pointer =
        document.activeElement === document.body ||
        focusedByPointer(document.activeElement);
    }
    stop();
    clearTimeout(resultsTimer.current);
    resultsToken.current = null;
    setCompanionOpen(true);
    setCompanionMinimized(false);
  }
  function closeMaestro() {
    companionModel.cancel();
    setCompanionOpen(false);
    setCompanionMinimized(false);
    requestAnimationFrame(() => {
      const candidates = [
        maestroOpener.current,
        ...document.querySelectorAll(".maestro-launcher"),
        ...document.querySelectorAll(".maestro-stage-cue"),
        ...document.querySelectorAll(".app-nav button"),
      ];
      restoreFocus(
        candidates.find(
          (element) =>
            element?.isConnected &&
            element !== document.body &&
            element !== document.documentElement &&
            element.getClientRects().length &&
            getComputedStyle(element).visibility !== "hidden" &&
            !element.closest("[inert],[hidden]"),
        ),
        !!maestroOpener.pointer,
      );
    });
  }
  function openBacking() {
    stop();
    clearTimeout(resultsTimer.current);
    resultsToken.current = null;
    setModal("backing");
  }
  function changeBacking(patch) {
    if (!pieceBackingKey) return;
    stop();
    setBackingMap((previous) => {
      const next = {
        ...previous,
        [pieceBackingKey]: {
          ...(previous[pieceBackingKey] || defaultBacking()),
          ...patch,
        },
      };
      if (Object.keys(next).length > 500)
        delete next[Object.keys(next).find((id) => id !== pieceBackingKey)];
      return next;
    });
  }
  // A two-bar taste of the generated backing (with the written piano part)
  // from the current bar, heard inside the accompaniment panel.
  const backingPreview = useRef({ timer: 0, token: null });
  function stopBackingPreview() {
    clearTimeout(backingPreview.current.timer);
    backingPreview.current.token = null;
    backingAudio.stop();
    if (!transport.current.playing) piano.stopPlayback();
  }
  async function previewBacking() {
    stop();
    stopBackingPreview();
    const events = backingPlan.events;
    if (backing.source !== "score" || !events.length) return 0;
    const token = Symbol();
    backingPreview.current.token = token;
    await piano.init();
    await backingAudio.prepare();
    if (backingPreview.current.token !== token) return 0;
    let bar = Math.min(
      score.measures,
      measureAt(score, Math.max(0, transport.current.beat)),
    );
    const barHas = (b) =>
      events.some(
        (e) => e.beat >= barStart(score, b) - 1e-6 && e.beat < barEnd(score, b),
      );
    if (!barHas(bar)) bar = measureAt(score, events[0].beat);
    const from = barStart(score, bar);
    const to = Math.min(
      score.duration,
      barEnd(score, Math.min(score.measures, bar + 1)),
    );
    const slice = events.filter((e) => e.beat >= from - 1e-6 && e.beat < to);
    const melody = pianoNotes.filter(
      (n) =>
        (hand === "both" || n.hand === hand) &&
        !backingSourceIds.has(n.id) &&
        n.beat >= from - 1e-6 &&
        n.beat < to,
    );
    await backingAudio.warm(slice);
    await piano.warm(
      melody.map((n) => ({ midi: n.midi, velocity: playVelocity(n, hand) })),
    );
    if (backingPreview.current.token !== token) return 0;
    backingAudio.setVolume(backing.volume);
    const lead = 0.08;
    for (const e of slice)
      backingAudio.play(
        e,
        secondsBetween(
          playScore,
          e.beat,
          Math.min(e.beat + e.duration, to),
          speed,
        ),
        lead + secondsBetween(playScore, from, e.beat, speed),
      );
    for (const n of melody)
      piano.play(
        n.midi,
        soundSeconds(
          playScore,
          speed,
          n.beat,
          Math.min(n.beat + n.duration, to),
          to,
          n,
        ),
        playVelocity(n, hand),
        lead +
          secondsBetween(playScore, from, n.beat, speed) +
          (n.pianoDelay || 0),
      );
    const seconds = lead + secondsBetween(playScore, from, to, speed) + 0.6;
    backingPreview.current.timer = setTimeout(() => {
      if (backingPreview.current.token === token) stopBackingPreview();
    }, seconds * 1000);
    return seconds;
  }
  function maestroAction(
    action,
    expectedScore = score,
    { keepConversation = false, lesson = null } = {},
  ) {
    const scoped = [
      "seek-bar",
      "repeat-bars",
      "set-speed",
      "set-hand",
      "set-mode",
    ];
    if (scoped.includes(action.type) && expectedScore !== score)
      return {
        message: "The piece has changed. Ask again for the current score.",
        applied: false,
      };
    const validBar = (b) =>
      Number.isInteger(b) && b >= 1 && b <= score.measures;
    const lessonPassage =
      lesson &&
      lesson.scoreId === (score.id || null) &&
      validBar(lesson.from) &&
      validBar(lesson.to) &&
      lesson.from <= lesson.to;
    const alignLesson = () => {
      if (lessonPassage) repeatBars(lesson.from, lesson.to);
    };
    const passageReceipt = lessonPassage
      ? ` Ready at ${lesson.from === lesson.to ? `bar ${lesson.from}` : `bars ${lesson.from}–${lesson.to}`}; playback is paused.`
      : "";
    switch (action.type) {
      case "open-piece": {
        const piece = maestroPieces.find((p) => p.id === action.pieceId);
        if (!piece)
          return {
            message: "That piece is no longer in Library. Search again.",
            applied: false,
          };
        const bar = Math.max(
          1,
          Math.min(piece.measures, Math.trunc(action.bar) || 1),
        );
        openAt(piece, bar);
        setModal(null);
        notify(`${piece.title} · bar ${bar}. Press Play when ready.`);
        return {
          applied: true,
          message: `Opened ${piece.title} at bar ${bar}. Press Play when ready.`,
        };
      }
      case "seek-bar":
        if (!validBar(action.bar))
          return {
            applied: false,
            message: `Choose a bar from 1 to ${score.measures}.`,
          };
        seekReading(barStart(score, action.bar));
        setView("practice");
        if (!keepConversation) setModal(null);
        notify(`Bar ${action.bar} · ${score.title}`);
        return {
          applied: true,
          message: `Moved to bar ${action.bar} of ${score.title}.`,
        };
      case "repeat-bars":
        if (
          !validBar(action.from) ||
          !validBar(action.to) ||
          action.from > action.to
        )
          return {
            applied: false,
            message: `Choose an ordered bar range from 1 to ${score.measures}.`,
          };
        repeatBars(action.from, action.to);
        setView("practice");
        if (!keepConversation) setModal(null);
        notify(
          `Repeat bars ${action.from}–${action.to}. Press Play when ready.`,
        );
        return {
          applied: true,
          message: `Repeating bars ${action.from}–${action.to}. Press Play when ready.`,
        };
      case "set-speed": {
        const value = SPEEDS.find((v) => Math.abs(v - action.speed) < 1e-8);
        if (value === undefined)
          return {
            applied: false,
            message: "Choose a speed from 25% to 125%, in 5% steps.",
          };
        stop();
        setSpeed(value);
        alignLesson();
        return {
          applied: true,
          message: `Speed set to ${Math.round(value * 100)}%.${lessonPassage ? passageReceipt : " Your position is unchanged."}`,
        };
      }
      case "set-hand":
        if (!["left", "right", "both"].includes(action.hand))
          return {
            applied: false,
            message: "Choose left hand, right hand, or both hands.",
          };
        stop();
        setHand(action.hand);
        if (lessonPassage) alignLesson();
        else restartReading();
        return {
          applied: true,
          message: `${action.hand === "both" ? "Both hands" : action.hand === "left" ? "Left hand" : "Right hand"} selected.${lessonPassage ? passageReceipt : ` Returned to the start of ${loop ? "the repeat" : "the piece"}.`}`,
        };
      case "set-mode":
        if (!["listen", "wait", "perform"].includes(action.mode))
          return {
            applied: false,
            message: "Choose Listen & follow, Wait for me, or Play in time.",
          };
        stop();
        setMode(action.mode);
        if (lessonPassage) alignLesson();
        else restartReading();
        return {
          applied: true,
          message: `${{ listen: "Listen & follow", wait: "Wait for me", perform: "Play in time" }[action.mode]} selected.${lessonPassage ? passageReceipt : " Press Play after closing this panel."}`,
        };
      case "navigate":
        if (
          !["practice", "library", "exercises", "progress"].includes(
            action.view,
          )
        )
          return { applied: false, message: "That screen is not available." };
        stop();
        setView(action.view);
        setModal(null);
        return { applied: true, message: `Opened ${action.view}.` };
      case "open-settings":
        stop();
        setModal("settings");
        return { applied: true, message: "Opened practice settings." };
      case "import-score":
        stop();
        setImportError("");
        setModal("import");
        return {
          applied: true,
          message: "Choose a score to add to your library.",
        };
      case "show-help":
        if (action.topic === "numbers") {
          stop();
          setModal("guide");
          return {
            applied: true,
            message: "Opened the guide to numbers and octaves.",
          };
        }
        return {
          message:
            "Find a piece, resume practice, go to a bar, repeat bars, slow down, or choose a hand.",
        };
      default:
        return {
          applied: false,
          message: "Try a piece title or a practice command.",
        };
    }
  }
  const companionProfile = companionFor(companion);
  // One calm neutral palette unless the reader opts into colour: the
  // companion's room ("companion") or one custom theme. The companion itself
  // shows through its avatar, the roaming buddy and the chat.
  const roomStyleActive = colours === "companion";
  const colourMode =
    colours === "neutral" || colours === "companion" ? colours : "custom";
  const colourTheme =
    colours === "companion"
      ? companionProfile.theme
      : colours === "neutral"
        ? "neutral"
        : colours;
  const petName = companionProfile.name;
  function openCompanions() {
    companionModel.cancel();
    stop();
    clearTimeout(toastTimer.current);
    setToast("");
    clearTimeout(resultsTimer.current);
    resultsToken.current = null;
    setModal("companion");
  }
  function chooseColours(choice) {
    setColours(choice);
    // Older builds read the top-level theme; keep it pointing at the room.
    if (choice !== "neutral" && choice !== "companion") setTheme(choice);
  }
  const firstRun = history.length === 0 && !score.exercise;
  // The welcome is for an empty library only; anyone with pieces of their own
  // goes straight to the music.
  const showWelcome =
    coach && !welcomeSeen && firstRun && libraryLoaded && library.length === 0;
  const midiConnected =
    midiStatus !== "Connect keyboard" && midiStatus !== "No keyboard found";
  const inLibrary = library.some((x) => x.id === score.id);
  const recommended = useMemo(() => recommendedLevel(history), [history]);
  // Sheet music: eight bars at a time on a desktop window, four on a narrow
  // one; engraved larger when the keyboard is put away.
  const sheetPassage = score.measures <= 8 ? score.measures : studio ? 8 : 4;
  const sheetZoom = studio && keyboardCollapsed ? 1.1 : 0.85;
  // Saved passages of this piece (repeats to come back to).
  const passages = (score.id && journal.pieces[score.id]?.passages) || [];
  const passageSaved = passages.some(([a, b]) => a === loopA && b === loopB);
  // Where this piece keeps tripping you: the journal's judged passes.
  const pieceSpots = (score.id && journal.pieces[score.id]?.spots) || null;
  const spots = useMemo(
    () => troubleSpots(pieceSpots, { measures: score.measures }),
    [pieceSpots, score.measures],
  );
  const spotMap = useMemo(
    () => spotBars(pieceSpots, score.measures),
    [pieceSpots, score.measures],
  );
  // Where this piece was left last time, offered while at its start, and
  // only from the middle (not bar 1, not a piece that was finished).
  const resumeBarRaw =
    !playing && beat <= 1e-6 && score.id && journal.pieces[score.id]
      ? Math.min(journal.pieces[score.id].bar, score.measures)
      : 0;
  const resumeBar =
    resumeBarRaw > 1 && resumeBarRaw < score.measures - 1 ? resumeBarRaw : 0;
  // Both clock figures read the written tempo, so the total never jitters
  // and the elapsed time cannot pass it under an expressive reading.
  const time = secondsAt(score, Math.max(0, beat));
  const totalTime = secondsAt(score, score.duration);
  const label = (m) =>
    labels === "letters"
      ? noteName(m, flats)
      : labels === "solfege"
        ? solfege(m, tonic, flats)
        : degree(m, tonic, flats);
  // What to play now, above the keys where the eyes already are.
  const statusText = playing
    ? mode === "perform"
      ? performCount
        ? "Count in · " + performCount
        : "Play in time · keep the pulse"
      : beat < 0
        ? "Count in · " + countInNumber(score, beat)
        : mode === "wait"
          ? "Waiting for your notes"
          : "Listen and read ahead"
    : lastResult
      ? `Last run ${Math.round(lastResult.accuracy * 100)}% right · ${Math.round(lastResult.precision * 100)}% on time`
      : mode === "perform"
        ? "Play starts a count-in from this bar"
        : mode === "wait" && sessionHits > 0
          ? `${sessionHits} notes · ${Math.round((sessionHits / (sessionHits + sessionMisses)) * 100)}% accuracy`
          : // Only the number score's notes can be clicked.
            readingView === "numbers"
            ? "Click a note to start there"
            : "Click the map below to start elsewhere";
  const countNow = playing
    ? mode === "perform"
      ? performCount
      : beat < 0
        ? countInNumber(score, beat)
        : 0
    : 0;
  const maestroBpm = bpmAt(score, Math.max(0, beat)) * speed;
  const maestroMotionStyle = useMemo(
    () => ({
      "--beethoven-beat-duration": `${60 / maestroBpm}s`,
    }),
    [maestroBpm],
  );
  // 701–899 px windows lay the practice screen out like the studio too
  // (PRA-11), so the Numbers score reads as a strip or a tape there as well.
  const [narrowStudio, setNarrowStudio] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(
          "(min-width: 701px) and (max-width: 899.98px) and (min-height: 560px)",
        ).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 701px) and (max-width: 899.98px) and (min-height: 560px)",
    );
    const change = () => setNarrowStudio(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const studioLayout = studio || narrowStudio;
  // Seconds per beat for CSS (motion keys the Play ring and count-in to it).
  const practiceBeatStyle = useMemo(
    () => ({ "--beat-s": `${(60 / Math.max(20, maestroBpm)).toFixed(3)}s` }),
    [maestroBpm],
  );
  // The cue's word. Wait for me says it is your turn; any word stays at
  // least 300 ms so NEXT and REST do not flicker between quick notes.
  const rawCueLabel = finished
    ? "FINISHED"
    : holding
      ? "HOLD"
      : mode === "wait" && playing && currentNotes.length
        ? "YOUR TURN"
        : currentNotes.length
          ? "NEXT"
          : "REST";
  const [cueLabel, setCueLabel] = useState(rawCueLabel);
  const cueLabelAt = useRef(0);
  useEffect(() => {
    if (rawCueLabel === cueLabel) return;
    const wait = Math.max(0, 300 - (performance.now() - cueLabelAt.current));
    const timer = setTimeout(() => {
      cueLabelAt.current = performance.now();
      setCueLabel(rawCueLabel);
    }, wait);
    return () => clearTimeout(timer);
  }, [rawCueLabel, cueLabel]);
  // A clean bar just played: { id, bar } for the strike-line glint (C7).
  const [chime, setChime] = useState(null);
  const chimeSeq = useRef(0),
    chimeAt = useRef(-Infinity),
    chimeBar = useRef(0);
  useEffect(() => {
    // Never in Listen & follow; a fresh run starts with no marks.
    if (!playing || mode === "listen") {
      barMarks.current.clear();
      chimeBar.current = 0;
      return;
    }
    const prev = chimeBar.current;
    chimeBar.current = maestroBar;
    if (!prev || prev === maestroBar) return;
    const entry = barMarks.current.get(prev);
    if (mode === "wait" && entry && entry.hits + entry.problems > 0)
      passBuffer.current.push({ bar: prev, clean: !entry.problems });
    for (const bar of [...barMarks.current.keys()])
      if (bar !== maestroBar) barMarks.current.delete(bar);
    const now = performance.now();
    if (
      entry &&
      entry.hits > 0 &&
      !entry.problems &&
      now - chimeAt.current >= 2000
    ) {
      chimeAt.current = now;
      setChime({ id: ++chimeSeq.current, bar: prev });
    }
  }, [maestroBar, playing, mode]);
  // Times round the repeated bars; the loop pill counts from the second.
  const [loopPasses, setLoopPasses] = useState(1);
  useEffect(() => setLoopPasses(1), [loop, loopA, loopB, score]);
  // The speed ladder brightens the speed pill instead of a notice.
  const [speedBump, setSpeedBump] = useState(false);
  const [statusFlash, setStatusFlash] = useState("");
  const speedBumpTimer = useRef(),
    statusFlashTimer = useRef();
  // A short line in place of the status text (ladder, focus, tips).
  function flashStatus(text, ms) {
    setStatusFlash(text);
    clearTimeout(statusFlashTimer.current);
    statusFlashTimer.current = setTimeout(() => setStatusFlash(""), ms);
  }
  function ladderStep(next) {
    setSpeedBump(true);
    clearTimeout(speedBumpTimer.current);
    speedBumpTimer.current = setTimeout(() => setSpeedBump(false), 600);
    if (next >= 1 - 1e-9) flashStatus("Full speed · lovely work", 2400);
  }
  // Focus mode from the stage button or Z; entering says how to leave.
  function changeFocus(next) {
    withTransition(() => setFocus(next));
    if (next) flashStatus("Esc leaves focus", 2000);
  }
  // The third mouse click on Play offers the Space key, once ever.
  const playClicks = useRef(0);
  function playClicked(event) {
    if (event?.detail > 0 && ++playClicks.current === 3) {
      let seen = true;
      try {
        seen = localStorage.getItem("luma.tip.space") === "1";
        if (!seen) localStorage.setItem("luma.tip.space", "1");
      } catch {
        seen = false;
      }
      if (!seen) flashStatus("Space plays · ? shows all keys", 4000);
    }
    start();
  }
  // The next reading view for V: Numbers → Sheet → Falling notes.
  function cycleView() {
    const views = ["numbers", "sheet", "falling"];
    const next = views[(views.indexOf(readingView) + 1) % views.length];
    withTransition(() => setReadingView(next));
  }
  const statusShown = statusFlash || statusText;
  // A finish-card choice: set up, then play once the new settings render.
  function playFromFinish(prepare) {
    prepare();
    setTimeout(() => handlers.current.start(), 0);
  }
  // Beats in the count-in bar (the stage shows that many dots).
  const countBeats = useMemo(
    () =>
      Math.max(
        1,
        ...metronomeEvents(score, -countInLength(score) - 1e-6, -1e-6).map(
          (e) => e.count,
        ),
      ),
    [score],
  );
  let maestroCue = maestroPlayingCue({
    guide: maestroGuide,
    bar: maestroBar,
    playing,
    mode,
    count: countNow,
    finished,
  });
  // The cue chip and the finish line name the same thing.
  if (finished)
    maestroCue = {
      ...maestroCue,
      title: loop ? "Phrase complete" : "Piece complete",
    };
  const cue = (
    <div className="reader-cue stage-cue" aria-label="Next notes">
      <div className="reader-cue-label">
        <span>
          {cueLabel === "YOUR TURN" && (
            <i className="turn-dot" aria-hidden="true" />
          )}
          {cueLabel}
        </span>
        <small>
          Bar {Math.min(score.measures, measureAt(score, Math.max(0, beat)))}
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
        ) : finished ? (
          // The end is a moment, with a next step (PRA-7).
          <div className="finish-card" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <strong>
              {loop
                ? `Bars ${loopA}–${loopB} · pass ${loopPasses}`
                : "Piece complete"}
            </strong>
            <small>
              {/* How long it lasts at this speed, not as written. */}
              {fmt(
                (loop
                  ? secondsAt(score, barEnd(score, loopB)) -
                    secondsAt(score, barStart(score, loopA))
                  : totalTime) / speed,
              )}{" "}
              at {Math.round(speed * 100)}%
            </small>
            <button
              type="button"
              className="pill primary"
              onClick={() => playFromFinish(restartReading)}
            >
              Play again <kbd>Space</kbd>
            </button>
            {speed < 1 - 1e-9 && (
              <button
                type="button"
                className="pill"
                onClick={() =>
                  playFromFinish(() => {
                    changeSpeed(1);
                    restartReading();
                  })
                }
              >
                Again at {Math.min(100, Math.round(speed * 100) + 5)}%
              </button>
            )}
            {mode !== "perform" && (
              <button
                type="button"
                className="pill"
                onClick={() =>
                  playFromFinish(() => {
                    setModeNow("perform");
                    restartReading();
                  })
                }
              >
                Play in time
              </button>
            )}
          </div>
        ) : (
          <span className="reader-finished">Rest</span>
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
      {coach ? (
        <>
          <span className="maestro-live-status" role="status" key={statusShown}>
            {statusShown}
          </span>
          <span
            className="maestro-stage-cue"
            aria-label={`${companionProfile.name} guidance: ${practiceCue || maestroCue.title}`}
            title={practiceCue || `${maestroCue.title}. ${maestroCue.text}`}
            role={practiceCue ? "status" : undefined}
          >
            <span>
              <strong>{practiceCue || maestroCue.title}</strong>
              <small>
                {playing
                  ? `Bar ${maestroBar} · ${mode === "listen" ? "Listen & follow" : mode === "wait" ? "Wait for me" : "Play in time"}`
                  : `${companionProfile.name} · practice tips`}
              </small>
            </span>
          </span>
        </>
      ) : (
        <span className="reader-play-status" role="status" key={statusShown}>
          {statusShown}
        </span>
      )}
    </div>
  );
  return (
    <>
    <div
      inert={recoveringAudio ? true : undefined}
      aria-busy={recoveringAudio || undefined}
      data-screen={view}
      data-companion={companion}
      data-companion-style={roomStyleActive ? companion : colourMode}
      data-colours={colourMode}
      data-transport={
        playing
          ? countNow > 0
            ? "count"
            : "playing"
          : finished
            ? "finished"
            : "idle"
      }
      data-mode={mode}
      className={`app theme-${colourTheme}${focus && view === "practice" ? " focus-mode" : ""}${companionOpen && !companionMinimized ? " companion-docked" : ""}`}
    >
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
          <nav
            className={`app-nav${navPill ? " measured" : ""}`}
            aria-label="Main navigation"
            ref={navRef}
          >
            <span
              className="nav-indicator"
              aria-hidden="true"
              style={navPill}
            />
            {[
              ["practice", "Practice", Piano],
              ["exercises", "Exercises", Dices],
              ["library", "Library", LibraryBig],
              ["progress", "Progress", ChartColumn],
            ].map(([id, title, Icon]) => (
              <button
                key={id}
                data-view={id}
                className={view === id ? "selected" : ""}
                aria-current={view === id ? "page" : undefined}
                onClick={() => {
                  if (id !== "practice") stop();
                  setView(id);
                }}
              >
                <Icon size={15} strokeWidth={2} aria-hidden="true" />
                <span>{title}</span>
              </button>
            ))}
          </nav>
          <div className="app-bar-actions">
            {!modal && (
              <ColourPicker
                value={colours}
                onChange={chooseColours}
                companion={companionProfile}
                disabled={settingsLoading}
              />
            )}
            <button
              className="maestro-launcher"
              aria-expanded={companionOpen && !companionMinimized}
              aria-controls="luma-companion"
              aria-label={companionProfile.name}
              title={`${companionProfile.name} · find music and continue practice`}
              onClick={openMaestro}
              disabled={settingsLoading}
            >
              <CompanionPortrait character={companion} mood="idle" />
              <span>{companionProfile.name}</span>
            </button>
            <button
              className={`midi-status${midiConnected || micActive ? " connected" : ""}`}
              aria-label="Connect piano"
              title="Piano input · microphone or USB / MIDI"
              onClick={() => { stop(); setModal('piano-input'); }}
            >
              {micActive ? <Mic size={14}/> : <Keyboard size={14} />}
              <span>
                {micActive ? 'Microphone on' : midiStatus === "Connect keyboard"
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
              <strong>Some saved settings could not be loaded.</strong>
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
          <section
            className={`practice-screen studio${readingView === "falling" ? " studio-falling" : ""}${keyboardCollapsed && readingView !== "falling" ? " studio-keys-hidden" : ""}`}
            style={practiceBeatStyle}
            aria-label="Practice"
          >
            {(micActive || microphone.phase === 'error') && <div className="microphone-practice-status" role="status" data-supported={microphone.detector?.supported}>
              <Mic size={16}/><meter aria-label="Microphone signal" min="0" max="0.12" value={microphone.detector?.rms || 0}/>
              <p>{microphone.error || microphoneTargetMessage(microphone.detector) ||
                (microphone.phase === 'requesting' ? 'Waiting for microphone permission…' :
                  microphone.detector?.calibrating || microphone.detector?.needsQuiet ? 'A quiet moment first, then play the highlighted keys.' :
                  playing ? 'Listening · play the highlighted keys · pedal up' : 'Microphone ready · press Play to begin')}
                {microphone.phase === 'listening' && ' · App sound off'}</p>
              <button className="secondary small" onClick={() => micCoach.current?.observe({ kind: 'help' })} disabled={!playing}>Pet tip</button>
              <button className="secondary small" onClick={disconnectMicrophone}>Stop microphone</button>
            </div>}
            <header className="piece-header reader-score-heading">
              <div className="piece-info">
                <h1 title={score.title}>{score.title}</h1>
                <p className="piece-meta">
                  <span className="piece-composer" title={score.composer}>
                    {score.composer}
                  </span>
                  {prep.key && <span>{prep.key}</span>}
                  {prep.signature && <span>{prep.signature}</span>}
                  <span
                    className="piece-tempo-detail"
                    title={
                      tempoRun.length > 1
                        ? "The tempo changes during the piece; playback follows it"
                        : undefined
                    }
                  >
                    ♩ = {tempoRun[0]}
                    {tempoRun.length > 1 && tempoRun.at(-1) !== tempoRun[0]
                      ? ` → ${tempoRun.at(-1)}`
                      : ""}
                  </span>
                  <span className="piece-count-detail">
                    {score.measures} {score.measures === 1 ? "bar" : "bars"}
                  </span>
                </p>
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
                            notify("Saved to Library.", { tone: "success" });
                          } catch (e) {
                            notify(e.message, { tone: "error" });
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
                    ["numbers", "Number score", "Numbers"],
                    ["sheet", "Sheet music", "Sheet"],
                    ["falling", "Falling notes", "Falling notes"],
                  ].map(([id, title, short]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-label={title}
                      data-tip={title}
                      data-kbd="V"
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
                        withTransition(() => setReadingView(tabs[index]));
                        e.currentTarget.parentElement.children[index].focus();
                      }}
                      onClick={() =>
                        readingView !== id &&
                        withTransition(() => setReadingView(id))
                      }
                    >
                      {short}
                    </button>
                  ))}
                </div>
                <PracticeTools
                  onFocus={() => releaseInputSources("computer:")}
                  label="Piece"
                  icon={FileMusic}
                  className="score-tools"
                >
                  <p className="score-tools-title">
                    {score.title}
                    <small>{score.composer}</small>
                  </p>
                  <div className="piece-buttons">
                    {score.exercise && (
                      <button
                        className="secondary small"
                        title={`Generate an exercise at level ${exerciseOptions.level} (press N)`}
                        onClick={() =>
                          startExercise({ ...exerciseOptions, seed: undefined })
                        }
                      >
                        <Dices size={15} /> New exercise
                      </button>
                    )}
                    <div className="piece-glance">
                      <button
                        className={`icon-button${glanceOpen ? " on" : ""}`}
                        title="About this piece: key, hands and what to watch"
                        aria-label="About this piece"
                        aria-expanded={glanceOpen}
                        onClick={() => setGlanceOpen((open) => !open)}
                      >
                        <Info size={16} /> <span>About this piece</span>
                      </button>
                      <div className="piece-glance-panel" hidden={!glanceOpen}>
                        <ul className="prep-chips" aria-label="At a glance">
                          {prep.key && (
                            <li className="chip chip-key" title="Key signature">
                              {prep.key}
                              {prep.signatureText
                                ? ` · ${prep.signatureText}`
                                : ""}
                            </li>
                          )}
                          {prep.signature && (
                            <li className="chip" title="Time signature">
                              {prep.signature}
                            </li>
                          )}
                          <li className="chip" title="Quarter notes per minute">
                            ♩ = {tempoRun[0]}
                            {tempoRun.length > 1 &&
                            tempoRun.at(-1) !== tempoRun[0]
                              ? ` → ${tempoRun.at(-1)}`
                              : ""}
                          </li>
                          {prep.hands.right && (
                            <li
                              className="chip chip-right"
                              title="Right-hand range"
                            >
                              RH {prep.hands.right.low}–{prep.hands.right.high}
                            </li>
                          )}
                          {prep.hands.left && (
                            <li
                              className="chip chip-left"
                              title="Left-hand range"
                            >
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
                      </div>
                    </div>
                    <button
                      className="icon-button"
                      title="Review sheet and notes"
                      aria-label="Review sheet and notes"
                      data-close-tools
                      onClick={() => {
                        stop();
                        setModal("review");
                      }}
                    >
                      <FileMusic size={16} /> <span>Review notes</span>
                    </button>
                    <button
                      className="icon-button"
                      title="Export practice notes"
                      aria-label="Export practice notes"
                      data-close-tools
                      onClick={download}
                    >
                      <Download size={16} /> <span>Export</span>
                    </button>
                    <button
                      className="icon-button"
                      title="How to read"
                      aria-label="How to read"
                      data-close-tools
                      onClick={() => {
                        stop();
                        setModal("guide");
                      }}
                    >
                      <HelpCircle size={16} /> <span>Reading guide</span>
                    </button>
                  </div>
                </PracticeTools>
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
                  <Pet kind={companion} happy />
                </span>
                <div>
                  <strong>Start with five notes.</strong>
                  <span>
                    Play a short right-hand exercise, or import a score. Connect
                    your piano by microphone or USB / MIDI to check the notes you play.
                  </span>
                </div>
                <div className="welcome-actions">
                  <button
                    className="primary small"
                    onClick={() =>
                      startExercise({
                        ...exerciseOptions,
                        level: 1,
                        // The short right-hand piece promised above.
                        hands: "auto",
                        bars: "auto",
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
                    compact={
                      studioLayout && keyLane && !keyboardCollapsed && !focus
                    }
                    fit={
                      studioLayout &&
                      (focus || !(keyLane && !keyboardCollapsed))
                    }
                    follow={playing}
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
                        zoom={sheetZoom}
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
            <KeyboardGuide
              collapsed={keyboardCollapsed}
              onCollapsedChange={(v) =>
                withTransition(() => setKeyboardCollapsed(v))
              }
              scoreId={score.id}
              targets={currentNotes}
              upcoming={
                mode === "wait" || !playing ? upcoming?.notes || [] : []
              }
              active={active}
              soundEvents={soundEvents}
              soundEpoch={transport.current.start}
              pressed={pressed}
              velocities={keyVelocities}
              tonic={tonic}
              labels={labels}
              flats={flats}
              onNoteOn={noteOn}
              onNoteOff={noteOff}
              onRelease={releaseInputSources}
              laneNotes={mode === "wait" ? phraseNotes : listenNotes}
              rangeNotes={score.notes}
              clock={stageClock}
              speed={speed}
              countInSecondsPerBeat={
                transport.current.countIn?.secondsPerBeat ?? null
              }
              beat={beat}
              lookahead={rollBeats}
              playing={playing}
              mode={mode}
              view={readingView}
              lane={keyLane}
              onLaneChange={(v) => withTransition(() => setKeyLane(v))}
              hands={handDisplay !== "off"}
              handDisplay={handDisplay}
              onHandDisplayChange={setHandDisplay}
              onFingerHelpChange={(open) => {
                setFingerHelpOpen(open);
                if (open) {
                  releaseInputSources();
                  stop();
                }
              }}
              focus={focus}
              onFocusChange={changeFocus}
              score={score}
              flashes={flashes}
              cue={cue}
              count={countNow}
              countBeats={countBeats}
              chime={chime}
              dynamic={
                showDynamics && currentNotes.length
                  ? dynamicMark(
                      Math.max(...currentNotes.map((n) => n.velocity ?? 0.72)),
                    )
                  : null
              }
            />
            <div className="reader-controls control-dock">
              <div className="dock-row dock-map">
                <PieceTimeline
                  score={score}
                  beat={beat}
                  onSeek={seekReading}
                  loop={loop ? { first: loopA, last: loopB } : null}
                  coverage={
                    score.id ? journal.pieces[score.id]?.ranges || [] : []
                  }
                  passages={passages}
                  spots={spotMap}
                />
              </div>
              <div className="dock-row dock-main">
                <div className="dock-transport">
                  <button
                    className="icon-button"
                    aria-label="Start over"
                    data-tip={loop ? "Start this phrase again" : "Start over"}
                    data-kbd="R"
                    onClick={restartReading}
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Previous note"
                    data-tip="Previous note"
                    data-kbd=","
                    onClick={() => stepReading(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className={`play-button${playing ? " playing" : ""}`}
                    aria-label={playing ? "Pause" : "Play"}
                    title={playing ? "Pause (Space)" : "Play (Space)"}
                    onClick={playClicked}
                    disabled={loadingSound || settingsLoading}
                    data-loading={loadingSound || settingsLoading || undefined}
                  >
                    {playing ? (
                      <Pause size={20} fill="currentColor" />
                    ) : (
                      <Play size={20} fill="currentColor" />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next note"
                    data-tip="Next note"
                    data-kbd="."
                    onClick={() => stepReading(1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className={`icon-button ${loop ? "on" : ""}`}
                    aria-label="Toggle phrase loop"
                    aria-pressed={loop}
                    data-tip={
                      loop
                        ? `Repeating bars ${loopA}–${loopB} · click to stop`
                        : "Repeat a phrase"
                    }
                    data-kbd="B"
                    onClick={() => {
                      if (loop) clearRepeat();
                      else repeatBars(loopA, loopB);
                    }}
                  >
                    <Repeat2 size={19} />
                    {loop && (
                      <span className="transport-loop-range">
                        Bars {loopA}–{loopB}
                        {loopPasses > 1 ? ` · ×${loopPasses}` : ""}
                      </span>
                    )}
                  </button>
                </div>
                <div
                  className="segmented"
                  role="group"
                  aria-label="Practice mode"
                >
                  <button
                    className={mode === "listen" ? "selected" : ""}
                    aria-label="Listen & follow"
                    aria-pressed={mode === "listen"}
                    data-tip="Listen · the piano plays, you read ahead"
                    data-kbd="1"
                    onClick={() => {
                      rewindToBar();
                      setMode("listen");
                    }}
                  >
                    <Headphones size={14} />{" "}
                    <span className="mode-label">Listen</span>
                  </button>
                  <button
                    className={mode === "wait" ? "selected" : ""}
                    aria-label="Wait for me"
                    aria-pressed={mode === "wait"}
                    data-tip="Wait · the cursor waits for each right note"
                    data-kbd="2"
                    onClick={() => {
                      rewindToBar();
                      setMode("wait");
                    }}
                  >
                    <Keyboard size={15} />{" "}
                    <span className="mode-label">Wait</span>
                  </button>
                  <button
                    className={mode === "perform" ? "selected" : ""}
                    aria-label="Play in time"
                    aria-pressed={mode === "perform"}
                    data-tip="Perform · count-in, click and a report card"
                    data-kbd="3"
                    onClick={() => {
                      rewindToBar();
                      setMode("perform");
                    }}
                  >
                    <Timer size={15} />{" "}
                    <span className="mode-label">Perform</span>
                  </button>
                </div>
                <div className="dock-time">
                  <span className="dock-clock">
                    <strong>{fmt(time)}</strong>
                    <i>/</i>
                    {fmt(totalTime)}
                  </span>
                  {statusFlash ? (
                    <small className="dock-flash" aria-hidden="true">
                      {statusFlash}
                    </small>
                  ) : resumeBar ? (
                    <button
                      type="button"
                      className="dock-resume"
                      data-tip="Where you stopped last time"
                      data-kbd="⇧Space"
                      onClick={() => seekReading(barStart(score, resumeBar))}
                    >
                      <HistoryIcon size={11} aria-hidden="true" /> Resume bar{" "}
                      {resumeBar}
                    </button>
                  ) : (
                    <small>
                      {mode === "wait" && playing
                        ? `Waiting · bar ${Math.min(
                            score.measures,
                            measureAt(score, Math.max(0, beat)),
                          )}`
                        : `Bar ${Math.min(
                            score.measures,
                            measureAt(score, Math.max(0, beat)),
                          )} of ${score.measures}`}
                    </small>
                  )}
                </div>
                <div className="dock-settings">
                  <div
                    className="segmented hands"
                    role="radiogroup"
                    aria-label="Practice hand"
                    onKeyDown={(e) => {
                      const order = ["left", "both", "right"];
                      const step =
                        e.key === "ArrowRight" || e.key === "ArrowDown"
                          ? 1
                          : e.key === "ArrowLeft" || e.key === "ArrowUp"
                            ? -1
                            : 0;
                      if (!step) return;
                      e.preventDefault();
                      const i = (order.indexOf(hand) + step + 3) % 3;
                      rewindToBar();
                      setHand(order[i]);
                      e.currentTarget.children[i]?.focus();
                    }}
                  >
                    {[
                      ["left", "L", "Left hand"],
                      ["both", "Both", "Both hands"],
                      ["right", "R", "Right hand"],
                    ].map(([id, short, name]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        className={`hand-${id}${hand === id ? " selected" : ""}`}
                        aria-checked={hand === id}
                        aria-label={name}
                        tabIndex={hand === id ? 0 : -1}
                        data-tip={name}
                        onClick={() => {
                          if (hand === id) return;
                          rewindToBar();
                          setHand(id);
                        }}
                      >
                        {id !== "both" && (
                          <i className="hand-dot" aria-hidden="true" />
                        )}
                        {short}
                      </button>
                    ))}
                  </div>
                  <div className={`speed-control${speedBump ? " bump" : ""}`}>
                    <label htmlFor="speed">Practice speed</label>
                    <button
                      className="icon-button speed-step"
                      aria-label="Slower"
                      data-tip="Slower by 5%"
                      data-kbd="["
                      disabled={speed <= 0.25 + 1e-9}
                      onClick={() => changeSpeed(-1)}
                    >
                      <Minus size={14} />
                    </button>
                    <select
                      id="speed"
                      className="dock-select"
                      value={speed}
                      onChange={(e) => {
                        stop();
                        setSpeed(+e.target.value);
                      }}
                    >
                      {SPEEDS.map((x) => (
                        <option key={x} value={x}>
                          {Math.round(x * 100)}%
                        </option>
                      ))}
                    </select>
                    <span
                      className="speed-bpm"
                      title="Quarter notes per minute at this speed"
                    >
                      ♩{Math.round(score.bpm * speed)}
                    </span>
                    <button
                      className="icon-button speed-step"
                      aria-label="Faster"
                      data-tip="Faster by 5%"
                      data-kbd="]"
                      disabled={speed >= 1.25 - 1e-9}
                      onClick={() => changeSpeed(1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <PracticeTools
                    onFocus={() => releaseInputSources("computer:")}
                    label="Practice tools"
                    short="Tools"
                    summary={
                      backingActive
                        ? "伴奏 on"
                        : loop
                          ? `Bars ${loopA}–${loopB}`
                          : spots.length
                            ? `${spots.length} trouble spot${spots.length === 1 ? "" : "s"}`
                            : null
                    }
                    icon={SlidersHorizontal}
                    active={
                      backingActive
                        ? "Accompaniment on"
                        : loop
                          ? `Repeating bars ${loopA}–${loopB}`
                          : null
                    }
                    className="transport-tools"
                  >
                    <div className="practice-sound-tools">
                      <h3>Sound</h3>
                      <button
                        className={`backing-launcher${backingActive ? " on" : ""}`}
                        data-close-tools
                        aria-label="Accompaniment"
                        aria-haspopup="dialog"
                        title={`伴奏 · ${backingActive ? (mode === "wait" ? "Paused in Wait for me" : "On") : "Off"}`}
                        disabled={settingsLoading || !pieceBackingKey}
                        onClick={openBacking}
                      >
                        <Music2 size={17} />
                        <span className="backing-name">
                          伴奏 <small>Accompaniment</small>
                        </span>
                        <span
                          className={`tool-state${backingActive ? " on" : ""}`}
                        >
                          {backingActive
                            ? mode === "wait"
                              ? "Paused"
                              : "On"
                            : "Off"}
                        </span>
                      </button>
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
                          {volume ? (
                            <Volume2 size={17} />
                          ) : (
                            <VolumeX size={17} />
                          )}
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
                        <output className="volume-value" aria-hidden="true">
                          {Math.round(volume * 100)}%
                        </output>
                      </div>
                      <div className="sound-check">
                        <div className="sound-check-actions">
                          <button type="button" className="secondary small" disabled={settingsLoading || micActive || testingSound || recoveringAudio} onClick={testPianoSound}>
                            <Volume2 size={15} aria-hidden="true" />{testingSound ? "Preparing…" : "Test sound"}
                          </button>
                          <button type="button" className="text-action" disabled={settingsLoading || recoveringAudio || testingSound} onClick={recoverAudio} title="Save your place and reopen the window. Playback stays paused.">
                            <RotateCcw size={14} aria-hidden="true" />{recoveringAudio ? "Restarting…" : "Recover audio"}
                          </button>
                        </div>
                        <p role="status" aria-live="polite">{micActive ? "Piano sound is off while the microphone listens. Stop the microphone to hear the app." : soundMessage || "Try three piano notes through your selected Mac output."}</p>
                      </div>
                      {hand !== "both" && !backingActive && (
                        <button
                          className={`icon-button accompany-toggle${accompany ? " on" : ""}`}
                          aria-pressed={accompany}
                          aria-label="Play the other hand softly"
                          title={
                            accompany
                              ? `The piano plays the ${hand === "right" ? "left" : "right"} hand softly while you practise (Listen & follow, Play in time)`
                              : `Only the ${hand} hand sounds`
                          }
                          onClick={() => {
                            stop();
                            setAccompany((v) => !v);
                          }}
                        >
                          <AudioLines size={16} />{" "}
                          <span>Play the other hand softly</span>
                        </button>
                      )}
                    </div>
                    <div className="practice-phrase-tools">
                      <h3>Passage</h3>
                      {!loop && (
                        <button
                          className="secondary small"
                          onClick={() => repeatBars(loopA, loopB)}
                        >
                          <Repeat2 size={15} /> Repeat a passage
                        </button>
                      )}
                      {loop && (
                        <div className="dock-row loop-options">
                          <Repeat2 size={14} /> Repeat bars{" "}
                          {/* Typed bar numbers apply once whole; leaving
                              the field settles the rest (typing 12 used to
                              give 22). */}
                          <DraftNumber
                            aria-label="Loop start bar"
                            min={1}
                            max={loopB}
                            settle={{ min: 1, max: score.measures }}
                            value={loopA}
                            onCommit={(a) => repeatBars(a, loopB)}
                            onSettle={(a) =>
                              repeatBars(...repeatFromFirst(a, loopB))
                            }
                          />{" "}
                          to{" "}
                          <DraftNumber
                            aria-label="Loop end bar"
                            min={loopA}
                            max={score.measures}
                            settle={{ min: 1, max: score.measures }}
                            value={loopB}
                            onCommit={(b) => repeatBars(loopA, b)}
                            onSettle={(b) =>
                              repeatBars(...repeatFromLast(loopA, b))
                            }
                          />
                          <button
                            type="button"
                            className={`ladder-toggle${ladder ? " on" : ""}`}
                            aria-pressed={ladder}
                            title="In Listen & follow, each time round the phrase plays 5% faster, up to 100%"
                            onClick={() => setLadder((v) => !v)}
                          >
                            <TrendingUp size={13} /> Speed up each pass
                          </button>
                          {score.id && (
                            <span
                              className="passage-list"
                              role="group"
                              aria-label="Saved passages"
                            >
                              {passages.map(([a, b]) => (
                                <span
                                  key={`${a}-${b}`}
                                  className={`passage-chip${a === loopA && b === loopB ? " current" : ""}`}
                                >
                                  <button
                                    type="button"
                                    title={`Repeat bars ${a}–${b}`}
                                    onClick={() => repeatBars(a, b)}
                                  >
                                    Bars {a}–{b}
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Forget bars ${a}–${b}`}
                                    title="Forget this passage"
                                    onClick={() =>
                                      setJournal((j) =>
                                        removePassage(j, {
                                          id: score.id,
                                          from: a,
                                          to: b,
                                        }),
                                      )
                                    }
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                              {!passageSaved &&
                                passages.length < JOURNAL_PASSAGES && (
                                  <button
                                    type="button"
                                    className="passage-save"
                                    title="Keep these bars as a passage to come back to (Library and the map show it)"
                                    onClick={() =>
                                      setJournal((j) =>
                                        savePassage(j, {
                                          id: score.id,
                                          title: score.title,
                                          from: loopA,
                                          to: loopB,
                                        }),
                                      )
                                    }
                                  >
                                    <Bookmark size={12} /> Keep bars {loopA}–
                                    {loopB}
                                  </button>
                                )}
                            </span>
                          )}
                          <span className="loop-hint">
                            Next / previous wraps within this phrase.
                          </span>
                        </div>
                      )}
                      {spots.length > 0 && (
                        <div
                          className="trouble-spots"
                          role="group"
                          aria-label="Trouble spots"
                        >
                          <span className="trouble-spots-label">
                            <AlertCircle size={12} aria-hidden="true" />{" "}
                            Trouble spots
                          </span>
                          {spots.map((spot) => (
                            <span
                              key={`${spot.first}-${spot.last}`}
                              className={`passage-chip trouble${loop && spot.first === loopA && spot.last === loopB ? " current" : ""}`}
                            >
                              <button
                                type="button"
                                title={`Repeat ${spotLabel(spot)} at 70% or slower · ${describeSpot(spot)}`}
                                aria-label={`Drill ${spotLabel(spot)}, ${describeSpot(spot)}`}
                                onClick={() =>
                                  drillSpot(spot.first, spot.last)
                                }
                              >
                                {spot.first === spot.last
                                  ? `Bar ${spot.first}`
                                  : `Bars ${spot.first}–${spot.last}`}
                                <small>{describeSpot(spot)}</small>
                              </button>
                              <button
                                type="button"
                                aria-label={`Forget ${spotLabel(spot)}`}
                                title="Forget this spot"
                                onClick={() =>
                                  forgetSpot(spot.first, spot.last)
                                }
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                          <span className="loop-hint trouble-hint">
                            Bars that slipped in Wait for me or Play in time.
                            Drill repeats them at 70% or slower; three clean
                            passes clear a bar.
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="practice-tools-shortcuts"
                      data-close-tools
                      onClick={() => handlers.current.openShortcuts()}
                    >
                      <Command size={14} aria-hidden="true" />
                      <span>Keyboard shortcuts</span>
                      <kbd>?</kbd>
                    </button>
                  </PracticeTools>
                </div>
              </div>
            </div>
          </section>
        )}
        {view === "exercises" && (
          <ExercisesScreen
            pet={companion}
            onCompanion={openMaestro}
            history={history}
            options={exerciseOptions}
            onChange={setExerciseOptions}
            recommended={recommended}
            onStart={startExercise}
          />
        )}
        {view === "library" && (
          <LibraryScreen
            pet={companion}
            onCompanion={openMaestro}
            library={library}
            lessons={LESSONS}
            history={history}
            journal={journal}
            query={query}
            onQuery={setQuery}
            currentId={score.id}
            onOpen={openAt}
            onOpenPassage={openPassage}
            onReview={(s) => {
              openAt(s, 1);
              setModal("review");
            }}
            onImport={() => {
              setImportError("");
              setModal("import");
            }}
            removed={recovery.removed}
            versions={recovery.versions}
            restoring={restoring}
            onRestoreRemoved={restoreRemoved}
            onVersions={openVersions}
            onRemove={async (s) => {
              try {
                const removal = await api("/scores/" + s.id, {
                  method: "DELETE",
                });
                await refreshLibrary();
                refreshRecovery();
                // Only a PDF import keeps an original on disk (Library /
                // imports); anything else is gone unless it is put back.
                // (When no recovery copy could be kept, Undo is the only way
                // back, and the notice says so — 2.44.)
                notify(
                  removal.kept === false
                    ? "Removed from your library. A recovery copy could not be kept, so use Undo now if this was a mistake."
                    : s.originalId
                      ? "Removed from your library. The original PDF stays in Library / imports."
                      : "Removed from your library.",
                  {
                    ttl: 8000,
                    action: {
                      label: "Undo",
                      run: () =>
                        api("/scores/" + s.id, json("PUT", s))
                          .then(refreshLibrary)
                          .then(refreshRecovery)
                          .then(() => notify("Back in your library."))
                          .catch((e) => notify(e.message, { tone: "error" })),
                    },
                  },
                );
              } catch (e) {
                notify(e.message);
              }
            }}
          />
        )}
        {view === "progress" && (
          <ProgressScreen
            pet={companion}
            onCompanion={openMaestro}
            history={history}
            stats={stats}
            journal={journal}
            goal={goal}
            pieces={libraryCollection(library, LESSONS).all}
            onBrowseLibrary={() => setView("library")}
            onBrowseExercises={() => setView("exercises")}
            recommended={recommended}
            onOpenRun={openRun}
            onOpenPiece={openAt}
            onOpenPassage={openPassage}
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
      {toast &&
        (() => {
          // Notice markup (C6): tone, icon, optional action, dismiss.
          const note =
            typeof toast === "string"
              ? { message: toast, tone: "info", id: 0 }
              : toast;
          const ToneIcon =
            note.tone === "success"
              ? CheckCircle2
              : note.tone === "error"
                ? AlertCircle
                : Info;
          return (
            <div
              className="toast"
              role="status"
              data-tone={note.tone || "info"}
              key={note.id}
            >
              <ToneIcon size={17} aria-hidden="true" />
              <span className="toast-text">
                {note.message}
                {note.detail && (
                  <small style={{ display: "block" }}>{note.detail}</small>
                )}
              </span>
              {note.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    clearTimeout(toastTimer.current);
                    setToast(null);
                    note.action.run();
                  }}
                >
                  {note.action.label}
                </button>
              )}
              <button
                onClick={() => {
                  clearTimeout(toastTimer.current);
                  setToast(null);
                }}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })()}
      {companionOpen && (
        <aside
          className={`companion-dock${companionMinimized ? " is-minimized" : ""}`}
          data-companion-dock
          id="luma-companion"
          role="complementary"
          aria-label={`${companionProfile.name} companion`}
          hidden={!!modal || companionMinimized}
          onFocusCapture={() => releaseInputSources("computer:")}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              closeMaestro();
            }
          }}
        >
          {companionMinimized && (
            <button
              className="companion-pocket"
              onClick={openMaestro}
              aria-label={`Chat with ${companionProfile.name}`}
            >
              <CompanionPortrait character={companion} mood="idle" />
              <span>
                {companionProfile.name}
                <small>Chat</small>
              </span>
              <MessageCircle size={17} />
            </button>
          )}
          <div className="companion-dock-body" hidden={companionMinimized}>
            <MaestroPanel
              conversation={companionConversation}
              model={companionModel}
              tonic={tonic}
              labels={labels}
              minimized={companionMinimized}
              suspended={!!modal}
              onClose={closeMaestro}
              onMinimize={({ returnFocus = false } = {}) => {
                companionModel.cancel();
                setCompanionMinimized(true);
                // Escape hands focus back to whatever opened the chat; the
                // Minimize button moves it to the pocket that replaces it
                // (which a view transition may render a frame or two later).
                const settle = (frames = 0) => {
                  const opener = maestroOpener.current;
                  const pocket = document.querySelector(".companion-pocket");
                  if (
                    returnFocus &&
                    opener?.isConnected &&
                    opener !== document.body &&
                    !opener.closest("[data-companion-dock],[inert],[hidden]") &&
                    opener.getClientRects().length
                  )
                    restoreFocus(opener, !!maestroOpener.pointer);
                  else if (pocket) pocket.focus();
                  else if (frames < 30)
                    requestAnimationFrame(() => settle(frames + 1));
                };
                requestAnimationFrame(() => settle());
              }}
              profile={companionProfile}
              onChangeCompanion={openCompanions}
              pieces={maestroPieces}
              currentScore={score}
              journal={journal}
              currentBar={maestroBar}
              loop={loop ? { from: loopA, to: loopB } : null}
              resumeBar={resumeBar}
              practiceGoal={goal}
              speed={speed}
              hand={hand}
              mode={mode}
              guide={maestroCue}
              tipsEnabled={coach}
              onTipsChange={setCoach}
              onAction={maestroAction}
              onBack={() => {
                setView("practice");
                closeMaestro();
              }}
            />
          </div>
        </aside>
      )}
      {modal === 'piano-input' && <Modal title="Piano input" close={() => { if (microphone.phase === 'requesting') disconnectMicrophone(); setModal(null); }}>
        <MicrophonePanel status={microphone} onStart={enableMicrophone} onStop={disconnectMicrophone} onMidi={() => { disconnectMicrophone(); setModal(null); void connectMIDI(); }}/>
      </Modal>}
      {modal === "results" && results && (
        <ResultsModal
          results={results}
          score={score}
          flats={flats}
          history={history}
          spots={spotMap}
          tips={coachingTips(results.result, {
            secondsPerBeat: 60 / (bpmAt(score, results.from ?? 0) * speed),
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
          wide
          className="settings-dialog"
          title="Settings"
          subtitle="Reading, sound and appearance. Changes save automatically."
          close={() => setModal(null)}
        >
          <div className="settings-grid">
            <section className="settings-section practice-settings reader-settings">
              <h3>
                <BookOpen size={15} /> Reading
              </h3>
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
              <h3>
                <Timer size={15} /> Timing
              </h3>
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
                <span>Metronome</span>
                <button
                  className={`toggle ${metronome ? "active" : ""}`}
                  role="switch"
                  aria-checked={metronome}
                  aria-label="Metronome"
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
              <h3>
                <AudioLines size={15} /> Sound
              </h3>
              {/* SCR-9: two equal segmented rows, one caption line each. */}
              <div className="settings-choice">
                <span className="settings-choice-label">Room</span>
                <Segmented
                  label="Piano room"
                  value={room}
                  onPick={setRoom}
                  choices={[
                    ["dry", "Dry"],
                    ["room", "Room"],
                    ["hall", "Hall"],
                  ]}
                />
                <small className="settings-caption" key={`room-${room}`}>
                  {room === "dry"
                    ? "No reverb: every note clear and close."
                    : room === "hall"
                      ? "Long reverb, like a concert hall."
                      : "Short reverb, like a quiet room."}
                </small>
              </div>
              <div className="settings-choice">
                <span className="settings-choice-label">Playing</span>
                <Segmented
                  label="Piano phrasing"
                  value={interpretation}
                  onPick={(id) => {
                    stop();
                    setInterpretation(id);
                  }}
                  choices={[
                    ["concert", "Expressive"],
                    ["written", "As written"],
                  ]}
                />
                <small
                  className="settings-caption"
                  key={`playing-${interpretation}`}
                  title={
                    interpretation === "concert" && performancePlan
                      ? `${performancePlan.character.note || performancePlan.character.summary} Tempo breathes only in Listen & follow; Play in time keeps a steady pulse.`
                      : undefined
                  }
                >
                  {interpretation === "concert"
                    ? performancePlan
                      ? `${performancePlan.character.name} ${performancePlan.character.zh || ""} · shaped to this piece.`
                      : "Phrasing, rubato and pedal shaped to each piece."
                    : "Exactly as notated, at a steady tempo."}
                </small>
              </div>
              <p className="settings-card-foot">
                Yamaha C5 grand · Six recorded touch levels · Stereo
              </p>
            </section>
            <section className="settings-section practice-settings reader-settings">
              <h3>
                <Goal size={15} /> Daily goal
              </h3>
              {(() => {
                // SCR-9: a ring for today, goal pills, and this week's dots.
                const todayMinutes =
                  journal.days[new Date().toLocaleDateString("en-CA")]
                    ?.minutes || 0;
                const common = [10, 15, 20, 30, 45, 60];
                const more = [5, 90, 120];
                return (
                  <div className="settings-goal">
                    <Ring
                      value={todayMinutes / goal}
                      size={56}
                      stroke={6}
                      className={todayMinutes >= goal ? "gilt" : ""}
                      label={`${Math.round(todayMinutes)} of ${goal} minutes today`}
                    >
                      <b>{Math.round(todayMinutes)}</b>
                    </Ring>
                    <div className="settings-goal-main">
                      <div className="settings-goal-pills">
                        <Segmented
                          label="Daily practice goal"
                          value={goal}
                          onPick={setGoal}
                          choices={common.map((m) => [
                            m,
                            String(m),
                            `${m} minutes a day`,
                          ])}
                        />
                        <select
                          aria-label="More daily goals"
                          className={more.includes(goal) ? "chosen" : ""}
                          value={more.includes(goal) ? goal : ""}
                          onChange={(e) =>
                            e.target.value && setGoal(+e.target.value)
                          }
                        >
                          <option value="">More…</option>
                          {more.map((m) => (
                            <option key={m} value={m}>
                              {m} min
                            </option>
                          ))}
                        </select>
                      </div>
                      <WeekDots journal={journal} goal={goal} />
                      <small className="settings-caption">
                        {Math.round(todayMinutes)} of {goal} minutes today
                        {todayMinutes >= goal ? " · goal reached" : ""}
                      </small>
                    </div>
                  </div>
                );
              })()}
            </section>
            <section className="settings-section practice-settings reader-settings settings-wide">
              <h3>
                <Palette size={15} /> Colours
              </h3>
              <p className="settings-caption colour-caption">
                Applies to every screen and the keyboard.
              </p>
              {/* Neutral first; hovering a palette previews it on the dialog. */}
              <div
                className="theme-previews room-previews colour-previews"
                role="group"
                aria-label="Colours"
              >
                {colourOptions(companionProfile).map(
                  ({ id, name, room: previewRoom }) => {
                    const on = colours === id;
                    const pick = () => chooseColours(id);
                    const preview = (e) =>
                      e.currentTarget
                        .closest(".modal")
                        ?.setAttribute("data-preview-room", previewRoom);
                    const revert = (e) =>
                      e.currentTarget
                        .closest(".modal")
                        ?.removeAttribute("data-preview-room");
                    return (
                      <button
                        key={id}
                        className={`${on ? "selected" : ""}${id === "companion" ? " room-companion" : ""}`}
                        aria-pressed={on}
                        onClick={pick}
                        onPointerEnter={preview}
                        onPointerLeave={revert}
                        onFocus={preview}
                        onBlur={revert}
                        disabled={settingsLoading}
                      >
                        <ThemePreview room={previewRoom} />
                        <span>{name}</span>
                      </button>
                    );
                  },
                )}
              </div>
            </section>
            <section className="settings-section practice-settings reader-settings settings-wide">
              <h3>
                <PawPrint size={15} /> Companion & help
              </h3>
              <div className="toggle-row">
                <span
                  title={`${companionProfile.name} shows short practice tips above the keys`}
                >
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
              <div className="toggle-row">
                <span
                  title={`${companionProfile.name} gives brief encouragement during microphone practice`}
                >
                  Practice encouragement
                </span>
                <button
                  className={`toggle ${buddy ? "active" : ""}`}
                  role="switch"
                  aria-checked={buddy}
                  aria-label="Practice encouragement"
                  onClick={() => setBuddy((v) => !v)}
                >
                  <i />
                </button>
              </div>
              <div className="reader-settings-links">
                <button className="secondary" onClick={openCompanions}>
                  <PawPrint size={16} /> Companions
                </button>
                <button className="secondary" onClick={() => setModal("guide")}>
                  <HelpCircle size={16} /> Reading guide
                </button>
                <button
                  className="secondary"
                  onClick={() => setModal("shortcuts")}
                >
                  <Command size={16} /> Keyboard shortcuts
                </button>
              </div>
            </section>
          </div>
          <SettingsHistory
            snapshots={snapshots}
            busy={restoring}
            onRestore={restoreSnapshot}
          />
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
          <p className="settings-about">
            Luma Keys {APP_VERSION} · your scores, settings and practice journal
            live in Desktop / Luma Keys / Library.
          </p>
        </Modal>
      )}
      {modal === "shortcuts" && (
        <Modal
          title="Keyboard shortcuts"
          subtitle="Available when you are not typing in a text field."
          className="shortcuts-dialog"
          close={() => setModal(null)}
        >
          <div className="shortcut-groups">
            {[
              [
                "Playback",
                [
                  [["Space"], "Play or pause"],
                  [["⇧", "Space"], "Back to where you stopped last time"],
                  [["R"], "Start over (or this phrase again)"],
                  [["[", "]"], "Slower / faster by 5%"],
                ],
              ],
              [
                "Moving around",
                [
                  [["←", "→"], "Back / forward 5 seconds"],
                  [[",", "."], "Previous / next note"],
                  [["⇧,", "⇧."], "Previous / next bar"],
                  [["V"], "Numbers → Sheet → Falling notes"],
                  [["Z"], "Focus mode on / off"],
                  [["Esc"], "Close a dialog, or leave focus mode"],
                ],
              ],
              [
                "Practice",
                [
                  [["1", "2", "3"], "Listen · Wait · Perform, from this bar"],
                  [["B"], "Repeat bars on / off"],
                  [["N"], "A new exercise at your level"],
                  [["?"], "This list"],
                ],
              ],
            ].map(([group, rows]) => (
              <section className="shortcut-group" key={group}>
                <h3>{group}</h3>
                <dl className="shortcut-list">
                  {rows.map(([keys, what]) => (
                    <div key={what}>
                      <dt>
                        {keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </dt>
                      <dd>{what}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <section className="shortcut-group">
              <h3>Computer piano</h3>
              <div className="shortcut-piano-row">
                <div
                  className="shortcut-piano"
                  role="img"
                  aria-label="A S D F G H J K play C4 to C5 on the white keys; W E, T Y U play the black keys"
                >
                  <div className="shortcut-piano-blacks" aria-hidden="true">
                    {["W", "E", "", "T", "Y", "U"].map((k, i) =>
                      k ? <kbd key={k}>{k}</kbd> : <i key={`gap${i}`} />,
                    )}
                  </div>
                  <div className="shortcut-piano-whites" aria-hidden="true">
                    {["A", "S", "D", "F", "G", "H", "J", "K"].map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </div>
                </div>
                <p>
                  C4 to C5 from the letter keys. <kbd>O</kbd> <kbd>L</kbd>{" "}
                  <kbd>P</kbd> <kbd>;</kbd> <kbd>'</kbd> carry on up to F5.
                </p>
              </div>
            </section>
          </div>
          <p className="subtle-note">
            On the keyboard guide, the arrow keys move between piano keys and
            Enter or Space plays the focused key.
          </p>
        </Modal>
      )}
      {modal === "backing" && (
        <Modal
          title="Accompaniment · 伴奏"
          subtitle="A backing part for this piece."
          close={() => setModal(null)}
        >
          <BackingPanel
            key={pieceBackingKey}
            score={score}
            config={backing}
            plan={backingPlan}
            mode={mode}
            onChange={changeBacking}
            onPreview={previewBacking}
            onStopPreview={stopBackingPreview}
          />
        </Modal>
      )}
      {modal === "import" && (
        <Modal
          title="Import a score"
          subtitle="PDF, MusicXML, MIDI or a Luma backup. Files stay on this Mac."
          close={() => setModal(null)}
        >
          <div
            className={`upload-drop ${importing ? "processing" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => {
              // SCR-10: the sheets fan out and the border firms up.
              if (!importing) e.currentTarget.dataset.dragging = "";
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                delete e.currentTarget.dataset.dragging;
            }}
            onDrop={(e) => {
              e.preventDefault();
              delete e.currentTarget.dataset.dragging;
              if (!importing) importFile(e.dataTransfer.files[0]);
            }}
          >
            {importing ? (
              <>
                {(() => {
                  // SCR-10: reading pages → finding notes → ready to review.
                  const text = activeImport?.progress || importProgress || "";
                  const step = /ready/i.test(text)
                    ? 3
                    : /note|stem|rhythm|assembl|prepar|saving|recogn|detect/i.test(
                          text,
                        )
                      ? 2
                      : 1;
                  return (
                    <ol className="import-steps" aria-label="Import progress">
                      {[
                        "Reading pages",
                        "Finding notes",
                        "Ready to review",
                      ].map((label, i) => (
                        <li
                          key={label}
                          className={
                            i + 1 < step
                              ? "done"
                              : i + 1 === step
                                ? "current"
                                : ""
                          }
                          aria-current={i + 1 === step ? "step" : undefined}
                        >
                          <i aria-hidden="true" />
                          {label}
                        </li>
                      ))}
                    </ol>
                  );
                })()}
                <span className="luma-loader" role="img" aria-label="Working">
                  <i />
                  <i />
                  <i />
                </span>
                <h3 aria-live="polite">
                  {activeImport?.progress || importProgress}
                </h3>
                <p>
                  {activeImport?.name && (
                    <>
                      <strong>{activeImport.name}</strong>
                      <br />
                    </>
                  )}
                  You can close this and keep playing. We’ll tell you when it’s
                  ready.
                  <br />
                  <small>
                    Quitting the app stops recognition; your PDF stays here for
                    a retry.
                  </small>
                </p>
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
              {pendingImports.map((job) => {
                // SCR-10: a finished import shows its new cover and asks
                // for a quick check before practice.
                const ready =
                  job.status === "done"
                    ? library.find((x) => x.id === job.scoreIds?.[0])
                    : null;
                return (
                  <article
                    className={`saved-import${ready ? " import-ready" : ""}`}
                    key={job.id}
                    data-import-id={job.id}
                  >
                    {ready ? (
                      <div className="import-ready-cover" aria-hidden="true">
                        <ScoreArtwork piece={ready} />
                      </div>
                    ) : (
                      <div className="saved-import-icon">
                        <FileMusic size={23} />
                      </div>
                    )}
                    <div className="saved-import-copy">
                      <strong>{ready?.title || job.name}</strong>
                      <span className="saved-import-state">
                        {job.status === "done"
                          ? ready
                            ? "Ready. Give the notes a quick check?"
                            : "Ready to review"
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
                          <>
                            <button
                              className="primary small"
                              disabled={!!jobAction}
                              onClick={() => reviewRecognized(job.id)}
                            >
                              {ready ? "Review first" : "Review notes"}{" "}
                              <ArrowRight size={14} />
                            </button>
                            {ready && (
                              <button
                                className="secondary small"
                                disabled={!!jobAction}
                                onClick={() => {
                                  openAt(ready, 1);
                                  setModal(null);
                                  void importAction(job.id, "dismiss");
                                }}
                              >
                                Open at bar 1
                              </button>
                            )}
                          </>
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
                );
              })}
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
                <strong>Use a clear scan</strong>
                <span>
                  Use a straight, high-contrast scan. Printed notation works
                  best.
                </span>
              </p>
            </div>
            <div>
              <FileText size={17} />
              <p>
                <strong>MusicXML and MIDI</strong>
                <span>Import it for the most reliable pitch and rhythm.</span>
              </p>
            </div>
            <div>
              <Heart size={17} />
              <p>
                <strong>Check the result</strong>
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
      {modal === "versions" && versionsOf && (
        <Modal title="Earlier versions" close={() => setModal(null)}>
          <VersionsList
            piece={
              library.find((x) => x.id === versionsOf.piece.id) ||
              versionsOf.piece
            }
            versions={versionsOf.versions}
            error={versionsOf.error}
            busy={restoring}
            onRestore={restoreVersion}
          />
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
          title="Companions"
          className="salon-dialog"
          close={() => setModal(null)}
          previewRoom={colours === "companion" ? companion : undefined}
        >
          <CompanionSalon
            current={companion}
            disabled={settingsLoading}
            onChoose={(id, useSound, origin) => {
              // SCR-8: the new room washes in from the Choose button (C11).
              // The only place a companion is chosen. It uses the raw
              // setters, because the wrapped setModal/setCompanionOpen would
              // start nested View Transitions and cancel the wipe.
              const selected = companionFor(id);
              const html = document.documentElement;
              if (origin) {
                html.style.setProperty("--wipe-x", `${origin.x}px`);
                html.style.setProperty("--wipe-y", `${origin.y}px`);
              }
              // Choosing a companion never recolours the app; only a reader
              // who matched colours to the companion sees the room wash in.
              const matched = colours === "companion";
              withTransition(
                () => {
                  stop();
                  setCompanion(selected.id);
                  if (useSound) setRoom(selected.room);
                  setModalNow(null);
                  setCompanionOpenNow(true);
                  setCompanionMinimizedNow(false);
                  notify(
                    matched
                      ? `${selected.name} joins you · ${selected.roomName}.`
                      : `${selected.name} joins you.`,
                    { tone: "success" },
                  );
                },
                matched ? "theme" : "layout",
              );
            }}
          />
        </Modal>
      )}
      {modal === "guide" && (
        <Modal
          wide
          title="How to read with Luma Keys"
          subtitle="Notes, practice modes and navigation."
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
                bars as staff notation, eight at a time.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Three ways to practise.</h3>
              <p>
                <strong>Listen & follow</strong> plays the piano while the music
                moves. <strong>Wait for me</strong> holds each note until you
                play it, so chords need every shown pitch.{" "}
                <strong>Play in time</strong> counts a bar in, keeps a click
                going, and grades pitch and timing bar by bar. The − and + by
                the speed (or <kbd>[</kbd> <kbd>]</kbd>) change it by 5%;
                nothing changes pitch. Settings → Sound chooses the room the
                piano plays in. Connect a USB MIDI keyboard with Connect piano;
                or choose Microphone for acoustic-piano practice in Wait mode. Microphone practice is best with one hand, C3–C6 and the pedal up. It checks clear new attacks and simple chords, and pauses on uncertain sounds.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Read the keyboard.</h3>
              <p>
                Notes fall onto the keys they belong to, right hand honey and
                left hand blue, and notes struck together are tied into one
                shape. The hands show a suggested fingering: their small badges
                mean 1 thumb, 2 index, 3 middle, 4 ring, 5 little finger. These
                differ from the pitch numbers on the score and keys. A filled
                badge is pressing; an outlined badge is preparing. The guide
                below the keys pairs each pitch with a circled finger number;
                “Hold” means keep that key down as other fingers move. Open
                “Finger guide” to explore both hands and their numbers.
                Fingering is a guide, not a substitute for comfortable technique
                or your teacher’s advice. The keyboard stays still as the hands
                move; turn the hands off with the hand icon. The gold lane on
                the right edge is the <strong>sustain pedal</strong>: “Ped.”
                where it goes down, a hook where it lifts, and the Ped. lamp
                lights while it is held. A gold edge and <strong>&gt;</strong>{" "}
                mark an <strong>accented</strong> note (sf). Dynamics are
                written on the left edge: <em>p</em>, <em>ff</em> where the
                level changes, and a hairpin marked cresc. or dim. where it
                swells or fades.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Find your way in a long piece.</h3>
              <p>
                The map above the transport is the whole piece: the right hand
                over the left, lit up to where you are. Point at it to see the
                bar and time; click or drag to go there. Repeat these bars, or
                click a bar number and Shift-click another, to loop a phrase;
                the report card can pick the weakest bars for you.{" "}
                <strong>Keep bars …</strong> saves a phrase as a passage to come
                back to (Library lists them), and{" "}
                <strong>Speed up each pass</strong> plays it 5% faster each time
                round in Listen & follow, up to full speed.{" "}
                <strong>Resume bar …</strong> takes you back to where you
                stopped last time, and the arrows in the keyboard's header
                (focus) give the music the whole window; Esc brings the rest
                back.
              </p>
            </article>
            <article>
              <span>05</span>
              <h3>Generate an exercise</h3>
              <p>
                The Exercises screen holds twelve levels. Start creates an
                exercise at the selected level; New exercise on the Practice
                screen (or the N key) does the same at your saved level. Keep in
                library saves the exercise. Three accurate Play in time runs
                recommend the next level; every level is available.
              </p>
            </article>
            <article>
              <span>06</span>
              <h3>Practice history</h3>
              <p>
                Progress shows your minutes each day against your daily goal,
                your streak, a calendar, and for each piece the bars you have
                played through. Library’s Continue picks a piece up where you
                left it. Scores, settings and the journal stay in Desktop / Luma
                Keys / Library. Press <kbd>?</kbd> for every shortcut.
              </p>
            </article>
          </div>
          <button className="primary" onClick={() => setModal(null)}>
            Back to the music <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
    {recoveringAudio && (
      <div className="audio-recovery-status" role="status" aria-live="polite">
        <p>Saving your place and restarting audio…</p>
      </div>
    )}
    </>
  );
}
