// render/capture-scene.mjs — drive the real play flow headlessly and capture the visible
// DOM as individual transparent-PNG layers (images) + editable text + the audio manifest,
// across the intro / question / reveal / ending phases, then emit scene.json for
// build-capcut.mjs. Reuses the render harness (lib.mjs) + the running dev server.
import { launchRenderPage, RUNNER, CSS_H, CSS_W } from "./lib.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RUNNER_DIR = process.cwd().includes(RUNNER) ? process.cwd() : join(process.cwd(), RUNNER);
const REPO_ROOT = resolve(RUNNER_DIR, "..");
const CANVAS_W = 1920, CANVAS_H = 1080;
const DSF = CANVAS_H / CSS_H; // CSS(1728x972) px -> canvas(1920x1080) px

// Phase durations on the stitched timeline (ms). Approximate; user fine-tunes in CapCut.
const PHASE = { introMs: 6000, questionMs: 3000, revealMs: 4000, endingMs: 6000 };

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

async function capturePng(r, sel, idx, outDir, name, opts = {}) {
  const rect = await r.page.evaluate(({ sel, idx, forceOpacity, forceColor }) => {
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
    // some decor elements (side text) are intentionally low-opacity on the site; force
    // full opacity so they're visible as standalone CapCut layers.
    if (forceOpacity != null) { el.dataset.capOp = el.style.opacity || ""; el.style.opacity = String(forceOpacity); }
    if (forceColor) { el.style.color = forceColor; el.style.webkitTextFillColor = forceColor; el.style.textShadow = "none"; }
    return { x: rb.x, y: rb.y, w: rb.width, h: rb.height };
  }, { sel, idx, forceOpacity: opts.forceOpacity ?? null, forceColor: opts.forceColor ?? null });
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
    if (el) { el.style.visibility = ""; if ("capOp" in el.dataset) { el.style.opacity = el.dataset.capOp; delete el.dataset.capOp; } }
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

async function captureBackground(r, outDir, name) {
  await r.page.evaluate(() => {
    const hide = [".pitch-wrap", "#countdown-timer", ".team-header", "#landing-page", "#outro-page", ".side-text", "#pitch-slots"];
    window.__capHidden = [];
    for (const s of hide) for (const el of document.querySelectorAll(s)) { window.__capHidden.push([el, el.style.visibility]); el.style.visibility = "hidden"; }
  });
  const shot = await r.client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: CSS_W, height: CSS_H, scale: DSF } });
  const file = join(outDir, "assets", name + ".png");
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  await r.page.evaluate(() => { for (const [el, v] of (window.__capHidden || [])) el.style.visibility = v; window.__capHidden = []; });
  return { png: file.replace(/\\/g, "/"), pngW: CANVAS_W, pngH: CANVAS_H, rect: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H } };
}

// Read an element as editable text: detect the rendered line breaks (so a wrapped title
// becomes multi-line), font px (canvas space), colour, weight.
async function captureText(r, sel, idx) {
  const d = await r.page.evaluate(({ sel, idx }) => {
    const els = document.querySelectorAll(sel);
    const el = idx == null ? els[0] : els[idx];
    if (!el) return null;
    const rb = el.getBoundingClientRect();
    if (rb.width < 2 || rb.height < 2) return null;
    // reconstruct visual line breaks by tracking each word's top via Range rects
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let lines = [], cur = "", curTop = null, any = false, node;
    while ((node = walker.nextNode())) {
      const s = node.nodeValue; if (!s) continue;
      const toks = s.split(/(\s+)/); let off = 0;
      for (const tok of toks) {
        if (tok.length === 0) continue;
        if (/^\s+$/.test(tok)) { cur += tok; off += tok.length; continue; }
        range.setStart(node, off); range.setEnd(node, off + tok.length);
        const rects = range.getClientRects(); const rr = rects[rects.length - 1];
        off += tok.length;
        if (!rr) { cur += tok; continue; }
        any = true;
        if (curTop === null) curTop = rr.top;
        if (rr.top - curTop > 4) { lines.push(cur.trim()); cur = ""; curTop = rr.top; }
        cur += tok;
      }
    }
    if (cur.trim()) lines.push(cur.trim());
    const text = (any ? lines.join("\n") : (el.innerText || el.textContent || "")).trim();
    if (!text) return null;
    const cs = getComputedStyle(el);
    const rgb = (cs.color.match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number);
    const hex = "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    return { text, x: rb.x, y: rb.y, w: rb.width, h: rb.height, sizePx: parseFloat(cs.fontSize) || 40, color: hex, align: cs.textAlign, weight: parseInt(cs.fontWeight) || 700 };
  }, { sel, idx });
  if (!d) return null;
  return { text: d.text, rect: { x: d.x * DSF, y: d.y * DSF, w: d.w * DSF, h: d.h * DSF }, font: { sizePxCanvas: d.sizePx * DSF, color: d.color, align: d.align, weight: d.weight } };
}

