import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LocateFixed } from "lucide-react";
import { keyboardLayout, degree, solfege, noteName } from "./music.mjs";
import "./keyboard-guide.css";

const keys = keyboardLayout(21, 108);
const KEY_WIDTH = 42;
const WIDTH = 52 * KEY_WIDTH;
const positions = new Map(keys.map((k) => [k.midi, k]));

export default function KeyboardGuide({
  scoreId,
  targets,
  active,
  soundEvents = [],
  pressed,
  tonic,
  labels,
  onNoteOn,
  onNoteOff,
  onRelease,
  roll,
}) {
  const viewport = useRef();
  const [follow, setFollow] = useState(true);
  const [focusPitch, setFocusPitch] = useState(60);
  const [pointerHolds, setPointerHolds] = useState(new Set());
  const clearPointer = (id) =>
    setPointerHolds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  const [viewportState, setViewportState] = useState({ left: 0, width: 900 });
  const pitches = targets.map((n) => n.midi);
  const soundTokens = new Map();
  for (const note of soundEvents) {
    soundTokens.set(
      note.midi,
      `${soundTokens.get(note.midi) || ""}:${note.id ?? note.beat}`,
    );
  }
  const targetKey = pitches.join(",");
  const targetPositions = pitches
    .map((m) => positions.get(m))
    .filter(Boolean)
    .sort((a, b) => a.left - b.left);
  const low = targetPositions.length
    ? Math.min(
        ...targetPositions.map((k) => ((k.left + k.width / 2) / 100) * WIDTH),
      )
    : WIDTH / 2;
  const high = targetPositions.length
    ? Math.max(
        ...targetPositions.map((k) => ((k.left + k.width / 2) / 100) * WIDTH),
      )
    : low;
  const label = (m) =>
    labels === "letters"
      ? noteName(m)
      : labels === "solfege"
        ? solfege(m, tonic)
        : degree(m, tonic);
  const readWindow = () => {
    const el = viewport.current;
    if (el) setViewportState({ left: el.scrollLeft, width: el.clientWidth });
  };
  const center = (force = false) => {
    const el = viewport.current;
    if (!el) return;
    if (
      force ||
      low < el.scrollLeft + KEY_WIDTH ||
      high > el.scrollLeft + el.clientWidth - KEY_WIDTH
    ) {
      el.scrollLeft = Math.max(
        0,
        Math.min(WIDTH - el.clientWidth, (low + high - el.clientWidth) / 2),
      );
      readWindow();
    }
  };
  useEffect(() => {
    const clear = () => setPointerHolds(new Set());
    window.addEventListener("blur", clear);
    return () => window.removeEventListener("blur", clear);
  }, []);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      readWindow();
    });
    observer.observe(viewport.current);
    readWindow();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setFollow(true);
    center(true);
  }, [scoreId]);
  useEffect(() => {
    if (follow && pointerHolds.size === 0 && pitches.length) center();
  }, [targetKey, follow, viewportState.width, pointerHolds.size]);
  const visible = keys.filter(
    (k) =>
      ((k.left + k.width) / 100) * WIDTH > viewportState.left + 1 &&
      (k.left / 100) * WIDTH < viewportState.left + viewportState.width - 1,
  );
  const offLeft = targetPositions.filter(
    (k) => ((k.left + k.width / 2) / 100) * WIDTH < viewportState.left,
  );
  const offRight = targetPositions.filter(
    (k) =>
      ((k.left + k.width / 2) / 100) * WIDTH >
      viewportState.left + viewportState.width,
  );
  const scroll = (direction) => {
    setFollow(false);
    viewport.current.scrollLeft += direction * 7 * KEY_WIDTH;
    readWindow();
  };
  const reveal = (key) => {
    setFollow(false);
    viewport.current.scrollLeft =
      ((key.left + key.width / 2) / 100) * WIDTH -
      viewport.current.clientWidth / 2;
    readWindow();
  };
  return (
    <section className="keyboard-guide" aria-label="Keyboard guide">
      <div className="keyboard-guide-top">
        <span>
          <strong>Find it on your piano</strong>
          <small>
            {visible.length
              ? `${noteName(visible[0].midi)} – ${noteName(visible.at(-1).midi)}`
              : "88-key range"}
          </small>
        </span>
        <div className="keyboard-guide-controls">
          <button
            className={follow ? "following" : ""}
            aria-pressed={follow}
            onClick={() => {
              setFollow((v) => !v);
              if (!follow) center(true);
            }}
          >
            <LocateFixed size={13} /> Follow notes
          </button>
          <button
            aria-label="Lower octave"
            disabled={viewportState.left < 1}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            aria-label="Higher octave"
            disabled={viewportState.left + viewportState.width >= WIDTH - 1}
            onClick={() => scroll(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div
        className="keyboard-locator"
        aria-label="Position on an 88-key piano"
      >
        <span>A0</span>
        <div
          className="keyboard-locator-track"
          role="slider"
          tabIndex={0}
          aria-label="Keyboard range position"
          aria-valuemin={0}
          aria-valuemax={Math.round(WIDTH - viewportState.width)}
          aria-valuenow={Math.round(viewportState.left)}
          aria-valuetext={`${noteName(visible[0]?.midi || 21)} to ${noteName(visible.at(-1)?.midi || 108)}`}
          onKeyDown={(e) => {
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              scroll(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setFollow(false);
            viewport.current.scrollLeft =
              ((e.clientX - rect.left) / rect.width) * WIDTH -
              viewport.current.clientWidth / 2;
            readWindow();
          }}
        >
          {keys.map((k) => (
            <i
              key={k.midi}
              className={`${k.black ? "black" : "white"} ${pitches.includes(k.midi) ? "target" : ""}`}
              style={{ left: k.left + "%", width: k.width + "%" }}
            />
          ))}
          <b
            style={{
              left: (viewportState.left / WIDTH) * 100 + "%",
              width: (viewportState.width / WIDTH) * 100 + "%",
            }}
          />
        </div>
        <span>C8</span>
      </div>
      {(offLeft.length > 0 || offRight.length > 0) && (
        <div className="keyboard-offscreen" role="status">
          {offLeft.length > 0 && (
            <button onClick={() => reveal(offLeft[0])}>
              ← Also play {offLeft.map((k) => noteName(k.midi)).join(" + ")}
            </button>
          )}
          {offRight.length > 0 && (
            <button onClick={() => reveal(offRight.at(-1))}>
              Also play {offRight.map((k) => noteName(k.midi)).join(" + ")} →
            </button>
          )}
        </div>
      )}
      <div className="keyboard-viewport" ref={viewport} onScroll={readWindow}>
        <div className="keyboard-strip" style={{ width: WIDTH }}>
          {roll}
          <div className="piano-keys">
            {keys.map((k) => (
              <button
                key={k.midi}
                data-midi={k.midi}
                tabIndex={k.midi === focusPitch ? 0 : -1}
                onFocus={() => setFocusPitch(k.midi)}
                aria-label={`${noteName(k.midi)} ${degree(k.midi, tonic)} ${solfege(k.midi, tonic)}`}
                className={`piano-key ${k.black ? "black" : "white"} ${active.has(k.midi) || pitches.includes(k.midi) ? "lit" : ""} ${pressed.has(k.midi) ? "pressed" : ""} ${pressed.has(k.midi) || soundTokens.has(k.midi) ? "sounding" : ""} ${k.midi === 60 ? "middle-c" : ""}`}
                style={{ left: k.left + "%", width: k.width + "%" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setPointerHolds((previous) =>
                    new Set(previous).add(e.pointerId),
                  );
                  onNoteOn(k.midi, 0.75, "pointer:" + e.pointerId);
                }}
                onPointerUp={(e) => {
                  clearPointer(e.pointerId);
                  onNoteOff(k.midi, "pointer:" + e.pointerId);
                }}
                onPointerCancel={(e) => {
                  clearPointer(e.pointerId);
                  onNoteOff(k.midi, "pointer:" + e.pointerId);
                }}
                onLostPointerCapture={(e) => {
                  clearPointer(e.pointerId);
                  onNoteOff(k.midi, "pointer:" + e.pointerId);
                }}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    setFollow(false);
                    const pitch =
                      e.key === "Home"
                        ? 21
                        : e.key === "End"
                          ? 108
                          : Math.max(
                              21,
                              Math.min(
                                108,
                                k.midi + (e.key === "ArrowRight" ? 1 : -1),
                              ),
                            );
                    viewport.current
                      .querySelector(`[data-midi="${pitch}"]`)
                      ?.focus();
                    return;
                  }
                  if ((e.key === "Enter" || e.code === "Space") && !e.repeat) {
                    e.preventDefault();
                    onNoteOn(
                      k.midi,
                      0.75,
                      `key-button:${k.midi}:${e.code || e.key}`,
                    );
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === "Enter" || e.code === "Space") {
                    e.preventDefault();
                    onNoteOff(
                      k.midi,
                      `key-button:${k.midi}:${e.code || e.key}`,
                    );
                  }
                }}
                onBlur={() => onRelease(`key-button:${k.midi}:`)}
              >
                <span className="key-surface" aria-hidden="true">
                  <span
                    className="key-resonance"
                    key={`${pressed.has(k.midi) ? "live" : ""}${soundTokens.get(k.midi) || ""}`}
                  />
                  <span className="key-number">{label(k.midi)}</span>
                  <small>{noteName(k.midi)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="keyboard-guide-caption">
        <span>
          1 = Do / {noteName(60 + tonic).replace("4", "")} · numbers are notes,
          not fingers
        </span>
        <span>Scroll to explore all 88 keys</span>
      </div>
    </section>
  );
}
