import { noteName } from "./music.mjs";
import { readCompanionStream } from "./companion-stream.mjs";

const hands = ["left", "right", "both"];
const companions = ["beethoven", "mozart", "liszt", "langlang", "cat", "bunny"];
const pitch = (value) => Number.isInteger(value) && value >= 21 && value <= 108;
const pitches = (value) => [...new Set(Array.isArray(value) ? value.filter(pitch) : [])].slice(0, 12);
const plain = (value, max = 160) => typeof value === "string"
  ? value.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max)
  : "";
const names = (notes) => notes.slice(0, 3).map((midi) => noteName(midi)).join(" + ") + (notes.length > 3 ? " + more" : "");

/** Metadata only. Never retain audio samples, stream objects or raw score files. */
function targetSnapshot(value) {
  if (!value || typeof value.session !== "string" || typeof value.target !== "string") return null;
  const expected = pitches(value.expected);
  if (!expected.length) return null;
  return {
    session: value.session.slice(0, 200),
    target: value.target.slice(0, 200),
    expected,
    matched: pitches(value.matched).filter((midi) => expected.includes(midi)),
    bar: Math.max(1, Math.min(1e6, Math.trunc(value.bar) || 1)),
    hand: hands.includes(value.hand) ? value.hand : "both",
    companionId: companions.includes(value.companionId) ? value.companionId : "cat",
  };
}

/** Instant, deterministic help. An uncertain sound is never called a mistake. */
export function microphoneCoachCue(value, event = {}) {
  const target = targetSnapshot(value);
  if (!target) return null;
  const next = names(target.expected);
  let text, mood = "listening";
  if (event.kind === "hit") {
    mood = "celebrate";
    text = "That matched. A tiny victory!";
  } else if (event.kind === "miss") {
    text = pitch(event.midi) ? `Detected ${noteName(event.midi)}; we're waiting for ${next}. Take your time.` : `Let's find ${next}. Take your time.`;
  } else if (event.kind === "uncertain") {
    text = "That sound wasn't clear enough to check. Try one key with the pedal up.";
  } else if (event.kind === "help") {
    text = `Still waiting for ${next}. ${target.expected.length > 1 ? "Play these together, with the pedal up." : "Find the lit key and try a fresh press."}`;
  } else return null;
  return { text: text.slice(0, 140), mood, kind: event.kind };
}

// Project only the existing chat schema. Extra fields (including samples,
// transcripts, device names, paths and full score XML) cannot enter a request.
function promptContext(context) {
  if (!context?.practice) throw new Error("No practice context");
  const take = (value, fields) => Object.fromEntries(fields.flatMap((key) => {
    const item = value?.[key];
    return ["string", "number", "boolean"].includes(typeof item)
      ? [[key, typeof item === "string" ? plain(item, 600) : item]] : [];
  }));
  const piece = context.piece ? take(context.piece, ["title", "composer", "bars", "key"]) : null;
  const practice = take(context.practice, ["bar", "speedPercent", "hand", "numberOne", "labelMode"]);
  practice.mode = "wait";
  return {
    piece,
    practice,
    // A tip about the current target needs no excerpt or practice history.
    notes: [],
    guide: null,
    lastPractice: null,
  };
}

export function microphoneCoachRequest(value, event, context) {
  const target = targetSnapshot(value);
  if (!target) return null;
  const detected = pitch(event?.midi) ? ` Most recent detected pitch: ${noteName(event.midi)}.` : "";
  const message = `Please give one gentle, practical piano tip in one sentence under 120 characters for bar ${target.bar}. ` +
    `The app's local microphone note detector is waiting for ${names(target.expected)}.${detected} ` +
    "Detection can be uncertain; this is note metadata, not audio. You have not heard the playing. " +
    (target.expected.length > 1 ? "The whole chord must be freshly played together; individual notes do not accumulate. Suggest playing all required keys together with pedal up. " : "Help with finding the next key or a clear fresh press. ") +
    "Do not assess technique, claim to listen, invent fingering, or change controls.";
  return {
    message,
    companionId: target.companionId,
    context: promptContext(context),
    history: [],
  };
}

