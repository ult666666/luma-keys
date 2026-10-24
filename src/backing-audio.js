import { roomImpulse, toneFor } from "./audio.js";
import { getAudioOutput } from "./audio-output.js";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const INSTRUMENTS = new Set([
  "piano",
  "guitar",
  "bass",
  "strings",
  "kick",
  "snare",
  "hat",
]);
const DRUMS = new Set(["kick", "snare", "hat"]);
const MAX_VOICES = 48;
const MAX_SAMPLES = 28;
const MAX_BANK_SAMPLES = 64;
const MAX_SECONDS = 120;
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

function noise(seed) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
}

// These short, deterministic samples need no downloads. The guitar's modal
// partials decay independently, like a plucked string; they retain exact tuning.
export function backingSample(instrument, midi = 60, sampleRate = 48000) {
  if (!["guitar", "kick", "snare", "hat"].includes(instrument))
    throw new RangeError("This instrument does not use a synthesized sample.");
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    !Number.isInteger(midi) ||
    midi < 0 ||
    midi > 127
  )
    throw new RangeError("Invalid sample rate or MIDI pitch.");
  const seconds =
    instrument === "guitar"
      ? midi < 60
        ? 3.6
        : 2.8
      : instrument === "kick"
        ? 0.5
        : instrument === "snare"
          ? 0.25
          : 0.11;
  const data = new Float32Array(Math.ceil(sampleRate * seconds));
  const random = noise(0x6d2b79f5 ^ (midi << 8) ^ instrument.length);
  if (instrument === "guitar") {
    const f0 = frequency(midi);
    const amplitudes = [1, 0.39, 0.22, 0.1, 0.055, 0.032, 0.014];
    // Keep each modal recurrence in local scalars, rather than walking seven
    // mutable objects at every sample. New pitches are also warmed before Play.
    for (let index = 0; index < amplitudes.length; index++) {
      const harmonic = index + 1;
      if (f0 * harmonic >= sampleRate * 0.45) continue;
      const rotation = (2 * Math.PI * f0 * harmonic) / sampleRate;
      const sin = Math.sin(rotation),
        cos = Math.cos(rotation);
      const decay = Math.exp(-1 / (sampleRate * (1.05 / harmonic ** 0.65)));
      let sine = 0,
        cosine = 1,
        amplitude = amplitudes[index];
      for (let i = 0; i < data.length; i++) {
        data[i] += sine * amplitude;
        const nextSine = sine * cos + cosine * sin;
        cosine = cosine * cos - sine * sin;
        sine = nextSine;
        amplitude *= decay;
      }
    }
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const attack = Math.min(1, t / 0.003);
      const tail = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.06));
      data[i] =
        (data[i] * 0.62 + random() * 0.025 * Math.exp(-t * 180)) *
        attack *
        tail;
    }
  } else {
    let phase = 0,
      low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const n = random();
      low += 0.22 * (n - low);
      const attack = Math.min(1, t / 0.0015);
      const tail = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.015));
      let value;
      if (instrument === "kick") {
        phase += (2 * Math.PI * (48 + 82 * Math.exp(-t * 42))) / sampleRate;
        value =
          Math.sin(phase) * Math.exp(-t * 11) * 0.82 +
          low * Math.exp(-t * 100) * 0.04;
      } else if (instrument === "snare") {
        value =
          (n - low) * Math.exp(-t * 28) * 0.52 +
          Math.sin(2 * Math.PI * 178 * t) * Math.exp(-t * 34) * 0.18;
      } else {
        value = (n - low) * Math.exp(-t * 65) * 0.38;
      }
      data[i] = value * attack * tail;
    }
  }
  // Keep the source signal below unity even at unusual pitches/sample rates.
  let peak = 0;
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  if (peak > 0.9) for (let i = 0; i < data.length; i++) data[i] *= 0.9 / peak;
  return data;
}

function disconnect(node) {
  try {
    node.disconnect();
  } catch {
    /* Already disconnected during disposal. */
  }
}

