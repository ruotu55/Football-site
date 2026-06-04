import { describe, it, expect } from "vitest";
import {
  transitionDurationMs,
  TRANSITION_DURATION_MS,
  TRANSITION_SHOW_MS,
  TRANSITION_HIDE_MS,
  TRANSITION_PAD_MS,
  TRANSITION_ANIM_MS,
  TRANSITION_TOTAL_MS,
} from "./transitionDurations";

describe("transition timing constants", () => {
  it("anim window = show + hide", () => {
    expect(TRANSITION_ANIM_MS).toBe(TRANSITION_SHOW_MS + TRANSITION_HIDE_MS);
  });

  it("total = anim + pad (cover + reveal + 200ms)", () => {
    expect(TRANSITION_TOTAL_MS).toBe(TRANSITION_ANIM_MS + TRANSITION_PAD_MS);
    expect(TRANSITION_PAD_MS).toBe(200);
  });

  it("each cover/reveal phase is at least the grid worst-case finish (~843ms)", () => {
    // grid stagger ≈ 0.443s + anim 0.4s; phase must fully cover before reversing.
    expect(TRANSITION_SHOW_MS).toBeGreaterThanOrEqual(843);
    expect(TRANSITION_HIDE_MS).toBeGreaterThanOrEqual(843);
  });
});

describe("transitionDurationMs", () => {
  it("grid-overlay returns the full total", () => {
    expect(transitionDurationMs("grid-overlay")).toBe(TRANSITION_TOTAL_MS);
  });

  it("new-1 (Cloud Drift) returns the full total", () => {
    expect(transitionDurationMs("new-1")).toBe(TRANSITION_TOTAL_MS);
  });

  it("undefined falls back to the full total", () => {
    expect(transitionDurationMs(undefined)).toBe(TRANSITION_TOTAL_MS);
  });

  it("unknown effect falls back to the full total", () => {
    expect(transitionDurationMs("does-not-exist")).toBe(TRANSITION_TOTAL_MS);
  });

  it("empty string falls back to the full total", () => {
    expect(transitionDurationMs("")).toBe(TRANSITION_TOTAL_MS);
  });

  it("TRANSITION_DURATION_MS map includes grid-overlay", () => {
    expect(TRANSITION_DURATION_MS["grid-overlay"]).toBe(TRANSITION_TOTAL_MS);
  });

  it("bars-left returns a non-zero value", () => {
    expect(transitionDurationMs("bars-left")).toBeGreaterThan(0);
  });
});
