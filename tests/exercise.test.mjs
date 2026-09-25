import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  EXERCISE_KEYS,
  METERS,
  generateExercise,
  resolveExercise,
  exerciseXML,
  exerciseRegisters,
  exerciseSummary,
  seededRandom,
} from "../src/exercise.mjs";
import { parseMusicXML, barStart, barEnd } from "../src/music.mjs";
import { validatePractice } from "../src/export.mjs";

const pitchClass = (fifths) => (((fifths * 7) % 12) + 12) % 12;
const barQuarters = (meter) => METERS[meter].pulses.reduce((a, b) => a + b, 0);

test("the same seed and options always engrave the same exercise", () => {
  const a = exerciseXML(resolveExercise({ level: 7, seed: 42 }).config);
  const b = exerciseXML(resolveExercise({ level: 7, seed: 42 }).config);
  assert.equal(a, b);
  assert.notEqual(
    a,
    exerciseXML(resolveExercise({ level: 7, seed: 43 }).config),
  );
  const a9 = seededRandom(9),
    b9 = seededRandom(9);
  assert.deepEqual(
    Array.from({ length: 5 }, () => a9()),
    Array.from({ length: 5 }, () => b9()),
  );
});

test("every level engraves warning-free MusicXML with complete bars, separate hands and a tonic ending", () => {
  for (const level of LEVELS)
    for (let seed = 1; seed <= 12; seed++) {
      const score = generateExercise({ level: level.level, seed });
      const config = score.exercise;
      const label = `level ${level.level} seed ${seed}`;
      assert.deepEqual(score.warnings, [], label);
      assert.equal(score.measures, config.bars, label);
      assert.equal(score.source, "Exercise");
      assert.equal(score.reviewed, true);
      assert.ok(score.xml.includes("<beam") || level.level < 6, label);
      const quarters = barQuarters(config.meter);
      assert.ok(
        Math.abs(score.duration - config.bars * quarters) < 1e-6,
        label,
      );
      for (let bar = 1; bar <= score.measures; bar++)
        assert.ok(
          Math.abs(barEnd(score, bar) - barStart(score, bar) - quarters) < 1e-6,
          label,
        );
      // Nothing was merged away: every written pitch is a practice note.
      assert.equal(
        (score.xml.match(/<pitch>/g) || []).length,
        score.notes.length,
        label,
      );
      const hands = new Set(score.notes.map((n) => n.hand));
      if (config.hands === "both")
        assert.deepEqual([...hands].sort(), ["left", "right"], label);
      else assert.deepEqual([...hands], [config.hands], label);
      const registers = exerciseRegisters(config);
      for (const note of score.notes) {
        const [lo, hi] = registers[note.hand];
        assert.ok(
          note.midi >= lo - 1 && note.midi <= hi + 1,
          `${label}: ${note.hand} ${note.midi} outside ${lo}-${hi}`,
        );
      }
      const right = score.notes.filter((n) => n.hand === "right");
      const left = score.notes.filter((n) => n.hand === "left");
      if (right.length && left.length)
        assert.ok(
          Math.min(...right.map((n) => n.midi)) >
            Math.max(...left.map((n) => n.midi)),
          label,
        );
      const melody = (config.hands === "left" ? left : right).filter(
        (n) => n.beat + n.duration >= score.duration - 1e-6,
      );
      assert.ok(melody.length >= 1, label);
      const finalPitch = melody[0].midi % 12;
      const tonic = pitchClass(config.fifths);
      if (level.maxLeap >= 2)
        assert.equal(finalPitch, tonic, `${label} ends on the tonic`);
      else assert.ok([0, 4, 7].includes((finalPitch - tonic + 12) % 12), label);
      const beginCount = (score.xml.match(/<beam number="1">begin/g) || [])
        .length;
      const endCount = (score.xml.match(/<beam number="1">end/g) || []).length;
      assert.equal(beginCount, endCount, label);
      if (!level.accidentals)
        assert.ok(!score.xml.includes("<accidental>"), label);
      validatePractice(score);
    }
});

