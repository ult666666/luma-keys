// Fine tolerance for imported floating-point onsets. This is intentionally
// smaller than a playable subdivision: navigation must never skip fast notes.
const EPS = 1e-6;

const lowerBound = (groups, beat) => {
  let lo = 0,
    hi = groups.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (groups[mid].beat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const upperBound = (groups, beat) => {
  let lo = 0,
    hi = groups.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (groups[mid].beat <= beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// All helpers accept normalized groups sorted by onset, as returned by groups().
export function practiceGroupAtOrAfter(groups, beat) {
  return groups[lowerBound(groups, beat - EPS)];
}

export function practiceGroupAt(groups, beat) {
  const group = practiceGroupAtOrAfter(groups, beat);
  return group && Math.abs(group.beat - beat) <= EPS ? group : undefined;
}

// start is inclusive; end is exclusive for new onsets, but remains a valid
// stopped position. A loop cycles through its attacks, never another phrase's.
export function stepPracticeBeat(
  groups,
  beat,
  direction,
  { start, end, loop = false },
) {
  const first = lowerBound(groups, start - EPS);
  const afterLast = lowerBound(groups, end - EPS);
  if (first >= afterLast) return direction > 0 && !loop ? end : start;
  if (direction > 0) {
    const next = Math.max(first, upperBound(groups, beat + EPS));
    return next < afterLast
      ? groups[next].beat
      : loop
        ? groups[first].beat
        : end;
  }
  const previous = Math.min(afterLast - 1, lowerBound(groups, beat - EPS) - 1);
  return previous >= first
    ? groups[previous].beat
    : loop
      ? groups[afterLast - 1].beat
      : start;
}
