const ENTRANCE_ANIMATIONS = new Set([
  "motion-rise",
  "motion-card",
  "motion-pop",
  "motion-screen-in",
  "screen-in",
  "modal-in",
  "continue-ribbon",
  "continue-glow",
]);

function settleEntrances(document, kind) {
  const scope = kind.startsWith("nav")
    ? ".app .screen, .app .practice-screen, .app .app-nav"
    : kind === "modal"
      ? ".modal-backdrop"
      : null;
  if (!scope) return;
  for (const animation of document.getAnimations?.() ?? []) {
    if (
      ENTRANCE_ANIMATIONS.has(animation.animationName) &&
      animation.effect?.target?.closest?.(scope) &&
      animation.playState !== "finished"
    ) {
      // Finish only our finite entrances, never the live piano, companion,
      // loaders or a user's focus feedback. The snapshot supplies the motion.
      // Unlike a temporary negative animation-delay, finish() cannot rewind
      // when the view-transition attribute is removed.
      try {
        animation.finish();
      } catch {
        /* A removed element can cancel it. */
      }
    }
  }
}

/** Run visual transitions without delaying or replaying a newer UI action.
 * The state callback is committed once even if Chromium skips its animation.
 * `commit` is React's flushSync in the app and a plain call in unit tests.
 */
export function createViewTransitionRunner(
  commit = (update) => update(),
  {
    getDocument = () => globalThis.document,
    getWindow = () => globalThis.window,
  } = {},
) {
  let active = null;

  function finish(job) {
    if (active !== job) return;
    active = null;
    delete job.root.dataset.vt;
  }

  return function withTransition(update, kind = "layout") {
    // Skipping an animation does not cancel its queued update callback. Apply
    // that callback now, in order, and make its eventual invocation a no-op.
    // Otherwise a slow capture can overwrite a more recent tab or dialog.
    if (active) {
      const previous = active;
      previous.transition?.skipTransition();
      try {
        previous.apply();
      } finally {
        finish(previous);
      }
    }

    const document = getDocument();
    const transport = document?.querySelector(".app")?.dataset.transport;
    if (
      !document?.startViewTransition ||
      transport === "playing" ||
      transport === "count" ||
      getWindow()?.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return update();
    }

    const job = {
      root: document.documentElement,
      transition: null,
      applied: false,
      apply() {
        if (job.applied) return;
        job.applied = true;
        const result = commit(update);
        settleEntrances(document, kind);
        return result;
      },
    };
    active = job;
    job.root.dataset.vt = kind;
    settleEntrances(document, kind);
    try {
      job.transition = document.startViewTransition(() => {
        // Only this owner may label a snapshot. An older skipped callback is
        // still allowed to run, but must not change the new transition's CSS.
        if (active === job) job.root.dataset.vt = kind;
        return job.apply();
      });
    } catch (error) {
      finish(job);
      // A capture may be unavailable (for example a hidden window). The
      // requested action still works. Never retry a callback that threw.
      if (job.applied) throw error;
      return job.apply();
    }
    job.transition.ready.catch(() => {});
    job.transition.finished.catch(() => {}).finally(() => finish(job));
    return job.transition;
  };
}
