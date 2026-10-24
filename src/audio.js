import { getAudioOutput } from "./audio-output.js";

const SAMPLE_MIDI = [
  21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75,
  78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108,
];
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const audioUnavailable = (message, cause) =>
  Object.assign(new Error(message, cause ? { cause } : undefined), {
    code: "AUDIO_UNAVAILABLE",
  });
// How a note sounds for its pitch and how hard it is played: louder and
// brighter the harder it is struck (the samples are one recording each, so
// a softer touch darkens them), placed across the stereo field by pitch as
// a pianist hears the keyboard.
export function toneFor(midi, velocity) {
  const v = clamp(Number.isFinite(velocity) ? velocity : 0.72, 0.03, 1);
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  return {
    gain: 0.62 * v ** 1.3,
    cutoff: Math.min(18000, 1200 + f0 * 3 + v * v * 9000),
    pan: clamp((midi - 64) / 44, -1, 1) * 0.3,
  };
}
// The room around the piano: how long its reverberation lasts (seconds to
// fall 60 dB) and how much of it is heard.
export const ROOMS = {
  dry: { decay: 0, wet: 0 },
  room: { decay: 1.3, wet: 0.2 },
  hall: { decay: 2.6, wet: 0.28 },
};
// A stereo impulse response for a room: a short pre-delay, a few early
// reflections, then decaying noise that grows darker as it fades.
// Deterministic, so a room always sounds the same.
export function roomImpulse(sampleRate, decay) {
  const length = Math.max(1, Math.round(sampleRate * decay * 1.15));
  const pre = Math.round(sampleRate * 0.012);
  let seed = 0x9e3779b9;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  return [0, 1].map((channel) => {
    const data = new Float32Array(length);
    let low = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sampleRate;
      // Brighter at first, darker in the tail.
      const a = 0.85 - 0.7 * Math.min(1, t / decay);
      low += a * (random() - low);
      data[i] = low * Math.exp((-6.91 * t) / decay);
    }
    // Early reflections, a little different in each ear.
    for (const [ms, level] of [
      [17, 0.5],
      [29, 0.36],
      [41, 0.28],
      [58, 0.2],
    ]) {
      const i = pre + Math.round((sampleRate * (ms + channel * 3.1)) / 1000);
      if (i < length) data[i] += level * (channel ? -1 : 1);
    }
    return data;
  });
}
// The bundled bank keeps its original stereo recordings. Only decoded buffers
// for the current register and upcoming passage stay in memory.
export const MAX_PIANO_BYTES = 512 * 1024 * 1024;
export const MAX_PIANO_VOICES = 96;
export function grandToneFor(midi, velocity) {
  const v = clamp(Number.isFinite(velocity) ? velocity : 0.72, 0.01, 1);
  return {
    gain: 0.76 * v ** 1.15,
    cutoff: Math.min(20000, 14000 + 6000 * v),
    pan: clamp((midi - 64) / 44, -1, 1) * 0.12,
  };
}
export function selectPianoSample(samples, midi, velocity = 0.72) {
  const v = clamp(Number.isFinite(velocity) ? velocity : 0.72, 0, 1);
  let best = null;
  for (const entry of samples) {
    if (
      !best ||
      Math.abs(entry.midi - midi) < Math.abs(best.midi - midi) ||
      (Math.abs(entry.midi - midi) === Math.abs(best.midi - midi) &&
        Math.abs(entry.velocity - v) < Math.abs(best.velocity - v))
    )
      best = entry;
  }
  return best;
}
export function damperRelease(midi) {
  // Shorter strings settle sooner. The undamped top register rings naturally.
  return midi >= 89 ? 0.38 : 0.065 + 0.12 * clamp((76 - midi) / 55, 0, 1);
}
export class PianoAudio {
  constructor({ context, fetch: fetcher } = {}) {
    this.ctx = context;
    this.fetch = fetcher || ((...args) => fetch(...args));
    this.buffers = new Map(); // Core layer also supplies the duet instrument.
    this.sampleBuffers = new Map();
    this.pending = new Map();
    this.voices = new Set();
    this.clicks = new Set();
    this.volume = 0.65;
    this.pedal = false;
    this.room = "room";
    this.decodedBytes = 0;
    this.loads = 0;
    this.cacheMisses = 0;
    this.fallbacks = 0;
    this.serial = 0;
    this.loading = 0;
    this.loadWaiters = [];
  }
  graph() {
    if (this.bus) return;
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.output = getAudioOutput(this.ctx);
    this.master.connect(this.output.input);
    this.bus = this.ctx.createGain();
    this.bus.connect(this.master);
    this.reverb = this.ctx.createConvolver();
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0;
    this.bus.connect(this.reverb);
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
    this.applyRoom();
  }
  async prepare() {
    this.graph();
    if (!this.ready)
      this.ready = (async () => {
        if (!this.manifest) {
          const r = await this.fetch("/piano-samples/manifest.json");
          if (!r.ok)
            throw Error("The grand piano could not load. Try Play again.");
          const manifest = await r.json();
          const samples = manifest.samples;
          if (
            !Array.isArray(samples) ||
            !samples.length ||
            !samples.some((e) => e.layer === 10) ||
            new Set(samples.map((e) => e.id)).size !== samples.length ||
            samples.some(
              (e) =>
                !Number.isFinite(e.midi) ||
                !Number.isFinite(e.velocity) ||
                !String(e.url).startsWith("/piano-samples/") ||
                !e.id,
            )
          )
            throw Error("The piano sample bank is incomplete.");
          this.manifest = manifest;
          this.samples = samples;
          this.core = new Set(
            this.samples.filter((e) => e.layer === 10).map((e) => e.id),
          );
        }
        const entries = this.samples.filter(
          (e) => this.core.has(e.id) || (e.midi >= 48 && e.midi <= 75),
        );
        await this.loadEntries(entries);
        this.prepared = true;
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }
  async loadEntries(entries) {
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, entries.length) }, async () => {
        while (index < entries.length) await this.loadSample(entries[index++]);
      }),
    );
  }
  async loadSample(entry) {
    const found = this.sampleBuffers.get(entry.id);
    if (found) {
      found.used = ++this.serial;
      return found.buffer;
    }
    if (this.pending.has(entry.id)) return this.pending.get(entry.id);
    const task = (async () => {
      if (this.loading >= 3)
        await new Promise((resolve) => this.loadWaiters.push(resolve));
      else this.loading++;
      try {
        const r = await this.fetch(entry.url);
        if (!r.ok)
          throw Error(
            "A grand piano recording could not load. Try Play again.",
          );
        const buffer = await this.ctx.decodeAudioData(await r.arrayBuffer());
        const bytes = buffer.length * buffer.numberOfChannels * 4;
        this.sampleBuffers.set(entry.id, {
          buffer,
          bytes,
          used: ++this.serial,
        });
        this.decodedBytes += bytes;
        this.loads++;
        if (this.core.has(entry.id)) this.buffers.set(entry.midi, buffer);
        this.trim();
        return buffer;
      } finally {
        const next = this.loadWaiters.shift();
        if (next) next();
        else this.loading--;
      }
    })();
    this.pending.set(entry.id, task);
    try {
      return await task;
    } finally {
      this.pending.delete(entry.id);
    }
  }
  trim() {
    while (this.decodedBytes > MAX_PIANO_BYTES) {
      let victim;
      for (const [id, record] of this.sampleBuffers)
        if (!this.core.has(id) && (!victim || record.used < victim[1].used))
          victim = [id, record];
      if (!victim) break;
      this.sampleBuffers.delete(victim[0]);
      this.decodedBytes -= victim[1].bytes;
    }
  }
  sampleFor(midi, velocity) {
    return selectPianoSample(this.samples || [], midi, velocity);
  }
  async warm(notes) {
    await this.prepare();
    const entries = [
      ...new Map(
        notes.map((n) => {
          const entry = this.sampleFor(n.midi, n.velocity);
          return [entry.id, entry];
        }),
      ).values(),
    ];
    // Load distant notes first so the nearest attacks are retained if a very
    // wide passage exceeds the cache. Warming never schedules a sound.
    await this.loadEntries(entries.reverse());
  }
  async resume({ timeoutMs = 3000 } = {}) {
    let attempt;
    try {
      this.graph();
      if (this.ctx.state === "running") {
        this.lastResumeError = null;
        return;
      }
      if (this.resuming) return await this.resuming;
      if (this.ctx.state === "closed")
        throw audioUnavailable(
          "The sound output has closed. Recover audio, then try Play again.",
        );
      const context = this.ctx;
      attempt = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(
          () =>
            finish(
              audioUnavailable(
                "The sound output is not responding. Recover audio, then try Play again.",
              ),
            ),
          Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 3000,
        );
        try {
          // Call inside the gesture that requested sound. A device interruption
          // can leave resume pending forever, or resolve without running.
          Promise.resolve(context.resume()).then(
            () =>
              finish(
                context.state === "running"
                  ? null
                  : audioUnavailable(
                      "The sound output is still paused. Recover audio, then try Play again.",
                    ),
              ),
            (cause) =>
              finish(
                audioUnavailable(
                  "The sound output could not start. Recover audio, then try Play again.",
                  cause,
                ),
              ),
          );
        } catch (cause) {
          finish(cause);
        }
      });
      this.resuming = attempt;
      await attempt;
      this.lastResumeError = null;
    } catch (cause) {
      const error =
        cause?.code === "AUDIO_UNAVAILABLE"
          ? cause
          : audioUnavailable(
              "The sound output could not start. Recover audio, then try Play again.",
              cause,
            );
      this.lastResumeError = error.message;
      throw error;
    } finally {
      if (attempt && this.resuming === attempt) this.resuming = null;
    }
  }
  async init(options) {
    // Observe both promises immediately: a failed resume must not leave a
    // later sample-loading failure as an unhandled rejection.
    await Promise.all([this.resume(options), this.prepare()]);
  }
  diagnostics() {
    return {
      contextState: this.ctx?.state || "uninitialized",
      contextTime: this.ctx?.currentTime ?? null,
      sampleRate: this.ctx?.sampleRate ?? null,
      baseLatency: this.ctx?.baseLatency ?? null,
      outputLatency: this.ctx?.outputLatency ?? null,
      volume: this.volume,
      masterGain: this.master?.gain.value ?? null,
      outputGain: this.output?.microphoneGate.gain.value ?? null,
      microphoneMuted: this.output
        ? this.output.microphoneGate.gain.value === 0
        : null,
      lastResumeError: this.lastResumeError || null,
      prepared: !!this.prepared,
      bank: this.manifest?.name || null,
      sampleCount: this.samples?.length || 0,
      loadedSamples: this.sampleBuffers.size,
      layers: [...new Set((this.samples || []).map((e) => e.layer))],
      decodedBytes: this.decodedBytes,
      maxDecodedBytes: MAX_PIANO_BYTES,
      loads: this.loads,
      loading: this.loading,
      queuedLoads: this.loadWaiters.length,
      cacheMisses: this.cacheMisses,
      fallbacks: this.fallbacks,
      active: this.voices.size,
      voiceLimit: MAX_PIANO_VOICES,
      voices: [...this.voices].map((v) => ({
        midi: v.midi,
        automatic: v.automatic,
        sourceMIDI: v.sourceMIDI,
        layer: v.layer,
        velocity: v.velocity,
        start: v.start,
        elapsed: v.elapsed,
        offset: v.offset,
        releaseAt: v.releaseAt,
        released: v.released,
      })),
    };
  }
  audibleTime() {
    if (!this.ctx) return 0;
    let latency = (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
    if (!(latency >= 0 && latency < 0.5)) latency = 0;
    return this.ctx.currentTime - latency;
  }
  setRoom(name) {
    if (!ROOMS[name]) return;
    this.room = name;
    if (this.bus) this.applyRoom();
  }
  applyRoom() {
    const { decay, wet } = ROOMS[this.room] || ROOMS.room;
    if (decay > 0 && this.roomDecay !== decay) {
      const [left, right] = roomImpulse(this.ctx.sampleRate, decay);
      const buffer = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
      buffer.copyToChannel(left, 0);
      buffer.copyToChannel(right, 1);
      this.reverb.buffer = buffer;
      this.roomDecay = decay;
    }
    this.wet.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05);
  }
  setVolume(v) {
    if (!Number.isFinite(v)) return;
    this.volume = clamp(v, 0, 1);
    if (this.master)
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
  }
  // Transport notes share one absolute audio-clock deadline. Computing a
  // relative delay, then adding a later currentTime, shifts queued chords
  // whenever sample/voice preparation takes time on the main thread.
  playAt(midi, duration, velocity, when, continuation) {
    if (!Number.isFinite(when)) return null;
    return this.play(midi, duration, velocity, 0, {
      ...continuation,
      startTime: when,
    });
  }
  play(midi, duration = null, velocity = 0.72, delay = 0, continuation) {
    const elapsed = continuation?.elapsed ?? 0;
    if (
      !this.ctx ||
      !this.buffers.size ||
      !Number.isInteger(midi) ||
      midi < 21 ||
      midi > 108 ||
      !Number.isFinite(velocity) ||
      velocity <= 0 ||
      !Number.isFinite(delay) ||
      (continuation?.startTime !== undefined &&
        !Number.isFinite(continuation.startTime)) ||
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      (duration !== null && (!Number.isFinite(duration) || duration <= 0))
    )
      return null;
    let entry = this.sampleFor(midi, velocity);
    let record = this.sampleBuffers.get(entry.id);
    if (!record) {
      this.cacheMisses++;
      this.loadSample(entry).catch(() => {});
      const available = this.samples.filter((e) =>
        this.sampleBuffers.has(e.id),
      );
      entry = selectPianoSample(available, midi, velocity);
      record = this.sampleBuffers.get(entry?.id);
      this.fallbacks++;
    }
    if (!record) return null;
    // Resume the already-decaying string at its original sample position.
    // Replaying the attack of every pedal-held note creates a false loud chord.
    const tuning = entry.midi === 108 ? -99 : 0;
    const playbackRate = 2 ** (((midi - entry.midi) * 100 + tuning) / 1200);
    const offset = (entry.attackOffset || 0) + elapsed * playbackRate;
    if (offset >= record.buffer.duration) return null;
    record.used = ++this.serial;
    while (this.voices.size >= MAX_PIANO_VOICES) {
      const list = [...this.voices];
      this.stopVoice(
        list.find((v) => v.released) ||
          list.find((v) => v.automatic) ||
          list[0],
      );
    }
    const source = this.ctx.createBufferSource();
    source.buffer = record.buffer;
    // All six upstream C8 recordings have a measured ~99-cent sharp
    // fundamental. Correct that source (also when transposing it to B7);
    // retain the recorded stretch of the other registers.
    source.playbackRate.value = playbackRate;
    const tone = grandToneFor(midi, velocity);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(this.ctx.sampleRate * 0.45, tone.cutoff);
    filter.Q.value = 0.5;
    const gain = this.ctx.createGain(),
      panner = this.ctx.createStereoPanner();
    panner.pan.value = tone.pan;
    const now = this.ctx.currentTime;
    const start =
      continuation?.startTime !== undefined
        ? Math.max(now, continuation.startTime)
        : now + Math.max(0, delay);
    // Source attack offsets need not fall on a zero crossing. A half-ms ramp
    // removes that discontinuity while preserving the recorded hammer attack.
    // A resumed string joins its ongoing waveform with a slightly longer fade.
    const attack = elapsed > 0 ? 0.006 : 0.0005;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      tone.gain,
      start + Math.min(attack, duration === null ? attack : duration / 4),
    );
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.bus);
    const voice = {
      source,
      gain,
      midi,
      start,
      velocity,
      sourceMIDI: entry.midi,
      layer: entry.layer,
      elapsed,
      offset,
      released: false,
      automatic: duration !== null,
    };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    source.start(start, offset);
    if (duration !== null)
      this.release(voice, start + Math.max(0.02, duration));
    return voice;
  }
  release(voice, time = this.ctx?.currentTime || 0) {
    if (!voice || voice.released) return;
    // A physical pedal holds physical keys; scheduled score notes already
    // carry their notated pedal extension and must remain independently stoppable.
    if (!voice.automatic && this.pedal && time <= this.ctx.currentTime + 0.01) {
      voice.pending = true;
      return;
    }
    voice.released = true;
    voice.pending = false;
    voice.releaseAt = time;
    const release = damperRelease(voice.midi);
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setTargetAtTime(0, time, release);
    try {
      voice.source.stop(time + release * 7);
    } catch {}
  }
  sustain(down) {
    this.pedal = down;
    if (!down) for (const v of this.voices) if (v.pending) this.release(v);
  }
  stopVoice(voice) {
    if (!voice) return;
    try {
      voice.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      // Cancelling a future attack must also clear its initial scheduled gain.
      if (voice.start > this.ctx.currentTime)
        voice.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      else voice.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
      voice.source.stop(this.ctx.currentTime + 0.08);
    } catch {}
    voice.released = true;
    this.voices.delete(voice);
  }
  finishPlayback() {
    this.stopTicks();
  }
  stopPlayback() {
    this.stopTicks();
    for (const voice of this.voices) if (voice.automatic) this.stopVoice(voice);
  }
  stop() {
    this.pedal = false;
    this.stopTicks();
    for (const voice of this.voices) this.stopVoice(voice);
  }
  stopTicks() {
    for (const click of this.clicks) {
      try {
        const now = this.ctx.currentTime;
        const elapsed = now - click.start;
        click.gain.gain.cancelScheduledValues(now);
        if (elapsed < 0) {
          click.gain.gain.setValueAtTime(0, now);
          click.source.stop();
        } else {
          // Cancelling an exponential ramp otherwise jumps back to its
          // starting gain. Continue from its actual value, then fade to zero.
          const level =
            elapsed < 0.045
              ? 0.1 * Math.pow(0.01, Math.max(0, elapsed) / 0.045)
              : 0.001;
          click.gain.gain.setValueAtTime(level, now);
          click.gain.gain.linearRampToValueAtTime(0, now + 0.004);
          click.source.stop(now + 0.005);
        }
      } catch {}
    }
    this.clicks.clear();
  }
  tick(accent = false, delay = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    const start = this.ctx.currentTime + Math.max(0, delay);
    o.frequency.value = accent ? 1100 : 740;
    g.gain.setValueAtTime(0.1, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.045);
    o.connect(g);
    g.connect(this.master);
    const click = { source: o, gain: g, start };
    this.clicks.add(click);
    o.onended = () => {
      this.clicks.delete(click);
      o.disconnect();
      g.disconnect();
    };
    o.start(start);
    o.stop(start + 0.055);
  }
}
export const piano = new PianoAudio();
