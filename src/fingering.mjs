// Suggested fingering: finger 1 (thumb) to 5 (little finger), chosen so each
// hand's passages lie comfortably under it. Unsupported notes have no inferred
// finger; the contact timeline retains them for explicit key-only guidance. A dynamic
// programme over each hand's chords weighs how far each pair of fingers has
// to stretch (after Parncutt et al., "An ergonomic model of keyboard
// fingering", 1997), crossings under the thumb, weak fingers, black keys,
// held notes, and how much time there is to move: silence and the long note
// closing a phrase are moments to move, a long note inside a bar is not.
// A held key within reach anchors the hand, so the voice beside it moves
// on neighbouring fingers.
// A second pass fingers a figure repeated at once (exactly or an octave
// apart) the same way in every copy.

// Distances in semitones from the lower-numbered finger to the higher, for
// the right hand: practical minimum, comfortable minimum, relaxed minimum,
// relaxed maximum, comfortable maximum, practical maximum. Negative means
// the higher finger crosses over (or the thumb passes under).
const PAIRS = {
  "1,2": [-6, -3, 1, 5, 8, 10],
  "1,3": [-6, -2, 3, 7, 10, 12],
  "1,4": [-5, -1, 5, 9, 12, 14],
  "1,5": [-2, 1, 7, 10, 13, 15],
  "2,3": [1, 1, 1, 2, 3, 5],
  "2,4": [1, 1, 3, 4, 5, 7],
  "2,5": [2, 2, 5, 6, 8, 10],
  "3,4": [1, 1, 1, 2, 2, 4],
  "3,5": [1, 1, 3, 4, 5, 7],
  "4,5": [1, 1, 1, 2, 3, 5],
};
// Where each finger rests relative to the thumb in a five-finger position
// (C D E F G), for the hand's place on the keyboard.
export const FINGER_OFFSET = [0, 0, 2, 4, 5, 7];
const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (midi) => BLACK.has(((midi % 12) + 12) % 12);
const TOO_FAR = 40;
// The widest span of one hand (semitones): 1–5's practical maximum.
const SPAN = 15;

// The cost of fingers a and b on keys pa and pb (hand space: pitch for the
// right hand, mirrored for the left) at once or one after the other. `quick`:
// one after the other in a fast figure, where opening thumb and index wide
// is how the hand covers ground.
export function stretch(fa, pa, fb, pb, quick = false) {
  if (fa === fb) return pa === pb ? 0 : TOO_FAR;
  const [lo, hi] = fa < fb ? [fa, fb] : [fb, fa];
  const d = fa < fb ? pb - pa : pa - pb;
  const [minP, minC, minR, maxR, maxC, maxP] = PAIRS[lo + "," + hi];
  if (d < minP) return TOO_FAR;
  // Out of reach; when a chord cannot be spanned at all, the pair of
  // fingers that falls least short takes the gap (5 3 1 for three octave
  // keys, not 5 4 1 with 4 and 5 an octave apart).
  if (d > maxP) return TOO_FAR + (10 * (d - maxP)) / maxP;
  // A minor third between 3 and 4 is an easy reach in a five-finger
  // position (E–G in C D E G A); a major third there is not.
  if (lo === 3 && hi === 4 && d === 3) return 1;
  // A finger crossing over the thumb (or the thumb passing under): natural in
  // scales and arpeggios, dearer the further it reaches and for the weak fingers.
  if (d < 0) return 3.5 + 0.5 * -d + (hi === 4 ? 0.5 : 0) + (hi === 5 ? 3 : 0);
  const thumb = lo === 1;
  let cost = 0;
  if (d < minC) cost += 2 * (minC - d);
  if (d > maxC) cost += 2 * (d - maxC);
  if (d < minR) cost += (thumb ? 0.5 : 1) * (minR - d);
  // The thumb opens wide from 3, 4 and 5, but a fifth or more between thumb
  // and index is a stretch at a calm pace or in a chord: 1–4 or 1–5 span it
  // in a five-finger position.
  const wide = thumb ? (hi === 2 && !quick ? 0.75 : 0.5) : 1;
  if (d > maxR) cost += wide * (d - maxR);
  return cost;
}
// Silence (seconds) long enough to lift the hand, and to place it afresh.
const RESTING = 0.3;
const LONG_REST = 1;
// A held note this long (seconds) closing a phrase is time to start afresh.
const LONG_BREATH = 2;
// A key repeated at this pace or slower (seconds; a quarter note at ♩=125)
// keeps its finger in a melody. Quicker repetitions may change fingers only
// when they are fast themselves (under RESTING) or lead into notes that are.
const REPEAT_SLOW = 0.48;
// Slow music leaves time to move the hand; fast runs must lie under it.
const hurry = (gap) =>
  gap < 0.12 ? 1.3 : gap < 0.25 ? 1.1 : gap < 0.5 ? 1 : gap < 1 ? 0.7 : 0.5;
