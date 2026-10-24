import { useCallback, useEffect, useRef, useState } from "react";
import { readCompanionHistory } from "./companion-conversation.mjs";
import { clearLegacyChatReactions } from "./chat-ui.mjs";

// Conversation lives only in this renderer. Closing the little panel keeps
// the current exchange available; reloading or quitting starts with no chat.
// No transcript is sent to a storage API or placed in browser storage.
// Only legacy cleanup status is checked; cleanup can be retried without text.
export function useCompanionHistory() {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const cleanup = useCallback(async (retry = false) => {
    try {
      const response = await fetch(retry ? "/api/companion/history" : "/api/health", {
        method: retry ? "DELETE" : "GET", cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || (!retry && data.companionHistory?.cleanup?.ok !== true))
        throw Error("Earlier saved chat could not be cleared. Retry cleanup.");
      if (mounted.current) setError("");
    } catch {
      if (mounted.current) setError("Earlier saved chat could not be cleared. Retry cleanup.");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    try { clearLegacyChatReactions(window.localStorage); } catch {}
    void cleanup();
    return () => { mounted.current = false; };
  }, [cleanup]);
  const current = useRef(messages);
  const update = useCallback((value) => {
    const next = readCompanionHistory(
      typeof value === "function" ? value(current.current) : value,
    );
    current.current = next;
    setMessages(next);
  }, []);
  // The close coordinator still awaits flush along with score/preferences.
  // A temporary conversation has nothing to write and can never block Quit.
  const flush = useCallback(async () => {}, []);
  return { messages, ready: true, error, saving: false, update, flush, retry: () => cleanup(true) };
}
