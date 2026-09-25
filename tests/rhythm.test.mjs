import test from "node:test";
import assert from "node:assert/strict";
import midiPackage from "@tonejs/midi";
import {
  parseMusicXML,
  parseMIDI,
  demos,
  metronomeEvents,
  countInLength,
  countInNumber,
  meterHint,
} from "../src/music.mjs";
import { validatePractice } from "../src/export.mjs";
const wrap = (body) =>
  `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
const pitch = (step, octave, duration, extra = "") =>
  `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration></note>`;
const score = (beats, type, bars = 2) =>
  parseMusicXML(
    wrap(
      Array.from(
        { length: bars },
        (_, i) =>
          `<measure number="${i + 1}">${i === 0 ? `<attributes><divisions>2</divisions><time><beats>${beats}</beats><beat-type>${type}</beat-type></time></attributes>` : ""}${pitch(
            "C",
            4,
            (String(beats)
              .split("+")
              .reduce((a, b) => a + Number(b), 0) *
              8) /
              type,
          )}</measure>`,
      ).join(""),
    ),
  );

test("6/8 and 9/8 pulse on dotted quarters; count-in speaks the pulse numbers", () => {
  const s = score(6, 8);
  assert.deepEqual(s.meterPulses, [1.5, 1.5]);
  assert.deepEqual(s.measureSignatures, ["6/8", "6/8"]);
  assert.deepEqual(
    metronomeEvents(s, -3.000001, 5.99).map((e) => [e.beat, e.count, e.accent]),
    [
      [-3, 1, true],
      [-1.5, 2, false],
      [0, 1, true],
      [1.5, 2, false],
      [3, 1, true],
      [4.5, 2, false],
    ],
  );
  assert.equal(countInNumber(s, -2), 1);
  assert.equal(countInNumber(s, -0.5), 2);
  assert.equal(meterHint(s), "6/8 · 2 pulses per bar");
  assert.deepEqual(score(9, 8).meterPulses, [1.5, 1.5, 1.5]);
});

test("5/8 keeps eighth-note pulses and accents every fractional bar boundary", () => {
  const s = score(5, 8);
  const events = metronomeEvents(s, -0.000001, 4.99);
  assert.deepEqual(
    events.map((e) => e.beat),
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5],
  );
  assert.deepEqual(
    events.filter((e) => e.accent).map((e) => e.beat),
    [0, 2.5],
  );
  assert.equal(meterHint(s, 3), "5/8 · 5 pulses per bar");
});

test("cut time and explicit additive beat groups retain their written pulses", () => {
  assert.deepEqual(score(2, 2).meterPulses, [2, 2]);
  const s = score("3+2", 8);
  assert.deepEqual(s.meterPulses, [1.5, 1]);
  assert.deepEqual(
    metronomeEvents(s, -0.000001, 4.99).map((e) => e.beat),
    [0, 1.5, 2.5, 4],
  );
  assert.equal(meterHint(s), "3+2/8 · 2 pulses per bar");
});

test("MIDI preserves meter changes for fractional metronome pulses", () => {
  const m = new midiPackage.Midi();
  m.header.timeSignatures.push(
    { ticks: 0, timeSignature: [6, 8] },
    { ticks: 1440, timeSignature: [5, 8] },
  );
  m.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 2640 });
  const s = parseMIDI(m.toArray());
  assert.deepEqual(s.measureStarts, [0, 3]);
  assert.deepEqual(s.measurePulses, [
    [1.5, 1.5],
    [0.5, 0.5, 0.5, 0.5, 0.5],
  ]);
  assert.deepEqual(
    metronomeEvents(s, -0.000001, 5.49).map((e) => [e.beat, e.accent]),
    [
      [0, true],
      [1.5, false],
      [3, true],
      [3.5, false],
      [4, false],
      [4.5, false],
      [5, false],
    ],
  );
  assert.equal(meterHint(s, 3), "5/8 · 5 pulses per bar");
});

test("pickup count-in completes the opening bar and does not falsely accent the pickup", () => {
  const s = parseMusicXML(
    wrap(
      `<measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${pitch("G", 4, 1)}</measure><measure number="1">${pitch("C", 5, 4)}</measure>`,
    ),
  );
  assert.equal(countInLength(s), 3);
  assert.deepEqual(
    metronomeEvents(s, -3.000001, 2).map((e) => [e.beat, e.count, e.accent]),
    [
      [-3, 1, true],
      [-2, 2, false],
      [-1, 3, false],
      [0, 4, false],
      [1, 1, true],
      [2, 2, false],
    ],
  );
});

test("successive audio scheduling windows never duplicate boundary clicks", () => {
  const s = score(5, 8, 4);
  let from = -0.000001;
  const events = [];
  for (let to = 0.1; to < 9.99; to += 0.1) {
    events.push(...metronomeEvents(s, from, to));
    from = to;
  }
  assert.equal(new Set(events.map((e) => e.beat)).size, events.length);
  assert.equal(events.length, 20);
  assert.deepEqual(
    events.filter((e) => e.accent).map((e) => e.beat),
    [0, 2.5, 5, 7.5],
  );
  assert.deepEqual(metronomeEvents(s, 4, 3), []);
});

test("cross-staff chords retain simultaneous pitches and flag ambiguous hands", () => {
  const s = parseMusicXML(
    wrap(
      `<measure number="1"><attributes><divisions>2</divisions><staves>2</staves><time><beats>6</beats><beat-type>8</beat-type></time></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>80</per-minute></metronome></direction-type></direction>${pitch("A", 3, 1, "<voice>1</voice><staff>2</staff>")}${pitch("C", 4, 1, "<chord/><voice>1</voice><staff>1</staff>")}${pitch("E", 4, 5, "<voice>1</voice><staff>1</staff>")}</measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => [n.midi, n.beat, n.hand]),
    [
      [57, 0, "left"],
      [60, 0, "right"],
      [64, 0.5, "right"],
    ],
  );
  assert.equal(s.bpm, 120);
  assert.deepEqual(s.meterPulses, [1.5, 1.5]);
  assert.ok(
    s.warnings.some((w) => /moves between staves.*review.*bar 1/i.test(w)),
  );
});

test("pulse metadata survives backup validation; malformed patterns are rejected", () => {
  const s = score(6, 8);
  assert.deepEqual(
    validatePractice(JSON.parse(JSON.stringify(s))).meterPulses,
    [1.5, 1.5],
  );
  for (const bad of [
    { meterPulses: [0, 1] },
    { meterPulses: [Infinity] },
    { meterPulses: ["1"] },
    { measurePulses: [[]] },
    { measurePulses: [[-1], [1]] },
    { measureSignatures: [6, 6] },
  ])
    assert.throws(
      () => validatePractice({ ...s, ...bad }),
      /metronome pattern/,
    );
  const legacy = demos()[0];
  assert.deepEqual(
    metronomeEvents(legacy, -0.000001, 3.99).map((e) => e.beat),
    [0, 1, 2, 3],
  );
});
