// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 4 Regular.
//
// "Guess The Player By Career Stats" thumbnail:
//   • Top 25% red banner with "GUESS BY CAREER STATS" (yellow accent on the
//     last two words), Impact font.
//   • "2025/6" season badge (vertical, top-right corner).
//   • Bottom 75% vibrant orange/red background.
//   • 3 large stat cards stacked vertically on the LEFT side:
//       - APPEARANCES + number
//       - GOALS + number
//       - ASSISTS + number
//     Numbers come from player.club_career_totals.{appearances,goals,assists}
//     (with fallback to player.{appearances,goals,assists}).
//   • Player photo on the RIGHT side — resolved via photo-helpers.playerPhotoPaths
//     (then a broad scan of appState.playerImages.club by player name).
//     If no photo can be resolved → tinted silhouette + player name.
//   • Optional secondary title bar (e.g. "Champion League") with auto-resolved
//     icon from Images/Icons/specific-title/ — or user-dropped custom icon.
//
// Regenerate cycles random palette + effect variant + which level's career player
// the stats sample is taken from. Composition is static — no animation, no DOM
// dependencies in the rendered canvas (so toBlob → PNG is clean).

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { playerPhotoPaths } from "./photo-helpers.js";

// ─── Per-runner config ─────────────────────────────────────────────────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS BY",
    titleYellow: "CAREER STATS",
    seasonLabel: "2025/6",
};

// ─── Palette pool — vibrant orange/red ─────────────────────────────────────
const PALETTES = [
    { banner: "#DC2626", bannerEdge: "#7F1D1D", bgTop: "#F97316", bgBot: "#9A3412", rays: "rgba(255,255,255,0.10)", cardBg: "#FFFFFF", cardLabel: "#7F1D1D" },
    { banner: "#B91C1C", bannerEdge: "#450A0A", bgTop: "#EA580C", bgBot: "#7C2D12", rays: "rgba(255,255,255,0.08)", cardBg: "#FFFFFF", cardLabel: "#7F1D1D" },
    { banner: "#EF4444", bannerEdge: "#991B1B", bgTop: "#FB923C", bgBot: "#9A3412", rays: "rgba(255,200,0,0.12)", cardBg: "#FFF7ED", cardLabel: "#7C2D12" },
    { banner: "#9F1239", bannerEdge: "#4C0519", bgTop: "#F59E0B", bgBot: "#7C2D12", rays: "rgba(255,255,255,0.10)", cardBg: "#FFFFFF", cardLabel: "#7F1D1D" },
    { banner: "#991B1B", bannerEdge: "#3F0A0A", bgTop: "#F97316", bgBot: "#451A03", rays: "rgba(255,255,255,0.07)", cardBg: "#FFF7ED", cardLabel: "#7F1D1D" },
];

// ─── Effect-variant pool — extra layers drawn on top of the background ────
const EFFECTS = [
    "rays-from-top",
    "rays-from-banner",
    "vignette",
    "diagonal-stripes",
    "spotlight-center",
];

// ─── Known competition icons ───────────────────────────────────────────────
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
const BANNER_H = Math.round(H * 0.25);   // 180px
const BG_TOP = BANNER_H;
const BG_H = H - BANNER_H;               // 540px

async function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const palette = PALETTES[state.paletteIdx % PALETTES.length];
    const effect = EFFECTS[state.effectIdx % EFFECTS.length];

    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx, palette);
    drawEffectLayer(ctx, effect, palette);
    await drawPlayerAndCards(ctx, palette);
    drawBanner(ctx, palette);
    drawSeasonBadge(ctx);
    await drawSpecificTitle(ctx);
}

function drawBackground(ctx, palette) {
    const grd = ctx.createLinearGradient(0, BG_TOP, 0, H);
    grd.addColorStop(0, palette.bgTop);
    grd.addColorStop(1, palette.bgBot);
    ctx.fillStyle = grd;
    ctx.fillRect(0, BG_TOP, W, BG_H);
}

