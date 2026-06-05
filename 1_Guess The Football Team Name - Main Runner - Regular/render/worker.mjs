// render/worker.mjs — render ONE segment: run the identical deterministic flow, but only
// screenshot frames in [startFrame, endFrame); fast-advance the rest. Output a segment MP4.
// Determinism across workers comes from the injected duration map (--durations file).
// Usage: node worker.mjs --script "X" --lang english --start 0 --end 7080 --durations d.json --out seg0.mp4
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { launchRenderPage, frameSizeForHeight } from "./lib.mjs";
import { getSegmentFrameBudget } from "./segment-budgets.mjs";

function arg(n, d) { const a = process.argv; const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; }

const script = arg("script", "");
const lang = arg("lang", "english");
const start = Number(arg("start", 0));
const end = Number(arg("end", Infinity));
const out = arg("out", "./seg.mp4");
const port = Number(arg("port", 8888));
const durFile = arg("durations", "");
const W = Number(arg("w", 0)); // worker index, for aggregated progress
const scriptJson = arg("script-json", "");
const segment = arg("segment", "");
const fps = Math.max(1, Number(arg("fps", 60)));
const frameHeight = Math.max(1, Number(arg("height", 1440)));
const { width: outW, height: outH } = frameSizeForHeight(frameHeight);
// Quick-preview renders (lower res / fps) trade quality for speed — they're just to
// see what's going on, not the final video.
const preview = fps < 60 || frameHeight < 1440;
const crf = preview ? "23" : "16";
const preset = preview ? "ultrafast" : "veryfast";

const durations = durFile ? JSON.parse(await readFile(durFile, "utf8")) : null;
const scriptObject = scriptJson ? JSON.parse(await readFile(scriptJson, "utf8")) : null;

// Budgets are 60fps frame counts; scale to the render fps.
const segmentBudget = segment ? Math.round(getSegmentFrameBudget(segment) * fps / 60) : Infinity;
const r = await launchRenderPage({ script, lang, port, durations, scriptObject, segment, fps, height: frameHeight });
const ff = spawn("ffmpeg", [
  "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
  "-c:v", "libx264", "-preset", preset, "-crf", crf,
  "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(fps), "-s", `${outW}x${outH}`,
  out,
], { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((res, rej) => { ff.on("close", (c) => c === 0 ? res() : rej(new Error("ffmpeg " + c))); ff.on("error", rej); });

// isDone must never crash the worker; a destroyed context means the page is gone -> treat as done.
async function safeIsDone() { try { return await r.isDone(); } catch (_) { return true; } }

const windowSize = Number.isFinite(end) ? Math.max(0, end - start) : 0;
const frameCap = segment ? Math.min(end, segmentBudget + 12) : end;
let n = 0;
let captured = 0;
let failure = null;
const HARD_CAP = 60 * 60 * 14;
let doneSeen = false;
try {
  await r.startFlow();
  while (n < frameCap && n < HARD_CAP) {
    await r.advanceOneFrame();
    if (n >= start) {
      const b = Buffer.from(await r.captureJpeg(), "base64");
      if (!ff.stdin.write(b)) await new Promise((res) => ff.stdin.once("drain", res));
      captured++;
      if (captured === 1 || captured % 5 === 0) console.log(JSON.stringify({ w: W, captured, window: windowSize }));
    }
    n++;
    if (segment) {
      if (await safeIsDone()) break;
    } else if (n % 120 === 0) {
      doneSeen = await safeIsDone();
      if (doneSeen && (n >= end || end === Infinity)) break;
    }
  }
} catch (err) {
  failure = err;
  console.error(`[worker ${W}] capture failed at frame ${n}: ${(err && err.stack) || err}`);
} finally {
  try { ff.stdin.end(); await ffDone; } catch (e) { if (!failure) failure = e; }
  try { await r.browser.close(); } catch (_) {}
}
if (failure) process.exit(1);
console.log(JSON.stringify({ w: W, captured, window: windowSize, done: doneSeen }));
