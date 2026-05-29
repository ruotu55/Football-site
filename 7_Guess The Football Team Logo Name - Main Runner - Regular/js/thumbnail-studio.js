// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 7 Regular
// ("Guess the Football Team Logo").
//
// Opens a full-screen overlay with a canvas, a control rail (Regenerate, Specific
// title + icon, Download PNG, Back), and renders a static thumbnail composed of:
//   • Top 25% red banner with "GUESS THE TEAM LOGO" (yellow accent on the
//     last two words), Impact font.
//   • "2025/6" season badge (vertical, top-right corner).
//   • Bottom 75% dark-navy / black mystery panel with a giant centered team logo
//     (~500px tall), a "?" watermark behind, partial vignette + glow.
//   • Optional secondary title bar (e.g. "Champion League") with auto-resolved
//     icon from Images/Icons/specific-title/ — or user-dropped custom icon.
//
// Regenerate cycles random palette + effect variant + which save's level the
// team logo is sampled from. The composition stays static — no animation,
// no DOM dependencies in the rendered canvas (so toBlob → PNG is clean).

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

// ─── Per-runner config (everything that distinguishes this runner) ──────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS THE",
    titleYellow: "TEAM LOGO",
    seasonLabel: "2025/6",
};

// ─── Palette pool — Regenerate cycles one of these ──────────────────────────
// Dark navy / black backdrop with neon accent rings — "guess the logo" mystery vibe.
const PALETTES = [
    { banner: "#DC2626", bannerEdge: "#7F1D1D", bgTop: "#0B1020", bgBottom: "#02040A", neon: "#22D3EE",  ringAlpha: 0.18 },
    { banner: "#B91C1C", bannerEdge: "#450A0A", bgTop: "#0A0F1E", bgBottom: "#01030A", neon: "#A855F7",  ringAlpha: 0.20 },
    { banner: "#EF4444", bannerEdge: "#991B1B", bgTop: "#0C1226", bgBottom: "#050816", neon: "#F472B6",  ringAlpha: 0.16 },
    { banner: "#7F1D1D", bannerEdge: "#1F0606", bgTop: "#080C18", bgBottom: "#000000", neon: "#FACC15",  ringAlpha: 0.22 },
    { banner: "#991B1B", bannerEdge: "#3F0A0A", bgTop: "#0F1530", bgBottom: "#02030C", neon: "#34D399",  ringAlpha: 0.18 },
];

// ─── Effect-variant pool — extra layers drawn behind the giant logo ────────
const EFFECTS = [
    "neon-rings",            // concentric neon rings behind logo
    "vignette",              // dark vignette around the edges
    "spotlight-center",      // bright spotlight halo behind the logo
    "diagonal-stripes",      // subtle diagonal stripes
    "question-grid",         // grid of faint "?" watermarks
];

// ─── Known competition icons (auto-resolved from secondary title text) ─────
const KNOWN_ICONS = {
    "champion league":         "Images/Icons/specific-title/Champions League.png",
    "champions league":        "Images/Icons/specific-title/Champions League.png",
    "uefa champions league":   "Images/Icons/specific-title/Champions League.png",
    "europa league":           "Images/Icons/specific-title/Europa League.png",
    "uefa europa league":      "Images/Icons/specific-title/Europa League.png",
    "conference league":       "Images/Icons/specific-title/Conference League.png",
    "uefa conference league":  "Images/Icons/specific-title/Conference League.png",
    "premier league":          "Images/Icons/specific-title/Premier League.png",
    "la liga":                 "Images/Icons/specific-title/La Liga.png",
    "serie a":                 "Images/Icons/specific-title/Seria A.png",
    "seria a":                 "Images/Icons/specific-title/Seria A.png",
    "bundesliga":              "Images/Icons/specific-title/Bundesliga.png",
    "ligue 1":                 "Images/Icons/specific-title/Ligue 1.png",
    "world cup":               "Images/Icons/specific-title/World Cup 2026.png",
    "fifa world cup":          "Images/Icons/specific-title/World Cup 2026.png",
    "world cup 2026":          "Images/Icons/specific-title/World Cup 2026.png",
};

function resolveIconPath(title) {
    const key = String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
    return KNOWN_ICONS[key] || null;
}

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
    open: false,
    paletteIdx: 0,
    effectIdx: 0,
    sourceLevelIdx: -1,        // index into appState.levelsData; -1 = pick fresh
    specificTitle: "",
    customIconDataUrl: null,   // dropped by the user; takes precedence over auto-resolved
};

let canvas = null;
let overlay = null;

// ─── Public API ────────────────────────────────────────────────────────────
export function initThumbnailStudio() {
    const btn = document.getElementById("btn-generate-thumbnail");
    if (!btn) return;
    btn.addEventListener("click", openStudio);
}

