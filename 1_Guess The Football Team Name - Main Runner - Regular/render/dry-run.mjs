// render/dry-run.mjs — advance virtual time WITHOUT capturing, to verify the flow
// completes (fires window.__render.done) and report total frames + audio events.
// Fast: no screenshots. Usage: node dry-run.mjs --script "Champion League" --lang english
import puppeteer from "puppeteer";

function arg(name, def) { const a = process.argv; const i = a.indexOf(`--${name}`); return i >= 0 ? a[i + 1] : def; }
const SCRIPT = arg("script", "Champion League");
const LANG = arg("lang", "english");
const PORT = Number(arg("port", 8888));
const MAX = Number(arg("max", 60 * 60 * 12));
const RUNNER = "1_Guess The Football Team Name - Main Runner - Regular";
const FRAME_MS = 1000 / 60;

const SEED_FN = (s) => {
  function mk(x){let h=1779033703^x.length;for(let i=0;i<x.length;i++){h=Math.imul(h^x.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}let a=h>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  Math.random = mk(s); window.__RENDER_SEEDED__ = true;
};
const KILL_LR = () => { const R = window.EventSource; window.EventSource = function(u,o){ if(typeof u==="string"&&u.includes("__live-reload")) return {addEventListener(){},removeEventListener(){},close(){},onerror:null,onmessage:null,readyState:2}; return new R(u,o);}; };

const url = `http://127.0.0.1:${PORT}/${encodeURIComponent(RUNNER)}/index.html?render=1&lang=${LANG}&script=${encodeURIComponent(SCRIPT)}&fps=60`;
const browser = await puppeteer.launch({ headless: "new", args: ["--mute-audio","--no-sandbox","--autoplay-policy=no-user-gesture-required"] });
try {
  const page = (await browser.pages())[0];
  await page.evaluateOnNewDocument(SEED_FN, SCRIPT);
  await page.evaluateOnNewDocument(KILL_LR);
  const client = await page.createCDPSession();
  await client.send("Emulation.setDeviceMetricsOverride", { width: 2048, height: 1152, deviceScaleFactor: 1.25, mobile: false });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("window.__render && window.__render.ready === true", { timeout: 120000 });
  const err = await page.evaluate(() => window.__render.error || null);
  if (err) { console.log("SETUP ERROR:", err); }

  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await page.evaluate(() => window.__render.start());

  const t0 = Date.now();
  let n = 0, done = false;
  for (; n < MAX; n++) {
    const p = client.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: FRAME_MS, maxVirtualTimeTaskStarvationCount: 100000 });
    await new Promise((res) => { client.once("Emulation.virtualTimeBudgetExpired", res); p.catch(() => {}); });
    if (n % 120 === 0) { done = await page.evaluate(() => window.__render.done === true); if (done) break; }
  }
  // settle the last check
  if (!done) done = await page.evaluate(() => window.__render.done === true);
  const manifest = await page.evaluate(() => window.__audioManifest || []);
  const lastAudio = manifest.length ? Math.round(manifest[manifest.length - 1].atMs) : 0;
  console.log(JSON.stringify({
    done, frames: n, virtualSec: +(n / 60).toFixed(1), wallSec: +((Date.now() - t0) / 1000).toFixed(1),
    audioEvents: manifest.length, lastAudioMs: lastAudio,
  }));
} finally { await browser.close(); }
