// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 9 Regular (MCQ).
//
// Static thumbnail mirroring the in-quiz MCQ layout:
//   • Top 25% red banner — "GUESS THE FOOTBALL QUIZ" (yellow accent).
//   • Bottom 75% stage with the first quiz level's MCQ question:
//       - "trivia"        → topic image (left) + three A/B/C text answer pills (right)
//       - "which-player"  → three player photo cards with letter badges
//   • Optional secondary title pill + competition icon.

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { getMcq, localized } from "./mcq-mode.js";
import {
    THUMB_W,
    THUMB_H,
    STAGE_TOP,
    STAGE_H,
    ensureBannerFonts,
    drawThumbnailBanner,
} from "../../.Storage/shared/thumbnail/thumbnail-banner.js";

const RUNNER_CONFIG = {
    titleWhite: "GUESS THE",
    titleYellow: "FOOTBALL QUIZ",
};

const PALETTES = [
    { banner: "#DC2626", bannerEdge: "#7F1D1D", stage: "#1E3A8A", stageEdge: "#0B1437", rays: "rgba(180,200,255,0.10)" },
    { banner: "#B91C1C", bannerEdge: "#450A0A", stage: "#3730A3", stageEdge: "#1E1B4B", rays: "rgba(255,255,255,0.10)" },
    { banner: "#EF4444", bannerEdge: "#991B1B", stage: "#4338CA", stageEdge: "#1E1B4B", rays: "rgba(200,160,255,0.12)" },
    { banner: "#991B1B", bannerEdge: "#3F0A0A", stage: "#2563EB", stageEdge: "#0B1437", rays: "rgba(255,210,120,0.08)" },
    { banner: "#7F1D1D", bannerEdge: "#1F0606", stage: "#5B21B6", stageEdge: "#2E1065", rays: "rgba(255,255,255,0.10)" },
];

const EFFECTS = [
    "rays-from-top",
    "rays-from-banner",
    "vignette",
    "diagonal-stripes",
    "spotlight-center",
];

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

const state = {
    open: false,
    paletteIdx: 0,
    effectIdx: 0,
    sourceLevelIdx: -1,
    specificTitle: "",
    customIconDataUrl: null,
};

let canvas = null;
let overlay = null;

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
    state.sourceLevelIdx = pickRandomMcqLevelIdx();
}

function isQuestionLevel(lvl) {
    return !!(lvl && !lvl.isIntro && !lvl.isOutro && !lvl.isLogo && !lvl.isBonus);
}

function levelHasMcq(lvl) {
    const mcq = lvl?.mcq;
    return !!(mcq && Array.isArray(mcq.answers) && mcq.answers.length > 0);
}

function pickFirstMcqLevelIdx() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    for (let i = 0; i < levels.length; i++) {
        if (!isQuestionLevel(levels[i])) continue;
        if (levelHasMcq(levels[i])) return i;
    }
    return -1;
}

function pickRandomMcqLevelIdx() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const candidates = [];
    for (let i = 0; i < levels.length; i++) {
        if (!isQuestionLevel(levels[i])) continue;
        if (levelHasMcq(levels[i])) candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function getCurrentLevel() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx >= 0 ? state.sourceLevelIdx : pickFirstMcqLevelIdx();
    return idx >= 0 && idx < levels.length ? levels[idx] : null;
}

function getCurrentMcq() {
    const lvl = getCurrentLevel();
    return lvl ? getMcq(lvl) : null;
}

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

const W = THUMB_W;
const H = THUMB_H;
const PANEL_TOP = STAGE_TOP;
const PANEL_H = STAGE_H;
const THUMB_LANG = "english";

async function render() {
    if (!canvas) return;
    await ensureBannerFonts();
    const ctx = canvas.getContext("2d");
    const palette = PALETTES[state.paletteIdx % PALETTES.length];
    const effect = EFFECTS[state.effectIdx % EFFECTS.length];

    ctx.clearRect(0, 0, W, H);
    drawPanelBackground(ctx, palette);
    drawEffectLayer(ctx, effect, palette);
    await drawMcqComposition(ctx);
    drawThumbnailBanner(ctx, RUNNER_CONFIG);
    await drawSpecificTitle(ctx);
}

function drawPanelBackground(ctx, palette) {
    const grd = ctx.createRadialGradient(
        W / 2, PANEL_TOP + PANEL_H * 0.5, 80,
        W / 2, PANEL_TOP + PANEL_H * 0.5, Math.max(W, PANEL_H),
    );
    grd.addColorStop(0, palette.stage);
    grd.addColorStop(1, palette.stageEdge);
    ctx.fillStyle = grd;
    ctx.fillRect(0, PANEL_TOP, W, PANEL_H);
}

