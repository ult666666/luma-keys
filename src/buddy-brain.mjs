// The companion's brain: pure helpers for where it may sit, when it may speak,
// what a click sequence means, how a toss flies and what it remembers. No DOM,
// no timers: CompanionBuddy.jsx feeds measurements and times in and applies the
// answers, so every rule here is unit-tested (tests/buddy-brain.test.mjs).

export const SIZE = 78;
export const SIDES = Object.freeze(["right", "left"]);
// The companion's saved memory lives beside the other reading settings
// (the desktop server validates it); re-exported here for the app.
export { STREAK_MILESTONES, defaultBuddyState, isDayKey, readBuddyState } from "./preferences.mjs";
import { STREAK_MILESTONES } from "./preferences.mjs";

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Today's local date as YYYY-MM-DD (the same key the journal uses). */
export function todayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// ------------------------------------------------------------- geometry ---

export const box = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
/** True when two rects overlap by more than `slack` px on both axes. */
export function rectsIntersect(a, b, slack = 0) {
  if (!a || !b) return false;
  return (
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > slack &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > slack
  );
}
/** True when `rect` lies inside the viewport, `margin` px from each edge. */
export function inside(rect, vw, vh, margin = 0) {
  return (
    rect.left >= margin &&
    rect.top >= margin &&
    rect.right <= vw - margin &&
    rect.bottom <= vh - margin
  );
}
const hitsAny = (rect, noGo, slack = 0) => noGo.some((r) => rectsIntersect(rect, r, slack));

/** The companion's on-screen rect at translate (x, y) and scale s, with its
 * transform origin at the bottom centre of the 78 px box. */
export function figureRect(x, y, s = 1) {
  const w = SIZE * s;
  return box(x + (SIZE - w) / 2, y + SIZE - w, w, w);
}
/** Translate that puts the box's bottom centre on (cx, bottom). */
export const seatAt = (cx, bottom) => ({ x: cx - SIZE / 2, y: bottom - SIZE });

// ---------------------------------------------------------------- rails ---

/** Which seat or rail the companion should use right now. */
export function chooseRail({
  view = "practice",
  modal = null,
  playing = false,
  bow = false,
  cueSeat = false,
  gapOk = false,
  headerSeat = false,
  tucked = false,
} = {}) {
  if (modal === "results") return "results";
  if (modal) return "modal";
  if (view === "practice") {
    if (bow && gapOk) return "bow";
    if (playing) return cueSeat ? "cue" : gapOk ? "gap" : "corner";
    if (tucked) return cueSeat ? "cue" : "corner";
    return gapOk ? "gap" : cueSeat ? "cue" : "corner";
  }
  return headerSeat ? "header" : "edge";
}

export const RAIL_SCALE = Object.freeze({
  results: 1,
  modal: 1,
  bow: 1,
  gap: 0.82,
  edge: 1,
  corner: 1,
});
export const seatScale = (rail, seatHeight) =>
  rail === "cue"
    ? clamp(seatHeight / SIZE, 0.45, 0.6)
    : rail === "header"
      ? clamp(seatHeight / SIZE, 0.8, 1.6)
      : RAIL_SCALE[rail] ?? 1;

/** The free band in the practice header between the title text and the
 * view switch. `ok` is false when it is too narrow for the companion. */
export function gapBand({ infoRight, actionsLeft, headerTop, headerBottom }) {
  const left = infoRight + 24,
    right = actionsLeft - 24;
  const width = right - left;
  const height = headerBottom - headerTop;
  return {
    left,
    right,
    width,
    feet: headerBottom - 2,
    scale: clamp((height - 2) / SIZE, 0.5, RAIL_SCALE.gap),
    ok: width >= 112 && height >= 36,
  };
}
/** Where on the gap band the companion wants to stand (its centre x). It
 * follows the pointer while the pointer is near the header and otherwise
 * rests near the right end, by the view switch. */
