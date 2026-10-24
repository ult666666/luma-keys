// The realistic 3-D hands' pure parts, in node (three.js maths, no WebGL):
// the camera mapping onto the drawn keyboard, the rig's IK (contacts, joint
// limits, rigid bones), determinism, and the stage layer's helpers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import {
  handTemplate,
  prepareTemplate as prepareRigTemplate,
  extendForearm,
  HandRig,
  poseHand,
  viewOf,
  project,
  depthAt,
  POSTURE,
  STRAINED,
  FINGERS,
  PARENT,
  KEY_W,
  KEY_LEN,
  BLACK_RISE,
  LIMITS,
  SQUASH,
} from "../src/hand3d-rig.mjs";
import {
  handMotions,
  handTimeline,
  keyCentre,
  contactDepth,
} from "../src/hand-pose.mjs";
import { fingerScore } from "../src/fingering.mjs";
import { secondsAt, clockMap } from "../src/tempo.mjs";
import { demos, isBlack } from "../src/music.mjs";
import {
  motionSignature,
  stageGeometry,
  DPR_MAX,
  createHandsLayer,
  visibleBed,
  sharedRenderer,
  PREWARM_AFTER_MS,
} from "../src/hands3d-layer.mjs";
import { handSeparation, slidMotion, overlapNeed } from "../src/hand3d-overlap.mjs";
import { nailGeometry } from "../src/hand3d-nails.mjs";
import { cuffGeometry } from "../src/hand3d-cuff.mjs";
import {
  HAND_RENDER_GEOMETRY,
  skinAttributes,
  prepareHandData,
  serialise,
  deserialise,
} from "../src/hand3d-data.mjs";
import { BAKE_VERSION } from "../scripts/bake-hand-maps.mjs";

// Match the model preparation used by the renderer and skin-map baker.
const prepareTemplate = (tpl, P = POSTURE, options = HAND_RENDER_GEOMETRY) =>
  prepareRigTemplate(tpl, P, options);

// ---- fixtures --------------------------------------------------------------------------------
const template = (hand) => {
  const buf = fs.readFileSync(
    new URL(`../public/models/hands/${hand}.glb`, import.meta.url),
  );
  return handTemplate(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    hand,
  );
};
const RAW = { left: template("left"), right: template("right") };
const TPL = {
  left: prepareTemplate(RAW.left, POSTURE),
  right: prepareTemplate(RAW.right, POSTURE),
};
const RIG = { left: new HandRig(TPL.left), right: new HandRig(TPL.right) };

test("forearms continue below the wrist without changing playing anatomy", () => {
  for (const hand of ["left", "right"]) {
    const base = prepareTemplate(RAW[hand], { ...POSTURE, forearmExtra: 0 }, { subdivide: 2, sculpt: 0.55 });
    const extended = extendForearm(base, 0.09, 0.12);
    const rig = new HandRig(base), longer = new HandRig(extended);
    const toHand = p => p.clone().sub(rig.origin).applyQuaternion(rig.toHand);
    const wrist = toHand(base.bind.get("wrist").p);
    let before = wrist.z, after = wrist.z, changed = 0;
    assert.equal(extended.bind, base.bind);
    assert.equal(extended.weights, base.weights);
    assert.equal(extended.joints, base.joints);
    assert.equal(extended.index, base.index);
    assert.equal(extended.position.length, base.position.length);
    for (let i = 0; i < base.position.length / 3; i++) {
      const p = new THREE.Vector3().fromArray(base.position, 3 * i);
      const q = new THREE.Vector3().fromArray(extended.position, 3 * i);
      const h = toHand(p);
      before = Math.max(before, h.z);
      after = Math.max(after, toHand(q).z);
      if (h.z <= wrist.z) assert.deepEqual(q.toArray(), p.toArray());
      else if (p.distanceTo(q) > 1e-8) changed++;
    }
    assert.ok(changed > 0 && changed < base.position.length / 15, "Only the forearm skin changes");
    assert.ok(Math.abs(after - before - 0.09) < 1e-6, "Continuous 90 mm forearm");
    for (const digit of ["thumb", ...FINGERS]) {
      assert.deepEqual(longer.pads[digit].c.toArray(), rig.pads[digit].c.toArray());
      assert.equal(longer.pads[digit].r, rig.pads[digit].r);
    }
  }
});

test("a relaxed finger stays above the black keys after crossing and final easing", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/hand-free-key-clearance.json", import.meta.url)));
  const tpl = prepareTemplate(RAW.left, POSTURE, { subdivide: 2, sculpt: 0.55 });
  for (const u of [35, 38, 53.88461538461539]) {
    const view = viewOf({ ...fixture.geometry, keyWidth: u });
    const solved = poseHand(new HandRig(tpl), fixture.motion, view);
    checkPose(solved, "left", tpl, `relaxed crossing ${u}`);
    for (let i = 0; i < 5; i++) {
      const f = solved.fingers[i];
      if (f.down) assert.ok(solved.errors[i] < 0.0005, `Held finger ${i + 1} moved`);
      else if (solved.pads[i].centre.z < view.keyLen)
        assert.ok(solved.pads[i].height + f.dip >= -0.00001,
          `Free finger ${i + 1} intersects a released key at ${u}px`);
    }
  }
});

test("held black/white contacts stay aligned while other fingers anticipate the coda", () => {
  const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/hand-coda-contacts.json", import.meta.url)));
  const prepared = Object.fromEntries(["left", "right"].map(hand => [hand,
    prepareTemplate(RAW[hand], POSTURE, { subdivide: 2, sculpt: 0.55 })]));
  const view = viewOf({ keyWidth: 35.025, keysHeight: 171, bedHeight: 304 });
  for (const { beat, hand, motion } of fixtures) {
    const solved = poseHand(new HandRig(prepared[hand]), motion, view);
    for (let i = 0; i < 5; i++) if (motion.fingers[i].state === "down") {
      assert.ok(solved.errors[i] < 0.0005,
        `beat ${beat} ${hand} finger ${i+1}: ${solved.errors[i]*1000} mm`);
    }
    checkPose(solved, hand, prepared[hand], `held coda ${beat} ${hand}`);
  }
});

test("Appassionata bar 267 crosses a black-key thumb without inventing an impossible held chord", () => {
  const score = JSON.parse(fs.readFileSync(new URL("./fixtures/hand-appassionata-crossing.json", import.meta.url)));
  const steps = { left: handTimeline(score.notes, new Map(score.notes.map(n => [n.id, n.finger])), "left"), right: [] };
  const clock = clockMap(score, score.speed);
  for (const [keyWidth, keysHeight] of [[35.025, 171], [53.8, 171], [24.6, 140]]) {
    const geometry = { keyWidth, keysHeight, bedHeight: 342 };
    const view = viewOf(geometry), rig = new HandRig(TPL.left);
    let held = null;
    for (let beat = 531.875; beat <= 532.125; beat += 1 / 64) {
      const both = handMotions(steps, beat, { ...geometry, clock, speed: score.speed, frozen: false });
      const solved = poseHand(rig, both.left, view, POSTURE, held ? { held, k: 0.5 } : null);
      held = solved.held;
      for (let i = 0; i < 5; i++) if (solved.fingers[i].down)
        assert.ok(solved.errors[i] < 0.002,
          `bar 267 ${keyWidth}px beat ${beat} finger ${i + 1}: ${solved.errors[i] * 1000} mm`);
      checkPose(solved, "left", TPL.left, `bar 267 ${keyWidth}px beat ${beat}`);
    }
  }
});

