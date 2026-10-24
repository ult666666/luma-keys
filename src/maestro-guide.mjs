import { barStart, measureAt, noteName, usesFlats } from "./music.mjs";

// Build once per score/hand. Selecting a cue while playing is a Map lookup.
export function buildMaestroGuide(score, hand = "both") {
  const bars = new Map();
  const flats = usesFlats(score);
  const carries = new Int32Array(score.measures + 2);
  for (const note of score.notes || []) {
    if (hand !== "both" && note.hand !== hand) continue;
    const bar = Math.min(score.measures, measureAt(score, note.beat));
    if (!bars.has(bar)) bars.set(bar, []);
    bars.get(bar).push(note);
    const end = note.beat + Math.max(0, note.duration);
    let endBar = Math.min(score.measures, measureAt(score, end));
    // measureAt intentionally snaps nearly exact bar lines forward. A release
    // on the line belongs to the preceding bar for carry-over guidance.
    if (endBar > bar && barStart(score, endBar) >= end - 1e-5) endBar--;
    if (endBar > bar) {
      carries[bar + 1]++;
      carries[endBar + 1]--;
    }
  }
  const guide = new Map();
  let held = 0;
  for (let bar = 1; bar <= score.measures; bar++) {
    held += carries[bar];
    const notes = bars.get(bar) || [];
    if (!notes.length) {
      if (held)
        guide.set(bar, {
          title: "Keep the written notes held",
          text: "Notes continue from the previous bar. Follow their written lengths before releasing the keys.",
        });
      continue;
    }
    const ordered = notes
      .slice()
      .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    const start = barStart(score, bar);
    const first = ordered[0];
    const chords = new Map();
    let chordHand = null;
    let leap = null;
    const previous = {};
    for (const n of ordered) {
      const key = `${n.hand}:${Math.round(n.beat * 1e5)}`;
      if (!chords.has(key)) chords.set(key, new Set());
      chords.get(key).add(n.midi);
      if (chords.get(key).size >= 2) chordHand = n.hand;
      const prev = previous[n.hand];
      if (
        prev &&
        n.beat > prev.beat + 1e-5 &&
        Math.abs(n.midi - prev.midi) >= 7 &&
        !leap
      )
        leap = { from: prev.midi, to: n.midi, hand: n.hand };
      previous[n.hand] = n;
    }
    const black = ordered.find((n) =>
      [1, 3, 6, 8, 10].includes(((n.midi % 12) + 12) % 12),
    );
    const longBass =
      hand === "both" &&
      ordered.find(
        (n) =>
          n.hand === "left" &&
          n.duration >= 2 &&
          ordered.some(
            (r) =>
              r.hand === "right" &&
              r.beat > n.beat &&
              r.beat < n.beat + n.duration - 1e-5,
          ),
      );
    const who = (h) => (h === "left" ? "Left hand" : "Right hand");
    if (first.beat > start + 1e-5)
      guide.set(
        bar,
        held
          ? {
              title: "Prepare the next entry",
              text: `Notes carry into this bar. Follow their written lengths and prepare ${noteName(first.midi, flats)}.`,
            }
          : {
              title: "Count the opening rest",
              text: `The first note here enters after the bar starts. Keep counting before ${noteName(first.midi, flats)}.`,
            },
      );
    else if (longBass)
      guide.set(bar, {
        title: "Keep the bass held",
        text: `Hold ${noteName(longBass.midi, flats)} while the right hand continues. Follow its written duration.`,
      });
    else if (chordHand)
      guide.set(bar, {
        title: `${who(chordHand)} chord`,
        text: "Notes lined up vertically start together. Place the hand before the chord arrives.",
      });
    else if (leap)
      guide.set(bar, {
        title: `${who(leap.hand)} move`,
        text: `Find ${noteName(leap.to, flats)} before moving from ${noteName(leap.from, flats)}. Keep the wrist loose.`,
      });
    else if (black)
      guide.set(bar, {
        title: `Watch ${noteName(black.midi, flats)}`,
        text: "This bar uses a black key. Check its position between the surrounding white keys.",
      });
    else if (ordered.some((n) => n.duration <= 0.5))
      guide.set(bar, {
        title: "Keep the shorter notes even",
        text: "Read the next group while keeping a steady pulse. Slow the tempo if the notes feel crowded.",
      });
    else
      guide.set(bar, {
        title: "Read the next note",
        text: "Keep your eyes one note ahead. Hold each note for its written length.",
      });
  }
  return guide;
}

export function maestroPlayingCue({
  guide,
  bar,
  playing,
  mode,
  count = 0,
  finished = false,
  misses = 0,
}) {
  if (finished)
    return {
      title: "Section complete",
      text: "Review this passage or choose another piece.",
    };
  if (count > 0)
    return {
      title: `Count in · ${count}`,
      text: "Set your hands and follow the count before the first note.",
    };
  if (playing && mode === "wait" && misses > 0)
    return {
      title: "Check the highlighted keys",
      text: "Play every note in the current chord. You can take your time.",
    };
  const cue = guide.get(bar) || {
    title: "Count through the rest",
    text: "Keep the pulse through the empty bar and prepare the next entry.",
  };
  return { ...cue, bar };
}
