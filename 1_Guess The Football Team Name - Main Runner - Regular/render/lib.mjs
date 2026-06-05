// render/lib.mjs — shared headless-render helpers (launch, virtual clock, seeding).
import puppeteer from "puppeteer";

export const RUNNER = "1_Guess The Football Team Name - Main Runner - Regular";
export const FRAME_MS = 1000 / 60;
// The app lays out at CSS 1728x972 (16:9). The output pixel size is set by deviceScaleFactor:
//   height 1440 -> dsf 1440/972 -> 2560x1440 (full quality, real renders)
//   height 1080 -> dsf 1080/972 -> 1920x1080 (quick preview, test clips)
export const CSS_W = 1728;
export const CSS_H = 972;
export const VIEWPORT = { width: CSS_W, height: CSS_H, deviceScaleFactor: 1440 / CSS_H }; // -> 2560x1440
/** Output pixel dimensions for a target frame height (keeps 16:9). */
export function frameSizeForHeight(height) {
  return { width: Math.round((height * 16) / 9), height: Math.round(height) };
}

// Seeded Math.random before any app code, so emoji/hatch/random picks are reproducible.
function SEED_FN(seedStr) {
  function mk(s) {
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
  Math.random = mk(seedStr);
  window.__RENDER_SEEDED__ = true;
}

// Neuter ONLY the dev-server live-reload EventSource (it reloads the page under virtual time).
function KILL_LR() {
  const RealES = window.EventSource;
  window.EventSource = function (url, opts) {
    if (typeof url === "string" && url.includes("__live-reload")) {
      return { addEventListener() {}, removeEventListener() {}, close() {}, onerror: null, onmessage: null, readyState: 2 };
    }
    return new RealES(url, opts);
  };
}

function INJECT_DURATIONS(map) { window.__renderDurations = map; }
function INJECT_SCRIPT(obj) { window.__renderScript = obj; }
function INJECT_SEGMENT(id) { window.__renderSegmentId = id; }

/**
 * Launch a headless render page and return control helpers.
 * @param {object} o {script, lang, port, durations?, scriptObject?}
 */
export async function launchRenderPage({ script, lang = "english", port = 8888, durations = null, scriptObject = null, segment = "", fps = 60, height = 1440 }) {
  const frameMs = 1000 / fps;
  const viewport = { width: CSS_W, height: CSS_H, deviceScaleFactor: height / CSS_H };
  let url =
    `http://127.0.0.1:${port}/${encodeURIComponent(RUNNER)}/index.html` +
    `?render=1&lang=${lang}&script=${encodeURIComponent(script)}&fps=${fps}`;
  if (segment) url += `&segment=${encodeURIComponent(segment)}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--hide-scrollbars", "--force-color-profile=srgb", "--disable-gpu-vsync",
      "--disable-threaded-animation", "--disable-threaded-scrolling",
      "--disable-checker-imaging", "--mute-audio", "--no-sandbox",
      "--autoplay-policy=no-user-gesture-required",
      // Force the compositor to fully commit a frame on every virtual-time advance.
      // Without this, Page.captureScreenshot deadlocks (waits forever for a surface
      // frame that paused virtual time never produces) as soon as a compositor-promoted
      // animation is running — e.g. the GSAP ball-preloader intro in the "opening" test
      // clip (force3D / willChange layers). Symptom: render stuck at frame 1.
      "--run-all-compositor-stages-before-draw", "--disable-new-content-rendering-timeout",
    ],
  });
  const page = (await browser.pages())[0];
  await page.evaluateOnNewDocument(SEED_FN, script);
  await page.evaluateOnNewDocument(KILL_LR);
  if (durations) await page.evaluateOnNewDocument(INJECT_DURATIONS, durations);
  if (scriptObject) await page.evaluateOnNewDocument(INJECT_SCRIPT, scriptObject);
  if (segment) await page.evaluateOnNewDocument(INJECT_SEGMENT, segment);

  const client = await page.createCDPSession();
  await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, mobile: false, screenWidth: viewport.width, screenHeight: viewport.height });
  // Retry navigation: under heavy parallel load the dev server can briefly refuse a connection.
  let navErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { await page.goto(url, { waitUntil: "load", timeout: 60000 }); navErr = null; break; }
    catch (e) { navErr = e; await new Promise((r) => setTimeout(r, 1500)); }
  }
  if (navErr) { await browser.close(); throw navErr; }
  await page.waitForFunction("window.__render && window.__render.ready === true", { timeout: 90000 });
  const err = await page.evaluate(() => window.__render.error || null);
  if (err) { await browser.close(); throw new Error("render-mode setup failed: " + err); }

  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });

  async function advanceOneFrame() {
    const p = client.send("Emulation.setVirtualTimePolicy", {
      policy: "advance", budget: frameMs, maxVirtualTimeTaskStarvationCount: 100000,
    });
    await new Promise((res) => { client.once("Emulation.virtualTimeBudgetExpired", res); p.catch(() => {}); });
  }
  async function captureJpeg() {
    const { data } = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 100, fromSurface: true, captureBeyondViewport: false });
    return data;
  }
  const startFlow = () => page.evaluate(() => window.__render.start());
  const isDone = () => page.evaluate(() => window.__render.done === true);
  const getManifest = () => page.evaluate(() => window.__audioManifest || []);
  const getDurations = () => page.evaluate(() => window.__render.getDurations());

  return { browser, page, client, advanceOneFrame, captureJpeg, startFlow, isDone, getManifest, getDurations };
}
