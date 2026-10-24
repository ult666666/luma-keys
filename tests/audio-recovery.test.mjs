import test from "node:test";
import assert from "node:assert/strict";
import { PianoAudio } from "../src/audio.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function fixture(state = "suspended") {
  const context = {
    state,
    currentTime: 12.5,
    sampleRate: 48000,
    baseLatency: 0.01,
    outputLatency: 0.02,
    async resume() {
      this.state = "running";
    },
  };
  const piano = new PianoAudio({ context });
  // A prepared graph models an app left open across a device interruption.
  // Signal generation and graph construction have their own audio tests.
  piano.bus = {};
  piano.prepared = true;
  piano.ready = Promise.resolve();
  piano.master = { gain: { value: 0.65 } };
  piano.output = { microphoneGate: { gain: { value: 1 } } };
  piano.buffers.set(60, { cached: true });
  return { piano, context };
}

test("an interrupted context resumes immediately without reloading cached samples", async () => {
  const { piano, context } = fixture("interrupted");
  const buffers = piano.buffers;
  const ready = piano.ready;
  const calls = [];
  context.resume = () => {
    calls.push("resume");
    context.state = "running";
    return Promise.resolve();
  };
  const prepare = piano.prepare.bind(piano);
  piano.prepare = () => {
    calls.push("prepare");
    return prepare();
  };
  const started = piano.init({ timeoutMs: 20 });
  assert.deepEqual(calls, ["resume", "prepare"]);
  await started;
  assert.equal(piano.ctx, context);
  assert.equal(piano.buffers, buffers);
  assert.equal(piano.ready, ready);
  assert.equal(piano.buffers.size, 1);
  assert.equal(piano.diagnostics().contextState, "running");
  assert.equal(piano.diagnostics().lastResumeError, null);
});

test("a running context needs no resume and reports the actual output controls", async () => {
  const { piano, context } = fixture("running");
  context.resume = () => assert.fail("running audio must not restart");
  piano.output.microphoneGate.gain.value = 0;
  await piano.init({ timeoutMs: 20 });
  const status = piano.diagnostics();
  assert.equal(status.contextTime, 12.5);
  assert.equal(status.sampleRate, 48000);
  assert.equal(status.baseLatency, 0.01);
  assert.equal(status.outputLatency, 0.02);
  assert.equal(status.volume, 0.65);
  assert.equal(status.masterGain, 0.65);
  assert.equal(status.outputGain, 0);
  assert.equal(status.microphoneMuted, true);
  const cold = new PianoAudio().diagnostics();
  assert.equal(cold.contextState, "uninitialized");
  assert.equal(cold.contextTime, null);
  assert.equal(cold.outputGain, null);
  assert.equal(cold.microphoneMuted, null);
});

test("a hung resume is bounded and a later Play can retry successfully", async (t) => {
  const { piano, context } = fixture();
  const waiting = deferred();
  const clear = t.mock.method(globalThis, "clearTimeout");
  context.resume = () => waiting.promise;
  await assert.rejects(piano.init({ timeoutMs: 10 }), (error) => {
    assert.equal(error.code, "AUDIO_UNAVAILABLE");
    assert.match(error.message, /not responding/);
    return true;
  });
  assert.equal(clear.mock.callCount(), 1);
  assert.equal(piano.resuming, null);
  assert.match(piano.diagnostics().lastResumeError, /not responding/);
  // A late failure from the abandoned browser promise remains observed.
  waiting.reject(Error("device disconnected later"));
  context.resume = async () => {
    context.state = "running";
  };
  await piano.init({ timeoutMs: 20 });
  assert.equal(clear.mock.callCount(), 2);
  assert.equal(piano.diagnostics().lastResumeError, null);
  assert.equal(piano.buffers.size, 1);
});

test("resolved-but-interrupted audio is rejected instead of starting a silent transport", async (t) => {
  const { piano, context } = fixture("interrupted");
  const clear = t.mock.method(globalThis, "clearTimeout");
  context.resume = async () => {};
  await assert.rejects(piano.init({ timeoutMs: 20 }), (error) => {
    assert.equal(error.code, "AUDIO_UNAVAILABLE");
    assert.match(error.message, /still paused/);
    return true;
  });
  assert.equal(clear.mock.callCount(), 1);
  assert.equal(piano.diagnostics().contextState, "interrupted");
  assert.equal(piano.resuming, null);
});

test("closed, rejected, and synchronously failed output requests have recoverable errors", async () => {
  const closed = fixture("closed");
  closed.context.resume = () => assert.fail("a closed context cannot resume");
  await assert.rejects(closed.piano.resume(), {
    code: "AUDIO_UNAVAILABLE",
    message: /has closed/,
  });
  for (const synchronous of [false, true]) {
    const { piano, context } = fixture();
    const cause = Error("device unavailable");
    context.resume = () => {
      if (synchronous) throw cause;
      return Promise.reject(cause);
    };
    await assert.rejects(piano.resume({ timeoutMs: 20 }), (error) => {
      assert.equal(error.code, "AUDIO_UNAVAILABLE");
      assert.equal(error.cause, cause);
      assert.match(error.message, /Recover audio/);
      return true;
    });
    assert.equal(piano.resuming, null);
  }
});

test("simultaneous sound requests share one pending resume", async () => {
  const { piano, context } = fixture();
  const waiting = deferred();
  let calls = 0;
  context.resume = () => {
    calls++;
    return waiting.promise;
  };
  const first = piano.resume({ timeoutMs: 100 });
  const second = piano.resume({ timeoutMs: 100 });
  assert.equal(calls, 1);
  context.state = "running";
  waiting.resolve();
  await Promise.all([first, second]);
  assert.equal(piano.resuming, null);
});

test("sample failures remain handled after a resume failure", async () => {
  const { piano, context } = fixture();
  const samples = deferred();
  piano.prepare = () => samples.promise;
  context.resume = async () => {
    throw Error("output unavailable");
  };
  await assert.rejects(piano.init({ timeoutMs: 20 }), {
    code: "AUDIO_UNAVAILABLE",
  });
  samples.reject(Error("sample bank unavailable later"));
  // node:test fails this regression if the sample promise is unobserved.
  await new Promise((resolve) => setImmediate(resolve));
});

test("sample failures are still reported when audio resumes successfully", async () => {
  const { piano } = fixture();
  const failure = Error("sample bank unavailable");
  piano.prepare = async () => {
    throw failure;
  };
  await assert.rejects(piano.init({ timeoutMs: 20 }), (error) => error === failure);
});