test("a mixed black/white octave chord keeps its thumb, index and little finger on their keys in the production-prepared hand", () => {
  // Appassionata's A-flat/C/A-flat coda chord exposed a 7 mm index miss:
  // the former correction penalised a necessary wrist turn too strongly.
  const tpl = prepareTemplate(RAW.right, POSTURE, { subdivide: 2, sculpt: 0.55 });
  for (const [u, h] of [[35.025, 171], [60, 218], [20, 130]]) {
    const f = (finger, x, midi, black, contact) => ({
      finger, x, midi, black, contact: contact * h, state: "down", press: 1,
      lift: 0, number: 1, under: 0, inward: black ? 0 : 0.875,
      heldFor: 0, target: null,
    });
    const motion = {
      hand: "right", dir: 1, t: 0, beat: 0, centre: 26.026244,
      palm: { x: 26.026244, spread: 1.4, fan: 1.216, forward: 0.875,
        lift: 0, roll: 0, relax: 0, rest: false, moving: false },
      fingers: [f(1, 21, 56, 1, 0.5576513), f(2, 23.5, 60, 0, 0.572466),
        { finger:3, x:25.396244, midi:null, black:0, state:"ready", lift:0.15,
          number:1, since:0.237778, contact:0.68*h,
          target:{x:26.5,midi:65,black:0,inward:0.5,alpha:1,contact:0.6185526*h} },
        { finger:4, x:26.656244, midi:null, black:0, state:"up", lift:0.15,
          number:0, since:5.608148, contact:0.68*h, target:null },
        f(5, 28, 68, 1, 0.5504825)],
    };
    const solved = poseHand(new HandRig(tpl), motion, viewOf({
      keyWidth:u, keysHeight:h, bedHeight:h+u*2.65+40,
    }), POSTURE);
    for (const i of [0,1,4]) assert.ok(solved.errors[i]<0.0005,
      `${u}/${h} finger ${i+1}: ${solved.errors[i]*1000} mm`);
    checkPose(solved, "right", tpl, `coda ${u}/${h}`);
  }
});

const note = (id, midi, beat, duration, hand) => ({
  id,
  midi,
  beat,
  duration,
  hand,
  velocity: 0.7,
});
const chord = (midis, hand, beat = 0, d = 2) =>
  midis.map((m, i) => note(`${hand}${beat}-${i}`, m, beat, d, hand));
const piece = (notes, bpm = 80) => ({
  bpm,
  notes,
  duration: Math.max(...notes.map((n) => n.beat + n.duration)),
});
const twinkle = (() => {
  const d = demos().find((x) => x.id === "moon");
  return piece(
    d.notes.map((n, i) => ({
      ...n,
      id: n.id ?? `t${i}`,
      hand: n.hand === "left" ? "left" : "right",
    })),
    d.bpm,
  );
})();
const PASSAGES = {
  // Five-finger patterns and the hand's triad, both hands.
  five: piece([
    ...[60, 62, 64, 65, 67].map((m, i) =>
      note(`r${i}`, m, i * 0.5, 0.5, "right"),
    ),
    ...chord([60, 64, 67], "right", 3),
    ...[48, 50, 52, 53, 55].map((m, i) =>
      note(`l${i}`, m, i * 0.5, 0.5, "left"),
    ),
    ...chord([48, 52, 55], "left", 3),
  ]),
  // Octaves, and a chord on black keys.
  octave: piece([
    ...chord([60, 72], "right", 0),
    ...chord([43, 55], "left", 0),
    ...chord([66, 70, 73], "right", 3),
  ]),
  twinkle,
};
// (A passage's inputs as the stage builds them.)
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

test("Appassionata's opening keeps idle fingers gently curved, clear of the keys, and the thumb inboard", () => {
  const notes = [0, 2].flatMap(beat => [
    ...chord([46, 55], "left", beat, 1.95),
    ...chord([64, 73], "right", beat, 1.95),
  ]);
  const score = piece(notes, 144);
  const fingering = new Map(notes.map(n => [n.id,
    n.hand === "left" ? (n.midi === 46 ? 4 : 1) : (n.midi === 64 ? 1 : 4)]));
  const steps = Object.fromEntries(["left", "right"].map(hand => [hand, handTimeline(notes, fingering, hand)]));
  const geometry = { keyWidth: 46, keysHeight: 205, bedHeight: 420 };
  const view = viewOf(geometry);
  const prepared = Object.fromEntries(["left", "right"].map(hand => [hand,
    prepareTemplate(RAW[hand], POSTURE, { subdivide: 2, sculpt: 0.55 })]));
  for (const frozen of [true, false]) {
    const frames = handMotions(steps, frozen ? 0 : 0.25, {
      ...geometry, clock: clockMap(score, 1, null), speed: 1, frozen,
      settle: frozen ? { since: 0.4 } : null, pedals: [],
    });
    for (const hand of ["left", "right"]) {
      const solved = poseHand(new HandRig(prepared[hand]), frames[hand], view);
      checkPose(solved, hand, prepared[hand], `opening ${hand} frozen=${frozen}`);
      for (const i of [0, 3]) assert.ok(solved.errors[i] < 0.0005,
        `Opening ${hand} contact ${i + 1}: ${solved.errors[i] * 1000} mm`);
      const thumbY = project(solved.pads[0].contact, view).y / geometry.keysHeight;
      assert.ok(thumbY > 0.63 && thumbY < 0.86,
        `Thumb sits on the exposed white-key surface, not its front lip: ${thumbY}`);
      for (const name of ["index", "middle"]) {
        // The old >=60° and "behind the ring" requirements forced the
        // rejected claw silhouette. A resting finger may show its full
        // natural length; it needs a visible curve, not a clenched joint.
        assert.ok(solved.angles[name].pip >= 25 * Math.PI / 180 &&
          solved.angles[name].pip <= 90 * Math.PI / 180,
          `${hand} idle ${name} keeps a gentle, uncollapsed middle joint`);
      }
      for (const i of [1, 2, 4]) if (solved.pads[i].centre.z < view.keyLen)
        assert.ok(solved.pads[i].height >= -0.00001,
          `${hand} idle finger ${i + 1} clears the key beneath it`);
    }
  }
});

