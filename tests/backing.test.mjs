import test from "node:test";
import assert from "node:assert/strict";
import { buildBacking, backingAt } from "../src/backing.mjs";

const n = (id, midi, beat, duration = 1, hand = "left") => ({ id, midi, beat, duration, hand, velocity: 0.8 });
const score = (notes, extras = {}) => ({ title: "Practice score", meter: 4, measures: 4, duration: 16,
  measureStarts: [0, 4, 8, 12], measureLengths: [4, 4, 4, 4], meterPulses: [1, 1, 1, 1], notes, ...extras });
const pitched = (result) => result.events.filter((event) => event.midi != null);
const percussion = (result) => result.events.filter((event) => event.midi == null);

test("auto uses acoustic only for explicit pop metadata; unknown and classical scores stay piano", () => {
  for (const metadata of [{ title: "晴天" }, { title: "Sunny Day · Songbook" }, { title: "龙卷风" }, { composer: "周杰伦" }, { composer: "Jay Chou" }, { composer: "G.E.M." }, { genre: "Pop" }]) {
    assert.equal(buildBacking(score([n("bass", 48, 0)], metadata)).style, "acoustic");
  }
  for (const metadata of [{}, { title: "Appassionata", composer: "Beethoven" }, { title: "Etude", composer: "David Popper" }, { title: "Gemstone" }]) {
    const result = buildBacking(score([n("bass", 48, 0)], metadata));
    assert.equal(result.style, "piano");
    assert.equal(percussion(result).length, 0);
  }
  const unknown = buildBacking(score([n("bass", 48, 0)]), { style: "orchestra" });
  assert.equal(unknown.style, "piano");
  assert.match(unknown.warnings[0], /Unknown backing style/);
});

test("source hand follows practice hand and piano preserves exact written timing and pitches", () => {
  const s = score([n("lh", 47, 0, 2), n("rh", 75, 0.5, 0.75, "right")]);
  for (const hand of ["right", "both"]) {
    const result = buildBacking(s, { style: "piano", hand });
    assert.equal(result.sourceHand, "left");
    assert.deepEqual(result.events.map(({ midi, beat, duration, sourceIds }) => ({ midi, beat, duration, sourceIds })), [{ midi: 47, beat: 0, duration: 2, sourceIds: ["lh"] }]);
  }
  const left = buildBacking(s, { style: "piano", hand: "left" });
  assert.equal(left.sourceHand, "right");
  assert.deepEqual(left.events[0].sourceIds, ["rh"]);
  assert.equal(left.events[0].midi, 75);
  assert.equal(buildBacking(s, { hand: "feet" }).sourceHand, "left");
});

test("unison voices merge to their longest hold and retain every source identity", () => {
  const result = buildBacking(score([n("long", 48, 0, 6), n("short", 48, 0, 1), n("reattack", 48, 8, 1)]), { style: "piano" });
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].duration, 6);
  assert.deepEqual([...result.events[0].sourceIds].sort(), ["long", "short"]);
  assert.equal(new Set(result.events.map((event) => event.id)).size, 2);
  const resumed = backingAt(result.events, 4, 5);
  assert.equal(resumed.index, 1);
  assert.equal(resumed.continuations.length, 1);
  assert.equal(resumed.continuations[0].duration, 1);
  assert.equal(backingAt(result.events, 6, 16).continuations.length, 0);
});

test("acoustic guitar uses source pitches, bass follows the harmony in octaves and never invents chords", () => {
  const s = score([n("a", 53, 0, 0.5), n("b", 59, 0.5, 0.5), n("c", 54, 1, 3), n("d", 62, 1, 3), n("melody", 79, 0, 2, "right")], { tonic: 0, keySignature: { fifths: 0 } });
  const result = buildBacking(s, { style: "acoustic" });
  assert.equal(result.style, "acoustic");
  for (const event of pitched(result)) {
    const source = s.notes.find((note) => event.sourceIds.includes(note.id));
    assert.ok(source);
    assert.equal(source.hand, "left");
    assert.equal(event.midi % 12, source.midi % 12);
    if (event.instrument === "guitar") {
      assert.equal(event.beat, source.beat);
      assert.equal(event.duration, source.duration);
      assert.equal(event.midi, source.midi);
    } else {
      assert.equal(event.instrument, "bass");
      assert.ok((source.midi - event.midi) % 12 === 0 && event.midi <= 50);
      assert.ok(event.duration <= 2 + 1e-9);
    }
  }
  assert.equal(result.events.filter((event) => event.instrument === "guitar").length, 4);
  assert.ok(!result.events.some((event) => event.sourceIds.includes("melody")));
  // One bass per pulse: F at the downbeat, then F-sharp where the bass moves.
  const bass = result.events.filter((event) => event.instrument === "bass");
  assert.deepEqual(bass.map((event) => [event.beat, event.midi % 12]), [[0, 5], [1, 6]]);
});

test("rhythmic hit bars keep the kit and bass on the written stabs", () => {
  const s = score([n("h1", 38, 0, 0.25), n("h2", 38, 0.25, 0.25), n("h3", 38, 1.5, 0.5), n("sus", 50, 4, 4)], { title: "龙卷风" });
  const result = buildBacking(s, { style: "acoustic" });
  const first = result.events.filter((event) => event.beat < 4 && event.instrument !== "guitar");
  assert.deepEqual([...new Set(first.map((event) => event.beat))], [0, 0.25, 1.5]);
  assert.ok(!percussion(result).some((event) => event.beat > 0.25 && event.beat < 1.5), "rests between hits stay silent");
});

