// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 8 Regular.
//
// "Guess the Player Name" thumbnail. Bottom 75% shows ONE player photo:
//   • Large centered player photo (~500px tall, resolved via the same Ready
//     photo path resolver the runner uses on the pitch — careerReadyPhoto*).
//   • A giant question-mark sigil behind/over the photo and a soft silhouette
//     glow for the "mystery" feel.
//   • Two decorative chips bottom corners: club logo (left) + nationality
//     flag (right). Club resolved via getClubLogoUrl / getClubLogoOtherTeamsUrl;
//     flag via appState.flagcodes → flagcdn.com (or the local England asset).
//   • Background: red/yellow palette pool (different gradients/effects per roll).
//
// Top 25% banner + season badge + optional specific-title pill stays identical
// to the canonical Runner 1 framework — only RUNNER_CONFIG changes the titles
// and we replace the formation grid with a single-player layout.

import { appState, getState } from "./state.js";
import {
    projectAssetUrl,
    projectAssetUrlFresh,
    careerReadyPhotoClubName,
    careerReadyPhotoRelCandidatesForStem,
    careerReadyPhotoStemForVariant,
} from "./paths.js";
import { getClubLogoUrl, getClubLogoOtherTeamsUrl } from "./photo-helpers.js";

// ─── Per-runner config ─────────────────────────────────────────────────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS THE",
    titleYellow: "PLAYER NAME",
    seasonLabel: "2025/6",
};

// ─── Palette pool — Regenerate cycles one of these ─────────────────────────
// Red/yellow palette as requested. Banners stay red (same family as Runner 1)
// for visual consistency across the channel; the BOTTOM half cycles between
// red-leaning and yellow-leaning warm gradients so each roll looks different.
const PALETTES = [
    { banner: "#DC2626", bannerEdge: "#7F1D1D", bgTop: "#B91C1C", bgBot: "#3F0A0A", rays: "rgba(250,204,21,0.18)", glow: "rgba(250,204,21,0.55)" },
    { banner: "#B91C1C", bannerEdge: "#450A0A", bgTop: "#EAB308", bgBot: "#7C2D12", rays: "rgba(255,255,255,0.14)", glow: "rgba(255,237,87,0.65)" },
    { banner: "#EF4444", bannerEdge: "#991B1B", bgTop: "#F59E0B", bgBot: "#7F1D1D", rays: "rgba(255,255,255,0.18)", glow: "rgba(255,255,255,0.55)" },
    { banner: "#7F1D1D", bannerEdge: "#1F0606", bgTop: "#DC2626", bgBot: "#1F0606", rays: "rgba(250,204,21,0.22)", glow: "rgba(250,204,21,0.70)" },
    { banner: "#991B1B", bannerEdge: "#3F0A0A", bgTop: "#FACC15", bgBot: "#991B1B", rays: "rgba(255,255,255,0.10)", glow: "rgba(255,255,255,0.50)" },
];

// ─── Effect-variant pool — extra layers drawn behind the player photo ──────
const EFFECTS = [
    "rays-from-top",         // sunburst from top-center
    "rays-from-banner",      // sunburst from below the banner
    "vignette",              // dark vignette around the edges
    "diagonal-stripes",      // subtle diagonal stripes
    "spotlight-center",      // bright spotlight behind the player
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
        if (!lvl) continue;
        // Skip logo (0), landing (1), outro (last). A "question level" here is
        // any level with a careerPlayer assigned.
        if (i === 0) continue;
        if (i === 1) continue;
        if (i === levels.length - 1) continue;
        if (lvl.careerPlayer && lvl.careerPlayer.name) candidates.push(i);
    }
    if (candidates.length === 0) {
        // Fall back to whatever non-meta level exists — picks may still produce
        // a usable photo via careerHistory or current state.
        for (let i = 2; i < Math.max(2, levels.length - 1); i++) candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── Overlay DOM ───────────────────────────────────────────────────────────
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

// ─── Rendering ─────────────────────────────────────────────────────────────
const W = 1280;
const H = 720;
const BANNER_H = Math.round(H * 0.25);   // 180px
const BODY_TOP = BANNER_H;
const BODY_H = H - BANNER_H;             // 540px

async function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const palette = PALETTES[state.paletteIdx % PALETTES.length];
    const effect = EFFECTS[state.effectIdx % EFFECTS.length];

    ctx.clearRect(0, 0, W, H);
    drawBodyBackground(ctx, palette);
    drawEffectLayer(ctx, effect, palette);
    drawQuestionMarkSigil(ctx, palette);
    await drawPlayerPhoto(ctx, palette);
    await drawClubLogoChip(ctx);
    await drawFlagChip(ctx);
    drawBanner(ctx, palette);
    drawSeasonBadge(ctx);
    await drawSpecificTitle(ctx);
}

