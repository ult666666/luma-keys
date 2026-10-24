import test from "node:test";
import assert from "node:assert/strict";
import { Worker as NodeWorker } from "node:worker_threads";
import { prepareHandPlanData } from "../src/hand-planner-data.mjs";
import {
  createHandPlanner,
  preparedHandPlan,
  MAX_FALLBACK_NOTES,
} from "../src/hand-planner.mjs";
import {
  adoptHandPlans,
  forgetHandPlans,
  handMotions,
  serialiseHandPlans,
} from "../src/hand-pose.mjs";
import { clockMap } from "../src/tempo.mjs";

const scoreFor = (id) => ({
  id,
  bpm: 100,
  tempos: [{ beat: 8, bpm: 76 }],
  notes: [
    ...Array.from({ length: 24 }, (_, i) => ({
      id: `r${i}`,
      midi: [60, 62, 64, 65, 67, 69, 71, 72][i % 8],
      beat: i / 2,
      duration: 0.5,
      hand: "right",
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `l${i}`,
      midi: [48, 55, 52][i % 3],
      beat: i * 2,
      duration: 2,
      hand: "left",
    })),
  ].sort((a, b) => a.beat - b.beat),
});
const geometry = { keyWidth: 30, keysHeight: 165, bedHeight: 225 };

test("structured hand plans preserve exact poses, releases, crossings, tempo changes and wait replays", () => {
  const score = scoreFor("clone-equivalence");
  for (const speed of [0.6, 1, 1.25]) {
    const clock = clockMap(score, speed, 0.7);
    const original = prepareHandPlanData(score, speed, 0.7);
    const clone = structuredClone(original);
    adoptHandPlans(clone.timelines, clock, clone.plans);
    for (const beat of [-1, 0, 0.4, 1, 3.8, 7.9, 8, 8.15, 10.5, 12])
      for (const flags of [
        {},
        { frozen: true, settle: { since: 0.4 } },
        { waiting: true, settle: { since: 1.7 } },
        { reducedMotion: true, waiting: true },
      ]) {
        const options = { ...geometry, clock, speed, ...flags };
        assert.deepEqual(
          handMotions(clone.timelines, beat, options),
          handMotions(original.timelines, beat, options),
          `${speed}, beat ${beat}, ${JSON.stringify(flags)}`,
        );
      }
    assert.equal(
      clone.plans.right.engs[0],
      clone.plans.right.byFinger[clone.plans.right.engs[0].finger][0],
      "engagement aliases survive the worker response",
    );
  }
});

test("a mismatched hand clock or timeline is rejected before either cache is adopted", () => {
  const score = scoreFor("wrong-clock"),
    clock = clockMap(score);
  const data = prepareHandPlanData(score);
  assert.throws(
    () => adoptHandPlans(data.timelines, clockMap(score, 0.6), data.plans),
    /clock/,
  );
  assert.throws(
    () =>
      adoptHandPlans(
        { ...data.timelines, right: data.timelines.right.slice() },
        clock,
        data.plans,
      ),
    /timeline/,
  );
});