test("percussion respects pickup phase, written silence, meter changes and the actual ending", () => {
  const s = score([n("pickup", 48, 0, 0.5), n("after-rest", 50, 4.5, 3), n("compound", 52, 7.5, 3), n("short-final", 53, 10.5, 0.5)], {
    duration: 11, measures: 5, pickup: 0.5,
    measureStarts: [0, 0.5, 4.5, 7.5, 10.5], measureLengths: [0.5, 4, 3, 3, 0.5],
    measurePulses: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1], [1.5, 1.5], [1, 1, 1, 1]],
  });
  const result = buildBacking(s, { style: "acoustic" });
  const drums = percussion(result);
  assert.ok(drums.length > 0);
  assert.ok(drums.every((event) => event.beat >= 0 && event.beat + event.duration <= 11 + 1e-8));
  assert.ok(!drums.some((event) => event.beat >= 0.5 && event.beat < 4.5), "silent bar has no generated kit");
  assert.ok(!drums.some((event) => event.instrument === "kick" && event.beat < 0.5), "pickup does not invent a first-beat accent");
  assert.ok(drums.some((event) => event.instrument === "kick" && event.beat === 7.5));
  assert.ok(drums.some((event) => event.instrument === "snare" && event.beat === 9), "6/8 follows dotted-quarter pulses");
});

test("rests within a bar remain silent, while held notes carry activity into following bars", () => {
  const s = score([n("short", 48, 0, 0.25), n("held", 55, 3, 3)]);
  const result = buildBacking(s, { style: "acoustic" });
  assert.ok(!percussion(result).some((event) => event.beat >= 0.25 && event.beat < 3));
  assert.ok(percussion(result).some((event) => event.beat === 4));
  assert.ok(!percussion(result).some((event) => event.beat >= 6));
  const resumed = backingAt(result.events, 4.05, 5);
  assert.ok(resumed.continuations.length > 0);
  assert.ok(resumed.continuations.every(({ note, duration }) => note.midi != null && duration <= 0.95 + 1e-8), "resume never retriggers a drum tail");
});

test("melody-only scores get no inferred harmony and drums require explicit acoustic selection", () => {
  const s = score([n("melody", 60, 0, 2, "right")], { title: "Sunny Day melody" });
  for (const style of ["auto", "piano", "strings"]) {
    const result = buildBacking(s, { style });
    assert.equal(result.events.length, 0);
    assert.match(result.description, /No left-hand accompaniment/);
  }
  const beat = buildBacking(s, { style: "acoustic" });
  assert.ok(beat.events.length > 0);
  assert.equal(pitched(beat).length, 0);
  assert.match(beat.warnings[0], /percussion only/);
});

test("strings use at most four held written pitches and limit dense attacks", () => {
  const notes = Array.from({ length: 48 }, (_, i) => n(`s${i}`, 36 + (i % 12), Math.floor(i / 6) * 0.125, 2));
  const s = score(notes);
  const result = buildBacking(s, { style: "strings" });
  assert.ok(result.events.length > 0 && result.events.length < notes.length);
  assert.equal(percussion(result).length, 0);
  for (const event of result.events) {
    assert.equal(event.instrument, "strings");
    assert.equal(event.midi, notes.find((note) => event.sourceIds.includes(note.id)).midi);
    assert.ok(result.events.filter((n) => n.beat <= event.beat && n.beat + n.duration > event.beat).length <= 4);
  }
  const short = buildBacking(score([n("short", 48, 0, 0.125)]), { style: "strings" });
  assert.equal(short.events.length, 0);
  assert.match(short.description, /too short/);
});

test("invalid data is omitted or bounded without mutating the source", () => {
  const s = score([n("valid", 48, 15.5, 10), n("outside", 47, 16, 1), n("bad-midi", 120, 0), n("bad-beat", 48, -1), n("bad-duration", 48, 0, Infinity)]);
  const snapshot = structuredClone(s);
  const result = buildBacking(s, { style: "piano" });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].duration, 0.5);
  assert.ok(result.warnings.some((text) => /Invalid written notes/.test(text)));
  assert.deepEqual(s, snapshot);
  assert.deepEqual(buildBacking(null).events, []);
  assert.deepEqual(buildBacking({ notes: [] }, { style: "acoustic" }).events, []);
});

test("50,000-note dense input stays deterministic, bounded and keeps valid event IDs", () => {
  const notes = Array.from({ length: 50_000 }, (_, i) => n(`dense-${i}`, 36 + i % 8, Math.floor(i / 8) / 4, 0.25));
  const s = { title: "Dense study", notes, duration: 1563, meter: 4 };
  const first = buildBacking(s, { style: "acoustic" });
  const second = buildBacking(s, { style: "acoustic" });
  assert.deepEqual(first, second);
  assert.ok(first.events.length >= 50_000 && first.events.length <= 75_000);
  assert.equal(new Set(first.events.map((event) => event.id)).size, first.events.length);
  assert.ok(first.events.every((event, i) => event.velocity > 0 && event.velocity <= 1 && event.beat + event.duration <= s.duration && (!i || first.events[i - 1].beat <= event.beat)));
  const duplicates = buildBacking(score(notes.map((note) => ({ ...note, beat: 0 }))), { style: "piano" });
  assert.equal(duplicates.events.length, 8);
  assert.equal(duplicates.events.reduce((sum, event) => sum + event.sourceIds.length, 0), 50_000);
});