export function gapTargetX(band, pointer, headerBottom, scale = RAIL_SCALE.gap, blocks = []) {
  const half = (SIZE * scale) / 2;
  const lo = band.left + half,
    hi = band.right - half;
  if (hi < lo) return blocks.length ? null : (band.left + band.right) / 2;
  const rest = clamp(band.right - 104, lo, hi);
  const want = !pointer || pointer.y >= headerBottom + 120 ? rest : clamp(pointer.x, lo, hi);
  if (!blocks.length) return want;
  // Something else stands in the band (a notice, top centre): keep to the
  // free stretches either side of it; null when none is wide enough.
  const free = gapFree(band, blocks, scale);
  if (!free.length) return null;
  let best = null;
  for (const [a, b] of free) {
    const x = clamp(want, a, b);
    if (best == null || Math.abs(x - want) < Math.abs(best - want)) best = x;
  }
  return best;
}
/** The stretches of the gap band where the companion's centre may stand
 * without touching any of `blocks` (8 px clear), as [lo, hi] pairs. */
export function gapFree(band, blocks = [], scale = RAIL_SCALE.gap) {
  const w = SIZE * scale,
    half = w / 2;
  const top = band.feet - w,
    bottom = band.feet;
  let spans = [[band.left + half, band.right - half]];
  for (const r of blocks) {
    if (!r || r.bottom <= top || r.top >= bottom) continue;
    const cutLo = r.left - 8 - half,
      cutHi = r.right + 8 + half;
    spans = spans.flatMap(([a, b]) => {
      if (cutHi <= a || cutLo >= b) return [[a, b]];
      const out = [];
      if (cutLo > a) out.push([a, cutLo]);
      if (cutHi < b) out.push([cutHi, b]);
      return out;
    });
  }
  return spans.filter(([a, b]) => b >= a);
}
/** A free spot on the window edge: the wanted y when it is clear of every
 * no-go rect, otherwise the nearest clear one in 22 px steps, otherwise a
 * peek from behind the edge. The peek shows at most 42 % of the figure and
 * never reaches over a control: where the edge column is busy it shows
 * less, and with less than 20 px to show it hides (`hide`). */
export function edgeSlot({ side = "right", wantY, vw, vh, noGo = [], top = 60, bottomGap = 70 }) {
  const x = side === "left" ? 14 : vw - SIZE - 14;
  const lo = top,
    hi = vh - SIZE - bottomGap;
  const start = clamp(wantY, lo, Math.max(lo, hi));
  const ys = [];
  for (let k = 0; k <= 30; k++)
    for (const sign of k ? [1, -1] : [1]) {
      const y = start + sign * k * 22;
      if (y < lo || y > hi) continue;
      ys.push(y);
      if (!hitsAny(box(x, y, SIZE, SIZE), noGo)) return { x, y, peek: false };
    }
  const deepest = side === "left" ? -SIZE * 0.42 : vw - SIZE * 0.58;
  // A peeking companion leans 14° into the window from its feet, so its head
  // reaches about 17 px further in than its box.
  const lean = Math.round(SIZE * 0.92 * Math.sin((14 * Math.PI) / 180));
  let best = null;
  for (const y of ys.length ? ys : [start]) {
    // How much of the figure fits between the window edge and the nearest
    // no-go rect level with it.
    let room = SIZE * 0.58;
    for (const r of noGo) {
      if (r.bottom <= y || r.top >= y + SIZE) continue;
      room = Math.min(room, (side === "left" ? r.left : vw - r.right) - 2 - lean);
    }
    if (!best || room > best.room + 0.5) best = { y, room };
  }
  if (best.room < 20) return { x: deepest, y: start, peek: true, hide: true };
  return {
    x: side === "left" ? best.room - SIZE : vw - best.room,
    y: best.y,
    peek: true,
  };
}
/** A spot beside an open dialog `r`, never on it and never on what `noGo`
 * lists (the music dimmed behind the backdrop, a notice). In order: outside
 * its left edge, perched on its top edge, outside its right edge (the report
 * card tries its top edge first); then the same sides lifted clear of the
 * music below them; then below it; then perched small on its top edge;
 * else out of sight until it closes. */
