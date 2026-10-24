// Realistic 3-D hands over the on-screen keyboard.
//
// The motion engine (hand-pose.mjs) plans where each hand is and what every
// finger does, in real seconds; hand3d-rig.mjs turns one frame of its motion
// (handMotions → { pose, motion }) into a posed skeleton; this module renders
// the two skinned hands — the converted MRTK hand meshes,
// public/models/hands/{left,right}.glb (Microsoft, MIT License) —
// with WebGL over the 2-D keyboard, so every fingertip on a key projects
// exactly onto that key, and draws the finger numbers and the key cues into
// the same picture (hand3d-cues.mjs).
//
//   const prepared = await prepareHands("/models/hands/");   // the meshes (a worker), the skin maps
//   const hands = await buildHands3D({ canvas, prepared }, step);   // a piece per `await step()`
//                                      // (createHands3D: the same, built at once)
//   await hands.warm({ step });        // programs compiled, buffers and textures uploaded
//   hands.setKeyboardGeometry({ keyWidth, keysHeight, bedHeight, stripLeftPx,
//                               viewportWidthPx, topPx, dpr });
//   hands.setPoses({ left, right }, keys);   // handMotions(...)[hand] ({ pose, motion }) or
//                                            // null; `keys`: each motion's signature, if known
//   hands.setOpacity({ left, right }, dim);  // a resting hand steps back (0…1)
//   hands.setInk({ left, right });     // the theme's hand colours for numbers and cues
//   hands.setRoom({ shadow });         // the room's darkest tone, a little in the shadows
//   hands.render();                    // the cues beneath, the hands, the cues above
//   hands.fingers(hand);               // projected digits (canvas CSS px), for checks
//   hands.dispose({ release: true });  // GPU resources, and the context itself
//
// (The lab — scripts/hand3d-lab.html — and the checks can also pass the raw
// models, `createHands3D({ canvas, models: await loadHandModels(base) })`:
// they are prepared on the spot.)
//
// The app's stage drives this through hands3d-layer.mjs (lazily loaded, with
// the 2-D hands as its fallback).
//
// What the picture carries, besides the hands themselves:
//   · skin, not a glove: the nails, the creases over the joints, the
//     knuckles, the tendons and veins of the back of the hand, the redder
//     skin over the knuckles and at the fingertips, from maps baked into the
//     model's own UV layout (scripts/bake-hand-maps.mjs);
//   · light from above, over the player's left shoulder, so the back of the
//     hand turns from the light, the knuckles stand out and the hands cast
//     soft shadows on the keys (capsules along every bone, softening with
//     the distance to the key they fall on, sharp where they touch);
//   · the keys a hand holds look held: each is shaded as gone down, and the
//     fingertip on it has a crisp contact shadow, while a finger hovering
//     over its key casts only a soft one;
//   · the nails: a glossy plate on each digit's last phalanx (hand3d-nails.mjs),
//     whose rim shows even where a curved finger's nail is seen edge-on;
//   · the hand dissolves over the lower edge of the part of the bed that shows
//     (the skin and its shadow alike), and the forearm past the wrist, in 3-D;
//   · a hand that only waits where the other plays slides aside
//     (hand3d-overlap.mjs), so the two are never drawn as one;
//   · a thumb passing under the hand shows as its own outline in the hand's
//     colour, drawn only where the hand hides it; a hand covered by the other
//     (both playing there) shows through it as a faint rim;
//   · each playing or preparing finger's number on a ring at its fingertip,
//     in the column of its key, never on the other hand.
import * as THREE from "three";
import { keyboardLayout } from "./music.mjs";
import {
  KEY_W,
  BLACK_RISE,
  BLACK_SHARE,
  CHAINS,
  DIGITS,
  POSTURE,
  HandRig,
  handTemplate,
  poseHand,
  viewOf,
  depthAt,
  project,
} from "./hand3d-rig.mjs";
import { SKIN_TONES, FLEX_JOINTS, HAND_RENDER_GEOMETRY, prepareHandData, deserialise, skinAttributes } from "./hand3d-data.mjs";
import { createCues, fingerRingCue, separateFingerRings } from "./hand3d-cues.mjs";
import { handSeparation, overlapNeed, slidMotion } from "./hand3d-overlap.mjs";
import { nailGeometry } from "./hand3d-nails.mjs";
import { cuffGeometry } from "./hand3d-cuff.mjs";

export { POSTURE, viewOf, project, depthAt, poseHand, HandRig } from "./hand3d-rig.mjs";
export { SKIN_TONES } from "./hand3d-data.mjs";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const HANDS = ["left", "right"];
// (How quickly, s, a hand making way for the other slides aside while the
// music plays.)
const SLIDE_TAU = 0.07;
// (… measured on the posed hands once they come within this many keys of
// each other, and kept this far apart on screen, CSS px.)
const NEAR_KEYS = 1.5;
const SEPARATE_GAP_PX = 6;
// (Room to spare in the drawing buffer's height, CSS px: see setKeyboardGeometry.)
const BUFFER_SPARE = 48;
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---- the models ------------------------------------------------------------------------------
const modelCache = new Map();
// Both hand models as raw templates, parsed once per base URL.
export function loadHandModels(base = "/models/hands/") {
  if (!modelCache.has(base))
    modelCache.set(
      base,
      Promise.all(
        HANDS.map(async (hand) => {
          const res = await fetch(`${base}${hand}.glb`);
          if (!res.ok) throw new Error(`hand model ${hand}: ${res.status}`);
          return handTemplate(await res.arrayBuffer(), hand);
        }),
      ).then(([left, right]) => ({ left, right })),
    );
  return modelCache.get(base);
}

// The skin maps baked for each hand (scripts/bake-hand-maps.mjs), decoded
// off the main thread; null when they cannot load (the hands are then drawn
// without them).
export async function loadSkinMaps(base = "/models/hands/") {
  try {
    const one = async (name) => {
      const res = await fetch(`${base}${name}`);
      if (!res.ok) throw new Error(`skin map ${name}: ${res.status}`);
      const blob = await res.blob();
      return createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    };
    const out = {};
    for (const hand of HANDS) {
      const [normal, detail] = await Promise.all([one(`${hand}-skin-n.png`), one(`${hand}-skin-d.png`)]);
      out[hand] = { normal, detail };
    }
    return out;
  } catch (error) {
    if (typeof console !== "undefined") console.warn("Luma Keys: the hands' skin maps did not load.", error);
    return null;
  }
}

// Each hand prepared for drawing (hand3d-data.mjs prepareHandData), once per
// model, posture and look — on the spot (the lab, the checks) or handed in
// from the worker.
const preparedCache = new WeakMap();
export function preparedData(model, posture = POSTURE, look = {}) {
  let byPosture = preparedCache.get(model);
  if (!byPosture) preparedCache.set(model, (byPosture = new WeakMap()));
  let byLook = byPosture.get(posture);
  if (!byLook) byPosture.set(posture, (byLook = new Map()));
  const key = `${look.tone || "light"}|${look.subdivide ?? 1}|${look.sculpt ?? 1}|${look.valley ?? ""}|${look.wristGrey ?? ""}|${look.mottle ?? ""}|${JSON.stringify(look.colors || {})}`;
  if (!byLook.has(key)) byLook.set(key, prepareHandData(model, posture, look, { subdivide: look.subdivide ?? 1, sculpt: look.sculpt ?? 1 }));
  return byLook.get(key);
}

// Everything the stage needs before it makes a renderer: both hands
// prepared in a worker (the main thread only receives the arrays) and their
// skin maps decoded. Without workers, each hand is prepared here, a task each.
let workerSeq = 0;
export async function prepareHands(base = "/models/hands/", { look = {}, worker = true } = {}) {
  const lk = { ...LOOK, ...look };
  const skinLook = { tone: lk.tone, valley: lk.valley, wristGrey: lk.wristGrey, mottle: lk.mottle, colors: lk.colors, subdivide: lk.subdivide, sculpt: lk.sculpt };
  const maps = loadSkinMaps(base);
  let prepared = null;
  if (worker && typeof Worker === "function") {
    try {
      const w = new Worker(new URL("./hand3d-prep.worker.mjs", import.meta.url), { type: "module" });
      try {
        const one = (hand) =>
          new Promise((resolve, reject) => {
            const id = ++workerSeq;
            const onMessage = (e) => {
              if (e.data?.id !== id) return;
              w.removeEventListener("message", onMessage);
              if (e.data.ok) resolve(deserialise(e.data.data));
              else reject(new Error(e.data.error));
            };
            w.addEventListener("message", onMessage);
            w.addEventListener("error", (e) => reject(new Error(e.message || "hand worker failed")), { once: true });
            w.postMessage({ id, hand, url: new URL(`${base}${hand}.glb`, location.href).href, look: skinLook });
          });
        const [left, right] = await Promise.all([one("left"), one("right")]);
        prepared = { left, right };
      } finally {
        w.terminate();
      }
    } catch (error) {
      if (typeof console !== "undefined") console.info("Luma Keys: preparing the hands on the main thread.", error?.message || error);
    }
  }
  if (!prepared) {
    const models = await loadHandModels(base);
    prepared = {};
    for (const hand of HANDS) {
      await nextTask();
      prepared[hand] = preparedData(models[hand], POSTURE, skinLook);
    }
  }
  return { ...prepared, maps: await maps };
}

// ---- the look --------------------------------------------------------------------------------
export const LOOK = {
  tone: "light",
  // The baked map varies each region around these base roughness values:
  // drier creases, smoother shafts and a broader dorsal highlight.
  roughness: 0.54,
  roughnessBack: 0.57,
  specular: 0.38,
  sheen: 0.08,
  sheenRoughness: 0.7,
  sheenColor: "#ffd9c6",
  // The skin's thin oily layer — weaker on the back of the hand than on the
  // digits — and the nails' gloss.
  clearcoat: 0.025,
  clearcoatBack: 0.3,
  clearcoatRoughness: 0.55,
  nailCoat: 0.42,
  // The baked detail: how strongly its relief shows (the normal map's
  // scale), the redness over the knuckles, the creases' darkness.
  normalScale: 1.05,
  red: 0.78,
  cavity: 0.26,
  veins: 0.04,
  // Value across the skin: the valleys between the metacarpals, the skin
  // greying toward the wrist (vertex colours).
  valley: 0.07,
  wristGrey: 0,
  // Light scattered under the skin: how far diffuse light wraps past the
  // terminator per channel (red furthest).
  wrap: [0.2, 0.12, 0.08],
  // The digits shading one another (capsule occlusion), the fine mottling.
  ao: 0.48,
  mottle: 0.1,
  sculpt: HAND_RENDER_GEOMETRY.sculpt,
  // Lights (world: +x right, +y up, +z toward the player): the key light
  // low from the player's left, across the hand — each finger lit on one
  // side and turning into shadow on the other, the knuckles and tendons
  // standing out — the sky and the keys' bounce, a rim from beyond the keys
  // that lifts the fingers off them.
  key: 2.05,
  keyColor: "#fff5ec",
  keyDir: [-0.6, 0.7, 0.3],
  fill: 0.6,
  sky: "#e9edf3",
  ground: "#e9d8c5",
  rim: 0.3,
  rimColor: "#ffeedd",
  rimDir: [0.42, 0.42, -0.8],
  // The room as the skin reflects it: a sky above, the floor and the keys
  // below, a soft window where the key light is.
  envSky: "#c9d3e2",
  envGround: "#4a3a2e",
  envKey: "#fff1e2",
  env: 0.28,
  exposure: 1.1,
  toneMap: "neutral",
  // The hands' shadows on the keys, from a softer light higher above the
  // player's left shoulder (the room's): how fast they
  // soften with the distance to what casts them (`shadowSoft`, at most
  // `shadowSoftMax` × a white key's width), how dark, how much of it a part
  // that high still casts (`shadowFade`: m, full below the first,
  // `shadowFar` of it past the second), how much the palm casts; the contact
  // shadow under a fingertip on its key — small, soft, where it meets it.
  shadowDir: [-0.4, 0.86, 0.3],
  shadowSoft: 0.22,
  shadowSoftMax: 0.22,
  shadow: 0.23,
  shadowFade: [0.006, 0.03],
  shadowFar: 0.16,
  palmShadow: 0.4,
  shadowColor: "#2b170d",
  contact: 0.42,
  // The forearm dissolving past the wrist (m along the hand from the
  // knuckle row: opaque before `from`, gone at `to`), and the whole picture
  // over the bed's last `fadePx` (CSS px).
  // Let the wrist taper continue towards the screen boundary instead of
  // dissolving immediately behind the palm. Stop before the 156 mm mesh cut.
  // The local forearm continues beyond the clipped stage; do not dissolve
  // skin over the keys/apron. Values are beyond the complete mesh extent.
  wristFade: [1, 1.1],
  fadePx: 0,
  cuff: false,
  // Keep hidden-thumb teaching cues on the key/finger marker. Painting its
  // weighted surface through the palm produces a coloured wedge at the
  // metacarpal boundary. The lab can still inspect that optional overlay.
  underCue: 0,
  xray: 0.55,
  subdivide: HAND_RENDER_GEOMETRY.subdivide,
  // The nails' rim catching the light edge-on, and their gloss; the warmth
  // light scattered under the skin gives its edges; the soft occlusion under
  // each palm on the keys; the shadows' resolution (they are soft).
  nailGlint: 0.06,
  nailRoughness: 0.4,
  sss: 0.55,
  palmAo: 0.16,
  shadowRes: 0.5,
};

// ---- the skin ----------------------------------------------------------------------------------
const CAPSULES = 15;
const glslColor = (c) => `vec3(${new THREE.Color(c).toArray().map((x) => x.toFixed(4)).join(",")})`;
// Each digit's bones as occluders: [from joint, to joint (or "pad"), radius m].
const OCCLUDERS = {
  thumb: [["thumb-metacarpal", "thumb-phalanx-proximal", 0.012], ["thumb-phalanx-proximal", "thumb-phalanx-distal", 0.0095], ["thumb-phalanx-distal", "pad", 0.0085]],
  index: [["index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", 0.0088], ["index-finger-phalanx-intermediate", "index-finger-phalanx-distal", 0.0078], ["index-finger-phalanx-distal", "pad", 0.0072]],
  middle: [["middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", 0.0092], ["middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", 0.008], ["middle-finger-phalanx-distal", "pad", 0.0074]],
  ring: [["ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", 0.0086], ["ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", 0.0077], ["ring-finger-phalanx-distal", "pad", 0.0071]],
  pinky: [["pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", 0.0078], ["pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", 0.007], ["pinky-finger-phalanx-distal", "pad", 0.0064]],
};
// The bones that cast the hands' shadows on the keys: every digit's (as
// above) and the palm's — each metacarpal from a little past the wrist, and
// the knuckle row. (The wrist itself casts nothing: it dissolves.)
const PALM_CASTERS = [
  ["wrist", "index-finger-phalanx-proximal", 0.012],
  ["wrist", "middle-finger-phalanx-proximal", 0.013],
  ["wrist", "ring-finger-phalanx-proximal", 0.013],
  ["wrist", "pinky-finger-phalanx-proximal", 0.012],
  ["index-finger-phalanx-proximal", "pinky-finger-phalanx-proximal", 0.011],
];
const PALM_FROM = 0.4;
const CASTERS = 15 + PALM_CASTERS.length;

