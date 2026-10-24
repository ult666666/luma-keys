import test from "node:test";
import assert from "node:assert/strict";
import {
  tempoMap,
  secondsAt,
  beatAtSeconds,
  audibleTransportBeat,
  bpmAt,
  secondsBetween,
  hasTempoChanges,
} from "../src/tempo.mjs";
import { parseMusicXML, tempoList, sustainSpans } from "../src/music.mjs";
import { soundingEnd } from "../src/listen-start.mjs";
import { validatePractice } from "../src/export.mjs";
import { gradePerformance } from "../src/performance.mjs";

const close = (a, b, message) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);

test("a tempo map turns beats into score seconds and back, across changes", () => {
  // Two bars at 120, then 60 from beat 8.
  const score = {
    bpm: 120,
    tempos: [
      { beat: 0, bpm: 120 },
      { beat: 8, bpm: 60 },
    ],
  };
  assert.equal(tempoMap(score).length, 2);
  assert.ok(hasTempoChanges(score));
  close(secondsAt(score, 8), 4, "eight beats at 120");
  close(secondsAt(score, 10), 6, "then two at 60");
  close(beatAtSeconds(score, 6), 10, "inverse after the change");
  close(beatAtSeconds(score, 3), 6, "inverse before it");
  // Before beat 0 (a count-in) the opening tempo holds.
  close(secondsAt(score, -2), -1, "count-in beats");
  close(beatAtSeconds(score, -1), -2, "count-in seconds");
  assert.equal(bpmAt(score, 7.99), 120);
  assert.equal(bpmAt(score, 8), 60);
  // Practice speed scales real time; the map is unchanged.
  close(secondsBetween(score, 6, 10, 2), 1.5, "beats 6–10 at double speed");
  for (const beat of [0, 1.25, 7.9, 8, 8.1, 31])
    close(
      beatAtSeconds(score, secondsAt(score, beat)),
      beat,
      `round trip ${beat}`,
    );
});

test("without tempo changes a score keeps its one tempo", () => {
  const score = { bpm: 90 };
  assert.equal(hasTempoChanges(score), false);
  close(secondsAt(score, 3), 2, "three beats at 90");
  close(beatAtSeconds(score, 2), 3, "and back");
  assert.equal(bpmAt(score, 100), 90);
});

test("audible playback never turns back before a resumed passage or loop", () => {
  const score = { bpm: 144 };
  const transport = { origin: 384, originAt: secondsAt(score, 384), start: 10 };
  for (const time of [9.7, 9.99, 10])
    close(audibleTransportBeat(transport, score, 1, time), 384, "hold bar 193");
  close(
    audibleTransportBeat(transport, score, 1, 10.25),
    384.6,
    "audible advance",
  );
  const loop = { origin: 16, originAt: secondsAt(score, 16), start: 20 };
  close(audibleTransportBeat(loop, score, 1, 19.8), 16, "hold loop start");
});

test("audible playback uses the tempo before a delayed tempo-change boundary", () => {
  const score = {
    bpm: 120,
    tempos: [
      { beat: 0, bpm: 120 },
      { beat: 8, bpm: 60 },
    ],
  };
  const t = { origin: 6, originAt: secondsAt(score, 6), start: 10 };
  close(audibleTransportBeat(t, score, 1, 10.9), 7.8, "still at old tempo");
  close(
    audibleTransportBeat(t, score, 1, 11.2),
    8.2,
    "new tempo after boundary",
  );
  close(
    audibleTransportBeat(t, score, 0.5, 11.8),
    7.8,
    "practice speed applies",
  );
});

test("audible count-in retains negative beats and crosses zero continuously", () => {
  const score = { bpm: 120 };
  const t = { origin: -4, originAt: secondsAt(score, -4), start: 10 };
  close(audibleTransportBeat(t, score, 1, 9.8), -4, "initial count-in");
  close(audibleTransportBeat(t, score, 1, 10.5), -3, "count-in advances");
  close(audibleTransportBeat(t, score, 1, 12.1), 0.2, "first audible note");
});

