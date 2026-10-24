import { barsCovered, mergeRanges } from "./journal.mjs";

const validBar = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 100000;

// The journal outlives a score: a replacement may have fewer bars, and a
// removed piece still has useful practice history. Never change either input.
export function pieceProgressSummary(entry, score = null) {
  const measures = validBar(score?.measures) ? score.measures : null;
  const savedRanges = Array.isArray(entry?.ranges) ? entry.ranges : [];
  const ranges = mergeRanges(
    savedRanges
      .filter(
        (range) =>
          Array.isArray(range) &&
          range.length === 2 &&
          validBar(range[0]) &&
          validBar(range[1]),
      )
      .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
      .filter(([a]) => measures === null || a <= measures)
      .map(([a, b]) => [a, measures === null ? b : Math.min(b, measures)]),
  );
  const coveredBars = barsCovered(ranges);
  const savedBar = validBar(entry?.bar) ? entry.bar : 1;
  // The last saved bar is a place to resume, not evidence of completion.
  const resumeBar = measures === null ? savedBar : Math.min(savedBar, measures);
  return {
    ranges,
    coveredBars,
    resumeBar,
    share: measures === null ? null : coveredBars / measures,
  };
}
