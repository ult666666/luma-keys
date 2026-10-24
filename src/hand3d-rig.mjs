// The 3-D hands' skeleton and posing (no WebGL; node runs it for checks).
//
// The meshes are locally converted Microsoft MRTK hands (MIT, provenance in
// public/models/hands/PROVENANCE.json): one skinned mesh each, in metres,
// mapped to the 25 WebXR joints. In every joint's frame −Z runs along the bone toward
// the fingertip and +Y is the back of the digit, so flexion is a turn about
// the joint's −X and spreading a turn about its Y.
//
// A pose is built from the motion engine's per-frame sample for one hand
// (hand-pose.mjs handMotions → { pose, motion }), in poseHand:
//   1. the hand's comfortable shape (POSTURE.comfort): its five pads one key
//      apart under the knuckle row, each digit's pose what reaches its pad
//      there (the little finger standing on its tip, its knuckle up; the
//      thumb on its side near the front of its key);
//   2. the hand placed for its digits on keys: the smallest shift and turn of
//      the hand that brings those digits, in that shape, onto their keys —
//      the hand moves to the fingers, so a stretch moves and opens the hand
//      rather than straightening a finger (the engine's palm holds it
//      weakly; a thumb passing under, or a finger crossing over, is left
//      out, the hand pivoting over the others);
//   3. each digit on its key solved analytically onto its drawn contact —
//      fingers as a planar three-link chain, the last joint at a pianist's
//      angle on the key, the middle joint never straight (`pipDown`); the
//      thumb's CMC in two axes with its opposition coupled; where the
//      comfortable ranges cannot reach, the hand moves and the digits go a
//      little further (`STRAINED`), continuously, never past what a hand
//      does;
//   4. the free fingers: in a relaxed curve lifted at the knuckle until they
//      hover clear of their keys, spread in the hand's natural fan (opened
//      by the engine's spread), held straighter rather than curled when the
//      hand is low, never past the fallboard, never touching a neighbour;
//      the free thumb beside the hand, or tucked under it.
// Everything is a continuous function of the motion: weights fade in as a
// digit aims and out as it lets go, limits ease rather than switch.
// Bones are rigid, so nothing stretches: an unreachable target leaves the
// pad as near as the joints allow and reports the miss (`errors`).
import * as THREE from "three";
import { keyboardLayout } from "./music.mjs";
import { contactDepth } from "./hand-pose.mjs";

// ---- the instrument (metres) ----------------------------------------------------------
export const KEY_W = 0.0235;
export const KEY_LEN = 0.15;
export const BLACK_RISE = 0.0125;
// How far a held key's front edge is drawn down in 3-D (m). A real key goes
// down 10 mm, but the keyboard is drawn flat (a 2-D cue shows a held key), so
// the hand only sinks a little with it: from this camera every millimetre a
// finger resting on an unplayed key stands above the ones that play lifts
// its outline about 1.6% of the keys' length up the picture.
export const KEY_DIP = 0.003;
// (A key pivots on its balance rail this far behind its front edge, so one
// pressed further in goes down less than KEY_DIP.)
export const KEY_BALANCE = 0.23;
// Black keys are drawn this share of the keys' length (as the 2-D keyboard).
export const BLACK_SHARE = 0.63;

// ---- the WebXR joint set ----------------------------------------------------------------
export const FINGERS = ["index", "middle", "ring", "pinky"];
export const DIGITS = ["thumb", ...FINGERS];
export const CHAINS = {
  thumb: ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  ...Object.fromEntries(
    FINGERS.map((f) => [f, ["metacarpal", "phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"].map((j) => `${f}-finger-${j}`)]),
  ),
};
export const PARENT = { wrist: null };
for (const chain of Object.values(CHAINS)) chain.forEach((j, i) => (PARENT[j] = i ? chain[i - 1] : "wrist"));

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const AX = new THREE.Vector3(1, 0, 0),
  AY = new THREE.Vector3(0, 1, 0),
  AZ = new THREE.Vector3(0, 0, 1);
const qAxis = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
// (Scratch values for hot paths.)
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ---- the hand's posture (metres, radians) -------------------------------------------------
export const POSTURE = {
  // The hand's comfortable shape on its keys: the five pads one key apart
  // across, `height` under the knuckle row and `reach` ahead of it (m, the
  // hand level at its natural pitch), the little finger's `little` and the
  // thumb's `thumb` nearer the player (their own contacts); on black keys
  // the fingers lie flatter (pads less far under, further ahead). Each
  // digit's comfortable pose is what reaches its pad there, its last joint at
  // the fingertip's angle (`tip`). The hand is placed so the digits that play
  // are as near this shape as their keys allow (poseHand step 2): the hand
  // moves to the fingers rather than the fingers straightening out to keys.
  // A low, rounded bridge keeps each phalanx visible from the teaching
  // camera. The fingertip still meets the key on its pad, without hooking.
  comfort: { height: 0.050, reach: 0.072, little: 0.012, thumb: 0.03, blackHeight: 0.045, blackReach: 0.076 },
  // A melody uses a low bridge. Wider chords need more space beneath the
  // palm for the thumb, and a crossing needs that same supported shape.
  wideComfort: { height: 0.058, reach: 0.067, little: 0.012, thumb: 0.03, blackHeight: 0.053, blackReach: 0.071 },
  bridgeSpan: [4, 6],
  // The model is a smallish adult hand (178 mm wrist to middle fingertip); a
  // pianist's is 185–195 mm. Scaled by this at load time, so an octave is
  // played by an arched hand rather than a flat one at full stretch.
  scale: 1.05,
  // Preserve the source hand's palm and bone proportions.
  palmLength: 1,
  // Shape the skin around that fixed skeleton: a tapered palm, articulated
  // finger shafts and a soft saddle at the thumb web. Zero is the source.
  anatomy: 1,
  // Keep each finger's flexion axes coplanar for the analytic contact solve;
  // this changes joint frames, not the source mesh or bone lengths.
  planar: 1,
  // Continue the wrist below the keyboard frame without changing the
  // articulated palm, fingers or their playing contacts.
  forearmExtra: 0.04,
  forearmWidth: 0.12,
  // How much each digit counts in placing the hand (the thumb, the most
  // mobile, the least), and how firmly the hand keeps, against them, to the
  // engine's palm across the keys, to its default height and depth (per m²)
  // and to its natural orientation (m² per rad²).
  fitWeight: [0.9, 1, 1, 1, 1],
  // (The thumb counts mostly across: along and above the keys it reaches
  // freely. A long finger counts more across than in height and depth: it
  // takes those up by curling, but across it can only lean.)
  thumbAxes: [1, 0.3, 0.3],
  fingerAxes: [1, 0.6, 0.6],
  // (The little finger, the other outer digit, reaches sideways too — it
  // spreads and straightens — so it counts less across; and, like the
  // thumb, never further from its knuckle than its pad is with its middle
  // joint bent `littleReachPip`: firm and a little curved, not straight.)
  littleAxes: [0.8, 0.6, 0.6],
  littleReachPip: 46 * DEG,
  littleReachWeight: 7,
  // (… and the hand leans toward the little finger as it plays — the outer
  // edge of the palm lower, the little finger standing on its tip rather
  // than lying out flat: radians at a full say.)
  littleLean: 8 * DEG,
  // (… and its knuckle behind its key, across: per finger on a key.)
  alignWeight: 1,
  // (A free long finger's say in placing the hand: per finger.)
  freeFitWeight: 0,
  // The thumb's comfortable reach: never further from its base (CMC) than
  // its pad is with the MCP bent this much (the IP following). Over it, a
  // thumb lies flat and straight — at its full reach its length barely
  // changes with its joints, so the last millimetre would straighten it — so
  // the hand comes to the thumb instead (`thumbReachWeight`, per m², in
  // placing the hand), and the thumb's comfortable range stops there
  // (LIMITS.thumbMcp); only a strained thumb goes further.
  thumbReachMcp: 28 * DEG,
  thumbReachWeight: 18,
  prior: { x: 0.12, y: 0.02, z: 0.02, yaw: 0.003, pitch: 0.004, roll: 0.0015 },
  fitRounds: 4,
  // Exact contacts can require a small wrist turn on mixed black/white
  // octave chords. Let the correction move the hand, instead of leaving
  // the held index/thumb beside their keys; joint limits remain unchanged.
  fitShift: 0.1,
  fitTurn: 0.1,
  // A digit that has let go of its key still holds the hand where it played
  // it, fading over this long (s). (No longer than the engine keeps a free
  // finger's place at its key: after that its place follows the finger.)
  holdAfter: 0.12,
  // (A digit just landed under the hand counts in placing it over this long, s.)
  settle: 0.2,
  // (For naturalAngles and older callers: a playing curve's knuckle height
  // and reach over a long finger's pad, and its MCP and PIP.)
  play: { height: 0.044, reach: 0.066, mcp: 24 * DEG, pip: 48 * DEG },
  dipShare: 0.62,
  // The thumb lands on the exposed white-key surface, just ahead of the
  // black-key fronts. Forcing it to the front lip opens the thumb web and
  // flattens the whole hand unnecessarily (× keysHeight from the back).
  thumbWhite: 0.79,
  // … and three quarters of the way along a black key (the black keys are
  // drawn 0.63 of the keys' length): the hand comes in to it rather than the
  // thumb reaching out to the black key's front end.
  thumbBlack: 0.55,
  thumbBlackShort: 0.61,
  // A long finger on a black key plays further in as the hand moves in over
  // the black keys (× keysHeight × the engine's `forward`, the position's
  // black-key share): with the thumb in on a black key the long fingers keep
  // their place ahead of it, flatter, straight along their keys.
  blackIn: 0.12,
  // How far in from its contact (× its pad's radius) an outer digit's pad
  // centre stands: the thumb on its side, the little finger on its corner.
  corner: [0.55, 0, 0, 0, 0.45],
  // How steeply a fingertip meets its key (its last joint, radians below the
  // horizontal): a long finger on a white key, on a black key (flatter), the
  // little finger steeper (it stands on its tip, its knuckle up), a finger
  // hovering over its key.
  tip: { white: 40 * DEG, black: 36 * DEG, little: 10 * DEG, hover: 36 * DEG },
  wideTip: { white: 48 * DEG, black: 43 * DEG, little: 10 * DEG, hover: 42 * DEG },
  // A free finger keeps the curve it plays in and rests just over the key
  // under it: `clear` (m) between its pad and the key top, more only for the
  // engine's real lifts (a lift over `liftFrom`: a finger about to strike,
  // the fingers in a shift; `perLift` m at a full lift; a resting or flying
  // hand carries its fingers up with it). The ring finger, the least free,
  // lifts least. (The keys that play are a key's dip down, so a free finger
  // is that much higher than the playing ones, and a little less bent at its
  // knuckle.)
  hover: { clear: 0.0045, perLift: 0.012, liftFrom: 0.15, finger: [1, 0.9, 0.65, 0.85] },
  // On screen a free finger, a little higher than the playing ones, would
  // stand out toward the fallboard (the camera looks down from the player's
  // side, so height moves a point up the picture): it bends a little further
  // at its knuckle — down to its pad resting on its key, no further — to keep
  // its outline at most `screen` (× keysHeight) further up the picture than
  // its own when it plays, and `fall` (× keysHeight) clear of the fallboard.
  // It is never lifted straight, nor curled into a hook. A finger resting is
  // told from one playing by the cues, not by its height: no key down, no
  // contact shadow, no ring. (`mcpRange`: the knuckle's bend a free finger
  // rests within.)
  free: { screen: 0.08, fall: 0.17, mcpRange: [-12 * DEG, 72 * DEG], blackFront: 0.4, pull: [0.002, 0.009], tuck: { pip: 36 * DEG, dip: 22 * DEG }, mcpMin: -12 * DEG, lead: 1, playScreen: 0.075, curl: [0.5, 0.05], playRamp: [0.12, 1, 0.24], aboveBand: 0.024 },
  // (The screen outline of a finger's last two segments: spheres at its PIP,
  // its DIP and its pad, radii in m — fitted to the mesh's outline.)
  outline: { index: [0.0075, 0.0065, 0.006], middle: [0.009, 0.006, 0.0065], ring: [0.0085, 0.0055, 0.006], pinky: [0.0085, 0.006, 0.0055] },
  // The free fingers' natural spread (toward the little finger +) at the
  // hand's natural spread, how far the engine's spread may open or close it
  // (an octave's free fingers hang close together between its two ends), and
  // the most a free finger turns aside.
  fan: [-6 * DEG, -1 * DEG, 4 * DEG, 4 * DEG],
  fanRange: [0.8, 1.15],
  freeSpread: 22 * DEG,
  // … turned toward the place the engine keeps for each across the keys —
  // spread evenly between the fingers that play, so an octave's free fingers
  // fan open over the keys between rather than crowding behind one another
  // — this far (0 the natural fan, 1 right over its place).
  freeAimX: 0.25,
  // (… turning at most this far from its natural fan.)
  freeAimMax: 12 * DEG,
  // Neighbouring fingers keep this clear of each other (m): free fingers
  // about a key apart, never crowding behind one another.
  gap: 0.005,
  // A hand in flight (or resting) lets its free fingers hang: each curls a
  // little more at its three joints (radians at a full flight), the outer
  // fingers more than the inner (`cascade`), and they close in a little
  // (`fan`): a relaxed hand, not a spread crown of straight fingers.
  hang: { mcp: 4 * DEG, pip: 4 * DEG, dip: 2 * DEG, cascade: [0.7, 0.95, 1.12, 1.3], fan: 0.35, from: 0.5, wide: 0.9, wideCurl: [3 * DEG, 8 * DEG, 4 * DEG], wideFan: 0.7 },
  // A finger crossing over the thumb takes its free neighbours with it: they
  // keep this close to it (radians of spread), curved behind it.
  crossFollow: 9 * DEG,
  // A free digit eases toward each frame's rest over this long (s); the
  // hand itself eases on the renderer's clock (hands3d-layer SMOOTH_TAU).
  freeEase: 0.09,
  // A free finger's curve is a little gentler than a playing one's: its
  // fingertip this much flatter (and the little finger not standing on its
  // tip). A resting (relaxed) hand's fingers close in toward one another
  // (its fan narrowed by `restFan`) and lie flatter again (`restTip`).
  freeTip: 8 * DEG,
  restFan: 0.5,
  restTip: 14 * DEG,
  // Rounded, different resting curves; they disappear as each finger aims
  // for a note. Playing fingers keep their contact solve unchanged.
  idleCurve: [[3 * DEG, 2 * DEG], [5 * DEG, 3 * DEG], [7 * DEG, 4 * DEG], [9 * DEG, 5 * DEG]],
  // A free short finger must not concentrate its whole curve at the PIP.
  // Share excess flexion with the distal joint; aiming/held fingers retain
  // their musical solve. Preserve the cleared pad position during balancing.
  idleJointBalance: { pip: 78 * DEG, dip: 50 * DEG },
  // The palm's arch: the ring and little fingers' metacarpals turn a little
  // toward the palm, so the hand is cupped, not flat (more would sink the
  // little finger's knuckle below the line it plays from).
  arch: { ring: 3 * DEG, pinky: 6 * DEG },
  // The back of the hand rises toward the knuckles; the hand leans a little
  // toward the thumb; per unit of the engine's roll it turns toward the side
  // that plays.
  pitch: 24 * DEG,
  roll: -2 * DEG,
  rollPerUnit: 5 * DEG,
  // The forearm comes from the elbow beside the body; the wrist takes up most
  // of its angle (a pianist keeps the fingers square to the keys), so the
  // hand turns in only a little as it goes out along the keys.
  elbow: 0.22,
  forearm: 0.3,
  yawShare: 0.08,
  yawMax: 3 * DEG,
  // How far the hand may turn further (about the vertical) for its digits
  // on keys — never into a wedge — and how much more while a finger crosses
  // over the thumb or the thumb passes under (the forearm turns with it).
  turnMax: 12 * DEG,
  // The compact source hand needs up to 22° total during thumb-under
  // crossings; the ordinary 12° limit and finger joint limits stay fixed.
  turnCross: 10 * DEG,
  // … and as far again for a thumb stretched wide of the index or middle
  // finger (see poseHand): the turn a fifth between thumb and index needs.
  turnStretch: 13 * DEG,
  // (The thumb's distance from the index and the middle finger, keys, at the
  // engine's widest spread: hand-pose.mjs SLOT differences × 1.4.)
  stretchSlots: [1.47, 2.73],
  // … and tilt: the wrist dropping or rising [down, up] from the natural
  // pitch, rolling either way.
  tilt: [22 * DEG, 12 * DEG],
  rollMax: 10 * DEG,
  // The correction rounds (step 4 of poseHand), and how much a digit only
  // coming to (or leaving) its key counts in them beside one on its key.
  rounds: 4,
  // Most frames finish before numerical refinement. A remaining miss may
  // need a few more bounded wrist steps with the lower melodic bridge.
  contactRounds: 16,
  aimWeight: 0.15,
  // … and at most how far (m) such a digit moves the hand.
  aimCap: 0.01,
  // The thumb's natural pose (CMC flexion across the palm, palmar abduction,
  // MCP; the IP follows the MCP) and its opposition per unit of CMC flexion.
  thumb: { flex: 24 * DEG, abd: -6 * DEG, mcp: 10 * DEG },
  // (… bent at its IP too: a pianist's thumb plays on the side of its tip,
  // never long and straight, even in an octave.)
  thumbIp: { share: 0.65, base: 12 * DEG },
  thumbTwist: { base: 0, perFlex: 0.35 },
  // Keep the selected source mesh's thumb and finger bone lengths.
  thumbExtra: 0,
  // A thumb off its key keeps this far (m) inside its full reach (solveThumb).
  thumbSoft: 0.004,
  // A thumb with no task rests in an open C beside the index. These
  // offsets are in the hand's frame; aim/release/tuck fades them away.
  thumbRestOut: 0.02,
  thumbRestBack: 0.006,
  thumbMcpFloor: 10 * DEG,
  pinkyExtra: [],
  // Keep the long fingers' source lengths; extending them made idle
  // fingers tower above the keys even when their joints were bent.
  fingerExtra: {},
  // The digits' and the palm's shape (taperTemplate): a fingertip this much
  // slimmer than the digit's base, a little slimmer between its joints, the
  // palm's outer edge this much narrower at the wrist.
  taper: { tip: 0, waist: 0, palm: 0 },
  // Heights (m per unit of the engine's lift): a finger lifted off its key
  // before it strikes, the whole hand in a flight, a resting hand, a top
  // hand over a crowded one.
  fingerLift: 0.02,
  palmLift: 0.045,
  restRise: 0.006,
  topRaise: 0.018,
  // A thumb passing under the hand is drawn this far in under the palm (m per
  // unit of `tuck`) and kept this close to the keys; a finger crossing over
  // the thumb arcs this far toward the fallboard and up (m per unit of `arc`).
  tuckIn: 0.012,
  // (… and, on its key under the hand, its place there in the hand's shape:
  // this far toward the little finger and toward the fingers, m.)
  tuckPlace: [0.036, -0.01],
  arcFore: 0.012,
  arcUp: 0.016,
};

// Joint limits (radians, from the model's flat bind pose): the comfortable
// ranges a pose keeps to, and (`STRAINED`) how far a digit on its key goes
// when the music asks more of it — never past what a hand does. A finger on
// its key keeps its middle joint bent (`pipDown`: never a straight, collapsed
// finger — the little finger's most of all).
export const LIMITS = {
  mcp: [-15 * DEG, 88 * DEG],
  pip: [0, 100 * DEG],
  dip: [0, 72 * DEG],
  pipDown: { index: 25 * DEG, middle: 25 * DEG, ring: 25 * DEG, pinky: 36 * DEG },
  // (A finger on its key keeps its last joint at least this curved: about
  // 12° as the picture shows it — the model's own fingertips are bent back
  // 9–11° (index, middle) and 3–4° (ring, little) in its bind pose, so a
  // straight-looking fingertip is that much here.)
  dipMin: { index: 21 * DEG, middle: 23 * DEG, ring: 15 * DEG, pinky: 16 * DEG },
  dipShareMax: 0.8,
  // Spread at the MCP, toward the little finger's side +.
  spread: { index: [-22 * DEG, 16 * DEG], middle: [-16 * DEG, 16 * DEG], ring: [-14 * DEG, 20 * DEG], pinky: [-10 * DEG, 32 * DEG] },
  // Thumb: CMC flexion (across the palm), palmar abduction (+ away from the
  // palm), MCP flexion.
  cmcFlex: [-40 * DEG, 70 * DEG],
  cmcAbd: [-35 * DEG, 40 * DEG],
  // (Comfortably the thumb stays a little bent: straighter, it is at its
  // full reach and lies flat — see POSTURE.thumbReachMcp.)
  thumbMcp: [16 * DEG, 60 * DEG],
};
export const STRAINED = {
  ...LIMITS,
  mcp: [-22 * DEG, 92 * DEG],
  pip: [0, 108 * DEG],
  dip: [0, 76 * DEG],
  pipDown: { index: 14 * DEG, middle: 14 * DEG, ring: 14 * DEG, pinky: 24 * DEG },
  dipMin: { index: 9 * DEG, middle: 11 * DEG, ring: 3 * DEG, pinky: 4 * DEG },
  spread: { index: [-34 * DEG, 24 * DEG], middle: [-26 * DEG, 24 * DEG], ring: [-22 * DEG, 30 * DEG], pinky: [-16 * DEG, 48 * DEG] },
  cmcFlex: [-55 * DEG, 85 * DEG],
  cmcAbd: [-45 * DEG, 52 * DEG],
  thumbMcp: [-15 * DEG, 70 * DEG],
};
// A finger on its key: its middle joint kept bent.
export const onKey = (L, f) => ({ ...L, pip: [Math.max(L.pip[0], L.pipDown?.[f] ?? 0), L.pip[1]] });
// Limits part way from `a` to `b` (every range and bound interpolated), so a
// digit can be let go further continuously rather than at a switch.
export function blendLimits(a, b, t) {
  if (!(t > 0)) return a;
  if (!(t < 1)) return b;
  const mix = (x, y) => (Array.isArray(x) ? x.map((v, i) => lerp(v, y[i], t)) : typeof x === "number" ? lerp(x, y, t) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).map((k) => [k, mix(x[k], y[k])])) : x);
  return mix(a, b);
}