// Moving the whole hand to a new place: very dear in a fast run, easy with time.
const shift = (gap, distance) =>
  (gap < 0.3 ? 14 : gap < 0.6 ? 9 : 5) + Math.min(10, distance * 0.1);
// One finger after another, into chord `at` (its silence before, whether a
// phrase breathes before it, whether either side is a chord).
function step(fa, pa, ra, fb, pb, rb, gap, at = {}) {
  const rest = at.rest || 0;
  // A rest, or the long note closing a phrase, is the moment to move.
  const free = rest >= RESTING || at.breath;
  if (fa === fb) {
    // A repeated key may keep its finger; another key means lifting it,
    // which breaks a legato line unless there is a moment to move.
    if (pa === pb) return 0.5 * hurry(gap);
    // Beyond an octave it is a leap of the whole hand, whichever finger.
    if (Math.abs(pb - pa) > 12) return shift(gap, Math.abs(pb - pa));
    const lift =
      gap < 0.3 ? 8 : gap < 0.6 ? 5 : at.breath ? 0.5 : free ? 1 : 2.5;
    return lift + Math.abs(pb - pa) * 0.2;
  }
  let cost = stretch(fa, pa, fb, pb, gap < 0.3);
  if (cost >= TOO_FAR) return shift(gap, Math.abs(pb - pa));
  if (fa === 3 && fb === 4) cost += 0.5;
  if (fa === 3 && fb === 4 && !isBlack(ra) && isBlack(rb)) cost += 0.5;
  // Passing the thumb under onto a black key is awkward.
  const crossing =
    (fb === 1 && fa !== 1 && pb > pa) || (fa === 1 && fb !== 1 && pb < pa);
  if (crossing && isBlack(fb === 1 ? rb : ra)) cost += 2;
  // Keep the hand where it is when the notes allow (a crossing moves it by
  // design, and is priced as a crossing).
  // A slow legato tune gives time to move, but a learner still reads it best
  // from one position, so the move is not cheaper there than at a moderate
  // pace, except at a moment to move.
  const moved = crossing
    ? 0
    : 0.2 * Math.abs(pb - FINGER_OFFSET[fb] - (pa - FINGER_OFFSET[fa]));
  const settle = free ? hurry(gap) : Math.max(1, hurry(gap));
  // Changing fingers on a repeated key helps a fast repetition, or readies
  // the hand for quick notes straight after (G G A B A G D in sixteenths:
  // 1 2 3 4 3 2 1); in an even melody (Twinkle's quarters, even at ♩=160)
  // it only unsettles the hand.
  const change =
    pa === pb &&
    !free &&
    !at.chord &&
    (gap >= REPEAT_SLOW || (gap >= RESTING && at.ahead >= RESTING))
      ? 2
      : 0;
  return cost * hurry(gap) + moved * settle + change;
}
// The weak fingers matter in quick passages; a melody at a walking pace is
// played in one position with all five (pace: seconds to the hand's nearest
// onset). In a chord 4 and 5 keep their full price, so a slow dyad keeps the
// thumb under its lower note.
const weakness = (pace, chord) =>
  chord ? 1 : pace < 0.2 ? 1 : pace < 0.4 ? 0.75 : 0.5;
