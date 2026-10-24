import test from "node:test";
import assert from "node:assert/strict";
import { parseMusicXML } from "../src/music.mjs";
import { buildExpression } from "../src/expression.mjs";

const wrap = (body) => `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
const attributes = '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>';
const note = (step, octave, duration = 4, { art = "", extra = "", staff = 1, dynamics = "", tie = "" } = {}) =>
  `<note${dynamics ? ` dynamics="${dynamics}"` : ""}>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${tie}<staff>${staff}</staff>${art ? `<notations><articulations>${art}</articulations></notations>` : ""}</note>`;
const dyn = (amount, name = "ff") => `<direction><direction-type><dynamics><${name}/></dynamics></direction-type><staff>1</staff><sound dynamics="${amount}"/></direction>`;
const get = (score, map, midi, beat = 0) => map.get(score.notes.find((n) => n.midi === midi && n.beat === beat).id);

test("written articulation changes the release gate, never score data or authored dynamics", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${dyn(54, "p")}${note("C", 4, 4, { art: "<staccato/>" })}${note("D", 4, 4, { art: "<staccatissimo/>", dynamics: 136 })}${note("E", 4, 4, { art: "<tenuto/>" })}${note("F", 4)}</measure>`));
  const before = JSON.stringify(score);
  const result = buildExpression(score, { style: "written" });
  assert.deepEqual(get(score, result, 60), { gate: 0.55 });
  assert.deepEqual(get(score, result, 62, 1), { gate: 0.32 });
  assert.deepEqual(get(score, result, 64, 2), { gate: 1 });
  assert.equal(get(score, result, 65, 3), undefined);
  assert.equal(score.notes[1].velocity, 0.96);
  assert.equal(JSON.stringify(score), before);
  assert.deepEqual(buildExpression(score, { style: "literal" }), result);
});

test("concert voicing preserves melody, bass octaves, and explicitly stronger inner accents", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${dyn(124)}${note("C", 4)}${note("E", 4, 4, { extra: "<chord/>", dynamics: 136 })}${note("G", 4, 4, { extra: "<chord/>" })}${note("C", 5, 4, { extra: "<chord/>" })}<backup><duration>4</duration></backup>${note("C", 2, 4, { staff: 2 })}${note("E", 2, 4, { staff: 2, extra: "<chord/>" })}${note("C", 3, 4, { staff: 2, extra: "<chord/>" })}</measure>`));
  const result = buildExpression(score);
  assert.equal(get(score, result, 72), undefined, "right-hand top remains authored");
  assert.equal(get(score, result, 60), undefined, "octave doubling remains authored");
  assert.equal(get(score, result, 36), undefined, "left-hand bass remains authored");
  assert.equal(get(score, result, 48), undefined, "bass octave remains authored");
  assert.equal(get(score, result, 64), undefined, "sf inner voice remains authored");
  assert.equal(get(score, result, 67).velocity, 0.8096);
  assert.equal(get(score, result, 40).velocity, 0.8096);
  assert.equal(buildExpression(score, { style: "written" }).size, 0);
});

test("marked accents are protected and unmarked single-line music gets no invented phrase arc", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${note("C", 4, 4, { art: "<accent/>" })}${note("E", 4, 4, { extra: "<chord/>" })}${note("G", 4, 4, { extra: "<chord/>" })}${note("D", 4)}${note("E", 4)}${note("F", 4)}</measure>`));
  const result = buildExpression(score);
  assert.equal(get(score, result, 60), undefined);
  assert.equal(result.size, 1);
  assert.deepEqual(get(score, result, 64), { velocity: 0.6624 });
});

test("a whole sf chord remains strong even when every member has the same velocity", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${dyn(124)}${note("C", 4, 4, { dynamics: 136 })}${note("E", 4, 4, { extra: "<chord/>", dynamics: 136 })}${note("G", 4, 4, { extra: "<chord/>", dynamics: 136 })}</measure>`));
  assert.equal(buildExpression(score).size, 0);
  const held = { ...score, notes: score.notes.map((n) => ({ ...n, duration: 3 })) };
  assert.equal(buildExpression(held).size, 0, "loud held notes stay intact when source matching is conservative");
});

test("ties and conflicting unison articulations do not shorten a held note", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${note("C", 4, 16, { tie: '<tie type="start"/>', art: "<staccato/>" })}</measure><measure>${note("C", 4, 4, { tie: '<tie type="stop"/>', art: "<staccato/>" })}${note("E", 4, 4, { art: "<staccato/>" })}<backup><duration>4</duration></backup>${note("E", 4)}</measure>`));
  assert.equal(score.notes[0].duration, 5);
  assert.equal(buildExpression(score, { style: "written" }).size, 0);
});

