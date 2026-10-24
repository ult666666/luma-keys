// Imported recordings have their own mix and pitch-preserving media clock.
// Beat position still comes from the piano transport; a discontinuity seeks
// once, while small decoder jitter is left alone.
export const recordingPosition = (track, beat) =>
  track.offset + (beat * 60) / track.bpm;
export const recordingRate = (track, bpm, speed) => (bpm * speed) / track.bpm;
export class BackingRecording {
  constructor(createAudio = () => new Audio()) {
    this.audio = createAudio();
    this.audio.preload = "auto";
    this.audio.preservesPitch = true;
    this.volume = 1;
    this.token = 0;
    this.pending = false;
    this.starts = 0;
    this.seeks = 0;
    this.lastSeek = -Infinity;
    this.lastEpoch = null;
  }
  // Feed imported tracks through the same final output protection as the
  // piano. The media element still owns tempo/pitch preservation and seeking.
  connect(context, destination) {
    if (this.source) {
      if (this.context !== context || this.destination !== destination)
        throw Error("The backing audio output changed. Reopen the app to reconnect it.");
      return;
    }
    this.context = context;
    this.destination = destination;
    this.source = context.createMediaElementSource(this.audio);
    this.mix = context.createGain();
    this.mix.gain.value = this.volume;
    this.audio.volume = 1;
    this.source.connect(this.mix);
    this.mix.connect(destination);
  }
  async prepare(track) {
    if (
      this.track?.id === track.id &&
      this.audio.readyState >= 1 &&
      !this.audio.error
    ) {
      this.track = track;
      return;
    }
    this.stop();
    this.track = track;
    const generation = this.token;
    this.audio.src = `/api/backing-assets/${track.id}`;
    await new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        this.audio.removeEventListener("loadedmetadata", ready);
        this.audio.removeEventListener("error", failed);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(
          Error(
            "This backing audio could not be opened. Choose another audio file.",
          ),
        );
      };
      this.audio.addEventListener("loadedmetadata", ready);
      this.audio.addEventListener("error", failed);
      timer = setTimeout(failed, 12000);
      this.audio.load();
    });
    if (generation !== this.token) return;
    if (!(this.audio.duration > 0 && Number.isFinite(this.audio.duration)))
      throw Error("This audio has no playable duration.");
  }
  setVolume(value) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    if (this.mix)
      this.mix.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
    else this.audio.volume = this.volume;
  }
  sync({
    track,
    beat,
    bpm,
    speed,
    epoch,
    playing,
    end,
    now = performance.now(),
  }) {
    if (this.audio.error) {
      this.stop();
      throw Error(
        "The backing recording stopped loading. Check its audio file and try Play again.",
      );
    }
    if (this.error) {
      const message = this.error;
      this.stop();
      throw Error(message);
    }
    const target = recordingPosition(track, beat);
    const rate = recordingRate(track, bpm, speed);
    if (
      !playing ||
      beat < 0 ||
      beat >= end ||
      target < 0 ||
      target >= this.audio.duration
    ) {
      this.stop();
      return;
    }
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
      this.stop();
      throw Error(
        "The recording tempo needs adjusting: its playback rate must stay between 25% and 400%.",
      );
    }
    const discontinuity = epoch !== this.lastEpoch;
    if (
      discontinuity ||
      (!this.audio.seeking &&
        now - this.lastSeek > 750 &&
        Math.abs(this.audio.currentTime - target) > 0.16)
    ) {
      this.audio.currentTime = Math.max(0, target);
      this.seeks++;
      this.lastSeek = now;
      this.lastEpoch = epoch;
    }
    this.audio.playbackRate = rate;
    this.audio.preservesPitch = true;
    this.wanted = true;
    if (this.audio.paused && !this.pending) {
      this.pending = true;
      const token = this.token;
      this.starts++;
      Promise.resolve(this.audio.play())
        .then(() => {
          if (token !== this.token && !this.wanted) this.audio.pause();
        })
        .catch((error) => {
          if (token === this.token && error.name !== "AbortError")
            this.error = "Backing audio could not start. Press Play again.";
        })
        .finally(() => {
          if (token === this.token) this.pending = false;
        });
    }
  }
  stop() {
    this.token++;
    this.wanted = false;
    this.audio.pause();
    this.pending = false;
    this.lastEpoch = null;
    this.error = null;
  }
  dispose() {
    this.stop();
    this.source?.disconnect();
    this.mix?.disconnect();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