function drawEffectLayer(ctx, effect, palette) {
    ctx.save();
    if (effect === "rays-from-top" || effect === "rays-from-banner") {
        const cx = W / 2;
        const cy = effect === "rays-from-banner" ? BG_TOP - 10 : 0;
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
        ctx.fillRect(0, BG_TOP, W, BG_H);
    } else if (effect === "diagonal-stripes") {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        const stripeW = 60;
        for (let x = -BG_H; x < W + BG_H; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, BG_TOP);
            ctx.lineTo(x + stripeW, BG_TOP);
            ctx.lineTo(x + stripeW + BG_H, H);
            ctx.lineTo(x + BG_H, H);
            ctx.closePath();
            ctx.fill();
        }
    } else if (effect === "spotlight-center") {
        const grd = ctx.createRadialGradient(W / 2, BG_TOP + BG_H / 2, 50, W / 2, BG_TOP + BG_H / 2, 600);
        grd.addColorStop(0, "rgba(255,255,255,0.20)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, BG_TOP, W, BG_H);
    }
    ctx.restore();
}

// ─── Player + cards (bottom 75%) ──────────────────────────────────────────
async function drawPlayerAndCards(ctx, palette) {
    const player = getCurrentPlayer();
    const stats = readPlayerStats(player);

    // Layout: cards on the left, photo on the right.
    const innerTop = BG_TOP + 22;
    const innerBot = H - 110;        // leave room for the optional sub-pill below
    const innerH = innerBot - innerTop;

    const cardX = 36;
    const cardW = 540;
    const cardGap = 14;
    const cardH = Math.floor((innerH - cardGap * 2) / 3);

    const photoX = cardX + cardW + 36;
    const photoW = W - photoX - 36;
    const photoH = innerH;

    // Draw photo first so the cards layer slightly over the photo edge for depth.
    await drawPlayerPhoto(ctx, player, photoX, innerTop, photoW, photoH, palette);

    // Draw the 3 stat cards.
    drawStatCard(ctx, cardX, innerTop + 0 * (cardH + cardGap), cardW, cardH, "APPEARANCES", stats.appearances, palette);
    drawStatCard(ctx, cardX, innerTop + 1 * (cardH + cardGap), cardW, cardH, "GOALS",        stats.goals,        palette);
    drawStatCard(ctx, cardX, innerTop + 2 * (cardH + cardGap), cardW, cardH, "ASSISTS",      stats.assists,      palette);
}

function getCurrentPlayer() {
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    const idx = state.sourceLevelIdx;
    const lvl = idx >= 0 && idx < levels.length ? levels[idx] : null;
    return lvl?.careerPlayer || null;
}

function readPlayerStats(player) {
    const out = { appearances: "—", goals: "—", assists: "—" };
    if (!player) return out;
    const club = player.club_career_totals || {};
    const nat = player.national_team_career_totals || {};
    const pick = (key) => {
        // Top-level direct (per spec) takes precedence; otherwise sum club+nat totals.
        if (player[key] != null && Number.isFinite(Number(player[key]))) return String(Number(player[key]));
        const vClub = Number.isFinite(Number(club[key])) ? Number(club[key]) : null;
        const vNat = Number.isFinite(Number(nat[key])) ? Number(nat[key]) : null;
        if (vClub === null && vNat === null) return "—";
        return String((vClub ?? 0) + (vNat ?? 0));
    };
    out.appearances = pick("appearances");
    out.goals = pick("goals");
    out.assists = pick("assists");
    return out;
}

function drawStatCard(ctx, x, y, w, h, label, value, palette) {
    // Drop shadow
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    roundRect(ctx, x + 5, y + 7, w, h, 18);
    ctx.fill();
    ctx.restore();

    // Card body
    ctx.save();
    ctx.fillStyle = palette.cardBg;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    roundRect(ctx, x, y, w, h, 18);
    ctx.stroke();

    // Yellow accent strip on the left edge
    ctx.fillStyle = "#FACC15";
    roundRect(ctx, x, y, 14, h, 18);
    ctx.fill();
    ctx.restore();

    // Number — large Impact, right side of the card
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    const numStr = String(value);
    let numSize = Math.floor(h * 0.78);
    do {
        ctx.font = `900 ${numSize}px Impact, "Anton", "Oswald", sans-serif`;
        if (ctx.measureText(numStr).width <= w * 0.45) break;
        numSize -= 4;
    } while (numSize > 24);
    ctx.lineWidth = Math.max(3, numSize * 0.06);
    ctx.strokeStyle = "#000000";
    const numX = x + w - 28;
    const numY = y + h / 2;
    ctx.strokeText(numStr, numX, numY);
    ctx.fillStyle = palette.banner;
    ctx.fillText(numStr, numX, numY);
    ctx.restore();

    // Label — left aligned, smaller, sits next to the yellow strip
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const labelSize = Math.floor(h * 0.32);
    ctx.font = `900 ${labelSize}px Impact, "Anton", "Oswald", sans-serif`;
    ctx.lineWidth = Math.max(2, labelSize * 0.08);
    ctx.strokeStyle = "#000000";
    const lx = x + 34;
    const ly = y + h / 2;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = palette.cardLabel;
    ctx.fillText(label, lx, ly);
    ctx.restore();
}

