// Small shared pieces of the screens.
import { useEffect, useState } from "react";

// A progress ring (0–1), drawn in the theme's colour. The fill is a dash
// offset so a stylesheet can draw it in from empty (`--c` is the length).
export function Ring({
  value = 0,
  size = 64,
  stroke = 7,
  children,
  label,
  className = "",
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span
      className={`ring${v >= 1 ? " full" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
        />
        {/* At zero a round cap would still paint a dot, so draw nothing. */}
        {v > 0 && (
          <circle
            className="ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={c.toFixed(2)}
            strokeDashoffset={(c * (1 - v)).toFixed(2)}
            style={{ "--c": c.toFixed(2) }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      {children != null && <span className="ring-center">{children}</span>}
    </span>
  );
}

// A small round stamp ("BEST") that presses onto a ring's corner.
export function Seal({ children, label, className = "" }) {
  return (
    <span
      className={`lk-seal${className ? ` ${className}` : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span>{children}</span>
    </span>
  );
}

const prefersReduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// Counts from 0 up to `target` once (eased), or shows it at once under
// reduced motion.
export function useCountUp(target, duration = 900, delay = 120) {
  const [value, setValue] = useState(() => (prefersReduced() ? target : 0));
  useEffect(() => {
    if (prefersReduced() || typeof requestAnimationFrame !== "function") {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = null;
    const tick = (t) => {
      if (start == null) start = t;
      const k = Math.min(1, Math.max(0, (t - start - delay) / duration));
      setValue(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return value;
}

const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));

const isoDay = (value) => new Date(value).toLocaleDateString("en-CA");

// This week, Monday to Sunday, as seven small dots: filled = goal met,
// half = practised, ringed = today, faint ring = no practice (or not yet).
export function weekOf(journal, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const today = isoDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const day = isoDay(date);
    return {
      day,
      date,
      minutes: journal?.days?.[day]?.minutes || 0,
      today: day === today,
      future: day > today,
    };
  });
}

export function WeekDots({ journal, goal = 20, now, className = "" }) {
  const days = weekOf(journal, now);
  const state = (d) =>
    d.minutes >= goal ? "met" : d.minutes >= 0.5 ? "practised" : "empty";
  const said = { met: "goal met", practised: "practised", empty: "no practice" };
  const label = days
    .filter((d) => !d.future)
    .map(
      (d) =>
        `${d.date.toLocaleDateString(undefined, { weekday: "long" })}: ${said[state(d)]}`,
    )
    .join(", ");
  return (
    <span
      className={`lk-week-dots${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`This week. ${label}.`}
    >
      {days.map((d) => (
        <span
          key={d.day}
          className={`lk-week-day ${state(d)}${d.today ? " today" : ""}${d.future ? " future" : ""}`}
          title={`${d.date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · ${Math.round(d.minutes)} min`}
        >
          <i />
          <small>
            {d.date.toLocaleDateString(undefined, { weekday: "narrow" })}
          </small>
        </span>
      ))}
    </span>
  );
}

// A thin progress band along a cover's foot: how much of the piece has been
// played through, with a dot where you left off.
// `ticks` (shares, 0–1) mark where saved passages begin.
export function Ribbon({
  value = 0,
  at = null,
  ticks = [],
  label,
  className = "",
}) {
  const v = unit(value);
  return (
    <span
      className={`lk-ribbon${className ? ` ${className}` : ""}`}
      style={{ "--value": v, "--at": at == null ? 0 : unit(at) }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i className="lk-ribbon-fill" />
      {ticks.map((t, i) => (
        <i
          key={i}
          className="lk-ribbon-tick"
          style={{ "--tick": unit(t) }}
        />
      ))}
      {at != null && <b className="lk-ribbon-dot" />}
    </span>
  );
}

// A row of pill choices (a segmented control) with one pressed.
// `choices` are [value, text, title?] triples.
export function Segmented({ label, value, choices, onPick, className = "" }) {
  return (
    <div
      className={`lk-segmented${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={label}
    >
      {choices.map(([v, text, title]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={value === v}
          title={title}
          onClick={() => onPick(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
