import { useCallback, useEffect, useRef, useState } from "react";
import { Hand, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import { rhythmFor, gradeRhythm } from "./companion-rhythm.mjs";
import { createRhythmSound } from "./rhythm-sound.mjs";
import "./companion-rhythm.css";

const ACTIVE = new Set(["preparing", "watch", "ready", "tapping"]);
const counts = ["1", "&", "2", "&", "3", "&", "4", "&"];
const markNames = {
  "on-time": "On time",
  early: "Early",
  late: "Late",
  missing: "Missed",
};

export default function CompanionRhythm({ profile, disabled, onMood }) {
  const pattern = rhythmFor(profile.id);
  const [bpm, setBpm] = useState(80);
  const [sound, setSound] = useState(true);
  const [phase, setPhase] = useState("idle");
  const [cue, setCue] = useState(-1);
  const [taps, setTaps] = useState([]);
  const [result, setResult] = useState(null);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const session = useRef(null);
  const generation = useRef(0);
  const preparing = useRef(false);
  const pad = useRef(null);
  const startButton = useRef(null);
  const active = ACTIVE.has(phase);

  const cleanup = useCallback(() => {
    generation.current++;
    preparing.current = false;
    const run = session.current;
    if (run) {
      cancelAnimationFrame(run.frame);
      clearTimeout(run.timer);
      run.audio.close();
      session.current = null;
    }
  }, []);

  const stop = useCallback(
    (next = "idle") => {
      cleanup();
      setPhase(next);
      setCue(-1);
      setTaps([]);
      setResult(null);
    },
    [cleanup],
  );

  useEffect(() => {
    const interrupt = () => {
      if (session.current || preparing.current) stop("interrupted");
    };
    const visibility = () => {
      if (document.hidden) interrupt();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", interrupt);
    return () => {
      cleanup();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", interrupt);
    };
  }, [cleanup, stop]);

  useEffect(() => {
    onMood(
      phase === "watch"
        ? "speaking"
        : phase === "ready" || phase === "tapping"
          ? "listening"
          : phase === "done"
            ? "happy"
            : "idle",
    );
    return () => onMood("idle");
  }, [phase, onMood]);

  useEffect(() => {
    if (phase === "ready" && document.activeElement === startButton.current)
      pad.current?.focus({ preventScroll: true });
  }, [phase]);

  function finish(run) {
    if (session.current !== run) return;
    setResult(gradeRhythm(pattern, run.taps, bpm));
    setTaps([...run.taps]);
    setPhase("done");
    setCue(-1);
    // Allow the last tap's short cue to release before disposing of the audio.
    clearTimeout(run.timer);
    run.phase = "done";
    run.timer = setTimeout(cleanup, 150);
  }

  async function start() {
    cleanup();
    const token = generation.current;
    preparing.current = true;
    setPhase("preparing");
    setTaps([]);
    setResult(null);
    setCue(-1);
    const audio = await createRhythmSound(sound);
    if (generation.current !== token) {
      audio.close();
      return;
    }
    preparing.current = false;
    setAudioUnavailable(sound && !audio.audible);
    const beatMs = 60000 / bpm;
    const origin = audio.now() + 250;
    const run = { audio, origin, phase: "watch", taps: [], frame: 0, timer: 0 };
    session.current = run;
    setPhase("watch");
    pattern.onsets.forEach((beat, i) =>
      audio.cue(origin + beat * beatMs, i === 0),
    );
    const update = () => {
      if (session.current !== run) return;
      const elapsed = (audio.now() - origin) / beatMs;
      if (elapsed >= pattern.beats + 0.5) {
        setCue(-1);
        setPhase("ready");
        run.phase = "ready";
        run.timer = setTimeout(() => stop("interrupted"), 20000);
        return;
      }
      setCue(
        elapsed < 0 || elapsed >= pattern.beats ? -1 : Math.floor(elapsed * 2),
      );
      run.frame = requestAnimationFrame(update);
    };
    run.frame = requestAnimationFrame(update);
  }

  function tap() {
    const run = session.current;
    if (!run || !["ready", "tapping"].includes(run.phase) || disabled) return;
    const now = run.audio.now();
    // Ignore duplicate hardware events, without discarding normal eighth notes.
    if (run.taps.length && now - run.taps.at(-1) < 70) return;
    if (!run.taps.length) {
      clearTimeout(run.timer);
      run.timer = setTimeout(
        () => finish(run),
        ((pattern.beats + 1.5) * 60000) / bpm,
      );
    }
    run.phase = "tapping";
    run.taps.push(now);
    run.audio.cue(now + 5, run.taps.length === 1);
    setTaps([...run.taps]);
    setPhase("tapping");
    if (run.taps.length === pattern.onsets.length) finish(run);
  }

  const status =
    phase === "watch"
      ? `Watch ${profile.name}`
      : phase === "preparing"
        ? "Getting ready…"
        : phase === "ready"
          ? "Your turn. Start when you’re ready."
          : phase === "tapping"
            ? "Keep the same rhythm."
            : phase === "done"
              ? result?.summary
              : phase === "interrupted"
                ? "Paused. Start again when you’re ready."
                : "Watch once, then tap it back.";
  return (
    <section
      className="rhythm-game"
      data-phase={phase}
      data-character={profile.id}
      data-taps={taps.length}
      aria-label={`Rhythm echo with ${profile.name}`}
    >
      <div className="rhythm-heading">
        <strong>{pattern.title}</strong>
        <span>4 beats · {pattern.onsets.length} taps</span>
      </div>
      <div
        className="rhythm-track"
        role="img"
        aria-label={`Tap on beats ${pattern.onsets.map((beat) => (Number.isInteger(beat) ? beat + 1 : `${Math.floor(beat) + 1} and`)).join(", ")}`}
      >
        {counts.map((count, i) => {
          const noteIndex = pattern.onsets.indexOf(i / 2);
          const tapped = noteIndex >= 0 && noteIndex < taps.length;
          return (
            <div
              key={i}
              className={`rhythm-cell${tapped ? " is-tapped" : ""}`}
              data-note={noteIndex >= 0}
              data-cued={cue === i}
              aria-hidden="true"
            >
              <span className="rhythm-pebble">{noteIndex >= 0 && <i />}</span>
              <small>{count}</small>
            </div>
          );
        })}
      </div>
      <div className="rhythm-status" role="status" aria-live="polite">
        {status}
      </div>
      <button
        ref={pad}
        type="button"
        className="rhythm-tap"
        aria-label="Tap rhythm"
        disabled={disabled || !["ready", "tapping"].includes(phase)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          tap();
        }}
        onKeyDown={(event) => {
          if ([" ", "Enter"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) tap();
          }
        }}
        onClick={(event) => {
          if (event.detail === 0) tap();
        }}
      >
        <Hand size={26} strokeWidth={1.5} />
        <span>
          {phase === "tapping"
            ? `${taps.length} / ${pattern.onsets.length}`
            : "Tap"}
        </span>
        <small>Space or click</small>
      </button>
      {result && (
        <div
          className="rhythm-result"
          role="group"
          data-matched={result.matched}
          data-total={result.total}
          aria-label={`${result.matched} of ${result.total} taps on time`}
        >
          {result.marks.map((mark) => (
            <span
              key={mark.index}
              role="img"
              aria-label={`Tap ${mark.index + 1}: ${markNames[mark.kind]}`}
              className="rhythm-mark"
              data-kind={mark.kind}
              title={`${mark.index + 1}: ${markNames[mark.kind]}`}
            >
              <i />
              {mark.index + 1}
            </span>
          ))}
          <small>Tap timing</small>
        </div>
      )}
      <div className="rhythm-settings">
        <label>
          <span>Speed</span>
          <select
            aria-label="Rhythm speed"
            value={bpm}
            disabled={disabled || active}
            onChange={(event) => {
              setBpm(Number(event.target.value));
              setResult(null);
              setPhase("idle");
            }}
          >
            <option value={60}>60 BPM</option>
            <option value={80}>80 BPM</option>
            <option value={100}>100 BPM</option>
          </select>
        </label>
        <label className="rhythm-sound">
          <input
            type="checkbox"
            aria-label="Rhythm sound"
            checked={sound}
            disabled={disabled || active}
            onChange={(event) => setSound(event.target.checked)}
          />
          <Volume2 size={15} /> Sound
        </label>
        <button
          ref={startButton}
          type="button"
          className="secondary rhythm-start"
          disabled={disabled}
          onClick={() => (active ? stop() : start())}
        >
          {active ? (
            <Square size={13} />
          ) : result ? (
            <RotateCcw size={14} />
          ) : (
            <Play size={14} />
          )}
          <span>
            {active ? "Stop rhythm" : result ? "Play again" : "Start rhythm"}
          </span>
        </button>
      </div>
      <p className="rhythm-footnote">
        {audioUnavailable
          ? "Sound is unavailable. You can follow the dots."
          : result
            ? "First tap sets the start. Coloured dots show early or late taps."
            : "Your first tap sets the start. This won’t change your piece."}
      </p>
    </section>
  );
}
