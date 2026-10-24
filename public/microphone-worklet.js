// Capture only: analysis runs in a Worker, never on the audio rendering thread.
class PianoCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(1024); this.offset = 0; }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.buffer.length) {
        const end = (currentFrame + i + 1) / sampleRate;
        this.port.postMessage({ samples: this.buffer, start: end - this.buffer.length / sampleRate }, [this.buffer.buffer]);
        this.buffer = new Float32Array(1024); this.offset = 0;
      }
    }
    // The connected output is deliberately silent.
    return true;
  }
}
registerProcessor('luma-piano-capture', PianoCapture);