function fingerCost(f, real, pace = 0, chord = false, thumbBlack = false) {
  let cost = 0;
  if (f === 4) cost += 0.6 * weakness(pace, chord);
  if (f === 5) cost += 0.25 * weakness(pace, chord);
  if (isBlack(real) && f === 1) cost += 1.2;
  // The little finger reaching in onto a black key; with the thumb on a
  // black key too (a black-key octave) the whole hand simply sits forward.
  if (isBlack(real) && f === 5 && !thumbBlack) cost += 0.6;
  return cost;
}
// All increasing choices of k fingers out of five.
const CHOICES = [[], [], [], [], [], []];
for (let mask = 1; mask < 32; mask++) {
  const fingers = [1, 2, 3, 4, 5].filter((f) => mask & (1 << (f - 1)));
  CHOICES[fingers.length].push(fingers);
}

const EPSILON = 1e-6;
// User choices take precedence over written score annotations. Invalid values
// are not invented finger numbers; imported ambiguous substitutions stay unset.
export function explicitFinger(note) {
  const value = Number(note.fingerOverride ?? note.fingeringOverride ??
    (note.fingeringSource === 'suggested' ? null : note.finger ?? note.fingering));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}
const outerNotes = (notes, count) =>
  notes.length <= count
    ? notes
    : count === 0
      ? []
      : [
          ...notes.slice(0, Math.floor(count / 2)),
          ...notes.slice(-Math.ceil(count / 2)),
        ];
function stateFor(group, fingers) {
  const indexes = fingers.flatMap((f, i) => (f ? [i] : []));
  let cost = 0;
  // Keep explicit choices in the phrase search, so the surrounding inferred
  // notes prepare for them. Contradictory choices are preserved at output and
  // reported by the contact planner rather than silently rewritten here.
  for (let i = 0; i < group.notes.length; i++) {
    const chosen = explicitFinger(group.notes[i]);
    if (chosen && fingers[i] !== chosen) cost += 1e6;
  }
  const thumb = fingers.indexOf(1);
  const thumbBlack = thumb >= 0 && isBlack(group.notes[thumb].midi);
  for (let j = 0; j < indexes.length; j++) {
    const i = indexes[j];
    cost += fingerCost(
      fingers[i],
      group.notes[i].midi,
      group.pace,
      indexes.length > 1,
      thumbBlack,
    );
    if (j) {
      const previous = indexes[j - 1];
      const reach = stretch(
        fingers[previous],
        group.pitches[previous],
        fingers[i],
        group.pitches[i],
      );
      // An out-of-reach held key makes this contact set unrepresentable.
      // Keep its assignment; the pose planner will show accurate key guidance
      // rather than assume a pedal or stretch the hand.
      cost +=
        reach > TOO_FAR && (group.held.has(i) || group.held.has(previous))
          ? TOO_FAR
          : reach;
    }
  }
  // An impossible passage may leave a new note without a suggestion. Never
  // trade a held finger for that note or invent a second key under one finger.
  cost += group.notes.reduce(
    (sum, _n, i) => sum + (!fingers[i] && !group.held.has(i) ? 1000 : 0),
    0,
  );
  const pos = indexes.length
    ? indexes.reduce(
        (sum, i) => sum + group.pitches[i] - FINGER_OFFSET[fingers[i]],
        0,
      ) / indexes.length
    : 0;
  return { fingers, indexes, cost, pos };
}

