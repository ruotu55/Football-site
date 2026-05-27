// render/audio-mux.mjs — reconstruct the soundtrack from the manifest and mux onto video.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { buildFiltergraph, lastEventMs } from "./audio-filtergraph.mjs";
import { RUNNER } from "./lib.mjs";

// Manifest srcs are page-relative ("../.Storage/X") or root-relative ("/.Storage/X"),
// both resolving against the runner page URL to a path under the server root (= repoRoot).
const PAGE_BASE = `http://127.0.0.1/${encodeURIComponent(RUNNER)}/index.html`;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (c) => c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}`)));
    p.on("error", reject);
  });
}

// Resolve a manifest src (relative or root-relative) to an absolute file path under repoRoot.
export function resolveSrc(src, repoRoot) {
  const u = new URL(src, PAGE_BASE);             // resolves "../" and "/" against the runner page
  const p = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  return join(repoRoot, p);
}

// Pair play/stop events by id so voices get a stopMs (for BGM ducking windows).
function withStopTimes(manifest) {
  const out = manifest.map((e) => ({ ...e }));
  for (const ev of out) {
    if (ev.type !== "play") continue;
    const stop = out.find((s) => s.type === "stop" && s.id === ev.id && s.atMs >= ev.atMs);
    if (stop) ev.stopMs = stop.atMs;
  }
  return out;
}

export async function buildAndMux({ manifest, silentVideoPath, outPath, repoRoot, workDir, sampleRate = 48000, videoMs = 0 }) {
  const enriched = withStopTimes(manifest);
  // Resolve clip srcs to absolute paths.
  const resolved = enriched.map((e) => (e.src ? { ...e, src: resolveSrc(e.src, repoRoot) } : e));
  const bgmStart = resolved.find((e) => e.type === "play" && e.kind === "bgm");
  const bgmPlaylist = bgmStart && Array.isArray(bgmStart.playlist)
    ? bgmStart.playlist.map((u) => resolveSrc(u, repoRoot))
    : null;

  // The video length is authoritative: trim the soundtrack to exactly match it.
  const totalMs = videoMs > 0 ? videoMs : lastEventMs(resolved) + 1500;
  const { inputs, filterComplex, finalLabel } = buildFiltergraph(resolved, { sampleRate, totalMs, bgmPlaylist });

  if (inputs.length === 0) {
    await run("ffmpeg", ["-y", "-i", silentVideoPath, "-c", "copy", outPath]);
    return outPath;
  }

  // 1) render the mixed audio track
  const audioPath = join(workDir, "audio.m4a");
  const args = ["-y"];
  for (const inp of inputs) args.push("-i", inp.path);
  args.push("-filter_complex", filterComplex, "-map", finalLabel,
    "-t", (totalMs / 1000).toFixed(3),                      // match video length exactly
    "-c:a", "aac", "-b:a", "256k", "-ar", String(sampleRate), audioPath);
  await run("ffmpeg", args);

  // 2) mux audio onto the silent video (keep whichever is longer)
  await run("ffmpeg", ["-y", "-i", silentVideoPath, "-i", audioPath,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", outPath]);
  return outPath;
}
