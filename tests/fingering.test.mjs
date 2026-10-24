import test from "node:test";
import assert from "node:assert/strict";
import { fingerHand, fingerScore, stretch } from "../src/fingering.mjs";
import { demos } from "../src/music.mjs";
import { secondsAt } from "../src/tempo.mjs";

const run = (midis, hand, step = 0.5) =>
  midis.map((midi, i) => ({
    id: "n" + i,
    midi,
    beat: i * step,
    duration: step,
    hand,
  }));
const fingers = (notes, hand) => {
  const f = fingerHand(notes, hand);
  return notes.map((n) => f.get(n.id)).join(" ");
};
const C = [60, 62, 64, 65, 67, 69, 71, 72];
const C2 = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];

test("scales take the textbook fingering, thumbs passing under", () => {
  assert.equal(fingers(run(C, "right"), "right"), "1 2 3 1 2 3 4 5");
  assert.equal(
    fingers(run([...C].reverse(), "right"), "right"),
    "5 4 3 2 1 3 2 1",
  );
  assert.equal(
    fingers(
      run(
        C.map((m) => m - 12),
        "left",
      ),
      "left",
    ),
    "5 4 3 2 1 3 2 1",
  );
  assert.equal(
    fingers(
      run(
        [...C].reverse().map((m) => m - 12),
        "left",
      ),
      "left",
    ),
    "1 2 3 1 2 3 4 5",
  );
  assert.equal(
    fingers(run(C2, "right", 0.25), "right"),
    "1 2 3 1 2 3 4 1 2 3 1 2 3 4 5",
  );
  assert.equal(
    fingers(run([67, 69, 71, 72, 74, 76, 78, 79], "right"), "right"),
    "1 2 3 1 2 3 4 5",
  );
  assert.equal(
    fingers(run([65, 67, 69, 70, 72, 74, 76, 77], "right"), "right"),
    "1 2 3 4 1 2 3 4",
  );
});

