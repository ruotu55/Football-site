/**
 * Pure BGM-ducking envelope (Phase 5.1).
 * Ported from audio.js constants (lines ~201-219).
 *
 * Estimates are clearly marked; reconciled vs __audioTap manifest in Phase 6.2.
 */

// ─── Constants (mirrors audio.js) ──────────────────────────────────────────
export const NORMAL_VOL = 1.0;
export const DUCKED_VOL = 0.2;
export const BGM_CROSSFADE_MS = 3000;
export const RESTORE_WAIT_STANDALONE_MS = 2500;
export const RESTORE_WAIT_AFTER_CHAIN_MS = 0;
export const VOICE_CHAIN_GAP_MS = 3000;
export const RESTORE_FADE_MS = 1500;

// ─── VoiceWindow ────────────────────────────────────────────────────────────
export interface VoiceWindow {
  /** Frame at which BGM starts ramping down (= duck start = revealMs frame). */
  duckStartFrame: number;
  /** Number of frames the ramp takes (= voice delayMs in frames). At duckStart + delayFrames
   *  the voice actually sounds and BGM is fully ducked to DUCKED_VOL. */
  delayFrames: number;
  /** Frame at which the voice clip ends and restore logic begins. */
  voiceEndFrame: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Compute the minimum gain contributed by a single VoiceWindow at `frame`.
 * If the window has no effect at `frame`, returns NORMAL_VOL (1.0).
 *
 * @param frame         Global frame to evaluate.
 * @param w             The voice window.
 * @param fps           Frames per second.
 * @param isChainedTail Whether this window is the LAST in a chain (so its restore
 *                      uses RESTORE_WAIT_STANDALONE_MS). If it is NOT the tail
 *                      (i.e., there is a next window within VOICE_CHAIN_GAP_MS),
 *                      we keep the volume at DUCKED_VOL until the next window
 *                      takes over, so we return DUCKED_VOL for the gap period.
 * @param nextDuckStart Frame at which the next voice window starts, or Infinity.
 */
function gainFromWindow(
  frame: number,
  w: VoiceWindow,
  fps: number,
  nextDuckStart: number,
): number {
  const { duckStartFrame, delayFrames, voiceEndFrame } = w;

  // Before this window — no effect.
  if (frame < duckStartFrame) return NORMAL_VOL;

  // Ramp-down phase: [duckStartFrame, duckStartFrame + delayFrames]
  const delayEndFrame = duckStartFrame + delayFrames;
  if (frame < delayEndFrame) {
    const t = (frame - duckStartFrame) / Math.max(1, delayFrames);
    return lerp(NORMAL_VOL, DUCKED_VOL, t);
  }

  // Hold phase: [delayEndFrame, voiceEndFrame]
  if (frame <= voiceEndFrame) return DUCKED_VOL;

  // Post-voice: determine chaining vs standalone.
  const chainGapFrames = Math.round((VOICE_CHAIN_GAP_MS / 1000) * fps);
  const chainedToNext = nextDuckStart - voiceEndFrame <= chainGapFrames;

  if (chainedToNext) {
    // Stay ducked until the next window takes over (no restore between them).
    if (frame < nextDuckStart) return DUCKED_VOL;
    // Once past nextDuckStart, this window no longer contributes.
    return NORMAL_VOL;
  }

  // Standalone: wait RESTORE_WAIT_STANDALONE_MS, then fade up over RESTORE_FADE_MS.
  const restoreWaitFrames = Math.round((RESTORE_WAIT_STANDALONE_MS / 1000) * fps);
  const restoreFadeFrames = Math.round((RESTORE_FADE_MS / 1000) * fps);
  const restoreStartFrame = voiceEndFrame + restoreWaitFrames;
  const restoreEndFrame   = restoreStartFrame + restoreFadeFrames;

  if (frame < restoreStartFrame) return DUCKED_VOL;
  if (frame >= restoreEndFrame)  return NORMAL_VOL;

  const t = (frame - restoreStartFrame) / Math.max(1, restoreFadeFrames);
  return lerp(DUCKED_VOL, NORMAL_VOL, t);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns BGM gain (0..1) at `frame`, applying duck-to-0.2 ramps + restore,
 * matching audio.js behavior exactly.
 *
 * - Baseline: NORMAL_VOL (1.0).
 * - For each window: ramp 1.0→0.2 over delayFrames; hold 0.2 during voice;
 *   then wait (standalone=2500ms / chained=0ms) then ramp 0.2→1.0 over 1500ms.
 * - Multiple windows: returns the MINIMUM gain (overlap = stays ducked).
 *
 * @param frame   Global frame index (0-based).
 * @param windows Array of voice windows, in chronological order (sorted by duckStartFrame).
 * @param fps     Frames per second.
 */
export function bgmVolumeAtFrame(
  frame: number,
  windows: VoiceWindow[],
  fps: number,
): number {
  if (windows.length === 0) return NORMAL_VOL;

  // Sort windows chronologically for chain-detection.
  const sorted = [...windows].sort((a, b) => a.duckStartFrame - b.duckStartFrame);

  let minGain = NORMAL_VOL;
  for (let i = 0; i < sorted.length; i++) {
    const nextDuckStart = i + 1 < sorted.length
      ? sorted[i + 1].duckStartFrame
      : Infinity;
    const gain = gainFromWindow(frame, sorted[i], fps, nextDuckStart);
    if (gain < minGain) minGain = gain;
  }
  return minGain;
}
