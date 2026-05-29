// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 6 Regular (Fake Info).
//
// Opens a full-screen overlay with a canvas, a control rail (Regenerate, Specific
// title + icon, Download PNG, Back), and renders a static thumbnail composed of:
//   • Top 25% red banner with "GUESS THE FAKE INFO" (yellow accent on "FAKE INFO"),
//     Impact font.
//   • "2025/6" season badge (vertical, top-right corner).
//   • Bottom 75% dark teal/magenta panel with the player's photo on the right and
//     4 stacked info chips (club / position / country / age) on the left. One chip
//     is stamped with a red "FAKE?" badge to telegraph the quiz premise.
//   • Optional secondary title bar (e.g. "Champion League") with auto-resolved
//     icon from Images/Icons/specific-title/ — or user-dropped custom icon.
//
// Regenerate cycles random palette + effect variant + which save's level is the
// source player. The composition stays static — no animation, no DOM dependencies
// in the rendered canvas (so toBlob → PNG is clean).

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { playerPhotoPaths } from "./photo-helpers.js";

// ─── Per-runner config (everything that distinguishes this runner) ──────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS THE",
    titleYellow: "FAKE INFO",
    seasonLabel: "2025/6",
};

// ─── Palette pool — Regenerate cycles one of these.
//  Per spec: distinctive dark teal / magenta scheme — sets this runner apart
//  from the green-pitch / blue / orange runners. The banner stays a red→deep-red
//  gradient (Impact title rule across all runners) but the bottom 75% swaps
//  teal/magenta hues so the thumbnail reads as "fake info" at a glance.
const PALETTES = [
    {
        banner: "#DC2626", bannerEdge: "#7F1D1D",
        bg1: "#0F3D44", bg2: "#1F1235",
        accent: "#E11D74", chipFill: "rgba(15,40,55,0.86)",
        chipStroke: "#22D3EE", rays: "rgba(225,29,116,0.10)",
    },
    {
        banner: "#B91C1C", bannerEdge: "#450A0A",
        bg1: "#134E4A", bg2: "#3B0764",
        accent: "#F472B6", chipFill: "rgba(10,40,40,0.88)",
        chipStroke: "#A78BFA", rays: "rgba(244,114,182,0.08)",
    },
    {
        banner: "#EF4444", bannerEdge: "#991B1B",
        bg1: "#0E7490", bg2: "#86198F",
        accent: "#F0ABFC", chipFill: "rgba(8,40,55,0.86)",
        chipStroke: "#67E8F9", rays: "rgba(240,171,252,0.10)",
    },
    {
        banner: "#991B1B", bannerEdge: "#3F0A0A",
        bg1: "#082F49", bg2: "#581C3F",
        accent: "#FB7185", chipFill: "rgba(8,30,50,0.86)",
        chipStroke: "#F472B6", rays: "rgba(251,113,133,0.10)",
    },
    {
        banner: "#7F1D1D", bannerEdge: "#1F0606",
        bg1: "#155E75", bg2: "#701A75",
        accent: "#E879F9", chipFill: "rgba(12,40,55,0.88)",
        chipStroke: "#E879F9", rays: "rgba(232,121,249,0.10)",
    },
];

// ─── Effect-variant pool — extra layers drawn on top of the bottom panel ───
const EFFECTS = [
    "rays-from-top",
    "rays-from-banner",
    "vignette",
    "diagonal-stripes",
    "spotlight-center",
];

// ─── Known competition icons (auto-resolved from secondary title text) ─────
//
// Keys are lowercased, whitespace-collapsed competition names. Values are
// project-asset paths under Images/Icons/specific-title/ that we know exist
// in this repo (mirrors the canonical Runner 1 map).
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
    sourceLevelIdx: -1,        // index into appState.levelsData; -1 = no usable level
    fakeChipIdx: 0,            // which chip gets the "FAKE?" stamp (0..3)
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
    state.fakeChipIdx = Math.floor(Math.random() * 4);
}

function pickRandomQuestionLevelIdx() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const candidates = [];
    for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        if (!lvl || lvl.isIntro || lvl.isOutro || lvl.isLogo || lvl.isBonus) continue;
        const player = lvl.careerPlayer;
        if (!player || !player.name) continue;
        candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function getCurrentPlayer() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx;
    const lvl = idx >= 0 && idx < levels.length ? levels[idx] : null;
    return lvl?.careerPlayer || null;
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
const PANEL_TOP = BANNER_H;
const PANEL_H = H - BANNER_H;            // 540px