export function modalSpot(r, vw, vh, results = false, noGo = []) {
  const yBeside = clamp(r.top + 12, 8, vh - SIZE - 8);
  const free = (x, y, s = 1) => {
    const f = figureRect(x, y, s);
    return inside(f, vw, vh, 2) && !rectsIntersect(f, r) && !hitsAny(f, noGo, 2);
  };
  const ok = (spot) => (spot && free(spot.x, spot.y, spot.s ?? 1) ? spot : null);
  // Lifted beside: feet just above the first no-go rect in that column.
  const lifted = (x, bubble) => {
    if (x < 2 || x + SIZE > vw - 2) return null;
    let first = Infinity;
    const within = (n) => n.left >= r.left - 1 && n.right <= r.right + 1 && n.top >= r.top - 1 && n.bottom <= r.bottom + 1;
    for (const n of noGo) if (n.right > x && n.left < x + SIZE && n.top > 8 && !within(n)) first = Math.min(first, n.top);
    if (!Number.isFinite(first)) return null;
    const y = Math.min(yBeside, first - SIZE - 2);
    return y >= 4 ? { x, y, bubble, at: "modal" } : null;
  };
  const topX = clamp(r.right - 148, 6, vw - SIZE - 6);
  const left = () => (r.left >= 94 ? { x: r.left - 86, y: yBeside, bubble: "left", at: "modal" } : null);
  const top = () => (r.top >= SIZE + 4 ? { x: topX, y: r.top - SIZE, bubble: "up", at: results ? "results" : "modal" } : null);
  const right = () => (r.right <= vw - 94 ? { x: r.right + 8, y: yBeside, bubble: "right", at: "modal" } : null);
  const below = () =>
    r.bottom + SIZE + 8 <= vh ? { x: topX, y: r.bottom + 4, bubble: "down", at: "modal" } : null;
  const liftLeft = () => (r.left >= 94 ? lifted(r.left - 86, "left") : null);
  const liftRight = () => (r.right <= vw - 94 ? lifted(r.right + 8, "right") : null);
  // Perched small on the top edge when the gap above the dialog is short.
  const perch = () => {
    const s = Math.min(1, (r.top - 4) / SIZE);
    return s >= 0.6 ? { x: topX, y: r.top - SIZE, s, bubble: "up", at: results ? "results" : "modal" } : null;
  };
  const order = results
    ? [top, left, right, liftLeft, liftRight, below, perch]
    : [left, top, right, liftLeft, liftRight, below, perch];
  for (const spot of order) {
    const found = ok(spot());
    if (found) return found;
  }
  // The dialog fills the window: step out of sight until it closes.
  return { x: vw - SIZE - 8, y: vh - SIZE - 8, bubble: "up", at: "corner", hide: true };
}

// --------------------------------------------------------------- bubble ---

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
/** Display width of a line in "Latin characters" (CJK counts double). */
export function textUnits(text = "") {
  let n = 0;
  for (const ch of String(text)) n += WIDE.test(ch) ? 1.8 : 1;
  return n;
}
/** The bubble's likely size for a line of `chars` units, with the calling
 * card's name row. */
export function bubbleSize(chars, maxW = 230, extraLines = 0) {
  const w = Math.round(Math.min(maxW, 7.2 * chars + 26));
  const perLine = Math.max(1, (w - 26) / 7.2);
  const lines = Math.max(1, Math.ceil(chars / perLine)) + extraLines;
  return { w, h: 20 + 18 * lines + 14 };
}
/** Where a bubble may go beside `anchor` (the figure's rect): the preferred
 * side, the other side, above, then below. A spot must fit the window with
 * an 8 px margin and touch no no-go rect. `null` means "don't show it". */
