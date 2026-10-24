// Check the 3-D hands headless: pose both hands (src/hand3d-rig.mjs, from the
// real engine's handMotions) over scenarios at 120 fps and report
//   · misses: a digit on its key whose pad is more than 0.5 mm from its
//     contact (one that cannot reach; the placement should make this rare),
//     and the frames where one is more than 2 mm off,
//   · jumps: a joint moving further in one frame than the engine's own motion
//     explains (the palm's and the fingertips' travel, lifts, plus slack),
//   · kinks: a joint's second difference over three frames above 2.5 mm — a
//     solver discontinuity rather than motion,
//   · the cost of posing a hand.
//
//   node scripts/hand3d-check.mjs <scenario.json…> [--kw 45 --kh 166] [--speed 1] [--fps 120]
//        [--from beat --to beat] [--elev 70] [--json out.json] [--quiet]
//        [--posture '{"lowerMax":0.01}']  (posture overrides, metres and radians)
//        [--smooth 24]  (ms: ease each frame from the one before, as the app's stage
//                        does — hands3d-layer.mjs SMOOTH_TAU; off by default)
import fs from "node:fs";
import * as THREE from "three";
import { handTemplate, prepareTemplate, HandRig, poseHand, viewOf, POSTURE, DIGITS, KEY_W } from "../src/hand3d-rig.mjs";
import { handMotions } from "../src/hand-pose.mjs";
import { scenarioInputs, poseOptions, labGeometry } from "./hand-lab-scenario.mjs";

const argv = process.argv.slice(2);
const files = argv.filter((a, i) => !a.startsWith("--") && a.endsWith(".json") && !(i > 0 && argv[i - 1] === "--json"));
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const kw = +opt("kw", 45),
  kh = +opt("kh", 166),
  fps = +opt("fps", 120);
