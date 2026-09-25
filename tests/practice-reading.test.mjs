import test from "node:test";
import assert from "node:assert/strict";
import { groups, parseMusicXML } from "../src/music.mjs";
import {
  practiceGroupAtOrAfter,
  practiceGroupAt,
  stepPracticeBeat,
} from "../src/practice-reading.mjs";

const note = (beat, duration = 0.03125, midi = 60, hand = "right") => ({
  beat,
  duration,
  midi,
  hand,
});
const window = { start: 0, end: 4, loop: false };

test("manual reading visits every 1/32-quarter onset in actual MusicXML and selects the same Wait target", () => {
  const xml =
    '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>32</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
    ["C", "D", "E"]
      .map(
        (step) =>
          `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>128th</type></note>`,
      )
      .join("") +
    "</measure></part></score-partwise>";
  const score = parseMusicXML(xml);
  const attacks = groups(score.notes);
  assert.deepEqual(
    attacks.map((g) => g.beat),
    [0, 0.03125, 0.0625],
  );
  let beat = 0;
  beat = stepPracticeBeat(attacks, beat, 1, window);
  assert.equal(beat, 0.03125);
  beat = stepPracticeBeat(attacks, beat, 1, window);
  assert.equal(beat, 0.0625);
  assert.equal(practiceGroupAtOrAfter(attacks, beat).notes[0].midi, 64);
  assert.equal(
    practiceGroupAt(attacks, beat),
    practiceGroupAtOrAfter(attacks, beat),
  );
  assert.equal(stepPracticeBeat(attacks, beat, -1, window), 0.03125);
});

test("floating-point noise matches one chord without accepting or skipping a nearby distinct attack", () => {
  const attacks = groups([
    note(1, 1, 60),
    note(1.0000000002, 0.5, 64),
    note(1.03125, 0.5, 67),
  ]);
  assert.equal(attacks[0].notes.length, 2);
  assert.equal(practiceGroupAt(attacks, 1.0000004), attacks[0]);
  assert.equal(
    practiceGroupAt(attacks, 1.005),
    undefined,
    "5ms of quarter-note time is not the same onset",
  );
  assert.equal(practiceGroupAtOrAfter(attacks, 1.005), attacks[1]);
  assert.equal(stepPracticeBeat(attacks, 1.0000004, 1, window), 1.03125);
  assert.equal(stepPracticeBeat(attacks, 1.0312500001, -1, window), 1);
});

test("manual phrase traversal wraps strictly within its onsets and full-score traversal stops at endpoints", () => {
  const attacks = groups([
    note(0),
    note(4.5),
    note(5),
    note(7),
    note(8),
    note(10),
  ]);
  const phrase = { start: 4, end: 8, loop: true };
  assert.equal(
    stepPracticeBeat(attacks, 4, 1, phrase),
    4.5,
    "opening rest is followed by the first phrase attack",
  );
  assert.equal(stepPracticeBeat(attacks, 4.5, -1, phrase), 7);
  assert.equal(stepPracticeBeat(attacks, 7, 1, phrase), 4.5);
  assert.equal(stepPracticeBeat(attacks, 8, -1, phrase), 7);
  assert.equal(stepPracticeBeat(attacks, 8, 1, phrase), 4.5);
  assert.equal(
    stepPracticeBeat(attacks, 0, 1, phrase),
    4.5,
    "position before the phrase enters its first attack",
  );
  assert.equal(
    stepPracticeBeat(attacks, 10, -1, phrase),
    7,
    "position after the phrase enters its last attack",
  );
  assert.equal(stepPracticeBeat(attacks, 0, -1, { start: 0, end: 12 }), 0);
  assert.equal(stepPracticeBeat(attacks, 10, 1, { start: 0, end: 12 }), 12);
  assert.equal(stepPracticeBeat(attacks, 12, -1, { start: 0, end: 12 }), 10);
});

test("empty and carry-only phrases return bounded navigation positions", () => {
  const attacks = groups([note(0, 8)]);
  const phrase = { start: 4, end: 6, loop: true };
  assert.equal(stepPracticeBeat(attacks, 4, 1, phrase), 4);
  assert.equal(stepPracticeBeat(attacks, 4, -1, phrase), 4);
  assert.equal(stepPracticeBeat([], 4, 1, { ...phrase, loop: false }), 6);
  assert.equal(stepPracticeBeat([], 6, -1, { ...phrase, loop: false }), 4);
  assert.equal(practiceGroupAtOrAfter([], 0), undefined);
  assert.equal(practiceGroupAt([], 0), undefined);
});

test("dense score searches keep every distinct onset reachable without mutating groups", () => {
  const attacks = Array.from({ length: 50000 }, (_, i) => ({
    beat: i / 128,
    notes: [note(i / 128)],
  }));
  const range = { start: 0, end: 400 };
  const at = attacks[48000].beat;
  assert.equal(practiceGroupAt(attacks, at), attacks[48000]);
  assert.equal(stepPracticeBeat(attacks, at, 1, range), attacks[48001].beat);
  assert.equal(stepPracticeBeat(attacks, at, -1, range), attacks[47999].beat);
  assert.equal(attacks[48000].beat, at);
});
