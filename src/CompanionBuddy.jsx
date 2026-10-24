import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompanionPortrait from "./CompanionPortrait.jsx";
import BuddyFace from "./BuddyFace.jsx";
import BuddyMenu, { TreatIcon } from "./BuddyMenu.jsx";
import { onBuddy } from "./buddy.mjs";
import { companionLine } from "./buddy-lines.mjs";
import { measureAt } from "./music.mjs";
import { practiceStreak } from "./journal.mjs";
import {
  FACES,
  P,
  PHYSICS,
  SIZE,
  bondLevel,
  box,
  bubbleTtl,
  chooseRail,
  clamp,
  classifyClicks,
  createSpeech,
  defaultBuddyState,
  drowsiness,
  earnTreats,
  edgeSlot,
  feedTreat,
  figureRect,
  flushQueue,
  gainBond,
  gapBand,
  gapFree,
  gapTargetX,
  minuteXp,
  missReaction,
  modalSpot,
  nextBlink,
  pokeFromBag,
  petTrack,
  placeBubble,
  rectsIntersect,
  releaseVelocity,
  seatAt,
  seatScale,
  speechGate,
  springStep,
  stepPhysics,
  takeNews,
  textUnits,
  todayKey,
  welcomeEvent,
} from "./buddy-brain.mjs";
import { beatBob, buildCues, cueBetween, endingFor, streakStep } from "./buddy-cues.mjs";
import { restoreFocus } from "./focus-intent.mjs";
import "./buddy.css";

// The music: reading surfaces, the runway and the keys.
const MUSIC =
  ".score-stage, .reading-score, .sheet-paper, .roll.runway, .key-bed, .keyboard-guide, .next-notes, .keyboard-guide-controls, .control-dock";
// Every control on the paper screens, and the library's cards (the whole
// card: at 1024 px the edge rail stood on a card's title and meta line).
const CONTROLS =
  ".screen :is(button, summary, select, input:not([type='hidden']), textarea, a[href], [role='button'], [role='tab'], [role='slider'], [role='switch']), .piece-card, input[type='search']";
// Music and controls the companion and its bubble must never cover, plus the
// Progress chart legends and practice calendar, and the Exercises practice
// notes (the edge rail stood on them at 1024–1280 px).
const NO_GO = `${MUSIC}, ${CONTROLS}, .panel-heading .legend, .progress-streak, .jd-goal small, .jh-grid, .jh-legend, .exercise-tips, .exercise-workspace .exercise-setup, .exercise-workspace .exercise-guide, .practice-tools-panel:not([hidden]), .app-nav, .piece-actions, .view-switch, .studio-header-tools, .screen-header input, .modal, .companion-dock, .toast`;
// With a dialog open the page underneath is dimmed: the dialog counts, and
// the music behind the backdrop stays off limits too.
// The app bar's companion button counts too: perched on the dialog's top edge
// at 1280×800 the figure stood on it, two of the same face at once.
const NO_GO_MODAL = `.modal, .companion-dock, .toast, .app-bar-actions, ${MUSIC}`;
const HINT = "Double-click to chat · right-click for more";
const reducedQuery = () =>
  typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const plain = (r) => box(r.left, r.top, r.width, r.height);
const visible = (r, vw, vh) => r.width >= 1 && r.height >= 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;

// Idle loops per companion: [pose, face, ms].
const IDLES = {
  beethoven: [["squint", "wince", 1400], ["scribble", "neutral", 900], ["huff", "grumpy", 1100]],
  mozart: [["flourish", "happy", 900], ["giggle", "wink", 900], ["hum", "humming", 1500]],
  liszt: [["hairtoss", "neutral", 700], ["swoon", "grumpy", 1300], ["fargaze", "proud", 1600]],
  langlang: [["airpiano", "happy", 1100], ["doublehop", "happy", 800], ["bigwave", "happy", 1000]],
  cat: [["groom", "content", 1300], ["tailswish", "neutral", 1200], ["knock", "surprised", 1300]],
  bunny: [["eartwitch", "neutral", 700], ["hopfix", "happy", 900], ["eartwitch", "content", 700]],
};
// How each companion likes being petted: [face, pose, line delay ms].
const PETTING = {
  cat: ["happy", "purr"],
  bunny: ["happy", "earsback"],
  beethoven: ["grumpy", ""],
  mozart: ["wink", "giggle"],
  liszt: ["content", ""],
  langlang: ["happy", "doublehop"],
};

