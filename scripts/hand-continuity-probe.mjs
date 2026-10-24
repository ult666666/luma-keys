// Continuity probe for the 3-D hands: pose a hand-lab scenario frame by
// frame in node — pure, and eased as the renderer does — and report jerk
// (a frame moving far more than both its neighbours) in the hand's placement
// and the digits' joints, contact misses, and the frames the engine itself
// forces (impossible speeds, counted apart).
//
//   node scripts/hand-continuity-probe.mjs scenario.json [fps=144,to=4,tau=0.04,kw=40,focus=<t>,hand=left]
//
// Prints JSON: per hand, frames, pure/eased p95 and max per-frame steps,
// jerk spike counts, the worst contact miss and where, and example spikes.
import fs from "node:fs";
import {
  handTemplate,
  prepareTemplate,
  HandRig,
  poseHand,
  viewOf,
  POSTURE,
  DIGITS,
} from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";
import { handMotions } from "../src/hand-pose.mjs";
import {
  scenarioInputs,
  labGeometry,
  poseOptions,
} from "./hand-lab-scenario.mjs";
const [, , file, opts = ""] = process.argv;
const o = Object.fromEntries(
  opts
    .split(",")
    .filter(Boolean)
    .map((kv) => kv.split("=")),
);
const fps = Number(o.fps || 144),
  to = Number(o.to || 3),
  speed = Number(o.speed || 1),
  tau = Number(o.tau ?? 0.024);
