// All instruments share one output stage. Limiting separate instruments cannot
// prevent their summed signal from clipping at the speakers.
const outputs = new WeakMap();
const gates = new Set();
let microphoneMuted = false;

// A separate final gate silences every instrument, including future contexts,
// without overwriting the user's volume or accompaniment preferences.
export function setMicrophoneOutputMuted(value) {
  microphoneMuted = !!value;
  for (const gate of gates) gate.gain.value = microphoneMuted ? 0 : 1;
}

export const OUTPUT_LEVELS = Object.freeze({
  input: 0.85,
  threshold: -8,
  knee: 6,
  ratio: 12,
  attack: 0,
  release: 0.16,
  trim: 0.87,
  guard: 0.98,
});

export function getAudioOutput(context) {
  if (outputs.has(context)) return outputs.get(context);
  const input = context.createGain();
  input.gain.value = OUTPUT_LEVELS.input;
  const compressor = context.createDynamicsCompressor();
  for (const name of ["threshold", "knee", "ratio", "attack", "release"])
    compressor[name].value = OUTPUT_LEVELS[name];
  // Compensate the compressor's built-in makeup gain. Quiet notes keep their
  // previous level; peak reduction acts on the combined, loudest passages.
  const trim = context.createGain();
  trim.gain.value = OUTPUT_LEVELS.trim;
  const guard = context.createWaveShaper();
  guard.curve = Float32Array.from({ length: 8193 }, (_, i) => {
    const x = i / 4096 - 1;
    const a = Math.abs(x);
    return a <= OUTPUT_LEVELS.guard
      ? x
      : Math.sign(x) *
          (OUTPUT_LEVELS.guard +
            0.015 * Math.tanh((a - OUTPUT_LEVELS.guard) / 0.015));
  });
  guard.oversample = "2x";
  input.connect(compressor);
  compressor.connect(trim);
  trim.connect(guard);
  const microphoneGate = context.createGain();
  microphoneGate.gain.value = microphoneMuted ? 0 : 1;
  gates.add(microphoneGate);
  guard.connect(microphoneGate);
  microphoneGate.connect(context.destination);
  const output = { input, compressor, trim, guard, microphoneGate };
  outputs.set(context, output);
  return output;
}