// Only needed when no complete chord can preserve its held fingers. Retain
// their exact assignments and enumerate partial suggestions for the new keys.
// A group has at most five keys, so this stays bounded (at most 252 shapes).
function partialStates(group, previous, best) {
  const unique = new Map();
  previous.states.forEach((state, si) => {
    if (!Number.isFinite(best[si].total)) return;
    const fingers = Array(group.notes.length).fill(0);
    const reserved = new Set(
      [...group.held.values()].map((i) => state.fingers[i]).filter(Boolean),
    );
    const visit = (index, last) => {
      if (index === fingers.length) {
        unique.set(fingers.join(","), stateFor(group, [...fingers]));
        return;
      }
      if (group.held.has(index)) {
        const f = state.fingers[group.held.get(index)];
        if (f && f <= last) return;
        fingers[index] = f;
        visit(index + 1, f || last);
      } else {
        fingers[index] = 0;
        visit(index + 1, last);
        for (let f = last + 1; f <= 5; f++) {
          if (reserved.has(f)) continue;
          fingers[index] = f;
          visit(index + 1, f);
        }
      }
    };
    visit(0, 0);
  });
  return [...unique.values()];
}

// Fingers for one hand's notes: returns Map(note id → finger).
export function fingerHand(notes, hand, secondsAt = (beat) => beat * 0.5) {
  const sign = hand === "left" ? -1 : 1;
  const sorted = [...notes].sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const groups = [];
  for (const n of sorted) {
    const last = groups.at(-1);
    if (last && Math.abs(last.beat - n.beat) < 1e-6) last.notes.push(n);
    else groups.push({ beat: n.beat, notes: [n] });
  }
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const previous = groups[gi - 1];
    g.measure = g.notes[0].measure;
    // A unison in two written voices is one physical key. Keep every note id
    // and the longest sounding end, so one voice's release cannot free it early.
    const byPitch = new Map();
    for (const note of g.notes) {
      const same = byPitch.get(note.midi);
      byPitch.set(
        note.midi,
        same
          ? {
              ...same,
              aliases: [...(same.aliases || [same.id]), note.id],
              duration:
                Math.max(same.beat + same.duration, note.beat + note.duration) -
                same.beat,
            }
          : note,
      );
    }
    g.notes = [...byPitch.values()];
    // Hand space: low to high under the hand (the left hand is mirrored).
    g.notes.sort((a, b) => sign * (a.midi - b.midi));
    // Carry every still-held key through every onset, not just its immediately
    // following chord. A new attack of the same pitch replaces the old hold.
    const carried = (previous?.notes || []).filter(
      (n) =>
        n.beat + n.duration > g.beat + EPSILON &&
        !g.notes.some((m) => m.midi === n.midi),
    );
    // If a hand needs more than five keys, preserve its held keys first and
    // suggest only the outer new keys that fit. Unsupported notes are omitted.
    g.notes = [...carried, ...outerNotes(g.notes, 5 - carried.length)].sort(
      (a, b) => sign * (a.midi - b.midi),
    );
    g.held = new Map();
    carried.forEach((note) =>
      g.held.set(g.notes.indexOf(note), previous.notes.indexOf(note)),
    );
    g.pitches = g.notes.map((n) => sign * n.midi);
    g.time = secondsAt(g.beat);
    g.starts = g.notes.map((n) => secondsAt(n.beat));
    // How long each key still sounds from this onset (seconds).
    g.lasts = g.notes.map((n) => secondsAt(n.beat + n.duration) - g.time);
  }
  let sounding = -Infinity;
  groups.forEach((g, gi) => {
    // Silence in this hand before the chord: every earlier key released.
    g.rest = Math.max(0, g.time - sounding);
    for (const n of g.notes)
      sounding = Math.max(sounding, secondsAt(n.beat + n.duration));
    // A phrase breathes after a long note held to the bar line: one held
    // about twice as long as the note before it, or two seconds or more.
    // (A long note within the bar still joins the next one legato.)
    const into = gi ? g.time - groups[gi - 1].time : 0;
    const before = gi > 1 ? groups[gi - 1].time - groups[gi - 2].time : 0;
    g.into = into;
    g.breath =
      gi > 0 &&
      (g.measure === undefined || g.measure !== groups[gi - 1].measure) &&
      (into >= LONG_BREATH || (gi > 1 && into >= 0.75 && into >= 1.8 * before));
    // How quick the music runs straight after this onset (seconds).
    g.ahead = Math.min(
      gi + 1 < groups.length ? groups[gi + 1].time - g.time : Infinity,
      gi + 2 < groups.length
        ? groups[gi + 2].time - groups[gi + 1].time
        : Infinity,
    );
    g.pace = Math.min(
      gi ? g.time - groups[gi - 1].time : Infinity,
      gi + 1 < groups.length ? groups[gi + 1].time - g.time : Infinity,
    );
    g.states = CHOICES[g.notes.length].map((fingers) => stateFor(g, fingers));
  });
  const path = viterbi(groups).path;
  // Identical bars are fingered identically: where a figure repeats straight
  // away, exactly or an octave apart (an Alberti or broken-chord bar, a
  // scale's next octave), every copy takes the one fingering that serves the
  // whole run best, rather than the first copy differing only because it is
  // entered from elsewhere. Only when that costs little: a copy that must
  // prepare something new may differ.
  for (let start = 0; start < groups.length;) {
    const run = repeatAt(groups, start);
    if (!run) {
      start++;
      continue;
    }
    const { period, count } = run;
    const end = start + period * count - 1;
    const copy = (k) =>
      path.slice(start + k * period, start + (k + 1) * period);
    let differ = false;
    for (let k = 1; k < count && !differ; k++)
      differ = copy(k).join() !== copy(0).join();
    if (!differ) {
      start = end + 1;
      continue;
    }
    // Re-plan a little either side of the run; its edges stay as they are.
    const lo = Math.max(0, start - REPLAN),
      hi = Math.min(groups.length - 1, end + REPLAN);
    const plan = tiedPlan(groups, path, start, period, count, lo, hi);
    if (
      plan &&
      plan.total <= pathCost(groups, path, lo, hi) + CONSISTENCY * count
    ) {
      plan.path.forEach((si, k) => (path[lo + k] = si));
      start = end + 1;
    } else start++;
  }
  const fingers = new Map();
  path.forEach((si, gi) => {
    const g = groups[gi];
    g.states[si].fingers.forEach((f, i) => {
      if (f)
        for (const id of g.notes[i].aliases || [g.notes[i].id])
          fingers.set(id, f);
    });
  });
  for (const note of notes) {
    const chosen = explicitFinger(note);
    if (chosen) fingers.set(note.id, chosen);
  }
  return fingers;
}
// How far either side of a repeated run its neighbours may be re-planned,
// and what one copy may pay to match the others.
const REPLAN = 4;
const CONSISTENCY = 1;

