import test from "node:test";
import assert from "node:assert/strict";
import { BackingAudio, backingSample } from "../src/backing-audio.js";
import { getAudioOutput } from "../src/audio-output.js";

class Param {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(value, time) {
    this.events.push(["set", value, time]);
  }
  linearRampToValueAtTime(value, time) {
    this.events.push(["linear", value, time]);
  }
  exponentialRampToValueAtTime(value, time) {
    this.events.push(["exponential", value, time]);
  }
  setTargetAtTime(value, time, constant) {
    this.events.push(["target", value, time, constant]);
  }
  cancelScheduledValues(time) {
    this.events.push(["cancel", time]);
  }
  cancelAndHoldAtTime(time) {
    this.events.push(["hold", time]);
  }
}
class Node {
  constructor(type) {
    this.kind = type;
    this.connections = [];
    this.disconnects = 0;
    for (const name of [
      "gain",
      "pan",
      "frequency",
      "Q",
      "detune",
      "playbackRate",
      "threshold",
      "knee",
      "ratio",
      "attack",
      "release",
    ])
      this[name] = new Param();
  }
  connect(other) {
    this.connections.push(other);
    return other;
  }
  disconnect() {
    this.connections = [];
    this.disconnects++;
  }
  start(time) {
    this.startedAt = time;
  }
  stop(time) {
    (this.stops ||= []).push(time);
  }
  end() {
    this.onended?.();
  }
}
class Context {
  constructor() {
    this.currentTime = 10;
    this.sampleRate = 8000;
    this.destination = new Node("destination");
    this.nodes = [];
  }
  node(kind) {
    const node = new Node(kind);
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
    return this.node("convolver");
  }
  createBiquadFilter() {
    return this.node("filter");
  }
  createStereoPanner() {
    return this.node("panner");
  }
  createBufferSource() {
    return this.node("sample");
  }
  createOscillator() {
    return this.node("oscillator");
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return {
      length,
      sampleRate,
      duration: length / sampleRate,
      numberOfChannels: channels,
      copyToChannel(samples, channel) {
        data[channel].set(samples);
      },
      getChannelData(channel) {
        return data[channel];
      },
    };
  }
}
function fixture() {
  const ctx = new Context(),
    fingerVoice = { midi: 60, live: true };
  const piano = {
    ctx,
    buffers: new Map([[60, ctx.createBuffer(1, 8000 * 5, 8000)]]),
    voices: new Set([fingerVoice]),
    pedal: true,
    volume: 0.81,
    master: ctx.createGain(),
    preparations: 0,
    async prepare() {
      this.preparations++;
    },
  };
  return {
    ctx,
    piano,
    engine: new BackingAudio(piano, { sampleBank: false }),
    fingerVoice,
  };
}

test("prepare shares the clock and final output while keeping accompaniment volume independent", async () => {
  const { ctx, piano, engine } = fixture();
  engine.setVolume(0.32);
  await Promise.all([engine.prepare(), engine.prepare()]);
  assert.equal(piano.preparations, 1);
  assert.equal(engine.ctx, ctx);
  assert.equal(engine.master.gain.value, 0.32);
  assert.deepEqual(engine.input.connections, [engine.master]);
  assert.equal(engine.output, getAudioOutput(ctx));
  assert.deepEqual(engine.master.connections, [engine.output.input]);
  assert.deepEqual(engine.output.guard.connections, [engine.output.microphoneGate]);
  assert.deepEqual(engine.output.microphoneGate.connections, [ctx.destination]);
  assert.notEqual(engine.master, piano.master);
  assert.equal(piano.volume, 0.81);
  assert.equal(piano.master.gain.events.length, 0);
  engine.dispose();
  assert.deepEqual(engine.output.guard.connections, [engine.output.microphoneGate]);
  assert.deepEqual(engine.output.microphoneGate.connections, [ctx.destination]);
  assert.equal(engine.output.input.disconnects, 0);
});

test("a failed piano preparation can retry and disposing during preparation never creates a bus", async () => {
  const { piano, engine } = fixture();
  piano.prepare = async () => {
    throw Error("sample unavailable");
  };
  await assert.rejects(engine.prepare(), /sample unavailable/);
  assert.equal(engine.input, null);
  piano.prepare = async () => {};
  await engine.prepare();
  assert.equal(engine.diagnostics.ready, true);
  engine.dispose();

  const other = fixture();
  let finish;
  other.piano.prepare = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = other.engine.prepare();
  other.engine.dispose();
  finish();
  await assert.rejects(pending, /disposed/);
  assert.equal(other.engine.input, null);
  assert.equal(
    other.ctx.nodes.length,
    1,
    "only the original piano master exists",
  );
});