// Confetti, hearts, notes or sparkles. Finite: each burst plays once and
// is removed; at most 18 nodes alive, flying toward the middle of the window.
function Burst({ kind, count, from, to }) {
  return (
    <span className={`buddy-burst ${kind}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{ "--i": i, "--a": `${count > 1 ? from + ((to - from) * i) / (count - 1) : (from + to) / 2}deg` }}
        >
          {kind === "hearts" ? "♥" : kind === "notes" ? (i % 2 ? "♪" : "♫") : ""}
        </i>
      ))}
    </span>
  );
}

/** The companion walks with the user through the whole app. It sits on seats
 * and rails beside the music (never on it), keeps time silently while music
 * plays, speaks only at the right moments, and answers touch: a click pokes,
 * a double-click opens the chat, quick clicks tickle, stroking its head pets
 * it, dragging picks it up and right-click opens its menu. It never starts
 * audio or changes practice. */
function CompanionBuddy(props) {
  const {
    enabled = true,
    hidden = false,
    character = "cat",
    profile,
    playing = false,
    finished = false,
    modal = null,
    state: savedState,
    onOpenChat,
    onHide,
    score = null,
    plan = null,
    results = null,
    history = null,
  } = props;
  // The saved memory, plus patches sent since the last render, so two quick
  // writes (a treat and its bond XP) never overwrite each other.
  const mem = useRef({ src: undefined, value: null });
  if (mem.current.src !== savedState) mem.current = { src: savedState, value: savedState || defaultBuddyState() };
  const state = mem.current.value;
  const root = useRef(null);
  const [bubble, setBubble] = useState(null);
  const [bursts, setBursts] = useState([]);
  const [menu, setMenu] = useState(null);
  const [reduced, setReduced] = useState(() => !!reducedQuery()?.matches);
  // Present stays true for a moment after `enabled` goes false, so the
  // companion can wave and walk off before it unmounts.
  const [present, setPresent] = useState(enabled);
  // The companion on screen: a new one takes over after a hand-over.
  const [shown, setShown] = useState(character);
  const [swap, setSwap] = useState("");
  // After a hand-over the newcomer stays in view a moment to say hello.
  const [greeting, setGreeting] = useState(false);
  const [treat, setTreat] = useState(null);
  // Choosing a companion in the picker also opens the chat, which hides the
  // buddy. The hand-over (wave, slide off, hop in: about 1.1 s) plays first;
  // the buddy steps aside only once the new companion has arrived.
  const handingOver = present && !reduced && (character !== shown || swap !== "" || greeting);
  const hiddenNow = hidden && !handingOver;
  const live = useRef({});
  live.current = { ...props, hidden: hiddenNow, state, reduced, menu: !!menu, bubble };
  const api = useRef({});
  const patchState = useCallback((patch) => {
    mem.current.value = { ...mem.current.value, ...patch };
    live.current.state = mem.current.value;
    live.current.onState?.(patch);
  }, []);
  const cues = useMemo(() => buildCues(score, plan), [score, plan]);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  useEffect(() => {
    const query = reducedQuery();
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);

  // ---------------------------------------------------------- particles ---
  const burst = useCallback((kind, count = 9, { quietHeart = false } = {}) => {
    const L = live.current;
    const e = api.current.engine;
    if (L.reduced || !e || e.rail === "cue") return;
    // Quiet mode: no particles, except the single heart of a finish or goal.
    if (L.state.quiet) {
      if (!quietHeart) return;
      kind = "hearts";
      count = 1;
    }
    const vw = innerWidth,
      vh = innerHeight;
    // Fly into the half-plane that faces the middle of the window.
    const fr = figureRect(e.pos.x, e.pos.y, e.pos.s);
    const angle = (Math.atan2(vh / 2 - (fr.top + fr.bottom) / 2, vw / 2 - (fr.left + fr.right) / 2) * 180) / Math.PI;
    const id = Math.random().toString(36).slice(2);
    setBursts((list) => {
      const next = [...list, { id, kind, count: Math.min(18, count), from: angle - 80, to: angle + 80 }];
      while (next.reduce((n, b) => n + b.count, 0) > 18) next.shift();
      return next;
    });
    setTimeout(() => setBursts((list) => list.filter((b) => b.id !== id)), 1600);
  }, []);

  // ------------------------------------------------------------- speech ---
  const bubbleTimer = useRef(0);
  const clearBubble = useCallback(() => {
    clearTimeout(bubbleTimer.current);
    setBubble(null);
  }, []);
  /** Put a line on the calling card beside the companion, if there is a
   * free spot for it; returns false when it could not be placed. */
  const show = useCallback((text, { hint = false } = {}) => {
    const e = api.current.engine;
    if (!text || !e) return false;
    const vw = innerWidth,
      vh = innerHeight;
    const target = e.target || e.pos;
    const fr = figureRect(target.x, target.y, target.s);
    const chars = Math.max(textUnits(text), hint ? textUnits(HINT) * 0.9 : 0);
    const prefer =
      e.bubbleSide ||
      (e.rail === "gap" && e.geo.band
        ? fr.left - e.geo.band.left > e.geo.band.right - fr.right
          ? "left"
          : "right"
        : (fr.left + fr.right) / 2 < vw / 2
          ? "right"
          : "left");
    let maxW = 230;
    if (e.rail === "gap" && e.geo.band)
      maxW = clamp(Math.max(fr.left - e.geo.band.left, e.geo.band.right - fr.right) + 24 - 12, 120, 360);
    // The 11 px hint fits one line on a card at least 300 px wide.
    const extraLines = hint ? (Math.min(maxW, 7.2 * chars + 26) >= 300 ? 1 : 2) : 0;
    const place = placeBubble(fr, chars, e.geo.noGo, vw, vh, { prefer, maxW, extraLines });
    if (!place) return false;
    if (hint) api.current.hintShown = true;
    const s = target.s;
    const local = (X, Y) => [SIZE / 2 + (X - target.x - SIZE / 2) / s, SIZE + (Y - target.y - SIZE) / s];
    const [lx, ly] = local(place.rect.left, place.rect.top);
    setBubble({ id: Math.random(), text, hint, side: place.side, left: lx, top: ly, width: place.rect.width, scale: s });
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), bubbleTtl(text + (hint ? HINT : "")));
    return true;
  }, []);
  const lineFor = useCallback((event, extra = {}) => {
    const L = live.current;
    return companionLine(L.character, event, {
      name: L.profile?.name || "Luma",
      zh: L.profile?.zh || "",
      title: shortTitle(L.title) || "this piece",
      bar: L.bar,
      minutes: Math.max(0, Math.round(L.minutes || 0)),
      character: L.characterName || "pianist",
      ...extra,
      ...(extra.title ? { title: shortTitle(extra.title) } : {}),
    });
  }, []);
  /** Ask the speech gate, then speak, show a face, queue, or hold the line
   * back as news (a soft halo; the next poke says it). */
  const speak = useCallback(
    (text, priority, { face = "happy", hint = false } = {}) => {
      const e = api.current.engine;
      const L = live.current;
      if (!e || !text) return "drop";
      const now = Date.now();
      const playingHere = L.playing && L.view === "practice";
      const before = e.speech;
      const { verdict, state: next } = speechGate(e.speech, { priority, text, now, playing: playingHere || e.rail === "cue", quiet: L.state.quiet });
      e.speech = next;
      if (import.meta.env?.DEV) (e.log ||= []).push([Math.round(performance.now()), priority, verdict, text]);
      if (verdict === "say") {
        if (!show(text, { hint }) && !(hint && show(text))) {
          if (import.meta.env?.DEV) e.log.push(["unplaced"]);
          // No free spot (a narrow practice header): a line the user did not
          // ask for gives its budget back and waits as news for the next
          // poke. A reply to a touch has only the face; no halo, since
          // there is nothing held back to tell.
          if (priority !== P.USER) {
            e.speech = { ...before, news: { text, at: now } };
            api.current.news?.();
          }
        }
        if (face) api.current.face?.(face, 1600);
      } else if (verdict === "face") {
        api.current.face?.(face, 1400);
      } else if (verdict === "news") api.current.news?.();
      return verdict;
    },
    [show],
  );

  // Other panels speak through the bus: treated as a reply to the user.
  useEffect(
    () =>
      onBuddy((ev) => {
        const L = live.current;
        if (ev.source === "microphone") {
          if (!L.enabled || L.hidden || L.modal || L.view !== "practice" || !L.playing || L.mode !== "wait") return;
          // Text only: never send detector feedback into the speakers. These
          // rare cues already have their own cooldown; Quiet still shows a face.
          speak(ev.text, P.USER, { face: ev.mood === "celebrate" ? "happy" : "soft" });
          return;
        }
        if (L.playing && L.view === "practice") return;
        speak(ev.text, P.USER, { face: ev.mood === "listening" ? "neutral" : "happy" });
        if (ev.burst && ev.burst !== "confetti") burst(ev.burst, 6);
      }),
    [speak, burst],
  );

  // --------------------------------------------------------- the engine ---
  useEffect(() => {
    if (!present) return;
    const el = root.current;
    if (!el) return;
    const body = el.querySelector(".buddy-body");
    const html = document.documentElement;
    const now0 = performance.now();
    const e = {
      pos: { x: innerWidth + 20, y: innerHeight * 0.4, s: 1 },
      target: null,
      rail: "",
      settled: false,
      travel: null,
      geo: { noGo: [], vw: innerWidth, vh: innerHeight },
      pointer: { x: innerWidth * 0.7, y: innerHeight * 0.4, t: 0 },
      gaze: { x: 0, y: 0, tx: 0, ty: 0 },
      face: { name: "", until: 0 },
      pose: { name: "", until: 0 },
      blink: { at: now0 + 2500, end: 0, again: 0 },
      saccadeAt: now0 + 3000,
      activity: now0,
      drowsy: "awake",
      idleAt: now0 + 25000,
      speech: createSpeech(),
      frame: 0,
      alarm: 0,
      last: now0,
      written: {},
      drag: null,
      fly: null,
      edge: null,
      edgeNudge: 0,
      tucked: false,
      // The screen on which the reader moved it to a side (menu or arrow
      // keys): there it stands at that edge instead of its header seat.
      sidePicked: "",
      bubbleSide: "",
      bowUntil: 0,
      dance: null,
      lastBeat: null,
      cueCool: {},
      streak: 0,
      missTimes: [],
      runHits: 0,
      runMisses: 0,
      walkFrames: 0,
      runStart: 0,
      leaving: null,
    };
    api.current.engine = e;
    // QA scripts read the engine's state in development builds only.
    if (import.meta.env?.DEV) window.__lumaBuddy = e;
    const reducedNow = () => live.current.reduced;

    // Cached DOM writes: only on change.
    const write = (key, value, fn) => {
      if (e.written[key] === value) return;
      e.written[key] = value;
      fn(value);
    };
    const data = (name, value) =>
      write(`d:${name}`, value, (v) => (v === "" || v == null ? el.removeAttribute(`data-${name}`) : el.setAttribute(`data-${name}`, v)));
    const cls = (name, on) => write(`c:${name}`, !!on, (v) => el.classList.toggle(name, v));
    const prop = (name, value) => write(`p:${name}`, value, (v) => el.style.setProperty(name, v));
    const flag = (name, value) =>
      write(`h:${name}`, value, (v) => (v == null ? delete html.dataset[name] : (html.dataset[name] = v)));

    // ------------------------------------------------------------ face ---
    const applyFace = (now) => {
      let name = e.face.until > now ? e.face.name : "";
      if (!name) name = e.drowsy === "asleep" ? "asleep" : e.drowsy === "sleepy" ? "sleepy" : "neutral";
      const f = FACES[name] || FACES.neutral;
      data("eyes", f.eyes);
      data("mouth", f.mouth);
      data("fx", f.fx);
      data("face", name);
      cls("asleep", e.drowsy === "asleep" && !(e.face.until > now));
      const blinking = now < e.blink.end && !["sleep", "happy", "heart", "dizzy", "wink"].includes(f.eyes);
      data("blink", blinking ? "1" : "");
    };
    const face = (name, ms = 1200) => {
      const now = performance.now();
      e.face = { name, until: now + ms };
      applyFace(now);
      arm();
    };
    const pose = (name, ms = 600) => {
      const now = performance.now();
      e.pose = { name, until: now + ms };
      // Restart a one-shot pose animation even when it repeats.
      el.removeAttribute("data-pose");
      e.written["d:pose"] = "";
      void el.offsetWidth;
      data("pose", name);
      arm();
    };
    const news = () => {
      el.classList.remove("has-news");
      void el.offsetWidth;
      el.classList.add("has-news");
      setTimeout(() => el.classList.remove("has-news"), 1700);
    };
    // Three petals drift down when it lands in the header arch.
    let petalTimer = 0;
    const petals = () => {
      if (reducedNow() || live.current.state.quiet) return;
      el.classList.remove("petals");
      void el.offsetWidth;
      el.classList.add("petals");
      clearTimeout(petalTimer);
      petalTimer = setTimeout(() => el.classList.remove("petals"), 950);
    };
    api.current.face = face;
    api.current.pose = pose;
    api.current.news = news;

    // ----------------------------------------------------- measurement ---
    const textRight = (info) => {
      let right = info.getBoundingClientRect().left;
      const walker = document.createTreeWalker(info, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width) right = Math.max(right, r.right);
      }
      for (const x of info.querySelectorAll("button, svg, img")) {
        const r = x.getBoundingClientRect();
        if (r.width) right = Math.max(right, r.right);
      }
      return right;
    };
    const measure = () => {
      const L = live.current;
      const vw = innerWidth,
        vh = innerHeight;
      const modalOpen = !!L.modal;
      const noGo = [];
      for (const n of document.querySelectorAll(modalOpen ? NO_GO_MODAL : NO_GO)) {
        if (n.closest(".buddy, .buddy-menu")) continue;
        const r = n.getBoundingClientRect();
        if (visible(r, vw, vh)) noGo.push(plain(r));
      }
      const geo = { noGo, vw, vh, band: null, header: null, cue: null, seat: null, modal: null, toast: null };
      const toast = document.querySelector(".toast")?.getBoundingClientRect();
      if (toast && visible(toast, vw, vh)) geo.toast = plain(toast);
      if (L.view === "practice" && !modalOpen) {
        const h = document.querySelector(".practice-screen .piece-header") || document.querySelector(".piece-header");
        const hr = h?.getBoundingClientRect();
        if (hr && visible(hr, vw, vh)) {
          const info = h.querySelector(".piece-info");
          const infoRight = info ? textRight(info) : hr.left;
          const actions = h.querySelector(".piece-actions")?.getBoundingClientRect();
          geo.header = plain(hr);
          geo.band = gapBand({ infoRight, actionsLeft: actions?.width ? actions.left : hr.right, headerTop: hr.top, headerBottom: hr.bottom });
          // A notice in the header gap (top centre): the companion keeps to
          // the free stretch beside it, or takes another seat until it goes.
          if (geo.toast) geo.band.blocked = gapTargetX(geo.band, null, hr.bottom, geo.band.scale, [geo.toast]) == null;
          noGo.push(box(hr.left, hr.top, Math.max(0, infoRight - hr.left), hr.height));
        }
        const cue = document.querySelector('[data-buddy-seat="cue"]')?.getBoundingClientRect();
        if (cue && visible(cue, vw, vh)) geo.cue = plain(cue);
      }
      if (!modalOpen && L.view !== "practice") {
        const seat = document.querySelector('[data-buddy-seat="header"]');
        const r = seat?.getBoundingClientRect();
        if (r && r.width >= 1 && r.height >= 1) {
          const shown = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / r.height;
          if (shown >= 0.6) geo.seat = plain(r);
        }
      }
      if (modalOpen) {
        const m = document.querySelector(".modal-backdrop .modal") || document.querySelector(".modal");
        const r = m?.getBoundingClientRect();
        if (r && r.width) geo.modal = plain(r);
      }
      e.geo = geo;
      // A bubble that something now covers (a notice arrived, the page
      // scrolled a control under it) goes at once.
      const card = el.querySelector(".buddy-bubble")?.getBoundingClientRect();
      if (card?.width && noGo.some((r) => rectsIntersect(r, card, 2))) clearBubble();
      // Wake only when the new layout asks the companion to move.
      const rail = railNow(performance.now());
      const t = targetFor(rail);
      if (rail !== e.rail || Math.hypot(t.x - e.pos.x, t.y - e.pos.y) > 0.3 || Math.abs(t.s - e.pos.s) > 0.005 || !!t.hide !== !!e.target?.hide) wake();
    };

    // ------------------------------------------------------------ rails ---
    const railNow = (now) => {
      const L = live.current;
      const g = e.geo;
      if ((e.tucked || e.sidePicked === L.view) && L.view !== "practice") return "edge";
      return chooseRail({
        view: L.view,
        modal: L.modal && g.modal ? L.modal : null,
        playing: L.playing,
        bow: now < e.bowUntil,
        cueSeat: !!g.cue,
        gapOk: !!g.band?.ok && !g.band.blocked,
        headerSeat: !!g.seat,
        tucked: e.tucked,
      });
    };
    const targetFor = (rail) => {
      const L = live.current;
      const g = e.geo;
      const vw = g.vw,
        vh = g.vh;
      e.bubbleSide = "";
      if ((rail === "modal" || rail === "results") && g.modal) {
        const spot = modalSpot(g.modal, vw, vh, rail === "results", g.noGo);
        e.bubbleSide = spot.bubble;
        return { x: spot.x, y: spot.y, s: spot.s ?? 1, hide: !!spot.hide };
      }
      if (rail === "cue" && g.cue) {
        const s = seatScale("cue", g.cue.height);
        return { ...seatAt((g.cue.left + g.cue.right) / 2, g.cue.bottom), s };
      }
      if ((rail === "gap" || rail === "bow") && g.band) {
        const band = g.band;
        if (rail === "bow") {
          const s = clamp((band.feet - 50) / SIZE, 0.6, 1);
          return { ...seatAt((band.left + band.right) / 2, band.feet), s };
        }
        const s = band.scale;
        const holding = live.current.bubble || live.current.menu || root.current?.classList.contains("petting");
        // Reduced motion: it rests instead of jumping after the pointer.
        const follow = !L.state.quiet && !holding && !reducedNow();
        const blocks = g.toast ? [g.toast] : [];
        let cx = holding && e.target ? e.target.x + SIZE / 2 : null;
        // Holding still, unless a notice has just landed on that spot.
        if (cx != null && blocks.length && !gapFree(band, blocks, s).some(([a, b]) => cx >= a - 0.5 && cx <= b + 0.5)) cx = null;
        if (cx == null) cx = gapTargetX(band, follow ? e.pointer : null, g.header?.bottom ?? band.feet, s, blocks) ?? band.right - SIZE / 2;
        return { ...seatAt(cx, band.feet), s };
      }
      if (rail === "header" && g.seat) {
        const s = seatScale("header", g.seat.height);
        return { ...seatAt((g.seat.left + g.seat.right) / 2, g.seat.bottom), s };
      }
      if (rail === "edge") {
        const side = L.state.side === "left" ? "left" : "right";
        const holding = live.current.bubble || live.current.menu || root.current?.classList.contains("petting");
        // `base` is where it would stand before the arrow-key nudge; keeping
        // it apart stops a held position from adding the nudge every frame.
        const base = L.state.quiet || holding || e.tucked || reducedNow() ? (e.edge?.base ?? vh * 0.42) : e.pointer.y - SIZE / 2;
        let want = clamp(base + e.edgeNudge * vh, vh * 0.14, vh * 0.78 - SIZE * 0.2);
        if (e.tucked) want = vh * 0.72;
        if (!e.edge || e.edge.stale || Math.abs(e.edge.want - want) > 18 || e.edge.side !== side || e.edge.geo !== g) {
          const slot = edgeSlot({ side, wantY: want, vw, vh, noGo: g.noGo });
          e.edge = { base: e.tucked ? (e.edge?.base ?? base) : base, want, side, geo: g, slot };
        }
        const slot = e.edge.slot;
        const peek = e.tucked || slot.peek;
        e.bubbleSide = side === "left" ? "right" : "left";
        return {
          x: e.tucked ? (side === "left" ? -SIZE * 0.42 : vw - SIZE * 0.58) : slot.x,
          y: slot.y,
          s: 1,
          peek,
          // The edge column is busy all the way down: out of sight until
          // the page scrolls somewhere quieter.
          hide: !e.tucked && !!slot.hide,
        };
      }
      // corner: tucked out of sight until the layout changes.
      return { x: e.pos.x, y: e.pos.y, s: e.pos.s, hide: true };
    };

    // ------------------------------------------------------------- loop ---
    let alarmTimer = 0;
    const wake = () => {
      if (!e.frame && !document.hidden) e.frame = requestAnimationFrame(tick);
    };
    api.current.wake = wake;
    // Discrete events (blinks, expiring faces, drowsiness, idle loops) run
    // from one timer, so the frame loop can sleep when nothing moves.
    const arm = () => {
      clearTimeout(alarmTimer);
      const now = performance.now();
      const times = [e.blink.end > now ? e.blink.end : e.blink.at, e.saccadeAt];
      if (e.face.until > now) times.push(e.face.until);
      if (e.pose.until > now) times.push(e.pose.until);
      if (e.drowsy !== "asleep") times.push(e.activity + (e.drowsy === "awake" ? 45000 : 75000));
      times.push(e.idleAt);
      if (e.bowUntil > now) times.push(e.bowUntil);
      const next = Math.max(16, Math.min(...times) - now);
      alarmTimer = setTimeout(discrete, Math.min(next, 30000));
    };
    const discrete = () => {
      const now = performance.now();
      const L = live.current;
      if (document.hidden) return arm();
      // Blink: 2.6–6 s apart, 110 ms, sometimes double. Never asleep.
      if (now >= e.blink.at && e.blink.end <= e.blink.at) {
        e.blink.end = now + 110;
        const n = nextBlink(Math.random, reducedNow());
        e.blink.again = n.double ? now + 250 : 0;
        e.blink.at = n.double ? now + 250 : now + n.in;
      } else if (e.blink.again && now >= e.blink.again) {
        e.blink.again = 0;
      }
      // Drowsiness after quiet minutes (never while music plays or a dialog is open).
      const drowsy = L.playing || L.modal || e.drag || e.fly ? "awake" : drowsiness(now - e.activity);
      if (drowsy !== e.drowsy) e.drowsy = drowsy;
      // Idle saccades: tiny glances while nothing else draws the eye.
      if (now >= e.saccadeAt) {
        e.saccadeAt = now + 2000 + Math.random() * 3000;
        if (!e.frame && !live.current.bubble) {
          e.gaze.x = e.gaze.tx = (Math.random() - 0.5) * 0.8;
          e.gaze.y = e.gaze.ty = (Math.random() - 0.5) * 0.5;
          prop("--gx", e.gaze.x.toFixed(2));
          prop("--gy", e.gaze.y.toFixed(2));
        }
      }
      if (e.pose.until && now >= e.pose.until) {
        e.pose = { name: "", until: 0 };
        data("pose", "");
      }
      // Personality idles every 20–45 s, only when nothing else is going on.
      if (now >= e.idleAt) {
        e.idleAt = now + 20000 + Math.random() * 25000;
        const idle = !L.playing && !L.modal && !L.state.quiet && !L.bubble && !L.menu && e.drowsy === "awake" && ["gap", "header", "edge"].includes(e.rail) && !e.drag && !e.fly && !e.tucked;
        if (idle) {
          const list = IDLES[L.character] || IDLES.cat;
          const [p, f, ms] = list[Math.floor(Math.random() * list.length)];
          pose(p, ms);
          face(f, ms);
          // Some idles carry a look: Luma watches the note fall, Liszt
          // looks up to the heavens, Beethoven peers at the score.
          const look = { knock: [0.3, 1], swoon: [0.2, -1], fargaze: [0.8, -0.3], squint: [-0.6, 0.5] }[p];
          if (look) {
            [e.gaze.tx, e.gaze.ty] = look;
            setTimeout(() => {
              e.gaze.tx = e.gaze.ty = 0;
              wake();
            }, ms);
            wake();
          }
        }
      }
      applyFace(now);
      arm();
    };

    const settleTo = (t) => {
      e.pos.x = t.x;
      e.pos.y = t.y;
      e.pos.s = t.s;
    };
    const startTravel = (to) => {
      const from = { ...e.pos };
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      if (reducedNow() || dist < 40 || from.x > e.geo.vw + 10) return (e.travel = null);
      e.travel = { from, t0: performance.now(), dur: clamp(dist / 1.6, 320, 700), lift: Math.min(120, dist * 0.35) };
    };

    const tick = () => {
      e.frame = 0;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - e.last) / 1000));
      e.last = now;
      if (document.hidden) return;
      const L = live.current;
      const vw = e.geo.vw,
        vh = e.geo.vh;
      let keep = false;

      // Where to be.
      const rail = e.drag || e.fly || e.leaving ? e.rail : railNow(now);
      if (rail !== e.rail) {
        const prev = e.rail;
        e.rail = rail;
        e.settled = false;
        data("rail", rail);
        const t = targetFor(rail);
        if (prev) startTravel(t);
        if (rail === "cue" || rail === "corner") clearBubble();
      }
      const t = e.leaving || targetFor(rail);
      e.target = t;

      if (e.drag) {
        // Held: follow the pointer through a spring.
        const d = e.drag;
        const tx = e.pointer.x - d.offX,
          ty = e.pointer.y - d.offY;
        if (reducedNow()) {
          e.pos.x = tx;
          e.pos.y = ty;
          d.vx = d.vy = 0;
        } else {
          [e.pos.x, d.vx] = springStep(e.pos.x, d.vx, tx, dt);
          [e.pos.y, d.vy] = springStep(e.pos.y, d.vy, ty, dt);
        }
        e.pos.s += (1 - e.pos.s) * 0.3;
        prop("--vx-tilt", `${clamp(d.vx * 0.02, -25, 25).toFixed(1)}deg`);
        e.gaze.tx = clamp(d.vx / 900, -1, 1);
        e.gaze.ty = clamp(d.vy / 900, -1, 1);
        keep = true;
      } else if (e.fly) {
        const f = e.fly;
        const next = stepPhysics(f, dt, { left: 0, right: vw - SIZE, top: 0, floor: vh - 72 - SIZE });
        Object.assign(f, next);
        e.pos.x = f.x;
        e.pos.y = f.y;
        prop("--spin", `${(f.angle % 360).toFixed(1)}deg`);
        e.gaze.tx = clamp(f.vx / 900, -1, 1);
        e.gaze.ty = clamp(f.vy / 900, -1, 1);
        if (next.bounced && Math.abs(f.vy) > 200) pose("land", 450);
        if (next.landed) {
          e.fly = null;
          prop("--spin", "0deg");
          cls("flying", false);
          pose("land", 450);
          if (f.dizzy) {
            face("dizzy", 1400);
            cls("dizzy", true);
            setTimeout(() => el.classList.remove("dizzy"), 1300);
            e.written["c:dizzy"] = false;
            speak(lineFor("dizzy"), P.USER, { face: "dizzy" });
          } else face("surprised", 300);
          startTravel(targetFor(railNow(now)));
          remember();
        }
        keep = true;
      } else if (e.travel) {
        // A hop along an arc to the new seat.
        const tr = e.travel;
        const p = clamp((now - tr.t0) / tr.dur, 0, 1);
        const k = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2; // ease-move
        const mx = (tr.from.x + t.x) / 2,
          my = Math.min(tr.from.y, t.y) - tr.lift;
        const u = 1 - k;
        e.pos.x = u * u * tr.from.x + 2 * u * k * mx + k * k * t.x;
        e.pos.y = u * u * tr.from.y + 2 * u * k * my + k * k * t.y;
        e.pos.s = tr.from.s + (t.s - tr.from.s) * k;
        if (p >= 1) {
          e.travel = null;
          settleTo(t);
          if (!reducedNow() && !e.leaving) {
            pose("land", 450);
            if (rail === "header") petals();
          }
        }
        keep = true;
      } else {
        // The edge rail glides gently after the pointer, but steps briskly
        // off a control the page has just scrolled under it.
        const onControl = rail === "edge" && e.geo.noGo.some((r) => rectsIntersect(r, figureRect(e.pos.x, e.pos.y, e.pos.s), 2));
        const k = reducedNow() || e.pos.x > vw + 10 ? 1 : 1 - Math.exp(-dt * (rail === "edge" && !onControl ? 5.5 : onControl ? 14 : 9));
        e.pos.x += (t.x - e.pos.x) * k;
        e.pos.y += (t.y - e.pos.y) * k;
        e.pos.s += (t.s - e.pos.s) * k;
      }
      const dist = Math.hypot(t.x - e.pos.x, t.y - e.pos.y) + Math.abs(t.s - e.pos.s) * SIZE;
      if (dist > 0.3) keep = true;
      else if (!e.drag && !e.fly && !e.travel) settleTo(t);
      const speed = dist / dt;
      e.walkFrames = speed > 60 && !e.travel && !e.drag && !e.fly ? e.walkFrames + 1 : 0;

      // Beat-locked bob while music plays (and the menu's little dance).
      const dancing = e.dance && now < e.dance.until;
      if ((L.playing && typeof L.clock === "function") || dancing) {
        const beat = dancing ? ((now - e.dance.t0) / 1000) * (96 / 60) : Number(L.clock());
        if (Number.isFinite(beat) && L.playing) musical(beat, now);
        if (Number.isFinite(beat) && !reducedNow()) {
          const amp = dancing ? 5 : L.mode === "listen" ? 4 : L.mode === "perform" ? 1.5 : 0;
          const meter = L.score?.meter || 4;
          const down = Math.floor(beat + 1e-6) % meter === 0 ? 1.3 : 1;
          const bob = beatBob(beat) * amp * down;
          const rot = amp ? (Math.floor(beat) % 2 ? 1 : -1) * 3 * beatBob(beat) : 0;
          write("bob", `${bob.toFixed(1)}|${rot.toFixed(1)}`, () => {
            body.style.translate = `0 ${(-bob).toFixed(1)}px`;
            body.style.rotate = `${rot.toFixed(1)}deg`;
          });
          keep = keep || amp > 0;
        }
      } else {
        write("bob", "", () => {
          body.style.translate = "";
          body.style.rotate = "";
        });
        e.lastBeat = null;
      }

      // Gaze: drag direction, the pointer within 400 px, the dialog, saccades.
      if (!e.drag && !e.fly) {
        const fr = figureRect(e.pos.x, e.pos.y, e.pos.s);
        const cx = (fr.left + fr.right) / 2,
          cy = (fr.top + fr.bottom) / 2;
        const dx = e.pointer.x - cx,
          dy = e.pointer.y - cy;
        const near = Math.hypot(dx, dy) < 400 && now - e.pointer.t < 4000;
        if (L.bubble) {
          e.gaze.tx = 0;
          e.gaze.ty = 0;
        } else if (near && !L.state.quiet) {
          e.gaze.tx = clamp(dx / 300, -1, 1);
          e.gaze.ty = clamp(dy / 300, -1, 1);
        } else if (e.geo.modal && L.modal) {
          e.gaze.tx = clamp((e.geo.modal.left + e.geo.modal.right) / 2 - cx, -300, 300) / 300;
          e.gaze.ty = clamp((e.geo.modal.top + e.geo.modal.bottom) / 2 - cy, -300, 300) / 300;
        }
      }
      const gk = 1 - Math.exp(-dt * 14);
      e.gaze.x += (e.gaze.tx - e.gaze.x) * gk;
      e.gaze.y += (e.gaze.ty - e.gaze.y) * gk;
      if (Math.abs(e.gaze.tx - e.gaze.x) > 0.02 || Math.abs(e.gaze.ty - e.gaze.y) > 0.02) keep = true;
      if (Math.abs((e.written.gx ?? 9) - e.gaze.x) > 0.04) {
        e.written.gx = e.gaze.x;
        el.style.setProperty("--gx", e.gaze.x.toFixed(2));
      }
      if (Math.abs((e.written.gy ?? 9) - e.gaze.y) > 0.04) {
        e.written.gy = e.gaze.y;
        el.style.setProperty("--gy", e.gaze.y.toFixed(2));
      }
      const vx = (e.pos.x - (e.prevX ?? e.pos.x)) / dt;
      e.prevX = e.pos.x;
      const tilt = e.drag || e.fly ? 0 : clamp(vx * 0.03, -14, 14) + (t.peek ? (t.x > vw / 2 ? -14 : 14) : 0);
      if (Math.abs((e.written.tilt ?? 99) - tilt) > 0.04) {
        e.written.tilt = tilt;
        el.style.setProperty("--tilt", `${tilt.toFixed(1)}deg`);
      }

      // One transform per frame.
      el.style.transform = `translate3d(${e.pos.x.toFixed(1)}px, ${e.pos.y.toFixed(1)}px, 0) scale(${e.pos.s.toFixed(3)})`;
      prop("--buddy-scale", e.pos.s.toFixed(3));
      cls("walking", (e.walkFrames >= 2 || !!e.leaving) && !reducedNow());
      cls("peek", !!t.peek && !e.drag && !e.fly);
      cls("tucked", !!L.hidden || !!t.hide);
      cls("held", !!e.drag);
      cls("flying", !!e.fly);
      cls("dancing", !!(L.playing || dancing));
      cls("quiet", !!L.state.quiet);
      // C3: report where the companion is, once it has arrived.
      const shown = !L.hidden && !t.hide;
      flag("buddy", shown ? "on" : "off");
      const arrived = dist < 2 && !e.travel && !e.drag && !e.fly;
      // A scrolled exercise control can arrive under the old edge position
      // before the debounced survey. Keep that transition click-through
      // until the new geometry has been measured and the figure settles.
      if (e.layoutGuard && !e.layoutPending && arrived) {
        e.layoutGuard = false;
        cls("layout-moving", false);
      }
      if (arrived && !e.settled) e.settled = true;
      flag("buddyAt", shown && e.settled ? rail : null);

      // Sleep: nothing moving, pointer still, no music.
      const pointerStill = now - e.pointer.t > 200;
      if (keep || !pointerStill || dancing) wake();
    };

    // ------------------------------------------------- musical reactions ---
    const cool = (key, ms, now) => {
      if ((e.cueCool[key] ?? -Infinity) > now) return false;
      e.cueCool[key] = now + ms;
      return true;
    };
    const musical = (beat, now) => {
      const prev = e.lastBeat;
      e.lastBeat = beat;
      if (prev == null || beat <= prev || beat - prev > 4) return;
      const c = cuesRef.current;
      const L = live.current;
      if (cueBetween(c.leaps, prev, beat) && cool("leap", 8000, now)) {
        pose("gasp", 450);
        face("gasp", 450);
      } else if (cueBetween(c.loud, prev, beat) && cool("loud", 4 * (L.score?.meter || 4) * clamp(L.beatSeconds || 0.8, 0.2, 2.4) * 1000, now)) {
        pose(e.rail === "cue" ? "hop-sm" : "hop", 240);
        face("proud", 400);
      } else {
        const end = cueBetween(c.phraseEnds, prev, beat);
        if (end && cool("phrase", 4000, now)) {
          pose("nod", 320);
          if (end.strength >= 1) face("boop", 300);
        }
      }
    };
    const verdict = (kind) => {
      const L = live.current;
      if (!L.playing) return;
      const now = performance.now();
      const firstBars = L.mode === "perform" && (L.bar || 1) <= 4;
      const s = streakStep(e.streak, kind);
      e.streak = s.run;
      if (kind === "miss") {
        e.runMisses += 1;
        if (firstBars) return;
        e.missTimes = [...e.missTimes.filter((t) => now - t < 6000), now];
        const recent = e.missTimes.filter((t) => now - t <= 1500).length;
        const r = missReaction({
          recent,
          hits: e.runHits,
          misses: e.runMisses,
          worriedReady: (e.cueCool.worried ?? -Infinity) <= now,
        });
        if (r === "soft") {
          if (cool("soft", 6000, now)) face("soft", 700);
        } else if (r === "worried") {
          cool("worried", 10000, now);
          face("worried", 500);
        } else if (r === "wince") face("wince", 120);
        return;
      }
      e.runHits += 1;
      if (L.mode === "wait") pose("micronod", 80);
      if (s.milestone === 10) face("proud", 600);
      else if (s.milestone) {
        face("proud", 600);
        const text = lineFor("streak", { n: s.milestone });
        e.speech = { ...e.speech, queue: { text, at: Date.now() } };
      }
    };
    api.current.verdict = verdict;
    const onVerdict = (ev) => {
      api.current.sawVerdict = true;
      verdict(ev?.detail?.kind);
    };
    window.addEventListener("luma:verdict", onVerdict);

    // ------------------------------------------------------- listeners ---
    const onMove = (ev) => {
      const now = performance.now();
      e.pointer.x = ev.clientX;
      e.pointer.y = ev.clientY;
      e.pointer.t = now;
      if (now - e.activity > 1000) activity(now);
      const fr = figureRect(e.pos.x, e.pos.y, e.pos.s);
      const near = Math.hypot(ev.clientX - (fr.left + fr.right) / 2, ev.clientY - (fr.top + fr.bottom) / 2) < 400;
      if (near || e.rail === "gap" || e.rail === "edge" || e.drag) wake();
    };
    const activity = (now = performance.now()) => {
      const was = e.drowsy;
      e.activity = now;
      if (was !== "awake") {
        e.drowsy = "awake";
        applyFace(now);
        if (was === "asleep") {
          face("surprised", 500);
          speak(lineFor("wake"), P.AMBIENT, { face: "happy" });
        }
      }
      arm();
    };
    const onDown = (ev) => {
      activity();
      if (ev.target?.closest?.(".modal")) clearBubble();
    };
    const onWheel = (ev) => {
      if (ev.target?.closest?.(".modal")) clearBubble();
    };
    const onKey = () => activity();
    // Scrolling: per frame only the header seat is followed (one rect); the
    // full no-go survey runs once the page comes to rest, so the edge slot
    // and any bubble are judged against the controls now under them.
    let scrollQueued = false;
    let scrollEnd = 0;
    const followSeat = () => {
      const L = live.current;
      if (L.modal || L.view === "practice" || e.rail !== "header") return;
      const r = document.querySelector('[data-buddy-seat="header"]')?.getBoundingClientRect();
      const vh = e.geo.vh;
      const shown = r?.height ? Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / r.height : 0;
      e.geo = { ...e.geo, seat: shown >= 0.6 ? plain(r) : null };
      // On the header seat it scrolls with the page, no easing.
      if (e.geo.seat) {
        settleTo(targetFor("header"));
        e.travel = null;
      }
    };
    const onScroll = (ev) => {
      // Scrolling inside the chat or a dialog does not move the page.
      if (ev?.target?.closest?.(".buddy, .buddy-menu, .companion-dock")) return;
      if (live.current.view === "exercises") {
        e.layoutGuard = e.layoutPending = true;
        cls("layout-moving", true);
      }
      clearTimeout(scrollEnd);
      scrollEnd = setTimeout(() => {
        measure();
        e.layoutPending = false;
        wake();
      }, 140);
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        followSeat();
        wake();
      });
    };
    const onDisclosure = (ev) => {
      if (!ev.target?.closest?.(".exercise-workspace")) return;
      e.layoutGuard = true;
      cls("layout-moving", true);
      measure();
      wake();
    };
    const onResize = () => measure();
    const onVisibility = () => {
      if (!document.hidden) {
        e.last = performance.now();
        measure();
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onWheel, { passive: true, capture: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("toggle", onDisclosure, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => measure()) : null;
    const main = document.querySelector("main.app-main");
    if (ro && main) ro.observe(main);
    // Class changes on the app and the practice screen, and children coming
    // and going at the app's top level (a notice arriving or leaving). A
    // notice slides in, so it is measured again once it has landed.
    let settleTimer = 0;
    const mo =
      typeof MutationObserver === "function"
        ? new MutationObserver((records) => {
            measure();
            if (records.some((r) => r.type === "childList")) {
              clearTimeout(settleTimer);
              settleTimer = setTimeout(measure, 360);
            }
          })
        : null;
    const watchClasses = () => {
      if (!mo) return;
      mo.disconnect();
      const app = document.querySelector(".app");
      if (app) mo.observe(app, { attributes: true, attributeFilter: ["class", "data-screen", "data-transport"], childList: true });
      const practice = document.querySelector(".practice-screen");
      if (practice) mo.observe(practice, { attributes: true, attributeFilter: ["class", "data-screen", "data-transport"] });
    };
    watchClasses();
    const interval = setInterval(() => {
      if (live.current.playing) return;
      watchClasses();
      measure();
    }, 1000);
    // In Wait mode the eyes go to the key that's waiting (every 300 ms).
    const keyGaze = setInterval(() => {
      const L = live.current;
      if (!L.playing || L.mode !== "wait" || e.drag) return;
      const key = document.querySelector(".keyboard-stage .piano-key.lit, .keyboard-stage .lit");
      const r = key?.getBoundingClientRect();
      if (!r?.width) return;
      const fr = figureRect(e.pos.x, e.pos.y, e.pos.s);
      e.gaze.tx = clamp(((r.left + r.right) / 2 - (fr.left + fr.right) / 2) / 300, -1, 1);
      e.gaze.ty = clamp(((r.top + r.bottom) / 2 - (fr.top + fr.bottom) / 2) / 300, -1, 1);
      wake();
    }, 300);
    api.current.measure = measure;
    api.current.activity = activity;

    // ------------------------------------------------- drag and release ---
    const remember = () => {
      const L = live.current;
      if (L.view === "practice") return;
      const side = e.pos.x + SIZE / 2 < e.geo.vw / 2 ? "left" : "right";
      if (side !== L.state.side) patchState({ side });
    };
    api.current.grab = (ev, offX, offY) => {
      e.drag = { offX, offY, vx: 0, vy: 0, samples: [], since: performance.now() };
      e.travel = null;
      e.fly = null;
      clearBubble();
      face("surprised", 400);
      setTimeout(() => e.drag && face("happy", 60000), 400);
      wake();
    };
    api.current.dragMove = (ev) => {
      if (!e.drag) return;
      const now = performance.now();
      e.drag.samples = [...e.drag.samples.filter((s) => now - s.t <= 120), { x: ev.clientX, y: ev.clientY, t: now }];
    };
    api.current.release = () => {
      const d = e.drag;
      if (!d) return;
      e.drag = null;
      const now = performance.now();
      const v = releaseVelocity(d.samples, now);
      face("neutral", 1);
      prop("--vx-tilt", "0deg");
      const fr = figureRect(e.pos.x, e.pos.y, e.pos.s);
      const onMusic = e.geo.noGo.some((r) => rectsIntersect(r, fr, 4));
      if (!reducedNow() && v.speed >= PHYSICS.toss) {
        e.fly = { x: e.pos.x, y: e.pos.y, vx: v.vx, vy: v.vy, angle: 0, dizzy: v.speed > PHYSICS.dizzy };
        cls("flying", true);
      } else {
        if (onMusic) face("surprised", 300);
        startTravel(targetFor(railNow(now)));
        if (e.travel) e.travel.dur = 260;
        remember();
      }
      wake();
    };
    api.current.toggleTuck = () => {
      e.tucked = !e.tucked;
      // "Come back out" brings it home to where it can be seen.
      if (!e.tucked) e.sidePicked = "";
      e.edge = null;
      wake();
    };
    api.current.nudge = (dy) => {
      e.edgeNudge = clamp(e.edgeNudge + dy, -0.4, 0.4);
      if (e.edge) e.edge.stale = true;
      wake();
    };
    // "Move to the left side" and the arrow keys: leave the header seat for
    // the window's edge on this screen, so the move can be seen.
    api.current.pickSide = () => {
      e.sidePicked = live.current.view;
      if (e.edge) e.edge.stale = true;
      wake();
    };
    api.current.dance = () => {
      e.dance = { t0: performance.now(), until: performance.now() + 8000 };
      face("happy", 8000);
      wake();
    };
    // Goodbye: a wave while it walks off the right edge (400 ms).
    api.current.leave = () => {
      e.drag = e.fly = null;
      e.leaving = { x: e.geo.vw + 30, y: e.pos.y, s: e.pos.s };
      e.travel = { from: { ...e.pos }, t0: performance.now(), dur: 400, lift: 0 };
      pose("wave", 440);
      face("happy", 800);
      wake();
    };
    api.current.unleave = () => {
      e.leaving = null;
      e.travel = null;
      wake();
    };
    api.current.bow = (ms = 5200) => {
      e.bowUntil = performance.now() + ms;
      arm();
      wake();
    };
    api.current.resetRun = () => {
      e.streak = 0;
      e.runHits = 0;
      e.runMisses = 0;
      e.missTimes = [];
      e.runStart = Date.now();
    };
    api.current.missesRecent = () => {
      const now = performance.now();
      return e.missTimes.filter((t) => now - t < 6000).length;
    };

    measure();
    arm();
    wake();
    return () => {
      cancelAnimationFrame(e.frame);
      clearTimeout(alarmTimer);
      clearTimeout(petalTimer);
      clearTimeout(scrollEnd);
      clearTimeout(settleTimer);
      clearInterval(interval);
      clearInterval(keyGaze);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("luma:verdict", onVerdict);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("toggle", onDisclosure, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      delete html.dataset.buddy;
      delete html.dataset.buddyAt;
      api.current.engine = null;
    };
  }, [present, clearBubble, speak, lineFor]);

  // A bubble coming or going changes where the eyes look and whether the
  // companion holds still: let the loop catch up.
  useEffect(() => {
    api.current.wake?.();
  }, [bubble, menu]);

  // Disabled: tell the page so stand-in figures come back.
  useEffect(() => {
    if (present) return;
    document.documentElement.dataset.buddy = "off";
    delete document.documentElement.dataset.buddyAt;
  }, [present]);

  // Turned off: wave and walk off the right edge, then unmount (450 ms).
  // Turned back on: hop in. Reduced motion: at once.
  useEffect(() => {
    if (enabled) {
      api.current.unleave?.();
      setPresent(true);
      return;
    }
    if (!present) return;
    if (reduced || !api.current.engine) {
      setPresent(false);
      return;
    }
    clearBubble();
    setMenu(null);
    api.current.leave?.();
    const t = setTimeout(() => setPresent(false), 450);
    return () => clearTimeout(t);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new companion: the old one waves twice and slides off the nearest
  // edge; the new one hops in from that edge with a few hearts.
  useEffect(() => {
    if (character === shown) {
      setSwap("");
      return;
    }
    const e = api.current.engine;
    if (reduced || !e || !present) {
      setShown(character);
      setSwap("");
      setGreeting(false);
      return;
    }
    // Slide toward the nearest edge, as far as the way is clear (up to
    // 140 px): never across a control, the music or a notice (the picker's
    // "joins you" toast lands in the header gap at the same moment). The
    // other way when it has more room; the fade does the rest.
    const slideDir = () => {
      const noGo = api.current.engine?.geo?.noGo || [];
      const fr = figureRect(e.pos.x, e.pos.y, e.pos.s);
      const reach = (dir) => {
        let d = 0;
        for (let step = 10; step <= 140; step += 10) {
          const path = box(Math.min(fr.left, fr.left + dir * step), fr.top + 4, fr.width + step, fr.height - 8);
          if (noGo.some((r) => rectsIntersect(path, r, 2)) || path.left < 0 || path.right > innerWidth) break;
          d = step;
        }
        return d;
      };
      let dir = (fr.left + fr.right) / 2 < innerWidth / 2 ? -1 : 1;
      if (reach(-dir) > reach(dir)) dir = -dir;
      root.current?.style.setProperty("--swap-dx", `${dir * reach(dir)}px`);
    };
    slideDir();
    clearBubble();
    setMenu(null);
    api.current.pose?.("wave", 440);
    const timers = [
      setTimeout(() => {
        slideDir();
        setSwap("out");
      }, 440),
      setTimeout(() => {
        setShown(character);
        setSwap("in");
        setGreeting(true);
        burst("hearts", 6);
        api.current.face?.("happy", 1400);
      }, 700),
      setTimeout(() => setSwap(""), 1080),
      setTimeout(() => setGreeting(false), 1700),
    ];
    return () => timers.forEach(clearTimeout);
  }, [character]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any prop change may move the companion: wake the loop and re-measure.
  const { view, playing: isPlaying, mode } = props;
  useEffect(() => {
    api.current.measure?.();
    api.current.wake?.();
  }, [view, modal, isPlaying, mode, hiddenNow, savedState?.side, savedState?.quiet]);

  // ------------------------------------------------- bond and treats ---
  const pendingLevel = useRef(0);
  const pendingTreat = useRef(false);
  const enabledAt = useRef(0);
  const celebrateLevel = useCallback(() => {
    const n = pendingLevel.current;
    const L = live.current;
    if (!n || (L.playing && L.view === "practice") || L.modal) return;
    // Wait for the achievement budget (one line per 8 s) rather than lose
    // the line to it.
    const since = Date.now() - (api.current.engine?.speech.lastAchieve ?? -Infinity);
    if (since < 8000) {
      clearTimeout(api.current.levelTimer);
      api.current.levelTimer = setTimeout(celebrateLevel, 8100 - since);
      return;
    }
    pendingLevel.current = 0;
    const fx = api.current;
    fx.face?.("proud", 1800);
    fx.pose?.("bow", 1160);
    burst("hearts", 9);
    speak(lineFor("levelup", { n }), P.ACHIEVE, { face: "proud" });
  }, [burst, speak, lineFor]);
  /** Bond XP for the companion on screen; a new heart is celebrated the
   * next time the music stops (or soon, when it isn't playing). */
  const addXp = useCallback(
    (xp, opts) => {
      const L = live.current;
      const g = gainBond(L.state.bond, L.character, xp, todayKey(), opts);
      if (g.bond === L.state.bond) return;
      patchState({ bond: g.bond });
      if (g.to > g.from) {
        pendingLevel.current = g.to;
        if (!L.playing) setTimeout(celebrateLevel, 1400);
      }
    },
    [patchState, celebrateLevel],
  );
  /** "+1 treat": a face and the treat itself popping over the head. While
   * music plays it waits for the stop. */
  const treatEarned = useCallback(() => {
    const L = live.current;
    if (L.playing && L.view === "practice") {
      pendingTreat.current = true;
      return;
    }
    pendingTreat.current = false;
    if (!L.state.quiet && !L.reduced) setTreat({ id: Math.random(), kind: "pop" });
    speak(lineFor("treat:earned"), P.ACHIEVE, { face: "proud" });
  }, [speak, lineFor]);
  /** Pay out treats for what just happened; returns the jar result. */
  const earn = useCallback(
    (events) => {
      const L = live.current;
      const out = earnTreats(L.state.treats, todayKey(), events);
      if (out.reasons.length) patchState({ treats: out.treats });
      return out;
    },
    [patchState],
  );
  // A treat from the menu: it floats to the mouth, three chews, smitten,
  // then a contented sway. +5 bond.
  const feed = useCallback(() => {
    const L = live.current;
    const next = feedTreat(L.state.treats);
    if (!next) return;
    patchState({ treats: next });
    const fx = api.current;
    clearBubble();
    setTreat({ id: Math.random(), kind: "feed" });
    fx.face?.("content", 700);
    const chew = L.reduced ? 0 : 600;
    [0, 1, 2, 3, 4, 5].forEach((i) => setTimeout(() => fx.face?.(i % 2 ? "content" : "chew", 170), chew + i * 140));
    setTimeout(() => {
      setTreat(null);
      fx.face?.("smitten", 1600);
      speak(lineFor("treat"), P.USER, { face: null });
      setTimeout(() => {
        fx.pose?.("sway", 4000);
        fx.face?.("content", 4000);
      }, 1600);
      addXp(5);
    }, chew + 6 * 140);
  }, [patchState, clearBubble, speak, lineFor, addXp]);
  useEffect(() => {
    if (!treat) return;
    const t = setTimeout(() => setTreat(null), treat.kind === "pop" ? 1400 : 2200);
    return () => clearTimeout(t);
  }, [treat]);

  // Practice minutes: +1 bond per minute, credited when a run is logged.
  const lastMinutes = useRef(null);
  const stoppedAt = useRef(0);
  const { minutes: totalMinutes } = props;
  useEffect(() => {
    const prev = lastMinutes.current;
    lastMinutes.current = Number.isFinite(totalMinutes) ? totalMinutes : prev;
    if (prev == null || !enabled || Date.now() - enabledAt.current < 3000) return;
    // The run is logged in the same render that stops it (wasPlaying is
    // still true then), or shortly after.
    if (!playing && !wasPlaying.current && Date.now() - stoppedAt.current > 4000) return;
    const xp = minuteXp(prev, totalMinutes, 120);
    if (xp) addXp(xp);
  }, [totalMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------- moments ---
  // Launch greeting: the time of day, a streak, the piece where you left
  // it, or "back again" (lastSeen). Turned back on later: a hello.
  const welcomed = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    enabledAt.current = Date.now();
    lastMinutes.current = Number.isFinite(props.minutes) ? props.minutes : null;
    const first = !welcomed.current;
    welcomed.current = true;
    const t = setTimeout(() => {
      api.current.pose?.("hop", 520);
      if (!first) {
        speak(lineFor("hello"), P.USER, { face: "happy" });
        return;
      }
      const L = live.current;
      const today = todayKey();
      let streak = 0;
      try {
        streak = L.journal?.days ? practiceStreak(L.journal, L.history || []) : 0;
      } catch {
        streak = 0;
      }
      const left = L.scoreId ? L.journal?.pieces?.[L.scoreId] : null;
      const { event, ctx } = welcomeEvent({
        hour: new Date().getHours(),
        today,
        lastSeen: L.state.lastSeen,
        streak,
        piece: left ? { title: left.title || L.title, bar: left.bar } : null,
      });
      if (speak(lineFor(event, ctx), P.AMBIENT, { face: "happy" }) === "say") burst("notes", 7);
      if (L.state.lastSeen !== today) patchState({ lastSeen: today });
      // Streak milestones (3, 7, 14, 30, 100 days) each put a treat in the jar.
      if (earn({ streak }).earned) setTimeout(treatEarned, 3200);
    }, 1400);
    return () => clearTimeout(t);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Screens: once per view per 30 min, never within 20 s of the last change.
  const viewSeen = useRef({ last: 0, views: {} });
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const now = Date.now();
    const seen = viewSeen.current;
    const recent = now - seen.last < 20000;
    seen.last = now;
    if (recent || now - (seen.views[view] ?? -Infinity) < 1800000) return;
    seen.views[view] = now;
    setTimeout(() => speak(lineFor(`view:${view}`), P.AMBIENT, { face: "neutral" }), 900);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play / pause: silent while playing; a word only after a real run.
  const wasPlaying = useRef(false);
  const runStarted = useRef(0);
  useEffect(() => {
    const e = api.current.engine;
    if (playing && !wasPlaying.current) {
      clearBubble();
      setMenu(null);
      runStarted.current = Date.now();
      api.current.resetRun?.();
      api.current.activity?.();
    } else if (!playing && wasPlaying.current && e) {
      stoppedAt.current = Date.now();
      const ran = Date.now() - runStarted.current;
      const missed = (api.current.missesRecent?.() ?? 0) >= 4;
      const { text, state: next } = flushQueue(e.speech, Date.now());
      e.speech = next;
      setTimeout(() => {
        if (live.current.playing) return;
        if (text) speak(text, P.ACHIEVE, { face: "proud" });
        else if (missed && !finished) speak(lineFor("miss:run"), P.ACHIEVE, { face: "content" });
        else if (ran >= 20000 && !finished && !live.current.modal) speak(lineFor("pause"), P.AMBIENT, { face: "content" });
      }, 500);
      // Treats earned and new hearts wait for the music to stop.
      if (pendingTreat.current) setTimeout(treatEarned, 1800);
      if (pendingLevel.current) setTimeout(celebrateLevel, 2600);
    }
    wasPlaying.current = playing;
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Halfway and milestones: achievements, queued until the music stops.
  const halfwaySaid = useRef(false);
  const { bar = 1, measures = 1 } = props;
  useEffect(() => {
    const e = api.current.engine;
    if (!playing || !e || measures < 12) return;
    if (!halfwaySaid.current && bar === Math.ceil(measures / 2) + 1) {
      halfwaySaid.current = true;
      speechQueue(e, lineFor("halfway"));
    } else if (bar > 1 && bar % 16 === 1) speechQueue(e, lineFor("milestone", { bar }));
  }, [bar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (bar <= 2) halfwaySaid.current = false;
  }, [bar, props.title]);

  // Verdicts from the hits/misses counters when the page sends no events.
  const { hits = 0, misses = 0 } = props;
  const lastHits = useRef(hits),
    lastMisses = useRef(misses);
  useEffect(() => {
    if (!api.current.sawVerdict) {
      if (misses > lastMisses.current) api.current.verdict?.("miss");
      else if (hits > lastHits.current) api.current.verdict?.("hit");
    }
    lastHits.current = hits;
    lastMisses.current = misses;
  }, [hits, misses]);

  // The end of a piece: a bow in the header gap (5.2 s).
  const wasFinished = useRef(finished);
  useEffect(() => {
    if (finished && !wasFinished.current) {
      api.current.bow?.(5200);
      // A bow in the header gap: head down 380 ms, hold 420, up 360.
      api.current.pose?.("bow", 1160);
      api.current.face?.("happy", 5200);
      burst("confetti", 18, { quietHeart: true });
      setTimeout(() => api.current.pose?.("cheer2", 1400), 1200);
      // Graded runs speak when the report card opens.
      if (props.mode === "listen") speak(lineFor("finish"), P.ACHIEVE, { face: "happy" });
    }
    wasFinished.current = finished;
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // The report card: the score decides the reaction. Read once per card.
  const resultsSeen = useRef(null);
  useEffect(() => {
    if (!results || resultsSeen.current === results) return;
    resultsSeen.current = results;
    const entry = results.entry || {};
    const acc = Number.isFinite(entry.accuracy) ? entry.accuracy / 100 : (results.result?.accuracy ?? 0);
    const earlier = (history || []).filter((h) => h !== entry && h.at !== entry.at && entry.scoreId && h.scoreId === entry.scoreId);
    const best = earlier.length > 0 && earlier.every((h) => (entry.accuracy ?? 0) > h.accuracy);
    const end = endingFor({ accuracy: acc, complete: !!entry.complete, best });
    // The next step names real bars: on an early stop, the last bars reached
    // (where it got hard), otherwise the start of the run.
    const reached = Array.isArray(results.barsReached) && results.barsReached.every(Number.isFinite) ? results.barsReached : null;
    let a = score ? measureAt(score, Math.max(0, results.from ?? 0)) : 1;
    let b = score ? Math.max(a, measureAt(score, Math.max(0, (results.end ?? 1) - 1e-4))) : a;
    if (!entry.complete && reached) {
      b = Math.max(reached[0], reached[1]);
      a = Math.max(reached[0], b - 3);
    }
    const ctx = { acc: Math.round(acc * 100), a, b: Math.min(b, a + 3), title: entry.title || props.title || "this piece" };
    setTimeout(() => {
      const fx = api.current;
      if (end.tier === "ovation") {
        fx.pose?.("cheer", 2100);
        fx.face?.("proud", 2400);
        burst("confetti", 18, { quietHeart: true });
      } else if (end.tier === "great") {
        fx.pose?.("cheer2", 1400);
        fx.face?.("happy", 2000);
        burst("hearts", 8, { quietHeart: true });
      } else if (end.tier === "good") {
        fx.pose?.("nod", 320);
        fx.face?.("happy", 1600);
        burst("sparkles", 6, { quietHeart: true });
      } else {
        fx.pose?.("nod", 320);
        fx.face?.("content", 1600);
      }
      if (best) {
        fx.pose?.("hop", 520);
        burst("sparkles", 6);
      }
      speak(lineFor(end.line, ctx), P.ACHIEVE, { face: end.tier === "keepgoing" ? "content" : "proud" });
      if (entry.complete) {
        addXp(10);
        // A complete run of 90 % or more: a treat (two a day at most).
        if (earn({ run: { accuracy: acc, complete: true } }).earned) setTimeout(treatEarned, 2400);
      }
    }, 700);
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  // A dialog: clear the bubble at once; a short word for some of them.
  useEffect(() => {
    clearBubble();
    setMenu(null);
    if (!modal) {
      if (pendingLevel.current) setTimeout(celebrateLevel, 900);
      return;
    }
    const line = modal === "backing" ? "backing:open" : modal === "import" ? "import" : modal === "settings" ? "settings" : null;
    if (line) setTimeout(() => speak(lineFor(line), P.AMBIENT, { face: "neutral" }), 600);
  }, [modal]); // eslint-disable-line react-hooks/exhaustive-deps

  const wasGoal = useRef(props.goalReached);
  useEffect(() => {
    // Not on the first seconds after launch: that is the saved total
    // arriving, not the goal being reached now.
    if (props.goalReached && !wasGoal.current && enabled && Date.now() - enabledAt.current > 3000) {
      const paid = earn({ goal: true });
      const first = paid.reasons.includes("goal");
      api.current.face?.("proud", 2000);
      burst("confetti", 12, { quietHeart: true });
      speak(lineFor("goal"), P.ACHIEVE, { face: "proud" });
      if (first) addXp(15);
      if (paid.earned) setTimeout(treatEarned, 2400);
    }
    wasGoal.current = props.goalReached;
  }, [props.goalReached]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------- touch ---
  const touch = useRef({ clicks: [], chatTimer: 0, tickleUntil: 0, pokes: [], faceOnlyUntil: 0, lastPoke: "", press: null, suppress: false, pet: null, petting: null });
  const reaction = useCallback(
    (kind) => {
      const fx = api.current;
      if (kind === "hop") {
        fx.pose?.("hop", 520);
        burst("hearts", 7);
      } else if (kind === "spin") fx.pose?.("spin", 560);
      else if (kind === "wave") fx.pose?.("wave", 700);
      else if (kind === "notes") {
        fx.pose?.("doublehop", 620);
        burst("notes", 5);
      } else if (kind === "boop") {
        fx.face?.("boop", 300);
        setTimeout(() => fx.face?.("surprised", 500), 300);
        fx.pose?.("boop", 400);
        return;
      }
      fx.face?.("happy", 1400);
    },
    [burst],
  );
  const poke = useCallback(() => {
    const T = touch.current;
    const L = live.current;
    const e = api.current.engine;
    if (!e) return;
    api.current.activity?.();
    if (e.tucked) api.current.toggleTuck?.();
    const now = Date.now();
    T.pokes = [...T.pokes.filter((t) => now - t < 20000), now];
    const drawn = pokeFromBag(T.bag, T.lastPoke);
    T.bag = drawn.bag;
    const kind = drawn.kind;
    T.lastPoke = kind;
    reaction(kind);
    if (now < T.faceOnlyUntil) return;
    if (T.pokes.length >= 6) {
      T.faceOnlyUntil = now + 20000;
      T.pokes = [];
      speak(lineFor("pokes:many"), P.USER, { face: "surprised" });
      return;
    }
    const { text: held, state: next } = takeNews(e.speech, now);
    e.speech = next;
    const firstEver = !L.state.hintSeen;
    speak(held || lineFor("poke"), P.USER, { face: kind === "boop" ? null : "happy", hint: firstEver });
    if (firstEver && api.current.hintShown) patchState({ hintSeen: true });
  }, [reaction, speak, lineFor]);
  const tickle = useCallback(() => {
    const fx = api.current;
    fx.pose?.("wiggle", 560);
    fx.face?.(live.current.character === "mozart" ? "wink" : "happy", 1400);
    burst("confetti", 6);
    speak(lineFor("tickle"), P.USER, { face: null });
  }, [burst, speak, lineFor]);
  // A menu opened with the mouse hands focus back as a click, so Space
  // still plays the music after Esc instead of poking the companion.
  const menuByPointer = useRef(false);
  const openMenu = useCallback((byPointer = false) => {
    const L = live.current;
    const e = api.current.engine;
    if (!e || (L.playing && L.mode === "perform")) return;
    clearBubble();
    const fr = root.current?.querySelector(".buddy-hit")?.getBoundingClientRect();
    menuByPointer.current = byPointer;
    if (fr) setMenu({ anchor: plain(fr) });
  }, [clearBubble]);
  const closeMenu = useCallback((refocus) => {
    setMenu(null);
    if (refocus) restoreFocus(root.current?.querySelector(".buddy-hit"), menuByPointer.current, { preventScroll: true });
  }, []);
  const choose = useCallback(
    (id) => {
      const L = live.current;
      setMenu(null);
      root.current?.querySelector(".buddy-hit")?.focus({ preventScroll: true });
      if (id === "chat") L.onOpenChat?.();
      else if (id === "dance") !L.playing && api.current.dance?.();
      else if (id === "treat") feed();
      else if (id === "quiet") {
        const quiet = !L.state.quiet;
        if (quiet) {
          // Said once, on the way into the quiet.
          show(lineFor("quiet:on"));
          api.current.face?.("content", 1600);
        } else api.current.face?.("happy", 1200);
        patchState({ quiet });
      } else if (id === "side") {
        patchState({ side: L.state.side === "left" ? "right" : "left" });
        api.current.pickSide?.();
      }
      else if (id === "tuck") api.current.toggleTuck?.();
      else if (id === "hide") L.onHide?.();
    },
    [show, lineFor, feed, patchState],
  );

  const onClick = (ev) => {
    const T = touch.current;
    if (T.suppress) {
      T.suppress = false;
      return;
    }
    // Keyboard and programmatic clicks are a plain poke.
    if (ev.detail === 0) return poke();
    const now = performance.now();
    // A double-click as the system counts it (it honours the user's macOS
    // double-click speed) always opens the chat; a fixed time window missed
    // ordinary, slightly slower double-clicks.
    // A third click within the system interval cancels it (the start of a
    // tickle); four or more are a tickle.
    if (ev.detail >= 2) {
      clearTimeout(T.chatTimer);
      if (ev.detail === 2)
        T.chatTimer = setTimeout(() => {
          T.clicks = [];
          clearBubble();
          live.current.onOpenChat?.();
        }, 220);
      else if (ev.detail === 4) {
        T.clicks = [];
        if (Date.now() >= T.tickleUntil) {
          T.tickleUntil = Date.now() + 20000;
          tickle();
        } else poke();
      }
      return;
    }
    T.clicks = [...T.clicks.filter((t) => now - t <= 1600), now];
    const gesture = classifyClicks(T.clicks, now);
    clearTimeout(T.chatTimer);
    if (gesture === "tickle") {
      T.clicks = [];
      if (Date.now() >= T.tickleUntil) {
        T.tickleUntil = Date.now() + 20000;
        tickle();
      } else poke();
      return;
    }
    if (T.clicks.length === 1) poke();
    else if (T.clicks.length === 3) api.current.pose?.("hop", 520);
    if (gesture === "pending")
      T.chatTimer = setTimeout(() => {
        if (classifyClicks(T.clicks, performance.now()) === "chat") {
          T.clicks = [];
          clearBubble();
          live.current.onOpenChat?.();
        }
      }, 280);
  };
  const onPointerDown = (ev) => {
    if (ev.button !== 0) return;
    const T = touch.current;
    T.suppress = false;
    const r = ev.currentTarget.getBoundingClientRect();
    const e = api.current.engine;
    T.press = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, offX: ev.clientX - (e?.pos.x ?? r.left), offY: ev.clientY - (e?.pos.y ?? r.top), dragging: false };
    clearTimeout(T.longPress);
    T.longPress = setTimeout(() => {
      if (T.press && !T.press.dragging) {
        T.suppress = true;
        T.press = null;
        openMenu(true);
      }
    }, 500);
  };
  const onPointerMove = (ev) => {
    const T = touch.current;
    const L = live.current;
    if (T.press && ev.pointerId === T.press.id) {
      api.current.dragMove?.(ev);
      if (!T.press.dragging && Math.hypot(ev.clientX - T.press.x, ev.clientY - T.press.y) > 6) {
        clearTimeout(T.longPress);
        T.suppress = true;
        if (L.playing) return; // pokes only while music plays
        T.press.dragging = true;
        try {
          ev.currentTarget.setPointerCapture(ev.pointerId);
        } catch {
          /* capture is a nicety */
        }
        api.current.grab?.(ev, T.press.offX, T.press.offY);
      }
      return;
    }
    // Petting: strokes across the head with no button pressed.
    if (ev.buttons || (L.playing && L.mode !== "listen")) return;
    const r = ev.currentTarget.getBoundingClientRect();
    if (ev.clientY - r.top > r.height * 0.55) return;
    const now = performance.now();
    T.pet = petTrack(T.pet && now - T.pet.last < 1200 ? T.pet : null, ev.clientX, now);
    if (T.pet.petting) startPetting(now);
    if (T.petting) T.petting.last = now;
  };
  const startPetting = (now) => {
    const T = touch.current;
    const L = live.current;
    if (T.petting) return;
    api.current.activity?.();
    const [f, p] = PETTING[L.character] || PETTING.cat;
    T.petting = { since: now, last: now, smitten: false, hearts: 0 };
    api.current.face?.(f, 60000);
    if (p) api.current.pose?.(p, 60000);
    const root0 = root.current;
    root0?.classList.add("petting");
    if (L.character === "beethoven") setTimeout(() => T.petting && api.current.face?.("happy", 60000), 1500);
    if (L.character === "liszt") setTimeout(() => T.petting && api.current.face?.("smitten", 60000), 3000);
    speak(lineFor("pet"), P.USER, { face: null });
    const loop = setInterval(() => {
      const P0 = touch.current.petting;
      const t = performance.now();
      if (!P0) return clearInterval(loop);
      if (t - P0.last > 700) {
        clearInterval(loop);
        touch.current.petting = null;
        touch.current.pet = null;
        root0?.classList.remove("petting");
        api.current.pose?.("", 1);
        api.current.face?.("content", 1200);
        return;
      }
      burst("hearts", 1);
      if (!P0.smitten && t - P0.since >= 4000) {
        P0.smitten = true;
        api.current.face?.("smitten", 60000);
        addXp(1, { pet: true });
      }
    }, 600);
  };
  const onPointerUp = (ev) => {
    const T = touch.current;
    clearTimeout(T.longPress);
    if (T.press?.dragging) {
      try {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      api.current.release?.();
    }
    T.press = null;
  };
  const onKeyDown = (ev) => {
    const key = ev.key;
    if (key === "ContextMenu" || (key === "F10" && ev.shiftKey)) {
      ev.preventDefault();
      ev.stopPropagation();
      openMenu();
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      ev.preventDefault();
      ev.stopPropagation();
      api.current.nudge?.(key === "ArrowUp" ? -0.06 : 0.06);
      api.current.pickSide?.();
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      ev.preventDefault();
      ev.stopPropagation();
      const side = key === "ArrowLeft" ? "left" : "right";
      if (live.current.state.side !== side) patchState({ side });
      api.current.pickSide?.();
    } else if (key === "Escape") ev.currentTarget.blur();
  };

  if (!present) return null;
  const name = profile?.name || "Companion";
  const hearts = bondLevel(state.bond?.[character]?.xp ?? 0);
  return (
    <>
      <div
        ref={root}
        className={`buddy${reduced ? " still" : ""}${swap ? ` swap-${swap}` : ""}`}
        data-character={shown}
      >
        <div className="buddy-body">
          <button
            type="button"
            className="buddy-hit"
            aria-label={`${name}, your companion. Enter to say hi. Shift+F10 for options.`}
            aria-haspopup="menu"
            aria-expanded={!!menu}
            onClick={onClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(ev) => {
              ev.preventDefault();
              touch.current.suppress = false;
              clearTimeout(touch.current.longPress);
              openMenu(ev.button === 2);
            }}
            onKeyDown={onKeyDown}
          >
            <CompanionPortrait character={shown} mood="idle" variant="presence" />
            <BuddyFace character={shown} />
          </button>
          {treat && (
            <span key={treat.id} className={`buddy-treat ${treat.kind}`} aria-hidden="true">
              <TreatIcon character={shown} size={16} />
            </span>
          )}
          <span className="buddy-petals" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="buddy-shadow" aria-hidden="true" />
          <span className="buddy-zzz" aria-hidden="true">
            <i>z</i>
            <i>z</i>
            <i>Z</i>
          </span>
        </div>
        {bubble && (
          <div
            className="buddy-bubble"
            role="status"
            aria-live="polite"
            key={bubble.id}
            data-name={name}
            data-side={bubble.side}
            style={{ left: `${bubble.left.toFixed(1)}px`, top: `${bubble.top.toFixed(1)}px`, width: `${bubble.width}px`, "--bubble-s": bubble.scale }}
          >
            {bubble.text}
            {bubble.hint && <small className="buddy-hint">{HINT}</small>}
          </div>
        )}
        {bursts.map((b) => (
          <Burst key={b.id} {...b} />
        ))}
      </div>
      {menu && (
        <BuddyMenu
          name={name}
          character={character}
          hearts={hearts}
          quiet={!!state.quiet}
          side={state.side}
          tucked={!!api.current.engine?.tucked}
          treats={state.treats?.jar ?? 0}
          canDance={!props.playing}
          // Practice has no side edges (it sits in the header or the cue).
          canMove={props.view !== "practice"}
          anchor={menu.anchor}
          onChoose={choose}
          onClose={closeMenu}
        />
      )}
    </>
  );
}

/** Titles in a line stay short so the line stays within 70 characters. */
function shortTitle(title) {
  const t = String(title || "").trim();
  return t.length > 24 ? `${t.slice(0, 22).trimEnd()}…` : t;
}

function speechQueue(e, text) {
  if (text) e.speech = { ...e.speech, queue: { text, at: Date.now() } };
}

export default memo(CompanionBuddy);