test("real worker preparation returns the exact cloneable graph and is reused at a cached speed", async () => {
  const workers = [];
  const planner = createHandPlanner({
    createWorker: () => {
      const node = new NodeWorker(
        new URL("./helpers/hand-planner-node-worker.mjs", import.meta.url),
      );
      const adapter = {
        postMessage: (value) => node.postMessage(value),
        terminate: () => node.terminate(),
      };
      node.on("message", (data) => adapter.onmessage?.({ data }));
      node.on("error", (error) =>
        adapter.onerror?.({ message: error.message }),
      );
      workers.push(node);
      return adapter;
    },
  });
  const score = scoreFor("real-worker"),
    clock = clockMap(score, 0.6);
  try {
    const data = await planner.prepare(score, clock);
    assert.equal(data.worker, true);
    assert.equal(data.clockKey, clock.key);
    assert.ok(data.prepareMs >= 0);
    const direct = prepareHandPlanData(score, 0.6);
    assert.deepEqual(
      handMotions(data.timelines, 8.2, { ...geometry, clock }),
      handMotions(direct.timelines, 8.2, { ...geometry, clock }),
    );
    const hit = await planner.prepare(score, clock);
    assert.equal(hit.cached, true);
    assert.equal(workers.length, 1, "a cached speed does not start a worker");
    assert.equal(preparedHandPlan(score, clock).timelines, data.timelines);
    const faster = await planner.prepare(score, clockMap(score, 1));
    assert.deepEqual(
      [...faster.fingering],
      [...data.fingering],
      "written fingering stays fixed at a different practice speed",
    );
    assert.equal(workers.length, 2);
  } finally {
    planner.dispose();
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
});

const fakeFactory = () => {
  const workers = [];
  return {
    workers,
    createWorker: () => {
      const worker = {
        packet: null,
        stops: 0,
        postMessage(data) {
          this.packet = structuredClone(data);
        },
        terminate() {
          this.stops++;
        },
      };
      workers.push(worker);
      return worker;
    },
    reply(worker) {
      const { id, score, speed, countRate, base } = worker.packet;
      worker.onmessage({
        data: {
          id,
          ok: true,
          data: structuredClone(
            prepareHandPlanData(score, speed, countRate, base),
          ),
          prepareMs: 1,
        },
      });
    },
  };
};

test("a superseded score cannot adopt a late response or run its fallback; disposal terminates the current job", async () => {
  const fake = fakeFactory(),
    deferred = [];
  const planner = createHandPlanner({
    createWorker: fake.createWorker,
    defer: (fn) => deferred.push(fn),
  });
  const oldScore = scoreFor("obsolete"),
    nextScore = scoreFor("current");
  const first = planner.prepare(oldScore, clockMap(oldScore));
  const rejected = assert.rejects(first, { name: "AbortError" });
  const second = planner.prepare(nextScore, clockMap(nextScore));
  await rejected;
  assert.equal(fake.workers[0].stops, 1);
  fake.reply(fake.workers[0]);
  assert.equal(preparedHandPlan(oldScore, clockMap(oldScore)), null);
  fake.reply(fake.workers[1]);
  assert.equal((await second).worker, true);
  assert.equal(deferred.length, 0);
  const thirdScore = scoreFor("dispose");
  const third = planner.prepare(thirdScore, clockMap(thirdScore));
  const disposed = assert.rejects(third, { name: "AbortError" });
  planner.dispose();
  await disposed;
  assert.equal(fake.workers[2].stops, 1);
  await assert.rejects(planner.prepare(nextScore, clockMap(nextScore)), {
    name: "AbortError",
  });
});

test("worker failure falls back once to the original planner, cancels stale fallback and permits retry", async () => {
  const fake = fakeFactory(),
    deferred = [];
  const planner = createHandPlanner({
    createWorker: fake.createWorker,
    defer: (fn) => deferred.push(fn),
  });
  const score = scoreFor("fallback");
  const request = planner.prepare(score, clockMap(score));
  fake.workers[0].onerror({ message: "worker unavailable" });
  fake.workers[0].onmessageerror();
  assert.equal(deferred.length, 1);
  deferred.shift()();
  const result = await request;
  assert.equal(result.worker, false);
  assert.match(result.fallback, /unavailable/);
  assert.equal(fake.workers[0].stops, 1);
  const stale = scoreFor("stale-fallback"),
    next = scoreFor("retry");
  const staleRequest = planner.prepare(stale, clockMap(stale));
  const cancelled = assert.rejects(staleRequest, { name: "AbortError" });
  fake.workers[1].onerror({ message: "fail" });
  const retry = planner.prepare(next, clockMap(next));
  await cancelled;
  deferred.shift()();
  assert.equal(preparedHandPlan(stale, clockMap(stale)), null);
  fake.reply(fake.workers[2]);
  assert.equal((await retry).worker, true);
  planner.dispose();
});

test("a small score's timed-out worker stops and recovers with the exact planner", async () => {
  const fake = fakeFactory();
  const planner = createHandPlanner({
    createWorker: fake.createWorker,
    timeoutMs: 1,
  });
  const score = scoreFor("timeout");
  const result = await planner.prepare(score, clockMap(score));
  assert.equal(result.worker, false);
  assert.match(result.fallback, /timed out/);
  assert.equal(fake.workers[0].stops, 1);
  assert.deepEqual(
    [...result.fingering],
    [...prepareHandPlanData(score).fingering],
  );
  planner.dispose();
});

const largeScoreFor = (id, count = 50000) => ({
  id,
  bpm: 100,
  notes: Array.from({ length: count }, (_, i) => ({
    id: `${id}-${i}`,
    midi: 60 + (i % 12),
    beat: i * 0.25,
    duration: 0.125,
    hand: i % 4 ? "right" : "left",
  })),
});

test(
  "a 50,000-note timeout rejects and terminates without queuing any renderer planning",
  { timeout: 2000 },
  async () => {
    const fake = fakeFactory(),
      deferred = [];
    const planner = createHandPlanner({
      createWorker: fake.createWorker,
      timeoutMs: 1,
      defer: (fn) => deferred.push(fn),
    });
    const score = largeScoreFor("long-import"),
      clock = clockMap(score);
    try {
      await assert.rejects(planner.prepare(score, clock), (error) => {
        assert.equal(error.code, "HAND_PLAN_UNAVAILABLE");
        assert.equal(error.noteCount, 50000);
        assert.match(error.reason, /timed out/);
        return true;
      });
      assert.equal(fake.workers[0].stops, 1);
      assert.equal(
        deferred.length,
        0,
        "setTimeout is not a safe place to run a large synchronous fallback",
      );
      assert.equal(
        preparedHandPlan(score, clock),
        null,
        "failed preparation must not produce fictitious fingering",
      );
      fake.workers[0].onmessage({ data: { id: 1, ok: true, data: {} } });
      fake.workers[0].onerror({ message: "late failure" });
      assert.equal(deferred.length, 0);
      assert.equal(fake.workers[0].stops, 1);
    } finally {
      planner.dispose();
    }
  },
);

test(
  "all large-score worker failure paths reject without a renderer fallback",
  { timeout: 2000 },
  async (t) => {
    const failures = {
      unavailable: () => null,
      constructor: () => {
        throw new Error("constructor failed");
      },
      postMessage: (worker) => {
        worker.postMessage = () => {
          throw new Error("clone failed");
        };
        return worker;
      },
      error: (worker) => worker.onerror({ message: "worker failed" }),
      messageerror: (worker) => worker.onmessageerror(),
      rejected: (worker) =>
        worker.onmessage({
          data: { id: worker.packet.id, ok: false, error: "planner failed" },
        }),
      malformed: (worker) =>
        worker.onmessage({
          data: { id: worker.packet.id, ok: true, data: {} },
        }),
    };
    for (const [kind, fail] of Object.entries(failures)) {
      await t.test(kind, async () => {
        const fake = fakeFactory(),
          deferred = [];
        const duringCreation = [
          "unavailable",
          "constructor",
          "postMessage",
        ].includes(kind);
        const planner = createHandPlanner({
          createWorker: () =>
            duringCreation ? fail(fake.createWorker()) : fake.createWorker(),
          defer: (fn) => deferred.push(fn),
        });
        const score = largeScoreFor(`failure-${kind}`, MAX_FALLBACK_NOTES + 1),
          clock = clockMap(score);
        try {
          const request = planner.prepare(score, clock);
          const rejected = assert.rejects(request, {
            code: "HAND_PLAN_UNAVAILABLE",
          });
          if (!duringCreation) fail(fake.workers[0]);
          await rejected;
          assert.equal(deferred.length, 0);
          assert.equal(preparedHandPlan(score, clock), null);
          if (!["unavailable", "constructor"].includes(kind))
            assert.equal(fake.workers[0].stops, 1);
        } finally {
          planner.dispose();
        }
      });
    }
  },
);

test(
  "superseding or disposing a large score cancels its worker and never launches fallback",
  { timeout: 2000 },
  async () => {
    const fake = fakeFactory(),
      deferred = [];
    const planner = createHandPlanner({
      createWorker: fake.createWorker,
      timeoutMs: 10,
      defer: (fn) => deferred.push(fn),
    });
    const oldScore = largeScoreFor("discarded"),
      nextScore = scoreFor("recognized-pdf");
    try {
      const first = planner.prepare(oldScore, clockMap(oldScore));
      const aborted = assert.rejects(first, { name: "AbortError" });
      const second = planner.prepare(nextScore, clockMap(nextScore));
      await aborted;
      assert.equal(fake.workers[0].stops, 1);
      fake.workers[0].onmessage({ data: { id: 1, ok: true, data: {} } });
      fake.workers[0].onerror({ message: "obsolete failure" });
      fake.reply(fake.workers[1]);
      assert.equal((await second).worker, true);
      const third = planner.prepare(oldScore, clockMap(oldScore));
      const disposed = assert.rejects(third, { name: "AbortError" });
      planner.dispose();
      await disposed;
      await new Promise((resolve) => setTimeout(resolve, 15));
      assert.equal(fake.workers[2].stops, 1);
      assert.equal(deferred.length, 0);
      assert.equal(preparedHandPlan(oldScore, clockMap(oldScore)), null);
      assert.ok(preparedHandPlan(nextScore, clockMap(nextScore)));
    } finally {
      planner.dispose();
    }
  },
);

test("the fallback size limit preserves exact small plans and permits larger worker plans", async () => {
  const boundary = largeScoreFor("fallback-boundary", MAX_FALLBACK_NOTES),
    planner = createHandPlanner({ createWorker: () => null });
  try {
    const result = await planner.prepare(boundary, clockMap(boundary));
    assert.equal(result.worker, false);
    assert.deepEqual(result.fingering, prepareHandPlanData(boundary).fingering);
  } finally {
    planner.dispose();
  }
  const fake = fakeFactory(),
    workerPlanner = createHandPlanner({ createWorker: fake.createWorker }),
    score = largeScoreFor("background-only", MAX_FALLBACK_NOTES + 1);
  try {
    const pending = workerPlanner.prepare(score, clockMap(score));
    fake.reply(fake.workers[0]);
    const data = await pending;
    assert.equal(data.worker, true);
    assert.equal(data.fingering.size, score.notes.length);
    assert.equal(
      (await workerPlanner.prepare(score, clockMap(score))).cached,
      true,
    );
  } finally {
    workerPlanner.dispose();
  }
});

test("a malformed successful worker response uses the exact fallback instead of leaving hands pending", async () => {
  const fake = fakeFactory();
  const planner = createHandPlanner({ createWorker: fake.createWorker });
  const score = scoreFor("invalid-packet");
  const pending = planner.prepare(score, clockMap(score));
  fake.workers[0].onmessage({
    data: { id: fake.workers[0].packet.id, ok: true, data: {} },
  });
  const data = await pending;
  assert.equal(data.worker, false);
  assert.match(data.fallback, /clock/);
  assert.equal(fake.workers[0].stops, 1);
  planner.dispose();
});

test("no-worker preparation preserves empty scores and bounds the retained speed cache", async () => {
  const planner = createHandPlanner({ createWorker: () => null });
  const score = { id: "empty-plans", bpm: 80, notes: [] };
  for (const speed of [0.5, 0.6, 0.7, 0.8, 0.9]) {
    const data = await planner.prepare(score, clockMap(score, speed));
    assert.equal(data.fingering.size, 0);
    assert.deepEqual(data.timelines, { left: [], right: [] });
  }
  assert.equal(preparedHandPlan(score, clockMap(score, 0.5)), null);
  assert.ok(preparedHandPlan(score, clockMap(score, 0.9)));
  planner.dispose();
});

test("many fallback speeds release internal models without losing exact retained or revisited plans", async () => {
  const planner = createHandPlanner({ createWorker: () => null });
  const score = scoreFor("fallback-speed-eviction");
  const results = [];
  const speeds = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];
  try {
    for (const speed of speeds) {
      const clock = clockMap(score, speed);
      const data = await planner.prepare(score, clock);
      assert.equal(data.worker, false);
      results.push({ clock, data });
    }
    for (const { clock, data } of results.slice(0, -4)) {
      assert.equal(preparedHandPlan(score, clock), null);
      assert.equal(data.timelines, results.at(-1).data.timelines);
      assert.equal(
        forgetHandPlans(data.timelines, clock.key),
        0,
        "eviction already released both internal per-timeline models",
      );
    }
    for (const { clock, data } of results.slice(-4)) {
      assert.ok(preparedHandPlan(score, clock));
      const retained = serialiseHandPlans(data.timelines, clock);
      assert.equal(retained.left.engs, data.plans.left.engs);
      assert.equal(retained.right.engs, data.plans.right.engs);
    }
    const first = results[0];
    const direct = structuredClone(first.data);
    adoptHandPlans(direct.timelines, first.clock, direct.plans);
    const expected = handMotions(direct.timelines, 8.2, {
      ...geometry,
      clock: first.clock,
    });
    const revisited = await planner.prepare(score, first.clock);
    assert.equal(revisited.cached, false);
    assert.equal(revisited.timelines, first.data.timelines);
    assert.deepEqual(
      handMotions(revisited.timelines, 8.2, {
        ...geometry,
        clock: first.clock,
      }),
      expected,
    );
    assert.notEqual(revisited.plans.right.engs, first.data.plans.right.engs);
  } finally {
    planner.dispose();
  }
});

