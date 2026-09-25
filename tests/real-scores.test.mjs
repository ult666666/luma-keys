import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseMusicXML,
  barStart,
  measureAt,
  degree,
  solfege,
} from "../src/music.mjs";
const read = (name) =>
  fs.readFileSync(
    new URL(`./fixtures/${name}.musicxml`, import.meta.url),
    "utf8",
  );

test("Explicit closing rests and a final rest-only bar remain in the practice duration", () => {
  const xml =
    '<score-partwise><part-list><score-part id="P"><part-name>Piano</part-name></score-part></part-list><part id="P"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note><note><rest/><duration>3</duration></note></measure><measure number="2"><note><rest measure="yes"/><duration>4</duration></note></measure></part></score-partwise>';
  const s = parseMusicXML(xml);
  assert.equal(s.notes.length, 1);
  assert.equal(s.notes[0].duration, 1);
  assert.deepEqual(s.measureStarts, [0, 4]);
  assert.equal(s.duration, 8);
});

test("Independent Bach export preserves the arpeggio's sustained lower voices and final chord", () => {
  const s = parseMusicXML(read("Bach-Praeludium"));
  const opening = s.notes.filter((n) => n.measure === 1);
  assert.equal(s.measures, 35);
  assert.equal(s.duration, 140);
  assert.deepEqual(
    opening.map((n) => n.midi),
    [60, 64, 67, 72, 76, 67, 72, 76, 60, 64, 67, 72, 76, 67, 72, 76],
  );
  assert.deepEqual(
    opening.filter((n) => n.hand === "left").map((n) => [n.beat, n.duration]),
    [
      [0, 2],
      [0.25, 1.75],
      [2, 2],
      [2.25, 1.75],
    ],
  );
  assert.ok(
    opening.filter((n) => n.hand === "right").every((n) => n.duration === 0.25),
  );
  assert.deepEqual(
    s.notes
      .filter((n) => n.measure === 35)
      .map((n) => [n.midi, n.beat, n.duration]),
    [
      [36, 136, 4],
      [48, 136, 4],
      [64, 136, 4],
      [67, 136, 4],
      [72, 136, 4],
    ],
  );
  assert.ok(s.warnings.some((w) => w.includes("Fermatas")));
});

test("Independent two-part Joplin export retains its final rest and key-change guidance", () => {
  const s = parseMusicXML(read("Joplin-Entertainer"));
  assert.equal(s.measures, 92);
  assert.equal(s.duration, 184);
  assert.equal(barStart(s, 55), 108);
  assert.equal(measureAt(s, 108), 55);
  assert.equal(s.measureLengths.at(-1), 2);
  assert.equal(Math.max(...s.notes.map((n) => n.beat + n.duration)), 183.5);
  assert.deepEqual(
    s.notes.slice(0, 4).map((n) => [n.midi, n.beat]),
    [
      [74, 0],
      [86, 0],
      [76, 0.25],
      [88, 0.25],
    ],
  );
  assert.ok(s.warnings.some((w) => w.includes("keep your selected tonic")));
  // Imported key metadata does not secretly switch the default fixed-Do labels.
  assert.equal(degree(60), "1");
  assert.equal(solfege(60), "Do");
});