function openStudio() {
    if (state.open) return;
    state.open = true;
    rollRandom();
    buildOverlay();
    void render();
}

function closeStudio() {
    state.open = false;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    canvas = null;
}

function rollRandom() {
    state.paletteIdx = Math.floor(Math.random() * PALETTES.length);
    state.effectIdx = Math.floor(Math.random() * EFFECTS.length);
    state.sourceLevelIdx = pickRandomQuestionLevelIdx();
}

function pickRandomQuestionLevelIdx() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const candidates = [];
    for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        if (!lvl || lvl.isIntro || lvl.isOutro || lvl.isLogo || lvl.isBonus) continue;
        if (!getTeamLogoRelPath(lvl)) continue;
        candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function getTeamLogoRelPath(lvl) {
    const sq = lvl?.currentSquad;
    if (!sq) return null;
    if (typeof sq.imagePath === "string" && sq.imagePath.trim()) return sq.imagePath.trim();
    return null;
}

// ─── Overlay DOM ──────────────────────────────────────────────────────────
function buildOverlay() {
    overlay = document.createElement("div");
    overlay.className = "ts-overlay";
    overlay.innerHTML = `
        <div class="ts-stage">
            <canvas class="ts-canvas" width="1280" height="720"></canvas>
        </div>
        <aside class="ts-rail">
            <h2 class="ts-title">Thumbnail Studio</h2>
            <button type="button" class="ts-btn ts-btn--primary" data-act="regenerate">Regenerate visuals</button>
            <label class="ts-field">
                <span>Specific title (optional)</span>
                <input type="text" class="ts-input" data-field="specificTitle" placeholder="e.g. Champion League" />
            </label>
            <div class="ts-icon-row">
                <div class="ts-icon-status" data-role="icon-status">No icon</div>
                <label class="ts-drop">
                    <span>Drop custom icon</span>
                    <input type="file" accept="image/*" class="ts-file" data-field="customIcon" />
                </label>
                <button type="button" class="ts-btn ts-btn--small" data-act="clear-icon">Clear icon</button>
            </div>
            <button type="button" class="ts-btn ts-btn--accent" data-act="download">Download PNG</button>
            <button type="button" class="ts-btn ts-btn--ghost" data-act="back">Back</button>
        </aside>
    `;
    document.body.appendChild(overlay);
    canvas = overlay.querySelector(".ts-canvas");

    overlay.addEventListener("click", (e) => {
        const act = e.target?.dataset?.act;
        if (act === "regenerate") { rollRandom(); void render(); }
        else if (act === "back") closeStudio();
        else if (act === "download") downloadPng();
        else if (act === "clear-icon") { state.customIconDataUrl = null; void render(); }
    });

    const titleInput = overlay.querySelector('[data-field="specificTitle"]');
    titleInput.addEventListener("input", (e) => {
        state.specificTitle = e.target.value;
        void render();
    });

    const fileInput = overlay.querySelector('[data-field="customIcon"]');
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            state.customIconDataUrl = String(reader.result || "");
            void render();
        };
        reader.readAsDataURL(file);
    });
}

function updateIconStatus(text) {
    if (!overlay) return;
    const el = overlay.querySelector('[data-role="icon-status"]');
    if (el) el.textContent = text;
}

// ─── Rendering ────────────────────────────────────────────────────────────
const W = 1280;
const H = 720;
const BANNER_H = Math.round(H * 0.25);   // 180px
const STAGE_TOP = BANNER_H;
const STAGE_H = H - BANNER_H;            // 540px

async function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const palette = PALETTES[state.paletteIdx % PALETTES.length];
    const effect = EFFECTS[state.effectIdx % EFFECTS.length];

    ctx.clearRect(0, 0, W, H);
    drawStageBackground(ctx, palette);
    drawEffectLayer(ctx, effect, palette);
    drawQuestionWatermark(ctx, palette);
    await drawGiantTeamLogo(ctx, palette);
    drawStageVignette(ctx);
    drawBanner(ctx, palette);
    drawSeasonBadge(ctx);
    await drawSpecificTitle(ctx);
}

function drawStageBackground(ctx, palette) {
    const grd = ctx.createLinearGradient(0, STAGE_TOP, 0, H);
    grd.addColorStop(0, palette.bgTop);
    grd.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = grd;
    ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
}

