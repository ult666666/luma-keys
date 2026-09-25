import React, { useState, useEffect, useRef, useMemo } from "react";
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
} from "./music.mjs";
import { piano } from "./audio.js";
import Pet from "./Pet.jsx";
import PdfPreview from "./PdfPreview.jsx";
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
function Modal({ title, subtitle, close, children, wide = false }) {
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
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">YOUR LITTLE MUSIC SPACE</span>
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
function ScoreDisplay({ xml }) {
  const ref = useRef();
  const [error, setError] = useState("");
  useEffect(() => {
    let canceled = false;
    let display;
    (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (canceled) return;
        display = new OpenSheetMusicDisplay(ref.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
        });
        await display.load(xml);
        if (!canceled) display.render();
      } catch {
        if (!canceled)
          setError(
            "This score could not be engraved. Use the note list or original PDF to review it.",
          );
      }
    })();
    return () => {
      canceled = true;
      display?.clear();
    };
  }, [xml]);
  return (
    <div className="sheet-paper">
      {error && <p>{error}</p>}
      <div ref={ref} />
    </div>
  );
}
function Review({ score, onSave, close, notify }) {
  const [notes, setNotes] = useState(() => score.notes.map((n) => ({ ...n })));
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState("notes");
  const [saving, setSaving] = useState(false);
  const pages = Math.ceil(notes.length / 32);
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
        duration: Math.max(...notes.map((n) => n.beat + n.duration)),
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
          <ScoreDisplay xml={score.xml} />
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
                      {degree(n.midi)} <small>{solfege(n.midi)}</small>
                    </td>
                    <td>
                      <select
                        aria-label={`Pitch ${n.id}`}
                        value={n.midi}
                        onChange={(e) => edit(n.id, "midi", +e.target.value)}
                      >
                        {Array.from({ length: 88 }, (_, i) => (
                          <option key={i} value={i + 21}>
                            {noteName(i + 21)}
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
                        aria-label={`Hear ${noteName(n.midi)}`}
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
  const [view, setView] = useState("studio"),
    [score, setScore] = useState(LESSONS[0]),
    [library, setLibrary] = useState([]),
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
    [wideKeys, setWideKeys] = useState(false),
    [pressed, setPressed] = useState(new Set()),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [importing, setImporting] = useState(false),
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
    [sustain, setSustain] = useState(false);
  const inputRef = useRef(),
    state = useRef({}),
    transport = useRef({
      beat: 0,
      playing: false,
      start: 0,
      origin: 0,
      index: 0,
      lastTick: -10,
      matched: new Set(),
    }),
    voices = useRef(new Map()),
    pendingNotes = useRef(new Map()),
    midiRef = useRef(),
    toastTimer = useRef(),
    practiceStart = useRef(0);
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
  const range = useMemo(() => {
    if (wideKeys) return [21, 108];
    const pitches = score.notes.map((n) => n.midi);
    const low = Math.max(
      21,
      Math.min(48, Math.floor(Math.min(...pitches) / 12) * 12),
    );
    const high = Math.min(
      108,
      Math.max(84, Math.ceil(Math.max(...pitches) / 12) * 12),
    );
    return [low, high];
  }, [score, wideKeys]);
  const layout = useMemo(() => keyboardLayout(...range), [range]);
  const keyMap = useMemo(
    () => new Map(layout.map((k) => [k.midi, k])),
    [layout],
  );
  state.current = {
    score,
    notes,
    chordGroups,
    mode,
    speed,
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
  useEffect(() => {
    piano.prepare().catch((e) => notify(e.message));
    Promise.all([api("/scores"), api("/preferences"), api("/health")])
      .then(([s, p, h]) => {
        setLibrary(s);
        setEngineReady(h.omr);
        if (p.theme) setTheme(p.theme);
        if (p.pet) setPet(p.pet);
        if (p.stats)
          setStats({
            ...p.stats,
            dailyMinutes:
              p.stats.practiceDate === new Date().toLocaleDateString("en-CA")
                ? p.stats.dailyMinutes || 0
                : 0,
            practiceDate: new Date().toLocaleDateString("en-CA"),
          });
        if (p.volume != null) {
          setVolume(p.volume);
          piano.setVolume(p.volume);
        }
        setPrefLoaded(true);
      })
      .catch((e) => notify("Local library unavailable: " + e.message));
    return () => {
      piano.stop();
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!prefLoaded) return;
    const timer = setTimeout(
      () =>
        api("/preferences", json("PUT", { theme, pet, stats, volume })).catch(
          (e) => notify(e.message),
        ),
      500,
    );
    return () => clearTimeout(timer);
  }, [theme, pet, stats, volume, prefLoaded]);
  function stop() {
    const t = transport.current;
    t.playing = false;
    setPlaying(false);
    piano.stop();
    voices.current.clear();
    pendingNotes.current.clear();
    setPressed(new Set());
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
  function choose(s) {
    stop();
    setScore(s);
    setBeat(0);
    transport.current.beat = 0;
    setLoop(false);
    setLoopA(1);
    setLoopB(Math.min(4, s.measures));
    setSessionHits(0);
    setSessionMisses(0);
    setView("studio");
  }
  async function start() {
    if (loadingSound) return;
    if (playing) {
      stop();
      return;
    }
    if (!notes.length) {
      notify(
        "There are no notes for this hand. Choose both hands or the other hand.",
      );
      return;
    }
    if (!phraseGroups.length) {
      notify(
        "There are no new notes for this hand in these bars. Widen the loop or choose another hand.",
      );
      return;
    }
    setLoadingSound(true);
    try {
      await piano.init();
      const t = transport.current;
      let from = t.beat;
      if (from >= score.duration - 0.01) from = 0;
      if (
        loop &&
        (from < barStart(score, loopA) || from >= barEnd(score, loopB))
      )
        from = barStart(score, loopA);
      if (mode === "wait") {
        const next =
          phraseGroups.find((g) => g.beat >= from - 0.01) || phraseGroups[0];
        from = next.beat;
        t.matched = new Set();
      } else if (countIn && from === 0) from = -score.meter;
      t.beat = from;
      t.origin = from;
      t.start = piano.ctx.currentTime;
      t.playing = true;
      t.index = notes.findIndex((n) => n.beat >= Math.max(0, from) - 0.01);
      if (t.index < 0) t.index = notes.length;
      t.lastTick = Math.floor(from) - 1;
      setBeat(from);
      setPlaying(true);
      practiceStart.current = Date.now();
      setStats((s) => ({ ...s, sessions: s.sessions + 1 }));
    } catch (e) {
      notify(e.message);
    }
    setLoadingSound(false);
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
        while (
          t.index < s.notes.length &&
          s.notes[t.index].beat <= b + 0.08 / secondsPerBeat
        ) {
          const n = s.notes[t.index++];
          if (
            n.beat >= b - 0.15 &&
            (!s.loop || n.beat < barEnd(s.score, s.loopB))
          )
            piano.play(
              n.midi,
              n.duration * secondsPerBeat * 0.94,
              n.velocity,
              Math.max(0, (n.beat - b) * secondsPerBeat),
            );
        }
        const tick = Math.floor(b);
        if (tick !== t.lastTick) {
          t.lastTick = tick;
          if (s.metronome || b < 0) {
            const downbeat =
              b < 0
                ? tick % s.score.meter === 0
                : Math.abs(tick - barStart(s.score, measureAt(s.score, tick))) <
                  1e-6;
            piano.tick(downbeat);
          }
        }
        const end = s.loop ? barEnd(s.score, s.loopB) : s.score.duration;
        if (b >= end) {
          if (s.loop) {
            piano.stop();
            const from = barStart(s.score, s.loopA);
            t.origin = from;
            t.start = piano.ctx.currentTime;
            t.beat = from;
            t.index = s.notes.findIndex((n) => n.beat >= from - 0.01);
            if (t.index < 0) t.index = s.notes.length;
            t.lastTick = Math.floor(from) - 1;
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
      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);
  async function noteOn(midi, velocity = 0.75) {
    if (voices.current.has(midi) || pendingNotes.current.has(midi)) return;
    const token = Symbol();
    pendingNotes.current.set(midi, token);
    try {
      await piano.init();
      if (pendingNotes.current.get(midi) !== token) return;
      pendingNotes.current.delete(midi);
      const voice = piano.play(midi, null, velocity);
      voices.current.set(midi, voice);
      setPressed((p) => new Set(p).add(midi));
      const s = state.current,
        t = transport.current;
      if (t.playing && s.mode === "wait") {
        const group = s.chordGroups.find(
          (g) => Math.abs(g.beat - t.beat) < 0.01,
        );
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
              stop();
              t.beat = s.score.duration;
              setBeat(s.score.duration);
              notify("You played the whole piece. Luma is proud of you.");
            }
          }
        } else setSessionMisses((v) => v + 1);
      }
    } catch (e) {
      pendingNotes.current.delete(midi);
      notify(e.message);
    }
  }
  function noteOff(midi) {
    pendingNotes.current.delete(midi);
    const v = voices.current.get(midi);
    if (v) piano.release(v);
    voices.current.delete(midi);
    setPressed((p) => {
      const n = new Set(p);
      n.delete(midi);
      return n;
    });
  }
  const handlers = useRef();
  handlers.current = { noteOn, noteOff, start, stop, modal };
  useEffect(() => {
    const down = (e) => {
      if (
        handlers.current.modal ||
        /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName) ||
        e.repeat ||
        e.metaKey ||
        e.ctrlKey
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        handlers.current.start();
      } else if (KEYS[e.key.toLowerCase()] !== undefined) {
        e.preventDefault();
        handlers.current.noteOn(KEYS[e.key.toLowerCase()]);
      }
    };
    const up = (e) => {
      if (KEYS[e.key.toLowerCase()] !== undefined)
        handlers.current.noteOff(KEYS[e.key.toLowerCase()]);
    };
    const blur = () => {
      voices.current.forEach((_, m) => handlers.current.noteOff(m));
      piano.sustain(false);
      setSustain(false);
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
    };
  }, []);
  async function connectMIDI() {
    try {
      if (!navigator.requestMIDIAccess)
        throw Error("MIDI needs the desktop app or Chrome.");
      const midi = await navigator.requestMIDIAccess({ sysex: false });
      midiRef.current = midi;
      const bind = () => {
        voices.current.forEach((_, m) => handlers.current.noteOff(m));
        piano.sustain(false);
        setSustain(false);
        const inputs = [...midi.inputs.values()];
        setMidiStatus(
          inputs.length
            ? inputs.map((i) => i.name).join(", ")
            : "No keyboard found",
        );
        inputs.forEach((i) => {
          i.onmidimessage = (e) => {
            const [status, n, v] = e.data;
            if ((status & 240) === 144 && v > 0)
              handlers.current.noteOn(n, v / 127);
            if ((status & 240) === 128 || ((status & 240) === 144 && v === 0))
              handlers.current.noteOff(n);
            if ((status & 240) === 176 && n === 64) {
              piano.sustain(v >= 64);
              setSustain(v >= 64);
            }
          };
        });
      };
      bind();
      midi.onstatechange = bind;
      notify(
        midi.inputs.size
          ? "Keyboard connected. Play a note!"
          : "Plug in a USB MIDI keyboard. It will connect automatically.",
      );
    } catch (e) {
      notify("MIDI: " + e.message);
    }
  }
  async function importFile(file) {
    if (!file) return;
    stop();
    setModal("import");
    setImportError("");
    setImporting(true);
    setImportProgress("Bringing your music into orbit…");
    try {
      const data = new FormData();
      data.append("score", file);
      const result = await api("/import", { method: "POST", body: data });
      let scores;
      if (result.score) scores = [result.score];
      else {
        let done = false;
        while (!done) {
          await new Promise((r) => setTimeout(r, 1500));
          const job = await api("/jobs/" + result.jobId);
          setImportProgress(job.progress);
          if (job.status === "error") throw Error(job.error);
          if (job.status === "done") {
            scores = job.scores;
            done = true;
          }
        }
      }
      setLibrary(await api("/scores"));
      choose(scores[0]);
      setModal("review");
      notify("Your music is ready to review.");
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  }
  async function saveScore(s) {
    if (!library.find((x) => x.id === s.id))
      s = {
        ...s,
        id: crypto.randomUUID(),
        source: "Edited lesson",
        createdAt: new Date().toISOString(),
      };
    await api("/scores/" + s.id, json("PUT", s));
    setLibrary(await api("/scores"));
    setScore(s);
    seek(0);
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
  const current =
    phraseGroups.find((g) => g.beat >= Math.max(0, beat) - 0.04) ||
    (loop ? phraseGroups[0] : undefined);
  const currentNotes = current?.notes || [];
  const active = useMemo(
    () =>
      new Set(
        playing && mode === "listen"
          ? phraseNotes
              .filter((n) => n.beat <= beat && n.beat + n.duration > beat)
              .map((n) => n.midi)
          : playing && mode === "wait"
            ? currentNotes.map((n) => n.midi)
            : [],
      ),
    [playing, mode, phraseNotes, beat, current],
  );
  const visibleNotes = phraseNotes.filter(
    (n) => n.beat + n.duration > beat - 0.25 && n.beat < beat + 9,
  );
  const time = (Math.max(0, beat) * 60) / score.bpm;
  const totalTime = (score.duration * 60) / score.bpm;
  const label = (m) =>
    labels === "letters"
      ? noteName(m)
      : labels === "solfege"
        ? solfege(m, tonic)
        : degree(m, tonic);
  return (
    <div className={`app theme-${theme}`}>
      <div className="window-strip">
        <span>YOUR DAILY DOSE OF MUSIC & A LITTLE MAGIC</span>
        <span className="local-dot">Made for your piano journey</span>
      </div>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("studio");
          }}
        >
          <div className="brand-icon">
            <Music2 size={23} />
            <i />
          </div>
          <span>
            luma<span className="brand-light">keys</span>
            <small>A LITTLE LIGHT. A LOT OF MUSIC.</small>
          </span>
        </a>
        <div className="workspace-label">YOUR SPACE</div>
        <nav>
          {[
            [Music2, "studio", "Practice studio"],
            [Library, "library", "My sheet music"],
            [BookOpen, "learn", "Little lessons"],
          ].map(([Icon, id, title]) => (
            <button
              key={id}
              className={view === id ? "nav-item selected" : "nav-item"}
              onClick={() => {
                if (id !== "studio") stop();
                setView(id);
              }}
            >
              <Icon size={19} />
              <span>{title}</span>
              {id === "studio" && <span className="nav-dot" />}
              {id === "library" && <small>{library.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <button className="nav-item" onClick={() => setModal("companion")}>
          <Sparkles size={19} />
          <span>Companions & moods</span>
        </button>
        <button className="nav-item" onClick={() => setModal("guide")}>
          <HelpCircle size={19} />
          <span>A little guidance</span>
        </button>
        <div className="sidebar-bottom">
          <div className="daily-card">
            <div>
              <span className="small-icon">
                <Heart size={14} />
              </span>
              <span>Small steps, lovely progress</span>
            </div>
            <p>
              {Math.floor(stats.dailyMinutes || 0)}{" "}
              <small>/ 10 min today’s gentle goal</small>
            </p>
            <div className="progress-track">
              <i
                style={{
                  width:
                    Math.min(100, ((stats.dailyMinutes || 0) / 10) * 100) + "%",
                }}
              />
            </div>
            <span>No rush. You’re right on time.</span>
          </div>
          <button className="profile" onClick={() => setModal("companion")}>
            <span className="avatar">P</span>
            <span>
              Your piano corner<small>Saved on this Mac</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Your space <ChevronRight size={13} />{" "}
            <span>
              {view === "studio"
                ? "Practice studio"
                : view === "library"
                  ? "My sheet music"
                  : "Little lessons"}
            </span>
          </div>
          <div className="top-actions">
            <button
              className="midi-top"
              aria-label="Connect piano"
              onClick={connectMIDI}
            >
              <Keyboard size={15} />
              <span>Connect piano</span>
            </button>
            <span className="offline">
              <i /> Offline & all yours
            </span>
            <button
              className="secondary small"
              onClick={() => {
                setImportError("");
                setModal("import");
              }}
            >
              <Upload size={15} /> Import a score
            </button>
          </div>
        </header>
        {view === "studio" ? (
          <>
            <section className="greeting">
              <div>
                <span className="eyebrow">
                  <span className="tiny-star">✦</span> FIND YOUR RHYTHM
                </span>
                <h1>
                  A little practice.
                  <br className="mobile-break" /> A little magic<span>.</span>
                </h1>
                <p>
                  Let the notes come to you. We’ll take it one key at a time.
                </p>
              </div>
              <div className="greeting-badge">
                <span>✧</span>
                <div>
                  YOUR NEXT SMALL WIN<small>Play a melody you love</small>
                </div>
              </div>
            </section>
            <div className="studio-columns">
              <div className="studio-main">
                <section className="player panel">
                  <div className="score-heading">
                    <div className="score-art">
                      <Music2 size={27} />
                      <span>✦</span>
                    </div>
                    <div className="score-title">
                      <span className="eyebrow">ON YOUR MUSIC STAND</span>
                      <h2>{score.title}</h2>
                      <p>
                        {score.composer} <span>·</span> {score.measures} bars{" "}
                        <span>·</span> {score.bpm} BPM
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      title="Review sheet and notes"
                      aria-label="Review sheet and notes"
                      onClick={() => {
                        stop();
                        setModal("review");
                      }}
                    >
                      <FileMusic size={20} />
                    </button>
                    <button
                      className="icon-button"
                      title="Export practice notes"
                      aria-label="Export practice notes"
                      onClick={download}
                    >
                      <Download size={19} />
                    </button>
                  </div>
                  {!score.reviewed && (
                    <button
                      className="review-banner"
                      onClick={() => setModal("review")}
                    >
                      <HelpCircle size={14} /> Imported score · check the notes
                      before practicing <ArrowRight size={14} />
                    </button>
                  )}
                  <div className="player-toolbar">
                    <div className="segmented">
                      <button
                        className={mode === "listen" ? "selected" : ""}
                        onClick={() => {
                          seek(0);
                          setMode("listen");
                        }}
                      >
                        <Headphones size={14} /> Listen & follow
                      </button>
                      <button
                        className={mode === "wait" ? "selected" : ""}
                        onClick={() => {
                          seek(0);
                          setMode("wait");
                        }}
                      >
                        <Keyboard size={15} /> Wait for me
                      </button>
                    </div>
                    <div className="hand-select">
                      <span className="dot lavender" /> Left{" "}
                      <span className="dot mint" /> Right{" "}
                      <select
                        aria-label="Practice hand"
                        value={hand}
                        onChange={(e) => {
                          seek(0);
                          setHand(e.target.value);
                        }}
                      >
                        <option value="both">Both hands</option>
                        <option value="right">Right hand</option>
                        <option value="left">Left hand</option>
                      </select>
                    </div>
                  </div>
                  <div className="piano-visual">
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
                      {Array.from({ length: 4 }, (_, i) => (
                        <div
                          className="beat-line"
                          key={i}
                          style={{
                            bottom:
                              (((i * 2 - (beat % 2) + 2) % 8) / 8) * 100 + "%",
                          }}
                        />
                      ))}
                      <div className="roll-caption">
                        <span className="live-dot" />{" "}
                        {playing
                          ? beat < 0
                            ? "Count in · " + Math.ceil(-beat)
                            : mode === "wait"
                              ? "Your turn · play the glowing keys"
                              : "A little closer, one note at a time"
                          : "Follow the light. Find your flow."}
                      </div>
                      <div className="roll-watermark">
                        {mode === "wait" ? "at your pace" : "breathe & play"}
                      </div>
                      {visibleNotes.map((n) => {
                        const k = keyMap.get(n.midi);
                        if (!k) return null;
                        return (
                          <div
                            key={n.id}
                            className={`falling-note ${n.hand} ${n.duration < 0.8 ? "short" : ""} ${active.has(n.midi) && n.beat <= beat ? "hitting" : ""}`}
                            style={{
                              left: `calc(${k.left}% + 2px)`,
                              width: `calc(${k.width}% - 4px)`,
                              height:
                                Math.max(13, (n.duration / 8) * 100) + "%",
                              bottom: ((n.beat - beat) / 8) * 100 + "%",
                            }}
                          >
                            <span>{label(n.midi)}</span>
                            <small>{noteName(n.midi)}</small>
                          </div>
                        );
                      })}
                      <div className="strike-line" />
                      {active.size > 0 && <div className="strike-glow" />}
                    </div>
                    <div
                      className={`piano-keys ${wideKeys ? "full-range" : ""}`}
                    >
                      {layout.map((k) => (
                        <button
                          key={k.midi}
                          aria-label={`${noteName(k.midi)} ${degree(k.midi, tonic)} ${solfege(k.midi, tonic)}`}
                          className={`piano-key ${k.black ? "black" : "white"} ${active.has(k.midi) ? "lit" : ""} ${pressed.has(k.midi) ? "pressed" : ""} ${k.midi === 60 ? "middle-c" : ""}`}
                          style={{ left: k.left + "%", width: k.width + "%" }}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            noteOn(k.midi);
                          }}
                          onPointerUp={() => noteOff(k.midi)}
                          onPointerCancel={() => noteOff(k.midi)}
                          onKeyDown={(e) => {
                            if (
                              (e.key === "Enter" || e.code === "Space") &&
                              !e.repeat
                            ) {
                              e.preventDefault();
                              noteOn(k.midi);
                            }
                          }}
                          onKeyUp={(e) => {
                            if (e.key === "Enter" || e.code === "Space") {
                              e.preventDefault();
                              noteOff(k.midi);
                            }
                          }}
                          onBlur={() => noteOff(k.midi)}
                        >
                          <span className="key-number">{label(k.midi)}</span>
                          <small>
                            {k.midi % 12 === 0
                              ? "C" + (Math.floor(k.midi / 12) - 1)
                              : k.black
                                ? ""
                                : solfege(k.midi, tonic)}
                          </small>
                          {k.midi === 60 && <i />}
                        </button>
                      ))}
                    </div>
                    <div className="keyboard-footer">
                      <span>
                        <i /> C4 = middle C{" "}
                        <span className="quiet">
                          · numbers name notes, not fingers
                        </span>
                      </span>
                      <button onClick={() => setWideKeys((v) => !v)}>
                        <Maximize2 size={12} />
                        {wideKeys ? "Comfort view" : "88 keys"}
                      </button>
                    </div>
                  </div>
                  <div className="transport">
                    <div className="timeline">
                      <input
                        aria-label="Song position"
                        type="range"
                        min="0"
                        max={score.duration}
                        step="0.05"
                        value={Math.max(0, beat)}
                        onChange={(e) => seek(+e.target.value)}
                        style={{
                          "--progress": `${(Math.max(0, beat) / score.duration) * 100}%`,
                        }}
                      />
                      <span>
                        {fmt(time)} <i>/</i> {fmt(totalTime)}
                      </span>
                    </div>
                    <div className="transport-controls">
                      <div className="transport-left">
                        <button
                          className="icon-button"
                          aria-label="Start over"
                          onClick={() => seek(0)}
                        >
                          <RotateCcw size={17} />
                        </button>
                        <button
                          className="play-button"
                          aria-label={playing ? "Pause" : "Play"}
                          onClick={start}
                          disabled={loadingSound}
                        >
                          {loadingSound ? (
                            <LoaderCircle className="spin" size={20} />
                          ) : playing ? (
                            <Pause size={20} fill="currentColor" />
                          ) : (
                            <Play size={20} fill="currentColor" />
                          )}
                        </button>
                        <button
                          className={`icon-button ${loop ? "on" : ""}`}
                          aria-label="Toggle phrase loop"
                          onClick={() => {
                            stop();
                            setLoop((v) => !v);
                          }}
                        >
                          <Repeat2 size={19} />
                        </button>
                        <span className="control-divider" />
                        <div className="speed-control">
                          <label htmlFor="speed">Practice speed</label>
                          <select
                            id="speed"
                            value={speed}
                            onChange={(e) => {
                              stop();
                              setSpeed(+e.target.value);
                            }}
                          >
                            {[0.25, 0.5, 0.65, 0.75, 1, 1.25].map((x) => (
                              <option key={x} value={x}>
                                {Math.round(x * 100)}% ·{" "}
                                {Math.round(score.bpm * x)} BPM
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="volume">
                        <button
                          className="icon-button"
                          aria-label={volume ? "Mute" : "Unmute"}
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
                    {loop && (
                      <div className="loop-options">
                        <Repeat2 size={14} /> Repeat bars{" "}
                        <input
                          aria-label="Loop start bar"
                          type="number"
                          min="1"
                          max={loopB}
                          value={loopA}
                          onChange={(e) => {
                            stop();
                            setLoopA(
                              Math.max(1, Math.min(loopB, +e.target.value)),
                            );
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
                            stop();
                            setLoopB(
                              Math.min(
                                score.measures,
                                Math.max(loopA, +e.target.value),
                              ),
                            );
                          }}
                        />
                        <span>Small phrases make big progress.</span>
                      </div>
                    )}
                  </div>
                </section>
                <div className="under-player">
                  <div className="number-guide panel">
                    <div className="card-title">
                      <span>
                        <Sparkles size={15} /> A new language. Already familiar.
                      </span>
                      <button onClick={() => setModal("guide")}>
                        Meet the notes <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="number-row">
                      {[60, 62, 64, 65, 67, 69, 71].map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            noteOn(m);
                            setTimeout(() => noteOff(m), 550);
                          }}
                        >
                          <strong>{degree(m, tonic)}</strong>
                          <span>{solfege(m, tonic)}</span>
                          <small>{noteName(m).replace("4", "")}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <aside className="practice-side">
                <section className="companion-card panel">
                  <div className="companion-head">
                    <span>
                      <i /> YOUR PRACTICE PAL
                    </span>
                    <button
                      onClick={() => setModal("companion")}
                      aria-label="Customize companion"
                    >
                      <Settings2 size={15} />
                    </button>
                  </div>
                  <Pet kind={pet} happy={playing || sessionHits > 0} />
                  <div className="pet-name">
                    {pet === "cat" ? "Luma" : "Mochi"}{" "}
                    <span>LEVEL {Math.floor(stats.correct / 50) + 1}</span>
                  </div>
                  <p>
                    {sessionHits > 0
                      ? "Look at you go! Every note is a little star."
                      : "“You don’t need to be perfect. Just a little curious.”"}
                  </p>
                  <div className="pet-xp">
                    <span>Growing together</span>
                    <span>
                      {stats.correct % 50} / 50 <span>✦</span>
                    </span>
                  </div>
                  <div className="progress-track">
                    <i
                      style={{ width: ((stats.correct % 50) / 50) * 100 + "%" }}
                    />
                  </div>
                </section>
                <section className="next-card panel">
                  <div className="card-title">
                    <span>
                      {mode === "wait"
                        ? "YOUR NEXT LITTLE STEP"
                        : "COMING UP NEXT"}
                    </span>
                    <span className="soft-tag">
                      Bar{" "}
                      {Math.min(
                        score.measures,
                        measureAt(score, Math.max(0, beat)),
                      )}
                    </span>
                  </div>
                  <div className="next-notes">
                    {currentNotes.length ? (
                      currentNotes.map((n) => (
                        <div key={n.id}>
                          <strong>{degree(n.midi, tonic)}</strong>
                          <span>
                            {solfege(n.midi, tonic)} <i>·</i> {noteName(n.midi)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div>
                        <CheckCircle2 size={35} />
                        <span>Lovely finish</span>
                      </div>
                    )}
                  </div>
                  <p>
                    {mode === "wait"
                      ? "Play the shown notes. The music waits for you."
                      : "Watch where the glowing notes meet the keys."}
                  </p>
                  {mode === "wait" && (
                    <div className="session-result">
                      <span>{sessionHits} notes found</span>
                      <span>
                        {sessionHits + sessionMisses
                          ? Math.round(
                              (sessionHits / (sessionHits + sessionMisses)) *
                                100,
                            )
                          : 0}
                        % accuracy
                      </span>
                    </div>
                  )}
                </section>
                <section className="practice-settings panel">
                  <div className="card-title">
                    <span>
                      <SlidersHorizontal size={15} /> Make it comfortable
                    </span>
                  </div>
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
                      onClick={() => setMetronome((v) => !v)}
                    >
                      <i />
                    </button>
                  </div>
                </section>
              </aside>
            </div>
            <footer className="studio-footer">
              <button onClick={connectMIDI}>
                <Keyboard size={15} />
                {midiStatus}
                {sustain && " · sustain"}
                <ArrowUpRight size={13} />
              </button>
              <span>
                Or use your computer keys <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
                <kbd>F</kbd>{" "}
                <span className="quiet">· Space to play / pause</span>
              </span>
              <span>
                <Headphones size={13} /> Salamander grand piano
              </span>
            </footer>
          </>
        ) : (
          <>
            <section className="greeting">
              <div>
                <span className="eyebrow">
                  {view === "library"
                    ? "A HOME FOR YOUR MUSIC"
                    : "EVERY PIANIST STARTS SOMEWHERE"}
                </span>
                <h1>
                  {view === "library"
                    ? "Your next favorite melody."
                    : "Little lessons. Lovely progress."}
                </h1>
                <p>
                  {view === "library"
                    ? "Bring a sheet. Find the notes. Make it yours."
                    : "Start small, listen closely, and let your fingers find their way."}
                </p>
              </div>
            </section>
            {view === "library" && (
              <div className="library-tools">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder="Find a piece…"
                    aria-label="Find a piece"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button className="primary" onClick={() => setModal("import")}>
                  <Upload size={16} /> Bring your sheet music
                </button>
              </div>
            )}
            <div className="library-grid">
              {(view === "library" ? [...library, ...LESSONS] : LESSONS)
                .filter(
                  (s) =>
                    s.title.toLowerCase().includes(query.toLowerCase()) ||
                    view === "learn",
                )
                .map((s, i) => (
                  <article className="song-card panel" key={s.id}>
                    <div className={`song-cover cover-${i % 4}`}>
                      <span className="song-orbit" />
                      <Music2 size={42} />
                      <span className="cover-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="cover-star">✦</span>
                    </div>
                    <div className="song-content">
                      <span className="eyebrow">
                        {s.source}{" "}
                        {s.reviewed ? "· ready to play" : "· review needed"}
                      </span>
                      <h2>{s.title}</h2>
                      <p>{s.description || s.composer}</p>
                      <div className="song-meta">
                        <span>{s.notes.length} notes</span>
                        <span>{s.bpm} BPM</span>
                        <span>{s.measures} bars</span>
                      </div>
                      <button className="secondary" onClick={() => choose(s)}>
                        Let’s play <ArrowRight size={16} />
                      </button>
                      {library.some((x) => x.id === s.id) && (
                        <button
                          className="icon-button delete-score"
                          aria-label={`Remove ${s.title}`}
                          onClick={async () => {
                            await api("/scores/" + s.id, { method: "DELETE" });
                            setLibrary(await api("/scores"));
                            notify(
                              "Removed from your library. Original import is kept in the Library folder.",
                            );
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              {view === "library" && (
                <button
                  className="import-card"
                  onClick={() => setModal("import")}
                >
                  <span>
                    <Upload size={28} />
                  </span>
                  <h3>There’s room for your music.</h3>
                  <p>
                    PDF, MusicXML, or MIDI
                    <br />
                    Your next little adventure starts here.
                  </p>
                  <strong>
                    Import a score <ArrowUpRight size={15} />
                  </strong>
                </button>
              )}
            </div>
          </>
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
      {modal === "import" && (
        <Modal
          title="Every sheet has a song inside."
          subtitle="Let’s find yours. Everything is processed here, on your Mac."
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
                <h3>{importProgress}</h3>
                <p>
                  Reading notes, rhythm, and all the little details.
                  <br />A PDF can take a few minutes. You can keep this window
                  open.
                </p>
                <div className="indeterminate" />
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
          title="You already know the first step."
          subtitle="A small guide to finding your way around the piano."
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
                above C.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Find your middle C.</h3>
              <p>
                Find a group of two black keys. C is the white key immediately
                to their left. C4 is middle C; C5 is one octave higher. Look at
                the pitch and octave in “Coming up next.”
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Listen. Then take your turn.</h3>
              <p>
                In Listen & follow, a note sounds when its bar meets the
                keyboard. Longer bars mean longer notes. Try 50% speed, then
                switch to Wait for me. Chords need all the shown notes before
                advancing.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Use your real keyboard.</h3>
              <p>
                Connect a USB MIDI keyboard and click Connect keyboard. For an
                acoustic piano, follow the lights in Listen & follow. This app
                does not listen through the microphone. You can also click keys
                or use A W S E D F T G Y H U J K.
              </p>
            </article>
            <article>
              <span>05</span>
              <h3>A phrase at a time.</h3>
              <p>
                Use the loop button and choose a few bars. Isolate your right or
                left hand, slow it down, and add the other hand when it feels
                comfortable. A few unhurried minutes count.
              </p>
            </article>
            <article>
              <span>06</span>
              <h3>Your music stays yours.</h3>
              <p>
                Scores and practice settings are saved in Desktop / Luma Keys /
                Library. PDF recognition needs a clear scan and a review. If a
                repeat or tempo change is simplified, you’ll see a note in the
                review screen.
              </p>
            </article>
          </div>
          <button className="primary" onClick={() => setModal(null)}>
            Let’s find a little rhythm <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