const quiet = argv.includes("--quiet");
const extra = opt("posture") ? JSON.parse(opt("posture")) : {};
const P = { ...POSTURE, ...extra, ...(extra.play ? { play: { ...POSTURE.play, ...extra.play } } : null) };
const geom = labGeometry(kw, kh);
const view = viewOf({ keyWidth: kw, keysHeight: geom.keysHeight, bedHeight: geom.bedHeight, stripLeftPx: 0, viewportWidthPx: 1000, topPx: 0, dpr: 1, elevation: opt("elev") ? +opt("elev") : null });
// (The renderer's own rig: prepareTemplate's lengthened thumb and little
// finger, subdivided and sculpted mesh.)
const rigs = {};
for (const hand of ["left", "right"]) {
  const buf = fs.readFileSync(new URL(`../public/models/hands/${hand}.glb`, import.meta.url));
  rigs[hand] = new HandRig(prepareTemplate(handTemplate(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), hand), P));
}
const all = [];
let totalBad = 0;
for (const file of files) {
  const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
  const inputs = scenarioInputs(scenario, { speed: opt("speed") ? +opt("speed") : undefined });
  const { clock } = inputs;
  const t0 = opt("from") != null ? clock.toSeconds(+opt("from")) : clock.toSeconds(inputs.firstBeat) - 1;
  const t1 = opt("to") != null ? clock.toSeconds(+opt("to")) : clock.toSeconds(inputs.endBeat) + 0.5;
  const frames = Math.floor((t1 - t0) * fps);
  const report = { file, scenario: scenario.title, kw, kh, fps, frames, elevation: view.deg, hands: {} };
  const hist = {};
  const heldOf = {};
  let spent = 0,
    posed = 0;
  for (let k = 0; k <= frames; k++) {
    const t = t0 + k / fps;
    const beat = clock.toBeat(t);
    const both = handMotions(inputs.steps, beat, poseOptions(inputs, geom, {}));
    for (const hand of ["left", "right"]) {
      const fr = both[hand];
      if (!fr) continue;
      const r = (report.hands[hand] ??= { frames: 0, missFrames: 0, bigMissFrames: 0, worstMissMm: 0, misses: [], jumps: 0, worstJumps: [], kinks: 0, worstKinks: [], maxTravelMm: 0 });
      r.frames++;
      const started = performance.now();
      // (Eased from the frame before, as the app draws them, with --smooth.)
      const tau = +opt("smooth", 0) / 1000;
      const mem = (heldOf[hand] ??= { held: null });
      const res = poseHand(rigs[hand], fr, view, P, tau > 0 && mem.held ? { held: mem.held, k: 1 - Math.exp(-1 / fps / tau) } : null);
      mem.held = res.held;
      spent += performance.now() - started;
      posed++;
      const m = fr.motion;
      let missed = false;
      res.errors.forEach((e, i) => {
        if (!(e > 0.0005)) return;
        missed = true;
        r.worstMissMm = Math.max(r.worstMissMm, e * 1000);
        if (r.misses.length < 12) r.misses.push({ beat: +beat.toFixed(3), finger: i + 1, mm: +(e * 1000).toFixed(2), midi: m.fingers[i].midi });
      });
      if (missed) r.missFrames++;
      // (… and by more than 2 mm: a pad visibly off its contact.)
      if (res.errors.some((e) => e > 0.002)) r.bigMissFrames++;
      const pts = new Map([...res.world].map(([n, w]) => [n, w.p.clone()]));
      for (let i = 0; i < 5; i++) pts.set(`pad${i}`, res.pads[i].centre.clone());
      const hs = (hist[hand] ??= []);
      hs.push({ beat, pts, centre: m.centre, fx: m.fingers.map((f) => f.x), lift: m.palm.lift || 0, fl: m.fingers.map((f) => f.lift || 0) });
      if (hs.length > 3) hs.shift();
      if (hs.length >= 2) {
        const [a, b] = hs.slice(-2);
        // What the engine itself moved this frame (m): palm and fingertips across,
        // lifts (palm and fingers) up and down, plus slack for curls and reaches.
        let engine = Math.abs(b.centre - a.centre) * KEY_W;
        b.fx.forEach((x, i) => (engine = Math.max(engine, Math.abs(x - a.fx[i]) * KEY_W)));
        const lifts = Math.abs(b.lift - a.lift) * P.palmLift + Math.max(...b.fl.map((x, i) => Math.abs(x - a.fl[i]))) * P.fingerLift * 1.5;
        const allowed = engine * 1.6 + lifts + 0.0015 + 0.45 / fps;
        let worst = 0,
          joint = "";
        for (const [n, p] of b.pts) {
          const d = p.distanceTo(a.pts.get(n));
          if (d > worst) {
            worst = d;
            joint = n;
          }
        }
        r.maxTravelMm = Math.max(r.maxTravelMm, worst * 1000);
        if (worst > allowed) {
          r.jumps++;
          r.worstJumps.push({ beat: +b.beat.toFixed(3), joint, mm: +(worst * 1000).toFixed(2), allowedMm: +(allowed * 1000).toFixed(2) });
          r.worstJumps.sort((x, y) => y.mm - y.allowedMm - (x.mm - x.allowedMm));
          r.worstJumps.length = Math.min(r.worstJumps.length, +opt("keep", 6));
        }
      }
      if (hs.length === 3) {
        const [a, b, c] = hs;
        let worst = 0,
          joint = "";
        for (const [n, p] of b.pts) {
          const d = p.clone().multiplyScalar(2).sub(a.pts.get(n)).sub(c.pts.get(n)).length();
          if (d > worst) {
            worst = d;
            joint = n;
          }
        }
        if (worst > 0.0025) {
          r.kinks++;
          r.worstKinks.push({ beat: +b.beat.toFixed(3), joint, mm: +(worst * 1000).toFixed(2) });
          r.worstKinks.sort((x, y) => y.mm - x.mm);
          r.worstKinks.length = Math.min(r.worstKinks.length, 6);
        }
      }
    }
  }
  report.msPerHand = +(spent / Math.max(1, posed)).toFixed(3);
  const name = file.split("/").pop().replace(".json", "");
  for (const [hand, r] of Object.entries(report.hands)) {
    totalBad += r.missFrames + r.jumps + r.kinks;
    console.log(
      `${name.padEnd(16)} ${hand.padEnd(5)} ${String(r.frames).padStart(5)} frames · miss frames ${String(r.missFrames).padStart(4)} (worst ${r.worstMissMm.toFixed(2)} mm) · jumps ${String(r.jumps).padStart(3)} · kinks ${String(r.kinks).padStart(3)} · max travel ${r.maxTravelMm.toFixed(1)} mm/frame · ${report.msPerHand} ms/hand`,
    );
    if (!quiet) {
      if (r.misses.length) console.log("    misses", JSON.stringify(r.misses.slice(0, 6)));
      if (r.worstJumps.length) console.log("    jumps ", JSON.stringify(r.worstJumps.slice(0, 4)));
      if (r.worstKinks.length) console.log("    kinks ", JSON.stringify(r.worstKinks.slice(0, 4)));
    }
  }
  all.push(report);
}
if (opt("json")) fs.writeFileSync(opt("json"), JSON.stringify(all.length === 1 ? all[0] : all, null, 1));
process.exitCode = totalBad ? 1 : 0;
