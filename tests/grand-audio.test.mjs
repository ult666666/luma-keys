import test from "node:test";
import assert from "node:assert/strict";
import {
  PianoAudio,
  selectPianoSample,
  damperRelease,
  MAX_PIANO_BYTES,
  MAX_PIANO_VOICES,
} from "../src/audio.js";

class Param {
  value = 0;
  events = [];
  setValueAtTime(value, time) {
    this.events.push(["set", value, time]);
  }
  setTargetAtTime(value, time, constant) {
    this.events.push(["target", value, time, constant]);
  }
  exponentialRampToValueAtTime(value, time) {
    this.events.push(["exponential", value, time]);
  }
  linearRampToValueAtTime(value, time) {
    this.events.push(["linear", value, time]);
  }
  cancelScheduledValues(time) {
    this.events.push(["cancel", time]);
  }
}
class AudioNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.stops = [];
    for (const name of [
      "gain",
      "pan",
      "frequency",
      "Q",
      "playbackRate",
      "threshold",
      "knee",
      "ratio",
      "attack",
      "release",
    ])
      this[name] = new Param();
  }
  connect(node) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.connections = [];
    this.disconnected = true;
  }
  start(time, offset = 0) {
    this.startedAt = time;
    this.offset = offset;
  }
  stop(time) {
    this.stops.push(time);
  }
  end() {
    this.onended?.();
  }
}
class Context {
  constructor() {
    this.currentTime = 10;
    this.sampleRate = 48000;
    this.state = "running";
    this.destination = new AudioNode("destination");
    this.nodes = [];
    this.decodes = 0;
  }
  node(type) {
    const node = new AudioNode(type);
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.node("gain");
  }
  createDynamicsCompressor() {
    return this.node("compressor");
  }
  createWaveShaper() {
    return this.node("limiter");
  }
  createConvolver() {
    return this.node("reverb");
  }
  createBiquadFilter() {
    return this.node("filter");
  }
  createStereoPanner() {
    return this.node("panner");
  }
  createBufferSource() {
    return this.node("source");
  }
  createOscillator() {
    return this.node("oscillator");
  }
  // Metadata-only buffers let cache tests simulate large recordings without
  // allocating hundreds of MiB. Signal decoding has separate real-browser QA.
  createBuffer(channels, length, sampleRate) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      copyToChannel() {},
    };
  }
  async decodeAudioData(bytes) {
    this.decodes++;
    const { length = 48000, channels = 2 } = JSON.parse(
      new TextDecoder().decode(bytes),
    );
    return this.createBuffer(channels, length, this.sampleRate);
  }
}
const entry = (midi, layer = 10, velocity = 0.6, bytes = 48000 * 8) => ({
  id: `${midi}-v${layer}`,
  midi,
  layer,
  velocity,
  gain: 1,
  url: `/piano-samples/v${layer}/${midi}.flac`,
  attackOffset: 0.012,
  fakeBytes: bytes,
});
function fixture(samples = [entry(60)]) {
  const ctx = new Context(),
    calls = new Map();
  const manifest = { version: 1, name: "Test grand", samples };
  const fetch = async (url) => {
    calls.set(url, (calls.get(url) || 0) + 1);
    if (url.endsWith("manifest.json"))
      return { ok: true, json: async () => manifest };
    const found = samples.find((s) => s.url === url);
    assert.ok(found, `Unexpected sample ${url}`);
    return {
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode(
          JSON.stringify({ length: found.fakeBytes / 8, channels: 2 }),
        ).buffer,
    };
  };
  const piano = new PianoAudio({ context: ctx, fetch });
  piano.setRoom("dry");
  return { piano, ctx, calls, fetch, manifest };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("absolute transport deadlines keep a queued chord together as the context clock advances", async () => {
  const { piano, ctx } = fixture([entry(60), entry(64), entry(67)]);
  await piano.prepare();
  await piano.warm([{ midi: 60 }, { midi: 64 }, { midi: 67 }]);
  const deadline = 12.5;
  const voices = [60, 64, 67].map((midi) => {
    ctx.currentTime += 0.03;
    return piano.playAt(midi, 0.8, 0.6, deadline);
  });
  for (const voice of voices) {
    assert.equal(voice.source.startedAt, deadline);
    assert.equal(voice.start, deadline);
    assert.equal(voice.releaseAt, deadline + 0.8);
    assert.equal(voice.source.offset, 0.012);
  }
  const direct = piano.play(60, 0.5, 0.6, 0.1);
  assert.equal(direct.start, ctx.currentTime + 0.1);
  piano.stopPlayback();
  assert.equal(piano.voices.size, 0);
  for (const voice of voices) {
    assert.ok(
      voice.gain.gain.events.some(
        (event) =>
          event[0] === "set" && event[1] === 0 && event[2] === ctx.currentTime,
      ),
    );
    assert.ok(voice.source.stops.includes(ctx.currentTime + 0.08));
  }
});

test("late absolute attacks clamp to now while resumed strings keep their elapsed sample position", async () => {
  const { piano, ctx } = fixture([entry(60, 10, 0.6, 48000 * 8 * 4)]);
  await piano.prepare();
  const voice = piano.playAt(60, 0.4, 0.6, ctx.currentTime - 0.2, {
    elapsed: 1.25,
  });
  assert.equal(voice.source.startedAt, ctx.currentTime);
  assert.equal(voice.source.offset, 1.262);
  assert.equal(voice.releaseAt, ctx.currentTime + 0.4);
  assert.ok(
    voice.gain.gain.events.some(
      (event) => event[0] === "linear" && event[2] === ctx.currentTime + 0.006,
    ),
  );
  const count = piano.voices.size;
  for (const when of [NaN, Infinity, -Infinity, undefined])
    assert.equal(piano.playAt(60, 0.4, 0.6, when), null);
  assert.equal(piano.voices.size, count);
});

test("sample choice prioritizes pitch, then recorded touch level and safe velocity endpoints", () => {
  const samples = [
    entry(57, 1, 0.1),
    entry(57, 16, 0.98),
    entry(60, 1, 0.1),
    entry(60, 7, 0.42),
    entry(60, 16, 0.98),
  ];
  assert.equal(selectPianoSample(samples, 59, 0.4).id, "60-v7");
  assert.equal(selectPianoSample(samples, 57, 0.45).midi, 57);
  assert.equal(selectPianoSample(samples, 60, -1).layer, 1);
  assert.equal(selectPianoSample(samples, 60, 10).layer, 16);
  assert.equal(selectPianoSample([], 60, 0.7), null);
});

test("parallel preparation and duplicate warming share each fetch and decode", async () => {
  const { piano, calls, ctx } = fixture([entry(60), entry(36, 7, 0.42)]);
  await Promise.all([piano.prepare(), piano.prepare(), piano.prepare()]);
  await Promise.all([
    piano.warm([
      { midi: 36, velocity: 0.4 },
      { midi: 36, velocity: 0.4 },
    ]),
    piano.warm([{ midi: 36, velocity: 0.4 }]),
  ]);
  assert.equal(calls.get("/piano-samples/manifest.json"), 1);
  assert.equal(calls.get("/piano-samples/v7/36.flac"), 1);
  assert.equal(ctx.decodes, 2);
  assert.equal(piano.pending.size, 0);
  assert.equal(piano.play(36, 1, 0.4).layer, 7);
  assert.equal(piano.diagnostics().fallbacks, 0);
});

test("a rejected manifest can be corrected and fetched again on retry", async () => {
  const { piano, fetch, manifest } = fixture();
  let attempts = 0;
  piano.fetch = async (url) => {
    if (url.endsWith("manifest.json") && ++attempts === 1)
      return {
        ok: true,
        json: async () => ({ samples: [{ id: "broken", midi: 60 }] }),
      };
    return fetch(url);
  };
  await assert.rejects(piano.prepare(), /incomplete/);
  assert.equal(piano.prepared, undefined);
  await piano.prepare();
  assert.equal(attempts, 2);
  assert.equal(piano.manifest, manifest);
  assert.equal(piano.buffers.size, 1);
});

test("a transient sample load failure releases its slot and retries without duplicating healthy buffers", async () => {
  const { piano, fetch, calls, ctx } = fixture([entry(60), entry(63)]);
  let fail = true;
  piano.fetch = async (url) => {
    if (url.endsWith("/63.flac") && fail) {
      fail = false;
      return { ok: false };
    }
    return fetch(url);
  };
  await assert.rejects(piano.prepare(), /could not load/);
  await nextTurn();
  await piano.prepare();
  assert.equal(piano.buffers.size, 2);
  assert.equal(calls.get("/piano-samples/manifest.json"), 1);
  assert.equal(ctx.decodes, 2);
  assert.equal(piano.pending.size, 0);
  assert.equal(piano.loading, 0);
});

test("concurrent warm requests share one three-load bound across distinct samples", async () => {
  const extras = Array.from({ length: 18 }, (_, i) =>
    entry(i < 9 ? 21 + i : 81 + i - 9, 7, 0.42),
  );
  const { piano, fetch } = fixture([entry(60), ...extras]);
  await piano.prepare();
  const gate = deferred();
  let active = 0,
    maximum = 0;
  piano.fetch = async (url) => {
    active++;
    maximum = Math.max(maximum, active);
    try {
      await gate.promise;
      return await fetch(url);
    } finally {
      active--;
    }
  };
  const work = Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      piano.warm(extras.slice(i * 3, i * 3 + 3)),
    ),
  );
  await nextTurn();
  const beforeRelease = maximum;
  gate.resolve();
  await work;
  assert.ok(
    beforeRelease <= 3,
    `Started ${beforeRelease} simultaneous fetches before the gate opened`,
  );
  assert.ok(maximum <= 3, `Maximum concurrency was ${maximum}`);
  assert.equal(piano.pending.size, 0);
  assert.equal(piano.loading, 0);
});