function drawEffectLayer(ctx, effect, palette) {
    ctx.save();
    if (effect === "rays-from-top" || effect === "rays-from-banner") {
        const cx = W / 2;
        const cy = effect === "rays-from-banner" ? PANEL_TOP - 10 : 0;
        const rayCount = 18;
        ctx.fillStyle = palette.rays;
        for (let i = 0; i < rayCount; i++) {
            const a1 = (i / rayCount) * Math.PI * 2;
            const a2 = ((i + 0.5) / rayCount) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a1) * 1600, cy + Math.sin(a1) * 1600);
            ctx.lineTo(cx + Math.cos(a2) * 1600, cy + Math.sin(a2) * 1600);
            ctx.closePath();
            ctx.fill();
        }
    } else if (effect === "vignette") {
        const grd = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, W * 0.75);
        grd.addColorStop(0, "rgba(0,0,0,0)");
        grd.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, PANEL_TOP, W, PANEL_H);
    } else if (effect === "diagonal-stripes") {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        const stripeW = 60;
        for (let x = -PANEL_H; x < W + PANEL_H; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, PANEL_TOP);
            ctx.lineTo(x + stripeW, PANEL_TOP);
            ctx.lineTo(x + stripeW + PANEL_H, H);
            ctx.lineTo(x + PANEL_H, H);
            ctx.closePath();
            ctx.fill();
        }
    } else if (effect === "spotlight-center") {
        const grd = ctx.createRadialGradient(W / 2, PANEL_TOP + PANEL_H * 0.45, 50, W / 2, PANEL_TOP + PANEL_H * 0.45, 600);
        grd.addColorStop(0, "rgba(255,255,255,0.22)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, PANEL_TOP, W, PANEL_H);
    }
    ctx.restore();
}

async function drawMcqComposition(ctx) {
    const mcq = getCurrentMcq();
    if (!mcq) {
        drawMcqEmpty(ctx);
        return;
    }

    const qText = (localized(mcq.questionText, THUMB_LANG) || "WHO IS IT?").toUpperCase();
    const qBottom = drawMcqQuestionText(ctx, qText, W / 2, PANEL_TOP + 28, W - 120);

    if (mcq.questionType === "which-player") {
        await drawMcqPlayerCards(ctx, mcq, qBottom + 16);
    } else {
        await drawMcqTrivia(ctx, mcq, qBottom + 16);
    }
}

function drawMcqEmpty(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 36px Impact, "Anton", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("LOAD A SAVE WITH MCQ QUESTIONS", W / 2, PANEL_TOP + PANEL_H / 2);
    ctx.restore();
}

function drawMcqQuestionText(ctx, text, cx, topY, maxW) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#FFFFFF";
    ctx.lineJoin = "round";

    let fontSize = 52;
    let lines = wrapText(ctx, text, maxW, fontSize);
    while (fontSize > 28 && lines.some((ln) => {
        ctx.font = `900 ${fontSize}px Impact, "Anton", sans-serif`;
        return ctx.measureText(ln).width > maxW;
    })) {
        fontSize -= 2;
        lines = wrapText(ctx, text, maxW, fontSize);
    }
    ctx.font = `900 ${fontSize}px Impact, "Anton", sans-serif`;

    const lineH = fontSize * 1.08;
    let y = topY;
    for (const line of lines) {
        ctx.lineWidth = Math.max(3, fontSize * 0.07);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeText(line, cx, y);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(line, cx, y);
        y += lineH;
    }
    ctx.restore();
    return y;
}

function wrapText(ctx, text, maxW, fontSize) {
    ctx.font = `900 ${fontSize}px Impact, "Anton", sans-serif`;
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
        const test = `${line} ${words[i]}`;
        if (ctx.measureText(test).width <= maxW) line = test;
        else {
            lines.push(line);
            line = words[i];
        }
    }
    lines.push(line);
    return lines.slice(0, 3);
}

async function drawMcqTrivia(ctx, mcq, bodyTop) {
    const bodyH = H - bodyTop - 90;
    const gap = 36;
    const topicW = Math.round(W * 0.44);
    const topicH = Math.min(bodyH - 20, Math.round(topicW * 11 / 16));
    const topicX = 50;
    const topicY = bodyTop + (bodyH - topicH) / 2;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, topicX, topicY, topicW, topicH, 26);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, topicX, topicY, topicW, topicH, 26);
    ctx.stroke();
    ctx.restore();

    if (mcq.topicImage) {
        try {
            const img = await loadImage(projectAssetUrl(String(mcq.topicImage).replace(/^\.?\/+/, "")));
            ctx.save();
            roundRect(ctx, topicX + 6, topicY + 6, topicW - 12, topicH - 12, 20);
            ctx.clip();
            const ratio = Math.max((topicW - 12) / img.width, (topicH - 12) / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            ctx.drawImage(img, topicX + (topicW - w) / 2, topicY + (topicH - h) / 2, w, h);
            ctx.restore();
        } catch { /* empty topic card */ }
    }

    const answers = Array.isArray(mcq.answers) ? mcq.answers : [];
    const ansX = topicX + topicW + gap;
    const ansW = W - ansX - 50;
    const rowGap = 18;
    const rowH = Math.floor((bodyH - rowGap * (answers.length - 1)) / Math.max(1, answers.length));

    for (let i = 0; i < answers.length; i++) {
        const ans = answers[i];
        const y = bodyTop + i * (rowH + rowGap);
        drawMcqAnswerRow(
            ctx,
            String(ans?.id || "?"),
            (localized(ans?.text, THUMB_LANG) || "").toUpperCase(),
            ansX,
            y,
            ansW,
            rowH,
        );
    }
}

