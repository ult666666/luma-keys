// What the 3-D hands are drawn from, prepared once per hand model: the
// prepared mesh (hand3d-rig.mjs prepareTemplate), each vertex's skin
// attributes (its colour zone, which digit it belongs to, how far along the
// hand toward the wrist) and its tangent (for the skin's normal map). Pure
// three.js maths — the stage runs it in a worker (hand3d-prep.worker.mjs) so
// none of it lands on the main thread; the lab and the checks call it
// directly. Plain data in and out (serialise / deserialise), so it crosses
// to the main thread as transferable arrays.
import * as THREE from "three";
import { CHAINS, DIGITS, FINGERS, HandRig, POSTURE, prepareTemplate } from "./hand3d-rig.mjs";

// Shared by the runtime and the skin-map baker. Surface revisions also
// invalidate maps when the sculpt changes without changing its strength.
export const HAND_RENDER_GEOMETRY = Object.freeze({ subdivide: 2, sculpt: 0.55, surfaceVersion: 6 });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

// Skin tones (sRGB albedo): the back of the hand, the palm side, the skin
// over the knuckles, the fingertips' flush, the nails and their free edge,
// the cooler skin in the valleys between the metacarpals; and how much of
// the skin's sheen and oily coat each keeps (`coat`: darker skin is lit
// mostly by its diffuse — the same highlight on it reads as varnish).
export const SKIN_TONES = {
  light: { skin: "#f6ccb3", palm: "#ffe3ce", knuckle: "#dda799", tip: "#eeb39f", nail: "#f4d5cf", nailEdge: "#f8e8db", valley: "#debaa8", vein: "#c6bfb9", coat: 1 },
  medium: { skin: "#cc946f", palm: "#e1ae91", knuckle: "#ae6650", tip: "#d27f6c", nail: "#e8c3b5", nailEdge: "#f8ebe3", valley: "#b2826b", vein: "#8b8fa6", coat: 0.8 },
  tan: { skin: "#a9714d", palm: "#c99471", knuckle: "#8b4e37", tip: "#b46a53", nail: "#dcb4a3", nailEdge: "#f1e0d6", valley: "#8f6149", vein: "#6f6a7e", coat: 0.6 },
  deep: { skin: "#70452c", palm: "#a06d52", knuckle: "#593220", tip: "#814c38", nail: "#c49a88", nailEdge: "#e6d1c5", valley: "#5c3a27", vein: "#4c4250", coat: 0.45 },
};

// (The skin's broad value noise, for the vertex colours.)
const fract = (x) => x - Math.floor(x);
function hash13(x, y, z) {
  let px = fract(x * 0.1031),
    py = fract(y * 0.1031),
    pz = fract(z * 0.1031);
  const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}
function valueNoise(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const fx = s(x - ix),
    fy = s(y - iy),
    fz = s(z - iz);
  const h = (a, b, c) => hash13(ix + a, iy + b, iz + c);
  const l = (a, b, k) => a + (b - a) * k;
  const plane = (c) => l(l(h(0, 0, c), h(1, 0, c), fx), l(h(0, 1, c), h(1, 1, c), fx), fy);
  return l(plane(0), plane(1), fz);
}

// The joints whose creases fade as they bend (aFlex's index; the renderer's
// uFlex in the same order).
export const FLEX_JOINTS = ["thumb-phalanx-proximal", "thumb-phalanx-distal", ...FINGERS.flatMap((f) => [`${f}-finger-phalanx-intermediate`, `${f}-finger-phalanx-distal`])];

