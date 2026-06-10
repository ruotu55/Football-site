import { useCurrentFrame, useVideoConfig } from "remotion";

// Everything is authored in a 1920x1080 / 30fps "design space".
// - DESIGN_FPS lets time-based animation stay correct at any real fps.
// - DESIGN_WIDTH/HEIGHT let the layout scale to any real resolution.
export const DESIGN_FPS = 30;
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

// Convert the real frame (at the composition's real fps) into a virtual frame
// on the 30fps design timeline. Feed this into every interpolate()/spring()
// (with DESIGN_FPS) and the animation plays at the same real-time speed
// regardless of whether the composition runs at 30 or 60 fps.
export const useDesignFrame = (): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (frame * DESIGN_FPS) / fps;
};

// How many real frames a design-frame count maps to at the current fps.
export const useFrameScale = (): number => {
  const { fps } = useVideoConfig();
  return fps / DESIGN_FPS;
};