async function drawPlayerPhoto(ctx, player, x, y, w, h, palette) {
    // Background plate behind the photo — soft, slightly darker than the bg.
    ctx.save();
    const plate = ctx.createRadialGradient(x + w / 2, y + h * 0.45, 40, x + w / 2, y + h * 0.5, Math.max(w, h) * 0.7);
    plate.addColorStop(0, "rgba(0,0,0,0.18)");
    plate.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = plate;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    const src = resolvePlayerPhotoSrc(player);
    if (src) {
        try {
            const img = await loadImage(src);
            // Contain fit so the player's head/upper body is preserved.
            const ratio = Math.min(w / img.width, h / img.height);
            const dw = img.width * ratio;
            const dh = img.height * ratio;
            const dx = x + (w - dw) / 2;
            const dy = y + (h - dh) / 2;
            ctx.drawImage(img, dx, dy, dw, dh);
            return;
        } catch {
            // fall through to silhouette
        }
    }
    drawSilhouetteFallback(ctx, player, x, y, w, h, palette);
}

function resolvePlayerPhotoSrc(player) {
    if (!player) return null;
    const name = String(player.name || "").trim();
    if (!name) return null;

    // Try the runner's own resolver first (uses current level's selectedEntry/squad).
    try {
        const paths = playerPhotoPaths(player, "club");
        if (Array.isArray(paths) && paths.length > 0) {
            return projectAssetUrl(paths[0]);
        }
    } catch { /* ignore */ }

    // Broad scan: any club-folder key that ends with `|<name>`.
    const clubMap = appState?.playerImages?.club || null;
    if (clubMap && typeof clubMap === "object") {
        const suffix = `|${name}`;
        for (const key in clubMap) {
            if (key.endsWith(suffix)) {
                const arr = clubMap[key];
                if (Array.isArray(arr) && arr.length > 0) return projectAssetUrl(arr[0]);
            }
        }
    }
    const natMap = appState?.playerImages?.nationality || null;
    if (natMap && typeof natMap === "object") {
        const suffix = `|${name}`;
        for (const key in natMap) {
            if (key.endsWith(suffix)) {
                const arr = natMap[key];
                if (Array.isArray(arr) && arr.length > 0) return projectAssetUrl(arr[0]);
            }
        }
    }
    return null;
}

function drawSilhouetteFallback(ctx, player, x, y, w, h, palette) {
    // Tinted silhouette (head + shoulders) and the player's name below it.
    ctx.save();
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    const headR = Math.min(w, h) * 0.18;

    // Head
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.arc(cx, cy, headR, 0, Math.PI * 2);
    ctx.fill();
    // Shoulders / torso
    ctx.beginPath();
    ctx.moveTo(cx - headR * 2.4, y + h * 0.95);
    ctx.quadraticCurveTo(cx - headR * 2.2, cy + headR * 0.6, cx - headR * 1.0, cy + headR * 0.9);
    ctx.lineTo(cx + headR * 1.0, cy + headR * 0.9);
    ctx.quadraticCurveTo(cx + headR * 2.2, cy + headR * 0.6, cx + headR * 2.4, y + h * 0.95);
    ctx.closePath();
    ctx.fill();

    // Yellow ring around head
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#FACC15";
    ctx.beginPath();
    ctx.arc(cx, cy, headR + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Name plate at the bottom
    const name = String(player?.name || "Unknown player").toUpperCase();
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    let nSize = Math.floor(h * 0.075);
    do {
        ctx.font = `900 ${nSize}px Impact, "Anton", "Oswald", sans-serif`;
        if (ctx.measureText(name).width <= w * 0.94) break;
        nSize -= 2;
    } while (nSize > 14);
    ctx.lineWidth = Math.max(3, nSize * 0.08);
    ctx.strokeStyle = "#000000";
    const ny = y + h - nSize * 0.8;
    ctx.strokeText(name, x + w / 2, ny);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(name, x + w / 2, ny);
    ctx.restore();
}

// ─── Banner / season / sub-pill ───────────────────────────────────────────
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
    const pillY = H - pillH - 16;
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
        const title = (state.specificTitle || "career-stats-thumbnail").trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "career-stats-thumbnail";
        a.download = `${title}-1280x720.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
}