export function placeBubble(anchor, chars, noGo = [], vw, vh, { prefer, maxW = 230, extraLines = 0 } = {}) {
  const { w, h } = bubbleSize(chars, Math.max(80, maxW), extraLines);
  const cx = (anchor.left + anchor.right) / 2;
  const toward = prefer || (cx < vw / 2 ? "right" : "left");
  // Beside the figure: level with its head, else lifted so the card's
  // bottom meets the figure's feet (a short header has little height).
  const beside = (left) => [box(left, anchor.top + 4, w, h), box(left, anchor.bottom - h, w, h)];
  const at = {
    left: () => beside(anchor.left - 8 - w),
    right: () => beside(anchor.right + 8),
    up: () => [box(clamp(cx - w / 2, 8, vw - 8 - w), anchor.top - 4 - h, w, h)],
    down: () => [box(clamp(cx - w / 2, 8, vw - 8 - w), anchor.bottom + 6, w, h)],
  };
  const order = [toward, toward === "left" ? "right" : toward === "right" ? "left" : "up", "up", "down"];
  for (const side of [...new Set(order)]) {
    if (!at[side]) continue;
    for (const rect of at[side]()) if (inside(rect, vw, vh, 8) && !hitsAny(rect, noGo)) return { side, rect };
  }
  return null;
}
/** How long a line stays up: long enough to read, never lingering. */
export const bubbleTtl = (text = "") => Math.min(4500, Math.max(1800, 55 * String(text).length));

// --------------------------------------------------------------- speech ---

export const P = Object.freeze({ USER: 0, ACHIEVE: 1, MUSIC: 2, AMBIENT: 3 });
export const createSpeech = () => ({
  lastAchieve: -Infinity,
  lastAmbient: -Infinity,
  said: [], // times of non-user bubbles (the 5-minute cap)
  lines: {}, // text → last time it was said (ambient repeats)
  queue: null, // an achievement line waiting for the music to stop
  news: null, // a line the budget held back; the next poke says it
});
/** Decide what happens to a line. Returns `{ verdict, state }`, where the
 * verdict is `say`, `face` (show a face only: Quiet mode), `queue` (until
 * playback stops), `news` (budget held it; halo now, say on next poke) or
 * `drop`. `state` is a new object; the input is not changed. */
export function speechGate(prev, { priority, text = "", now, playing = false, quiet = false }) {
  const state = { ...prev, said: prev.said.filter((t) => now - t < 300000), lines: { ...prev.lines } };
  const out = (verdict) => ({ verdict, state });
  if (priority === P.USER) return out(quiet ? "face" : "say");
  if (priority === P.MUSIC) return out("drop");
  if (quiet) return out(priority === P.ACHIEVE ? "face" : "drop");
  if (playing) {
    if (priority === P.ACHIEVE) {
      state.queue = { text, at: now };
      return out("queue");
    }
    return out("drop");
  }
  if (priority === P.AMBIENT && now - (state.lines[text] ?? -Infinity) < 600000) return out("drop");
  const capped = state.said.length >= 6;
  const tooSoon =
    priority === P.ACHIEVE ? now - state.lastAchieve < 8000 : now - state.lastAmbient < 180000;
  if (capped || tooSoon) {
    state.news = { text, at: now };
    return out("news");
  }
  state.said = [...state.said, now];
  if (priority === P.ACHIEVE) state.lastAchieve = now;
  else {
    state.lastAmbient = now;
    state.lines[text] = now;
  }
  return out("say");
}
/** On stop: the queued achievement line, if it is still fresh (20 s). */
export function flushQueue(prev, now) {
  const q = prev.queue;
  const state = { ...prev, queue: null };
  return { text: q && now - q.at <= 20000 ? q.text : null, state };
}
/** The held-back line for the next poke (and clear it); stale after 10 min. */
export function takeNews(prev, now) {
  const n = prev.news;
  return { text: n && now - n.at < 600000 ? n.text : null, state: { ...prev, news: null } };
}

// ---------------------------------------------------------------- touch ---

/** What a run of clicks means. `times` are the click times (ms) of the
 * current run, oldest first; `now` is the time of evaluation. Returns
 * `tickle` (4+ clicks within 1.6 s), `chat` (exactly two clicks ≤ 320 ms
 * apart and then 280 ms of quiet), `pending` (that double-click is still
 * waiting for a possible third) or `poke`. */
