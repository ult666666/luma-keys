import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createMicrophoneInput } from "../src/microphone-input.mjs";
import { getAudioOutput, setMicrophoneOutputMuted } from "../src/audio-output.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function track() {
  return { readyState: "live", stops: 0, onended: null, stop() { this.stops++; this.readyState = "ended"; } };
}
function stream() {
  const audio = track();
  return { audio, getTracks: () => [audio], getAudioTracks: () => [audio] };
}
function node() {
  return {
    connections: [], disconnects: 0, port: { onmessage: null },
    connect(to) { this.connections.push(to); },
    disconnect() { this.disconnects++; this.connections = []; },
  };
}
function harness({ permission, module, resume } = {}) {
  const states = [], attacks = [], contexts = [], workers = [], nodes = [], sources = [], streams = [], constraints = [];
  const media = { getUserMedia: async (value) => {
    constraints.push(value);
    if (permission) return permission.promise;
    const valueStream = stream(); streams.push(valueStream); return valueStream;
  } };
  const input = createMicrophoneInput({
    media,
    onStatus: (state) => states.push(state),
    onAttack: (event, scope) => attacks.push({ event, scope }),
    makeContext: () => {
      const ctx = {
        currentTime: 0, sampleRate: 48000, destination: {}, closes: 0,
        audioWorklet: { addModule: (path) => { assert.equal(path, "/microphone-worklet.js"); return module?.promise || Promise.resolve(); } },
        createMediaStreamSource: (value) => { assert.equal(value.getAudioTracks()[0].readyState, "live"); const source = node(); sources.push(source); return source; },
        resume: () => resume?.promise || Promise.resolve(),
        close() { this.closes++; return Promise.resolve(); },
      };
      contexts.push(ctx); return ctx;
    },
    makeWorker: () => {
      const worker = { messages: [], terminates: 0, onmessage: null, onerror: null,
        postMessage(message, transfers) { this.messages.push({ message, transfers }); },
        terminate() { this.terminates++; },
      };
      workers.push(worker); return worker;
    },
    makeNode: () => { const value = node(); nodes.push(value); return value; },
  });
  const sendAudio = (start = 0, samples = new Float32Array(1024)) => nodes.at(-1).port.onmessage?.({ data: { start, samples } });
  const sendWorker = (data) => workers.at(-1).onmessage?.({ data });
  return { input, states, attacks, contexts, workers, nodes, sources, streams, constraints, sendAudio, sendWorker };
}

test("capture requests only unprocessed mono audio and routes it solely through a silent worklet", async () => {
  const h = harness();
  assert.equal(await h.input.start("chosen-device"), true);
  assert.deepEqual(h.constraints, [{ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: { exact: "chosen-device" } }, video: false }]);
  assert.deepEqual(h.sources[0].connections, [h.nodes[0]]);
  assert.ok(!h.sources[0].connections.includes(h.contexts[0].destination), "raw microphone has no speaker route");
  assert.deepEqual(h.nodes[0].connections, [h.contexts[0].destination], "silent output keeps worklet processing active");
  assert.equal(h.input.getState().tracks, 1);
  h.input.stop();
  assert.equal(h.streams[0].audio.stops, 1);
  assert.equal(h.sources[0].disconnects, 1);
  assert.equal(h.nodes[0].disconnects, 1);
  assert.equal(h.nodes[0].port.onmessage, null);
  assert.equal(h.workers[0].terminates, 1);
  assert.equal(h.contexts[0].closes, 1);
  assert.deepEqual(h.input.getState(), { phase: "off", scope: null, detector: null, pending: 0, tracks: 0 });
});

test("permission granted after Stop releases the newly granted stream without starting audio", async () => {
  const permission = deferred(), h = harness({ permission });
  const starting = h.input.start();
  assert.equal(h.input.getState().phase, "requesting");
  h.input.stop();
  const late = stream(); permission.resolve(late);
  assert.equal(await starting, false);
  assert.equal(late.audio.stops, 1);
  assert.equal(h.contexts.length, 0);
  assert.equal(h.workers.length, 0);
  assert.equal(h.input.getState().phase, "off");
});

