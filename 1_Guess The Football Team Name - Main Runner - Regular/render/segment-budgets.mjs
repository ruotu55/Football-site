/** Max frames per render test clip at 60fps (probe + capture hard cap). Keep in sync with js/render-segments.js. */
export const SEGMENT_FRAME_BUDGETS = {
  intro: 300,
  "level-playing": 960,
  ending: 900,
};

export function getSegmentFrameBudget(segmentId) {
  return SEGMENT_FRAME_BUDGETS[segmentId] ?? 360;
}
