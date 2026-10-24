import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPerformance,
  characterFor,
  harmonyPedals,
  textureMap,
} from "../src/interpretation.mjs";
import { secondsAt } from "../src/tempo.mjs";

const n = (id, midi, beat, duration = 1, hand = "right", velocity = 0.72) => ({
  id,
  midi,
  beat,
  duration,
  hand,
  velocity,
});
// Eight bars of 4/4: a right-hand melody with a chord under each beat and a
// left-hand bass + arpeggio.
function ballad(extra = {}) {
  const notes = [];
  for (let bar = 0; bar < 8; bar++) {
    const s = bar * 4;
    const bass = bar % 2 ? 43 : 38;
    notes.push(n(`b${bar}`, bass, s, 2, "left"));
    for (let k = 1; k < 8; k++)
      notes.push(n(`a${bar}-${k}`, bass + [7, 12, 16, 19, 16, 12, 7][k - 1], s + k * 0.5, 0.5, "left"));
    for (let beat = 0; beat < 4; beat++) {
      notes.push(n(`m${bar}-${beat}`, 74 + ((bar + beat) % 5), s + beat, beat === 3 ? 1 : 1));
      notes.push(n(`i${bar}-${beat}`, 66, s + beat, 1));
    }
  }
  return {
    title: "Test song",
    composer: "Jay Chou",
    bpm: 76,
    meter: 4,
    measures: 8,
    duration: 32,
    measureStarts: [0, 4, 8, 12, 16, 20, 24, 28],
    measureLengths: Array(8).fill(4),
    notes,
    ...extra,
  };
}

test("characters are tailored to the piece", () => {
  assert.equal(characterFor({ title: "Gymnopédie No. 1", composer: "Erik Satie" }).id, "nocturne");
  assert.equal(characterFor({ title: "Moonlight Sonata · I. Adagio sostenuto", composer: "Beethoven" }).id, "nocturne");
  assert.equal(characterFor({ title: "Prelude in C major · BWV 846", composer: "Bach" }).id, "baroque");
  assert.equal(characterFor({ title: "Appassionata · III", composer: "Beethoven", bpm: 144 }).id, "dramatic");
  assert.equal(characterFor({ title: "龙卷风 · 邓紫棋版", composer: "周杰伦 Jay Chou" }).id, "ballad");
  assert.equal(characterFor({ title: "Start here", composer: "Luma Keys", measures: 4 }).id, "lesson");
  assert.equal(characterFor({ title: "X", composer: "Y", performance: { character: "baroque" } }).id, "baroque");
  // Different pieces really do get different shaping.
  const satie = characterFor({ title: "Gymnopédie" }).profile;
  const bach = characterFor({ title: "BWV 846" }).profile;
  assert.ok(satie.rubato > bach.rubato * 2);
});

test("the melody sings over inner voices and the arpeggio, without changing notes", () => {
  const score = ballad();
  const plan = buildPerformance(score);
  assert.equal(plan.notes.size, score.notes.length);
  let melody = 0,
    inner = 0,
    arpeggio = 0;
  for (const note of score.notes) {
    const v = plan.notes.get(note.id).velocity;
    if (note.id.startsWith("m")) melody += v;
    if (note.id.startsWith("i")) inner += v;
    if (note.id.startsWith("a")) arpeggio += v;
  }
  melody /= 32;
  inner /= 32;
  arpeggio /= 56;
  assert.ok(melody > inner * 1.2, `melody ${melody} over inner ${inner}`);
  assert.ok(melody > arpeggio * 1.15, `melody ${melody} over arpeggio ${arpeggio}`);
  // Loudness moves around but the written average is kept.
  const values = [...plan.notes.values()].map((x) => x.velocity);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(mean - 0.72) < 0.03);
  // No two repeated inner chords are machine-identical.
  assert.ok(new Set(score.notes.filter((x) => x.id.startsWith("i")).map((x) => plan.notes.get(x.id).velocity)).size > 8);
  // The source score is untouched.
  assert.ok(score.notes.every((x) => x.velocity === 0.72 && !("pianoDelay" in x)));
});

