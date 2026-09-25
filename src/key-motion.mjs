// Track currently sounding owners separately from attack generations. A key may
// have several score voices and a live player holding it at the same time.
export function keyMotionFrame(soundEvents = [], pressed = [], soundEpoch = 0) {
  const owners = new Map();
  const add = (midi, owner) => {
    if (!Number.isInteger(midi) || midi < 21 || midi > 108) return;
    if (!owners.has(midi)) owners.set(midi, new Set());
    owners.get(midi).add(owner);
  };
  for (const note of soundEvents) {
    add(
      note.midi,
      // A loop/resume can attack the same sustained note again without an
      // intervening silent render. Only score voices receive this generation;
      // a live key held through the wrap retains its independent ownership.
      "score:" +
        JSON.stringify([soundEpoch, note.id ?? [note.beat, note.duration]]),
    );
  }
  for (const midi of pressed) add(midi, "live");
  const signature = JSON.stringify(
    [...owners]
      .sort(([a], [b]) => a - b)
      .map(([midi, ids]) => [midi, [...ids].sort()]),
  );
  return { owners, signature };
}

export function advanceKeyMotion(previous, frame) {
  if (previous?.signature === frame.signature) return previous;
  const generations = new Map(previous?.generations);
  for (const [midi, owners] of frame.owners) {
    if ([...owners].some((owner) => !previous?.owners.get(midi)?.has(owner)))
      generations.set(midi, (generations.get(midi) || 0) + 1);
  }
  // Only the 88 piano pitches have counters. Ended note IDs are discarded with
  // each frame, so replaying a note later is a new attack without growing history.
  return { ...frame, generations };
}
