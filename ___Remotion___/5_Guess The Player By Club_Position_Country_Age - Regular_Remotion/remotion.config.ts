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

// Concurrency 6 + a generous per-frame timeout: a level frame decodes many images
// (crest + flag + player photo) at once; at concurrency 10 the first
// such frame can exceed the default 30s delayRender timeout. 6 + 120s is reliable.
Config.setConcurrency(6);
Config.setTimeoutInMilliseconds(120000);

// All Remotion projects in this repo share ONE public folder (single copy of the
// referenced assets), populated by `npm run build-data`. No per-project duplication.
Config.setPublicDir(path.resolve(process.cwd(), "..", "..", ".remotion-shared", "public"));