function drawMcqAnswerRow(ctx, letter, text, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    const badgeR = Math.min(h * 0.38, 36);
    const badgeCX = x + 24 + badgeR;
    const badgeCY = y + h / 2;
    const badgeGrd = ctx.createRadialGradient(badgeCX - badgeR * 0.3, badgeCY - badgeR * 0.3, 2, badgeCX, badgeCY, badgeR);
    badgeGrd.addColorStop(0, "#FFD66B");
    badgeGrd.addColorStop(1, "#E8A13A");
    ctx.beginPath();
    ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = badgeGrd;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.round(badgeR * 0.95)}px Impact, "Anton", sans-serif`;
    ctx.fillStyle = "#7A0E37";
    ctx.fillText(letter, badgeCX, badgeCY + 1);

    const textX = badgeCX + badgeR + 18;
    const textMaxW = x + w - textX - 16;
    let fontSize = Math.round(h * 0.42);
    ctx.textAlign = "left";
    do {
        ctx.font = `900 ${fontSize}px Impact, "Anton", sans-serif`;
        if (ctx.measureText(text).width <= textMaxW) break;
        fontSize -= 2;
    } while (fontSize > 14);
    ctx.fillStyle = "#15151C";
    ctx.fillText(text, textX, y + h / 2 + 1);
}

async function drawMcqPlayerCards(ctx, mcq, bodyTop) {
    const answers = Array.isArray(mcq.answers) ? mcq.answers : [];
    const count = Math.max(1, answers.length);
    const bodyH = H - bodyTop - 90;
    const gap = 28;
    const cardW = Math.floor((W - 100 - gap * (count - 1)) / count);
    const cardH = Math.min(bodyH - 10, Math.round(cardW * 1.35));
    const startX = (W - (cardW * count + gap * (count - 1))) / 2;
    const cardY = bodyTop + (bodyH - cardH) / 2;

    for (let i = 0; i < count; i++) {
        const ans = answers[i] || {};
        const x = startX + i * (cardW + gap);
        await drawMcqPlayerCard(
            ctx,
            String(ans.id || "?"),
            (localized(ans.text, THUMB_LANG) || "").toUpperCase(),
            ans.photoPath,
            x,
            cardY,
            cardW,
            cardH,
        );
    }
}

async function drawMcqPlayerCard(ctx, letter, name, photoPath, x, y, w, h) {
    const nameH = Math.max(44, Math.round(h * 0.16));
    const photoH = h - nameH;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, w, h, 24);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    const badgeR = 28;
    const badgeCX = x + 8 + badgeR;
    const badgeCY = y + 8 + badgeR;
    const badgeGrd = ctx.createRadialGradient(badgeCX - 8, badgeCY - 8, 2, badgeCX, badgeCY, badgeR);
    badgeGrd.addColorStop(0, "#FF6B6B");
    badgeGrd.addColorStop(1, "#C2185B");
    ctx.beginPath();
    ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = badgeGrd;
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 26px Impact, "Anton", sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(letter, badgeCX, badgeCY + 1);

    ctx.save();
    roundRect(ctx, x, y, w, photoH, 24);
    ctx.clip();
    const photoGrd = ctx.createLinearGradient(x, y, x, y + photoH);
    photoGrd.addColorStop(0, "#E9EDF2");
    photoGrd.addColorStop(1, "#C9D2DC");
    ctx.fillStyle = photoGrd;
    ctx.fillRect(x, y, w, photoH);

    if (photoPath) {
        try {
            const img = await loadImage(projectAssetUrl(String(photoPath).replace(/^\.?\/+/, "")));
            const ratio = Math.max(w / img.width, photoH / img.height);
            const iw = img.width * ratio;
            const ih = img.height * ratio;
            ctx.drawImage(img, x + (w - iw) / 2, y + photoH - ih, iw, ih);
        } catch { /* gradient fallback */ }
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y + photoH, w, nameH);
    let fontSize = Math.round(nameH * 0.46);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    do {
        ctx.font = `900 ${fontSize}px Impact, "Anton", sans-serif`;
        if (ctx.measureText(name).width <= w - 16) break;
        fontSize -= 2;
    } while (fontSize > 12);
    ctx.fillStyle = "#15151C";
    ctx.fillText(name, x + w / 2, y + photoH + nameH / 2 + 1);
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
    ctx.font = `900 ${subFontSize}px Impact, "Anton", sans-serif`;
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