// The digits shading one another: each bone of the other digits as a capsule
// occluder (view space). (A digit's own skin is left out by how much it
// belongs to the digit — skinned to its bones — so the skin where a finger
// leaves the hand shades smoothly; and a bone does not shade the skin about
// its own base joint.)
const OCCLUSION_GLSL = `
          float handOcclusion(vec3 P, vec3 N, vec4 self, float selfThumb) {
            float occ = 0.0;
            for (int i = 0; i < ${CAPSULES}; i++) {
              vec4 A = uCapA[i];
              vec4 B = uCapB[i];
              float own = B.w < 1.5 ? selfThumb : B.w < 2.5 ? self.x : B.w < 3.5 ? self.y : B.w < 4.5 ? self.z : self.w;
              if (A.w <= 0.0 || own >= 0.999) continue;
              vec3 ba = B.xyz - A.xyz;
              float h = clamp(dot(P - A.xyz, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
              vec3 d = A.xyz + h * ba - P;
              float l = max(length(d), 1e-6);
              float rr = A.w * A.w;
              float clear = smoothstep(0.8 * A.w, 2.2 * A.w, length(P - A.xyz));
              occ += (1.0 - own) * clear * clamp(dot(N, d / l) * 0.75 + 0.25, 0.0, 1.0) * rr / max(l * l, rr);
            }
            return occ;
          }`;

// The skin's colours as uniforms (linear).
const toneUniforms = (tone) => ({
  uKnuckleTone: { value: new THREE.Color(tone.knuckle) },
  uNailColor: { value: new THREE.Color(tone.nail) },
  uNailEdge: { value: new THREE.Color(tone.nailEdge) },
  uVeinTone: { value: new THREE.Color(tone.vein || "#9aa6bf") },
});

function skinMaterial(look, uniforms, tone, maps, lut) {
  // (Darker skin keeps less of the sheen and the oily coat: SKIN_TONES.coat.)
  const coat = tone.coat ?? 1;
  const detail = !!(maps?.normal && maps?.detail);
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: look.roughness,
    metalness: 0,
    specularIntensity: look.specular * coat,
    sheen: look.sheen * (0.4 + 0.6 * coat),
    sheenRoughness: look.sheenRoughness,
    sheenColor: new THREE.Color(look.sheenColor),
    clearcoat: Math.max(0.0001, look.clearcoat * coat),
    clearcoatRoughness: look.clearcoatRoughness,
    // (A resting hand steps back, and the picture dissolves over the bed's
    // lower edge.)
    transparent: true,
    // (Dithered: the dissolve over a dark rail would show bands.)
    dithering: true,
    ...(detail ? { normalMap: maps.normal, normalScale: new THREE.Vector2(look.normalScale, look.normalScale) } : null),
  });
  const [wr, wg, wb] = look.wrap;
  // The physical light model with the skin's diffuse: the terminator wraps,
  // reddest where light travels furthest under the surface.
  const lightsPars = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
    "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );",
    `{
      vec3 wrapK = vec3(${wr.toFixed(3)}, ${wg.toFixed(3)}, ${wb.toFixed(3)});
      float ndl = dot( geometryNormal, directLight.direction );
      vec3 wrapped = clamp( ( vec3( ndl ) + wrapK ) / ( 1.0 + wrapK ), 0.0, 1.0 );
      // (Past the terminator the scattered light turns a muted warm brown,
      // not a saturated red: no bruise in the web of the thumb.)
      wrapped = mix( wrapped, vec3( dot( wrapped, vec3( 0.3, 0.55, 0.15 ) ) ) * vec3( 1.06, 1.0, 0.93 ), 0.5 * ( 1.0 - smoothstep( -0.22, 0.12, ndl ) ) );
      reflectedLight.directDiffuse += wrapped * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
    }`,
  );
  if (lightsPars === THREE.ShaderChunk.lights_physical_pars_fragment) throw new Error("hand3d: skin diffuse hook not found");
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // (The renderer's shared DFG table, so a renderer let go can let go of it: dispose.)
    lut.uniforms = shader.uniforms;
    const vs = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 aSelf;
        attribute float aSelfThumb;
        attribute vec3 aBind;
        attribute float aFade;
        attribute float aBack;
        attribute vec2 aFlex;
        uniform vec2 uWristFade;
        uniform float uFlex[${FLEX_JOINTS.length}];
        varying float vFlexFade;
        varying vec4 vSelf;
        varying float vSelfThumb;
        varying vec3 vBind;
        varying float vFade;
        varying float vBack;
        #ifdef HAND_AO_VERTEX
          uniform vec4 uCapA[${CAPSULES}];
          uniform vec4 uCapB[${CAPSULES}];
          varying float vOcc;
          ${OCCLUSION_GLSL}
        #endif`,
      )
      .replace(
        "#include <begin_vertex>",
        // (A crease over a bent joint smooths out: the skin there is taut.)
        "#include <begin_vertex>\nvSelf = aSelf;\nvSelfThumb = aSelfThumb;\nvBind = aBind;\nvFade = 1.0 - smoothstep(uWristFade.x, uWristFade.y, aFade);\nvBack = aBack;\nint flexAt = int(aFlex.x + 0.5);\nvFlexFade = aFlex.x < -0.5 ? 0.0 : aFlex.y * smoothstep(0.2, 0.75, uFlex[flexAt]);",
      )
      .replace(
        "#include <project_vertex>",
        // (The occlusion, which changes slowly over the skin, at the
        // vertices — the mesh's are a few millimetres apart.)
        "#include <project_vertex>\n#ifdef HAND_AO_VERTEX\nvOcc = handOcclusion(mvPosition.xyz, normalize(transformedNormal), aSelf, aSelfThumb);\n#endif",
      );
    if (!vs.includes("vOcc = handOcclusion")) throw new Error("hand3d: skin vertex hook not found");
    shader.vertexShader = vs;
    const fs = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec4 vSelf;
        varying float vSelfThumb;
        varying vec3 vBind;
        varying float vFade;
        varying float vBack;
        varying float vFlexFade;
        uniform float uRoughBack;
        #ifdef HAND_AO_VERTEX
          varying float vOcc;
        #else
          uniform vec4 uCapA[${CAPSULES}];
          uniform vec4 uCapB[${CAPSULES}];
          ${OCCLUSION_GLSL}
        #endif
        uniform float uAo;
        uniform float uMottle;
        uniform float uClearBack;
        uniform float uNailCoat;
        uniform float uDim;
        uniform float uSss;
        uniform vec2 uScreenFade;
        uniform vec3 uKnuckleTone;
        uniform vec3 uNailColor;
        uniform vec3 uNailEdge;
        uniform vec3 uVeinTone;
        uniform float uRed;
        uniform float uVeins;
        uniform float uCavity;
        uniform vec3 uEnvSky;
        uniform vec3 uEnvGround;
        uniform vec3 uEnvKey;
        uniform vec3 uEnvKeyDir;
        #ifdef HAND_DETAIL
          uniform sampler2D uSkinDetail;
        #endif
        float skinNail = 0.0;
        float skinCav = 0.0;
        float hash13(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }
        float vnoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`,
      )
      .replace("#include <lights_physical_pars_fragment>", lightsPars)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          #ifdef HAND_DETAIL
            // The baked detail (scripts/bake-hand-maps.mjs): redness over the
            // knuckles and at the fingertips (veins the other way), the
            // creases' and folds' cavity, the nail plate and its pale free
            // edge and lunula.
            vec4 sd = texture2D( uSkinDetail, vNormalMapUv );
            float hue = sd.r * 2.0 - 1.0;
            skinCav = sd.g * ( 1.0 - 0.25 * vFlexFade );
            skinNail = sd.b;
            diffuseColor.rgb = mix( diffuseColor.rgb, uKnuckleTone, clamp( max( hue, 0.0 ) * uRed, 0.0, 0.85 ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * uVeinTone * 1.18, clamp( -hue, 0.0, 1.0 ) * uVeins );
            diffuseColor.rgb *= 1.0 - uCavity * skinCav;
            vec3 nailCol = mix( uNailColor, uNailEdge, sd.a );
            diffuseColor.rgb = mix( diffuseColor.rgb, nailCol, skinNail );
            #ifdef HAND_DEBUG_DETAIL
              // (The lab's &debugDetail=1: redness, cavity, nail as red, green, blue.)
              diffuseColor.rgb = vec3( max( hue, 0.0 ), sd.g, sd.b ) + 0.15;
            #endif
          #endif
          // A fine mottling, attached to the skin (the broad one is in the
          // vertex colours).
          float fine = vnoise(vBind * 0.9) - 0.5;
          diffuseColor.rgb *= 1.0 + uMottle * 0.03 * fine * (1.0 - skinNail);
          // A resting hand steps back: darker, its hue kept (a little less
          // saturated), so it still reads as skin and its fingers apart.
          float lum = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( lum ), 0.08 * uDim ) * ( 1.0 - 0.16 * uDim );
          // The forearm dissolving past the wrist, and the picture over the
          // bed's lower edge.
          diffuseColor.a *= vFade * smoothstep( uScreenFade.x, uScreenFade.y, gl_FragCoord.y );
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        // Bent skin softens the fine creases, but retains enough relief to
        // distinguish the middle joint from a smooth cylinder.
        THREE.ShaderChunk.normal_fragment_maps.replace("mapN.xy *= normalScale;", "mapN.xy *= normalScale * ( 1.0 - 0.25 * vFlexFade );"),
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        #ifdef HAND_DETAIL
          // The bake is centred at .5. A max against the base roughness
          // erased nearly all of its regional variation, making the hand
          // uniformly matte. Preserve both its dry and smoother regions.
          float skinRough = texture2D( normalMap, vNormalMapUv ).a;
          roughnessFactor = mix( clamp( roughnessFactor + skinRough - 0.5, 0.32, 0.9 ), skinRough, skinNail );
        #endif
        roughnessFactor = clamp( roughnessFactor + ( uRoughBack - roughness ) * vBack * ( 1.0 - skinNail ), 0.18, 0.9 );`,
      )
      .replace(
        "#include <lights_physical_fragment>",
        // (Less of the oily coat on the back of the hand than on the digits;
        // the nails glossy.)
        "#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat = mix( material.clearcoat * mix(uClearBack, 1.0, clamp(vSelf.x + vSelf.y + vSelf.z + vSelf.w + vSelfThumb, 0.0, 1.0)), uNailCoat, skinNail );\nmaterial.clearcoatRoughness = mix( material.clearcoatRoughness, 0.14, skinNail );\n#endif",
      )
      .replace(
        "#include <lights_fragment_maps>",
        // The room the skin reflects (no environment map: a sky above, the
        // floor below, a soft window where the key light is).
        `#include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular ) && ! defined( USE_ENVMAP )
        {
          vec3 rv = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
          float rough = material.roughness;
          vec3 room = mix( uEnvGround, uEnvSky, smoothstep( -0.3, 0.7, rv.y ) );
          room += uEnvKey * pow( max( dot( rv, uEnvKeyDir ), 0.0 ), mix( 48.0, 3.0, rough ) ) * mix( 1.0, 0.3, rough );
          radiance += room * ( 1.0 - 0.7 * skinCav );
          #ifdef USE_CLEARCOAT
            vec3 rc = inverseTransformDirection( reflect( - geometryViewDir, geometryClearcoatNormal ), viewMatrix );
            clearcoatRadiance += mix( uEnvGround, uEnvSky, smoothstep( -0.3, 0.7, rc.y ) ) + uEnvKey * pow( max( dot( rc, uEnvKeyDir ), 0.0 ), 48.0 );
          #endif
        }
        #endif`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        {
          // The digits shade one another (capsules, view space), and the
          // creases and folds hold a little shadow.
          #ifdef HAND_AO_VERTEX
            float occ = vOcc;
          #else
            float occ = handOcclusion(-vViewPosition, normal, vSelf, vSelfThumb);
          #endif
          float ao = ( 1.0 - clamp(occ * uAo, 0.0, 0.8) ) * ( 1.0 - 0.45 * skinCav );
          reflectedLight.indirectDiffuse *= ao;
          reflectedLight.indirectSpecular *= ao;
          reflectedLight.directDiffuse *= mix(1.0, ao, 0.6);
          reflectedLight.directSpecular *= mix(1.0, ao, 0.6);
          #ifdef USE_SHEEN
            sheenSpecularIndirect *= ao;
            sheenSpecularDirect *= mix(1.0, ao, 0.6);
          #endif
        }`,
      )
      .replace(
        "#include <opaque_fragment>",
        // (Light scattered under the skin warms its edges as they turn away.)
        "outgoingLight *= mix( vec3( 1.0 ), vec3( 1.07, 0.95, 0.9 ), uSss * pow( 1.0 - clamp( abs( normal.z ), 0.0, 1.0 ), 2.5 ) );\n#include <opaque_fragment>",
      );
    for (const hook of ["skinNail = sd.b", "handOcclusion(", "wrapK", "uScreenFade.y", "uSss * pow", "uClearBack, 1.0", "uRoughBack - roughness", "room += uEnvKey", "normalScale * ( 1.0 - 0.25 * vFlexFade )"])
      if (detail || (hook !== "skinNail = sd.b" && !hook.startsWith("normalScale"))) if (!fs.includes(hook)) throw new Error(`hand3d: skin shader hook not found (${hook})`);
    shader.fragmentShader = fs;
  };
  // (The occlusion per vertex unless `look.aoPerPixel`.)
  m.defines = { ...(look.aoPerPixel ? {} : { HAND_AO_VERTEX: "" }), ...(detail ? { HAND_DETAIL: "" } : {}), ...(look.debugDetail ? { HAND_DEBUG_DETAIL: "" } : {}) };
  m.customProgramCacheKey = () => `luma-skin-v13|${look.wrap.join(",")}|${detail ? 1 : 0}|${look.debugDetail ? 1 : 0}`;
  return m;
}

// The nails (hand3d-nails.mjs): a glossy plate, pink over its bed, paler at
// its base (the lunula) and white at its free edge; edge-on — as a curved
// finger's nail is from the stage's camera — its rim catches the light. A
// resting hand's nails step back with its skin, and they dissolve with the
// picture.
function nailMaterial(look, uniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: look.nailRoughness ?? 0.3,
    metalness: 0,
    specularIntensity: 0.45,
    clearcoat: 0.3,
    clearcoatRoughness: 0.32,
    transparent: true,
    dithering: true,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uDim: uniforms.uDim, uScreenFade: uniforms.uScreenFade, uNailColor: uniforms.uNailColor, uNailEdge: uniforms.uNailEdge, uNailGlint: { value: look.nailGlint ?? 0.22 } });
    const vs = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aNailUv;\nvarying vec2 vNailUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvNailUv = aNailUv;");
    const fs = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vNailUv;\nuniform float uDim;\nuniform vec2 uScreenFade;\nuniform vec3 uNailColor;\nuniform vec3 uNailEdge;\nuniform float uNailGlint;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          float s = vNailUv.y;
          float u = abs( vNailUv.x );
          // The bed pink, a little deeper at the sides; the lunula paler; the
          // free edge white past the fingertip.
          vec3 col = uNailColor * ( 1.0 - 0.1 * u * u );
          col = mix( col, mix( uNailColor, uNailEdge, 0.55 ), ( 1.0 - smoothstep( 0.0, 0.2, s ) ) * ( 1.0 - u * u ) * 0.7 );
          col = mix( col, uNailEdge, smoothstep( 0.89, 1.0, s ) * 0.75 );
          float lum = dot( col, vec3( 0.3, 0.55, 0.15 ) );
          col = mix( col, vec3( lum ), 0.08 * uDim ) * ( 1.0 - 0.16 * uDim );
          diffuseColor.rgb = col;
          #ifdef NAIL_DEBUG
            // (The lab's &nailDebug=1: the nails bright green.)
            diffuseColor.rgb = vec3( 0.0, 1.0, 0.2 );
          #endif
          diffuseColor.a *= smoothstep( uScreenFade.x, uScreenFade.y, gl_FragCoord.y );
        }`,
      )
      .replace(
        "#include <opaque_fragment>",
        // (Edge-on, its rim catches the room's light.)
        "outgoingLight += uNailGlint * ( 1.0 - 0.6 * uDim ) * pow( 1.0 - clamp( abs( dot( normal, vec3( 0.0, 0.0, 1.0 ) ) ), 0.0, 1.0 ), 2.5 ) * vec3( 1.0, 0.96, 0.92 );\n#include <opaque_fragment>",
      );
    if (!vs.includes("vNailUv = aNailUv") || !fs.includes("uNailGlint *")) throw new Error("hand3d: nail shader hook not found");
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  if (look.nailDebug) m.defines = { NAIL_DEBUG: "" };
  m.customProgramCacheKey = () => `luma-nail-v2|${look.nailDebug ? 1 : 0}`;
  return m;
}

