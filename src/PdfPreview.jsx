import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
} from "lucide-react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export default function PdfPreview({ id }) {
  const container = useRef(),
    canvas = useRef(),
    docRef = useRef();
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let canceled = false;
    let task;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        task = pdfjs.getDocument({
          url: "/api/original/" + id,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
        });
        const doc = await task.promise;
        if (canceled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setTotal(doc.numPages);
      } catch (e) {
        console.error("PDF preview:", e);
        if (!canceled) {
          setError(
            "The original PDF could not be displayed. It is still saved in your Library/imports folder.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      canceled = true;
      task?.destroy();
      docRef.current = null;
    };
  }, [id]);
  useEffect(() => {
    if (!total) return;
    let canceled = false,
      render;
    (async () => {
      try {
        setLoading(true);
        const p = await docRef.current.getPage(page);
        if (canceled) return;
        const natural = p.getViewport({ scale: 1 });
        const width = Math.max(200, container.current.clientWidth - 32);
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const viewport = p.getViewport({
          scale: (width / natural.width) * ratio,
        });
        const c = canvas.current;
        c.width = viewport.width;
        c.height = viewport.height;
        c.style.width = viewport.width / ratio + "px";
        c.style.height = "auto";
        c.style.maxWidth = "100%";
        render = p.render({ canvasContext: c.getContext("2d"), viewport });
        await render.promise;
        if (!canceled) setLoading(false);
      } catch (e) {
        if (!canceled && e.name !== "RenderingCancelledException") {
          setError(
            "Could not render this page. Try the next page or open the original file.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      canceled = true;
      render?.cancel();
    };
  }, [page, total]);
  return (
    <div className="pdf-preview">
      <div className="pdf-controls">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft size={16} /> Previous
        </button>
        <span>
          Page {page} / {total || "…"}
        </span>
        <button
          disabled={page === total || !total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next <ChevronRight size={16} />
        </button>
        <a
          href={"/api/original/" + id}
          download="Original sheet music.pdf"
          aria-label="Save original PDF"
        >
          <Download size={16} />
        </a>
      </div>
      <div ref={container} className="pdf-pages">
        {loading && (
          <div className="pdf-loading">
            <LoaderCircle className="spin" size={20} />
            Opening your original sheet…
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <canvas
          ref={canvas}
          aria-label={`Original PDF page ${page}`}
          data-ready={!loading && !error}
        />
      </div>
    </div>
  );
}
