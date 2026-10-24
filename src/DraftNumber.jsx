import { useState } from "react";
import { liveValue, settledValue } from "./number-draft.mjs";

// A number field that keeps what the reader types. Whole values inside
// [min, max] apply at once (so the steppers and typing "12" both work);
// anything else waits as a draft and settles when the field is left or
// Enter is pressed. `settle` widens the range used when settling, and
// `onSettle` (default `onCommit`) receives that final value.
export default function DraftNumber({
  value,
  min,
  max,
  settle = null,
  integer = true,
  onCommit,
  onSettle = onCommit,
  onBlur,
  onKeyDown,
  ...rest
}) {
  const [draft, setDraft] = useState(null);
  const lo = Number(min),
    hi = Number(max);
  const finish = () => {
    if (draft == null) return;
    const n = settledValue(draft, {
      min: settle?.min ?? lo,
      max: settle?.max ?? hi,
      integer,
      fallback: value,
    });
    setDraft(null);
    if (n !== value) onSettle(n);
  };
  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={draft ?? value}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = liveValue(text, { min: lo, max: hi, integer });
        if (n != null && n !== value) onCommit(n);
      }}
      onBlur={(e) => {
        finish();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish();
        onKeyDown?.(e);
      }}
    />
  );
}