test("delayed sampled piano notes transpose the shared sample and release independently of the pedal", async () => {
  const { piano, engine, fingerVoice } = fixture();
  await engine.prepare();
  const voice = engine.play(
    { instrument: "piano", midi: 64, velocity: 0.6, beat: 999, duration: 999 },
    0.75,
    0.125,
  );
  assert.equal(voice.start, 10.125);
  assert.equal(
    voice.end,
    10.875,
    "the duration argument uses seconds, never event metadata",
  );
  assert.equal(voice.source.startedAt, 10.125);
  assert.equal(voice.source.buffer, piano.buffers.get(60));
  assert.ok(Math.abs(voice.source.playbackRate.value - 2 ** (4 / 12)) < 1e-12);
  assert.ok(Math.abs(voice.source.stops.at(-1) - 11.085) < 1e-12);
  const snapshot = engine.diagnostics;
  assert.equal(snapshot.volume, 0.45);
  assert.deepEqual(snapshot.voices, [
    {
      instrument: "piano",
      midi: 64,
      start: 10.125,
      end: 10.875,
      sourceType: "piano-sample",
      sampleMidi: 60,
    },
  ]);
  snapshot.voices[0].midi = 1;
  assert.equal(
    engine.diagnostics.voices[0].midi,
    64,
    "diagnostics cannot mutate active voices",
  );
  assert.equal(piano.pedal, true);
  assert.deepEqual([...piano.voices], [fingerVoice]);
  voice.source.end();
  assert.equal(engine.voices.size, 0);
  assert.ok(voice.nodes.every((node) => node.disconnects === 1));
  voice.source.end();
  assert.equal(engine.diagnostics.ended, 1, "cleanup is idempotent");
  engine.dispose();
});

test("stop cancels future attacks, retires reverb, and leaves the bus ready for the next passage", async () => {
  const { ctx, engine, piano, fingerVoice } = fixture();
  await engine.prepare();
  const input = engine.input;
  const active = engine.play({ instrument: "strings", midi: 55 }, 3);
  const future = engine.play({ instrument: "guitar", midi: 60 }, 2, 0.4);
  const firstGeneration = engine._current;
  engine.stop();
  assert.equal(engine.voices.size, 0);
  assert.ok(
    future.sources.every((source) => source.stops.at(-1) < source.startedAt),
    "future sound is canceled before its attack",
  );
  assert.ok(future.nodes.every((node) => node.disconnects === 1));
  assert.ok(
    active.sources.every(
      (source) => source.stops.at(-1) === ctx.currentTime + 0.015,
    ),
  );
  assert.deepEqual(firstGeneration.output.gain.events.at(-1), [
    "linear",
    0,
    10.012,
  ]);
  assert.equal(engine._current, null);
  assert.equal(engine.input, input);
  assert.deepEqual(input.connections, [engine.master]);
  const next = engine.play({ instrument: "bass", midi: 36 }, 1);
  assert.ok(next && engine._current !== firstGeneration);
  assert.deepEqual([...piano.voices], [fingerVoice]);
  assert.equal(piano.pedal, true);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.ok(
    firstGeneration.nodes.every((node) => node.disconnects === 1),
    "old convolution path cannot keep ringing",
  );
  assert.ok(active.nodes.every((node) => node.disconnects === 1));
  assert.equal(
    engine.voices.size,
    1,
    "old cleanup cannot cancel the new passage",
  );
  engine.dispose();
  assert.equal(engine.diagnostics.pendingCleanup, 0);
  assert.ok(next.nodes.every((node) => node.disconnects === 1));
  assert.equal(engine.input.disconnects, 1);
  assert.deepEqual([...piano.voices], [fingerVoice]);
});

test("every instrument has finite ordered envelopes and releases all nodes after its last source", async () => {
  const { engine } = fixture();
  await engine.prepare();
  for (const instrument of [
    "piano",
    "guitar",
    "bass",
    "strings",
    "kick",
    "snare",
    "hat",
  ]) {
    const voice = engine.play(
      { instrument, midi: 60, velocity: 0.8 },
      0.02,
      0.06,
    );
    assert.ok(voice, instrument);
    const points = voice.gain.gain.events;
    let last = 0;
    for (const [, value, time] of points) {
      assert.ok(
        Number.isFinite(value) && value >= 0 && value <= 0.62,
        instrument,
      );
      assert.ok(
        Number.isFinite(time) && time >= last,
        "short notes must not schedule attack after release",
      );
      last = time;
    }
    assert.ok(voice.sources.every((source) => source.startedAt === 10.06));
    assert.ok(voice.sources.every((source) => source.stops.at(-1) > voice.end));
    voice.sources[0].end();
    if (instrument === "strings") {
      assert.equal(
        engine.voices.has(voice),
        true,
        "both detuned string oscillators must finish",
      );
      voice.sources[1].end();
    }
    assert.equal(engine.voices.has(voice), false, instrument);
    assert.ok(
      voice.nodes.every((node) => node.disconnects === 1),
      instrument,
    );
  }
  assert.equal(engine.diagnostics.started, 7);
  assert.equal(engine.diagnostics.ended, 7);
  engine.dispose();
});

