// Short, specific advice from a graded run. Rules, not magic: each line names
// the number it comes from so the player knows what to change.
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
      "Keep going after a slip next time: sight reading is about holding the pulse, and only the notes you reach are graded.",
    );
  if (result.accuracy >= 0.95 && result.precision >= 0.7) {
    tips.push(
      nextLevelReady
        ? "Fluent reading. The next level is unlocked; try it before this one feels comfortable."
        : speed < 1
          ? `Fluent at ${Math.round(speed * 100)}%. Take the same level at a faster speed, or a fresh piece at 100%.`
          : "Fluent at full speed. One more clean run here and the next level opens.",
    );
  }
  if (result.matched && result.offset > 0.12)
    tips.push(
      `You arrive late by about ${ms(result.offset, secondsPerBeat)} ms. Keep your eyes one beat ahead of your hands and let the click lead.`,
    );
  else if (result.matched && result.offset < -0.12)
    tips.push(
      `You rush by about ${ms(result.offset, secondsPerBeat)} ms. Count the rests out loud and wait for the click.`,
    );
  if (worst && worst.missed >= 2)
    tips.push(
      `Bar ${worst.bar} cost the most (${worst.missed} missed). Loop it at a slower speed until it feels easy, then read the whole piece again.`,
    );
  else if (result.extra >= 2 && prep?.key)
    tips.push(
      `${result.extra} wrong notes: check the key before you start (${prep.key}${prep.signatureText ? `, ${prep.signatureText}` : ""}) and say the first bar's numbers aloud.`,
    );
  if (result.accuracy >= 0.9 && result.precision < 0.5 && tips.length < 2)
    tips.push(
      "All the notes, loose timing. Keep the click on, count the subdivisions, and try 75% before 100%.",
    );
  if (
    prep?.leap?.semitones >= 7 &&
    worst?.bar === prep.leap.bar &&
    tips.length < 3
  )
    tips.push(
      `Bar ${prep.leap.bar} has the ${intervalName(prep.leap.semitones)}: look at the interval on the page and trust the hand shape rather than the keys.`,
    );
  if (!tips.length)
    tips.push(
      result.accuracy >= 0.75
        ? "Steady work. Read it once more, then take a new piece; repetition is not sight reading."
        : "Slow it down: choose 50% or 65%, read one hand alone, and let the click do the counting.",
    );
  return tips.slice(0, 3);
}

// One friendly line for the practice screen, in the companion's voice.
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
      return `${name} is thrilled: ${pct}% and steady. Fresh piece?`;
    if (pct >= 90)
      return `${pct}% right. ${name} says the timing can settle with one more run.`;
    if (pct >= 75)
      return `${pct}%. ${name} suggests looping the weakest bars, then reading it once more.`;
    return `${pct}%. ${name} would slow it down and read one hand alone first.`;
  }
  if (firstRun)
    return `Hi, I'm ${name}. Start Level 1 on Exercises and I'll count you in.`;
  if (mode === "perform")
    return `${name} will count one bar in. Read a beat ahead and keep going.`;
  if (mode === "wait")
    return `${name} waits for each note. Chords need every pitch.`;
  return streak >= 3
    ? `${streak}-day streak. ${name} is impressed. Click a note to start there.`
    : `${name} is listening. Click a note to start there.`;
}