function drawEffectLayer(ctx, effect, palette) {
    ctx.save();
    const cx = W / 2;
    const cy = STAGE_TOP + STAGE_H / 2;
    if (effect === "neon-rings") {
        // Concentric neon rings centered on the logo position.
        ctx.lineWidth = 6;
        for (let i = 1; i <= 6; i++) {
            const r = 110 + i * 60;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(palette.neon, palette.ringAlpha * (1 - i * 0.10));
            ctx.stroke();
        }
        // Bright halo behind logo
        const grd = ctx.createRadialGradient(cx, cy, 40, cx, cy, 360);
        grd.addColorStop(0, hexToRgba(palette.neon, 0.28));
        grd.addColorStop(1, hexToRgba(palette.neon, 0));
        ctx.fillStyle = grd;
        ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
    } else if (effect === "vignette") {
        const grd = ctx.createRadialGradient(cx, cy, 150, cx, cy, W * 0.7);
        grd.addColorStop(0, "rgba(0,0,0,0)");
        grd.addColorStop(1, "rgba(0,0,0,0.70)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
    } else if (effect === "spotlight-center") {
        const grd = ctx.createRadialGradient(cx, cy, 30, cx, cy, 600);
        grd.addColorStop(0, hexToRgba(palette.neon, 0.30));
        grd.addColorStop(0.5, hexToRgba(palette.neon, 0.08));
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
    } else if (effect === "diagonal-stripes") {
        ctx.fillStyle = hexToRgba(palette.neon, 0.05);
        const stripeW = 60;
        for (let x = -STAGE_H; x < W + STAGE_H; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, STAGE_TOP);
            ctx.lineTo(x + stripeW, STAGE_TOP);
            ctx.lineTo(x + stripeW + STAGE_H, H);
            ctx.lineTo(x + STAGE_H, H);
            ctx.closePath();
            ctx.fill();
        }
        // Add a subtle spotlight on top so the logo still pops.
        const grd = ctx.createRadialGradient(cx, cy, 30, cx, cy, 500);
        grd.addColorStop(0, hexToRgba(palette.neon, 0.18));
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
    } else if (effect === "question-grid") {
        // Faint "?" watermarks scattered across the stage.
        ctx.save();
        ctx.font = `900 110px Impact, "Anton", "Oswald", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = hexToRgba(palette.neon, 0.07);
        const stepX = 140;
        const stepY = 140;
        let row = 0;
        for (let y = STAGE_TOP + 30; y < H; y += stepY) {
            const offset = row % 2 === 0 ? 0 : stepX / 2;
            for (let x = -stepX; x < W + stepX; x += stepX) {
                ctx.fillText("?", x + offset, y);
            }
            row++;
        }
        ctx.restore();
        // Soft halo at center.
        const grd = ctx.createRadialGradient(cx, cy, 60, cx, cy, 500);
        grd.addColorStop(0, hexToRgba(palette.neon, 0.18));
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
    }
    ctx.restore();
}

function drawQuestionWatermark(ctx, palette) {
    // Giant "?" sitting behind the logo as a mystery cue. Drawn for every effect
    // (question-grid already adds scatter, but the central giant ? still helps).
    ctx.save();
    const cx = W / 2;
    const cy = STAGE_TOP + STAGE_H / 2 + 20;
    const fontPx = 520;
    ctx.font = `900 ${fontPx}px Impact, "Anton", "Oswald", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 14;
    ctx.strokeStyle = hexToRgba(palette.neon, 0.20);
    ctx.strokeText("?", cx, cy);
    ctx.fillStyle = hexToRgba("#FFFFFF", 0.04);
    ctx.fillText("?", cx, cy);
    ctx.restore();
}

async function drawGiantTeamLogo(ctx, palette) {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx;
    const lvl = idx >= 0 && idx < levels.length ? levels[idx] : null;
    const relPath = getTeamLogoRelPath(lvl);
    if (!relPath) return;

    let img;
    try {
        img = await loadImage(projectAssetUrl(relPath));
    } catch { return; }

    const cx = W / 2;
    const cy = STAGE_TOP + STAGE_H / 2;
    const maxH = 500;
    const maxW = 720;
    const ratio = Math.min(maxH / img.height, maxW / img.width);
    const w = img.width * ratio;
    const h = img.height * ratio;

    // Glow behind the logo to make it pop off the dark background.
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(w, h) * 0.75);
    glow.addColorStop(0, hexToRgba(palette.neon, 0.45));
    glow.addColorStop(0.5, hexToRgba(palette.neon, 0.15));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
    ctx.restore();

    // Draw logo with a soft drop shadow.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
}

function drawStageVignette(ctx) {
    // Slight darkening at the edges + bottom to lift the centered logo.
    ctx.save();
    const grd = ctx.createRadialGradient(W / 2, STAGE_TOP + STAGE_H / 2, STAGE_H * 0.35, W / 2, STAGE_TOP + STAGE_H / 2, W * 0.65);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, STAGE_TOP, W, STAGE_H);
    ctx.restore();
}

