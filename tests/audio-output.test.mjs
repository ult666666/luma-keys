import test from "node:test";
import assert from "node:assert/strict";
import { getAudioOutput, OUTPUT_LEVELS } from "../src/audio-output.js";

function context() {
  const nodes = [];
  const create = () => {
    const node = {
      connections: [],
      connect(target) {
        this.connections.push(target);
      },
    };
    for (const name of [
      "gain",
      "threshold",
      "knee",
      "ratio",
      "attack",
      "release",
    ])
      node[name] = { value: 0 };
    nodes.push(node);
    return node;
  };
  return {
    nodes,
    destination: {},
    createGain: create,
    createDynamicsCompressor: create,
    createWaveShaper: create,
  };
}

test("piano, backing, and recording can share one final destination without duplicate paths", () => {
  const ctx = context();
  const first = getAudioOutput(ctx);
  assert.equal(getAudioOutput(ctx), first);
  assert.equal(getAudioOutput(ctx), first);
  assert.equal(
    ctx.nodes.filter((node) => node.connections.includes(ctx.destination))
      .length,
    1,
  );
  const other = getAudioOutput(context());
  assert.notEqual(other, first);
  assert.notEqual(other.input, first.input);
});

test("the emergency guard is linear below the reserved ceiling and never amplifies peaks", () => {
  const { guard } = getAudioOutput(context());
  let previous = -Infinity;
  for (let i = 0; i < guard.curve.length; i++) {
    const x = (i / (guard.curve.length - 1)) * 2 - 1;
    const y = guard.curve[i];
    assert.ok(Number.isFinite(y) && Math.abs(y) < 1);
    assert.ok(y >= previous);
    assert.ok(Math.abs(y) <= Math.abs(x) + 1e-7);
    if (Math.abs(x) <= OUTPUT_LEVELS.guard) assert.equal(y, x);
    previous = y;
  }
  assert.equal(guard.curve[(guard.curve.length - 1) / 2], 0);
});