test("Stop during worklet loading or context resume closes every acquired resource", async () => {
  for (const phase of ["module", "resume"]) {
    const waiting = deferred(), h = harness({ [phase]: waiting });
    const starting = h.input.start(); await tick();
    assert.equal(h.contexts.length, 1);
    assert.equal(h.workers.length, phase === "module" ? 0 : 1);
    h.input.stop();
    waiting.resolve();
    assert.equal(await starting, false);
    assert.equal(h.streams[0].audio.stops, 1);
    assert.equal(h.contexts[0].closes, 1);
    assert.equal(h.input.getState().phase, "off");
    if (phase === "resume") assert.equal(h.workers[0].terminates, 1);
  }
});

test("permission denial, unavailable input and disconnected tracks report errors and stop capture", async () => {
  for (const name of ["NotAllowedError", "NotFoundError"]) {
    const permission = deferred(), h = harness({ permission });
    const starting = h.input.start();
    permission.reject(Object.assign(Error("denied"), { name }));
    assert.equal(await starting, false);
    assert.equal(h.input.getState().phase, "error");
    assert.match(h.states.at(-1).error, name === "NotAllowedError" ? /not allowed/ : /No microphone/);
    assert.equal(h.input.getState().tracks, 0);
  }
  const h = harness(); await h.input.start();
  h.streams[0].audio.onended();
  assert.equal(h.input.getState().phase, "error");
  assert.match(h.states.at(-1).error, /disconnected/);
  assert.equal(h.input.getState().tracks, 0);
  assert.equal(h.workers[0].terminates, 1);
  assert.equal(h.contexts[0].closes, 1);
});

test("worker failures and setup failures release tracks and audio resources", async () => {
  const h = harness(); await h.input.start();
  h.workers[0].onerror(Error("worker crashed"));
  assert.equal(h.input.getState().phase, "error");
  assert.equal(h.input.getState().tracks, 0);
  const module = deferred(), bad = harness({ module });
  const starting = bad.input.start(); await tick();
  module.reject(Error("module unavailable"));
  assert.equal(await starting, false);
  assert.match(bad.states.at(-1).error, /module unavailable/);
  assert.equal(bad.streams[0].audio.stops, 1);
  assert.equal(bad.contexts[0].closes, 1);
});

test("stale worker attacks and statuses cannot update a new target or stopped generation", async () => {
  const h = harness(); await h.input.start();
  const old = h.input.setTarget("old", [60]);
  const current = h.input.setTarget("new", [64]);
  const event = { notes: [60], confidence: 0.99 };
  h.sendWorker({ type: "attack", scope: old, event, captureEnd: 0 });
  assert.equal(h.attacks.length, 0);
  h.sendWorker({ type: "attack", scope: current, event: { notes: [64] }, captureEnd: 0 });
  assert.equal(h.attacks.length, 1);
  h.contexts[0].currentTime = 1;
  h.sendWorker({ type: "attack", scope: current, event: { notes: [64] }, captureEnd: 0.5 });
  assert.equal(h.attacks.length, 1, "a confirmed attack older than 300 ms cannot advance after a main-thread stall");
  h.sendWorker({ type: "attack", scope: current, event: { notes: [64] }, captureEnd: 0.95 });
  assert.equal(h.attacks.length, 2, "a fresh current-scope attack remains eligible");
  h.sendWorker({ type: "status", scope: current, status: { rms: 0.02 } });
  h.sendWorker({ type: "status", scope: old, status: { rms: 1 } });
  assert.equal(h.input.getState().detector.rms, 0.02, "old-target status must not replace current status");
  const late = h.workers[0].onmessage;
  h.input.stop();
  late({ data: { type: "attack", scope: current, event, captureEnd: 1 } });
  late({ data: { type: "status", scope: current, status: { rms: 1 } } });
  assert.equal(h.attacks.length, 2);
  assert.equal(h.input.getState().detector, null);
});

