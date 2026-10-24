import test from "node:test";
import assert from "node:assert/strict";
import { fingerRingCue, separateFingerRings } from "../src/hand3d-cues.mjs";

const cue = (f, extra = {}) => fingerRingCue({ f, x: 100, y: 100, want: 100, ghost: 0, hidden: false, ...extra }, 10);

test("contact markers distinguish held, upcoming and just-released fingers", () => {
  assert.equal(cue({ state: "down", onKey: true }).style, "filled");
  assert.equal(cue({ state: "ready", onKey: false }).style, "ready");
  assert.equal(cue({ state: "up", onKey: false, number: 0.8 }).style, "ready");
  // Wait mode's exact teaching placement is contact even before playback.
  assert.equal(cue({ state: "ready", onKey: true }).style, "filled");
  assert.equal(cue({ onKey: true }, { hidden: true }).style, "ghost");
});

test("displaced badges point along their own key column without covering the badge", () => {
  assert.deepEqual(cue({ keyX: 100, onKey: true }, { y: 60 }).leader, [{ x: 100, y: 70 }, { x: 100, y: 100 }]);
  assert.deepEqual(cue({ keyX: 100, onKey: true }, { y: 140 }).leader, [{ x: 100, y: 130 }, { x: 100, y: 100 }]);
  assert.equal(cue({ keyX: 100 }, { y: 90 }).leader, null);
  assert.equal(cue({ keyX: null }, { y: 60 }).leader, null);
});