// The cheapest fingering of chords lo..hi in which every copy of the run
// (count copies of period chords from start) takes the same shapes, with
// chords lo and hi kept as they are in path. Returns { path (from lo),
// total } or null.
function tiedPlan(groups, path, start, period, count, lo, hi) {
  const end = start + period * count - 1;
  const at = (k, j) => groups[start + k * period + j];
  const shapes = (gi) => groups[gi].states.map((_, si) => si);
  // Into the run: the cheapest way from chord lo (as it is) to each shape of
  // the first chord of the run, that chord's own cost included.
  const before = [];
  let into = groups[lo].states.map((st, si) =>
    lo === start || si === path[lo] ? st.cost : Infinity,
  );
  for (let gi = lo + 1; gi <= start; gi++) {
    const a = groups[gi - 1],
      b = groups[gi];
    const from = [];
    into = b.states.map((sb, bi) => {
      let top = Infinity;
      a.states.forEach((sa, ai) => {
        const total = into[ai] + transition(a, sa, b, sb) + sb.cost;
        if (total < top - EPSILON) [top, from[bi]] = [total, ai];
      });
      return top;
    });
    before.push(from);
  }
  // Out of the run: the cheapest way from each shape of its last chord to
  // chord hi (as it is), the later chords' own costs included.
  const after = [];
  let out = groups[hi].states.map((st, si) =>
    hi === end ? 0 : si === path[hi] ? 0 : Infinity,
  );
  for (let gi = hi - 1; gi >= end; gi--) {
    const a = groups[gi],
      b = groups[gi + 1];
    const to = [];
    out = a.states.map((sa, ai) => {
      let top = Infinity;
      b.states.forEach((sb, bi) => {
        const total = transition(a, sa, b, sb) + sb.cost + out[bi];
        if (total < top - EPSILON) [top, to[ai]] = [total, bi];
      });
      return top;
    });
    after.unshift(to);
  }
  // Through the run, one shared shape per position, for each first shape.
  let best = null;
  for (const s0 of shapes(start)) {
    if (!Number.isFinite(into[s0])) continue;
    let cost = shapes(start).map((si) => {
      if (si !== s0) return Infinity;
      let c = into[s0];
      for (let k = 1; k < count; k++) c += at(k, 0).states[s0].cost;
      return c;
    });
    const trail = [];
    for (let j = 1; j < period; j++) {
      const from = [];
      cost = at(0, j).states.map((_, bi) => {
        let top = Infinity;
        cost.forEach((prev, ai) => {
          if (prev === Infinity) return;
          let total = prev;
          for (let k = 0; k < count && total < Infinity; k++) {
            const a = at(k, j - 1),
              b = at(k, j);
            total += transition(a, a.states[ai], b, b.states[bi]);
            total += b.states[bi].cost;
          }
          if (total < top - EPSILON) [top, from[bi]] = [total, ai];
        });
        return top;
      });
      trail.push(from);
    }
    cost.forEach((c, last) => {
      let total = c + out[last];
      for (let k = 0; k + 1 < count && total < Infinity; k++) {
        const a = at(k, period - 1),
          b = at(k + 1, 0);
        total += transition(a, a.states[last], b, b.states[s0]);
      }
      if (Number.isFinite(total) && (!best || total < best.total - EPSILON))
        best = { total, s0, last, trail };
    });
  }
  if (!best) return null;
  const plan = Array(hi - lo + 1);
  const shared = Array(period);
  shared[period - 1] = best.last;
  for (let j = period - 1; j > 0; j--)
    shared[j - 1] = best.trail[j - 1][shared[j]];
  for (let k = 0; k < count; k++)
    shared.forEach((si, j) => (plan[start + k * period + j - lo] = si));
  for (let gi = start; gi > lo; gi--)
    plan[gi - 1 - lo] = before[gi - lo - 1][plan[gi - lo]];
  for (let gi = end; gi < hi; gi++)
    plan[gi + 1 - lo] = after[gi - end][plan[gi - lo]];
  return { path: plan, total: best.total };
}