test("step-only levels move by step or repeat, and leaps recoil", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const score = generateExercise({ level: 1, seed });
    const melody = score.notes.filter((n) => n.hand === "right");
    for (let i = 1; i < melody.length; i++)
      assert.ok(
        Math.abs(melody[i].midi - melody[i - 1].midi) <= 2,
        `seed ${seed}`,
      );
    assert.ok(melody.every((n) => n.midi >= 60 && n.midi <= 67));
  }
  const wide = generateExercise({ level: 8, seed: 3 });
  const melody = wide.notes.filter((n) => n.hand === "right");
  assert.ok(
    melody.some((n, i) => i && Math.abs(n.midi - melody[i - 1].midi) >= 7),
    "sixths occur",
  );
});

test("higher levels introduce eighths, accidentals, 6/8 and left-hand patterns", () => {
  const eighths = generateExercise({ level: 6, seed: 2 });
  assert.ok(eighths.notes.some((n) => n.duration === 0.5));
  let accidentals = 0;
  for (let seed = 1; seed <= 10; seed++)
    if (generateExercise({ level: 11, seed }).xml.includes("<accidental>"))
      accidentals++;
  assert.ok(
    accidentals >= 3,
    "chromatic neighbors appear regularly at level 11",
  );
  const compound = generateExercise({ level: 10, seed: 1, meter: "6/8" });
  assert.deepEqual(compound.meterPulses, [1.5, 1.5]);
  assert.equal(compound.meter, 3);
  const chords = generateExercise({ level: 9, seed: 5, meter: "4/4" });
  const leftOnsets = new Map();
  for (const n of chords.notes.filter((n) => n.hand === "left"))
    leftOnsets.set(n.beat, (leftOnsets.get(n.beat) || 0) + 1);
  assert.ok(
    [...leftOnsets.values()].every((count) => count === 3),
    "block triads",
  );
  const broken = generateExercise({ level: 10, seed: 6, meter: "4/4" });
  assert.ok(
    broken.notes
      .filter((n) => n.hand === "left" && n.measure < broken.measures)
      .every((n) => n.duration <= 1),
  );
  const sixteenths = generateExercise({ level: 12, seed: 2 });
  assert.ok(sixteenths.notes.some((n) => n.duration === 0.25));
  assert.ok(sixteenths.xml.includes('<beam number="2">'));
});

test("custom options override the level defaults and stay within supported values", () => {
  const score = generateExercise({
    level: 3,
    seed: 11,
    fifths: -2,
    hands: "left",
    bars: 16,
    meter: "3/4",
    tempo: 100,
    range: "octave",
    rhythm: ["eighth"],
    rests: false,
  });
  assert.equal(score.measures, 16);
  assert.equal(score.bpm, 100);
  assert.equal(score.keySignature.fifths, -2);
  assert.equal(score.tonic, 10);
  assert.deepEqual(score.measureSignatures[0], "3/4");
  assert.ok(score.notes.every((n) => n.hand === "left"));
  assert.equal(
    exerciseSummary(score.exercise),
    "B♭ major · 3/4 · 16 bars · left hand · ♩ = 100",
  );
  const clamped = resolveExercise({
    level: 99,
    tempo: 999,
    bars: 7,
    meter: "7/8",
    fifths: 12,
  }).config;
  assert.equal(clamped.level, 12);
  assert.equal(clamped.tempo, 200);
  assert.equal(clamped.bars, 12);
  assert.ok(Object.keys(METERS).includes(clamped.meter));
  assert.equal(clamped.fifths, 7);
  assert.ok(EXERCISE_KEYS.some((k) => k.fifths === 0));
});

test("flat keys are spelled with flats and re-parse identically", () => {
  const score = generateExercise({
    level: 8,
    seed: 4,
    fifths: -2,
    meter: "4/4",
  });
  assert.ok(score.xml.includes("<alter>-1</alter>"));
  assert.ok(!score.xml.includes("<alter>1</alter>"));
  const again = parseMusicXML(score.xml);
  assert.deepEqual(
    again.notes.map((n) => [n.midi, n.beat, n.duration, n.hand]),
    score.notes.map((n) => [n.midi, n.beat, n.duration, n.hand]),
  );
});
