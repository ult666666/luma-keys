import { getAudioOutput } from './audio-output.js';
/** Quiet, short cues for the companion game. Separate from score playback. */
export async function createRhythmSound(enabled) {
  const silent = { now: () => performance.now(), cue() {}, close() {} };
  if (!enabled) return { ...silent, audible: false };
  let context;
  try {
    context = new AudioContext({ latencyHint: "interactive" });
    await context.resume();
    if (context.state !== "running") throw new Error("Audio is unavailable");
  } catch {
    context?.close().catch(() => {});
    return { ...silent, audible: false };
  }
  const output = context.createGain();
  output.gain.value = 0.065;
  output.connect(getAudioOutput(context).input);
  const voices = new Set();
  let closed = false;
  return {
    audible: true,
    now: () => context.currentTime * 1000,
    cue(atMs, accent = false) {
      if (closed || context.state !== "running") return;
      const at = Math.max(context.currentTime, atMs / 1000);
      const voice = context.createOscillator();
      const envelope = context.createGain();
      voice.type = "sine";
      voice.frequency.setValueAtTime(accent ? 740 : 560, at);
      voice.frequency.exponentialRampToValueAtTime(
        accent ? 480 : 360,
        at + 0.055,
      );
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.6, at + 0.004);
      envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
      envelope.gain.linearRampToValueAtTime(0, at + 0.085);
      voice.connect(envelope).connect(output);
      voices.add(voice);
      voice.onended = () => {
        voices.delete(voice);
        voice.disconnect();
        envelope.disconnect();
      };
      voice.start(at);
      voice.stop(at + 0.09);
    },
    close() {
      if (closed) return;
      closed = true;
      const now = context.currentTime;
      output.gain.cancelScheduledValues(now);
      output.gain.setTargetAtTime(0, now, 0.004);
      for (const voice of voices) {
        try {
          voice.stop(now + 0.025);
        } catch {
          /* Already ended. */
        }
      }
      // Fade the current cue before closing; scheduled future cues are stopped.
      setTimeout(() => {
        context.close().catch(() => {});
      }, 35);
    },
  };
}
