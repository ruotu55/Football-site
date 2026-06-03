import { describe, it, expect } from "vitest";
import { assetUrl } from "./assets";
describe("assetUrl", () => {
  it("maps repo-relative paths to server URLs (url-encoded)", () => {
    expect(assetUrl("../.Storage/Voices/Ticking sound/ticking sound.mp3", "http://127.0.0.1:8888"))
      .toBe("http://127.0.0.1:8888/.Storage/Voices/Ticking%20sound/ticking%20sound.mp3");
    expect(assetUrl("Images/Teams/x.png", "http://h")).toBe("http://h/Images/Teams/x.png");
    expect(assetUrl("/Images/y.png", "http://h")).toBe("http://h/Images/y.png");
  });
  it("passes through absolute http urls unchanged", () => {
    expect(assetUrl("https://cdn/x.png", "http://h")).toBe("https://cdn/x.png");
  });
  it("returns empty string for empty input", () => {
    expect(assetUrl("", "http://h")).toBe("");
  });
});
