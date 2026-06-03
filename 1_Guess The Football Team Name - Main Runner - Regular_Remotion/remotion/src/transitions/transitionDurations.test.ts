import { describe, it, expect } from "vitest";
import { transitionDurationMs, TRANSITION_DURATION_MS } from "./transitionDurations";

describe("transitionDurationMs", () => {
  it("grid-overlay returns 820", () => {
    expect(transitionDurationMs("grid-overlay")).toBe(820);
  });

  it("undefined falls back to 820", () => {
    expect(transitionDurationMs(undefined)).toBe(820);
  });

  it("unknown effect falls back to 820", () => {
    expect(transitionDurationMs("does-not-exist")).toBe(820);
  });

  it("empty string falls back to 820", () => {
    expect(transitionDurationMs("")).toBe(820);
  });

  it("TRANSITION_DURATION_MS map includes grid-overlay", () => {
    expect(TRANSITION_DURATION_MS["grid-overlay"]).toBe(820);
  });

  it("bars-left returns a non-zero value", () => {
    expect(transitionDurationMs("bars-left")).toBeGreaterThan(0);
  });
});
