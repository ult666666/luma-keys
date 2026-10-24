// The keyboard stage's realistic 3-D hands (KeyboardGuide): one WebGL canvas
// over the visible part of the key bed — the hands, their shadows, the keys
// they hold and the finger numbers all in one picture (hand3d.mjs) — fed
// every animation frame from the motion engine (hand-pose.mjs handMotions)
// and redrawn only when what it shows changes.
//
// three.js, the renderer and the hand models load lazily, the first time
// there are hands to show, so the stage appears at once: the models are
// prepared in a worker and the renderer is built, sized, warmed and put on
// screen over several idle tasks, so no frame stalls — the first frame of the
// 3-D hands only poses and draws. Until they are ready — and whenever WebGL is
// missing or fails, or its context is lost — `update` returns false and the
// stage paints its 2-D hands (hand-draw.mjs) instead; a restored context
// brings the 3-D hands back, on the same canvas, also when it was lost while
// they were still being built.
//
// One renderer and its canvas serve the page: a stage that remounts (a trip
// to the Library and back) takes them up again, and they are let go only
// once no stage has wanted them for a while (RELEASE_MS) — so the page never
// holds more than one WebGL context for its hands, however often the stage
// comes and goes.
//
//   const layer = createHandsLayer(box);   // box: an empty element in the key bed
//   const drawn = layer.update(handMotions(...), {
//     keyWidth, keysHeight,                // px, as the engine has them
//     bedHeight,                           // px of the bed that shows (the stage may clip it)
//     left, width,                         // the visible part of the strip (px)
//   }, { reducedMotion });
//   layer.fingers("right");                // projected fingertips (box px)
//   layer.dispose();
//
// The layer element (`box`) is placed over the visible part of the strip and
// sized to it; its parent (the key bed) gets `data-hands3d="on"` while they
// are drawn (the stage's own rail is kept: the hands dissolve within it).

const HANDS = ["left", "right"];
// The device pixel ratio the picture is drawn at, at most. (One ratio, paused
// or playing: changing it reallocates the drawing buffer — a heavy frame just
// as the music starts — for about a millisecond of GPU time saved.)
export const DPR_MAX = 2;
// A hand with nothing to play for a while steps back (as the 2-D layer's
// `.rest`): darker — never see-through, so no key numeral shows through its
// skin — easing over about the 2-D layer's 320 ms transition.
export const REST_OPACITY = 1;
const FADE_TAU_MS = 105;
// A hand that only waits where the other one plays slides aside
// (hand3d-overlap.mjs); while the two still meet it is drawn beneath the one
// that plays, and stepped back this far (darker, as a resting hand — never
// see-through), so the two never read as one hand with ten fingers.
export const UNDER_DIM = 0.55;
// The 3-D hands ease over about two frames (s): a solver's small
// discontinuities spread out, fingers on their keys still exact (hand3d.mjs
// setPoses). Not with reduced motion.
export const SMOOTH_TAU = 0.04;
// How long the renderer outlives the last stage that used it (ms).
export const RELEASE_MS = 45000;
// A stage that has stood still this long with its hands hidden gets the 3-D
// hands ready anyway — off screen, in the page's idle moments only — so that
// showing them later costs no frame anything (ms).
export const PREWARM_AFTER_MS = 1500;

const r3 = (v) => (v == null || !Number.isFinite(+v) ? "-" : Math.round(+v * 1000));

// What a hand's 3-D pose and its cues are made from, in buckets far below a
// pixel (thousandths of a key, of a second, of a unit): equal signatures draw
// the same picture. Clocks a pose stops reading after a moment (how long a
// finger has held its key, since it let go, its aim) are cut off there, so a
// still hand draws nothing new.
export function motionSignature(m) {
  if (!m) return "-";
  const p = m.palm || {};
  let s = `${r3(m.centre ?? p.x)},${r3(p.x)},${r3(p.lift || 0)},${r3(p.roll || 0)},${r3(p.relax || 0)},${r3(p.forward || 0)},${r3(p.fan ?? 1)},${r3(p.topRaise || 0)},${r3(p.bob || 0)},${p.rest ? 1 : 0}${p.zTop ? 1 : 0}`;
  for (const f of m.fingers || []) {
    s += `|${f.state}${f.exact ? "!" : ""}${r3(f.x)},${r3(f.lift || 0)},${r3(f.curl || 0)},${r3(f.extend || 0)},${r3(f.press || 0)},${r3(f.number || 0)},${r3(f.under || 0)},${r3(f.tuck || 0)},${r3(f.arc || 0)},${r3(f.black || 0)},${r3(f.descent || 0)},${r3(Math.min(f.aimTau || 0, 1))},${f.since == null ? "-" : r3(Math.min(f.since, 0.5))},${f.heldFor == null ? "-" : r3(Math.min(f.heldFor, 0.5))},${r3(f.contact)}`;
    if (f.target) s += `>${r3(f.target.x)},${r3(f.target.alpha)},${f.target.black ? 1 : 0},${r3(f.target.contact)}`;
  }
  return s;
}

