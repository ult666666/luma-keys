import { prepareHandPlanData } from "./hand-planner-data.mjs";

self.onmessage = (event) => {
  const { id, score, speed, countRate, base } = event.data || {};
  try {
    const started = performance.now();
    const data = prepareHandPlanData(score, speed, countRate, base);
    self.postMessage({
      id,
      ok: true,
      data,
      prepareMs: performance.now() - started,
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};
