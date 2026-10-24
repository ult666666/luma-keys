import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerScore } from '../src/fingering.mjs';
import { handTimeline, handPlan, handMotions, handPose } from '../src/hand-pose.mjs';
import { parseMusicXML } from '../src/music.mjs';
const make = (midi, beat = 0, duration = 2, extra = {}) => ({ id: `${midi}-${beat}`, midi, beat, duration, hand: 'right', ...extra });
const geometry = { keyWidth: 40, keysHeight: 190, bedHeight: 272 };

test('explicit fingering wins over suggestions, including an impossible duplicate assignment', () => {
  const notes = [make(60, 0, 1, { finger: 4 }), make(62, 1, 1, { fingerOverride: 2, finger: 3 }), make(64, 2, 1)];
  const assigned = fingerScore(notes);
  assert.equal(assigned.get('60-0'), 4);
  assert.equal(assigned.get('62-1'), 2);
  const impossible = [make(60, 0, 2, { finger: 2 }), make(72, 0, 2, { finger: 2 })];
  const choice = fingerScore(impossible);
  assert.equal(choice.get('60-0'), 2);
  assert.equal(choice.get('72-0'), 2, 'the user choice is preserved for feasibility reporting');
  const steps = handTimeline(impossible, choice, 'right');
  assert.equal(steps[0].keys.length, 2, 'both requested key contacts remain represented');
  const pose = handPose(steps, 0.2, 'right', geometry);
  assert.equal(pose.guidanceOnly, true);
  assert.deepEqual(pose.guidance.map(k => k.midi), [60, 72]);
});

test('suggested finger fields remain inferable while explicit overrides still win', () => {
  const bare = [make(60), make(64)];
  const inferred = fingerScore(bare);
  for (const field of ['finger', 'fingering']) {
    const suggested = bare.map(note => ({ ...note, [field]: 2, fingeringSource: 'suggested' }));
    assert.deepEqual(fingerScore(suggested), inferred, `${field} suggestions must not force two keys onto finger 2`);
    for (const override of ['fingerOverride', 'fingeringOverride']) {
      const withOverride = suggested.map((note, index) => index === 0 ? { ...note, [override]: 4 } : note);
      assert.equal(fingerScore(withOverride).get(bare[0].id), 4, `${override} remains authoritative`);
    }
  }
  const written = bare.map(note => ({ ...note, finger: 2, fingeringSource: 'score' }));
  assert.deepEqual([...fingerScore(written).values()], [2, 2], 'score constraints remain explicit even if physically impossible');
});

test('six simultaneous notes retain every timed key without inventing a sixth finger', () => {
  const notes = [60, 62, 64, 65, 67, 69].map(midi => make(midi));
  const steps = handTimeline(notes, fingerScore(notes), 'right');
  assert.equal(steps[0].keys.length, 6);
  assert.equal(steps[0].keys.filter(k => k.finger == null).length, 1);
  const result = handMotions({ right: steps }, 0, geometry).right;
  assert.equal(result.pose.guidanceOnly, true);
  assert.equal(result.motion.guidanceOnly, true);
  assert.deepEqual(result.pose.guidance.map(k => [k.midi, k.state]), [60, 62, 64, 65, 67, 69].map(midi => [midi, 'down']));
  assert.equal(result.pose.marks.length, 6);
});

test('an impossible simultaneous span uses key guidance at its written onset rather than rolling', () => {
  const notes = [36, 48, 64].map((midi, i) => make(midi, 0, 2, { finger: [1, 3, 5][i] }));
  const steps = handTimeline(notes, fingerScore(notes), 'right');
  const plan = handPlan(steps, 'right');
  assert.ok(plan.positions.every(p => p.roll == null));
  assert.deepEqual(plan.contacts.map(c => [c.midi, c.onset]), [[36, 0], [48, 0], [64, 0]]);
  for (const beat of [0, 0.02, 0.2, 1.5]) {
    const pose = handPose(steps, beat, 'right', geometry);
    assert.equal(pose.guidanceOnly, true);
    assert.deepEqual(pose.guidance.filter(k => k.state === 'down').map(k => k.midi), [36, 48, 64]);
  }
  const waiting = handPose(steps, 0, 'right', { ...geometry, waiting: true });
  assert.ok(waiting.guidance.every(k => k.state === 'ready'));
});

