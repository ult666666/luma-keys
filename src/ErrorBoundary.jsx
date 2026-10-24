// Crash containment for the renderer. Before 2.43 an exception thrown while
// rendering any component — a WebGL hiccup in the 3-D hands, an engraving
// error, a malformed score field — unmounted the whole app and left a blank
// window. Each major part now has its own boundary: the part shows a short,
// calm notice with Try again, the rest of the app keeps working, and the
// fault (message and part, never music or chat) goes to the diagnostics log.
import { Component, createElement } from "react";
import { reportDiagnostic } from "./diagnostics-client.mjs";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  // A new piece or screen (resetKey) is a fresh start for the part.
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey)
      return { error: null, resetKey: props.resetKey };
    return null;
  }
  componentDidCatch(error, info) {
    reportDiagnostic("renderer-error", {
      message: String(error?.message || error).slice(0, 300),
      where: `boundary:${this.props.name || "part"}`,
      stack: String(info?.componentStack || "")
        .trim()
        .split("\n")
        .slice(0, 2)
        .join(" ")
        .slice(0, 200),
    });
    this.props.onError?.(error);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback === null) return null;
    const label = this.props.label || "This part of Luma Keys";
    return (
      <div className="part-fault" role="alert" data-part={this.props.name}>
        <strong>{label} hit a problem.</strong>
        <span>Your music, settings and practice are safe.</span>
        <button
          type="button"
          className="secondary small"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}

// Wrap a component where it is imported, so every place it is used gets a
// boundary. `resetKey(props)` names what makes a fresh start (a new score).
// (In development only, `window.__lumaFault = "<name>"` makes that part
// throw, to check its boundary; production builds drop this.)
function Fault({ name }) {
  if (typeof window !== "undefined" && window.__lumaFault === name)
    throw Error(`Test fault in ${name}`);
  return null;
}
export function withBoundary(Inner, { name, label, resetKey = null, fallback } = {}) {
  function Bounded(props) {
    return (
      <ErrorBoundary
        name={name}
        label={label}
        resetKey={resetKey ? resetKey(props) : undefined}
        fallback={fallback}
      >
        {import.meta.env?.DEV && <Fault name={name} />}
        {createElement(Inner, props)}
      </ErrorBoundary>
    );
  }
  Bounded.displayName = `Bounded(${name || Inner.displayName || Inner.name || "part"})`;
  return Bounded;
}

// The whole app's last resort: a crash outside every part's boundary shows
// a full-window notice with Reload instead of a blank window.
export class AppBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    reportDiagnostic("renderer-error", {
      message: String(error?.message || error).slice(0, 300),
      where: "boundary:app",
      stack: String(info?.componentStack || "")
        .trim()
        .split("\n")
        .slice(0, 2)
        .join(" ")
        .slice(0, 200),
    });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-fault" role="alert">
        <h1>Luma Keys hit a problem</h1>
        <p>
          Your scores, settings and practice journal are saved in Desktop / Luma
          Keys / Library and are safe.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload Luma Keys
        </button>
      </div>
    );
  }
}
