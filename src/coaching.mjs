// Practice advice based on the completed section, pitch accuracy and timing.
import { intervalName } from "./reading-prep.mjs";

const ms = (beats, secondsPerBeat) =>
  Math.round(Math.abs(beats) * secondsPerBeat * 1000);

export function coachingTips(
  result,
  { secondsPerBeat = 0.5, speed = 1, nextLevelReady = false, prep = null } = {},
) {
  const tips = [];
  if (!result || !result.total) return tips;
  const worst = result.bars.reduce(
    (a, b) => (b.problems > (a?.problems ?? 0) ? b : a),
    null,
  );
  if (!result.complete)
    tips.push(
      "Keep going after a missed note while keeping a steady beat. Only the section you reached was graded.",
    );
  if (result.accuracy >= 0.95 && result.precision >= 0.7) {
    tips.push(
      nextLevelReady
        ? "The next level is available in Exercises."
        : speed < 1
          ? `Try a faster speed for your next run (current: ${Math.round(speed * 100)}%).`
          : "Try another exercise at this level to check consistency.",
    );
  }
  if (result.matched && result.offset > 0.12)
    tips.push(
      `Your matched notes were late by about ${ms(result.offset, secondsPerBeat)} ms on average. Read one beat ahead and use the metronome to check your entries.`,
    );
  else if (result.matched && result.offset < -0.12)
    tips.push(
      `You tended to rush: matched notes averaged ${ms(result.offset, secondsPerBeat)} ms early. Count rests and subdivisions with the metronome.`,
    );
  if (worst && worst.missed >= 2)
    tips.push(
      `Bar ${worst.bar}: ${worst.missed} missed notes. Repeat this bar at a slower speed, then play the full passage.`,
    );
  else if (result.extra >= 2 && prep?.key)
    tips.push(
      `${result.extra} extra presses. Check the key signature (${prep.key}${prep.signatureText ? `, ${prep.signatureText}` : ""}) before playing.`,
    );
  if (result.accuracy >= 0.9 && result.precision < 0.5 && tips.length < 2)
    tips.push(
      "Focus on timing: practice at 75% with the metronome and count subdivisions.",
    );
  if (
    prep?.leap?.semitones >= 7 &&
    worst?.bar === prep.leap.bar &&
    tips.length < 3
  )
    tips.push(
      `For the ${intervalName(prep.leap.semitones)} in bar ${prep.leap.bar}, locate both keys and practice the move slowly.`,
    );
  if (!tips.length)
    tips.push(
      result.accuracy >= 0.75
        ? "Practice this passage again, then try another exercise."
        : "Choose 50% or 65% speed and practice one hand at a time with the metronome.",
    );
  return tips.slice(0, 3);
}

// A short practice instruction or result summary for the companion caption.
export function companionLine({
  name = "Luma",
  result = null,
  firstRun = false,
  mode = "listen",
  playing = false,
  streak = 0,
} = {}) {
  if (playing) return null;
  if (result) {
    const pct = Math.round(result.accuracy * 100);
    if (pct >= 95 && result.precision >= 0.7)
      return `${pct}% note accuracy. Try another exercise at this level.`;
    if (pct >= 90)
      return `${pct}% note accuracy. Repeat with the metronome to work on timing.`;
    if (pct >= 75)
      return `${pct}% note accuracy. Repeat the bars with missed notes, then play the full passage.`;
    return `${pct}% note accuracy. Lower the speed and practice one hand at a time.`;
  }
  if (firstRun)
    return `${name} · Start with Level 1 in Exercises.`;
  if (mode === "perform")
    return `Read one beat ahead and keep a steady beat. Enable Count me in for a count-in.`;
  if (mode === "wait")
    return `Play every pitch in each chord to continue.`;
  return streak >= 3
    ? `${streak}-day streak. Click a note to start there.`
    : `Click a note to start there.`;
}