// CapCut text "size" unit per on-screen pixel (calibrated; tune if text comes out off).
const CAPSIZE_PX = 5.6;

// Advance until predicate true (polled in-page) or cap frames.
async function advanceUntil(r, predicateFn, cap = 600) {
  for (let i = 0; i < cap; i++) {
    await r.advanceOneFrame();
    if (await r.page.evaluate(predicateFn)) return i;
  }
  return -1;
}

// Map a segment's audio manifest (phase-local atMs) to global voice/stinger layers.
function audioFromManifest(manifest, durations, startMs) {
  const out = [];
  for (const e of manifest) {
    if (e.type !== "play" || !e.src) continue;
    if (e.kind === "bgm") continue; // bgm handled globally
    const durMs = (durations && durations[e.src]) ? durations[e.src] : (e.kind === "voice" ? 3000 : 800);
    out.push({ kind: e.kind || "voice", src: resolveSrc(e.src), atMs: Math.round(startMs + (e.atMs || 0)), durMs: Math.round(durMs), volume: e.volume ?? 1 });
  }
  return out;
}
function resolveSrc(src) {
  // manifest srcs are page-relative ("/.Storage/..." or "../.Storage/...") -> absolute repo path
  let p = String(src).replace(/^\.\.\//, "/").replace(/^\/+/, "");
  p = decodeURIComponent(p);
  return join(REPO_ROOT, p).replace(/\\/g, "/");
}

export async function captureFullScene({ script: name, lang = "english", port = 8888, outDir, draftName = "EUROPA_FULL" }) {
  outDir = resolve(outDir);
  mkdirSync(join(outDir, "assets"), { recursive: true });
  const { key, script } = resolveBlockScript(name);
  const launch = (segment) => launchRenderPage({ script: name, scriptObject: script, lang, port, segment, fps: 30, height: CANVAS_H });

  const layers = [];
  let audio = [];
  let z = 0;
  const add = (cap, kind, appearMs, disappearMs, idPrefix, extra = {}) => { if (cap) layers.push({ id: idPrefix, kind, z: z++, appearMs, disappearMs, ...cap, ...extra }); };
  // editable text layer: capSize derived from the on-screen px * a visual multiplier
  const addText = (cap, mul, appearMs, disappearMs, idPrefix, weight) => {
    if (!cap) return;
    const capSize = Math.max(5, Math.round((cap.font.sizePxCanvas || 60) * (mul || 1) / CAPSIZE_PX));
    layers.push({ id: idPrefix, kind: "text", z: z++, appearMs, disappearMs, text: cap.text, rect: cap.rect,
      font: { capSize, color: cap.font.color, weight: weight || cap.font.weight } });
  };

  const introStart = 0;
  const qStart = PHASE.introMs;
  const revealStart = qStart + PHASE.questionMs;
  const endStart = revealStart + PHASE.revealMs;
  const totalMs = endStart + PHASE.endingMs;

  // ---- INTRO ----
  {
    const r = await launch("intro");
    try {
      await r.startFlow();
      await advanceUntil(r, () => !!document.querySelector("#landing-page:not([hidden]) #landing-title"), 300);
      for (let i = 0; i < 30; i++) await r.advanceOneFrame(); // let the scale-in settle
      add(await captureBackground(r, outDir, "intro-bg"), "image", introStart, qStart, "intro-bg");
      // The whole title+subtitle("2025/6 SEASON")+badge live in .landing-motion-group and
      // float together on the site -> capture as ONE unit, scaled up + flagged to float.
      add(await capturePng(r, ".side-text.left", null, outDir, "intro-side", { forceOpacity: 1, forceColor: "#FFFFFF" }), "image", introStart, qStart, "intro-side", { scaleMul: 2.2 });
      // badge stays an image (it's a styled pill/graphic, not plain text)
      add(await capturePng(r, ".landing-questions-line", null, outDir, "intro-badge"), "image", introStart, qStart, "intro-badge", { scaleMul: 2.1 });
      // title + season as EDITABLE text (Barlow Condensed), enlarged to match the design
      addText(await captureText(r, "#landing-title", null), 2.1, introStart, qStart, "intro-title", 900);
      addText(await captureText(r, ".landing-subtitle", null), 2.1, introStart, qStart, "intro-season", 700);
      audio = audio.concat(audioFromManifest(await r.getManifest(), await r.getDurations(), introStart));
    } finally { await r.browser.close(); }
  }

  // ---- QUESTION + REVEAL (one level-playing run) ----
  {
    const r = await launch("level-playing");
    try {
      await r.startFlow();
      for (let i = 0; i < 48; i++) await r.advanceOneFrame(); // mid-countdown
      const slots = await r.page.evaluate(() => document.querySelectorAll(".player-slot").length);
      // bg + pitch span question+reveal
      add(await captureBackground(r, outDir, "q-bg"), "image", qStart, endStart, "q-bg");
      add(await capturePng(r, "#pitch-svg", null, outDir, "q-pitch"), "image", qStart, endStart, "q-pitch");
      // capture the avatar CIRCLE only (not the whole slot) so the player-name chip is a
      // separate editable text layer, and question/reveal circles share the same geometry.
      for (let i = 0; i < slots; i++) add(await capturePng(r, ".player-slot .slot-front .slot-avatar", i, outDir, "q-front-" + i), "image", qStart, revealStart, "q-front-" + i);
      add(await capturePng(r, "#countdown-timer", null, outDir, "q-countdown"), "image", qStart, revealStart, "q-countdown");
      // advance past the flip into the reveal
      await advanceUntil(r, () => document.querySelectorAll(".slot-inner.flipped").length > 0, 200);
      for (let i = 0; i < 24; i++) await r.advanceOneFrame(); // let flip + sidebar finish
      for (let i = 0; i < slots; i++) {
        add(await capturePng(r, ".player-slot .slot-back .slot-avatar", i, outDir, "r-back-" + i), "image", revealStart, endStart, "r-back-" + i);
        addText(await captureText(r, ".slot-name", i), 1.25, revealStart, endStart, "r-name-" + i, 700);
      }
      add(await capturePng(r, "#team-header-logo", null, outDir, "r-logo"), "image", revealStart, endStart, "r-logo");
      add(await capturePng(r, "#team-header-flag", null, outDir, "r-flag"), "image", revealStart, endStart, "r-flag");
      addText(await captureText(r, "#team-header-name", null), 1.25, revealStart, endStart, "r-teamname", 700);
      audio = audio.concat(audioFromManifest(await r.getManifest(), await r.getDurations(), qStart));
    } finally { await r.browser.close(); }
  }

  // ---- ENDING ----
  {
    const r = await launch("ending");
    try {
      await r.startFlow();
      const got = await advanceUntil(r, () => !!document.querySelector("#outro-page:not([hidden]) #outro-title"), 900);
      if (got >= 0) {
        for (let i = 0; i < 10; i++) await r.advanceOneFrame();
        add(await captureBackground(r, outDir, "end-bg"), "image", endStart, totalMs, "end-bg");
        add(await capturePng(r, ".logo-img-anim", null, outDir, "end-logo"), "image", endStart, totalMs, "end-logo");
        const acts = await r.page.evaluate(() => document.querySelectorAll(".outro-action, .outro-action-bottom").length);
        for (let i = 0; i < acts; i++) add(await capturePng(r, ".outro-action, .outro-action-bottom", i, outDir, "end-emoji-" + i), "image", endStart, totalMs, "end-emoji-" + i);
        addText(await captureText(r, "#outro-title", null), 1.25, endStart, totalMs, "end-title", 900);
        addText(await captureText(r, "#outro-subtitle", null), 1.25, endStart, totalMs, "end-subtitle", 700);
      }
      audio = audio.concat(audioFromManifest(await r.getManifest(), await r.getDurations(), endStart));
    } finally { await r.browser.close(); }
  }

  const scene = { name: draftName, canvas: { w: CANVAS_W, h: CANVAS_H }, fps: 30, durationMs: totalMs, block: key, layers, audio };
  writeFileSync(join(outDir, "scene.json"), JSON.stringify(scene, null, 2));
  const counts = layers.reduce((m, l) => (m[l.kind] = (m[l.kind] || 0) + 1, m), {});
  return { key, layers: layers.length, counts, audio: audio.length, totalMs };
}

// CLI: node render/capture-scene.mjs "<save>" <outDir> [draftName]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const name = process.argv[2] || "Europa League";
  const outDir = process.argv[3] || join(RUNNER_DIR, "render/capcut/out/europa");
  const draftName = process.argv[4] || "EUROPA_FULL";
  const res = await captureFullScene({ script: name, outDir, draftName });
  console.log("CAPTURED block=" + res.key + " layers=" + res.layers + " " + JSON.stringify(res.counts) + " audio=" + res.audio + " totalMs=" + res.totalMs);
}
