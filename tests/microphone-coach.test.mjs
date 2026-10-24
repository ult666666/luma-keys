import test from "node:test";
import assert from "node:assert/strict";
import {
  createMicrophoneCoach,
  microphoneCoachCue,
  microphoneCoachLine,
  microphoneCoachRequest,
} from "../src/microphone-coach.mjs";
import { makeCompanionContext, buildCompanionPrompt } from "../src/companion-prompt.mjs";
import { buddyPracticeSay, onBuddy } from "../src/buddy.mjs";

const target = (extra = {}) => ({
  session: "run-1", target: "beat-4", expected: [60, 64], matched: [60],
  bar: 2, hand: "right", companionId: "cat", ...extra,
});
const context = () => makeCompanionContext({
  currentScore: { title: "A little tune", composer: "", measures: 4, meter: 4, duration: 16, notes: [] },
  currentBar: 2, hand: "right", mode: "wait", speed: 0.75,
});
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness(extra = {}) {
  const seen = [], requests = [], timers = new Map();
  let time = 0, timerId = 0;
  const coach = createMicrophoneCoach({
    onCue: (cue) => seen.push(cue),
    getContext: context,
    modelReady: () => true,
    requestReply: (body, options) => new Promise((resolve, reject) => requests.push({ body, ...options, resolve, reject })),
    now: () => time,
    setTimer: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimer: (id) => timers.delete(id),
    ...extra,
  });
  coach.setTarget(target());
  return { coach, seen, requests, timers, advance: (ms) => { time += ms; } };
}

test("microphone cues require a whole fresh chord and distinguish uncertain audio", () => {
  assert.match(microphoneCoachCue(target(), { kind: "help" }).text, /waiting for C4 \+ E4.*together/);
  assert.match(microphoneCoachCue(target(), { kind: "miss", midi: 65 }).text, /Detected F4.*C4 \+ E4/);
  assert.match(microphoneCoachCue(target(), { kind: "uncertain" }).text, /wasn't clear enough/);
  assert.doesNotMatch(microphoneCoachCue(target(), { kind: "uncertain" }).text, /wrong|mistake|missed/);
  assert.match(microphoneCoachCue(target({ matched: [60, 64] }), { kind: "hit" }).text, /matched/);
  assert.doesNotMatch(microphoneCoachCue(target(), { kind: "hit" }).text, /waiting/);
  assert.equal(microphoneCoachCue(target({ expected: [] }), { kind: "help" }), null);
  assert.equal(microphoneCoachCue(target(), { kind: "anything" }), null);
  for (const kind of ["hit", "miss", "help", "uncertain"])
    assert.ok(microphoneCoachCue(target({ expected: Array.from({ length: 88 }, (_, i) => i + 21) }), { kind, midi: 99 }).text.length <= 140);
});

test("model requests contain bounded note metadata and pass the existing chat schema", () => {
  const input = context();
  input.samples = new Float32Array([1, 2, 3]);
  input.transcript = "PRIVATE ROOM CONVERSATION";
  input.piece.originalPath = "/Users/private/song.pdf";
  input.practice.rawAudio = "PRIVATE AUDIO";
  const body = microphoneCoachRequest(target({ audio: "PRIVATE SAMPLES", device: "PRIVATE DEVICE" }), { kind: "miss", midi: 65, samples: "PRIVATE FRAME" }, input);
  const encoded = JSON.stringify(body);
  assert.match(body.message, /local microphone note detector/);
  assert.match(body.message, /waiting for C4 \+ E4/);
  assert.match(body.message, /individual notes do not accumulate/);
  assert.match(body.message, /Most recent detected pitch: F4/);
  assert.match(body.message, /not audio/);
  assert.doesNotMatch(encoded, /PRIVATE|samples|transcript|originalPath|rawAudio|\/Users/);
  assert.deepEqual(body.history, []);
  assert.doesNotThrow(() => buildCompanionPrompt(body));
});

test("instant cues are synchronous and detection never waits for the model", async () => {
  const h = harness();
  const cue = h.coach.observe({ kind: "help" });
  assert.equal(cue.kind, "help");
  assert.equal(h.seen.length, 1);
  assert.equal(h.requests.length, 0, "inference starts outside the detection callback");
  await flush();
  assert.equal(h.requests.length, 1);
  h.coach.observe({ kind: "uncertain" });
  h.coach.observe({ kind: "miss", midi: 65 });
  h.coach.observe({ kind: "help" });
  await flush();
  assert.equal(h.requests.length, 1, "one model turn at a time");
  assert.equal(h.seen.length, 1, "repeated microphone events do not flood bubbles");
  h.requests[0].resolve("Try a fresh press on E4.");
  await flush();
  assert.equal(h.seen.at(-1).kind, "tip");
  assert.equal(h.timers.size, 0);
  h.coach.dispose();
});

test("seeks, matched notes, character changes and disconnects abort stale advice", async () => {
  for (const change of [target({ session: "seek-2" }), target({ target: "beat-5" }), target({ matched: [] }), target({ companionId: "bunny" }), null]) {
    const h = harness();
    h.coach.observe({ kind: "help" });
    await flush();
    const pending = h.requests[0];
    h.coach.setTarget(change);
    assert.equal(pending.signal.aborted, true);
    assert.equal(h.timers.size, 0);
    pending.resolve("Old target advice.");
    await flush();
    assert.equal(h.seen.length, 1);
    h.coach.dispose();
  }
});

test("timeouts, model failures and unmount leave local cues working", async () => {
  const h = harness();
  h.coach.observe({ kind: "help" });
  await flush();
  [...h.timers.values()][0]();
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve("Too late.");
  await flush();
  assert.equal(h.seen.length, 1);
  h.advance(31000);
  h.coach.observe({ kind: "help" });
  await flush();
  h.requests[1].reject(Error("offline"));
  await flush();
  assert.equal(h.seen.length, 2, "immediate help remains available after model failure");
  h.advance(31000);
  h.coach.observe({ kind: "help" });
  await flush();
  h.coach.dispose();
  assert.equal(h.requests[2].signal.aborted, true);
  h.requests[2].resolve("Do not show after unmount.");
  await flush();
  assert.equal(h.coach.observe({ kind: "help" }), null);
  assert.equal(h.timers.size, 0);
  assert.equal(h.seen.length, 3);
});

test("chat priority, model cooldown and failing listeners never affect matching", async () => {
  let ready = false;
  const h = harness({ modelReady: () => ready });
  h.coach.observe({ kind: "help" });
  await flush();
  assert.equal(h.requests.length, 0);
  ready = true;
  h.coach.observe({ kind: "help" });
  await flush();
  h.requests[0].resolve("");
  await flush();
  h.advance(6000);
  h.coach.observe({ kind: "help" });
  await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.seen.length, 2, "local cue cooldown is independent of model cooldown");
  h.coach.dispose();
  const broken = harness({ onCue: () => { throw Error("missing UI"); } });
  assert.doesNotThrow(() => broken.coach.observe({ kind: "help" }));
  broken.coach.dispose();
  await flush();
  assert.equal(broken.requests.length, 0, "cancel before the scheduled inference prevents work");
});