// Fine ribbing filtered in screen space: quiet fabric at any keyboard zoom,
// with a narrow hand-colour seam. The sleeve follows the wrist bone.
function cuffMaterial(uniforms, trim) {
  const m = new THREE.MeshStandardMaterial({ color: "#e7ded1", roughness: 0.94, metalness: 0, transparent: true, dithering: true });
  const colour = { value: new THREE.Color(trim) };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { uCuffTrim: colour, uDim: uniforms.uDim, uScreenFade: uniforms.uScreenFade });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aCuffUv;\nvarying vec2 vCuffUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCuffUv = aCuffUv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCuffUv;\nuniform vec3 uCuffTrim;\nuniform float uDim;\nuniform vec2 uScreenFade;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float phase = vCuffUv.x * 46.0;
        float rib = cos(phase * 6.2831853) * (1.0 - smoothstep(0.15, 0.6, fwidth(phase)));
        diffuseColor.rgb *= 0.96 + 0.04 * rib;
        float seam = smoothstep(0.075, 0.095, vCuffUv.y) * (1.0 - smoothstep(0.13, 0.15, vCuffUv.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, uCuffTrim, 0.6 * seam);
        diffuseColor.rgb *= 1.0 - 0.16 * uDim;
        diffuseColor.a *= (1.0 - smoothstep(0.55, 1.0, vCuffUv.y)) * smoothstep(uScreenFade.x, uScreenFade.y, gl_FragCoord.y);
      `);
  };
  m.customProgramCacheKey = () => "luma-cuff-v1";
  return { material: m, trim: colour };
}

// The depth-only pass under a see-through hand: the skin's depth where it is
// opaque (not the forearm dissolving past the wrist, nor the picture's lower
// edge), slightly behind, so the colour pass then draws only the skin
// nearest the eye. (The hand on top also marks where it covers, for the
// other hand's rim: the stencil.)
function depthMaterial(uniforms) {
  const m = new THREE.MeshBasicMaterial({
    colorWrite: false,
    transparent: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWristFade = uniforms.uWristFade;
    shader.uniforms.uScreenFade = uniforms.uScreenFade;
    const vs = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade;\nuniform vec2 uWristFade;\nvarying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = 1.0 - smoothstep(uWristFade.x, uWristFade.y, aFade);");
    const fs = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;\nuniform vec2 uScreenFade;")
      .replace("void main() {", "void main() {\n\tif ( vFade * smoothstep( uScreenFade.x, uScreenFade.y, gl_FragCoord.y ) < 0.5 ) discard;");
    if (!vs.includes("vFade = 1.0") || !fs.includes("vFade * smoothstep")) throw new Error("hand3d: depth shader hook not found");
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => "luma-skin-depth-v2";
  return m;
}

// A hand covered by the other, showing through it: its rim in the hand's
// colour, only where the other hand covers it (the stencil its depth pass
// marked).
function xrayMaterial(uniforms) {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uXray: uniforms.uXray, uXrayColor: uniforms.uXrayColor, uWristFade: uniforms.uWristFade });
    const vs = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade;\nuniform vec2 uWristFade;\nvarying float vFade;\nvarying vec3 vXN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = 1.0 - smoothstep(uWristFade.x, uWristFade.y, aFade);")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvXN = normalize( normalMatrix * objectNormal );");
    const fs = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;\nvarying vec3 vXN;\nuniform float uXray;\nuniform vec3 uXrayColor;")
      .replace("#include <opaque_fragment>", "float rim = pow( 1.0 - abs( normalize( vXN ).z ), 2.2 );\noutgoingLight = uXrayColor;\ndiffuseColor.a = uXray * vFade * smoothstep( 0.3, 1.0, rim );\n#include <opaque_fragment>");
    if (!vs.includes("vXN = normalize") || !fs.includes("uXray * vFade")) throw new Error("hand3d: x-ray shader hook not found");
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => "luma-skin-xray-v2";
  return m;
}

// A thumb passing (or held) under the hand, where the hand hides it: the
// thumb's own skin drawn only where something of its hand is in front of it
// (the depth test reversed), in the hand's colour — a faint fill and a
// clear rim, so its true shape shows through the palm.
function underThumbMaterial(uniforms) {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    // (A little nearer than the skin it is drawn from, so the thumb's own
    // visible skin never passes the reversed test.)
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uUnder: uniforms.uUnder, uXrayColor: uniforms.uXrayColor, uWristFade: uniforms.uWristFade, uScreenFade: uniforms.uScreenFade });
    const vs = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade;\nattribute float aSelfThumb;\nuniform vec2 uWristFade;\nvarying float vFade;\nvarying float vThumb;\nvarying vec3 vXN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = 1.0 - smoothstep(uWristFade.x, uWristFade.y, aFade);\nvThumb = aSelfThumb;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvXN = normalize( normalMatrix * objectNormal );");
    const fs = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;\nvarying float vThumb;\nvarying vec3 vXN;\nuniform float uUnder;\nuniform vec3 uXrayColor;\nuniform vec2 uScreenFade;")
      .replace(
        "#include <opaque_fragment>",
        // (Its outline only — the silhouette's rim, a thin line in the
        // hand's colour — with the faintest fill, so it reads as a thumb
        // drawn on the palm, not as glass.)
        "float thumbOnly = smoothstep( 0.55, 0.85, vThumb );\nif ( thumbOnly < 0.01 ) discard;\nfloat rim = 1.0 - abs( normalize( vXN ).z );\noutgoingLight = uXrayColor;\ndiffuseColor.a = uUnder * vFade * thumbOnly * ( 0.05 + 0.9 * smoothstep( 0.72, 0.9, rim ) ) * smoothstep( uScreenFade.x, uScreenFade.y, gl_FragCoord.y );\n#include <opaque_fragment>",
      );
    if (!vs.includes("vThumb = aSelfThumb") || !fs.includes("thumbOnly")) throw new Error("hand3d: under-thumb shader hook not found");
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => "luma-skin-underthumb-v2";
  return m;
}

// The hands' shadows on a key surface: capsules along every bone, each
// softening with how far from the surface it is (sharp where it touches,
// soft from the palm), and a contact shadow under each fingertip on or near
// its key — dark and tight on the key, gone a few mm above it.
// (sRGB components of a CSS colour, 0…1: the shader writes them as they are.)
const srgb = (c) => {
  const v = new THREE.Color(c);
  v.convertLinearToSRGB();
  return new THREE.Vector3(v.r, v.g, v.b);
};
function shadowMaterial(look, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: srgb(look.shadowColor) } },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec4 uCastA[${2 * CASTERS}];
      uniform vec4 uCastB[${2 * CASTERS}];
      uniform vec4 uCastC[${2 * CASTERS}];
      uniform vec4 uPads[10];
      uniform vec4 uPadDir[10];
      uniform vec4 uPalm[2];
      uniform vec4 uPalmAxis[2];
      uniform vec4 uBox[2];
      uniform vec3 uLight;
      uniform float uSoft;
      uniform float uSoftMax;
      uniform vec3 uFade;
      uniform float uShadow;
      uniform float uContact;
      uniform vec2 uScreenFade;
      uniform vec3 uColor;
      uniform float uRail;
      varying vec3 vWorld;
      float capsuleShadow(vec3 p, vec3 L, vec3 a, vec3 b, float r) {
        vec3 ba = b - a;
        vec3 w0 = p - a;
        float bb = dot(ba, ba);
        float bl = dot(ba, L);
        float den = bb - bl * bl;
        float u = den > 1e-12 ? clamp((dot(ba, w0) - bl * dot(L, w0)) / den, 0.0, 1.0) : 0.0;
        vec3 c = a + u * ba;
        float t = dot(c - p, L);
        if (t <= 0.0) return 1.0;
        float d = length(p + t * L - c);
        // (On the rail, below and in front of the keys, a part's shadow
        // falls further off and softer: no crisp disc beside the hand.)
        float w = clamp(uSoft * t, 0.0007, uSoftMax) * (p.y < -0.004 ? 2.2 : 1.0);
        float strength = mix(1.0, uFade.z, smoothstep(uFade.x, uFade.y, t));
        return 1.0 - strength * (1.0 - smoothstep(-1.0, 1.0, (d - r) / w));
      }
      float contactShadow(vec3 p, vec4 pd, vec4 dir) {
        if (!(dir.w > 0.0)) return 0.0;
        vec2 rel = p.xz - pd.xz;
        vec2 along = normalize(dir.xy + vec2(1e-6, 0.0));
        float a = dot(rel, along), c = dot(rel, vec2(-along.y, along.x));
        float sa = pd.w * (a > 0.0 ? 0.75 : 0.42), sc = pd.w * 0.5;
        return dir.w * exp(-0.5 * (a * a / (sa * sa) + c * c / (sc * sc)));
      }
      bool reaches(vec2 pp, vec4 C, float r, float k) {
        vec2 ab = C.zw - C.xy;
        float h = clamp(dot(pp - C.xy, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
        vec2 dd = pp - C.xy - ab * h;
        float R = (r + 2.2 * uSoftMax) * k;
        return dot(dd, dd) < R * R;
      }
      void main() {
        float lit = 1.0;
        float contact = 0.0;
        vec2 pp = vWorld.xz - uLight.xz * (vWorld.y / uLight.y);
        float k = 1.0 + 1.0 / uLight.y;
        if (!(vWorld.x < uBox[0].x || vWorld.z < uBox[0].y || vWorld.x > uBox[0].z || vWorld.z > uBox[0].w)) {
          for (int i = 0; i < ${CASTERS}; i++) {
            vec4 A = uCastA[i];
            vec4 B = uCastB[i];
            if (!(B.w > 0.0) || !reaches(pp, uCastC[i], A.w, k)) continue;
            lit *= mix(1.0, capsuleShadow(vWorld, uLight, A.xyz, B.xyz, A.w), B.w);
          }
          for (int i = 0; i < 5; i++) contact = max(contact, contactShadow(vWorld, uPads[i], uPadDir[i]));
        }
        if (!(vWorld.x < uBox[1].x || vWorld.z < uBox[1].y || vWorld.x > uBox[1].z || vWorld.z > uBox[1].w)) {
          for (int i = ${CASTERS}; i < ${2 * CASTERS}; i++) {
            vec4 A = uCastA[i];
            vec4 B = uCastB[i];
            if (!(B.w > 0.0) || !reaches(pp, uCastC[i], A.w, k)) continue;
            lit *= mix(1.0, capsuleShadow(vWorld, uLight, A.xyz, B.xyz, A.w), B.w);
          }
          for (int i = 5; i < 10; i++) contact = max(contact, contactShadow(vWorld, uPads[i], uPadDir[i]));
        }
        // The soft occlusion under each palm: the keys beneath a hand get
        // less of the room's light, more the nearer the palm is to them.
        float under = 0.0;
        for (int i = 0; i < 2; i++) {
          vec4 pc = uPalm[i];
          if (!(pc.w > 0.0)) continue;
          vec2 rel = vWorld.xz - pc.xy;
          vec2 ax = uPalmAxis[i].xy;
          float al = dot(rel, ax) / uPalmAxis[i].z, ac = dot(rel, vec2(-ax.y, ax.x)) / uPalmAxis[i].w;
          under = max(under, pc.w * exp(-0.5 * (al * al + ac * ac)) * (1.0 - smoothstep(0.02, 0.1, pc.z - vWorld.y)));
        }
        float a = clamp(uShadow * (1.0 - lit) + uContact * contact + under, 0.0, 0.85) * smoothstep(uScreenFade.x, uScreenFade.y, gl_FragCoord.y);
        // (On the rail, well below the hands, only a faint soft shade.)
        a *= vWorld.y < -0.004 ? uRail : 1.0;
        // (Dithered: a faint gradient on a dark rail would show bands.)
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        a = max(0.0, a + (n - 0.5) / 255.0);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

// The hands' shadows laid over the keys from where they were drawn, at a
// fraction of the picture's resolution (they are soft): each receiver quad
// again, looking its own pixel up there.
function shadowCompositeMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: { uShadowTex: { value: texture }, uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(1, 1) } },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uShadowTex;
      uniform vec2 uOrigin;
      uniform vec2 uSize;
      void main() {
        gl_FragColor = texture2D(uShadowTex, (gl_FragCoord.xy - uOrigin) / uSize);
      }`,
  });
}

