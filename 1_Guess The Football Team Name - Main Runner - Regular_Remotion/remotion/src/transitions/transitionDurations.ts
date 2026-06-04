// Transition timing — reproduces the live app's page-transition overlay flow.
//
// In the app (js/transitions.js + js/video.js) a transition is NOT a dead gap; it is an
// overlay that:
//   1. SHOW phase  — animates IN to cover the screen over the OLD content (~PHASE_DUR).
//   2. swap        — content is swapped underneath (updateContentFn) while fully covered.
//   3. HIDE phase  — animates OUT to reveal the NEW content (~PHASE_DUR).
//   4. pad         — scheduleAfterTransition waits AFTER_CUSTOM_TRANSITION(200ms) before the
//                    next level's logic (countdown) starts; the new level is shown static.
//
// Each phase is normalised to PHASE_DUR=0.84s wall-clock by transitions.js `_runPhase`
// (Promise.all([anim, setTimeout(840)]) — the longer wins). The grid show anim finishes at
// stagger(≈0.443s) + dur(0.4s) ≈ 0.843s, so we use 850ms per phase to guarantee full cover.
//
// Total transition phase = SHOW + HIDE + PAD. This is the value buildTimeline lays out as the
// "transition" phase between levels; the overlay animation spans only SHOW+HIDE, and the final
// PAD shows the revealed next level static (matching the app's 200ms before the countdown).

/** One cover/reveal phase, ms. ≥ the grid's worst-case cell finish (≈843ms). */
export const TRANSITION_SHOW_MS = 850;
export const TRANSITION_HIDE_MS = 850;
/** Static-revealed pad after the overlay is gone, before the next countdown (video.js:231). */
export const TRANSITION_PAD_MS = 200;
/** Window the overlay animation occupies (cover + reveal), ms. */
export const TRANSITION_ANIM_MS = TRANSITION_SHOW_MS + TRANSITION_HIDE_MS; // 1700
/** Full transition phase duration laid out in the timeline, ms. */
export const TRANSITION_TOTAL_MS = TRANSITION_ANIM_MS + TRANSITION_PAD_MS; // 1900

// Per-effect total durations. Cloud Drift (new-1) and grid-overlay both run two PHASE_DUR
// phases + pad, so they share the same total. Kept as a table so future effects with
// genuinely different durations can diverge.
export const TRANSITION_DURATION_MS: Record<string, number> = {
  "grid-overlay": TRANSITION_TOTAL_MS,
  "new-1":        TRANSITION_TOTAL_MS, // Cloud Drift — forced on landing→first-question
  "bars-left":    TRANSITION_TOTAL_MS,
  "bars-top":     TRANSITION_TOTAL_MS,
  "curtain-close":TRANSITION_TOTAL_MS,
  "fade":         TRANSITION_TOTAL_MS,
  "zoom":         TRANSITION_TOTAL_MS,
  "dissolve":     TRANSITION_TOTAL_MS,
};

/**
 * Return the total transition phase duration in ms for the given effect key.
 * Falls back to TRANSITION_TOTAL_MS for unknown / undefined effects.
 */
export function transitionDurationMs(effect: string | undefined): number {
  return (effect && TRANSITION_DURATION_MS[effect]) || TRANSITION_TOTAL_MS;
}