test("null targets keep the input meter running but cannot publish note attacks", async () => {
  const h = harness(); await h.input.start();
  const old = h.input.setTarget("target", [60]);
  h.input.setTarget(null);
  h.sendAudio();
  assert.equal(h.workers[0].messages.at(-1).message.type, "audio");
  assert.equal(h.workers[0].messages.at(-1).message.scope, null);
  h.sendWorker({ type: "status", scope: null, status: { rms: 0.01 } });
  assert.equal(h.input.getState().detector.rms, 0.01);
  h.sendWorker({ type: "attack", scope: old, event: { notes: [60] } });
  h.sendWorker({ type: "attack", scope: null, event: { notes: [60] } });
  assert.equal(h.attacks.length, 0);
  h.input.stop();
});

test("target barriers discard queued old samples and a new context starts its clock from zero", async () => {
  const h = harness(); await h.input.start();
  h.contexts[0].currentTime = 50;
  h.input.setTarget("at-50-seconds", [60]);
  h.sendAudio(49.9);
  assert.equal(h.input.getState().pending, 0);
  h.sendAudio(50.1);
  assert.equal(h.input.getState().pending, 1);
  h.input.stop();
  await h.input.start();
  h.input.setTarget(null);
  h.sendAudio(0.1);
  assert.equal(h.input.getState().pending, 1, "the previous context's barrier must not mute a restarted input meter");
  h.input.stop();
});

test("the latest target supplied during startup reaches the worker after initialization", async () => {
  const module = deferred(), h = harness({ module });
  const starting = h.input.start(); await tick();
  h.input.setTarget("old", [60]);
  const current = h.input.setTarget("latest", [64, 67]);
  module.resolve(); assert.equal(await starting, true);
  const targets = h.workers[0].messages.filter(({ message }) => message.type === "target");
  assert.equal(targets.at(-1)?.message.scope, current);
  assert.deepEqual(targets.at(-1)?.message.expected, [64, 67]);
  h.input.stop();
});

test("audio backpressure keeps only the latest held frame, resets after a gap and ignores old acknowledgements", async () => {
  const h = harness(); await h.input.start();
  const frames = Array.from({ length: 6 }, (_, i) => new Float32Array(1024).fill(i));
  for (let i = 0; i < frames.length; i++) h.sendAudio(0.02 * i, frames[i]);
  const audio = () => h.workers[0].messages.filter(({ message }) => message.type === "audio");
  assert.equal(h.input.getState().pending, 4);
  assert.equal(h.input.getState().phase, "listening", "cold worker startup must not disconnect capture");
  assert.equal(h.input.getState().tracks, 1);
  assert.equal(audio().length, 4, "four frames in flight and at most one held");
  h.sendWorker({ type: "ack" });
  assert.equal(audio().length, 5);
  assert.equal(audio().at(-1).message.samples, frames[5], "a replaced held frame is never replayed");
  assert.equal(audio().at(-1).message.reset, true, "the detector must forget an interrupted onset before consuming the latest frame");
  assert.equal(h.input.getState().pending, 4);
  assert.ok(!audio().some(({ message }) => message.samples === frames[4]));
  for (let i = 0; i < 4; i++) h.sendWorker({ type: "ack" });
  assert.equal(h.input.getState().pending, 0);
  assert.equal(audio().length, 5, "acknowledgements cannot replay any discarded frames");
  const old = h.workers[0].onmessage;
  h.input.stop();
  await h.input.start(); h.sendAudio();
  old({ data: { type: "ack" } });
  assert.equal(h.input.getState().pending, 1);
  h.sendWorker({ type: "ack" }); h.sendWorker({ type: "ack" });
  assert.equal(h.input.getState().pending, 0, "extra acknowledgements cannot make the count negative");
  h.input.stop();
});