test("phrases breathe: the tempo eases at phrase ends and at the final cadence only", () => {
  const score = ballad();
  const plan = buildPerformance(score);
  const shaped = { ...score, tempos: plan.tempos };
  const written = secondsAt(score, 32);
  const played = secondsAt(shaped, 32);
  assert.ok(played > written && played < written * 1.08, `${written} → ${played}`);
  const bpmAtBeat = (b) => plan.tempos.filter((t) => t.beat <= b + 1e-9).at(-1).bpm;
  assert.ok(bpmAtBeat(15.8) < 76 * 0.97, "end of a four-bar phrase slows");
  assert.ok(bpmAtBeat(16.1) > 76 * 0.97, "the next phrase returns to tempo");
  assert.ok(bpmAtBeat(31.8) < bpmAtBeat(15.8), "the final cadence slows most");
  // A steadier curve is available for playing with a generated backing.
  const steady = { ...score, tempos: plan.steadyTempos };
  assert.ok(secondsAt(steady, 32) < played);
  // Written mode is literal.
  assert.equal(plan.tempos.every((t) => t.bpm >= 10 && t.bpm <= 500), true);
});

test("wide chords roll upward and accompaniment trails the melody by a few milliseconds", () => {
  const score = ballad();
  score.notes.push(n("w1", 36, 28, 4, "left"), n("w2", 43, 28, 4, "left"), n("w3", 52, 28, 4, "left"));
  const plan = buildPerformance(score);
  const d = (id) => plan.notes.get(id).delay;
  assert.ok(d("w1") < d("w2") && d("w2") < d("w3"));
  assert.ok(d("w3") < 0.08);
  assert.ok(d("i3-0") > d("m3-0"));
});

test("harmony pedal changes with the bass and leaves rhythmic hit bars dry", () => {
  const hits = [0, 0.25, 1.5, 1.75].flatMap((b, i) => [n(`h${i}`, 38, b, 0.25, "left"), n(`hr${i}`, 69, b, 0.25)]);
  const score = ballad();
  score.notes = [...hits, ...score.notes.filter((x) => x.beat >= 4)];
  const plan = buildPerformance(score);
  assert.ok(plan.pedals.length > 4);
  assert.ok(!plan.pedals.some((p) => p.start < 4), "bar 1 hits stay dry");
  for (let i = 1; i < plan.pedals.length; i++)
    assert.ok(plan.pedals[i].start >= plan.pedals[i - 1].end - 1e-9, "spans never overlap");
  // Each bar gets a change on its bass note.
  for (const bar of [1, 2, 3, 4, 5, 6, 7])
    assert.ok(plan.pedals.some((p) => Math.abs(p.start - (bar * 4 + 0.04)) < 1e-6));
  // Written pedalling is respected.
  const written = harmonyPedals(score, score.notes, { written: [{ start: 8, end: 12 }] });
  assert.ok(written.some((p) => p.start === 8 && p.end === 12));
  assert.ok(!written.some((p) => p.start > 8 && p.start < 12));
});

test("section hints from the score file shape dynamics and backing intensity", () => {
  const score = ballad({
    performance: {
      sections: [
        { from: 1, to: 4, level: 0.8, label: "Verse" },
        { from: 5, to: 8, level: 1.15, label: "Chorus" },
      ],
    },
  });
  const plan = buildPerformance(score);
  const avg = (bars) => {
    const ids = score.notes.filter((x) => bars.includes(Math.floor(x.beat / 4) + 1)).map((x) => x.id);
    return ids.reduce((a, id) => a + plan.notes.get(id).velocity, 0) / ids.length;
  };
  assert.ok(avg([5, 6, 7]) > avg([1, 2, 3]) * 1.2);
  const texture = textureMap(score);
  assert.ok(texture.intensity[5] > texture.intensity[1]);
  assert.equal(plan.phrases[0].first, 1);
  assert.ok(plan.phrases.some((p) => p.first === 5));
});

test("invalid or huge input is safe", () => {
  assert.equal(buildPerformance({}).notes.size, 0);
  assert.equal(buildPerformance(null).notes.size, 0);
  const plan = buildPerformance({ ...ballad(), performance: { sections: [{ from: "x" }], phrases: "no" } });
  assert.ok(plan.notes.size > 0);
});
