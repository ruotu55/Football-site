// render/capture-scene.mjs — drive the real play flow headlessly and capture the visible
// DOM as individual transparent-PNG layers (+ audio manifest), then emit scene.json for
// build-capcut.mjs. Reuses the render harness (lib.mjs) + the running dev server.
import { launchRenderPage, RUNNER, CSS_H, CSS_W } from "./lib.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RUNNER_DIR = process.cwd().includes(RUNNER) ? process.cwd() : join(process.cwd(), RUNNER);
const REPO_ROOT = resolve(RUNNER_DIR, "..");
const CANVAS_W = 1920, CANVAS_H = 1080;
const DSF = CANVAS_H / CSS_H; // CSS(1728x972) px -> canvas(1920x1080) px

/** Resolve a recording-status BLOCK's script snapshot by its display name. */
export function resolveBlockScript(name, repoRoot = REPO_ROOT) {
  const rs = JSON.parse(readFileSync(join(repoRoot, ".Storage", "storage", "recording-status.json"), "utf8"));
  for (const [key, b] of Object.entries(rs.blocks || {})) {
    if (String(b.name || "").trim() === String(name).trim()) {
      const script = (b.videoStatus && b.videoStatus.frozenScript) || b.script;
      if (!script) throw new Error(`block "${name}" (${key}) has no script snapshot`);
      return { key, script };
    }
  }
  throw new Error(`no recording-status block named "${name}"`);
}

// Capture one element to a transparent PNG (only its subtree visible, page bg cleared).
async function capturePng(r, sel, idx, outDir, name) {
  const rect = await r.page.evaluate(({ sel, idx }) => {
    const els = document.querySelectorAll(sel);
    const el = idx == null ? els[0] : els[idx];
    if (!el) return null;
    const rb = el.getBoundingClientRect();
    if (rb.width < 2 || rb.height < 2) return null;
    const de = document.documentElement;
    de.dataset.capBg = de.style.background || ""; document.body.dataset.capBg = document.body.style.background || "";
    document.body.dataset.capVis = document.body.style.visibility || "";
    document.body.style.visibility = "hidden";
    de.style.background = "transparent"; document.body.style.background = "transparent";
    el.style.visibility = "visible";
    return { x: rb.x, y: rb.y, w: rb.width, h: rb.height };
  }, { sel, idx });
  if (!rect) return null;
  await r.client.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const shot = await r.client.send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: DSF },
  });
  const file = join(outDir, "assets", name + ".png");
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  await r.page.evaluate(({ sel, idx }) => {
    const els = document.querySelectorAll(sel);
    const el = idx == null ? els[0] : els[idx];
    if (el) el.style.visibility = "";
    document.body.style.visibility = document.body.dataset.capVis || "";
    document.documentElement.style.background = document.documentElement.dataset.capBg || "";
    document.body.style.background = document.body.dataset.capBg || "";
  }, { sel, idx });
  await r.client.send("Emulation.setDefaultBackgroundColorOverride");
  return {
    png: file.replace(/\\/g, "/"),
    pngW: Math.round(rect.w * DSF), pngH: Math.round(rect.h * DSF),
    rect: { x: rect.x * DSF, y: rect.y * DSF, w: rect.w * DSF, h: rect.h * DSF },
  };
}

// Capture the page background as a full-canvas PNG (hide the foreground content containers).
async function captureBackground(r, outDir, name) {
  await r.page.evaluate(() => {
    const hide = [".pitch-wrap", "#countdown-timer", ".team-header", "#landing-page", "#outro-page",
      ".side-text", "#pitch-slots"];
    window.__capHidden = [];
    for (const s of hide) for (const el of document.querySelectorAll(s)) {
      window.__capHidden.push([el, el.style.visibility]); el.style.visibility = "hidden";
    }
  });
  const shot = await r.client.send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: CSS_W, height: CSS_H, scale: DSF },
  });
  const file = join(outDir, "assets", name + ".png");
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  await r.page.evaluate(() => {
    for (const [el, v] of (window.__capHidden || [])) el.style.visibility = v;
    window.__capHidden = [];
  });
  return { png: file.replace(/\\/g, "/"), pngW: CANVAS_W, pngH: CANVAS_H, rect: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H } };
}

/** Capture the QUESTION phase (background + pitch lines + 11 circle fronts + countdown). */
export async function captureScene({ script: name, lang = "english", port = 8888, outDir, questionFrame = 48, durMs = 3000 }) {
  outDir = resolve(outDir); // CapCut needs ABSOLUTE asset paths in the draft
  mkdirSync(join(outDir, "assets"), { recursive: true });
  const { key, script } = resolveBlockScript(name);
  const r = await launchRenderPage({ script: name, scriptObject: script, lang, port, segment: "level-playing", fps: 30, height: CANVAS_H });
  const layers = [];
  try {
    await r.startFlow();
    for (let i = 0; i < questionFrame; i++) await r.advanceOneFrame();
    const info = await r.page.evaluate(() => ({
      slots: document.querySelectorAll(".player-slot").length,
      flipped: document.querySelectorAll(".slot-inner.flipped").length,
    }));

    let z = 0;
    const push = (id, kind, cap, extra = {}) => { if (cap) layers.push({ id, kind, z: z++, appearMs: 0, disappearMs: durMs, ...cap, ...extra }); };
    push("bg", "image", await captureBackground(r, outDir, "bg"));
    push("pitch", "image", await capturePng(r, "#pitch-svg", null, outDir, "pitch"));
    for (let i = 0; i < info.slots; i++) push("slot" + i, "image", await capturePng(r, ".player-slot", i, outDir, "slot-front-" + i));
    push("countdown", "image", await capturePng(r, "#countdown-timer", null, outDir, "countdown"));

    const manifest = await r.getManifest();
    const scene = { name: "EUROPA_QUESTION", canvas: { w: CANVAS_W, h: CANVAS_H }, fps: 30, durationMs: durMs, block: key,
      layers, audio: [] };
    writeFileSync(join(outDir, "scene.json"), JSON.stringify(scene, null, 2));
    return { key, layers: layers.length, flipped: info.flipped, manifestEvents: manifest.length };
  } finally {
    await r.browser.close();
  }
}

// CLI: node render/capture-scene.mjs "<save>" <outDir>
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const name = process.argv[2] || "Europa League";
  const outDir = process.argv[3] || join(RUNNER_DIR, "render/capcut/out/europa");
  const res = await captureScene({ script: name, outDir });
  console.log("CAPTURED block=" + res.key + " layers=" + res.layers + " (flipped=" + res.flipped + ")");
}
