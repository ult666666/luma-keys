import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { focusedByPointer, restoreFocus } from "./focus-intent.mjs";

// A small, non-modal drawer. Playback and the rest of the score stay usable.
// `label` names the drawer for assistive tech; `short` is the visible word
// and `summary` a few words on what is on ("伴奏 on"), shown on wide windows.
export default function PracticeTools({
  label,
  short,
  summary,
  icon: Icon,
  children,
  active,
  onFocus,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  // Opened with a click, the drawer hands focus back as a click, so Space
  // plays afterwards instead of opening the drawer again.
  const openedByPointer = useRef(false);
  const close = () => {
    setOpen(false);
    restoreFocus(trigger.current, openedByPointer.current);
  };
  return (
    <div
      ref={root}
      className={`practice-tools ${className}`}
      data-practice-tools
      onFocusCapture={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="practice-tools-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={active ? `${id}-status` : undefined}
        data-tip={active || undefined}
        onClick={(event) => {
          openedByPointer.current =
            event.detail > 0 || focusedByPointer(event.currentTarget);
          setOpen((value) => !value);
        }}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="tools-label">{short || label}</span>
        {summary && (
          <span className="tools-summary" aria-hidden="true">
            · {summary}
          </span>
        )}
        {active && <i className="tool-active" aria-hidden="true" />}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {active && (
        <span id={`${id}-status`} className="sr-only">
          {active}
        </span>
      )}
      <div
        id={id}
        className="practice-tools-panel"
        hidden={!open}
        role="region"
        aria-label={label}
        onClick={(event) => {
          if (event.target.closest("[data-close-tools]")) close();
        }}
      >
        <div className="practice-tools-heading">
          <strong>{label}</strong>
          <button
            className="icon-button"
            aria-label={`Close ${label.toLowerCase()}`}
            onClick={close}
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
