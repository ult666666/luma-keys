// Number fields that can be typed into. Clamping on every keystroke made
// some numbers impossible to enter: typing "12" into a bar field whose
// minimum is 3 turned the "1" into "3" and then "32". A draft is committed
// while typing only once it is a whole value inside the field's range, and
// settled (clamped) when the reader leaves the field or presses Enter.

const NUMBER = /^\s*-?(\d+(\.\d*)?|\.\d+)\s*$/;

/** The value to commit while typing, or null to keep the draft as typed. */
export function liveValue(text, { min = -Infinity, max = Infinity, integer = true } = {}) {
  if (!NUMBER.test(String(text ?? ""))) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) return null;
  return n >= min && n <= max ? n : null;
}

/** The value a finished draft settles to; `fallback` when it is empty or
 * not a number. */
export function settledValue(text, { min = -Infinity, max = Infinity, integer = true, fallback }) {
  if (!NUMBER.test(String(text ?? ""))) return fallback;
  const n = integer ? Math.round(Number(text)) : Number(text);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** A repeat edited from its first bar: a later first bar takes the last
 * bar along with it. */
export const repeatFromFirst = (first, last) => [first, Math.max(first, last)];
/** A repeat edited from its last bar: an earlier last bar takes the first
 * bar along with it. */
export const repeatFromLast = (first, last) => [Math.min(first, last), last];
