// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 1 Regular.
//
// Opens a full-screen overlay with a canvas, a control rail (Regenerate, Specific
// title + icon, Download PNG, Back), and renders a static thumbnail composed of:
//   • Top 25% red banner with "GUESS THE FOOTBALL TEAM" (yellow accent on the
//     last two words), Impact font.
//   • "2025/6" season badge (vertical, top-right corner).
//   • Bottom 75% green pitch with 11 nationality-flag circles in a 3-4-3.
//   • Optional secondary title bar (e.g. "Champion League") with auto-resolved
//     icon from Images/Icons/specific-title/ — or user-dropped custom icon.
//
// Regenerate cycles random palette + effect variant + which save's level the
// flag selection is sampled from. The composition stays static — no animation,
// no DOM dependencies in the rendered canvas (so toBlob → PNG is clean).

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

// ─── Per-runner config (everything that distinguishes this runner) ──────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS THE",
    titleYellow: "FOOTBALL TEAM",
    seasonLabel: "2025/6",
    // 3-4-3 formation slot positions, in normalized [0..1] of the pitch area.
    // The pitch occupies the bottom 75% of the canvas; positions are relative
    // to that pitch box, with (0,0) = top-left of the pitch, (1,1) = bottom-right.
    formationSlots: [
        // GK
        { x: 0.50, y: 0.92 },
        // Defenders
        { x: 0.18, y: 0.72 },
        { x: 0.40, y: 0.72 },
        { x: 0.60, y: 0.72 },
        { x: 0.82, y: 0.72 },
        // Midfielders
        { x: 0.28, y: 0.48 },
        { x: 0.50, y: 0.48 },
        { x: 0.72, y: 0.48 },
        // Forwards
        { x: 0.28, y: 0.24 },
        { x: 0.50, y: 0.24 },
        { x: 0.72, y: 0.24 },
    ],
};

// ─── Palette pool — Regenerate cycles one of these ──────────────────────────
const PALETTES = [
    { banner: "#DC2626", bannerEdge: "#7F1D1D", pitch: "#16A34A", pitchEdge: "#14532D", rays: "rgba(255,255,255,0.10)" },
    { banner: "#B91C1C", bannerEdge: "#450A0A", pitch: "#1E8C3F", pitchEdge: "#0F4F1F", rays: "rgba(255,255,255,0.08)" },
    { banner: "#EF4444", bannerEdge: "#991B1B", pitch: "#10B981", pitchEdge: "#064E3B", rays: "rgba(255,200,0,0.10)" },
    { banner: "#7F1D1D", bannerEdge: "#1F0606", pitch: "#15803D", pitchEdge: "#052E16", rays: "rgba(255,255,255,0.12)" },
    { banner: "#991B1B", bannerEdge: "#3F0A0A", pitch: "#22C55E", pitchEdge: "#15803D", rays: "rgba(255,255,255,0.07)" },
];

// ─── Effect-variant pool — extra layers drawn on top of the pitch ──────────
const EFFECTS = [
    "rays-from-top",         // bright sunburst from top-center
    "rays-from-banner",      // sunburst emanating from below the banner
    "vignette",              // dark vignette around the edges
    "diagonal-stripes",      // subtle diagonal stripes on the pitch
    "spotlight-center",      // bright spotlight behind the formation
];

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
    // Randomize on open so each session starts fresh.
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
        if (collectPlayerObjects(lvl).length === 0) continue;
        candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
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
const PITCH_TOP = BANNER_H;
const PITCH_H = H - BANNER_H;            // 540px

async function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const palette = PALETTES[state.paletteIdx % PALETTES.length];
    const effect = EFFECTS[state.effectIdx % EFFECTS.length];

    ctx.clearRect(0, 0, W, H);
    drawPitchBackground(ctx, palette);
    drawEffectLayer(ctx, effect, palette);
    await drawFormation(ctx);
    drawBanner(ctx, palette);
    drawSeasonBadge(ctx);
    await drawSpecificTitle(ctx);
}

