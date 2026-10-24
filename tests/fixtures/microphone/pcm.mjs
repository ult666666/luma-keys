import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const rate = 48000;
export function silence(seconds, sampleRate = rate) {
  return new Float32Array(Math.round(seconds * sampleRate));
}
export function concatenate(...parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
export function mix(...parts) {
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}
export function normalize(pcm, peak = 0.4) {
  let maximum = 0;
  for (const n of pcm) maximum = Math.max(maximum, Math.abs(n));
  return Float32Array.from(pcm, (n) => (maximum ? (n * peak) / maximum : 0));
}
export function synth(
  notes,
  {
    seconds = 0.8,
    sampleRate = rate,
    timbre = [1, 0.35, 0.2, 0.1],
    decay = 1.1,
    amplitude = 0.16,
    detune = 0,
    noise = 0,
  } = {},
) {
  const out = silence(seconds, sampleRate);
  let seed = 9876;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 0.006) * Math.exp(-t * decay);
    for (const midi of notes) {
      const hz = 440 * 2 ** ((midi - 69 + detune / 100) / 12);
      for (let h = 1; h <= timbre.length; h++)
        out[i] +=
          amplitude *
          envelope *
          timbre[h - 1] *
          Math.sin(2 * Math.PI * hz * h * t + h * 0.31);
    }
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    out[i] += ((seed / 4294967296) * 2 - 1) * noise;
  }
  return out;
}
const cache = new Map();
export function piano(
  midi,
  { layer = 10, sampleRate = rate, seconds = 0.8 } = {},
) {
  const key = `${midi}:${layer}:${sampleRate}:${seconds}`;
  if (cache.has(key)) return cache.get(key);
  const sampled = Math.round(midi / 3) * 3;
  const path = fileURLToPath(
    new URL(
      `../../../public/piano-samples/v${layer}/${sampled}.flac`,
      import.meta.url,
    ),
  );
  // Match the app's nearest-pitch playback rate while decoding the real bundled
  // recording. The tests need ffmpeg, but production detection never does.
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-af",
      `asetrate=48000*${2 ** ((midi - sampled) / 12)},aresample=${sampleRate}`,
      "-t",
      String(seconds),
      "-ac",
      "1",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `PCM fixture decode failed: ${result.error || result.stderr}`,
    );
  const pcm = new Float32Array(
    result.stdout.buffer.slice(
      result.stdout.byteOffset,
      result.stdout.byteOffset + result.stdout.byteLength,
    ),
  );
  cache.set(key, pcm);
  return pcm;
}
export function stream(detector, pcm, block = 128) {
  const events = [];
  for (let offset = 0; offset < pcm.length; offset += block)
    events.push(...detector.process(pcm.subarray(offset, offset + block)));
  return events;
}
