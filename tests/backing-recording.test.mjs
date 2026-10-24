import test from "node:test";
import assert from "node:assert/strict";
import {
  BackingRecording,
  recordingPosition,
  recordingRate,
} from "../src/backing-recording.js";
const track = { id: "a", bpm: 60, offset: 2, duration: 60 };
class FakeAudio {
  currentTime = 0;
  duration = 60;
  readyState = 1;
  paused = true;
  seeking = false;
  playbackRate = 1;
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
const args = {
  track,
  beat: 4,
  bpm: 60,
  speed: 0.75,
  epoch: 1,
  playing: true,
  end: 40,
  now: 1000,
};
test("recording position, tempo and pitch follow score beats, not elapsed practice time", () => {
  assert.equal(recordingPosition(track, 4), 6);
  assert.equal(recordingRate(track, 90, 0.5), 0.75);
  const a = new FakeAudio(),
    r = new BackingRecording(() => a);
  r.sync(args);
  assert.equal(a.currentTime, 6);
  assert.equal(a.playbackRate, 0.75);
  assert.equal(a.preservesPitch, true);
  r.setVolume(0.2);
  assert.equal(a.volume, 0.2);
  a.currentTime = 6.03;
  r.sync({ ...args, now: 1100 });
  assert.equal(r.seeks, 1, "small decoder jitter does not seek repeatedly");
  r.sync({ ...args, beat: 1, epoch: 2, now: 1150 });
  assert.equal(a.currentTime, 3, "loop seeks immediately");
});
test("count-in, wait, score end and stop cannot leave a recording playing", async () => {
  const a = new FakeAudio(),
    r = new BackingRecording(() => a);
  for (const patch of [
    { beat: -1 },
    { playing: false },
    { beat: 40 },
    { beat: 59 },
  ]) {
    r.sync(args);
    r.sync({ ...args, ...patch });
    assert.equal(a.paused, true);
  }
  r.sync(args);
  r.stop();
  await Promise.resolve();
  assert.equal(a.paused, true);
  assert.throws(
    () => r.sync({ ...args, bpm: 500, speed: 1.25 }),
    /tempo needs adjusting/,
  );
  assert.equal(a.paused, true);
});
test("a late play promise cannot restart after stop or pause a newer playback", async () => {
  const a = new FakeAudio();
  const resolves = [];
  a.play = () =>
    new Promise((resolve) =>
      resolves.push(() => {
        a.paused = false;
        resolve();
      }),
    );
  const r = new BackingRecording(() => a);
  r.sync(args);
  r.stop();
  resolves.shift()();
  await Promise.resolve();
  assert.equal(a.paused, true);
  r.sync(args);
  r.stop();
  r.sync({ ...args, epoch: 2 });
  resolves.shift()();
  await Promise.resolve();
  assert.equal(
    a.paused,
    false,
    "stale completion must not silence the newly requested run",
  );
  resolves.shift()();
  await Promise.resolve();
  r.stop();
  assert.equal(a.paused, true);
});
test("a rejected or failed recording stops once instead of retrying every frame", async () => {
  const a = new FakeAudio(),
    r = new BackingRecording(() => a);
  a.play = () => Promise.reject(new Error("Not allowed"));
  r.sync(args);
  await new Promise((resolve) => setImmediate(resolve));
  assert.throws(() => r.sync(args), /could not start/);
  assert.equal(r.starts, 1);
  assert.equal(a.paused, true);
  a.error = { code: 3 };
  assert.throws(() => r.sync(args), /stopped loading/);
  assert.equal(r.starts, 1);
});

test("recorded backing joins the protected mix once and smooths its independent volume", () => {
  const audio = new FakeAudio();
  audio.removeAttribute = () => {};
  audio.load = () => {};
  const node = () => ({
    connections: [],
    connect(destination) { this.connections.push(destination); },
    disconnect() { this.connections = []; },
  });
  const destination = node(), source = node(), gain = node();
  gain.gain = { value: 0, events: [], setTargetAtTime(...args) { this.events.push(args); } };
  let created = 0;
  const context = {
    currentTime: 2,
    createMediaElementSource(element) { assert.equal(element, audio); created++; return source; },
    createGain() { return gain; },
  };
  const recording = new BackingRecording(() => audio);
  recording.setVolume(0.35);
  recording.connect(context, destination);
  recording.connect(context, destination);
  assert.equal(created, 1, "an HTML media element can have only one source node");
  assert.deepEqual(source.connections, [gain]);
  assert.deepEqual(gain.connections, [destination]);
  assert.equal(gain.gain.value, 0.35);
  assert.equal(audio.volume, 1, "avoid applying the backing slider twice");
  recording.setVolume(0.8);
  assert.equal(recording.volume, 0.8);
  assert.deepEqual(gain.gain.events.at(-1), [0.8, 2, 0.025]);
  assert.throws(() => recording.connect(context, node()), /output changed/);
  recording.sync(args);
  assert.equal(audio.preservesPitch, true);
  recording.dispose();
  assert.equal(audio.paused, true);
  assert.deepEqual(source.connections, []);
  assert.deepEqual(gain.connections, []);
});
