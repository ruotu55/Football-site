// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 1 Regular.
//
// Opens a full-screen overlay with a canvas, a control rail (Regenerate, Specific
// title + icon, Download PNG, Back), and renders a static thumbnail composed of:
//   • Top 20% red banner with "GUESS THE FOOTBALL TEAM" (yellow accent on the
//     last two words), Anton/Impact display font.
//   • Bottom area mirrors video mode: live background theme + perspective pitch + flags.
//   • First quiz level nationality flags on a fixed 4-3-3 formation layout.
//
// Regenerate re-renders from the current theme / level 1 (static background; no animation).

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { formationById } from "./formations.js";
import {
    getCompetitionPatternTileDataUri,
    getCompetitionThemeById,
} from "../../.Storage/shared/backgrounds/background-theme.js";

// ─── Per-runner config (everything that distinguishes this runner) ──────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS THE",
    titleYellow: "FOOTBALL TEAM",
};

// Fallback when theme dropdowns / CSS vars are unavailable.
const DEFAULT_THEME = {
    stageColor: "#2E7D32",
    effectId: "youtube-thumbnails",
    opacityPercent: 0.5,
};

const THEME_COLOR_BY_ID = {
    "quiz-club-by-nat": "#2E7D32",
    "quiz-nat-by-club": "#1B5E20",
    "quiz-career-path": "#0069EC",
    "quiz-career-stats": "#AB47BC",
    "quiz-four-params": "#5C6BC0",
    "quiz-fake-info": "#E57373",
    "quiz-football-mcq": "#C2185B",
    "extra-soft-green": "#81C784",
};

// Fixed bright red for the title bar — same on every regenerate (pitch/effects still vary).
const BANNER_RED = "#FF0000";

// ─── Known competition icons (auto-resolved from secondary title text) ─────
//
// Keys are lowercased, whitespace-collapsed competition names. Values are
// project-asset paths under Images/Icons/specific-title/ that we know exist
// in this repo (see saved-scripts.js SPECIFIC_TITLE_ICON_PATH_MAP).
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
    wireThumbnailThemeListeners();
}

function wireThumbnailThemeListeners() {
    for (const id of [
        "in-competition-background",
        "in-background-color",
        "in-background-effect",
        "in-background-opacity",
    ]) {
        const el = document.getElementById(id);
        if (!el || el.dataset.tsThemeWired) continue;
        el.dataset.tsThemeWired = "1";
        el.addEventListener("change", () => {
            if (state.open) void render();
        });
    }
}

function openStudio() {
    if (state.open) return;
    state.open = true;
    buildOverlay();
    void render();
}