// The cost of moving from shape sa of chord a to shape sb of chord b
// (Infinity when a held key would change finger).
function transition(a, sa, b, sb) {
  for (const [i, previous] of b.held)
    if (sb.fingers[i] !== sa.fingers[previous]) return Infinity;
  const gap = Math.max(0, b.time - a.time);
  let move;
  if (!sa.indexes.length || !sb.indexes.length) move = 0;
  else if (sa.indexes.length === 1 && sb.indexes.length === 1) {
    const i = sa.indexes[0],
      j = sb.indexes[0];
    move = step(
      sa.fingers[i],
      a.pitches[i],
      a.notes[i].midi,
      sb.fingers[j],
      b.pitches[j],
      b.notes[j].midi,
      gap,
      b,
    );
  } else if (sa.indexes.length > 1 && sb.indexes.length > 1)
    // Chord to chord: the whole hand moves from one shape to the next.
    move = 0.5 * Math.abs(sb.pos - sa.pos) * hurry(gap);
  else {
    move = Infinity;
    for (const i of sa.indexes)
      for (const j of sb.indexes)
        move = Math.min(
          move,
          step(
            sa.fingers[i],
            a.pitches[i],
            a.notes[i].midi,
            sb.fingers[j],
            b.pitches[j],
            b.notes[j].midi,
            gap,
            { ...b, chord: true },
          ),
        );
    move += 0.25 * Math.abs(sb.pos - sa.pos) * hurry(gap);
  }
  move += anchoredMoves(a, sa, b, sb, gap);
  // A long rest, or a long breath, is time to place the hand anywhere; the
  // usual preferences only break ties.
  if (b.rest >= LONG_REST || (b.breath && b.into >= LONG_BREATH)) move *= 0.1;
  return move;
}

