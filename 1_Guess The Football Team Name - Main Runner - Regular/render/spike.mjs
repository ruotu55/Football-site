// render/spike.mjs — Phase 0 determinism spike against the REAL app.
// Virtual-clock + Page.captureScreenshot per frame (beginFrame is gone in modern Chrome).
// Usage: node spike.mjs --script "Champion League" --lang english --frames 480 --out ./frames-tmp
import puppeteer from "puppeteer";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argv } from "node:process";

function arg(name, def) { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; }

const SCRIPT = arg("script", "Champion League");
const LANG = arg("lang", "english");
const FRAMES = Number(arg("frames", 480));
// Write frames to OS temp (NOT inside the runner folder) so the dev server's file
// watcher doesn't fire a live-reload and destroy the page mid-capture.
const OUT = arg("out", join(tmpdir(), "runner-render-spike"));
const PORT = Number(arg("port", 8888));
const SAVE_EVERY = Number(arg("save-every", 1));
const RUNNER = "1_Guess The Football Team Name - Main Runner - Regular";
const FRAME_MS = 1000 / 60;

const url =
  `http://127.0.0.1:${PORT}/${encodeURIComponent(RUNNER)}/index.html` +
  `?render=1&lang=${LANG}&script=${encodeURIComponent(SCRIPT)}&fps=60`;

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: "new",
  args: [
    "--hide-scrollbars", "--force-color-profile=srgb", "--disable-gpu-vsync",
    "--disable-threaded-animation", "--disable-threaded-scrolling",
    "--disable-checker-imaging", "--mute-audio", "--no-sandbox",
  ],
});
try {
  const page = (await browser.pages())[0];

  // Disable the dev server's live-reload INSIDE the headless page: neuter only the
  // __live-reload EventSource so its reload events / reconnects can't reload the page
  // under virtual time. Other EventSource users (recording-status, schedule) are untouched.
  // Seed Math.random BEFORE any app code runs, so even the earliest init renders
  // (background emojis, header hatch) are reproducible. render-mode skips re-seeding
  // when it sees __RENDER_SEEDED__.
  await page.evaluateOnNewDocument((seedStr) => {
    function makeSeededRandom(s) {
      let h = 1779033703 ^ s.length;
      for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
      let a = h >>> 0;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    Math.random = makeSeededRandom(seedStr);
    window.__RENDER_SEEDED__ = true;
  }, SCRIPT);

  await page.evaluateOnNewDocument(() => {
    const RealES = window.EventSource;
    window.EventSource = function (url, opts) {
      if (typeof url === "string" && url.includes("__live-reload")) {
        return { addEventListener() {}, removeEventListener() {}, close() {}, onerror: null, onmessage: null, readyState: 2 };
      }
      return new RealES(url, opts);
    };
  });

  const client = await page.createCDPSession();
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 2048, height: 1152, deviceScaleFactor: 1.25, mobile: false, screenWidth: 2048, screenHeight: 1152,
  });

  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("CONSOLE " + m.text()); });

  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("window.__render && window.__render.ready === true", { timeout: 120000 });
  const err = await page.evaluate(() => window.__render.error || null);
  if (err) { console.log("RENDER-MODE SETUP ERROR:", err); }

  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await page.evaluate(() => window.__render.start());

  const hashes = [];
  const t0 = Date.now();
  for (let n = 0; n < FRAMES; n++) {
    const p = client.send("Emulation.setVirtualTimePolicy", {
      policy: "advance", budget: FRAME_MS, maxVirtualTimeTaskStarvationCount: 100000,
    });
    await new Promise((res) => { client.once("Emulation.virtualTimeBudgetExpired", res); p.catch(() => {}); });
    const { data } = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    hashes.push(createHash("sha1").update(data, "base64").digest("hex").slice(0, 8));
    if (n % SAVE_EVERY === 0) {
      await writeFile(`${OUT}/frame_${String(n).padStart(5, "0")}.png`, Buffer.from(data, "base64"));
    }
    if (await page.evaluate(() => window.__render.done === true)) { console.log("done at frame", n); break; }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const distinct = new Set(hashes).size;
  console.log(JSON.stringify({ frames: hashes.length, distinct, elapsedSec: Number(elapsed), fps: (hashes.length / elapsed).toFixed(1) }));
  console.log("hashes[0..12]:", hashes.slice(0, 12).join(" "));
  if (consoleErrors.length) console.log("PAGE ERRORS:\n" + consoleErrors.slice(0, 20).join("\n"));
} finally {
  await browser.close();
}