/** Only a completed short textual tip can replace the immediate cue. */
export function microphoneCoachLine(value) {
  const text = plain(value, 4000).replace(/\s+/g, " ");
  if (!text || /[`{}<>]|\b(?:i (?:heard|hear|listened|noticed|watched)|i can hear|your playing (?:sounds|sounded)|trained (?:myself|on your)|(?:set|changed|switched) your)\b/i.test(text)) return "";
  const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] || text;
  return first.length <= 140 ? first : "";
}

async function localReply(body, { signal, fetchImpl = fetch } = {}) {
  // Coaching yields immediately to a busy chat. Unlike a user-sent question,
  // a background tip must never queue retries for the model's single slot.
  const response = await fetchImpl("/api/companion/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 409) {
    await response.body?.cancel().catch(() => {});
    return "";
  }
  return readCompanionStream(response, () => {});
}

/** Independent of note matching. observe() is synchronous; inference is
 * best-effort, one request at a time, no history persistence and no speech.
 * Use a new session after any seek/stop/score change, and setTarget(null)
 * before chat opens, microphone stops, the document hides, or unmounting. */
export function createMicrophoneCoach({
  onCue = () => {},
  getContext = () => null,
  modelReady = () => false,
  requestReply = localReply,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  cueCooldownMs = 5000,
  modelCooldownMs = 30000,
  timeoutMs = 6000,
} = {}) {
  let target = null, generation = 0, active = null, disposed = false;
  let lastCue = -Infinity, lastModel = -Infinity, misses = 0, successes = 0;
  const publish = (cue) => {
    if (!cue) return;
    try { onCue(cue); } catch { /* Coaching must never interrupt matching. */ }
  };
  function cancel() {
    generation++;
    if (active) {
      active.controller.abort();
      clearTimer(active.timer);
      active = null;
    }
  }
  function setTarget(value) {
    if (disposed) return;
    const next = targetSnapshot(value);
    const changed = !next || !target || next.session !== target.session || next.target !== target.target ||
      next.companionId !== target.companionId || next.expected.join() !== target.expected.join() ||
      next.matched.join() !== target.matched.join();
    if (changed) {
      cancel();
      misses = 0;
    }
    if (!next || next.session !== target?.session) {
      lastCue = -Infinity;
      successes = 0;
    }
    target = next;
  }
  function background(event) {
    if (!target || active || disposed || now() - lastModel < modelCooldownMs) return;
    let body;
    try {
      if (!modelReady()) return;
      body = microphoneCoachRequest(target, event, getContext());
    } catch { return; }
    if (!body) return;
    lastModel = now();
    const token = generation, controller = new AbortController();
    const attempt = { controller, timer: null };
    active = attempt;
    attempt.timer = setTimer(() => {
      if (active === attempt) cancel();
    }, Math.max(1, timeoutMs));
    // Promise scheduling also keeps a synchronous adapter failure off the
    // detector callback; nothing in this path controls transport or hits.
    void Promise.resolve().then(() => {
      if (disposed || controller.signal.aborted || token !== generation) return "";
      return requestReply(body, { signal: controller.signal });
    }).then((reply) => {
      if (disposed || controller.signal.aborted || token !== generation || active !== attempt) return;
      const text = microphoneCoachLine(reply);
      if (text) publish({ text, mood: "listening", kind: "tip", source: "model" });
    }).catch(() => {}).finally(() => {
      clearTimer(attempt.timer);
      if (active === attempt) active = null;
    });
  }
  function observe(event = {}) {
    if (!target || disposed) return null;
    const cue = microphoneCoachCue(target, event);
    if (!cue) return null;
    if (event.kind === "miss") misses++;
    if (event.kind === "hit") { successes++; misses = 0; }
    // Existing verdict animations react to every hit. Text stays sparse.
    if (now() - lastCue >= cueCooldownMs && (event.kind !== "hit" || successes % 4 === 0)) {
      lastCue = now();
      publish(cue);
    }
    if (event.kind === "help" || (event.kind === "miss" && misses >= 3)) background(event);
    return cue;
  }
  return {
    setTarget,
    observe,
    cancel,
    dispose() { cancel(); target = null; disposed = true; },
  };
}
