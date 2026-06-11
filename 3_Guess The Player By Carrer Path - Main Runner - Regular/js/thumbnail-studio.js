// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 3 Regular.
//
// Opens a full-screen overlay with a canvas, a control rail (Regenerate, Specific
// title + icon, Download PNG, Back), and renders a static thumbnail composed of:
//   • Top 20% red banner (shared with all runners) + blue sunburst stage + centered
//     player photo + row of club crest squares (up to 6 steps) with year pills
//     and arrow connectors — matches the career-path reference layout.
//   • Uses the first quiz level's career player (not random).

import { appState } from "./state.js";
import {
    projectAssetUrl,
    careerReadyPhotoRelCandidates,
} from "./paths.js";
import { cleanCareerHistory, resolveCareerClubLogoUrls } from "./pitch-render.js";
import {
    THUMB_W,
    THUMB_H,
    STAGE_TOP,
    STAGE_H,
    ensureBannerFonts,
    drawThumbnailBanner,
} from "../../.Storage/shared/thumbnail/thumbnail-banner.js";
import {
    readThumbnailTheme,
    wireThumbnailThemeListeners,
    drawThumbnailStageBackground,
    getThumbnailStageArea,
} from "../../.Storage/shared/thumbnail/thumbnail-stage-background.js";

// ─── Per-runner config (everything that distinguishes this runner) ──────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS BY",
    titleYellow: "CAREER PATH",
    careerSteps: 6,
};

const CAREER_PATH_STAGE = "#0069EC";
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
    sourceLevelIdx: -1,
    specificTitle: "",
    customIconDataUrl: null,
};

let canvas = null;
let overlay = null;

// ─── Public API ────────────────────────────────────────────────────────────
export function initThumbnailStudio() {
    const btn = document.getElementById("btn-generate-thumbnail");
    if (!btn) return;
    btn.addEventListener("click", openStudio);
    wireThumbnailThemeListeners(() => {
        if (state.open) void render();
    });
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
    state.sourceLevelIdx = getFirstCareerLevelIdx();
}

function getFirstCareerLevelIdx() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        if (!lvl || lvl.isIntro || lvl.isOutro || lvl.isLogo || lvl.isBonus) continue;
        if (!lvl.careerPlayer?.name) continue;
        return i;
    }
    return -1;
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
const W = THUMB_W;
const H = THUMB_H;
const PITCH_TOP = STAGE_TOP;
const PITCH_H = STAGE_H;

async function render() {
    if (!canvas) return;
    await ensureBannerFonts();
    const ctx = canvas.getContext("2d");
    const theme = readThumbnailTheme();

    ctx.clearRect(0, 0, W, H);
    await drawThumbnailStageBackground(ctx, theme, getThumbnailStageArea());
    await drawCareerComposition(ctx);
    drawThumbnailBanner(ctx, RUNNER_CONFIG);
    await drawSpecificTitle(ctx);
}

// ─── Bottom-75% career composition ─────────────────────────────────────────
async function drawCareerComposition(ctx) {
    const { player, history } = collectCareerSourceForCurrentLevel();
    const cap = RUNNER_CONFIG.careerSteps;
    const steps = Array.isArray(history) && history.length > 0
        ? history.slice(Math.max(0, history.length - cap))
        : [];

    const count = steps.length;
    const FOOTER_BOTTOM = 22;
    const PILL_H = 30;
    const PILL_GAP = 12;
    const boxSize = count <= 4 ? 96 : count === 5 ? 88 : 80;
    const rowCY = H - FOOTER_BOTTOM - PILL_H - PILL_GAP - boxSize / 2;

    const photoBottom = rowCY - boxSize * 0.28;
    const photoTop = PITCH_TOP + 6;
    const photoBoxH = Math.max(220, photoBottom - photoTop);
    const photoBoxCX = W / 2;
    const photoBoxCY = (photoTop + photoBottom) / 2;

    await drawPlayerPhotoOrSilhouette(ctx, player, photoBoxCX, photoBoxCY, photoBoxH, photoBottom);
    await drawCareerSteps(ctx, steps, rowCY, boxSize);
}

function collectCareerSourceForCurrentLevel() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx;
    const lvl = idx >= 0 && idx < levels.length ? levels[idx] : null;
    if (!lvl) return { player: null, history: [], lvl: null };
    const player = lvl.careerPlayer || null;
    // Prefer the cleaned careerHistory the runner already prepared. Fall back
    // to the raw transfer_history if the level hasn't been initialized yet.
    let history = Array.isArray(lvl.careerHistory) ? lvl.careerHistory : null;
    if (!history || history.length === 0) {
        history = cleanCareerHistory(player?.transfer_history || []);
    }
    return { player, history, lvl };
}