test("edited pitches, rhythms and stale XML cannot transfer articulation to the wrong note", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${note("C", 4, 4, { art: "<staccato/>" })}${note("D", 4, 4, { art: "<staccato/>" })}${note("E", 4, 4, { art: "<staccato/>" })}</measure>`));
  score.notes[0].midi = 61;
  score.notes[1].duration = 2;
  score.notes[2].beat = 3;
  assert.equal(buildExpression(score, { style: "written" }).size, 0);
  assert.equal(buildExpression({ ...score, xml: "<broken>" }, { style: "written" }).size, 0);
  assert.equal(buildExpression({ notes: [] }).size, 0);
});

test("pickup, backup, chord and changing divisions use the shared bar map", () => {
  const score = parseMusicXML(wrap(`<measure implicit="yes">${attributes}${note("C", 4, 2, { art: "<staccato/>" })}${note("E", 4, 2, { extra: "<chord/>", art: "<staccato/>" })}<backup><duration>2</duration></backup>${note("C", 3, 2, { staff: 2, art: "<tenuto/>" })}</measure><measure><attributes><divisions>8</divisions></attributes><forward><duration>8</duration></forward>${note("F", 4, 4, { art: "<staccatissimo/>" })}</measure>`));
  const result = buildExpression(score, { style: "written" });
  assert.equal(score.measureStarts[1], 0.5);
  assert.deepEqual(get(score, result, 60), { gate: 0.55 });
  assert.deepEqual(get(score, result, 64), { gate: 0.55 });
  assert.deepEqual(get(score, result, 48), { gate: 1 });
  assert.deepEqual(get(score, result, 65, 1.5), { gate: 0.32 });
});

test("a flat written crescendo gets only a bounded concert approach; sf accents and following ff stay intact", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${dyn(124)}<direction><direction-type><words>cresc.</words></direction-type><staff>1</staff></direction>${note("C", 4, 4, { dynamics: 124 })}${note("D", 4, 4, { dynamics: 124 })}${note("E", 4, 4, { dynamics: 136 })}${note("F", 4, 4, { dynamics: 124 })}</measure><measure>${dyn(124)}${note("G", 4, 4, { dynamics: 124 })}</measure>`));
  const result = buildExpression(score);
  assert.equal(get(score, result, 60).velocity, 0.7568);
  assert.ok(get(score, result, 62, 1).velocity > get(score, result, 60).velocity);
  assert.ok(get(score, result, 65, 3).velocity > get(score, result, 62, 1).velocity);
  assert.equal(get(score, result, 64, 2), undefined);
  assert.equal(get(score, result, 67, 4), undefined);
  assert.equal(buildExpression(score, { style: "written" }).size, 0);
});

test("unbounded or already-shaped crescendos are not given a second dynamic ramp", () => {
  const body = `${attributes}${dyn(124)}<direction><direction-type><words>cresc.</words></direction-type><staff>1</staff></direction>${note("C", 4, 4, { dynamics: 100 })}${note("D", 4, 4, { dynamics: 110 })}${note("E", 4, 4, { dynamics: 120 })}`;
  const shaped = parseMusicXML(wrap(`<measure>${body}</measure><measure>${dyn(124)}${note("G", 4)}</measure>`));
  assert.equal(buildExpression(shaped).size, 0);
  const unbounded = parseMusicXML(wrap(`<measure>${body}</measure>`));
  assert.equal(buildExpression(unbounded).size, 0);
});

test("final written short chord and closing rests are not extended into a fermata", () => {
  const score = parseMusicXML(wrap(`<measure>${attributes}${note("C", 3, 2, { staff: 2 })}${note("G", 3, 2, { staff: 2, extra: "<chord/>" })}${note("C", 4, 2, { staff: 2, extra: "<chord/>" })}<note><rest/><duration>14</duration></note></measure>`));
  const before = JSON.stringify(score);
  const result = buildExpression(score);
  assert.equal(score.duration, 4);
  assert.equal(score.notes[0].duration, 0.5);
  assert.ok([...result.values()].every((v) => v.gate === undefined));
  assert.equal(JSON.stringify(score), before);
});

test("dense 50,000-note scores remain bounded with no generated events", () => {
  const score = { notes: Array.from({ length: 50000 }, (_, i) => ({
    id: `n${i}`, beat: Math.floor(i / 4) / 4, duration: 0.25,
    midi: 60 + i % 4 * 2, hand: "right", velocity: 0.7,
  })) };
  const result = buildExpression(score);
  assert.equal(result.size, 37500);
  assert.ok([...result.values()].every((v) => v.velocity === 0.644));
});