function drawBodyBackground(ctx, palette) {
    const grd = ctx.createLinearGradient(0, BODY_TOP, 0, H);
    grd.addColorStop(0, palette.bgTop);
    grd.addColorStop(1, palette.bgBot);
    ctx.fillStyle = grd;
    ctx.fillRect(0, BODY_TOP, W, BODY_H);

    // Bottom edge separator
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(0, H - 4, W, 4);
}

function drawEffectLayer(ctx, effect, palette) {
    ctx.save();
    if (effect === "rays-from-top" || effect === "rays-from-banner") {
        const cx = W / 2;
        const cy = effect === "rays-from-banner" ? BODY_TOP - 10 : 0;
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
        ctx.fillRect(0, BODY_TOP, W, BODY_H);
    } else if (effect === "diagonal-stripes") {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        const stripeW = 60;
        for (let x = -BODY_H; x < W + BODY_H; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, BODY_TOP);
            ctx.lineTo(x + stripeW, BODY_TOP);
            ctx.lineTo(x + stripeW + BODY_H, H);
            ctx.lineTo(x + BODY_H, H);
            ctx.closePath();
            ctx.fill();
        }
    } else if (effect === "spotlight-center") {
        const grd = ctx.createRadialGradient(W / 2, BODY_TOP + BODY_H / 2, 50, W / 2, BODY_TOP + BODY_H / 2, 600);
        grd.addColorStop(0, "rgba(255,255,255,0.22)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, BODY_TOP, W, BODY_H);
    }
    ctx.restore();
}

function drawQuestionMarkSigil(ctx, palette) {
    // Giant translucent "?" behind the player. Cycles position lightly with
    // the effect index so re-rolls don't look identical.
    ctx.save();
    const cx = W / 2;
    const cy = BODY_TOP + BODY_H / 2 + 20;

    // Soft glow halo behind the question mark / player
    const haloGrad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 360);
    haloGrad.addColorStop(0, palette.glow);
    haloGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haloGrad;
    ctx.fillRect(0, BODY_TOP, W, BODY_H);

    // Question mark, drawn as Impact text — large, faint, behind the photo.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.round(BODY_H * 1.05)}px Impact, "Anton", "Oswald", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.20)";
    ctx.strokeText("?", cx, cy);
    ctx.fillText("?", cx, cy);
    ctx.restore();
}

// ─── Player photo (single, centered) ───────────────────────────────────────
async function drawPlayerPhoto(ctx, palette) {
    const player = getPlayerForCurrentLevel();
    const photoUrl = player ? await resolvePlayerPhotoUrl(player) : "";
    const cx = W / 2;
    const photoH = 500;                       // ~target height (matches brief)
    const cy = BODY_TOP + BODY_H / 2 + 25;    // slightly below center for chin room

    if (!photoUrl) {
        // No photo → draw the silhouette glow only (still implies mystery).
        drawSilhouetteGlow(ctx, cx, cy, photoH, palette);
        return;
    }

    let img;
    try {
        img = await loadImage(photoUrl);
    } catch {
        drawSilhouetteGlow(ctx, cx, cy, photoH, palette);
        return;
    }

    // Draw an underlying silhouette glow so the photo's edges feel like they
    // are "emerging" from a mystery aura.
    drawSilhouetteGlow(ctx, cx, cy, photoH, palette);

    // Fit photo to the target height while preserving aspect ratio.
    const ratio = photoH / img.height;
    const drawW = img.width * ratio;
    const drawH = img.height * ratio;
    const dx = cx - drawW / 2;
    const dy = cy - drawH / 2;

    // Soft drop shadow behind the photo body
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();
}

