import { useCallback, useEffect, useRef, useState } from "react";
import { readCompanionStream, requestCompanionReply } from "./companion-stream.mjs";
import { conversationLanguagePreference } from "./companion-language.mjs";
import { companionModelHistory } from "./companion-prompt.mjs";
import { withQuestion, withReply } from "./companion-turns.mjs";

export function useCompanionModel(conversation) {
  const [availability, setAvailability] = useState({
    available: false,
    reason: "checking",
  });
  const [pending, setPending] = useState(null);
  const [failure, setFailure] = useState(null);
  const active = useRef(null);
  const mounted = useRef(true);
  const store = useRef(conversation);
  store.current = conversation;
  const probeGeneration = useRef(0);
  const probe = useRef(null);
  const warm = useCallback(() => {
    // Called only when the conversation opens, never on app startup. Loading
    // can overlap the learner reading the thread or composing a question.
    void fetch("/api/companion/warm", { method: "POST" }).catch(() => {});
  }, []);

  const check = useCallback(() => {
    const token = ++probeGeneration.current;
    if (mounted.current)
      setAvailability({ available: false, reason: "checking" });
    const result = (async () => {
      let value;
      try {
        const response = await fetch("/api/companion/model");
        if (!response.ok) throw Error();
        const data = await response.json();
        value = {
          available: data.available === true,
          reason: String(data.reason || "unavailable"),
          model: typeof data.model === "string" ? data.model : "On-device model",
        };
      } catch {
        value = { available: false, reason: "connection" };
      }
      if (mounted.current && token === probeGeneration.current)
        setAvailability(value);
      return value;
    })();
    probe.current = result;
    return result;
  }, []);
  // A message typed while the first probe is still running waits for it,
  // instead of being answered as if no model were installed.
  const whenReady = useCallback(
    () => probe.current || Promise.resolve({ available: false, reason: "unavailable" }),
    [],
  );
  // A reply stopped or failed before any text still answers its question
  // with a short note, so questions never stack without an answer.
  function reply(request, text, interrupted = false, failed = false) {
    store.current.update((history) => withReply(history, request, text, { interrupted, failed }));
  }
  const cancel = useCallback(() => {
    const request = active.current;
    if (!request) return;
    active.current = null;
    request.controller.abort();
    reply(request, request.text, true);
    if (mounted.current) {
      setPending(null);
      setFailure({ message: "Reply stopped.", request, stopped: true });
    }
  }, []);
  async function run(request, retry = false) {
    if (active.current || !store.current.ready) return;
    const attempt = { ...request, text: "", controller: new AbortController() };
    active.current = attempt;
    // A retried question moves next to its new answer if other messages
    // arrived after it; its earlier partial or stopped reply is replaced.
    store.current.update((history) => withQuestion(history, attempt, retry));
    setPending({ ...attempt, message: "" });
    setFailure(null);
    try {
      const response = await requestCompanionReply(attempt.body, {
        signal: attempt.controller.signal,
      });
      const text = await readCompanionStream(response, (text) => {
        if (active.current !== attempt) return;
        attempt.text = text;
        if (mounted.current) setPending({ ...attempt, message: text });
      });
      if (active.current !== attempt) return;
      reply(attempt, text);
    } catch (error) {
      if (active.current !== attempt) return;
      reply(attempt, attempt.text, true, true);
      if (mounted.current)
        setFailure({
          message: error.message || "The reply was interrupted.",
          request: attempt,
        });
    } finally {
      if (active.current === attempt) {
        active.current = null;
        if (mounted.current) setPending(null);
      }
    }
  }
  function send({
    message,
    companionId,
    scoreId,
    scoreRevision,
    context,
    history,
  }) {
    const languagePreference = conversationLanguagePreference(history, message);
    return run({
      id: `chat-${crypto.randomUUID()}`,
      companionId,
      scoreId,
      scoreRevision,
      // This companion's turns about this piece; the prompt builder drops
      // stale, poisoned or other-language replies before the model sees them.
      body: { message, companionId, context, history: companionModelHistory(history, { companionId, scoreId }), ...(languagePreference ? { languagePreference } : {}) },
    });
  }
  useEffect(() => {
    mounted.current = true;
    check();
    return () => {
      mounted.current = false;
      probeGeneration.current++;
      cancel();
    };
  }, [check, cancel]);
  return {
    availability,
    pending,
    failure,
    check,
    warm,
    whenReady,
    send,
    cancel,
    dismiss: () => setFailure(null),
    retry: () => failure && run(failure.request, true),
  };
}
