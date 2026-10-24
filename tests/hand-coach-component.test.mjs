import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const compiled = buildSync({
  entryPoints: [
    fileURLToPath(new URL("../src/HandCoach.jsx", import.meta.url)),
  ],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  write: false,
});
const module = { exports: {} };
runInNewContext(compiled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: createRequire(import.meta.url),
});
const HandCoach = module.exports.default;

test("compact hand cues retain each note's full accessible instruction", () => {
  const notes = [
    { id: "held", midi: 60, beat: 0, duration: 4, hand: "right" },
    { id: "new", midi: 65, beat: 1, duration: 1, hand: "right" },
    { id: "left", midi: 48, beat: 0, duration: 4, hand: "left" },
  ];
  const markup = renderToStaticMarkup(
    createElement(HandCoach, {
      notes,
      fingering: new Map([
        ["held", 1],
        ["new", 4],
        ["left", 5],
      ]),
      beat: 1,
      playing: true,
      mode: "listen",
    }),
  );
  assert.equal(
    (markup.match(/class="coach-hand-action"/g) || []).length,
    2,
    "each hand has one shared action phrase rather than one verb per pitch",
  );
  assert.match(
    markup,
    /role="group" data-hand="right"[^>]*aria-label="Right hand"/,
  );
  assert.match(
    markup,
    /role="img"[^>]*aria-label="Hold C4, suggested finger 1, thumb"/,
  );
  assert.match(
    markup,
    /role="img"[^>]*aria-label="Play F4, suggested finger 4, ring"/,
  );
  assert.match(
    markup,
    /role="img"[^>]*aria-label="Hold C3, suggested finger 5, little"/,
  );
  assert.match(markup, /Hold \/ Play/);
  assert.equal((markup.match(/class="coach-action"/g) || []).length, 0);
  assert.match(markup, /aria-label="Finger guide"/);
});

test("a missing fingering remains explicit in a concise cue", () => {
  const markup = renderToStaticMarkup(
    createElement(HandCoach, {
      notes: [{ id: "unknown", midi: 62, beat: 0, duration: 1, hand: "right" }],
      fingering: new Map(),
      beat: 0,
      playing: false,
      mode: "listen",
    }),
  );
  assert.match(markup, /aria-label="Place D4, no finger suggestion"/);
  assert.match(markup, /class="coach-unassigned">choose finger/);
  assert.doesNotMatch(markup, /class="coach-finger"/);
});

test("paused repeated chords show one voicing per hand and an accessible repeat cue", () => {
  const shape = [
    ["left", 46, 4],
    ["left", 55, 1],
    ["right", 64, 1],
    ["right", 70, 4],
  ];
  const notes = [0, 0.5].flatMap((beat) =>
    shape.map(([hand, midi, finger]) => ({
      id: `${hand}-${midi}-${beat}`,
      hand,
      midi,
      finger,
      beat,
      duration: 0.5,
    })),
  );
  const markup = renderToStaticMarkup(
    createElement(HandCoach, {
      notes,
      fingering: new Map(notes.map((n) => [n.id, n.finger])),
      beat: 0,
      playing: false,
      mode: "listen",
      flats: true,
      score: { bpm: 144 },
    }),
  );
  for (const [, midi] of shape) {
    assert.equal(
      (markup.match(new RegExp(`data-midi="${midi}"`, "g")) || []).length,
      1,
    );
  }
  assert.equal((markup.match(/data-repeat="true"/g) || []).length, 2);
  assert.equal((markup.match(/Next: repeat/g) || []).length, 2);
  assert.doesNotMatch(markup, /Place \/ Next/);
  assert.match(markup, /aria-label="Place B♭2, suggested finger 4, ring"/);
  assert.match(
    markup,
    /aria-label="Next, repeat B♭2 with suggested finger 4, ring; G3 with suggested finger 1, thumb\. Play again at the next attack\."/,
  );
});

test("compact repeat guidance preserves holds and returns to Play at the new attack", () => {
  const notes = [
    { id: "old", midi: 60, hand: "right", beat: 0, duration: 1 },
    { id: "new", midi: 60, hand: "right", beat: 1, duration: 1 },
  ];
  const props = {
    notes,
    fingering: new Map([
      ["old", 1],
      ["new", 1],
    ]),
    playing: true,
    mode: "listen",
    score: { bpm: 60 },
  };
  const held = renderToStaticMarkup(
    createElement(HandCoach, { ...props, beat: 0.5 }),
  );
  assert.match(held, /aria-label="Hold C4, suggested finger 1, thumb"/);
  assert.match(held, /Next: repeat/);
  const attacked = renderToStaticMarkup(
    createElement(HandCoach, { ...props, beat: 1 }),
  );
  assert.match(attacked, /aria-label="Play C4, suggested finger 1, thumb"/);
  assert.doesNotMatch(attacked, /data-repeat/);
  const changed = renderToStaticMarkup(
    createElement(HandCoach, {
      ...props,
      fingering: new Map([
        ["old", 1],
        ["new", 2],
      ]),
      beat: 0.5,
    }),
  );
  assert.match(changed, /aria-label="Hold C4, suggested finger 1, thumb"/);
  assert.match(changed, /aria-label="Next C4, suggested finger 2, index"/);
  assert.doesNotMatch(changed, /data-repeat/);
});

test("a repeated voicing does not erase a hold beside a new attack", () => {
  const notes = [
    { id: "held", midi: 60, hand: "right", beat: 0, duration: 2 },
    { id: "attack", midi: 64, hand: "right", beat: 1, duration: 1 },
    { id: "againC", midi: 60, hand: "right", beat: 2, duration: 1 },
    { id: "againE", midi: 64, hand: "right", beat: 2, duration: 1 },
  ];
  const markup = renderToStaticMarkup(
    createElement(HandCoach, {
      notes,
      fingering: new Map([
        ["held", 1],
        ["attack", 3],
        ["againC", 1],
        ["againE", 3],
      ]),
      beat: 1,
      playing: true,
      mode: "listen",
      score: { bpm: 120 },
    }),
  );
  assert.match(markup, /Hold \/ Play/);
  assert.match(markup, /aria-label="Hold C4, suggested finger 1, thumb"/);
  assert.match(markup, /aria-label="Play E4, suggested finger 3, middle"/);
  assert.match(markup, /Next: repeat/);
  assert.equal((markup.match(/data-midi=/g) || []).length, 2);
});