function drawPitchBackground(ctx, palette) {
    const grd = ctx.createLinearGradient(0, PITCH_TOP, 0, H);
    grd.addColorStop(0, palette.pitch);
    grd.addColorStop(1, palette.pitchEdge);
    ctx.fillStyle = grd;
    ctx.fillRect(0, PITCH_TOP, W, PITCH_H);

    // Pitch boundary lines for footballiness — center circle, halves, penalty boxes.
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 4;
    // Bottom touchline
    ctx.strokeRect(40, PITCH_TOP + 30, W - 80, PITCH_H - 50);
    // Halfway (horizontal here because we're looking at the pitch top-down)
    ctx.beginPath();
    ctx.moveTo(40, PITCH_TOP + PITCH_H / 2);
    ctx.lineTo(W - 40, PITCH_TOP + PITCH_H / 2);
    ctx.stroke();
    // Center circle
    ctx.beginPath();
    ctx.arc(W / 2, PITCH_TOP + PITCH_H / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, PITCH_TOP + PITCH_H / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();
    ctx.restore();
}

function drawEffectLayer(ctx, effect, palette) {
    ctx.save();
    if (effect === "rays-from-top" || effect === "rays-from-banner") {
        const cx = W / 2;
        const cy = effect === "rays-from-banner" ? PITCH_TOP - 10 : 0;
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
        ctx.fillRect(0, PITCH_TOP, W, PITCH_H);
    } else if (effect === "diagonal-stripes") {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        const stripeW = 60;
        for (let x = -PITCH_H; x < W + PITCH_H; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, PITCH_TOP);
            ctx.lineTo(x + stripeW, PITCH_TOP);
            ctx.lineTo(x + stripeW + PITCH_H, H);
            ctx.lineTo(x + PITCH_H, H);
            ctx.closePath();
            ctx.fill();
        }
    } else if (effect === "spotlight-center") {
        const grd = ctx.createRadialGradient(W / 2, PITCH_TOP + PITCH_H / 2, 50, W / 2, PITCH_TOP + PITCH_H / 2, 600);
        grd.addColorStop(0, "rgba(255,255,255,0.20)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, PITCH_TOP, W, PITCH_H);
    }
    ctx.restore();
}

async function drawFormation(ctx) {
    const flags = collectFlagsForCurrentLevel();
    const slots = RUNNER_CONFIG.formationSlots;
    const r = 56;
    // Map slot positions into the pitch box, then offset by PITCH_TOP.
    const pitchPad = 90;  // leave room from edges
    const pitchInnerW = W - pitchPad * 2;
    const pitchInnerH = PITCH_H - 120;
    const pitchOriginY = PITCH_TOP + 60;

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const cx = pitchPad + slot.x * pitchInnerW;
        const cy = pitchOriginY + slot.y * pitchInnerH;

        // Outer white ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.restore();

        // Flag circle clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        const flagSrc = flags[i % flags.length];
        if (flagSrc) {
            try {
                const img = await loadImage(flagSrc);
                // cover fit
                const ratio = Math.max((r * 2) / img.width, (r * 2) / img.height);
                const w = img.width * ratio;
                const h = img.height * ratio;
                ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
            } catch { /* draw nothing — circle stays white */ }
        } else {
            ctx.fillStyle = "#E5E7EB";
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        ctx.restore();

        // Drop shadow ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.stroke();
        ctx.restore();
    }
}

function collectFlagsForCurrentLevel() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx;
    const lvl = idx >= 0 && idx < levels.length ? levels[idx] : null;
    // The selected starting 11 lives in lvl.customXi (each entry has a
    // `nationality` field). For national-team levels we fall back to flattening
    // the squad groups since they all share the same country anyway.
    const sourcePlayers = collectPlayerObjects(lvl);
    const flagcodes = appState.flagcodes || {};

    const urls = [];
    for (const p of sourcePlayers) {
        const nat = String(p?.nationality || "").trim();
        if (!nat) continue;
        // England gets the project's St George asset (not the Union Jack on flagcdn).
        if (nat === "England") {
            urls.push(projectAssetUrl("Images/Nationality/Europe/England.png"));
        } else {
            const code = flagcodes[nat];
            if (code) urls.push(`https://flagcdn.com/w320/${String(code).toLowerCase()}.png`);
        }
        if (urls.length >= 11) break;
    }
    // Pad to 11 with a neutral placeholder if the squad is short.
    while (urls.length < 11) urls.push(null);
    return urls;
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

function drawBanner(ctx, palette) {
    // Banner background — vertical gradient + dark bottom edge for separation.
    const grd = ctx.createLinearGradient(0, 0, 0, BANNER_H);
    grd.addColorStop(0, palette.banner);
    grd.addColorStop(1, palette.bannerEdge);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, BANNER_H);

    // Subtle highlight stripe along the bottom edge.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, BANNER_H - 6, W, 6);

    // Title text — Impact-style, two-color "GUESS THE FOOTBALL TEAM".
    drawImpactTitle(
        ctx,
        RUNNER_CONFIG.titleWhite,
        RUNNER_CONFIG.titleYellow,
        W / 2,
        BANNER_H / 2,
        BANNER_H - 30,   // available height
        W - 180,          // leave room for season badge
    );
}

function drawImpactTitle(ctx, white, yellow, cx, cy, maxH, maxW) {
    // Fit-to-width with Impact. Walk down font size until both fits.
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

    const whiteW = ctx.measureText(white + " ").width;
    const totalW = measured.width;
    const startX = cx - totalW / 2;

    // Stroke first for outline, then fill for text on top.
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
    // Right edge of banner: rotated 90° "2025/6" label.
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