// The geometry the renderer takes for the visible part of the strip.
export function stageGeometry({ keyWidth, keysHeight, bedHeight, left = 0, width }, dpr = 1) {
  return {
    keyWidth,
    keysHeight,
    bedHeight,
    stripLeftPx: left,
    viewportWidthPx: width,
    topPx: 0,
    dpr: Math.min(DPR_MAX, Math.max(1, dpr || 1)),
  };
}

// How much of the key bed shows (px down from its top): to the lower edge of
// the nearest box that clips it — a compact stage's viewport cuts the rail
// off, and its coach strip begins there — never past the bed itself, never
// less than its keys. The 3-D picture is sized to this (`bedHeight`), so the
// hands dissolve wholly above that edge, wherever the stage clips them.
// `clips`: the clipping boxes' lower edges (px, the same frame as `top`).
export function visibleBed({ top, height, keys = 0, clips = [] }) {
  const bottom = Math.min(top + height, ...clips.filter((c) => Number.isFinite(c)));
  return Math.max(Math.min(keys, height), Math.min(height, Math.floor(bottom - top)));
}
// … measured on the page: every box from the bed up to the stage that clips
// what overflows it.
export function measureVisibleBed(bed, stage = null) {
  if (!bed?.getBoundingClientRect) return 0;
  const top = bed.getBoundingClientRect().top;
  const clips = [];
  for (let el = bed.parentElement; el && el !== document.body; el = el.parentElement) {
    if (getComputedStyle(el).overflowY !== "visible") {
      const r = el.getBoundingClientRect();
      clips.push(r.top + el.clientTop + el.clientHeight);
    }
    if (el === stage) break;
  }
  return visibleBed({ top, height: bed.clientHeight, keys: bed.firstElementChild?.clientHeight || 0, clips });
}

// The theme's colour for a hand ("233, 180, 95" → [233, 180, 95]).
const rgbOf = (text, fallback) => {
  const parts = String(text || "")
    .split(",")
    .map((x) => +x.trim());
  return parts.length === 3 && parts.every((x) => Number.isFinite(x)) ? parts : fallback;
};

// (A moment the page is idle, or a task boundary.)
const idleTask = (timeout = 400) =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout });
    else setTimeout(resolve, 16);
  });
// (A moment the page is truly idle — this much of the frame to spare, ms,
// and `calm()`: no music moving — however long that takes; or as soon as
// `hurry()` says so.)
const quietTask = (spare = 10, hurry = () => false, calm = () => true) =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback !== "function") return void setTimeout(resolve, 16);
    const wait = () =>
      requestIdleCallback(
        (deadline) => (hurry() || (calm() && deadline.timeRemaining() >= spare) ? resolve() : wait()),
        { timeout: 1000 },
      );
    wait();
  });

// A failure that trying again cannot mend (no WebGL 2, the models or the
// renderer's code not loading): the page keeps its 2-D hands from then on.
// Anything else that goes wrong while the context is lost is waited out.
const permanent = (error) => Object.assign(error instanceof Error ? error : new Error(String(error)), { permanent: true });
// (A lost context noticed in the middle of a step.)
const LOST = Symbol("lost");

// What the engine is built with (the checks put in their own).
const DEPS = {
  importRenderer: () => import("./hand3d.mjs"),
  createCanvas: () => document.createElement("canvas"),
  idle: idleTask,
  quiet: quietTask,
};