// Per-vertex skin colour (linear), which digit a vertex belongs to, its bind
// position (mm, for the shader's fine grain), how far toward the wrist it is
// (the forearm dissolving), how much it is the back of the hand.
export function skinAttributes(tpl, rig, look = {}) {
  const { position, normal, names } = tpl;
  const n = position.length / 3;
  const colors = new Float32Array(n * 3);
  const self = new Float32Array(n * 4);
  const selfThumb = new Float32Array(n);
  const bindPos = new Float32Array(n * 3);
  const fade = new Float32Array(n);
  const backOfHand = new Float32Array(n);
  const flex = new Float32Array(n * 2);
  const tone = { ...(SKIN_TONES[look.tone] || SKIN_TONES.light), ...(look.colors || null) };
  const C = (c) => new THREE.Color(c);
  const base = C(tone.skin),
    palmC = C(tone.palm),
    tipC = C(tone.tip),
    valleyC = C(tone.valley ?? tone.skin);
  const k = tpl.scale ?? 1;
  const toHand = (v) => v.clone().sub(rig.origin).applyQuaternion(rig.toHand);
  const heads = FINGERS.map((f) => toHand(rig.bind.get(CHAINS[f][1]).p));
  const wristH = toHand(rig.bind.get("wrist").p);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.toHand.clone().invert());
  const digitOf = new Map();
  for (const d of DIGITS) for (const j of CHAINS[d]) digitOf.set(names.indexOf(j), d);
  const inv = (name) => {
    const b = rig.bind.get(name);
    const q = b.q.clone().invert();
    return { q, p: b.p.clone().negate().applyQuaternion(q) };
  };
  const distal = Object.fromEntries(DIGITS.map((d) => [d, inv(CHAINS[d].at(-2))]));
  // The joints whose creases smooth out as they bend (the skin over a bent
  // knuckle is stretched taut): the thumb's MCP and IP, each finger's PIP and
  // DIP — FLEX_JOINTS order, each with its frame (world → joint).
  const flexJoints = FLEX_JOINTS.map((j) => ({ j, t: inv(j) }));
  const flexOf = new Map(DIGITS.map((d) => [d, flexJoints.map((fj, n) => ({ ...fj, n })).filter((fj) => CHAINS[d].includes(fj.j))]));
  const v = new THREE.Vector3(),
    nn = new THREE.Vector3(),
    c = new THREE.Color(),
    h = new THREE.Vector3(),
    local = new THREE.Vector3();
  const qInvHand = rig.toHand;
  for (let i = 0; i < n; i++) {
    v.set(position[3 * i], position[3 * i + 1], position[3 * i + 2]);
    nn.set(normal[3 * i], normal[3 * i + 1], normal[3 * i + 2]);
    bindPos[3 * i] = v.x * 1000;
    bindPos[3 * i + 1] = v.y * 1000;
    bindPos[3 * i + 2] = v.z * 1000;
    h.copy(v).sub(rig.origin).applyQuaternion(qInvHand);
    const towardWrist = h.z;
    fade[i] = towardWrist;
    c.copy(base);
    const back = nn.dot(up);
    const dorsal = smooth((back - 0.2) / 0.5);
    // The valleys between the metacarpals, on the back of the hand: a little
    // darker and cooler than the skin over the bones.
    if (dorsal > 0 && towardWrist > 0.004) {
      const t = clamp(towardWrist / Math.max(1e-6, wristH.z), 0, 1);
      let nearest = Infinity;
      for (const hd of heads) nearest = Math.min(nearest, Math.abs(h.x - (hd.x + (wristH.x - hd.x) * 0.55 * t)));
      const valley = smooth((nearest - 0.0035) / 0.005) * smooth((towardWrist - 0.004) / 0.01) * (1 - smooth((t - 0.75) / 0.25));
      c.lerp(valleyC, valley * dorsal * (look.valley ?? 0.5));
    }
    // The palm side is lighter and pinker.
    c.lerp(palmC, smooth((-back + 0.15) / 0.7) * 0.85);
    // Toward the wrist the skin greys a little.
    const grey = (look.wristGrey ?? 0) * smooth((towardWrist - 0.03) / 0.05);
    if (grey > 0) {
      const l = 0.3 * c.r + 0.55 * c.g + 0.15 * c.b;
      c.r += (l - c.r) * grey;
      c.g += (l - c.g) * grey;
      c.b += (l - c.b) * grey;
    }
    const d = digitOf.get(rig.dominant[i]);
    for (let s = 0; s < 4; s++) {
      const w = tpl.weights[4 * i + s];
      const b = tpl.joints[4 * i + s];
      const dd = digitOf.get(b);
      if (!(w > 0) || !dd || (dd !== "thumb" && names[b].endsWith("metacarpal"))) continue;
      if (dd === "thumb") selfThumb[i] += w;
      else self[4 * i + FINGERS.indexOf(dd)] += w;
    }
    if (d) {
      const pad = rig.pads[d];
      local.copy(v).applyQuaternion(distal[d].q).add(distal[d].p);
      // Fingertips flush pink toward their ends.
      c.lerp(tipC, smooth((-local.z - (pad.len - 0.016 * k)) / (0.012 * k)) * 0.55);
    }
    // Broad mottling: a few percent of redness and brightness, attached to the skin.
    const mottle = (look.mottle ?? 1) * (valueNoise(v.x * 180, v.y * 180, v.z * 180) - 0.5);
    colors[3 * i] = c.r * (1 + 0.07 * mottle);
    colors[3 * i + 1] = c.g * (1 + 0.04 * mottle);
    colors[3 * i + 2] = c.b * (1 + 0.03 * mottle);
    backOfHand[i] = dorsal * clamp(1 - (self[4 * i] + self[4 * i + 1] + self[4 * i + 2] + self[4 * i + 3] + selfThumb[i]), 0, 1);
    // (The crease joint nearest along its digit, and how near: full within
    // 3 mm of it, nothing past 8.)
    flex[2 * i] = -1;
    if (d) {
      let best = null;
      for (const fj of flexOf.get(d)) {
        local.copy(v).applyQuaternion(fj.t.q).add(fj.t.p);
        const along = Math.abs(local.z);
        if (!best || along < best.along) best = { n: fj.n, along };
      }
      if (best) {
        flex[2 * i] = best.n;
        flex[2 * i + 1] = 1 - smooth((best.along - 0.003 * k) / (0.005 * k));
      }
    }
  }
  return { colors, self, selfThumb, bindPos, fade, tone, backOfHand, flex };
}

