import { secondsAt, beatAtSeconds } from "./tempo.mjs";

// Seek on the displayed song clock, like a media player: five seconds of
// the piece at any practice speed. A repeat is bounded; a jump never wraps.
export function practiceTimeJump(score, beat, seconds, speed = 1, bounds = {}) {
  const start = Math.max(0, Number.isFinite(bounds.start) ? bounds.start : 0);
  const end = Math.max(start, Number.isFinite(bounds.end) ? bounds.end : score.duration);
  const here = Math.max(start, Math.min(end, Number.isFinite(beat) ? beat : start));
  const delta = Number.isFinite(seconds) ? seconds : 0;
  return Math.max(start, Math.min(end,
    beatAtSeconds(score, secondsAt(score, here) + delta),
  ));
}

// Arrow keys still operate editable fields, sliders and accessible composite
// controls. Ordinary practice buttons may keep focus after a pointer click.
export function ownsPracticeArrows(target) {
  if (target?.matches?.(".piece-map-input")) return false;
  return !!target?.closest?.(
    "input, textarea, select, [contenteditable]:not([contenteditable=false]), " +
    "[role=tab], [role=radio], [role=slider], [role=menu], [role=menuitem], " +
    ".piano-key, [data-companion-dock], [data-practice-tools], .buddy",
  );
}
