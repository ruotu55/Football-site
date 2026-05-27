// render/index.mjs — Render Video orchestrator.
// 1) PROBE: run the deterministic flow once (no capture) -> total frames + voice durations + audio manifest.
// 2) PARALLEL: spawn N workers, each captures a frame window -> segment MP4.
// 3) CONCAT: join segments -> silent video.
// 4) AUDIO: reconstruct soundtrack from manifest and mux (audio-mux.mjs).
// Usage: node index.mjs --script "Champion League" --lang english --out "<final>.mp4" [--workers 4] [--repo-root PATH]
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

const WORKER_PATH = fileURLToPath(new URL("./worker.mjs", import.meta.url));
import { launchRenderPage, FRAME_MS } from "./lib.mjs";
import { buildAndMux } from "./audio-mux.mjs";

function arg(n, d) { const a = process.argv; const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; }
function log(o) { console.log(JSON.stringify(o)); }

const script = arg("script", "");
const lang = arg("lang", "english");
const out = arg("out", "./out/video.mp4");
const port = Number(arg("port", 8888));
const repoRoot = arg("repo-root", "");
const maxFrames = Number(arg("max-frames", Infinity)); // testing cap
// Single continuous pass by default: the only way to stay 100% in sync with the live app.
// (Parallel windows desync because the flow has real-time deps that don't fast-forward
//  identically, causing repeated intros / jumpy playback when segments are stitched.)
const workers = Math.max(1, Number(arg("workers", 1)));
const scriptJson = arg("script-json", ""); // path to current on-screen state (preferred over saved-by-name)

if (!script) { log({ stage: "error", message: "--script is required" }); process.exit(1); }

// Load the live on-screen state object if provided (so we render what the user sees now).
let scriptObject = null;
if (scriptJson) {
  try { scriptObject = JSON.parse(await (await import("node:fs/promises")).readFile(scriptJson, "utf8")); }
  catch (e) { log({ stage: "error", message: "failed to read --script-json: " + e.message }); process.exit(1); }
}

const job = `render-${Date.now()}`;
const work = join(tmpdir(), job);
await mkdir(work, { recursive: true });
await mkdir(dirname(out), { recursive: true });

// ---- 1) PROBE ----
log({ stage: "probe" });
let totalFrames, durations, manifest;
{
  const r = await launchRenderPage({ script, lang, port, scriptObject });
  try {
    await r.startFlow();
    let n = 0; const HARD = 60 * 60 * 14;
    for (; n < HARD; n++) {
      await r.advanceOneFrame();
      if (n % 120 === 0 && await r.isDone()) break;
    }
    totalFrames = Math.min(n + 18, maxFrames); // small tail to settle final frame
    durations = await r.getDurations();
    manifest = await r.getManifest();
  } finally { await r.browser.close(); }
}
const durFile = join(work, "durations.json");
await writeFile(durFile, JSON.stringify(durations));
await writeFile(join(work, "manifest.json"), JSON.stringify(manifest));
log({ stage: "probed", totalFrames, virtualSec: +(totalFrames / 60).toFixed(1), audioEvents: manifest.length, voices: Object.keys(durations).length });

// ---- 2) PARALLEL CAPTURE (4 workers, each retried up to 3x on failure) ----
const MAX_ATTEMPTS = 4; // 1 initial + 3 retries
const per = Math.ceil(totalFrames / workers);
const windows = [];
for (let w = 0; w < workers; w++) {
  const s = w * per;
  const e = Math.min(totalFrames, (w + 1) * per);
  if (s >= e) break;
  windows.push({ w, s, e, window: e - s, seg: join(work, `seg_${String(w).padStart(2, "0")}.mp4`) });
}
const segs = windows.map((x) => x.seg);
const captured = windows.map(() => 0);

let lastEmit = 0;
function emitProgress(force) {
  const now = Date.now();
  if (!force && now - lastEmit < 350) return;
  lastEmit = now;
  const sum = captured.reduce((a, b) => a + (b || 0), 0);
  log({
    stage: "progress", frame: sum, total: totalFrames,
    workers: windows.map((x) => ({ w: x.w, captured: captured[x.w] || 0, window: x.window })),
  });
}

// Run ONE worker process; resolve on success, reject with stderr tail on failure.
function spawnWorker(x) {
  const args = [
    WORKER_PATH,
    "--script", script, "--lang", lang, "--start", String(x.s), "--end", String(x.e),
    "--out", x.seg, "--port", String(port), "--durations", durFile, "--w", String(x.w),
  ];
  if (scriptJson) args.push("--script-json", scriptJson);
  const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  let buf = "";
  p.stdout.on("data", (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); if (typeof m.w === "number" && typeof m.captured === "number") { captured[m.w] = m.captured; emitProgress(false); } } catch (_) {}
    }
  });
  const errTail = [];
  p.stderr.on("data", (d) => { for (const ln of d.toString().split("\n")) { if (ln.trim()) errTail.push(ln); } while (errTail.length > 25) errTail.shift(); });
  return new Promise((res, rej) => {
    p.on("close", (c) => c === 0 ? res() : rej(new Error(`worker ${x.w} exited ${c}` + (errTail.length ? ":\n" + errTail.join("\n") : ""))));
    p.on("error", rej);
  });
}

// Run a worker with up to MAX_ATTEMPTS, resetting its progress each retry.
async function runWorkerWithRetries(x) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    captured[x.w] = 0;
    emitProgress(true);
    try { await spawnWorker(x); return; }
    catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) {
        log({ stage: "retry", w: x.w, attempt, max: MAX_ATTEMPTS });
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  throw new Error(`Worker ${x.w} failed after ${MAX_ATTEMPTS} attempts.\n` + String((lastErr && lastErr.message) || lastErr));
}

log({ stage: "capture", workers: windows.length, framesPerWorker: per, total: totalFrames });
// Stagger launches so 4 workers don't all hit page-load + setup at the same instant
// (simultaneous startup starves one worker's page and wedges it at "ready").
const STAGGER_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await Promise.all(windows.map((x, i) => sleep(i * STAGGER_MS).then(() => runWorkerWithRetries(x))));
} catch (e) {
  log({ stage: "error", message: String((e && e.message) || e) });
  process.exit(1);
}
emitProgress(true);

// ---- 3) CONCAT ----
const listFile = join(work, "segs.txt");
await writeFile(listFile, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
const silent = join(work, "silent.mp4");
await new Promise((res, rej) => {
  const ff = spawn("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", silent], { stdio: ["ignore", "inherit", "inherit"] });
  ff.on("close", (c) => c === 0 ? res() : rej(new Error("concat ffmpeg " + c)));
});
log({ stage: "concat", segments: segs.length });

// ---- 4) AUDIO + MUX ----
if (repoRoot) {
  log({ stage: "audio" });
  // Trim audio events to the rendered video length (matters when --max-frames caps the render).
  const videoMs = (totalFrames / 60) * 1000;
  const trimmed = manifest.filter((e) => !Number.isFinite(e.atMs) || e.atMs <= videoMs);
  await buildAndMux({ manifest: trimmed, silentVideoPath: silent, outPath: out, repoRoot, workDir: work, videoMs });
} else {
  // No repo root provided -> ship silent video.
  await new Promise((res, rej) => {
    const ff = spawn("ffmpeg", ["-y", "-i", silent, "-c", "copy", out], { stdio: ["ignore", "inherit", "inherit"] });
    ff.on("close", (c) => c === 0 ? res() : rej(new Error("copy ffmpeg " + c)));
  });
}

await rm(work, { recursive: true, force: true }).catch(() => {});
log({ stage: "done", path: out, frames: totalFrames });