test("worker speed eviction leaves retained cloned models cached and prepares evicted clocks again", async () => {
  const fake = fakeFactory();
  const planner = createHandPlanner({ createWorker: fake.createWorker });
  const score = scoreFor("worker-speed-eviction");
  const results = [];
  try {
    for (const speed of [0.5, 0.6, 0.7, 0.8, 0.9]) {
      const clock = clockMap(score, speed);
      const pending = planner.prepare(score, clock);
      fake.reply(fake.workers.at(-1));
      results.push({ clock, data: await pending });
    }
    const first = results[0];
    assert.equal(preparedHandPlan(score, first.clock), null);
    assert.equal(forgetHandPlans(first.data.timelines, first.clock.key), 0);
    for (const { clock, data } of results.slice(1)) {
      const hit = await planner.prepare(score, clock);
      assert.equal(hit.cached, true);
      const retained = serialiseHandPlans(hit.timelines, clock);
      assert.equal(retained.right.engs, data.plans.right.engs);
    }
    assert.equal(fake.workers.length, 5);
    const again = planner.prepare(score, first.clock);
    fake.reply(fake.workers.at(-1));
    const rebuilt = await again;
    assert.equal(rebuilt.worker, true);
    assert.equal(rebuilt.cached, false);
    assert.equal(fake.workers.length, 6);
    assert.deepEqual([...rebuilt.fingering], [...first.data.fingering]);
    assert.deepEqual(
      handMotions(rebuilt.timelines, 8.2, { ...geometry, clock: first.clock }),
      handMotions(first.data.timelines, 8.2, {
        ...geometry,
        clock: first.clock,
      }),
    );
  } finally {
    planner.dispose();
  }
});