async function drawPlayerPhotoOrSilhouette(ctx, player, cx, cy, boxH, alignBottomY) {
    const name = String(player?.name || "").trim();
    const sources = buildPlayerPhotoSources(player);

    let img = null;
    for (const src of sources) {
        try {
            img = await loadImage(src);
            if (img) break;
        } catch { /* try next */ }
    }

    if (img) {
        const maxH = boxH;
        const maxW = W * 0.78;
        const ratio = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = cx - w / 2;
        const y = alignBottomY - h;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
        return;
    }

    // Fallback: tinted silhouette placeholder + name in Impact below.
    const silW = Math.min(360, boxH * 0.78);
    const silH = boxH * 0.9;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, cx - silW / 2, cy - silH / 2, silW, silH, 28);
    ctx.fill();
    // Generic head + shoulders shape.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    const headR = silW * 0.20;
    const headCY = cy - silH * 0.18;
    ctx.beginPath();
    ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - silW * 0.42, cy + silH * 0.50);
    ctx.quadraticCurveTo(cx, cy - silH * 0.05, cx + silW * 0.42, cy + silH * 0.50);
    ctx.lineTo(cx + silW * 0.42, cy + silH * 0.50);
    ctx.lineTo(cx - silW * 0.42, cy + silH * 0.50);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (name) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const fontSize = 56;
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
        ctx.lineWidth = Math.max(3, fontSize * 0.08);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(name.toUpperCase(), cx, cy + silH / 2 + 8);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(name.toUpperCase(), cx, cy + silH / 2 + 8);
        ctx.restore();
    }
}

function buildPlayerPhotoSources(player) {
    const name = String(player?.name || "").trim();
    if (!name) return [];
    // Determine "current/last club" the same way the runner does — last
    // meaningful club in careerHistory (skips "Without club"). If we don't
    // have one, fall back to player.club, then a blank club (legacy flat path).
    const history = Array.isArray(player?.transfer_history) ? player.transfer_history : [];
    let lastClub = "";
    for (let i = history.length - 1; i >= 0; i--) {
        const c = String(history[i]?.club ?? "").trim();
        if (!c) continue;
        if (/without\s+club/i.test(c)) continue;
        lastClub = c;
        break;
    }
    if (!lastClub) lastClub = String(player?.club || "").trim();

    const seen = new Set();
    const urls = [];
    const push = (rel) => {
        if (!rel) return;
        const url = projectAssetUrl(rel);
        if (seen.has(url)) return;
        seen.add(url);
        urls.push(url);
    };
    // Variant 1 = base name, plus a couple of fallback variants in case the
    // sampled level uses a "{name} 2" save on disk.
    for (const v of [1, 2, 3]) {
        for (const rel of careerReadyPhotoRelCandidates(name, lastClub, v)) push(rel);
        // also try with an empty club (legacy flat path catch-all)
        for (const rel of careerReadyPhotoRelCandidates(name, "", v)) push(rel);
    }
    return urls;
}

async function drawCareerSteps(ctx, steps, rowCY, boxSize) {
    const count = Math.min(steps.length, RUNNER_CONFIG.careerSteps);
    if (count === 0) return;

    const pad = 48;
    const stepSpan = count === 1 ? 0 : (W - pad * 2 - boxSize) / (count - 1);

    for (let i = 0; i < count; i++) {
        const cx = count === 1 ? W / 2 : pad + boxSize / 2 + stepSpan * i;
        const step = steps[i] || {};
        await drawSingleCareerStep(ctx, cx, rowCY, boxSize, step);
        if (i < count - 1) {
            const nextCx = pad + boxSize / 2 + stepSpan * (i + 1);
            drawCareerArrow(ctx, cx + boxSize / 2, nextCx - boxSize / 2, rowCY);
        }
    }
}

function drawCareerArrow(ctx, x1, x2, y) {
    const cx = (x1 + x2) / 2;
    const r = 15;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
    ctx.fillStyle = "#000000";
    ctx.font = `900 20px Impact, "Anton", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(">", cx + 1, y + 1);
    ctx.restore();
}

async function drawSingleCareerStep(ctx, cx, cy, boxSize, step) {
    const clubName = String(step?.club || "").trim();
    const year = String(step?.year || "").trim();
    const half = boxSize / 2;
    const x = cx - half;
    const y = cy - half;
    const radius = 10;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y, boxSize, boxSize, radius);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000000";
    roundRect(ctx, x, y, boxSize, boxSize, radius);
    ctx.stroke();
    ctx.restore();

    const candidates = resolveCareerClubLogoUrls(clubName, step?.customImage);
    let logoImg = null;
    for (const src of candidates) {
        try {
            logoImg = await loadImage(src);
            if (logoImg) break;
        } catch { /* try next */ }
    }

    ctx.save();
    roundRect(ctx, x + 5, y + 5, boxSize - 10, boxSize - 10, Math.max(4, radius - 3));
    ctx.clip();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, boxSize, boxSize);
    if (logoImg) {
        const fitRatio = Math.min((boxSize - 14) / logoImg.width, (boxSize - 14) / logoImg.height);
        const w = logoImg.width * fitRatio;
        const h = logoImg.height * fitRatio;
        ctx.drawImage(logoImg, cx - w / 2, cy - h / 2, w, h);
    } else {
        const label = clubInitialsLabel(clubName);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontSize = Math.round(boxSize * 0.28);
        ctx.font = `900 ${fontSize}px Impact, "Anton", sans-serif`;
        ctx.fillStyle = "#1f2937";
        ctx.fillText(label, cx, cy);
    }
    ctx.restore();

    if (year) {
        ctx.save();
        ctx.font = `900 22px Impact, "Anton", sans-serif`;
        const pillW = Math.max(54, ctx.measureText(year).width + 22);
        const pillH = 30;
        const pillX = cx - pillW / 2;
        const pillY = cy + half + 12;
        roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fillStyle = "#000000";
        ctx.fill();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(year, cx, pillY + pillH / 2);
        ctx.restore();
    }
}

function clubInitialsLabel(clubName) {
    const n = String(clubName || "").trim();
    if (!n) return "?";
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
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
