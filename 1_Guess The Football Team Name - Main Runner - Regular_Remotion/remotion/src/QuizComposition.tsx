import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { RemotionProps } from "./props";
export const QuizComposition: React.FC<RemotionProps> = (props) => {
  const frame = useCurrentFrame();
  return (<AbsoluteFill style={{ backgroundColor:"#0d1117", color:"#fff", justifyContent:"center", alignItems:"center", fontSize:64 }}>
    {props.script} · Q{props.questionCount} · frame {frame}
  </AbsoluteFill>);
};
