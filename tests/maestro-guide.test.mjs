import test from "node:test";
import assert from "node:assert/strict";
import { buildMaestroGuide, maestroPlayingCue } from "../src/maestro-guide.mjs";

const score = (notes) => ({
  notes,
  measures: 3,
  meter: 4,
  duration: 12,
  measureStarts: [0, 4, 8],
  measureLengths: [4, 4, 4],
});
const note = (beat, midi, hand = "right", duration = 1) => ({
  beat,
  midi,
  hand,
  duration,
});
test("guide separates hand scope and does not invent a chord from simultaneous hands", () => {
  const s = score([note(0, 60), note(0, 48, "left"), note(4, 62), note(4, 65)]);
  const g = buildMaestroGuide(s);
  assert.equal(g.get(1).title, "Read the next note");
  assert.equal(g.get(2).title, "Right hand chord");
  assert.equal(buildMaestroGuide(s, "left").has(2), false);
});
test("guide uses real bar starts and handles rests, held bass, black keys and leaps", () => {
  assert.equal(
    buildMaestroGuide(score([note(1, 60)])).get(1).title,
    "Count the opening rest",
  );
  assert.equal(
    buildMaestroGuide(score([note(0, 48, "left", 4), note(1, 60)])).get(1)
      .title,
    "Keep the bass held",
  );
  assert.match(buildMaestroGuide(score([note(0, 61)])).get(1).title, /C♯4/);
  assert.match(
    buildMaestroGuide(score([note(0, 60), note(1, 72)])).get(1).text,
    /C5.*C4/,
  );
});
test("play cues describe written music, not unobserved player accuracy", () => {
  const guide = buildMaestroGuide(score([note(0, 60)]));
  assert.match(maestroPlayingCue({ guide, bar: 1, count: 3 }).title, /3/);
  assert.equal(
    maestroPlayingCue({ guide, bar: 2 }).title,
    "Count through the rest",
  );
  assert.equal(
    maestroPlayingCue({
      guide,
      bar: 1,
      playing: true,
      mode: "listen",
      misses: 4,
    }).title,
    "Read the next note",
  );
  assert.equal(
    maestroPlayingCue({ guide, bar: 1, playing: true, mode: "wait", misses: 4 })
      .title,
    "Check the highlighted keys",
  );
});

test("held notes across bar lines are never described as rests", () => {
  const held = score([note(0, 48, "left", 8)]);
  assert.equal(
    buildMaestroGuide(held).get(2).title,
    "Keep the written notes held",
  );
  assert.equal(buildMaestroGuide(held).has(3), false);
  assert.equal(buildMaestroGuide(held, "right").has(2), false);
  held.notes.push(note(5, 62));
  assert.equal(buildMaestroGuide(held).get(2).title, "Prepare the next entry");
  assert.equal(
    buildMaestroGuide(held, "right").get(2).title,
    "Count the opening rest",
  );
});