// ---- GLB ----------------------------------------------------------------------------------
function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("hand model: not a GLB");
  let at = 12,
    json = null,
    bin = null;
  while (at + 8 <= buffer.byteLength) {
    const len = dv.getUint32(at, true),
      type = dv.getUint32(at + 4, true);
    const start = at + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004e4942) bin = buffer.slice(start, start + len);
    at = start + len;
  }
  if (!json || !bin) throw new Error("hand model: missing chunks");
  return { json, bin };
}
function accessor(json, bin, i) {
  const a = json.accessors[i];
  const view = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  if (view.byteStride && view.byteStride !== comps * T.BYTES_PER_ELEMENT) throw new Error("hand model: interleaved data");
  return new T(bin.slice(start, start + a.count * comps * T.BYTES_PER_ELEMENT));
}

// A hand model as data: the mesh in its bind pose (model metres) and every
// joint's bind transform { p, q } in model space.
export function handTemplate(buffer, hand) {
  const { json, bin } = parseGLB(buffer);
  const prim = json.meshes[0].primitives[0];
  const get = (i) => accessor(json, bin, i);
  const skin = json.skins[0];
  const names = skin.joints.map((n) => json.nodes[n].name);
  const bind = new Map();
  for (const n of skin.joints.map((k) => json.nodes[k]))
    bind.set(n.name, {
      p: new THREE.Vector3(...(n.translation || [0, 0, 0])),
      q: new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])).normalize(),
    });
  for (const j of Object.keys(PARENT)) if (!bind.has(j)) throw new Error(`hand model: no joint ${j}`);
  return {
    hand,
    names,
    bind,
    position: Float32Array.from(get(prim.attributes.POSITION)),
    normal: Float32Array.from(get(prim.attributes.NORMAL)),
    uv: prim.attributes.TEXCOORD_0 != null ? Float32Array.from(get(prim.attributes.TEXCOORD_0)) : new Float32Array((get(prim.attributes.POSITION).length / 3) * 2),
    joints: Uint16Array.from(get(prim.attributes.JOINTS_0)),
    weights: Float32Array.from(get(prim.attributes.WEIGHTS_0)),
    index: Uint32Array.from(get(prim.indices)),
  };
}

// One bone of a digit made `extra` metres longer: the joints beyond it move
// out along it, the skin carried by its weight on them, and the bone's own
// skin stretches with it (by how far along the bone it lies), so the flesh
// comes out with the digit rather than leaving it standing free of the
// hand. `chain` is the digit's joints (CHAINS), `i` the bone's base joint
// in it. Returns a new template.
export function lengthenBone(tpl, chain, i, extra) {
  if (!(extra > 0)) return tpl;
  const moved = chain.slice(i + 1);
  const ids = new Set(moved.map((j) => tpl.names.indexOf(j)));
  const own = tpl.names.indexOf(chain[i]);
  const from = tpl.bind.get(chain[i]).p,
    to = tpl.bind.get(chain[i + 1]).p;
  const bone = to.clone().sub(from);
  const len = bone.length();
  const dir = bone.clone().normalize();
  const d = dir.clone().multiplyScalar(extra);
  const position = tpl.position.slice();
  const n = position.length / 3;
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    let w = 0,
      wm = 0;
    for (let c = 0; c < 4; c++) {
      const j = tpl.joints[4 * k + c];
      if (ids.has(j)) w += tpl.weights[4 * k + c];
      else if (j === own) wm += tpl.weights[4 * k + c];
    }
    if (wm > 0) {
      v.fromArray(position, 3 * k);
      w += wm * clamp(v.sub(from).dot(dir) / len, 0, 1);
    }
    if (!(w > 0)) continue;
    position[3 * k] += d.x * w;
    position[3 * k + 1] += d.y * w;
    position[3 * k + 2] += d.z * w;
  }
  const bind = new Map([...tpl.bind].map(([k, v]) => [k, { p: v.p.clone(), q: v.q.clone() }]));
  for (const j of moved) bind.get(j).p.add(d);
  return { ...tpl, position, bind };
}
// The thumb's metacarpal made `extra` longer (the model's is short of an
// adult's, so its pad could not come forward to the keys the fingers play).
export const lengthenThumb = (tpl, extra) => lengthenBone(tpl, CHAINS.thumb, 0, extra);
// Shared model preparation for rendering, map baking and contact checks.
// The selected hand keeps its skeletal proportions, with coplanar flexion
// axes, a shaped continuous skin, shallow detail and a uniform overall scale.
export function prepareTemplate(tpl, P = POSTURE, { subdivide = 1, sculpt = 1 } = {}) {
  let t = planarFingers(lengthenThumb(tpl, P.thumbExtra), P.planar ?? 1);
  (P.pinkyExtra || []).forEach((extra, k) => (t = lengthenBone(t, CHAINS.pinky, 1 + k, extra)));
  for (const [f, extras] of Object.entries(P.fingerExtra || {})) extras.forEach((extra, k) => (t = lengthenBone(t, CHAINS[f], 1 + k, extra)));
  for (let k = 0; k < subdivide; k++) t = subdivideTemplate(t);
  const palm = shapePalm(t, P.palmLength ?? 1);
  const shaped = shapeAnatomy(palm, P.anatomy ?? 1);
  const prepared = scaleTemplate(taperTemplate(sculptTemplate(shaped, sculpt), P.taper), P.scale ?? 1);
  return extendForearm(prepared, P.forearmExtra ?? 0, P.forearmWidth ?? 0.12);
}

// Extend only skin behind the wrist. The smooth continuation stays on the
// wrist bone; bind joints, pads, weights and all playing anatomy are shared.
export function extendForearm(tpl, extra = 0, widen = 0.12) {
  if (!(extra > 0)) return tpl;
  const rig = new HandRig(tpl), back = rig.toHand.clone().invert();
  const toHand = p => p.clone().sub(rig.origin).applyQuaternion(rig.toHand);
  const wrist = toHand(tpl.bind.get("wrist").p), v = new THREE.Vector3();
  let end = wrist.z;
  for (let i = 0; i < tpl.position.length / 3; i++)
    end = Math.max(end, toHand(v.fromArray(tpl.position, 3 * i)).z);
  const span = end - wrist.z;
  if (!(span > 1e-6)) return tpl;
  const position = tpl.position.slice();
  for (let i = 0; i < position.length / 3; i++) {
    const h = toHand(v.fromArray(position, 3 * i));
    if (!(h.z > wrist.z)) continue;
    const k = smooth((h.z - wrist.z) / span);
    h.z += extra * k;
    h.x = wrist.x + (h.x - wrist.x) * (1 + widen * k);
    h.applyQuaternion(back).add(rig.origin).toArray(position, 3 * i);
  }
  return { ...tpl, position, normal: smoothNormals(position, tpl.index) };
}

// A uniform refinement of the palm's length behind the knuckle row. Rest
// vertices and bind joints undergo the same transform; fingers keep their
// lengths, and no bone stretches during animation.
function shapePalm(tpl, ratio) {
  if (ratio === 1) return tpl;
  const rig = new HandRig(tpl);
  const back = rig.toHand.clone().invert();
  const shape = p => {
    const h = p.clone().sub(rig.origin).applyQuaternion(rig.toHand);
    if (h.z > 0) h.z *= ratio;
    return h.applyQuaternion(back).add(rig.origin);
  };
  const position = tpl.position.slice(), v = new THREE.Vector3();
  for (let i = 0; i < position.length / 3; i++) shape(v.fromArray(position, i * 3)).toArray(position, i * 3);
  const bind = new Map([...tpl.bind].map(([name, b]) => [name, { p: shape(b.p), q: b.q.clone() }]));
  return { ...tpl, position, bind, normal: smoothNormals(position, tpl.index) };
}

// Broad anatomical forms, before the millimetre-scale dorsal detail. This
// acts on the continuous skin, never the skeleton or its weights. The palm
// draws in behind the MCP row; the metacarpal planes remain broad rather
// than becoming four ribs. Each digit's dorsal and side profile continues
// across its joints, with protected palmar folds. The distal pad and nail
// domain is untouched, so the contact
// sphere derived by HandRig is exactly the same before and after shaping.
export function shapeAnatomy(tpl, amount = 1) {
  const strength = clamp(amount, 0, 1);
  if (!(strength > 0)) return tpl;
  const rig = new HandRig(tpl), position = tpl.position.slice();
  const fromHand = rig.toHand.clone().invert();
  const toH = (p) => p.clone().sub(rig.origin).applyQuaternion(rig.toHand);
  const wrist = toH(rig.bind.get("wrist").p);
  const heads = FINGERS.map((f) => toH(rig.bind.get(CHAINS[f][1]).p));
  const thumbBase = toH(rig.bind.get(CHAINS.thumb[0]).p);
  const thumbRoot = toH(rig.bind.get(CHAINS.thumb[1]).p);
  const phalanges = new Set(DIGITS.flatMap((d) => CHAINS[d].slice(1)).map((j) => tpl.names.indexOf(j)));
  const thumbBones = new Set(CHAINS.thumb.map((j) => tpl.names.indexOf(j)));
  const digits = DIGITS.map((digit) => {
    const chain = CHAINS[digit], distal = rig.bind.get(chain.at(-2));
    return {
      digit,
      ids: new Set(chain.slice(1).map((j) => tpl.names.indexOf(j))),
      line: chain.slice(1).map((j) => rig.bind.get(j).p),
      distal: rtInv(distal),
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(rig.bind.get(chain[1]).q),
    };
  });
  const source = new THREE.Vector3(), h = new THREE.Vector3(), normal = new THREE.Vector3();
  const local = new THREE.Vector3(), ab = new THREE.Vector3(), delta = new THREE.Vector3(), nearest = new THREE.Vector3();
  for (let i = 0; i < position.length / 3; i++) {
    source.fromArray(tpl.position, i * 3);
    h.copy(source).sub(rig.origin).applyQuaternion(rig.toHand);
    normal.fromArray(tpl.normal, i * 3).applyQuaternion(rig.toHand);
    let fingerWeight = 0, thumbWeight = 0;
    for (let c = 0; c < 4; c++) {
      const id = tpl.joints[i * 4 + c], w = tpl.weights[i * 4 + c];
      if (phalanges.has(id)) fingerWeight += w;
      if (thumbBones.has(id)) thumbWeight += w;
    }
    const palm = (1 - clamp(fingerWeight, 0, 1)) * smooth((h.z - 0.006) / 0.027);
    if (palm > 0) {
      // The ulnar edge has less bulk than the thenar side. Continue the
      // narrowing through the wrist, avoiding a shelf at the forearm seam.
      const ulnar = smooth((h.x * rig.chir + 0.005) / 0.025);
      const width = (0.075 + 0.095 * ulnar) * (1 - 0.65 * thumbWeight);
      h.x = wrist.x + (h.x - wrist.x) * (1 - strength * palm * width);
      // A low dorsal plane articulates the long palm. Its underside keeps
      // the thenar/hypothenar cushions and its skinning around the CMC.
      const dorsal = smooth((normal.y - 0.05) / 0.65);
      // Shape the upper palm's crown into distinct knuckle shoulders while
      // preserving the underside of the thumb root during opposition.
      const crown = Math.exp(-(((h.z - 0.025) / 0.030) ** 2));
      const upper = smooth((h.y + 0.023) / 0.024);
      h.x = wrist.x + (h.x - wrist.x) * (1 - strength * palm * upper * 0.14 * crown);
      const broad = Math.exp(-(((h.z - 0.052) / 0.043) ** 2));
      let plane = 0.0033 * broad;
      for (let k = 0; k < heads.length - 1; k++) {
        const t = clamp(h.z / wrist.z, 0, 1);
        const between = lerp((heads[k].x + heads[k + 1].x) / 2, wrist.x, 0.6 * t);
        plane += 0.0014 * Math.exp(-(((h.x - between) / 0.006) ** 2)) * broad;
      }
      h.y -= strength * palm * dorsal * plane;
      // Shape a broad saddle between the first metacarpal and index,
      // allowing the thumb root to read as part of the palm in oblique view.
      const webX = lerp(heads[0].x, thumbBase.x, 0.65);
      const webZ = lerp(thumbRoot.z, thumbBase.z, 0.35);
      const saddle = Math.exp(-(((h.x - webX) / 0.014) ** 2 + ((h.z - webZ) / 0.024) ** 2));
      h.y -= strength * palm * dorsal * 0.0022 * saddle;
    }
    h.applyQuaternion(fromHand).add(rig.origin).toArray(position, i * 3);
    for (const digit of digits) {
      let weight = 0;
      for (let c = 0; c < 4; c++) if (digit.ids.has(tpl.joints[i * 4 + c])) weight += tpl.weights[i * 4 + c];
      if (!(weight > 0)) continue;
      local.copy(source).applyQuaternion(digit.distal.q).add(digit.distal.p);
      // Stop before the DIP/IP. This also protects its complete pad-analysis
      // region, not only the nominal bone tip or the lowest single vertex.
      const terminal = smooth((local.z - 0.003) / 0.009);
      if (!(terminal > 0)) continue;
      let best = Infinity, segment = 0;
      for (let k = 0; k < digit.line.length - 1; k++) {
        const a = digit.line[k];
        ab.copy(digit.line[k + 1]).sub(a);
        const t = clamp(delta.copy(source).sub(a).dot(ab) / ab.lengthSq(), 0, 1);
        local.copy(a).addScaledVector(ab, t);
        const distance = local.distanceToSquared(source);
        if (distance < best) { best = distance; nearest.copy(local); segment = t; }
      }
      delta.copy(source).sub(nearest);
      const dorsal = delta.dot(digit.up);
      // Continue the side profile across joint shoulders. The palmar fold
      // retains its source width at the joint, where blended skinning needs
      // room to close; a whole unshaped cross-section would leave round beads.
      const waist = Math.sin(Math.PI * segment) ** 2;
      // Position, rather than the imported normal, defines the dorsal mask.
      // A few source seam vertices have zero normals; using those normals
      // here would create isolated dents that reverse when the finger bends.
      const surfaceUp = dorsal / Math.max(0.001, delta.length());
      const visible = smooth((surfaceUp + 0.10) / 0.65);
      const influence = strength * weight * terminal;
      // Keep a band around each palmar flexion fold, not just its centre
      // cross-section. Tiny source faces straddle the bend and otherwise
      // reverse near 78–100 degrees even though an ordinary curl is sound.
      const foldClear = smooth((Math.min(segment, 1 - segment) - 0.16) / 0.16);
      const across = influence * (0.21 * visible + 0.06 * waist * foldClear) * (digit.digit === "thumb" ? 0.8 : 1);
      const flatten = influence * (0.24 * visible + 0.035 * waist);
      // Separate lateral breadth from dorsal thickness: the back becomes a
      // broad plane while the palmar cushion remains round. No pad vertex or
      // joint position moves, including the contact domain's bounding extrema.
      delta.addScaledVector(digit.up, -dorsal).multiplyScalar(-across);
      if (dorsal > 0) delta.addScaledVector(digit.up, -dorsal * flatten);
      position[i * 3] += delta.x;
      position[i * 3 + 1] += delta.y;
      position[i * 3 + 2] += delta.z;
    }
  }
  return { ...tpl, position, normal: smoothNormals(position, tpl.index) };
}

// The digits and the palm shaped as a hand's, not a glove's: each digit's
// girth narrows from its knuckle to its tip — a little fuller over each
// joint, slimmer between them — and the palm's outer (little finger's) edge
// draws in toward the wrist, so the back of the hand is widest across its
// knuckles. `taper`: { tip, waist, palm } — the share a fingertip loses, the
// dip between two joints, the palm's edge at the wrist (0 leaves the model as
// it is). Bones, joints and skinning are unchanged; the skin moves in toward
// each digit's axis (its joints' line in the bind pose), as far as it belongs
// to that digit. Returns a new template.
export function taperTemplate(tpl, taper) {
  if (!taper || !(taper.tip > 0 || taper.waist > 0 || taper.palm > 0)) return tpl;
  const position = tpl.position.slice();
  const n = position.length / 3;
  const id = (j) => tpl.names.indexOf(j);
  const P = (j) => tpl.bind.get(j).p;
  const v = new THREE.Vector3(),
    q = new THREE.Vector3();
  const digits = DIGITS.map((d) => {
    const chain = CHAINS[d];
    // (The thumb's from its MCP, a long finger's from its knuckle; each the
    // joints of its own phalanges.)
    const line = (d === "thumb" ? chain.slice(1) : chain.slice(1)).map(P);
    const own = new Set((d === "thumb" ? chain.slice(1) : chain.slice(1)).map(id));
    const lens = line.slice(1).map((p, i) => p.distanceTo(line[i]));
    const total = lens.reduce((a, b) => a + b, 0);
    // (Where along the digit each joint is, 0 at its base.)
    const at = [0];
    for (const l of lens) at.push(at.at(-1) + l / total);
    return { d, line, own, lens, total, at, tip: taper.tip * (d === "thumb" ? 0.6 : d === "pinky" ? 0.8 : 1) };
  });
  for (let i = 0; i < n; i++) {
    v.fromArray(position, 3 * i);
    for (const g of digits) {
      let w = 0;
      for (let c = 0; c < 4; c++) if (g.own.has(tpl.joints[4 * i + c])) w += tpl.weights[4 * i + c];
      if (!(w > 0.01)) continue;
      // The nearest point of the digit's axis, and how far along it is.
      let best = Infinity,
        tAt = 0,
        seg = 0;
      const last = g.line.length - 2;
      for (let k = 0; k + 1 < g.line.length; k++) {
        const a = g.line[k],
          ab = _v.copy(g.line[k + 1]).sub(a);
        const raw = _v2.copy(v).sub(a).dot(ab) / ab.lengthSq();
        const h = clamp(raw, 0, 1);
        // (Beyond the digit's last joint its end keeps its length: only the
        // girth there narrows.)
        const p = _v2.copy(a).addScaledVector(ab, k === last ? Math.max(raw, 0) : h);
        const dist = p.distanceTo(v);
        if (dist < best) {
          best = dist;
          q.copy(p);
          tAt = g.at[k] + h * (g.at[k + 1] - g.at[k]);
          seg = h;
        }
      }
      // Narrower toward the tip, a little slimmer between two joints.
      const k = 1 - g.tip * smooth(tAt) - (taper.waist || 0) * Math.sin(Math.PI * seg) * (tAt < 0.97 ? 1 : 0);
      const s = 1 - w * (1 - k);
      position[3 * i] = q.x + (v.x - q.x) * s;
      position[3 * i + 1] = q.y + (v.y - q.y) * s;
      position[3 * i + 2] = q.z + (v.z - q.z) * s;
    }
  }
  if (taper.palm > 0) {
    // The palm's outer edge, drawn in toward the wrist (in the hand's frame:
    // x across, + the little finger's side on the right hand; z toward the
    // wrist), only behind the knuckles and only on that side of the palm.
    const rig = new HandRig({ ...tpl, position });
    const chir = tpl.hand === "right" ? 1 : -1;
    const toH = (p) => p.clone().sub(rig.origin).applyQuaternion(rig.toHand);
    const knuckles = FINGERS.map((f) => toH(P(CHAINS[f][1])));
    const zk = knuckles.reduce((a, b) => a + b.z, 0) / 4;
    const zw = toH(P("wrist")).z;
    const mid = 0.5 * (knuckles[0].x + knuckles[3].x);
    const thumbIds = new Set(CHAINS.thumb.map(id));
    const back = new THREE.Quaternion().copy(rig.toHand).invert();
    for (let i = 0; i < n; i++) {
      let wt = 0;
      for (let c = 0; c < 4; c++) if (thumbIds.has(tpl.joints[4 * i + c])) wt += tpl.weights[4 * i + c];
      const h = toH(v.fromArray(position, 3 * i));
      const u = chir * (h.x - mid);
      if (!(u > 0)) continue;
      const along = smooth((h.z - zk) / (zw - zk));
      if (!(along > 0)) continue;
      h.x = mid + chir * u * (1 - taper.palm * along * (1 - wt));
      const out = h.applyQuaternion(back).add(rig.origin);
      position[3 * i] = out.x;
      position[3 * i + 1] = out.y;
      position[3 * i + 2] = out.z;
    }
  }
  return { ...tpl, position, normal: smoothNormals(position, tpl.index) };
}
// Each long finger curling in one plane: the model's knuckle (MCP), middle
// (PIP) and last (DIP) joints turn about axes tilted against one another and
// against the hand, so a curling finger's tip swings 6–9 mm sideways (the
// index's toward the middle finger, the ring and little fingers' toward the
// thumb, as in a fist), and a curved finger on its key leans across it. The
// three joints' frames are turned (`amount` of the way) so they flex about
// one axis, the hand's own across its knuckles: curling then moves no
// fingertip sideways, and the knuckle's spread alone sets where it points.
// Positions, the mesh and its skinning are unchanged.
export function planarFingers(tpl, amount = 1) {
  if (!(amount > 0)) return tpl;
  const bind = new Map([...tpl.bind].map(([k, v]) => [k, { p: v.p.clone(), q: v.q.clone() }]));
  const chir = tpl.hand === "right" ? 1 : -1;
  const J = (j) => bind.get(j).p;
  const mid = J("middle-finger-phalanx-proximal").clone().add(J("ring-finger-phalanx-proximal")).multiplyScalar(0.5);
  const F = mid.clone().sub(J("wrist")).normalize();
  const U = J("pinky-finger-phalanx-proximal").clone().sub(J("index-finger-phalanx-proximal")).cross(F).multiplyScalar(chir).normalize();
  const S = F.clone().cross(U).normalize();
  for (const f of FINGERS) {
    const [, prox, inter, dist] = CHAINS[f];
    const axis = S.clone();
    if (axis.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(bind.get(prox).q)) < 0) axis.negate();
    for (const j of [prox, inter, dist]) {
      const b = bind.get(j);
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(b.q);
      const turn = new THREE.Quaternion().setFromUnitVectors(x, axis);
      b.q.premultiply(new THREE.Quaternion().slerp(turn, amount)).normalize();
    }
  }
  return { ...tpl, bind };
}
// The whole model (mesh and joints) `k` times its size, about the wrist.
export function scaleTemplate(tpl, k) {
  if (!(k > 0) || k === 1) return tpl;
  const o = tpl.bind.get("wrist").p;
  const position = tpl.position.slice();
  for (let i = 0; i < position.length; i += 3) {
    position[i] = o.x + (position[i] - o.x) * k;
    position[i + 1] = o.y + (position[i + 1] - o.y) * k;
    position[i + 2] = o.z + (position[i + 2] - o.z) * k;
  }
  const bind = new Map([...tpl.bind].map(([n, v]) => [n, { p: v.p.clone().sub(o).multiplyScalar(k).add(o), q: v.q.clone() }]));
  return { ...tpl, position, bind, scale: (tpl.scale ?? 1) * k };
}

