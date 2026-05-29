// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 5 Regular
// ("Guess The Player by Club + Position + Country + Age" — 4 parameters).
//
// Opens a full-screen overlay with a canvas, a control rail (Regenerate, Specific
// title + icon, Download PNG, Back), and renders a static thumbnail composed of:
//   • Top 25% purple banner with "GUESS BY 4 PARAMETERS" (yellow accent on the
//     last words), Impact font.
//   • "2025/6" season badge (vertical, top-right corner).
//   • Bottom 75% purple/violet background with a 2x2 grid of four white "parameter
//     cards" (position abbrev, club logo, age, country flag) on the left and a
//     player photo on the right.
//
// Regenerate cycles random palette + effect variant + which save's level the
// player sample is drawn from. The composition stays static — no animation, no
// DOM dependencies in the rendered canvas (so toBlob → PNG is clean).

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { playerPhotoPaths } from "./photo-helpers.js";

// ─── Per-runner config (everything that distinguishes this runner) ──────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS BY",
    titleYellow: "4 PARAMETERS",
    seasonLabel: "2025/6",
};

// ─── Palette pool — Regenerate cycles one of these (purple/violet family) ──
const PALETTES = [
    { banner: "#7C3AED", bannerEdge: "#3B0764", bg: "#6D28D9", bgEdge: "#2E1065", rays: "rgba(255,255,255,0.10)" },
    { banner: "#8B5CF6", bannerEdge: "#4C1D95", bg: "#7C3AED", bgEdge: "#1E1B4B", rays: "rgba(255,200,0,0.10)" },
    { banner: "#6D28D9", bannerEdge: "#2E1065", bg: "#5B21B6", bgEdge: "#1E1B4B", rays: "rgba(255,255,255,0.12)" },
    { banner: "#9333EA", bannerEdge: "#581C87", bg: "#7E22CE", bgEdge: "#3B0764", rays: "rgba(255,255,255,0.08)" },
    { banner: "#A855F7", bannerEdge: "#6B21A8", bg: "#7C3AED", bgEdge: "#312E81", rays: "rgba(255,255,255,0.07)" },
];

// ─── Effect-variant pool — extra layers drawn on top of the background ─────
const EFFECTS = [
    "rays-from-top",
    "rays-from-banner",
    "vignette",
    "diagonal-stripes",
    "spotlight-center",
];

// ─── Known competition icons (same catalog as Runner 1 Regular) ────────────
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

// ─── Position-name → abbreviation table (mirrors pitch-render.js) ──────────
const POSITION_ABBREV = {
    Goalkeeper: "GK",
    "Centre-Back": "CB",
    "Left-Back": "LB",
    "Right-Back": "RB",
    "Defensive Midfield": "CDM",
    "Central Midfield": "CM",
    "Attacking Midfield": "CAM",
    "Left Midfield": "LM",
    "Right Midfield": "RM",
    "Left Winger": "LW",
    "Right Winger": "RW",
    "Centre-Forward": "ST",
    "Second Striker": "ST",
    "Striker": "ST",
};

function abbrevForPosition(positionRaw) {
    const key = String(positionRaw ?? "").trim();
    if (!key) return "";
    if (Object.prototype.hasOwnProperty.call(POSITION_ABBREV, key)) {
        return POSITION_ABBREV[key];
    }
    const centreKey = key.replace(/^Center-/i, "Centre-");
    if (centreKey !== key && Object.prototype.hasOwnProperty.call(POSITION_ABBREV, centreKey)) {
        return POSITION_ABBREV[centreKey];
    }
    // Fallback: first letters / collapsed form (max 4 chars).
    const tokens = key.replace(/[^A-Za-z\s-]/g, "").split(/[\s-]+/).filter(Boolean);
    if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase();
    return tokens.map((t) => t[0]).join("").slice(0, 4).toUpperCase();
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
        if (!lvl || lvl.isIntro || lvl.isOutro || lvl.isLogo || lvl.isBonus) continue;
        if (!lvl.careerPlayer) continue;
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
const BANNER_H = Math.round(H * 0.25);
const BOTTOM_TOP = BANNER_H;
const BOTTOM_H = H - BANNER_H;

async function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const palette = PALETTES[state.paletteIdx % PALETTES.length];
    const effect = EFFECTS[state.effectIdx % EFFECTS.length];

    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx, palette);
    drawEffectLayer(ctx, effect, palette);
    await drawBottomComposition(ctx);
    drawBanner(ctx, palette);
    drawSeasonBadge(ctx);
    await drawSpecificTitle(ctx);
}

function drawBackground(ctx, palette) {
    // Bottom 75% — purple radial palette to differentiate this runner.
    const grd = ctx.createRadialGradient(W / 2, BOTTOM_TOP + BOTTOM_H * 0.55, 80, W / 2, BOTTOM_TOP + BOTTOM_H * 0.55, W * 0.8);
    grd.addColorStop(0, palette.bg);
    grd.addColorStop(1, palette.bgEdge);
    ctx.fillStyle = grd;
    ctx.fillRect(0, BOTTOM_TOP, W, BOTTOM_H);
}