test("target changes discard held old-target PCM before acknowledgements release a slot", async () => {
  const h = harness(); await h.input.start();
  h.input.setTarget("old", [60]);
  for (let i = 0; i < 4; i++) h.sendAudio();
  const held = new Float32Array(1024).fill(0.75);
  h.sendAudio(0.01, held);
  h.contexts[0].currentTime = 0.02;
  const next = h.input.setTarget("next", [64]);
  h.sendWorker({ type: "ack" });
  const audio = () => h.workers[0].messages.filter(({ message }) => message.type === "audio");
  assert.equal(audio().length, 4, "changing target clears the held frame");
  assert.equal(h.input.getState().pending, 3);
  h.sendAudio(0.03);
  assert.equal(audio().length, 5);
  assert.equal(audio().at(-1).message.scope, next);
  assert.ok(!audio().some(({ message }) => message.samples === held));
  h.input.stop();
});

test("old capture frames are dropped after a long main-thread stall and the next fresh frame resets analysis", async () => {
  const h = harness(); await h.input.start();
  h.contexts[0].currentTime = 1;
  const stale = new Float32Array(1024).fill(0.25);
  h.sendAudio(0.5, stale);
  assert.equal(h.input.getState().pending, 0);
  const fresh = new Float32Array(1024).fill(0.5);
  h.sendAudio(1, fresh);
  const audio = h.workers[0].messages.filter(({ message }) => message.type === "audio");
  assert.equal(audio.length, 1);
  assert.equal(audio[0].message.samples, fresh);
  assert.equal(audio[0].message.reset, true);
  assert.equal(h.input.getState().phase, "listening");
  h.input.stop();
});

test("a held frame that expires before its acknowledgement is dropped rather than replayed", async () => {
  const h = harness(); await h.input.start();
  for (let i = 0; i < 4; i++) h.sendAudio();
  const expired = new Float32Array(1024).fill(0.9);
  h.sendAudio(0.1, expired);
  h.contexts[0].currentTime = 0.5;
  h.sendWorker({ type: "ack" });
  const audio = () => h.workers[0].messages.filter(({ message }) => message.type === "audio");
  assert.equal(audio().length, 4);
  assert.equal(h.input.getState().pending, 3);
  h.sendAudio(0.5);
  assert.equal(audio().length, 5);
  assert.equal(audio().at(-1).message.reset, true);
  assert.ok(!audio().some(({ message }) => message.samples === expired));
  h.input.stop();
});

test("capture worklet transfers bounded PCM frames and never copies input into its audible output", async () => {
  const code = await readFile(new URL("../public/microphone-worklet.js", import.meta.url), "utf8");
  let Processor; const packets = [];
  const sandbox = {
    Float32Array, currentFrame: 0, sampleRate: 48000,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (message, transfer) => packets.push({ message, transfer }) }; } },
    registerProcessor: (name, value) => { assert.equal(name, "luma-piano-capture"); Processor = value; },
  };
  vm.runInNewContext(code, sandbox);
  const processor = new Processor();
  for (let i = 0; i < 16; i++) {
    sandbox.currentFrame = i * 128;
    const input = new Float32Array(128).fill(0.5), output = new Float32Array(128);
    assert.equal(processor.process([[input]], [[output]]), true);
    assert.ok(output.every((value) => value === 0), "worklet produces silence even when input is loud");
  }
  assert.equal(packets.length, 2);
  assert.equal(packets[0].message.samples.length, 1024);
  assert.equal(packets[0].message.start, 0);
  assert.equal(packets[1].message.start, 1024 / 48000);
  assert.equal(packets[0].transfer[0], packets[0].message.samples.buffer);
  assert.notEqual(packets[0].message.samples.buffer, packets[1].message.samples.buffer);
  assert.ok(packets[0].message.samples.every((value) => value === 0.5));
});

