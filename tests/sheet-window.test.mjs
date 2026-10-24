import test from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import { compileSheetWindows } from "../src/sheet-window.mjs";

const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) =>
    ["part", "measure", "attributes", "key", "clef"].includes(name),
});
const note = (extra = "", voice = 1, alter = "") =>
  `<note><pitch><step>C</step>${alter}<octave>4</octave></pitch><duration>4</duration><voice>${voice}</voice><staff>1</staff>${extra}</note>`;
const direction = (markup) =>
  `<direction><direction-type>${markup}</direction-type><staff>1</staff></direction>`;
function score(total = 200, changes = {}, secondChanges) {
  const part = (id, changes) =>
    `<part id="${id}">${Array.from({ length: total }, (_, i) => `<measure number="${i}"${i === 0 ? ' implicit="yes"' : ""}>${i === 0 ? '<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' : ""}${changes[i + 1] ?? note()}</measure>`).join("")}</part>`;
  return `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Source title</work-title></work><identification><rights>Retained attribution</rights></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part>${secondChanges ? '<score-part id="P2"><part-name>Second</part-name></score-part>' : ""}</part-list>${part("P1", changes)}${secondChanges ? part("P2", secondChanges) : ""}</score-partwise>`;
}
const read = (xml) => parser.parse(xml)["score-partwise"];

test("late compact passage is bounded, keeps source measure identities/pickup count, and leaves source immutable", () => {
  const xml = score(569);
  const prepared = compileSheetWindows(xml);
  assert.equal(prepared.total, 569);
  const result = prepared.window(105, 112);
  assert.equal(result.windowed, true);
  assert.equal(result.offset, 103);
  assert.equal(result.measureCount, 10);
  assert.equal(result.total, 569);
  const source = read(result.xml);
  assert.equal(source.part[0].measure[1]["@_number"], "104");
  assert.equal(source.part[0].measure[8]["@_number"], "111");
  assert.equal(source.work["work-title"], "Source title");
  assert.equal(source.identification.rights, "Retained attribution");
  assert.ok(result.xml.length < xml.length / 10);
  prepared.window(561, 568);
  assert.deepEqual(prepared.window(105, 112), result);
  assert.equal(read(xml).part[0].measure.length, 569);
});

test("latest staff attributes are carried before the prefix and current changes remain in source order", () => {
  const xml = score(100, {
    20:
      '<attributes><divisions>8</divisions><key number="1"><fifths>3</fifths></key><time><beats>3</beats><beat-type>8</beat-type></time><clef number="2"><sign>G</sign><line>2</line></clef><transpose><diatonic>1</diatonic><chromatic>2</chromatic></transpose></attributes>' +
      note(),
    49: "<attributes><key><fifths>-2</fifths></key></attributes>" + note(),
  });
  const window = compileSheetWindows(xml).window(50, 53);
  const first = read(window.xml).part[0].measure[0];
  assert.equal(first["@_number"], "48");
  assert.equal(first.attributes[0].divisions, 8);
  assert.equal(first.attributes[0].time.beats, 3);
  assert.equal(first.attributes[0].time["beat-type"], 8);
  assert.deepEqual(
    first.attributes[0].clef.map((clef) => [clef["@_number"], clef.sign]),
    [
      ["1", "G"],
      ["2", "G"],
    ],
  );
  assert.equal(first.attributes[0].transpose.chromatic, 2);
  assert.equal(first.attributes[1].key[0].fifths, -2);
  const next = read(compileSheetWindows(xml).window(52, 55).xml).part[0]
    .measure[0];
  assert.equal(
    next.attributes[0].key.length,
    1,
    "later all-staff key clears stale numbered keys",
  );
  assert.equal(next.attributes[0].key[0].fifths, -2);
});

test("ties across voice changes and explicit natural spellings keep both endpoints", () => {
  const start = note(
    '<tie type="start"/><notations><tied type="start"/></notations>',
    7,
  );
  const stop = note(
    '<tie type="stop"/><notations><tied type="stop"/></notations>',
    6,
    "<alter>0</alter>",
  );
  const prepared = compileSheetWindows(score(100, { 45: start, 48: stop }));
  const during = prepared.window(47, 47);
  assert.equal(during.offset, 44);
  assert.equal(during.measureCount, 4);
  const after = prepared.window(60, 63);
  assert.equal(
    after.offset,
    58,
    "ended tie cannot drag later windows back to its onset",
  );
});

test("pedal, octave, wedge and slur spans expand across both window edges", () => {
  const xml = score(100, {
    30: direction('<pedal type="start"/>') + note(),
    32: direction('<octave-shift type="down" size="8"/>') + note(),
    35:
      direction('<wedge type="crescendo"/>') +
      note('<notations><slur number="2" type="start"/></notations>'),
    40: direction('<pedal type="stop"/>') + note(),
    41: direction('<octave-shift type="stop" size="8"/>') + note(),
    42:
      direction('<wedge type="stop"/>') +
      note('<notations><slur number="2" type="stop"/></notations>'),
  });
  const result = compileSheetWindows(xml).window(37, 38);
  assert.equal(result.offset, 29);
  assert.equal(result.measureCount, 13);
  assert.match(result.xml, /pedal type="start"/);
  assert.match(result.xml, /slur number="2" type="stop"/);
});

test("polyphonic same-measure stop before start does not invent a lasting span", () => {
  const prepared = compileSheetWindows(
    score(100, {
      12:
        direction('<wedge type="stop"/>') +
        note() +
        direction('<wedge type="crescendo"/>'),
    }),
  );
  assert.equal(prepared.window(70, 77).offset, 68);
});

test("aligned multiple parts retain each part's clef and share a conservative context window", () => {
  const prepared = compileSheetWindows(
    score(
      100,
      {},
      {
        25: direction('<pedal type="start"/>') + note(),
        35: direction('<pedal type="stop"/>') + note(),
      },
    ),
  );
  const result = prepared.window(30, 33);
  assert.equal(result.offset, 24);
  assert.deepEqual(
    read(result.xml).part.map((part) => part.measure.length),
    [11, 11],
  );
});

test("long or unsupported notation falls back to untouched source instead of dropping context", () => {
  const xml = score(200, {
    2: direction('<pedal type="start"/>') + note(),
    199: direction('<pedal type="stop"/>') + note(),
  });
  const result = compileSheetWindows(xml).window(105, 112);
  assert.equal(result.windowed, false);
  assert.equal(result.xml, xml);
  assert.equal(result.offset, 0);
  assert.equal(
    compileSheetWindows(
      score(100, {
        1:
          "<attributes><measure-style><multiple-rest>4</multiple-rest></measure-style></attributes>" +
          note(),
      }),
    ),
    null,
  );
  assert.equal(compileSheetWindows("<score-timewise/>"), null);
  assert.equal(compileSheetWindows("<score-partwise>"), null);
  assert.equal(
    compileSheetWindows(
      score(100, {}, {}).replace(
        '</part><part id="P2">',
        '<measure number="extra">' + note() + '</measure></part><part id="P2">',
      ),
    ),
    null,
  );
});

test("end and invalid requests stay bounded or return the original safely", () => {
  const prepared = compileSheetWindows(score(569));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(prepared.window(569, 580)).filter(
        ([key]) => key !== "xml",
      ),
    ),
    { offset: 567, total: 569, windowed: true, measureCount: 2 },
  );
  assert.equal(prepared.window(NaN, 4).windowed, false);
  assert.equal(prepared.window(1, 100).windowed, false);
});