test("nonfinite inputs never enter Web Audio and finite extremes are bounded", async () => {
  const { engine, ctx } = fixture();
  assert.equal(
    engine.play({ instrument: "bass", midi: 40 }, 1),
    null,
    "prepare is required",
  );
  await engine.prepare();
  const valid = { instrument: "bass", midi: 40, velocity: 0.7 };
  const originalNodes = ctx.nodes.length;
  for (const [event, duration, delay] of [
    [null, 1, 0],
    [{ ...valid, instrument: "unknown" }, 1, 0],
    [{ ...valid, midi: NaN }, 1, 0],
    [{ ...valid, midi: Infinity }, 1, 0],
    [{ ...valid, midi: 128 }, 1, 0],
    [{ ...valid, midi: 40.5 }, 1, 0],
    [{ ...valid, velocity: Infinity }, 1, 0],
    [valid, NaN, 0],
    [valid, Infinity, 0],
    [valid, 0, 0],
    [valid, -1, 0],
    [valid, 1, NaN],
    [valid, 1, Infinity],
    [{ ...valid, velocity: 0 }, 1, 0],
  ])
    assert.equal(engine.play(event, duration, delay), null);
  assert.equal(
    ctx.nodes.length,
    originalNodes,
    "invalid notes allocate no audio nodes",
  );
  engine.setVolume(Infinity);
  engine.setVolume(NaN);
  assert.equal(engine.volume, 0.45);
  engine.setVolume(-3);
  assert.equal(engine.volume, 0);
  engine.setVolume(5);
  assert.equal(engine.volume, 1);
  assert.ok(
    engine.master.gain.events.every(([, value]) => value >= 0 && value <= 1),
  );
  const bounded = engine.play({ ...valid, velocity: 99 }, 100000, 100000);
  assert.equal(bounded.start, 130);
  assert.equal(bounded.end, 250);
  const now = engine.play(valid, 1, -50);
  assert.equal(now.start, 10);
  engine.dispose();
  assert.equal(engine.play(valid, 1), null);
  await assert.rejects(engine.prepare(), /disposed/);
});

test("polyphony and synthesized sample cache are bounded without stealing live piano voices", async () => {
  const { engine, piano, fingerVoice } = fixture();
  await engine.prepare();
  const first = engine.play({ instrument: "bass", midi: 30 }, 10);
  for (let i = 0; i < 80; i++)
    engine.play({ instrument: "bass", midi: 30 + (i % 30) }, 10);
  assert.equal(engine.voices.size, 48);
  assert.equal(engine.diagnostics.stolen, 33);
  assert.equal(first.stopped, true);
  assert.deepEqual([...piano.voices], [fingerVoice]);
  for (let midi = 45; midi < 80; midi++) {
    const voice = engine.play({ instrument: "guitar", midi }, 0.5);
    voice.source.end();
  }
  assert.equal(engine.samples.size, 28);
  engine.dispose();
  assert.equal(engine.samples.size, 0);
  assert.equal(engine.voices.size, 0);
  assert.equal(engine.diagnostics.pendingCleanup, 0);
});

