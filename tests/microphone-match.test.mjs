import test from "node:test";
import assert from "node:assert/strict";
import {
  microphoneMatches,
  microphoneTargetMessage,
} from "../src/microphone-match.mjs";
import { createMicrophoneDetector } from "../src/microphone-detector.mjs";
import {
  rate,
  silence,
  concatenate,
  synth,
  stream,
} from "./fixtures/microphone/pcm.mjs";

const attack = (notes, expectedMatch = true) => ({
  type: "attack",
  attackId: 1,
  notes,
  expectedMatch,
  confidence: 0.98,
  timeSeconds: 0.36,
  detectedAtSeconds: 0.552,
});

function acousticEvents(played, expected) {
  const detector = createMicrophoneDetector({ sampleRate: rate });
  detector.setExpected(expected);
  return stream(detector, concatenate(silence(0.35), synth(played)));
}

test("Wait accepts an independently detected complete chord as one acoustic attack", () => {
  const expected = [60, 64, 67];
  const events = acousticEvents(expected, expected);
  assert.equal(events.length, 1);
  assert.equal(microphoneMatches(events[0], expected), true);
  // Simultaneous score voices can contain unisons; they represent one physical key.
  assert.equal(microphoneMatches(events[0], [67, 60, 64, 60]), true);
});

test("the boundary rechecks exact pitches even if an upstream match flag is incorrect", () => {
  const expected = [60, 64, 67];
  for (const notes of [
    [60, 64], // omitted key
    [60, 64, 67, 69], // extra key
    [60, 64, 67, 72], // extra octave key, if the detector observes it
    [60, 65, 67], // wrong adjacent key
    [72, 76, 79], // correct pitch classes, wrong octave
    [48, 64, 67], // one key in the wrong octave
  ]) {
    assert.equal(
      microphoneMatches(attack(notes), expected),
      false,
      String(notes),
    );
  }
});

test("separate correct partial chords cannot accumulate into an acoustic Wait hit", () => {
  const expected = [60, 64, 67];
  const partials = [[60], [64], [67], [60, 64]];
  for (const played of partials) {
    const events = acousticEvents(played, expected);
    assert.ok(
      events.length > 0,
      `fixture should be a confident partial ${played}`,
    );
    assert.ok(events.every((event) => !microphoneMatches(event, expected)));
  }
});

test("wrong acoustic notes and octaves never pass the Wait boundary", () => {
  for (const played of [[59], [61], [48], [72]]) {
    const events = acousticEvents(played, [60]);
    assert.ok(events.length > 0);
    assert.ok(events.every((event) => !microphoneMatches(event, [60])));
  }
});

test("a pitch observation without a confirmed matching attack cannot advance", () => {
  for (const event of [
    null,
    undefined,
    { notes: [60] },
    { type: "status", notes: [60], expectedMatch: true },
    { type: "attack", notes: [60] },
    attack([60], false),
    attack([]),
  ])
    assert.equal(microphoneMatches(event, [60]), false);
  assert.equal(microphoneMatches(attack([60]), []), false);
});

test("unsupported acoustic targets explain the practical alternative", () => {
  for (const unsupportedReason of [
    "outside-range",
    "too-many-notes",
    "overlapping-harmonics",
    "ambiguous-harmonics",
  ])
    assert.match(microphoneTargetMessage({ unsupportedReason }), /MIDI/);
  assert.equal(microphoneTargetMessage({ supported: true }), "");
  assert.equal(microphoneTargetMessage(null), "");
});