// While a key is held across an onset the hand is anchored to it and cannot
// shift as a whole: a finger that strikes a new key after playing another
// must lift and travel on its own (a triplet under a held melody note takes
// 1 2 3, not the thumb twice), and one long finger cannot pass another.
function anchoredMoves(a, sa, b, sb, gap) {
  if (!b.held.size) return 0;
  // Only a key within this model's span affects ordinary movement costs.
  // A wider held set is retained for the contact planner's explicit fallback.
  const near = [...b.held.keys()].some(
    (h) =>
      sb.indexes.every(
        (j) => b.held.has(j) || Math.abs(b.pitches[j] - b.pitches[h]) <= SPAN,
      ) &&
      sa.indexes.every((i) => Math.abs(a.pitches[i] - b.pitches[h]) <= SPAN),
  );
  if (!near) return 0;
  const kept = new Set(b.held.values());
  const moving = sb.indexes.filter((j) => !b.held.has(j));
  const struck = sa.indexes.filter(
    (i) => !kept.has(i) && Math.abs(a.starts[i] - a.time) < EPSILON,
  );
  let cost = 0;
  // A long finger cannot pass another while the hand is held in place (4 on
  // C5 then 5 on B4 under a held chord): that is a fresh placing.
  if (moving.length === 1 && struck.length === 1) {
    const i = struck[0],
      j = moving[0];
    const fa = sa.fingers[i],
      fb = sb.fingers[j];
    if (fa > 1 && fb > 1 && (fb - fa) * (b.pitches[j] - a.pitches[i]) < 0)
      cost += shift(gap, Math.abs(b.pitches[j] - a.pitches[i]));
  }
  for (const j of moving) {
    const f = sb.fingers[j];
    const i = sa.fingers.indexOf(f);
    if (i < 0 || a.pitches[i] === b.pitches[j]) continue;
    // The finger has had since it struck its key (it may have held it).
    const since = b.time - a.starts[i];
    cost += step(
      f,
      a.pitches[i],
      a.notes[i].midi,
      f,
      b.pitches[j],
      b.notes[j].midi,
      since,
      b,
    );
  }
  return cost;
}