// One level of Loop subdivision of the bind mesh: the model is low-poly
// (fingertips are octagons), so the silhouette is smoothed and the skin
// weights carried with it. Topology on welded positions (UV seams split
// vertices); new positions by Loop's masks; UVs linear; weights by the same
// masks (the four largest kept); smooth normals recomputed.
export function subdivideTemplate(tpl) {
  const P = tpl.position,
    UV = tpl.uv,
    J = tpl.joints,
    Wt = tpl.weights,
    I = tpl.index;
  const n = P.length / 3;
  const key = (i) => `${Math.round(P[3 * i] * 1e6)},${Math.round(P[3 * i + 1] * 1e6)},${Math.round(P[3 * i + 2] * 1e6)}`;
  const weldOf = new Int32Array(n);
  const welded = new Map();
  let wn = 0;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (!welded.has(k)) welded.set(k, wn++);
    weldOf[i] = welded.get(k);
  }
  const wpos = new Float64Array(wn * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) wpos[3 * weldOf[i] + c] = P[3 * i + c];
  const ek = (a, b) => (a < b ? a * wn + b : b * wn + a);
  const edges = new Map();
  const nbrs = Array.from({ length: wn }, () => new Set());
  const tris = I.length / 3;
  for (let t = 0; t < tris; t++) {
    const v = [weldOf[I[3 * t]], weldOf[I[3 * t + 1]], weldOf[I[3 * t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = v[e],
        b = v[(e + 1) % 3],
        c = v[(e + 2) % 3];
      const k = ek(a, b);
      if (!edges.has(k)) edges.set(k, { a, b, opp: [] });
      edges.get(k).opp.push(c);
      nbrs[a].add(b);
      nbrs[b].add(a);
    }
  }
  const boundary = new Uint8Array(wn);
  for (const e of edges.values()) if (e.opp.length !== 2) boundary[e.a] = boundary[e.b] = 1;
  const wsk = Array.from({ length: wn }, () => new Map());
  for (let i = 0; i < n; i++) {
    const m = wsk[weldOf[i]];
    if (m.size) continue;
    for (let k = 0; k < 4; k++) if (Wt[4 * i + k] > 0) m.set(J[4 * i + k], (m.get(J[4 * i + k]) || 0) + Wt[4 * i + k]);
  }
  const mix = (terms) => {
    const m = new Map();
    for (const [w, src] of terms) for (const [j, x] of src) m.set(j, (m.get(j) || 0) + w * x);
    return m;
  };
  const evenPos = new Float64Array(wn * 3);
  const evenSkin = new Array(wn);
  for (let v = 0; v < wn; v++) {
    const ns = [...nbrs[v]];
    const k = ns.length;
    if (boundary[v] || k < 3) {
      for (let c = 0; c < 3; c++) evenPos[3 * v + c] = wpos[3 * v + c];
      evenSkin[v] = wsk[v];
      continue;
    }
    const beta = k === 3 ? 3 / 16 : 3 / (8 * k);
    const self = 1 - k * beta;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (const u of ns) sum += wpos[3 * u + c];
      evenPos[3 * v + c] = self * wpos[3 * v + c] + beta * sum;
    }
    evenSkin[v] = mix([[self, wsk[v]], ...ns.map((u) => [beta, wsk[u]])]);
  }
  const edgePos = new Map(),
    edgeSkin = new Map();
  for (const [k, e] of edges) {
    const out = [0, 0, 0];
    if (e.opp.length === 2) {
      for (let c = 0; c < 3; c++) out[c] = (3 / 8) * (wpos[3 * e.a + c] + wpos[3 * e.b + c]) + (1 / 8) * (wpos[3 * e.opp[0] + c] + wpos[3 * e.opp[1] + c]);
      edgeSkin.set(k, mix([[3 / 8, wsk[e.a]], [3 / 8, wsk[e.b]], [1 / 8, wsk[e.opp[0]]], [1 / 8, wsk[e.opp[1]]]]));
    } else {
      for (let c = 0; c < 3; c++) out[c] = 0.5 * (wpos[3 * e.a + c] + wpos[3 * e.b + c]);
      edgeSkin.set(k, mix([[0.5, wsk[e.a]], [0.5, wsk[e.b]]]));
    }
    edgePos.set(k, out);
  }
  const pos = [],
    uv = [],
    sk = [],
    index = [];
  const emit = (p, t, skin) => {
    pos.push(p[0], p[1], p[2]);
    uv.push(t[0], t[1]);
    sk.push(skin);
    return pos.length / 3 - 1;
  };
  const oldIdx = new Int32Array(n).fill(-1);
  const getOld = (i) => {
    if (oldIdx[i] < 0) {
      const v = weldOf[i];
      oldIdx[i] = emit([evenPos[3 * v], evenPos[3 * v + 1], evenPos[3 * v + 2]], [UV[2 * i], UV[2 * i + 1]], evenSkin[v]);
    }
    return oldIdx[i];
  };
  const mids = new Map();
  const getMid = (i, j) => {
    const a = weldOf[i],
      b = weldOf[j];
    const k = ek(a, b);
    const u0 = 0.5 * (UV[2 * i] + UV[2 * j]),
      u1 = 0.5 * (UV[2 * i + 1] + UV[2 * j + 1]);
    const mk = `${k}|${Math.round(u0 * 1e5)},${Math.round(u1 * 1e5)}`;
    if (!mids.has(mk)) mids.set(mk, emit(edgePos.get(k), [u0, u1], edgeSkin.get(k)));
    return mids.get(mk);
  };
  for (let t = 0; t < tris; t++) {
    const [i0, i1, i2] = [I[3 * t], I[3 * t + 1], I[3 * t + 2]];
    const a = getOld(i0),
      b = getOld(i1),
      c = getOld(i2);
    const ab = getMid(i0, i1),
      bc = getMid(i1, i2),
      ca = getMid(i2, i0);
    index.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const m = pos.length / 3;
  const joints = new Uint16Array(m * 4),
    weights = new Float32Array(m * 4);
  for (let v = 0; v < m; v++) {
    const top = [...sk[v]].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const total = top.reduce((acc, [, w]) => acc + w, 0) || 1;
    top.forEach(([j, w], k) => {
      joints[4 * v + k] = j;
      weights[4 * v + k] = w / total;
    });
  }
  const position = Float32Array.from(pos);
  return { ...tpl, position, normal: smoothNormals(position, index), uv: Float32Array.from(uv), joints, weights, index: Uint32Array.from(index) };
}

// Surface detail the model lacks, sculpted into the bind mesh once: the
// knuckles (the heads of the metacarpals) stand out on the back of the hand
// with shallow valleys between them, the extensor tendons run as low ridges
// from the wrist to each knuckle, and each finger's middle knuckle (PIP)
// rounds a little. Displacements along the normals (mm-scale), normals
// recomputed. Returns a new template.
export function sculptTemplate(tpl, amount = 1) {
  if (!(amount > 0)) return tpl;
  // The source already has a rounded metacarpal bridge. Adding another
  // broad mound obscures the separate bones and makes a bent hand look
  // padded. Keep its volume, and describe the anatomy with low relief.
  const bridgeHeight = 0.00075;
  const mcpHeight = 0.0035;
  const pipHeight = 0.00035;
  const tendonHeight = 0.0003;
  const tendonWeight = [0.65, 1, 0.8, 0.35];
  const rig = new HandRig(tpl);
  const n = tpl.position.length / 3;
  const position = tpl.position.slice();
  const toH = (v) => v.clone().sub(rig.origin).applyQuaternion(rig.toHand);
  const P = (j) => toH(rig.bind.get(j).p);
  const wrist = P("wrist");
  const heads = FINGERS.map((f) => P(CHAINS[f][1]));
  const pips = FINGERS.map((f) => P(CHAINS[f][2]));
  const dips = FINGERS.map((f) => P(CHAINS[f][3]));
  // The source fingers fan out in bind space. Describe their relief in
  // each digit's own axis, so the little finger does not acquire the same
  // broad, upright joint caps as the longer middle finger.
  const fingerShape = FINGERS.map((f, j) => ({
    width: clamp(rig.pads[f].r / rig.pads.middle.r, 0.75, 1.08),
    axis: new THREE.Vector2(pips[j].x - heads[j].x, pips[j].z - heads[j].z).normalize(),
  }));
  const jointRelief = (p, centre, j, acrossRadius, alongRadius, power = 2) => {
    const { axis, width } = fingerShape[j];
    const dx = p.x - centre.x, dz = p.z - centre.z;
    const along = (dx * axis.x + dz * axis.y) / (alongRadius * width);
    const across = (dx * axis.y - dz * axis.x) / (acrossRadius * width);
    return Math.exp(-(Math.abs(across) ** power + Math.abs(along) ** power));
  };
  const bridge = heads.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / heads.length);
  // (Tendons converge toward the middle of the wrist.)
  const tendonFrom = heads.map((h) => new THREE.Vector3(lerp(h.x, wrist.x, 0.55), h.y, wrist.z * 0.92));
  const segDist = (p, a, b) => {
    // Locate a tendon on the back's surface, not at the internal bone's
    // height. A 3-D distance suppresses all relief when skin sits several
    // millimetres above the joint line.
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    return { d: Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t), t };
  };
  const v = new THREE.Vector3(),
    nn = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const modelUp = up.clone().applyQuaternion(rig.toHand.clone().invert());
  for (let i = 0; i < n; i++) {
    v.set(tpl.position[3 * i], tpl.position[3 * i + 1], tpl.position[3 * i + 2]);
    nn.set(tpl.normal[3 * i], tpl.normal[3 * i + 1], tpl.normal[3 * i + 2]);
    const h = toH(v);
    const nh = nn.clone().applyQuaternion(rig.toHand);
    const dorsal = smooth((nh.dot(up) - 0.15) / 0.5);
    if (!(dorsal > 0)) continue;
    // A very shallow dorsal bridge joins the separate knuckle pads.
    // Only the back-facing skin moves: playing pads and bind joints retain
    // their dimensions, and this volume follows the existing skin weights.
    const bridgeX = h.x - bridge.x, bridgeZ = h.z - (bridge.z + 0.011);
    let disp = bridgeHeight * Math.exp(-((bridgeX * bridgeX) / (0.03 * 0.03) + (bridgeZ * bridgeZ) / (0.022 * 0.022)));
    heads.forEach((k, j) => {
      // Each head remains distinct, with the long axis running into the
      // finger rather than swelling sideways into its neighbour.
      disp += (j === 3 ? 0.75 : 1) * mcpHeight * jointRelief(h, k, j, 0.0065, 0.01);
    });
    for (let j = 0; j < 3; j++) {
      // The valleys between neighbouring knuckles, just behind them.
      const m = heads[j].clone().add(heads[j + 1]).multiplyScalar(0.5);
      const dx = h.x - m.x,
        dz = h.z - (m.z + 0.006);
      disp -= 0.00052 * Math.exp(-((dx * dx) / (0.0045 * 0.0045) + (dz * dz) / (0.014 * 0.014)));
    }
    heads.forEach((k, j) => {
      // Subtle, unequal extensor tendons. They disappear within the back
      // of the hand rather than forming parallel ribs into the wrist.
      const { d, t } = segDist(h, k.clone().add(new THREE.Vector3(0, 0, 0.012)), tendonFrom[j]);
      const along = smooth(t / 0.12) * (1 - smooth((t - 0.3) / 0.35));
      disp += tendonWeight[j] * tendonHeight * Math.exp(-(d * d) / (0.0032 * 0.0032)) * along;
    });
    // The shaped PIP already has its joint volume. A spherical normal
    // displacement here rebuilds a cap wider than the shaft below it.
    // Keep only a low, longitudinal dorsal plane, without spreading the
    // sides back out after the anatomical profile has narrowed them.
    let jointLift = 0;
    pips.forEach((k, j) => {
      jointLift += pipHeight * jointRelief(h, k, j, 0.0055, 0.012, 4);
    });
    // The back of a phalanx is a soft plane between its rounded joints,
    // rather than another smaller cylinder. Lower the dorsal crest in the
    // hand-up direction; pulling along every vertex normal would also
    // round the sides and leave the tube-like cross-section intact. The
    // fourth-power falloff makes a broad, shallow plane, with smooth edges.
    // Stop before the distal phalanx and leave all playing skin in place.
    let plane = 0;
    for (let j = 0; j < FINGERS.length; j++) {
      for (const [a, b, depth] of [[heads[j], pips[j], 0.0009], [pips[j], dips[j], 0.00055]]) {
        const { d, t } = segDist(h, a, b);
        const waist = Math.exp(-(((t - 0.53) / 0.23) ** 2));
        plane += depth * waist * Math.exp(-((d / (0.0065 * fingerShape[j].width)) ** 4));
      }
    }
    disp *= dorsal * amount;
    plane *= dorsal * amount;
    jointLift *= dorsal * amount;
    position[3 * i] += nn.x * disp + modelUp.x * (jointLift - plane);
    position[3 * i + 1] += nn.y * disp + modelUp.y * (jointLift - plane);
    position[3 * i + 2] += nn.z * disp + modelUp.z * (jointLift - plane);
  }
  // The fingertips taper over their last few millimetres — narrower across,
  // the nail plate a little flatter — so each ends in a pad, not a
  // cylinder's end.
  for (const f of FINGERS) {
    const [, , , dist, tip] = CHAINS[f];
    const ids = new Set([tpl.names.indexOf(dist), tpl.names.indexOf(tip)]);
    const b = rig.bind.get(dist);
    const inv = rtInv(b);
    const pad = rig.pads[f];
    for (let i = 0; i < n; i++) {
      if (!ids.has(rig.dominant[i])) continue;
      const local = rtApply(inv, v.set(position[3 * i], position[3 * i + 1], position[3 * i + 2]));
      const t = smooth((-local.z - (pad.len - 0.0048)) / 0.0048) * amount;
      if (!(t > 0)) continue;
      local.x = pad.c.x + (local.x - pad.c.x) * (1 - 0.15 * t);
      if (local.y > pad.c.y) local.y = pad.c.y + (local.y - pad.c.y) * (1 - 0.1 * t);
      const out = rtApply(b, local);
      position[3 * i] = out.x;
      position[3 * i + 1] = out.y;
      position[3 * i + 2] = out.z;
    }
  }
  return { ...tpl, position, normal: smoothNormals(position, tpl.index) };
}

// Area-weighted smooth normals, shared across vertices at one position (UV
// seams do not crease the shading).
export function smoothNormals(position, index) {
  const m = position.length / 3;
  const normal = new Float32Array(m * 3);
  const acc = new Map();
  const pk = (v) => `${Math.round(position[3 * v] * 1e6)},${Math.round(position[3 * v + 1] * 1e6)},${Math.round(position[3 * v + 2] * 1e6)}`;
  const A = new THREE.Vector3(),
    B = new THREE.Vector3(),
    C = new THREE.Vector3(),
    e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();
  const keys = new Array(m);
  for (let v = 0; v < m; v++) keys[v] = pk(v);
  for (let t = 0; t < index.length; t += 3) {
    A.fromArray(position, 3 * index[t]);
    B.fromArray(position, 3 * index[t + 1]);
    C.fromArray(position, 3 * index[t + 2]);
    const nrm = e1.subVectors(B, A).cross(e2.subVectors(C, A)).clone();
    for (let k = 0; k < 3; k++) {
      const key2 = keys[index[t + k]];
      if (!acc.has(key2)) acc.set(key2, new THREE.Vector3());
      acc.get(key2).add(nrm);
    }
  }
  for (let v = 0; v < m; v++) {
    const nn = acc.get(keys[v]).clone().normalize();
    normal[3 * v] = nn.x;
    normal[3 * v + 1] = nn.y;
    normal[3 * v + 2] = nn.z;
  }
  return normal;
}

// ---- rigid transforms { p: Vector3, q: Quaternion } -----------------------------------------
const rt = (p = new THREE.Vector3(), q = new THREE.Quaternion()) => ({ p, q });
const rtCopy = (a) => rt(a.p.clone(), a.q.clone());
function rtMul(a, b) {
  return rt(b.p.clone().applyQuaternion(a.q).add(a.p), a.q.clone().multiply(b.q));
}
function rtInv(a) {
  const q = a.q.clone().invert();
  return rt(a.p.clone().negate().applyQuaternion(q), q);
}
const rtApply = (a, v) => v.clone().applyQuaternion(a.q).add(a.p);
const rot = (q) => rt(new THREE.Vector3(), q);

// Gaussian elimination with partial pivoting (small dense systems); null if
// singular.
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-15)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let j = r + 1; j < n; j++) sum -= M[r][j] * x[j];
    x[r] = sum / M[r][r];
  }
  return x;
}

