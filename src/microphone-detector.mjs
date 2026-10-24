/**
 * Local, conservative microphone onset / pitch observations. No score templates,
 * network, AudioContext, model or browser globals: the same DSP runs in a Worker
 * and in the PCM fixture tests. Supported practice is C3–C6, up to three distinct
 * pitches without overlapping harmonics. Octave chords are intentionally gated.
 *
 * Feed mono floating point PCM at the constructor's sampleRate in any chunk size.
 * Each returned attack is atomic; consumers MUST compare its entire note set,
 * never collect notes from different attacks to complete a chord. A confidence is
 * a signal-quality heuristic, not a calibrated probability of correctness.
 */
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const midiFor = (hz) => 69 + 12 * Math.log2(hz / 440);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const equalNotes = (a, b) =>
  a.length === b.length && a.every((n, i) => n === b[i]);

export const MICROPHONE_LIMITS = Object.freeze({
  minMidi: 48,
  maxMidi: 84,
  maxPolyphony: 3,
  warmupSeconds: 0.25,
});

/** Radix-2 FFT. Arrays are reused by the streaming analyzer. */
function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let ur = 1,
        ui = 0;
      for (let j = 0; j < size / 2; j++) {
        const a = start + j,
          b = a + size / 2;
        const tr = ur * real[b] - ui * imag[b];
        const ti = ur * imag[b] + ui * real[b];
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = next;
      }
    }
  }
}

export function microphoneTargetSupport(notes, limits = MICROPHONE_LIMITS) {
  const pitches = [...new Set(notes || [])].sort((a, b) => a - b);
  if (!pitches.length)
    return { supported: false, reason: "no-target", notes: pitches };
  if (
    pitches.some(
      (n) => !Number.isInteger(n) || n < limits.minMidi || n > limits.maxMidi,
    )
  )
    return { supported: false, reason: "outside-range", notes: pitches };
  if (pitches.length > limits.maxPolyphony)
    return { supported: false, reason: "too-many-notes", notes: pitches };
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      // Upper octave / twelfth fundamentals share the lower note's partials.
      // This small DSP cannot certify a separate key strike in these mixtures.
      const ratio = frequency(pitches[j]) / frequency(pitches[i]);
      if (Math.abs(ratio - Math.round(ratio)) < 0.035)
        return {
          supported: false,
          reason: "overlapping-harmonics",
          notes: pitches,
        };
    }
  }
  if (pitches.length > 1) {
    const lower = frequency(pitches[0]) / 2;
    const implied = pitches.every((n) => {
      const ratio = frequency(n) / lower;
      return Math.abs(1200 * Math.log2(ratio / Math.round(ratio))) < 32;
    });
    if (implied)
      return {
        supported: false,
        reason: "ambiguous-harmonics",
        notes: pitches,
      };
  }
  return { supported: true, reason: null, notes: pitches };
}