// ---- the page's one renderer -----------------------------------------------------------------
// { state, canvas, hands (hand3d.mjs), mod, users, failures, … } — shared by
// every stage the page mounts.
let engine = null;
let warned = false;
let failed = null;
function sharedEngine(base, deps = DEPS) {
  if (engine && !engine.gone) return engine;
  // (Once the realistic hands have failed for good, the page keeps its 2-D hands.)
  if (failed) return failed;
  // (While no stage wants them yet — getting ready ahead — each step waits
  // for a truly idle moment; once one does, for the next idle one.)
  const wanting = () => [...e.users].some((u) => u.wants);
  const calm = () => [...e.users].every((u) => u.calm !== false);
  const idle = (timeout) => (e.prewarm && !wanting() ? (deps.quiet || quietTask)(10, () => wanting() || e.gone, calm) : deps.idle(timeout));
  const e = {
    base,
    state: "idle",
    canvas: null,
    ctx: null,
    hands: null,
    mod: null,
    renderer: null,
    failures: [],
    users: new Set(),
    owner: null,
    releaseTimer: 0,
    version: 0,
    gone: false,
    // (Whether the renderer has been ready: a context lost after that is
    // restored in place; one lost before is waited for by the build.)
    built: false,
    listeners: new Set(),
    waiters: { restored: [], lost: [] },
    losses: 0,
  };
  const set = (next, error) => {
    e.state = next;
    if (error) e.failures.push(String(error?.message || error));
    for (const fn of e.listeners) fn(next, error);
  };
  e.set = set;
  const wake = (list) => {
    const fns = list.splice(0);
    for (const fn of fns) fn();
  };
  // (Resolves when the context comes back — or the engine is let go.)
  const untilRestored = () => new Promise((resolve) => e.waiters.restored.push(resolve));
  const lostSoon = () => new Promise((resolve) => e.waiters.lost.push(() => resolve(LOST)));
  const isLost = () => !!e.ctx?.isContextLost?.();
  e.fail = (error) => {
    if (e.gone) return;
    // (Only for good when it is: anything else while the context is lost is
    // waited out — the build starts again once it is restored.)
    if (!error?.permanent && isLost()) {
      set("lost", error);
      return;
    }
    failed = e;
    set("failed", error);
    if (!warned && typeof console !== "undefined") {
      warned = true;
      console.warn("Luma Keys: realistic hands unavailable, drawing the simple hands.", error);
    }
    e.release();
  };
  // (Everything let go: the renderer's GPU resources and its context.)
  e.release = () => {
    clearTimeout(e.releaseTimer);
    try {
      e.hands?.dispose({ release: true });
    } catch {
      // (Its context may already be gone.)
    }
    e.hands = null;
    if (e.canvas) {
      e.canvas.removeEventListener("webglcontextlost", e.onLost);
      e.canvas.removeEventListener("webglcontextrestored", e.onRestored);
      e.canvas.remove();
    }
    e.canvas = null;
    // (Nothing of the context kept: a stage still holding this engine — or a
    // check's handle on it — holds no GPU memory.)
    e.ctx = null;
    if (e.state !== "failed") e.state = "released";
    e.gone = true;
    if (engine === e) engine = null;
    wake(e.waiters.restored);
    wake(e.waiters.lost);
  };
  e.onLost = (event) => {
    event.preventDefault?.();
    if (e.gone) return;
    e.losses++;
    set("lost");
    wake(e.waiters.lost);
  };
  // (Each stage's last preparations for a renderer about to be ready — the
  // theme's colours read — in an idle moment, not in the first frame.)
  const prepareUsers = () => {
    for (const u of e.users) u.prepare?.(e);
  };
  // (three.js restores its own state on the same context; the programs are
  // compiled again and the buffers and textures uploaded before the hands
  // show. A build waiting for the context goes on from where it stopped.)
  e.onRestored = () => {
    if (e.gone) return;
    if (e.waiters.restored.length) {
      wake(e.waiters.restored);
      return;
    }
    if (!e.built || e.state !== "lost") return;
    set("restoring");
    (async () => {
      await idle();
      if (e.gone || !e.hands) return;
      if (!(await warmed())) return;
      e.version++;
      prepareUsers();
      if (!isLost()) set("ready");
    })().catch((error) => e.fail(error));
  };
  // Warm the renderer (its programs compiled, its buffers and textures on
  // the GPU), once the context holds through it: lost on the way, it waits
  // for the context and warms again. False when let go meanwhile.
  const warmed = async () => {
    for (;;) {
      if (e.gone) return false;
      if (isLost()) {
        if (e.state !== "lost") set("lost");
        await untilRestored();
        continue;
      }
      const result = await Promise.race([e.hands.warm({ step: () => idle() }).then(() => "warm"), lostSoon()]);
      if (e.gone) return false;
      if (result === "warm" && !isLost()) return true;
    }
  };
  // Load and build, a step per idle task: the models prepared in a worker
  // and the skin maps decoded off the main thread, then the context, the
  // renderer, its drawing buffer at the size the stage will show it, its
  // programs compiled and one picture drawn off screen, then the empty canvas
  // put on the stage — and only then the hands shown.
  // (`prewarm`: no stage wants the hands yet — they are made ready ahead.)
  e.load = ({ prewarm = false } = {}) => {
    if (e.state !== "idle") return;
    e.prewarm = prewarm;
    set("loading");
    // (Each step marked on the page's timeline, for checks.)
    const mark = (name) => typeof performance !== "undefined" && performance.mark?.(`hands3d:${name}`);
    const wanted = () => e.prewarm || wanting();
    // (The stage whose picture to size the renderer for: one that wants the
    // hands, else — ahead — the one getting them ready.)
    const asker = () => [...e.users].find((u) => u.wants && u.geometry && u.box) || (e.prewarm ? [...e.users].find((u) => u.geometry && u.box) : null) || null;
    (async () => {
      await idle(500);
      if (e.gone) return;
      // (Hands no longer wanted by the time the page is idle — the stage's
      // first frames came before the reader's settings, say: nothing loads
      // until they are.)
      if (!wanted()) {
        set("idle");
        return;
      }
      mark("load");
      let mod;
      try {
        mod = await deps.importRenderer();
      } catch (error) {
        throw permanent(error);
      }
      e.mod = mod;
      mark("module");
      let prepared;
      try {
        prepared = await mod.prepareHands(e.base);
      } catch (error) {
        throw permanent(error);
      }
      if (e.gone) return;
      mark("prepared");
      await idle();
      if (e.gone) return;
      const canvas = deps.createCanvas();
      canvas.className = "hands3d-canvas hands3d-gl";
      canvas.setAttribute("aria-hidden", "true");
      // (WebGL 2 asked for first, quietly: without it the stage keeps its 2-D
      // hands, with one warning.)
      const ctx = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false, depth: true, stencil: true });
      if (!ctx) throw permanent(new Error("WebGL 2 is not available"));
      canvas.addEventListener("webglcontextlost", e.onLost);
      canvas.addEventListener("webglcontextrestored", e.onRestored);
      e.canvas = canvas;
      e.ctx = ctx;
      mark("context");
      // The renderer, made while the context holds: lost before or while it
      // is made (a GPU reset, a display change, waking), the build waits for
      // the context to come back and makes it again.
      let hands = null;
      for (;;) {
        await idle();
        if (e.gone) return;
        if (isLost()) {
          if (e.state !== "lost") set("lost");
          await untilRestored();
          if (e.gone) return;
          set("loading");
          continue;
        }
        try {
          hands = await mod.buildHands3D({ canvas, prepared, look: { antialias: true } }, () => idle());
        } catch (error) {
          if (isLost()) continue;
          throw error;
        }
        if (e.gone) {
          hands.dispose({ release: true });
          return;
        }
        break;
      }
      e.hands = hands;
      mark("created");
      try {
        const gl = hands.renderer.getContext();
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        e.renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "webgl";
      } catch {
        e.renderer = "webgl";
      }
      // (Its drawing buffer at the size and pixel ratio the stage that asked
      // will show it — a new drawing buffer is costly — so the warm picture
      // is drawn into the very buffer the first frame uses.)
      await idle();
      if (e.gone) return;
      const a = asker();
      if (a) hands.setKeyboardGeometry(a.geometry);
      if (!(await warmed())) return;
      mark("warm");
      // (The canvas on the stage, empty, one idle task before the hands
      // show: the compositor takes it up then, not in the first frame.)
      await idle();
      if (e.gone) return;
      set("presenting");
      const b = asker();
      if (b) {
        if (!sameGeometry(b.geometry, hands.view)) hands.setKeyboardGeometry(b.geometry);
        hands.clear();
        // (Made ahead, the canvas waits in its stage's hidden layer.)
        if (e.attach(b, b.box) && b.wants) b.present?.(hands.view);
      }
      await idle();
      if (e.gone) return;
      if (isLost()) {
        set("lost");
        await untilRestored();
        if (e.gone) return;
        if (!(await warmed())) return;
      }
      mark("present");
      e.built = true;
      e.version++;
      prepareUsers();
      e.prewarm = false;
      set("ready");
    })().catch((error) => e.fail(error));
  };
  // A stage takes the canvas up (into its layer box), or lets it go. (One
  // stage at a time: another that wants it while the first still draws
  // keeps its 2-D hands.)
  e.attach = (user, box, now = typeof performance !== "undefined" ? performance.now() : 0) => {
    e.users.add(user);
    clearTimeout(e.releaseTimer);
    if (e.owner && e.owner !== user && e.users.has(e.owner) && now - e.ownerAt < 500) return false;
    if (e.canvas && e.canvas.parentElement !== box) box.append(e.canvas);
    e.owner = user;
    e.ownerAt = now;
    return true;
  };
  e.detach = (user) => {
    e.users.delete(user);
    if (e.owner === user) {
      e.owner = null;
      e.canvas?.remove();
    }
    if (!e.users.size) {
      clearTimeout(e.releaseTimer);
      e.releaseTimer = setTimeout(() => {
        if (!e.users.size) e.release();
      }, RELEASE_MS);
    }
  };
  engine = e;
  return e;
}
// (Whether a stage's geometry is the one the renderer is drawing at.)
function sameGeometry(g, view) {
  if (!g || !view) return false;
  return Math.abs(g.keyWidth - view.u) < 1e-3 && g.keysHeight === view.h && g.bedHeight === view.bed && Math.abs((g.stripLeftPx || 0) - view.left) < 0.01 && g.viewportWidthPx === view.width && (g.dpr || 1) === view.dpr;
}

