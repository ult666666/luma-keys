// Presentation never alters the score, fingering or transport. An unavailable
// or infeasible mesh yields exact key guidance rather than a distorted hand.
export function geometryFrames(frames, mode = "natural") {
  return Object.fromEntries(["left", "right"].map(hand => [hand,
    mode === "natural" && !frames[hand]?.motion?.guidanceOnly ? frames[hand] : null,
  ]));
}

export function guidePoses(frames, markersOnly = false) {
  return Object.fromEntries(["left", "right"].map(hand => {
    const frame = frames[hand];
    if (!frame) return [hand, null];
    const pose = frame.pose;
    if (!markersOnly || pose.guidanceOnly) return [hand, pose];
    const marks = new Map((pose.marks || []).map(mark => [mark.midi, mark]));
    for (const f of frame.motion.fingers || []) {
      if (f.state === "down" && Number.isFinite(f.midi))
        marks.set(f.midi, { midi: f.midi, finger: f.finger, kind: "contact", strength: 1 });
    }
    return [hand, { ...pose, marks: [...marks.values()] }];
  }));
}
