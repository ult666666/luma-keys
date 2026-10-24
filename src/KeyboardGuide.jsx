import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Hand,
  Maximize2,
  Minimize2,
  Rows3,
} from "lucide-react";
import {
  keyboardLayout,
  degree,
  solfege,
  noteName,
  metronomeEvents,
  measureAt,
} from "./music.mjs";
import { advanceKeyMotion, keyMotionFrame } from "./key-motion.mjs";
import {
  fitKeyboard,
  pitchRange,
  keyLights,
  longestNote,
  notesInWindow,
  velocityScale,
  accentedNotes,
  pedalAt,
  dynamicMarks,
  hasDynamics,
} from "./keyboard-stage.mjs";
import { handMotions } from "./hand-pose.mjs";
import { createHandPlanner, preparedHandPlan } from "./hand-planner.mjs";
import { drawHand } from "./hand-draw.mjs";
import { createHandsLayer, measureVisibleBed } from "./hands3d-layer.mjs";
import { geometryFrames, guidePoses } from "./hand-display.mjs";
import HandCoach from "./HandCoach.jsx";
import { clockMap } from "./tempo.mjs";
import "./hand-cues.css";
import "./hands3d.css";
import { scoreArtworkScene } from "./score-artwork.mjs";

const keys = keyboardLayout(21, 108);
const positions = new Map(keys.map((k) => [k.midi, k]));
const NARROW = 600;
const NO_POSES = Object.freeze({ left: null, right: null });
const NO_PLAN = Object.freeze({
  fingering: new Map(),
  timelines: { left: [], right: [] },
});
// The runway's key lanes never change; build them once.
const LANES = keys.map((k) => (
  <i
    key={k.midi}
    className={`${k.black ? "black" : "white"}${k.midi % 12 === 0 ? " octave" : ""}`}
    style={{ left: k.left + "%", width: k.width + "%" }}
  >
    {k.midi % 12 === 0 && <em>{noteName(k.midi)}</em>}
  </i>
));

// One key of the piano. Most keys look the same from one moment to the
// next, so each is drawn only when something about it changes.
const PianoKey = memo(function PianoKey({
  k,
  api,
  register,
  numberText,
  nameText,
  aria,
  fingerHint,
  lit,
  pressed,
  sounding,
  hand,
  then,
  flash,
  generation,
  press,
  tabbable,
  expanded,
}) {
  return (
    <button
      ref={(el) => register(k.midi, el)}
      data-midi={k.midi}
      data-hand={hand}
      data-then={then}
      disabled={!expanded}
      tabIndex={tabbable ? 0 : -1}
      onFocus={() => api.current.focusPitch(k.midi)}
      aria-label={aria}
      aria-description={fingerHint}
      className={`piano-key ${k.black ? "black" : "white"} ${lit ? "lit" : ""} ${pressed ? "pressed" : ""} ${sounding ? "sounding" : ""} ${k.midi === 60 ? "middle-c" : ""}${k.midi % 12 === 0 ? " c-key" : ""}`}
      style={{
        left: k.left + "%",
        width: k.width + "%",
        ...(press != null ? { "--press": press } : null),
      }}
      onPointerDown={(e) => api.current.pointerDown(e, k.midi)}
      onPointerUp={(e) => api.current.pointerUp(e, k.midi)}
      onPointerCancel={(e) => api.current.pointerUp(e, k.midi)}
      onLostPointerCapture={(e) => api.current.pointerUp(e, k.midi)}
      onKeyDown={(e) => api.current.keyDown(e, k.midi)}
      onKeyUp={(e) => api.current.keyUp(e, k.midi)}
      onBlur={() => api.current.release(`key-button:${k.midi}:`)}
    >
      <span className="key-surface" aria-hidden="true">
        <span className="key-light" />
        <span className="key-hold" />
        {flash && (
          <span
            className="key-flash"
            data-kind={flash.kind}
            key={`flash-${flash.id}`}
          />
        )}
        <span className="key-number">{numberText}</span>
        <small>{nameText}</small>
      </span>
    </button>
  );
});

// One note on the runway, placed once: the track under it does the moving.
const FallingNote = memo(function FallingNote({
  n,
  k,
  numberText,
  nameText,
  title,
  bottom,
  height,
  vel,
  accent,
  hitting,
  next,
}) {
  return (
    <div
      data-beat={n.beat}
      title={title}
      className={`falling-note ${n.hand}${k.black ? " on-black" : ""}${height < 34 ? " short" : ""}${height < 15 ? " tiny" : ""}${accent ? " accent" : ""}${hitting ? " hitting" : ""}${next ? " next" : ""}`}
      style={{
        left: `calc(${k.left}% + 2px)`,
        width: `calc(${k.width}% - 4px)`,
        height: `${Math.max(3, height - 2)}px`,
        bottom: `${bottom}px`,
        "--vel": vel,
      }}
    >
      <span>{numberText}</span>
      <small>{nameText}</small>
    </div>
  );
});