test("a resting hand beside a melody stays open instead of clenching into a fist", () => {
  const notes = [note("rest-left", 48, 0, 1, "left"),
    ...[70, 72, 73, 73, 72, 70].map((midi, i) => note(`melody-${i}`, midi, 4 + i * 0.5, 0.4, "right"))];
  const score = piece(notes, 144);
  const fingering = new Map([["rest-left", 1], ...[3, 4, 5, 5, 4, 3].map((f, i) => [`melody-${i}`, f])]);
  const steps = Object.fromEntries(["left", "right"].map(hand => [hand, handTimeline(notes, fingering, hand)]));
  const geometry = { keyWidth: 45, keysHeight: 192, bedHeight: 430 };
  const frames = handMotions(steps, 5, { ...geometry, clock: clockMap(score, 1, null), speed: 1, frozen: false });
  const view = viewOf(geometry);
  const rest = poseHand(new HandRig(TPL.left), frames.left, view);
  for (const name of FINGERS) {
    assert.ok(rest.angles[name].pip < 85 * Math.PI / 180,
      `${name} should not close into a fist while the other hand plays`);
  }
  const thumb = project(rest.pads[0].centre, view), index = project(rest.pads[1].centre, view);
  assert.ok(thumb.x > index.x + geometry.keyWidth * 0.25,
    "The resting left thumb stays visible beside the index");
  checkPose(rest, "left", TPL.left, "resting beside melody");
  const playing = poseHand(new HandRig(TPL.right), frames.right, view);
  for (let i = 0; i < 5; i++) if (playing.fingers[i].down)
    assert.ok(playing.errors[i] < 0.0005, "Melody pad remains on its key");
});

test("a chord can widen and close while its held notes keep their contacts", () => {
  const notes = [note("held-c", 60, 0, 4, "right"), note("held-e", 64, 0, 4, "right"),
    note("wide-c", 72, 2, 1, "right")];
  const score = piece(notes, 90), fingering = new Map([["held-c", 1], ["held-e", 2], ["wide-c", 5]]);
  const steps = { right: handTimeline(notes, fingering, "right"), left: [] };
  for (const [keyWidth, keysHeight] of [[35, 171], [45, 192]]) {
    const geometry = { keyWidth, keysHeight, bedHeight: keysHeight + 220 }, view = viewOf(geometry);
    const rig = new HandRig(TPL.right);
    let held = null;
    for (const beat of [1.875, 2, 2.125, 2.875, 3, 3.125, 3.25]) {
      const frame = handMotions(steps, beat, { ...geometry, clock: clockMap(score, 1, null), speed: 1, frozen: false }).right;
      const solved = poseHand(rig, frame, view, POSTURE, held ? { held, k: 0.4 } : null);
      held = solved.held;
      for (let i = 0; i < 5; i++) if (solved.fingers[i].down)
        assert.ok(solved.errors[i] < 0.0005, `width ${keyWidth}, beat ${beat}, finger ${i + 1}: ${solved.errors[i] * 1000} mm`);
      checkPose(solved, "right", TPL.right, `widening chord ${beat}`);
    }
  }
});
// (Key sizes the stage draws with the hands shown: never shorter than 2.9×
// a key's width — KeyboardGuide's keyCap.)
const SIZES = [
  [24.6, 140],
  [35, 171],
  [45, 166],
  [47, 136],
  [58, 169],
];
const viewFor = (u, kh, left = 0) =>
  viewOf({
    keyWidth: u,
    keysHeight: kh,
    bedHeight: kh + 70,
    stripLeftPx: left,
    viewportWidthPx: 3000,
    topPx: 0,
    dpr: 1,
  });
const motionsAt = (inp, beat, u, kh) =>
  handMotions(inp.steps, beat, {
    keyWidth: u,
    keysHeight: kh,
    bedHeight: kh + 70,
    clock: inp.clock,
    speed: 1,
    frozen: false,
    pedals: [],
  });

// ---- the camera mapping ----------------------------------------------------------------------
test("a point on key k's surface at its contact depth projects onto that key, at every size", () => {
  const KEYS = [21, 23, 48, 60, 61, 66, 70, 84, 99, 108];
  for (const [u, kh] of SIZES)
    for (const left of [0, 210, 517.5]) {
      const view = viewFor(u, kh, left);
      for (const midi of KEYS) {
        const black = isBlack(midi) ? 1 : 0;
        const px = contactDepth(3, black, { keyWidth: u, keysHeight: kh });
        const y = black ? BLACK_RISE : 0;
        const p = new THREE.Vector3(
          keyCentre(midi) * KEY_W,
          y,
          depthAt(px, y, view),
        );
        const s = project(p, view);
        assert.ok(
          Math.abs(s.x - (keyCentre(midi) * u - left)) <= 0.5,
          `${u}/${kh} key ${midi}: x ${s.x}`,
        );
        assert.ok(
          Math.abs(s.y - px) <= 0.5,
          `${u}/${kh} key ${midi}: y ${s.y} vs ${px}`,
        );
      }
    }
});

test("the teaching camera keeps its angle across layouts and maps compact key depth", () => {
  for (const [u, kh] of [...SIZES, [20, 130], [68, 198], [58, 169], [68, 136]]) {
    const view = viewFor(u, kh);
    assert.equal(view.deg, 76, `${u}/${kh}: ${view.deg}°`);
    assert.ok(view.squash >= 0.38 && view.squash <= 1, `${u}/${kh}: squash ${view.squash}`);
    if (view.squash > 0.38 && view.squash < 1)
      assert.ok(Math.abs(view.keyLen - SQUASH.minKeyLen) < 1e-9, `${u}/${kh}: key length ${view.keyLen}`);
    // (The scene's keys are exactly as long as the drawn keys need.)
    assert.ok(Math.abs(view.keyLen * view.sy * view.sin - kh) < 1e-9);
  }
});

test("Sunny Day's wide keys do not halve the fingers' apparent length", () => {
  // The rejected frame had a depth/width scale of .502. Check an equal-sized
  // anatomical segment along/across the hand at that actual keyboard zoom,
  // along with the dense-score and revised contextual zooms.
  for (const u of [53.88461538461539, 38, 35.025]) {
    const view = viewFor(u, 171);
    const origin = project(new THREE.Vector3(), view);
    const across = project(new THREE.Vector3(0.04, 0, 0), view);
    const along = project(new THREE.Vector3(0, 0, 0.04), view);
    assert.ok((along.y - origin.y) / (across.x - origin.x) > 0.95,
      `${u}px keys compress the hand silhouette`);
  }
});

test("a long finger on its key in a posed hand is drawn exactly on that key", () => {
  for (const [u, kh] of SIZES) {
    const view = viewFor(u, kh, 120);
    for (const [name, beat] of [
      ["five", 3.5],
      ["octave", 3.5],
      ["twinkle", 4],
    ]) {
      const inp = inputs(PASSAGES[name]);
      const both = motionsAt(inp, beat, u, kh);
      for (const hand of ["left", "right"]) {
        if (!both[hand]) continue;
        const s = poseHand(RIG[hand], both[hand], view, POSTURE);
        both[hand].motion.fingers.forEach((f, i) => {
          // (The index, middle and ring fingers play their keys' centres; the
          // thumb and the little finger play on their sides, a little in.)
          if (f.state !== "down" || i === 0 || i === 4) return;
          const pad = s.pads[i];
          const label = `${name} ${u}/${kh} ${hand} ${i + 1}`;
          const bottom = project(
            pad.centre.clone().setY(pad.centre.y - pad.r),
            view,
          );
          const contact = project(pad.contact, view);
          // Across: on its key's centre.
          assert.ok(
            Math.abs(bottom.x - (f.x * u - 120)) <= 0.5,
            `${label}: x ${bottom.x} vs ${f.x * u - 120}`,
          );
          // In depth: where the pad meets the key, drawn at the engine's
          // contact on a white key (the key's dip, a few mm, aside) and
          // further in on a black key (the hand comes in over the black
          // keys), on the black key's top either way.
          assert.ok(
            Math.abs(bottom.y - contact.y) <= 0.5,
            `${label}: pad ${bottom.y} vs contact ${contact.y}`,
          );
          if (f.black > 0.5)
            assert.ok(
              contact.y <= f.contact + 0.5 &&
                contact.y >= 0 &&
                contact.y <= 0.63 * kh,
              `${label}: black-key contact ${contact.y} vs ${f.contact}`,
            );
          else
            assert.ok(
              Math.abs(contact.y - f.contact) <=
                0.5 + 0.004 * view.s * view.cos,
              `${label}: y ${contact.y} vs ${f.contact}`,
            );
        });
      }
    }
  }
});