function closeStudio() {
    state.open = false;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    canvas = null;
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
        if (act === "regenerate") { void render(); }
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

let bannerFontsReady = null;

const BANNER_FONT_FAMILY = '"Anton", Impact, "Arial Black", sans-serif';

function ensureBannerFonts() {
    if (bannerFontsReady) return bannerFontsReady;
    bannerFontsReady = (async () => {
        if (!document.getElementById("ts-banner-fonts")) {
            const link = document.createElement("link");
            link.id = "ts-banner-fonts";
            link.rel = "stylesheet";
            link.href = "https://fonts.googleapis.com/css2?family=Anton&display=swap";
            document.head.appendChild(link);
        }
        try {
            await Promise.all([
                document.fonts.load('400 120px "Anton"'),
                document.fonts.load('900 120px Impact'),
            ]);
        } catch { /* fall back to system bold */ }
    })();
    return bannerFontsReady;
}

// Title fills the red bar as large as possible (word gaps + outlines included).
const BANNER_TITLE_VERT_MARGIN = 8;

function setBannerTitleFont(ctx, fontSize) {
    ctx.font = `400 ${fontSize}px ${BANNER_FONT_FAMILY}`;
    ctx.letterSpacing = `${Math.max(2, Math.round(fontSize * 0.04))}px`;
    if ("fontKerning" in ctx) ctx.fontKerning = "normal";
    if ("textRendering" in ctx) ctx.textRendering = "geometricPrecision";
}

function bannerTitleWords() {
    return [
        ...RUNNER_CONFIG.titleWhite.split(/\s+/).map((text) => ({ text, fill: "#FFFFFF" })),
        ...RUNNER_CONFIG.titleYellow.split(/\s+/).map((text) => ({ text, fill: "#FACC15" })),
    ];
}

/** Black outline thickness (px) — used for layout + crisp fill-based outline draw. */
function titleOutlinePx(fontSize) {
    return Math.max(4, Math.round(fontSize * 0.075));
}

function measureTitleMetrics(ctx, fontSize) {
    setBannerTitleFont(ctx, fontSize);
    const m = ctx.measureText("FOOTBALL");
    const ascent = m.actualBoundingBoxAscent || fontSize * 0.72;
    const descent = m.actualBoundingBoxDescent || fontSize * 0.18;
    return { ascent, descent, textH: ascent + descent };
}

function titleTotalHeight(ctx, fontSize) {
    const { textH } = measureTitleMetrics(ctx, fontSize);
    return textH + titleOutlinePx(fontSize) * 2;
}

function bannerTitleBaselineY(ctx, bannerH, fontSize) {
    const { ascent, textH } = measureTitleMetrics(ctx, fontSize);
    const outline = titleOutlinePx(fontSize);
    const totalH = textH + outline * 2;
    const top = (bannerH - totalH) / 2;
    return top + outline + ascent;
}

function measureBannerTitleWords(ctx, words, wordGap) {
    let total = 0;
    for (let i = 0; i < words.length; i++) {
        if (i > 0) total += wordGap;
        total += ctx.measureText(words[i].text).width;
    }
    return total;
}

function findBannerTitleFontSize(ctx, words, bannerH, maxW) {
    const maxBlockH = bannerH - BANNER_TITLE_VERT_MARGIN * 2;
    let lo = 28;
    let hi = bannerH;
    while (lo < hi) {
        const fontSize = Math.ceil((lo + hi) / 2);
        setBannerTitleFont(ctx, fontSize);
        const wordGap = Math.round(fontSize * 0.14);
        const fitsVert = titleTotalHeight(ctx, fontSize) <= maxBlockH;
        const fitsHoriz = measureBannerTitleWords(ctx, words, wordGap) <= maxW;
        if (fitsVert && fitsHoriz) lo = fontSize;
        else hi = fontSize - 1;
    }
    setBannerTitleFont(ctx, lo);
    return lo;
}

function layoutBannerTitleWords(ctx, words, wordGap, cx, cy) {
    const totalW = measureBannerTitleWords(ctx, words, wordGap);
    let x = cx - totalW / 2;
    const baselineY = Math.round(cy);
    return words.map((word, i) => {
        const pos = { text: word.text, fill: word.fill, x: Math.round(x), y: baselineY };
        x += ctx.measureText(word.text).width;
        if (i < words.length - 1) x += wordGap;
        return pos;
    });
}

/** Crisp outlined text — fill-based outline avoids blurry stacked strokeText passes. */
function drawCrispBannerWord(ctx, text, x, y, fill, outlinePx) {
    const t = Math.max(2, outlinePx);
    ctx.fillStyle = "#000000";
    for (let dy = -t; dy <= t; dy++) {
        for (let dx = -t; dx <= t; dx++) {
            if (dx * dx + dy * dy > t * t) continue;
            if (dx === 0 && dy === 0) continue;
            ctx.fillText(text, x + dx, y + dy);
        }
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}

// ─── Rendering ────────────────────────────────────────────────────────────
const W = 1280;
const H = 720;
const BANNER_DIVIDER_H = 4;
const BANNER_H = Math.round(H * 0.20);   // 144px
const PITCH_TOP = BANNER_H + BANNER_DIVIDER_H;
const PITCH_H = H - PITCH_TOP;

/** Matches video `.player-slot` width on the pitch (see pitch.css). */
const SLOT_WIDTH_FRAC = 0.0911 * 1.02 * 1.04 * 0.9;
/** Thumbnail-only scale so flags read clearly at 1280×720. */
const THUMB_SLOT_SIZE_SCALE = 1.34;

function getSlotCircleRadius(bottomW) {
    return (bottomW * SLOT_WIDTH_FRAC * THUMB_SLOT_SIZE_SCALE) / 2;
}

async function render() {
    if (!canvas) return;
    await ensureBannerFonts();
    const ctx = canvas.getContext("2d");
    const theme = readThumbnailTheme();

    ctx.clearRect(0, 0, W, H);
    await drawStageBackground(ctx, theme);
    const slotRect = getPitchSurfaceRect();
    drawPitchMarkings(ctx, getPitchMarkingsRect(slotRect));
    await drawVideoFormation(ctx, slotRect);
    drawBanner(ctx);
    await drawSpecificTitle(ctx);
}

function readThumbnailTheme() {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const stageFromCss = computed.getPropertyValue("--bg-stage").trim();
    const effectId =
        root.getAttribute("data-shared-background-effect") ||
        document.getElementById("in-background-effect")?.value ||
        DEFAULT_THEME.effectId;
    const opacityRaw = document.getElementById("in-background-opacity")?.value;
    const opacityPercent =
        opacityRaw != null && opacityRaw !== "" ? Number(opacityRaw) : DEFAULT_THEME.opacityPercent;
    const lineOpacityRaw = computed.getPropertyValue("--shared-line-opacity").trim();
    const lineOpacity =
        lineOpacityRaw !== "" && !Number.isNaN(Number(lineOpacityRaw))
            ? Number(lineOpacityRaw)
            : 3.5;
    const colorId = document.getElementById("in-background-color")?.value || "";
    const compSelect = document.getElementById("in-competition-background")?.value || "";
    const compFromEffect = String(effectId).startsWith("comp-") ? effectId.slice(5) : "";
    const competitionId = compSelect || compFromEffect;
    const stageColor =
        stageFromCss ||
        THEME_COLOR_BY_ID[colorId] ||
        DEFAULT_THEME.stageColor;
    return { stageColor, effectId, opacityPercent, lineOpacity, competitionId };
}

function getFirstQuestionLevel() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        if (!lvl || lvl.isIntro || lvl.isOutro || lvl.isLogo || lvl.isBonus) continue;
        const players = collectPlayerObjects(lvl);
        if (players.length > 0) return { lvl, players };
    }
    return { lvl: null, players: [] };
}

