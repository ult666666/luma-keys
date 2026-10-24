import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Real Chrome/Web Audio rendering. This mounts no app and never reads or writes
// a practice library. Metrics are objective checks, not a listening assessment.
const root = path.resolve(import.meta.dirname, "..");
const run = path.join(root, ".qa-runs/concert-grand-2.12");
const base = process.env.LUMA_QA_URL || "http://127.0.0.1:5188";
const report = { passed: false, listeningClaim: false, checks: [], errors: [] };
await fs.mkdir(run, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
try {
  // Fulfil a private origin directly from project audio assets: no dev server,
  // app, API endpoint, user library or external network is involved.
  await page.route(base + "/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/src/audio.js")
      return route.fulfill({
        path: path.join(root, "src/audio.js"),
        contentType: "text/javascript",
      });
    if (
      /^\/(piano-samples|samples)\/[a-zA-Z0-9_./-]+$/.test(pathname) &&
      !pathname.includes("..")
    )
      return route.fulfill({ path: path.join(root, "public", pathname) });
    return route.abort();
  });
  await page.route("**/__grand_qa__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><meta charset=utf-8><title>Piano waveform verification</title>",
    }),
  );
  await page.route("**/__grand_before__.js", async (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: await fs.readFile(path.join(run, "before/audio.js"), "utf8"),
    }),
  );
  await page.goto(base + "/__grand_qa__");
  report.bank = await page.evaluate(async () => {
    const r = await fetch("/piano-samples/manifest.json");
    if (!r.ok) throw Error(`Piano manifest HTTP ${r.status}`);
    const manifest = await r.json();
    const ctx = new OfflineAudioContext(2, 1, 48000),
      entries = [];
    for (const sample of manifest.samples || []) {
      const entry = {
        id: sample.id,
        midi: sample.midi,
        velocity: sample.velocity,
        url: sample.url,
      };
      entries.push(entry);
      try {
        if (
          !sample.url.startsWith("/piano-samples/") ||
          sample.url.includes("..")
        )
          throw Error("Unexpected bundled sample path");
        const response = await fetch(sample.url);
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        entry.bytes = bytes.byteLength;
        entry.sha256 = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        ]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
        entry.expectedSha256 = sample.sha256;
        const audio = await ctx.decodeAudioData(bytes);
        entry.duration = audio.duration;
        entry.channels = audio.numberOfChannels;
        let sum = 0,
          peak = 0,
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
        Object.assign(entry, {
          peak,
          rms: Math.sqrt(sum / (audio.length * audio.numberOfChannels)),
          nonfinite,
        });
      } catch (error) {
        entry.error = error.message;
      }
    }
    return { name: manifest.name, entries };
  });
  assert.ok(
    report.bank.entries.length > 30,
    "The grand must contain multiple recorded velocity layers",
  );
  assert.ok(
    new Set(report.bank.entries.map((s) => s.velocity)).size >= 2,
    "Multiple recorded velocities",
  );
  for (const sample of report.bank.entries) {
    assert.equal(sample.error, undefined, sample.url);
    assert.equal(sample.nonfinite, 0, sample.url);
    assert.ok(
      sample.duration > 0 && sample.rms > 1e-6 && sample.peak > 1e-4,
      `${sample.url}: audible decoded sample`,
    );
    assert.match(
      sample.expectedSha256 || "",
      /^[a-f0-9]{64}$/i,
      `${sample.url}: checksum supplied`,
    );
    assert.equal(sample.sha256, sample.expectedSha256, sample.url);
  }
  report.checks.push(
    "Every bundled grand sample matches its checksum and decodes to finite, non-silent PCM; multiple recorded velocities are present.",
  );
  const rendered = await page.evaluate(async () => {
    const rate = 48000;
    const { PianoAudio } = await import("/src/audio.js");
    const { PianoAudio: BeforeAudio } = await import("/__grand_before__.js");
    const spectral = (buffer, at, expected = null, size = 65536) => {
      const real = new Float64Array(size),
        imag = new Float64Array(size),
        offset = Math.round(at * rate);
      for (let i = 0; i < size; i++) {
        let value = 0;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++)
          value += buffer.getChannelData(ch)[offset + i] || 0;
        real[i] =
          (value / buffer.numberOfChannels) *
          (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
      }
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
              b = a + length / 2,
              tr = real[b] * r - imag[b] * im,
              ti = real[b] * im + imag[b] * r;
            real[b] = real[a] - tr;
            imag[b] = imag[a] - ti;
            real[a] += tr;
            imag[a] += ti;
            const next = r * wr - im * wi;
            im = r * wi + im * wr;
            r = next;
          }
        }
      }
      const mag = (b) => Math.hypot(real[b], imag[b]);
      let energy = 0,
        weighted = 0,
        bright = 0;
      for (let i = 1; i < size / 2; i++) {
        const hz = (i * rate) / size,
          power = mag(i) ** 2;
        if (hz < 80 || hz > 12000) continue;
        energy += power;
        weighted += hz * power;
        if (hz > 2000) bright += power;
      }
      const result = {
        centroid: weighted / Math.max(energy, 1e-20),
        brightShare: bright / Math.max(energy, 1e-20),
      };
      if (expected) {
        let best = Math.floor((expected * 0.75 * size) / rate);
        for (
          let bin = best + 1;
          bin <= Math.ceil((expected * 1.25 * size) / rate);
          bin++
        )
          if (mag(bin) > mag(best)) best = bin;
        const a = Math.log(Math.max(1e-20, mag(best - 1))),
          b = Math.log(Math.max(1e-20, mag(best))),
          c = Math.log(Math.max(1e-20, mag(best + 1)));
        const correction = (0.5 * (a - c)) / (a - 2 * b + c);
        const hz = ((best + correction) * rate) / size;
        Object.assign(result, {
          expectedHz: expected,
          hz,
          cents: 1200 * Math.log2(hz / expected),
        });
      }
      return result;
    };
    const metrics = (buffer, from, to) => {
      let peak = 0,
        sum = 0,
        nonfinite = 0,
        first = null,
        count = 0,
        clipped = 0;
      const a = Math.round(from * rate),
        b = Math.min(buffer.length, Math.round(to * rate));
      for (let ch = 0; ch < buffer.numberOfChannels; ch++)
        for (let i = a; i < b; i++) {
          const v = buffer.getChannelData(ch)[i];
          count++;
          if (!Number.isFinite(v)) {
            nonfinite++;
            continue;
          }
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
          if (Math.abs(v) >= 1) clipped++;
          if (Math.abs(v) > 1e-6 && (first === null || i < first)) first = i;
        }
      return {
        peak,
        rms: Math.sqrt(sum / Math.max(1, count)),
        nonfinite,
        clipped,
        firstSignal: first === null ? null : first / rate - from,
      };
    };
    const wav = (buffer, from, to) => {
      const start = Math.round(from * rate),
        length = Math.min(
          buffer.length - start,
          Math.round((to - from) * rate),
        );
      const data = new ArrayBuffer(44 + length * 4),
        view = new DataView(data);
      const text = (at, value) =>
        [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
      text(0, "RIFF");
      view.setUint32(4, data.byteLength - 8, true);
      text(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 2, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 16, true);
      text(36, "data");
      view.setUint32(40, length * 4, true);
      for (let i = 0; i < length; i++)
        for (let ch = 0; ch < 2; ch++) {
          const value = Math.max(
            -1,
            Math.min(1, buffer.getChannelData(ch)[start + i]),
          );
          view.setInt16(
            44 + i * 4 + ch * 2,
            Math.round(value * (value < 0 ? 32768 : 32767)),
            true,
          );
        }
      const bytes = new Uint8Array(data),
        chunks = [];
      for (let i = 0; i < bytes.length; i += 32768)
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
      return btoa(chunks.join(""));
    };
    const events = [],
      controls = [],
      probes = [];
    let cursor = 0;
    const note = (id, midi, at, duration, velocity = 0.72) =>
      events.push({ id, midi, at, duration, velocity });
    const probe = (name, seconds, setup) => {
      const start = cursor;
      setup(start);
      probes.push({ name, start, end: start + seconds });
      cursor += seconds;
    };
    for (const midi of [21, 22, 36, 49, 60, 69, 85, 96, 107, 108])
      probe(`pitch-${midi}`, 3, (t) =>
        note(`pitch-${midi}`, midi, t + 0.2, 1.8),
      );
    for (const velocity of [0.2, 0.45, 0.75, 1])
      probe(`velocity-${velocity}`, 3, (t) =>
        note(`velocity-${velocity}`, 60, t + 0.2, 1.8, velocity),
      );
    probe("delayed", 2, (t) => note("delayed", 60, t + 0.5, 0.6));
    probe("release", 3, (t) => {
      note("release", 60, t + 0.2, null);
      controls.push({ at: t + 0.7, kind: "release", id: "release" });
    });
    probe("sustain", 3, (t) => {
      controls.push({ at: t + 0.1, kind: "pedal", down: true });
      note("sustain", 60, t + 0.2, null);
      controls.push(
        { at: t + 0.6, kind: "release", id: "sustain" },
        { at: t + 1.4, kind: "pedal", down: false },
      );
    });
    probe("ownership", 3, (t) => {
      note("automatic", 48, t + 0.2, 2);
      note("live", 72, t + 0.2, null);
      note("future", 67, t + 1.2, 0.7);
      controls.push(
        { at: t + 0.6, kind: "stopPlayback" },
        { at: t + 1.8, kind: "stop" },
      );
    });
    const codaStart = cursor;
    probe("coda", 10, (t) => {
      for (let i = 0; i < 64; i++) {
        const chord = [48, 55, 60, 64, 67, 72, 76, 79];
        for (const [j, pitch] of chord.entries())
          note(
            `coda-${i}-${j}`,
            pitch + (i % 4 === 3 ? 2 : 0),
            t + 0.2 + i * 0.125,
            j < 2 ? 0.36 : 0.22,
            0.45 + 0.55 * (i / 63),
          );
      }
    });
    const render = async (before = false) => {
      const seconds = before ? 10 : cursor,
        ctx = new OfflineAudioContext(2, Math.round(rate * seconds), rate);
      const engine = before
        ? new BeforeAudio()
        : new PianoAudio({ context: ctx, fetch: fetch.bind(window) });
      engine.setVolume(1);
      const original = window.AudioContext;
      if (before)
        window.AudioContext = function () {
          return ctx;
        };
      const prepareAt = performance.now();
      try {
        await engine.prepare();
      } finally {
        window.AudioContext = original;
      }
      const prepareMs = performance.now() - prepareAt;
      engine.setRoom("dry");
      if (engine.ctx !== ctx)
        throw Error("Engine did not use the supplied OfflineAudioContext");
      const selected = before
        ? events
            .filter((e) => e.at >= codaStart)
            .map((e) => ({ ...e, at: e.at - codaStart }))
        : events;
      const plannedControls = before ? [] : controls;
      let i = 0,
        ci = 0,
        maximumActive = 0;
      const voices = new Map(),
        snapshots = [];
      const diagnostics = () =>
        typeof engine.diagnostics === "function"
          ? engine.diagnostics()
          : { active: engine.voices.size };
      const schedule = async (until) => {
        let to = i;
        while (to < selected.length && selected[to].at <= until) to++;
        if (engine.warm && to > i) await engine.warm(selected.slice(i, to));
        while (i < selected.length && selected[i].at <= until) {
          const e = selected[i++];
          const voice = engine.play(
            e.midi,
            e.duration,
            e.velocity,
            Math.max(0, e.at - ctx.currentTime),
          );
          if (!voice) throw Error(`Rejected expected note ${e.id}`);
          voices.set(e.id, voice);
        }
        maximumActive = Math.max(maximumActive, engine.voices.size);
      };
      await schedule(0.15);
      const suspensions = [];
      // A future note cancelled by stopPlayback must not be newly submitted later.
      // Queue that particular source before the stop, just as transport lookahead does.
      if (!before) {
        const future = selected.find((e) => e.id === "future");
        selected.splice(selected.indexOf(future), 1);
        controls.find((e) => e.kind === "stopPlayback").queue = future;
      }
      for (let t = 0.1; t < seconds - 0.05; t += 0.1)
        suspensions.push(
          ctx.suspend(t).then(async () => {
            while (
              ci < plannedControls.length &&
              plannedControls[ci].at <= ctx.currentTime + 0.005
            ) {
              const c = plannedControls[ci++];
              if (c.queue) {
                const e = c.queue;
                if (engine.warm) await engine.warm([e]);
                voices.set(
                  e.id,
                  engine.play(
                    e.midi,
                    e.duration,
                    e.velocity,
                    e.at - ctx.currentTime,
                  ),
                );
              }
              if (c.kind === "release") engine.release(voices.get(c.id));
              else if (c.kind === "pedal") engine.sustain(c.down);
              else if (c.kind === "stopPlayback") engine.stopPlayback();
              else if (c.kind === "stop") engine.stop();
              snapshots.push({
                control: c.kind,
                at: ctx.currentTime,
                diagnostics: diagnostics(),
                liveVoicePresent: engine.voices.has(voices.get("live")),
                futureVoicePresent: engine.voices.has(voices.get("future")),
                automaticVoicePresent: engine.voices.has(
                  voices.get("automatic"),
                ),
              });
            }
            await schedule(ctx.currentTime + 0.15);
            await ctx.resume();
          }),
        );
      const renderAt = performance.now(),
        buffer = await ctx.startRendering();
      await Promise.all(suspensions);
      await new Promise((r) => setTimeout(r, 0));
      const result = {
        prepareMs,
        renderMs: performance.now() - renderAt,
        seconds,
        maximumActive,
        events: selected.length,
        before: before,
        after: diagnostics(),
        snapshots,
      };
      if (before)
        return {
          ...result,
          coda: metrics(buffer, 0, 10),
          wav: wav(buffer, 0, 10),
        };
      result.probes = probes.map((p) => ({
        ...p,
        ...metrics(buffer, p.start, p.end),
        early: metrics(buffer, p.start, p.start + 0.45),
        body: metrics(buffer, p.start + 0.25, p.start + 0.65),
        held: metrics(buffer, p.start + 0.85, p.start + 1.2),
        tail: metrics(buffer, p.end - 0.5, p.end),
        ...(p.name.startsWith("pitch-")
          ? {
              pitch: spectral(
                buffer,
                p.start + 0.28,
                440 * 2 ** ((Number(p.name.split("-")[1]) - 69) / 12),
              ),
            }
          : {}),
        ...(p.name === "pitch-108"
          ? {
              attackPitchWindows: [0.215, 0.24, 0.28, 0.35, 0.5].flatMap(
                (offset) =>
                  [8192, 16384, 32768].map((size) => ({
                    offset,
                    size,
                    ...spectral(
                      buffer,
                      p.start + offset,
                      440 * 2 ** ((108 - 69) / 12),
                      size,
                    ),
                  })),
              ),
            }
          : {}),
        ...(p.name.startsWith("velocity-")
          ? { spectrum: spectral(buffer, p.start + 0.23, null, 16384) }
          : {}),
      }));
      result.wav = wav(buffer, codaStart, cursor);
      return result;
    };
    const current = await render(),
      before = await render(true);
    return { current, before };
  });
  for (const [name, result] of Object.entries(rendered)) {
    await fs.writeFile(
      path.join(run, `${name}-coda.wav`),
      Buffer.from(result.wav, "base64"),
    );
    delete result.wav;
  }
  Object.assign(report, rendered);
  const probes = new Map(rendered.current.probes.map((p) => [p.name, p]));
  for (const p of rendered.current.probes) {
    assert.equal(p.nonfinite, 0, p.name);
    assert.equal(p.clipped, 0, `${p.name}: no clipped output`);
    assert.ok(p.rms > 1e-6, `${p.name}: audible output`);
    if (p.pitch)
      assert.ok(
        Math.abs(p.pitch.cents) < 35,
        `${p.name}: ${p.pitch.cents.toFixed(2)} cents`,
      );
  }
  report.checks.push(
    "Rendered native and transposed pitches across A0–C8 stay within35cents; every probe contains finite audio without clipped samples.",
  );
  const soft = probes.get("velocity-0.2"),
    loud = probes.get("velocity-1");
  assert.ok(
    loud.body.rms > soft.body.rms * 1.6,
    "Recorded velocity dynamics must remain audible",
  );
  assert.ok(
    loud.spectrum.centroid > soft.spectrum.centroid * 1.03 ||
      loud.spectrum.brightShare > soft.spectrum.brightShare * 1.1,
    "Hard/soft strikes must differ spectrally, not only in loudness",
  );
  report.checks.push(
    "Harder strikes have greater rendered dynamic range and a measurable normalized spectral change.",
  );
  const delayed = probes.get("delayed");
  assert.equal(delayed.early.peak, 0, "No sound before the scheduled strike");
  assert.ok(
    delayed.firstSignal >= 0.498 && delayed.firstSignal < 0.6,
    `Delayed attack ${delayed.firstSignal}`,
  );
  const release = probes.get("release"),
    sustain = probes.get("sustain");
  assert.ok(release.tail.rms < release.body.rms * 0.01, "Released note decays");
  assert.ok(
    sustain.held.rms > release.held.rms * 2,
    "Pedal retains the released key",
  );
  assert.ok(
    sustain.tail.rms < sustain.body.rms * 0.01,
    "Pedal up damps the note",
  );
  const stopped = rendered.current.snapshots.find(
    (s) => s.control === "stopPlayback",
  );
  assert.ok(
    stopped.liveVoicePresent &&
      !stopped.futureVoicePresent &&
      !stopped.automaticVoicePresent,
    "Playback cancellation must retain live ownership and remove scheduled playback",
  );
  assert.ok(
    probes.get("ownership").tail.peak < 1e-6,
    "Stop cancels active and future notes completely",
  );
  report.checks.push(
    "Scheduled attacks stay silent until due; sustain/release and stopPlayback preserve the intended ownership while stop silences future notes.",
  );
  assert.ok(
    rendered.current.maximumActive <= 96,
    "Voice resources remain bounded",
  );
  report.checks.push(
    "The512-note coda stays finite and below full scale with bounded active voices; matched old/new engine WAVs are saved for listening.",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: report.checks.length,
        samples: report.bank.entries.length,
        peak: probes.get("coda").peak,
        maxVoices: rendered.current.maximumActive,
        evidence: run,
      },
      null,
      2,
    ),
  );
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await fs.writeFile(
    path.join(run, "render-report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