function drawSilhouetteGlow(ctx, cx, cy, photoH, palette) {
    ctx.save();
    const w = photoH * 0.55;
    const h = photoH * 0.95;
    const grd = ctx.createRadialGradient(cx, cy, 20, cx, cy, h * 0.7);
    grd.addColorStop(0, palette.glow);
    grd.addColorStop(0.6, "rgba(0,0,0,0.35)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function getPlayerForCurrentLevel() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx;
    const lvl = idx >= 0 && idx < levels.length ? levels[idx] : null;
    if (lvl && lvl.careerPlayer && lvl.careerPlayer.name) return { ...lvl.careerPlayer, _level: lvl };
    // Fall back to the currently active level's state
    const active = getState();
    if (active?.careerPlayer?.name) return { ...active.careerPlayer, _level: active };
    return null;
}

async function resolvePlayerPhotoUrl(player) {
    const name = String(player?.name || "").trim();
    if (!name) return "";
    // Best-guess club for Ready photo folder lookup: prefer the level's
    // careerHistory (last meaningful), then the player JSON's `club` field.
    const lvl = player._level || {};
    const histClub = careerReadyPhotoClubName(lvl) || careerReadyPhotoClubName(getState() || {});
    const club = histClub || String(player.club || "").trim() || "";

    // Try a small variant range (most players use variant 1; the runner may
    // have generated 2..N via "Get photo"). Don't probe more than a few — the
    // canvas is generated on demand, not at startup.
    for (let v = 1; v <= 4; v++) {
        const stem = careerReadyPhotoStemForVariant(name, v);
        if (!stem) continue;
        for (const rel of careerReadyPhotoRelCandidatesForStem(name, club, stem)) {
            const url = projectAssetUrlFresh(rel);
            try {
                const img = await loadImage(url);
                if (img?.naturalWidth) return url;
            } catch { /* try next candidate */ }
        }
    }
    return "";
}

// ─── Club logo + nationality flag chips ────────────────────────────────────
async function drawClubLogoChip(ctx) {
    const player = getPlayerForCurrentLevel();
    if (!player) return;
    const lvl = player._level || {};
    const histClub = careerReadyPhotoClubName(lvl) || careerReadyPhotoClubName(getState() || {});
    const clubName = histClub || String(player.club || "").trim();
    if (!clubName) return;

    const url = getClubLogoUrl(clubName) || getClubLogoOtherTeamsUrl(clubName);
    if (!url) return;

    let img;
    try { img = await loadImage(url); }
    catch { return; }

    // Bottom-left chip — round badge with the logo.
    const r = 70;
    const cx = 100;
    const cy = H - 100;
    drawChipCircle(ctx, cx, cy, r, img);
}

async function drawFlagChip(ctx) {
    const player = getPlayerForCurrentLevel();
    if (!player) return;
    const nat = String(player.nationality || "").trim();
    if (!nat) return;
    const url = nationalityFlagUrl(nat);
    if (!url) return;

    let img;
    try { img = await loadImage(url); }
    catch { return; }

    // Bottom-right chip — round badge with the flag.
    const r = 70;
    const cx = W - 100;
    const cy = H - 100;
    drawChipCircle(ctx, cx, cy, r, img);
}

function nationalityFlagUrl(nat) {
    if (!nat) return "";
    if (nat === "England") {
        return projectAssetUrl("Images/Nationality/Europe/England.png");
    }
    const code = appState.flagcodes?.[nat];
    if (code) return `https://flagcdn.com/w320/${String(code).toLowerCase()}.png`;
    return "";
}

function drawChipCircle(ctx, cx, cy, r, img) {
    // White ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fill();
    ctx.restore();

    // Image clipped to circle (contain-fit to preserve the logo silhouette)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Background inside the chip — soft gray so the logo doesn't sit on pure white
    ctx.fillStyle = "#F3F4F6";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const pad = 6;
    const inner = r - pad;
    const ratio = Math.min((inner * 2) / img.width, (inner * 2) / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();

    // Outline ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.stroke();
    ctx.restore();
}

// ─── Banner (top 25%) + season + specific-title pill ───────────────────────
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
        a.download = `${title}-player-name-1280x720.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
}
