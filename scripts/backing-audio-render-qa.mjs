import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildBacking } from "../src/backing.mjs";
import { secondsAt, secondsBetween } from "../src/tempo.mjs";

// This mounts no app and calls no library/preferences API. The owned score is
// read only; only a short source-derived backing render and its metrics are saved.
const root = path.resolve(import.meta.dirname, "..");
const evidenceDirectory = path.join(root, ".qa-runs/accompaniment-2.8");
const base = process.env.LUMA_QA_URL || "http://127.0.0.1:5188";
const bankOnly = process.argv.includes("--bank-only");
const sourceFile = path.join(
  root,
  "Library/fe803071-0b5a-4a0b-bd88-a33a27d1f605.json",
);
const score = bankOnly
  ? null
  : JSON.parse(await fs.readFile(sourceFile, "utf8"));
if (score) {
  assert.match(score.title, /晴天|Sunny Day/i);
  assert.equal(score.measures, 76);
}
const plan = score
  ? buildBacking(score, { style: "acoustic", hand: "right" })
  : null;
const events = (plan?.events || [])
  .filter((event) => secondsAt(score, event.beat) < 12.5)
  .map((event) => ({
    ...event,
    at: 0.15 + secondsAt(score, event.beat),
    seconds: Math.min(
      12.5 - secondsAt(score, event.beat),
      secondsBetween(score, event.beat, event.beat + event.duration, 1),
    ),
  }));