test("warm deduplicates and bounds samples, yields for cancellation and never starts audio", async () => {
  const { engine } = fixture();
  const events = Array.from({ length: 60 }, (_, i) => ({
    instrument: "guitar",
    midi: 40 + Math.floor(i / 2),
  }));
  const first = await engine.warm(events);
  assert.deepEqual(first, { prepared: 28, cancelled: false });
  assert.equal(engine.samples.size, 28);
  assert.equal(engine.voices.size, 0);
  assert.equal(
    engine._current,
    undefined,
    "warming never touches the audible room generation",
  );
  const cached = engine.samples.get("guitar:40");
  const voice = engine.play(events[0], 1);
  assert.equal(voice.source.buffer, cached);
  engine.stop();
  const second = engine.warm([
    { instrument: "guitar", midi: 80 },
    { instrument: "guitar", midi: 81 },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  engine.stop();
  assert.equal((await second).cancelled, true);
  assert.equal(
    engine.samples.has("guitar:81"),
    false,
    "cancel is observed between expensive buffers",
  );
  const third = engine.warm([
    { instrument: "guitar", midi: 90 },
    { instrument: "guitar", midi: 91 },
  ]);
  const replacement = engine.warm([{ instrument: "hat" }]);
  assert.equal((await third).cancelled, true);
  assert.equal((await replacement).cancelled, false);
  assert.equal(
    engine.samples.has("guitar:90"),
    false,
    "superseded warm cannot evict the new passage's buffers",
  );
  assert.equal(engine.samples.has("hat:60"), true);
  engine.dispose();
});

test("synthesized samples are deterministic, bounded and fade cleanly; guitar retains its fundamental", () => {
  const energy = (a, from, to) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += a[i] ** 2;
    return sum / (to - from);
  };
  for (const instrument of ["guitar", "kick", "snare", "hat"]) {
    const sample = backingSample(instrument, 57, 16000);
    assert.deepEqual(backingSample(instrument, 57, 16000), sample);
    assert.ok(sample[0] === 0);
    assert.ok(sample.at(-1) === 0);
    let peak = 0;
    for (const value of sample) {
      assert.ok(Number.isFinite(value));
      peak = Math.max(peak, Math.abs(value));
    }
    assert.ok(peak > 0.05 && peak <= 0.900001, instrument);
    const tenth = Math.floor(sample.length / 10);
    assert.ok(
      energy(sample, 0, tenth) >
        energy(sample, sample.length - tenth, sample.length) * 20,
      instrument,
    );
  }
  const sample = backingSample("guitar", 57, 16000); // A3 = 220 Hz.
  const spectralEnergy = (hz) => {
    let sine = 0,
      cosine = 0;
    for (let i = 1600; i < 8000; i++) {
      const phase = (2 * Math.PI * hz * i) / 16000;
      sine += sample[i] * Math.sin(phase);
      cosine += sample[i] * Math.cos(phase);
    }
    return sine * sine + cosine * cosine;
  };
  assert.ok(
    spectralEnergy(220) > spectralEnergy(220 * 2 ** (1 / 12)) * 100,
    "pluck is tuned to A rather than the neighboring semitone",
  );
  assert.ok(
    spectralEnergy(440) > spectralEnergy(400) * 100,
    "string includes tuned upper partials",
  );
  assert.throws(() => backingSample("guitar", NaN), RangeError);
  assert.throws(() => backingSample("guitar", 60, Infinity), RangeError);
});

test("local nylon and bass samples load once before Play and transpose to the exact requested pitch", async () => {
  const { ctx, piano } = fixture();
  const requests = [];
  ctx.decodeAudioData = async () => ctx.createBuffer(1, 24000, 8000);
  const engine = new BackingAudio(piano, {
    sampleBank: {
      guitar: [
        { midi: 60, url: "/backing-samples/guitar/60.mp3" },
        { midi: 63, url: "/backing-samples/guitar/63.mp3" },
      ],
      bass: [{ midi: 36, url: "/backing-samples/bass/36.mp3" }],
    },
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    },
  });
  const events = [
    { instrument: "guitar", midi: 61 },
    { instrument: "guitar", midi: 60 },
    { instrument: "guitar", midi: 62 },
    { instrument: "bass", midi: 37 },
  ];
  await engine.prepare();
  assert.equal(
    requests.length,
    0,
    "manifest preparation never decodes unrelated pitches",
  );
  await engine.warm(events);
  assert.equal(
    requests.length,
    3,
    "nearest shared base pitches are deduplicated",
  );
  assert.equal(
    engine.samples.size,
    0,
    "successful sample banks need no synthetic guitar buffers",
  );
  assert.equal(engine.diagnostics.bankSamples, 3);
  assert.equal(engine.diagnostics.bankStatus, "ready");
  const guitar = engine.play(events[0], 0.8),
    bass = engine.play(events[3], 0.8);
  assert.equal(guitar.sourceType, "local-sample");
  assert.equal(guitar.sampleMidi, 60);
  assert.equal(bass.sourceType, "local-sample");
  assert.equal(bass.sampleMidi, 36);
  const attackLevel = (voice) =>
    voice.gain.gain.events.find(([type]) => type === "linear")[1];
  assert.ok(Math.abs(attackLevel(guitar) - 0.56 * 0.7 ** 1.25 * 1.5) < 1e-12);
  assert.ok(Math.abs(attackLevel(bass) - 0.23 * 0.7 ** 1.2 * 2.5) < 1e-12);
  assert.ok(Math.abs(guitar.source.playbackRate.value - 2 ** (1 / 12)) < 1e-12);
  assert.equal(
    bass.source.playbackRate.value,
    guitar.source.playbackRate.value,
  );
  assert.equal(requests.length, 3, "Play never starts asynchronous downloads");
  assert.equal(engine.diagnostics.fallbacks, 0);
  await engine.warm(events);
  assert.equal(requests.length, 3, "repeated passages reuse decoded samples");
  engine.dispose();
});