function getPitchSurfaceRect() {
    const bottomW = W * 0.88;
    const slotR = getSlotCircleRadius(bottomW);
    const slotRing = Math.max(4, slotR * 0.075);
    // y=100 slot center sits on the pitch bottom (same as video top:100% + translate(-50%,-50%)).
    const bottomY = H - slotR - slotRing - 10;
    return {
        cx: W / 2,
        topY: PITCH_TOP + PITCH_H * 0.04,
        bottomY,
        topW: W * 0.48,
        bottomW,
        slotR,
        slotRing,
    };
}

/** Thumbnail pitch lines are drawn larger than the slot layout rect (circles stay put). */
const PITCH_MARKINGS_SCALE = 1.14;
const PITCH_MARKINGS_OFFSET_Y = 32;

function getPitchMarkingsRect(slotRect) {
    const cyMid = (slotRect.topY + slotRect.bottomY) / 2;
    const halfH = (slotRect.bottomY - slotRect.topY) / 2;
    const scaledHalfH = halfH * PITCH_MARKINGS_SCALE;
    return {
        cx: slotRect.cx,
        topY: cyMid - scaledHalfH + PITCH_MARKINGS_OFFSET_Y,
        bottomY: cyMid + scaledHalfH + PITCH_MARKINGS_OFFSET_Y,
        topW: slotRect.topW * PITCH_MARKINGS_SCALE,
        bottomW: slotRect.bottomW * PITCH_MARKINGS_SCALE,
    };
}

