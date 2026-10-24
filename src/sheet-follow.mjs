const EPSILON = 1e-7;
const rasterCached = new WeakSet();

/** Two independent public iterators: advancing a cloned OSMD iterator can clear
 * the original's shared voice-entry array. Construct these only when resetting
 * a passage, not for every note (OSMD constructors walk from the score start). */
export function resetSheetFollower(instance, cursor) {
  cursor.resetIterator();
  const next = new cursor.Iterator.constructor(
    instance.Sheet,
    cursor.Iterator.CurrentSourceTimestamp,
  );
  next.SkipInvisibleNotes = cursor.Iterator.SkipInvisibleNotes;
  next.moveToNextVisibleVoiceEntry(false);
  return { next, previousTimestamp: -1, system: null };
}

/** Advance without rendering. Seeks within the current onset require no reset. */
export function advanceSheetFollower(instance, cursor, state, timestamp) {
  let changed = cursor.Hidden;
  if (timestamp < cursor.Iterator.CurrentSourceTimestamp.RealValue - EPSILON) {
    state = resetSheetFollower(instance, cursor);
    changed = true;
  }
  let remaining = 16384;
  while (
    !state.next.EndReached &&
    state.next.CurrentSourceTimestamp.RealValue <= timestamp + EPSILON &&
    remaining-- > 0
  ) {
    cursor.Iterator.moveToNextVisibleVoiceEntry(false);
    state.next.moveToNextVisibleVoiceEntry(false);
    changed = true;
  }
  state.previousTimestamp = timestamp;
  return { state, changed };
}

/** Stable vertical target in scroll-content coordinates. An oversized grand
 * staff cannot satisfy both margins: pin its top instead of alternating edges.
 * The caller applies this only on a system change, preserving manual scrolling
 * while subsequent notes move horizontally within that same system. */
export function sheetScrollTarget({
  scrollTop,
  clientHeight,
  scrollHeight,
  markerTop,
  markerHeight,
  margin = 12,
}) {
  const maximum = Math.max(0, scrollHeight - clientHeight);
  const clamp = (value) => Math.max(0, Math.min(maximum, value));
  if (
    ![scrollTop, clientHeight, scrollHeight, markerTop, markerHeight].every(
      Number.isFinite,
    ) ||
    clientHeight <= 0
  )
    return scrollTop;
  if (markerHeight + margin * 2 > clientHeight)
    return clamp(markerTop - margin);
  if (markerTop < scrollTop + margin) return clamp(markerTop - margin);
  // Turn the page: the new line goes to the top so the lines after it are
  // visible below, rather than leaving the previous line half cut off.
  if (markerTop + markerHeight > scrollTop + clientHeight - margin)
    return clamp(markerTop - margin);
  return clamp(scrollTop);
}

/** OSMD 1.9 regenerates its cursor PNG on each show() because its cached options
 * are compared by identity with a newly copied object. Memoize just that raster
 * operation on this owned cursor. Unknown implementations retain normal behavior.
 * Position, height, width, visibility and public cursor semantics remain OSMD's. */
export function cacheSheetCursorImage(cursor) {
  if (typeof cursor?.updateStyle !== "function" || rasterCached.has(cursor)) return;
  rasterCached.add(cursor);
  const original = cursor.updateStyle;
  let key;
  cursor.updateStyle = function (width, options) {
    const value = options || this.CursorOptions;
    const next = value
      ? `${width}:${value.type}:${value.color}:${value.alpha}`
      : null;
    if (next !== null && next === key && this.cursorElement?.src) return;
    original.call(this, width, options);
    key = next;
  };
}
