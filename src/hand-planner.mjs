import { prepareHandPlanData } from "./hand-planner-data.mjs";
import { adoptHandPlans, forgetHandPlans } from "./hand-pose.mjs";

// Weak score ownership prevents discarded imports from keeping their models.
// A few speeds survive navigation; dragging the tempo control cannot grow an
// unbounded bank of complete score plans.
const cache = new WeakMap();
const MAX_CLOCKS = 4;
// The exact planner has quadratic passes. A failed worker may be retried on
// the renderer only for a small score; deferring a large calculation does not
// make it interruptible once it starts.
export const MAX_FALLBACK_NOTES = 256;
const abortError = () =>
  Object.assign(new Error("Hand preparation was superseded."), {
    name: "AbortError",
  });
const workerFactory = () =>
  new Worker(new URL("./hand-planner.worker.mjs", import.meta.url), {
    type: "module",
  });
const scoreData = (score) => ({
  id: score?.id,
  bpm: score?.bpm,
  tempos: score?.tempos,
  notes: score?.notes || [],
});

export function preparedHandPlan(score, clock) {
  return (score && cache.get(score)?.get(clock.key)) || null;
}

export function createHandPlanner({
  createWorker = workerFactory,
  timeoutMs = 20000,
  defer = (fn) => setTimeout(fn, 0),
} = {}) {
  let disposed = false,
    active = null,
    sequence = 0;
  const stop = (job, error) => {
    if (!job || job.done) return;
    job.done = true;
    clearTimeout(job.timer);
    job.worker?.terminate();
    if (active === job) active = null;
    if (error) job.reject(error);
  };
  const api = {
    cancel() {
      stop(active, abortError());
    },
    dispose() {
      disposed = true;
      api.cancel();
    },
    prepare(score, clock, countRate = null) {
      if (disposed) return Promise.reject(abortError());
      api.cancel();
      const hit = preparedHandPlan(score, clock);
      if (hit) {
        adoptHandPlans(hit.timelines, clock, hit.plans);
        return Promise.resolve({ ...hit, cached: true });
      }
      return new Promise((resolve, reject) => {
        const job = {
          id: ++sequence,
          worker: null,
          timer: null,
          done: false,
          reject,
        };
        active = job;
        const previous = cache.get(score)?.values().next().value;
        const base = previous
          ? { fingering: previous.fingering, timelines: previous.timelines }
          : null;
        const accept = (data, metrics) => {
          if (job.done || disposed || active !== job) return;
          try {
            adoptHandPlans(data.timelines, clock, data.plans);
            const result = { ...data, ...metrics, cached: false };
            let clocks = cache.get(score);
            if (!clocks) cache.set(score, (clocks = new Map()));
            clocks.set(clock.key, result);
            while (clocks.size > MAX_CLOCKS) {
              const oldest = clocks.keys().next().value;
              const expired = clocks.get(oldest);
              clocks.delete(oldest);
              forgetHandPlans(expired.timelines, expired.clockKey);
            }
            stop(job);
            resolve(result);
          } catch (error) {
            if (job.fallback) stop(job, error);
            else fallback(error);
          }
        };
        const fallback = (reason) => {
          if (job.done || disposed || active !== job || job.fallback) return;
          const noteCount = score?.notes?.length || 0;
          if (noteCount > MAX_FALLBACK_NOTES) {
            stop(
              job,
              Object.assign(
                new Error(
                  "Hand guide unavailable for this score. You can still practise.",
                  { cause: reason },
                ),
                {
                  code: "HAND_PLAN_UNAVAILABLE",
                  noteCount,
                  reason: String(
                    reason?.message || reason || "Worker unavailable",
                  ),
                },
              ),
            );
            return;
          }
          job.fallback = true;
          clearTimeout(job.timer);
          job.worker?.terminate();
          job.worker = null;
          defer(() => {
            if (job.done || disposed || active !== job) return;
            try {
              const started = performance.now();
              const data = prepareHandPlanData(
                score,
                clock.speed,
                countRate,
                base,
              );
              accept(data, {
                worker: false,
                prepareMs: performance.now() - started,
                fallback: String(
                  reason?.message || reason || "Worker unavailable",
                ),
              });
            } catch (error) {
              stop(job, error);
            }
          });
        };
        try {
          const worker = createWorker();
          if (!worker) throw new Error("Worker unavailable");
          job.worker = worker;
          worker.onmessage = (event) => {
            if (job.done || event.data?.id !== job.id || active !== job) return;
            const message = event.data;
            if (!message.ok)
              return fallback(message.error || "Hand preparation failed");
            accept(message.data, {
              worker: true,
              prepareMs: message.prepareMs,
            });
          };
          worker.onerror = (event) => {
            event.preventDefault?.();
            fallback(event.message || "Hand worker failed");
          };
          worker.onmessageerror = () =>
            fallback("Hand worker response could not be read");
          job.timer = setTimeout(
            () => fallback("Hand worker timed out"),
            timeoutMs,
          );
          worker.postMessage({
            id: job.id,
            score: scoreData(score),
            speed: clock.speed,
            countRate,
            base,
          });
        } catch (error) {
          fallback(error);
        }
      });
    },
  };
  return api;
}