/** Map pitch SVG viewBox coords (x 0–160, y 0–100) onto the perspective trapezoid. */
function svgPitchMap(sx, sy, rect) {
    const t = sy / 100;
    const y = rect.topY + t * (rect.bottomY - rect.topY);
    const halfW = ((1 - t) * rect.topW + t * rect.bottomW) / 2;
    const x = rect.cx + ((sx - 80) / 80) * halfW;
    return { x, y };
}

/** Map formation slot coords (x/y 0–100%, same as video pitch-slots) onto the perspective trapezoid. */
function slotMap(slotX, slotY, rect) {
    const t = slotY / 100;
    const y = rect.topY + t * (rect.bottomY - rect.topY);
    const halfW = ((1 - t) * rect.topW + t * rect.bottomW) / 2;
    const x = rect.cx + ((slotX - 50) / 50) * halfW;
    return { x, y };
}

/** Thumbnail-only 4-3-3 tweaks: push attack/mid lines slightly higher on the pitch. */
function thumbnailSlotY(slot) {
    if (slot.role === "fwd") return Math.max(0, slot.y - 10);
    if (slot.role === "mid") return Math.max(0, slot.y - 5);
    return slot.y;
}

/** Thumbnail-only: fan slots outward from center (LB wider left, RB wider right, etc.). */
function thumbnailSlotX(slot) {
    const spread = 1.26;
    const x = 50 + (slot.x - 50) * spread;
    return Math.min(98, Math.max(2, x));
}

async function drawStageBackground(ctx, theme) {
    const area = { x: 0, y: PITCH_TOP, w: W, h: PITCH_H };

    if (theme.competitionId) {
        await drawCompetitionBackground(ctx, area, theme.competitionId);
        return;
    }

    ctx.fillStyle = theme.stageColor;
    ctx.fillRect(area.x, area.y, area.w, area.h);

    const lineOpacity = Math.min(1, Math.max(0.05, theme.lineOpacity * 0.1));
    const effect = String(theme.effectId || "").toLowerCase();

    if (effect === "youtube-thumbnails") {
        drawYoutubeThumbnailRays(ctx, lineOpacity, 0);
        drawYoutubeThumbnailVignette(ctx, theme.opacityPercent);
    } else if (effect === "football-pitch") {
        drawFootballPitchStripes(ctx, theme.stageColor);
    } else if (effect === "center-rings") {
        drawCenterRings(ctx, theme.stageColor, lineOpacity);
    } else if (effect.startsWith("sun-rays") || effect === "sun-spiral-center") {
        drawSunRaysEffect(ctx, area, lineOpacity, effect);
    }
}

function drawLinearGradientFill(ctx, { x, y, w, h }, angleDeg, c1, c2) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const len = Math.hypot(w, h);
    const x0 = cx - (Math.cos(rad) * len) / 2;
    const y0 = cy - (Math.sin(rad) * len) / 2;
    const x1 = cx + (Math.cos(rad) * len) / 2;
    const y1 = cy + (Math.sin(rad) * len) / 2;
    const grd = ctx.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, c1);
    grd.addColorStop(1, c2);
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, w, h);
}

