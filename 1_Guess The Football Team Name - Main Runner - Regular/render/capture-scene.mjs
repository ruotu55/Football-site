// render/capture-scene.mjs — drive the real play flow headlessly and capture, instead of
// video frames, the visible DOM layers (transparent PNG each) + audio manifest, then emit
// scene.json for build-capcut.mjs. Reuses the render harness (lib.mjs) + dev server.
import { launchRenderPage, RUNNER } from "./lib.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// repo root = two levels up from this runner's render/ dir
const REPO_ROOT = join(process.cwd().includes(RUNNER) ? process.cwd() : join(process.cwd(), RUNNER), "..");

/** Resolve a recording-status BLOCK's script snapshot by its display name. */
export function resolveBlockScript(name, repoRoot = REPO_ROOT) {
  const rs = JSON.parse(readFileSync(join(repoRoot, ".Storage", "storage", "recording-status.json"), "utf8"));
  for (const [key, b] of Object.entries(rs.blocks || {})) {
    if (String(b.name || "").trim() === String(name).trim()) {
      const script = (b.videoStatus && b.videoStatus.frozenScript) || b.script;
      if (!script) throw new Error(`block "${name}" (${key}) has no script snapshot`);
      return { key, script };
    }
  }
  throw new Error(`no recording-status block named "${name}"`);
}

/**
 * Phase C1: load the page in render mode (feeding the block's script as scriptObject), run
 * the flow for a segment, and dump the audio manifest + voice durations.
 * (DOM/PNG capture + scene.json come in C2/C3.)
 */
export async function captureScene({ script: name, lang = "english", port = 8888, outDir, segment = "", maxFrames = 60 * 20 }) {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "assets"), { recursive: true });
  const { key, script } = resolveBlockScript(name);

  const r = await launchRenderPage({ script: name, scriptObject: script, lang, port, segment, fps: 30, height: 1080 });
  try {
    await r.startFlow();
    let n = 0;
    for (; n < maxFrames; n++) {
      await r.advanceOneFrame();
      if (n % 30 === 0 && (await r.isDone())) break;
    }
    const manifest = await r.getManifest();
    const durations = await r.getDurations();
    writeFileSync(join(outDir, `manifest${segment ? "-" + segment : ""}.json`),
      JSON.stringify({ block: key, segment, frames: n, manifest, durations }, null, 2));
    return { key, frames: n, manifest, durations };
  } finally {
    await r.browser.close();
  }
}

// CLI: node render/capture-scene.mjs "<save>" <outDir> [segment] [maxFrames]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const name = process.argv[2] || "Europa League";
  const outDir = process.argv[3] || "render/capcut/out/europa";
  const segment = process.argv[4] || "";
  const maxFrames = process.argv[5] ? Number(process.argv[5]) : 60 * 20;
  const res = await captureScene({ script: name, outDir, segment, maxFrames });
  console.log("CAPTURED block=" + res.key + " segment=" + (segment || "(full)") +
    " frames=" + res.frames + " manifestEvents=" + res.manifest.length);
}