const badge = (hand, finger, x, y, onKey = true) => ({
  hand, x, y, want: y, weight: onKey ? 1 : 0.6, ghost: 0, hidden: false,
  f: { finger, keyX: x, keyBlack: 0, state: onKey ? 'down' : 'ready', onKey },
});
const capsule = (ax, ay, bx, by, r) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, r });
function distanceToCapsule(ring, shape) {
  const dx = shape.b.x - shape.a.x, dy = shape.b.y - shape.a.y;
  const t = Math.max(0, Math.min(1,
    ((ring.x - shape.a.x) * dx + (ring.y - shape.a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ring.x - shape.a.x - t * dx, ring.y - shape.a.y - t * dy) - shape.r;
}
function assertClear(rings, silhouettes, radius) {
  for (const ring of rings) {
    for (const shape of silhouettes[ring.hand === 'left' ? 'right' : 'left'] || [])
      assert.ok(distanceToCapsule(ring, shape) >= radius + 1.5 - 1e-5,
        `${ring.hand} ${ring.f.finger} must stay clear of the other hand`);
    assert.equal(ring.x, ring.f.keyX, 'badge never moves onto another key');
  }
}

test('crossing badge separation cannot push a clear badge back onto the other hand', () => {
  const rings = [badge('left', 2, 100, 48), badge('right', 3, 100, 47)];
  const silhouettes = { left: [], right: [capsule(100, 70, 100, 120, 5)] };
  assertClear(rings, silhouettes, 10);
  // The previous unconstrained pair split moved the left badge down by
  // 11 px to y=59, onto the right hand after it had already been cleared.
  assert.ok(distanceToCapsule({ x: 100, y: 59 }, silhouettes.right[0]) < 11.5);
  separateFingerRings(rings, { radius: 10, bedTop: 0, bedBottom: 180, silhouettes });
  assertClear(rings, silhouettes, 10);
  assert.ok(Math.abs(rings[0].y - rings[1].y) >= 23 - 0.01, 'badges remain separated');
  assert.deepEqual(rings.map(r => [r.f.finger, r.want, fingerRingCue(r, 10).style]),
    [[2, 48, 'filled'], [3, 47, 'filled']], 'finger and contact meaning stay intact');
  const leader = fingerRingCue(rings[1], 10).leader;
  assert.ok(leader, 'the displaced right-hand badge retains its leader');
  assert.deepEqual(leader.at(-1), { x: 100, y: 47 });
  assert.ok(leader.every(p => p.x === 100), 'leader follows the correct key');
});

test('crowded badges respect diagonal, horizontal and point hand silhouettes', () => {
  for (const shape of [
    capsule(80, 80, 120, 120, 5),
    capsule(60, 80, 140, 80, 5),
    capsule(100, 80, 100, 80, 5),
  ]) {
    const rings = [badge('left', 2, 100, 45), badge('left', 3, 105, 47), badge('left', 4, 110, 49, false)];
    const silhouettes = { right: [shape] };
    assertClear(rings, silhouettes, 10);
    separateFingerRings(rings, { radius: 10, bedTop: 0, bedBottom: 180, silhouettes });
    assertClear(rings, silhouettes, 10);
    for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++)
      assert.ok(Math.hypot(rings[i].x - rings[j].x, rings[i].y - rings[j].y) >= 23 - 0.02,
        'roomy layout separates all three badges');
    assert.equal(fingerRingCue(rings[2], 10).style, 'ready');
  }
});

test('tight spaces preserve skin clearance and covered-column cue semantics', () => {
  const silhouettes = { right: [capsule(100, 70, 100, 140, 5)] };
  const rings = [badge('left', 1, 100, 47), badge('right', 2, 100, 46)];
  separateFingerRings(rings, { radius: 10, bedTop: 40, bedBottom: 160, silhouettes });
  assertClear(rings, silhouettes, 10);
  assert.ok(rings.every(r => r.y >= 40 && r.y <= 160), 'no escape beyond the visible bed');
  // If the first pass found no clear location anywhere, retain its explicit
  // fallback rather than inventing contact or moving the badge to a new key.
  const covered = badge('left', 1, 100, 80, false);
  covered.hidden = true;
  const fallback = [covered, badge('right', 2, 100, 81)];
  separateFingerRings(fallback, { radius: 10, bedTop: 0, bedBottom: 180,
    silhouettes: { right: [capsule(100, 0, 100, 180, 30)] } });
  assert.equal(covered.y, 80);
  assert.equal(covered.x, 100);
  assert.equal(fingerRingCue(covered, 10).style, 'ghost');
});

test('unobstructed badge placement keeps the existing weighted spacing', () => {
  const rings = [badge('left', 1, 100, 50), badge('right', 2, 100, 50, false)];
  separateFingerRings(rings, { radius: 10, bedTop: 0, bedBottom: 180 });
  assert.equal(rings[0].y, 50 - 23 * 0.6 / 1.6);
  assert.equal(rings[1].y, 50 + 23 / 1.6);
});

test('bounded crossing layouts never trade key ownership or skin clearance for spacing', () => {
  let state = 245;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let exercised = 0;
  for (let frame = 0; frame < 200; frame++) {
    const silhouettes = Object.fromEntries(['left', 'right'].map(hand => [hand,
      Array.from({ length: 4 }, () => capsule(50 + random() * 80, 70 + random() * 60,
        50 + random() * 80, 70 + random() * 60, 4 + random() * 7))]));
    const rings = Array.from({ length: 5 }, (_, i) =>
      badge(i % 2 ? 'right' : 'left', i + 1, 80 + i * 4, 40 + random() * 15, i % 3 !== 0))
      .filter(ring => silhouettes[ring.hand === 'left' ? 'right' : 'left']
        .every(shape => distanceToCapsule(ring, shape) >= 11.5));
    if (rings.length < 2) continue;
    exercised++;
    const before = rings.map(ring => [ring.hand, ring.f.finger, ring.x, ring.want, ring.f.onKey]);
    separateFingerRings(rings, { radius: 10, bedTop: 0, bedBottom: 180, silhouettes });
    assertClear(rings, silhouettes, 10);
    assert.deepEqual(rings.map(ring => [ring.hand, ring.f.finger, ring.x, ring.want, ring.f.onKey]), before);
  }
  assert.ok(exercised >= 150, 'exercise many initially clear, crowded hand layouts');
});