// ---- the IK ----------------------------------------------------------------------------------
const within = (v, [lo, hi]) => v >= lo - 1e-6 && v <= hi + 1e-6;
function checkPose(s, hand, tpl, label) {
  // Every joint within the hand's hardest ranges.
  for (const f of FINGERS) {
    const a = s.angles[f];
    assert.ok(
      within(a.mcp, STRAINED.mcp) &&
        within(a.pip, STRAINED.pip) &&
        within(a.dip, STRAINED.dip) &&
        within(a.abd, STRAINED.spread[f]),
      `${label} ${hand} ${f}: ${JSON.stringify(a)}`,
    );
  }
  const t = s.angles.thumb;
  assert.ok(
    within(t.flex, STRAINED.cmcFlex) &&
      within(t.abd, STRAINED.cmcAbd) &&
      within(t.mcp, STRAINED.thumbMcp),
    `${label} ${hand} thumb: ${JSON.stringify(t)}`,
  );
  // No bone stretches.
  for (const [joint, parent] of Object.entries(PARENT)) {
    if (!parent) continue;
    const posed = s.world.get(joint).p.distanceTo(s.world.get(parent).p);
    const bind = tpl.bind.get(joint).p.distanceTo(tpl.bind.get(parent).p);
    assert.ok(
      Math.abs(posed - bind) < 1e-7,
      `${label} ${hand} ${joint}: ${posed} vs ${bind}`,
    );
  }
}

test("every fingertip on its key is within 0.5 mm of it, joints within their ranges, bones rigid", () => {
  for (const [name, score] of Object.entries(PASSAGES)) {
    const inp = inputs(score);
    for (const [u, kh] of SIZES) {
      const view = viewFor(u, kh);
      for (let beat = 0; beat <= score.duration; beat += 0.25) {
        const both = motionsAt(inp, beat, u, kh);
        for (const hand of ["left", "right"]) {
          if (!both[hand]) continue;
          const s = poseHand(RIG[hand], both[hand], view, POSTURE);
          both[hand].motion.fingers.forEach((f, i) => {
            if (f.state === "down")
              assert.ok(
                s.errors[i] <= 0.0005,
                `${name} ${u}/${kh} beat ${beat} ${hand} ${i + 1}: ${(s.errors[i] * 1000).toFixed(2)} mm`,
              );
          });
          checkPose(s, hand, TPL[hand], `${name} ${u}/${kh} beat ${beat}`);
        }
      }
    }
  }
});

test("where a held key and the next chord pull the hand apart, or the thumb passes under at full reach, a fingertip misses by less than 2 mm", () => {
  // (Known limits of a rigid hand on the engine's timing: a chord still held
  // in its last tenth of a second while the next one lands, and a scale's
  // thumb under the palm at its longest reach.)
  const harder = {
    triads: piece([
      ...chord([60, 64, 67], "right", 0),
      ...chord([62, 65, 69], "right", 2),
      ...chord([64, 67, 72], "right", 4),
      ...chord([48, 52, 55], "left", 0),
      ...chord([53, 57, 60], "left", 2),
    ]),
    scale: piece(
      [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84].map((m, i) =>
        note(`s${i}`, m, i * 0.5, 0.5, "right"),
      ),
      90,
    ),
  };
  for (const [name, score] of Object.entries(harder)) {
    const inp = inputs(score);
    for (const [u, kh] of SIZES) {
      const view = viewFor(u, kh);
      for (let beat = 0; beat <= score.duration; beat += 0.125) {
        const both = motionsAt(inp, beat, u, kh);
        for (const hand of ["left", "right"]) {
          if (!both[hand]) continue;
          const s = poseHand(RIG[hand], both[hand], view, POSTURE);
          both[hand].motion.fingers.forEach((f, i) => {
            if (f.state === "down")
              assert.ok(
                s.errors[i] < 0.002,
                `${name} ${u}/${kh} beat ${beat} ${hand} ${i + 1}: ${(s.errors[i] * 1000).toFixed(2)} mm`,
              );
          });
          checkPose(s, hand, TPL[hand], `${name} ${u}/${kh} beat ${beat}`);
        }
      }
    }
  }
});

test("posing is deterministic: the same motion gives the same hand, in a fresh rig too", () => {
  const fresh = new HandRig(prepareTemplate(RAW.right, POSTURE));
  const inp = inputs(PASSAGES.twinkle);
  const view = viewFor(45, 166);
  for (const beat of [0, 1.3, 4, 7.75, 12.5]) {
    const a = motionsAt(inp, beat, 45, 166).right;
    const b = motionsAt(inp, beat, 45, 166).right;
    assert.deepEqual(b.motion, a.motion);
    const first = poseHand(RIG.right, a, view, POSTURE);
    const again = poseHand(RIG.right, b, view, POSTURE);
    const other = poseHand(fresh, a, view, POSTURE);
    for (const [joint, t] of first.world) {
      for (const s of [again, other]) {
        const u = s.world.get(joint);
        assert.ok(
          u.p.distanceTo(t.p) < 1e-12 &&
            Math.abs(Math.abs(u.q.dot(t.q)) - 1) < 1e-12,
          `beat ${beat} ${joint}`,
        );
      }
    }
  }
});

// ---- the stage layer's helpers --------------------------------------------------------------
test("a motion's signature changes with what the hand shows, not with clocks it no longer reads", () => {
  const inp = inputs(PASSAGES.five);
  const m = motionsAt(inp, 3.5, 45, 166).right.motion;
  const sig = motionSignature(m);
  assert.equal(motionSignature(structuredClone(m)), sig);
  assert.equal(motionSignature(null), "-");
  const moved = structuredClone(m);
  moved.palm.x += 0.01;
  assert.notEqual(motionSignature(moved), sig);
  const pressed = structuredClone(m);
  pressed.fingers[2].press = (pressed.fingers[2].press || 0) + 0.05;
  assert.notEqual(motionSignature(pressed), sig);
  // (A finger held a while longer looks the same, once it has settled.)
  const settled = structuredClone(m);
  for (const f of settled.fingers) if (f.heldFor != null) f.heldFor = 1;
  const held = structuredClone(settled);
  for (const f of held.fingers) if (f.heldFor != null) f.heldFor += 5;
  held.t += 5;
  held.beat += 5;
  assert.equal(motionSignature(held), motionSignature(settled));
  // (… but one only just landed is still settling into the hand.)
  const landing = structuredClone(settled);
  landing.fingers.find((f) => f.heldFor != null).heldFor = 0.05;
  assert.notEqual(motionSignature(landing), motionSignature(settled));
});