function hexToRgba(hex, alpha) {
    const h = String(hex || "").replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

async function drawCompetitionBackground(ctx, area, competitionId) {
    const themeDef = getCompetitionThemeById(competitionId);
    if (!themeDef?.recipe) {
        ctx.fillStyle = "#0a1a4a";
        ctx.fillRect(area.x, area.y, area.w, area.h);
        return;
    }
    const recipe = themeDef.recipe;
    drawLinearGradientFill(ctx, area, recipe.angle ?? 135, recipe.c1, recipe.c2);

    if (recipe.pattern === "diagonal") {
        drawDiagonalStripePattern(ctx, area, recipe.patternHex, recipe.patternAlpha);
    } else if (recipe.pattern === "rays") {
        drawCompetitionRaysPattern(ctx, area, recipe.patternHex, recipe.patternAlpha);
    } else {
        const tile = getCompetitionPatternTileDataUri(recipe);
        if (tile?.uri) {
            try {
                const img = await loadImage(tile.uri);
                const pattern = ctx.createPattern(img, "repeat");
                if (pattern) {
                    ctx.save();
                    ctx.fillStyle = pattern;
                    ctx.fillRect(area.x, area.y, area.w, area.h);
                    ctx.restore();
                }
            } catch { /* gradient only */ }
        }
    }
}

function drawDiagonalStripePattern(ctx, area, patternHex, patternAlpha) {
    const stripe = hexToRgba(patternHex, patternAlpha);
    const tile = document.createElement("canvas");
    tile.width = 128;
    tile.height = 128;
    const tctx = tile.getContext("2d");
    tctx.fillStyle = "rgba(0,0,0,0)";
    tctx.fillRect(0, 0, 128, 128);
    tctx.strokeStyle = stripe;
    tctx.lineWidth = 64;
    for (let i = -128; i < 256; i += 128) {
        tctx.beginPath();
        tctx.moveTo(i, 128);
        tctx.lineTo(i + 128, 0);
        tctx.stroke();
    }
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return;
    ctx.save();
    ctx.fillStyle = pattern;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.restore();
}

function drawCompetitionRaysPattern(ctx, area, patternHex, patternAlpha) {
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h * 0.42;
    const ray = hexToRgba(patternHex, patternAlpha);
    const cycle = (13 * Math.PI) / 180;
    const brightEnd = (5 * Math.PI) / 180;
    const maxR = Math.hypot(area.w, area.h);

    ctx.save();
    ctx.translate(cx, cy);
    for (let a = 0; a < Math.PI * 2; a += cycle) {
        const aBright = a + brightEnd;
        const aEnd = a + cycle;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * maxR, Math.sin(a) * maxR);
        ctx.lineTo(Math.cos(aBright) * maxR, Math.sin(aBright) * maxR);
        ctx.closePath();
        ctx.fillStyle = ray;
        ctx.fill();
    }
    ctx.restore();
}

function drawSunRaysEffect(ctx, area, lineOpacity, effectId) {
    const cx = area.x + area.w / 2;
    const cy =
        effectId.includes("top-right") ? area.y + area.h * 0.18
            : effectId.includes("top-left") ? area.y + area.h * 0.18
                : area.y + area.h / 2;
    const maxR = Math.hypot(area.w, area.h) * 1.1;
    const segments = 48;
    ctx.save();
    ctx.globalAlpha = lineOpacity;
    for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = a1 + (Math.PI * 2) / segments * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a1) * maxR, cy + Math.sin(a1) * maxR);
        ctx.lineTo(cx + Math.cos(a2) * maxR, cy + Math.sin(a2) * maxR);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)";
        ctx.fill();
    }
    ctx.restore();
}

function drawYoutubeThumbnailRays(ctx, lineOpacity, angleDeg) {
    const cx = W / 2;
    const cy = PITCH_TOP + PITCH_H / 2;
    const angleRad = (angleDeg * Math.PI) / 180;
    const cycle = (8.4 * Math.PI) / 180;
    const brightEnd = (1 * Math.PI) / 180;
    const midEnd = (3.4 * Math.PI) / 180;
    const maxR = Math.hypot(W, PITCH_H) * 1.2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    for (let a = 0; a < Math.PI * 2; a += cycle) {
        const drawWedge = (from, to, alpha) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(from) * maxR, Math.sin(from) * maxR);
            ctx.lineTo(Math.cos(to) * maxR, Math.sin(to) * maxR);
            ctx.closePath();
            ctx.fillStyle = `rgba(255,255,255,${lineOpacity * alpha})`;
            ctx.fill();
        };
        drawWedge(a, a + brightEnd, 0.62);
        drawWedge(a + brightEnd, a + midEnd, 0.16);
    }
    ctx.restore();

    const mask = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.72);
    mask.addColorStop(0, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = mask;
    ctx.fillRect(0, PITCH_TOP, W, PITCH_H);
    ctx.restore();
}