// ---- the rig ---------------------------------------------------------------------------------
export class HandRig {
  constructor(tpl) {
    this.hand = tpl.hand;
    // (The model's size against the original: POSTURE.scale.)
    this.scale = tpl.scale ?? 1;
    // (+1 right, −1 left: spreading toward the little finger is a turn about
    // the joint's −Y on the right hand, +Y on the left.)
    this.chir = tpl.hand === "right" ? 1 : -1;
    this.names = tpl.names;
    this.bind = tpl.bind;
    this.local = new Map();
    for (const [name, b] of this.bind) {
      const par = PARENT[name];
      this.local.set(name, par ? rtMul(rtInv(this.bind.get(par)), b) : rtCopy(b));
    }
    // The hand's frame in model space: origin midway between the middle and
    // ring knuckles (the engine's palm centre); F along the hand toward the
    // fingers, U out of its back, S = F × U (the little finger's side on the
    // right hand, the thumb's on the left: world +x either way).
    const P = (j) => this.bind.get(j).p;
    const O = P("middle-finger-phalanx-proximal").clone().add(P("ring-finger-phalanx-proximal")).multiplyScalar(0.5);
    const F = O.clone().sub(P("wrist")).normalize();
    const across = P("pinky-finger-phalanx-proximal").clone().sub(P("index-finger-phalanx-proximal"));
    const U = across.clone().cross(F).multiplyScalar(this.chir).normalize();
    U.addScaledVector(F, -U.dot(F)).normalize();
    const S = F.clone().cross(U);
    this.origin = O;
    // Model → hand frame (x = S, y = U, z = −F).
    this.toHand = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(S, U, F.clone().negate())).invert();
    this.analysePads(tpl);
    this.cache = new Map();
  }

  // Each digit's pad: a sphere at its rounded end in the distal joint's frame
  // (the contact is the sphere's lowest point), and the nail's centre on the
  // back of the digit.
  analysePads(tpl) {
    const { position, joints, weights, names } = tpl;
    const n = position.length / 3;
    const dominant = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0,
        bw = -1;
      for (let k = 0; k < 4; k++)
        if (weights[4 * i + k] > bw) {
          bw = weights[4 * i + k];
          best = joints[4 * i + k];
        }
      dominant[i] = best;
    }
    this.dominant = dominant;
    this.pads = {};
    for (const d of DIGITS) {
      const chain = CHAINS[d];
      const distal = chain.at(-2),
        tip = chain.at(-1);
      const ids = new Set([names.indexOf(distal), names.indexOf(tip)]);
      const inv = rtInv(this.bind.get(distal));
      const pts = [];
      for (let i = 0; i < n; i++) if (ids.has(dominant[i])) pts.push(rtApply(inv, new THREE.Vector3(position[3 * i], position[3 * i + 1], position[3 * i + 2])));
      const end = Math.min(...pts.map((p) => p.z));
      const near = pts.filter((p) => p.z < end + 0.009);
      const xs = near.map((p) => p.x),
        ys = near.map((p) => p.y);
      const halfW = 0.5 * (Math.max(...xs) - Math.min(...xs)),
        halfT = 0.5 * (Math.max(...ys) - Math.min(...ys));
      const r = 0.5 * (halfW + halfT);
      const c = new THREE.Vector3(0.5 * (Math.max(...xs) + Math.min(...xs)), 0.5 * (Math.max(...ys) + Math.min(...ys)), end + r);
      const top = Math.max(...pts.map((p) => p.y));
      this.pads[d] = { c, r, end, len: -end, top, nail: new THREE.Vector3(c.x, top, end + 0.0075) };
    }
  }

  // Model-space transforms of every joint for the given angles:
  //   angles[f] = { abd, mcp, pip, dip } (fingers), angles.thumb = { flex, abd, twist, mcp, ip },
  //   angles.arch = { ring, pinky } (metacarpals toward the palm).
  fk(angles) {
    const W = new Map();
    W.set("wrist", rtCopy(this.bind.get("wrist")));
    for (const f of FINGERS) {
      const [meta, prox, inter, dist, tip] = CHAINS[f];
      const a = angles[f];
      const arch = angles.arch?.[f] || 0;
      W.set(meta, rtMul(rtMul(W.get("wrist"), this.local.get(meta)), rot(qAxis(AX, -arch))));
      W.set(prox, rtMul(rtMul(W.get(meta), this.local.get(prox)), rot(this.mcpQ(a.abd, a.mcp))));
      W.set(inter, rtMul(rtMul(W.get(prox), this.local.get(inter)), rot(qAxis(AX, -a.pip))));
      W.set(dist, rtMul(rtMul(W.get(inter), this.local.get(dist)), rot(qAxis(AX, -a.dip))));
      W.set(tip, rtMul(W.get(dist), this.local.get(tip)));
    }
    const [tm, tp, td, tt] = CHAINS.thumb;
    const t = angles.thumb;
    W.set(tm, rtMul(rtMul(W.get("wrist"), this.local.get(tm)), rot(this.cmcQ(t.flex, t.abd, t.twist))));
    W.set(tp, rtMul(rtMul(W.get(tm), this.local.get(tp)), rot(qAxis(AX, -t.mcp))));
    W.set(td, rtMul(rtMul(W.get(tp), this.local.get(td)), rot(qAxis(AX, -t.ip))));
    W.set(tt, rtMul(W.get(td), this.local.get(tt)));
    return W;
  }
  // MCP: spread about the joint's Y (toward the little finger +), then flexion.
  mcpQ(abd, mcp) {
    return qAxis(AY, -this.chir * abd).multiply(qAxis(AX, -mcp));
  }
  // Thumb CMC: palmar abduction about the metacarpal's Y, flexion across the
  // palm about its X, and the opposition turn about its own axis.
  cmcQ(flex, abd, twist) {
    return qAxis(AY, this.chir * abd).multiply(qAxis(AX, -flex)).multiply(qAxis(AZ, -this.chir * twist));
  }
  thumbIp(mcp, P = POSTURE) {
    return P.thumbIp.base + P.thumbIp.share * Math.max(0, mcp);
  }
  thumbTwist(flex, P = POSTURE) {
    return P.thumbTwist.base + P.thumbTwist.perFlex * flex;
  }

  // ---- fingers 2–5 ----
  // The pad centre in the MCP's frame (before the MCP turns) for a PIP and a
  // DIP angle.
  fingerReachPD(f, pip, dip, out = new THREE.Vector3()) {
    const [, , inter, dist] = CHAINS[f];
    const ld = this.local.get(dist),
      li = this.local.get(inter);
    const v = out.copy(this.pads[f].c).applyQuaternion(_q.setFromAxisAngle(AX, -dip));
    v.applyQuaternion(ld.q).add(ld.p);
    v.applyQuaternion(_q.setFromAxisAngle(AX, -pip));
    return v.applyQuaternion(li.q).add(li.p);
  }
  // (Its distance from the knuckle only, for the searches: no new vector.)
  fingerReachLen(f, pip, dip) {
    return this.fingerReachPD(f, pip, dip, _v).length();
  }
  // The PIP angle (within lo…hi) at which the pad, its DIP at `dip`, is `d`
  // from the knuckle — in closed form: with the last joint fixed, the pad
  // turns about the PIP's axis on a circle, so its distance from the knuckle
  // squared is a + b·cos(pip) + c·sin(pip).
  pipForLength(f, dip, d, lo, hi) {
    const [, , inter, dist] = CHAINS[f];
    const ld = this.local.get(dist),
      li = this.local.get(inter);
    // v2: the pad in the PIP's frame before it turns; u: the PIP's offset
    // from the knuckle, in the same frame.
    const v2 = _v.copy(this.pads[f].c).applyQuaternion(_q.setFromAxisAngle(AX, -dip)).applyQuaternion(ld.q).add(ld.p);
    const u = _v2.copy(li.p).applyQuaternion(_q.copy(li.q).invert());
    // |Rx(θ) v2 + u|² = |v2|² + |u|² + 2 (u.x v2.x + cosθ (u.y v2.y + u.z v2.z) + sinθ (u.z v2.y − u.y v2.z)), θ = −pip.
    const B = u.y * v2.y + u.z * v2.z,
      C = u.z * v2.y - u.y * v2.z;
    const K = (d * d - v2.lengthSq() - u.lengthSq()) / 2 - u.x * v2.x;
    const R = Math.hypot(B, C);
    if (!(R > 1e-12)) return 0.5 * (lo + hi);
    const phi = Math.atan2(C, B);
    const a = Math.acos(clamp(K / R, -1, 1));
    // (θ = φ ± a; the root that lies in the range.)
    let best = null;
    for (const theta of [phi + a, phi - a]) {
      const pip = -wrap(theta);
      for (const p of [pip, pip + 2 * Math.PI, pip - 2 * Math.PI])
        if (p >= lo - 1e-9 && p <= hi + 1e-9 && (best == null || Math.abs(this.fingerReachLen(f, p, dip) - d) < Math.abs(this.fingerReachLen(f, best, dip) - d))) best = p;
    }
    return best == null ? 0.5 * (lo + hi) : clamp(best, lo, hi);
  }
  // … with the DIP coupled to the PIP.
  fingerReach(f, pip, P = POSTURE) {
    return this.fingerReachPD(f, pip, P.dipShare * pip);
  }
  // The MCP's frame (model space) with the metacarpal arched.
  mcpFrame(f, arch = 0) {
    const byFinger = (this.mcpFrames ??= {});
    const memo = (byFinger[f] ??= new Map());
    let m = memo.get(arch);
    if (!m) {
      const [meta, prox] = CHAINS[f];
      m = rtMul(rtMul(rtMul(this.bind.get("wrist"), this.local.get(meta)), rot(qAxis(AX, -arch))), this.local.get(prox));
      if (memo.size > 16) memo.clear();
      memo.set(arch, m);
    }
    // (Shared: every caller makes new transforms from it, never changes it.)
    return m;
  }
  // The DIP angle that sets a finger's last joint at `alpha` below the
  // horizontal (toward its tip) as its pad reaches `t` (MCP frame): the
  // finger as a planar three-link chain in its plane of flexion — the DIP
  // joint stands where the last joint at that angle puts the pad on `t`, the
  // two first links reach it (the PIP bends, the knuckle up). `down` is the
  // world's downward direction in the MCP's frame. Null when it cannot.
  planarDip(f, t, down, alpha, L = LIMITS) {
    const geo = (this.planar ??= {})[f] ??
      (this.planar[f] = (() => {
        const [, , inter, dist] = CHAINS[f];
        const c = this.pads[f].c;
        return { L1: this.local.get(inter).p.length(), L2: this.local.get(dist).p.length(), a: -c.z, b: c.y };
      })());
    // (A long finger near its knuckle would bend its last joint backward at
    // that angle: it stands steeper instead, just enough to keep that joint
    // a little curved — never collapsed.)
    // (And one reaching far from its knuckle would bend only its last joint:
    // it lies flatter instead, its last joint bent no more than its middle
    // one would carry.)
    const at = (a) => this.planarDipAt(geo, t, down, a);
    const dipMin = typeof L.dipMin === "number" ? L.dipMin : L.dipMin[f];
    const over = (a) => {
      const r = at(a);
      return r ? r.dip - (L.dipShareMax * r.pip + dipMin) : null;
    };
    let r = at(alpha);
    if (!r) return null;
    if (r.dip < dipMin) {
      let lo = alpha,
        hi = alpha + 40 * DEG;
      if (!((at(hi)?.dip ?? -1) >= dipMin)) r = at(hi) || r;
      else {
        for (let k = 0; k < 8; k++) {
          const mid = 0.5 * (lo + hi);
          if (at(mid).dip < dipMin) lo = mid;
          else hi = mid;
        }
        r = at(hi);
      }
    } else if (over(alpha) > 0) {
      let lo = alpha - 55 * DEG,
        hi = alpha;
      if ((over(lo) ?? 1) > 0) r = at(lo) || r;
      else {
        for (let k = 0; k < 8; k++) {
          const mid = 0.5 * (lo + hi);
          if (over(mid) > 0) hi = mid;
          else lo = mid;
        }
        r = at(lo);
      }
    }
    return clamp(r.dip, L.dip[0], L.dip[1]);
  }
  planarDipAt(geo, t, down, alpha) {
    // Into the finger's plane (the spread turned out).
    const turn = Math.atan2(t.x, -t.z);
    const back = qAxis(AY, turn);
    const t2 = t.clone().applyQuaternion(back),
      d2 = down.clone().applyQuaternion(back);
    // 2-D (forward along the finger, up out of its back).
    const T = [-t2.z, t2.y];
    let D = [-d2.z, d2.y];
    const dl = Math.hypot(D[0], D[1]);
    if (!(dl > 0.2)) return null;
    D = [D[0] / dl, D[1] / dl];
    let Fh = [-D[1], D[0]];
    if (Fh[0] < 0) Fh = [-Fh[0], -Fh[1]];
    const dir = [Math.cos(alpha) * Fh[0] + Math.sin(alpha) * D[0], Math.cos(alpha) * Fh[1] + Math.sin(alpha) * D[1]];
    const nrm = [-dir[1], dir[0]];
    const J = [T[0] - geo.a * dir[0] - geo.b * nrm[0], T[1] - geo.a * dir[1] - geo.b * nrm[1]];
    const { L1, L2 } = geo;
    const d = clamp(Math.hypot(J[0], J[1]), Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
    const pip = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const gamma = Math.atan2(-J[1], J[0]);
    const mcp = gamma - Math.atan2(L2 * Math.sin(pip), L1 + L2 * Math.cos(pip));
    const psi = Math.atan2(-dir[1], dir[0]);
    return { dip: psi - mcp - pip, pip };
  }
  // Joint angles putting a finger's pad centre at `target` (model space): the
  // PIP sets the pad's distance from the knuckle (the DIP coupled to it, or
  // set so the last joint meets the key at `aim.alpha` below the horizontal,
  // `aim.down` the world's downward direction in model space), the MCP's
  // flexion and spread turn the finger to it. { abd, mcp, pip, dip, err }.
  solveFinger(f, target, arch = 0, P = POSTURE, aim = null, L = LIMITS) {
    const frame = this.mcpFrame(f, arch);
    const inv = rtInv(frame);
    const t = rtApply(inv, target);
    const d = t.length();
    let dipOf = (pip) => P.dipShare * pip;
    let fixedDip = null;
    if (aim) {
      const dip = this.planarDip(f, t, aim.down.clone().applyQuaternion(inv.q), aim.alpha, L);
      if (dip != null) {
        dipOf = () => dip;
        fixedDip = dip;
      }
    }
    const lenAt = (pip) => this.fingerReachLen(f, pip, dipOf(pip));
    let lo = L.pip[0],
      hi = L.pip[1];
    let pip;
    if (d >= lenAt(lo)) pip = lo;
    else if (d <= lenAt(hi)) pip = hi;
    else if (fixedDip != null) pip = this.pipForLength(f, fixedDip, d, lo, hi);
    else {
      for (let k = 0; k < 16; k++) {
        const mid = 0.5 * (lo + hi);
        if (lenAt(mid) > d) lo = mid;
        else hi = mid;
      }
      pip = 0.5 * (lo + hi);
    }
    const dip = dipOf(pip);
    const e = this.fingerReachPD(f, pip, dip);
    // Flexion (a turn about X by −mcp) sets the pad's height in the frame;
    // the spread (about Y) its direction across. Two flexions give the
    // height: the one (within the joint limits) that lands nearer — a curled
    // finger's pad can point back toward the palm, so either may be it.
    const rho = Math.hypot(e.y, e.z);
    const beta = Math.atan2(e.z, e.y);
    const ty = clamp(t.y, -rho, rho);
    const [sLo, sHi] = L.spread[f];
    const branch = (m) => {
      const mcp = clamp(wrap(m), L.mcp[0], L.mcp[1]);
      const zr = -e.y * Math.sin(mcp) + e.z * Math.cos(mcp);
      const turn = wrap(Math.atan2(t.x, t.z) - Math.atan2(e.x, zr));
      // (A turn about +Y by `turn`; the spread is measured toward the little finger.)
      const abd = clamp(-this.chir * turn, sLo, sHi);
      const err = e.clone().applyQuaternion(this.mcpQ(abd, mcp)).distanceTo(t);
      return { abd, mcp, pip, dip, err, turn: Math.abs(turn) };
    };
    const b1 = branch(beta + Math.acos(ty / rho)),
      b2 = branch(beta - Math.acos(ty / rho));
    const out = b1.err < b2.err - 1e-7 || (Math.abs(b1.err - b2.err) <= 1e-7 && b1.turn <= b2.turn) ? b1 : b2;
    delete out.turn;
    return out;
  }
  // A finger's joints (model space) for its angles: its MCP, PIP, DIP frames.
  fkFinger(f, a, arch = 0) {
    const [, prox, inter, dist] = CHAINS[f];
    const W = new Map();
    const m = this.mcpFrame(f, arch);
    W.set(prox, rtMul(m, rot(this.mcpQ(a.abd, a.mcp))));
    W.set(inter, rtMul(rtMul(W.get(prox), this.local.get(inter)), rot(qAxis(AX, -a.pip))));
    W.set(dist, rtMul(rtMul(W.get(inter), this.local.get(dist)), rot(qAxis(AX, -a.dip))));
    return W;
  }
  // A finger's pad centre (model space) for its angles.
  fingerPad(f, a, arch = 0) {
    const e = this.fingerReachPD(f, a.pip, a.dip).applyQuaternion(this.mcpQ(a.abd, a.mcp));
    return rtApply(this.mcpFrame(f, arch), e);
  }

  // ---- the thumb ----
  // The pad centre in the CMC's frame before the CMC turns, for an MCP angle
  // (the IP coupled).
  thumbReach(mcp, P = POSTURE, out = new THREE.Vector3()) {
    const [, tp, td] = CHAINS.thumb;
    const ld = this.local.get(td),
      lp = this.local.get(tp);
    const v = out.copy(this.pads.thumb.c).applyQuaternion(_q.setFromAxisAngle(AX, -this.thumbIp(mcp, P)));
    v.applyQuaternion(ld.q).add(ld.p);
    v.applyQuaternion(_q.setFromAxisAngle(AX, -mcp));
    return v.applyQuaternion(lp.q).add(lp.p);
  }
  thumbReachLen(mcp, P = POSTURE) {
    return this.thumbReach(mcp, P, _v2).length();
  }
  // The MCP angle at which the thumb reaches furthest, over all a thumb
  // does (memoised).
  thumbLongest(P = POSTURE) {
    const key = `${P.thumbIp.base}|${P.thumbIp.share}`;
    if (this._longestKey !== key) {
      let best = STRAINED.thumbMcp[0],
        bl = 0;
      for (let a = STRAINED.thumbMcp[0]; a <= STRAINED.thumbMcp[1]; a += 0.5 * DEG) {
        const l = this.thumbReach(a, P).length();
        if (l > bl) {
          bl = l;
          best = a;
        }
      }
      this._longest = best;
      this._longestKey = key;
    }
    return this._longest;
  }
  thumbFrame() {
    return rtMul(this.bind.get("wrist"), this.local.get("thumb-metacarpal"));
  }
  // Joint angles putting the thumb's pad centre at `target` (model space). The
  // MCP (IP coupled) sets the pad's distance from the CMC; the CMC's flexion
  // and abduction turn the thumb to it, with its opposition following the
  // flexion (a few fixed-point rounds). { flex, abd, twist, mcp, ip, err }.
  solveThumb(target, P = POSTURE, L = LIMITS, soft = 0) {
    const frame = this.thumbFrame();
    const t = rtApply(rtInv(frame), target);
    const lenAt = (mcp) => this.thumbReachLen(mcp, P);
    // (`soft` m: a thumb only hovering keeps that far inside its full reach,
    // reaching for it smoothly — at full stretch a thumb's length hardly
    // changes with its MCP, so the last millimetres would swing it from
    // straight to bent between two frames.)
    let d = t.length();
    if (soft > 0) {
      const top = lenAt(Math.max(L.thumbMcp[0], this.thumbLongest(P))) - soft;
      if (d > top) d = top + soft * (1 - Math.exp(-(d - top) / soft));
    }
    // (The reach falls as the MCP bends from where it is longest.)
    let lo = Math.max(L.thumbMcp[0], this.thumbLongest(P)),
      hi = L.thumbMcp[1];
    let mcp;
    let fLo = lenAt(lo) - d,
      fHi = lenAt(hi) - d;
    if (fLo <= 0) mcp = lo;
    else if (fHi >= 0) mcp = hi;
    else {
      // (The reach falls smoothly with the MCP: false position, Illinois —
      // a few steps where halving took sixteen.)
      let side = 0;
      mcp = 0.5 * (lo + hi);
      for (let k = 0; k < 12; k++) {
        mcp = (lo * fHi - hi * fLo) / (fHi - fLo);
        const fm = lenAt(mcp) - d;
        if (Math.abs(fm) < 1e-7 || hi - lo < 1e-6) break;
        if (fm > 0) {
          lo = mcp;
          fLo = fm;
          if (side === 1) fHi /= 2;
          side = 1;
        } else {
          hi = mcp;
          fHi = fm;
          if (side === -1) fLo /= 2;
          side = -1;
        }
      }
    }
    const e0 = this.thumbReach(mcp, P);
    let flex = P.thumb.flex,
      abd = P.thumb.abd;
    for (let round = 0; round < 5; round++) {
      const twist = this.thumbTwist(flex, P);
      const e = e0.clone().applyQuaternion(qAxis(AZ, -this.chir * twist));
      // Flexion about X sets the pad's height in the frame (y), then the
      // abduction about Y its direction in x/z.
      const rho = Math.hypot(e.y, e.z);
      const beta = Math.atan2(e.z, e.y);
      const ty = clamp(t.y, -rho, rho);
      // (The branch that keeps the thumb pointing along its bone, as for the
      // fingers.)
      flex = clamp(wrap(beta + Math.acos(ty / rho)), L.cmcFlex[0], L.cmcFlex[1]);
      const zr = -e.y * Math.sin(flex) + e.z * Math.cos(flex);
      const turn = wrap(Math.atan2(t.x, t.z) - Math.atan2(e.x, zr));
      abd = clamp(this.chir * turn, L.cmcAbd[0], L.cmcAbd[1]);
    }
    const twist = this.thumbTwist(flex, P);
    const out = { flex, abd, twist, mcp, ip: this.thumbIp(mcp, P) };
    out.err = this.thumbPad(out, P).distanceTo(target);
    return out;
  }
  thumbPad(a, P = POSTURE) {
    const e = this.thumbReach(a.mcp, P).applyQuaternion(this.cmcQ(a.flex, a.abd, a.twist));
    return rtApply(this.thumbFrame(), e);
  }

  // Every digit's pad centre relative to the hand's origin, in the hand frame
  // (x = S, y = U, z = −F), for a set of angles (memoised by key).
  padsInHand(angles, key) {
    if (key && this.cache.has(key)) return this.cache.get(key);
    const W = this.fk(angles);
    const out = DIGITS.map((d) => {
      const dist = W.get(CHAINS[d].at(-2));
      return rtApply(dist, this.pads[d].c).sub(this.origin).applyQuaternion(this.toHand);
    });
    if (key) this.cache.set(key, out);
    return out;
  }
  // Each finger's knuckle (MCP) relative to the origin, hand frame.
  knucklesInHand(arch = {}) {
    return FINGERS.map((f) => this.mcpFrame(f, arch[f] || 0).p.clone().sub(this.origin).applyQuaternion(this.toHand));
  }
  thumbBaseInHand() {
    return this.thumbFrame().p.clone().sub(this.origin).applyQuaternion(this.toHand);
  }
  // The longest a finger reaches from its knuckle (pad centre), straight.
  maxReach(f) {
    if (f !== "thumb") return this.fingerReach(f, 0).length();
    let best = 0;
    for (let a = STRAINED.thumbMcp[0]; a <= STRAINED.thumbMcp[1]; a += 0.5 * DEG) best = Math.max(best, this.thumbReach(a).length());
    return best;
  }
  // The direction of a finger's last joint (toward its tip) in the hand
  // frame, for its angles.
  distalDir(f, a, arch = 0) {
    const W = this.fkFinger(f, a, arch);
    return new THREE.Vector3(0, 0, -1).applyQuaternion(W.get(CHAINS[f][3]).q).applyQuaternion(this.toHand);
  }
  // Each digit's comfortable pose and its pad from the hand's origin (hand
  // frame) on white and on black keys: the pads laid out as
  // POSTURE.comfort has them (with the hand level at its natural pitch),
  // each digit solved onto its pad, a long finger's last joint at the
  // fingertip's angle. Memoised per posture.
  comfortPads(P = POSTURE, near = null) {
    // (`near`: how much nearer the player than the long fingers' the thumb's
    // and the little finger's pads play, white and black — the view's own
    // contacts; else the posture's.)
    const memo = (this._comfort ??= new WeakMap());
    const byP = memo.get(P) ?? new Map();
    memo.set(P, byP);
    const key = near ? near.map((x) => Math.round(x * 2e4)).join(",") : "-";
    if (byP.has(key)) return byP.get(key);
    const C = P.comfort;
    const arch = { index: 0, middle: 0, ring: P.arch.ring, pinky: P.arch.pinky };
    const pitchQ = qAxis(AX, P.pitch);
    const unPitch = pitchQ.clone().invert();
    const toModel = this.toHand.clone().invert();
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(unPitch).applyQuaternion(toModel);
    const out = { white: [], black: [], poses: { white: {}, black: {} }, errors: { white: [], black: [] } };
    for (const black of [0, 1]) {
      const side = black ? "black" : "white";
      const H = black ? C.blackHeight : C.height,
        R = black ? C.blackReach : C.reach;
      const nearT = near ? near[black] : C.thumb,
        nearL = near ? near[2 + black] : C.little;
      DIGITS.forEach((d, i) => {
        const level = new THREE.Vector3(this.chir * (i - 2.5) * KEY_W, -H, -R + (i === 0 ? nearT : i === 4 ? nearL : 0));
        const pad = level.clone().applyQuaternion(unPitch);
        const target = pad.clone().applyQuaternion(toModel).add(this.origin);
        let pose, at;
        if (i === 0) {
          pose = this.solveThumb(target, P);
          at = this.thumbPad(pose, P);
        } else {
          const alpha = (black ? P.tip.black : P.tip.white) + (d === "pinky" ? P.tip.little : 0);
          pose = this.solveFinger(d, target, arch[d], P, { down, alpha }, onKey(LIMITS, d));
          at = this.fingerPad(d, pose, arch[d]);
        }
        out[side].push(at.sub(this.origin).applyQuaternion(this.toHand));
        out.poses[side][d] = pose;
        out.errors[side].push(pose.err);
      });
    }
    if (byP.size > 16) byP.clear();
    byP.set(key, out);
    return out;
  }
}