export class BackingAudio {
  constructor(
    piano,
    {
      sampleBank = "/backing-samples/manifest.json",
      fetch: fetcher = globalThis.fetch?.bind(globalThis),
    } = {},
  ) {
    this.piano = piano;
    this.volume = 0.45;
    this.voices = new Set();
    this.samples = new Map();
    this.input = null;
    this.disposed = false;
    this._timers = new Map();
    this._warmVersion = 0;
    this._bankConfig = sampleBank;
    this._fetch = fetcher;
    this._bankEntries = { guitar: [], bass: [] };
    this._bankBuffers = new Map();
    this._bankLoads = new Map();
    this._bankFailures = new Set();
    this.bankStatus = sampleBank === false ? "disabled" : "unprepared";
    this._counts = {
      started: 0,
      ended: 0,
      stopped: 0,
      stolen: 0,
      rejected: 0,
      fallbacks: 0,
    };
  }

  get diagnostics() {
    return {
      ...this._counts,
      volume: this.volume,
      active: this.voices.size,
      voices: [...this.voices].map(
        ({ instrument, midi, start, end, sourceType, sampleMidi }) => ({
          instrument,
          midi,
          start,
          end,
          sourceType,
          sampleMidi,
        }),
      ),
      cachedSamples: this.samples.size,
      pendingCleanup: this._timers.size,
      bankStatus: this.bankStatus,
      bankSamples: this._bankBuffers.size,
      bankFailures: this._bankFailures.size,
      ready: !!this.input && !this.disposed,
    };
  }

  async prepare() {
    if (this.disposed)
      throw new Error("The backing audio engine has been disposed.");
    if (this._preparing) return this._preparing;
    if (this.input) return this;
    if (!this._preparing)
      this._preparing = (async () => {
        await this.piano.prepare();
        if (this.disposed)
          throw new Error("The backing audio engine has been disposed.");
        this.ctx = this.piano.ctx;
        if (!this.ctx)
          throw new Error("The piano audio context is unavailable.");
        this.input = this.ctx.createGain();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.output = getAudioOutput(this.ctx);
        this.input.connect(this.master);
        this.master.connect(this.output.input);
        const channels = roomImpulse(this.ctx.sampleRate, 0.72);
        this._room = this.ctx.createBuffer(
          2,
          channels[0].length,
          this.ctx.sampleRate,
        );
        channels.forEach((channel, i) => this._room.copyToChannel(channel, i));
        await this._loadManifest();
        return this;
      })().finally(() => {
        this._preparing = null;
      });
    return this._preparing;
  }

  async _loadManifest() {
    if (this._bankConfig === false || this._manifestReady || this.disposed)
      return;
    if (this._manifestLoad) return this._manifestLoad;
    this.bankStatus = "loading";
    this._manifestLoad = (async () => {
      try {
        let data = this._bankConfig;
        if (typeof data === "string") {
          if (!data.startsWith("/backing-samples/") || data.startsWith("//"))
            throw Error("Local bank required");
          const response = await this._fetch(data);
          if (!response.ok) throw Error("Sample manifest unavailable");
          data = await response.json();
        }
        if (this.disposed) return;
        const entries = { guitar: [], bass: [] };
        for (const instrument of ["guitar", "bass"]) {
          const seen = new Set();
          for (const entry of Array.isArray(data?.[instrument])
            ? data[instrument].slice(0, 128)
            : []) {
            if (
              !Number.isInteger(entry?.midi) ||
              entry.midi < 0 ||
              entry.midi > 127 ||
              typeof entry.url !== "string" ||
              !new RegExp(`^/backing-samples/${instrument}/[0-9]+\\.mp3$`).test(
                entry.url,
              ) ||
              seen.has(entry.midi)
            )
              continue;
            seen.add(entry.midi);
            entries[instrument].push({ midi: entry.midi, url: entry.url });
          }
          entries[instrument].sort((a, b) => a.midi - b.midi);
        }
        if (!entries.guitar.length && !entries.bass.length)
          throw Error("Empty sample manifest");
        this._bankEntries = entries;
        this._manifestReady = true;
        this.bankStatus = "ready";
      } catch {
        if (!this.disposed) this.bankStatus = "unavailable";
      }
    })().finally(() => {
      this._manifestLoad = null;
    });
    return this._manifestLoad;
  }

  _nearestBank(instrument, midi) {
    return this._bankEntries[instrument]?.reduce(
      (nearest, entry) =>
        !nearest || Math.abs(entry.midi - midi) < Math.abs(nearest.midi - midi)
          ? entry
          : nearest,
      null,
    );
  }