function drawEffectLayer(ctx, effect, palette) {
    ctx.save();
    if (effect === "rays-from-top" || effect === "rays-from-banner") {
        const cx = W / 2;
        const cy = effect === "rays-from-banner" ? BOTTOM_TOP - 10 : 0;
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
        ctx.fillRect(0, BOTTOM_TOP, W, BOTTOM_H);
    } else if (effect === "diagonal-stripes") {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        const stripeW = 60;
        for (let x = -BOTTOM_H; x < W + BOTTOM_H; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, BOTTOM_TOP);
            ctx.lineTo(x + stripeW, BOTTOM_TOP);
            ctx.lineTo(x + stripeW + BOTTOM_H, H);
            ctx.lineTo(x + BOTTOM_H, H);
            ctx.closePath();
            ctx.fill();
        }
    } else if (effect === "spotlight-center") {
        const grd = ctx.createRadialGradient(W / 2, BOTTOM_TOP + BOTTOM_H / 2, 50, W / 2, BOTTOM_TOP + BOTTOM_H / 2, 600);
        grd.addColorStop(0, "rgba(255,255,255,0.20)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, BOTTOM_TOP, W, BOTTOM_H);
    }
    ctx.restore();
}

// Bottom 75% = left half is a 2×2 grid of white parameter cards; right half is the player photo.
async function drawBottomComposition(ctx) {
    const lvl = getSelectedLevel();
    const player = lvl?.careerPlayer || null;

    const padX = 40;
    const padY = 28;
    const gap = 18;
    // Left half ends at slightly under 50% so the photo gets a bit more room.
    const leftHalfW = Math.round(W * 0.50);
    const cardsLeft = padX;
    const cardsTop = BOTTOM_TOP + padY;
    const cardsRight = leftHalfW - 16;
    const cardsBottom = H - padY;
    const cardsW = cardsRight - cardsLeft;
    const cardsH = cardsBottom - cardsTop;
    const cellW = (cardsW - gap) / 2;
    const cellH = (cardsH - gap) / 2;

    // Card positions: TL position, TR club logo, BL age, BR country flag.
    const cards = [
        { kind: "position", x: cardsLeft,                 y: cardsTop },
        { kind: "club",     x: cardsLeft + cellW + gap,   y: cardsTop },
        { kind: "age",      x: cardsLeft,                 y: cardsTop + cellH + gap },
        { kind: "country",  x: cardsLeft + cellW + gap,   y: cardsTop + cellH + gap },
    ];

    for (const c of cards) {
        await drawParamCard(ctx, c.kind, c.x, c.y, cellW, cellH, player);
    }

    // Player photo on the right half.
    await drawPlayerPhoto(ctx, leftHalfW, BOTTOM_TOP, W - leftHalfW, BOTTOM_H, player);
}

function drawCardBase(ctx, x, y, w, h) {
    ctx.save();
    // Subtle shadow
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.restore();

    // Subtle inner border
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 17);
    ctx.stroke();
    ctx.restore();
}

async function drawParamCard(ctx, kind, x, y, w, h, player) {
    drawCardBase(ctx, x, y, w, h);

    const cx = x + w / 2;
    const cy = y + h / 2;

    if (kind === "position") {
        const text = (player ? abbrevForPosition(player.position) : "") || "?";
        drawCardImpactText(ctx, text, cx, cy, w - 32, h - 32);
        return;
    }

    if (kind === "age") {
        // Big age number + "Year old" sub-label.
        const ageVal = player?.age != null && Number.isFinite(Number(player.age))
            ? String(Number(player.age))
            : "?";
        const labelH = Math.round(h * 0.20);
        const numberH = h - 32 - labelH - 8;
        drawCardImpactText(ctx, ageVal, cx, cy - labelH / 2 - 2, w - 32, numberH);
        ctx.save();
        ctx.fillStyle = "#111111";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        const labelSize = Math.max(18, Math.round(labelH * 0.78));
        ctx.font = `800 ${labelSize}px Impact, "Anton", "Oswald", sans-serif`;
        ctx.fillText("Year old", cx, y + h - 16 - labelH / 2);
        ctx.restore();
        return;
    }

    if (kind === "club") {
        const logoUrl = resolveClubLogoUrl(player?.club);
        if (logoUrl) {
            try {
                const img = await loadImage(logoUrl);
                drawImageContain(ctx, img, x + 18, y + 18, w - 36, h - 36);
                return;
            } catch { /* fall through */ }
        }
        // Fallback: club name text or "?"
        const fallback = String(player?.club || "").trim() || "?";
        drawCardImpactText(ctx, fallback, cx, cy, w - 32, h - 32);
        return;
    }

    if (kind === "country") {
        const flagUrl = resolveNationalityFlagUrl(player?.nationality);
        const r = Math.min(w, h) / 2 - 24;
        if (flagUrl) {
            try {
                const img = await loadImage(flagUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.clip();
                const ratio = Math.max((r * 2) / img.width, (r * 2) / img.height);
                const dw = img.width * ratio;
                const dh = img.height * ratio;
                ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
                ctx.restore();
                // Ring around flag
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.lineWidth = 4;
                ctx.strokeStyle = "rgba(0,0,0,0.18)";
                ctx.stroke();
                ctx.restore();
                return;
            } catch { /* fall through */ }
        }
        drawCardImpactText(ctx, "?", cx, cy, w - 32, h - 32);
    }
}

function drawCardImpactText(ctx, text, cx, cy, maxW, maxH) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    let fontSize = Math.round(maxH);
    ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
    while (fontSize > 24 && ctx.measureText(text).width > maxW) {
        fontSize -= 4;
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
    }
    ctx.lineWidth = Math.max(3, fontSize * 0.04);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = "#111111";
    ctx.fillText(text, cx, cy);
    ctx.restore();
}