// ---- the renderer ------------------------------------------------------------------------------
const INK = {
  right: { rgb: [233, 180, 95], ink: "#45280a" },
  left: { rgb: [138, 174, 220], ink: "#0f2744" },
};
// (A texture from a decoded skin map.)
function mapTexture(bitmap, anisotropy) {
  const t = new THREE.Texture(bitmap);
  t.flipY = false;
  t.premultiplyAlpha = false;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// The renderer, built at once (the lab, the checks) …
export function createHands3D(options) {
  const it = construct(options);
  let r;
  while (!(r = it.next()).done);
  return r.value;
}
// … or a step at a time, `step()` awaited between (the stage: each piece in
// its own task, so the page never stalls while the hands are built).
export async function buildHands3D(options, step = nextTask) {
  const it = construct(options);
  let r;
  while (!(r = it.next()).done) await step();
  return r.value;
}

function* construct({ canvas, models = null, prepared = null, maps = undefined, posture = POSTURE, look: lookIn = {} }) {
  const look = { ...LOOK, ...lookIn };
  // (Multisampling where pixels are large enough to need it: `antialias`;
  // a stencil for the rim of a hand under the other.)
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: look.antialias ?? true, premultipliedAlpha: true, preserveDrawingBuffer: !!look.preserve, stencil: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = { neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, none: THREE.NoToneMapping }[look.toneMap] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = look.exposure;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 4);
  // (Every texture and material this renderer made, for dispose.)
  const lut = { uniforms: null };

  const key = new THREE.DirectionalLight(new THREE.Color(look.keyColor), look.key);
  scene.add(key, key.target);
  const fill = new THREE.HemisphereLight(new THREE.Color(look.sky), new THREE.Color(look.ground), look.fill);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(new THREE.Color(look.rimColor), look.rim);
  scene.add(rim, rim.target);
  const envUniforms = {
    uEnvSky: { value: new THREE.Color(look.envSky).multiplyScalar(look.env) },
    uEnvGround: { value: new THREE.Color(look.envGround).multiplyScalar(look.env) },
    uEnvKey: { value: new THREE.Color(look.envKey).multiplyScalar(look.env * 1.6) },
    uEnvKeyDir: { value: new THREE.Vector3(...look.keyDir).normalize() },
  };

  // The key surfaces the hands' shadows fall on — only under the hands: the
  // white key tops, the rail in front of them (a little lower), each black
  // key's top; their quads made again with each pose.
  const shadowUniforms = {
    uCastA: { value: Array.from({ length: 2 * CASTERS }, () => new THREE.Vector4()) },
    uCastB: { value: Array.from({ length: 2 * CASTERS }, () => new THREE.Vector4()) },
    uCastC: { value: Array.from({ length: 2 * CASTERS }, () => new THREE.Vector4()) },
    uPads: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
    uPadDir: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
    uPalm: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uPalmAxis: { value: [new THREE.Vector4(0, 1, 1, 1), new THREE.Vector4(0, 1, 1, 1)] },
    uBox: { value: [new THREE.Vector4(1, 1, -1, -1), new THREE.Vector4(1, 1, -1, -1)] },
    uLight: { value: new THREE.Vector3(...look.shadowDir).normalize() },
    uSoft: { value: look.shadowSoft },
    uSoftMax: { value: (look.shadowSoftMax ?? 1) * KEY_W },
    uFade: { value: new THREE.Vector3(...(look.shadowFade ?? [1, 2]), look.shadowFar ?? 1) },
    uShadow: { value: look.shadow },
    uContact: { value: look.contact },
    // (The shadows' own: they are drawn into a target of their own.)
    uScreenFade: { value: new THREE.Vector2(0, 1) },
    uRail: { value: look.railShadow ?? 0.3 },
  };
  // (The picture's dissolve over the bed's lower edge, in the drawing
  // buffer's pixels: the skin's, the nails', the passes'.)
  const screenFade = { value: new THREE.Vector2(0, 1) };
  const shadowMat = shadowMaterial(look, shadowUniforms);
  // The shadows are soft: drawn at `shadowRes` of the picture's resolution
  // into a target of their own (a quarter of the pixels at a half), then
  // laid over the keys. (1: drawn straight into the picture.)
  const shadowRes = clamp(look.shadowRes ?? 0.5, 0.25, 1);
  const shadowRT = shadowRes < 1 ? new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false }) : null;
  const compositeMat = shadowRT ? shadowCompositeMaterial(shadowRT.texture) : null;
  const RECEIVER_QUADS = 96;
  const receiverGeo = new THREE.BufferGeometry();
  const receiverPos = new THREE.BufferAttribute(new Float32Array(RECEIVER_QUADS * 4 * 3), 3);
  receiverPos.setUsage(THREE.DynamicDrawUsage);
  receiverGeo.setAttribute("position", receiverPos);
  {
    const index = new Uint16Array(RECEIVER_QUADS * 6);
    for (let q = 0; q < RECEIVER_QUADS; q++) index.set([4 * q, 4 * q + 1, 4 * q + 2, 4 * q, 4 * q + 2, 4 * q + 3], 6 * q);
    receiverGeo.setIndex(new THREE.BufferAttribute(index, 1));
  }
  receiverGeo.setDrawRange(0, 0);
  const receivers = new THREE.Mesh(receiverGeo, shadowMat);
  receivers.renderOrder = 0;
  receivers.frustumCulled = false;
  scene.add(receivers);

  yield;
  const cues = createCues();
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const textures = [];
  const hands = {};
  for (const hand of HANDS) {
    const data = prepared?.[hand] || preparedData(models[hand], posture, { tone: look.tone, subdivide: look.subdivide, sculpt: look.sculpt, valley: look.valley, wristGrey: look.wristGrey, mottle: look.mottle, colors: look.colors });
    const { tpl, attrs, tangent } = data;
    const rig = new HandRig(tpl);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(tpl.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(tpl.normal, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(tpl.uv, 2));
    g.setAttribute("tangent", new THREE.BufferAttribute(tangent, 4));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(tpl.joints instanceof Uint16Array ? tpl.joints : Uint16Array.from(tpl.joints), 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(tpl.weights, 4));
    g.setIndex(new THREE.BufferAttribute(tpl.index instanceof Uint32Array ? tpl.index : Uint32Array.from(tpl.index), 1));
    g.setAttribute("color", new THREE.BufferAttribute(attrs.colors, 3));
    g.setAttribute("aSelf", new THREE.BufferAttribute(attrs.self, 4));
    g.setAttribute("aSelfThumb", new THREE.BufferAttribute(attrs.selfThumb, 1));
    g.setAttribute("aBind", new THREE.BufferAttribute(attrs.bindPos, 3));
    g.setAttribute("aFade", new THREE.BufferAttribute(attrs.fade, 1));
    g.setAttribute("aBack", new THREE.BufferAttribute(attrs.backOfHand, 1));
    g.setAttribute("aFlex", new THREE.BufferAttribute(attrs.flex, 2));
    const bones = tpl.names.map((name) => {
      const b = new THREE.Bone();
      b.name = name;
      const t = tpl.bind.get(name);
      b.position.copy(t.p);
      b.quaternion.copy(t.q);
      return b;
    });
    const group = new THREE.Group();
    group.add(...bones);
    const skeleton = new THREE.Skeleton(bones);
    skeleton.boneInverses = bones.map((b) => new THREE.Matrix4().compose(b.position, b.quaternion, new THREE.Vector3(1, 1, 1)).invert());
    // Each digit's last two segments as points in their joints' frames, to
    // find the fingertip's outline on screen (where its number goes).
    const tipPoints = DIGITS.map((d) => {
      const chain = CHAINS[d];
      const ids = new Map(chain.slice(d === "thumb" ? 1 : 2).map((j) => [tpl.names.indexOf(j), j]));
      const pts = [];
      const nv = tpl.position.length / 3;
      const inv = new Map([...ids.values()].map((j) => [j, rig.bind.get(j).q.clone().invert()]));
      for (let i = 0; i < nv; i += 2) {
        const j = ids.get(rig.dominant[i]);
        if (!j) continue;
        const b = rig.bind.get(j);
        const local = new THREE.Vector3(tpl.position[3 * i], tpl.position[3 * i + 1], tpl.position[3 * i + 2]).sub(b.p).applyQuaternion(inv.get(j));
        pts.push({ joint: j, local });
      }
      return pts;
    });
    const handMaps = maps === undefined ? prepared?.maps?.[hand] : maps?.[hand];
    const tex = handMaps ? { normal: mapTexture(handMaps.normal, anisotropy), detail: mapTexture(handMaps.detail, anisotropy) } : null;
    if (tex) textures.push(tex.normal, tex.detail);
    const tone = attrs.tone || SKIN_TONES[look.tone] || SKIN_TONES.light;
    const uniforms = {
      uCapA: { value: Array.from({ length: CAPSULES }, () => new THREE.Vector4()) },
      uCapB: { value: Array.from({ length: CAPSULES }, () => new THREE.Vector4()) },
      uAo: { value: look.ao },
      uMottle: { value: look.mottle },
      uClearBack: { value: look.clearcoatBack },
      uNailCoat: { value: look.nailCoat },
      uRoughBack: { value: look.roughnessBack ?? look.roughness },
      uWristFade: { value: new THREE.Vector2(...look.wristFade) },
      uScreenFade: screenFade,
      uDim: { value: 0 },
      uSss: { value: look.sss ?? 0.55 },
      uFlex: { value: new Float32Array(FLEX_JOINTS.length) },
      uRed: { value: look.red },
      uVeins: { value: look.veins },
      uCavity: { value: look.cavity },
      uSkinDetail: { value: tex?.detail || null },
      uXray: { value: look.xray },
      uXrayColor: { value: new THREE.Color(1, 1, 1) },
      uUnder: { value: 0 },
      ...toneUniforms(tone),
      ...envUniforms,
    };
    const material = skinMaterial(look, uniforms, tone, tex, lut);
    const mesh = new THREE.SkinnedMesh(g, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    // A depth-only pass first: the skin is then shaded only where it is
    // nearest the eye (no work on the palm behind the fingers), and a hand
    // drawn see-through (a resting hand steps back: setOpacity) shows only
    // its nearest skin — the fingers before the palm, or a thumb under it,
    // never show through one another.
    const pre = new THREE.SkinnedMesh(g, depthMaterial(uniforms));
    pre.frustumCulled = false;
    pre.renderOrder = 2;
    // (Its rim, drawn where the other hand covers it.)
    const xray = new THREE.SkinnedMesh(g, xrayMaterial(uniforms));
    xray.frustumCulled = false;
    xray.renderOrder = 8;
    xray.visible = false;
    // (Its thumb, where the hand hides it: a thumb passing under the hand.)
    const underThumb = new THREE.SkinnedMesh(g, underThumbMaterial(uniforms));
    underThumb.frustumCulled = false;
    underThumb.renderOrder = 9;
    underThumb.visible = false;
    // (Each hand is wholly in front of or behind the other — the one that
    // plays over one only waiting there, else as the engine layers them,
    // `zTop`, the hand that moved into an overlap on top — through the
    // depth range it is drawn into: its own skin still hides itself, the
    // other hand never cuts into it.)
    const range = [0, 1];
    const into = (r) => r.getContext().depthRange(range[0], range[1]);
    const back = (r) => r.getContext().depthRange(0, 1);
    for (const m of [mesh, pre, underThumb]) {
      m.onBeforeRender = into;
      m.onAfterRender = back;
    }
    group.add(mesh, pre, xray, underThumb);
    // The nails, each on its digit's last phalanx (in that joint's frame).
    const nailMat = nailMaterial(look, uniforms);
    const nails = [];
    for (const d of look.nails === false || look.nails === 0 ? [] : DIGITS) {
      const ng = nailGeometry(tpl, rig, d);
      if (!ng) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(ng.position, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(ng.normal, 3));
      geo.setAttribute("aNailUv", new THREE.BufferAttribute(ng.uv, 2));
      geo.setIndex(new THREE.BufferAttribute(ng.index, 1));
      const nail = new THREE.Mesh(geo, nailMat);
      nail.frustumCulled = false;
      nail.renderOrder = mesh.renderOrder + 0.5;
      nail.onBeforeRender = into;
      nail.onAfterRender = back;
      bones[tpl.names.indexOf(ng.joint)].add(nail);
      nails.push(nail);
    }
    let cuff = null, cuffMat = null, cuffTrim = null;
    const cg = look.cuff === false ? null : cuffGeometry(tpl, rig);
    if (cg) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(cg.position, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(cg.normal, 3));
      geo.setAttribute("aCuffUv", new THREE.BufferAttribute(cg.uv, 2));
      geo.setIndex(new THREE.BufferAttribute(cg.index, 1));
      const cm = cuffMaterial(uniforms, hand === "left" ? "#8aaedc" : "#e9b45f");
      cuffMat = cm.material;
      cuffTrim = cm.trim;
      cuff = new THREE.Mesh(geo, cuffMat);
      cuff.frustumCulled = false;
      cuff.renderOrder = mesh.renderOrder + 0.25;
      cuff.onBeforeRender = into;
      cuff.onAfterRender = back;
      bones[tpl.names.indexOf(cg.joint)].add(cuff);
    }
    group.updateMatrixWorld(true);
    for (const m of [mesh, pre, xray, underThumb]) {
      m.bind(skeleton, new THREE.Matrix4());
      // (Never culled, drawn in their render order: a fixed bounding sphere
      // spares three.js skinning every vertex on the CPU to find one.)
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.4);
    }
    scene.add(group);
    hands[hand] = { rig, group, bones, skeleton, mesh, pre, xray, underThumb, nails, nailMat, cuff, cuffMat, cuffTrim, range, alpha: 1, dim: 0, uniforms, solved: null, frame: null, tpl, tipPoints, tex, slide: 0, slideAt: null };
    yield;
  }
  // The hand on top drawn after, and nearer, than the other; it marks where
  // it covers (the stencil), where the other's rim shows through.
  let top = "right";
  const layer = (next) => {
    top = next;
    for (const [hand, h] of Object.entries(hands)) {
      const over = hand === top;
      h.pre.renderOrder = over ? 4 : 2;
      h.mesh.renderOrder = over ? 5 : 3;
      for (const nail of h.nails) nail.renderOrder = h.mesh.renderOrder + 0.5;
      if (h.cuff) h.cuff.renderOrder = h.mesh.renderOrder + 0.25;
      h.range[0] = over ? 0 : 0.5;
      h.range[1] = over ? 0.5 : 1;
      Object.assign(h.pre.material, {
        stencilWrite: over,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp,
      });
      // (The hand beneath shows its hidden thumb only off the hand on top.)
      Object.assign(h.underThumb.material, {
        stencilWrite: !over,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp,
      });
    }
  };
  layer("right");
  // (The hand left beneath the other while they meet, if any.)
  let beneath = null;
  const otherHand = (hand) => (hand === "left" ? "right" : "left");
  const motionOf = (hand) => {
    const f = hands[hand].frame;
    return f ? f.motion || f : null;
  };
  // Does a hand play where it is: a finger on its key, or landing on one
  // close by (not a leap away)?
  const playsHere = (hand) =>
    (motionOf(hand)?.fingers || []).some((f) => f.state === "down" || f.exact || (f.target && (f.target.alpha ?? 0) > 0.5 && f.x != null && Math.abs(f.target.x - f.x) < 1.6));
  let ink = { left: { ...INK.left }, right: { ...INK.right } };
  cues.setInk(ink);
  // (The app's font, once it has loaded, for the numbers.)
  if (typeof document !== "undefined" && document.fonts?.ready)
    document.fonts.ready.then(() => {
      if (!disposed) {
        cues.refreshFont(ink);
        dirty = true;
      }
    });
  let disposed = false;
  // (Something changed that the poses do not show — the font arrived: draw again.)
  let dirty = false;
  // (Each hand's fingers on screen, worked out once per pose.)
  const fingerMemo = new Map();

  // Each digit's bones as capsules in view space, for the occlusion.
  const capsules = (h) => {
    const v = camera.matrixWorldInverse;
    let k = 0;
    DIGITS.forEach((d, di) => {
      const padW = h.solved.pads[di].centre;
      for (const [a, b, r] of OCCLUDERS[d]) {
        const A = h.solved.world.get(a).p.clone().applyMatrix4(v);
        const B = (b === "pad" ? padW.clone() : h.solved.world.get(b).p.clone()).applyMatrix4(v);
        h.uniforms.uCapA.value[k].set(A.x, A.y, A.z, r * h.rig.scale);
        h.uniforms.uCapB.value[k].set(B.x, B.y, B.z, di + 1);
        k++;
      }
    });
  };
  // Every bone of both hands (world) as shadow casters, the pads for the
  // contact shadows, and the key surfaces under the hands that catch them.
  const boxes = [null, null];
  const casters = () => {
    let k = 0,
      p = 0;
    const A = shadowUniforms.uCastA.value,
      B = shadowUniforms.uCastB.value,
      C = shadowUniforms.uCastC.value,
      pads = shadowUniforms.uPads.value,
      dirs = shadowUniforms.uPadDir.value;
    const L = shadowUniforms.uLight.value;
    const onPlane = (out, a, b) => out.set(a.x - (L.x * a.y) / L.y, a.z - (L.z * a.y) / L.y, b.x - (L.x * b.y) / L.y, b.z - (L.z * b.y) / L.y);
    HANDS.forEach((hand, hi) => {
      const h = hands[hand];
      const box = shadowUniforms.uBox.value[hi];
      if (!h.solved) {
        for (let i = 0; i < CASTERS; i++) {
          B[k].set(0, 0, 0, 0);
          A[k++].set(0, 0, 0, 0);
        }
        for (let i = 0; i < 5; i++) {
          dirs[p].set(0, 0, 0, 0);
          pads[p++].set(0, 0, 0, 0);
        }
        box.set(1, 1, -1, -1);
        boxes[hi] = null;
        shadowUniforms.uPalm.value[hi].set(0, 0, 0, 0);
        return;
      }
      // (Where its bones' shadows can land on the key plane, and how soft
      // they can be there.)
      let x0 = Infinity,
        z0 = Infinity,
        x1 = -Infinity,
        z1 = -Infinity,
        topY = 0;
      for (const w of h.solved.world.values()) {
        const t = Math.max(0, w.p.y + 0.02) / L.y;
        const sx = w.p.x - L.x * t,
          sz = w.p.z - L.z * t;
        x0 = Math.min(x0, sx, w.p.x);
        x1 = Math.max(x1, sx, w.p.x);
        z0 = Math.min(z0, sz, w.p.z);
        z1 = Math.max(z1, sz, w.p.z);
        topY = Math.max(topY, w.p.y);
      }
      const m = 0.02 + look.shadowSoft * (topY + 0.03);
      box.set(x0 - m, z0 - m, x1 + m, z1 + m);
      boxes[hi] = [x0 - m, z0 - m, x1 + m, z1 + m];
      const at = (j, di) => (j === "pad" ? h.solved.pads[di].centre : h.solved.world.get(j).p);
      const sc = h.rig.scale;
      // (A see-through hand casts as much less.)
      const strength = h.alpha ?? 1;
      DIGITS.forEach((d, di) => {
        for (const [a, b, r] of OCCLUDERS[d]) {
          const pa = at(a, di),
            pb = at(b, di);
          A[k].set(pa.x, pa.y, pa.z, r * 0.92 * sc);
          B[k].set(pb.x, pb.y, pb.z, strength);
          onPlane(C[k], pa, pb);
          k++;
        }
      });
      for (const [a, b, r] of PALM_CASTERS) {
        const pb = at(b);
        const pa = a === "wrist" ? at(a).clone().lerp(pb, PALM_FROM) : at(a);
        A[k].set(pa.x, pa.y, pa.z, r * sc);
        B[k].set(pb.x, pb.y, pb.z, (look.palmShadow ?? 0.85) * strength);
        onPlane(C[k], pa, pb);
        k++;
      }
      // (Each fingertip on its key: where it meets the key, and the way along
      // its finger toward the palm; how much it is on its key.)
      const motion = h.frame.motion || h.frame;
      h.solved.pads.forEach((pd, di) => {
        const mf = motion.fingers[di];
        const on = pd.contact && (mf.state === "down" || mf.exact) ? 0.55 + 0.45 * clamp((1 - (mf.press ?? 0.7)) / 0.3, 0, 1) : 0;
        const at2 = pd.contact || pd.centre;
        const base = h.solved.world.get(di ? CHAINS[DIGITS[di]][3] : CHAINS.thumb[2]).p;
        dirs[p].set(base.x - at2.x, base.z - at2.z, 0, on * strength);
        pads[p++].set(at2.x, at2.y, at2.z, pd.r);
      });
      // (The palm's occlusion: an ellipse under its middle, along the hand.)
      {
        const W = h.solved.world;
        const wr = W.get("wrist").p,
          kn = W.get("middle-finger-phalanx-proximal").p;
        const c = wr.clone().lerp(kn, 0.62);
        const dx = kn.x - wr.x,
          dz = kn.z - wr.z;
        const l = Math.hypot(dx, dz) || 1;
        const span = W.get("index-finger-phalanx-proximal").p.distanceTo(W.get("pinky-finger-phalanx-proximal").p);
        shadowUniforms.uPalm.value[hi].set(c.x, c.z, c.y, (look.palmAo ?? 0.16) * strength);
        shadowUniforms.uPalmAxis.value[hi].set(dx / l, dz / l, 0.42 * l, 0.62 * span);
      }
    });
    receiversFor();
  };
  // (The key surfaces within the hands' shadow boxes: one set of quads per
  // box — two that meet are one.)
  const receiversFor = () => {
    const arr = receiverPos.array;
    let q = 0;
    const quad = (xa, xb, za, zb, y) => {
      if (!(xb > xa) || !(zb > za) || q >= RECEIVER_QUADS) return;
      arr.set([xa, y, za, xa, y, zb, xb, y, zb, xb, y, za], q * 12);
      q++;
    };
    let list = boxes.filter(Boolean).map((b) => b.slice());
    if (list.length === 2 && !(list[0][2] < list[1][0] || list[1][2] < list[0][0] || list[0][3] < list[1][1] || list[1][3] < list[0][1]))
      list = [[Math.min(list[0][0], list[1][0]), Math.min(list[0][1], list[1][1]), Math.max(list[0][2], list[1][2]), Math.max(list[0][3], list[1][3])]];
    if (view)
      for (const [bx0, bz0, bx1, bz1] of list) {
        const xa = Math.max(bx0, view.left / view.s - 0.02),
          xb = Math.min(bx1, (view.left + view.width) / view.s + 0.02);
        quad(xa, xb, Math.max(bz0, 0), Math.min(bz1, view.keyLen), 0);
        quad(xa, xb, Math.max(bz0, keySurfaces.railFrom), Math.min(bz1, keySurfaces.railTo), keySurfaces.railY);
        for (const [l, r] of keySurfaces.blacks) {
          if (r < xa || l > xb) continue;
          quad(Math.max(l, xa), Math.min(r, xb), Math.max(bz0, keySurfaces.blackFrom), Math.min(bz1, keySurfaces.blackFrom + keySurfaces.blackLen), BLACK_RISE);
        }
      }
    receiverPos.clearUpdateRanges();
    receiverPos.addUpdateRange(0, q * 12);
    receiverPos.needsUpdate = true;
    receiverGeo.setDrawRange(0, q * 6);
  };
  const keySurfaces = { railFrom: 0, railTo: 0, railY: -0.012, blackFrom: 0, blackLen: 0, blacks: [] };
  // Posing and opacity normally change together. Build their shared shadow
  // geometry once, immediately before it is used, including the warm-up
  // path which draws directly rather than calling api.render().
  let shadowsDirty = true;
  let shadowBuilds = 0;
  // (The shadows into their own target, the receivers then set to lay them
  // over the keys; or, at full resolution, drawn with the picture.)
  const drawShadows = () => {
    if (shadowsDirty) {
      casters();
      shadowsDirty = false;
      shadowBuilds++;
    }
    if (!shadowRT) return;
    receivers.material = shadowMat;
    if (receiverGeo.drawRange.count > 0) {
      renderer.setRenderTarget(shadowRT);
      renderer.clear(true, false, false);
      renderer.render(receivers, camera);
    }
    receivers.material = compositeMat;
  };

  let view = null;
  const canvasSize = { w: 0, h: 0 };
  // (Counts the views set, so a pose knows which view it was made in.)
  let viewVersion = 0;
  // (The posture cam's own small WebGL context, made on first use.)
  let side = null;
  // (How far up from the bed's lower edge the picture dissolves: below the
  // web of the thumb, about a key's width under the keys — the stage's rail
  // is that deep and some — within 28 px … `fadePx`.)
  let fadeLen = look.fadePx;
  // (How far the picture's lower edge is above the buffer's, CSS px.)
  let bufferOffset = 0;
  const setScreenFade = () => {
    if (!view) return;
    fadeLen = screenFadeLength(view, look.fadePx);
    // (gl_FragCoord.y counts device pixels up from the buffer's lower edge;
    // the picture's — the bed's visible edge — is `bufferOffset` above it:
    // gone at its last pixel, whole `fadeLen` above it.)
    screenFade.value.set((bufferOffset + (fadeLen ? 1.2 : -1)) * view.dpr, (bufferOffset + fadeLen) * view.dpr);
    // (The shadows' target is laid out as the buffer, at its own scale.)
    if (shadowRT) shadowUniforms.uScreenFade.value.set((bufferOffset + (fadeLen ? 1.2 : -1)) * view.dpr * shadowRes, (bufferOffset + fadeLen) * view.dpr * shadowRes);
    else shadowUniforms.uScreenFade.value.copy(screenFade.value);
  };
  const api = {
    renderer,
    scene,
    camera,
    hands,
    look,
    cues,
    get view() {
      return view;
    },
    get top() {
      return top;
    },
    get shadowBuilds() {
      return shadowBuilds;
    },
    setKeyboardGeometry(g) {
      shadowsDirty = true;
      view = viewOf(g);
      viewVersion++;
      const W = view.width,
        H = view.height;
      // The drawing buffer: the picture's width, and its height with room
      // to spare below — a bed that grows or shrinks a little (the hands'
      // rail coming in, the coach strip, a compact stage) is drawn into the
      // buffer it has, its lower part left empty (and clipped by the layer),
      // so the buffer is reallocated — a heavy frame — only when the stage
      // really changes size.
      if (renderer.getPixelRatio() !== view.dpr || canvasSize.w !== W || !(canvasSize.h >= H && canvasSize.h <= H + 2 * BUFFER_SPARE)) {
        const alloc = Math.ceil((H + BUFFER_SPARE) / 16) * 16;
        renderer.setPixelRatio(view.dpr);
        renderer.setSize(W, alloc, false);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${alloc}px`;
        canvasSize.w = W;
        canvasSize.h = alloc;
        // (Counted, for checks.)
        api.reallocations = (api.reallocations || 0) + 1;
      }
      // (The picture in the buffer's upper part.)
      bufferOffset = canvasSize.h - H;
      renderer.setViewport(0, bufferOffset, W, H);
      if (shadowRT) {
        // (The shadows' target laid out as the drawing buffer is, at its
        // fraction of the resolution — the picture in its upper part — so it
        // too is reallocated only with the buffer.)
        const rw = Math.max(1, Math.ceil(W * view.dpr * shadowRes)),
          rh = Math.max(1, Math.ceil(canvasSize.h * view.dpr * shadowRes));
        if (shadowRT.width !== rw || shadowRT.height !== rh) shadowRT.setSize(rw, rh);
        shadowRT.viewport.set(0, bufferOffset * view.dpr * shadowRes, W * view.dpr * shadowRes, H * view.dpr * shadowRes);
        compositeMat.uniforms.uOrigin.value.set(0, 0);
        compositeMat.uniforms.uSize.value.set(rw / shadowRes, rh / shadowRes);
      }
      const s = view.s;
      camera.left = -W / 2 / s;
      camera.right = W / 2 / s;
      camera.top = H / 2 / view.sy;
      camera.bottom = -H / 2 / view.sy;
      // The point the canvas centre shows, on the key plane (y = 0).
      const Q = new THREE.Vector3((W / 2 + view.left) / s, 0, (H / 2 - view.top) / (view.sy * view.sin));
      camera.up.set(0, view.cos, -view.sin);
      camera.position.copy(Q).addScaledVector(new THREE.Vector3(0, view.sin, view.cos), 1.5);
      camera.lookAt(Q);
      camera.near = 0.01;
      camera.far = 3;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      api.centre = Q;
      for (const [light, dir] of [
        [key, look.keyDir],
        [rim, look.rimDir],
      ]) {
        light.position.copy(Q).add(new THREE.Vector3(...dir).normalize());
        light.target.position.copy(Q);
      }
      setScreenFade();
      // The key surfaces that catch the hands' shadows: the white key tops,
      // the rail (drawn from the keys' front edge down, 12 mm lower), the
      // black key tops.
      keySurfaces.railFrom = depthAt(view.h, keySurfaces.railY, view);
      keySurfaces.railTo = depthAt(view.height - view.top + 40, keySurfaces.railY, view);
      keySurfaces.blackFrom = depthAt(0, BLACK_RISE, view);
      keySurfaces.blackLen = depthAt(BLACK_SHARE * view.h, BLACK_RISE, view) - keySurfaces.blackFrom;
      keySurfaces.blacks = [];
      const x0 = view.left / s - 0.05,
        x1 = (view.left + W) / s + 0.05;
      for (const k of keyboardLayout(21, 108)) {
        if (!k.black || (g.keys && (k.midi < g.keys.low || k.midi > g.keys.high))) continue;
        const left = (k.left / 100) * 52 * KEY_W,
          width = (k.width / 100) * 52 * KEY_W;
        if (left + width < x0 || left > x1) continue;
        keySurfaces.blacks.push([left, left + width]);
      }
      fingerMemo.clear();
      return view;
    },
    // Pose both hands for a frame of the engine's ({ left, right }: its
    // handMotions, or null). `keys` ({ left, right }), when given, say what
    // each hand's motion is (its signature): a hand whose key and view are
    // unchanged keeps its pose. `tau` (s, 0 = off) eases each hand over the
    // frames as they come while the music plays — its frame and its free
    // digits; the digits on keys stay exact — from one continuous frame to
    // the next only (a seek, a gap in the drawing or a new view starts
    // afresh; music standing still shows the exact pose). Returns
    // { settling }: a hand is still easing toward its pose, so draw again.
    setPoses(frames, keys = null, { tau = 0, now = typeof performance !== "undefined" ? performance.now() : Date.now() } = {}) {
      let settling = false;
      // Two hands that would be drawn one over the other kept apart: the one
      // that does not play there slides aside (hand3d-overlap.mjs) — at once
      // for a still or a jump, eased over a moment while the music plays.
      const raw = {};
      for (const hand of HANDS) {
        const f = frames?.[hand] || null;
        raw[hand] = f && (f.motion || f.palm) ? f : null;
      }
      const motionIn = (hand) => (raw[hand] ? raw[hand].motion || raw[hand] : null);
      let sep = null;
      if (raw.left && raw.right && view && look.separate !== false) {
        const ml = motionIn("left"),
          mr = motionIn("right");
        // (A first look from the digits' places; where the two come near and
        // one of them could make way, measured on the hands as they would be
        // drawn — each posed as the engine has it, kept while unchanged.)
        const first = handSeparation(ml, mr);
        if (first.fl + first.fr > 1e-4 && first.need > -NEAR_KEYS) {
          const as = {};
          for (const hand of HANDS) {
            const h = hands[hand];
            const k = `${keys?.[hand] ?? ""}|${viewVersion}`;
            if (!(keys?.[hand] != null && h.rawKey === k && h.rawSolved)) {
              h.rawSolved = poseHand(h.rig, raw[hand], view, posture);
              h.rawKey = k;
            }
            as[hand] = silhouetteOf(h, h.rawSolved);
          }
          sep = handSeparation(ml, mr, { need: overlapNeed(as.left, as.right, SEPARATE_GAP_PX) / view.u });
        }
      }
      for (const hand of HANDS) {
        const h = hands[hand];
        const want = sep ? sep[hand] : 0;
        const t = raw[hand] ? motionIn(hand).t ?? null : null;
        let slide = want;
        if (tau > 0 && raw[hand] && h.slideAt && t != null && h.slideAt.view === viewVersion) {
          const dWall = (now - h.slideAt.wall) / 1000,
            dMusic = t - h.slideAt.t;
          if (dWall > 0 && dWall < 0.25 && Math.abs(dMusic) < 0.25) slide = h.slide + (want - h.slide) * (1 - Math.exp(-dWall / SLIDE_TAU));
          if (Math.abs(want - slide) < 0.01) slide = want;
          else settling = true;
        }
        h.slide = raw[hand] ? slide : 0;
        h.slideAt = raw[hand] ? { wall: now, t, view: viewVersion } : null;
      }
      for (const hand of HANDS) {
        const h = hands[hand];
        const was = h.frame;
        h.frame = raw[hand] ? slidMotion(raw[hand], h.slide) : null;
        h.group.visible = !!h.frame;
        const key = keys?.[hand] != null ? `${keys[hand]}|${h.slide.toFixed(4)}` : null;
        const t = h.frame ? (h.frame.motion || h.frame).t ?? null : null;
        if (h.frame && was && h.solved && !h.easing && key != null && key === h.key && h.posedIn === viewVersion) {
          // (Unchanged: still valid now.)
          if (h.heldAt) Object.assign(h.heldAt, { wall: now, t });
          continue;
        }
        fingerMemo.delete(hand);
        h.solved = null;
        h.key = key;
        h.posedIn = viewVersion;
        if (!h.frame || !view) {
          h.held = h.heldAt = null;
          h.easing = false;
          continue;
        }
        // (Easing only from the frame just before, in this view, while the
        // music moves on by no more than a moment: a seek starts afresh, and
        // music standing still — paused, waiting — shows the exact pose.)
        let memory = null;
        if (tau > 0 && h.held && h.heldAt && t != null && h.heldAt.view === viewVersion) {
          const dWall = (now - h.heldAt.wall) / 1000,
            dMusic = t - h.heldAt.t;
          if (dWall > 0 && dWall < 0.25 && dMusic > 1e-6 && dMusic < 0.25) memory = { held: h.held, k: 1 - Math.exp(-dWall / tau), dt: dWall };
        }
        const solved = poseHand(h.rig, h.frame, view, posture, memory);
        h.solved = solved;
        // (Still easing while the hand's frame or a free digit moves on.)
        const moved = (a, b) => {
          if (!a || !b) return true;
          if (a.O.distanceTo(b.O) > 1e-5 || Math.abs(a.yaw - b.yaw) + Math.abs(a.pitch - b.pitch) + Math.abs(a.roll - b.roll) > 2e-4) return true;
          for (const d of DIGITS) {
            const x = a.angles[d],
              y = b.angles[d];
            if (!x || !y) continue;
            for (const k of Object.keys(x)) if (typeof x[k] === "number" && typeof y[k] === "number" && k !== "err" && Math.abs(x[k] - y[k]) > 2e-4) return true;
          }
          return false;
        };
        h.easing = !!memory && moved(h.held, solved.held);
        settling ||= h.easing;
        h.held = solved.held;
        h.heldAt = { wall: now, t, view: viewVersion };
        for (const b of h.bones) {
          const w = solved.world.get(b.name);
          b.position.copy(w.p);
          b.quaternion.copy(w.q);
        }
        capsules(h);
        // (How bent each crease joint is: its creases smooth out.)
        const fl = h.uniforms.uFlex.value;
        const A = solved.angles;
        fl[0] = A.thumb?.mcp ?? 0;
        fl[1] = A.thumb?.ip ?? 0;
        ["index", "middle", "ring", "pinky"].forEach((f, k) => {
          fl[2 + 2 * k] = A[f]?.pip ?? 0;
          fl[3 + 2 * k] = A[f]?.dip ?? 0;
        });
      }
      shadowsDirty = true;
      // Which hand is drawn on top. Where the hands meet and only one of
      // them plays there — the other has just played over its keys, say, and
      // waits for its next leap — the one that plays is on top and the other
      // steps back beneath it (see-through, hands3d-layer.mjs), so the two
      // never read as one hand; once beneath, it stays there while they
      // meet, so nothing flips as it plays again or lifts off. Otherwise the
      // engine's layering: `zTop`, the hand that moved into the overlap (a
      // hand crossing over the other in flight on top).
      const zTop = (hand) => !!motionOf(hand)?.palm?.zTop;
      let next = zTop("left") && !zTop("right") ? "left" : "right";
      const meet = !!(hands.left.solved && hands.right.solved) && handsMeet();
      if (!meet) beneath = null;
      else {
        const pl = playsHere("left"),
          pr = playsHere("right");
        if (beneath && playsHere(beneath) && !playsHere(otherHand(beneath))) beneath = null;
        if (!beneath && pl !== pr) {
          const idle = pl ? "right" : "left";
          if (!((motionOf(idle)?.palm?.lift || 0) >= 0.5)) beneath = idle;
        }
      }
      if (beneath) next = otherHand(beneath);
      layer(next);
      api.overlap = { meet, under: beneath && !playsHere(beneath) ? beneath : null, top: next };
      return { settling, overlap: api.overlap };
    },
    // The picture: the cues beneath the hands, the shadows and the hands
    // (and a covered hand's rim), the cues above.
    render() {
      if (!view) return;
      buildCues();
      // (A hand under the other shows its rim through it only where they
      // meet and both play — hands crossing; a hand that only waits
      // beneath the other is simply see-through.)
      const under = otherHand(top);
      const meet = api.overlap?.meet ?? handsMeet();
      const rim = meet && !!hands[under].solved && (look.xray ?? 0) > 0 && playsHere(under) && playsHere(top);
      for (const hand of HANDS) hands[hand].xray.visible = rim && hand === under;
      if (rim) {
        hands[under].uniforms.uXrayColor.value.setRGB(...ink[under].rgb.map((c) => c / 255)).convertSRGBToLinear();
        hands[under].uniforms.uXray.value = Math.min(0.8, look.xray ?? 0);
      }
      drawShadows();
      renderer.setRenderTarget(null);
      renderer.clear(true, true, true);
      if (!cues.empty.under) cues.render(renderer, "under");
      renderer.render(scene, camera);
      if (!cues.empty.over) cues.render(renderer, "over");
      dirty = false;
    },
    // (An empty picture: the canvas put on the stage before the hands show.)
    clear() {
      renderer.setRenderTarget(null);
      renderer.clear(true, true, true);
    },
    // (How far up from the picture's lower edge it dissolves, CSS px.)
    get fadeLength() {
      return fadeLen;
    },
    get dirty() {
      return dirty;
    },
    // Compile every shader program before the first picture (in parallel
    // where the browser can), then draw the hands and every kind of cue
    // once — at the size the picture is now (the stage's, see
    // hands3d-layer.mjs), the canvas not shown yet — so the programs, the
    // buffers and textures and the multisampled drawing buffer are all on
    // the GPU before the hands first show: a piece at a time, `step()`
    // awaited between. Returns false (and stops) if the context is lost on
    // the way — compiling never waits on a lost context.
    async warm({ step = null } = {}) {
      const pause = step || (() => Promise.resolve());
      const gl = renderer.getContext();
      const gone = () => disposed || gl.isContextLost();
      const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
      // (Compiled, and waited for — parallel compiling where the browser has
      // it — but never for ever.)
      const compiled = async (object, cam, target = null) => {
        const materials = renderer.compile(object, cam, target || object);
        const t0 = clock();
        for (;;) {
          if (gone()) return false;
          let pending = 0;
          for (const m of materials) {
            const program = renderer.properties.get(m).currentProgram;
            if (program && !program.isReady()) pending++;
          }
          if (!pending || clock() - t0 > 6000) return true;
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
      };
      // (Every pass the first pictures use — the covered hand's rim and the
      // thumb under the hand too, which three.js leaves out while they are
      // hidden — a hand at a time.)
      const passes = Object.values(hands).flatMap((h) => [h.xray, h.underThumb]);
      for (const m of passes) m.visible = true;
      try {
        for (const h of Object.values(hands)) {
          if (!(await compiled(h.group, camera, scene))) return false;
          await pause();
        }
        if (!(await compiled(receivers, camera, scene))) return false;
        if (compositeMat) {
          receivers.material = compositeMat;
          const ok = await compiled(receivers, camera, scene);
          receivers.material = shadowMat;
          if (!ok) return false;
        }
        for (const s2 of cues.scenes) if (!(await compiled(s2, cues.camera))) return false;
      } finally {
        for (const m of passes) m.visible = false;
      }
      // (The skin maps on the GPU, one an idle task.)
      for (const t of textures) {
        await pause();
        if (gone()) return false;
        renderer.initTexture(t);
      }
      await pause();
      if (gone()) return false;
      const was = view;
      const v = view || viewOf({ keyWidth: 45, keysHeight: 166, bedHeight: 236, stripLeftPx: 0, viewportWidthPx: 900, dpr: renderer.getPixelRatio() });
      if (!view) api.setKeyboardGeometry({ keyWidth: v.u, keysHeight: v.h, bedHeight: v.bed, stripLeftPx: v.left, viewportWidthPx: v.width, topPx: v.top, dpr: v.dpr });
      const shown = [receivers, ...Object.values(hands).map((h) => h.group)];
      try {
        // Both hands posed (a reference shape, in the middle of the view),
        // their shadows, the rim of a covered hand and a thumb under the
        // hand, the cues of every kind: every program and buffer the first
        // frames use, drawn once into the stage's own drawing buffer — each
        // hand, then the shadows, in an idle task of its own (a program's
        // first use is its heaviest moment).
        const mid = (view.left + 0.5 * view.width) / view.u;
        api.setPoses({ left: referenceMotion("left", view, mid - 3.2), right: referenceMotion("right", view, mid + 3.2) });
        api.setOpacity({ left: 1, right: 1 }, { left: 0, right: 0 });
        for (const h of Object.values(hands)) {
          h.xray.visible = true;
          h.underThumb.visible = true;
          h.uniforms.uUnder.value = 0.5;
        }
        for (const only of shown) {
          await pause();
          if (gone()) return false;
          for (const o of shown) o.visible = o === only;
          if (only === receivers) drawShadows();
          renderer.setRenderTarget(null);
          renderer.clear(true, true, true);
          renderer.render(scene, camera);
        }
        for (const o of shown) o.visible = true;
        await pause();
        if (gone()) return false;
        cues.begin(view.width, view.height);
        for (const style of ["filled", "ready", "ghost"]) cues.ring(20, 20, 9, { hand: "right", style, finger: 1 });
        cues.shade(0, 0, 4, 4, [0, 0, 0, 0.01], [0, 0, 0, 0.02]);
        cues.dashed([{ x: 0, y: 0 }, { x: 4, y: 4 }], { color: [0, 0, 0, 0.01] });
        cues.dashed([{ x: 0, y: 4 }, { x: 4, y: 0 }], { over: true, color: [0, 0, 0, 0.01] });
        cues.end();
        cues.render(renderer, "under");
        cues.render(renderer, "over");
        renderer.clear(true, true, true);
        cues.begin(view.width, view.height);
        cues.end();
        // (And the posing code itself, warmed up on a reference pose a few
        // times, so the first frames the player sees are not its slowest.)
        for (const hand of HANDS) {
          await pause();
          if (gone()) return false;
          for (let k = 0; k < 2; k++) poseHand(hands[hand].rig, referenceMotion(hand, view), view, posture);
        }
      } finally {
        for (const o of shown) o.visible = true;
        for (const h of Object.values(hands)) {
          h.xray.visible = false;
          h.underThumb.visible = false;
          h.uniforms.uUnder.value = 0;
        }
        if (!disposed) api.setPoses(null);
        beneath = null;
        if (!was) view = null;
      }
      return !gone();
    },
    // How opaque each hand is drawn ({ left, right }, 0…1) and how much it
    // is dimmed (darker, greyer: a resting hand steps back). Its shadows,
    // cues and numbers fade with it.
    setOpacity(alphas, dims = null) {
      for (const hand of HANDS) {
        const a = clamp(alphas?.[hand] ?? 1, 0, 1);
        const h = hands[hand];
        if (h.alpha !== a) shadowsDirty = true;
        h.alpha = a;
        h.dim = clamp(dims?.[hand] ?? 0, 0, 1);
        h.mesh.material.opacity = a;
        h.nailMat.opacity = a;
        if (h.cuffMat) h.cuffMat.opacity = a;
        h.uniforms.uDim.value = h.dim;
      }
    },
    // The room the keyboard stands in (its theme): the hands' shadows take
    // a little of its darkest tone, so they belong to its light. `shadow`:
    // [r, g, b] 0…255, or null for the hands' own warm brown.
    setRoom({ shadow = null } = {}) {
      const base = srgb(look.shadowColor);
      if (shadow) base.lerp(new THREE.Vector3(shadow[0] / 255, shadow[1] / 255, shadow[2] / 255), 0.45);
      shadowMat.uniforms.uColor.value.copy(base);
    },
    // The hands' colours for their numbers and cues (the theme's): per hand
    // { rgb: [r, g, b], ink: "#text" }.
    setInk(next) {
      ink = {
        left: { ...ink.left, ...(next?.left || null) },
        right: { ...ink.right, ...(next?.right || null) },
      };
      cues.setInk(ink);
      for (const hand of HANDS) if (hands[hand].cuffTrim) {
        const c = ink[hand].rgb;
        hands[hand].cuffTrim.value.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
      }
    },
    get ink() {
      return ink;
    },
    // Screen (canvas CSS px) data of each digit, for the cues and checks.
    // `keyX`: the centre of the key the digit plays, or is coming to.
    fingers(hand) {
      if (fingerMemo.has(hand)) return fingerMemo.get(hand);
      const out = api.fingersNow(hand);
      fingerMemo.set(hand, out);
      return out;
    },
    fingersNow(hand) {
      const h = hands[hand];
      if (!h.solved || !view) return null;
      return DIGITS.map((d, i) => {
        const mf = h.frame.motion ? h.frame.motion.fingers[i] : h.frame.fingers[i];
        const pad = h.solved.pads[i];
        const base = h.solved.world.get(d === "thumb" ? "thumb-phalanx-proximal" : CHAINS[d][1]).p;
        // The fingertip's outline: its topmost point on screen (toward the
        // fallboard) and, for the thumb, its furthest point along the thumb.
        let topPt = null,
          far = null;
        const along = project(pad.end, view),
          from = project(base, view);
        const ax = along.x - from.x,
          ay = along.y - from.y;
        const al = Math.hypot(ax, ay) || 1;
        const v = new THREE.Vector3();
        for (const pt of h.tipPoints[i]) {
          const w = h.solved.world.get(pt.joint);
          const sp = project(v.copy(pt.local).applyQuaternion(w.q).add(w.p), view);
          if (!topPt || sp.y < topPt.y) topPt = sp;
          const k = ((sp.x - from.x) * ax + (sp.y - from.y) * ay) / al;
          if (!far || k > far.k) far = { x: sp.x, y: sp.y, k };
        }
        const onKey = mf.state === "down" || !!mf.exact;
        const keyAt = onKey ? mf.x : mf.target ? mf.target.x : null;
        return {
          finger: i + 1,
          state: mf.state,
          number: mf.number,
          under: mf.under || 0,
          lift: mf.lift || 0,
          press: mf.press || 0,
          midi: mf.midi,
          black: mf.black || 0,
          onKey,
          keyX: keyAt == null ? null : keyAt * view.u - view.left,
          // (… and the depth of its contact there, px below the keys' back edge.)
          keyY: onKey ? (mf.contact ?? null) : mf.target ? (mf.target.contact ?? null) : null,
          keyBlack: onKey ? mf.black || 0 : mf.target ? mf.target.black || 0 : mf.black || 0,
          pad: project(pad.centre, view),
          nail: project(pad.nail, view),
          end: project(pad.end, view),
          base: project(base, view),
          top: topPt,
          far,
          contact: pad.contact ? project(pad.contact, view) : null,
          // (The pad's lowest point as drawn: on its key, where it meets it.)
          bottom: project(new THREE.Vector3(pad.centre.x, pad.centre.y - pad.r, pad.centre.z), view),
          height: pad.height,
          ground: project(new THREE.Vector3(pad.centre.x, BLACK_RISE * clamp(mf.black || 0, 0, 1), pad.centre.z), view),
          error: h.solved.errors[i],
        };
      });
    },
    // How tall the rail below the keys should be (CSS px) for the hand to
    // read whole — its thumb's web clear of the dissolve over the bed's lower
    // edge: a hand in its playing shape on its white keys, for the current
    // geometry. (The app's rail, clamp(56px, 8vh, 84px), is enough at 45 px
    // keys; a wide zoom needs a little more.)
    recommendedRail(margin = 0.45 * LOOK.fadePx) {
      if (!view) return 0;
      const h = hands.right;
      const solved = poseHand(h.rig, referenceMotion("right", view), view, posture);
      const web = solved.world.get("thumb-phalanx-proximal").p.clone().lerp(solved.world.get("index-finger-phalanx-proximal").p, 0.5);
      const y = project(web, view).y;
      return Math.max(0, Math.ceil(y - view.top - view.h + margin));
    },
    // The hands' bones on screen as capsules (canvas CSS px).
    silhouette(hand) {
      const h = hands[hand];
      return h.solved && view ? silhouetteOf(h, h.solved) : [];
    },
    // The outline of a thumb on screen (canvas CSS px), from its knuckle (MCP)
    // to its tip: the sides of its last two segments as a tapering capsule,
    // round at the tip — for the thumb-under cue.
    thumbOutline(hand) {
      const h = hands[hand];
      if (!h.solved || !view) return [];
      const k = h.rig.scale * view.s;
      const W = h.solved.world;
      const pad = h.solved.pads[0];
      const pts = [W.get("thumb-phalanx-proximal").p, W.get("thumb-phalanx-distal").p, pad.centre].map((p) => project(p, view));
      const tipEnd = project(pad.end, view);
      const rad = [0.0095 * k, 0.0085 * k, 0.0075 * k];
      const left = [],
        right = [];
      pts.forEach((p, n) => {
        const a = pts[Math.max(0, n - 1)],
          b = pts[Math.min(pts.length - 1, n + 1)];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        left.push({ x: p.x - (dy / l) * rad[n], y: p.y + (dx / l) * rad[n] });
        right.push({ x: p.x + (dy / l) * rad[n], y: p.y - (dx / l) * rad[n] });
      });
      const c = pts[2];
      const a0 = Math.atan2(left[2].y - c.y, left[2].x - c.x),
        aTip = Math.atan2(tipEnd.y - c.y, tipEnd.x - c.x);
      const a1 = Math.atan2(right[2].y - c.y, right[2].x - c.x);
      let span = a1 - a0;
      const through = (x) => (((x - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (through(aTip) > through(a1)) span = span > 0 ? span - 2 * Math.PI : span + 2 * Math.PI;
      const cap = [];
      for (let n = 1; n < 12; n++) {
        const a = a0 + (span * n) / 12;
        cap.push({ x: c.x + Math.cos(a) * rad[2], y: c.y + Math.sin(a) * rad[2] });
      }
      return [...left, ...cap, ...right.reverse()];
    },
    // A side view of one hand over the keys' profile — the "posture cam"
    // (lab only): drawn into a 2-D context at `rect` ({ x, y, w, h }, CSS px),
    // fingers pointing right; a second small WebGL context renders it.
    postureCam(hand, ctx, rect, { dpr = view?.dpr || 1 } = {}) {
      const h = hands[hand];
      if (!h?.solved || !view) return;
      if (!side) {
        const c = document.createElement("canvas");
        const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        r.setClearColor(0x000000, 0);
        r.outputColorSpace = renderer.outputColorSpace;
        r.toneMapping = renderer.toneMapping;
        r.toneMappingExposure = renderer.toneMappingExposure;
        side = { canvas: c, renderer: r, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 3) };
      }
      const W = h.solved.world;
      let z0 = Infinity,
        z1 = -Infinity,
        y1 = -Infinity;
      for (const t of W.values()) {
        z0 = Math.min(z0, t.p.z);
        z1 = Math.max(z1, t.p.z);
        y1 = Math.max(y1, t.p.y);
      }
      for (const pd of h.solved.pads) z0 = Math.min(z0, pd.end.z);
      const wrist = W.get("wrist").p,
        knuckle = W.get("middle-finger-phalanx-proximal").p;
      z1 = Math.min(z1, wrist.z + 0.035);
      const yLo = -0.022,
        yHi = y1 + 0.032;
      const cz = 0.5 * (z0 + z1) - 0.004,
        cy = 0.5 * (yLo + yHi);
      let halfH = 0.5 * (yHi - yLo) * 1.08,
        halfW = 0.5 * (z1 - z0 + 0.03);
      if (halfW / halfH < rect.w / rect.h) halfW = (halfH * rect.w) / rect.h;
      else halfH = (halfW * rect.h) / rect.w;
      const cam = side.camera;
      Object.assign(cam, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
      const sx = h.rig.chir;
      cam.position.set(h.solved.origin.x + 0.5 * sx, cy, cz);
      cam.up.set(0, 1, 0);
      cam.lookAt(h.solved.origin.x, cy, cz);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      side.renderer.setPixelRatio(dpr);
      side.renderer.setSize(rect.w, rect.h, false);
      const hidden = [receivers, ...Object.values(hands).filter((o) => o !== h).map((o) => o.group), h.xray];
      const was = hidden.map((o) => o.visible);
      hidden.forEach((o) => (o.visible = false));
      const fade = h.uniforms.uWristFade.value.clone();
      const screen = screenFade.value.clone();
      h.uniforms.uWristFade.value.set(0.09, 0.11);
      screenFade.value.set(-1, 0);
      side.renderer.render(scene, cam);
      h.uniforms.uWristFade.value.copy(fade);
      screenFade.value.copy(screen);
      hidden.forEach((o, i) => (o.visible = was[i]));
      const X = (z) => rect.x + rect.w / 2 + (cz - z) * (rect.w / (2 * halfW));
      const Y = (y) => rect.y + rect.h / 2 - (y - cy) * (rect.h / (2 * halfH));
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
      ctx.fillStyle = "rgba(14, 18, 28, 0.86)";
      ctx.fill();
      ctx.clip();
      const keyFront = view.keyLen;
      ctx.fillStyle = "#e9e3d6";
      ctx.fillRect(Math.min(X(0), X(keyFront)), Y(0), Math.abs(X(keyFront) - X(0)), Y(-0.022) - Y(0));
      ctx.fillStyle = "#1c1916";
      const blackEnd = depthAt(0.63 * view.h, 0.0125, view);
      ctx.fillRect(Math.min(X(0), X(blackEnd)), Y(0.0125), Math.abs(X(blackEnd) - X(0)), Y(0) - Y(0.0125));
      ctx.fillStyle = "#3a291c";
      ctx.fillRect(Math.min(X(keyFront), X(keyFront + 0.08)), Y(-0.012), Math.abs(X(keyFront + 0.08) - X(keyFront)), Y(-0.022) - Y(-0.012));
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
      ctx.clip();
      if (sx < 0) {
        ctx.translate(2 * rect.x + rect.w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(side.canvas, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
      ctx.clip();
      const hk = api.ink[hand];
      const wx = X(wrist.z),
        wy = Y(wrist.y + 0.013),
        kx = X(knuckle.z),
        ky = Y(knuckle.y + 0.012);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.moveTo(wx - 0.08 * rect.w, wy);
      ctx.lineTo(kx + 0.06 * rect.w, wy);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${hk.rgb.join(",")},0.95)`;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(kx, ky);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgb(${hk.rgb.join(",")})`;
      for (const [x, y] of [
        [wx, wy],
        [kx, ky],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = "600 10.5px Manrope, -apple-system, sans-serif";
      ctx.fillStyle = "rgba(235, 230, 220, 0.85)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(hand === "left" ? "Left hand · side" : "Right hand · side", rect.x + 8, rect.y + 6);
      ctx.restore();
    },
    diagnostics() {
      const out = {};
      for (const hand of HANDS) {
        const h = hands[hand];
        if (!h.solved) continue;
        const deg = (x) => +((x * 180) / Math.PI).toFixed(1);
        out[hand] = {
          errorsMm: h.solved.errors.map((e) => +(e * 1000).toFixed(2)),
          yawDeg: deg(h.solved.yaw),
          pitchDeg: deg(h.solved.pitch),
          rollDeg: deg(h.solved.roll),
          origin: h.solved.origin.toArray().map((v) => +(v * 1000).toFixed(1)),
          heightsMm: h.solved.pads.map((p) => +(p.height * 1000).toFixed(1)),
          angles: Object.fromEntries(Object.entries(h.solved.angles).filter(([k]) => k !== "arch").map(([k, a]) => [k, Object.fromEntries(Object.entries(a).map(([n, x]) => [n, n === "err" ? +(x * 1000).toFixed(2) : deg(x)]))])),
        };
      }
      return out;
    },
    // Every GPU resource, and (`release`) the WebGL context itself — and the
    // renderer's hold on three.js's shared DFG table, which would otherwise
    // keep this renderer and its context reachable for the page's lifetime.
    dispose({ release = false } = {}) {
      if (disposed) return;
      disposed = true;
      const dfg = lut.uniforms?.dfgLUT?.value || null;
      for (const h of Object.values(hands)) {
        h.mesh.geometry.dispose();
        h.mesh.material.dispose();
        h.pre.material.dispose();
        h.xray.material.dispose();
        h.underThumb.material.dispose();
        for (const nail of h.nails) nail.geometry.dispose();
        h.nailMat.dispose();
        h.cuff?.geometry.dispose();
        h.cuffMat?.dispose();
        h.skeleton.dispose();
      }
      for (const t of textures) {
        t.dispose();
        // (The decoded skin maps too, once the context they served is let go.)
        if (release) t.image?.close?.();
      }
      receiverGeo.dispose();
      shadowMat.dispose();
      compositeMat?.dispose();
      shadowRT?.dispose();
      cues.dispose();
      if (side) {
        side.renderer.dispose();
        side.renderer.forceContextLoss();
        side = null;
      }
      renderer.dispose();
      if (release) renderer.forceContextLoss();
      // (Every renderer that used the table lets go of it; one still in use
      // simply uploads it again.)
      dfg?.dispose();
      lut.uniforms = null;
    },
    get disposed() {
      return disposed;
    },
  };

  // A posed hand's bones on screen as capsules (canvas CSS px).
  function silhouetteOf(h, solved) {
    return screenCapsules(h.rig, solved, view);
  }

  // Do the two hands' silhouettes meet on screen?
  function handsMeet() {
    const a = api.silhouette("left"),
      b = api.silhouette("right");
    if (!a.length || !b.length) return false;
    const bb = (s) => s.reduce((r, c) => [Math.min(r[0], c.a.x - c.r, c.b.x - c.r), Math.min(r[1], c.a.y - c.r, c.b.y - c.r), Math.max(r[2], c.a.x + c.r, c.b.x + c.r), Math.max(r[3], c.a.y + c.r, c.b.y + c.r)], [Infinity, Infinity, -Infinity, -Infinity]);
    const A = bb(a),
      B = bb(b);
    if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) return false;
    for (const s of a) for (const t of b) if (capsuleGap(s, t) < 0) return true;
    return false;
  }

  // ---- the cues --------------------------------------------------------------------------------
  // Beneath the hands: each key a hand holds shaded as gone down, and the
  // dotted footprint where a finger will land. Above them: the thumb-under
  // outline and each playing (or preparing) finger's number on its ring —
  // at its fingertip (just beyond it, overlapping it), in the column of the
  // key it plays or is coming to; rings that would meet move apart up and
  // down their keys, never across; a ring never stands on the other hand —
  // it moves along its key clear of it, or shows as a ghost.
  function buildCues() {
    for (const hand of HANDS) hands[hand].underThumb.visible = false;
    cues.begin(view.width, view.height);
    if (look.cues === false) {
      api.lastRings = [];
      cues.end();
      return;
    }
    const u = view.u;
    const ringR = clamp(u * 0.22, 7, 10.5);
    const feltPx = 5;
    const bedTop = view.top + feltPx + ringR + 1,
      bedBottom = Math.max(bedTop, view.top + view.bed - ringR - 2);
    const inBed = (y) => clamp(y, bedTop, bedBottom);
    // (How much of the picture shows at a height: it dissolves over the
    // bed's last `fadePx`, as the hands do.)
    const dissolve = (y) => smooth((view.height - 1.2 - y) / Math.max(1, fadeLen - 1.2));
    const blackW = 0.62 * u;
    const rings = [];
    const sil = {};
    for (const hand of HANDS) sil[hand] = api.silhouette(hand);
    for (const hand of HANDS) {
      const h = hands[hand];
      const fs = api.fingers(hand);
      if (!fs) continue;
      const motion = h.frame.motion || h.frame;
      const alpha = h.alpha ?? 1;
      // The keys this hand holds, shaded as gone down.
      fs.forEach((f, i) => {
        const mf = motion.fingers[i];
        if (!(f.state === "down" || mf.exact) || mf.x == null) return;
        const down = (clamp((1 - (mf.press ?? 0.7)) / 0.3, 0, 1) * 0.6 + 0.4) * alpha;
        const black = (mf.black || 0) > 0.5;
        const cx = mf.x * u - view.left;
        const w = black ? blackW : u - 1;
        const y0 = view.top,
          y1 = view.top + (black ? 0.63 * view.h : view.h - 3);
        const ym = (y0 + y1) / 2;
        cues.shade(cx - w / 2, y0, cx + w / 2, ym, [40, 22, 10, 0.05 * down], [40, 22, 10, 0.12 * down]);
        cues.shade(cx - w / 2, ym, cx + w / 2, y1, [40, 22, 10, 0.12 * down], [40, 22, 10, 0.22 * down]);
        const from = y0 + (y1 - y0) * 0.2;
        const sw = Math.max(1.4, u * 0.05);
        cues.shade(cx - w / 2 - sw * 0.3, from, cx - w / 2 + sw * 0.7, y1, [20, 12, 6, 0], [20, 12, 6, 0.55 * down]);
        cues.shade(cx + w / 2 - sw * 0.7, from, cx + w / 2 + sw * 0.3, y1, [20, 12, 6, 0], [20, 12, 6, 0.55 * down]);
      });
      // Where a finger will land: a dotted footprint on its key.
      const [r, g, b] = ink[hand].rgb;
      const markR = clamp(u * 0.22, 5.5, 11);
      fs.forEach((f, i) => {
        const mf = motion.fingers[i];
        if (f.state === "down" || !mf.target || !(mf.target.alpha > 0)) return;
        const cx = mf.target.x * u - view.left,
          cy = view.top + mf.target.contact;
        const pts = [];
        for (let n = 0; n < 28; n++) {
          const a = (n / 28) * Math.PI * 2;
          pts.push({ x: cx + Math.cos(a) * markR, y: cy + Math.sin(a) * 4.5 });
        }
        cues.dashed(pts, { closed: true, width: 1.25, color: [r, g, b, 0.84 * mf.target.alpha * alpha], dash: 2.3, gap: 2.3 });
      });
      // A thumb passing under the hand (or held on its key under it): the
      // thumb itself, where the hand hides it — its true outline and a faint
      // fill in the hand's colour (the under-thumb pass), clipped to the
      // hand that hides it and never drawn over the other hand.
      const thumb = fs[0];
      const under = smooth((thumb.under - 0.3) / 0.25);
      // (Only a thumb on its way under the hand to a key, or held on one
      // under it — not one merely tucked in while its hand waits.)
      const going = motion.fingers[0].target ? clamp(motion.fingers[0].target.alpha ?? 0, 0, 1) : 0;
      const hidden = thumb.state === "down" ? 0 : under * going;
      const held = thumb.state === "down" ? under : 0;
      const cue = Math.max(hidden, held) * (look.underCue ?? 1);
      if (cue > 0.01) {
        h.underThumb.visible = true;
        h.uniforms.uUnder.value = Math.min(1, 0.95 * cue) * alpha;
        h.uniforms.uXrayColor.value.setRGB(r / 255, g / 255, b / 255).convertSRGBToLinear();
      }
      for (const f of fs) {
        // (As the 2-D hands: a number shows as far as the engine shows it —
        // quickly opaque, never a dark see-through disc.)
        const number = smooth(clamp(f.number ?? 0, 0, 1) / 0.35);
        if (!(number > 0.01)) continue;
        const ghost = f.finger === 1 ? hidden : 0;
        // At its fingertip — the number names the finger — in the column of
        // the key it plays; its height a long finger's just beyond its
        // fingertip's outline, overlapping it, the thumb's on its tip, lying
        // on its side.
        const tipX = f.finger === 1 ? f.far.x : 0.5 * (f.top.x + f.end.x);
        const tipY = f.finger === 1 ? f.far.y : f.top.y - 0.45 * ringR;
        let x = tipX,
          want = tipY,
          mark = 0;
        if (f.keyX != null && f.onKey) x = f.keyX;
        else if (f.keyX != null) {
          // A finger coming to a key (a thumb passing under the hand to one
          // too): its number on that key's mark while the finger is still on
          // its way, moving onto the fingertip as the finger comes over the
          // key — so a number never stands a key or more from where its
          // finger goes, beside a key the hand plays.
          const over = 1 - smooth((Math.abs(tipX - f.keyX) / u - 0.35) / 0.6);
          mark = 1 - over;
          x = f.keyX;
          want = lerp(f.keyY != null ? view.top + f.keyY : tipY, tipY, over);
        }
        // (A number on its key's mark keeps its strength while its hand
        // steps back beneath the other.)
        const shown = number * lerp(alpha, Math.max(alpha, 0.9), mark);
        rings.push({ hand, f, x, y: inBed(want), want, ghost, shown, mark, weight: f.state === "down" ? 1 : 0.6, hidden: false });
      }
    }
    // A ring on the other hand's skin moves along its column, on its key,
    // to the nearest place clear of it; where the other hand covers the
    // whole key, to where it covers least — a playing finger's ring still
    // filled (it is drawn over the hands), a finger only coming to its key
    // shown as a ghost.
    const keysBottom = Math.max(bedTop, view.top + view.h - ringR - 2);
    for (const r of rings) {
      const other = sil[r.hand === "left" ? "right" : "left"];
      if (!other.length) continue;
      const clearance = (y) => Math.min(...other.map((sg) => segDist(r.x, y, sg) - sg.r - ringR - 1.5));
      const y0 = clamp(r.y, bedTop, keysBottom);
      if (clearance(r.y) >= 0) continue;
      let best = null,
        most = -Infinity,
        mostAt = y0;
      for (let d = 0; d <= keysBottom - bedTop && best == null; d += 1)
        for (const y of [y0 - d, y0 + d]) {
          if (y < bedTop || y > keysBottom) continue;
          const c = clearance(y);
          if (c >= 0) {
            best = y;
            break;
          }
          if (c > most) {
            most = c;
            mostAt = y;
          }
        }
      r.y = best ?? mostAt;
      if (best == null && !r.f.onKey) r.hidden = true;
    }
    // Separate adjacent badges inside their already-clear key columns;
    // a spacing adjustment must not move a badge onto the other hand.
    separateFingerRings(rings, { radius: ringR, bedTop, bedBottom, silhouettes: sil });
    for (const r of rings) {
      const { style, leader } = fingerRingCue(r, ringR);
      if (leader) cues.dashed(leader, { over: true, width: 1.2, color: [...ink[r.hand].rgb, r.shown * (r.f.onKey ? 0.65 : 0.4)], dash: 1, gap: 0 });
      cues.ring(r.x, r.y, ringR, { hand: r.hand, style, finger: r.f.finger, alpha: r.shown * (r.hidden ? 0.8 : 1) });
    }
    api.lastRings = rings.map((r) => ({ hand: r.hand, finger: r.f.finger, x: r.x, y: r.y, r: ringR, ghost: r.ghost, hidden: r.hidden, keyX: r.f.keyX, keyY: r.f.keyY, mark: r.mark, state: r.f.state, onKey: r.f.onKey, ...fingerRingCue(r, ringR), tipX: r.f.finger === 1 ? r.f.far.x : 0.5 * (r.f.top.x + r.f.end.x), tipY: r.f.finger === 1 ? r.f.far.y : r.f.top.y }));
    cues.end();
  }
  return api;
}

// A hand in its playing shape on five white keys, every finger down.
function referenceMotion(hand, view, at = null) {
  const base = hand === "right" ? [23.5, 24.5, 25.5, 26.5, 27.5] : [16.5, 15.5, 14.5, 13.5, 12.5];
  const shift = at == null ? 0 : Math.round(at - base[2]);
  const xs = base.map((x) => x + shift);
  const centre = xs[2] + (hand === "right" ? 0.5 : -0.5);
  return {
    hand,
    centre,
    palm: { x: centre, lift: 0, roll: 0, relax: 0, forward: 0, fan: 1 },
    fingers: xs.map((x, i) => ({ finger: i + 1, x, state: "down", press: 0.7, black: 0, contact: (i === 0 ? 0.8 : i === 4 ? 0.815 : 0.68) * view.h, number: 1 })),
  };
}

// How far up from the picture's lower edge — the part of the bed that shows
// — the picture dissolves (CSS px): below the web of the thumb, about a key's
// width under the keys, within 28 px … `fadePx`; so it is wholly gone at that
// edge and wholly there at least 28 px above it.
export function screenFadeLength(view, fadePx = LOOK.fadePx) {
  if (fadePx <= 0) return 0;
  return clamp(view.bed - view.h - 1.05 * view.u, 28, Math.max(28, fadePx));
}

// A posed hand's bones on screen as capsules { a, b, r, digit } (canvas CSS
// px): every digit's, and the palm's (digit −1).
export function screenCapsules(rig, solved, view) {
  const out = [];
  const P = (j, di) => project(j === "pad" ? solved.pads[di].centre : solved.world.get(j).p, view);
  const k = rig.scale * view.s;
  DIGITS.forEach((d, di) => {
    for (const [a, b, r] of OCCLUDERS[d]) out.push({ a: P(a, di), b: P(b, di), r: r * k, digit: di });
  });
  for (const [a, b, r] of PALM_CASTERS) out.push({ a: P(a), b: P(b), r: r * 1.5 * k, digit: -1 });
  return out;
}

// (How far a point is from a screen capsule's axis.)
function segDist(px, py, sg) {
  const ex = sg.b.x - sg.a.x,
    ey = sg.b.y - sg.a.y;
  const l2 = ex * ex + ey * ey || 1;
  const t = clamp(((px - sg.a.x) * ex + (py - sg.a.y) * ey) / l2, 0, 1);
  return Math.hypot(px - (sg.a.x + t * ex), py - (sg.a.y + t * ey));
}
// (The gap between two screen capsules; negative where they overlap.)
function capsuleGap(s, t) {
  let best = Infinity;
  for (const p of [s.a, s.b]) best = Math.min(best, segDist(p.x, p.y, t));
  for (const p of [t.a, t.b]) best = Math.min(best, segDist(p.x, p.y, s));
  // (Crossing axes.)
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (d(s.a, s.b, t.a) * d(s.a, s.b, t.b) < 0 && d(t.a, t.b, s.a) * d(t.a, t.b, s.b) < 0) best = 0;
  return best - s.r - t.r;
}

// For checks and the lab.
export const internals = { skinAttributes, segDist, capsuleGap, screenCapsules };