test("LRU retains core recordings, evicts the least recently used extra, and counts decoded bytes once", async () => {
  const MiB = 1024 * 1024;
  const core = entry(60, 10, 0.6, 64 * MiB),
    a = entry(21, 1, 0.1, 170 * MiB),
    b = entry(24, 1, 0.1, 170 * MiB),
    c = entry(27, 1, 0.1, 170 * MiB);
  const { piano } = fixture([core, a, b, c]);
  await piano.prepare();
  await piano.loadEntries([a, b]);
  await piano.loadSample(a);
  assert.equal(piano.decodedBytes, 404 * MiB);
  await piano.loadSample(c);
  assert.equal(piano.decodedBytes, 404 * MiB);
  assert.ok(piano.decodedBytes <= MAX_PIANO_BYTES);
  assert.equal(piano.sampleBuffers.has(b.id), false);
  for (const s of [core, a, c])
    assert.equal(piano.sampleBuffers.has(s.id), true);
  assert.equal(piano.loads, 4);
});

test("evicting a cached sample preserves an already sounding voice until it ends", async () => {
  const MiB = 1024 * 1024;
  const core = entry(60, 10, 0.6, 64 * MiB),
    a = entry(21, 1, 0.1, 170 * MiB),
    b = entry(24, 1, 0.1, 170 * MiB),
    c = entry(27, 1, 0.1, 170 * MiB);
  const { piano } = fixture([core, a, b, c]);
  await piano.prepare();
  await piano.loadSample(a);
  const voice = piano.play(21, null, 0.1),
    buffer = voice.source.buffer;
  await piano.loadEntries([b, c]);
  assert.equal(piano.sampleBuffers.has(a.id), false);
  assert.equal(voice.source.buffer, buffer);
  assert.equal(piano.voices.has(voice), true);
  assert.deepEqual(voice.source.stops, []);
  voice.source.end();
  assert.equal(piano.voices.has(voice), false);
  assert.equal(voice.source.disconnected, true);
});