function drawYoutubeThumbnailVignette(ctx, opacityPercent) {
    const cx = W / 2;
    const cy = PITCH_TOP + PITCH_H / 2;
    const edge = Math.min(0.7, opacityPercent * 0.07);
    const grd = ctx.createRadialGradient(cx, cy, PITCH_H * 0.12, cx, cy, PITCH_H * 0.72);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.55, "rgba(255,255,255,0)");
    grd.addColorStop(1, `rgba(255,255,255,${edge})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, PITCH_TOP, W, PITCH_H);
}

function drawFootballPitchStripes(ctx, baseColor) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    const stripeW = 120;
    for (let x = -PITCH_H; x < W + PITCH_H; x += stripeW * 2) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(x, PITCH_TOP, stripeW, PITCH_H);
    }
    ctx.restore();
    void baseColor;
}

function drawCenterRings(ctx, stageColor, lineOpacity) {
    const cx = W / 2;
    const cy = PITCH_TOP + PITCH_H / 2;
    ctx.strokeStyle = `rgba(255,255,255,${lineOpacity * 2})`;
    for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, i * 55, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    void stageColor;
}

function drawPitchMarkings(ctx, rect) {
    ctx.save();
    const pitchLineOpacity = 0.40;
    const pitchLineW = Math.max(3, (rect.bottomW / 160) * 0.58);
    ctx.strokeStyle = `rgba(255,255,255,${pitchLineOpacity})`;
    ctx.lineWidth = pitchLineW;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";

    const strokeRect = (x, y, w, h) => {
        const p1 = svgPitchMap(x, y, rect);
        const p2 = svgPitchMap(x + w, y, rect);
        const p3 = svgPitchMap(x + w, y + h, rect);
        const p4 = svgPitchMap(x, y + h, rect);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();
    };

    strokeRect(0, 0, 160, 100);
    const halfA = svgPitchMap(0, 50, rect);
    const halfB = svgPitchMap(160, 50, rect);
    ctx.beginPath();
    ctx.moveTo(halfA.x, halfA.y);
    ctx.lineTo(halfB.x, halfB.y);
    ctx.stroke();

    strokeRect(32.565, 0, 94.871, 20.5);
    strokeRect(32.565, 79.5, 94.871, 20.5);
    strokeRect(58.435, 0, 43.13, 6.6);
    strokeRect(58.435, 93.4, 43.13, 6.6);

    const center = svgPitchMap(80, 50, rect);
    const edge = svgPitchMap(101.529, 50, rect);
    const rx = Math.abs(edge.x - center.x);
    const ry = rx * (8.714 / 21.529);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(255,255,255,${pitchLineOpacity})`;
    const spotR = Math.max(3, (rect.bottomW / 160) * 0.66);
    for (const [sx, sy] of [[80, 50], [80, 13.5], [80, 86.5]]) {
        const p = svgPitchMap(sx, sy, rect);
        ctx.beginPath();
        ctx.arc(p.x, p.y, spotR, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

async function drawFlagSlot(ctx, cx, cy, r, ring, flagSrc) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r + ring, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    if (flagSrc) {
        try {
            const img = await loadImage(flagSrc);
            const ratio = Math.max((r * 2) / img.width, (r * 2) / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
        } catch {
            ctx.fillStyle = "#E5E7EB";
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
    } else {
        ctx.fillStyle = "#E5E7EB";
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
}

async function drawVideoFormation(ctx, pitchRect) {
    const { players } = getFirstQuestionLevel();
    const slots = formationById("433").slots;
    const flagcodes = appState.flagcodes || {};
    const r = pitchRect.slotR;
    const ring = pitchRect.slotRing;

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const player = players[i] || null;
        const pos = slotMap(thumbnailSlotX(slot), thumbnailSlotY(slot), pitchRect);
        const cx = pos.x;
        const cy = pos.y;
        const flagSrc = player ? resolveFlagUrl(player.nationality, flagcodes) : null;
        await drawFlagSlot(ctx, cx, cy, r, ring, flagSrc);
    }
}

function resolveFlagUrl(nationality, flagcodes) {
    const nat = String(nationality || "").trim();
    if (!nat) return null;
    if (nat === "England") return projectAssetUrl("Images/Nationality/Europe/England.png");
    const code = flagcodes[nat];
    if (code) return `https://flagcdn.com/w320/${String(code).toLowerCase()}.png`;
    return null;
}

function collectPlayerObjects(lvl) {
    if (!lvl) return [];
    if (Array.isArray(lvl.customXi) && lvl.customXi.length > 0) return lvl.customXi;
    const sq = lvl.currentSquad;
    if (sq && (sq.goalkeepers || sq.defenders || sq.midfielders || sq.attackers)) {
        return [
            ...(Array.isArray(sq.goalkeepers) ? sq.goalkeepers : []),
            ...(Array.isArray(sq.defenders) ? sq.defenders : []),
            ...(Array.isArray(sq.midfielders) ? sq.midfielders : []),
            ...(Array.isArray(sq.attackers) ? sq.attackers : []),
        ];
    }
    if (Array.isArray(sq?.players)) return sq.players;
    return [];
}

function drawBanner(ctx) {
    ctx.fillStyle = BANNER_RED;
    ctx.fillRect(0, 0, W, BANNER_H);

    drawImpactTitle(ctx, W / 2, BANNER_H, W - 20);

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, BANNER_H, W, BANNER_DIVIDER_H);
}

function drawImpactTitle(ctx, cx, bannerH, maxW) {
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    const words = bannerTitleWords();
    const fontSize = findBannerTitleFontSize(ctx, words, bannerH, maxW);
    setBannerTitleFont(ctx, fontSize);

    const wordGap = Math.round(fontSize * 0.14);
    const baselineY = bannerTitleBaselineY(ctx, bannerH, fontSize);
    const layout = layoutBannerTitleWords(ctx, words, wordGap, cx, baselineY);
    const outline = titleOutlinePx(fontSize);

    for (const { text, fill, x, y } of layout) {
        drawCrispBannerWord(ctx, text, x, y, fill, outline);
    }

    ctx.restore();
}

async function drawSpecificTitle(ctx) {
    const title = (state.specificTitle || "").trim();
    if (!title) { updateIconStatus("No icon"); return; }

    // Resolve icon — custom upload first, then known catalog.
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

    // Sub-banner: dark pill near the bottom of the pitch with title + optional icon.
    const padX = 36;
    const padY = 24;
    const subFontSize = 60;
    ctx.save();
    ctx.font = `400 ${subFontSize}px ${BANNER_FONT_FAMILY}`;
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

    // Pill background
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    roundRect(ctx, pillX, pillY, pillW, pillH, 20);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#FACC15";
    roundRect(ctx, pillX, pillY, pillW, pillH, 20);
    ctx.stroke();

    // Icon
    if (iconImg) {
        const ix = pillX + padX;
        const iy = pillY + (pillH - iconBoxH) / 2;
        const ratio = Math.min(iconBoxW / iconImg.width, iconBoxH / iconImg.height);
        const w = iconImg.width * ratio;
        const h = iconImg.height * ratio;
        ctx.drawImage(iconImg, ix + (iconBoxW - w) / 2, iy + (iconBoxH - h) / 2, w, h);
    }

    // Text
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
        if (!String(src).startsWith("data:")) img.crossOrigin = "anonymous";
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
