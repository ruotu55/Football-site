// render/speedtest.mjs — measure per-frame capture cost: PNG vs JPEG, at 2560x1440.
import puppeteer from "puppeteer";

function arg(n, d) { const a = process.argv; const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; }
const PORT = Number(arg("port", 8888));
const N = Number(arg("frames", 150));
const RUNNER = "1_Guess The Football Team Name - Main Runner - Regular";
const FRAME_MS = 1000 / 60;
const url = `http://127.0.0.1:${PORT}/${encodeURIComponent(RUNNER)}/index.html?render=1&lang=english&script=${encodeURIComponent("Champion League")}&fps=60`;

const KILL_LR = () => { const R = window.EventSource; window.EventSource = function(u,o){ if(typeof u==="string"&&u.includes("__live-reload")) return {addEventListener(){},removeEventListener(){},close(){},onerror:null,onmessage:null,readyState:2}; return new R(u,o);}; };

const browser = await puppeteer.launch({ headless: "new", args: ["--mute-audio","--no-sandbox","--autoplay-policy=no-user-gesture-required","--hide-scrollbars","--force-color-profile=srgb"] });
try {
  const page = (await browser.pages())[0];
  await page.evaluateOnNewDocument(KILL_LR);
  const client = await page.createCDPSession();
  await client.send("Emulation.setDeviceMetricsOverride", { width: 2048, height: 1152, deviceScaleFactor: 1.25, mobile: false });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("window.__render && window.__render.ready === true", { timeout: 120000 });
  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await page.evaluate(() => window.__render.start());

  async function adv() { const p = client.send("Emulation.setVirtualTimePolicy", { policy:"advance", budget:FRAME_MS, maxVirtualTimeTaskStarvationCount:100000 }); await new Promise(r=>{client.once("Emulation.virtualTimeBudgetExpired",r);p.catch(()=>{});}); }

  for (const opt of [
    { label: "PNG", params: { format: "png", fromSurface: true, captureBeyondViewport: false } },
    { label: "JPEG q100", params: { format: "jpeg", quality: 100, fromSurface: true, captureBeyondViewport: false } },
    { label: "JPEG q92", params: { format: "jpeg", quality: 92, fromSurface: true, captureBeyondViewport: false } },
  ]) {
    let bytes = 0; const t0 = Date.now();
    for (let i = 0; i < N; i++) { await adv(); const { data } = await client.send("Page.captureScreenshot", opt.params); bytes += data.length; }
    const sec = (Date.now() - t0) / 1000;
    console.log(`${opt.label.padEnd(10)} ${(N/sec).toFixed(1)} fps  | est 42480-frame render: ${(42480/(N/sec)/60).toFixed(0)} min  | avg ${(bytes/N/1024).toFixed(0)} KB/frame`);
  }
} finally { await browser.close(); }