test("the worker acknowledges audio with no target and only emits fresh events for its current scope", async () => {
  const code = (await readFile(new URL("../src/microphone-worker.js", import.meta.url), "utf8")).replace(/^import[^\n]+\n/, "");
  const packets = []; let elapsed = 0, events = [], targetNotes, supported = true, resets = 0;
  const sandbox = {
    self: { postMessage: (message) => packets.push(message) },
    performance: { now: () => 1000 + elapsed },
    createMicrophoneDetector: ({ sampleRate }) => {
      assert.equal(sampleRate, 48000);
      return { process: () => { elapsed += 1; return events; }, getStatus: () => ({ timeSeconds: elapsed, rms: 0.02, supported }), setExpected: (value) => { targetNotes = value; }, reset: () => { resets++; elapsed = 0; } };
    },
  };
  vm.runInNewContext(code, sandbox);
  const send = (data) => sandbox.self.onmessage({ data });
  send({ type: "init", sampleRate: 48000 });
  events = [{ timeSeconds: 1, notes: [60] }];
  send({ type: "audio", scope: null, samples: new Float32Array(1024) });
  assert.ok(packets.some((packet) => packet.type === "status"));
  assert.equal(packets.at(-1).type, "ack");
  assert.ok(!packets.some((packet) => packet.type === "attack"));
  send({ type: "target", scope: "new", expected: [64] });
  assert.deepEqual(targetNotes, [64]);
  events = [{ timeSeconds: 0.9, notes: [60] }, { timeSeconds: 1.2, notes: [64] }];
  send({ type: "audio", scope: "old", samples: new Float32Array(1024) });
  assert.ok(!packets.some((packet) => packet.type === "attack"));
  send({ type: "audio", scope: "new", samples: new Float32Array(1024), captureEnd: 9 });
  const attacks = packets.filter((packet) => packet.type === "attack");
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].event.notes[0], 64);
  assert.equal(attacks[0].scope, "new");
  assert.equal(attacks[0].captureEnd, 9, "capture time is preserved independently of the detector's internal clock");
  supported = false;
  send({ type: "target", scope: "unsupported", expected: [36] });
  events = [{ timeSeconds: elapsed + 0.2, notes: [36] }];
  send({ type: "audio", scope: "unsupported", samples: new Float32Array(1024) });
  assert.equal(packets.filter((packet) => packet.type === "attack").length, 1, "unsupported targets remain held, even when the detector reports the expected pitch");
  assert.equal(packets.at(-1).type, "ack", "unsupported capture still frees its audio backlog slot");
  supported = true;
  send({ type: "target", scope: "after-gap", expected: [64] });
  events = [{ timeSeconds: 0.2, notes: [64] }];
  send({ type: "audio", scope: "after-gap", samples: new Float32Array(1024), reset: true, captureEnd: 10 });
  assert.equal(resets, 1, "a PCM gap clears old onset history before processing");
  assert.deepEqual(targetNotes, [64], "reset preserves the current expected keys");
  const resumed = packets.filter((packet) => packet.type === "attack");
  assert.equal(resumed.length, 2, "a reset detector clock must not inherit the old time barrier");
  assert.equal(resumed.at(-1).scope, "after-gap");
  assert.equal(resumed.at(-1).captureEnd, 10);
});

test("the microphone output gate mutes current and future instrument contexts without changing their levels", () => {
  function audioContext() {
    const ctx = { destination: {} };
    const make = () => {
      const value = node();
      for (const key of ["gain", "threshold", "knee", "ratio", "attack", "release"]) value[key] = { value: 0 };
      return value;
    };
    ctx.createGain = ctx.createDynamicsCompressor = ctx.createWaveShaper = make;
    return ctx;
  }
  setMicrophoneOutputMuted(false);
  const before = getAudioOutput(audioContext());
  const inputLevel = before.input.gain.value, trimLevel = before.trim.gain.value;
  try {
    setMicrophoneOutputMuted(true);
    assert.equal(before.microphoneGate.gain.value, 0);
    const after = getAudioOutput(audioContext());
    assert.equal(after.microphoneGate.gain.value, 0);
    assert.equal(before.input.gain.value, inputLevel);
    assert.equal(before.trim.gain.value, trimLevel);
    setMicrophoneOutputMuted(false);
    assert.equal(before.microphoneGate.gain.value, 1);
    assert.equal(after.microphoneGate.gain.value, 1);
  } finally { setMicrophoneOutputMuted(false); }
});