async function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const palette = PALETTES[state.paletteIdx % PALETTES.length];
    const effect = EFFECTS[state.effectIdx % EFFECTS.length];

    ctx.clearRect(0, 0, W, H);
    drawPanelBackground(ctx, palette);
    drawEffectLayer(ctx, effect, palette);
    await drawPlayerPhoto(ctx, palette);
    drawInfoChips(ctx, palette);
    drawBanner(ctx, palette);
    drawSeasonBadge(ctx);
    await drawSpecificTitle(ctx);
}

function drawPanelBackground(ctx, palette) {
    // Diagonal teal → magenta gradient for the bottom 75%.
    const grd = ctx.createLinearGradient(0, PANEL_TOP, W, H);
    grd.addColorStop(0, palette.bg1);
    grd.addColorStop(1, palette.bg2);
    ctx.fillStyle = grd;
    ctx.fillRect(0, PANEL_TOP, W, PANEL_H);

    // Subtle horizontal gloss highlight near the top of the panel.
    const gloss = ctx.createLinearGradient(0, PANEL_TOP, 0, PANEL_TOP + 80);
    gloss.addColorStop(0, "rgba(255,255,255,0.08)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(0, PANEL_TOP, W, 80);
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
        // Spotlight biased toward the right (where the player photo lives).
        const cx = W * 0.7;
        const cy = PANEL_TOP + PANEL_H / 2;
        const grd = ctx.createRadialGradient(cx, cy, 50, cx, cy, 600);
        grd.addColorStop(0, "rgba(255,255,255,0.20)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, PANEL_TOP, W, PANEL_H);
    }
    ctx.restore();
}

// ─── Player photo (right side) ────────────────────────────────────────────
async function drawPlayerPhoto(ctx, palette) {
    const player = getCurrentPlayer();
    if (!player) return;

    // Resolve photo via the project's helper. playerPhotoPaths reads from
    // appState.playerImages — when nothing has been loaded yet the array will
    // be empty, in which case we draw a neutral silhouette block.
    let photoUrl = null;
    try {
        const paths = playerPhotoPaths(player, "club");
        if (paths.length > 0) {
            // First path wins (consistent with how renderCareer picks photos).
            photoUrl = projectAssetUrl(paths[0]);
        }
    } catch {
        photoUrl = null;
    }

    // Box on the right ~45% of the canvas width.
    const boxW = Math.round(W * 0.45);
    const boxH = Math.round(PANEL_H * 0.95);
    const boxX = W - boxW - 20;
    const boxY = PANEL_TOP + (PANEL_H - boxH) / 2;

    // Backplate disc behind the photo (gives it a poster-portrait feel).
    ctx.save();
    const cx = boxX + boxW / 2;
    const cy = boxY + boxH / 2;
    const r = Math.min(boxW, boxH) * 0.55;
    const discGrd = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.2, cx, cy, r);
    discGrd.addColorStop(0, "rgba(255,255,255,0.18)");
    discGrd.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = discGrd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Accent ring
    ctx.lineWidth = 6;
    ctx.strokeStyle = palette.accent;
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (photoUrl) {
        try {
            const img = await loadImage(photoUrl);
            // Fit "contain" inside the box, preserving aspect.
            const ratio = Math.min(boxW / img.width, boxH / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            const x = cx - w / 2;
            const y = cy - h / 2 + 10;  // nudge down so head clears the banner
            ctx.drawImage(img, x, y, w, h);
        } catch {
            drawPhotoFallback(ctx, cx, cy, r, player);
        }
    } else {
        drawPhotoFallback(ctx, cx, cy, r, player);
    }
}

function drawPhotoFallback(ctx, cx, cy, r, player) {
    // Simple silhouette + last-name label.
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    // Head + shoulders rough silhouette
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.35, r * 0.65, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Name underneath
    const lastName = String(player?.name || "")
        .trim()
        .split(/\s+/)
        .pop() || "";
    if (lastName) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `900 36px Impact, "Anton", "Oswald", sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#000";
        ctx.strokeText(lastName.toUpperCase(), cx, cy + r * 0.95);
        ctx.fillStyle = "#FACC15";
        ctx.fillText(lastName.toUpperCase(), cx, cy + r * 0.95);
    }
    ctx.restore();
}

// ─── Info chips (left side) ────────────────────────────────────────────────
function drawInfoChips(ctx, palette) {
    const player = getCurrentPlayer();
    // Even with no player we draw placeholders so the layout still makes sense.
    const chips = buildChips(player);

    // Stack on the left half. Allow ~52% of the canvas width.
    const chipX = 40;
    const chipW = Math.round(W * 0.48);
    const totalH = PANEL_H - 80;            // leave room for the sub-title pill
    const gap = 16;
    const chipH = Math.floor((totalH - gap * (chips.length - 1)) / chips.length);
    const startY = PANEL_TOP + 30;

    const fakeIdx = state.fakeChipIdx % chips.length;

    for (let i = 0; i < chips.length; i++) {
        const y = startY + i * (chipH + gap);
        drawChip(ctx, palette, chipX, y, chipW, chipH, chips[i], i === fakeIdx);
    }
}

function buildChips(player) {
    const p = player || {};
    const age =
        p.age != null && Number.isFinite(Number(p.age)) ? String(Number(p.age)) : "—";
    const goals =
        p.goals != null && Number.isFinite(Number(p.goals)) ? String(Number(p.goals)) : null;

    const base = [
        { label: "CLUB",     value: String(p.club || "—") },
        { label: "POSITION", value: String(p.position || "—") },
        { label: "COUNTRY",  value: String(p.nationality || "—") },
        { label: "AGE",      value: age },
    ];
    // If the player record actually carries `goals`, surface it as a 5th chip.
    if (goals != null) {
        base.push({ label: "GOALS", value: goals });
    }
    return base;
}

function drawChip(ctx, palette, x, y, w, h, chip, isFake) {
    ctx.save();
    // Chip background — frosted dark fill with a colored outline.
    ctx.fillStyle = palette.chipFill;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.chipStroke;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();

    // Label (small, top-left)
    const padX = 22;
    const labelY = y + h * 0.32;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `800 ${Math.round(h * 0.22)}px "Barlow Condensed", "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(chip.label, x + padX, labelY);

    // Value (large, bottom-left). Auto-shrink to fit; reserve room for the FAKE stamp on fake chips.
    const valueMaxH = Math.round(h * 0.55);
    const reservedRight = isFake ? Math.round(h * 1.4) : Math.round(h * 0.3);
    const valueMaxW = w - padX * 2 - reservedRight;
    let fontSize = valueMaxH;
    do {
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
        if (ctx.measureText(chip.value.toUpperCase()).width <= valueMaxW) break;
        fontSize -= 2;
    } while (fontSize > 16);

    const valueY = y + h * 0.7;
    ctx.lineWidth = Math.max(3, fontSize * 0.07);
    ctx.strokeStyle = "#000";
    ctx.strokeText(chip.value.toUpperCase(), x + padX, valueY);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(chip.value.toUpperCase(), x + padX, valueY);

    // FAKE? stamp — tilted red badge on the chip's right edge.
    if (isFake) {
        const stampH = Math.round(h * 0.7);
        const stampW = Math.round(h * 1.25);
        const sx = x + w - stampW - 16;
        const sy = y + (h - stampH) / 2;
        ctx.save();
        ctx.translate(sx + stampW / 2, sy + stampH / 2);
        ctx.rotate(-0.18);
        // Outer red badge
        ctx.fillStyle = "#DC2626";
        roundRect(ctx, -stampW / 2, -stampH / 2, stampW, stampH, 10);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#FEF3C7";
        roundRect(ctx, -stampW / 2, -stampH / 2, stampW, stampH, 10);
        ctx.stroke();
        // "FAKE?" text
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `900 ${Math.round(stampH * 0.55)}px Impact, "Anton", "Oswald", sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#000";
        ctx.strokeText("FAKE?", 0, 0);
        ctx.fillStyle = "#FACC15";
        ctx.fillText("FAKE?", 0, 0);
        ctx.restore();
    }
    ctx.restore();
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

    // Title text — Impact-style, two-color "GUESS THE FAKE INFO".
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

    // Sub-banner: dark pill near the bottom of the panel with title + optional icon.
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
