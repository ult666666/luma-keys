# Hand motion design — the arm places a position, the fingers play (synthesis)

This is the design an implementer follows for the two illustrated hands painted over the on-screen keyboard (`src/hand-pose.mjs`, `src/hand-draw.mjs`, the hand plumbing in `src/KeyboardGuide.jsx`). It starts from the panel's winning biomechanics design, merges the grafts the judges agreed on (pedagogy's learner surface, invariants' guards and lint, architecture's layering and delivery), and fixes every failure case the judges found (Appendix A maps each case to its fix). Nothing here needs the panel documents; the understanding pack is cited only as the source of measured numbers.

Units: **key** = one white-key width; `u` = px per key (20–68), `v = min(u, 0.3·keysHeight)` = the depth unit (px), `w = 0.84·u` knuckle spacing; **hand space** `X = dir·x` with `dir = +1` right hand, `−1` left, so `+` always points toward finger 5; `keyCentre(midi)` (keys) as today; all times are **real seconds** = score seconds (tempo map) ÷ practice speed, except where a quantity is explicitly "beats" (the key glow's `ahead`).

The prototype used to check the timings in this document is `.qa-runs/hand-motion/design/synth-plan.mjs` (positions, boundary kinds, releases, smoothed lean over the stress scenarios); every walkthrough number in §11 comes from it or from one line of arithmetic shown beside it.

---

## 1. Goals and non-goals

**Goals.** The hand must look like a pianist's hand and teach only correct habits: the arm places a *position* (a palm frame) and only the fingers move inside it; the palm moves between positions in real seconds with a distance-dependent duration, waiting first at slow practice speed instead of moving in slow motion; a sounding finger stays exactly on its key until its visual release, and the only early releases are enumerated rules (a travel that cannot otherwise be made, a repeated or exchanged key, an unreachable held note let go to the pedal, a chord no hand can hold rolled bass-first); a thumb-under is a thumb passing beneath a still, held hand and a finger-over is a lifted finger passing over a held thumb; anatomy is constant (finger length ratio 0.55–1.30, palm width ≤ 1.22×, fingers in order, pads never interpenetrating, two hands never flat on each other); lift is shown by cues, not by sliding; every preparation cue (key glow, key mark with finger numeral, finger ring, hover) sits on one real-time axis and nothing pops; wait mode and a paused clock show a correct standing picture; the pose stays a pure function of its inputs so seeking equals playing; repaints happen only on signature change and whole-hand translation/lift/z-order ride the compositor.

**Non-goals.** This design does not change the fingering engine (`src/fingering.mjs`) even where its choices force ugly but honest motion (finger changes on repeated keys, 33-semitone "chords", hops); it does not change the key glow (`keyLights`), the runway or the coach strip's state machine beyond one additive chip rule; it does not model dynamics, pedalling technique or a 3-D camera; it does not animate the transport's own seeks (a seek is a new input, not a motion); it does not pursue late arrivals (every struck key is exact at its onset even when the score demands an impossible speed — such frames are flagged `forced`, never hidden).

---

## 2. Vocabulary and data shapes

```js
// L0 — timeline step (unchanged, from handTimeline): one per onset of one hand.
/** @typedef {{ beat: number, keys: Contact0[] }} Step */
/** @typedef {{ finger: 1|2|3|4|5, midi: number, end: number /*beat*/, struck: boolean }} Contact0 */

// Clock — beats → real seconds (tempo map × practice speed, count-in rate before beat 0).
/** @typedef {{ toSeconds(beat:number): number, toBeat(s:number): number, key: string }} Clock */

// Contact in the plan: a key the hand touches, with planned times (seconds).
/** @typedef {{
 *   finger: 1|2|3|4|5, midi: number, x: number /*keys*/, X: number /*hand space*/, black: boolean,
 *   step: number, struck: boolean,
 *   onset: number, end: number,         // written, seconds
 *   release: number,                    // visual release, seconds (≤ end + OVERLAP)
 *   releaseKind: "end"|"overlap"|"travel"|"hop"|"repeat"|"swap"|"pedal"|"roll",
 *   pedal: boolean,                     // sound continues after `release` (ring on the key)
 *   rollAt: number|null,                // actual touch time if this contact is a rolled group member
 *   dev: number                         // X − (palmAtOnset + SLOT[finger]·spread): lateral deviation from its slot
 * }} Contact */

// Position (segment): a run of consecutive steps one palm frame covers.
/** @typedef {{
 *   index: number, i0: number, i1: number,          // first/last step index
 *   C: number, lo: number, hi: number,              // palm centre (hand space) and its feasible interval
 *   spread: 1|1.1|1.2|1.3|1.4, fan: number,         // knuckle fan = 1 + 0.55·(spread−1)
 *   forward: number,                                // 0..1 black-key share → knuckle row toward the fallboard
 *   cross: null|{ kind:"under"|"over", reach:number, crossed:Contact0, crosser:Contact0 },
 *   pedal: Contact[], roll: Contact[][],            // holds let go on entry; rolled groups (bass group first)
 *   leanRaw: number[], lean: number[]               // per step: raw and smoothed lean targets (keys)
 * }} Position */

// Boundary plan between consecutive positions A → B.
/** @typedef {{
 *   kind: "CROSS"|"SLIDE"|"LEAN"|"TRAVEL",
 *   onsetA: number, onsetB: number, ioi: number, d: number,
 *   tDepart: number, tArrive: number,               // palm path endpoints (TRAVEL/SLIDE)
 *   phase1?: { t0:number, t1:number, Clim:number }, phase2?: { t0:number, t1:number }, // CROSS/LEAN
 *   hover: number, steal: number, forced: boolean,  // seconds early-arrival, seconds stolen, over-cap flag
 *   pins: Contact[], releases: Map<Contact, number>,
 *   crosser?: { finger:number, from:number, to:number, aimStart:number }  // CROSS only
 * }} Plan */

// Gesture: a per-finger engagement window the frame evaluator reads.
/** @typedef {{
 *   contact: Contact,
 *   prepStart: number,     // numbers/marks/ready may show from here (≥ previous release + RELEASE_S)
 *   aimStart: number,      // lateral approach starts (≥ previous release)
 *   strikeStart: number,   // descent starts = onset − 0.3·(onset − aimStart)
 *   hop: null|{ from:number, to:number, under:boolean, over:boolean }   // same-finger hop / thumb-under / finger-over
 * }} Gesture */

// Motion sample (one hand, one instant) — the output of motionAt(model, t, options).
/** @typedef {{
 *   t: number, step: number, position: number,
 *   palm: { C:number, lean:number, x:number /*keys, dir applied*/, moving:boolean, tau:number, lift:number,
 *           spread:number, fan:number, forward:number, roll:number },
 *   fingers: Array<{ finger:number, X:number, x:number, dev:number, state:"down"|"ready"|"up",
 *            lift:number, curl:number, extend:number, press:number, under:number, tuck:number, number:number,
 *            midi:number|null, black:boolean, target:null|{ x:number, midi:number, black:boolean, alpha:number } }>,
 *   relax: number, rest: boolean, crowd: number, zTop: boolean, forced: boolean, forcedFinger: boolean,
 *   marks: Array<{ midi:number, finger:number, kind:"land"|"roll", strength:number }>,
 *   pedal: Array<{ midi:number, kind:"pedal"|"free", until:number }>
 * }} Motion */

// Pose — what the drawer reads (see §5.2 for the field contract and the signature rule).
```

Relationships: `steps → positions → plans → gestures` are all pure functions of `(steps, clock, hand)` and are memoised as one `model` in `WeakMap<steps, Map<clock.key, model>>`; `motionAt` is a pure function of `(model, t, options)`; `handPose` is `geometry(motionAt(...))`. Two hands: `handPoses(timelines, now, options)` builds both models, evaluates both motions, resolves `crowd`/`zTop` symmetrically, then assembles both poses.

---

## 3. Inputs and plumbing

### 3.1 The option object

```js
handPose(steps, now /*beats*/, hand /*"left"|"right"*/, {
  keyWidth, keysHeight, bedHeight,          // px, as today
  reducedMotion = false,                    // as today
  clock = DEFAULT_CLOCK,                    // { toSeconds, toBeat, key }; default 0.5 s/beat, key "default"
  speed = 1,                                // informational (clock already includes it); used only for lint reports
  frozen = false,                           // the host clock is standing (paused or wait mode)
  waiting = false,                          // wait mode: `now` is the onset of the chord the learner must play
  counting = false,                         // count-in in progress: never dim
  settle = null,                            // { since } seconds since the host last changed a frozen clock (replay/breathe)
  ahead = null,                             // key-glow lookahead in BEATS (clamps footprint alpha to the glow)
  pedals = [],                              // score.pedals spans [{start, end}] in beats (pedal vs "let go" ring)
  other = null,                             // { steps, hand } — the other hand; handPoses supplies this
})
handPoses(timelines /*{left, right}*/, now, options) → { left: Pose|null, right: Pose|null }
```

Every option is optional, so the 28 existing test calls `handPose(steps, beat, hand, {keyWidth, keysHeight, bedHeight[, reducedMotion]})` keep working with the default clock (0.5 s per beat = 120 bpm).

### 3.2 Exact plumbing changes

| file | change |
|---|---|
| `src/tempo.mjs` | add `export function clockMap(score, speed = 1, countInSecondsPerBeat = null)` → memoised `{ toSeconds(b) = b < 0 && countInSecondsPerBeat ? b·countInSecondsPerBeat : secondsAt(score, b)/speed, toBeat(s) = beatAtSeconds(score, s·speed), key: \`${score?.id ?? "nil"}|${speed}|${countInSecondsPerBeat ?? ""}\` }` (WeakMap per score object, Map per key). |
| `src/App.jsx` ≈ line 3943 | beside `clock={stageClock}` add `speed={speed}` and `countInSecondsPerBeat={transport.current.countIn?.secondsPerBeat ?? null}` (both exist in App state/transport; App line 2025 creates `t.countIn = { start, plan, secondsPerBeat }`). |
| `src/KeyboardGuide.jsx` props | accept `speed = 1`, `countInSecondsPerBeat = null`; `const clockMap_ = useMemo(() => clockMap(score, speed, countInSecondsPerBeat), [score, speed, countInSecondsPerBeat])`; put `clockMap_, speed, score, count` into `live.current` (`ahead`, `playing`, `mode`, `timelines`, `bed`, `reducedMotion`, `keyWidth` are already there). Track `frozenSince`: a ref holding `performance.now()` of the last frame at which `now` changed while `!playing || mode === "wait"` (so `settle = { since: (performance.now() − frozenSince)/1000 }` while frozen, else `null`). |
| `src/KeyboardGuide.jsx` frame loop (replaces the per-hand `handPose` call at ≈ 576) | `const poses = handPoses(s.timelines, now, { keyWidth: s.keyWidth, keysHeight: s.bed.keys, bedHeight: s.bed.height, reducedMotion: s.reducedMotion, clock: s.clockMap_, speed: s.speed, frozen: !s.playing \|\| s.mode === "wait", waiting: s.mode === "wait", counting: !!s.count, settle, ahead: s.ahead, pedals: s.score?.pedals \|\| [], visible: hand => s.expanded && s.showHands && s.bed.keys > 0 && s.handsInPlay.has(hand) })`; then per hand `paintHand(layer, pose, hand, s.bed.height, hidden)` as today. |
| `src/KeyboardGuide.jsx` `paintHand` | transform `translate3d(${x − w/2}px, ${(−2·lift).toFixed(1)}px, 0) scale(${(1 + 0.03·lift).toFixed(3)})` with `transform-origin: 50% 60%`, `lift = pose.palm.lift` quantised 0.05 (only non-zero while no finger is down, §5.3); `canvas.style.setProperty("--hand-lift", lift)`; `canvas.style.zIndex = pose.zTop ? 11 : 10` on change; `.rest` class as today; `--hand-fade-start = keysHeight + 4 − 2·lift px`. |
| `src/KeyboardGuide.jsx` key marks | after the hands, write the union of both poses' `marks` and `pedal` lists onto key elements like `lit` is written: `el.dataset.land = hand`, `el.style.setProperty("--land", strength.toFixed(2))`, `el.dataset.landFinger = finger`, `el.dataset.landKind = kind`; `el.dataset.pedal = hand`, `el.dataset.pedalKind = kind`; only on change, cleared when absent (a `Map` like `lit`). If both hands mark one key the right hand's mark wins (never happens in the library). |
| `src/keyboard-guide.css` | `[data-land] .key-surface::after { border: 1.5px dotted rgba(var(--tc), calc(0.45 + 0.55·var(--land))) ... }` (same geometry as `[data-then]`), `[data-land]::before { content: attr(data-land-finger) }` small numeral in the hand's ink at the key's lower third; `[data-land-kind="roll"]` solid border; `[data-pedal] .key-surface::after` hollow round ring 1.25 px in `--tc` at 0.5 alpha, `[data-pedal-kind="pedal"]` adds a 6 px "P" dot. `--tc` already switches per hand via `[data-then="left"]`; add the same selectors for `data-land`/`data-pedal`. |
| `src/stage.css` | `.hand-layer { filter: drop-shadow(0 calc(2px + var(--hand-lift,0)*6px) calc(1.5px + var(--hand-lift,0)*3px) rgba(0,0,0,.2)); transform-origin: 50% 60%; }`; `.keyboard-stage.with-hands .land-splash { display: none }`. |
| `src/KeyboardGuide.jsx` section class | add `with-hands` to the stage's class list when `expanded && showHands`. |
| `src/HandCoach.jsx` + `src/hand-coach.mjs` | pass `score`, `speed` props; `gapSeconds = gapBeats == null ? null : secondsBetween(score, beat, beat + gapBeats, speed)`; line 91 becomes `const notes = c.current.length ? [...c.current, ...(gapSeconds != null && gapSeconds < 1 ? c.upcoming : [])] : c.upcoming;` (chips "Hold C (1) · Next E (3)"). |
| `scripts/hand-lab.html` | finger per hand with `fingerScore` (today `fingerHand` is fed both hands' notes); build `clock` from `scenario.tempos ?? scenario.bpm` and `scenario.speed`; call `handPoses`; honour `?frozen=1&waiting=1&speed=0.5`; draw `marks`/`pedal` on the lab keys; apply `zTop`/`--hand-lift`. |
| `scripts/hand-lab-passage.mjs` | copy `tempos` and `pedals` into the scenario (S04/S09/S11 are currently cut at the opening 144 bpm; S11 is at 180). |
| new `scripts/hand-lab-lint.mjs` | §6.3. |

Edge cases the clock imposes: during a count-in `now < steps[0].beat` and the rate is `countInSecondsPerBeat` (the clock map handles negative beats); when paused or in wait mode `clock()` is constant, so `frozen` is true and `settle.since` is the only thing that advances (§4.8). `ahead` stays in beats because the key glow is defined in beats (`soon = 1 − (n.beat − now)/ahead`); the footprint clamp therefore uses beats too, which is exact under any tempo map.

---

## 4. Algorithms

Helpers used throughout: `ease(τ) = τ³(10 − 15τ + 6τ²)` (quintic, zero end velocity/acceleration), `ease01(x) = ease(clamp(x, 0, 1))`, `clamp`, `T(d)` travel time, named constants in §8.

### 4.1 Timeline → seconds

```
times(steps, clock):
  onset[i] = clock.toSeconds(steps[i].beat)
  for each key k of step i: endS = clock.toSeconds(k.end)
  ioi[i]   = onset[i+1] − onset[i]            (Infinity for the last step)
```
Beats never appear again downstream except `step.beat` for the `ahead` clamp (§7).

### 4.2 Positions — `segment(steps, dir, times)`

Slots and reach (keys, hand space): `SLOT = [·, −2.40, −1.35, −0.45, +0.45, +1.35]` (× spread), `DEV = [·, [−2.2,+1.4], [−0.8,+0.8], [−0.8,+0.9], [−0.8,+1.0], [−0.8,+1.5]]`, `PIN_DEV = [·, [−2.2,+3.3], [−1.6,+0.8], [−1.6,+0.9], [−1.6,+1.0], [−0.8,+1.5]]` (a pinned finger while the palm leans past it: thumb tucked ≤ 3.3 under, a long finger trailing ≤ 1.6), `OVER_DEV = PIN_DEV` with fingers 2–4 toward the thumb widened to `−2.2` (a finger crossing over a pinned thumb), `SPREADS = [1, 1.1, 1.2, 1.3, 1.4]`.

```
devFor(c, set):                                  // a contact's reach table inside a set
  thumb = set.find(finger 1)
  if c.finger == 1: return set.some(k.finger > 1 && k.X < c.X) ? PIN_DEV[1] : DEV[1]    // thumb beyond a finger → tucked
  return thumb && thumb.X > c.X ? PIN_DEV[c.finger] : DEV[c.finger]                      // finger below the thumb → trailing

fitFrame(contacts, hyst = 0):                    // smallest spread whose reach intervals intersect
  for s in SPREADS:
    [lo, hi] = ∩ over c: [ c.X − SLOT[c.finger]·s − devFor(c)[1] − hyst,  c.X − SLOT[c.finger]·s − devFor(c)[0] + hyst ]
    if lo ≤ hi: return { C: (lo+hi)/2, lo, hi, spread: s }
  return null
ratioGuard(frame, contacts): every finger's projected length ratio (§5.1 formula) ∈ [0.55, 1.30] given follow 60 %
feasible(contacts, hyst) = fitFrame(contacts, hyst) that also passes ratioGuard   // the only feasibility test in the module

settle(prevC, fit) = clamp(prevC, fit.lo + 0.3·(fit.hi − fit.lo), fit.hi − 0.3·(fit.hi − fit.lo))   // least travel, central 40 %

segment(steps, dir):
  released = ∅ (ids "midi@endBeat" the hand has let go although the timeline still holds them)
  run = null; union = []
  for i, step:
    contacts = step.keys minus held keys whose id ∈ released, as Contacts (X = keyCentre·dir)
    cross = i > 0 ? crossingPair(steps[i−1], step) : null       // fingering's rule: struck thumb beyond a previously struck finger 2–5, or a finger 2–5 struck below the previous thumb; records reach = |ΔX|
    fit = run && !cross ? feasible(union ∪ contacts, HYST = 0.2) : null     // hysteresis: a 0.2-key overshoot may EXTEND a run
    if fit: run.i1 = i; run.{lo,hi,spread} = fit; run.C = settle(prev run C, fit); union ∪= contacts; continue
    close run
    keep = contacts; roll = []; pedal = []
    struck = keep.filter(struck)
    if struck.length ≥ 2 && !feasible(struck):                   // a chord no hand holds → roll (§4.5.6)
      groups = greedy ascending-PITCH groups, each feasible; roll = groups[0..−2]; released += ids(roll); keep −= roll
    while !(fit = feasible(keep)):                                // unreachable holds → pedal (§4.5.5), farthest from the struck centroid first
      h = held(keep) farthest from mean X of struck(keep); pedal += h; released += h.id; keep −= h
    run = { i0:i, i1:i, C: prevC == null ? fit.C : settle(prevC, fit), …fit, cross, pedal, roll }
    union = keep
  forward(run) = clamp(Σ w·black·(finger==1 ? 1.5 : 1) / Σ w, 0, 1) over the run's contacts, w = 1 struck, 0.5 held
```

Properties: O(steps × contacts × 5). Every struck key in a run is reachable from `C` within its finger's reach by construction (G1); a crossing always starts a new position (the pass *is* the position change) and the thumb (or crossing finger) may stay tucked through a sustained hold (`devFor`); a same-finger hop wider than the finger's reach width, a contact outside reach, or a chord/hold that cannot be fitted ends the run. Within a run the palm is still except for the smoothed lean (§4.2.1) and its flight lift is 0.

#### 4.2.1 In-position lean (the forearm rocks toward a reaching finger, never per note)

```
leanRaw[i] = clamp( Σ_c w_c·excess_c / Σ_c w_c , ±LEAN_MAX )     over step i's contacts (w 1 struck, 0.5 held)
             excess_c = sign(dev_c)·max(0, |dev_c| − REACH_FREE),  dev_c = c.X − (run.C + SLOT[c.finger]·spread)
lean[i]    = Σ_j k(t_j − t_i)·leanRaw[j] / Σ_j k(t_j − t_i)  over steps j of the same run,  k(Δ) = max(0, 1 − |Δ|/LEAN_SMOOTH)
lean(t)    = lean[i] + (lean[i+1] − lean[i])·ease01((t − (onset[i+1] − W)) / W),  W = max(0.15, 0.3·min(ioi[i], 1))   // eased before each onset
```
`REACH_FREE = 0.75`, `LEAN_MAX = 1.0`, `LEAN_SMOOTH = 0.4 s`. The triangular kernel makes a tremolo (IOI 0.104) or alternating octaves (0.197) rock by ≤ 0.05 key while a sixteenth at 60 bpm (IOI 0.25) still gets 80 % of its lean (S12: the thumb's F3 pulls the palm 0.8 key, §11.7). The lean never changes a pinned tip (tips are exact); it moves slots, knuckles and free fingers, and `pose.x`.

### 4.3 Travel scheduling — `planBoundary(A, B)`

For consecutive positions A (last step `last`) and B (first step `first`): `onsetA, onsetB, ioi = onsetB − onsetA`, `h = arrive(ioi) = clamp(0.12·ioi, 0.03, 0.15)`, `latest = onsetB − h`, `earliest = onsetA + DWELL_MIN`, `d = B.C − A.C`.
- `carried` = held keys of `first` still in B (not pedal-released); `pins` = keys of `last` not carried and not released to pedal/roll, with `end` in seconds (the hand is held by these until they release); `strikers` = struck keys of `first` not in a rolled lower group; `strikersFree` = no striker's finger is a pin.
- `cross` = B.cross when `reach ≤ PASS_REACH (4.5 keys)` and `ioi ≥ PASS_IOI (0.12 s)`; a wider or faster "crossing" is a leap (TRAVEL) or a thumb-over (SLIDE).

```
T(d)       = clamp(0.08 + 0.085·log2(1 + |d|), 0.12, 0.45)        // 1 key 0.165, 3: 0.25, 7: 0.335, 14: 0.41
pathEase   = ease(τ^0.85)                                           // decel share ≈ 0.55 (still C¹ with zero end velocities)

kind CROSS  (cross && pins && strikersFree && max(pin.end) ≥ onsetB):        // thumb-under / finger-over around a held finger
  [lo, hi] = ∩ pins' reach with PIN_DEV at B.spread;  Clim = clamp(B.C, lo, hi)
  require strikers reachable from Clim with OVER_DEV, else fall through to TRAVEL
  d1 = Clim − A.C;  dur1 = max(|d1|/V_CAP, min(T(d1), latest − earliest))
  phase1 = [tArrive − dur1, tArrive],  tArrive = clamp(onsetB − LEAN_EARLY_MAX, earliest + dur1, latest)
  tRel   = max(pin.end) + OVERLAP;  d2 = B.C − Clim;  dur2 = max(0.06, min(T(d2), nextDeadline − tRel))   // nextDeadline = onset of B's 2nd step − arrive
  phase2 = [tRel, tRel + dur2];  releases: pins at their written end (+ OVERLAP), nothing stolen
  crosser: hop from its current X to its key over [max(onsetB − max(stroke(ioi), hopTime(dF)), prevRelease), onsetB]

kind SLIDE  (!cross && |d| ≤ SLIDE_MAX = 2.5):                                // small shift straddling the onset
  dur = T(d);  path [onsetB − dur/2, onsetB + dur/2]                           // arriving finger ≤ 1.25 ahead of its slot, leaving one trails ≤ 1.25
  releases: written end (+ OVERLAP when end == onsetB and the finger is not needed)

kind LEAN   (!cross && pins && strikersFree && max(pin.end) ≥ onsetB && |d| > SLIDE_MAX):   // legato lean, then finish
  [lo, hi] = ∩ pins' reach with DEV widened by TRAIL_EXTRA = 0.4;  Clim = clamp(B.C, lo, hi)
  require strikers reachable from Clim with DEV and Clim ≠ A.C, else TRAVEL; phases as CROSS

kind TRAVEL (everything else, incl. crossing leaps and thumb-over at IOI < 0.12):
  pedalCase = B.pedal or B.roll non-empty and pins empty          // the hand leaves a sounding key to the pedal
  if pedalCase:  tDepart = latest − T(d) but ≥ onsetA + max(0.03, 0.35·ioi) (then compress → cap → forced as below); the released key's release = tDepart
  else:
    tFree = pins ? min(max(pin.end), onsetB) : onsetA;  free = latest − tFree
    if free ≥ T(d): dur = T(d); tArrive = clamp(onsetB − ARRIVE_EARLY_MAX, tFree + dur, latest)     // wait, move at natural speed, hover ≤ 1 s
    else deficit = T(d) − free; hold = tFree − onsetA; then in order, each taking only what remains:
      1. hover:    h ← max(ARRIVE_MIN 0.02, h − deficit)
      2. compress: dur ← max(|d|/V_QUICK, T(d) − deficit·0.5·min(1, HOLD_REF/hold))     // half the deficit on short holds, little on long holds
      3. steal:    s ← min(deficit, hold − max(0.03, (1 − STEAL_SHARE)·ioi))             // the note keeps ≥ 35 % of its IOI
      4. compress: dur ← max(|d|/V_QUICK, dur − deficit)
      5. cap:      dur ← max(|d|/V_CAP, dur − deficit)
      6. forced:   h ← 0; if still short: dur = onsetB − (tFree − s), forced = true          // arrive on the onset regardless, flagged
    tDepart = tFree − s;  tArrive = tDepart + dur;  releases: pins at min(end, tDepart) (≥ onsetA + DWELL_MIN)
  liftAmp = min(1, 0.25 + |d|/8)
```

Velocity profile: each palm segment is `C(t) = Ca + (Cb − Ca)·ease(τ^0.85)`; peak speed ≈ 1.9 × mean. `V_QUICK = 60` keys/s mean is the "brisk but natural" limit, `V_CAP = 130` keys/s mean (≈ 3 m/s, the elite extreme) the hard cap; beyond it the move is `forced` and the lint lists it separately.

**Palm path and overlapping plans — `buildPath`.** Plans are concatenated as timed waypoints. When a plan departs before the previous one has arrived (consecutive slides in a run of single-note positions, a lean cut short by the next onset), the earlier segment is **truncated at the new departure and the new segment starts with the cut velocity**: cubic Hermite from `(t0, C0, v0)` to `(t1, C1, 0)` with `v0` clamped to `[0, 2·(C1 − C0)/(t1 − t0)]` in the direction of travel (0 if it opposes it), so position and velocity are continuous (C¹) and nothing overshoots; `palm.lift` is carried continuously: `lift = lerp(L_cut, liftAmp·sin(πτ), min(1, τ/0.3))`. This is the single rule that says which plan owns `P(t)` when windows overlap; there are no zero-velocity stops at intermediate onsets.

**Palm lift (compositor only)**: `lift = liftAmp·sin(πτ)` during a TRAVEL flight with no finger down; 0 during SLIDE/LEAN/CROSS phase 1 (fingers are pinned) and inside a position; `0.2·relax` while resting.

### 4.4 Per-finger motion — `motionAt` for finger f at time t

Engagements per finger in onset order (`e` current = last with onset ≤ t, `n` next). Visual release of `e` is the minimum of: written end (+ `OVERLAP` 0.04 when the end equals the next onset of this hand and the finger is not needed); the plan's travel release; **hop**: same finger to another key at distance `dF`: `n.onset − hopTime(dF)`, `hopTime(d) = clamp(0.10 + 0.06·d, 0.12, 0.32)`, but never below `e.onset + max(DWELL_MIN, 0.35·ioi)` (then the hop is faster and flagged `forcedFinger` if its mean speed exceeds `V_FINGER` 30 keys/s); **repeat** (same key, same finger): `n.onset − REPEAT_GAP` (0.08); **swap** (same key, different finger within `SWAP_WINDOW` 0.3 s of this finger's release): `n.onset − SWAP_LEAD` (0.15), not below `e.onset + max(DWELL_MIN, 0.35·ioi)`; **pedal/roll** (§4.5.5–6).

```
palm = palmAt(t); slotX = palm.C + palm.lean + SLOT[f]·spread
stroke   = clamp(n.onset − onsetOfStepBefore(n), 0.06, 0.25)
aimStart = max(n.onset − (n.hop ? max(stroke, hopTime(|n.X − Xnow|)) : stroke), e.release)      // never before the finger is free
prepStart= max(e.release + RELEASE_S, n.onset − PREP_MAX, prevAttackOnsetOfHand, aimStartOfTravelIntoN − 0.0)   // numbers/marks/ready (fast runs: max(n.onset − 2·ioi, e.release))
τ        = (t − aimStart)/(n.onset − aimStart);  lateral = ease01(τ/0.7);  descent = ease01((τ − 0.7)/0.3)

PINNED   t < e.release:  X = e.X; lift 0; curl 0; extend 1; state down; press = 1 − 0.3·ease01((t − e.onset)/0.06)
RELEASED t ≥ e.release:  since = t − e.release
   liftOff = ease01(since/RELEASE_S);  relaxCurl = ease01((since − 0.03)/curlTime)      // curlTime = CURL_S 0.20, or CURL_SWAP 0.10 in a swap
   keepReady = n && n.onset − e.release < CURL_HOLD_IF_NEXT_WITHIN (0.30) → curl = 0.3·relaxCurl else curl = relaxCurl
   liftRel = e.swap ? 0.7 : e.staccato (written < 0.6·ioi) ? 0.8 : 0.5;   lift = liftRel·liftOff·(1 − relaxCurl) + LIFT_REST·relaxCurl
   devRelease = e.X − (palmAt(e.release).C + lean(e.release) + SLOT[f]·spread);  X = slotX + devRelease·(1 − relaxCurl)   // rides the palm
   extend = 1 − relaxCurl
AIMING   n && t ≥ aimStart:
   devNow = X − slotX;  X = slotX + devNow + (n.dev − devNow)·lateral          // palm-relative: the finger reaches its deviation, the palm brings it to the key
   peak = same key ? 0.35 : n.hop?.over ? 0.9 : palm.moving ? 0.85 : 0.6 + 0.2·clamp((0.15 − ioi)/0.1, 0, 1)
   lift = max(lift, peak)·(1 − ease(τ));  extend = max(extend, lateral);  curl = min(curl, 1 − lateral)
   state = ready (from prepStart, before aimStart with lift LIFT_REST, X unchanged);  target = { X: n.X, midi, black, alpha: ease01((t − prepStart)/0.15) }
RIDING   state ≠ down && palm.moving: lift = max(lift, 0.6·sin(π·palm.tau))
RELAXING state == up: curl += (1 − curl)·relax; lift = lift·(1 − relax) + LIFT_REST·relax
NUMBER   number = down ? 1 : ready ? alpha : (e.swap ? 0 : max(0, 1 − since/NUMBER_FADE 0.12))
THUMB    under = clamp(1 − |X − nearestX(fingers 2,3)|/0.9, 0, 1) when the thumb is on the finger side of that pad (hand space X ≥ pad X − 0.9), else 0
         tuck  = state == down ? 0 : under·(1 − descent)          // the pad is pulled toward the palm while passing; it lands on its key as the stroke ends
```
`state` flips only where geometry is already at its limit (`down` begins at the onset with `lift = 0`, `extend = 1`, `lateral = 1`; `down` ends at `release` with `liftOff = 0`), so markers never pop (D8). A finger entering `AIMING` from rest uncurls over the aim (`extend`, `curl`), so there is no REST→TRAVEL pop.

### 4.5 Gestures

1. **Thumb-under (CROSS under).** Phase 1 leans the palm to `Clim` (the pinned finger trails ≤ 1.6 keys, `PIN_DEV`) ending `LEAN_EARLY_MAX` ≥ 0.5 s before the onset when time allows, otherwise `h` before it. The thumb hops from its current X toward `n.dev` relative to the leaning palm over `max(stroke, hopTime)`; while its X is within 0.9 key of the index/middle pad it is `under` (pulled `0.5·v·tuck` toward the palm, drawn beneath the finger limbs and palm, nail and ring hidden while `under > 0.5`, the key mark on its destination carrying the numeral); it lands exactly at the onset. Phase 2 finishes the palm after the pinned finger releases (`+OVERLAP`). Slow practice: the same seconds, the hand waits leaned (§11.1).
2. **Finger-over (CROSS over).** Mirror: the thumb is pinned and ends up tucked ≤ 3.3 keys under the palm (down, exact, drawn beneath); the crossing finger hops with `lift 0.9` (shadow/scale cues, painted above the thumb), reaching up to 2.2 keys past its slot toward the thumb side (`OVER_DEV`), lands exactly; the palm finishes after the thumb releases.
3. **Thumb-over at speed** (`ioi < PASS_IOI 0.12`, or reach > 4.5): no pass — a SLIDE/TRAVEL carries the palm; the thumb abducts the rest (≤ 2.2 keys); `forcedFinger` flagged above 30 keys/s.
4. **Repeated note, same finger**: release `REPEAT_GAP` 0.08 before the re-strike, lift peak 0.35, no lateral motion, palm still; repeated chords/dyads with `ioi < 0.25` add a wrist bounce `0.05·v·sin(π·(t − onset)/ioi)` toward the fallboard on the compositor (`palm.lift` channel, no repaint).
5. **Repeated key, alternating fingers (swap)**: the old finger releases `SWAP_LEAD` 0.15 s before the new onset (≥ 35 % of its IOI held), lifts to 0.7, curls over `CURL_SWAP` 0.10 so it is back at its slot (≥ 0.9 key away, ≥ 0.35 v behind the key) when the new pad lands; its ring vanishes at release; the new finger aims normally. Two pads never share a key point and only one ring is on the key.
6. **Unreachable held note → pedal**: when a new position cannot fit a held key with what is struck (§4.2), the hold is released at the hand's departure for that position, which is as late as the natural move allows (`TRAVEL pedalCase`: `latest − T(d)`), never under `max(0.03, 0.35·ioi)` after it was struck; S07's bass is held 507 ms of a 1-s gap (§11.5). The key keeps its written glow; `pose.pedal` lists `{midi, kind}` until the written end, `kind = "pedal"` if `pedalAt(pedals, beat)` is down, else `"free"` (a plain "let go" ring).
7. **Struck chord wider than a hand → roll, bass group on the beat**: `rollGroups` splits the struck set into feasible groups in ascending pitch; the hand arrives over the **lowest** group's frame (a normal plan targets that frame), that group is exact on the beat, and each later group lands `ROLL_STEP(dg) = clamp(dg/100, 0.04, 0.08)` after the previous one (`dg` = palm distance between group frames), the palm sweeping between group frames as mini-slides; a lower group is released when the next lands (≥ 40 ms) and shows a pedal/free ring; the position's frame is the top group. The hand never presses a key before it lights; the top note lags the key light by ≤ 160 ms for a three-group roll (S06 §11.4), and `marks` carry `kind: "roll"` on the rolled keys from the chord's prep time so the learner reads "these too, rolled".
8. **Fast-run mode (`ioi < 0.15`)**: `stroke = ioi` (ring one note ahead), peak lift 0.8, `settle` hover 0.03, released fingers curl only 30 % (`CURL_HOLD_IF_NEXT_WITHIN`), numbers as a two-note trail (`prepStart = max(n.onset − 2·ioi, release)`), footprints on the hand canvas only for the first note of a position (key marks still per note), palm still inside the position, slides between neighbouring positions straddle the onset.
9. **Octave frame / bounce**: a run with spread 1.3 keeps its fan while any contact sounds or the next attack is < 0.3 s away; `fan(t) = 1 + (fanRun − 1)·open`, `open = 1 − ease01((t − lastRelease)/CURL_S)` otherwise, so a released octave relaxes in 0.2 s; repeated octaves bounce (item 4) with fingers 2–4 curled above the keys.
10. **Black-key forward shift**: per position, `knuckleY −= 0.9·v·forward` (D §1.6: 0.8–1.2 keys), interpolated along the palm path between positions; the thumb plays `min(0.45·u, 0.2·keysHeight)` nearer the player on white keys and 0.3× that on black; white contacts never move (test 21). No per-step forward: a tremolo mixing colours sits at its weighted share (S04: 0.3) with no bob.

### 4.6 Rest and wake (seconds)

```
idle = t − max(end of the current step's keys);  toNext = onset[next] − t
relax = idle ≥ 0 ? ease01((idle − REST_IDLE)/REST_RAMP)·ease01((toNext − REST_NEXT)/REST_RAMP) : 0      // REST_IDLE 1.0, REST_NEXT 1.5, RAMP 0.8
before the first step: relax = counting ? 0 : ease01((toNext − 3.0)/REST_RAMP)
rest = relax > 0.5                                                                                     // CSS class; one crossing up, one down per gap
```
Dims at ≈ 1.4 s idle when ≥ 1.9 s remain; wakes 1.9 s before the next onset (CSS fade 320 ms ends before any cue appears, since cues begin ≤ 1.0 s before). A 2.57-s rest never dims (second factor 0); a resting hand curls fully, `palm.lift 0.2·relax`, nails/creases dim by `relax` (in the signature). Dimming never hides a cue: no mark or ring of this hand can be due while `rest` is true, by construction of `REST_NEXT + RAMP/2 > PREP_MAX`.

### 4.7 Two hands — `handPoses`

```
gap   = nearest slots: |xL_side − xR_side| with side = palm x ± (1.35·spread + 0.6)         (keys)
crowd = clamp(1 − gap/1.5, 0, 1)
fold:  both hands' free fingers curl = max(curl, crowd); the under hand's palm.lift ≤ 0.1 while crowd > 0.5; the top hand's knuckleY −= 0.3·v·crowd
overlapInterval: from both models (pure, memoised): for each pair of position occupancy intervals where half_L + half_R + 0.2 > |C_R − C_L|
                 (half = 1.35·spread + 0.6 + 0.3), top = the hand whose position started later (moved into the overlap);
                 ties → larger travel into it, then right
zTop(t): if exactly one hand is in flight with palm.lift ≥ 0.5 → that hand;
         else if t inside an overlap interval → its top;  else → right (default; invisible, nothing overlaps)
```
`crowd` is continuous; `zTop` changes only during a flight (lift ≥ 0.5, the hand is visibly airborne) or when the opaque regions do not overlap — never while two still hands overlap. The top hand gets `--hand-lift` shadow strength `+crowd`.

### 4.8 Count-in and frozen clock

- **Count-in / before the first step** (`now < steps[0].beat`, clock running): palm at position 0 (`C`, spread, forward), free fingers curled at slots; strikers `ready` from `prepStart = onset − PREP_MAX`, stroke per §4.4; `relax` only if `!counting` and the first onset is > 3.8 s away.
- **Frozen, listen-mode pause** (`frozen && !waiting`): the plain pose at the standing clock — sounding fingers stay down (no pop on pause or resume). Preparation is pulled forward only through `settle.since`: fingers whose next onset is within `PREP_MAX + 1 s` show `ready` with marks fading in over 0.3 s of `settle.since` (markers only; no geometry moves). `settle = null` → the plain frame.
- **Wait mode** (`waiting`, `now` = onset of chord k): evaluate `motionAt(onset_k − ε)` with the palm forced to chord k's position (C + lean, forward, no mid-flight) and the strikers' descent suppressed: `lift = max(lift, HOVER_WAIT 0.3·ease01(lateral))`, `target.alpha = 1`, carried holds down, `relax = 0`. With `settle.since` (host jump timestamp): replay at natural speed, `tS = min(onset_k − ε, replayStart + since)`, `replayStart = max(onset_{k−1}, prepStart_k − 0.1, onset_k − 1.5)` (idle time is skipped, nothing is compressed), then hold; breathing `0.03·v·sin(2π·since/1.5)` on the compositor. Seek == play holds for equal inputs (`since` is an input). Without `settle` the static ready pose is shown.

### 4.9 Reduced motion

`static` per step: palm at the step's position `C + lean[i]` (no ease), forward of the position, fan of the position (no relax), strikers and carried holds down and exact, pedal/roll-released keys up, free fingers at slots fully curled, `lift = tuck = press = 0`, `landing = null`, `glide = 0`, `number` 1 for down fingers; `rest` as computed (CSS transitions are already disabled); key marks are still written (static cue). The geometry is identical for every `now` within a step (test 12).

---

## 5. Pose geometry and the drawer

### 5.1 Construction (per frame, from the motion)

```
u, v = min(u, 0.3·h), w = 0.84·u, h = keysHeight;  yWhite = 0.68·h, yBlack = 0.53·h
thumbDepth(black) = min(0.45·u, 0.2·h) · (black ? 0.3 : 1)                    // pad nearer the player (D §1.7); black ≤ 0.59 h, on the surface
keyY(f, black)    = (black ? yBlack : yWhite) + (f == 1 ? thumbDepth(black) : 0)
fan      = 1 + 0.55·(spread − 1) (≤ 1.22), with the octave relax of §4.5.9
centre   = (palm.C + palm.lean)·dir·u                                              // pose.x (compositor)
knuckleY = clamp(yWhite + REACH[3]·v − 0.9·v·forward − 0.3·v·clamp((spread − 1.2)/0.2, 0, 1)·0 /*see FLATTEN*/ + 0.4·v·(fan − 1) − 0.15·v·relax − 0.3·v·crowd·(zTop ? 1 : 0),
                 0.69·h, max(0.69·h, bedHeight − 0.65·v))
FLATTEN  = 0.3·v·clamp((spread − 1.2)/0.2, 0, 1)   → subtracted from knuckleY (the row moves toward the keys on wide spans so the thumb chord shortens)
palmDepth = 1.78·v;  wrist = (0.1·u·roll·dir, knuckleY + palmDepth + 0.12·v)
knuckle_f (2..5) = ( dir·ROOT[f]·w·fan + follow_f ,  knuckleY + ARCH[f]·0.84·v + 0.06·v·roll·ROOT[f]/1.55 )
   follow_f = clamp(0.6·devEff_f·dir·u, ±0.9·u)·extend_f,  devEff = X − slotX (slot includes the lean)
tip_f: down → ( keyCentre(midi)·u − centre, keyY )                                   // exact, nothing downstream touches it
       else → lerp(rest_f, play_f, extend·(1 − curl)) + (0, −0.2·v·lift + 0.5·v·tuck)   // raise = retreat toward the knuckle; tuck = toward the palm
   rest_f = (knuckle_f.x + dir·HANG[f]·w, knuckle_f.y − REACH[f]·v·REST_REACH[f] (+ neighbourCurl for f = 5)),  play_f = (X_f·dir·u − centre, keyY(f, black))
free-pad clearance (kept): a free pad within gap of a gripped neighbour is pushed toward the palm (never moves a down tip); order repair pushes free pads outward to keep ≥ 0.55·u between adjacent pads
thumb chain: CMC = (−dir·(1.1·w + slide), knuckleY + 0.55·palmDepth), slide = clamp((chord − (L1e + L2e)), 0, CMC_SLIDE_MAX(spread)) along x toward the tip
   L1e = 1.7·u·(1 − 0.5·under), L2e = 1.6·u·(1 − 0.3·under)                            // the metacarpal foreshortens as the thumb goes under
   MCP by two-link IK, elbow on the side away from the palm; if chord > L1e + L2e the chain is straight (lint flags ratio > 1.10)
   axis = [CMC, MCP, tip] (3 points, as today);  CMC_SLIDE_MAX = 0.5·u + 0.4·u·clamp((spread − 1.3)/0.1, 0, 1)
fingers 2–5: pip/dip as today with curl = finger.curl, pip.y −= 0.08·v·lift
back[16]  = as today from the knuckles, fan, palmDepth and the wrist point
ratio_f   = |tip − knuckle| / (REACH[f]·v) for 2–5; |tip − MCP| / (1.6·u) for the thumb   (lint G1)
```
`roll ∈ [−1, 1]` = mean over down fingers of `(finger − 3)/2` eased over `min(0.12, 0.5·ioi)` — shading and a 0.06 v knuckle tilt only.

### 5.2 Drawer contract (fields `drawHand` reads) and the signature rule

| field | status | contents |
|---|---|---|
| `unit, dir, keysHeight, x, rest, signature, beat, glide, reducedMotion, verticalUnit, span, fan, palmDepth, knuckleY, knuckles[4], back[16], wrist{x,y}` | kept (+`wrist`) | `x` compositor; `glide = max(palm τ while moving, max finger prep progress)`; the drawer now uses `knuckles/back/wrist` for the palm |
| `fingers[5]` in order 1..5: `finger, axis[] (thumb 3: CMC, MCP, tip; others 4), widths[] (tapering), state ∈ down/ready/up, landing {x, y, midi, alpha}|null` | kept + `alpha` | `axis.at(-1)` exact for down fingers |
| `fingers[i].lift, press, number, under` (0–1) | new | lift cues, press pulse, ring alpha, thumb occlusion |
| `palm { lift, roll, forward, relax, crowd }` | new | `lift` compositor only; others painted |
| `zTop, forced, forcedFinger, position{index,C,spread}, marks[], pedal[], seconds` | new | compositor / key elements / probe |

**Signature** = per finger `axis points @0.5 px | state | landing @0.5 px + round(alpha·10) | round(lift·20) | round(press·10) | round(number·10) | round(under·20)`, then `r(knuckleY) | r(wrist.y) | round(fan·100) | round(roll·20) | round(relax·20) | r(u) | rest`. Not in the signature: `x`, `palm.lift`, `zTop`, `marks`, `pedal`, `glide`, `beat`, `seconds`, `crowd` (its effects are already in tips/knuckleY). Rule: everything the drawer reads is in the signature and nothing else is; the mock-ctx test (§9) enforces it. Repaints happen only when a finger's quantised lift/number/under or a tip bucket changes: none while a position holds, ≤ 20 per stroke, ≤ 20 per flight.

### 5.3 Drawing changes in `src/hand-draw.mjs`

1. **Palm from the pose**: palm loop through `pose.knuckles` and `pose.back`, ending at `pose.wrist`; delete the tip-derived `cx/half/top/wrist`, `thumbPull/thumbReach/pinkyReach`. Finger limbs start at `pose.knuckles[f−2]` (fixes D9/D10; palm half-width 1.56–1.84 u, within ×1.25).
2. **Thumb as two links** from `axis = [CMC, MCP, tip]`: metacarpal limb CMC→MCP (mostly under the palm fill), phalanx limb MCP→tip with `limbPath` widths `[0.78u·(1 − 0.15·under), 0.5u]`.
3. **Per-shape stroke + fill, back to front**: thumb → fingers 5, 4, 3, 2 → palm; each path stroked then immediately filled. A tucked thumb is covered by the finger fills and the palm fill, a finger-over is painted above the thumb, and no outline is ever stroked across another fill (the D4 blob is gone). No clip is needed for the thumb.
4. **Lift cues**: before each finger with `lift > 0`, a pad shadow ellipse at `(tip.x + 1.5·lift, tip.y + 2 + 4·lift)` px, radii `(0.22u, 0.09u)·(1 + 0.3·lift)`, `rgba(0,0,0, 0.22·lift)`; pad/nail scale `1 + 0.05·lift`; nail alpha `0.75 + 0.25·lift`; the 0.2 v foreshortening is in the pose.
5. **Thumb occlusion cue**: while `under > 0.5` skip the thumb's nail and ring; paint a faint crease `rgba(150,94,70,0.18)` across the palm at the thumb's projected x (the thumb showing through), width `0.5·w`.
6. **Markers**: "down" ellipse radius × `(1 + 0.15·press)` and blush × press for the first 60 ms; "ready" dotted footprint alpha `0.84·landing.alpha`; ring alpha = `number` (filled ink when down, cream when ready); at most one upcoming ring per hand (two in fast runs) by construction of `prepStart`.
7. **Roll shading**: skin gradient rotated `roll·12°` about the palm centre, radial glow shifted `−roll·0.25·half`; knuckle dimples follow the tilted knuckle points. **Relax** dims nails and creases × `(1 − 0.5·relax)`.
8. **Two-hand layering**: no painter change; `paintHand` sets `zIndex` and `--hand-lift`.
9. **Cost**: cache the two gradients per canvas size; the palm is no longer rebuilt from tips; ≈ 100 ctx calls per paint as today, paints gated by the signature.

---

## 6. Guards and lint

### 6.1 Per-frame invariants (every frame, each hand) and enforcement

| # | invariant | bound | enforcement |
|---|---|---|---|
| G1 finger length | fingers 2–5: `ratio ∈ [0.55, 1.30]`; thumb MCP→tip `∈ [0.55, 1.10]` of `1.6u` | always | reach tables + 60 % follow → ratio ≤ 1.27 at the widest allowed deviation (2.2 + trail); `feasible()` refuses anything else; free fingers at `REST_REACH` 0.60–0.65; thumb IK with fixed links and CMC slide |
| G2 palm width | knuckle row / rest ≤ 1.22; drawn palm half ≤ 1.87u | always | `fan = 1 + 0.55(spread − 1)`, spread ≤ 1.4 |
| G3 finger order | hand-space pad x of 2 < 3 < 4 < 5 with margin ≥ 0.2u; the thumb inside the 2–5 span only while `under > 0` (drawn beneath) or pinned-crossed | always | ordered slots, fingering never crosses 2–5, aims interpolate deviations, free pads only tuck in y |
| G4 speed | palm mean ≤ 130 keys/s unless `forced`; finger-relative ≤ 30 keys/s unless `forcedFinger`; palm ≤ 60 mean unless the move stole or capped | planner | §4.3 stages; the lint counts forced frames separately |
| G5 contact exactness | down tip = `(keyCentre·u − x, keyY)` to 1e-6; `state == down ⇔ onset ≤ t < release` | always | pinned branch writes the tip; tuck/lift/crowd/forward/lean never touch a down tip |
| G6 pad clearance | any two pads of one hand ≥ `(w_i + w_j)/2 + 0.05u` apart, except a thumb with `under > 0` or during a swap window where the old pad is ≥ 0.35 v behind the key | always | free-pad clearance + order repair; swap rule (§4.5.5); thumb tuck |
| G7 two hands | when palm boxes overlap exactly one `zTop`; `zTop` changes only with lift ≥ 0.5 or when boxes do not overlap; pads of different hands ≥ 0.5u apart unless the hands are crossed | always | interval resolver §4.7 |
| G8 continuity | per frame `|Δtip| ≤ (v_allowed·dt + 0.5 px)` with v_allowed = 130 keys/s (palm) + 30 (finger) unless forced; no `state` flip with a tip jump > 0.35 px between adjacent 1-ms samples | always | eased channels, C¹ truncation, state flips at limit values |
| G9 feasible down set | the set of down contacts passes `feasible()` | always | positions are unions; pedal/roll release |
| G10 reduced motion | axis points identical from onset to next onset − 1 ms; `glide 0`, `landing null` | reducedMotion | §4.9 |
| G11 determinism | `pose(t)` identical after any seek sequence; equal inputs ⇒ equal signature | always | pure functions, memos keyed by inputs |
| G12 signature purity | equal signatures ⇒ identical draw calls | always | §5.2 rule, mock-ctx test |
| G13 never late | every struck key is down and exact at its onset | always | plans arrive ≤ onset (forced if needed) |
| G14 bed independence | `back`, `fingers` equal for bedHeight 235 vs 350 | always | knuckleY clamp only |
| G15 perf | `handPoses` ≤ 40 µs per frame for both hands; model build ≤ 10 ms per 3000 steps; 0 repaints while holding, ≤ 50 % of frames during a scale | measured | memoised model, binary searches, signature buckets |

### 6.2 Lab lint spec — `scripts/hand-lab-lint.mjs`

Runs `handPoses` over `scenarios/S01–S12.json` and `scale-c-major.json` (with `tempos`/`pedals` carried, fingering per hand), both hands, at `dt = 1/120 s` from 1 s before the first onset to 0.5 s after the last, at speeds 1.0 and 0.5, and (for S01, S07, S12) also `frozen`/`waiting` frames at every onset. Per frame it evaluates G1–G9, G13 and the continuity bound G8 (using `Δt` in seconds); it prints violations per guard with the first offending frame and separates **model** violations (must be zero) from **forced** frames (`pose.forced || pose.forcedFinger`; listed with the demanded speed and the passage). It also reports repaint fraction (distinct signatures / frames) and the number of position changes per second per hand.

The same checks apply to a `scripts/hand-lab-capture.mjs --json poses.json` dump taken with `--dt` equal to one 120-fps frame in beats (`dt_beats = bpm·speed/7200`): each `poses[k].{left,right}` must satisfy G1–G3, G5–G7, G9 frame-locally, consecutive frames must satisfy G8 with `Δt = 60/(bpm·speed)·dt_beats`, and across the whole dump the set of `forced` frames must equal the lint's. `node --test tests/hand-pose.test.mjs` runs the lint as test T20 (§9) over the eight committed fixtures.

---

## 7. Learner cues timeline

For an attack at real time `T0` (gap permitting), nested so each inner cue confirms the outer one:

| when | cue | source |
|---|---|---|
| `ahead` beats before (1.5–8, runway-dependent) | key `--soon` glow ramps (unchanged) | key loop |
| ≤ 1.9 s before | a resting hand un-dims (`relax` falls); fingers uncurl | `rest` |
| `prepStart = max(prevRelease + 0.08, T0 − 1.0 s, previous attack of this hand)` (fast runs: `T0 − 2·IOI`), never before the glow has started | key mark `data-land` with the finger numeral on the destination key (far field, strength ramps 150 ms); outline ring on the finger; canvas footprint fades in (`landing.alpha`), clamped to the key's glow: `alpha ≤ 1 − (step.beat − nowBeat)/ahead` | pose `marks`, `state ready` |
| `tDepart … tArrive` (≤ 1.0 s before for a free hand; as late as natural for a pedal release) | the hand lifts (shadow softens, scale 1.03), flies at natural speed; footprint stays; `zTop` while airborne | palm path |
| `tArrive … T0 − stroke` | hover ready over the keys, finger extended, pad shadow visible (the standing picture in wait mode) | hover |
| `T0 − 0.3·stroke … T0` (18–75 ms) | the finger descends (lateral aim done at 70 % of the stroke) | §4.4 |
| 0.125 beat before (unchanged) | coach strip "Play"; while holding, "Hold … · Next …" chips when the next attack is within 1 s | HandCoach |
| `T0` | filled ring, press pulse, blush; key `on` glow and hold meter; land splash suppressed while hands are shown | painter / CSS |
| release | ring fades 120 ms (vanishes at once in a swap); finger lifts 80 ms, curls 200 ms; `--hold` drains | pose |
| pedal / roll release | hollow ring on the key until the written end (`P` dot if the pedal is down) | `pose.pedal` → `data-pedal` |
| ≈ 1.4 s idle with ≥ 1.9 s to go | hand dims to 0.35, curls, lifts 0.2 | `rest` |

Coordination rules: one upcoming number per hand (chords share the earliest `prepStart`; two in fast runs); the hand's lead is seconds, the glow's is beats — the footprint clamp ties them so a footprint never appears on a key that is not yet glowing; wait mode shows chord k hovering with numbers and marks while `data-then` outlines chord k+1 (the mark says which finger, the ring says which key); dimming cannot coincide with a due cue (§4.6); `rest` is never set while `counting`.

---

## 8. Parameter sheet

| constant | value | unit | source |
|---|---|---|---|
| `SLOT` | −2.40, −1.35, −0.45, +0.45, +1.35 (× spread) | keys | five-finger position, A's ROOT/HANG, D §1.2 breadth |
| `DEV` | 1 [−2.2,+1.4] · 2 ±0.8 · 3 [−0.8,+0.9] · 4 [−0.8,+1.0] · 5 [−0.8,+1.5] | keys | Parncutt comfortable spans (fingering PAIRS), D §1.9 |
| `PIN_DEV` | thumb [−2.2,+3.3]; 2–4 toward thumb −1.6; 5 unchanged | keys | D §1.7 thumb-under 3–4 keys; trail estimate |
| `OVER_DEV` | 2–4 toward thumb −2.2 | keys | finger-over by ≤ 2 keys + slot gap (S01 F♯3) |
| `TRAIL_EXTRA` | 0.4 | keys | pinned finger trails ≤ 1.2–1.4 in a LEAN |
| `SPREADS`, `fan` | 1…1.4; `1 + 0.55(s−1)` ≤ 1.22 | — | D §3.2 (≤ 1.25); test 15 (octave fan ∈ (1.15, 1.18]) |
| `HYST` | 0.2 | keys | biomechanics §9.1 (extend, never start) |
| `FLATTEN` | 0.3·v·clamp((spread−1.2)/0.2) | px | invariants (ninth = flat hand) |
| `REACH_FREE`, `LEAN_MAX`, `LEAN_SMOOTH` | 0.75, 1.0, 0.4 (triangular kernel) | keys, keys, s | architecture lean; anti-rock estimate |
| `T(d)` | clamp(0.08 + 0.085·log2(1+d), 0.12, 0.45) | s | D §2.2 (Fitts-like) |
| path ease | `ease(τ^0.85)` | — | D §2.2 decel share 0.55 |
| `V_QUICK`, `V_CAP`, `V_FINGER` | 60, 130, 30 | keys/s mean | estimate; D §2.2 elite 2.2–3 m/s; finger abduction estimate |
| `arrive(ioi)`, `ARRIVE_MIN`, `ARRIVE_EARLY_MAX` | clamp(0.12·ioi, 0.03, 0.15); 0.02; 1.0 | s | D §2.1 halved (bass holds), D §4 preview ≤ 1 s |
| `LEAN_EARLY_MAX` | 0.5 | s | Engel 1997 anticipation |
| `stroke(ioi)` | clamp(ioi, 0.06, 0.25); lateral share 0.7 | s | Dalla Bella & Palmer (≈ 1 IOI) |
| `hopTime(d)` | clamp(0.10 + 0.06·d, 0.12, 0.32) | s | D §1.7 thumb pass 150–300 ms; test 18 bound |
| `STEAL_SHARE`, `HOLD_REF`, `DWELL_MIN` | 0.65; 0.5; 0.02 | —, s, s | Bresin & Battel (staccato 25–75 %); estimates |
| `SLIDE_MAX`, `PASS_REACH`, `PASS_IOI` | 2.5 keys; 4.5 keys (7 semitones); 0.12 s | | E finding 3; D §1.7 thumb-over < 120 ms |
| `OVERLAP`, `RELEASE_S`, `CURL_S`, `CURL_SWAP`, `CURL_HOLD_IF_NEXT_WITHIN` | 0.04; 0.08; 0.20; 0.10; 0.30 | s | D §2.4–2.6 |
| `REPEAT_GAP`, `SWAP_LEAD`, `SWAP_WINDOW` | 0.08; 0.15; 0.30 | s | D §2.4 key return; exchange clearance |
| `ROLL_STEP(d)` | clamp(d/100, 0.04, 0.08) | s | estimate; hand ≤ 100 keys/s in a roll |
| `PEDAL` release | latest natural departure, ≥ max(0.03, 0.35·ioi) after the strike | s | pedagogy 40 %, judge 1 |
| `LIFT` rest/release/staccato/normal/repeat/leap/fast/swap/over | 0.15 / 0.5 / 0.8 / 0.6 / 0.35 / 0.85 / +0.2 / 0.7 / 0.9 | fraction of 60 mm | D §2.3 |
| lift rendering | tip −0.2 v; shadow 2 + 4·lift px at 0.22·lift; pad scale 1 + 0.05·lift | | D §3.7 |
| thumb `under`/`tuck` | `under = clamp(1 − dist/0.9)`; tip +0.5 v·tuck; nail/ring hidden > 0.5 | | D §3.3 |
| thumb depth | min(0.45u, 0.2h) white; ×0.3 black | px | D §1.7 (0.6–1 key); key lip at h 128 |
| contact depths | yWhite 0.68h, yBlack 0.53h | px | unchanged (INVARIANT tests) |
| knuckle follow | 0.6·dev, cap ±0.9u | px | G1 |
| thumb links | L1 1.7u, L2 1.6u (×(1 − 0.5·under), ×(1 − 0.3·under)); CMC (−1.1w, knuckleY + 0.55·palmDepth); slide ≤ 0.5u (+0.4u at spread 1.4) | px | D §1.2 (2.1 + 1.9 keys), projection |
| forward | weighted black share (thumb 1.5); row −0.9 v·forward | — | D §1.6 (0.8–1.2 keys) |
| `REST_IDLE`, `REST_NEXT`, `REST_RAMP`, count-in dim | 1.0; 1.5; 0.8; 3.0 (never while counting) | s | D §5 restAfterIdle 1.5–2 |
| `PREP_MAX`, `NUMBER_FADE` | 1.0; 0.12 | s | D §4 previewLead; pedagogy |
| two hands | crowd clamp(1 − gap/1.5); top raise 0.3 v; under lift ≤ 0.1; half = 1.35·spread + 0.9 | keys | D §3.5 |
| wait | `HOVER_WAIT` 0.3; replay window ≤ 1.5 s before the chord, natural speed; breathe 0.03 v / 1.5 s | | D §3.10 |
| signature quantisation | 0.5 px; lift/under/relax/roll 0.05; press/number/alpha 0.1; fan 0.01 | | B §4 |
| geometry kept | SPAN 0.84, REACH, REST_REACH, ARCH, ROOT, WIDTH, HANG, palmDepth 1.78 v, knuckle clamp, `v = min(u, 0.3h)` | | A §7 |

---

## 9. Test plan (`tests/hand-pose.test.mjs`, same helpers; default clock 0.5 s/beat so beat fixtures keep their meaning)

**Kept unchanged — the 13 INVARIANT tests**: 1 timeline holds; 2 unison schema; 3 re-attack replaces; 6 held key stays down while others move (`glide > 0` at beat 0.8 is the ring finger's approach progress — aim starts at 0.25 s for a 0.5-s IOI); 9 continuity ≤ 0.35 px per 0.001 beat (an in-position aim moves ≤ 0.05 px per sample; no palm move in these fixtures); 10 held tip anchored; 11 retiring finger lifts (`handMotion().fingers[].lift > 0` during release/curl); 12 reduced motion static; 18 idle continuity ≤ 0.75 px (the 3-key thumb hop in fixture 2 is a CROSS: hopTime 0.28 s → peak 20 keys/s → 0.68 px at u = 68 incl. the tuck's vertical component); 21 held white contact exact with black neighbours; 22 black contacts on the surface (thumb black depth ≤ 0.06h keeps `tip.y < 0.6h`); 24 bed independence; 26 contour continuity. Also kept: 4 (`handShape` stays exported as a legacy single-step helper, unused by the pose path, removed after step 5), 16, 27.

**Rewritten CHOICE tests** (name → new assertion):
- 5 *holds its shape then glides* → **"a hand waits, then travels in seconds and hovers ready"**: C4(1)→G4(1) 1 beat at 0.5 s/beat is a 4-key TRAVEL with the thumb pinned to its end: `at(0.3).down` true; thumb released at 0.433 s (steal 0.067 after hover/compress), `at(0.9)` gliding with `down false, lift > 0, ready`, exact on G at beat 1, `up` at 2.5; `at(−1)` waiting over C ready; `rest` true at beat 5 (2.5 s: idle 1.5 s ⇒ relax 0.68), false at 1.2.
- 7 drawn hand → keep contacts/thumb side/states/determinism; replace "knuckle y > tip y" with G1 ratios ∈ [0.55, 1.30] and "resting finger within 0.3·u of its slot".
- 8 leap sooner than a step → **"travel starts as late as natural speed allows and the same leap takes the same seconds at 60 and 120 bpm"**: 14-key leap with 8 beats free: `glide 0` at `T_B − 1.5 s`, `> 0` at `T_B − 1.2 s` (arrive 1.0 s early after 0.41 s); one-key step: `0` at `T_B − 0.5`, `> 0` at `T_B − 0.2` (stroke 0.25); identical departure-to-arrival seconds under `clock` 1.0 and 0.5 s/beat.
- 13/16/23/25/27 → kept assertions on joint counts, taper, finiteness, mirror; 23's thumb distal band becomes `|tip − MCP| ∈ (0.9, 1.7)·u` and "MCP on the side away from the palm"; 25 unchanged (pip from the chain bends > 15°).
- 14 footprint → `state ready` at beats 1.4/1.6/1.85 (prep from 0.58 s), `landing.midi/x` fixed, `alpha` monotone 0→1; depth re-pinned to `225·0.68 + min(0.45·44, 0.2·225)` in the thumb-depth commit (step 4), until then `+44·0.16` stays.
- 15 octave fan → `fan ∈ (1.15, 1.18]` holds (1.165) with contacts exact; adds "fan relaxes to 1 within 0.2 s of release".
- 17/19 idle arrangement → slot-based rest (`tip within 0.25·u of slot`), `fan === 1` single note, `state up`.
- 20 released octave → `fan === 1` at 0.2 s after release, no stale landing, little finger settles.
- 28 zoom → unchanged except depth constants re-pinned in step 4.

**New tests** (name → property):
1. `time is seconds: the same move lasts the same at 60, 120 and 180 bpm` — 7-key leap: `tArrive − tDepart = T(7) = 0.335 s` under three clocks; at 0.5 speed the hand waits twice as long.
2. `a sounding finger stays on its key until its written end inside a position` — scale C D E (1 2 3): finger 2 down through 0.5999 s; releases only by a named rule (`releaseKind` ≠ "travel" when free time suffices).
3. `a thumb-under leans the palm under the held finger, tucks the thumb and finishes after the release` — scale RH 100 bpm: at 0.822 s palm 27.55 ± 0.05; E4 exact until 0.9; thumb `under > 0.5` in (0.70, 0.82), ring hidden; thumb exact on F4 from 0.9; palm 28.45 at 1.10.
4. `a finger-over lifts above a tucked thumb` — F5(1)→E5(3): finger 3 `lift ≥ 0.8` mid-hop, thumb down and `under > 0` at 5.65 s, pads ≥ 0.45u apart.
5. `a position does not move for arpeggios, tremolos or substitutions` — C E G C 1 2 3 5: `pose.x` constant; S04-like octave/dyad alternation with 1/2/3 on one key: `pose.x` varies ≤ 0.05·u, `knuckleY` constant.
6. `small shifts straddle the onset without cutting the previous note` — 16 notes at 83 ms spanning 1.5 octaves: no `steal`, palm speed ≤ 25 keys/s, every release ≥ written end.
7. `an unreachable hold is released to the pedal as late as the move allows` — S07 fixture: bass down until 0.507 s, `pose.pedal` lists D2 (kind "free") until 3.0, chord exact at 1.0 after a 120 ms hover.
8. `a chord wider than a hand rolls bass-first on the beat` — A1 A2 F♯3 (5 3 1): A1 exact at T0, A2+F♯3 at T0 + 0.058, A1 released at T0 + 0.058 with a pedal ring, `marks` kind "roll".
9. `the deficit is paid in order: hover, compress, steal, cap, forced` — table over gaps 0.1–1.0 s and distances 1–16 keys: monotone in gap and distance; `forced` only when `d/130 + 0.03 > ioi·0.65`.
10. `repeated keys: same finger lifts 80 ms before; alternating fingers swap with a 150 ms lead and never share the key` — pads ≥ 0.5u apart or ≥ 0.35 v separated at every 1-ms sample; exactly one ring on the key.
11. `rests relax, dim and wake in seconds` — 13-s rest: `rest` true from idle 1.4 s, false 1.9 s before the entry; palm departs 1.3 s before, hovers 1.0 s; a 2.57-s rest never dims.
12. `before the first note the hand is placed and never dims while counting; numbers light 1 s ahead`.
13. `wait mode shows strikers hovering ready, not down; a listen pause keeps sounding fingers down` — `waiting` at a chord onset vs `frozen` mid-note.
14. `wait-mode replay is natural speed and deterministic` — equal `settle.since` ⇒ equal signatures; `since` 0→1.5 s moves monotonically from the previous chord to the ready pose at the plan's own speeds.
15. `two hands fold, raise and layer; z-order never flips while two still hands overlap` — S09 and S10 fixtures.
16. `black keys move the knuckle row forward per position without moving white contacts`.
17. `finger lengths and palm width stay anatomical through every fixture` (G1, G2 at 1-ms samples).
18. `signature is a pure function of what the drawer reads` — mock ctx: equal signatures ⇒ identical call logs; each new field perturbed changes the signature.
19. `C¹ truncation: overlapping plans keep palm velocity continuous` — S11-like chain: per-2-ms velocity jump ≤ 5 keys/s.
20. `every frame of the stress fixtures passes the guards` — imports `scripts/hand-lab-lint.mjs` over `tests/fixtures/hand-motion/{scale,S01,S04,S06,S07,S09,S11,S12}.json` at 120 fps, speeds 1.0/0.5: zero model violations; forced frames listed and counted (S04 drop, S09 return, S11 LH cap at 1.0; none at 0.5 except S04's drop at 75 keys/s which is under the cap).
21. `handPoses equals handPose per hand and seeks reproduce signatures with `other` supplied`.
22. `count-in rate: negative beats use countInSecondsPerBeat`.

---

## 10. Implementation plan (each step ships with `node --test` green)

1. **Clock and plumbing, no visible change.** `src/tempo.mjs` `clockMap`; `src/App.jsx` `speed`/`countInSecondsPerBeat` props; `src/KeyboardGuide.jsx` accepts them, builds the clock map, tracks `frozenSince`, passes `clock/frozen/waiting/counting/settle/ahead/pedals` (ignored by the old model); `scripts/hand-lab.html` per-hand fingering + clock; `scripts/hand-lab-passage.mjs` carries `tempos`/`pedals`; `tests/fixtures/hand-motion/*.json` cut from the library (≤ 60 notes each). Verify: 28/28, lab filmstrips identical to today. Viewer gains: nothing yet (safe).
2. **Model core behind the old drawer contract.** `src/hand-pose.mjs`: `times`, `segment` (+ lean, forward), `planBoundary`, `buildPath` (C¹), engagements and release rules, `motionAt`, `handModel` memo, `handPoses` facade, rest/relax, wait/frozen/count/reduced branches; geometry assembled into today's pose fields (`axis` thumb `[root, joint, tip]` computed as today from the new tip; palm fields present), `lift/press/number/under` added and signed; `pose.marks/pedal/zTop/forced`. `KeyboardGuide`: `handPoses` call, z-index, `--hand-lift`, key marks and pedal rings, `with-hands` class. Tests: INVARIANT 13 unchanged; CHOICE 5, 7, 8, 17, 19, 20 rewritten; new 1–17, 19–22. Verify with the lab (S01, S04, S06, S07, S09, S11, S12, scale at 100 % and 50 %) and `hand-lab-lint`. Viewer gains: real-time motion, positions, passes, holds to the end, pedal/roll honesty, two-hand z-order and folding, far-field key marks, wait-mode ready pose.
3. **Drawer.** `src/hand-draw.mjs` §5.3 items 1–9; thumb `axis` becomes `[CMC, MCP, tip]`; re-pin 13/23/25; new test 18. `src/stage.css`/`keyboard-guide.css` cue styles. Viewer gains: palm matches the pose (no bob), two-link thumb that is shorter than the index, lifts read as lifts, tucked thumb occluded, finger-over on top, roll shading.
4. **Thumb depth commit.** `thumbDepth = min(0.45u, 0.2h)` white, ×0.3 black; re-pin 14, 15, 28 alone. Viewer gains: the thumb plays at the front of the key.
5. **Cues and polish.** HandCoach chips (`gapSeconds < 1`), land-splash suppression, wait-mode replay/breathing (`settle`), count mode; remove `handShape` from the pose path (test 4 rewritten to slots); lint run in CI (test 20). Viewer gains: one coherent preparation signal across glow, key mark, ring, hover and strip.

Untouched: `src/fingering.mjs`, `src/music.mjs`, `keyboard-stage.mjs`, the key loop, the runway, `handTimeline` and its three tests.

---

## 11. Walkthroughs (ms; positions, plans and releases from `synth-plan.mjs` at 100 % speed; `u = v = 45.4 px`, `h = 166.6` where px are given)

### 11.1 C major scale, RH, ♩ = 100, eighths (IOI 300)

Positions: P0 {1:C4 2:D4 3:E4} palm 25.85 · P1 {1:F4 2:G4 3:A4 4:B4} 28.45 · P2 {C5 D5 E5} 32.45 · P3 {F5 G5 A5 B5 C6} 35.45 · P4 {E5 D5 C5} 33.25 · P5 {B4 A4 G4 F4} 29.25 · P6 {E4 D4 C4} 26.25. Every boundary is a CROSS.

| t | the viewer sees |
|---|---|
| 0 | C4 down (filled "1"); D4's key mark "2" and the index's outline ring from 0 (prep = previous attack); the index uncurls 50–260 and descends 260–300. |
| 300 | D4 down. C4 released at 340 (legato overlap): thumb lifts to 0.5 over 80 ms (shadow opens), curls to its slot 370–570, ring fades by 460. |
| 350–600 | E4 mark "3" from 300; the middle finger aims 350–600; E4 down at 600, D4 released 640. |
| **620** | **Phase 1 lean**: palm 25.85 → 27.55 (1.70 keys) over 620–822 (202 ms, 8.4 keys/s mean, 16 peak); E4's tip stays exact while finger 3 trails to dev −1.6 (knuckle follows 60 %). **Thumb hop** starts (aim = 900 − max(stroke 250, hopTime(3) 280) = 620): F4 mark "1" since 600. |
| 700–790 | the thumb's x passes the index pad (index slot 25.0 → 26.2): `under` ≈ 1, the pad is pulled 0.5 v (23 px) toward the palm, nail and ring hidden, covered by the index/middle fills and the palm; the F4 key mark carries the "1". |
| 816 | lateral aim complete over F4 (70 % of the hop); descent 816–900 while `under` fades and the ring reappears (≈ 850). |
| **900** | **F4 down, exact** (x = 26.5 u, y = 0.68 h + 0.45 u = 133.7 px); palm 27.55 (thumb dev 1.35). E4 still down (filled "3"). |
| 940 | E4 released (+40): finger 3 lifts 80 ms and folds back to its slot over 200 ms. **Phase 2**: 27.55 → 28.45 over 940–1099 (159 ms, 5.7 keys/s); the thumb straightens as the palm catches up (tip fixed). G4 mark "2" from 900; 1200 G4 · 1500 A4 · 1800 B4 (dev +0.6). |
| 1780–2100 | thumb hop 4 keys (hopTime 320) under fingers 2, 3 and 4; **lean** 28.45 → 30.65 over 1820–2043 (223 ms, 9.9 keys/s) with B4 pinned; C5 mark "1" from 1800; 2100 C5 down; B4 released 2140; phase 2 to 32.45 by 2346. |
| 5420–5700 | **Finger-over** F5(1) → E5(3): lean 35.45 → 33.25 over 5420–5643 (2.2 keys, 9.9 keys/s) with the thumb pinned on F5, now tucked 2.65 keys under the palm (down, exact, drawn beneath); finger 3 hops from its slot to E5 with lift 0.9 (shadow 5.6 px, pad +4.5 %), painted above the thumb; 5700 E5 exact; F5 released 5740 and the thumb curls out from under the hand over 200 ms. |

At 50 % speed (IOI 600) phase 1 runs 1220–1422 (its earliest allowed window), the hand then waits leaned for 378 ms, the thumb hop still takes 280 ms (1520–1800) — the hand waits, it never moves in slow motion. Reduced motion: one jump 25.85 → 28.45 at 900 with correct markers and no landing.

### 11.2 S01 — Tornado bars 4–6, LH (♩ = 76, IOI 197; t = 0 at beat 12)

Positions: P10 {1:D3 5:D2 3:A2} 13.4 · P11 {4:F♯3 3:G3 2:A3 1:D4} 20.14 (forward 0.25) · P12 {2:F♯4} 25.33 (forward 1) · P13 {1:D4 5:D3 5:F♯3 3:A3 2:A3 4:F♯3} 20.49 (0.29) · P14 {1:D3 3:A2 5:D2} 13.4.

| t | event |
|---|---|
| 3158 / 3355 | octave D3/D2 (1, 5) down; A2 (3) down, octave released 3395. |
| 3430 | finger 4 (free, curled) starts its 5.5-key hop toward F♯3 (hopTime 320), lifted 0.9; F♯3 key mark "4" since 3355. |
| 3553 | thumb re-strikes D3 (filled "1"). |
| **3573–3720** | **CROSS-over phase 1**: palm 13.4 → 18.4 (5.0 keys, 147 ms, 34 keys/s mean, 65 peak) over the pinned thumb, which ends tucked 3.3 keys under the hand (down, exact, drawn beneath); finger 4 passes over it. |
| **3750** | F♯3 down, exact (black: knuckle row 0.23 v forward); D3 released 3790 (+40); phase 2 18.4 → 20.14 over 3790–3917. |
| 3947 / 4145 / 4342 | G3 (3), A3 (2), D4 (1) inside P11: fingers only; the smoothed lean carries the palm 0 → −0.25 → −0.66 keys toward the thumb's D4 (dev 2.3) over the 150-ms windows before each onset. |
| 4342–4539 | finger 2 is pinned on A3 until 4342, so its 5.5-key hop to F♯4 runs 4342–4539 (28 keys/s, lifted 0.9; `forcedFinger` would trigger above 30); F♯4 mark "2" from 4342. **Phase 1** 4362–4509: palm 20.14 → 25.33 (5.2 keys, 35 keys/s) over the pinned, tucked thumb. **4539** F♯4 exact with 2 (row 0.9 v forward); D4 released 4579. |
| 4609–4737 | F♯4 released at 4609 (held 70 ms of 197 — the only stolen note in the bar); flight −4.84 keys 4609–4717 (108 ms, 45 keys/s), palmLift 0.85, footprints and rings "1 5" on D4/D3 since 4539; hover 20 ms; **4737** octave D4/D3 exact. |
| 4934 | F♯3 (5): same-finger hop 2.5 keys inside P13 — D3 released 4773 (36 ms held, the floor), hop 161 ms (16 keys/s). |
| 5601–5921 | **Thumb-under back**: thumb hop D4 → D3 (7 keys, hopTime 320) beneath fingers 3 and 4 (`under` ≈ 1 around 5650–5850, ring hidden; D3 mark "1" since 5526); phase 1 5744–5891: palm 20.49 → 18.25 with finger 4 pinned on F♯3 (trails 1.6); **5921** D3 exact; F♯3 released 5961; phase 2 18.25 → 13.4 over 5961–6088 (4.85 keys, 127 ms, compressed to the A2 deadline at 6118). |

RH: the A4/A5 ↔ A♯4/A♯5 octaves at 197 ms are one position (spread 1.3, forward 0.6 constant — no knuckle-row bob); the final chord A♯3 D4 A♯4 is reached 1.0 s early after the 2.76-s hold and hovers with three footprints.

### 11.3 S04 — Appassionata bars 257–260, LH (♩ = 144, IOI 104; t = 0 at beat 512)

Positions: P1 {1:G♯4 3:F4 1:C5 5:C4 2:G♯4} palm 25.96, spread 1, forward 0.3 (−729…729) · P2 {5:F3} 21.66 (833) · P3 = P1 (938…2292) · P4 {3:G♯4 5:F4} 27.47 (2396) · P5 {5:G♯2 1:G♯3 2:F♯3} 17.39, spread 1.3, forward 1 (2500…2604) · P6 {1:C4 4:D♯3 2:G♯3 3:F♯3} 18.99 (2708…).

- **Tremolo, every 104 ms**: the palm stands at 25.96 for 1.46 s, knuckle row 0.27 v forward constant, lean varies ≤ 0.05 key (triangular kernel over alternating octave/dyad targets); fast mode: stroke = IOI, descent 31 ms, lift 0.8, the current pair's rings filled and the next pair's outlined, key marks per note; wrist bounce 0.05 v on the compositor.
- **625 → 729** thumb C5 → G♯4 (hop 2.5 keys): C5 released 661 (36 ms held, the floor), hop 68 ms (37 keys/s, `forcedFinger` at 100 %; natural at 50 %). Finger 2's earlier G♯4 ended 625 (released 665): within the swap window its curl ran at 0.10 s, so by 729 the index pad is back at its slot (0.69 key away, 0.4 v up) and only the thumb's ring is on G♯4.
- **F3 dip**: dyad G♯4/F4 (struck 729) released 766 (37 ms = 35 %); flight −4.3 keys 766–813 (48 ms, 90 keys/s mean: hover 20 ms, compress, steal, cap — not forced); **833** F3 exact; 870–917 back; **938** octave exact.
- **2299–2492** SLIDE 1.51 keys straddling 2396 (`3:G♯4 5:F4`): nothing cut; finger 5 hops C4 → F4 (3 keys, released 2328 at the floor, hop 68 ms, `forcedFinger`), finger 3 F4 → G♯4 over 104 ms.
- **The drop**: dyad released 2432 (36 ms); **2432–2500 FORCED**: 10.08 keys in 68 ms (149 keys/s mean, ≈ 280 peak), palmLift 1.0 (8 px shadow, scale 1.03), `pose.forced`; G♯2's key mark "5" since 2396 carries the destination; **2500** G♯2 exact on the black key (spread 1.3, row 0.9 v forward). At 50 %: dyad held 73 ms, flight 135 ms at 75 keys/s (natural); at 25 %: T(10) = 375 ms fits with a 20-ms hover.
- 2610–2807 SLIDE 1.59 keys around 2708 (`1:C4 4:D♯3`).

### 11.4 S06 — Moonlight bars 57–59, LH (♩ = 54, triplet IOI 370; t = 0 at beat 224)

- −4444 … 3333: the bass octaves (1–5 and the 1–4 D♯) are one position (12.79, spread 1.4, forward 0.83); each octave change is a 1-key SLIDE (T 165) with nothing cut.
- **4444 `1:F♯3 3:A2 5:A1`** (12.5 keys — no hand) → **roll [A1] [A2 F♯3]**: the C♯ octave (written to 4444) is released at 4216 (held 883 ms of 1111; deficit: hover → 20, compress 66, steal 228), flight 4216–4424 to the bass frame, hover 20 ms; **A1 (5) exact on the beat**; +58 ms (ROLL_STEP for 5.8 keys): **A2 (3) and F♯3 (1) exact at 4502**; A1 released at 4502 with a pedal ring until 7778. Marks: A1/A2 `roll`, F♯3 `land` since 3444.
- 4502–4613: A2 held the minimum 111 ms, then released to the pedal (ring to 7778) as the **CROSS-over** to C♯4 begins: phase 1 4613–4770 palm 14.72 → 20.9 (6.2 keys, 157 ms, 39 keys/s) over the pinned thumb (tucked, down); finger 2 hops from its slot lifted 0.9 (aim 4565–4815); **4815** C♯4 exact; F♯3 released 4855; phase 2 to 22.95 by 5072.
- 5185 D♯4 (2): hop 1 key — C♯4 released 5025 (210 ms held = 57 %), hop 160 ms.
- 5395: D♯4 released (210 ms); flight −5.03 keys 5395–5536 (141 ms, 36 keys/s; the thumb lands 5 keys down: a leap, not a pass); **5556** F♯3 (1) exact.
- 5576–5825 **CROSS-over** again: palm 17.92 → 20.9 (249 ms, 12 keys/s) over the pinned thumb; finger 2 hops 1 key (aim 5676–5926); **5926** C♯4 exact; F♯3 released 5966; phase 2 to 22.95 by 6183.
- 6486: D♯4 released (190 ms = 51 %); flight −7.38 keys 6486–6647 (46 keys/s); **6667 `1:G♯3 4:G♯2 5:G♯1`** → roll [G♯1] [G♯2 G♯3]: G♯1 exact on the beat, G♯2 + G♯3 at **6727** (+60), G♯1 released 6727 (pedal ring to 8889).
- **7778 `2:A3 3:F♯2 4:F♯1`** (33 semitones) → three groups: **F♯1 (4) 7778, F♯2 (3) 7848 (+70 for 7 keys), A3 (2) 7928 (+80 for 8.5 keys)**; F♯1/F♯2 released as the hand sweeps (rings to 8889); the drawn span never exceeds spread 1.4. 8148 C♯4 (2): a 2.48-key SLIDE straddling the onset — A3 held to its written end (+40).

RH: E4 F♯4 G♯4 A4 in one position (≈ 27.8) for 7 s; the LH figure (22.95) is 4.85 keys away in centre: crowd 0.4 (free fingers of both hands curl 40 % more), no overlap interval, z default.

### 11.5 S07 — Gymnopédie bars 41–44 (♩ = 60; t = 0 at beat 120)

LH: **0** D2 (5) down, frame 12.66. The chord F♯4 C♯4 A3 at 1000 is 9.91 keys away and D2 is written to 3000 → unreachable → **released to the pedal at the latest natural departure 507** (= 1000 − 120 hover − 373 travel; held 51 %): a hollow ring on D2 until 3000 (`free` kind — the score has no pedal span) while the key keeps its written glow; key marks "1 2 4" on F♯4/C♯4/A3 since 0 (far field, 10 keys from the hand); flight 507–880 (373 ms, 26.6 keys/s mean, 50 peak), palmLift 1.0; the canvas footprints enter at ≈ 700; hover 120 ms; **1000** chord exact (thumb on black F♯4: forward 0.71 → row 0.64 v forward, thumb depth 0.135 u). **Chord → G2** (written to 3000, 6.91 keys): deficit 484 → hover 20, compress 44 (share 0.125 for a 2-s hold), steal 309: chord released **2691** (held 1.69 s = 85 %), flight 2691–2980 (289 ms, 24 keys/s), hover 20 ms, **3000** G2 exact. The pattern repeats: G2 held 542 ms before each chord; each chord released 309–347 ms before its bass.

RH: the bar-40 chord ends at −3000; curl 200 ms; `relax` passes 0.5 at idle 1.4 s → `.rest` from **−1600** until **8100** (toNext 1.9 s), fully awake by 8500; frame 28.88 → F♯5/A5 frame 33.97 (d 5.09, T 302): depart **8698**, arrive **9000** (1.0 s early), hover 9000–9750 with the footprint and outline "3" (mark since 9000); stroke 9750–10000; **10000** F♯5 exact (black: forward 0.5 → row 0.45 v); 11000 A5 (5) in the same position, "5" from 10000.

### 11.6 S09 — Appassionata bars 32–34 (♩ = 144; t = 0 at beat 62)

LH positions: P0 {1:C5 2:G♯4 4:F4} 26.8 · P1 {1:A♯2 5:A♯1} 10.71 (forward 1) · P2 {1:C♯5 2:A♯4 1:C5} 27.25 (forward 1, 729–1667) · P3 {C3/C2, C♯3/C♯2} 11.73 (spread 1.2).

| t | LH | RH / duet |
|---|---|---|
| −417 … 0 | dyad G♯4/F4 released −271 (held 146 ms = 70 %); flight −271 → −20 (16.08 keys, 251 ms, 64 keys/s mean, 120 peak); hover 20; **0** octave A♯2/A♯1 exact (row 0.9 v forward). | run in positions 21.32 → 23.0 (SLIDE 1.68 keys around 313) → 20.97 (SLIDE 2.03 around 1354); lifts ≤ 0.8, stroke = IOI, footprints only at position starts. |
| 347 … 729 | octave released 347 (held 347 ms = 83 %); flight 347–709 (16.54 keys, 362 ms, 46 keys/s), palmLift 1.0 → **LH on top** while lift ≥ 0.5 (≈ 410–650) and, from landing, by the overlap interval (|ΔC| 4.25 < 4.4, LH moved in); hover 20; **729** C♯5/A♯4 exact. | crowd 0.77 (nearest slots 0.35 key apart): both hands' free fingers curl 77 % more, LH knuckle row raised 0.23 v, RH contacts untouched; no z flip for the whole 1.25 s. |
| 1667 / 1740 | `1:C5 2:A♯4` (in position); dyad released 1740 (73 ms = 35 %); flight 1740–1859 (15.52 keys, 119 ms, **130 keys/s mean — the cap**, listed as forced-speed); hover 16; **1875** C3/C2 exact. At 50 %: held 146 ms, 262 ms at 59 keys/s. | the LH is airborne (lift ≥ 0.5) on top; after landing nothing overlaps → z default, invisible. |

### 11.7 S11 — Appassionata bars 533–536 (♩ = 180, IOI 83; t = 0 at beat 1064)

RH: P0 (lead-in chords and F4) 27.65 → **P1 {2:G♯4 4:C5 5:C♯5 3:A♯4 4:A♯4 3:G♯4 2:G4 1:F4 1:C4} 28.77, spread 1.2, forward 0.52: one position for 29 onsets (2.33 s)** — the C4 ↔ F4 thumb hops stay inside it (C4 dev −2.39 via hysteresis). 164–336 SLIDE 1.12 keys straddling 250; from 250 the palm stands (lean ≤ 0.2, slowly), knuckle row 0.47 v forward constant; each finger strikes with stroke 83, descent 25 ms, lift 0.8, ring one note ahead (two-note trail), key marks per note, canvas footprint only at 250. **1333 G♯4 (3) → 1417 C4 (1) → 1500 F4 (1)**: C4 released 1446 (29 ms held, the floor), thumb hop 3 keys in 54 ms (56 keys/s, `forcedFinger` at 100 %; at 50 % the hop takes 110 ms at 27 keys/s) — thumb-over at speed: the thumb abducts, the hand stays.

LH: P1 {1:F2 5:F1} 8.29 (0 … 83) → P2 {4:G♯2 2:C3 1:F3 5:F2} 14.96 (167 … 2333): the finger-over onto G♯2 at IOI 83 (< 120) is a TRAVEL: F2 (thumb, re-struck 83, written to 167) released 113 (30 ms = 36 %), flight 113–165 (6.66 keys, 51 ms, **130 keys/s = cap**), **167** G♯2 (4) exact on the black key; C3 (2) 250 and the chord F3 C3 G♯2 F2 at 333 inside P2 (palm still for 2.2 s; finger 5 re-strikes F2 220 ms after the thumb left it — inside the swap window, so the thumb curled at 0.10 s and only one ring ever sits on F2). At 50 %: F2 held 58 ms, flight 89 ms at 75 keys/s.

### 11.8 S12 — Bach bar 32–35, RH (♩ = 60): the in-position lean

P0 (33 onsets, 10 s, palm 23.85): bar 33's F3 (thumb, dev −1.95) gets a smoothed lean of **−0.8 key** at 4500 and 6500: the palm rocks 0.8 key toward the thumb over the 150-ms window before F3 and back over the next step's window, so the thumb's effective deviation is 1.15 keys — a wrist rock, not a reach. P0 → P1 (d −2.6) is a **LEAN** at 6750 with F3 pinned: phase 1 6520–6720 (13 keys/s), F3 trails ≤ 1.2 and is released at 6790 (+40); P1 → P2 (9.63 keys) is a natural TRAVEL: D3 released at its written end 8000 (nothing stolen), flight 8000–8370 (26 keys/s), hover 130 ms, the G4 chord exact at 8500. Zero stolen notes in the passage.

---

## 12. Open risks

1. **Forced sprints at 100 %** (S04 drop 149 keys/s, S09 return and S11 LH at the 130 cap) are 3–7-frame blurs with the lift cue and a key mark on the destination; at the default 75 % practice speed all are under the cap, at 50 % natural. Option left open: a 2-frame horizontal ghost on `forced` frames (compositor `--hand-blur`).
2. **Segmentation thresholds** (DEV, SPREADS, hysteresis 0.2) decide where a run breaks; the lint counts position changes per second per passage and the lab filmstrips must confirm no hopping on S01/S02/S06 and no splay on S11/S12 before the constants are frozen.
3. **Sustained crossed holds**: a thumb (or finger) held through a crossing stays tucked for the whole position; when the constraining hold ends, only the in-position lean (≤ 1.0 key) re-centres the hand. Rare in the library; a "re-fit at hold release" refinement is possible later.
4. **Practice-speed slider mid-note** rebuilds the plan and can move a release on screen by a few ms (one frame of geometry change). Accepted; optional mitigation in `KeyboardGuide`: apply a new `speed` to the hands only while frozen or within 0.05 beat of an onset (one ref, outside `handPose`).
5. **Fingering quirks** (finger changes on repeated keys, `TOO_FAR` chords, 1-2-2 hops) are shown honestly (swaps, rolls, pedal releases, dips). The right fix is a repeated-key stability term and a span penalty in `fingering.mjs`; out of scope.
6. **Rolls lag the audio** by ≤ 160 ms on the top note of a three-group roll (S06 bar 59); the alternative (leading the beat) was rejected by the panel. The rolled keys carry `roll` marks from the chord's prep time so the learner reads the chord as one.
7. **Hand-size setting**: spread 1.4 covers an octave comfortably and a ninth as the hard maximum; 15-semitone library spans (Moonlight bar 5, Sunny Day) roll. A later "hand size" preference could scale SLOT/DEV.
8. **Count-in from mid-piece**: `clockMap` uses `countInSecondsPerBeat` for negative beats; a mid-piece count-in at a different local tempo is handled by App's `t.countIn.secondsPerBeat`, but if App ever counts at a tempo other than the one it passes, the pre-first-note stroke is off by the ratio (cosmetic).
9. **Repaint cost in fast runs**: every stroke repaints up to 20 times; at IOI 83 ms that is most frames (as today). Gradient caching and the pose-driven palm keep a paint ≈ 100 ctx calls; measure on a 68u/dpr 2 bed in step 3 and widen the lift bucket to 0.1 for `u < 40` if needed.
10. **Coach-strip semantics for pedal releases and rolls**: the strip keeps saying "Hold" for a pedal-released bass (the sound continues) and shows the whole chord as one attack; a later "Pedal"/"Roll" wording could read `pose.pedal`/`marks`.
11. **Two-hand marks on one key**: if both hands mark the same key the right hand's mark wins; never occurs in the library but should be checked when the fingering changes.

---

## Appendix A — the panel's failure cases and where each is fixed

| failure (judges) | fix in this design |
|---|---|
| Biomechanics: per-step `forward` bobs the knuckle row at 4.8 Hz (S04, S01 RH) | forward is per position (weighted black share) and interpolated only along the palm path (§4.5.10); S04: 0.3 constant, S01 RH: 0.6 constant. |
| Biomechanics: 65 % cuts of legato sixteenths for 1–2-key moves (S12); 8 positions | SLIDE straddles ≤ 2.5 keys with nothing cut; LEAN for larger legato moves; the deficit order shrinks hover and compresses before stealing (§4.3); S12 RH has zero stolen notes (§11.8). |
| Biomechanics: S07 bass released after 250 ms, hovering 377 ms | a pedal release is the latest natural departure (`latest − T(d)`): D2 held 507 ms, hover 120 ms (§4.5.6, §11.5). |
| Biomechanics / invariants: `buildPath` truncation C⁰ hitch; zero-velocity waypoint stutter; pedagogy / architecture: overlapping windows with undefined owner (S01, S02, S06) | one palm path; a later plan truncates the earlier segment with matched velocity (cubic Hermite, clamped), lift carried continuously; no stops at intermediate onsets (§4.3). |
| Pedagogy: no in-position lean (S12 thumb swings two keys under a frozen palm); architecture: per-step lean rocks at 4.8 Hz (S04) | smoothed in-position lean: excess beyond 0.75 key, cap 1.0, triangular kernel ±0.4 s, eased over the stroke window (§4.2.1): S12 −0.8 key, S04 ≤ 0.05 variation. |
| Pedagogy: 9.8 keys in 24 ms teleport; `rushed` with no cue; architecture: FLICK | the hold floor (35 % of the IOI) is paid before the cap, the cap before `forced`; S04's drop takes 68 ms at 149 keys/s with palmLift 1.0, shadow and the key mark as cues, flagged `forced` (§4.3, §11.3). |
| Pedagogy / biomechanics: rolled grace notes before the beat (S06) | bass group on the beat, later groups +40–80 ms, lower groups released to the pedal with rings (§4.5.7). |
| Invariants: top note of a roll lags 216 ms | `ROLL_STEP = clamp(d/100, 0.04, 0.08)` → ≤ 150 ms for three groups (§11.4). |
| Invariants / wait mode shows chord k down; pedagogy / architecture: listen pause pops sounding fingers to "ready" | `waiting` evaluates at `onset_k − ε` with the strikers' descent suppressed (hover 0.3) and holds down; `frozen` without `waiting` is the plain frame — sounding fingers stay down; preparation markers only via `settle.since` (§4.8). |
| Invariants / architecture: tempo-scaled or creeping thumb-under (1.08 s or 540 ms for 3 keys) | the thumb hop is `hopTime(d)` = 0.12–0.32 s regardless of speed; the lean phase ends ≥ 0.5 s before the onset only when time allows, else `arrive` before it; at slow speed the hand waits leaned (§4.5.1, §11.1). |
| Invariants: S01 finger-over degraded to a hop (thumb released 75 ms early) | `OVER_DEV` lets fingers 2–4 cross 2.2 keys past their slot; the thumb stays pinned to its written end (§11.2, 3750). |
| Invariants: `blackShare`/`moving` tie-breaks flip z while still (S06, S10); both hands `over` (S09); biomechanics: continuous `altitude` flips z in crowds | z-order is decided per overlap interval (the hand that moved in) and may change only during a flight with lift ≥ 0.5 or when nothing overlaps (§4.7). |
| Architecture: rest flicker on a 2.57-s rest (REST_NEXT 1.0) | `relax` is a product of two eases (`REST_NEXT 1.5 + ramp`); a 2.57-s gap never dims; one crossing up and one down per gap (§4.6). |
| Architecture: S12 3.19-key move compressed to 93 ms with a 50 % cut; 115/207 early releases | LEAN kind: 13 keys/s, nothing cut (§11.8); early releases only by the named rules. |
| Architecture: per-step `knuckleYTarget` bob; thumb depth 0.16 u kept; reduced motion walks | per-position forward; `thumbDepth = min(0.45u, 0.2h)` (step 4); reduced motion uses the position frame (§4.9). |
| Architecture: `UNDER_TUCK = 0.6·u` applied to depth buries the thumb on shallow beds | tuck is `0.5·v` (depth unit) and the thumb depth is clamped by `0.2·h` (§5.1). |
| Architecture: lean guard releases the crossed finger 48–75 ms early in every scale crossing | CROSS keeps pins to their written end (+40); the lean is bounded by `PIN_DEV` instead of releasing (§4.3). |
| Biomechanics: finger exchange on a repeated key puts two pads and two rings on one point (S04); invariants: 3↔5 swap interpenetrates | swap rule: old finger released 150 ms before the new onset (≥ 35 % held), curl 0.10 s, lift 0.7, ring vanishes at release; G6 states the swap exception (§4.5.5). |
| Biomechanics: wait-mode advance teleports 9.9 keys (S07) | `settle.since` replays the move at natural speed from `max(prev onset, prep − 0.1, onset − 1.5)`; static ready pose until App supplies it (§4.8). |
| Pedagogy: replay compressed to 0.6 s; seek ≠ play with `sinceJump` | natural-speed replay; `settle.since` is an input, so equal inputs give equal poses (§4.8, test 14). |
| Biomechanics: inverted Path2D clip; `relax` painted but unsigned | per-shape stroke + fill (thumb → 5,4,3,2 → palm) needs no clip; `relax` is in the signature (§5.2–5.3). |
| Biomechanics: S09 return at 130 keys/s is a smear | kept at the cap and flagged; the lift/scale/shadow cue and the key mark carry the jump; risk 1 lists the optional ghost. |
| Biomechanics: tests 6 and 14 fail though "kept" | `glide = max(palm τ, finger prep progress)`; `ready` from `prepStart` (departure/1 s before) rather than the stroke (§4.4, §9). |
| Biomechanics: `ahead` clamp applies an absolute-beat map to an interval | the clamp is computed in beats like the glow itself (§7). |
| Pedagogy: REST→TRAVEL finger pop (first strike of a free finger) | `extend`/`curl` blend over the aim (§4.4); test 9 margin ≈ 7×. |
| Pedagogy: thumb snaps 2.5 keys in one frame (S04 tremolo) | hop rule with the 35 % hold floor: 68-ms hop flagged `forcedFinger`, never a single frame (§11.3). |
| Invariants: rule (c) releases a legato quarter at 26 % (test 5); circular `aimStart` | releases come only from the named rules; `aimStart ≥ release` (not the reverse); test 5 rewritten with the computed times (§9). |
| Invariants: `fit()` 0.137 ms/call, plans in seconds | interval fit O(contacts) with an analytic ratio guard; model memoised per `(steps, clock.key)` (§4.2). |
| Invariants: swap clearance only for thumb swaps | SWAP_LEAD + CURL_SWAP give ≥ 0.9 key lateral and ≥ 0.35 v vertical separation for any pair (§4.5.5). |
| All four: speed slider mid-note rebuilds the plan | accepted (one frame, a few px); optional gate in KeyboardGuide (risk 4). |
| Biomechanics §8.1 / architecture §8.4 transcription slips | all walkthrough numbers recomputed by `synth-plan.mjs` (§11). |