const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
const P = {
  ...(o.trace ? { trace: true } : {}),
  ...POSTURE,
  prior: { ...POSTURE.prior, ...(o.px ? { x: Number(o.px) } : {}) },
  ...(o.aw ? { aimWeight: Number(o.aw) } : {}),
  ...(o.ac ? { aimCap: Number(o.ac) } : {}),
  ...(o.fe ? { freeEase: Number(o.fe) } : {}),
  ...(o.pr ? { prior: { ...POSTURE.prior, yaw: POSTURE.prior.yaw * Number(o.pr), pitch: POSTURE.prior.pitch * Number(o.pr), roll: POSTURE.prior.roll * Number(o.pr) } } : {}),
  ...(o.ft ? { fitTurn: Number(o.ft) } : {}),
  ...(o.rg ? { roundGuard: o.rg === "1" } : {}),
};
const inp = scenarioInputs(scenario, { speed });
const geometry = labGeometry(Number(o.kw || 40));
const view = viewOf({
  keyWidth: geometry.keyWidth,
  keysHeight: geometry.keysHeight,
  bedHeight: geometry.bedHeight,
  stripLeftPx: 0,
  viewportWidthPx: 3000,
  topPx: 0,
  dpr: 1,
});
const template = (hand) => {
  const buf = fs.readFileSync(
    new URL(`../public/models/hands/${hand}.glb`, import.meta.url),
  );
  return handTemplate(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    hand,
  );
};
const RIG = Object.fromEntries(
  ["left", "right"].map((h) => [
    h,
    new HandRig(prepareTemplate(template(h), POSTURE, HAND_RENDER_GEOMETRY)),
  ]),
);
const DEG = 180 / Math.PI;
const report = {};
for (const hand of ["left", "right"]) {
  const held = { pure: null, eased: null };
  const rows = [];
  let prev = null;
  const t0 = inp.clock.toSeconds(inp.firstBeat) - 0.5,
    t1 = Math.min(
      inp.clock.toSeconds(inp.endBeat) + 0.3,
      inp.clock.toSeconds(inp.firstBeat) + to,
    );
  for (let t = t0; t <= t1; t += 1 / fps) {
    const beat = inp.clock.toBeat(t);
    const both = handMotions(inp.steps, beat, poseOptions(inp, geometry));
    const fr = both[hand];
    if (!fr) {
      prev = null;
      continue;
    }
    const pure = poseHand(RIG[hand], fr, view, P);
    const k = 1 - Math.exp(-(1 / fps) / tau);
    const eased = poseHand(
      RIG[hand],
      fr,
      view,
      P,
      held.eased ? { held: held.eased, k, dt: 1 / fps } : null,
    );
    held.eased = eased.held;
    const states = fr.motion.fingers.map((f) => (f.state || "?")[0]).join("");
    const row = {
      t,
      beat,
      states,
      pure,
      eased,
      motion: fr.motion,
      forced: !!(fr.motion.forced || fr.motion.forcedFinger),
    };
    if (prev) {
      for (const kind of ["pure", "eased"]) {
        const a = prev[kind],
          b = row[kind];
        const dO = a.origin.distanceTo(b.origin) * 1000;
        const dAng =
          Math.max(
            Math.abs(a.pitch - b.pitch),
            Math.abs(a.yaw - b.yaw),
            Math.abs(a.roll - b.roll),
          ) * DEG;
        let dJoint = 0,
          worstDigit = "";
        for (const d of DIGITS) {
          const x = a.angles[d],
            y = b.angles[d];
          if (!x || !y) continue;
          for (const key of Object.keys(y))
            if (
              typeof y[key] === "number" &&
              typeof x[key] === "number" &&
              key !== "err"
            ) {
              const v = Math.abs(y[key] - x[key]) * DEG;
              if (v > dJoint) {
                dJoint = v;
                worstDigit = `${d}.${key}`;
              }
            }
        }
        row[kind + "Delta"] = { dO, dAng, dJoint, worstDigit };
      }
    }
    rows.push(row);
    prev = row;
  }
  // series=1: one line per frame on stderr for the chosen hand — eased
  // placement step, joint step and orientation, with the digits' states.
  if (o.series && (o.hand || "left") === hand)
    for (const r of rows) {
      const e = r.eased,
        d = r.easedDelta;
      if (!e) continue;
      process.stderr.write(
        `${r.t.toFixed(3)} ${r.beat.toFixed(3)} ${r.states} dO=${d ? d.dO.toFixed(1) : "-"} dJ=${d ? d.dJoint.toFixed(1) : "-"}${d ? `(${d.worstDigit})` : ""} ypr=${(e.yaw * DEG).toFixed(1)},${(e.pitch * DEG).toFixed(1)},${(e.roll * DEG).toFixed(1)} pureYpr=${(r.pure.yaw * DEG).toFixed(1)},${(r.pure.pitch * DEG).toFixed(1)},${(r.pure.roll * DEG).toFixed(1)}\n`,
      );
    }
  if (o.focus && (o.hand || "left") === hand) {
    const tf = Number(o.focus);
    const i0 = rows.findIndex((r) => r.t >= tf - 1e-6);
    for (const r of rows.slice(Math.max(0, i0 - 3), i0 + 2)) {
      const m = r.pure;
      if (r.pure.screen?.trace) console.log("   trace", JSON.stringify(r.pure.screen.trace));
      console.log(
        `--- t=${r.t.toFixed(4)} beat=${r.beat.toFixed(3)} states=${r.states} forced=${r.forced} palm.x=${(r.motion.palm.x * 23.5).toFixed(1)}mm lift=${r.motion.palm.lift?.toFixed(2)} spread=${r.motion.palm.spread} O=(${(m.origin.x * 1000).toFixed(1)},${(m.origin.y * 1000).toFixed(1)},${(m.origin.z * 1000).toFixed(1)}) ypr=(${(m.yaw * DEG).toFixed(1)},${(m.pitch * DEG).toFixed(1)},${(m.roll * DEG).toFixed(1)}) err=${m.errors.map((e) => (e * 1000).toFixed(2)).join("/")}`,
      );
      const fr = rows[rows.indexOf(r)];
      // (the motion's finger fields, from the same handMotions call)
      const motion = r.motion;
      for (const d of DIGITS) {
        const a = m.angles[d];
        if (a)
          console.log(
            `   ${d.padEnd(6)} ` +
              Object.entries(a)
                .filter(([k]) => k !== "err")
                .map(([k, v]) => `${k}=${(v * DEG).toFixed(1)}`)
                .join(" "),
          );
      }
      if (motion)
        motion.fingers.forEach((f) =>
          console.log(
            `   f${f.finger} ${f.state} x=${f.x?.toFixed(2)} lift=${f.lift?.toFixed(2)} extend=${f.extend?.toFixed(2)} curl=${f.curl?.toFixed(2)} press=${f.press?.toFixed(2)} since=${f.since?.toFixed?.(3)} aimTau=${f.aimTau?.toFixed?.(3)} under=${f.under?.toFixed?.(2)} arc=${f.arc?.toFixed?.(2)} descent=${f.descent?.toFixed?.(2)} exact=${f.exact} target=${f.target ? `${f.target.x.toFixed(2)}@a${(f.target.alpha ?? 1).toFixed(2)}` : "-"} midi=${f.midi}`,
          ),
        );
    }
  }
  // A spike is jerk, not speed: a frame moving far more than both its
  // neighbours (a flight is fast but even). Engine-forced frames (impossible
  // speeds the engine flags) are counted apart.
  const jerky = (kind) =>
    rows.filter((r, i) => {
      const d = r[kind + "Delta"];
      if (!d || r.forced) return false;
      const n = [
        rows[i - 1]?.[kind + "Delta"],
        rows[i + 1]?.[kind + "Delta"],
      ].filter(Boolean);
      const nO = Math.max(0, ...n.map((x) => x.dO)),
        nJ = Math.max(0, ...n.map((x) => x.dJoint));
      return (
        (d.dO > 2 && d.dO > 2.5 * nO + 1) ||
        (d.dJoint > 6 && d.dJoint > 2.5 * nJ + 2)
      );
    });
  const spikes = jerky("pure"),
    easedSpikes = jerky("eased");
  const q = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return {
      p95: +(s[Math.floor(0.95 * s.length)] || 0).toFixed(2),
      max: +(s.at(-1) || 0).toFixed(2),
    };
  };
  report[hand] = {
    frames: rows.length,
    pure: {
      dO: q(rows.map((r) => r.pureDelta?.dO || 0)),
      dJoint: q(rows.map((r) => r.pureDelta?.dJoint || 0)),
      spikes: spikes.length,
    },
    eased: {
      dO: q(rows.map((r) => r.easedDelta?.dO || 0)),
      dJoint: q(rows.map((r) => r.easedDelta?.dJoint || 0)),
      spikes: easedSpikes.length,
      // (Spikes big enough to see: the hand jumping 6 mm or a joint 20° in
      // a frame its neighbours hardly move in.)
      visible: easedSpikes.filter(
        (r) => r.easedDelta.dO > 6 || r.easedDelta.dJoint > 20,
      ).length,
    },
    maxErrMm: +(
      Math.max(
        0,
        ...rows.flatMap((r) =>
          r.pure.errors.map((e, i) => (r.pure.fingers[i].down ? e : 0)),
        ),
      ) * 1000
    ).toFixed(2),
    maxErrAt: (() => {
      let best = { e: 0 };
      for (const r of rows)
        r.pure.errors.forEach((e, i) => {
          if (r.pure.fingers[i].down && e > best.e)
            best = {
              e,
              t: +r.t.toFixed(3),
              beat: +r.beat.toFixed(3),
              finger: i + 1,
              states: r.states,
              midis: r.motion.fingers.map((f) => f.midi),
            };
        });
      return best;
    })(),
    forcedFrames: rows.filter((r) => r.forced).length,
    byState: Object.fromEntries(
      Object.entries(
        spikes.reduce((m, r) => {
          const i = rows.indexOf(r);
          const key = `${rows[i - 1]?.states}->${r.states}`;
          m[key] = (m[key] || 0) + 1;
          return m;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
    ),
    examples: spikes
      .sort(
        (a, b) =>
          Math.max(b.pureDelta.dO / 3, b.pureDelta.dJoint / 8) -
          Math.max(a.pureDelta.dO / 3, a.pureDelta.dJoint / 8),
      )
      .slice(0, 8)
      .map((r) => ({
        t: +r.t.toFixed(3),
        beat: +r.beat.toFixed(3),
        states: r.states,
        forced: r.forced,
        dO: +r.pureDelta.dO.toFixed(1),
        dAng: +r.pureDelta.dAng.toFixed(1),
        dJoint: +r.pureDelta.dJoint.toFixed(1),
        digit: r.pureDelta.worstDigit,
        eased: {
          dO: +r.easedDelta.dO.toFixed(1),
          dJoint: +r.easedDelta.dJoint.toFixed(1),
        },
      })),
  };
}
console.log(
  JSON.stringify(
    { file: file.split("/").pop(), fps, speed, tau, ...report },
    null,
    1,
  ),
);