function drawImageContain(ctx, img, x, y, w, h) {
    const ratio = Math.min(w / img.width, h / img.height);
    const dw = img.width * ratio;
    const dh = img.height * ratio;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function drawPlayerPhoto(ctx, x, y, w, h, player) {
    if (!player) {
        // Placeholder — large "?"
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `900 320px Impact, "Anton", "Oswald", sans-serif`;
        ctx.fillText("?", x + w / 2, y + h / 2);
        ctx.restore();
        return;
    }

    const urls = collectPlayerPhotoUrls(player);
    let drawn = false;
    for (const url of urls) {
        try {
            const img = await loadImage(url);
            // Cover-fit the photo into the right half, anchored slightly above center
            // (faces usually sit in the top third of football photos).
            const targetW = w;
            const targetH = h;
            const ratio = Math.max(targetW / img.width, targetH / img.height);
            const dw = img.width * ratio;
            const dh = img.height * ratio;
            const dx = x + (targetW - dw) / 2;
            const dy = y + (targetH - dh) * 0.35;
            ctx.save();
            // Soft clip to the right-half box so the photo doesn't bleed onto banner.
            ctx.beginPath();
            ctx.rect(x, y, targetW, targetH);
            ctx.clip();
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();
            drawn = true;
            break;
        } catch { /* try next */ }
    }

    if (!drawn) {
        // No photo loaded — show the player name as a fallback.
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const name = String(player.name || "?").toUpperCase();
        let fontSize = 64;
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
        while (fontSize > 24 && ctx.measureText(name).width > w - 40) {
            fontSize -= 4;
            ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
        }
        ctx.lineWidth = Math.max(3, fontSize * 0.06);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(name, x + w / 2, y + h / 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(name, x + w / 2, y + h / 2);
        ctx.restore();
    }
}

function getSelectedLevel() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx;
    if (idx >= 0 && idx < levels.length) return levels[idx];
    return null;
}

function collectPlayerPhotoUrls(player) {
    const urls = [];
    try {
        const paths = playerPhotoPaths(player, appState?.displayMode || "club") || [];
        for (const p of paths) {
            if (typeof p === "string" && p) urls.push(p);
        }
    } catch { /* ignore */ }
    // Also scan all club + nationality index entries for this player's name.
    try {
        const name = String(player?.name || "");
        const club = String(player?.club || "");
        const nat = String(player?.nationality || "");
        const clubIdx = appState?.playerImages?.club || {};
        const natIdx = appState?.playerImages?.nationality || {};
        if (name && club) {
            const suffix = `|${club}|${name}`;
            for (const k in clubIdx) {
                if (k.endsWith(suffix)) {
                    for (const p of clubIdx[k] || []) urls.push(p);
                }
            }
        }
        if (name && nat) {
            const suffix = `|${nat}|${name}`;
            for (const k in natIdx) {
                if (k.endsWith(suffix)) {
                    for (const p of natIdx[k] || []) urls.push(p);
                }
            }
        }
    } catch { /* ignore */ }
    // Dedupe while preserving order.
    const seen = new Set();
    return urls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

function resolveClubLogoUrl(clubName) {
    const target = String(clubName || "").trim();
    if (!target) return null;
    const clubs = Array.isArray(appState?.teamsIndex?.clubs) ? appState.teamsIndex.clubs : [];
    if (!clubs.length) return null;
    const targetLower = target.toLowerCase();
    let best = null;
    let bestScore = -1;
    for (const club of clubs) {
        const n = String(club?.name || "").toLowerCase();
        if (!n) continue;
        let score = -1;
        if (n === targetLower) score = 100;
        else if (n === `${targetLower} fc`) score = 92;
        else if (n.includes(targetLower)) score = 72;
        else if (targetLower.includes(n)) score = 68;
        if (score > bestScore) { best = club; bestScore = score; }
    }
    if (best && best.country && best.league) {
        return projectAssetUrl(`Images/Teams/${best.country}/${best.league}/${best.name}.png`);
    }
    return null;
}

function resolveNationalityFlagUrl(natRaw) {
    const nat = String(natRaw || "").trim();
    if (!nat) return null;
    if (nat === "England") return projectAssetUrl("Images/Nationality/Europe/England.png");
    const flagcodes = appState?.flagcodes || {};
    const code = flagcodes[nat];
    if (!code) return null;
    return `https://flagcdn.com/w320/${String(code).toLowerCase()}.png`;
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