export function classifyClicks(times, now = times[times.length - 1]) {
  const n = times.length;
  if (!n) return "none";
  if (n >= 4 && times[n - 1] - times[n - 4] <= 1600) return "tickle";
  if (n === 2 && times[1] - times[0] <= 320) return now - times[1] >= 280 ? "chat" : "pending";
  return "poke";
}
/** Track horizontal strokes over the head. Petting is ≥ 3 direction flips of
 * ≥ 3 px each within 1.2 s. */
export function petTrack(prev, x, now) {
  const s = prev ? { ...prev, flips: prev.flips.filter((t) => now - t <= 1200) } : { x, dir: 0, flips: [], last: now };
  const dx = x - s.x;
  if (Math.abs(dx) >= 3) {
    const dir = Math.sign(dx);
    if (s.dir && dir !== s.dir) s.flips = [...s.flips, now];
    s.dir = dir;
    s.x = x;
  }
  s.last = now;
  return { ...s, petting: s.flips.length >= 3 };
}
export const POKES = Object.freeze(["hop", "spin", "wave", "notes", "boop"]);
/** The next poke reaction, never the same one twice in a row. */
export function nextPoke(prev, random = Math.random) {
  const options = POKES.filter((p) => p !== prev);
  return options[Math.floor(random() * options.length) % options.length];
}

/** Pokes from a shuffled bag: every reaction once before any repeats, and
 * never the same one twice in a row across refills. */
export function pokeFromBag(bag = [], prev = "", random = Math.random) {
  let next = bag.slice();
  if (!next.length) {
    next = POKES.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)) % (i + 1);
      [next[i], next[j]] = [next[j], next[i]];
    }
    if (next[0] === prev) next.push(next.shift());
  }
  const [kind, ...rest] = next;
  return { kind, bag: rest };
}

// -------------------------------------------------------------- physics ---

export const PHYSICS = Object.freeze({
  gravity: 2400,
  restitution: 0.42,
  drag: 0.6,
  spinPerPx: 0.08,
  maxSpin: 720,
  settle: 120,
  toss: 900,
  dizzy: 2200,
});
/** One step of a tossed companion. `b` = { x, y, vx, vy, angle } (px, px/s,
 * deg); `bounds` = { left, right, top, floor } for the box's top-left.
 * Returns the next body plus `landed` (resting on the floor) and `bounced`. */
export function stepPhysics(b, dt, bounds) {
  const k = Math.exp(-PHYSICS.drag * dt);
  let vx = b.vx * k,
    vy = (b.vy + PHYSICS.gravity * dt) * k;
  let x = b.x + vx * dt,
    y = b.y + vy * dt;
  let bounced = false;
  if (x < bounds.left) {
    x = bounds.left;
    vx = Math.abs(vx) * PHYSICS.restitution;
    bounced = true;
  } else if (x > bounds.right) {
    x = bounds.right;
    vx = -Math.abs(vx) * PHYSICS.restitution;
    bounced = true;
  }
  if (bounds.top != null && y < bounds.top) {
    y = bounds.top;
    vy = Math.abs(vy) * PHYSICS.restitution;
    bounced = true;
  }
  let onFloor = false;
  if (y >= bounds.floor) {
    y = bounds.floor;
    if (vy > 0) {
      vy = -vy * PHYSICS.restitution;
      bounced = Math.abs(vy) > 40 || bounced;
    }
    onFloor = true;
    vx *= Math.exp(-6 * dt); // floor friction
  }
  const spin = clamp(vx * PHYSICS.spinPerPx, -PHYSICS.maxSpin, PHYSICS.maxSpin);
  const angle = (b.angle || 0) + spin * dt;
  const landed = onFloor && Math.hypot(vx, vy) < PHYSICS.settle;
  return { x, y, vx: landed ? 0 : vx, vy: landed ? 0 : vy, angle, landed, bounced };
}
/** A critically-damped-ish spring toward `target` (stiffness 520, damping
 * 32), integrated in small steps so it is stable at any frame rate. */
