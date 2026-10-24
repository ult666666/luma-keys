// Motion continuity of the 3-D hands, frame after frame, as the renderer
// draws them (eased from the frame before): no jump when a finger lands or
// lets go, no tremor in the free fingers, and every key still reached.
import test from "node:test";
import assert from "node:assert/strict";
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
import { handMotions, handTimeline } from "../src/hand-pose.mjs";
import { fingerScore } from "../src/fingering.mjs";
import { secondsAt, clockMap } from "../src/tempo.mjs";
import { SMOOTH_TAU } from "../src/hands3d-layer.mjs";

const DEG = 180 / Math.PI;
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
  ["left", "right"].map((hand) => [
    hand,
    new HandRig(prepareTemplate(template(hand), POSTURE, HAND_RENDER_GEOMETRY)),
  ]),
);
const note = (id, midi, beat, duration, hand) => ({
  id,
  midi,
  beat,
  duration,
  hand,
  velocity: 0.7,
});
const piece = (notes, bpm = 120) => ({
  id: "continuity",
  bpm,
  pedals: [],
  duration: Math.max(...notes.map((n) => n.beat + n.duration)),
  notes,
});
// A right-hand octave melody with the inner fingers playing between, and a
// left-hand scale with a thumb under: the two shapes whose landings and
// releases used to switch the hand's arch and the free fingers' rest.
const OCTAVES = (() => {
  const notes = [];
  let i = 0;
  for (const [beat, midis] of [
    [0, [60, 72]],
    [1, [64]],
    [2, [62, 74]],
    [3, [67]],
    [4, [64, 76]],
    [5, [69]],
    [6, [60, 72]],
  ])
    for (const m of midis) notes.push(note(`o${i++}`, m, beat, 0.9, "right"));
  for (let b = 0; b < 8; b++)
    notes.push(
      note(`l${b}`, [48, 50, 52, 53, 55, 57, 59, 60][b], b, 0.9, "left"),
    );
  return piece(notes, 120);
})();
const inputs = (score) => {
  const fingering = fingerScore(score.notes, (b) => secondsAt(score, b));
  return {
    steps: {
      right: handTimeline(score.notes, fingering, "right"),
      left: handTimeline(score.notes, fingering, "left"),
    },
    clock: clockMap(score, 1, null),
  };
};
const geometry = { keyWidth: 40, keysHeight: 192, bedHeight: 252 };
const view = viewOf({
  ...geometry,
  stripLeftPx: 0,
  viewportWidthPx: 3000,
  topPx: 0,
  dpr: 1,
});
const motionsAt = (inp, beat) =>
  handMotions(inp.steps, beat, {
    ...geometry,
    clock: inp.clock,
    speed: 1,
    frozen: false,
    pedals: [],
  });
// Pose a passage frame by frame, pure and eased, with the per-frame steps.
function sequence(score, hand, { fps = 90, tau = SMOOTH_TAU } = {}) {
  const inp = inputs(score);
  const k = 1 - Math.exp(-1 / fps / tau);
  const rows = [];
  let held = null,
    prev = null;
  for (let t = -0.5; t <= score.duration / 2 + 0.3; t += 1 / fps) {
    const beat = inp.clock.toBeat(t);
    const fr = motionsAt(inp, beat)[hand];
    if (!fr) {
      prev = null;
      held = null;
      continue;
    }
    const pure = poseHand(RIG[hand], fr, view, POSTURE);
    const eased = poseHand(
      RIG[hand],
      fr,
      view,
      POSTURE,
      held ? { held, k, dt: 1 / fps } : null,
    );
    held = eased.held;
    const states = fr.motion.fingers.map((f) => (f.state || "?")[0]).join("");
    const row = {
      t,
      states,
      pure,
      eased,
      forced: !!(fr.motion.forced || fr.motion.forcedFinger),
      down: fr.motion.fingers.map((f) => f.state === "down"),
    };
    if (prev) {
      const step = (a, b) => {
        let joint = 0,
          where = "";
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
              if (v > joint) {
                joint = v;
                where = `${d}.${key}`;
              }
            }
        }
        return {
          origin: a.origin.distanceTo(b.origin) * 1000,
          joint,
          where,
        };
      };
      row.pureStep = step(prev.pure, pure);
      row.easedStep = step(prev.eased, eased);
      row.landed = row.down.some((d, i) => d && !prev.down[i]);
      row.released = prev.down.some((d, i) => d && !row.down[i]);
    }
    rows.push(row);
    prev = row;
  }
  return rows;
}

