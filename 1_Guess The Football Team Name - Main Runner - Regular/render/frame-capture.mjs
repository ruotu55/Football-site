// render/frame-capture.mjs — deterministic capture of the REAL app -> silent H.264 MP4.
// Virtual-clock stepping + Page.captureScreenshot per frame (beginFrame is gone in modern Chrome).
import puppeteer from "puppeteer";
import { spawn } from "node:child_process";

const FRAME_MS = 1000 / 60;
const RUNNER = "1_Guess The Football Team Name - Main Runner - Regular";

const SEED_FN = (seedStr) => {
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
};

const KILL_LIVE_RELOAD = () => {
  const RealES = window.EventSource;
  window.EventSource = function (url, opts) {
    if (typeof url === "string" && url.includes("__live-reload")) {
      return { addEventListener() {}, removeEventListener() {}, close() {}, onerror: null, onmessage: null, readyState: 2 };
    }
    return new RealES(url, opts);
  };
};

export async function captureSilentVideo({ script, lang, port = 8888, outPath, maxFrames = 60 * 60 * 12, onProgress }) {
  const url =
    `http://127.0.0.1:${port}/${encodeURIComponent(RUNNER)}/index.html` +
    `?render=1&lang=${lang}&script=${encodeURIComponent(script)}&fps=60`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--hide-scrollbars", "--force-color-profile=srgb", "--disable-gpu-vsync",
      "--disable-threaded-animation", "--disable-threaded-scrolling",
      "--disable-checker-imaging", "--mute-audio", "--no-sandbox",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const page = (await browser.pages())[0];
    await page.evaluateOnNewDocument(SEED_FN, script);
    await page.evaluateOnNewDocument(KILL_LIVE_RELOAD);

    const client = await page.createCDPSession();
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 2048, height: 1152, deviceScaleFactor: 1.25, mobile: false, screenWidth: 2048, screenHeight: 1152,
    });

    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction("window.__render && window.__render.ready === true", { timeout: 120000 });
    const err = await page.evaluate(() => window.__render.error || null);
    if (err) throw new Error("render-mode setup failed: " + err);

    // ffmpeg: read a stream of PNGs on stdin -> near-lossless H.264.
    const ff = spawn("ffmpeg", [
      "-y", "-f", "image2pipe", "-framerate", "60", "-i", "-",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
      "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", "60", "-s", "2560x1440",
      outPath,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const ffDone = new Promise((resolve, reject) => {
      ff.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg exited " + code)));
      ff.on("error", reject);
    });

    async function writeFrame(b64) {
      const buf = Buffer.from(b64, "base64");
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    async function advanceOneFrame() {
      const p = client.send("Emulation.setVirtualTimePolicy", {
        policy: "advance", budget: FRAME_MS, maxVirtualTimeTaskStarvationCount: 100000,
      });
      await new Promise((res) => { client.once("Emulation.virtualTimeBudgetExpired", res); p.catch(() => {}); });
    }
    async function shot() {
      // JPEG q100 is ~4x faster to capture than PNG and visually indistinguishable once
      // re-encoded to H.264 (CRF 16). This is the single biggest render-speed lever.
      const { data } = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 100, fromSurface: true, captureBeyondViewport: false });
      return data;
    }

    await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
    await page.evaluate(() => window.__render.start());

    let n = 0;
    const t0 = Date.now();
    while (n < maxFrames) {
      await advanceOneFrame();
      await writeFrame(await shot());
      n++;
      if (onProgress && n % 30 === 0) {
        const sec = (Date.now() - t0) / 1000;
        onProgress({ frame: n, captureFps: +(n / sec).toFixed(2), virtualSec: +(n / 60).toFixed(1) });
      }
      if (await page.evaluate(() => window.__render.done === true)) break;
    }
    // short tail so the final state/fade settles
    for (let t = 0; t < 18 && n < maxFrames; t++) { await advanceOneFrame(); await writeFrame(await shot()); n++; }

    const manifest = await page.evaluate(() => window.__audioManifest || []);
    ff.stdin.end();
    await ffDone;
    return { frames: n, manifest, elapsedSec: +((Date.now() - t0) / 1000).toFixed(1) };
  } finally {
    await browser.close();
  }
}
