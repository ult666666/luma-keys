import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { barStart, measureAt } from "./music.mjs";
import {
  advanceSheetFollower,
  cacheSheetCursorImage,
  resetSheetFollower,
  sheetScrollTarget,
} from "./sheet-follow.mjs";
import { compileSheetWindows } from "./sheet-window.mjs";
import "./score-focus.css";

export default function ScoreDisplay({
  xml,
  startBar = 1,
  onNavigate,
  passageBars = 16,
  compact = false,
  zoom = 0.85,
  beat,
  transportScore,
}) {
  const container = useRef();
  const paper = useRef();
  const display = useRef();
  const cursorState = useRef();
  const latestPosition = useRef({ beat, score: transportScore });
  latestPosition.current = { beat, score: transportScore };
  const [loadedTotal, setTotal] = useState(0);
  // OSMD recalculates every loaded source measure even when only a passage is
  // drawn. Index once, then load a bounded window with its written context.
  const windows = useMemo(
    () => (compact ? compileSheetWindows(xml) : null),
    [xml, compact],
  );
  const total = windows?.total || loadedTotal;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [renderedRange, setRenderedRange] = useState("");
  const [error, setError] = useState("");
  const from = Math.max(1, Math.min(total || 1, startBar));
  const count = Math.max(1, Math.min(32, Math.floor(passageBars) || 16));
  const to = Math.min(total, from + count - 1);
  const source = useMemo(
    () => windows?.window(from, to) || { xml, offset: 0 },
    [windows, from, to, xml],
  );
  const sourceXml = source.xml;
  const offset = source.offset;
  const rangeKey = `${from}:${to}:${compact}:${zoom}`;
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
      const source = instance.Sheet.SourceMeasures[bar - 1 - offset];
      if (!source || bar < from || bar > to) {
        cursor.hide();
        return;
      }
      timestamp =
        source.AbsoluteTimestamp.RealValue + (value - barStart(score, bar)) / 4;
    }
    const first = instance.Sheet.SourceMeasures[from - 1 - offset];
    const last = instance.Sheet.SourceMeasures[to - 1 - offset];
    if (
      !first ||
      !last ||
      timestamp < first.AbsoluteTimestamp.RealValue - 1e-7 ||
      timestamp >= last.AbsoluteTimestamp.RealValue + last.Duration.RealValue
    ) {
      cursor.hide();
      return;
    }
    // Move the two independent iterators in place. Reconstructing one at every
    // onset makes OSMD replay all earlier measures, especially costly in a sonata.
    const { state, changed } = advanceSheetFollower(
      instance,
      cursor,
      cursorState.current,
      timestamp,
    );
    cursorState.current = state;
    if (!changed) return;
    cursor.show();
    const element = cursor.cursorElement;
    const system = `${cursor.currentPageNumber}:${element.style.top}:${element.height}`;
    // Notes within a system move horizontally. Read geometry and follow
    // vertically only when that system changes, also allowing manual scrolling.
    if (system === state.system || !paper.current) return;
    state.system = system;
    const marker = element.getBoundingClientRect();
    const viewport = paper.current;
    const bounds = viewport.getBoundingClientRect();
    const target = sheetScrollTarget({
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      markerTop:
        marker.top - bounds.top + viewport.scrollTop - viewport.clientTop,
      markerHeight: marker.height,
    });
    if (Math.abs(target - viewport.scrollTop) > 1) viewport.scrollTop = target;
  }

  useEffect(() => {
    let canceled = false;
    let instance;
    const host = container.current;
    setReady(false);
    setTotal(0);
    setBusy(true);
    setError("");
    (async () => {
      try {
        // Always read the imported document locally, never treat its text as a URL.
        const document = new DOMParser().parseFromString(
          sourceXml,
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
        setTotal(windows?.total || count);
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
      // OSMD clear empties its SVG but retains page wrappers. New window
      // instances must not accumulate those blank pages in the same host.
      host?.replaceChildren();
    };
  }, [sourceXml]);

  useEffect(() => {
    if (!ready) return;
    let canceled = false;
    let timer;
    let firstRender = true;
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
        display.current.EngravingRules.MinMeasureToDrawIndex =
          from - 1 - offset;
        display.current.EngravingRules.MaxMeasureToDrawIndex = to - 1 - offset;
        // A full passage fills the page's width on every line; a short final
        // passage keeps its natural spacing.
        display.current.EngravingRules.StretchLastSystemLine =
          compact && to - from + 1 >= 6;
        // The document's 5-unit print margin costs 42.5px at practice zoom.
        // Keep an 8.5px inset in the compact reader so a complete grand staff
        // fits; restore the normal page margin in the full Review viewer.
        display.current.EngravingRules.PageTopMargin = compact ? 1 : 5;
        display.current.Zoom = compact ? zoom : 1;
        display.current.render();
        if (firstRender) paper.current.scrollTop = 0;
        firstRender = false;
        const cursor = display.current.cursor;
        cacheSheetCursorImage(cursor);
        cursor.hide();
        if (compact) {
          cursor.wantedZIndex = "1";
          cursorState.current = resetSheetFollower(display.current, cursor);
          const latest = latestPosition.current;
          followBeat(latest.beat, latest.score);
        } else cursorState.current = null;
        setError("");
      } catch {
        setError(
          "This passage could not be engraved. Use the note list or original PDF to review it.",
        );
      } finally {
        setRenderedRange(`${from}:${to}:${compact}:${zoom}`);
        setBusy(false);
      }
    };
    setBusy(true);
    display.current?.cursor?.hide();
    // Let the loading state paint before the synchronous engraving work.
    timer = setTimeout(render, 0);
    let width = container.current.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      if (Math.abs(entry.contentRect.width - width) < 1) return;
      width = entry.contentRect.width;
      if (width < 1) return;
      setBusy(true);
      clearTimeout(timer);
      timer = setTimeout(render, 100);
    });
    observer.observe(container.current);
    return () => {
      canceled = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ready, from, to, compact, zoom, sourceXml, offset]);

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
            ? from === to
              ? `Bar ${from} of ${total}`
              : `Bars ${from}–${to} of ${total}`
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
          style={{ visibility: error ? "hidden" : "visible" }}
        />
      </div>
    </div>
  );
}