  async _loadBankSample(instrument, entry) {
    const key = instrument + ":" + entry.midi;
    if (this._bankBuffers.has(key)) return true;
    if (this._bankLoads.has(key)) return this._bankLoads.get(key);
    const pending = (async () => {
      try {
        const response = await this._fetch(entry.url);
        if (!response.ok) throw Error("Local sample unavailable");
        const bytes = await response.arrayBuffer();
        if (this.disposed) return false;
        const buffer = await this.ctx.decodeAudioData(bytes);
        if (this.disposed) return false;
        if (!buffer?.length || !Number.isFinite(buffer.duration))
          throw Error("Invalid audio sample");
        this._bankBuffers.set(key, buffer);
        if (this._bankBuffers.size > MAX_BANK_SAMPLES)
          this._bankBuffers.delete(this._bankBuffers.keys().next().value);
        this._bankFailures.delete(key);
        this.bankStatus = this._bankFailures.size ? "partial" : "ready";
        return true;
      } catch {
        if (!this.disposed) {
          this._bankFailures.add(key);
          this.bankStatus = "partial";
        }
        return false;
      }
    })().finally(() => {
      this._bankLoads.delete(key);
    });
    this._bankLoads.set(key, pending);
    return pending;
  }

  setVolume(value) {
    if (!Number.isFinite(value)) return;
    this.volume = clamp(value, 0, 1);
    if (this.master && !this.disposed)
      this.master.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime,
        0.025,
      );
  }

  // Prepare the first bounded set of distinct sampled timbres outside the
  // transport's scheduling frame. Yield after each new buffer so Cancel/seek
  // remains responsive; stopping or another warm supersedes this request.
  async warm(events = []) {
    const version = ++this._warmVersion;
    await this.prepare();
    if (!this._manifestReady) await this._loadManifest();
    const distinct = new Map();
    const bank = new Map();
    for (const event of events) {
      const instrument = event?.instrument;
      if (!["guitar", "bass"].includes(instrument) && !DRUMS.has(instrument))
        continue;
      const midi = DRUMS.has(instrument) ? 60 : event?.midi;
      if (!Number.isInteger(midi) || midi < 0 || midi > 127) continue;
      const entry = this._nearestBank(instrument, midi);
      if (entry && bank.size < MAX_BANK_SAMPLES)
        bank.set(instrument + ":" + entry.midi, { instrument, entry });
      if (instrument !== "bass" && distinct.size < MAX_SAMPLES)
        distinct.set(instrument + ":" + midi, { instrument, midi });
      if (distinct.size === MAX_SAMPLES && bank.size === MAX_BANK_SAMPLES)
        break;
    }
    let prepared = 0;
    for (const { instrument, entry } of bank.values()) {
      if (this.disposed || version !== this._warmVersion) break;
      if (await this._loadBankSample(instrument, entry)) prepared++;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    for (const [key, event] of distinct) {
      if (this.disposed || version !== this._warmVersion) break;
      const entry = this._nearestBank(event.instrument, event.midi);
      if (entry && this._bankBuffers.has(event.instrument + ":" + entry.midi))
        continue;
      const cached = this.samples.has(key);
      this._sample(event.instrument, event.midi);
      prepared++;
      if (!cached) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return {
      prepared,
      cancelled: this.disposed || version !== this._warmVersion,
    };
  }

  _generation() {
    if (this._current) return this._current;
    const bus = this.ctx.createGain(),
      output = this.ctx.createGain();
    const reverb = this.ctx.createConvolver(),
      wet = this.ctx.createGain();
    reverb.buffer = this._room;
    wet.gain.value = 0.075;
    bus.connect(output);
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(output);
    output.connect(this.input);
    return (this._current = { bus, output, nodes: [bus, reverb, wet, output] });
  }

  _sample(instrument, midi) {
    const key = instrument + ":" + (DRUMS.has(instrument) ? 60 : midi);
    if (this.samples.has(key)) {
      const buffer = this.samples.get(key);
      this.samples.delete(key);
      this.samples.set(key, buffer);
      return buffer;
    }
    const data = backingSample(
      instrument,
      DRUMS.has(instrument) ? 60 : midi,
      this.ctx.sampleRate,
    );
    const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    this.samples.set(key, buffer);
    if (this.samples.size > MAX_SAMPLES)
      this.samples.delete(this.samples.keys().next().value);
    return buffer;
  }

  _later(owner, action, milliseconds = 35) {
    const previous = this._timers.get(owner);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this._timers.delete(owner);
      action();
    }, milliseconds);
    timer.unref?.();
    this._timers.set(owner, timer);
  }

  _finish(voice) {
    if (voice.done) return;
    voice.done = true;
    this.voices.delete(voice);
    const timer = this._timers.get(voice);
    if (timer) clearTimeout(timer);
    this._timers.delete(voice);
    for (const source of voice.sources) source.onended = null;
    for (const node of voice.nodes) disconnect(node);
    this._counts.ended++;
  }

  _stopVoice(voice, stolen = false) {
    if (voice.done || voice.stopped) return;
    voice.stopped = true;
    this.voices.delete(voice);
    this._counts.stopped++;
    if (stolen) this._counts.stolen++;
    const now = this.ctx.currentTime;
    const future = voice.start > now;
    if (voice.gain.gain.cancelAndHoldAtTime)
      voice.gain.gain.cancelAndHoldAtTime(now);
    else voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.012);
    for (const source of voice.sources) {
      try {
        source.stop(future ? now : now + 0.015);
      } catch {
        /* Already ended. */
      }
    }
    if (future) this._finish(voice);
    else this._later(voice, () => this._finish(voice));
  }

  // duration and delay are seconds, already converted by the shared transport.
  // event.beat/duration/sourceIds remain score metadata, never a second clock.
  play(event, duration, delay = 0) {
    const instrument = event?.instrument,
      drum = DRUMS.has(instrument);
    const midi = drum ? 60 : event?.midi;
    const velocity = event?.velocity ?? 0.7;
    if (
      !this.input ||
      this.disposed ||
      !INSTRUMENTS.has(instrument) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isFinite(delay) ||
      !Number.isFinite(velocity) ||
      !Number.isInteger(midi) ||
      midi < 0 ||
      midi > 127
    ) {
      this._counts.rejected++;
      return null;
    }
    if (velocity <= 0) return null;
    duration = Math.min(duration, MAX_SECONDS);
    delay = clamp(delay, 0, MAX_SECONDS);
    const v = clamp(velocity, 0, 1),
      start = this.ctx.currentTime + delay;
    let sample = null,
      nearest = midi;
    let sourceType = "synth-oscillator";
    if (instrument === "piano") {
      for (const pitch of this.piano.buffers.keys())
        if (!sample || Math.abs(pitch - midi) < Math.abs(nearest - midi)) {
          nearest = pitch;
          sample = this.piano.buffers.get(pitch);
        }
      if (!sample) {
        this._counts.rejected++;
        return null;
      }
      sourceType = "piano-sample";
    } else if (instrument === "guitar" || instrument === "bass") {
      const entry = this._nearestBank(instrument, midi);
      if (entry) sample = this._bankBuffers.get(instrument + ":" + entry.midi);
      if (sample) {
        nearest = entry.midi;
        sourceType = "local-sample";
      } else {
        if (this._bankConfig !== false) this._counts.fallbacks++;
        if (instrument === "guitar") {
          sample = this._sample(instrument, midi);
          sourceType = "synth-sample";
        }
      }
    } else if (drum) {
      sample = this._sample(instrument, midi);
      sourceType = "synth-sample";
    }
    // Voice stealing cannot touch notes played by the user's fingers or pedal.
    while (this.voices.size >= MAX_VOICES)
      this._stopVoice(this.voices.values().next().value, true);
    const filter = this.ctx.createBiquadFilter(),
      gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner(),
      sources = [];
    filter.type = drum && instrument !== "kick" ? "highpass" : "lowpass";
    filter.Q.value = 0.45;
    const f0 = frequency(midi),
      tone = toneFor(midi, v);
    let level,
      attack,
      release,
      sustain = 1;
    if (instrument === "piano") {
      level = tone.gain * 0.8;
      attack = 0.002;
      release = 0.2;
      filter.frequency.value = Math.min(
        this.ctx.sampleRate * 0.45,
        tone.cutoff,
      );
    } else if (instrument === "guitar") {
      level = 0.56 * v ** 1.25;
      attack = 0.003;
      release = 0.12;
      filter.frequency.value = Math.min(
        this.ctx.sampleRate * 0.45,
        2100 + v * 4200,
      );
    } else if (instrument === "bass") {
      level = 0.23 * v ** 1.2;
      attack = 0.012;
      release = 0.12;
      sustain = 0.75;
      filter.frequency.value = Math.min(
        this.ctx.sampleRate * 0.45,
        f0 * (3.5 + v),
      );
    } else if (instrument === "strings") {
      level = 0.065 * v ** 1.3;
      attack = 0.2;
      release = 0.32;
      sustain = 0.85;
      filter.frequency.value = Math.min(
        this.ctx.sampleRate * 0.45,
        950 + f0 * 0.6 + v * 700,
      );
    } else {
      level =
        (instrument === "kick" ? 0.48 : instrument === "snare" ? 0.32 : 0.23) *
        v ** 1.2;
      attack = 0.001;
      release = 0.025;
      filter.frequency.value =
        instrument === "kick" ? 900 : instrument === "snare" ? 300 : 5200;
      filter.frequency.value = Math.min(
        this.ctx.sampleRate * 0.45,
        filter.frequency.value,
      );
    }
    // The bundled nylon and fingered-bass recordings are quieter than the
    // fallback synthesis. Balance those recordings without changing the kit.
    if (sourceType === "local-sample")
      level *= instrument === "guitar" ? 1.5 : 2.5;
    panner.pan.value = drum
      ? instrument === "hat"
        ? 0.17
        : instrument === "snare"
          ? -0.08
          : 0
      : instrument === "bass"
        ? 0
        : tone.pan * (instrument === "guitar" ? 0.6 : 1);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this._generation().bus);
    if (sample) {
      const source = this.ctx.createBufferSource();
      source.buffer = sample;
      source.playbackRate.value =
        instrument === "piano" || sourceType === "local-sample"
          ? 2 ** ((midi - nearest) / 12)
          : 1;
      source.connect(filter);
      sources.push(source);
    } else {
      for (const detune of instrument === "strings" ? [-4, 4] : [0]) {
        const source = this.ctx.createOscillator();
        source.type = instrument === "bass" ? "triangle" : "sawtooth";
        source.frequency.value = f0;
        source.detune.value = detune;
        source.connect(filter);
        sources.push(source);
      }
    }
    const gate = start + duration;
    attack = Math.min(attack, duration * 0.4);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + attack);
    gain.gain.linearRampToValueAtTime(
      level * sustain,
      start + Math.min(duration * 0.7, attack + 0.14),
    );
    gain.gain.setValueAtTime(level * sustain, gate);
    gain.gain.exponentialRampToValueAtTime(0.00001, gate + release);
    gain.gain.setValueAtTime(0, gate + release + 0.005);
    const voice = {
      instrument,
      sourceType,
      sampleMidi: sample ? nearest : null,
      midi: drum ? null : midi,
      start,
      end: gate,
      source: sources[0],
      sources,
      gain,
      nodes: [...sources, filter, gain, panner],
      done: false,
      stopped: false,
    };
    let pending = sources.length;
    for (const source of sources)
      source.onended = () => {
        if (--pending === 0) this._finish(voice);
      };
    this.voices.add(voice);
    this._counts.started++;
    for (const source of sources) {
      source.start(start);
      source.stop(gate + release + 0.01);
    }
    return voice;
  }

  stop() {
    this._warmVersion++;
    if (!this.ctx || this.disposed) return;
    for (const voice of [...this.voices]) this._stopVoice(voice);
    const generation = this._current;
    this._current = null;
    if (generation) {
      generation.output.gain.cancelScheduledValues(this.ctx.currentTime);
      generation.output.gain.setValueAtTime(1, this.ctx.currentTime);
      generation.output.gain.linearRampToValueAtTime(
        0,
        this.ctx.currentTime + 0.012,
      );
      this._later(generation, () => generation.nodes.forEach(disconnect));
    }
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    // Finish every retired generation/voice synchronously, including fade timers.
    for (const [owner, timer] of this._timers) {
      clearTimeout(timer);
      if (owner.sources) this._finish(owner);
      else owner.nodes.forEach(disconnect);
    }
    this._timers.clear();
    // The final bus belongs to the context, not this accompaniment instance.
    for (const node of [this.input, this.master])
      if (node) disconnect(node);
    this.samples.clear();
    this._bankBuffers.clear();
    this._bankFailures.clear();
    this._room = null;
  }
}

export default BackingAudio;