test("scheduled cancellation silences future gain while live notes and the physical pedal remain independent", async () => {
  const { piano, ctx } = fixture();
  await piano.prepare();
  piano.sustain(true);
  const live = piano.play(60, null, 0.6),
    scheduled = piano.play(60, 1, 0.6, 2);
  piano.release(live);
  assert.equal(live.pending, true);
  assert.equal(live.released, false);
  assert.equal(scheduled.releaseAt, 13);
  assert.equal(scheduled.source.startedAt, 12);
  assert.equal(scheduled.source.offset, 0.012);
  piano.stopPlayback();
  assert.equal(piano.voices.has(live), true);
  assert.equal(piano.voices.has(scheduled), false);
  assert.equal(piano.pedal, true);
  assert.ok(
    scheduled.gain.gain.events.some(
      (e) => e[0] === "set" && e[1] === 0 && e[2] === ctx.currentTime,
    ),
  );
  assert.ok(scheduled.source.stops.at(-1) < scheduled.start);
  piano.sustain(false);
  assert.equal(live.released, true);
  assert.equal(live.releaseAt, 10);
});

test("piece completion preserves the scheduled damper tail, while manual stop cuts playback", async () => {
  const { piano, ctx } = fixture();
  await piano.prepare();
  const voice = piano.play(60, 1, 0.6);
  piano.tick(true, 2);
  const scheduledStop = voice.source.stops.at(-1),
    events = [...voice.gain.gain.events];
  ctx.currentTime = 11;
  piano.finishPlayback();
  assert.equal(piano.voices.has(voice), true);
  assert.deepEqual(voice.gain.gain.events, events);
  assert.equal(voice.source.stops.at(-1), scheduledStop);
  assert.equal(piano.clicks.size, 0);
  piano.stopPlayback();
  assert.equal(piano.voices.has(voice), false);
  assert.equal(voice.source.stops.at(-1), 11.08);
  assert.ok(scheduledStop > 11.08);
});

