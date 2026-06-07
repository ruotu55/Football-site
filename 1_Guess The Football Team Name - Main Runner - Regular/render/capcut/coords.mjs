export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** Map a pixel rect (in a CANVAS_W×CANVAS_H viewport) to CapCut clip transform+scale.
 *  Assumes the layer PNG is exactly w×h px. */
export function mapRect({ x, y, w, h }, canvasW = CANVAS_W, canvasH = CANVAS_H) {
  const f = Math.max(canvasW / w, canvasH / h); // CapCut cover-fit factor
  const scale = 1 / f;                          // render PNG at native px
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    scale,
    transform: {
      x: (cx - canvasW / 2) / (canvasW / 2),
      y: -(cy - canvasH / 2) / (canvasH / 2),
    },
  };
}
