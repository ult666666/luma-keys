import { fingerScore } from "./fingering.mjs";
import { handTimeline, serialiseHandPlans } from "./hand-pose.mjs";
import { clockMap, secondsAt } from "./tempo.mjs";

// The worker and the no-worker fallback call the same exact planner. The
// written fingering is independent of practice speed and can be reused.
export function prepareHandPlanData(
  score,
  speed = 1,
  countRate = null,
  base = null,
) {
  const fingering =
    base?.fingering ??
    fingerScore(score.notes || [], (beat) => secondsAt(score, beat));
  const timelines = base?.timelines ?? {
    left: handTimeline(score.notes || [], fingering, "left"),
    right: handTimeline(score.notes || [], fingering, "right"),
  };
  const clock = clockMap(score, speed, countRate);
  return {
    fingering,
    timelines,
    plans: serialiseHandPlans(timelines, clock),
    clockKey: clock.key,
  };
}
