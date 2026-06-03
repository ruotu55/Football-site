import { describe, it, expect } from "vitest";
import { MS } from "./timeline";

describe("MS constants (verified against source)", () => {
  it("matches the live app", () => {
    expect(MS.LOGO_VOICE_DELAY).toBe(500);
    expect(MS.LOGO_REVEAL_DELAY).toBe(2000);
    expect(MS.LOGO_AFTER_REVEAL).toBe(1200);
    expect(MS.INTRO_STEP_DELAY_IDX0).toBe(1000);
    expect(MS.INTRO_STEP_DELAY_IDX1).toBe(500);
    expect(MS.FLIP_DELAY_INTRO).toBe(1000);
    expect(MS.STAGE_TRANSITION).toBe(820);
    expect(MS.AFTER_CUSTOM_TRANSITION).toBe(200);
    expect(MS.COUNTDOWN_TOTAL).toBe(10000);
    expect(MS.TICK_LEAD).toBe(3000);
    expect(MS.REVEAL_STINGER).toBe(150);
    expect(MS.REVEAL_VOICE_DELAY).toBe(600);
    expect(MS.FLIP_DELAY_REVEAL).toBe(3000);
    expect(MS.FLIP_DURATION).toBe(780);
    expect(MS.OUTRO_TAIL).toBe(1000);
    expect(MS.PROGRESS_VOICE_DELAY).toBe(1000);
    expect(MS.DEFAULT_TRANSITION_PHASE).toBe(840);
  });
});