export function springStep(p, v, target, dt, k = 520, c = 32) {
  let pos = p,
    vel = v;
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    vel += (k * (target - pos) - c * vel) * h;
    pos += vel * h;
  }
  return [pos, vel];
}
/** Release velocity (px/s) from pointer samples over the last 80 ms. */
export function releaseVelocity(samples, now) {
  const recent = samples.filter((s) => now - s.t <= 80);
  if (recent.length < 2) return { vx: 0, vy: 0, speed: 0 };
  const a = recent[0],
    b = recent[recent.length - 1];
  const dt = Math.max(0.008, (b.t - a.t) / 1000);
  const vx = (b.x - a.x) / dt,
    vy = (b.y - a.y) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy) };
}

// ---------------------------------------------------------------- faces ---

/** Expression presets: eyes, mouth and fx (space-separated marks). */
export const FACES = Object.freeze({
  neutral: { eyes: "", mouth: "", fx: "" },
  happy: { eyes: "happy", mouth: "", fx: "blush" },
  proud: { eyes: "sparkle", mouth: "", fx: "" },
  surprised: { eyes: "wide", mouth: "o", fx: "bang" },
  worried: { eyes: "", mouth: "", fx: "sweat sigh" },
  wince: { eyes: "half", mouth: "", fx: "" },
  sleepy: { eyes: "half", mouth: "", fx: "" },
  asleep: { eyes: "sleep", mouth: "", fx: "" },
  smitten: { eyes: "heart", mouth: "", fx: "blush" },
  wink: { eyes: "wink", mouth: "", fx: "blush" },
  dizzy: { eyes: "dizzy", mouth: "o", fx: "" },
  grumpy: { eyes: "half", mouth: "", fx: "sigh" },
  content: { eyes: "happy", mouth: "", fx: "" },
  boop: { eyes: "sleep", mouth: "", fx: "" },
  gasp: { eyes: "wide", mouth: "o", fx: "bang" },
  humming: { eyes: "happy", mouth: "", fx: "note" },
  // A soft worried look: when a run is going badly, no more than a sweat drop.
  soft: { eyes: "", mouth: "", fx: "sweat" },
  chew: { eyes: "happy", mouth: "o", fx: "blush" },
});
/** Idle time → drowsiness. */
export const drowsiness = (idleMs) => (idleMs >= 75000 ? "asleep" : idleMs >= 45000 ? "sleepy" : "awake");
/** When the next blink falls (ms from now) and whether it is a double. */
export function nextBlink(random = Math.random, reduced = false) {
  return reduced
    ? { in: 8000 + random() * 4000, double: false }
    : { in: 2600 + random() * 3400, double: random() < 0.15 };
}

// ----------------------------------------------------------------- bond ---

export const BOND_LEVELS = Object.freeze([0, 20, 60, 150, 300, 600]);
/** Hearts (0–5) for a companion's bond XP. */
export function bondLevel(xp = 0) {
  let level = 0;
  for (let i = 1; i < BOND_LEVELS.length; i++) if (xp >= BOND_LEVELS[i]) level = i;
  return level;
}
/** Add bond XP for one companion (bond never decreases). A long pet counts
 * at most 5 times a day. Returns a new `bond` map. */
export function addBond(bond = {}, id, xp, today, { pet = false } = {}) {
  const prev = bond[id] || { xp: 0, pets: 0, petDay: "" };
  const entry = { ...prev };
  if (pet) {
    if (entry.petDay !== today) {
      entry.petDay = today;
      entry.pets = 0;
    }
    if (entry.pets >= 5) return bond;
    entry.pets += 1;
  }
  entry.xp = clamp(Math.round(entry.xp + Math.max(0, xp)), 0, 1e7);
  return { ...bond, [id]: entry };
}

/** Level before and after adding bond XP, so a level-up can be celebrated.
 * Returns `{ bond, from, to }`. */
export function gainBond(bond = {}, id, xp, today, opts = {}) {
  const from = bondLevel(bond[id]?.xp ?? 0);
  const next = addBond(bond, id, xp, today, opts);
  return { bond: next, from, to: bondLevel(next[id]?.xp ?? 0) };
}
/** Bond XP for practice time: +1 per whole minute the `minutes` total
 * crossed. Jumps bigger than `max` minutes (a settings load, another
 * device) earn nothing. */