test("a landing or a release never jumps the eased hand, and every key stays reached", () => {
  for (const hand of ["right", "left"]) {
    const rows = sequence(OCTAVES, hand);
    const events = rows.filter((r) => r.easedStep && (r.landed || r.released));
    assert.ok(
      events.length >= 4,
      `${hand}: ${events.length} landings/releases`,
    );
    for (const r of events) {
      assert.ok(
        r.easedStep.origin < 8,
        `${hand} t ${r.t.toFixed(3)} ${r.states}: the hand moved ${r.easedStep.origin.toFixed(1)} mm in one frame at a ${r.landed ? "landing" : "release"}`,
      );
      // (A digit on its key is exact; the rest settle.)
      r.down.forEach((d, i) => {
        if (d)
          assert.ok(
            r.eased.errors[i] <= 0.0005 + 1e-9,
            `${hand} t ${r.t.toFixed(3)}: digit ${i + 1} misses by ${(r.eased.errors[i] * 1000).toFixed(2)} mm`,
          );
      });
    }
  }
});

test("free fingers never tremble: eased joint steps stay small between landings, and the whole passage is jerk-free", () => {
  for (const hand of ["right", "left"]) {
    const rows = sequence(OCTAVES, hand);
    let worst = { joint: 0 },
      jerks = [];
    rows.forEach((r, i) => {
      if (!r.easedStep || r.forced) return;
      if (r.easedStep.joint > worst.joint)
        worst = { ...r.easedStep, t: r.t, states: r.states };
      const n = [rows[i - 1]?.easedStep, rows[i + 1]?.easedStep].filter(
        Boolean,
      );
      const nO = Math.max(0, ...n.map((x) => x.origin)),
        nJ = Math.max(0, ...n.map((x) => x.joint));
      if (
        (r.easedStep.origin > 2 && r.easedStep.origin > 2.5 * nO + 1) ||
        (r.easedStep.joint > 6 && r.easedStep.joint > 2.5 * nJ + 2)
      )
        jerks.push({ t: +r.t.toFixed(3), states: r.states, ...r.easedStep });
    });
    assert.ok(
      worst.joint < 30,
      `${hand}: worst eased joint step ${worst.joint.toFixed(1)}° (${worst.where}) at t ${worst.t?.toFixed(3)} ${worst.states}`,
    );
    // (Measured budget, 2.42: a few moderate frames remain at the thumb's
    // landings; none moves the hand more than 8 mm or a joint more than 30°.
    // 2.44: the correction rounds no longer accept a step that carries a
    // missed held key further off; across the twenty measured passages that
    // cut the visible jerks from 48 to 44 and brought every held key within
    // 0.5 mm, while this octave's first landing grew from 7.6 to 8.2 mm.)
    assert.ok(
      jerks.length <= 6,
      `${hand}: ${jerks.length} jerky frames: ${JSON.stringify(jerks.slice(0, 4))}`,
    );
    for (const j of jerks)
      assert.ok(
        j.origin < 8.5 && j.joint < 30,
        `${hand}: jerky frame beyond budget ${JSON.stringify(j)}`,
      );
  }
});

test("the hand's arch opens with an aim, not at the strike: the span counts a digit as it comes", () => {
  // The octave's first chord: as the little finger comes to its key the
  // hand's height rises over the aim rather than in the landing frame.
  const rows = sequence(OCTAVES, "right");
  const landing = rows.find(
    (r) => r.landed && r.states.startsWith("d") && r.states.endsWith("d"),
  );
  assert.ok(landing, "the octave lands");
  const before = rows[rows.indexOf(landing) - 1];
  assert.ok(
    Math.abs(landing.pure.origin.y - before.pure.origin.y) * 1000 < 4,
    `the pure hand rose ${(Math.abs(landing.pure.origin.y - before.pure.origin.y) * 1000).toFixed(1)} mm in the landing frame`,
  );
});