// The cheapest shape for every chord from lo to hi (Viterbi), optionally
// with some chords' shapes fixed (Map(chord index → shape index)). Returns
// { path (shape indexes from lo), total }, or null when the fixed shapes
// cannot be joined.
function viterbi(groups, forced = null, lo = 0, hi = groups.length - 1) {
  if (hi < lo) return { path: [], total: 0 };
  const allowed = (gi, si) => !forced?.has(gi) || forced.get(gi) === si;
  let best = groups[lo].states.map((s, si) => ({
    total: allowed(lo, si) ? s.cost : Infinity,
    from: -1,
  }));
  const trail = [best];
  for (let gi = lo + 1; gi <= hi; gi++) {
    const a = groups[gi - 1],
      b = groups[gi];
    const advance = () =>
      b.states.map((sb, bi) => {
        let top = { total: Infinity, from: 0 };
        if (!allowed(gi, bi)) return top;
        a.states.forEach((sa, ai) => {
          const prev = best[ai].total;
          if (prev === Infinity) return;
          const total = prev + transition(a, sa, b, sb) + sb.cost;
          // Ties (to rounding) go to the first shape found, so equal
          // fingerings resolve the same way whatever the arithmetic order.
          if (total < top.total - EPSILON) top = { total, from: ai };
        });
        return top;
      });
    let next = advance();
    if (!next.some((s) => Number.isFinite(s.total))) {
      if (forced) return null;
      b.states = partialStates(b, a, best);
      next = advance();
    }
    best = next;
    trail.push(best);
  }
  let si = best.reduce(
    (bi, s, i) => (s.total < best[bi].total - EPSILON ? i : bi),
    0,
  );
  const total = best[si].total;
  if (!Number.isFinite(total)) return null;
  const path = Array(hi - lo + 1);
  for (let k = hi - lo; k >= 0; k--) {
    path[k] = si;
    si = trail[k][si].from;
  }
  return { path, total };
}

function pathCost(groups, path, lo, hi) {
  let cost = groups[lo].states[path[lo]].cost;
  for (let gi = lo + 1; gi <= hi; gi++) {
    const a = groups[gi - 1],
      b = groups[gi];
    cost +=
      transition(a, a.states[path[gi - 1]], b, b.states[path[gi]]) +
      b.states[path[gi]].cost;
  }
  return cost;
}

// A figure of two or more chords repeated at once from chord i, exactly or
// an octave apart (same keys, held keys, timing and shapes on offer):
// { period (chords), count (copies) }, or null. A copy must last long
// enough to be a figure (a bar, a beat's arpeggio), not the fast alternation
// of a trill, where fingers rightly change. (A repeated single key or chord
// is the repeated-key rule's business.)
const MAX_PERIOD = 16;
const MIN_FIGURE = 0.6;
function repeatAt(groups, i) {
  const same = (a, b, shift, first) =>
    a.notes.length === b.notes.length &&
    a.notes.every((n, x) => b.notes[x].midi === n.midi + shift) &&
    a.lasts.every((t, x) => Math.abs(b.lasts[x] - t) < 0.01) &&
    [...a.held].join() === [...b.held].join() &&
    a.states.length === b.states.length &&
    a.states.every(
      (st, x) => st.fingers.join() === b.states[x].fingers.join(),
    ) &&
    (first || Math.abs(a.rest - b.rest) < 0.01);
  // Does the copy at j repeat the one at i (p chords, span seconds later)?
  const repeat = (j, p, span) => {
    if (j + p > groups.length) return false;
    const shift = groups[j].notes[0].midi - groups[i].notes[0].midi;
    if (shift % 12) return false;
    for (let k = 0; k < p; k++) {
      const a = groups[i + k],
        b = groups[j + k];
      if (!same(a, b, shift, k === 0)) return false;
      if (Math.abs(b.time - a.time - span) > 1e-3) return false;
    }
    return true;
  };
  for (let p = 2; p <= MAX_PERIOD && i + 2 * p <= groups.length; p++) {
    const span = groups[i + p].time - groups[i].time;
    if (span < MIN_FIGURE || !repeat(i + p, p, span)) continue;
    let count = 2;
    while (repeat(i + count * p, p, count * span)) count++;
    return { period: p, count };
  }
  return null;
}

// Fingers for a whole score (both hands): Map(note id → finger).
export function fingerScore(notes, secondsAt) {
  const out = new Map();
  for (const hand of ["right", "left"]) {
    const mine = notes.filter(
      (n) => (n.hand === "left" ? "left" : "right") === hand,
    );
    for (const [id, f] of fingerHand(mine, hand, secondsAt)) out.set(id, f);
  }
  return out;
}
