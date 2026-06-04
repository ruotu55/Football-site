import React from "react";
import { Img } from "remotion";

/**
 * Img that DOES NOT cancel the render when a source fails to load.
 *
 * Remotion's <Img> calls cancelRender() on the first load error, so a single missing or
 * unreachable asset (a player photo that was never downloaded, a stale hashed filename, a
 * server that drifted ports) aborts the ENTIRE render — exactly the failures the runner
 * keeps hitting. Here a load error instead swaps in `fallback` (the slot/crest placeholder),
 * so the rest of the video still renders. Passing onError to Remotion's <Img> overrides its
 * default cancel-on-error behaviour.
 */
export const SafeImg: React.FC<{
  src: string;
  style: React.CSSProperties;
  fallback: React.ReactNode;
}> = ({ src, style, fallback }) => {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <Img
      src={src}
      style={style}
      onError={() => setFailed(true)}
    />
  );
};
