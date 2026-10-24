import { useEffect, useRef, useState } from "react";
import { Check, Palette, X } from "lucide-react";

const PALETTES = [
  ["mint", "Sage", "cat"],
  ["lavender", "Lavender", "mozart"],
  ["rose", "Rose", "bunny"],
  ["ocean", "Ocean", "langlang"],
  ["walnut", "Walnut", "beethoven"],
];

export function colourOptions(companion) {
  return [
    { id: "neutral", name: "Neutral", room: "neutral" },
    ...PALETTES.map(([id, name, room]) => ({ id, name, room })),
    { id: "companion", name: `Match ${companion.name}`, room: companion.id },
  ];
}

export function ThemePreview({ room }) {
  return (
    <span className="theme-preview" aria-hidden="true" data-preview-room={room}>
      <i className="tp-note right" />
      <i className="tp-note left" />
      <i className="tp-note right late" />
      <i className="tp-line" />
      <i className="tp-keys" />
    </span>
  );
}

// Non-modal: choosing a palette leaves the piano clock and inputs intact.
export default function ColourPicker({ value, onChange, companion, disabled }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const choices = colourOptions(companion);
  const current = choices.find((choice) => choice.id === value) || choices[0];
  function close(restore = false) {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector('[role="radio"][aria-checked="true"]')?.focus();
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="colour-picker"
      ref={root}
      data-colour-picker
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          close();
      }}
      onKeyDown={(event) => {
        if (!open) return;
        event.stopPropagation(); // The piano never plays letters typed here.
        if (event.key === "Escape") {
          event.preventDefault();
          close(true);
        }
      }}
    >
      <button
        ref={trigger}
        className="icon-button colour-picker-trigger"
        aria-label="Colours"
        title={`Colours · ${current.name}`}
        aria-expanded={open}
        aria-controls="app-colour-picker"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen((shown) => !shown)}
      >
        <Palette size={18} aria-hidden="true" />
        <span className="colour-current-dot" aria-hidden="true" />
      </button>
      {open ? (
        <section
          id="app-colour-picker"
          className="colour-picker-panel"
          role="dialog"
          aria-label="Choose colours"
        >
          <div className="colour-picker-heading">
            <h2>Colours</h2>
            <button
              className="icon-button"
              aria-label="Close colours"
              onClick={() => close(true)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div
            className="colour-choices"
            role="radiogroup"
            aria-label="App colours"
          >
            {choices.map((choice, index) => (
              <button
                key={choice.id}
                className="colour-choice"
                role="radio"
                aria-checked={value === choice.id}
                tabIndex={value === choice.id ? 0 : -1}
                data-preview-room={choice.room}
                data-choice={choice.id}
                onClick={() => onChange(choice.id)}
                onKeyDown={(event) => {
                  let next;
                  if (event.key === "ArrowRight" || event.key === "ArrowDown")
                    next = (index + 1) % choices.length;
                  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                    next = (index + choices.length - 1) % choices.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = choices.length - 1;
                  if (next === undefined) return;
                  event.preventDefault();
                  onChange(choices[next].id);
                  event.currentTarget.parentElement.children[next]?.focus();
                }}
              >
                <ThemePreview room={choice.room} />
                <span className="colour-choice-swatches" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>{choice.name}</span>
                <Check
                  size={14}
                  className="colour-choice-check"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
