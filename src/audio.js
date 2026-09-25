const SAMPLE_MIDI = [
  21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75,
  78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108,
];
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
export class PianoAudio {
  constructor() {
    this.buffers = new Map();
    this.voices = new Set();
    this.clicks = new Set();
    this.volume = 0.65;
    this.pedal = false;
  }
  async prepare() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.ratio.value = 4;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.ready = Promise.all(
        SAMPLE_MIDI.map(async (m) => {
          const name = NAMES[m % 12] + (Math.floor(m / 12) - 1);
          const r = await fetch("/samples/" + name + ".mp3");
          if (!r.ok)
            throw Error("Piano samples could not load. Reopen Luma Keys.");
          this.buffers.set(
            m,
            await this.ctx.decodeAudioData(await r.arrayBuffer()),
          );
        }),
      );
    }
    return this.ready;
  }
  async init() {
    const ready = this.prepare();
    await this.ctx.resume();
    await ready;
  }
  setVolume(v) {
    if (!Number.isFinite(v)) return;
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master)
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
  }
  play(midi, duration = null, velocity = 0.72, delay = 0) {
    if (!this.ctx || !this.buffers.size) return null;
    const nearest = SAMPLE_MIDI.reduce((a, b) =>
      Math.abs(b - midi) < Math.abs(a - midi) ? b : a,
    );
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers.get(nearest);
    source.playbackRate.value = 2 ** ((midi - nearest) / 12);
    const gain = this.ctx.createGain();
    const start = this.ctx.currentTime + delay;
    gain.gain.setValueAtTime(Math.max(0.03, velocity) * 0.6, start);
    source.connect(gain);
    gain.connect(this.master);
    source.start(start);
    const voice = {
      source,
      gain,
      midi,
      start,
      released: false,
      automatic: duration !== null,
    };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      gain.disconnect();
    };
    if (duration !== null)
      this.release(voice, start + Math.max(0.08, duration));
    return voice;
  }
  release(voice, time = this.ctx?.currentTime || 0) {
    if (!voice || voice.released) return;
    if (this.pedal && time <= this.ctx.currentTime + 0.01) {
      voice.pending = true;
      return;
    }
    voice.released = true;
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setTargetAtTime(0, time, 0.1);
    try {
      voice.source.stop(time + 0.7);
    } catch {}
  }
  sustain(down) {
    this.pedal = down;
    if (!down) for (const v of this.voices) if (v.pending) this.release(v);
  }
  stopVoice(voice) {
    try {
      voice.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      voice.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
      voice.source.stop(this.ctx.currentTime + 0.08);
    } catch {}
    voice.released = true;
    this.voices.delete(voice);
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
        click.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        click.gain.gain.setValueAtTime(0, this.ctx.currentTime);
        click.source.stop();
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
    const click = { source: o, gain: g };
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
