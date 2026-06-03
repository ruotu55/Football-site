// Per-effect transition duration table.
//
// IMPORTANT NOTE: The EXACT transition duration in the live full-video flow is
// `scheduleAfterTransition` = (runTransition show + hide) + 200ms (AFTER_CUSTOM_TRANSITION),
// and will be RECONCILED against a real __audioTap manifest in Phase 6.2.
// 820 is the verified fallback used today (matches MS.STAGE_TRANSITION in timeline.ts).
//
// Values are the full show+hide duration in ms (NOT including the 200ms AFTER_CUSTOM_TRANSITION
// padding; that is already embedded in the 820ms figure via the GSAP _runPhase timing).
//
// Source derivation:
//   grid-overlay: PHASE_DUR=0.84s × 2 phases, each normalised to ~0.84s wall-clock via
//   _runPhase; two phases ≈ 840ms total, but the live constant MS.STAGE_TRANSITION = 820ms
//   is the authoritative value from video.js line 51. Use 820 to avoid drift.
//
//   bars-left / bars-top: gsap dur=0.69s per phase × 2 = 1380ms GSAP time, but again
//   normalised by _runPhase to PHASE_DUR=0.84s wall-clock per phase → ~1680ms.
//   (Not yet verifiable against a manifest; kept as estimate.)
//
//   fade: simple opacity toggle, very short (≤PHASE_DUR); treated as 840ms.
//   zoom: similar to grid-overlay stagger pattern; treated as 840ms.
//   dissolve: estimated same as grid-overlay baseline.

export const TRANSITION_DURATION_MS: Record<string, number> = {
  "grid-overlay": 820,   // MS.STAGE_TRANSITION — the default; verified
  "bars-left":    1680,  // estimate: 2 × PHASE_DUR=0.84s (pending Phase 6.2)
  "bars-top":     1680,  // estimate: 2 × PHASE_DUR=0.84s (pending Phase 6.2)
  "fade":          840,  // estimate (pending Phase 6.2)
  "zoom":          840,  // estimate (pending Phase 6.2)
  "dissolve":      840,  // estimate (pending Phase 6.2)
};

/**
 * Return the total transition duration in ms for the given effect key.
 * Falls back to 820ms (MS.STAGE_TRANSITION) for unknown / undefined effects.
 */
export function transitionDurationMs(effect: string | undefined): number {
  return (effect && TRANSITION_DURATION_MS[effect]) || 820;
}