// The keyboard stage: the main practice indicator. The keyboard stands still,
// sized so the whole piece fits the window; a runway of falling notes lands
// on it in time with the audio; each key shows what is coming, what is
// sounding and how each press went; and a pair of hands shows the fingers
// (a suggested fingering) and the shape to play each passage with.
export default function KeyboardGuide({
  scoreId,
  targets,
  upcoming = [],
  active,
  soundEvents = [],
  soundEpoch = 0,
  pressed,
  velocities,
  tonic,
  labels,
  flats = false,
  onNoteOn,
  onNoteOff,
  onRelease,
  collapsed = false,
  onCollapsedChange,
  laneNotes = [],
  rangeNotes = [],
  clock,
  beat = 0,
  lookahead = 4,
  playing = false,
  mode = "listen",
  view = "numbers",
  lane = true,
  onLaneChange,
  hands: showHands = true,
  handDisplay = showHands ? "natural" : "off",
  onHandDisplayChange,
  onFingerHelpChange,
  focus = false,
  onFocusChange,
  score,
  speed = 1,
  countInSecondsPerBeat = null,
  flashes = [],
  dynamic = null,
  cue = null,
  count = 0,
  countBeats = 4,
  chime = null,
}) {
  const viewport = useRef();
  const stripRef = useRef();
  const sectionRef = useRef();
  const toggle = useRef();
  const runwayRef = useRef();
  const trackRef = useRef();
  const pulseRef = useRef();
  const bedRef = useRef();
  const handRefs = useRef({ left: null, right: null });
  const poses = useRef({ left: null, right: null });
  // The realistic 3-D hands (hands3d-layer.mjs): their layer element in the
  // key bed, and its controller (the 2-D hands are drawn until it is ready).
  const hands3dBox = useRef();
  const hands3d = useRef(null);
  const keyRefs = useRef(new Map());
  const bodyId = useId();
  const tall = view === "falling";
  // Falling notes need their keyboard. Keep the reader's preference so leaving
  // that view returns to the same uncluttered score layout.
  const hasRoll = tall;
  const expanded = hasRoll || !collapsed;
  const showRunway = expanded && (tall || lane);
  const [focusPitch, setFocusPitch] = useState(60);
  const [pointerHolds, setPointerHolds] = useState(new Set());
  const clearPointer = (id) =>
    setPointerHolds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  const [frame, setFrame] = useState(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [runwayHeight, setRunwayHeight] = useState(0);
  const [bed, setBed] = useState({ height: 0, keys: 0 });
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  const pitches = targets.map((n) => n.midi);
  const soundFrame = keyMotionFrame(soundEvents, pressed, soundEpoch);
  const [keyMotion, setKeyMotion] = useState(() =>
    advanceKeyMotion(null, soundFrame),
  );
  useLayoutEffect(() => {
    // Update before paint: removals preserve the existing resonance element,
    // while a newly added voice restarts its one-shot animation exactly once.
    setKeyMotion((previous) => advanceKeyMotion(previous, soundFrame));
  }, [soundFrame.signature]);
  const range = useMemo(() => pitchRange(rangeNotes), [rangeNotes]);
  const rangeKey = range ? `${range.low}-${range.high}` : "none";
  const brightness = useMemo(() => velocityScale(rangeNotes), [rangeNotes]);
  // Written accents (sf and the like), found once per piece.
  const accents = useMemo(() => accentedNotes(rangeNotes), [rangeNotes]);
  // Written dynamics as marks (p, f, ff…) and hairpins, once per piece.
  const dynamics = useMemo(
    () =>
      hasDynamics(rangeNotes) ? dynamicMarks(rangeNotes, { accents }) : [],
    [rangeNotes, accents],
  );
  // Exact written fingering and complete motion models are prepared off the
  // UI thread. Dense scores otherwise spend hundreds of milliseconds in this
  // render and the first RAF. Old score/speed plans never drive new hands.
  const handClock = useMemo(
    () => clockMap(score, speed, countInSecondsPerBeat),
    [score, speed, countInSecondsPerBeat],
  );
  const planningScore = useMemo(
    () =>
      score?.notes === rangeNotes ? score : { ...score, notes: rangeNotes },
    [score, rangeNotes],
  );
  const [handPlan, setHandPlan] = useState(null);
  const [handPlanFailure, setHandPlanFailure] = useState(null);
  const [handPlanAttempt, setHandPlanAttempt] = useState(0);
  const cachedPlan = preparedHandPlan(planningScore, handClock);
  const prepared =
    handPlan?.score === planningScore && handPlan.clockKey === handClock.key
      ? handPlan.data
      : cachedPlan;
  const planReady = !!prepared;
  const planFailure =
    !planReady &&
    handPlanFailure?.score === planningScore &&
    handPlanFailure.clockKey === handClock.key &&
    handPlanFailure.attempt === handPlanAttempt
      ? handPlanFailure.error
      : null;
  const { fingering, timelines } = prepared || NO_PLAN;
  useEffect(() => {
    let current = true;
    setHandPlanFailure(null);
    const planner = createHandPlanner();
    planner.prepare(planningScore, handClock, countInSecondsPerBeat).then(
      (data) => {
        if (current)
          setHandPlan({ score: planningScore, clockKey: handClock.key, data });
      },
      (error) => {
        if (current && error.name !== "AbortError") {
          setHandPlanFailure({
            score: planningScore,
            clockKey: handClock.key,
            attempt: handPlanAttempt,
            error,
          });
          console.warn("Luma Keys: hand preparation failed.", error);
        }
      },
    );
    return () => {
      current = false;
      planner.dispose();
    };
  }, [planningScore, handClock, countInSecondsPerBeat, handPlanAttempt]);
  const fingerHints = new Map();
  for (const note of targets) {
    const finger = fingering.get(note.id);
    if (!finger) continue;
    const name = ["", "thumb", "index", "middle", "ring", "little"][finger];
    const hint = `Suggested ${note.hand === "left" ? "left" : "right"} hand: finger ${finger}, ${name}.`;
    const previous = fingerHints.get(note.midi);
    if (!previous?.includes(hint))
      fingerHints.set(note.midi, previous ? `${previous} ${hint}` : hint);
  }
  // Only the hands being practised are shown.
  const handsInPlay = useMemo(() => {
    const set = new Set(
      laneNotes.map((n) => (n.hand === "left" ? "left" : "right")),
    );
    return set.size ? set : new Set(["left", "right"]);
  }, [laneNotes]);
  const longest = useMemo(() => longestNote(laneNotes), [laneNotes]);
  const label = (m) =>
    labels === "letters"
      ? noteName(m, flats)
      : labels === "solfege"
        ? solfege(m, tonic, flats)
        : degree(m, tonic, flats);
  // The keyboard stands still: the piece's whole range is framed once (for a
  // new piece, or when the window changes size) and never zooms or pans. On a
  // screen too narrow for the range, the keys keep a readable size and the
  // strip can be scrolled by hand.
  // Keep enough key depth for naturally proportioned hands. A narrow piece
  // gains surrounding keyboard context rather than oversized keys/palms.
  const keyCap =
    showHands && bed.keys > 0 ? Math.min(68, Math.floor(bed.keys / 4.5)) : 68;
  useLayoutEffect(() => {
    const el = viewport.current;
    const strip = stripRef.current;
    if (!expanded || !el || !strip) return;
    const place = () => {
      const width = el.clientWidth;
      if (!width) return;
      // A pixel to spare, and a whole-pixel scroll, so the end keys of the
      // range are always wholly in view.
      const minKey = width < NARROW ? 40 : 20;
      const fitted = fitKeyboard(range, width - 1, {
        minKey,
        maxKey: Math.max(minKey, keyCap),
        pad: 0,
      });
      const fit = { ...fitted, scrollLeft: Math.floor(fitted.scrollLeft) };
      strip.style.width = `${fit.stripWidth.toFixed(2)}px`;
      sectionRef.current?.style.setProperty(
        "--key-w",
        `${fit.keyWidth.toFixed(2)}px`,
      );
      strip.style.setProperty("--view-w", `${width}px`);
      strip.style.setProperty("--view-left", `${fit.scrollLeft}px`);
      el.scrollLeft = fit.scrollLeft;
      setScrollLeft(fit.scrollLeft);
      setFrame((previous) =>
        previous &&
        previous.keyWidth === fit.keyWidth &&
        previous.scrollLeft === fit.scrollLeft &&
        previous.view === width
          ? previous
          : { ...fit, view: width },
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, rangeKey, scoreId, keyCap]);
  // Only a strip wider than the window scrolls (by hand).
  const onScroll = () => {
    const el = viewport.current;
    if (!el || !frame || frame.fits) return;
    stripRef.current?.style.setProperty("--view-left", `${el.scrollLeft}px`);
    setScrollLeft(el.scrollLeft);
  };
  useEffect(() => {
    const clear = () => setPointerHolds(new Set());
    window.addEventListener("blur", clear);
    return () => window.removeEventListener("blur", clear);
  }, []);
  // The runway's height sets how many pixels one beat takes.
  useLayoutEffect(() => {
    const el = runwayRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setRunwayHeight(el.clientHeight));
    observer.observe(el);
    setRunwayHeight(el.clientHeight);
    return () => observer.disconnect();
  }, [showRunway]);
  // The hands' bed: the keys, and the rail below them for the palms.
  useLayoutEffect(() => {
    const el = bedRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.clientHeight;
      const keys = el.firstElementChild?.clientHeight || 0;
      // (How much of it shows: a compact stage's viewport clips the rail,
      // and the 3-D hands dissolve above wherever it does.)
      const visible = measureVisibleBed(el, sectionRef.current) || height;
      setBed((previous) =>
        previous.height === height &&
        previous.keys === keys &&
        previous.visible === visible
          ? previous
          : { height, keys, visible },
      );
    };
    const observer = new ResizeObserver(measure);
    for (const node of [el, viewport.current, runwayRef.current])
      if (node) observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [expanded, showRunway]);
  // The runway's scale follows the music's density: the piece's typical short
  // note (its 10th-percentile length) stays about 26 px tall so its label can
  // be read, and slower music shows up to 8 beats ahead. A short runway shows
  // fewer beats rather than squashing them together.
  const shortNote = useMemo(() => {
    const lengths = laneNotes
      .map((n) => n.duration)
      .filter((d) => d > 0.06)
      .sort((a, b) => a - b);
    return lengths.length ? lengths[Math.floor(lengths.length * 0.1)] : 1;
  }, [laneNotes]);
  const pxPerBeat =
    runwayHeight > 0
      ? Math.min(
          runwayHeight / 1.5,
          Math.max(30, runwayHeight / 8, Math.min(200, 26 / shortNote)),
        )
      : 40;
  const ahead = runwayHeight > 0 ? runwayHeight / pxPerBeat : lookahead;
  // Notes are placed once, at their beat from the start of the piece; only
  // the track under them moves, so nothing is redrawn as the music plays.
  const laneWindow = useMemo(
    () =>
      showRunway
        ? notesInWindow(laneNotes, beat - 1.5, beat + ahead + 1.5, longest)
        : [],
    [showRunway, laneNotes, beat, ahead, longest],
  );
  // The next chord to play is picked out; notes struck together in one hand
  // are tied by a bar where they land, so a chord reads as one shape.
  // While the music waits (Wait for me, or stopped) that is the chord to play
  // now; while it moves, the one arriving after the notes sounding.
  const moving = playing && mode !== "wait";
  let nextOnset = Infinity;
  for (const n of laneWindow)
    if (
      (moving ? n.beat > beat + 1e-6 : n.beat >= beat - 1e-6) &&
      n.beat < nextOnset
    )
      nextOnset = n.beat;
  const chordTies = [];
  {
    const byOnset = new Map();
    for (const n of laneWindow) {
      const k = positions.get(n.midi);
      if (!k) continue;
      const key = `${n.hand}:${n.beat}`;
      const tie = byOnset.get(key) || {
        key,
        hand: n.hand,
        beat: n.beat,
        left: Infinity,
        right: -Infinity,
        count: 0,
      };
      tie.left = Math.min(tie.left, k.left);
      tie.right = Math.max(tie.right, k.left + k.width);
      tie.count++;
      byOnset.set(key, tie);
    }
    for (const tie of byOnset.values()) if (tie.count > 1) chordTies.push(tie);
  }
  const pulses = useMemo(
    () =>
      showRunway && score
        ? metronomeEvents(score, beat - 1.5, beat + ahead + 1.5)
        : [],
    [showRunway, score, beat, ahead],
  );
  // The sustain pedal, written as spans: a lane on the runway's right edge
  // shows each press coming, and a lamp in the header shows it held.
  const pedals = score?.pedals || [];
  const pedalWindow = showRunway
    ? pedals.filter((p) => p.end > beat - 1.5 && p.start < beat + ahead + 1.5)
    : [];
  const pedalNow = pedals.length ? pedalAt(pedals, beat) : null;
  // Dynamics coming up, on the runway's left edge beside the bar numbers.
  const dynamicWindow = showRunway
    ? dynamics.filter(
        (d) => (d.end ?? d.beat) > beat - 1.5 && d.beat < beat + ahead + 1.5,
      )
    : [];
  // Geometry for the hands: a white key's width in pixels.
  const keyWidth = frame?.keyWidth || 36;
  // The hands plan in real seconds: the score's tempo map at the practice
  // speed, and the count-in's own rate before beat 0.
  // One animation frame drives everything time-based: the runway track, the
  // beat pulse, the keys' approach glow and hold meter, and the hands, all
  // from the audible clock.
  const live = useRef({});
  const placed = useRef({ node: null, transform: "" });
  const placeTrack = (sampledBeat) => {
    const s = live.current;
    const track = trackRef.current;
    if (!track || !s.showRunway) return;
    const now = sampledBeat ?? (s.clock ? s.clock() : s.beat);
    const transform = `translate3d(0, ${(now * s.pxPerBeat).toFixed(2)}px, 0)`;
    if (track === placed.current.node && transform === placed.current.transform)
      return;
    track.style.transform = transform;
    placed.current = { node: track, transform };
  };
  useLayoutEffect(() => {
    live.current = {
      clock,
      beat,
      laneNotes,
      longest,
      ahead,
      pxPerBeat,
      playing,
      mode,
      brightness,
      showRunway,
      pulses,
      expanded,
      timelines,
      handsInPlay,
      showHands,
      handDisplay,
      keyWidth,
      bed,
      reducedMotion,
      clockMap_: handClock,
      speed,
      score,
      count,
      planReady,
      planFailure,
      handPlan: {
        state: planReady ? "ready" : planFailure ? "unavailable" : "preparing",
        ready: planReady,
        clockKey: handClock.key,
        worker: prepared?.worker ?? null,
        prepareMs: prepared?.prepareMs ?? null,
        cached: prepared?.cached ?? false,
        fallback: prepared?.fallback ?? null,
        error: planFailure?.message ?? null,
        reason: planFailure?.reason ?? null,
      },
      // (The visible part of the strip, which the 3-D hands are drawn over.)
      scrollLeft,
      viewWidth: frame?.view || 0,
    };
    placeTrack();
  });
  // The 3-D hands' layer: made with the stage, its GPU resources and WebGL
  // context let go with it. (three.js and the models load only once there
  // are hands to show.)
  useEffect(() => {
    const box = hands3dBox.current;
    if (!box) return;
    const layer = createHandsLayer(box);
    hands3d.current = layer;
    return () => {
      if (hands3d.current === layer) hands3d.current = null;
      layer.dispose();
    };
  }, []);
  useEffect(() => {
    let raf;
    const lit = new Map();
    const marked = new Map();
    let frozenSince = 0,
      wasFrozen = false,
      lastNow = NaN;
    const draw = () => {
      const s = live.current;
      if (!s.laneNotes) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const now = s.clock ? s.clock() : s.beat;
      // One audible-clock sample aligns the note track, key lights and hands.
      placeTrack(now);
      // The now line breathes with the beat (stronger on the bar line): only
      // the glow's opacity changes, which the compositor does on its own.
      const pulseEl = pulseRef.current;
      if (pulseEl) {
        let pulse = 0;
        if (
          !s.reducedMotion &&
          s.playing &&
          s.mode !== "wait" &&
          s.pulses?.length
        ) {
          let last = null;
          for (const p of s.pulses) if (p.beat <= now + 1e-6) last = p;
          if (last) {
            const age = now - last.beat;
            pulse = Math.max(0, 1 - age / 0.35) * (last.accent ? 1 : 0.6);
          }
        }
        const value = pulse.toFixed(2);
        if (pulseEl.dataset.pulse !== value) {
          pulseEl.dataset.pulse = value;
          pulseEl.style.opacity = value;
        }
      }
      // A key only glows "on" while music is actually moving; paused and
      // wait-mode targets are lit by the steady target styling instead.
      const moving = s.playing && s.mode !== "wait";
      const lights = keyLights(s.laneNotes, now, {
        ahead: s.ahead,
        longest: s.longest,
      });
      const seen = new Set();
      for (const [midi, light] of lights) {
        const el = keyRefs.current.get(midi);
        if (!el) continue;
        const on = moving && light.on;
        const soon = light.soon;
        if (!on && soon <= 0.001) continue;
        seen.add(midi);
        const state = `${on ? light.hand : ""}|${soon > 0.001 ? light.soonHand : ""}|${on ? light.hold.toFixed(2) : ""}|${soon.toFixed(2)}`;
        if (lit.get(midi) === state) continue;
        lit.set(midi, state);
        el.dataset.on = on ? light.hand : "";
        el.dataset.soon = soon > 0.001 ? light.soonHand : "";
        el.style.setProperty("--hold", on ? light.hold.toFixed(3) : "0");
        el.style.setProperty("--soon", soon.toFixed(3));
        el.style.setProperty("--vel", s.brightness(light.velocity).toFixed(3));
      }
      for (const midi of [...lit.keys()])
        if (!seen.has(midi)) {
          lit.delete(midi);
          const el = keyRefs.current.get(midi);
          if (!el) continue;
          el.dataset.on = "";
          el.dataset.soon = "";
          el.style.setProperty("--hold", "0");
          el.style.setProperty("--soon", "0");
        }
      // The hands: fingers on the keys they play and the rest of each hand
      // in its shape, both planned together in real seconds (the hand
      // clock). A standing clock (paused, or waiting for the player)
      // remembers when it last changed, so a pose can settle from there.
      const frozen = !s.playing || s.mode === "wait";
      const stamp = performance.now();
      if (frozen && (!wasFrozen || now !== lastNow)) frozenSince = stamp;
      wasFrozen = frozen;
      lastNow = now;
      // (Each hand's pose, as handPoses has it, with the motion behind it,
      // which the 3-D hands are built from.)
      const motions =
        s.expanded && s.showHands && s.bed.keys > 0
          ? handMotions(s.timelines, now, {
              keyWidth: s.keyWidth,
              keysHeight: s.bed.keys,
              bedHeight: s.bed.height,
              reducedMotion: s.reducedMotion,
              clock: s.clockMap_,
              speed: s.speed,
              frozen,
              waiting: s.mode === "wait",
              counting: !!s.count,
              settle: frozen ? { since: (stamp - frozenSince) / 1000 } : null,
              ahead: s.ahead,
              pedals: s.score?.pedals || [],
              visible: (hand) => s.handsInPlay.has(hand),
            })
          : NO_POSES;
      // The realistic 3-D hands draw both hands over the visible keys; while
      // they load, or without WebGL, each hand is painted in 2-D instead.
      const real =
        hands3d.current?.update(
          geometryFrames(motions, s.handDisplay),
          {
            keyWidth: s.keyWidth,
            keysHeight: s.bed.keys,
            // (The part of the bed that shows: the hands dissolve above
            // the viewport's lower edge, wherever the stage clips it.)
            bedHeight: s.bed.visible || s.bed.height,
            left: s.scrollLeft,
            width: s.viewWidth,
          },
          {
            reducedMotion: s.reducedMotion,
            moving: !frozen,
            preparing:
              s.expanded && s.handDisplay === "natural" && !s.planReady && !s.planFailure,
            now: stamp,
          },
        ) ?? false;
      const both = guidePoses(motions, !real || s.handDisplay === "focus");
      let cues = false,
        shown = "";
      for (const hand of ["left", "right"]) {
        const layer = handRefs.current[hand];
        if (!layer) continue;
        const pose = both[hand];
        poses.current[hand] = pose;
        const hidden = layer.style.display === "none";
        if (pose && Array.isArray(pose.marks)) {
          cues = true;
          shown += shown ? ` ${hand}` : hand;
        }
        // A failed/loading WebGL asset uses the same contact-only guide as
        // Focus. Never substitute disconnected painted finger primitives.
        if (!hidden) layer.style.display = "none";
      }
      writeHandMarks(both, marked, keyRefs.current);
      // Hands that mark their keys land on them themselves: the stage drops
      // the land splash of each hand shown (a note no shown hand plays keeps
      // its splash).
      const section = sectionRef.current;
      if (section) {
        section.dataset.handRender = real && s.handDisplay === "natural" ? "natural" : "markers";
        section.dataset.geometryHands = real && s.handDisplay === "natural"
          ? ["left", "right"].filter(h => motions[h] && !motions[h].motion.guidanceOnly).join(" ") : "";
        const warning = section.querySelector(".hand-guidance-status");
        const reason = ["left", "right"].map(h => both[h]?.guidanceReason).find(Boolean) || "";
        if (warning && warning.textContent !== reason) {
          warning.textContent = reason;
          warning.hidden = !reason;
        }
      }
      if (section && section.classList.contains("with-hands") !== cues)
        section.classList.toggle("with-hands", cues);
      if (section && (section.dataset.handsShown || "") !== shown) {
        if (shown) section.dataset.handsShown = shown;
        else delete section.dataset.handsShown;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  // For checks: where each hand's fingertips are on screen, and their state.
  useEffect(() => {
    const hands = () => {
      const strip = stripRef.current?.getBoundingClientRect();
      const bed = bedRef.current?.getBoundingClientRect();
      if (!strip || !bed) return null;
      const out = {};
      for (const hand of ["left", "right"]) {
        const pose = poses.current[hand];
        // (Where the 3-D hands draw this hand: each pad's lowest point as
        // drawn — on its key, where it meets it.)
        const tips = pose ? hands3d.current?.fingers(hand) : null;
        const box = tips ? hands3dBox.current?.getBoundingClientRect() : null;
        const at = (p) => p && { x: box.left + p.x, y: box.top + p.y };
        out[hand] =
          pose && (box || handRefs.current[hand]?.style.display !== "none")
            ? {
                renderer: box ? "3d" : "2d",
                rest: pose.rest,
                beat: pose.beat,
                glide: pose.glide,
                reducedMotion: pose.reducedMotion,
                signature: pose.signature,
                seconds: pose.seconds ?? null,
                lift: pose.palm?.lift ?? 0,
                zTop: pose.zTop ?? null,
                forced: !!(pose.forced || pose.forcedFinger),
                position: pose.position ?? null,
                marks: pose.marks ?? [],
                pedal: pose.pedal ?? [],
                fingers: pose.fingers.map((f, i) => {
                  const tip = f.axis.at(-1);
                  const t = box ? tips[i] : null;
                  return {
                    finger: f.finger,
                    state: f.state,
                    lift: f.lift ?? 0,
                    number: f.number ?? null,
                    under: f.under ?? 0,
                    x: t ? box.left + t.bottom.x : strip.left + pose.x + tip.x,
                    y: t ? box.top + t.bottom.y : bed.top + tip.y,
                    ...(t
                      ? {
                          pad: at(t.pad),
                          top: at(t.top),
                          contact: at(t.contact),
                          errorMm: +(t.error * 1000).toFixed(2),
                        }
                      : null),
                  };
                }),
              }
            : null;
      }
      return out;
    };
    window.lumaHands = hands;
    // (And how the 3-D hands are doing: loaded, failed, drawing cost.)
    const report = (options) => hands3d.current?.report(options) ?? null;
    window.lumaHands3d = report;
    const planReport = () => live.current.handPlan ?? null;
    window.lumaHandPlan = planReport;
    return () => {
      if (window.lumaHands === hands) delete window.lumaHands;
      if (window.lumaHands3d === report) delete window.lumaHands3d;
      if (window.lumaHandPlan === planReport) delete window.lumaHandPlan;
    };
  }, []);
  // Notices for notes outside a strip that is wider than the window.
  const offLeft = [];
  const offRight = [];
  if (frame && !frame.fits)
    for (const m of pitches) {
      const k = positions.get(m);
      if (!k) continue;
      const x = ((k.left + k.width / 2) / 100) * frame.stripWidth;
      if (x < scrollLeft) offLeft.push(k);
      else if (x > scrollLeft + frame.view) offRight.push(k);
    }
  offLeft.sort((a, b) => a.left - b.left);
  offRight.sort((a, b) => a.left - b.left);
  const reveal = (key) => {
    const el = viewport.current;
    if (!el || !frame) return;
    const x = ((key.left + key.width / 2) / 100) * frame.stripWidth;
    el.scrollTo({
      left: Math.max(0, x - frame.view / 2),
      behavior: reducedMotion ? "instant" : "smooth",
    });
  };
  const toggleGuide = () => {
    if (hasRoll) return;
    if (expanded) {
      // These are the onscreen owners only. A shared computer/MIDI owner keeps
      // its note and pedal intact, including an audio start still in progress.
      onRelease("pointer:");
      onRelease("key-button:");
      for (const key of viewport.current.querySelectorAll(".piano-key"))
        for (const pointerId of pointerHolds)
          if (key.hasPointerCapture(pointerId))
            key.releasePointerCapture(pointerId);
      setPointerHolds(new Set());
      toggle.current?.focus({ preventScroll: true });
    }
    onCollapsedChange?.(expanded);
  };
  // Stable handlers for the memoised keys.
  const keyApi = useRef();
  keyApi.current = {
    focusPitch: setFocusPitch,
    release: onRelease,
    pointerDown(e, midi) {
      if (!expanded) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setPointerHolds((previous) => new Set(previous).add(e.pointerId));
      onNoteOn(midi, 0.75, "pointer:" + e.pointerId);
    },
    pointerUp(e, midi) {
      clearPointer(e.pointerId);
      onNoteOff(midi, "pointer:" + e.pointerId);
    },
    keyDown(e, midi) {
      if (!expanded) return;
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const pitch =
          e.key === "Home"
            ? 21
            : e.key === "End"
              ? 108
              : Math.max(
                  21,
                  Math.min(108, midi + (e.key === "ArrowRight" ? 1 : -1)),
                );
        viewport.current.querySelector(`[data-midi="${pitch}"]`)?.focus();
        return;
      }
      if ((e.key === "Enter" || e.code === "Space") && !e.repeat) {
        e.preventDefault();
        onNoteOn(midi, 0.75, `key-button:${midi}:${e.code || e.key}`);
      }
    },
    keyUp(e, midi) {
      if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        onNoteOff(midi, `key-button:${midi}:${e.code || e.key}`);
      }
    },
  };
  const registerKey = useCallback((midi, el) => {
    if (el) keyRefs.current.set(midi, el);
    else keyRefs.current.delete(midi);
  }, []);
  // Hands for the keys that are lit by React state: sounding notes first,
  // then the notes to play next, which say what the key is for right now.
  const hands = new Map();
  for (const n of soundEvents) hands.set(n.midi, n.hand);
  for (const n of targets) hands.set(n.midi, n.hand);
  const then = new Map(upcoming.map((n) => [n.midi, n.hand]));
  const latestFlash = new Map();
  for (const f of flashes) latestFlash.set(f.midi, f);
  const fingerName = (f) =>
    ["", "thumb", "index", "middle", "ring", "little"][f] || "";
  return (
    <section
      ref={sectionRef}
      className={`keyboard-guide keyboard-stage${expanded ? "" : " keyboard-guide-collapsed"}${tall ? " stage-tall" : ""}${showRunway ? " has-runway" : ""}${playing ? " is-playing" : ""} mode-${mode}`}
      aria-label="Keyboard guide"
      data-artwork={scoreArtworkScene(score)}
      data-hands={showHands && expanded ? "visible" : "hidden"}
      data-hand-display={handDisplay}
      data-reduced-motion={reducedMotion}
      data-nudge={(() => {
        // After a wrong note the keys to play brighten once (feedback.css).
        // Each miss takes the other keyframe from the miss before it, so
        // back-to-back misses always restart the brighten. The tag sticks
        // to its flash, so an older miss expiring never re-fires it.
        let tag;
        for (const f of flashes) {
          if (f.kind !== "miss") continue;
          if (!f.nudge)
            f.nudge = tag ? (tag === "a" ? "b" : "a") : f.id % 2 ? "a" : "b";
          tag = f.nudge;
        }
        return tag;
      })()}
      data-count-parity={count > 0 ? (count % 2 ? "a" : "b") : undefined}
    >
      <div className="keyboard-guide-top">
        {cue}
        <div className="keyboard-guide-controls">
          {count > 0 && !showRunway && (
            <b
              className="stage-count"
              key={`count-${count}`}
              aria-hidden="true"
            >
              {count}
            </b>
          )}
          {expanded && pedals.length > 0 && (
            <b
              className={`stage-pedal${pedalNow ? " down" : ""}`}
              title={
                pedalNow
                  ? "Sustain pedal down here"
                  : "Sustain pedal up here; the lane on the right shows each press coming"
              }
            >
              Ped.
            </b>
          )}
          {expanded && dynamic && (
            <b className="stage-dynamic" title="Written dynamic here">
              {dynamic}
            </b>
          )}
          {expanded && onFocusChange && (
            <button
              className={`stage-icon${focus ? " on" : ""}`}
              aria-pressed={focus}
              aria-label="Focus mode"
              title={
                focus
                  ? "Show the top bar and title again (Esc)"
                  : "Focus: give the music the whole window"
              }
              onClick={() => onFocusChange(!focus)}
            >
              {focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          {expanded && onHandDisplayChange && (
            <label className="hand-display-control">
              <Hand size={15} aria-hidden="true" /><span>Hands</span>
              <select aria-label="Hands display" value={handDisplay}
                onChange={e => onHandDisplayChange(e.target.value)}>
                <option value="natural">Natural</option>
                <option value="focus">Focus</option>
                <option value="off">Off</option>
              </select>
            </label>
          )}
          {expanded && !tall && onLaneChange && (
            <button
              className={`stage-icon${lane ? " on" : ""}`}
              aria-pressed={lane}
              aria-label="Note runway"
              title={
                lane
                  ? "Hide the notes falling onto the keys"
                  : "Show notes falling onto the keys"
              }
              onClick={() => onLaneChange(!lane)}
            >
              <Rows3 size={15} />
            </button>
          )}
          {!hasRoll && (
            <button
              ref={toggle}
              className="keyboard-guide-toggle"
              aria-label={
                expanded ? "Hide keyboard guide" : "Show keyboard guide"
              }
              aria-expanded={expanded}
              aria-controls={bodyId}
              title={expanded ? "Hide keyboard guide" : "Show keyboard guide"}
              onClick={toggleGuide}
            >
              {expanded ? (
                <ChevronDown size={15} />
              ) : (
                <>
                  Show keyboard <ChevronUp size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <div
        id={bodyId}
        className="keyboard-guide-body"
        hidden={!expanded}
        inert={!expanded ? true : undefined}
      >
        {showHands && planFailure && (
          <div className="keyboard-guide-top hand-plan-status" role="status">
            <span>
              Hand guide unavailable for this score. You can still practise.
            </span>
            <div className="keyboard-guide-controls">
              <button
                onClick={() => setHandPlanAttempt((attempt) => attempt + 1)}
              >
                Retry hand guide
              </button>
            </div>
          </div>
        )}
        {(offLeft.length > 0 || offRight.length > 0) && (
          <div className="keyboard-offscreen" role="status">
            {offLeft.length > 0 && (
              <button onClick={() => reveal(offLeft[0])}>
                ← Also play {offLeft.map((k) => noteName(k.midi)).join(" + ")}
              </button>
            )}
            {offRight.length > 0 && (
              <button onClick={() => reveal(offRight.at(-1))}>
                Also play {offRight.map((k) => noteName(k.midi)).join(" + ")} →
              </button>
            )}
          </div>
        )}
        <div
          className={`keyboard-viewport${frame && !frame.fits ? " scrolls" : ""}`}
          ref={viewport}
          onScroll={onScroll}
        >
          <div className="keyboard-strip" ref={stripRef}>
            {showRunway && (
              <div
                className={`roll runway${tall ? " runway-tall" : ""}`}
                data-testid="note-roll"
                data-px-per-beat={pxPerBeat.toFixed(3)}
                data-ahead={ahead.toFixed(3)}
                ref={runwayRef}
              >
                <div className="runway-lanes" aria-hidden="true">
                  {LANES}
                </div>
                <div className="runway-track" ref={trackRef}>
                  {chordTies.map((tie) => (
                    <i
                      key={tie.key}
                      className={`chord-tie ${tie.hand}${Math.abs(tie.beat - nextOnset) < 1e-6 ? " next" : ""}`}
                      aria-hidden="true"
                      style={{
                        left: `calc(${tie.left}% + 3px)`,
                        width: `calc(${tie.right - tie.left}% - 6px)`,
                        bottom: `${tie.beat * pxPerBeat}px`,
                      }}
                    />
                  ))}
                  {pulses.map((p) => (
                    <div
                      key={p.beat}
                      className={`beat-line${p.accent ? " bar-line" : ""}`}
                      style={{ bottom: p.beat * pxPerBeat + "px" }}
                    >
                      {p.accent && score && p.beat >= 0 && (
                        <span>
                          {Math.min(score.measures, measureAt(score, p.beat))}
                        </span>
                      )}
                    </div>
                  ))}
                  {dynamicWindow.map((d) =>
                    d.kind === "level" ? (
                      <i
                        key={`dyn-${d.beat}`}
                        className="dyn-mark"
                        aria-hidden="true"
                        style={{ bottom: `${d.beat * pxPerBeat}px` }}
                      >
                        {d.mark}
                      </i>
                    ) : (
                      <i
                        key={`dyn-${d.kind}-${d.beat}`}
                        className={`dyn-hairpin ${d.kind}`}
                        aria-hidden="true"
                        style={{
                          bottom: `${d.beat * pxPerBeat}px`,
                          height: `${Math.max(8, (d.end - d.beat) * pxPerBeat)}px`,
                        }}
                      >
                        <svg viewBox="0 0 12 100" preserveAspectRatio="none">
                          <polyline
                            points={
                              d.kind === "cresc"
                                ? "0,0 6,100 12,0"
                                : "0,100 6,0 12,100"
                            }
                          />
                        </svg>
                        <b>{d.kind === "cresc" ? "cresc." : "dim."}</b>
                      </i>
                    ),
                  )}
                  {pedalWindow.map((p) => (
                    <i
                      key={`pedal-${p.start}`}
                      className="pedal-span"
                      aria-hidden="true"
                      style={{
                        bottom: `${p.start * pxPerBeat}px`,
                        height: `${Math.max(4, (p.end - p.start) * pxPerBeat)}px`,
                      }}
                    >
                      <b>Ped.</b>
                    </i>
                  ))}
                  {laneWindow.map((n) => {
                    const k = positions.get(n.midi);
                    if (!k) return null;
                    const accent = accents.has(n.id);
                    const finger = fingering.get(n.id);
                    return (
                      <FallingNote
                        key={n.id}
                        n={n}
                        k={k}
                        numberText={label(n.midi)}
                        nameText={noteName(n.midi, flats)}
                        title={`${noteName(n.midi, flats)} · ${label(n.midi)} · ${n.duration} quarter-note beat${n.duration === 1 ? "" : "s"}${finger ? ` · ${fingerName(finger)} finger (${finger})` : ""}${accent ? " · accented" : ""}`}
                        bottom={n.beat * pxPerBeat}
                        height={n.duration * pxPerBeat}
                        vel={brightness(n.velocity).toFixed(3)}
                        accent={accent}
                        hitting={
                          active.has(n.midi) &&
                          n.beat <= beat + 1e-6 &&
                          n.beat + n.duration > beat
                        }
                        next={Math.abs(n.beat - nextOnset) < 1e-6}
                      />
                    );
                  })}
                </div>
                {[...soundFrame.owners.keys()].map((midi) => {
                  const k = positions.get(midi);
                  if (!k) return null;
                  // A pitch nobody was asked to play is neither hand's colour.
                  const owner = hands.get(midi);
                  return (
                    <span
                      key={`splash-${midi}-${keyMotion.generations.get(midi) || 0}`}
                      className={`land-splash ${owner === "left" ? "left" : owner === "right" ? "right" : "free"}`}
                      aria-hidden="true"
                      style={{ left: k.left + "%", width: k.width + "%" }}
                    />
                  );
                })}
                {flashes.map((f) => {
                  // Only a correct note raises a light pillar.
                  if (f.kind !== "hit") return null;
                  const k = positions.get(f.midi);
                  if (!k) return null;
                  return (
                    <span
                      key={f.id}
                      className="lane-spark"
                      data-kind={f.kind}
                      style={{ left: k.left + "%", width: k.width + "%" }}
                    />
                  );
                })}
                {count > 0 && (
                  <div
                    className="runway-count"
                    key={`count-${count}`}
                    aria-hidden="true"
                  >
                    <b className="count-num">{count}</b>
                    {/* One dot per count-in beat, filling 1 → N (MOT-6). */}
                    <span className="count-dots">
                      {Array.from(
                        { length: Math.max(countBeats, count) },
                        (_, i) => (
                          <i
                            key={i}
                            className={
                              i < count
                                ? i === count - 1
                                  ? "on now"
                                  : "on"
                                : ""
                            }
                          />
                        ),
                      )}
                    </span>
                  </div>
                )}
                <div className="strike-line">
                  <i className="strike-pulse" ref={pulseRef} />
                  {/* A clean bar glints once along the line (MOT-7, C7). It
                      is stamped when first drawn, so a runway that remounts
                      later (a view change) never replays an old glint. */}
                  {chime &&
                    (chime.drawnAt ??= performance.now()) >
                      performance.now() - 700 && (
                      <i className="strike-chime" key={chime.id} />
                    )}
                </div>
                {active.size > 0 && <div className="strike-glow" />}
              </div>
            )}
            <div className="key-bed" ref={bedRef}>
              <div className="piano-keys">
                {keys.map((k) => {
                  const lit = active.has(k.midi) || pitches.includes(k.midi);
                  const sounding = soundFrame.owners.has(k.midi);
                  const isPressed = pressed.has(k.midi);
                  return (
                    <PianoKey
                      key={k.midi}
                      k={k}
                      api={keyApi}
                      register={registerKey}
                      numberText={label(k.midi)}
                      nameText={noteName(k.midi, flats)}
                      aria={`${noteName(k.midi, flats)} ${degree(k.midi, tonic, flats)} ${solfege(k.midi, tonic, flats)}`}
                      fingerHint={
                        showHands ? fingerHints.get(k.midi) : undefined
                      }
                      lit={lit}
                      pressed={isPressed}
                      sounding={sounding}
                      hand={lit || sounding ? hands.get(k.midi) : undefined}
                      then={then.get(k.midi)}
                      flash={latestFlash.get(k.midi)}
                      generation={keyMotion.generations.get(k.midi) || 0}
                      press={
                        isPressed
                          ? (velocities?.current?.get(k.midi) ?? 0.75).toFixed(
                              2,
                            )
                          : undefined
                      }
                      tabbable={expanded && k.midi === focusPitch}
                      expanded={expanded}
                    />
                  );
                })}
              </div>
              <div className="key-rail" aria-hidden="true" />
              {["left", "right"].map((hand) => (
                <canvas
                  key={hand}
                  className={`hand-layer ${hand}`}
                  ref={(el) => (handRefs.current[hand] = el)}
                  aria-hidden="true"
                  style={{ display: "none" }}
                />
              ))}
              {/* The realistic 3-D hands (hands3d-layer.mjs fills it). */}
              <div
                className="hands3d-layer"
                ref={hands3dBox}
                aria-hidden="true"
                hidden
              />
            </div>
          </div>
        </div>
        <p className="hand-guidance-status" role="status" hidden />
        {expanded && showHands && (
          <HandCoach
            notes={laneNotes}
            fingering={fingering}
            clock={clock}
            beat={beat}
            flats={flats}
            playing={playing}
            mode={mode}
            score={score}
            speed={speed}
            onHelpChange={onFingerHelpChange}
          />
        )}
      </div>
    </section>
  );
}

// Place a hand's canvas under its knuckles and repaint it when its shape
// changes. A hand that only moves along the keys just slides: the compositor
// moves the canvas and nothing is painted.
function paintHand(canvas, pose, hand, height, force) {
  const width = Math.ceil(pose.unit * 12);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const size = `${width}x${height}@${dpr}`;
  // Keep the hand opaque over the instrument. Only the wrist dissolves into
  // the rail; fading the whole palm made keys show through like a ghost.
  // A hand in flight rises off the keys on the compositor (shadow, a slight
  // scale and lift); the painted shape is unchanged. Quantised so a flight
  // touches the style at most twenty times.
  const lift =
    Math.round(Math.max(0, Math.min(1, pose.palm?.lift || 0)) * 20) / 20;
  const fade = `${Math.round(pose.keysHeight + 4 - 2 * lift)}px`;
  if (canvas.fade !== fade) {
    canvas.style.setProperty("--hand-fade-start", fade);
    canvas.fade = fade;
  }
  if (canvas.lift !== lift) {
    canvas.style.setProperty("--hand-lift", String(lift));
    canvas.lift = lift;
  }
  // The hand that moved into an overlap is painted over the other one.
  const z = pose.zTop == null ? "" : pose.zTop ? "11" : "10";
  if (canvas.z !== z) {
    canvas.style.zIndex = z;
    canvas.z = z;
  }
  if (canvas.size !== size) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.size = size;
    canvas.drawn = "";
  }
  // A waiting hand breathes and repeated chords bounce the wrist: a small
  // vertical offset, also on the compositor.
  const dy = -2 * lift + (pose.palm?.bob || 0);
  const transform = lift
    ? `translate3d(${(pose.x - width / 2).toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${(1 + 0.03 * lift).toFixed(3)})`
    : `translate3d(${(pose.x - width / 2).toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
  if (canvas.placed !== transform) {
    canvas.style.transform = transform;
    canvas.placed = transform;
  }
  const rest = pose.rest ? "rest" : "";
  if (canvas.rest !== rest) {
    canvas.classList.toggle("rest", pose.rest);
    canvas.rest = rest;
  }
  if (!force && canvas.drawn === pose.signature) return;
  canvas.drawn = pose.signature;
  drawHand(canvas.getContext("2d"), pose, hand, { width, height, dpr });
}

// Key marks from the hand poses, written onto the key elements like the key
// glow: `data-land` (the finger heading for this key, its numeral, and the
// mark's strength) and `data-pedal` (a key the hand has let go while it
// still sounds). Only changes touch the DOM; marks no longer wanted are
// removed. Where both hands mark one key, the right hand's mark wins.
function writeHandMarks(both, marked, keyEls) {
  const want = new Map();
  for (const hand of ["left", "right"]) {
    const pose = both[hand];
    if (!pose) continue;
    for (const m of pose.marks || []) {
      const entry = want.get(m.midi) || {};
      entry.land = {
        hand,
        finger: m.finger,
        kind: m.kind,
        strength: m.strength,
      };
      want.set(m.midi, entry);
    }
    for (const p of pose.pedal || []) {
      const entry = want.get(p.midi) || {};
      entry.pedal = { hand, kind: p.kind };
      want.set(p.midi, entry);
    }
  }
  for (const [midi, entry] of want) {
    const el = keyEls.get(midi);
    if (!el) continue;
    const { land, pedal } = entry;
    const state = `${land ? `${land.hand}|${land.finger}|${land.kind}|${(+land.strength || 0).toFixed(2)}` : ""}/${pedal ? `${pedal.hand}|${pedal.kind}` : ""}`;
    const prior = marked.get(midi);
    if (prior && prior.el === el && prior.state === state) continue;
    marked.set(midi, { el, state });
    setMarks(el, entry);
  }
  for (const [midi, prior] of [...marked])
    if (!want.has(midi)) {
      marked.delete(midi);
      setMarks(prior.el, {});
    }
}
function setMarks(el, { land, pedal }) {
  if (land) {
    el.dataset.land = land.hand;
    if (Number.isInteger(land.finger) && land.finger >= 1 && land.finger <= 5)
      el.dataset.landFinger = String(land.finger);
    else delete el.dataset.landFinger;
    el.dataset.landKind = land.kind || "land";
    el.style.setProperty("--land", (+land.strength || 0).toFixed(2));
  } else if (el.dataset.land != null) {
    delete el.dataset.land;
    delete el.dataset.landFinger;
    delete el.dataset.landKind;
    el.style.removeProperty("--land");
  }
  if (pedal) {
    el.dataset.pedal = pedal.hand;
    el.dataset.pedalKind = pedal.kind || "free";
  } else if (el.dataset.pedal != null) {
    delete el.dataset.pedal;
    delete el.dataset.pedalKind;
  }
}