test("five-finger tunes stay in one position", () => {
  assert.equal(
    fingers(run([60, 62, 64, 65, 67, 65, 64, 62, 60], "right"), "right"),
    "1 2 3 4 5 4 3 2 1",
  );
  // Ode to Joy.
  assert.equal(
    fingers(
      run(
        [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
        "right",
        1,
      ),
      "right",
    ),
    "3 3 4 5 5 4 3 2 1 1 2 3 3 2 2",
  );
  assert.equal(
    fingers(run([60, 64, 67, 64, 60, 64, 67, 64], "right", 0.25), "right"),
    "1 3 5 3 1 3 5 3",
  );
});

test("arpeggios cross the thumb once an octave, never onto a black key", () => {
  const up = fingers(
    run([60, 64, 67, 72, 76, 79, 84], "right", 0.25),
    "right",
  ).split(" ");
  assert.equal(up[0], "1");
  assert.equal(up[3], "1", "the thumb passes under to the next C");
  assert.equal(up.at(-1), "5");
  const eflat = run([63, 67, 70, 75, 79, 82, 87], "right", 0.25);
  const f = fingerHand(eflat, "right");
  for (const n of eflat)
    if ([63, 70, 75, 82, 87].includes(n.midi))
      assert.notEqual(f.get(n.id), 1, "no thumb on E♭ or B♭");
});

test("chords are fingered in order under the hand and octaves span 1 to 4 or 5", () => {
  const chords = [
    [60, 64, 67],
    [60, 72],
    [62, 74],
    [48, 52, 55],
  ];
  chords.forEach((pitches, gi) => {
    const hand = gi === 3 ? "left" : "right";
    const notes = pitches.map((midi, i) => ({
      id: `c${i}`,
      midi,
      beat: 0,
      duration: 1,
      hand,
    }));
    const f = fingerHand(notes, hand);
    const byPitch = notes.map((n) => f.get(n.id));
    const expectOrder =
      hand === "right" ? [...byPitch].sort() : [...byPitch].sort().reverse();
    assert.deepEqual(
      byPitch,
      expectOrder,
      `fingers follow the pitches (${pitches})`,
    );
    assert.equal(new Set(byPitch).size, byPitch.length, "one finger per key");
    if (pitches.length === 2) {
      assert.equal(Math.min(...byPitch), 1);
      assert.ok(Math.max(...byPitch) >= 4);
    }
  });
});

test("a held key keeps its finger while the others move around it", () => {
  // C4 held for four beats under E4 F4 G4 in the right hand.
  const notes = [
    { id: "held", midi: 60, beat: 0, duration: 4, hand: "right" },
    { id: "a", midi: 64, beat: 0, duration: 1, hand: "right" },
    { id: "b", midi: 65, beat: 1, duration: 1, hand: "right" },
    { id: "c", midi: 67, beat: 2, duration: 1, hand: "right" },
  ];
  const f = fingerHand(notes, "right");
  for (const id of ["b", "c"]) {
    assert.notEqual(f.get(id), f.get("held"));
    assert.ok(f.get(id) > f.get("held"), "above the held key, a higher finger");
  }
});

test("a sustained finger stays reserved through every later onset in either hand", () => {
  for (const hand of ["right", "left"]) {
    const mirror = (midi) => (hand === "right" ? midi : 120 - midi);
    const notes = [
      { id: "held", midi: 60, beat: 0, duration: 8, hand },
      ...[64, 65, 67, 69, 71, 72].map((midi, i) => ({
        id: `moving-${i}`,
        midi: mirror(midi),
        beat: i,
        duration: 0.8,
        hand,
      })),
    ];
    const assigned = fingerHand(notes, hand);
    assert.equal(
      assigned.size,
      notes.length,
      "the octave passage remains fully playable",
    );
    for (const note of notes.slice(1))
      assert.ok(
        assigned.get(note.id) > assigned.get("held"),
        `${hand}: ${note.id} stays beyond the held thumb`,
      );
  }
});

test("multiple sustained keys retain separate fingers across voice changes and releases", () => {
  const notes = [
    { id: "bass", midi: 60, beat: 0, duration: 8, hand: "right" },
    { id: "inner", midi: 67, beat: 2, duration: 5, hand: "right" },
    ...[64, 65, 64, 65, 64, 65, 64, 72].map((midi, i) => ({
      id: `voice-${i}`,
      midi,
      beat: i,
      duration: 0.5,
      hand: "right",
    })),
  ];
  const assigned = fingerHand(notes, "right");
  assert.equal(assigned.size, notes.length);
  for (const note of notes) {
    const active = notes.filter(
      (n) => n.beat <= note.beat && n.beat + n.duration > note.beat + 1e-6,
    );
    const activeFingers = active.map((n) => assigned.get(n.id));
    assert.equal(
      new Set(activeFingers).size,
      active.length,
      `every held key has its own finger at beat ${note.beat}`,
    );
  }
  assert.notEqual(assigned.get("bass"), assigned.get("inner"));
  assert.ok(
    assigned.get("voice-7") > assigned.get("bass"),
    "the other hold can move after its exact release",
  );
});

test("a finger becomes available at the held note's exact end", () => {
  const notes = [
    { id: "held", midi: 60, beat: 0, duration: 3, hand: "right" },
    ...[64, 65, 67, 60].map((midi, i) => ({
      id: `moving-${i}`,
      midi,
      beat: i,
      duration: 0.8,
      hand: "right",
    })),
  ];
  const assigned = fingerHand(notes, "right");
  assert.equal(assigned.size, notes.length);
  assert.equal(assigned.get("moving-3"), assigned.get("held"));
  assert.notEqual(assigned.get("moving-2"), assigned.get("held"));
});

test("same-onset unisons share one finger and preserve their longest hold", () => {
  for (const hand of ["right", "left"]) {
    const mirror = (midi) => (hand === "right" ? midi : 120 - midi);
    const notes = [
      { id: "short-voice", midi: 60, beat: 0, duration: 1, hand },
      { id: "long-voice", midi: 60, beat: 0.0000002, duration: 8, hand },
      ...[64, 65, 67, 69, 71, 72].map((midi, i) => ({
        id: `moving-${i}`,
        midi: mirror(midi),
        beat: i,
        duration: 0.8,
        hand,
      })),
    ];
    const assigned = fingerHand(notes, hand);
    assert.equal(
      assigned.size,
      notes.length,
      "both written voices retain a suggestion",
    );
    assert.equal(assigned.get("short-voice"), assigned.get("long-voice"));
    for (const note of notes.slice(2))
      assert.ok(
        assigned.get(note.id) > assigned.get("long-voice"),
        "the longer voice keeps the key occupied after the shorter one ends",
      );
  }
  const chord = [60, 60, 62, 64, 65, 67].map((midi, i) => ({
    id: `chord-${i}`,
    midi,
    beat: 0,
    duration: 1,
    hand: "right",
  }));
  const assigned = fingerHand(chord, "right");
  assert.equal(
    assigned.size,
    6,
    "six noteheads on five keys still fit one hand",
  );
  assert.equal(assigned.get("chord-0"), assigned.get("chord-1"));
  assert.equal(new Set(assigned.values()).size, 5);
});

test("overfull or impossible shapes omit suggestions without stealing a held finger", () => {
  const overfull = [
    { id: "held", midi: 60, beat: 0, duration: 8, hand: "right" },
    ...[62, 64, 65, 67, 69].map((midi, i) => ({
      id: `new-${i}`,
      midi,
      beat: 1,
      duration: 1,
      hand: "right",
    })),
  ];
  const assigned = fingerHand(overfull, "right");
  assert.ok(assigned.has("held"));
  assert.equal(assigned.size, 5, "only five simultaneous keys can be fingered");
  assert.equal(new Set(assigned.values()).size, 5);

  const pinned = [
    { id: "held", midi: 60, beat: 0, duration: 8, hand: "right" },
    ...[53, 55, 57, 59].map((midi, i) => ({
      id: `low-${i}`,
      midi,
      beat: 0,
      duration: 1,
      hand: "right",
    })),
    ...[62, 64, 65, 67].map((midi, i) => ({
      id: `high-${i}`,
      midi,
      beat: 2,
      duration: 1,
      hand: "right",
    })),
    { id: "after-release", midi: 64, beat: 8, duration: 1, hand: "right" },
  ];
  const partial = fingerHand(pinned, "right");
  assert.equal(partial.get("held"), 5);
  assert.ok(
    pinned
      .filter((n) => n.id.startsWith("high-"))
      .every((n) => !partial.has(n.id)),
    "unsupported fingering is left unassigned",
  );
  assert.ok(
    partial.has("after-release"),
    "normal suggestions resume after the pinned key is released",
  );
});

test("stretches price comfort, and every note of a score gets a finger", () => {
  assert.equal(stretch(1, 60, 5, 67), 0, "C to G under 1 and 5 is relaxed");
  assert.ok(stretch(1, 60, 5, 76) > 5, "a tenth is a stretch");
  assert.ok(stretch(2, 60, 3, 70) >= 40, "2 to 3 cannot reach a seventh");
  const notes = [
    ...run([60, 62, 64], "right"),
    ...run([48, 43], "left").map((n) => ({ ...n, id: "l" + n.id })),
  ];
  const all = fingerScore(notes, (b) => b * 0.5);
  assert.equal(all.size, notes.length);
  for (const f of all.values()) assert.ok(f >= 1 && f <= 5);
  assert.equal(fingerHand([], "right").size, 0);
});

// A score's fingering exactly as the app computes it (KeyboardGuide).
const lessonFingers = (score) => {
  const f = fingerScore(score.notes, (b) => secondsAt(score, b));
  return score.notes.map((n) => f.get(n.id)).join(" ");
};
// Quarter notes at ♩=80, as in the built-in lessons and the starter score.
const tune = (midis, hand = "right") => ({
  bpm: 80,
  notes: run(midis, hand, 1),
});

test("Twinkle, the first lesson, is fingered as a teacher would: in position, 4 and 5 for G and A", () => {
  const twinkle = demos().find((s) => s.title.startsWith("Twinkle"));
  const phrase = {
    a: "1 1 4 4 5 5 4", // C C G G A A G: thumb on C, 4 and 5 reach G and A
    b: "4 4 3 3 2 2 1", // F F E E D D C: back over C during the half note
    c: "5 5 4 4 3 3 2", // G G F F E E D: C position
  };
  assert.equal(
    lessonFingers(twinkle),
    [phrase.a, phrase.b, phrase.c, phrase.c, phrase.a, phrase.b].join(" "),
  );
  // Never the thumb-to-index fifth, and a repeated quarter keeps its finger.
  const f = fingerScore(twinkle.notes, (b) => secondsAt(twinkle, b));
  twinkle.notes.forEach((n, i) => {
    const prev = twinkle.notes[i - 1];
    if (prev && prev.midi === n.midi)
      assert.equal(f.get(n.id), f.get(prev.id), `repeat at beat ${n.beat}`);
  });
});

test("Ode to Joy and the Start here melody keep their textbook fingering", () => {
  const joy = demos().find((s) => s.title === "Ode to Joy");
  assert.equal(
    lessonFingers(joy),
    "3 3 4 5 5 4 3 2 1 1 2 3 3 2 2 3 3 4 5 5 4 3 2 1 1 2 3 2 1 1",
  );
  // "Start here · C major melody": up the C major scale and back.
  const start = tune([
    60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60,
  ]);
  assert.equal(lessonFingers(start), "1 2 3 1 2 3 4 5 5 4 3 2 1 3 2 1");
  const scale = demos().find((s) => s.title === "C major scale");
  assert.equal(lessonFingers(scale), "1 2 3 1 2 3 4 5 4 3 2 1 3 2 1");
});

test("a five-finger melody reaching a sixth extends to 5 rather than shifting onto 2", () => {
  // C C G G A A G on its own, without the rest of Twinkle to steer it.
  assert.equal(
    lessonFingers(tune([60, 60, 67, 67, 69, 69, 67])),
    "1 1 4 4 5 5 4",
  );
  // C E G A G E C: A is the little finger, G never the index.
  const arch = tune([60, 64, 67, 69, 67, 64, 60]);
  const f = fingerScore(arch.notes, (b) => secondsAt(arch, b));
  assert.equal(f.get("n3"), 5, "A takes the extended fifth finger");
  for (const id of ["n2", "n4"]) assert.ok(f.get(id) >= 4, "G under 4 or 5");
  // The left hand mirrors it: C2 E G A from the little finger.
  assert.equal(
    lessonFingers(tune([48, 48, 55, 55, 57, 57, 55], "left")),
    "5 5 2 2 1 1 2",
  );
});

test("a slow repeated key keeps its finger, a fast one may change", () => {
  const slow = tune([64, 64, 62, 62, 60]);
  assert.equal(lessonFingers(slow), "3 3 2 2 1");
  // Sixteenths at ♩=144: changing fingers on the repeat is still allowed.
  const fast = run([72, 72, 72, 71, 71, 71, 72], "right", 0.25);
  assert.equal(fingerHand(fast, "right", (b) => (b * 60) / 144).size, 7);
});

test("after a long rest the hand starts afresh, so a repeated phrase repeats its fingering", () => {
  // Gymnopédie-like: a phrase, a held low note, a long rest, the phrase again.
  const phrase = [78, 81, 79, 78, 73, 71, 73, 74, 69];
  const notes = [
    ...phrase.map((midi, i) => ({
      id: `a${i}`,
      midi,
      beat: i,
      duration: 1,
      hand: "right",
    })),
    { id: "low", midi: 66, beat: 9, duration: 3, hand: "right" },
    ...phrase.map((midi, i) => ({
      id: `b${i}`,
      midi,
      beat: 25 + i,
      duration: 1,
      hand: "right",
    })),
  ];
  const f = fingerHand(notes, "right", (b) => b);
  // The opening (before the tails lead somewhere different) matches.
  const opening = phrase.slice(0, 6).map((_, i) => i);
  assert.deepEqual(
    opening.map((i) => f.get(`b${i}`)),
    opening.map((i) => f.get(`a${i}`)),
  );
});

// Notes from [midi, beat, duration] rows (an array of midis is a chord), with
// 4/4 bars so phrase ends and bar lines are known, fingered as the app does.
const passage = (rows, hand = "right", bpm = 80) => {
  const notes = [];
  for (const [pitches, beat, duration] of rows)
    for (const midi of [pitches].flat())
      notes.push({
        id: `n${notes.length}`,
        midi,
        beat,
        duration,
        hand,
        measure: Math.floor(beat / 4) + 1,
      });
  const score = { bpm, notes };
  const f = fingerScore(notes, (b) => secondsAt(score, b));
  return {
    notes,
    finger: (i) => f.get(`n${i}`),
    all: notes.map((n) => f.get(n.id)),
  };
};
// A melody of quarter notes in 4/4.
const quarters = (midis, bpm) =>
  passage(
    midis.map((m, i) => [m, i, 1]),
    "right",
    bpm,
  ).all.join(" ");

test("Twinkle keeps its teacher's fingering from ♩=50 to ♩=120", () => {
  const twinkle = demos().find((s) => s.title.startsWith("Twinkle"));
  const a = "1 1 4 4 5 5 4",
    b = "4 4 3 3 2 2 1",
    c = "5 5 4 4 3 3 2";
  for (const bpm of [50, 60, 100, 120]) {
    const score = { ...twinkle, bpm };
    const f = fingerScore(score.notes, (beat) => secondsAt(score, beat));
    assert.equal(
      score.notes.map((n) => f.get(n.id)).join(" "),
      [a, b, c, c, a, b].join(" "),
      `♩=${bpm}`,
    );
  }
});

test("a five-finger position stays put: 3 and 4 take a minor third", () => {
  // C D E G A G E D C: 4 on G and 5 on A, not 5 moving from G to A.
  for (const bpm of [60, 80, 120])
    assert.equal(
      quarters([60, 62, 64, 67, 69, 67, 64, 62, 60], bpm),
      "1 2 3 4 5 4 3 2 1",
      `♩=${bpm}`,
    );
  assert.equal(stretch(3, 64, 4, 67), 1, "E–G under 3–4 is a mild stretch");
  assert.ok(stretch(3, 64, 4, 68) >= 4, "a major third under 3–4 is not");
});

test("a fifth goes to 1–3, 1–4 or 1–5 rather than 1–2", () => {
  assert.ok(
    stretch(1, 60, 2, 67) > stretch(1, 60, 3, 67) + 1,
    "C–G under 1–2 is dearer than under 1–3",
  );
  assert.ok(stretch(1, 60, 2, 64) === 0, "a third under 1–2 is relaxed");
  // Open chords: A3 E4 A4 and E4 B4 E5 are 1 3 5, not 1 2 5.
  for (const chord of [
    [57, 64, 69],
    [64, 71, 76],
  ]) {
    const { all } = passage([[chord, 0, 2]], "right", 72);
    assert.deepEqual(all, [1, 3, 5], `${chord}`);
  }
  // 龙卷风 b24 (left hand, ♩=76): after the D octave, D3 then A3 is 3–1.
  const tornado = passage(
    [
      [[38, 50], 23, 0.25],
      [[38, 50], 23.25, 0.5],
      [50, 24, 0.5],
      [57, 24.5, 0.5],
      [66, 25, 0.5],
      [62, 25.5, 0.5],
    ],
    "left",
    76,
  );
  assert.equal(tornado.finger(4), 3, "D3 under 3");
  assert.equal(tornado.finger(5), 1, "A3 under the thumb");
});

test("slow dyads keep the thumb under the lower note", () => {
  // 晴天 bars 3–4 (♩=72): B4–D5, B4–E5, B4–D5, A4–D5, then F♯4 A4 D5.
  const rows = [
    [[71, 74], 9, 1],
    [[71, 76], 11, 1],
    [[71, 74], 13, 1],
    [[69, 74], 14.5, 1],
    [[66, 69, 74], 15.5, 0.5],
  ];
  const right = passage(rows, "right", 72);
  right.notes.forEach((n, i) => {
    const lowest = Math.min(
      ...right.notes.filter((m) => m.beat === n.beat).map((m) => m.midi),
    );
    if (n.midi === lowest) assert.equal(right.finger(i), 1, `beat ${n.beat}`);
  });
  // Mirrored for the left hand: the thumb takes the upper note.
  const left = passage(
    rows.map(([p, beat, d]) => [[p].flat().map((m) => m - 24), beat, d]),
    "left",
    72,
  );
  left.notes.forEach((n, i) => {
    const highest = Math.max(
      ...left.notes.filter((m) => m.beat === n.beat).map((m) => m.midi),
    );
    if (n.midi === highest) assert.equal(left.finger(i), 1, `beat ${n.beat}`);
  });
});

test("slow octaves are 5–1, on black keys as on white", () => {
  // Moonlight-style left-hand octaves, a bar each (♩=54).
  const roots = [37, 42, 39, 36, 35, 44, 37];
  const { notes, finger } = passage(
    roots.map((r, i) => [[r - 12, r], i * 4, 4]),
    "left",
    54,
  );
  notes.forEach((n, i) => {
    const low = notes.some((m) => m.beat === n.beat && m.midi > n.midi);
    assert.equal(finger(i), low ? 5 : 1, `${n.midi} at beat ${n.beat}`);
  });
});

test("identical bars take identical fingering, even when entered differently", () => {
  // Prelude in C, left hand (♩=60): each bar is one half bar played twice, a
  // bass held under a tenor note. The first half follows another harmony,
  // the second follows itself; both must read the same.
  const bars = [
    [50, 57], // D3 A3
    [55, 59], // G3 B3
    [55, 58], // G3 B♭3
    [48, 52], // C3 E3
    [42, 48], // F♯2 C3
  ];
  const rows = [];
  bars.forEach(([bass, tenor], bar) => {
    for (const half of [0, 2]) {
      rows.push([bass, bar * 4 + half, 2]);
      rows.push([tenor, bar * 4 + half + 0.25, 1.75]);
    }
  });
  const { finger } = passage(rows, "left", 60);
  bars.forEach((_, bar) => {
    const first = [0, 1].map((k) => finger(bar * 4 + k));
    const second = [2, 3].map((k) => finger(bar * 4 + k));
    assert.deepEqual(second, first, `bar ${bar + 1}`);
  });
  // An Alberti bass (C E G E) repeated through a bar after a different bar.
  const alberti = [];
  [55, 59, 62, 59].forEach((m, i) => alberti.push([m, i * 0.5, 0.5]));
  for (let k = 0; k < 4; k++)
    [48, 55, 52, 55].forEach((m, i) =>
      alberti.push([m, 2 + k * 2 + i * 0.5, 0.5]),
    );
  const albertiFingers = passage(alberti, "left", 100).all.slice(4);
  for (let k = 1; k < 4; k++)
    assert.deepEqual(
      albertiFingers.slice(k * 4, k * 4 + 4),
      albertiFingers.slice(0, 4),
      `copy ${k + 1}`,
    );
});

test("a long note inside a bar still joins the next one legato", () => {
  // Moonlight bars 12–13, right hand (♩=54): triplets under a held G4,
  // then the melody F♯4, F♯4 held two beats (2.2 s), G4, E4, F♯4.
  const triplets = [55, 60, 64, 55, 59, 64, 55, 61, 64];
  const { finger } = passage(
    [
      [67, 44, 3],
      ...triplets.map((m, i) => [m, 44 + i / 3, 1 / 3]),
      [66, 47, 1],
      [66, 48, 2],
      [67, 50, 1],
      [64, 51, 1],
      [66, 52, 2],
    ],
    "right",
    54,
  );
  const [held, g4] = [11, 12];
  assert.equal(
    finger(g4),
    finger(held) + 1,
    "the next finger takes G4, rather than the same one lifted onto it",
  );
  // A long note closing a phrase at the bar line is the moment to move:
  // Gymnopédie's D5, held five beats, then D E F G A from the thumb (♩=60).
  const gymnopedie = passage(
    [
      [71, 69, 1],
      [72, 70, 1],
      [71, 71, 1],
      [74, 72, 5],
      [74, 77, 1],
      [76, 78, 1],
      [77, 79, 1],
      [79, 80, 1],
      [81, 81, 1],
    ],
    "right",
    60,
  );
  assert.deepEqual(gymnopedie.all.slice(4), [1, 2, 3, 4, 5]);
});

test("a repeated quarter keeps its finger up to ♩=160; a repeat may change only before quick notes", () => {
  // Twinkle at a brisk tempo: F F E E D D C is still 4 4 3 3 2 2 1, not a
  // substitution on D (1 2) to bring the thumb back to C.
  const twinkle = demos().find((s) => s.title.startsWith("Twinkle"));
  const a = "1 1 4 4 5 5 4",
    b = "4 4 3 3 2 2 1",
    c = "5 5 4 4 3 3 2";
  for (const bpm of [140, 150, 160]) {
    const score = { ...twinkle, bpm };
    const f = fingerScore(score.notes, (beat) => secondsAt(score, beat));
    assert.equal(
      score.notes.map((n) => f.get(n.id)).join(" "),
      [a, b, c, c, a, b].join(" "),
      `♩=${bpm}`,
    );
  }
  // 晴天 bar 10 (♩=66): D5 D5 G4 G4 in eighths, then A B A G in sixteenths
  // and D4. Changing 1 to 2 on the second G readies the hand for the run.
  const { all } = passage(
    [
      [74, 0, 0.5],
      [74, 0.5, 0.5],
      [67, 1, 0.5],
      [67, 1.5, 0.5],
      [69, 2, 0.25],
      [71, 2.25, 0.25],
      [69, 2.5, 0.25],
      [67, 2.75, 0.25],
      [62, 3, 0.5],
    ],
    "right",
    66,
  );
  assert.equal(all.join(" "), "5 5 1 2 3 4 3 2 1");
});

// Triplets (a third of a beat each) from `start`.
const triplets = (start, keys) => keys.map((m, i) => [m, start + i / 3, 1 / 3]);
// Consecutive single notes on different keys that share a finger.
const sameFingerMoves = ({ notes, finger }) =>
  notes.filter(
    (n, i) =>
      i > 0 &&
      notes[i - 1].beat < n.beat &&
      notes[i - 1].midi !== n.midi &&
      finger(i - 1) === finger(i),
  );

test("a held key anchors the hand: the voice moving beside it takes neighbouring fingers", () => {
  // Moonlight bar 7, right hand (♩=54): G♯4 then A4 held two beats by 5
  // over triplets. A3 C♯4 F♯4 is 1 2 3, never the thumb on A3 and C♯4.
  const moon = passage(
    [
      [68, 0, 2],
      ...triplets(0, [56, 61, 64, 56, 61, 64]),
      [69, 2, 2],
      ...triplets(2, [57, 61, 66, 57, 61, 66]),
    ],
    "right",
    54,
  );
  assert.equal(moon.all.join(" "), "5 1 2 3 1 2 3 5 1 2 3 1 2 3");
  // Under a held chord (E4 G4, ♩=69), D5 C5 B4 in sixteenths: C5 does not
  // take D5's finger, and B4 is not reached by 5 passing under 4.
  const chord = passage(
    [
      [[64, 67], 0, 2],
      [74, 0.25, 0.25],
      [74, 0.5, 0.25],
      [74, 0.75, 0.25],
      [74, 1, 0.25],
      [72, 1.25, 0.25],
      [71, 1.5, 0.25],
    ],
    "right",
    69,
  );
  const [d5, c5, b4] = [5, 6, 7].map(chord.finger);
  assert.notEqual(c5, d5, "C5 is not D5's finger lifted");
  assert.ok(b4 < c5, `B4 (${b4}) lies under a lower finger than C5 (${c5})`);
});

test("a held key anchors the hand only within reach; a far bass is the pedal's", () => {
  // Gymnopédie, left hand (♩=60): a bass note held three beats under a
  // chord more than an octave above. The bass does not anchor the hand, so
  // the chord keeps its shape (4 2 1, 5 left on the bass), as the hand
  // model's pedal ring for an unreachable hold expects.
  const bars = [
    [43, [59, 62, 66]], // G2 | B3 D4 F♯4
    [38, [57, 61, 66]], // D2 | A3 C♯4 F♯4
  ];
  const rows = bars.flatMap(([bass, chord], i) => [
    [bass, i * 3, 3],
    [chord, i * 3 + 1, 2],
  ]);
  assert.equal(passage(rows, "left", 60).all.join(" "), "5 4 2 1 5 4 2 1");
  // Within reach the hand is anchored: under a held F♯4 (♩=54) the
  // triplet B3 D♯4 F♯4… takes neighbouring fingers, not the thumb twice.
  const held = passage(
    [[71, 0, 2], ...triplets(0, [59, 63, 66, 59, 63, 66])],
    "right",
    54,
  );
  assert.deepEqual(sameFingerMoves(held), []);
});
