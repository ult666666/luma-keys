import test from "node:test";
import assert from "node:assert/strict";
import { createViewTransitionRunner } from "../src/view-transition.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const jobs = [];
  const app = { dataset: { transport: "paused" } };
  const root = { dataset: {} };
  let reduced = false;
  const document = {
    documentElement: root,
    querySelector: () => app,
    startViewTransition(update) {
      const ready = deferred(),
        finished = deferred();
      const job = {
        ready: ready.promise,
        finished: finished.promise,
        update,
        skips: 0,
        skipTransition() {
          this.skips++;
          ready.reject(new Error("Skipped"));
        },
        done() {
          ready.resolve();
          finished.resolve();
        },
      };
      jobs.push(job);
      return job;
    },
  };
  const run = createViewTransitionRunner((update) => update(), {
    getDocument: () => document,
    getWindow: () => ({ matchMedia: () => ({ matches: reduced }) }),
  });
  return {
    run,
    jobs,
    root,
    app,
    document,
    reduce: () => {
      reduced = true;
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("rapid navigation commits each action once, in order; a late callback cannot restore an old tab", async () => {
  const f = fixture(),
    applied = [];
  f.run(() => applied.push("library"), "nav-forward");
  f.run(() => applied.push("practice"), "nav-back");
  assert.deepEqual(applied, ["library"]);
  assert.equal(f.jobs[0].skips, 1);
  f.jobs[1].update();
  f.jobs[0].update();
  assert.deepEqual(applied, ["library", "practice"]);
  assert.equal(f.root.dataset.vt, "nav-back");
  f.jobs.forEach((job) => job.done());
  await settle();
  assert.equal(f.root.dataset.vt, undefined);
});

test("a finished transition cannot clear a newer transition of the same kind", async () => {
  const f = fixture();
  f.run(() => {}, "modal");
  f.jobs[0].update();
  f.run(() => {}, "modal");
  f.jobs[1].update();
  f.jobs[0].done();
  await settle();
  assert.equal(f.root.dataset.vt, "modal");
  f.jobs[1].done();
  await settle();
  assert.equal(f.root.dataset.vt, undefined);
});

test("playback and reduced motion cancel an older visual transition and apply the next action immediately", async () => {
  for (const mode of ["playing", "count", "reduced"]) {
    const f = fixture(),
      applied = [];
    f.run(() => applied.push("first"), "chat");
    if (mode === "reduced") f.reduce();
    else f.app.dataset.transport = mode;
    f.run(() => applied.push("last"), "modal");
    f.jobs[0].update();
    assert.deepEqual(applied, ["first", "last"]);
    assert.equal(f.jobs.length, 1);
    assert.equal(f.root.dataset.vt, undefined);
    f.jobs[0].done();
  }
  await settle();
});

test("unsupported or unavailable capture leaves controls functional and removes transition state", () => {
  const f = fixture();
  let count = 0;
  f.document.startViewTransition = () => {
    throw new Error("Cannot capture");
  };
  f.run(() => count++, "choice");
  assert.equal(count, 1);
  assert.equal(f.root.dataset.vt, undefined);
  delete f.document.startViewTransition;
  f.run(() => count++);
  assert.equal(count, 2);
  const ssr = createViewTransitionRunner(undefined, {
    getDocument: () => undefined,
  });
  ssr(() => count++);
  assert.equal(count, 3);
});

test("an update failure is not swallowed or replayed as a capture fallback", () => {
  const f = fixture();
  let count = 0;
  f.document.startViewTransition = (update) => update();
  assert.throws(
    () =>
      f.run(() => {
        count++;
        throw new Error("update failed");
      }),
    /update failed/,
  );
  assert.equal(count, 1);
  assert.equal(f.root.dataset.vt, undefined);
});

test("navigation captures settled entrances without finishing live companions or piano motion", () => {
  const f = fixture(),
    finished = [];
  const animation = (name, inside = true) => ({
    animationName: name,
    playState: "running",
    effect: { target: { closest: () => inside } },
    finish() {
      finished.push(name);
      this.playState = "finished";
    },
  });
  const old = animation("motion-card"),
    newEntry = animation("motion-rise");
  let entries = [old, animation("buddy-hop"), animation("motion-rise", false)];
  f.document.getAnimations = () => entries;
  f.run(() => {
    entries = [newEntry, animation("key-press")];
  }, "nav-forward");
  assert.deepEqual(finished, ["motion-card"]);
  f.jobs[0].update();
  assert.deepEqual(finished, ["motion-card", "motion-rise"]);
  f.jobs[0].done();
});
