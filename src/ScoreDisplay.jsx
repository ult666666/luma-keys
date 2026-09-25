import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

const PASSAGE_BARS = 16;

export default function ScoreDisplay({ xml, startBar = 1, onNavigate }) {
  const container = useRef();
  const paper = useRef();
  const display = useRef();
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [renderedRange, setRenderedRange] = useState("");
  const [error, setError] = useState("");
  const from = Math.max(1, Math.min(total || 1, startBar));
  const to = Math.min(total, from + PASSAGE_BARS - 1);
  const rangeKey = `${from}:${to}`;
  const rendering = busy || (ready && renderedRange !== rangeKey);

  useEffect(() => {
    let canceled = false;
    let instance;
    setReady(false);
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
          drawUpToMeasureNumber: PASSAGE_BARS,
        });
        await instance.load(document);
        if (canceled) return;
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
          drawFromMeasureNumber: from,
          drawUpToMeasureNumber: to,
          drawTitle: from === 1,
          drawComposer: from === 1,
        });
        display.current.render();
        setError("");
      } catch {
        setError(
          "This passage could not be engraved. Use the note list or original PDF to review it.",
        );
      } finally {
        setRenderedRange(`${from}:${to}`);
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
  }, [ready, from, to]);

  return (
    <div className="notation-view">
      <nav
        className="notation-navigation"
        aria-label="Sheet passage navigation"
      >
        <button
          disabled={!ready || rendering || from <= 1}
          onClick={() => onNavigate(Math.max(1, from - PASSAGE_BARS))}
          aria-label="Previous sheet passage"
        >
          <ChevronLeft size={16} /> Previous
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
          onClick={() => onNavigate(from + PASSAGE_BARS)}
          aria-label="Next sheet passage"
        >
          Next <ChevronRight size={16} />
        </button>
      </nav>
      <p className="notation-help">
        16 bars at a time. Bar counts include pickups; printed numbers may
        differ.
        <span className="notation-narrow-help">
          {" "}
          Scroll the sheet sideways on a narrow screen.
        </span>
      </p>
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
