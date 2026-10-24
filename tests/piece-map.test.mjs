import test from "node:test";
import assert from "node:assert/strict";
import { pieceOutline, outlinePaths } from "../src/piece-map.mjs";

const score = {
  duration: 8,
  notes: [
    { midi: 60, beat: 0, duration: 1, hand: "right" },
    { midi: 67, beat: 0, duration: 1, hand: "right" },
    { midi: 48, beat: 0, duration: 4, hand: "left" },
    { midi: 72, beat: 6, duration: 2, hand: "right" },
  ],
};

test("the outline keeps each hand's lowest and highest pitch per slice", () => {
  const o = pieceOutline(score, 8);
  assert.equal(o.columns, 8);
  assert.deepEqual(o.right[0], { lo: 60, hi: 67 });
  assert.equal(o.right[2], null);
  assert.deepEqual(o.right[7], { lo: 72, hi: 72 });
  // A held note fills every slice it sounds in.
  assert.deepEqual(
    o.left.slice(0, 5).map((c) => c && c.lo),
    [48, 48, 48, 48, null],
  );
  assert.equal(o.low, 46);
  assert.equal(o.high, 74);
  assert.equal(pieceOutline(score, 8), o, "outlines are cached per score");
});

test("ribbon paths are closed shapes inside the box", () => {
  const paths = outlinePaths(pieceOutline(score, 8), 800, 100);
  for (const hand of ["right", "left"]) {
    assert.match(paths[hand], /^M[\d.,L]+Z/);
    for (const [, x, y] of paths[hand].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      assert.ok(+x >= 0 && +x <= 800, `x ${x}`);
      assert.ok(+y >= -2 && +y <= 102, `y ${y}`);
    }
  }
  // Two separate right-hand passages make two shapes.
  assert.equal(paths.right.split("M").length - 1, 2);
});

test("an empty score still has a sensible range and no shapes", () => {
  const o = pieceOutline({ duration: 4, notes: [] }, 10);
  assert.ok(o.high > o.low);
  const paths = outlinePaths(o, 100, 20);
  assert.equal(paths.right, "");
  assert.equal(paths.left, "");
});