test("the default fetch preserves the browser receiver for both manifest and sample requests", async () => {
  const { ctx, piano } = fixture();
  const original = globalThis.fetch;
  const requests = [];
  ctx.decodeAudioData = async () => ctx.createBuffer(1, 8000, 8000);
  globalThis.fetch = async function (url) {
    assert.equal(this, globalThis, "Window.fetch requires its native receiver");
    requests.push(url);
    return {
      ok: true,
      json: async () => ({
        guitar: [{ midi: 60, url: "/backing-samples/guitar/60.mp3" }],
      }),
      arrayBuffer: async () => new ArrayBuffer(4),
    };
  };
  const engine = new BackingAudio(piano);
  try {
    await engine.warm([{ instrument: "guitar", midi: 60 }]);
    assert.deepEqual(requests, [
      "/backing-samples/manifest.json",
      "/backing-samples/guitar/60.mp3",
    ]);
    assert.equal(engine.bankStatus, "ready");
    assert.equal(
      engine.play({ instrument: "guitar", midi: 60 }, 1).sourceType,
      "local-sample",
    );
    assert.equal(engine.diagnostics.fallbacks, 0);
  } finally {
    globalThis.fetch = original;
    engine.dispose();
  }
});

test("missing local samples use disclosed synthesis, retry on next warm, and reject remote bank URLs", async () => {
  const { ctx, piano } = fixture();
  let failed = true;
  const requests = [];
  ctx.decodeAudioData = async () => ctx.createBuffer(1, 16000, 8000);
  const engine = new BackingAudio(piano, {
    sampleBank: {
      guitar: [
        { midi: 60, url: "/backing-samples/guitar/60.mp3" },
        { midi: 64, url: "https://example.com/sample.mp3" },
      ],
      bass: [{ midi: 36, url: "/backing-samples/bass/36.mp3" }],
    },
    fetch: async (url) => {
      requests.push(url);
      return { ok: !failed, arrayBuffer: async () => new ArrayBuffer(4) };
    },
  });
  const events = [
    { instrument: "guitar", midi: 60 },
    { instrument: "bass", midi: 36 },
  ];
  await engine.warm(events);
  assert.equal(engine.diagnostics.bankStatus, "partial");
  assert.equal(engine.diagnostics.bankFailures, 2);
  const guitar = engine.play(events[0], 1),
    bass = engine.play(events[1], 1);
  assert.equal(guitar.sourceType, "synth-sample");
  assert.equal(bass.sourceType, "synth-oscillator");
  assert.equal(
    guitar.gain.gain.events.find(([type]) => type === "linear")[1],
    0.56 * 0.7 ** 1.25,
  );
  assert.equal(
    bass.gain.gain.events.find(([type]) => type === "linear")[1],
    0.23 * 0.7 ** 1.2,
  );
  assert.equal(engine.diagnostics.fallbacks, 2);
  assert.ok(requests.every((url) => url.startsWith("/backing-samples/")));
  engine.stop();
  failed = false;
  await engine.warm(events);
  assert.equal(engine.diagnostics.bankFailures, 0);
  assert.equal(engine.diagnostics.bankStatus, "ready");
  assert.equal(engine.play(events[0], 1).sourceType, "local-sample");
  assert.equal(
    engine.diagnostics.fallbacks,
    2,
    "historical fallback count is stable once sampled notes play",
  );
  engine.dispose();
});

test("disposing while a local sample is loading cannot repopulate the cache or create voices", async () => {
  const { ctx, piano } = fixture();
  let finish;
  let decodes = 0;
  ctx.decodeAudioData = async () => {
    decodes++;
    return ctx.createBuffer(1, 8000, 8000);
  };
  const engine = new BackingAudio(piano, {
    sampleBank: {
      guitar: [{ midi: 60, url: "/backing-samples/guitar/60.mp3" }],
    },
    fetch: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await engine.prepare();
  const warm = engine.warm([{ instrument: "guitar", midi: 60 }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  engine.dispose();
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  assert.equal((await warm).cancelled, true);
  assert.equal(decodes, 0);
  assert.equal(engine.diagnostics.bankSamples, 0);
  assert.equal(engine.voices.size, 0);
});