test('a held contact that cannot follow a distant next chord remains timed key guidance', () => {
  const notes = [make(36, 0, 8, { finger: 1 }), make(72, 2, 1, { finger: 5 })];
  const steps = handTimeline(notes, fingerScore(notes), 'right');
  const pose = handPose(steps, 2.2, 'right', geometry);
  assert.equal(pose.guidanceOnly, true);
  assert.deepEqual(pose.guidance.filter(k => k.state === 'down').map(k => k.midi), [36, 72]);
  const sought = handPose(steps, 2.2, 'right', geometry);
  assert.deepEqual(sought.guidance, pose.guidance, 'seek reconstructs contacts without a replay clock');
});


test('MusicXML preserves simple written fingering and tie contact without retriggering', () => {
  const xml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff><tie type="start"/><notations><technical><fingering>3</fingering></technical></notations></note></measure><measure number="2"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><staff>2</staff><tie type="stop"/></note></measure></part></score-partwise>`;
  const score = parseMusicXML(xml);
  assert.equal(score.notes.length, 1);
  assert.equal(score.notes[0].duration, 8);
  assert.equal(score.notes[0].finger, 3);
  assert.equal(score.notes[0].fingeringSource, 'score');
  assert.equal(score.notes[0].handSource, 'staff');
  const steps = handTimeline(score.notes, fingerScore(score.notes), 'right');
  assert.equal(steps.length, 1, 'a tied continuation is not an attack');
  assert.equal(steps[0].keys[0].end, 8);
});

test('MusicXML substitution and alternate fingerings are not treated as onset assignments', () => {
  const parse = attributes => parseMusicXML(`<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><notations><technical><fingering ${attributes}>5</fingering></technical></notations></note></measure></part></score-partwise>`).notes[0];
  for (const attributes of ['substitution="yes"', 'alternate="yes"', 'substitution="yes" alternate="yes"']) {
    const note = parse(attributes);
    assert.equal(note.finger, undefined, `${attributes} does not specify one supported onset finger`);
    assert.equal(note.fingeringSource, undefined);
  }
  for (const attributes of ['', 'substitution="no"', 'alternate="no"', 'substitution="no" alternate="no"']) {
    const note = parse(attributes);
    assert.equal(note.finger, 5, `${attributes || 'plain fingering'} remains supported`);
    assert.equal(note.fingeringSource, 'score');
  }
});


test('wait seeks reconstruct immediately and remain still as wall-clock time passes', () => {
  const notes = [make(48, 0, 1, { finger: 1 }), make(72, 8, 1, { finger: 5 })];
  const steps = handTimeline(notes, fingerScore(notes), 'right');
  const expected = handMotions({ right: steps }, 8, { ...geometry, waiting: true }).right;
  for (const since of [0, 0.04, 0.4, 2, 30]) {
    const actual = handMotions({ right: steps }, 8, { ...geometry, waiting: true, settle: { since } }).right;
    assert.deepEqual(actual, expected, `same transport beat after ${since}s waiting`);
  }
});

test('fallback contacts survive worker cloning, tempo changes, resizing and hand selection', async () => {
  const { prepareHandPlanData } = await import('../src/hand-planner-data.mjs');
  const { adoptHandPlans } = await import('../src/hand-pose.mjs');
  const { clockMap } = await import('../src/tempo.mjs');
  const score = { id: 'fallback-worker', bpm: 120, tempos: [{ beat: 4, bpm: 60 }], notes: [
    ...[60, 62, 64, 65, 67, 69].map(midi => make(midi, 4, 2)),
    make(48, 4, 2, { id: 'left', hand: 'left', finger: 5 }),
  ] };
  for (const speed of [0.5, 1, 1.5]) {
    const clock = clockMap(score, speed);
    const prepared = structuredClone(prepareHandPlanData(score, speed));
    adoptHandPlans(prepared.timelines, clock, prepared.plans);
    for (const keyWidth of [30, 64]) {
      const options = { ...geometry, keyWidth, clock, visible: hand => hand === 'right' };
      const shown = handMotions(prepared.timelines, 4.2, options);
      assert.equal(shown.left, null);
      assert.equal(shown.right.motion.guidance.length, 6);
      assert.ok(shown.right.motion.guidance.every(k => k.state === 'down' && k.end === 6));
      assert.equal(shown.right.motion.t, clock.toSeconds(4.2));
      assert.deepEqual(handMotions(prepared.timelines, 4.2, options), shown, 'resize and seek reuse a deterministic plan');
    }
  }
});

test('sustain pedal does not extend physical fallback contact past a written release', () => {
  const notes = [36, 48, 64].map((midi, i) => make(midi, 0, 1, { finger: [1, 3, 5][i] }));
  const steps = handTimeline(notes, fingerScore(notes), 'right');
  const before = handPose(steps, 0.5, 'right', { ...geometry, pedals: [{ beat: 0, end: 8 }] });
  assert.equal(before.guidance.filter(k => k.state === 'down').length, 3);
  const after = handPose(steps, 1.1, 'right', { ...geometry, pedals: [{ beat: 0, end: 8 }] });
  assert.equal(after.guidance.filter(k => k.state === 'down').length, 0);
});

test('preparation for an unrepresentable chord shows every upcoming key, never its internal anchor', () => {
  const notes = [36, 48, 64].map((midi, i) => make(midi, 2, 1, { finger: [1, 3, 5][i] }));
  const steps = handTimeline(notes, fingerScore(notes), 'right');
  const pose = handPose(steps, 0.8, 'right', geometry);
  assert.equal(pose.guidanceOnly, true);
  assert.deepEqual(pose.guidance.map(k => [k.midi, k.state]), [[36, 'ready'], [48, 'ready'], [64, 'ready']]);
});

test('a hidden fallback hand does not displace the other hand through phantom collisions', () => {
  const leftNotes = [60, 62, 64, 65, 67, 69].map(midi => make(midi, 0, 2, { id: `left-${midi}`, hand: 'left' }));
  const rightNotes = [make(64, 0, 2, { finger: 3 })];
  const notes = [...leftNotes, ...rightNotes];
  const fingers = fingerScore(notes);
  const right = handTimeline(notes, fingers, 'right');
  const left = handTimeline(notes, fingers, 'left');
  const alone = handMotions({ right }, 0.5, geometry).right;
  const both = handMotions({ right, left }, 0.5, geometry);
  assert.equal(both.left.motion.guidanceOnly, true);
  assert.deepEqual(both.right, alone);
});

test('a thumb releases at its written end when synthetic overlap would make a scale crossover unreachable', async () => {
  const { readFileSync } = await import('node:fs');
  const { scenarioInputs } = await import('../scripts/hand-lab-scenario.mjs');
  const scenario = JSON.parse(readFileSync(new URL('./fixtures/hand-motion/scale.json', import.meta.url), 'utf8'));
  for (const speed of [0.5, 1]) {
    const input = scenarioInputs(scenario, { speed });
    const plan = handPlan(input.steps.left, 'left', { clock: input.clock });
    const thumb = plan.engagements.find(e => e.midi === 48 && e.finger === 1 && e.onset < input.clock.toSeconds(4));
    assert.equal(thumb.release, thumb.end, 'no extra simultaneous C/D contacts beyond the written thumb release');
    const motion = handMotions(input.steps, 4.01, { ...geometry, clock: input.clock }).left.motion;
    assert.notEqual(motion.fingers[0].state, 'down');
    assert.equal(motion.fingers[3].state, 'down', 'the incoming ring finger lands on time');
  }
});
