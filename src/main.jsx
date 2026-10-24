import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppBoundary } from "./ErrorBoundary.jsx";
import { installFaultReporting } from "./diagnostics-client.mjs";
import "./style.css";
import "./material.css";
import "./shell.css";
// Practice layout and hand guidance.
import "./keyboard-guide.css";
// Shared component styles.
import "./design.css";
// Instrument materials and motion.
import "./stage.css";
// App chrome, non-playing screens and dialogs.
import "./studio.css";
import "./maestro.css";
import "./salon.css";
import "./backing.css";
import "./atelier.css";
import "./conversation.css";
import "./keyboard-theme.css";
import "./library-atelier.css";
import "./companion-dock.css";
import "./practice-workspace.css";
import "./motion.css";
import "./cute.css";
import "./transitions.css";
import "./feedback.css";
import "./opulent.css";
import "./library-flow.css";
import "./practice-art.css";
import "./colour-flow.css";
import "./progress-cute.css";
import "./exercises-cute.css";
import "./microphone.css";
import "./practice-page.css";
// Trouble spots: marks, chips and the drill.
import "./trouble-spots.css";
installFaultReporting();
createRoot(document.getElementById("root")).render(
  <AppBoundary>
    <App />
  </AppBoundary>,
);