test("tempo marks become a clean tempo map", () => {
  assert.equal(
    tempoList([{ beat: 0, bpm: 144 }], 144),
    null,
    "one tempo is no map",
  );
  assert.deepEqual(
    tempoList(
      [
        { beat: 0, bpm: 144 },
        { beat: 0, bpm: 144 },
        { beat: 32, bpm: 144 },
        { beat: 616, bpm: 176 },
        { beat: 616, bpm: 180 },
        { beat: 700, bpm: 180 },
      ],
      144,
    ),
    [
      { beat: 0, bpm: 144 },
      { beat: 616, bpm: 180 },
    ],
    "repeats dropped, the last mark at one moment wins",
  );
});

test("MusicXML tempo changes are kept for playback", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>Tempo change</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<direction><direction-type><words>Allegro</words></direction-type><sound tempo="120"/></direction>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>
<measure number="2">
<direction><direction-type><words>Presto</words></direction-type><sound tempo="180"/></direction>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>
</part></score-partwise>`;
  const score = parseMusicXML(xml, "tempo.musicxml");
  assert.equal(score.bpm, 120);
  assert.deepEqual(score.tempos, [
    { beat: 0, bpm: 120 },
    { beat: 4, bpm: 180 },
  ]);
  assert.ok(
    !score.warnings.some((w) => /tempo/i.test(w)),
    "no warning that tempo changes are dropped",
  );
  close(secondsAt(score, 8), 2 + 4 / 3, "one bar at 120, one at 180");
});

test("practice files validate their tempo maps", () => {
  const base = {
    title: "T",
    composer: "C",
    bpm: 100,
    meter: 4,
    notes: [{ id: "a", midi: 60, beat: 0, duration: 1, hand: "right" }],
  };
  const kept = validatePractice({
    ...base,
    tempos: [
      { beat: 0, bpm: 100 },
      { beat: 2, bpm: 140 },
    ],
  });
  assert.deepEqual(kept.tempos, [
    { beat: 0, bpm: 100 },
    { beat: 2, bpm: 140 },
  ]);
  for (const tempos of [
    "fast",
    [{ beat: -1, bpm: 100 }],
    [{ beat: 0, bpm: 5 }],
    [{ beat: 0 }],
  ])
    assert.throws(() => validatePractice({ ...base, tempos }), /tempo/);
});

test("grading uses the timing window of the tempo at each note", () => {
  // At 60 BPM 0.1 beat is 100 ms; at 240 BPM on-time widens to 0.4 beat.
  const expected = [
    { id: "slow", midi: 60, beat: 0, duration: 1, hand: "right" },
    { id: "fast", midi: 62, beat: 8, duration: 1, hand: "right" },
  ];
  const played = [
    { midi: 60, beat: 0.3 },
    { midi: 62, beat: 8.3 },
  ];
  const result = gradePerformance(expected, played, {
    start: 0,
    end: 12,
    secondsPerBeat: (beat) => (beat < 8 ? 1 : 0.25),
  });
  const status = Object.fromEntries(result.notes.map((n) => [n.id, n.status]));
  assert.equal(status.slow, "late", "0.3 beat at 60 BPM is 300 ms late");
  assert.equal(status.fast, "on", "0.3 beat at 240 BPM is 75 ms");
});

test("the sustain pedal holds notes until it lifts", () => {
  const spans = sustainSpans(
    [
      { beat: 0, type: "start" },
      { beat: 4, type: "change" },
      { beat: 6, type: "stop" },
      { beat: 10, type: "sustain" },
    ],
    16,
  );
  assert.deepEqual(spans, [
    { start: 0, end: 4 },
    { start: 4, end: 6 },
    { start: 10, end: 16 },
  ]);
  assert.equal(
    soundingEnd(spans, 1),
    4,
    "released under the pedal: rings to the change",
  );
  assert.equal(soundingEnd(spans, 4.5), 6);
  assert.equal(soundingEnd(spans, 6), 6, "released as the pedal lifts");
  assert.equal(soundingEnd(spans, 8), 8, "no pedal: the written end");
  assert.equal(
    soundingEnd(spans, 12),
    16,
    "a pedal never lifted lasts to the end",
  );
  assert.equal(soundingEnd(undefined, 3), 3);
});
