// render/worker.mjs — render ONE segment: run the identical deterministic flow, but only
// screenshot frames in [startFrame, endFrame); fast-advance the rest. Output a segment MP4.
// Determinism across workers comes from the injected duration map (--durations file).
// Usage: node worker.mjs --script "X" --lang english --start 0 --end 7080 --durations d.json --out seg0.mp4
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { launchRenderPage } from "./lib.mjs";

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

const durations = durFile ? JSON.parse(await readFile(durFile, "utf8")) : null;
const scriptObject = scriptJson ? JSON.parse(await readFile(scriptJson, "utf8")) : null;

const r = await launchRenderPage({ script, lang, port, durations, scriptObject });
const ff = spawn("ffmpeg", [
  "-y", "-f", "image2pipe", "-framerate", "60", "-i", "-",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
  "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", "60", "-s", "2560x1440",
  out,
], { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((res, rej) => { ff.on("close", (c) => c === 0 ? res() : rej(new Error("ffmpeg " + c))); ff.on("error", rej); });

// isDone must never crash the worker; a destroyed context means the page is gone -> treat as done.
async function safeIsDone() { try { return await r.isDone(); } catch (_) { return true; } }

const windowSize = Number.isFinite(end) ? Math.max(0, end - start) : 0;
let n = 0;
let captured = 0;
let failure = null;
const HARD_CAP = 60 * 60 * 14;
let doneSeen = false;
try {
  await r.startFlow();
  while (n < end && n < HARD_CAP) {
    await r.advanceOneFrame();
    if (n >= start) {
      const b = Buffer.from(await r.captureJpeg(), "base64");
      if (!ff.stdin.write(b)) await new Promise((res) => ff.stdin.once("drain", res));
      captured++;
      if (captured % 30 === 0) console.log(JSON.stringify({ w: W, captured, window: windowSize }));
    }
    n++;
    if (n % 120 === 0) {
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