test("voice count is bounded and each retired source still disconnects on ended", async () => {
  const { piano } = fixture();
  await piano.prepare();
  const voices = Array.from({ length: MAX_PIANO_VOICES + 3 }, () =>
    piano.play(60, null, 0.6),
  );
  assert.equal(piano.voices.size, MAX_PIANO_VOICES);
  assert.ok(voices.slice(0, 3).every((v) => v.source.stops.length === 1));
  assert.ok(voices.slice(3).every((v) => v.source.stops.length === 0));
  piano.stop();
  assert.equal(piano.voices.size, 0);
  for (const v of voices) v.source.end();
  assert.ok(voices.every((v) => v.source.disconnected));
});

test("release timing depends on register and malformed notes never create voices", async () => {
  const { piano } = fixture();
  await piano.prepare();
  assert.ok(damperRelease(21) > damperRelease(76));
  assert.ok(damperRelease(96) > damperRelease(76));
  for (const [midi, duration, velocity, delay] of [
    [NaN, 1, 0.6, 0],
    [20, 1, 0.6, 0],
    [60, -1, 0.6, 0],
    [60, Infinity, 0.6, 0],
    [60, 1, 0, 0],
    [60, 1, 0.6, NaN],
  ])
    assert.equal(piano.play(midi, duration, velocity, delay), null);
  assert.equal(piano.voices.size, 0);
});

test("C8 source correction follows its recording into B7 without retuning neighboring A7", async () => {
  const { piano } = fixture([entry(105), entry(108)]);
  await piano.prepare();
  const c8 = piano.play(108, 1, 0.6);
  const b7 = piano.play(107, 1, 0.6);
  const a7 = piano.play(105, 1, 0.6);
  const aSharp7 = piano.play(106, 1, 0.6);
  assert.equal(c8.sourceMIDI, 108);
  assert.equal(b7.sourceMIDI, 108);
  assert.equal(a7.sourceMIDI, 105);
  assert.equal(aSharp7.sourceMIDI, 105);
  assert.ok(Math.abs(c8.source.playbackRate.value - 2 ** (-99 / 1200)) < 1e-12);
  assert.ok(
    Math.abs(b7.source.playbackRate.value - 2 ** (-199 / 1200)) < 1e-12,
  );
  assert.equal(a7.source.playbackRate.value, 1);
  assert.ok(
    Math.abs(aSharp7.source.playbackRate.value - 2 ** (1 / 12)) < 1e-12,
  );
  assert.equal(c8.source.buffer, piano.buffers.get(108));
  assert.equal(
    b7.source.buffer,
    c8.source.buffer,
    "correction does not rewrite or duplicate the source recording",
  );
});