test("the stage geometry covers the visible strip, its pixel ratio capped at 2", () => {
  const g = stageGeometry(
    { keyWidth: 35, keysHeight: 171, bedHeight: 225, left: 210, width: 1402 },
    3,
  );
  assert.deepEqual(g, {
    keyWidth: 35,
    keysHeight: 171,
    bedHeight: 225,
    stripLeftPx: 210,
    viewportWidthPx: 1402,
    topPx: 0,
    dpr: DPR_MAX,
  });
  assert.equal(
    stageGeometry(
      { keyWidth: 35, keysHeight: 171, bedHeight: 225, width: 900 },
      0.5,
    ).dpr,
    1,
  );
});

test("three.js loads lazily: the stage imports no 3-D code until there are hands to show", () => {
  const layer = fs.readFileSync(
    new URL("../src/hands3d-layer.mjs", import.meta.url),
    "utf8",
  );
  const stage = fs.readFileSync(
    new URL("../src/KeyboardGuide.jsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    layer,
    /^\s*import\s[^;]*from\s+["'](three|\.\/hand3d(-rig)?\.mjs)["']/m,
  );
  assert.match(layer, /import\(["']\.\/hand3d\.mjs["']\)/);
  assert.doesNotMatch(stage, /from\s+["'](three|\.\/hand3d(-rig)?\.mjs)["']/);
});

test("the hand models ship with the app and their conversion is credited", async () => {
  const root = new URL("../", import.meta.url);
  const { build } = JSON.parse(
    fs.readFileSync(new URL("package.json", root), "utf8"),
  );
  // (Vite copies public/ into dist/, which the desktop package includes.)
  assert.ok(build.files.includes("dist/**/*"));
  assert.ok(build.files.includes("docs/THIRD_PARTY_NOTICES.md"));
  const notices = fs.readFileSync(
    new URL("docs/THIRD_PARTY_NOTICES.md", root),
    "utf8",
  );
  const provenance = JSON.parse(fs.readFileSync(
    new URL("public/models/hands/PROVENANCE.json", root), "utf8"));
  assert.match(notices, /public\/models\/hands\/PROVENANCE\.json/);
  assert.equal(provenance.license.spdx, "MIT");
  for (const hand of ["left", "right"]) {
    const bytes = fs.readFileSync(
      new URL(`public/models/hands/${hand}.glb`, root),
    );
    const sha = createHash("sha256").update(bytes).digest("hex");
    const output = provenance.outputs.find(x => x.file === `${hand}.glb`);
    assert.equal(output?.sha256, sha, `${hand}.glb is not the credited conversion`);
    assert.equal(output?.bytes, bytes.length);
  }
  assert.ok(fs.existsSync(new URL("public/models/hands/LICENSE-MRTK.md", root)));
  assert.match(notices, /Mixed Reality Toolkit/);
  assert.match(notices, /MIT License/);
  assert.match(notices, /three\.js\*\* 0\.186\.1/);
  assert.match(notices, /Permission is hereby granted, free of charge/);
});

test("easing over frames never pulls a finger off its key, and settles on the exact pose", () => {
  const scale = piece(
    [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79].map((m, i) =>
      note(`s${i}`, m, i * 0.5, 0.5, "right"),
    ),
    90,
  );
  const inp = inputs(scale);
  const view = viewFor(45, 166);
  const k = 1 - Math.exp(-1 / 60 / 0.024);
  let held = null;
  let jumpsPure = 0,
    jumpsEased = 0,
    lastPure = null,
    lastEased = null;
  const travel = (a, b) =>
    Math.max(
      ...[...a.world.keys()].map((j) =>
        a.world.get(j).p.distanceTo(b.world.get(j).p),
      ),
    );
  for (let t = 0; t < 7; t += 1 / 60) {
    const fr = motionsAt(inp, (t * 90) / 60, 45, 166).right;
    if (!fr) continue;
    const pure = poseHand(RIG.right, fr, view, POSTURE);
    const eased = poseHand(
      RIG.right,
      fr,
      view,
      POSTURE,
      held ? { held, k } : null,
    );
    held = eased.held;
    const down = fr.motion.fingers.map((f) => f.state === "down");
    const worst = (s) => Math.max(0, ...s.errors.filter((_, i) => down[i]));
    assert.ok(
      worst(eased) <= worst(pure) + 0.00015,
      `t ${t.toFixed(3)}: eased ${(worst(eased) * 1000).toFixed(2)} mm vs ${(worst(pure) * 1000).toFixed(2)} mm`,
    );
    checkPose(eased, "right", TPL.right, `eased t ${t.toFixed(3)}`);
    if (lastPure && travel(pure, lastPure) > 0.006) jumpsPure++;
    if (lastEased && travel(eased, lastEased) > 0.006) jumpsEased++;
    lastPure = pure;
    lastEased = eased;
  }
  assert.ok(
    jumpsEased <= jumpsPure,
    `eased ${jumpsEased} big steps vs ${jumpsPure}`,
  );
  // The music standing still: the eased hand comes to rest on the pure pose.
  const still = motionsAt(inp, 3.1, 45, 166).right;
  const target = poseHand(RIG.right, still, view, POSTURE);
  let s = poseHand(
    RIG.right,
    motionsAt(inp, 2.6, 45, 166).right,
    view,
    POSTURE,
  );
  for (let i = 0; i < 60; i++)
    s = poseHand(RIG.right, still, view, POSTURE, { held: s.held, k });
  for (const [joint, w] of target.world)
    assert.ok(s.world.get(joint).p.distanceTo(w.p) < 1e-5, `${joint} settles`);
});

// ---- the hands' posture ------------------------------------------------------------------------
const octaves = () =>
  piece([...chord([60, 72], "right", 0), ...chord([43, 55], "left", 0)]);
test("an octave's free fingers fan open over the keys between it, each clear of the next", () => {
  const inp = inputs(octaves());
  for (const [u, kh] of SIZES) {
    const view = viewFor(u, kh);
    const both = motionsAt(inp, 1, u, kh);
    for (const hand of ["left", "right"]) {
      const s = poseHand(RIG[hand], both[hand], view, POSTURE);
      const x = s.pads.map((p) => project(p.centre, view).x / u);
      const label = `${u}/${kh} ${hand}`;
      // (Fingers 2–4 free, between the thumb and the little finger.)
      assert.deepEqual(
        both[hand].motion.fingers.map((f) => f.state === "down"),
        [true, false, false, false, true],
        label,
      );
      for (const i of [1, 2, 3])
        assert.ok(
          (x[i] - x[0]) * (x[4] - x[i]) > 0,
          `${label}: finger ${i + 1} at ${x[i]} is not between ${x[0]} and ${x[4]}`,
        );
      for (const i of [1, 2])
        assert.ok(
          Math.abs(x[i + 1] - x[i]) >= 0.6,
          `${label}: fingers ${i + 1} and ${i + 2} only ${Math.abs(x[i + 1] - x[i]).toFixed(2)} keys apart`,
        );
    }
  }
});

test("the thumb and the little finger play curved — the little finger on its tip, the hand leaning toward it", () => {
  for (const [name, score] of [
    ["five", PASSAGES.five],
    ["octave", octaves()],
    ["twinkle", PASSAGES.twinkle],
  ]) {
    const inp = inputs(score);
    for (const [u, kh] of SIZES) {
      const view = viewFor(u, kh);
      for (let beat = 0; beat <= score.duration; beat += 0.5) {
        const both = motionsAt(inp, beat, u, kh);
        for (const hand of ["left", "right"]) {
          if (!both[hand]) continue;
          const fs5 = both[hand].motion.fingers;
          const s = poseHand(RIG[hand], both[hand], view, POSTURE);
          const label = `${name} ${u}/${kh} beat ${beat} ${hand}`;
          if (fs5[0].state === "down") {
            // The MRTK thumb has a different bind-frame orientation from the
            // former mesh. Keep a visible bend (>10°), rather than requiring
            // the former model's 16° comfortable-solver floor in all poses.
            assert.ok(
              s.angles.thumb.mcp >= (10 * Math.PI) / 180 &&
                s.angles.thumb.ip >= POSTURE.thumbIp.base - 1e-9,
              `${label}: thumb ${JSON.stringify(s.angles.thumb)}`,
            );
          }
          if (fs5[4].state === "down") {
            assert.ok(
              s.angles.pinky.pip >= LIMITS.pipDown.pinky - 0.01,
              `${label}: little finger's middle joint ${s.angles.pinky.pip}`,
            );
            // (Its side of the hand lower: the right hand turns about its
            // length one way, the left the other.)
            const toward = hand === "right" ? -s.roll : s.roll;
            // A contact-constrained octave may settle effectively level;
            // a quarter degree is below a visible lean at this scale.
            assert.ok(toward >= -Math.PI / 720, `${label}: roll ${s.roll}`);
          }
        }
      }
    }
  }
});

test("a hand in flight lets its free fingers hang, curled more than on the keys", () => {
  const five = piece(
    [60, 62, 64, 65, 67].map((m, i) => note(`r${i}`, m, i * 0.5, 0.5, "right")),
  );
  const inp = inputs(five);
  for (const [u, kh] of SIZES) {
    const view = viewFor(u, kh);
    const ground = motionsAt(inp, 0.25, u, kh).right;
    const lifted = structuredClone(ground);
    lifted.motion.palm.lift = 0.9;
    const a = poseHand(RIG.right, ground, view, POSTURE);
    const b = poseHand(RIG.right, lifted, view, POSTURE);
    const curl = (s, f) => s.angles[f].mcp + s.angles[f].pip + s.angles[f].dip;
    const free = FINGERS.filter((f, k) => ground.motion.fingers[k + 1].state !== "down");
    assert.ok(free.length >= 3, `${u}/${kh}: ${free}`);
    const more = free.reduce((sum, f) => sum + curl(b, f) - curl(a, f), 0) / free.length;
    assert.ok(more >= (8 * Math.PI) / 180, `${u}/${kh}: ${((more * 180) / Math.PI).toFixed(1)}° more`);
    checkPose(b, "right", TPL.right, `lifted ${u}/${kh}`);
  }
});

// ---- what ships with the models ------------------------------------------------------------------
test("the skin maps are baked from the shipped models, at the bake's current version", () => {
  const root = new URL("../", import.meta.url);
  const meta = JSON.parse(
    fs.readFileSync(new URL("public/models/hands/skin-maps.json", root), "utf8"),
  );
  assert.equal(meta.version, BAKE_VERSION);
  assert.deepEqual(meta.geometry, HAND_RENDER_GEOMETRY,
    "map geometry must match runtime subdivision and sculpt strength");
  for (const hand of ["left", "right"]) {
    const model = fs.readFileSync(new URL(`public/models/hands/${hand}.glb`, root));
    assert.equal(meta.models?.[hand], createHash("sha256").update(model).digest("hex"),
      `${hand} skin maps must be rebaked when the shipped model changes`);
  }
  for (const hand of ["left", "right"])
    for (const kind of ["n", "d"]) {
      const png = fs.readFileSync(
        new URL(`public/models/hands/${hand}-skin-${kind}.png`, root),
      );
      // (PNG: 8-bit RGBA at the bake's size.)
      assert.equal(png.readUInt32BE(16), meta.size, `${hand}-${kind} width`);
      assert.equal(png.readUInt32BE(20), meta.size, `${hand}-${kind} height`);
      assert.equal(png[24], 8);
      assert.equal(png[25], 6);
    }
  const notices = fs.readFileSync(new URL("docs/THIRD_PARTY_NOTICES.md", root), "utf8");
  assert.match(notices, /skin-n\.png/);
});

test("a hand prepared off the main thread arrives whole, and poses as one prepared here", () => {
  const data = prepareHandData(RAW.right, POSTURE, HAND_RENDER_GEOMETRY);
  // (As postMessage carries it.)
  const { msg } = serialise(data);
  const back = deserialise(structuredClone(msg));
  for (const k of ["position", "normal", "uv", "joints", "weights", "index"])
    assert.deepEqual(Array.from(back.tpl[k]), Array.from(data.tpl[k]), k);
  for (const [name, b] of data.tpl.bind) {
    const c = back.tpl.bind.get(name);
    assert.ok(c.p.distanceTo(b.p) < 1e-15 && Math.abs(Math.abs(c.q.dot(b.q)) - 1) < 1e-12, name);
  }
  assert.deepEqual(Array.from(back.tangent), Array.from(data.tangent));
  assert.deepEqual(Array.from(back.attrs.colors), Array.from(data.attrs.colors));
  const view = viewFor(45, 166);
  const fr = motionsAt(inputs(PASSAGES.five), 3.5, 45, 166).right;
  const a = poseHand(new HandRig(back.tpl), fr, view, POSTURE);
  const b = poseHand(RIG.right, fr, view, POSTURE);
  for (const [joint, t] of b.world) assert.ok(a.world.get(joint).p.distanceTo(t.p) < 1e-12, joint);
});

test("without WebGL the stage keeps its 2-D hands: one warning, no retrying in a loop", async () => {
  const warn = console.warn;
  const warns = [];
  console.warn = (...a) => warns.push(String(a[0]));
  const fakeBox = () => ({
    hidden: true,
    parentElement: null,
    style: { setProperty() {}, removeProperty() {} },
    append() {},
  });
  const g = { keyWidth: 45, keysHeight: 166, bedHeight: 236, left: 0, width: 900 };
  try {
    const motions = motionsAt(inputs(PASSAGES.five), 1, 45, 166);
    const a = createHandsLayer(fakeBox(), { base: "file:///nonexistent/hands/" });
    assert.equal(a.update(motions, g), false);
    for (let i = 0; i < 200 && a.state !== "failed"; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(a.state, "failed");
    assert.equal(a.update(motions, g), false);
    // (A stage mounted again finds the hands already failed: no new attempt.)
    const b = createHandsLayer(fakeBox(), { base: "file:///nonexistent/hands/" });
    assert.equal(b.update(motions, g), false);
    assert.equal(b.state, "failed");
    a.dispose();
    b.dispose();
    assert.equal(warns.filter((w) => /realistic hands unavailable/.test(w)).length, 1);
  } finally {
    console.warn = warn;
  }
});

test("the cue layout's screen geometry: distances to the hands' capsules", async () => {
  const { internals } = await import("../src/hand3d.mjs");
  const cap = (ax, ay, bx, by, r) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, r });
  assert.equal(internals.segDist(5, 3, cap(0, 0, 10, 0, 1)), 3);
  assert.equal(internals.segDist(-4, 3, cap(0, 0, 10, 0, 1)), 5);
  // (Apart, touching, crossing.)
  assert.ok(Math.abs(internals.capsuleGap(cap(0, 0, 10, 0, 1), cap(0, 5, 10, 5, 1)) - 3) < 1e-9);
  assert.ok(internals.capsuleGap(cap(0, 0, 10, 0, 1), cap(0, 2, 10, 2, 1)) <= 1e-9);
  assert.ok(internals.capsuleGap(cap(0, 0, 10, 10, 1), cap(0, 10, 10, 0, 1)) < 0);
});

// ---- round 3: the fade, the overlap, the nails, the renderer's life ------------------------

test("the hand remains opaque and is clipped at the visible stage boundary", async () => {
  const { LOOK, screenFadeLength } = await import("../src/hand3d.mjs");
  for (const hand of ["left", "right"]) {
    const attrs = skinAttributes(TPL[hand], RIG[hand], LOOK);
    assert.ok(LOOK.wristFade[0] > Math.max(...attrs.fade), "no internal forearm dissolve");
  }
  for (const keys of [102,147,166,190]) {
    const shown = visibleBed({top:100,height:300,keys,clips:[100+keys+80]});
    assert.equal(shown, keys+80);
    const view=viewOf(stageGeometry({keyWidth:40,keysHeight:keys,bedHeight:shown,left:0,width:1400},2));
    assert.equal(screenFadeLength(view),0);
    // Lab callers may still explicitly request the old diagnostic fade.
    assert.ok(screenFadeLength(view,28)>=28);
  }
});

// (A left hand that has played a figure and waits for its next bass note,
// lingering where the right hand now takes the figure over — Moonlight's
// bar 60.)
const handover = (() => {
  const notes = [];
  [[52, 0], [56, 1 / 3], [61, 2 / 3]].forEach(([m, b], i) => notes.push(note(`l${i}`, m, b, 1 / 3, "left")));
  notes.push(note("lb", 44, 4, 1, "left"));
  for (let bar = 0; bar < 3; bar++) [[56, 0], [61, 1 / 3], [64, 2 / 3]].forEach(([m, d], i) => notes.push(note(`r${bar}-${i}`, m, 1 + bar + d, 1 / 3, "right")));
  return piece(notes, 54);
})();

test("a hand that only waits where the other plays slides aside, deterministically: the two never drawn as one, the playing hand and every finger on a key untouched", async () => {
  const { screenCapsules, internals } = await import("../src/hand3d.mjs");
  const inp = inputs(handover);
  const view = viewFor(45, 166);
  let resolved = 0;
  for (let beat = 1; beat <= 2.75; beat += 0.25) {
    const both = motionsAt(inp, beat, 45, 166);
    const raw = { left: poseHand(RIG.left, both.left, view), right: poseHand(RIG.right, both.right, view) };
    const caps = (hand, s) => screenCapsules(RIG[hand], s, view);
    const gap = (a, b) => Math.min(...a.flatMap((s) => b.map((t) => internals.capsuleGap(s, t))));
    // (As the engine plans it, the waiting left hand lies over the right.)
    assert.ok(gap(caps("left", raw.left), caps("right", raw.right)) < 0, `beat ${beat}: the hands meet as planned`);
    const need = overlapNeed(caps("left", raw.left), caps("right", raw.right), 6) / view.u;
    const sep = handSeparation(both.left.motion, both.right.motion, { need });
    assert.deepEqual(sep, handSeparation(both.left.motion, both.right.motion, { need }));
    // (The right hand plays: it stays; the left makes way toward the bass.)
    assert.equal(sep.right, 0, `beat ${beat}`);
    assert.ok(sep.left < -1, `beat ${beat}: slid ${sep.left}`);
    const slid = slidMotion(both.left, sep.left);
    both.left.motion.fingers.forEach((f, i) => {
      if (f.state === "down" || f.exact) assert.equal(slid.motion.fingers[i].x, f.x);
      else assert.ok(Math.abs(slid.motion.fingers[i].x - (f.x + sep.left)) < 1e-12);
    });
    const after = poseHand(RIG.left, slid, view);
    if (gap(caps("left", after), caps("right", raw.right)) >= 0) resolved++;
    // (The right hand's fingers on their keys, exactly.)
    both.right.motion.fingers.forEach((f, i) => {
      if (f.state === "down") assert.ok(raw.right.errors[i] < 5e-4);
    });
  }
  assert.ok(resolved >= 7, `apart in ${resolved} of 8 frames`);
  // (Two hands that both play are left as the engine has them.)
  const both = motionsAt(inputs(PASSAGES.five), 3, 45, 166);
  const busy = handSeparation(both.left.motion, both.right.motion, { need: 3 });
  assert.equal(busy.left, 0);
  assert.equal(busy.right, 0);
});

test("every digit has a nail: a plate on the back of its last phalanx, just proud of the skin, running to its tip", () => {
  for (const hand of ["left", "right"]) {
    const rig = RIG[hand];
    for (const d of ["thumb", ...FINGERS]) {
      const g = nailGeometry(TPL[hand], rig, d);
      assert.ok(g, `${hand} ${d}`);
      const pad = rig.pads[d];
      let zMin = Infinity,
        zMax = -Infinity,
        ySum = 0;
      for (let i = 0; i < g.position.length; i += 3) {
        zMin = Math.min(zMin, g.position[i + 2]);
        zMax = Math.max(zMax, g.position[i + 2]);
        ySum += g.position[i + 1];
      }
      // (On the back of the digit — above its pad's centre — over the last
      // half of its last phalanx, its free edge just past the tip.)
      assert.ok(ySum / (g.position.length / 3) > pad.c.y + 0.4 * pad.r, `${hand} ${d}: on the back`);
      assert.ok(zMin < pad.end && zMin > pad.end - 0.00025, `${hand} ${d}: short free edge ${zMin} vs tip ${pad.end}`);
      assert.ok(zMax > pad.end + 0.35 * pad.len && zMax < pad.end + 0.6 * pad.len, `${hand} ${d}: base`);
      // (Its normals face out of the back of the digit.)
      let up = 0;
      for (let i = 1; i < g.normal.length; i += 3) up += g.normal[i];
      assert.ok(up > 0, `${hand} ${d}: facing out`);
    }
  }
});

test("the fitted cuffs close around the wrist, have finite outward normals and leave the rig unchanged", () => {
  for (const hand of ["left", "right"]) {
    const tpl = TPL[hand], rig = RIG[hand];
    const before = tpl.position.slice();
    const g = cuffGeometry(tpl, rig);
    assert.equal(g.joint, "wrist");
    assert.ok(g.position.every(Number.isFinite));
    assert.ok(g.normal.every(Number.isFinite));
    assert.ok(g.index.every(i => i < g.position.length / 3));
    for (let r = 0; r < 12; r++) {
      const a = new THREE.Vector3().fromArray(g.position, r * 65 * 3);
      const b = new THREE.Vector3().fromArray(g.position, (r * 65 + 64) * 3);
      assert.ok(a.distanceTo(b) < 1e-8, `${hand} cuff seam row ${r}`);
    }
    assert.deepEqual(tpl.position, before);
  }
});

test("worker preparation respects the supplied sculpt, subdivision and skin colours", () => {
  const look = { sculpt: 0.45, subdivide: 2, colors: { skin: "#f0c9b2", tip: "#efb9a6" } };
  const worker = prepareHandData(RAW.right, POSTURE, look);
  const direct = prepareHandData(RAW.right, POSTURE, look, { sculpt: 0.45, subdivide: 2 });
  assert.deepEqual(worker.tpl.position, direct.tpl.position);
  assert.deepEqual(worker.attrs.colors, direct.attrs.colors);
  assert.equal(worker.attrs.tone.skin, "#f0c9b2");
  const simple = prepareHandData(RAW.right, POSTURE, {}, { subdivide: 1, sculpt: 1 });
  assert.ok(worker.tpl.position.length > simple.tpl.position.length);
});

// A stand-in for WebGL and the renderer (hand3d.mjs) for the stage layer's
// life: a context that can be lost and restored, a renderer that throws
// when made on a lost context (as three.js does).
function fakeGL() {
  const gl = {
    lost: false,
    listeners: {},
    builds: 0,
    isContextLost: () => gl.lost,
    getExtension: () => null,
    getParameter: () => "fake",
  };
  gl.canvas = {
    className: "",
    style: {},
    parentElement: null,
    setAttribute() {},
    addEventListener: (type, fn) => (gl.listeners[type] = fn),
    removeEventListener() {},
    remove() {},
    getContext: () => gl,
  };
  const hands = () => ({
    view: null,
    dirty: false,
    lastRings: [],
    renderer: { getContext: () => gl, info: { memory: {}, programs: [] } },
    setKeyboardGeometry(g) {
      return (this.view = viewOf(g));
    },
    async warm() {
      return !gl.lost;
    },
    clear() {},
    dispose() {},
    setInk() {},
    setRoom() {},
    recommendedRail: () => 0,
    setPoses: () => ({ settling: false, overlap: null }),
    setOpacity() {},
    render() {},
    fingers: () => null,
    diagnostics: () => ({}),
  });
  gl.module = {
    prepareHands: async () => ({}),
    buildHands3D: async () => {
      gl.builds++;
      if (gl.onBuild) gl.onBuild();
      if (gl.lost) throw new TypeError("Cannot read properties of null (reading 'precision')");
      return hands();
    },
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  gl.deps = { importRenderer: async () => gl.module, createCanvas: () => gl.canvas, idle: tick, quiet: tick };
  return gl;
}
const box = () => ({ hidden: true, parentElement: null, style: {}, append() {} });
const until = async (fn, ms = 2000) => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await new Promise((resolve) => setTimeout(resolve, 2));
  return fn();
};

test("a context lost while the renderer is being made is waited out: 2-D meanwhile, the 3-D hands once it is restored — never off for good", async () => {
  sharedRenderer.reset();
  const gl = fakeGL();
  // (Lost just as the renderer is made: three.js throws on a lost context.)
  gl.onBuild = () => {
    if (gl.builds === 1) gl.lost = true;
  };
  const g = { keyWidth: 45, keysHeight: 166, bedHeight: 236, left: 0, width: 900 };
  const motions = motionsAt(inputs(PASSAGES.five), 1, 45, 166);
  const layer = createHandsLayer(box(), { deps: gl.deps });
  try {
    assert.equal(layer.update(motions, g), false);
    assert.ok(await until(() => layer.state === "lost"), `state ${layer.state}`);
    assert.equal(layer.update(motions, g), false);
    assert.equal(sharedRenderer.failed, false);
    gl.lost = false;
    gl.listeners.webglcontextrestored?.();
    assert.ok(await until(() => layer.state === "ready"), `state ${layer.state}`);
    assert.equal(gl.builds, 2);
    assert.equal(layer.update(motions, g), true);
    // (Lost again once drawn, and restored: back in place.)
    gl.lost = true;
    gl.listeners.webglcontextlost?.({ preventDefault() {} });
    assert.equal(layer.update(motions, g), false);
    gl.lost = false;
    gl.listeners.webglcontextrestored?.();
    assert.ok(await until(() => layer.state === "ready"));
    assert.equal(layer.update(motions, g), true);
    assert.equal(gl.builds, 2);
  } finally {
    layer.dispose();
    sharedRenderer.reset();
  }
});

test("a stage standing still with its hands hidden gets them ready ahead — never while the music moves — so showing them is instant", async () => {
  sharedRenderer.reset();
  const gl = fakeGL();
  const g = { keyWidth: 45, keysHeight: 166, bedHeight: 236, left: 0, width: 900 };
  const none = { left: null, right: null };
  const layer = createHandsLayer(box(), { deps: gl.deps });
  try {
    // (Playing: nothing loads.)
    for (let t = 0; t <= 3 * PREWARM_AFTER_MS; t += 100) layer.update(none, g, { moving: true, now: t });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(gl.builds, 0);
    assert.equal(sharedRenderer.state, "idle");
    // (Standing still a moment: made ready, off screen.)
    for (let t = 0; t <= PREWARM_AFTER_MS + 100; t += 100) layer.update(none, g, { moving: false, now: 10000 + t });
    assert.ok(await until(() => sharedRenderer.state === "ready"), sharedRenderer.state);
    assert.equal(gl.builds, 1);
    // (Hands on: the 3-D hands in the very first frame.)
    assert.equal(layer.update(motionsAt(inputs(PASSAGES.five), 1, 45, 166), g), true);
  } finally {
    layer.dispose();
    sharedRenderer.reset();
  }
});

test("requested hands prepare their GPU alongside the score worker without presenting a stale pose", async () => {
  sharedRenderer.reset();
  const gl = fakeGL(), target = box();
  const g = { keyWidth: 45, keysHeight: 166, bedHeight: 236, left: 0, width: 900 };
  const none = { left: null, right: null };
  const layer = createHandsLayer(target, { deps: gl.deps });
  try {
    assert.equal(layer.update(none, g, { preparing: true, moving: true }), false);
    assert.ok(await until(() => layer.state === "ready"), layer.state);
    assert.equal(gl.builds, 1, "the requested GPU is warmed while the score plan is pending");
    layer.update(none, g, { preparing: true, moving: true });
    assert.equal(target.hidden, true, "no old hand pose is presented without an exact score plan");
    assert.equal(layer.update(motionsAt(inputs(PASSAGES.five), 1, 45, 166), g), true);
    assert.equal(target.hidden, false);
    assert.equal(gl.builds, 1);
  } finally { layer.dispose(); sharedRenderer.reset(); }
});