export function minuteXp(prev, next, max = 3) {
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return 0;
  const gained = Math.floor(next) - Math.floor(prev);
  return gained > 0 && gained <= max ? gained : 0;
}

// --------------------------------------------------------------- treats ---

export const TREAT_MAX = 12;
export const RUN_TREATS_PER_DAY = 2;
/** The treat jar after the day's events. `events` = { goal (the daily goal
 * is reached), streak (days in a row), run ({ accuracy 0..1, complete }) }.
 * The goal pays once a day, each streak milestone once ever, a complete run
 * of 90 % or more at most twice a day, and the jar holds 12. Returns
 * `{ treats, earned, reasons }`; `reasons` lists what paid out (also when
 * the jar was full), e.g. ["goal", "streak:7", "run"]. */
export function earnTreats(prev = {}, today, { goal = false, streak = 0, run = null } = {}) {
  let t = {
    jar: 0,
    day: "",
    earnedToday: 0,
    milestones: [],
    goalDay: "",
    ...prev,
  };
  t.milestones = [...(t.milestones || [])];
  if (t.day !== today) t = { ...t, day: today, earnedToday: 0 };
  const reasons = [];
  if (goal && t.goalDay !== today) {
    t.goalDay = today;
    reasons.push("goal");
  }
  for (const m of STREAK_MILESTONES)
    if (streak >= m && !t.milestones.includes(m)) {
      t.milestones.push(m);
      reasons.push(`streak:${m}`);
    }
  t.milestones.sort((a, b) => a - b);
  if (run?.complete && run.accuracy >= 0.9 && t.earnedToday < RUN_TREATS_PER_DAY) {
    t.earnedToday += 1;
    reasons.push("run");
  }
  const earned = Math.max(0, Math.min(TREAT_MAX - t.jar, reasons.length));
  t.jar += earned;
  return { treats: t, earned, reasons };
}
/** One treat out of the jar, or null when it is empty. */
export function feedTreat(treats) {
  if (!treats || !(treats.jar > 0)) return null;
  return { ...treats, jar: treats.jar - 1 };
}

// -------------------------------------------------------------- welcome ---

/** Which hello fits the moment. `hour` is the local hour (0–23); `today`
 * and `lastSeen` are day keys; `streak` is days in a row; `piece` is
 * `{ title, bar }` where the current piece was left, or null. Back again
 * today comes first, then the late hour (a gentle, short session), a streak
 * of three or more, the piece, then the time of day. */
export function welcomeEvent({ hour = 12, today = "", lastSeen = "", streak = 0, piece = null } = {}) {
  const at = piece && piece.title && piece.bar > 1 ? { title: piece.title, bar: piece.bar } : null;
  if (today && lastSeen === today) return { event: "welcome:back", ctx: at || {} };
  if (hour >= 22 || hour < 5) return { event: "welcome:late", ctx: {} };
  if (streak >= 3) return { event: "welcome:streak", ctx: { n: streak } };
  if (at) return { event: "welcome:piece", ctx: at };
  if (hour >= 5 && hour < 11) return { event: "welcome:morning", ctx: {} };
  if (hour >= 17) return { event: "welcome:evening", ctx: {} };
  return { event: "welcome", ctx: {} };
}

// ------------------------------------------------------------ verdicts ---

/** How the face answers a wrong note. Nothing in Perform's first four bars;
 * once a run is going badly (under 50 % after 8 graded notes) only a soft
 * worried look; two misses within 1.5 s a worried face (when its cooldown
 * allows); otherwise a short wince. */
export function missReaction({ firstBars = false, recent = 0, hits = 0, misses = 0, worriedReady = true } = {}) {
  if (firstBars) return "none";
  const graded = hits + misses;
  if (graded >= 8 && hits / graded < 0.5) return "soft";
  if (recent >= 2 && worriedReady) return "worried";
  return "wince";
}
