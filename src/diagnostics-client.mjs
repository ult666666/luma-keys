// Faults in the page go to the diagnostics log beside the library (the
// server's /api/diagnostics): an error's message and where it happened, or a
// startup mark. Never music, settings or chat. Bounded and best effort: a
// report can never add a second fault, and a crash loop stops reporting.
let reports = 0;
export function reportDiagnostic(event, data = {}) {
  if (reports++ >= 20) return;
  try {
    fetch("/api/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...data }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Reporting must never throw into the page. */
  }
}
// Chrome reports this layout notice as an error event; it is not a fault.
const benign = (message) => /^ResizeObserver loop/.test(String(message || ""));
export function installFaultReporting(target = window) {
  target.addEventListener("error", (e) => {
    if (benign(e.message)) return;
    reportDiagnostic("renderer-error", {
      message: String(e.message || "").slice(0, 300),
      where: `${String(e.filename || "")
        .split("/")
        .pop()}:${e.lineno || 0}`,
    });
  });
  target.addEventListener("unhandledrejection", (e) =>
    reportDiagnostic("renderer-rejection", {
      message: String(e.reason?.message || e.reason || "").slice(0, 300),
    }),
  );
}
