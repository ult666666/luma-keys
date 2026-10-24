import test from "node:test";
import assert from "node:assert/strict";
import { readingPrep, intervalName } from "../src/reading-prep.mjs";
import { coachingTips, companionLine } from "../src/coaching.mjs";
import { generateExercise } from "../src/exercise.mjs";
import { demos } from "../src/music.mjs";
import { gradePerformance } from "../src/performance.mjs";

test("a generated exercise is summarised by key, meter, range and its tricky spots", () => {
  const score = generateExercise({
    level: 8,
    seed: 3,
    fifths: -2,
    meter: "3/4",
  });
  const prep = readingPrep(score);
  assert.equal(prep.key, "B♭ major");
  assert.equal(prep.signatureText, "2♭");
  assert.equal(prep.signature, "3/4");
  assert.equal(prep.tempo, score.bpm);
  assert.ok(prep.hands.right && prep.hands.left);
  assert.ok(
    prep.hands.right.low.includes("♭") || /[A-G]/.test(prep.hands.right.low),
  );
  assert.equal(prep.flats, true);
  assert.ok(["eighths", "quarters", "sixteenths"].includes(prep.rhythm));
  assert.ok(prep.watch.length >= 1);
  const right = readingPrep(score, "right");
  assert.ok(!right.hands.left, "a single hand hides the other range");
  const chromatic = generateExercise({ level: 11, seed: 8 });
  const chromaticPrep = readingPrep(chromatic);
  assert.ok(
    chromaticPrep.accidentals.count >= 1,
    "level 11 seeds carry accidentals",
  );
  assert.ok(chromaticPrep.watch.some((w) => w.includes("accidental")));
});

test("starter pieces without a key signature are read as C major and leaps are named", () => {
  const twinkle = demos()[0];
  const prep = readingPrep(twinkle);
  assert.equal(prep.key, "C major");
  assert.equal(prep.signature, "4/4");
  assert.deepEqual(prep.hands.right, { low: "C4", high: "A4", count: 42 });
  assert.equal(prep.leap.semitones, 7, "C4 to G4 is a fifth");
  assert.equal(prep.leap.bar, 1);
  assert.ok(prep.watch.some((w) => w.startsWith("A fifth in bar 1")));
  assert.equal(intervalName(9), "sixth");
  assert.equal(intervalName(12), "octave");
  const elise = demos()[3];
  const elisePrep = readingPrep(elise);
  assert.ok(elisePrep.watch.includes("Starts with a pickup"));
  assert.ok(elisePrep.watch.includes("Sixteenth notes"));
});

test("coaching tips name the number they come from", () => {
  const score = { meter: 4, measures: 2, duration: 8 };
  const expected = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({
    id: `n${i}`,
    midi,
    beat: i,
  }));
  const late = gradePerformance(
    expected,
    expected.map((n) => ({ midi: n.midi, beat: n.beat + 0.3 })),
    { score, end: 8, stoppedAt: 8, secondsPerBeat: 0.5 },
  );
  const tips = coachingTips(late, { secondsPerBeat: 0.5 });
  assert.ok(
    tips.some((t) => t.includes("late by about 150 ms")),
    tips.join(" | "),
  );
  const rush = gradePerformance(
    expected,
    expected.map((n) => ({ midi: n.midi, beat: n.beat - 0.3 })),
    { score, end: 8, stoppedAt: 8, secondsPerBeat: 0.5 },
  );
  assert.ok(coachingTips(rush)[0].includes("rush"));
  const missed = gradePerformance(
    expected,
    [
      { midi: 60, beat: 0 },
      { midi: 62, beat: 1 },
    ],
    {
      score,
      end: 8,
      stoppedAt: 8,
      secondsPerBeat: 0.5,
    },
  );
  assert.ok(
    coachingTips(missed).some((t) =>
      /Bar \d: \d+ missed notes\. Repeat this bar at a slower speed/.test(t),
    ),
  );
  const clean = gradePerformance(
    expected,
    expected.map((n) => ({ midi: n.midi, beat: n.beat })),
    { score, end: 8, stoppedAt: 8, secondsPerBeat: 0.5 },
  );
  assert.ok(
    coachingTips(clean, { nextLevelReady: true })[0].includes("next level"),
  );
  assert.ok(coachingTips(clean, { speed: 0.75 })[0].includes("75%"));
  const stopped = gradePerformance(expected, [{ midi: 60, beat: 0 }], {
    score,
    end: 8,
    stoppedAt: 2.5,
    secondsPerBeat: 0.5,
  });
  assert.ok(coachingTips(stopped)[0].includes("Keep going"));
  assert.ok(coachingTips(clean).length <= 3);
  assert.deepEqual(coachingTips(null), []);
});

test("the companion speaks in short, situation-aware lines", () => {
  assert.equal(companionLine({ playing: true }), null);
  assert.ok(
    companionLine({ firstRun: true, name: "Mochi" }).startsWith(
      "Mochi · Start with Level 1 in Exercises.",
    ),
  );
  assert.ok(
    companionLine({ mode: "perform" }).includes(
      "Enable Count me in for a count-in.",
    ),
  );
  assert.ok(
    companionLine({ result: { accuracy: 0.96, precision: 0.8 } }).includes(
      "96%",
    ),
  );
  assert.ok(
    companionLine({ result: { accuracy: 0.6, precision: 0.2 } }).includes(
      "Lower the speed and practice one hand at a time.",
    ),
  );
  assert.ok(companionLine({ streak: 4 }).includes("4-day streak"));
});
