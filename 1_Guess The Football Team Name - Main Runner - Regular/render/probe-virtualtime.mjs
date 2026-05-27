// Probe: does Emulation.setVirtualTimePolicy advance CSS transitions + rAF, and can we
// screenshot deterministically between budget advances? Phase 0 de-risk.
import puppeteer from "puppeteer";
import { createHash } from "node:crypto";

const html = `<!doctype html><html><head><style>
  html,body{margin:0;background:#111}
  #box{position:absolute;left:0;top:50px;width:80px;height:80px;background:#e33;
       transition:left 1s linear, transform 1s linear}
  #box.go{left:520px; transform:rotate(180deg)}
  #raf{position:absolute;top:200px;width:40px;height:40px;background:#3e3}
</style></head><body>
  <div id="box"></div><div id="raf"></div>
  <script>
    // rAF-driven motion (like GSAP's ticker)
    let t0=null;
    function loop(ts){ if(t0===null)t0=ts; const dt=(ts-t0)/1000;
      document.getElementById('raf').style.left=(dt*200)+'px';
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    // trigger CSS transition shortly after load
    setTimeout(()=>document.getElementById('box').classList.add('go'), 50);
    window.__ready=true;
  </script>
</body></html>`;

const browser = await puppeteer.launch({ headless: "new", args: ["--hide-scrollbars","--force-color-profile=srgb"] });
const page = (await browser.pages())[0];
const client = await page.createCDPSession();
await client.send("Emulation.setDeviceMetricsOverride", { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(html), { waitUntil: "load" });
await page.waitForFunction("window.__ready===true");

const FRAME_MS = 1000/60;
async function step() {
  const p = client.send("Emulation.setVirtualTimePolicy", { policy:"advance", budget:FRAME_MS, maxVirtualTimeTaskStarvationCount:100000 });
  await new Promise((res)=>{ client.once("Emulation.virtualTimeBudgetExpired", res); p.catch(()=>{}); });
}
async function shot() {
  const { data } = await client.send("Page.captureScreenshot", { format:"png", fromSurface:true, captureBeyondViewport:false });
  return data;
}

await client.send("Emulation.setVirtualTimePolicy", { policy:"pause" });

const hashes = [];
const samples = {};
for (let n=0;n<60;n++){            // 1 second of virtual time
  await step();
  const png = await shot();
  hashes.push(createHash("sha1").update(png,"base64").digest("hex").slice(0,8));
  if (n===5||n===30||n===59) samples[n]=png;
}
await browser.close();

const distinct = new Set(hashes).size;
console.log("frames:", hashes.length, "distinct:", distinct);
console.log("first 10 hashes:", hashes.slice(0,10).join(" "));
console.log("VERDICT:", distinct > 30 ? "ANIMATION ADVANCES ✓" : "FROZEN/INSUFFICIENT ✗");