// ---- the keys under a point ------------------------------------------------------------------
// The black keys' centres and half-widths across the 88 keys (m).
const BLACKS = keyboardLayout(21, 108)
  .filter((k) => k.black)
  .map((k) => ({ c: ((k.left + k.width / 2) / 100) * 52 * KEY_W, half: ((k.width / 100) * 52 * KEY_W) / 2 }));
// How much a pad of radius r at (x, z) is over a black key's top (0…1,
// smooth): across within its width (and a little of the pad's), in depth
// over its length (`blackEnd`, m from the keys' back edge).
export function blackUnder(x, z, r, blackEnd) {
  let best = 0;
  const u = x / KEY_W;
  for (const b of BLACKS) {
    if (Math.abs(b.c / KEY_W - u) > 1.2) continue;
    // (Over a band a centimetre wide, so a finger hovering across a black
    // key's edge rises over it smoothly rather than at a step.)
    const across = 1 - smooth((Math.abs(x - b.c) - (b.half + 0.45 * r)) / 0.012 + 0.5);
    best = Math.max(best, across);
  }
  return best * (1 - smooth((z - blackEnd) / 0.012 + 0.5));
}

// The natural angles: every finger in the playing curve (or resting curve),
// the thumb in its natural pose.
export function naturalAngles(P = POSTURE, curve = P.play) {
  const a = { arch: { ...P.arch, index: 0, middle: 0 } };
  for (const f of FINGERS) a[f] = { abd: 0, mcp: curve.mcp, pip: curve.pip, dip: P.dipShare * curve.pip };
  a.thumb = { flex: P.thumb.flex, abd: P.thumb.abd, twist: P.thumbTwist.base + P.thumbTwist.perFlex * P.thumb.flex, mcp: P.thumb.mcp, ip: P.thumbIp.base + P.thumbIp.share * P.thumb.mcp };
  return a;
}

// ---- the view ---------------------------------------------------------------------------------
// The keyboard is drawn top-down with its depth foreshortened; the hands are
// rendered by an orthographic camera looking down from the player's side at
// an elevation θ, x mapping 1:1 to the strip's pixels. A point at height y
// and depth z (from the keys' back edge) lands at
//   X = x·s − stripLeft,  Y = top + (z·sinθ − y·cosθ)·s      (s = px per metre),
// so the scene's keys are as long as the drawn keys need (keysHeight/(s·sinθ))
// and a contact drawn at depth Ypx is the point z = (Ypx/s + y·cosθ)/sinθ.
// θ is high — the hands seen nearly from above, as the keyboard itself is
// drawn — so each finger reads whole: its knuckle, the joints along it, the
// fingertip beyond (a pianist's eye, closer to the keys, sees the curved
// fingertips hidden under the middle knuckles, which from a screen reads as
// a glove of stubs: below about 72° a curved finger's middle phalanx points
// almost along the line of sight, and the finger shows as its first phalanx
// and a knuckle). The palm then runs down onto the rail, where the picture
// dissolves. A fixed 76° view reveals the knuckle bridge and finger bends
// while remaining above the foreshortening threshold described above. It
// keeps the same anatomy across window sizes;
// the lab can override the elevation rule without changing contact maths.
export const ELEVATION = { base: 76, perPhysical: 0, min: 76, max: 76 };
export function viewOf(g) {
  const u = g.keyWidth;
  const s = u / KEY_W;
  let deg = g.elevation;
  if (deg == null) {
    const physical = (Math.asin(clamp(g.keysHeight / u / (KEY_LEN / KEY_W), 0, 1)) * 180) / Math.PI;
    const E = { ...ELEVATION, ...(g.elevationRule || null) };
    deg = clamp(E.base + E.perPhysical * physical, g.minElevation ?? E.min, g.maxElevation ?? E.max);
  }
  const sin = Math.sin((deg * Math.PI) / 180),
    cos = Math.cos((deg * Math.PI) / 180);
  // (`squash`: the picture's depth at this share of its width's scale — 1 as
  // a camera sees it; less for keys drawn very short, see SQUASH.)
  let squash = g.squash;
  if (squash == null) squash = clamp(g.keysHeight / (s * sin * (g.minKeyLen ?? SQUASH.minKeyLen)), SQUASH.min, 1);
  const sy = s * squash;
  return {
    u,
    s,
    sy,
    squash,
    deg,
    sin,
    cos,
    h: g.keysHeight,
    bed: g.bedHeight,
    top: g.topPx || 0,
    left: g.stripLeftPx || 0,
    width: g.viewportWidthPx,
    height: (g.topPx || 0) + g.bedHeight + (g.bottomPx || 0),
    dpr: g.dpr || 1,
    keyLen: g.keysHeight / (sy * sin),
  };
}
// Keys drawn much shorter than real ones (a wide zoom: keysHeight/keyWidth
// ≈ 2, a real key is 6.4) leave no room above them for a real hand seen from
// any height: the picture's depth is then drawn at `squash` of its width's
// scale, so the scene's keys are at least `minKeyLen` long (never below
// `min`). That minimum is a compact display depth, not a real key's full
// 150 mm length: enforcing the latter halved fingers without narrowing
// palms in the rejected Sunny Day frame. Ordinary practice layouts keep
// equal width/depth scales; only unusually short keys need compression.
export const SQUASH = { minKeyLen: 0.07, min: 0.38 };
// Depth (m from the keys' back edge) of a point at height y drawn `px` below
// the keys' back edge.
export const depthAt = (px, y, view) => (px / view.sy + y * view.cos) / view.sin;
// Canvas CSS px of a world point.
export const project = (p, view) => ({ x: p.x * view.s - view.left, y: view.top + (p.z * view.sin - p.y * view.cos) * view.sy });

// ---- posing one hand ----------------------------------------------------------------------------
const keyX = (keys) => keys * KEY_W;
// The hand's frame (x across toward its little finger on the right hand, y
// out of its back, z toward the wrist) in world axes: yaw about the vertical,
// pitch (the knuckles above the wrist), roll about the hand's length.
const handQ = (yaw, pitch, roll) => qAxis(AY, yaw).multiply(qAxis(AX, pitch)).multiply(qAxis(AZ, roll));
// The rows of a small rigid motion (a shift t, a turn ω about the hand's
// origin) moving a point r from the origin: t + ω × r. Unknowns tx ty tz ωx ωy ωz.
// (`axes`: per world axis, how much the point counts along it.)
function addRigidRows(A, b, r, m, w, axes = null) {
  const J = [
    [1, 0, 0, 0, r.z, -r.y],
    [0, 1, 0, -r.z, 0, r.x],
    [0, 0, 1, r.y, -r.x, 0],
  ];
  const mv = [m.x, m.y, m.z];
  for (let row = 0; row < 3; row++) {
    const wr = w * (axes ? axes[row] : 1);
    for (let i = 0; i < 6; i++) {
      b[i] += wr * J[row][i] * mv[row];
      for (let j = 0; j < 6; j++) A[i][j] += wr * J[row][i] * J[row][j];
    }
  }
}
// The nearest points of two segments.
function segmentGap(a0, a1, b0, b1) {
  const d1 = a1.clone().sub(a0),
    d2 = b1.clone().sub(b0),
    r = a0.clone().sub(b0);
  const a = d1.dot(d1),
    e = d2.dot(d2),
    f = d2.dot(r),
    c = d1.dot(r),
    bb = d1.dot(d2);
  const den = a * e - bb * bb;
  let s = den > 1e-14 ? clamp((bb * f - c * e) / den, 0, 1) : 0;
  let t = e > 1e-14 ? (bb * s + f) / e : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-14 ? clamp(-c / a, 0, 1) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-14 ? clamp((bb - c) / a, 0, 1) : 0;
  }
  const p = a0.clone().addScaledVector(d1, s),
    q = b0.clone().addScaledVector(d2, t);
  return { d: p.distanceTo(q), p, q };
}
// Each long finger's segments as capsules (radius m): proximal, middle, last
// (to the pad's centre). The proximal one counts from 45% along, beyond the
// web where neighbouring fingers always meet.
const FINGER_R = { index: [0.0082, 0.0072, 0.0063], middle: [0.0082, 0.0072, 0.0065], ring: [0.0082, 0.007, 0.0061], pinky: [0.0074, 0.006, 0.0055] };