test("resumed notes use elapsed sample position at actual playback rate and fade the mid-wave join", async () => {
  const { piano, ctx } = fixture([entry(60, 10, 0.6, 48000 * 8 * 5)]);
  await piano.prepare();
  const voice = piano.play(62, 0.7, 0.6, 0.4, { elapsed: 1.25 });
  const rate = 2 ** (2 / 12);
  assert.equal(voice.source.offset, 0.012 + 1.25 * rate);
  assert.equal(voice.source.startedAt, ctx.currentTime + 0.4);
  assert.equal(voice.releaseAt, ctx.currentTime + 0.4 + 0.7);
  assert.ok(
    voice.gain.gain.events.some(
      (e) => e[0] === "set" && e[1] === 0 && e[2] === voice.start,
    ),
  );
  assert.ok(
    voice.gain.gain.events.some(
      (e) => e[0] === "linear" && e[1] > 0 && e[2] === voice.start + 0.006,
    ),
  );
  const attack = piano.play(62, 0.7, 0.6);
  assert.equal(
    attack.source.offset,
    0.012,
    "New written attacks keep the original onset",
  );
  assert.ok(
    attack.gain.gain.events.some(
      (e) => e[0] === "linear" && e[2] === attack.start + 0.0005,
    ),
  );
  assert.equal(piano.diagnostics().voices[0].elapsed, 1.25);
});

test("expired resumed recordings stay silent, including transposition and C8 tuning", async () => {
  const { piano, ctx } = fixture([entry(60), entry(108)]);
  await piano.prepare();
  const before = ctx.nodes.length;
  assert.equal(piano.play(60, 1, 0.6, 0, { elapsed: 1 }), null);
  assert.equal(
    ctx.nodes.length,
    before,
    "Expired sample allocates no graph or voice",
  );
  for (const elapsed of [-1, NaN, Infinity])
    assert.equal(piano.play(60, 1, 0.6, 0, { elapsed }), null);
  const high = piano.play(107, 0.3, 0.6, 0, { elapsed: 0.4 });
  assert.equal(high.source.offset, 0.012 + 0.4 * 2 ** (-199 / 1200));
  const resumed = piano.play(60, 0.4, 0.6, 0.5, { elapsed: 0.2 });
  piano.stopPlayback();
  assert.ok(resumed.source.stops.at(-1) < resumed.start);
  assert.ok(
    resumed.gain.gain.events.some(
      (e) => e[0] === "set" && e[1] === 0 && e[2] === ctx.currentTime,
    ),
  );
});

test("metronome cancellation fades an active ramp from its current level and removes future clicks immediately", async () => {
  const { piano, ctx } = fixture();
  await piano.prepare();
  piano.tick(false);
  piano.tick(true, 1);
  const [active, future] = [...piano.clicks];
  ctx.currentTime += 0.012;
  piano.stopTicks();
  const level = 0.1 * 0.01 ** (0.012 / 0.045);
  const held = active.gain.gain.events.findLast((e) => e[0] === "set");
  assert.ok(Math.abs(held[1] - level) < 1e-12);
  assert.deepEqual(active.gain.gain.events.at(-1), [
    "linear",
    0,
    ctx.currentTime + 0.004,
  ]);
  assert.equal(active.source.stops.at(-1), ctx.currentTime + 0.005);
  assert.deepEqual(future.gain.gain.events.at(-1), ["set", 0, ctx.currentTime]);
  assert.equal(future.source.stops.at(-1), undefined);
  assert.equal(piano.clicks.size, 0);
});
