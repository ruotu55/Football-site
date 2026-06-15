import path from "node:path";
import { Config } from "@remotion/cli/config";

// The shared code lives OUTSIDE this project (../../.remotion-shared/src — at the repo
// root), imported via the "@shared/*" alias. Two webpack tweaks make that work:
//  • resolve.alias maps "@shared" → the shared src folder.
//  • resolve.modules adds this project's node_modules so the shared files (outside the
//    project root) can resolve react / remotion / @remotion/* / zod against it.
const SHARED_SRC = path.resolve(process.cwd(), "..", "..", ".remotion-shared", "src");
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: { ...(config.resolve?.alias ?? {}), "@shared": SHARED_SRC },
    modules: [path.resolve(process.cwd(), "node_modules"), "node_modules"],
  },
}));

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