function drawBanner(ctx, palette) {
    const grd = ctx.createLinearGradient(0, 0, 0, BANNER_H);
    grd.addColorStop(0, palette.banner);
    grd.addColorStop(1, palette.bannerEdge);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, BANNER_H);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, BANNER_H - 6, W, 6);

    drawImpactTitle(
        ctx,
        RUNNER_CONFIG.titleWhite,
        RUNNER_CONFIG.titleYellow,
        W / 2,
        BANNER_H / 2,
        BANNER_H - 30,
        W - 180,
    );
}

function drawImpactTitle(ctx, white, yellow, cx, cy, maxH, maxW) {
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    const fullText = `${white} ${yellow}`;
    let fontSize = maxH;
    let measured;
    do {
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
        measured = ctx.measureText(fullText);
        if (measured.width <= maxW) break;
        fontSize -= 4;
    } while (fontSize > 24);

    const totalW = measured.width;
    const startX = cx - totalW / 2;

    const strokeAndFill = (text, x, fillColor) => {
        ctx.lineWidth = Math.max(4, fontSize * 0.08);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(text, x, cy);
        ctx.fillStyle = fillColor;
        ctx.fillText(text, x, cy);
    };
    strokeAndFill(white, startX, "#FFFFFF");
    strokeAndFill(" " + yellow, startX + ctx.measureText(white).width, "#FACC15");

    ctx.restore();
}

function drawSeasonBadge(ctx) {
    ctx.save();
    ctx.translate(W - 50, BANNER_H / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.round(BANNER_H * 0.45)}px Impact, "Anton", "Oswald", sans-serif`;
    ctx.lineWidth = Math.max(3, BANNER_H * 0.03);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(RUNNER_CONFIG.seasonLabel, 0, 0);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(RUNNER_CONFIG.seasonLabel, 0, 0);
    ctx.restore();
}

async function drawSpecificTitle(ctx) {
    const title = (state.specificTitle || "").trim();
    if (!title) { updateIconStatus("No icon"); return; }

    let iconSrc = null;
    if (state.customIconDataUrl) {
        iconSrc = state.customIconDataUrl;
        updateIconStatus("Using custom icon");
    } else {
        const known = resolveIconPath(title);
        if (known) {
            iconSrc = projectAssetUrl(known);
            updateIconStatus("Auto-resolved from project icons");
        } else {
            updateIconStatus("No matching icon — drop a custom one if needed");
        }
    }

    const padX = 36;
    const padY = 24;
    const subFontSize = 60;
    ctx.save();
    ctx.font = `900 ${subFontSize}px Impact, "Anton", "Oswald", sans-serif`;
    const textW = ctx.measureText(title.toUpperCase()).width;
    let iconImg = null;
    try {
        if (iconSrc) iconImg = await loadImage(iconSrc);
    } catch { iconImg = null; }
    const iconBoxH = subFontSize + padY * 2 - 16;
    const iconBoxW = iconImg ? iconBoxH : 0;
    const gap = iconImg ? 24 : 0;
    const pillW = textW + iconBoxW + gap + padX * 2;
    const pillH = subFontSize + padY * 2;
    const pillY = H - pillH - 28;
    const pillX = (W - pillW) / 2;

    ctx.fillStyle = "rgba(0,0,0,0.78)";
    roundRect(ctx, pillX, pillY, pillW, pillH, 20);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#FACC15";
    roundRect(ctx, pillX, pillY, pillW, pillH, 20);
    ctx.stroke();

    if (iconImg) {
        const ix = pillX + padX;
        const iy = pillY + (pillH - iconBoxH) / 2;
        const ratio = Math.min(iconBoxW / iconImg.width, iconBoxH / iconImg.height);
        const w = iconImg.width * ratio;
        const h = iconImg.height * ratio;
        ctx.drawImage(iconImg, ix + (iconBoxW - w) / 2, iy + (iconBoxH - h) / 2, w, h);
    }

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.lineWidth = Math.max(3, subFontSize * 0.06);
    ctx.strokeStyle = "#000000";
    const tx = pillX + padX + (iconImg ? iconBoxW + gap : 0);
    const ty = pillY + pillH / 2;
    ctx.strokeText(title.toUpperCase(), tx, ty);
    ctx.fillStyle = "#FACC15";
    ctx.fillText(title.toUpperCase(), tx, ty);
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
    const s = String(hex || "").trim();
    if (s.startsWith("rgba") || s.startsWith("rgb")) return s; // pass-through
    let h = s.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Image loading helper ──────────────────────────────────────────────────
const imageCache = new Map();
function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const p = new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image load failed: " + src));
        img.src = src;
    });
    imageCache.set(src, p);
    return p;
}

// ─── Export ────────────────────────────────────────────────────────────────
function downloadPng() {
    if (!canvas) return;
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const title = (state.specificTitle || "thumbnail").trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "thumbnail";
        a.download = `${title}-1280x720.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
}
