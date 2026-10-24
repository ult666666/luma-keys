import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createMicrophoneDetector,
  microphoneTargetSupport,
  MICROPHONE_LIMITS,
} from "../src/microphone-detector.mjs";
import {
  rate,
  silence,
  concatenate,
  mix,
  normalize,
  synth,
  piano,
  stream,
} from "./fixtures/microphone/pcm.mjs";

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
function observe(
  pcm,
  expected,
  { sampleRate = rate, block = 128, ...options } = {},
) {
  const detector = createMicrophoneDetector({ sampleRate, ...options });
  detector.setExpected(expected);
  const events = stream(
    detector,
    concatenate(silence(0.35, sampleRate), pcm),
    block,
  );
  return { detector, events };
}
function assertHit(events, expected) {
  assert.equal(events.length, 1, JSON.stringify(events));
  assert.deepEqual(events[0].notes, expected);
  assert.equal(events[0].expectedMatch, true);
  assert.ok(events[0].confidence >= 0.78);
  assert.ok(events[0].detectedAtSeconds > events[0].timeSeconds);
}

test("streaming detector accepts arbitrary chunks at 44.1, 48, and 96 kHz", () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const pcm = synth([60], { sampleRate });
    const a = observe(pcm, [60], { sampleRate, block: 128 });
    const b = observe(pcm, [60], { sampleRate, block: 733 });
    assertHit(a.events, [60]);
    assert.deepEqual(a.events, b.events);
  }
});

test("all chromatic C3–C6 fundamentals work with three different harmonic envelopes", () => {
  for (const timbre of [
    [1],
    [1, 0.35, 0.2, 0.1],
    [1, 0.05, 0.55, 0.03, 0.2, 0.01, 0.12],
  ]) {
    for (
      let note = MICROPHONE_LIMITS.minMidi;
      note <= MICROPHONE_LIMITS.maxMidi;
      note++
    ) {
      const { events } = observe(synth([note], { timbre }), [note]);
      assertHit(events, [note]);
    }
  }
});

test("wrong adjacent keys, octaves, and out of range keys never match a requested C4", () => {
  for (const played of [36, 47, 48, 59, 61, 72, 84, 96]) {
    const { events } = observe(synth([played]), [60]);
    assert.ok(
      events.every((event) => !event.expectedMatch),
      `wrong key ${played}: ${JSON.stringify(events)}`,
    );
  }
});

test("score expectations never manufacture an observed pitch from overtones", () => {
  const audio = synth([48], { timbre: [0.3, 1, 0.7, 0.45, 0.2, 0.1] });
  const expectedBass = observe(audio, [48]);
  const expectedHarmonic = observe(audio, [60]);
  assert.deepEqual(
    expectedBass.events.map((e) => e.notes),
    expectedHarmonic.events.map((e) => e.notes),
  );
  assert.ok(expectedHarmonic.events.every((e) => !e.expectedMatch));
  const missingFundamental = observe(
    synth([48], { timbre: [0, 1, 0.7, 0.4, 0.3, 0.1] }),
    [60],
  );
  assert.equal(
    missingFundamental.events.filter((e) => e.expectedMatch).length,
    0,
  );
});

test("thirds and ordinary triads are one exact attack; missing, wrong, and extra independent keys fail", () => {
  for (const notes of [
    [60, 64],
    [48, 52, 55],
    [60, 64, 67],
    [67, 71, 74],
  ]) {
    assertHit(observe(synth(notes), notes).events, notes);
  }
  for (const actual of [[60], [60, 64], [60, 65, 67], [60, 64, 66, 67]]) {
    const { events } = observe(synth(actual), [60, 64, 67]);
    assert.ok(
      events.every((e) => !e.expectedMatch),
      `unexpected ${actual}: ${JSON.stringify(events)}`,
    );
  }
});

test("sustained notes produce one attack; a new strike without silence produces a new ID", () => {
  const held = synth([60], { seconds: 3, decay: 0.5 });
  assertHit(observe(held, [60]).events, [60]);
  const repeated = mix(
    held,
    concatenate(silence(0.6), synth([60], { seconds: 1.5, decay: 0.5 })),
  );
  const { events } = observe(repeated, [60]);
  assert.equal(events.length, 2, JSON.stringify(events));
  assert.ok(events.every((e) => e.expectedMatch));
  assert.ok(events[1].attackId > events[0].attackId);
  assert.ok(events[1].timeSeconds - events[0].timeSeconds > 0.5);
});

test("target update cancels stale confirmation and cannot rearm a ringing key", () => {
  const detector = createMicrophoneDetector({ sampleRate: rate });
  detector.setExpected([61]);
  stream(detector, silence(0.35));
  const held = synth([60], { seconds: 2 });
  assert.equal(stream(detector, held.subarray(0, 0.08 * rate)).length, 0);
  assert.equal(detector.getStatus().pending, true);
  detector.setExpected([60]);
  assert.equal(stream(detector, held.subarray(0.08 * rate)).length, 0);
});