if (score) assert.ok(events.length > 20);
await fs.mkdir(evidenceDirectory, { recursive: true });
const report = {
  passed: false,
  source: score
    ? {
        title: score.title,
        measures: score.measures,
        notes: score.notes.length,
        bpm: score.bpm,
        file: path.relative(root, sourceFile),
        description:
          "Short accompaniment generated from this owned score's written left hand; synthesized percussion. Not an original recording.",
      }
    : undefined,
  listeningClaim: false,
  checks: [],
  instruments: [],
};
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage();
try {
  await page.route("**/__backing_audio_render_qa__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Offline backing audio verification</title>",
    }),
  );
  await page.goto(base + "/__backing_audio_render_qa__");
  if (bankOnly) {
    report.mode = "all bundled sample decoding";
    report.bank = await page.evaluate(async () => {
      const response = await fetch("/backing-samples/manifest.json");
      if (!response.ok) throw Error("Bundled sample manifest unavailable");
      const manifest = await response.json();
      const ctx = new OfflineAudioContext(2, 1, 48000);
      const samples = [];
      for (const instrument of ["guitar", "bass"])
        for (const entry of manifest[instrument] || []) {
          const result = {
            instrument,
            midi: entry.midi,
            url: entry.url,
            expectedSha256: entry.sha256,
          };
          samples.push(result);
          try {
            if (
              !new RegExp(`^/backing-samples/${instrument}/[0-9]+\\.mp3$`).test(
                entry.url,
              )
            )
              throw Error("Unexpected sample URL");
            const sample = await fetch(entry.url);
            if (!sample.ok) throw Error(`Sample HTTP ${sample.status}`);
            const bytes = await sample.arrayBuffer();
            result.bytes = bytes.byteLength;
            result.sha256 = [
              ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            ]
              .map((value) => value.toString(16).padStart(2, "0"))
              .join("");
            const audio = await ctx.decodeAudioData(bytes);
            result.duration = audio.duration;
            result.channels = audio.numberOfChannels;
            result.sampleRate = audio.sampleRate;
            let peak = 0,
              sum = 0,
              nonfinite = 0;
            for (let channel = 0; channel < audio.numberOfChannels; channel++)
              for (const value of audio.getChannelData(channel)) {
                if (!Number.isFinite(value)) {
                  nonfinite++;
                  continue;
                }
                peak = Math.max(peak, Math.abs(value));
                sum += value * value;
              }
            result.peak = peak;
            result.rms = Math.sqrt(
              sum / (audio.length * audio.numberOfChannels),
            );
            result.nonfinite = nonfinite;
          } catch (error) {
            result.error = error.message;
          }
        }
      return samples;
    });
    assert.equal(
      report.bank.length,
      30,
      "all30 bundled samples must be accounted for",
    );
    for (const [instrument, low, count] of [
      ["guitar", 36, 17],
      ["bass", 24, 13],
    ]) {
      assert.deepEqual(
        report.bank
          .filter((sample) => sample.instrument === instrument)
          .map((sample) => sample.midi),
        Array.from({ length: count }, (_, i) => low + 3 * i),
        `${instrument} bank coverage`,
      );
    }
    for (const sample of report.bank) {
      assert.equal(sample.error, undefined, sample.url);
      assert.equal(
        sample.sha256,
        sample.expectedSha256,
        `${sample.url} checksum`,
      );
      assert.ok(
        sample.duration > 0 && Number.isFinite(sample.duration),
        `${sample.url} duration`,
      );
      assert.equal(sample.nonfinite, 0, sample.url);
      assert.ok(
        sample.peak > 0.001 && sample.rms > 1e-5,
        `${sample.url} must contain audio`,
      );
    }
    report.checks.push(
      "All30 bundled MP3 files match the manifest checksums, decode successfully, and contain finite non-silent audio.",
    );
    report.passed = true;
    console.log(
      JSON.stringify(
        {
          passed: true,
          samples: report.bank.length,
          guitar: 17,
          bass: 13,
          minimumDuration: Math.min(
            ...report.bank.map((sample) => sample.duration),
          ),
          minimumRms: Math.min(...report.bank.map((sample) => sample.rms)),
          evidence: ".qa-runs/accompaniment-2.8/bank-decode.json",
        },
        null,
        2,
      ),
    );
  } else {
    const result = await page.evaluate(
      async ({ events }) => {
        const { BackingAudio } = await import("/src/backing-audio.js");
        const rate = 48000;
        const results = [];
        let pianoBytes;
        const metrics = (buffer) => {
          let peak = 0,
            sum = 0,
            nonfinite = 0,
            firstSample = null;
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < data.length; i++) {
              const value = data[i];
              if (!Number.isFinite(value)) {
                nonfinite++;
                continue;
              }
              peak = Math.max(peak, Math.abs(value));
              sum += value * value;
              if (
                Math.abs(value) > 1e-7 &&
                (firstSample === null || i < firstSample)
              )
                firstSample = i;
            }
          }
          return {
            peak,
            rms: Math.sqrt(sum / (buffer.length * buffer.numberOfChannels)),
            nonfinite,
            seconds: buffer.duration,
            firstSignalSeconds:
              firstSample === null ? null : firstSample / rate,
          };
        };
        const rangePeak = (buffer, from, to) => {
          let peak = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (
              let i = Math.floor(from * rate);
              i < Math.min(data.length, to * rate);
              i++
            )
              peak = Math.max(peak, Math.abs(data[i]));
          }
          return peak;
        };
        // A windowed FFT with interpolated peak estimates checks the rendered sound,
        // including sample transposition, rather than inspecting a playbackRate field.
        const pitchNear = (buffer, expected) => {
          const size = 65536,
            real = new Float64Array(size),
            imaginary = new Float64Array(size);
          const data = buffer.getChannelData(0),
            offset = Math.floor(rate * 0.28);
          for (let i = 0; i < size; i++)
            real[i] =
              (data[offset + i] || 0) *
              (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
          for (let i = 1, j = 0; i < size; i++) {
            let bit = size >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) [real[i], real[j]] = [real[j], real[i]];
          }
          for (let length = 2; length <= size; length <<= 1) {
            const angle = (-2 * Math.PI) / length,
              wr = Math.cos(angle),
              wi = Math.sin(angle);
            for (let start = 0; start < size; start += length) {
              let r = 1,
                im = 0;
              for (let j = 0; j < length / 2; j++) {
                const a = start + j,
                  b = a + length / 2;
                const tr = real[b] * r - imaginary[b] * im,
                  ti = real[b] * im + imaginary[b] * r;
                real[b] = real[a] - tr;
                imaginary[b] = imaginary[a] - ti;
                real[a] += tr;
                imaginary[a] += ti;
                const next = r * wr - im * wi;
                im = r * wi + im * wr;
                r = next;
              }
            }
          }
          const magnitude = (bin) => Math.hypot(real[bin], imaginary[bin]);
          let best = Math.floor((expected * 0.75 * size) / rate);
          for (
            let bin = best + 1;
            bin <= Math.ceil((expected * 1.25 * size) / rate);
            bin++
          )
            if (magnitude(bin) > magnitude(best)) best = bin;
          const a = Math.log(Math.max(1e-20, magnitude(best - 1))),
            b = Math.log(Math.max(1e-20, magnitude(best))),
            c = Math.log(Math.max(1e-20, magnitude(best + 1)));
          const offsetBin = (0.5 * (a - c)) / (a - 2 * b + c);
          const hz = ((best + offsetBin) * rate) / size;
          return {
            expectedHz: expected,
            renderedHz: hz,
            cents: 1200 * Math.log2(hz / expected),
            fftSize: size,
          };
        };
        const render = async (
          name,
          scheduled,
          {
            seconds = 3.2,
            volume = 0.65,
            stopAt = null,
            streaming = false,
          } = {},
        ) => {
          const ctx = new OfflineAudioContext(
            2,
            Math.round(rate * seconds),
            rate,
          );
          const piano = { ctx, buffers: new Map(), prepare: async () => {} };
          if (scheduled.some((event) => event.instrument === "piano")) {
            if (!pianoBytes) {
              const response = await fetch("/samples/C4.mp3");
              if (!response.ok) throw Error("Piano sample unavailable");
              pianoBytes = await response.arrayBuffer();
            }
            piano.buffers.set(
              60,
              await ctx.decodeAudioData(pianoBytes.slice(0)),
            );
          }
          const engine = new BackingAudio(piano);
          engine.setVolume(volume);
          await engine.prepare();
          const warmStart = performance.now();
          await engine.warm(scheduled);
          const warmMs = performance.now() - warmStart;
          let index = 0,
            maximumActive = 0;
          const sourceTypes = new Set(),
            snapshots = [];
          const schedule = (until) => {
            while (index < scheduled.length && scheduled[index].at <= until) {
              const event = scheduled[index++];
              const voice = engine.play(
                event,
                event.seconds,
                Math.max(0, event.at - ctx.currentTime),
              );
              if (!voice) throw Error(`${name}: event was rejected`);
              sourceTypes.add(voice.sourceType);
            }
            maximumActive = Math.max(maximumActive, engine.voices.size);
          };
          const suspensions = [];
          if (streaming) {
            schedule(0.16);
            for (let time = 0.1; time < seconds - 0.1; time += 0.1) {
              suspensions.push(
                ctx.suspend(time).then(async () => {
                  schedule(ctx.currentTime + 0.16);
                  if (
                    snapshots.length < 6 &&
                    Math.floor(ctx.currentTime * 10) % 20 === 0
                  )
                    snapshots.push(engine.diagnostics);
                  await ctx.resume();
                }),
              );
            }
          } else schedule(Infinity);
          if (stopAt !== null)
            suspensions.push(
              ctx.suspend(stopAt).then(async () => {
                engine.stop();
                await ctx.resume();
              }),
            );
          const before = engine.diagnostics;
          const buffer = await ctx.startRendering();
          await Promise.all(suspensions);
          // Let source.onended notifications finish before recording resource counts.
          await new Promise((resolve) => setTimeout(resolve, 0));
          const result = {
            name,
            ...metrics(buffer),
            warmMs,
            maximumActive,
            scheduled: index,
            sourceTypes: [...sourceTypes],
            before,
            after: engine.diagnostics,
            snapshots,
          };
          if (stopAt !== null)
            result.postStopPeak = rangePeak(buffer, stopAt + 0.09, seconds);
          engine.dispose();
          result.disposed = engine.diagnostics;
          return { buffer, result };
        };
        for (const instrument of [
          "piano",
          "guitar",
          "bass",
          "strings",
          "kick",
          "snare",
          "hat",
        ]) {
          const midi = instrument === "bass" ? 33 : 57;
          const { buffer, result } = await render(instrument, [
            { instrument, midi, velocity: 0.75, at: 0.2, seconds: 1.8 },
          ]);
          if (instrument === "guitar" || instrument === "bass")
            result.pitch = pitchNear(buffer, 440 * 2 ** ((midi - 69) / 12));
          results.push(result);
        }
        for (const [instrument, midi] of [
          ["guitar", 58],
          ["bass", 34],
        ]) {
          const { buffer, result } = await render(instrument + " transposed", [
            { instrument, midi, velocity: 0.75, at: 0.2, seconds: 1.8 },
          ]);
          result.pitch = pitchNear(buffer, 440 * 2 ** ((midi - 69) / 12));
          results.push(result);
        }
        const muted = await render(
          "zero mix",
          [
            {
              instrument: "guitar",
              midi: 60,
              velocity: 1,
              at: 0.2,
              seconds: 1,
            },
          ],
          { volume: 0 },
        );
        const stopped = await render(
          "stop active and future",
          [
            {
              instrument: "strings",
              midi: 57,
              velocity: 1,
              at: 0.2,
              seconds: 2,
            },
            {
              instrument: "guitar",
              midi: 60,
              velocity: 1,
              at: 1.4,
              seconds: 1,
            },
          ],
          { stopAt: 0.8 },
        );
        const dense = await render(
          "dense mix headroom",
          Array.from({ length: 24 }, (_, i) => ({
            instrument: i % 3 ? "guitar" : "bass",
            midi: 36 + i,
            velocity: 1,
            at: 0.2,
            seconds: 1.8,
          })),
          { volume: 1 },
        );
        const demo = await render(
          "Sunny Day source-derived acoustic backing",
          events,
          { seconds: 14, volume: 0.65, streaming: true },
        );
        const wav = new ArrayBuffer(44 + demo.buffer.length * 4),
          view = new DataView(wav);
        const text = (at, value) => {
          for (let i = 0; i < value.length; i++)
            view.setUint8(at + i, value.charCodeAt(i));
        };
        text(0, "RIFF");
        view.setUint32(4, wav.byteLength - 8, true);
        text(8, "WAVEfmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 2, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, rate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true);
        text(36, "data");
        view.setUint32(40, demo.buffer.length * 4, true);
        for (let i = 0; i < demo.buffer.length; i++)
          for (let channel = 0; channel < 2; channel++) {
            const value = Math.max(
              -1,
              Math.min(1, demo.buffer.getChannelData(channel)[i]),
            );
            view.setInt16(
              44 + i * 4 + channel * 2,
              Math.round(value * (value < 0 ? 32768 : 32767)),
              true,
            );
          }
        const bytes = new Uint8Array(wav),
          chunks = [];
        for (let i = 0; i < bytes.length; i += 32768)
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
        return {
          instruments: results,
          muted: muted.result,
          stopped: stopped.result,
          dense: dense.result,
          demo: demo.result,
          wav: btoa(chunks.join("")),
        };
      },
      { events },
    );
    const { wav, ...metrics } = result;
    Object.assign(report, metrics);
    for (const instrument of result.instruments) {
      assert.equal(instrument.nonfinite, 0, instrument.name);
      assert.ok(instrument.rms > 1e-5, `${instrument.name} must produce audio`);
      assert.ok(instrument.peak < 1, `${instrument.name} must not clip`);
      assert.ok(
        instrument.firstSignalSeconds >= 0.198,
        `${instrument.name} must respect the future start`,
      );
      assert.equal(
        instrument.after.fallbacks,
        0,
        `${instrument.name} must not silently fall back`,
      );
      assert.equal(instrument.disposed.active, 0, instrument.name);
      assert.equal(instrument.disposed.pendingCleanup, 0, instrument.name);
      if (instrument.pitch)
        assert.ok(
          Math.abs(instrument.pitch.cents) < 15,
          `${instrument.name} pitch error ${instrument.pitch.cents.toFixed(2)} cents`,
        );
    }
    report.checks.push(
      "All seven instruments render finite audible audio, with delayed attacks and clean disposal.",
    );
    report.checks.push(
      "Guitar and bass use bundled samples; native and transposed pitches stay within15cents in rendered FFT probes.",
    );
    assert.equal(result.muted.peak, 0, "zero backing mix must silence output");
    assert.ok(
      result.stopped.postStopPeak < 1e-7,
      "stop must remove held, future and room-tail audio",
    );
    report.checks.push(
      "Zero mix is silent; stopping removes active notes, future attacks and reverberation.",
    );
    for (const scenario of [result.dense, result.demo]) {
      assert.equal(scenario.nonfinite, 0, scenario.name);
      assert.ok(scenario.peak < 1 && scenario.rms > 1e-5, scenario.name);
      assert.equal(scenario.after.fallbacks, 0, scenario.name);
      assert.equal(scenario.after.stolen, 0, scenario.name);
      assert.equal(scenario.disposed.pendingCleanup, 0, scenario.name);
    }
    assert.equal(result.demo.scheduled, events.length);
    assert.ok(result.demo.sourceTypes.includes("local-sample"));
    report.checks.push(
      "Dense24-note mix stays below full scale;14seconds of score-derived backing schedules every event without stealing voices or falling back.",
    );
    const output = path.join(
      evidenceDirectory,
      "Sunny Day - source-derived acoustic backing demo.wav",
    );
    await fs.writeFile(output, Buffer.from(wav, "base64"));
    report.wav = path.relative(root, output);
    report.passed = true;
    console.log(
      JSON.stringify(
        {
          passed: true,
          checks: report.checks.length,
          demo: {
            peak: result.demo.peak,
            rms: result.demo.rms,
            events: events.length,
            maxVoices: result.demo.maximumActive,
          },
          pitchCents: result.instruments
            .filter((value) => value.pitch)
            .map((value) => ({
              instrument: value.name,
              cents: value.pitch.cents,
            })),
          wav: report.wav,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  report.error = error.stack;
  throw error;
} finally {
  await fs.writeFile(
    path.join(
      evidenceDirectory,
      bankOnly ? "bank-decode.json" : "backing-audio-render.json",
    ),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
