import {
  listenNoteDuration,
  planListenStart,
  soundingEnd,
} from "./listen-start.mjs";
import { beatAtSeconds, secondsAt, secondsBetween } from "./tempo.mjs";

export function pianoReleaseBeat(score, note, end = Infinity) {
  const gate = note.pianoGate ?? 0.94;
  return Math.min(
    end,
    soundingEnd(score.pedals, note.beat + note.duration * gate),
  );
}

// Gates end at an absolute score position. Seeking into a note never starts
// its complete key hold again; written pedal can continue after the key lifts.
export function pianoNoteSeconds(score, speed, from, writtenEnd, end, note) {
  const keyEnd = note
    ? Math.min(writtenEnd, note.beat + note.duration * (note.pianoGate ?? 0.94))
    : from + (writtenEnd - from) * 0.94;
  const release = Math.min(end, soundingEnd(score.pedals, keyEnd));
  return Math.max(
    0,
    secondsBetween(score, from, Math.max(from, release), speed),
  );
}

export function planPianoStart(notes, from, end, score) {
  const plan = planListenStart(notes, from, end);
  if (from < 0 || from >= end) return plan;
  const continuations = [];
  for (let i = 0; i < plan.index; i++) {
    const note = notes[i],
      release = pianoReleaseBeat(score, note, end);
    if (release > from + 1e-6)
      continuations.push({
        note,
        duration: release - from,
        elapsedBeats: from - note.beat,
      });
  }
  return { index: plan.index, continuations };
}

// Queue a short window on the absolute audio clock, including the opening
// window before React/GPU playback work can delay the first animation frame.
// The returned index prevents replaying those attacks on the next frame.
export function planPianoWindow(
  notes,
  index,
  {
    score,
    speed = 1,
    origin,
    start,
    now,
    end = score.duration,
    aheadSeconds = 0.5,
  },
) {
  const originAt = secondsAt(score, origin);
  const beat = beatAtSeconds(score, originAt + (now - start) * speed);
  const ahead = beatAtSeconds(
    score,
    originAt + (now + aheadSeconds - start) * speed,
  );
  const attacks = [];
  while (index < notes.length && notes[index].beat <= ahead) {
    const note = notes[index++];
    // Keep later stalls from bursting notes already passed by the listener.
    if (note.beat < beat - 0.15 || note.beat >= end - 1e-6) continue;
    const from = Math.max(note.beat, beat);
    const length = listenNoteDuration(note, from, end);
    if (length <= 1e-6) continue;
    const duration = pianoNoteSeconds(
      score,
      speed,
      from,
      from + length,
      end,
      note,
    );
    if (duration <= 1e-6) continue;
    attacks.push({
      note,
      duration,
      when:
        start +
        secondsBetween(score, origin, note.beat, speed) +
        (note.beat >= beat ? note.pianoDelay || 0 : 0),
    });
  }
  return { index, attacks };
}