test("default transport yields to a busy local model without retries", async () => {
  const priorFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "/api/companion/chat");
    assert.equal(options.method, "POST");
    return new Response(JSON.stringify({ code: "modelBusy" }), { status: 409 });
  };
  const seen = [];
  const coach = createMicrophoneCoach({ onCue: (cue) => seen.push(cue), getContext: context, modelReady: () => true });
  try {
    coach.setTarget(target());
    coach.observe({ kind: "help" });
    await flush();
    assert.equal(calls, 1);
    assert.equal(seen.length, 1);
  } finally {
    coach.dispose();
    globalThis.fetch = priorFetch;
  }
});

test("model lines remain short and do not claim direct hearing or model training", () => {
  assert.equal(microphoneCoachLine("Try a fresh press. Then continue."), "Try a fresh press.");
  for (const text of ["I heard a wrong note.", "I can hear your piano.", "I trained myself on your playing.", "x".repeat(141), "```code```", ""]) assert.equal(microphoneCoachLine(text), "");
});

test("practice bus tags silent bounded cues without breaking other listeners", () => {
  const events = [];
  const bad = onBuddy(() => { throw Error("broken"); });
  const off = onBuddy((event) => events.push(event));
  buddyPracticeSay({ text: "  E4 is next.  ", mood: "celebrate", audio: "NEVER" });
  buddyPracticeSay({ text: "x".repeat(500) });
  buddyPracticeSay({ text: "" });
  off(); bad();
  assert.equal(events.length, 2);
  assert.equal(events[0].source, "microphone");
  assert.equal(events[0].text, "E4 is next.");
  assert.equal(events[0].mood, "celebrate");
  assert.equal(events[1].text.length, 140);
  assert.equal(events[1].mood, "listening");
  assert.equal(events[0].audio, undefined);
});
