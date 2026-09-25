import test from "node:test";
import assert from "node:assert/strict";
import {
  degree,
  solfege,
  noteName,
  keyboardLayout,
  parseMusicXML,
  parseMIDI,
  unpackXML,
  demos,
  groups,
  barStart,
  barEnd,
  measureAt,
} from "../src/music.mjs";
import { numberedSheet, validatePractice } from "../src/export.mjs";
import { zipSync, strToU8 } from "fflate";
import midiPackage from "@tonejs/midi";
import { readFileSync } from "node:fs";
const wrap = (body) =>
  `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Test score</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
const note = (step, octave, duration, extra = "") =>
  `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration></note>`;
test("fixed Do, chromatic notes, octaves and movable Do", () => {
  assert.deepEqual(
    [60, 62, 64, 65, 67, 69, 71].map((n) => degree(n)),
    ["1", "2", "3", "4", "5", "6", "7"],
  );
  assert.equal(degree(61), "♯1");
  assert.equal(solfege(60), "Do");
  assert.equal(noteName(72), "C5");
  assert.equal(degree(62, 2), "1");
  assert.equal(degree(60, 2), "♯6");
});
test("88-key layout aligns black keys between white keys", () => {
  const keys = keyboardLayout(21, 108);
  assert.equal(keys.length, 88);
  assert.equal(keys.filter((k) => !k.black).length, 52);
  const c = keys.find((k) => k.midi === 60),
    cs = keys.find((k) => k.midi === 61);
  assert.ok(cs.left > c.left);
  assert.ok(cs.left < c.left + c.width);
  assert.ok(keys.at(-1).left + keys.at(-1).width <= 100.0001);
});
test("voice backup, simultaneous chords, rest, duration and left staff", () => {
  const s = parseMusicXML(
    wrap(
      `<measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note("C", 4, 2)}${note("E", 4, 2, "<chord/>")}<note><rest/><duration>2</duration></note>${note("G", 4, 4)}<backup><duration>8</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><staff>2</staff></note></measure><measure number="2">${note("D", 4, 2)}</measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => [n.midi, n.beat, n.duration, n.hand]),
    [
      [48, 0, 4, "left"],
      [60, 0, 1, "right"],
      [64, 0, 1, "right"],
      [67, 2, 2, "right"],
      [62, 4, 1, "right"],
    ],
  );
  assert.equal(groups(s.notes)[0].notes.length, 3);
  assert.equal(s.title, "Test score");
});
test("ties merge sustained notes and pickup does not add empty beats", () => {
  const s = parseMusicXML(
    wrap(
      `<measure implicit="yes"><attributes><divisions>1</divisions></attributes>${note("C", 4, 1, '<tie type="start"/>')}</measure><measure>${note("C", 4, 2, '<tie type="stop"/>')}${note("D", 4, 2)}</measure>`,
    ),
  );
  assert.equal(s.notes.length, 2);
  assert.equal(s.notes[0].duration, 3);
  assert.equal(s.notes[1].beat, 3);
});
test("MXL container selects root music XML", () => {
  const xml = wrap(`<measure>${note("C", 4, 1)}</measure>`);
  const zip = zipSync({
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>',
    ),
    "score.xml": strToU8(xml),
  });
  assert.equal(unpackXML(zip), xml);
  assert.equal(parseMusicXML(unpackXML(zip)).notes[0].midi, 60);
});
test("invalid and empty scores fail honestly", () => {
  assert.throws(() => parseMusicXML("<broken>"));
  assert.throws(() => parseMusicXML(wrap("<measure/>")), /No playable/);
});
test("MIDI notes retain pitch and quarter-note duration", () => {
  const m = new midiPackage.Midi();
  m.header.setTempo(100);
  m.addTrack().addNote({
    midi: 64,
    ticks: 0,
    durationTicks: 480,
    velocity: 0.8,
  });
  const s = parseMIDI(m.toArray());
  assert.equal(s.notes[0].midi, 64);
  assert.equal(s.notes[0].duration, 1);
  assert.equal(s.bpm, 100);
});
test("lessons have bounded sorted notes and complete durations", () => {
  for (const s of demos()) {
    assert.ok(s.notes.length > 10);
    assert.equal(
      s.duration,
      Math.max(...s.notes.map((n) => n.beat + n.duration)),
    );
    assert.ok(s.notes.every((n) => n.midi >= 21 && n.midi <= 108));
  }
});

