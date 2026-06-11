/** Live video-mode stage background for thumbnail studio — shared by all Regular runners. */

import {
    getCompetitionPatternTileDataUri,
    getCompetitionThemeById,
} from "../backgrounds/background-theme.js";
import { THUMB_W, THUMB_H, STAGE_TOP, STAGE_H } from "./thumbnail-banner.js";

export const DEFAULT_THEME = {
    stageColor: "#2E7D32",
    effectId: "youtube-thumbnails",
    opacityPercent: 0.5,
};

export const THEME_COLOR_BY_ID = {
    "quiz-club-by-nat": "#2E7D32",
    "quiz-nat-by-club": "#1B5E20",
    "quiz-career-path": "#0069EC",
    "quiz-career-stats": "#AB47BC",
    "quiz-four-params": "#5C6BC0",
    "quiz-fake-info": "#E57373",
    "quiz-football-mcq": "#C2185B",
    "extra-soft-green": "#81C784",
};

export function getThumbnailStageArea() {
    return { x: 0, y: STAGE_TOP, w: THUMB_W, h: STAGE_H };
}

export function readThumbnailTheme(defaults = DEFAULT_THEME) {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const stageFromCss = computed.getPropertyValue("--bg-stage").trim();
    const effectId =
        root.getAttribute("data-shared-background-effect") ||
        document.getElementById("in-background-effect")?.value ||
        defaults.effectId;
    const opacityRaw = document.getElementById("in-background-opacity")?.value;
    const opacityPercent =
        opacityRaw != null && opacityRaw !== "" ? Number(opacityRaw) : defaults.opacityPercent;
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
        defaults.stageColor;
    return { stageColor, effectId, opacityPercent, lineOpacity, competitionId };
}

export function wireThumbnailThemeListeners(onChange) {
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
            if (typeof onChange === "function") onChange();
        });
    }
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

export async function drawThumbnailStageBackground(ctx, theme, area = getThumbnailStageArea()) {
    if (theme.competitionId) {
        await drawCompetitionBackground(ctx, area, theme.competitionId);
        return;
    }

    ctx.fillStyle = theme.stageColor;
    ctx.fillRect(area.x, area.y, area.w, area.h);

    const lineOpacity = Math.min(1, Math.max(0.05, theme.lineOpacity * 0.1));
    const effect = String(theme.effectId || "").toLowerCase();

    if (effect === "youtube-thumbnails") {
        drawYoutubeThumbnailRays(ctx, area, lineOpacity, 0);
        drawYoutubeThumbnailVignette(ctx, area, theme.opacityPercent);
    } else if (effect === "football-pitch") {
        drawFootballPitchStripes(ctx, area);
    } else if (effect === "center-rings") {
        drawCenterRings(ctx, area, lineOpacity);
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
        effectId.includes("top-right") || effectId.includes("top-left")
            ? area.y + area.h * 0.18
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

function drawYoutubeThumbnailRays(ctx, area, lineOpacity, angleDeg) {
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    const angleRad = (angleDeg * Math.PI) / 180;
    const cycle = (8.4 * Math.PI) / 180;
    const brightEnd = Math.PI / 180;
    const midEnd = (3.4 * Math.PI) / 180;
    const maxR = Math.hypot(area.w, area.h) * 1.2;

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
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.restore();
}

function drawYoutubeThumbnailVignette(ctx, area, opacityPercent) {
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    const edge = Math.min(0.7, opacityPercent * 0.07);
    const grd = ctx.createRadialGradient(cx, cy, area.h * 0.12, cx, cy, area.h * 0.72);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.55, "rgba(255,255,255,0)");
    grd.addColorStop(1, `rgba(255,255,255,${edge})`);
    ctx.fillStyle = grd;
    ctx.fillRect(area.x, area.y, area.w, area.h);
}

function drawFootballPitchStripes(ctx, area) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    const stripeW = 120;
    for (let x = -area.h; x < area.w + area.h; x += stripeW * 2) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(area.x + x, area.y, stripeW, area.h);
    }
    ctx.restore();
}

function drawCenterRings(ctx, area, lineOpacity) {
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    ctx.strokeStyle = `rgba(255,255,255,${lineOpacity * 2})`;
    for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, i * 55, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
