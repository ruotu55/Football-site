import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// Use the GPU rasterizer (ANGLE) instead of Windows' default CPU SwiftShader —
// ~5× faster on the 3D pitch / blur / gradient-heavy frames.
Config.setChromiumOpenGlRenderer("angle");

// Sweet spot for 16 cores / 16 GB RAM at 4K (benchmarked: 6→24s, 10→21s, 14→23s
// for 120 frames — 14 thrashes RAM). Raise toward 16 if you add more RAM.
Config.setConcurrency(10);

// All Remotion projects in this repo share ONE public folder (single copy of the
// referenced assets), populated by `npm run build-data`. No per-project duplication.
// Projects live under ___Remotion___/, so the shared cache is two levels up at the repo root.
Config.setPublicDir(path.resolve(process.cwd(), "..", "..", ".remotion-shared", "public"));
