const EPS = 1e-6;

export function listenWindowNotes(notes, start, end) {
  return notes.filter(
    (note) => note.beat < end - EPS && note.beat + note.duration > start + EPS,
  );
}

// Written quarter-note duration that still belongs to this playback window.
// Also clips a late animation-frame attack instead of extending it past its
// original note end or the selected loop/end-of-score boundary.
export function listenNoteDuration(note, from, end) {
  return Math.max(
    0,
    Math.min(note.beat + note.duration, end) - Math.max(note.beat, from),
  );
}

// Input is the score's normalized, onset-sorted and hand-filtered note array.
// New onsets stay in the ordinary scheduler; only already-sounding notes are
// restarted once with their remaining duration after resume/jump/loop wrap.
export function planListenStart(notes, from, end) {
  const threshold = Math.max(0, from) - EPS;
  let lo = 0,
    hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].beat < threshold) lo = mid + 1;
    else hi = mid;
  }
  const continuations = [];
  if (from >= 0 && from < end - EPS) {
    for (let i = 0; i < lo; i++) {
      const note = notes[i];
      const duration = listenNoteDuration(note, from, end);
      if (duration > EPS) continuations.push({ note, duration });
    }
  }
  return { index: lo, continuations };
}