// Each vertex's tangent (xyz, handedness w) as three.js computes it — the
// frame the skin's normal map was baked in (scripts/bake-hand-maps.mjs).
export function tangentsOf(tpl) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(tpl.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(tpl.normal, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(tpl.uv, 2));
  g.setIndex(new THREE.BufferAttribute(tpl.index instanceof Uint32Array ? tpl.index : Uint32Array.from(tpl.index), 1));
  g.computeTangents();
  return g.getAttribute("tangent").array;
}

// Everything one hand is drawn from: the prepared mesh, its skin attributes
// and tangents. (`posture`: its edits and scale; `look`: its tone.)
export function prepareHandData(raw, posture = POSTURE, look = {}, { subdivide = look.subdivide ?? 1, sculpt = look.sculpt ?? 1 } = {}) {
  const tpl = prepareTemplate(raw, posture, { subdivide, sculpt });
  const rig = new HandRig(tpl);
  const attrs = skinAttributes(tpl, rig, look);
  return { tpl, attrs, tangent: tangentsOf(tpl) };
}

// Plain data for postMessage (and the transfer list), and back.
const ARRAYS = ["position", "normal", "uv", "joints", "weights", "index"];
const ATTRS = ["colors", "self", "selfThumb", "bindPos", "fade", "backOfHand", "flex"];
export function serialise({ tpl, attrs, tangent }) {
  const msg = {
    hand: tpl.hand,
    names: tpl.names,
    scale: tpl.scale ?? 1,
    bind: [...tpl.bind].map(([name, b]) => [name, b.p.x, b.p.y, b.p.z, b.q.x, b.q.y, b.q.z, b.q.w]),
    tone: attrs.tone,
    tangent,
  };
  for (const k of ARRAYS) msg[k] = tpl[k];
  for (const k of ATTRS) msg[`a_${k}`] = attrs[k];
  const transfer = [...ARRAYS.map((k) => tpl[k].buffer), ...ATTRS.map((k) => attrs[k].buffer), tangent.buffer];
  return { msg, transfer: [...new Set(transfer)] };
}
export function deserialise(msg) {
  const tpl = { hand: msg.hand, names: msg.names, scale: msg.scale, bind: new Map(msg.bind.map(([name, px, py, pz, qx, qy, qz, qw]) => [name, { p: new THREE.Vector3(px, py, pz), q: new THREE.Quaternion(qx, qy, qz, qw) }])) };
  for (const k of ARRAYS) tpl[k] = msg[k];
  const attrs = { tone: msg.tone };
  for (const k of ATTRS) attrs[k] = msg[`a_${k}`];
  return { tpl, attrs, tangent: msg.tangent };
}