export function createMicrophoneDetector({
  sampleRate,
  minMidi = MICROPHONE_LIMITS.minMidi,
  maxMidi = MICROPHONE_LIMITS.maxMidi,
  maxPolyphony = MICROPHONE_LIMITS.maxPolyphony,
  minRms = 0.006,
} = {}) {
  if (!Number.isFinite(sampleRate) || sampleRate < 16000 || sampleRate > 96000)
    throw new RangeError(
      "Microphone PCM sampleRate must be between 16000 and 96000 Hz.",
    );
  const limits = {
    minMidi: Math.max(MICROPHONE_LIMITS.minMidi, minMidi),
    maxMidi: Math.min(MICROPHONE_LIMITS.maxMidi, maxMidi),
    maxPolyphony: clamp(
      Math.floor(maxPolyphony),
      1,
      MICROPHONE_LIMITS.maxPolyphony,
    ),
  };
  const gate = clamp(Number.isFinite(minRms) ? minRms : 0.006, 0.001, 0.08);
  const size = 2 ** Math.ceil(Math.log2(sampleRate * 0.16));
  const hop = Math.round(sampleRate * 0.012);
  const ring = new Float64Array(size),
    real = new Float64Array(size),
    imag = new Float64Array(size);
  const magnitudes = new Float64Array(size / 2);
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)),
  );
  let write = 0,
    samples = 0,
    sinceHop = 0,
    energy = 0,
    rms = 0;
  let baseline = 0,
    previousRms = 0,
    quietSeconds = 0,
    pending = null;
  let attackPeakRms = 0,
    heardQuiet = false;
  let lastOnset = -Infinity,
    attackId = 0,
    lastNotes = [],
    confidence = 0;
  let stableNotes = [],
    stableFrames = 0,
    reason = "calibrating";
  let target = microphoneTargetSupport([], limits);
  let analysisFrame = 0;

  function analyze() {
    let mean = 0;
    for (let i = 0; i < size; i++) mean += ring[i];
    mean /= size;
    for (let i = 0; i < size; i++) {
      real[i] = (ring[(write + i) % size] - mean) * window[i];
      imag[i] = 0;
    }
    fft(real, imag);
    let maximum = 0,
      totalPower = 0;
    const binHz = sampleRate / size;
    const firstBin = Math.max(2, Math.floor(45 / binHz));
    const lastBin = Math.min(size / 2 - 2, Math.ceil(6500 / binHz));
    for (let i = firstBin; i <= lastBin; i++) {
      const magnitude = Math.hypot(real[i], imag[i]);
      magnitudes[i] = magnitude;
      maximum = Math.max(maximum, magnitude);
      totalPower += magnitude * magnitude;
    }
    if (!maximum || !totalPower)
      return { notes: [], confidence: 0, reason: "quiet" };
    const peaks = [];
    let peakPower = 0;
    for (let i = firstBin + 1; i < lastBin; i++) {
      const center = magnitudes[i];
      if (
        center < maximum * 0.035 ||
        center <= magnitudes[i - 1] ||
        center < magnitudes[i + 1]
      )
        continue;
      const left = Math.log(magnitudes[i - 1] + 1e-12);
      const middle = Math.log(center + 1e-12);
      const right = Math.log(magnitudes[i + 1] + 1e-12);
      const offset = clamp(
        (0.5 * (left - right)) / (left - 2 * middle + right),
        -0.5,
        0.5,
      );
      const hz = (i + offset) * binHz;
      const midi = midiFor(hz),
        rounded = Math.round(midi);
      peakPower +=
        center ** 2 + magnitudes[i - 1] ** 2 + magnitudes[i + 1] ** 2;
      peaks.push({
        hz,
        magnitude: center,
        midi: rounded,
        cents: Math.abs(midi - rounded) * 100,
      });
    }
    const tonality = Math.min(1, peakPower / totalPower);
    if (tonality < 0.74)
      return { notes: [], confidence: tonality, reason: "not-tonal" };
    const fundamentals = [];
    // Independent of the expected score: search a wider register so low or high
    // wrong octaves are observed and rejected, rather than promoted to a target.
    for (const peak of peaks) {
      if (
        peak.hz < 58 ||
        peak.hz > frequency(96) * 1.03 ||
        peak.magnitude < maximum * 0.085 ||
        peak.cents > 25
      )
        continue;
      const harmonicOf = fundamentals.find((base) => {
        const ratio = peak.hz / base.hz,
          harmonic = Math.round(ratio);
        return (
          harmonic >= 2 && Math.abs(1200 * Math.log2(ratio / harmonic)) < 35
        );
      });
      if (!harmonicOf) fundamentals.push(peak);
    }
    const notes = [...new Set(fundamentals.map((p) => p.midi))].sort(
      (a, b) => a - b,
    );
    // A weak or missing low fundamental can otherwise turn a lower key's second
    // partial into an octave-up hit. Demand that no strong 2:3 partial pair offers
    // an unobserved lower explanation. Uncertainty is preferable to an advance.
    for (const base of fundamentals) {
      const lower = base.hz / 2;
      const third = peaks.find(
        (p) =>
          Math.abs(1200 * Math.log2(p.hz / (lower * 3))) < 28 &&
          p.magnitude > base.magnitude * 0.18,
      );
      const lowerPeak = peaks.find(
        (p) => Math.abs(1200 * Math.log2(p.hz / lower)) < 32,
      );
      const explainsAll = fundamentals.every((p) => {
        const ratio = p.hz / lower;
        return Math.abs(1200 * Math.log2(ratio / Math.round(ratio))) < 32;
      });
      if (third && !lowerPeak && lower >= 45 && explainsAll)
        return { notes, confidence: 0, reason: "ambiguous-fundamental" };
    }
    if (!notes.length)
      return { notes, confidence: 0, reason: "uncertain-pitch" };
    if (notes.length > limits.maxPolyphony)
      return { notes, confidence: 0, reason: "too-many-notes" };
    if (notes.some((n) => n < limits.minMidi || n > limits.maxMidi))
      return { notes, confidence: 0, reason: "outside-range" };
    const detuning = Math.max(...fundamentals.map((p) => p.cents));
    const quality = Math.min(tonality, 1 - detuning / 180);
    return {
      notes,
      confidence: quality,
      reason: quality >= 0.78 ? null : "uncertain-pitch",
    };
  }

  function tick(events) {
    rms = Math.sqrt(energy / sinceHop);
    energy = 0;
    sinceHop = 0;
    const time = samples / sampleRate;
    const calibrating = time < MICROPHONE_LIMITS.warmupSeconds;
    if (pending && time > pending.deadline) {
      pending = null;
      reason = "uncertain-pitch";
    }
    const rising =
      rms >
        Math.max(
          gate * 1.5,
          baseline * 1.48,
          attackPeakRms * (heardQuiet ? 0.65 : 1.25),
        ) && rms > previousRms * 1.18;
    const startsAfterQuiet = quietSeconds >= 0.12 && rms >= gate * 1.5;
    if (
      !calibrating &&
      (rising || startsAfterQuiet) &&
      time - lastOnset > 0.24
    ) {
      lastOnset = time;
      attackPeakRms = rms;
      pending = { time, deadline: time + 0.38 };
      stableNotes = [];
      stableFrames = 0;
    }
    // RMS history continues across target changes. reset() warms up with the new
    // stream, so an already ringing key cannot count as a new attack after seek.
    quietSeconds = rms < gate * 0.65 ? quietSeconds + hop / sampleRate : 0;
    if (quietSeconds >= 0.12) heardQuiet = true;
    if (calibrating || time - lastOnset < 0.12)
      attackPeakRms = Math.max(attackPeakRms, rms);
    baseline = baseline ? 0.8 * baseline + 0.2 * rms : rms;
    previousRms = rms;
    analysisFrame++;
    if (calibrating) {
      reason = "calibrating";
      return;
    }
    if (rms < gate) {
      reason = "quiet";
      confidence = 0;
      lastNotes = [];
      return;
    }
    if (
      !pending ||
      time - pending.time < (size / sampleRate) * 0.9 ||
      analysisFrame % 2
    )
      return;
    const observation = analyze();
    lastNotes = observation.notes;
    confidence = observation.confidence;
    reason = observation.reason || "confirming";
    if (!observation.reason && equalNotes(stableNotes, observation.notes))
      stableFrames++;
    else {
      stableNotes = observation.notes;
      stableFrames = observation.reason ? 0 : 1;
    }
    if (stableFrames >= 2) {
      const match =
        target.supported && equalNotes(target.notes, observation.notes);
      events.push({
        type: "attack",
        attackId: ++attackId,
        timeSeconds: pending.time,
        detectedAtSeconds: time,
        notes: [...observation.notes],
        confidence,
        rms,
        expectedMatch: match,
        reason: match ? "match" : "different-notes",
      });
      pending = null;
      reason = match ? "match" : "different-notes";
    } else if (time > pending.deadline) {
      pending = null;
      reason = observation.reason || "unstable-pitch";
    }
  }

  return {
    process(pcm) {
      if (!(pcm instanceof Float32Array) && !(pcm instanceof Float64Array))
        throw new TypeError(
          "Microphone detector expects mono Float32Array PCM.",
        );
      const events = [];
      for (let i = 0; i < pcm.length; i++) {
        const value = Number.isFinite(pcm[i]) ? clamp(pcm[i], -1, 1) : 0;
        ring[write] = value;
        write = (write + 1) % size;
        samples++;
        sinceHop++;
        energy += value * value;
        if (sinceHop >= hop) tick(events);
      }
      return events;
    },
    setExpected(notes) {
      target = microphoneTargetSupport(notes, limits);
      pending = null;
      stableFrames = 0;
      return { ...target, notes: [...target.notes] };
    },
    reset() {
      // Keep the level/attack history: seek/loop is not a new physical strike.
      // Forgetting the previous peak makes low-amplitude string beating look
      // like a new onset after resetting in the middle of a ringing note.
      lastOnset -= samples / sampleRate;
      ring.fill(0);
      write = 0;
      samples = 0;
      sinceHop = 0;
      energy = 0;
      pending = null;
      lastNotes = [];
      confidence = 0;
      stableNotes = [];
      stableFrames = 0;
      reason = "calibrating";
      analysisFrame = 0;
    },
    getStatus() {
      return {
        rms,
        active: rms >= gate,
        calibrating: samples / sampleRate < MICROPHONE_LIMITS.warmupSeconds,
        pending: !!pending,
        needsQuiet: !heardQuiet,
        notes: [...lastNotes],
        confidence,
        reason,
        supported: target.supported,
        unsupportedReason: target.reason,
        minMidi: limits.minMidi,
        maxMidi: limits.maxMidi,
        maxPolyphony: limits.maxPolyphony,
        minRms: gate,
        timeSeconds: samples / sampleRate,
      };
    },
  };
}
