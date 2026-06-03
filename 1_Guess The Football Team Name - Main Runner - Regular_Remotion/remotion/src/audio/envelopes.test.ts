import { describe, it, expect } from "vitest";
import { bgmVolumeAtFrame, type VoiceWindow } from "./envelopes";

const FPS = 60;
const ms = (n: number) => Math.round((n / 1000) * FPS);

// ─── helpers ───────────────────────────────────────────────────────────────
/** approx equality for float ramps */
function approx(a: number, b: number, eps = 0.005) {
  return Math.abs(a - b) < eps;
}

describe("bgmVolumeAtFrame — baseline", () => {
  it("returns 1.0 when no windows are present", () => {
    expect(bgmVolumeAtFrame(0, [], FPS)).toBe(1.0);
    expect(bgmVolumeAtFrame(999999, [], FPS)).toBe(1.0);
  });

  it("returns 1.0 before any window starts", () => {
    const w: VoiceWindow = { duckStartFrame: ms(5000), delayFrames: ms(600), voiceEndFrame: ms(7100) };
    expect(bgmVolumeAtFrame(ms(4999), [w], FPS)).toBe(1.0);
  });
});

describe("bgmVolumeAtFrame — duck ramp (1.0 → 0.2 over delayFrames)", () => {
  const duckStart = ms(1000);
  const delay = ms(600); // 36 frames
  const voiceEnd = ms(2500);
  const w: VoiceWindow = { duckStartFrame: duckStart, delayFrames: delay, voiceEndFrame: voiceEnd };

  it("is 1.0 at duckStart (beginning of ramp)", () => {
    expect(bgmVolumeAtFrame(duckStart, [w], FPS)).toBe(1.0);
  });

  it("is exactly 0.2 at duckStart + delayFrames (voice fires)", () => {
    expect(bgmVolumeAtFrame(duckStart + delay, [w], FPS)).toBe(0.2);
  });

  it("is ~0.6 at the midpoint of the ramp", () => {
    // midpoint = duckStart + delay/2; lerp(1.0, 0.2, 0.5) = 0.6
    const mid = duckStart + Math.floor(delay / 2);
    const vol = bgmVolumeAtFrame(mid, [w], FPS);
    expect(approx(vol, 0.6, 0.02)).toBe(true);
  });

  it("holds 0.2 throughout the voice hold (between delayEnd and voiceEnd)", () => {
    const holdFrame = duckStart + delay + ms(500); // 500ms into the hold
    expect(bgmVolumeAtFrame(holdFrame, [w], FPS)).toBe(0.2);
  });

  it("holds 0.2 right at voiceEnd", () => {
    expect(bgmVolumeAtFrame(voiceEnd, [w], FPS)).toBe(0.2);
  });
});

describe("bgmVolumeAtFrame — standalone restore (wait 2500ms then ramp 1500ms)", () => {
  const duckStart = ms(0);
  const delay = ms(600);
  const voiceEnd = ms(2000);
  // standalone: no next voice within 3000ms
  const w: VoiceWindow = { duckStartFrame: duckStart, delayFrames: delay, voiceEndFrame: voiceEnd };

  const restoreStart = voiceEnd + ms(2500); // wait
  const restoreEnd   = restoreStart + ms(1500); // fade completes

  it("still 0.2 in the RESTORE_WAIT window (between voiceEnd and restoreStart)", () => {
    expect(bgmVolumeAtFrame(voiceEnd + ms(100), [w], FPS)).toBe(0.2);
    expect(bgmVolumeAtFrame(voiceEnd + ms(2499), [w], FPS)).toBe(0.2);
  });

  it("is 0.2 at restoreStart (fade not yet begun)", () => {
    expect(bgmVolumeAtFrame(restoreStart, [w], FPS)).toBe(0.2);
  });

  it("is ~0.6 at the midpoint of the restore ramp", () => {
    const mid = restoreStart + Math.floor(ms(1500) / 2);
    const vol = bgmVolumeAtFrame(mid, [w], FPS);
    expect(approx(vol, 0.6, 0.02)).toBe(true);
  });

  it("is 1.0 at restoreEnd (ramp complete)", () => {
    expect(bgmVolumeAtFrame(restoreEnd, [w], FPS)).toBe(1.0);
  });

  it("stays 1.0 after restoreEnd", () => {
    expect(bgmVolumeAtFrame(restoreEnd + ms(5000), [w], FPS)).toBe(1.0);
  });
});

describe("bgmVolumeAtFrame — chained voices (gap < 3000ms = no restore between them)", () => {
  // Window A ends at voiceEndA; Window B starts within 3000ms → they are chained.
  // BGM should stay ducked between them (no restore ramp between voiceEndA and duckStartB).
  const duckStartA = ms(0);
  const delayA     = ms(600);
  const voiceEndA  = ms(2000);

  // gap = 1500ms < 3000ms → CHAINED
  const duckStartB = voiceEndA + ms(1500);
  const delayB     = ms(600);
  const voiceEndB  = duckStartB + delayB + ms(1500);

  const wA: VoiceWindow = { duckStartFrame: duckStartA, delayFrames: delayA, voiceEndFrame: voiceEndA };
  const wB: VoiceWindow = { duckStartFrame: duckStartB, delayFrames: delayB, voiceEndFrame: voiceEndB };

  it("stays at 0.2 between voiceEndA and duckStartB (the gap window — no restore)", () => {
    const midGap = voiceEndA + ms(750); // midpoint of the 1500ms gap
    expect(bgmVolumeAtFrame(midGap, [wA, wB], FPS)).toBe(0.2);
  });

  it("holds 0.2 during voice B hold", () => {
    const midB = duckStartB + delayB + ms(500);
    expect(bgmVolumeAtFrame(midB, [wA, wB], FPS)).toBe(0.2);
  });

  it("restores after voice B ends (standalone restore from B)", () => {
    // After wB ends, wA is far in the past — no chaining from wB's perspective.
    // wB is the tail voice; it restores after RESTORE_WAIT_STANDALONE.
    const restoreStart = voiceEndB + ms(2500);
    const restoreEnd   = restoreStart + ms(1500);
    expect(bgmVolumeAtFrame(restoreEnd + ms(100), [wA, wB], FPS)).toBe(1.0);
  });
});

describe("bgmVolumeAtFrame — minimum-gain rule (overlapping windows)", () => {
  // Two windows that overlap: the min gain should apply.
  const w1: VoiceWindow = { duckStartFrame: ms(0), delayFrames: ms(600), voiceEndFrame: ms(3000) };
  const w2: VoiceWindow = { duckStartFrame: ms(500), delayFrames: ms(600), voiceEndFrame: ms(5000) };

  it("returns 0.2 when both windows are in hold phase", () => {
    expect(bgmVolumeAtFrame(ms(2000), [w1, w2], FPS)).toBe(0.2);
  });
});

describe("bgmVolumeAtFrame — edge: single frame at restoreEnd boundary", () => {
  // Verify the ramp clamps to 1.0, not slightly above due to float arithmetic.
  const duckStart = ms(0);
  const delay = ms(600);
  const voiceEnd = ms(1500);
  const w: VoiceWindow = { duckStartFrame: duckStart, delayFrames: delay, voiceEndFrame: voiceEnd };
  const restoreEnd = voiceEnd + ms(2500) + ms(1500);

  it("is exactly 1.0 at and after restoreEnd", () => {
    expect(bgmVolumeAtFrame(restoreEnd, [w], FPS)).toBe(1.0);
    expect(bgmVolumeAtFrame(restoreEnd + 1, [w], FPS)).toBe(1.0);
  });
});