// Pose one hand for a motion sample ({ pose, motion } from handMotions, or a
// bare motion). Returns the joints' world transforms and what checks need.
// Everything here is a continuous function of the motion (constraints fade in
// as a finger aims and out as it lets go), so the hand never jumps.
//
// `memory` (optional, for a renderer drawing frame after frame): the previous
// frame's `held` ({ O, yaw, pitch, roll, angles }) and `k`, how far (0…1) this
// frame goes from it toward its own solution. The hand's frame is eased so,
// before the digits on keys are solved — those still land exactly — and so
// are the free digits' joints (less as a digit comes down to its key). Left
// out, the pose is the pure function of the motion that checks and tests see.
export function poseHand(rig, frame, view, P = POSTURE, memory = null) {
  const motion = frame.motion || frame;
  const chir = rig.chir;
  const palm = motion.palm;
  const lift = clamp(palm.lift || 0, 0, 1.2);
  const relax = clamp(palm.relax || 0, 0, 1);
  const x0 = (motion.centre ?? palm.x) * KEY_W;

  // Orientation: the forearm's yaw from the elbow beside the body (mostly
  // taken up by the wrist), the pitch, the roll toward the side that plays.
  const middleC = 23.5 * KEY_W; // C4's place on the 88 keys (white-key units)
  const elbowX = middleC + chir * P.elbow;
  const yaw0 = clamp(-P.yawShare * Math.atan2(x0 - elbowX, P.forearm), -P.yawMax, P.yawMax);
  // (How much the little finger plays — on its key, coming to it, just
  // leaving it: the hand leans toward it as far.)
  const m5 = motion.fingers[4] || {};
  const say5 = m5.state === "down" || m5.exact ? 1 : Math.max(m5.target ? smooth((m5.aimTau || 0) / 0.7) * smooth((m5.target.alpha ?? 1) / 0.4) : 0, m5.since != null ? 1 - smooth(m5.since / 0.12) : 0);
  const roll0 = -chir * (P.roll + P.rollPerUnit * clamp(palm.roll || 0, -1, 1)) - chir * (P.littleLean ?? 0) * say5;
  const pitch0 = P.pitch;
  let yaw = yaw0,
    roll = roll0,
    pitch = pitch0;
  // (A crossing — the thumb under the hand, a finger arcing over it — lets
  // the hand turn further.)
  const crossing = clamp(Math.max(...motion.fingers.map((f) => Math.max(f.under || 0, f.arc || 0))), 0, 1);
  // How wide the hand is held (keys): the furthest two of its digits that
  // are on keys, coming to them or just leaving them — each counting as far
  // as it is into its aim or out of its release, so the shape never switches
  // at the instant a key is struck or let go (the span, the arch and the
  // fingertip angles all follow it).
  const reachOf = (f) => {
    const down = f.state === "down" || !!f.exact;
    const aim = !down && f.target ? smooth((f.aimTau || 0) / 0.7) * smooth((f.target.alpha ?? 1) / 0.4) : 0;
    const leaving = !down && f.since != null ? 1 - smooth(f.since / 0.12) : 0;
    // (Counting fully from a third of the way into its aim — the hand opens
    // as soon as the next key is known — and until two thirds out of its
    // release.)
    const w = down ? 1 : smooth(Math.max(aim, leaving) / 0.35);
    const x = down ? f.x : aim >= leaving && f.target ? f.target.x : f.x;
    return w > 0 && Number.isFinite(x) ? { w, x } : null;
  };
  const reachAll = motion.fingers.map(reachOf);
  const reaches = reachAll.filter(Boolean);
  // (A thumb held far wider of the index or middle finger than any spread
  // of the hand places it — a fifth between thumb and index — is reached
  // by turning the hand toward it, as a pianist's does: the wrist may turn
  // up to `turnStretch` further, as far as the stretch passes the widest
  // natural spread (POSTURE.stretchSlots, keys at that spread), each digit
  // counting as far as it is into its key.)
  let stretch = 0;
  const thumbReach = reachAll[0];
  if (thumbReach && P.turnStretch > 0)
    [1, 2].forEach((k) => {
      const other = reachAll[k];
      if (!other) return;
      const over = Math.abs(thumbReach.x - other.x) - P.stretchSlots[k - 1];
      stretch = Math.max(stretch, Math.min(thumbReach.w, other.w) * smooth((over - 0.25) / 1));
    });
  const turnMax = P.turnMax + Math.max((P.turnCross ?? 0) * smooth(crossing), (P.turnStretch ?? 0) * stretch);
  let span = 0;
  for (let a = 0; a < reaches.length; a++)
    for (let b = a + 1; b < reaches.length; b++)
      span = Math.max(span, Math.min(reaches[a].w, reaches[b].w) * Math.abs(reaches[a].x - reaches[b].x));
  const bridgeRange = P.bridgeSpan ?? [4, 6];
  const bridge = P.wideComfort
    ? Math.max(smooth((span - bridgeRange[0]) / (bridgeRange[1] - bridgeRange[0])), smooth(crossing))
    : 0;
  const tipFor = key => lerp(P.tip[key], P.wideTip?.[key] ?? P.tip[key], bridge);

  const arch = { index: 0, middle: 0, ring: P.arch.ring, pinky: P.arch.pinky };
  const radius = DIGITS.map((d) => rig.pads[d].r);
  const keyTop = (black) => BLACK_RISE * clamp(black, 0, 1);
  const blackEnd = depthAt(BLACK_SHARE * view.h, BLACK_RISE, view);
  // A digit's contact depth in 3-D (px from the keys' back edge): the
  // engine's, except that the thumb plays near the front of a white key (it
  // cannot come as far forward as the curved long fingers) and three
  // quarters of the way along a black key, and that a long finger on a black
  // key plays further in as the hand moves in over the black keys (the
  // position's black-key share, constant through a held chord).
  const forward = clamp(palm.forward || 0, 0, 1);
  // (Only as far in as the view's keys have depth for: keys drawn short — a
  // wide zoom — leave a curved finger no room further in.)
  // (… and the thumb, there, nearer a black key's front end, the hand
  // further back.)
  const roomy = smooth((view.keyLen - 0.075) / 0.03);
  const blackIn = (P.blackIn ?? 0) * lerp(0.5, 1, roomy);
  const thumbBlack = lerp(P.thumbBlackShort ?? P.thumbBlack, P.thumbBlack, roomy);
  const contactOf = (i, black, px) => {
    const b = clamp(black, 0, 1);
    return i === 0 ? lerp(Math.max(px, P.thumbWhite * view.h), thumbBlack * view.h, b) : px - blackIn * view.h * forward * b;
  };
  const depthOf = (i, black, px, y) => depthAt(contactOf(i, black, px), y, view);
  // (The thumb plays on its side and the little finger on its tip's outer
  // corner: each pad's centre stands a little in from its contact, toward
  // the hand.)
  const inward = (i, r) => (i === 0 ? -chir : i === 4 ? chir : 0) * -(P.corner?.[i] ?? 0) * r;
  // How far a key goes down at a depth (m from the keys' back edge, in the
  // scene; the real key's depth from its front edge against its balance rail).
  const dipAt = (z) => KEY_DIP * clamp(1 - ((view.keyLen - z) * KEY_LEN) / view.keyLen / KEY_BALANCE, 0, 1);

  // Each digit: on its key (its pad on the key's contact, the key going down
  // under it over the press), aiming for one, or just letting one go — and
  // `w`, how much the hand is placed for it (1 on its key, rising over an
  // aim, falling over a release); `hold`, how much the key it just let go
  // still holds the hand there.
  const fingers = motion.fingers.map((mf, i) => {
    const down = mf.state === "down" || !!mf.exact;
    const r = radius[i];
    // (A key to aim for comes in with its mark, as the mark fades in: the
    // engine's aim may already be running when the target appears.)
    const aim = !down && mf.target ? smooth((mf.aimTau || 0) / 0.7) * smooth((mf.target.alpha ?? 1) / 0.4) : 0;
    const leaving = !down && mf.since != null ? 1 - smooth(mf.since / 0.12) : 0;
    const hold = !down && mf.since != null && mf.contact != null ? 1 - smooth(mf.since / P.holdAfter) : 0;
    const w = down ? 1 : Math.max(aim, leaving);
    // (Down: the key sinks over the press; let go: it rises again.)
    // (How far its key goes down where it plays it: less further in.)
    const travel = mf.contact != null ? dipAt(depthOf(i, mf.black || 0, mf.contact, keyTop(mf.black || 0))) : KEY_DIP;
    const dip = down ? travel * clamp((1 - (mf.press ?? 0.7)) / 0.3, 0, 1) : mf.since != null ? travel * (1 - smooth(mf.since / 0.1)) : 0;
    const at = (e, sink) => {
      const y = keyTop(e.black) - sink;
      return new THREE.Vector3(e.x + inward(i, r), y + r, depthOf(i, e.black, e.px, y));
    };
    const wasKey = !down && mf.since != null && mf.contact != null ? { x: keyX(mf.x), black: mf.black, px: mf.contact } : null;
    const willKey = aim > 0 && mf.target ? { x: keyX(mf.target.x), black: mf.target.black, px: mf.target.contact } : null;
    let target = null,
      meet = null,
      place = null;
    if (down) {
      const y = keyTop(mf.black) - dip;
      target = new THREE.Vector3(keyX(mf.x) + inward(i, r), y + r, depthOf(i, mf.black, mf.contact, y));
      // (The hand is placed for the key's surface; the finger takes the dip.)
      meet = new THREE.Vector3(target.x, keyTop(mf.black) + r, depthOf(i, mf.black, mf.contact, keyTop(mf.black)));
      place = target;
    } else if (w > 0) {
      // Just let go: on its key as it rises again; aiming: where it will meet
      // its next key (a finger doing both, between them by how far each has
      // come).
      const was = leaving > 0 ? wasKey : null;
      const will = willKey;
      const k = was && will ? aim / (aim + leaving) : will ? 1 : 0;
      if (was || will) {
        meet = was && will ? at(was, 0).lerp(at(will, 0), k) : at(was || will, 0);
        place = was && will ? at(was, dip).lerp(at(will, 0), k) : was ? at(was, dip) : at(will, 0);
      }
    }
    // How much the hand is placed for it: fully on its key; fading over a
    // release; over an aim only toward its end (the engine's palm path brings
    // the hand, the finger reaches out as it arrives).
    const wFit = place ? (down ? 1 : Math.max(leaving, aim * aim * aim)) : 0;
    // (How far through its final descent onto the key it aims for.)
    const descent = !down && mf.target ? clamp(mf.descent || 0, 0, 1) : 0;
    // (How long it has been on its key: one just landed — a thumb under
    // the hand — settles into the hand's shape over `settle` s.)
    const settled = down ? smooth((mf.heldFor ?? P.settle) / P.settle) : 0;
    return {
      mf, i, down, aim, leaving, hold, descent, settled, w: place ? w : 0, wFit, r, dip, target, meet, place,
      // (Where it left its key, the key still as far down as it is.)
      wasMeet: wasKey && hold > 0 ? at(wasKey, dip) : null,
      willMeet: willKey ? at(willKey, 0) : null,
    };
  });

  // 1. The hand's default frame: across, the engine's palm centre; in height
  // and depth, the middle finger in its playing pose on its key's contact (a
  // white key's, in by the position's black-key share).
  // (The thumb's and the little finger's contacts nearer the player than the
  // long fingers', white and black, in this view: the comfortable shape is
  // laid out on them.)
  const g = { keyWidth: view.u, keysHeight: view.h };
  const longAt = (black) => depthAt(contactOf(2, black, contactDepth(3, black, g)), keyTop(black), view);
  const near = [0, 1].map((b) => depthAt(contactOf(0, b, contactDepth(1, b, g)), keyTop(b), view) - longAt(b));
  near.push(...[0, 1].map((b) => depthAt(contactOf(4, b, contactDepth(5, b, g)), keyTop(b), view) - longAt(b)));
  let comfort = rig.comfortPads(P, near);
  if (bridge > 0) {
    // Keep both endpoint shapes cached in the rig; only their small pose
    // records blend with the music. No geometry preparation runs per frame.
    const endpoints = (rig._bridgePostures ??= new WeakMap());
    let wideP = endpoints.get(P);
    if (!wideP) {
      wideP = { ...P, comfort: P.wideComfort, tip: P.wideTip ?? P.tip };
      endpoints.set(P, wideP);
    }
    const wide = rig.comfortPads(wideP, near);
    if (bridge >= 1) comfort = wide;
    else {
      const poses = {};
      for (const side of ["white", "black"]) poses[side] = Object.fromEntries(FINGERS.map(name => {
        const a = comfort.poses[side][name], b = wide.poses[side][name];
        return [name, Object.fromEntries(["abd", "mcp", "pip", "dip"].map(key => [key, lerp(a[key], b[key], bridge)]))];
      }));
      comfort = {
        white: comfort.white.map((pad, i) => pad.clone().lerp(wide.white[i], bridge)),
        black: comfort.black.map((pad, i) => pad.clone().lerp(wide.black[i], bridge)),
        poses,
      };
    }
  }
  const comfortOf = (i, black) => comfort.white[i].clone().lerp(comfort.black[i], clamp(black, 0, 1));
  const zDef = depthAt(lerp(0.68, 0.53 - blackIn * forward, forward) * view.h, keyTop(forward), view);
  const O = new THREE.Vector3(x0, keyTop(forward) + radius[2], zDef).sub(comfortOf(2, forward).applyQuaternion(handQ(yaw0, pitch0, roll0)));
  const def = O.clone();

  // 2. The hand placed for its digits: the smallest motion of the hand (a
  // shift; turns about its knuckle row) that brings the digits on keys, in
  // their comfortable playing poses, onto their keys — the hand moves to
  // the fingers, so a stretch opens the hand and moves it rather than
  // straightening a finger; a digit that has just let go of its key still
  // holds it there (fading); one coming to its key moves it a capped little,
  // opening up as it strikes. The engine's palm holds it weakly across,
  // its default height and depth and its natural orientation weaker still.
  // (How far through its aim a digit is placed for in full: its last descent
  // onto the key, or — the engine's own aim is lateral — the second half of
  // its aim, so the hand comes to the key over the aim rather than in the
  // few frames of the descent.)
  const arrive = (f) => Math.max(f.descent, smooth((f.aim - 0.5) / 0.5));
  const capOf = (f) => P.aimCap / Math.max(1e-3, 1 - 0.999 * arrive(f));
  const fitPts = [];
  for (const f of fingers) {
    // (A thumb passing under the hand, or a finger crossing over the thumb,
    // is away from its place in the hand's shape: the hand stays over the
    // others and pivots, it reaches. A digit on its key is the pivot — a
    // thumb held while a finger crosses over it, or one just landed under
    // the hand — and counts in full.)
    // (… and one just letting go of its key stops counting only as it goes;
    // one just landed under the hand comes to count as it is held.)
    const crossedRaw = smooth(clamp(Math.max(f.mf.under || 0, f.mf.arc || 0) / 0.6, 0, 1));
    const crossed = f.down ? crossedRaw * (1 - f.settled) : crossedRaw * (1 - f.leaving);
    const wd = P.fitWeight[f.i] * (1 - crossed);
    // (A thumb on its key under the hand — a finger crossed over it, or it
    // has just passed under — sits tucked toward the little finger, not at
    // its place beside the hand.)
    const tucked = f.i ? 0 : smooth(clamp(f.mf.under || 0, 0, 1));
    // (On its key the pad is where the key has gone down to: the hand sinks
    // with the keys it holds, the fingers keep their shape.)
    if (f.down) {
      fitPts.push({ i: f.i, at: f.target, black: f.mf.black, w: wd, cap: Infinity, tucked });
      continue;
    }
    // (A free long finger asks, weakly, for its comfortable place to rest on
    // its own key — at the keys' height, in front of a black key it would
    // lie over — so a hand holding only its outer digits down, a fifth or
    // an octave, stays high and back enough for the others to hang curved.)
    const restW = f.i && !f.mf.under && !f.mf.arc ? P.freeFitWeight * (1 - f.aim) * (1 - f.leaving) * (1 - smooth((f.mf.lift || 0) / 0.6)) : 0;
    if (restW > 0) fitPts.push({ i: f.i, rest: true, black: 0, w: restW, cap: Infinity });
    if (f.wasMeet) fitPts.push({ i: f.i, at: f.wasMeet, black: f.mf.black, w: wd * f.hold, cap: Infinity, tucked });
    if (f.willMeet) {
      const aimW = (1 - f.hold) * lerp(f.aim * f.aim * f.aim * P.aimWeight, 1, arrive(f));
      if (aimW > 0) fitPts.push({ i: f.i, at: f.willMeet, black: f.mf.target.black, w: wd * aimW, cap: capOf(f), reach: f.descent });
    }
  }
  // (The thumb never further from its base than its comfortable reach: past
  // it the hand comes to the thumb — a soft one-sided constraint on the
  // distance, its row the distance's change with the hand's motion.)
  const thumbBase = rig.thumbBaseInHand();
  const knuckleRow = rig.knucklesInHand(arch);
  const reachMax = rig.thumbReach(P.thumbReachMcp, P).length();
  // (The little finger's: from its knuckle, its pad at its comfortable
  // reach — the middle joint bent `littleReachPip`, the last a little.)
  const littleBase = knuckleRow[3];
  const littleMax = rig.fingerReachPD("pinky", P.littleReachPip ?? 30 * DEG, 0.6 * (P.littleReachPip ?? 30 * DEG)).length();
  const addReachRow = (A, b, at, q, w, base = thumbBase, max = reachMax) => {
    const rb = base.clone().applyQuaternion(q);
    const u = at.clone().sub(O).sub(rb);
    const dist = u.length();
    if (!(dist > 1e-6)) return;
    u.divideScalar(dist);
    const ex = dist - max,
      del = 0.0015;
    if (!(ex > -del)) return;
    const e = ex >= del ? ex : (ex + del) ** 2 / (4 * del);
    const de = ex >= del ? 1 : (ex + del) / (2 * del);
    const c = rb.clone().cross(u);
    const J = [-u.x, -u.y, -u.z, -c.x, -c.y, -c.z].map((v) => v * de);
    for (let i = 0; i < 6; i++) {
      b[i] -= w * J[i] * e;
      for (let j = 0; j < 6; j++) A[i][j] += w * J[i] * J[j];
    }
  };
  for (let round = 0; round < (P.fitRounds ?? 4); round++) {
    const q = handQ(yaw, pitch, roll);
    const A = Array.from({ length: 6 }, () => new Float64Array(6));
    const b = new Float64Array(6);
    for (const d of fitPts) {
      if (!(d.w > 0)) continue;
      if (d.rest) {
        // (Where its comfortable pad would be, and where it would rest.)
        const r = comfortOf(d.i, 0).applyQuaternion(q);
        const p = O.clone().add(r);
        const across = blackUnder(p.x, 0, radius[d.i], blackEnd);
        const zRest = Math.max(p.z, lerp(p.z, blackEnd + P.free.blackFront * radius[d.i], smooth(across / 0.3)));
        const m = new THREE.Vector3(0, keyTop(0) - (P.sinkFree ?? 0) + radius[d.i] - p.y, zRest - p.z);
        addRigidRows(A, b, r, m, d.w, [0, 1, 1]);
        continue;
      }
      const c = comfortOf(d.i, d.black);
      if (d.tucked) c.add(new THREE.Vector3(chir * P.tuckPlace[0], 0, P.tuckPlace[1]).multiplyScalar(d.tucked));
      const r = c.applyQuaternion(q);
      const m = d.at.clone().sub(O).sub(r);
      const ml = m.length();
      if (ml > d.cap) m.multiplyScalar(d.cap / ml);
      addRigidRows(A, b, r, m, d.w, d.i === 4 ? P.littleAxes ?? P.fingerAxes : d.i ? P.fingerAxes : P.thumbAxes);
      // (These last three count as the digit does — fading in as it comes
      // to its key, out as it leaves — so nothing switches as it lands.)
      // (A digit only aiming at a key far off — the hand in flight — holds
      // the hand to its reach only as it comes down onto it.)
      const reachW = d.reach ?? 1;
      if (!d.i && P.thumbReachWeight > 0) addReachRow(A, b, d.at, q, P.thumbReachWeight * d.w * reachW);
      if (d.i === 4 && P.littleReachWeight > 0) addReachRow(A, b, d.at, q, P.littleReachWeight * d.w * reachW, littleBase, littleMax);
      // (A long finger on its key wants its knuckle right behind it — the
      // finger straight up its key, not leaning across it; the little
      // finger, playing on its corner, a little.)
      if (d.i && P.alignWeight > 0) {
        const rk = knuckleRow[d.i - 1].clone().applyQuaternion(q);
        addRigidRows(A, b, rk, new THREE.Vector3(d.at.x - O.x - rk.x, 0, 0), P.alignWeight * d.w * (d.i === 4 ? 0.3 : 1), [1, 0, 0]);
      }
    }
    const pr = P.prior;
    const pull = (i, w, v) => {
      A[i][i] += w;
      b[i] += w * v;
    };
    pull(0, pr.x, x0 - O.x);
    pull(1, pr.y, def.y - O.y);
    pull(2, pr.z, def.z - O.z);
    pull(3, pr.pitch, pitch0 - pitch);
    pull(4, pr.yaw, yaw0 - yaw);
    pull(5, pr.roll, roll0 - roll);
    const u = solveLinear(A, b);
    if (!u) break;
    O.x += u[0];
    O.y += u[1];
    O.z += u[2];
    pitch = clamp(pitch + u[3], pitch0 - P.tilt[0], pitch0 + P.tilt[1]);
    yaw = clamp(yaw + u[4], yaw0 - turnMax, yaw0 + turnMax);
    roll = clamp(roll + u[5], roll0 - P.rollMax, roll0 + P.rollMax);
  }
  const placedAt = { O: O.clone(), yaw, pitch, roll };
  // A flight lifts the hand; a resting hand rises a little; the top hand of a
  // crowded pair is raised over the other; repeated chords bounce the wrist.
  const handRise = P.palmLift * lift + P.restRise * relax + P.topRaise * (palm.topRaise || 0);
  O.y += handRise;
  O.z += -0.006 * (palm.bob || 0);

  // The world's downward direction in model space, and each fingertip's
  // angle on its key.
  const qOf = () => handQ(yaw, pitch, roll);
  const qModel = () => qOf().multiply(rig.toHand);
  const toModelAt = (q) => {
    const inv = q.clone().invert();
    return (w) => w.clone().sub(O).applyQuaternion(inv).add(rig.origin);
  };
  // (The world's downward direction in model space for an orientation —
  // the last one asked for kept, as every digit of a round asks the same.)
  let downQ = null,
    downV = null;
  const downFor = (q) => {
    if (q !== downQ) {
      downQ = q;
      downV = new THREE.Vector3(0, -1, 0).applyQuaternion(q.clone().invert());
    }
    return downV;
  };
  const tipAim = (q, i, black, hover = 0) => ({
    down: downFor(q),
    alpha: lerp(lerp(tipFor("white"), tipFor("black"), clamp(black, 0, 1)) + (i === 4 ? tipFor("little") : 0), tipFor("hover"), hover),
  });
  // (A finger on its key keeps its middle joint bent.)
  const limitsOf = (f, L = LIMITS) => (f.i && f.down ? onKey(L, FINGERS[f.i - 1]) : L);
  // (The limits a digit on its key is solved within — and, just let go, eases
  // out of as it leaves, so nothing changes at the instant it lets go. A
  // thumb on its key keeps its comfortable range even under the hand: the
  // hand, pivoting over it, comes to it.)
  const heldLimits = (f, L) => {
    if (f.i) return onKey(L, FINGERS[f.i - 1]);
    const under = smooth(f.mf.under || 0) * (1 - f.settled);
    const limits = blendLimits(L, STRAINED, under);
    const floor = lerp(P.thumbMcpFloor ?? limits.thumbMcp[0], limits.thumbMcp[0], Math.max(under, bridge));
    return floor > limits.thumbMcp[0]
      ? { ...limits, thumbMcp: [floor, limits.thumbMcp[1]] }
      : limits;
  };
  const leavingLimits = (f, L) => (f.leaving > 0 ? blendLimits(LIMITS, heldLimits(f, L), f.leaving) : LIMITS);
  // After every written hold ends, prepare the wrist for an approaching
  // chord before its pads land. Two ready targets constrain that wrist;
  // a single approaching finger keeps the existing comfortable placement.
  // The leading finger starts shared preparation: a recently released thumb
  // can still be travelling sideways while its chord partner descends.
  const actualHeld = fingers.some(f => f.down);
  const rawPrepWeight = f => !actualHeld && f.mf.target ? smooth((f.descent - 0.7) / 0.3) : 0;
  const readyWeight = f => !actualHeld && f.mf.target ? f.aim : 0;
  const multiPrep = fingers.map(readyWeight).sort((a, b) => b - a)[1] || 0;
  const chordDescent = Math.max(0, ...fingers.map(rawPrepWeight));
  const prepWeight = f => readyWeight(f) * multiPrep * chordDescent;
  const contactWeight = f => f.down ? 1 : prepWeight(f);
  // The digits the hand is placed for, each solved onto its place.
  const solvePlaced = (q, L = LIMITS, heldOnly = false) => {
    const toModel = toModelAt(q);
    const out = [];
    for (const f of fingers) {
      if (!(f.wFit > 0) || (heldOnly && !(contactWeight(f) > 0))) continue;
      const name = f.i ? FINGERS[f.i - 1] : "thumb";
      const black = f.down ? f.mf.black : f.mf.target && f.aim >= f.leaving ? f.mf.target.black : f.mf.black;
      // (A thumb passing under the hand reaches as far as a thumb can.)
      const LL = f.down ? heldLimits(f, L) : blendLimits(leavingLimits(f, L), heldLimits(f, L), prepWeight(f));
      const s = f.i ? rig.solveFinger(name, toModel(f.place), arch[name], P, tipAim(q, f.i, black), LL) : rig.solveThumb(toModel(f.place), P, LL, P.thumbSoft * (f.down ? 0 : (1 - f.leaving) * (1 - prepWeight(f))));
      const pad = f.i ? rig.fingerPad(name, s, arch[name]) : rig.thumbPad(s, P);
      out.push({ f, s, miss: f.place.clone().sub(pad.sub(rig.origin).applyQuaternion(q).add(O)) });
    }
    return out;
  };

  // 3. Where a digit still cannot reach its place (within its joints'
  // comfortable ranges), the hand moves and tilts by what is missing — a few
  // fixed-point rounds, each one analytic solve — so nothing stretches and
  // no pad floats beside its key. Each round fits the smallest rigid motion
  // of the hand that brings the missing pads onto their places; each digit
  // counts by its weight and, smoothly, by how much it misses.
  const say = (f, want) => (f.down ? want : f.leaving * want + (1 - f.leaving) * clamp(want * f.aim * f.aim * f.aim, -capOf(f), capOf(f)));
  // (First within the comfortable ranges; where a digit on its key still
  // misses, a few more rounds with the strained ones — the hand moving as far
  // as the stretched digits need.)
  let solved = solvePlaced(qModel());
  const rounds = P.rounds ?? 4;
  let L = LIMITS;
  // When a key is held, only actual held contacts drive this refinement.
  // In the free interval, the approaching chord gradually takes that role.
  const heldMiss = () => Math.max(0, ...solved.map(d => d.miss.length() * contactWeight(d.f)));
  let best = { miss: heldMiss(), O: O.clone(), yaw, pitch, roll, L };
  const remember = () => {
    const miss = heldMiss();
    if (miss < best.miss) best = { miss, O: O.clone(), yaw, pitch, roll, L };
  };
  // Most poses keep the usual seven correction rounds. A genuinely missed
  // held key gets a bounded, softer refinement; retain the best rigid pose
  // so a difficult local solve cannot finish worse than it started.
  const normalRounds = rounds + 3;
  // (For checks: each round's worst held miss, mm, when P.trace asks.)
  const trace = P.trace ? [] : null;
  for (let round = 0; round < normalRounds + 10; round++) {
    const refine = round >= normalRounds;
    if (trace) trace.push({ round, miss: +(heldMiss() * 1000).toFixed(2), strained: L !== LIMITS });
    if (refine && heldMiss() < 0.0005) break;
    if (round === rounds) {
      // (How far the digits on keys go past their comfortable ranges: by
      // how much those miss — continuously, from nothing.)
      const worst = Math.max(0, ...solved.map(d => d.miss.length() * contactWeight(d.f)));
      const strain = smooth((worst - 0.0001) / 0.0015);
      if (strain > 0) {
        L = blendLimits(LIMITS, STRAINED, strain);
        solved = solvePlaced(qModel(), L);
      }
    }
    const A = Array.from({ length: 6 }, () => new Float64Array(6));
    const b = new Float64Array(6);
    let total = 0;
    // (A digit on its key comes first: one only coming to its key counts
    // little, and not at all while a digit on its key is being missed.)
    let downMiss = 0;
    for (const d of solved) {
      const held = d.f.down ? 1 : d.f.leaving;
      if (held > 0) downMiss = Math.max(downMiss, d.miss.length() * held);
    }
    const yieldTo = 1 - smooth(downMiss / 0.002);
    for (const d of solved) {
      const ml = d.miss.length();
      const f = d.f;
      const aimC = lerp(f.wFit * (P.aimWeight ?? 1) * yieldTo, 1, f.descent);
      // (A thumb under the hand moves it less: the hand pivots over the
      // finger it holds, the thumb reaches.)
      const under = f.i ? 1 : 1 - 0.6 * smooth(f.mf.under || 0) * (1 - f.settled);
      const c = (f.down ? 1 : f.leaving + (1 - f.leaving) * aimC) * under * Math.min(1, ml / 0.001);
      if (!(c > 0)) continue;
      total += c;
      const r = f.place.clone().sub(O);
      // (A digit not on its key moves the hand a capped little — one that has
      // let go of a key the hand has already left included.)
      const shortM = !(ml > capOf(f)) ? d.miss : d.miss.clone().multiplyScalar(capOf(f) / ml);
      const m = f.down ? d.miss : shortM;
      addRigidRows(A, b, r, m, c);
    }
    if (!(total > 1e-9)) break;
    // (Turning the hand is cheaper than shifting it: a turn barely moves the
    // knuckle row the other fingers hang from.)
    const lt = refine ? 0.02 : P.fitShift ?? 0.6,
      lr = (refine ? 0.03 : P.fitTurn ?? 0.5) * 0.05 * 0.05;
    // (A round may not carry a digit on its key further from it: a step
    // that would is retried shorter and stiffer, and if none helps the
    // rounds stop where they are. Without this a cheap turn could swing the
    // hand between two fits from one frame to the next, and to its tilt
    // limit, while nothing in the music changed — 2.44.)
    const base = { O: O.clone(), yaw, pitch, roll };
    const before = heldMiss();
    const guard = (P.roundGuard ?? true) && before > 0.0005;
    let moved = false;
    for (let attempt = 0, damp = 1; attempt < (guard ? 4 : 1); attempt++, damp *= 8) {
      const AA = A.map((row) => Float64Array.from(row));
      [lt, lt, lt, lr, lr, lr].forEach((l, i) => (AA[i][i] += l * damp));
      const u = solveLinear(AA, Float64Array.from(b));
      if (!u) break;
      O.set(base.O.x + 0.9 * u[0], base.O.y + 0.9 * u[1], base.O.z + 0.9 * u[2]);
      pitch = clamp(base.pitch + 0.9 * u[3], pitch0 - P.tilt[0], pitch0 + P.tilt[1]);
      yaw = turnMax > 0 ? clamp(base.yaw + 0.9 * u[4], yaw0 - turnMax, yaw0 + turnMax) : base.yaw;
      roll = clamp(base.roll + 0.9 * u[5], roll0 - P.rollMax, roll0 + P.rollMax);
      solved = solvePlaced(qModel(), L);
      if (!guard || heldMiss() <= Math.max(before, 0.0005) + 1e-5) {
        moved = true;
        break;
      }
    }
    if (!moved) {
      O.copy(base.O);
      yaw = base.yaw;
      pitch = base.pitch;
      roll = base.roll;
      solved = solvePlaced(qModel(), L);
      if (refine || round >= rounds) break;
      continue;
    }
    remember();
  }
  if (trace) trace.push({ stage: "rounds", miss: +(heldMiss() * 1000).toFixed(2), best: +(best.miss * 1000).toFixed(2) });
  if (heldMiss() > 0.0005 && best.miss < heldMiss()) {
    O.copy(best.O); yaw = best.yaw; pitch = best.pitch; roll = best.roll; L = best.L;
    solved = solvePlaced(qModel(), L);
  }
  // A constrained finger can change its bend as the wrist moves. The rigid
  // approximation above then points in the wrong direction. Only for a
  // remaining contact miss, measure that response and refine the same six
  // wrist coordinates. Bones and joint limits stay unchanged; an anticipated
  // note cannot pull a held finger away from its key.
  // While any key is held, anticipated digits cannot change this residual.
  // Only the free interval permits preparation of the next chord here.
  const contactResidual = () => solvePlaced(qModel(), L, true)
    .flatMap(d => [d.miss.x, d.miss.y, d.miss.z].map(n => n * contactWeight(d.f)));
  const energy = r => r.reduce((sum, n) => sum + n * n, 0);
  const coords = () => [O.x, O.y, O.z, pitch, yaw, roll];
  const setCoords = v => {
    O.set(v[0], v[1], v[2]);
    pitch = clamp(v[3], pitch0 - P.tilt[0], pitch0 + P.tilt[1]);
    yaw = clamp(v[4], yaw0 - turnMax, yaw0 + turnMax);
    roll = clamp(v[5], roll0 - P.rollMax, roll0 + P.rollMax);
  };
  const refineContacts = () => {
    for (let round = 0; round < (P.contactRounds ?? 8) && heldMiss() > 0.0005; round++) {
      const base = coords(), residual = contactResidual(), cost = energy(residual);
      const derivatives = [];
      for (let j = 0; j < 6; j++) {
        const step = j < 3 ? 0.0002 : 0.003;
        const trial = [...base]; trial[j] += step; setCoords(trial);
        // At an upper bound a forward sample has no displacement. Sample inward
        // instead so refinement can still discover a turn away from that limit.
        let actualStep = coords()[j] - base[j];
        if (Math.abs(actualStep) < step * 0.1) {
          trial[j] = base[j] - step;
          setCoords(trial);
          actualStep = coords()[j] - base[j];
        }
        const shifted = contactResidual();
        derivatives.push(shifted.map((r, i) => actualStep ? (r - residual[i]) / actualStep : 0));
      }
      setCoords(base);
      const A = Array.from({ length: 6 }, () => new Float64Array(6));
      const b = new Float64Array(6);
      for (let j = 0; j < 6; j++) {
        for (let i = 0; i < residual.length; i++) {
          b[j] -= derivatives[j][i] * residual[i];
          for (let k = 0; k < 6; k++) A[j][k] += derivatives[j][i] * derivatives[k][i];
        }
        A[j][j] += j < 3 ? 0.002 : 0.000002;
      }
      let delta = solveLinear(A, b);
      if (!delta) break;
      // Fix coordinates whose proposed step points out of an active bound,
      // then solve the remaining coordinates together. Simply clamping that
      // component after solving would invalidate the other coupled steps.
      const bounds = [null, null, null,
        [pitch0 - P.tilt[0], pitch0 + P.tilt[1]],
        [yaw0 - turnMax, yaw0 + turnMax],
        [roll0 - P.rollMax, roll0 + P.rollMax]];
      const fixed = new Set();
      for (let pass = 0; pass < 3; pass++) {
        const blocked = [3, 4, 5].filter(j => !fixed.has(j) &&
          ((base[j] <= bounds[j][0] + 1e-8 && delta[j] < 0) ||
           (base[j] >= bounds[j][1] - 1e-8 && delta[j] > 0)));
        if (!blocked.length) break;
        for (const j of blocked) {
          fixed.add(j);
          for (let k = 0; k < 6; k++) A[j][k] = A[k][j] = 0;
          A[j][j] = 1;
          b[j] = 0;
        }
        delta = solveLinear(A, b);
        if (!delta) break;
      }
      if (!delta) break;
      let accepted = false;
      for (const k of [1, 0.5, 0.25, 0.1]) {
        setCoords(base.map((v, j) => v + k * clamp(delta[j], j < 3 ? -0.005 : -0.035, j < 3 ? 0.005 : 0.035)));
        if (energy(contactResidual()) < cost - 1e-12) { accepted = true; break; }
      }
      if (!accepted) { setCoords(base); break; }
      solved = solvePlaced(qModel(), L);
      remember();
    }
  };
  refineContacts();
  // (Still missing a held key: the refinement is a local one, and a wide
  // stretch can leave it in a fit that turns the wrist the wrong way. Two
  // more starts, the wrist turned to either bound, each refined the same
  // way; the best reach of all is kept below. Ordinary frames never get here.)
  if (heldMiss() > 0.0005) {
    const start = coords();
    // (From where the fit left it, turned to either bound; then from the
    // hand's default frame — which no digit's aim has moved — straight and
    // turned either way.)
    const seeds = [
      ...(turnMax > 0 ? [1, -1].map((side) => [start[0], start[1], start[2], start[3], yaw0 + side * turnMax, start[5]]) : []),
      [def.x, def.y, def.z, pitch0, yaw0, roll0],
      ...(turnMax > 0 ? [1, -1].map((side) => [def.x, def.y, def.z, pitch0, yaw0 + side * turnMax, roll0]) : []),
    ];
    for (const seed of seeds) {
      setCoords(seed);
      solved = solvePlaced(qModel(), L);
      remember();
      refineContacts();
      if (best.miss <= 0.0005) break;
    }
  }
  if (trace) trace.push({ stage: "refined", miss: +(heldMiss() * 1000).toFixed(2), best: +(best.miss * 1000).toFixed(2) });
  if (heldMiss() > 0.0005 && best.miss < heldMiss()) {
    O.copy(best.O); yaw = best.yaw; pitch = best.pitch; roll = best.roll; L = best.L;
    solved = solvePlaced(qModel(), L);
  }

  // (Eased from the frame before, for a renderer that keeps one: a solver's
  // small discontinuities spread over a few frames.)
  // (… but only as far as every digit on its key still reaches it as well as
  // from the hand's own place: an eased hand never pulls a finger off its key.)
  const ease = memory?.held && memory.k < 1 ? memory : null;
  if (ease) {
    const was = ease.held;
    const pure = { O: O.clone(), yaw, pitch, roll };
    const place = (k) => {
      O.copy(was.O.clone().lerp(pure.O, k));
      yaw = was.yaw + wrap(pure.yaw - was.yaw) * k;
      pitch = was.pitch + wrap(pure.pitch - was.pitch) * k;
      roll = was.roll + wrap(pure.roll - was.roll) * k;
    };
    // (While the hand is still on its way — the frame before had it
    // elsewhere — a digit on its key may stretch for it, its joints let go
    // as far as a strained hand's: a pianist's finger reaches while the hand
    // catches up, rather than the hand jumping to the finger. The hand moves
    // only as far this frame as the stretched digits need; the stretch
    // eases out as it arrives.)
    // (How far the hand still lags its own place: fully strained a
    // centimetre or a few degrees away, comfortable once arrived — so a
    // still frame settles on the pure pose exactly.)
    const lag = () =>
      smooth(Math.max(O.distanceTo(pure.O) / 0.012, (Math.abs(wrap(pure.yaw - yaw)) + Math.abs(wrap(pure.pitch - pitch)) + Math.abs(wrap(pure.roll - roll))) / 0.15));
    const limitsNow = () => blendLimits(L, STRAINED, lag());
    const worstMiss = () => Math.max(0, ...solvePlaced(qModel(), limitsNow()).filter((d) => d.f.down).map((d) => d.miss.length()));
    const anyDown = fingers.some((f) => f.down);
    const reach = anyDown ? worstMiss() : 0;
    // The wrist finishes approaching with its chord, avoiding a backlog of
    // easing that would otherwise be corrected abruptly on the attack.
    let k = lerp(clamp(ease.k, 0, 1), 1, Math.max(0, ...fingers.map(prepWeight)));
    place(k);
    const contactBudget = Math.max(reach, Math.min(reach + 0.0001, 0.0005));
    if (anyDown && worstMiss() > contactBudget) {
      // The least of the way the hand must go for every key to be reached.
      let lo = k,
        hi = 1;
      for (let it = 0; it < 7; it++) {
        const mid = 0.5 * (lo + hi);
        place(mid);
        if (worstMiss() <= contactBudget) hi = mid;
        else lo = mid;
      }
      k = hi;
      place(k);
    }
    L = limitsNow();
  }

  // 4. Every digit on its key for the hand where it now stands.
  const q = qModel();
  const qh = qOf();
  // (The world's downward direction in model space, for this hand.)
  const downModel = new THREE.Vector3(0, -1, 0).applyQuaternion(q.clone().invert());
  const toModel = toModelAt(q);
  const toWorld = (v) => v.clone().sub(rig.origin).applyQuaternion(q).add(O);
  const angles = { arch };
  const errors = [0, 0, 0, 0, 0];
  // (Each solved within the limits the correction rounds settled on — the
  // comfortable ranges, let go further as far as its key needs.)
  solved = solvePlaced(q, L);
  for (const d of solved)
    if (d.f.down) {
      angles[d.f.i ? FINGERS[d.f.i - 1] : "thumb"] = d.s;
      errors[d.f.i] = d.miss.length();
    }

  // 5. The free fingers. Each keeps the curve it plays in — its comfortable
  // pose in this hand — resting just over the key under it, at its place in
  // the hand's natural fan (opened or closed a little by the engine's
  // spread; never folded behind a neighbour, never turned aside more than
  // `freeSpread`), kept clear of the fingers beside it, and toward the key it
  // aims for as far as the engine has it extended. Being higher than the
  // fingers on their keys (those keys are down), it would stand out toward
  // the fallboard on screen: its pad comes back toward the player — it
  // curls — until its outline is no further up the picture than the playing
  // fingers' (POSTURE.free). It is never lifted straight at its knuckle.
  // (A hand in flight, or resting, lets its free fingers hang: P.hang.)
  const flying = smooth(lift / (P.hang?.from ?? 0.5));
  // (… and a hand holding a wide stretch — an octave, a crossing — lets the
  // free fingers between its ends hang relaxed and curved rather than
  // standing out straight in a fan: `hang.wide` of a full hang, and a
  // little more curl of their own, as far as the stretch is open.)
  const wideHang = (P.hang?.wide ?? 0) * bridge;
  const hangK = Math.max(relax, flying, wideHang);
  // (… and close in their fan in a wide stretch too, `hang.wideFan` of a
  // flight's: fingers hanging together between an octave's ends, not splayed.)
  const fanScale = clamp(palm.fan ?? 1, P.fanRange[0], P.fanRange[1]) * (1 - (P.restFan ?? 0) * relax) * (1 - (P.hang?.fan ?? 0) * Math.max(flying, (P.hang?.wideFan ?? 0) * wideHang));
  const fan = (k) => clamp(P.fan[k] * fanScale, -P.freeSpread, P.freeSpread);
  // A free digit's hover: over the key it aims for as far as its aim has come
  // (from where it is), or over the key it has just let go — its pad leaving
  // the key exactly where it played it — at its lift.
  const hoverOf = (f) => {
    const mf = f.mf;
    const tg = mf.target;
    const liftH = P.fingerLift * (mf.lift || 0);
    const k = tg ? f.aim : 0;
    const black = lerp(mf.black || 0, tg ? tg.black : mf.black || 0, k);
    const y = keyTop(black) - f.dip * (1 - k) + f.r + liftH;
    const zNow = depthOf(f.i, mf.black || 0, mf.contact, keyTop(mf.black || 0) - f.dip * (1 - k));
    const z = tg ? lerp(zNow, depthOf(f.i, tg.black, tg.contact, keyTop(tg.black)), k) : zNow;
    const hx = (tg ? lerp(keyX(mf.x), keyX(tg.x), k) : keyX(mf.x)) + inward(f.i, f.r);
    return new THREE.Vector3(hx, y, z);
  };
  // Where a finger's outline tops out on screen (canvas px; smaller is
  // further up the picture, toward the fallboard): its PIP, its DIP and its
  // pad as spheres (POSTURE.outline, fitted to the mesh).
  const screenY = (p) => view.top + (p.z * view.sin - p.y * view.cos) * view.sy;
  const topOf = (name, a) => {
    const Wf = rig.fkFinger(name, a, arch[name]);
    const [, , inter, dist] = CHAINS[name];
    const R = P.outline[name];
    const k = view.sy;
    return Math.min(
      screenY(toWorld(Wf.get(inter).p)) - R[0] * k,
      screenY(toWorld(Wf.get(dist).p)) - R[1] * k,
      screenY(toWorld(rig.fingerPad(name, a, arch[name]))) - R[2] * k,
    );
  };
  // Each long finger's comfortable pose in this hand (on white keys, or on
  // black as far as the hand is in over them) and how far up the picture it
  // reaches.
  const lerpPose = (a, b, t) => ({ abd: lerp(a.abd, b.abd, t), mcp: lerp(a.mcp, b.mcp, t), pip: lerp(a.pip, b.pip, t), dip: lerp(a.dip, b.dip, t) });
  const comfortPoses = Object.fromEntries(FINGERS.map((name) => [name, lerpPose(comfort.poses.white[name], comfort.poses.black[name], forward)]));
  const comfortPose = (name) => comfortPoses[name];
  const comfortTop = FINGERS.map((name) => topOf(name, comfortPose(name)));
  // The free fingers' limit on screen: no further up the picture than the
  // finger itself is when it plays its key in this hand (`screen` more at
  // most), and clear of the fallboard. (Measured against the fingers that
  // play instead, a free middle finger — longer than a playing little
  // finger — would have to be curled into a hook.)
  const fallLimit = view.top + P.free.fall * view.h;
  const limitOf = (k) => Math.max(comfortTop[k] - P.free.screen * view.h, fallLimit);
  // (And where long fingers play, a free one stands out past them by at most
  // `lead` of the length it naturally has over them — the playing fingers are
  // the ones the picture shows first. One landing or letting go counts as
  // far as it has come.)
  const playLimit = FINGERS.map((_, k) => {
    const out = [];
    FINGERS.forEach((name, j) => {
      const g = fingers[j + 1];
      if (j === k) return;
      // (A finger on its key counts in full. One coming to its key counts
      // as it comes — over its aim and its last descent — `playRamp[1]` of
      // it as it lands and the rest as it settles there, over `playRamp[0]`
      // s; one that has just let go still counts as it goes, over
      // `playRamp[2]` s, so a key struck again does not let the free fingers
      // spring out and back between. Its outline as the hand's playing shape
      // has it. Each one's share of the bend it asks for, by how much it
      // counts.)
      const [settleS, atLanding, afterS] = P.free.playRamp;
      const settle = settleS > 0 ? smooth((g.mf.heldFor ?? 1) / settleS) : 1;
      const after = !g.down && g.mf.since != null && g.mf.contact != null ? 1 - smooth(g.mf.since / afterS) : 0;
      const coming = g.mf.target ? atLanding * lerp(g.aim, 1, smooth(g.descent)) : 0;
      const w = g.down ? lerp(atLanding, 1, settle) : Math.max(after, coming);
      if (!(w > 0)) return;
      out.push({ w, lim: comfortTop[j] - P.free.lead * Math.max(0, comfortTop[j] - comfortTop[k]) - P.free.playScreen * view.h });
    });
    return out;
  });
  // A free long finger at a spread, at rest: at its comfortable place in
  // this hand, just resting on a white key in front of the black keys'
  // fronts — drawn back toward the player as far as that takes, up to
  // `free.pull`; a hand further in over the black keys holds it at their
  // height instead (they stand 12.5 mm up), and one lifted clear above them
  // need not draw it back. (Wherever it is across the keys: a finger does
  // not trace the black keys as the hand moves along.) It reaches there in a
  // curve a little gentler than it plays in. A resting or flying hand
  // carries it up with it.
  const debugFree = [];
  const freeRest = (k, abd) => {
    const name = FINGERS[k];
    const f = fingers[k + 1];
    const mf = f.mf;
    const c0 = comfortPose(name);
    const pad0 = toWorld(rig.fingerPad(name, { ...c0, abd }, arch[name]));
    const lifted = smooth(((mf.lift || 0) - P.hover.liftFrom) / (1 - P.hover.liftFrom));
    const rise = P.hover.clear + P.hover.perLift * lifted * (P.hover.finger?.[k] ?? 1) + handRise;
    // (How far back it would come to rest in front of the black keys; past
    // `pull`, held at their height instead; how clear above them it already is
    // — fully, `free.aboveBand` higher than they are.)
    const need = Math.max(0, blackEnd + P.free.blackFront * f.r - pad0.z);
    const onBlack = smooth((need - P.free.pull[0]) / (P.free.pull[1] - P.free.pull[0]));
    const above = smooth((rise - BLACK_RISE + 0.004) / (P.free.aboveBand ?? 0.012));
    const y = keyTop(onBlack * (1 - above)) + f.r + rise;
    const z = pad0.z + need * (1 - onBlack) * (1 - above);
    const across = onBlack;
    const aim = { down: downModel, alpha: tipFor("white") - P.freeTip - P.restTip * relax };
    let s = rig.solveFinger(name, toModel(new THREE.Vector3(pad0.x, y, z)), arch[name], P, aim, onKey(LIMITS, name));
    debugFree[k] = { comfortMcp: c0.mcp, comfortPadY: pad0.y, targetY: y, across, zBack: z - pad0.z };
    const [, mHi] = P.free.mcpRange;
    // On screen no further up than its limit (above): bent further at the
    // knuckle — its outline tops out at its middle knuckle, which that
    // lowers — but only as far as its pad resting on its key.
    const limit = limitOf(k);
    if (topOf(name, s) < limit) {
      // (The floor its resting place keeps to, as above — not the key that
      // happens to be under it as the hand moves along.)
      const floor = keyTop(onBlack * (1 - above)) + f.r;
      const rest = (a) => toWorld(rig.fingerPad(name, a, arch[name])).y - floor;
      let mMax = mHi;
      if (rest({ ...s, mcp: mHi }) < 0) {
        let lo = s.mcp,
          hi = mHi;
        for (let it = 0; it < 9; it++) {
          const mid = 0.5 * (lo + hi);
          if (rest({ ...s, mcp: mid }) < 0) hi = mid;
          else lo = mid;
        }
        mMax = lo;
      }
      let m2 = mMax;
      if (!(topOf(name, { ...s, mcp: mMax }) < limit)) {
        let lo = s.mcp,
          hi = mMax;
        for (let it = 0; it < 9; it++) {
          const mid = 0.5 * (lo + hi);
          if (topOf(name, { ...s, mcp: mid }) < limit) lo = mid;
          else hi = mid;
        }
        m2 = hi;
      }
      s = { ...s, mcp: Math.max(s.mcp, m2) };
    }
    // Not past the fingers that play further than `lead` lets it: bent at
    // the knuckle as far as that takes, each playing finger's ask by how much
    // it counts, the fingertip curling under (`free.tuck`) as far as the
    // bend takes its pad below its white key.
    const topS = playLimit[k].length ? topOf(name, s) : 0;
    const asks = playLimit[k].filter((a) => topS < a.lim);
    if (asks.length) {
      let bend = 0;
      for (const a of asks) {
        let m2 = mHi;
        if (!(topOf(name, { ...s, mcp: mHi }) < a.lim)) {
          let lo = s.mcp,
            hi = mHi;
          for (let it = 0; it < 8; it++) {
            const mid = 0.5 * (lo + hi);
            if (topOf(name, { ...s, mcp: mid }) < a.lim) lo = mid;
            else hi = mid;
          }
          m2 = hi;
        }
        bend = Math.max(bend, a.w * Math.max(0, m2 - s.mcp));
      }
      // (The curl grows continuously with how far below the key the bend
      // alone would take the pad.)
      const bent = { ...s, mcp: s.mcp + bend };
      const below = Math.max(0, keyTop(0) + f.r - toWorld(rig.fingerPad(name, bent, arch[name])).y);
      const t = P.free.curl[0] * smooth(below / P.free.curl[1]);
      s = { ...bent, pip: Math.min(LIMITS.pip[1], s.pip + t * P.free.tuck.pip), dip: Math.min(LIMITS.dip[1], s.dip + t * P.free.tuck.dip) };
    }
    // (Nor ever straight back at its knuckle: bent at least `mcpMin`.)
    const mMin = P.free.mcpMin ?? 0;
    if (s.mcp < mMin) s = { ...s, mcp: mMin };
    // Never past the fallboard: that wins over resting on the black keys'
    // height. Bent at the knuckle as far as it takes, the fingertip curling
    // under just as far as keeps the pad off the keys. (The keys are drawn
    // flat: a pad down between the black keys hides nothing; a finger drawn
    // above the keys is plainly wrong.)
    const hard = fallLimit;
    if (topOf(name, s) < hard) {
      let lo = s.mcp,
        hi = mHi;
      for (let it = 0; it < 9; it++) {
        const mid = 0.5 * (lo + hi);
        if (topOf(name, { ...s, mcp: mid }) < hard) lo = mid;
        else hi = mid;
      }
      // (The fingertip curls under as far as the bend takes the pad below
      // its key — continuously, a little at a time.)
      const floorW = keyTop(0) + f.r;
      const bent = { ...s, mcp: hi };
      const below = Math.max(0, floorW - toWorld(rig.fingerPad(name, bent, arch[name])).y);
      const t = P.free.curl[0] * smooth(below / P.free.curl[1]);
      s = { ...bent, pip: Math.min(LIMITS.pip[1], s.pip + t * P.free.tuck.pip), dip: Math.min(LIMITS.dip[1], s.dip + t * P.free.tuck.dip) };
    }
    return s;
  };
  // A free long finger: at rest (above), then toward the key it aims for (or
  // the one it has just let go), by how far the engine has it extended.
  const freeFinger = (k, abd) => {
    const name = FINGERS[k];
    const f = fingers[k + 1];
    const mf = f.mf;
    const tg = mf.target;
    const k2 = clamp((mf.extend ?? 0) * (1 - (mf.curl ?? 0)), 0, 1);
    // (Wholly on its way to a key, its rest no longer shows: not worked out.)
    const s = k2 < 0.999 ? freeRest(k, abd) : { abd, mcp: 0, pip: 0, dip: 0 };
    let a = { abd: s.abd, mcp: s.mcp, pip: s.pip, dip: s.dip };
    if (P.idleCurve && k2 < 1 && !mf.exact) {
      const idle = P.idleCurve[k] || [0, 0];
      const soft = (1 - k2) * (1 - f.leaving) * (1 - f.aim);
      a.pip = clamp(a.pip + idle[0] * soft, LIMITS.pip[0], LIMITS.pip[1]);
      a.dip = clamp(a.dip + idle[1] * soft, LIMITS.dip[0], LIMITS.dip[1]);
      a = aboveKeys(name, f, a);
    }
    if (k2 > 0) {
      const hover = hoverOf(f);
      if (mf.arc) {
        hover.z -= P.arcFore * mf.arc;
        hover.y += P.arcUp * mf.arc;
      }
      // (Hovering: the fingertip a little flatter than on its key, steepening
      // as it comes down to strike.)
      const hoverK = clamp((mf.lift || 0) / 0.3, 0, 1);
      // (Coming down onto a key, the finger takes on the ranges it keeps on
      // one — its middle joint bent — as it arrives, so the pose it lands
      // in is the pose it strikes in, not a straighter one snapping curled
      // at the instant of contact.)
      const aimL = tg ? blendLimits(leavingLimits(f, L), onKey(L, name), smooth(arrive(f))) : leavingLimits(f, L);
      const aimS = rig.solveFinger(name, toModel(hover), arch[name], P, tipAim(q, k + 1, tg ? lerp(mf.black || 0, tg.black, f.aim) : mf.black, hoverK), aimL);
      a = { abd: lerp(a.abd, aimS.abd, k2), mcp: lerp(a.mcp, aimS.mcp, k2), pip: lerp(a.pip, aimS.pip, k2), dip: lerp(a.dip, aimS.dip, k2) };
      // (At rest it is clear of the keys by its placing; on its way to a key,
      // as far as it is on its way, never into one.)
      const safe = aboveKeys(name, f, a);
      const t = smooth(k2 / 0.3);
      a = { abd: lerp(a.abd, safe.abd, t), mcp: lerp(a.mcp, safe.mcp, t), pip: lerp(a.pip, safe.pip, t), dip: lerp(a.dip, safe.dip, t) };
    }
    // A hand in flight (or resting) lets the finger hang: curled a little
    // more at each joint, the outer fingers more — never into a key.
    const hk = P.hang ? hangK * (1 - k2) * (1 - f.leaving) * (1 - f.aim) : 0;
    if (hk > 0.001) {
      const c = P.hang.cascade[k] ?? 1;
      const wc = P.hang.wideCurl ?? [0, 0, 0];
      const wk = wideHang * (1 - k2) * (1 - f.leaving) * (1 - f.aim);
      a = {
        ...a,
        mcp: Math.min(LIMITS.mcp[1], a.mcp + P.hang.mcp * c * hk + wc[0] * c * wk),
        pip: Math.min(LIMITS.pip[1], a.pip + P.hang.pip * c * hk + wc[1] * c * wk),
        dip: Math.min(LIMITS.dip[1], a.dip + P.hang.dip * c * hk + wc[2] * c * wk),
      };
      a = aboveKeys(name, f, a);
    }
    if (P.idleJointBalance && !mf.exact) {
      const balance = P.idleJointBalance;
      const free = (1 - k2) * (1 - f.leaving) * (1 - f.aim);
      const excess = Math.max(0, a.pip - balance.pip) * free;
      if (excess > 0) {
        // Redistribute the resting bend around the same pad, rather than
        // extending it toward a neighbouring black key and re-projecting it
        // over that key's edge. The latter causes a visible clearance jump.
        const target = rig.fingerPad(name, a, arch[name]);
        const reach = rig.fingerReachLen(name, a.pip, a.dip);
        const maxDip = Math.max(a.dip, balance.dip);
        let pip = a.pip - excess;
        if (rig.fingerReachLen(name, pip, maxDip) > reach) {
          let lo = pip, hi = a.pip;
          for (let it = 0; it < 18; it++) {
            const mid = (lo + hi) / 2;
            if (rig.fingerReachLen(name, mid, maxDip) > reach) lo = mid;
            else hi = mid;
          }
          pip = (lo + hi) / 2;
        }
        let lo = a.dip, hi = maxDip;
        for (let it = 0; it < 18; it++) {
          const mid = (lo + hi) / 2;
          if (rig.fingerReachLen(name, pip, mid) > reach) lo = mid;
          else hi = mid;
        }
        const dip = (lo + hi) / 2;
        const balanced = rig.solveFinger(name, target, arch[name],
          { ...P, dipShare: dip / pip }, null, { ...LIMITS, pip: [pip, pip] });
        if (balanced.err < 1e-6) a = balanced;
      }
    }
    return a;
  };
  // Never into the keys: where the way from its rest to its aim would take
  // a finger into a key, it lifts at its knuckle by just as much.
  const aboveKeys = (name, f, a) => {
    const mf = f.mf;
    const tg = mf.target;
    const at = (v) => v.sub(rig.origin).applyQuaternion(q).add(O);
    const short = (an) => {
      const p = at(rig.fingerPad(name, an, arch[name]));
      // Lifting the knuckle moves the pad across key edges. Check the
      // surface below each candidate, rather than the original position.
      const under = Math.max(blackUnder(p.x, p.z, f.r, blackEnd), tg ? tg.black * f.aim : 0, f.leaving * (mf.black || 0));
      const over = keyTop(under) - f.dip + f.r + 0.001 * (1 - Math.max(f.aim, f.leaving));
      // (Over the rail, in front of the keys, it may hang lower.)
      const floor = lerp(over, Math.min(over, f.r - 0.012), smooth((p.z - view.keyLen) / 0.012));
      return floor - p.y;
    };
    if (!(short(a) > 0)) return a;
    let lo = LIMITS.mcp[0],
      hi = a.mcp;
    if (short({ ...a, mcp: lo }) > 0) {
      // At the knuckle's lift limit, soften only the remaining free-finger
      // curl needed to clear the key. Keep the largest feasible bend.
      const atBend = (k) => ({ ...a, mcp: lo,
        pip: lerp(LIMITS.pip[0], a.pip, k),
        dip: lerp(LIMITS.dip[0], a.dip, k) });
      if (short(atBend(0)) > 0) return atBend(0);
      let lower = 0, upper = 1;
      for (let it = 0; it < 15; it++) {
        const mid = 0.5 * (lower + upper);
        if (short(atBend(mid)) > 0) upper = mid;
        else lower = mid;
      }
      return atBend(lower);
    }
    for (let it = 0; it < 14; it++) {
      const mid = 0.5 * (lo + hi);
      if (short({ ...a, mcp: mid }) > 0) hi = mid;
      else lo = mid;
    }
    return { ...a, mcp: lo };
  };
  // Each free finger turned toward its place across the keys (the engine's:
  // evenly between the fingers that play), from its natural fan.
  const freeAim = (k) => {
    const f = fingers[k + 1];
    const a0 = fan(k);
    // (The inner fingers only: a free little finger keeps its natural fan
    // rather than reaching out after a key far off.)
    if (k > 2 || f.down || f.mf.x == null || !(P.freeAimX > 0)) return a0;
    const name = FINGERS[k];
    const c0 = comfortPose(name);
    const xAt = (a) => toWorld(rig.fingerPad(name, { ...c0, abd: a }, arch[name])).x;
    const xa = xAt(a0);
    const slope = (xAt(a0 + 0.1) - xa) / 0.1;
    if (!(Math.abs(slope) > 1e-4)) return a0;
    const [lo, hi] = LIMITS.spread[name];
    const want = clamp(a0 + (keyX(f.mf.x) - xa) / slope, Math.max(lo, -P.freeSpread, a0 - P.freeAimMax), Math.min(hi, P.freeSpread, a0 + P.freeAimMax));
    return lerp(a0, want, P.freeAimX);
  };
  const spreadOf = FINGERS.map((_, k) => freeAim(k));
  // (A finger crossing over the thumb first: its free neighbours go with it.)
  const arcOf = (k) => (fingers[k + 1].down ? 0 : clamp(fingers[k + 1].mf.arc || 0, 0, 1));
  const order = [0, 1, 2, 3].sort((a, b) => arcOf(b) - arcOf(a));
  for (const k of order) if (!fingers[k + 1].down) angles[FINGERS[k]] = freeFinger(k, spreadOf[k]);
  // A finger crossing over the thumb takes its free neighbours with it:
  // close beside it, curved behind it, rather than splayed out.
  for (let c = 0; c < 4; c++) {
    const arc = smooth(arcOf(c) / 0.5);
    if (!(arc > 0)) continue;
    for (const n of [c - 1, c + 1]) {
      if (n < 0 || n > 3 || fingers[n + 1].down || arcOf(n) > 0) continue;
      const beside = angles[FINGERS[c]].abd + (n < c ? -1 : 1) * P.crossFollow;
      const want = clamp(beside, LIMITS.spread[FINGERS[n]][0], LIMITS.spread[FINGERS[n]][1]);
      spreadOf[n] = lerp(spreadOf[n], n < c ? Math.max(spreadOf[n], want) : Math.min(spreadOf[n], want), arc);
      angles[FINGERS[n]] = freeFinger(n, spreadOf[n]);
    }
  }
  // Neighbouring fingers never touch: a free finger too near its neighbour
  // turns aside (both, when both are free), a few rounds.
  const capsulesOf = (name) => {
    const a = angles[name];
    const Wf = rig.fkFinger(name, a, arch[name]);
    const [, prox, inter, dist] = CHAINS[name];
    const P0 = toWorld(Wf.get(prox).p),
      P1 = toWorld(Wf.get(inter).p),
      P2 = toWorld(Wf.get(dist).p),
      P3 = toWorld(rig.fingerPad(name, a, arch[name]));
    const R = FINGER_R[name].map((r) => r * rig.scale);
    return { base: P0, segs: [[P0.clone().lerp(P1, 0.45), P1, R[0]], [P1, P2, R[1]], [P2, P3, R[2]]] };
  };
  const gapOf = (ka, kb) => {
    const A = capsulesOf(FINGERS[ka]),
      B = capsulesOf(FINGERS[kb]);
    let best = { gap: Infinity };
    for (const [a0, a1, ra] of A.segs)
      for (const [b0, b1, rb] of B.segs) {
        const g = segmentGap(a0, a1, b0, b1);
        const gap = g.d - ra - rb;
        if (gap < best.gap) best = { gap, la: Math.max(0.02, g.p.distanceTo(A.base)), lb: Math.max(0.02, g.q.distanceTo(B.base)) };
      }
    return best;
  };
  // (How free a finger is to turn aside: not on its key, nor coming to or
  // leaving one.)
  const freeOf = (f) => (f.down ? 0 : 1 - Math.max(f.aim, f.leaving));
  for (let round = 0; round < 3; round++) {
    let moved = false;
    for (let k = 0; k < 3; k++) {
      const fa = fingers[k + 1],
        fb = fingers[k + 2];
      const wa = freeOf(fa),
        wb = freeOf(fb);
      if (!(wa + wb > 0)) continue;
      const g = gapOf(k, k + 1);
      if (!(g.gap < P.gap)) continue;
      const need = P.gap - g.gap;
      // (Shared by how free each is; a finger on its key does not move.)
      const sa = wa / Math.max(wa + wb, 1),
        sb = wb / Math.max(wa + wb, 1);
      if (fa.down && fb.down) continue;
      spreadOf[k] -= (sa * need) / g.la;
      spreadOf[k + 1] += (sb * need) / g.lb;
      for (const j of [k, k + 1]) {
        if (fingers[j + 1].down) continue;
        const name = FINGERS[j];
        spreadOf[j] = clamp(spreadOf[j], LIMITS.spread[name][0], LIMITS.spread[name][1]);
        angles[name] = freeFinger(j, spreadOf[j]);
      }
      moved = true;
    }
    if (!moved) break;
  }

  // 6. The thumb off its key: in its playing pose, resting just clear of the
  // keys (carried up with a resting or flying hand), following the hand (a
  // little toward where the engine has it); toward the key it aims for;
  // passing under the hand, in under the palm near the keys.
  if (!fingers[0].down) {
    const f = fingers[0];
    const mf = f.mf;
    const lifted = smooth(((mf.lift || 0) - P.hover.liftFrom) / (1 - P.hover.liftFrom));
    const clear = P.hover.clear + P.hover.perLift * lifted + handRise;
    const natPad = comfortOf(0, 0).applyQuaternion(qh).add(O);
    const restAt = new THREE.Vector3(lerp(natPad.x, keyX(mf.x), 0.25), 0, natPad.z);
    // Open the relaxed thumb from its CMC, leaving a visible curved web
    // beside the index. Moving its target laterally and a little toward the
    // player lets the existing solver preserve a soft MCP/IP bend. A thumb
    // arriving, releasing or passing under keeps its original target path.
    const restShare = 1 - Math.max(f.aim, f.leaving, clamp(mf.tuck || 0, 0, 1));
    restAt.add(new THREE.Vector3(-chir * (P.thumbRestOut ?? 0), 0, P.thumbRestBack ?? 0).applyQuaternion(qh).multiplyScalar(restShare));
    restAt.y = keyTop(blackUnder(restAt.x, restAt.z, f.r, blackEnd)) + f.r + clear;
    const soft = P.thumbSoft * (1 - f.leaving);
    const restS = rig.solveThumb(toModel(restAt), P, LIMITS, soft);
    const hover = hoverOf(f);
    const tuck = clamp(mf.tuck || 0, 0, 1);
    if (tuck > 0) {
      hover.z += P.tuckIn * tuck;
      hover.y = lerp(hover.y, keyTop(0) + f.r + 0.006, tuck);
    }
    const aimS = rig.solveThumb(toModel(hover), P, leavingLimits(f, L), soft);
    const k2 = clamp((mf.extend ?? 0) * (1 - (mf.curl ?? 0)), 0, 1);
    const kk = Math.max(k2, tuck);
    const a = {
      flex: lerp(restS.flex, aimS.flex, kk),
      abd: lerp(restS.abd, aimS.abd, kk),
      mcp: lerp(restS.mcp, aimS.mcp, kk),
    };
    a.twist = rig.thumbTwist(a.flex, P);
    a.ip = rig.thumbIp(a.mcp, P);
    angles.thumb = a;
  }
  const clearFreeFingers = () => {
    for (let k = 0; k < FINGERS.length; k++) {
      const f = fingers[k + 1], name = FINGERS[k];
      if (!f.down && !f.mf.exact) for (let pass = 0; pass < 3; pass++)
        angles[name] = aboveKeys(name, f, angles[name]);
    }
  };
  // Easing must approach the same safe pose as a stationary frame.
  clearFreeFingers();
  // (The free digits eased from the frame before — less as one comes down to
  // its key or leaves it, so it meets and leaves its key exactly.)
  if (ease?.held.angles) {
    // (A free digit settles on its own, slower clock — `freeEase` s — so a
    // solution that flickers between two rests reads as a slow drift, not a
    // tremor; a digit coming to or leaving its key keeps the hand's clock.)
    const kFree = ease.dt > 0 && P.freeEase > 0 ? 1 - Math.exp(-ease.dt / P.freeEase) : clamp(ease.k, 0, 1);
    DIGITS.forEach((name, i) => {
      const f = fingers[i];
      const was = ease.held.angles[name];
      const now = angles[name];
      if (f.down || !was || !now) return;
      const k = lerp(Math.min(kFree, clamp(ease.k, 0, 1)), 1, Math.max(f.descent, f.leaving, f.mf.exact ? 1 : 0));
      const mixed = { ...now };
      for (const key of Object.keys(now)) if (typeof now[key] === "number" && typeof was[key] === "number" && key !== "err") mixed[key] = was[key] + (now[key] - was[key]) * k;
      angles[name] = mixed;
    });
  }
  // Spreading, crossing and easing can change a free finger after its early
  // surface check. Recheck at the final pose; exact key contacts never move.
  clearFreeFingers();
  // To the world.
  const W = rig.fk(angles);
  const world = new Map();
  for (const [name, t] of W) world.set(name, { p: t.p.clone().sub(rig.origin).applyQuaternion(q).add(O), q: q.clone().multiply(t.q) });
  const pads = DIGITS.map((d, i) => {
    const dist = world.get(CHAINS[d].at(-2));
    const c = rig.pads[d].c.clone().applyQuaternion(dist.q).add(dist.p);
    const nail = rig.pads[d].nail.clone().applyQuaternion(dist.q).add(dist.p);
    const end = new THREE.Vector3(rig.pads[d].c.x, rig.pads[d].c.y, rig.pads[d].end).applyQuaternion(dist.q).add(dist.p);
    // (How high the pad is over the key top under it — 0 or less on its key.)
    const under = fingers[i].down ? clamp(fingers[i].mf.black, 0, 1) : blackUnder(c.x, c.z, rig.pads[d].r, blackEnd);
    return { centre: c, r: rig.pads[d].r, nail, end, height: c.y - rig.pads[d].r - keyTop(under), contact: fingers[i].down ? fingers[i].target.clone().setY(fingers[i].target.y - fingers[i].r) : null };
  });
  // (`screen`: the free fingers' limit on screen and the outlines it came
  // from, canvas px — for checks.)
  const screen = { limits: FINGERS.map((_, k) => Math.max(limitOf(k), ...playLimit[k].map((a) => a.lim))), comfort: comfortTop, tops: FINGERS.map((name) => topOf(name, angles[name])), free: debugFree, placedAt, def, ...(trace ? { trace } : {}) };
  // (What the next frame eases from, for a renderer that keeps it.)
  const held = { O: O.clone(), yaw, pitch, roll, angles: Object.fromEntries(DIGITS.map((d) => [d, angles[d] ? { ...angles[d] } : null])) };
  return { world, angles, errors, origin: O, q, yaw, pitch, roll, pads, fingers, screen, held };
}
