import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { barStart, measureAt } from "./music.mjs";
import "./score-focus.css";

function nextPosition(instance, iterator) {
  // OSMD's clone shares its voice-entry array with the original. Advancing that
  // clone clears the displayed notes, so create an independent public iterator.
  const next = new iterator.constructor(
    instance.Sheet,
    iterator.CurrentSourceTimestamp,
  );
  next.moveToNextVisibleVoiceEntry(false);
  return next.EndReached ? null : next;
}

function resetPosition(instance, cursor) {
  cursor.resetIterator();
  return {
    next: nextPosition(instance, cursor.Iterator),
    previousTimestamp: -1,
  };
}

export default function ScoreDisplay({
  xml,
  startBar = 1,
  onNavigate,
  passageBars = 16,
  compact = false,
  beat,
  transportScore,
}) {
  const container = useRef();
  const paper = useRef();
  const display = useRef();
  const cursorState = useRef();
  const latestPosition = useRef({ beat, score: transportScore });
  latestPosition.current = { beat, score: transportScore };
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [renderedRange, setRenderedRange] = useState("");
  const [error, setError] = useState("");
  const from = Math.max(1, Math.min(total || 1, startBar));
  const count = Math.max(1, Math.min(32, Math.floor(passageBars) || 16));
  const to = Math.min(total, from + count - 1);
  const rangeKey = `${from}:${to}:${compact}`;
  const rendering = busy || (ready && renderedRange !== rangeKey);

  function followBeat(value, score) {
    const instance = display.current;
    const cursor = instance?.cursor;
    if (!compact || !cursor || !cursorState.current) return;
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (score && Number.isFinite(score.duration) && value >= score.duration)
    ) {
      cursor.hide();
      return;
    }
    // Match the written measure first: the transport can shorten pickups whose
    // other part contains a full-bar rest, while OSMD keeps that longer rest.
    // OSMD timestamps are whole-note units; relative transport beats are quarters.
    let timestamp = value / 4;
    if (score) {
      const bar = measureAt(score, value);
      const source = instance.Sheet.SourceMeasures[bar - 1];
      if (!source || bar < from || bar > to) {
        cursor.hide();
        return;
      }
      timestamp =
        source.AbsoluteTimestamp.RealValue + (value - barStart(score, bar)) / 4;
    }
    const first = instance.Sheet.SourceMeasures[from - 1];
    const last = instance.Sheet.SourceMeasures[to - 1];
    if (
      !first ||
      !last ||
      timestamp < first.AbsoluteTimestamp.RealValue - 1e-7 ||
      timestamp >= last.AbsoluteTimestamp.RealValue + last.Duration.RealValue
    ) {
      cursor.hide();
      return;
    }
    let state = cursorState.current;
    let changed = cursor.Hidden;
    if (timestamp < state.previousTimestamp - 1e-7) {
      state = resetPosition(instance, cursor);
      cursorState.current = state;
      changed = true;
    }
    // Only move the overlay when a new onset is reached. No engraving work or
    // layout update runs on animation frames between notes, including rests.
    let remaining = 4096;
    while (
      state.next &&
      state.next.CurrentSourceTimestamp.RealValue <= timestamp + 1e-7 &&
      remaining-- > 0
    ) {
      cursor.iterator = state.next;
      state.next = nextPosition(instance, cursor.Iterator);
      changed = true;
    }
    state.previousTimestamp = timestamp;
    if (!changed) return;
    cursor.show();
    const marker = cursor.cursorElement.getBoundingClientRect();
    const viewport = paper.current.getBoundingClientRect();
    // Scroll only the sheet's own viewport, never the whole practice screen.
    if (marker.bottom > viewport.bottom - 12)
      paper.current.scrollTop += marker.bottom - viewport.bottom + 20;
    else if (marker.top < viewport.top + 12)
      paper.current.scrollTop -= viewport.top - marker.top + 20;
  }

  useEffect(() => {
    let canceled = false;
    let instance;
    setReady(false);
    setTotal(0);
    setBusy(true);
    setError("");
    (async () => {
      try {
        // Always read the imported document locally, never treat its text as a URL.
        const document = new DOMParser().parseFromString(
          xml,
          "application/xml",
        );
        if (document.querySelector("parsererror"))
          throw Error("Not a MusicXML document");
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (canceled) return;
        instance = new OpenSheetMusicDisplay(container.current, {
          autoResize: false,
          backend: "svg",
          drawTitle: true,
          drawUpToMeasureNumber: 16,
          followCursor: false,
          cursorsOptions: [
            { type: 0, color: "#6cd8b4", alpha: 0.35, follow: false },
          ],
        });
        // Luma plays written measures once, including repeated passages.
        instance.EngravingRules.CursorIgnoreRepetitions = true;
        await instance.load(document);
        if (canceled) {
          for (const cursor of instance.cursors) cursor.cursorElement.remove();
          return;
        }
        const count = instance.Sheet.SourceMeasures.length;
        if (!count) throw Error("No measures to display");
        display.current = instance;
        setTotal(count);
        setReady(true);
      } catch {
        if (!canceled) {
          setBusy(false);
          setError(
            "This score could not be engraved. Use the note list or original PDF to review it.",
          );
        }
      }
    })();
    return () => {
      canceled = true;
      display.current = null;
      cursorState.current = null;
      // clear() removes the engraving but leaves its independently owned cursor
      // image behind. Remove those images before another score uses this host.
      for (const cursor of instance?.cursors || [])
        cursor.cursorElement.remove();
      instance?.clear();
    };
  }, [xml]);

  useEffect(() => {
    if (!ready) return;
    let canceled = false;
    let timer;
    const render = () => {
      if (canceled || !display.current) return;
      try {
        display.current.setOptions({
          // The public number options shift ranges for an implicit pickup.
          // Luma navigation counts every source measure, including that pickup,
          // so clear the number overrides and set exact source indices below.
          drawFromMeasureNumber: 0,
          drawUpToMeasureNumber: 0,
          drawTitle: !compact && from === 1,
          drawSubtitle: !compact && from === 1,
          drawComposer: !compact && from === 1,
          drawPartNames: !compact,
          drawPartAbbreviations: !compact,
        });
        display.current.EngravingRules.MinMeasureToDrawIndex = from - 1;
        display.current.EngravingRules.MaxMeasureToDrawIndex = to - 1;
        display.current.Zoom = compact ? 0.85 : 1;
        display.current.render();
        const cursor = display.current.cursor;
        cursor.hide();
        if (compact) {
          cursor.wantedZIndex = "1";
          cursorState.current = resetPosition(display.current, cursor);
          const latest = latestPosition.current;
          followBeat(latest.beat, latest.score);
        } else cursorState.current = null;
        setError("");
      } catch {
        setError(
          "This passage could not be engraved. Use the note list or original PDF to review it.",
        );
      } finally {
        setRenderedRange(`${from}:${to}:${compact}`);
        setBusy(false);
      }
    };
    setBusy(true);
    paper.current.scrollTop = 0;
    // Let the loading state paint before the synchronous engraving work.
    timer = setTimeout(render, 0);
    let width = container.current.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      if (Math.abs(entry.contentRect.width - width) < 1) return;
      width = entry.contentRect.width;
      clearTimeout(timer);
      timer = setTimeout(render, 100);
    });
    observer.observe(container.current);
    return () => {
      canceled = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ready, from, to, compact]);

  useEffect(() => {
    if (!rendering && !error) followBeat(beat, transportScore);
  }, [beat, transportScore, rendering, error, compact]);

  return (
    <div className={`notation-view${compact ? " notation-compact" : ""}`}>
      <nav
        className="notation-navigation"
        aria-label="Sheet passage navigation"
      >
        <button
          disabled={!ready || rendering || from <= 1}
          onClick={() => onNavigate?.(Math.max(1, from - count))}
          aria-label="Previous sheet passage"
        >
          <ChevronLeft size={16} /> {!compact && "Previous"}
        </button>
        <span aria-live="polite">
          {total
            ? `Bars ${from}–${to} of ${total}`
            : error
              ? "Sheet preview unavailable"
              : "Opening sheet music…"}
        </span>
        <button
          disabled={!ready || rendering || to >= total}
          onClick={() => onNavigate?.(from + count)}
          aria-label="Next sheet passage"
        >
          {!compact && "Next"} <ChevronRight size={16} />
        </button>
      </nav>
      {!compact && (
        <p className="notation-help">
          {count} bars at a time. Bar counts include pickups; printed numbers
          may differ.
          <span className="notation-narrow-help">
            {" "}
            Scroll the sheet sideways on a narrow screen.
          </span>
        </p>
      )}
      {rendering && (
        <p className="notation-loading" role="status">
          <LoaderCircle size={16} /> Preparing your passage…
        </p>
      )}
      <div className="sheet-paper" ref={paper} aria-busy={rendering}>
        {error && <p role="status">{error}</p>}
        <div
          ref={container}
          className="engraved-sheet"
          style={{ visibility: rendering || error ? "hidden" : "visible" }}
        />
      </div>
    </div>
  );
}