// ---- Import accuracy regressions (Claude review, see docs/CLAUDE_REVIEW.md) ----
const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const brief = (s) => s.notes.map((n) => [n.midi, n.beat, n.duration, n.hand]);
const bar44 =
  "<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>";
const has = (s, re) => s.warnings.some((w) => re.test(w));
test("fixture: pickup with a full-bar rest, two parts with different divisions, tie, chords and triplets", () => {
  const s = parseMusicXML(fixture("pickup-two-parts.musicxml"));
  assert.deepEqual(s.measureStarts, [0, 1, 4, 7]);
  assert.equal(s.pickup, 1);
  assert.equal(s.meter, 3);
  assert.equal(s.tonic, 7);
  assert.deepEqual(s.keySignature, { fifths: 1, mode: "major" });
  assert.equal(s.bpm, 96);
  assert.deepEqual(brief(s), [
    [74, 0, 1, "right"],
    [43, 1, 3, "left"],
    [50, 1, 3, "left"],
    [67, 1, 3, "right"],
    [71, 1, 4, "right"],
    [55, 4, 0.333333, "left"],
    [59, 4.333333, 0.333333, "left"],
    [62, 4.666667, 0.333333, "left"],
    [50, 5, 2, "left"],
    [69, 5, 1, "right"],
    [66, 6, 1, "right"],
    [43, 7, 2, "left"],
    [67, 7, 2, "right"],
  ]);
  assert.equal(s.duration, 9);
  assert.equal(groups(s.notes)[1].notes.length, 4);
  assert.ok(
    !has(s, /fewer beats|more beats|different numbers of bars|key signature/i),
    s.warnings.join("\n"),
  );
});
test("chord members share the onset of their voice after backup, even after a rest", () => {
  const s = parseMusicXML(
    wrap(
      `<measure>${bar44}${note("E", 5, 2)}${note("G", 5, 2, "<chord/>")}${note("F", 5, 2)}<backup><duration>4</duration></backup><note><rest/><duration>1</duration><voice>2</voice></note>${note("C", 4, 1, "<voice>2</voice>")}${note("E", 4, 2, "<chord/><voice>2</voice>")}</measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => [n.midi, n.beat]),
    [
      [76, 0],
      [79, 0],
      [60, 1],
      [64, 1],
      [77, 2],
    ],
  );
  assert.equal(s.notes.find((n) => n.midi === 64).duration, 2);
});
test("tie chains across three bars become one held note; untouching ties do not merge", () => {
  const s = parseMusicXML(
    wrap(
      `<measure>${bar44}${note("C", 4, 4, '<tie type="start"/>')}</measure><measure>${note("C", 4, 4, '<tie type="stop"/><tie type="start"/>')}</measure><measure>${note("C", 4, 2, '<tie type="stop"/>')}<note><rest/><duration>1</duration></note>${note("C", 4, 1, '<tie type="stop"/>')}</measure>`,
    ),
  );
  assert.deepEqual(brief(s), [
    [60, 0, 10, "right"],
    [60, 11, 1, "right"],
  ]);
});
test("ties across a voice-number change and between chord members follow pitch", () => {
  const s = parseMusicXML(
    wrap(
      `<measure>${bar44}${note("C", 4, 4, '<tie type="start"/><voice>1</voice>')}${note("E", 4, 4, "<chord/><voice>1</voice>")}</measure><measure>${note("C", 4, 2, '<tie type="stop"/><voice>2</voice>')}${note("E", 4, 2, "<chord/><voice>2</voice>")}${note("D", 4, 2)}</measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => [n.midi, n.beat, n.duration]),
    [
      [60, 0, 6],
      [64, 0, 4],
      [64, 4, 2],
      [62, 6, 2],
    ],
  );
});
test("a transposing part reads its key in concert pitch even when <transpose> follows <key>", () => {
  const s = parseMusicXML(
    wrap(
      `<measure><attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>${note("D", 4, 4)}</measure>`,
    ),
  );
  assert.equal(s.notes[0].midi, 60);
  assert.equal(s.tonic, 0);
  assert.deepEqual(s.keySignature, { fifths: 0, mode: "major" });
  assert.ok(has(s, /concert/));
});
test("a pickup bar whose other staff holds a whole-bar rest still lasts only its played beats", () => {
  const s = parseMusicXML(
    wrap(
      `<measure number="0" implicit="yes"><attributes><divisions>1</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note("G", 4, 1)}<backup><duration>1</duration></backup><note><rest measure="yes"/><duration>4</duration><staff>2</staff></note></measure><measure number="1">${note("C", 5, 4)}</measure>`,
    ),
  );
  assert.deepEqual(s.measureStarts, [0, 1]);
  assert.equal(s.notes[1].beat, 1);
  assert.equal(s.pickup, 1);
});
test('a pickup is detected without implicit="yes"; a bar of only rests keeps its full length', () => {
  const s = parseMusicXML(
    wrap(
      `<measure>${bar44}${note("G", 4, 1)}</measure><measure><note><rest measure="yes"/><duration>4</duration></note></measure><measure>${note("C", 5, 4)}</measure>`,
    ),
  );
  assert.deepEqual(s.measureStarts, [0, 1, 5]);
  assert.equal(s.notes[1].beat, 5);
  assert.ok(has(s, /pickup/));
});
test("a bar split around a repeat (short bar + implicit bar) is not padded with silence", () => {
  const s = parseMusicXML(
    wrap(
      `<measure number="1">${bar44}${note("C", 4, 4)}</measure><measure number="2">${note("D", 4, 3)}</measure><measure number="" implicit="yes">${note("E", 4, 1)}</measure><measure number="3">${note("F", 4, 4)}</measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => n.beat),
    [0, 4, 7, 8],
  );
  assert.ok(!has(s, /fewer beats/), s.warnings.join("\n"));
  const padded = parseMusicXML(
    wrap(
      `<measure number="1">${bar44}${note("C", 4, 4)}</measure><measure number="2">${note("D", 4, 3)}</measure><measure number="3">${note("F", 4, 4)}</measure>`,
    ),
  );
  assert.deepEqual(
    padded.notes.map((n) => n.beat),
    [0, 4, 8],
  );
  assert.ok(has(padded, /Bar 2 holds fewer beats/));
});
test("notes missing <duration> are timed from their written type, dots and tuplets", () => {
  const s = parseMusicXML(
    wrap(
      `<measure><attributes><divisions>2</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><type>quarter</type><dot/></note><note><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note><note><pitch><step>E</step><octave>4</octave></pitch><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>${note("F", 4, 2)}</measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => [n.beat, n.duration]),
    [
      [0, 1.5],
      [1.5, 0.5],
      [2, 0.333333],
      [2.333333, 1],
    ],
  );
  assert.ok(has(s, /written note value/));
  const bad = parseMusicXML(
    wrap(
      `<measure>${bar44}<note><pitch><step>C</step><octave>4</octave></pitch></note>${note("D", 4, 1)}</measure>`,
    ),
  );
  assert.deepEqual(
    bad.notes.map((n) => n.midi),
    [62],
  );
  assert.ok(has(bad, /missing rhythm.*bar 1/i));
});
test("written accidentals fill a missing <alter>; key signatures ignored by an exporter are flagged", () => {
  const s = parseMusicXML(
    wrap(
      `<measure>${bar44}<note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><accidental>sharp</accidental></note><note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><accidental>natural</accidental></note></measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => n.midi),
    [66, 70],
  );
  assert.ok(has(s, /written accidental was used/));
  assert.ok(has(s, /disagrees/));
  const ignored = parseMusicXML(
    wrap(
      `<measure><attributes><divisions>1</divisions><key><fifths>2</fifths></key></attributes>${note("F", 4, 1)}${note("C", 5, 1)}${note("D", 4, 2)}</measure><measure>${note("F", 4, 4)}</measure>`,
    ),
  );
  assert.deepEqual(
    ignored.notes.map((n) => n.midi),
    [65, 72, 62, 65],
  );
  assert.ok(
    has(ignored, /key signature.*bar 1, 2/i),
    ignored.warnings.join("\n"),
  );
  const honored = parseMusicXML(
    wrap(
      `<measure><attributes><divisions>1</divisions><key><fifths>1</fifths></key></attributes><note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration></note>${note("F", 4, 1)}</measure>`,
    ),
  );
  assert.ok(!has(honored, /key signature/i));
});
test("unsupported notation warnings name the bars involved", () => {
  const s = parseMusicXML(
    wrap(
      `<measure number="1">${bar44}${note("C", 4, 4)}</measure><measure number="2"><note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>${note("C", 4, 4)}<direction><direction-type><pedal type="start"/></direction-type></direction></measure><measure number="3"><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><notations><ornaments><trill-mark/></ornaments><fermata/></notations></note></measure>`,
    ),
  );
  assert.ok(has(s, /Grace notes.*bar 2\./));
  assert.ok(has(s, /ornaments.*bar 3\./));
  assert.ok(has(s, /Fermata.*bar 3\./));
  assert.ok(has(s, /Pedal/));
  assert.deepEqual(
    s.notes.map((n) => n.midi),
    [60, 60, 64],
  );
});
test("bars drawn as repeat-the-bar signs without written notes are flagged", () => {
  const s = parseMusicXML(
    wrap(
      `<measure number="1">${bar44}${note("C", 4, 4)}</measure><measure number="2"><attributes><measure-style><measure-repeat type="start">1</measure-repeat></measure-style></attributes><note><rest measure="yes"/><duration>4</duration></note></measure><measure number="3"><attributes><measure-style><measure-repeat type="stop"/></measure-style></attributes>${note("D", 4, 4)}</measure>`,
    ),
  );
  assert.ok(has(s, /repeat-the-bar.*bar 2\./));
  assert.deepEqual(
    s.notes.map((n) => n.beat),
    [0, 8],
  );
});
test("malformed MusicXML and MXL input fail with clear messages", () => {
  assert.throws(
    () =>
      parseMusicXML(
        '<score-timewise version="4.0"><part-list/></score-timewise>',
      ),
    /timewise/,
  );
  assert.throws(
    () =>
      parseMusicXML(
        wrap(
          `<measure><attributes><divisions>0</divisions></attributes>${note("C", 4, 1)}</measure>`,
        ),
      ),
    /divisions/,
  );
  assert.throws(
    () => parseMusicXML("<score-partwise><part-list/></score-partwise>"),
    /No musical parts/,
  );
  assert.throws(
    () => unpackXML(new Uint8Array([80, 75, 3, 4, 1, 2, 3])),
    /damaged/,
  );
  assert.throws(
    () => unpackXML(zipSync({ "readme.txt": strToU8("hi") })),
    /does not contain/,
  );
  assert.throws(() => unpackXML(new Uint8Array()), /empty/);
  const s = parseMusicXML(
    wrap(
      `<measure>${note("C", 4, 1)}<backup><duration>9</duration></backup>${note("E", 4, 1)}</measure>`,
    ),
  );
  assert.deepEqual(
    s.notes.map((n) => [n.midi, n.beat]),
    [
      [60, 0],
      [64, 0],
    ],
  );
  assert.ok(has(s, /divisions/));
  assert.ok(has(s, /realigned/));
});
test("MIDI: humanized chords line up, far-apart notes stay separate, out-of-range notes are reported", () => {
  const m = new midiPackage.Midi();
  const t = m.addTrack();
  for (const [midi, ticks] of [
    [60, 0],
    [64, 6],
    [67, 12],
    [72, 480],
    [74, 960],
    [10, 960],
  ])
    t.addNote({ midi, ticks, durationTicks: 480, velocity: 0.7 });
  const s = parseMIDI(m.toArray());
  assert.deepEqual(
    s.notes.map((n) => [n.midi, n.beat]),
    [
      [60, 0],
      [64, 0],
      [67, 0],
      [72, 1],
      [74, 2],
    ],
  );
  assert.equal(s.notes.find((n) => n.midi === 67).duration, 1.025);
  assert.equal(groups(s.notes)[0].notes.length, 3);
  assert.ok(s.warnings.some((w) => /lined up as one chord/.test(w)));
  assert.ok(s.warnings.some((w) => /88-key/.test(w)));
});
test("MIDI: two tracks map to hands; minor keys use the relative-major number 1; bars follow 3/4", () => {
  const m = new midiPackage.Midi();
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
  m.addTrack().addNote({ midi: 72, ticks: 0, durationTicks: 480 });
  m.addTrack().addNote({ midi: 48, ticks: 1440, durationTicks: 480 });
  const s = parseMIDI(m.toArray());
  assert.deepEqual(
    s.notes.map((n) => [n.midi, n.hand, n.measure]),
    [
      [72, "right", 1],
      [48, "left", 2],
    ],
  );
  assert.equal(s.meter, 3);
  // Hand-built bytes: @tonejs/midi's encoder writes key signatures incorrectly. Track: 3/4, C minor (sf=-3), one C4 quarter.
  const track = [
    0, 0xff, 0x58, 4, 3, 2, 24, 8, 0, 0xff, 0x59, 2, 0xfd, 1, 0, 0x90, 60, 64,
    0x83, 0x60, 0x80, 60, 64, 0, 0xff, 0x2f, 0,
  ];
  const smf = new Uint8Array([
    ...strToU8("MThd"),
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    0x01,
    0xe0,
    ...strToU8("MTrk"),
    0,
    0,
    0,
    track.length,
    ...track,
  ]);
  const minor = parseMIDI(smf);
  assert.equal(minor.tonic, 3);
  assert.equal(minor.meter, 3);
  assert.deepEqual(
    minor.notes.map((n) => [n.midi, n.beat, n.duration]),
    [[60, 0, 1]],
  );
  assert.throws(
    () => parseMIDI(new Uint8Array([1, 2, 3, 4])),
    /could not be read/,
  );
});

test("MIDI meter changes share bar positions with loops and numbered exports", () => {
  const m = new midiPackage.Midi();
  m.header.timeSignatures.push(
    { ticks: 0, timeSignature: [4, 4] },
    { ticks: 1920, timeSignature: [3, 4] },
    { ticks: 4800, timeSignature: [5, 4] },
  );
  const t = m.addTrack();
  for (const [beat, midi] of [
    [0, 60],
    [4, 62],
    [7, 64],
    [9, 65],
    [10, 67],
    [14, 69],
    [15, 71],
  ])
    t.addNote({ midi, ticks: beat * 480, durationTicks: 480 });
  const s = parseMIDI(m.toArray());
  assert.deepEqual(s.measureStarts, [0, 4, 7, 10, 15]);
  assert.deepEqual(s.measureLengths, [4, 3, 3, 5, 5]);
  assert.deepEqual(
    s.notes.map((n) => n.measure),
    [1, 2, 3, 3, 4, 4, 5],
  );
  assert.equal(s.measures, 5);
  assert.equal(barStart(s, 3), 7);
  assert.equal(barEnd(s, 3), 10);
  assert.equal(barEnd(s, 5), 20);
  assert.equal(measureAt(s, 14.9), 4);
  assert.equal(measureAt(s, 19.9), 5);
  assert.equal(measureAt(s, 20), 6);
  const html = numberedSheet(s);
  assert.match(html, /Bar 3<\/header>.*?Beat 1<\/span>.*?Beat 3<\/span>/);
  assert.match(html, /Bar 4<\/header>.*?Beat 1<\/span>.*?Beat 5<\/span>/);
  assert.doesNotMatch(html, /Beat -/);
  assert.equal(
    validatePractice(JSON.parse(JSON.stringify(s))).measureLengths[3],
    5,
  );
});

test("MIDI silent bars and long held notes keep all loopable bar boundaries", () => {
  const m = new midiPackage.Midi();
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
  m.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480 * 8 });
  const s = parseMIDI(m.toArray());
  assert.deepEqual(s.measureStarts, [0, 3, 6]);
  assert.equal(s.measures, 3);
  assert.equal(barEnd(s, 3), 9);
});

test("MIDI partial-bar signature changes start a new bar and explain the shortening", () => {
  const m = new midiPackage.Midi();
  m.header.timeSignatures.push(
    { ticks: 0, timeSignature: [4, 4] },
    { ticks: 1200, timeSignature: [3, 4] },
  );
  const t = m.addTrack();
  for (const beat of [0, 2.5, 5.5])
    t.addNote({ midi: 60, ticks: beat * 480, durationTicks: 480 });
  const s = parseMIDI(m.toArray());
  assert.deepEqual(s.measureStarts, [0, 2.5, 5.5]);
  assert.deepEqual(s.measureLengths, [2.5, 3, 3]);
  assert.deepEqual(
    s.notes.map((n) => n.measure),
    [1, 2, 3],
  );
  assert.ok(has(s, /partway.*shortened/));
});

test("MIDI near-simultaneous notes across a bar line never merge into one chord", () => {
  const m = new midiPackage.Midi();
  const t = m.addTrack();
  t.addNote({ midi: 60, ticks: 1915, durationTicks: 100 });
  t.addNote({ midi: 64, ticks: 1925, durationTicks: 100 });
  const s = parseMIDI(m.toArray());
  assert.deepEqual(
    s.notes.map((n) => n.measure),
    [1, 2],
  );
  assert.equal(groups(s.notes).length, 2);
});

test("MusicXML final bar uses its changed meter, including when editing past its end", () => {
  const s = parseMusicXML(
    wrap(
      `<measure><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note("C", 4, 3)}</measure>` +
        `<measure><attributes><time><beats>6</beats><beat-type>4</beat-type></time></attributes>${note("D", 4, 6)}</measure>`,
    ),
  );
  assert.deepEqual(s.measureStarts, [0, 3]);
  assert.deepEqual(s.measureLengths, [3, 6]);
  assert.equal(measureAt(s, 8.9), 2);
  assert.equal(barEnd(s, 2), 9);
  assert.equal(measureAt(s, 14), 3);
  assert.equal(barStart(s, 4), 15);
  assert.equal(barEnd(s, 3), 15);
});

test("bar helpers retain legacy scores; malformed imported bar maps are rejected", () => {
  const s = demos()[0];
  assert.equal(barStart(s, 3), 8);
  assert.equal(measureAt(s, 8), 3);
  assert.equal(barEnd(s, s.measures), s.duration);
  for (const map of [
    { measureStarts: [0, -1] },
    { measureStarts: [0, 4, 3] },
    { measureStarts: [0, "4"] },
    { measureStarts: [0, 4], measureLengths: [3, 4] },
    { measureStarts: [0, 4], measureLengths: [4, 0] },
    { measureLengths: [4] },
  ])
    assert.throws(
      () => validatePractice({ ...s, ...map }),
      /bar (positions|lengths)/,
    );
});