test("reset warms up on an already sounding key, preserves attack IDs, and needs a fresh attack", () => {
  const detector = createMicrophoneDetector({ sampleRate: rate });
  detector.setExpected([60]);
  const held = synth([60], { seconds: 3 });
  const first = stream(
    detector,
    concatenate(silence(0.35), held.subarray(0, rate)),
  );
  assertHit(first, [60]);
  detector.reset();
  assert.equal(detector.getStatus().calibrating, true);
  assert.equal(stream(detector, held.subarray(rate)).length, 0);
  const afterReset = stream(detector, concatenate(silence(0.3), synth([60])));
  assertHit(afterReset, [60]);
  assert.ok(afterReset[0].attackId > first[0].attackId);
});

test("quiet, broadband noise, a click, and invalid PCM do not advance", () => {
  for (const pcm of [
    silence(1),
    synth([], { seconds: 1, noise: 0.06 }),
    Float32Array.from({ length: rate }, (_, i) => (i === 100 ? 0.7 : 0)),
    new Float32Array(rate).fill(NaN),
  ]) {
    assert.equal(observe(pcm, [60]).events.length, 0);
  }
  assert.throws(() => createMicrophoneDetector({ sampleRate: 0 }), RangeError);
  assert.throws(
    () => createMicrophoneDetector({ sampleRate: rate }).process([0]),
    TypeError,
  );
});

test("unsupported targets expose a reason and never report a match", () => {
  for (const [notes, reason] of [
    [[], "no-target"],
    [[47], "outside-range"],
    [[85], "outside-range"],
    [[60, 64, 67, 71], "too-many-notes"],
    [[60, 72], "overlapping-harmonics"],
    [[60, 67], "ambiguous-harmonics"],
  ]) {
    assert.deepEqual(microphoneTargetSupport(notes), {
      supported: false,
      reason,
      notes,
    });
    const { detector, events } = observe(synth([60]), notes);
    assert.equal(detector.getStatus().unsupportedReason, reason);
    assert.ok(events.every((e) => !e.expectedMatch));
  }
});

test(
  "actual bundled piano PCM: C3–C6 sample pitches across soft, middle, and hard velocity layers",
  { skip: !hasFfmpeg },
  () => {
    for (const layer of [1, 10, 16]) {
      for (let note = 48; note <= 84; note += 3) {
        const { events, detector } = observe(
          normalize(piano(note, { layer })),
          [note],
        );
        // The shortest/softest C6 recording is buried in mechanical low-frequency
        // energy by the confirmation window. It must wait, not guess an octave.
        if (layer === 1 && note === 84) {
          assert.equal(events.length, 0, JSON.stringify(events));
        } else {
          assert.equal(
            events.length,
            1,
            `${layer}/${note}: ${JSON.stringify(detector.getStatus())}`,
          );
          assertHit(events, [note]);
        }
      }
    }
  },
);

test(
  "actual piano PCM: real decaying and beating tones never repeatedly advance; restrikes are fresh",
  { skip: !hasFfmpeg },
  () => {
    for (const note of [48, 54, 60, 66, 72, 78, 84]) {
      const held = normalize(piano(note, { seconds: 3 }));
      assertHit(observe(held, [note]).events, [note]);
      const repeated = mix(held, concatenate(silence(0.6), held));
      const { events } = observe(repeated, [note]);
      assert.equal(
        events.length,
        2,
        `repeated ${note}: ${JSON.stringify(events)}`,
      );
      assert.ok(events.every((e) => e.expectedMatch));
    }
  },
);

test(
  "actual piano PCM: complete triads match; omissions, wrong keys, and extra nonharmonic keys fail",
  { skip: !hasFfmpeg },
  () => {
    for (const expected of [
      [48, 52, 55],
      [60, 64, 67],
      [67, 71, 74],
    ]) {
      const correct = normalize(mix(...expected.map((n) => piano(n))));
      assertHit(observe(correct, expected).events, expected);
      for (const played of [
        expected.slice(0, 2),
        [expected[0], expected[1] + 1, expected[2]],
        [...expected, expected[0] + 2],
      ]) {
        const audio = normalize(mix(...played.map((n) => piano(n))));
        const { events } = observe(audio, expected);
        assert.ok(
          events.every((e) => !e.expectedMatch),
          `actual ${played} expected ${expected}: ${JSON.stringify(events)}`,
        );
      }
    }
  },
);

test(
  "actual piano reset during a ringing tone never makes string beating a fresh strike",
  { skip: !hasFfmpeg },
  () => {
    for (const layer of [1, 10, 16]) {
      for (let note = 48; note <= 84; note += 3) {
        const held = normalize(piano(note, { layer, seconds: 3 }));
        for (const split of [0.1, 0.4, 1]) {
          const detector = createMicrophoneDetector({ sampleRate: rate });
          detector.setExpected([note]);
          stream(
            detector,
            concatenate(silence(0.35), held.subarray(0, rate * split)),
          );
          detector.reset();
          assert.equal(
            stream(detector, held.subarray(rate * split)).length,
            0,
            `reset ${layer}/${note} at ${split}s`,
          );
        }
      }
    }
  },
);