export function createHandsLayer(box, { base = "/models/hands/", onState, deps = DEPS, prewarm = true } = {}) {
  const user = { box };
  let disposed = false;
  let e = sharedEngine(base, deps);
  let geomKey = "";
  let sig = "";
  let shown = false;
  let lastMotions = null;
  let inkKey = "";
  let inkVersion = -1;
  let lastT = 0;
  let drawnVersion = -1;
  const alpha = { left: 1, right: 1 };
  // (How far each hand has stepped back beneath the other: 0…1.)
  const under = { left: 0, right: 0 };
  const seen = { left: false, right: false };
  const stats = { renders: 0, updates: 0, ms: [], rail: 0, inkReads: 0 };
  const listener = (next, error) => onState?.(next, error);
  e.listeners.add(listener);
  e.users.add(user);
  const bed = () => box?.parentElement || null;
  // (The theme's colours read as the renderer gets ready: not in a frame.)
  user.prepare = (eng) => {
    if (!disposed && eng?.hands) readInkNow(eng);
  };
  // (Since when the stage has stood still with its hands hidden.)
  let calmSince = null;
  // (The empty canvas put on the stage before the hands first show.)
  let presented = false;
  user.present = (view) => {
    if (disposed || !view) return;
    box.style.width = `${view.width}px`;
    box.style.height = `${view.height}px`;
    box.style.transform = `translate3d(${view.left}px, 0, 0)`;
    box.hidden = false;
    presented = true;
  };
  const hide = () => {
    if (!shown && !presented) return;
    shown = false;
    presented = false;
    box.hidden = true;
    const b = bed();
    if (b) delete b.dataset.hands3d;
    geomKey = "";
  };
  // (The page's renderer, as it now is: a new one once an old one is gone.)
  const current = () => {
    if (e.gone && e.state !== "failed" && !disposed) {
      e.listeners.delete(listener);
      e = sharedEngine(base, deps);
      e.listeners.add(listener);
      e.users.add(user);
      geomKey = sig = "";
    }
    return e;
  };
  // ---- the theme's colours ----
  // Read when the hands first show and again only when the theme changes —
  // an attribute of the page or the app that themes it — never on a clock:
  // reading computed styles makes the browser restyle whatever is dirty.
  let probe = null;
  const themeColour = (prop) => {
    if (!probe) {
      probe = document.createElement("i");
      probe.className = "hands3d-probe";
      probe.hidden = true;
      box.append(probe);
    }
    probe.style.color = `var(${prop})`;
    const c = getComputedStyle(probe).color;
    const m = c.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    // ("color(srgb r g b)" in 0…1, or "rgb(r, g, b)" in 0…255.)
    const v = m.slice(0, 3).map(Number);
    return /color\(/.test(c) ? v.map((x) => x * 255) : v;
  };
  function readInkNow(eng) {
    if (!eng?.hands || typeof getComputedStyle !== "function") return;
    stats.inkReads++;
    const css = getComputedStyle(box);
    const next = {
      right: { rgb: rgbOf(css.getPropertyValue("--rh-rgb"), [233, 180, 95]), ink: css.getPropertyValue("--rh-ink").trim() || "#45280a" },
      left: { rgb: rgbOf(css.getPropertyValue("--lh-rgb"), [138, 174, 220]), ink: css.getPropertyValue("--lh-ink").trim() || "#0f2744" },
    };
    const room = themeColour("--keyboard-depth");
    const key = JSON.stringify([next, room]);
    inkVersion = eng.version;
    eng.inkRead = true;
    if (key === inkKey) return;
    inkKey = key;
    eng.hands.setInk(next);
    eng.hands.setRoom({ shadow: room });
    sig = "";
  }
  let inkPending = false;
  const themeChanged = () => {
    if (inkPending || disposed) return;
    inkPending = true;
    idleTask(1000).then(() => {
      inkPending = false;
      const eng = current();
      if (!disposed && eng.hands && eng.state === "ready") readInkNow(eng);
    });
  };
  let themeWatch = null;
  if (typeof MutationObserver === "function" && typeof document !== "undefined" && box?.closest) {
    themeWatch = new MutationObserver(themeChanged);
    const app = box.closest(".app");
    const watch = (el, attributeFilter) => el && themeWatch.observe(el, { attributes: true, attributeFilter });
    watch(document.documentElement, ["class", "style", "data-theme"]);
    watch(document.body, ["class", "style", "data-theme"]);
    watch(app, ["class", "style", "data-theme", "data-colours", "data-companion", "data-companion-style"]);
  }
  // The layer over the visible part of the strip.
  const layout = (eng, g, dpr) => {
    const geom = stageGeometry(g, dpr);
    const key = `${geom.keyWidth.toFixed(3)}|${geom.keysHeight}|${geom.bedHeight}|${geom.stripLeftPx.toFixed(2)}|${geom.viewportWidthPx}|${geom.dpr}|${eng.version}`;
    if (key === geomKey) return;
    geomKey = key;
    const view = sameGeometry(geom, eng.hands.view) ? eng.hands.view : eng.hands.setKeyboardGeometry(geom);
    sig = "";
    box.style.width = `${view.width}px`;
    box.style.height = `${view.height}px`;
    box.style.transform = `translate3d(${geom.stripLeftPx}px, 0, 0)`;
    // (The rail the hands would need to show whole, for checks: the stage's
    // own rail is kept — the picture dissolves within it — so the stage's
    // layout never changes as the 3-D hands come and go.)
    stats.rail = eng.hands.recommendedRail();
    const b = bed();
    if (b && b.dataset.hands3d !== "on") b.dataset.hands3d = "on";
  };
  const pixelRatio = () => Math.min(DPR_MAX, Math.max(1, typeof devicePixelRatio === "number" ? devicePixelRatio : 1));

  const api = {
    get state() {
      return current().state;
    },
    get ready() {
      return current().state === "ready";
    },
    stats,
    // Draw this frame's hands. True when the 3-D hands are what the stage
    // shows (drawn now, or unchanged since); false while they load or after
    // they failed — the stage then paints its 2-D hands.
    update(motions, g, { reducedMotion = false, moving = false, preparing = false, now = typeof performance !== "undefined" ? performance.now() : 0 } = {}) {
      if (disposed) return false;
      const eng = current();
      stats.updates++;
      const any = !!(motions?.left || motions?.right);
      lastMotions = motions;
      user.wants = (any || preparing) && g?.keyWidth > 0;
      user.calm = !moving;
      // (The stage's picture size, kept as it is — the renderer is sized to
      // it before it first draws, also when it gets ready ahead.)
      if (g?.keyWidth > 0 && g?.keysHeight > 0 && g?.width > 0 && g?.bedHeight > 0) {
        const gk = `${g.keyWidth}|${g.keysHeight}|${g.bedHeight}|${g.left}|${g.width}|${pixelRatio()}`;
        if (gk !== user.geometryKey) {
          user.geometryKey = gk;
          user.geometry = stageGeometry(g, pixelRatio());
        }
      }
      if (!any || !(g?.keyWidth > 0) || !(g?.keysHeight > 0) || !(g?.width > 0) || !(g?.bedHeight > 0)) {
        hide();
        for (const hand of HANDS) seen[hand] = false;
        // The exact score planner runs in its worker while the existing GPU
        // preparation runs alongside it. No previous score pose is shown.
        if (preparing && user.wants && g?.keysHeight > 0 && g?.width > 0 && g?.bedHeight > 0 && eng.state === "idle")
          eng.load();
        // A stage standing still with its hands hidden gets them ready
        // ahead, in idle moments, at its own size — so turning them on later
        // shows them at once, with no heavy frame.
        if (!any && prewarm && eng.state === "idle" && g?.keyWidth > 0 && g?.keysHeight > 0 && g?.width > 0 && g?.bedHeight > 0) {
          if (moving) calmSince = null;
          else if (calmSince == null) calmSince = now;
          else if (now - calmSince >= PREWARM_AFTER_MS) eng.load({ prewarm: true });
        }
        return eng.state === "ready";
      }
      calmSince = null;
      if (eng.state === "idle") eng.load();
      if (eng.state !== "ready" || !eng.hands) {
        // (The empty canvas already on the stage, a moment before the hands show.)
        if (!(eng.state === "presenting" && presented)) hide();
        return false;
      }
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      try {
        if (!eng.attach(user, box, now)) {
          hide();
          return false;
        }
        if (drawnVersion !== eng.version) {
          drawnVersion = eng.version;
          geomKey = sig = "";
        }
        layout(eng, g, pixelRatio());
        // (The theme's colours, once for this renderer — read as it got
        // ready; a stage that came after reads them in an idle moment, the
        // renderer's own meanwhile — then only as the theme changes.)
        if (inkVersion !== eng.version) {
          if (eng.inkRead) {
            inkVersion = eng.version;
            themeChanged();
          } else readInkNow(eng);
        }
        // A resting hand steps back, easing (at once with reduced motion,
        // and as a hand first appears).
        const dt = Math.min(100, Math.max(0, now - (lastT || now)));
        lastT = now;
        const ease = (from, to) => {
          const next = from + (to - from) * (1 - Math.exp(-dt / FADE_TAU_MS));
          return Math.abs(to - next) < 0.004 ? to : next;
        };
        for (const hand of HANDS) {
          const m = motions[hand]?.motion;
          if (!m) {
            seen[hand] = false;
            under[hand] = 0;
            continue;
          }
          const want = m.palm?.rest ? 0 : 1;
          alpha[hand] = !seen[hand] || reducedMotion ? want : ease(alpha[hand], want);
        }
        const keys = { left: motionSignature(motions.left?.motion), right: motionSignature(motions.right?.motion) };
        const state = (u) => `${keys.left}#${keys.right}#${alpha.left.toFixed(3)},${alpha.right.toFixed(3)},${u.left.toFixed(3)},${u.right.toFixed(3)}#${inkKey}#${eng.hands.dirty ? 1 : 0}`;
        if (state(under) !== sig) {
          const { settling, overlap } = eng.hands.setPoses(motions, keys, { tau: reducedMotion ? 0 : SMOOTH_TAU, now }) || {};
          // A hand that only waits where the other one plays steps back
          // beneath it (hand3d.mjs decides which; easing here).
          let fading = false;
          for (const hand of HANDS) {
            const want = overlap?.under === hand ? 1 : 0;
            under[hand] = !seen[hand] || reducedMotion ? want : ease(under[hand], want);
            if (under[hand] !== want) fading = true;
          }
          for (const hand of HANDS) if (motions[hand]?.motion) seen[hand] = true;
          // (Awake 1, resting 0: dimmed as far; beneath the other, dimmed
          // too. Never see-through: no key shows through a hand.)
          const op = {},
            dim = {};
          for (const hand of HANDS) {
            op[hand] = REST_OPACITY + (1 - REST_OPACITY) * alpha[hand];
            dim[hand] = Math.max(1 - alpha[hand], UNDER_DIM * under[hand]);
          }
          eng.hands.setOpacity(op, dim);
          eng.hands.render();
          stats.renders++;
          stats.ms.push((typeof performance !== "undefined" ? performance.now() : 0) - t0);
          if (stats.ms.length > 600) stats.ms.splice(0, stats.ms.length - 600);
          // (Still easing into a pose, or stepping back: drawn again next frame.)
          sig = settling || fading ? "" : state(under);
        }
      } catch (error) {
        hide();
        eng.fail(error);
        return false;
      }
      if (!shown) {
        shown = true;
        box.hidden = false;
      }
      return true;
    },
    // Each digit of a hand on screen (box px; see hand3d.mjs fingers()), or
    // null when the 3-D hands do not show it.
    fingers(hand) {
      const eng = current();
      return eng.state === "ready" && shown && eng.hands ? eng.hands.fingers(hand) : null;
    },
    diagnostics() {
      const eng = current();
      return eng.state === "ready" && eng.hands ? eng.hands.diagnostics() : null;
    },
    get rings() {
      const eng = current();
      return eng.state === "ready" && eng.hands ? eng.hands.lastRings || [] : [];
    },
    get view() {
      return current().hands?.view || null;
    },
    // For checks: the state, the GPU, the drawing cost (ms per redraw: the
    // poses, the cues and the WebGL submit) and the GPU's resources.
    report({ reset = false, bench = 0 } = {}) {
      const eng = current();
      const ms = stats.ms.slice().sort((a, b) => a - b);
      const at = (q) => (ms.length ? +ms[Math.min(ms.length - 1, Math.floor(q * ms.length))].toFixed(3) : null);
      const hands = eng.state === "ready" ? eng.hands : null;
      const info = hands ? hands.renderer.info : null;
      const view = hands?.view;
      const out = {
        state: eng.state,
        renderer: eng.renderer,
        updates: stats.updates,
        renders: stats.renders,
        shadowBuilds: hands?.shadowBuilds ?? 0,
        inkReads: stats.inkReads,
        losses: eng.losses ?? 0,
        ms: { n: ms.length, mean: ms.length ? +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(3) : null, p50: at(0.5), p95: at(0.95), max: at(1) },
        rail: stats.rail,
        view: view ? { u: view.u, h: view.h, bed: view.bed, deg: +view.deg.toFixed(2), squash: +view.squash.toFixed(3), left: view.left, width: view.width, height: view.height, dpr: view.dpr, fade: hands.fadeLength } : null,
        opacity: { ...alpha },
        under: { ...under },
        top: hands?.top ?? null,
        memory: info ? { ...info.memory, programs: info.programs?.length ?? null } : null,
        failures: eng.failures.slice(),
        rings: hands ? (hands.lastRings || []).map((r) => ({ ...r })) : [],
      };
      if (bench > 0) out.bench = api.bench(bench);
      if (reset) api.resetStats();
      return out;
    },
    // (For checks: the full cost of drawing the current hands, `n` times —
    // posing, the cues and the WebGL picture — each waited for on the GPU.)
    bench(n = 60) {
      const eng = current();
      if (eng.state !== "ready" || !eng.hands || !lastMotions || !shown) return null;
      const hands = eng.hands;
      const ctx = hands.renderer.getContext();
      const px = new Uint8Array(4);
      const parts = { pose: [], gl: [], total: [] };
      const sync = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      sync();
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        hands.setPoses(lastMotions);
        const t1 = performance.now();
        hands.render();
        sync();
        const t2 = performance.now();
        parts.pose.push(t1 - t0);
        parts.gl.push(t2 - t1);
        parts.total.push(t2 - t0);
      }
      const sum = (a) => {
        const t = a.slice().sort((x, y) => x - y);
        return { mean: +(t.reduce((x, y) => x + y, 0) / t.length).toFixed(3), min: +t[0].toFixed(3), p50: +t[Math.floor(t.length / 2)].toFixed(3), p95: +t[Math.min(t.length - 1, Math.floor(0.95 * t.length))].toFixed(3), max: +t.at(-1).toFixed(3) };
      };
      sig = "";
      return { n, ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, sum(v)])) };
    },
    // (For checks: forget the drawing costs measured so far.)
    resetStats() {
      stats.ms.length = 0;
      stats.renders = 0;
      stats.updates = 0;
      stats.inkReads = 0;
    },
    // (For checks: lose the WebGL context; the extension restores it.)
    loseContext() {
      const eng = current();
      const gl = eng.ctx || eng.hands?.renderer.getContext();
      const ext = gl?.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      return ext || null;
    },
    dispose() {
      if (disposed) return;
      hide();
      disposed = true;
      user.wants = false;
      themeWatch?.disconnect();
      themeWatch = null;
      probe?.remove();
      probe = null;
      e.listeners.delete(listener);
      e.detach(user);
    },
  };
  // (In development, the renderer itself, for profiling in the console.)
  if (import.meta.env?.DEV && typeof window !== "undefined")
    Object.defineProperty(window, "__lumaHands3d", {
      configurable: true,
      get: () => ({ renderer: current().hands, layer: api, engine: current() }),
    });
  return api;
}

// (For checks: the page's renderer, letting it go at once, and starting
// afresh — the module's memory of a failure forgotten.)
export const sharedRenderer = {
  get state() {
    return engine?.state ?? "none";
  },
  get failed() {
    return !!failed;
  },
  release() {
    engine?.release();
  },
  reset() {
    engine?.release();
    engine = null;
    failed = null;
    warned = false;
  },
};
