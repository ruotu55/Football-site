// js/thumbnail-studio.js — YouTube thumbnail generator (1280×720) for Runner 3 Regular.
//
// Opens a full-screen overlay with a canvas, a control rail (Regenerate, Specific
// title + icon, Download PNG, Back), and renders a static thumbnail composed of:
//   • Top 25% banner with "GUESS BY CAREER PATH" (yellow accent on "CAREER PATH"),
//     Impact font.
//   • "2025/6" season badge (vertical, top-right corner).
//   • Bottom 75% blue/purple background with a centered player photo and a row of
//     up to 6 circular club logos (most recent transfer steps) labelled with the
//     year of that transfer.
//   • Optional secondary title bar (e.g. "Champion League") with auto-resolved
//     icon from Images/Icons/specific-title/ — or user-dropped custom icon.
//
// Regenerate cycles random palette + effect variant + which save's level the
// player/career-history is sampled from. The composition stays static — no
// animation, no DOM dependencies in the rendered canvas (so toBlob → PNG is clean).

import { appState } from "./state.js";
import {
    projectAssetUrl,
    careerReadyPhotoRelCandidates,
} from "./paths.js";
import { getClubLogoOtherTeamsRelPath } from "./photo-helpers.js";

// ─── Per-runner config (everything that distinguishes this runner) ──────────
const RUNNER_CONFIG = {
    titleWhite: "GUESS BY",
    titleYellow: "CAREER PATH",
    seasonLabel: "2025/6",
    careerCircles: 6,           // most-recent N steps from transfer_history
};

// ─── Palette pool — Regenerate cycles one of these ──────────────────────────
// Blue/purple background palettes (matches the screenshot reference). Banner
// stays red so the channel branding is consistent with sibling runners.
const PALETTES = [
    { banner: "#DC2626", bannerEdge: "#7F1D1D", pitch: "#1E3A8A", pitchEdge: "#0B1437", rays: "rgba(180,200,255,0.10)" },
    { banner: "#B91C1C", bannerEdge: "#450A0A", pitch: "#3730A3", pitchEdge: "#1E1B4B", rays: "rgba(255,255,255,0.10)" },
    { banner: "#EF4444", bannerEdge: "#991B1B", pitch: "#4338CA", pitchEdge: "#1E1B4B", rays: "rgba(200,160,255,0.12)" },
    { banner: "#7F1D1D", bannerEdge: "#1F0606", pitch: "#5B21B6", pitchEdge: "#2E1065", rays: "rgba(255,255,255,0.10)" },
    { banner: "#991B1B", bannerEdge: "#3F0A0A", pitch: "#2563EB", pitchEdge: "#0B1437", rays: "rgba(255,210,120,0.08)" },
];

// ─── Effect-variant pool — extra layers drawn on top of the background ─────
const EFFECTS = [
    "rays-from-top",
    "rays-from-banner",
    "vignette",
    "diagonal-stripes",
    "spotlight-center",
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
        if (!lvl || lvl.isIntro || lvl.isOutro || lvl.isLogo || lvl.isBonus) continue;
        if (!lvl.careerPlayer || !lvl.careerPlayer.name) continue;
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
    await drawCareerComposition(ctx);
    drawBanner(ctx, palette);
    drawSeasonBadge(ctx);
    await drawSpecificTitle(ctx);
}

function drawPitchBackground(ctx, palette) {
    // Radial gradient gives the blue/purple "stage" feel that matches the
    // reference screenshot (bright center, dark edges).
    const grd = ctx.createRadialGradient(
        W / 2, PITCH_TOP + PITCH_H * 0.5, 80,
        W / 2, PITCH_TOP + PITCH_H * 0.5, Math.max(W, PITCH_H),
    );
    grd.addColorStop(0, palette.pitch);
    grd.addColorStop(1, palette.pitchEdge);
    ctx.fillStyle = grd;
    ctx.fillRect(0, PITCH_TOP, W, PITCH_H);
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
        const grd = ctx.createRadialGradient(W / 2, PITCH_TOP + PITCH_H * 0.45, 50, W / 2, PITCH_TOP + PITCH_H * 0.45, 600);
        grd.addColorStop(0, "rgba(255,255,255,0.22)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, PITCH_TOP, W, PITCH_H);
    }
    ctx.restore();
}

// ─── Bottom-75% career composition ─────────────────────────────────────────
async function drawCareerComposition(ctx) {
    const { player, history } = collectCareerSourceForCurrentLevel();
    const cap = RUNNER_CONFIG.careerCircles;
    // Most recent N transfer steps. transfer_history is ordered oldest → newest,
    // so slice the tail.
    const steps = Array.isArray(history) && history.length > 0
        ? history.slice(Math.max(0, history.length - cap))
        : [];

    // Layout: player photo occupies the upper portion of the pitch area, with
    // the row of club circles along the bottom.
    const circleR = 60;
    const circleRowY = PITCH_TOP + PITCH_H - circleR - 60;
    const photoBoxTop = PITCH_TOP + 18;
    const photoBoxBottom = circleRowY - circleR - 30;
    const photoBoxH = Math.max(120, photoBoxBottom - photoBoxTop);
    const photoBoxCX = W / 2;
    const photoBoxCY = photoBoxTop + photoBoxH / 2;

    await drawPlayerPhotoOrSilhouette(ctx, player, photoBoxCX, photoBoxCY, photoBoxH);
    await drawCareerCircles(ctx, steps, circleRowY, circleR);
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
        history = Array.isArray(player?.transfer_history) ? player.transfer_history : [];
    }
    return { player, history, lvl };
}

async function drawPlayerPhotoOrSilhouette(ctx, player, cx, cy, boxH) {
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
        // contain-fit, keep aspect, prefer height-driven scale (player photos
        // are portrait).
        const targetH = boxH;
        const ratio = targetH / img.height;
        const w = img.width * ratio;
        const h = targetH;
        ctx.save();
        // Soft drop shadow behind the player.
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 10;
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
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

async function drawCareerCircles(ctx, steps, rowCY, r) {
    const count = Math.min(steps.length, RUNNER_CONFIG.careerCircles);
    if (count === 0) return;

    // Even horizontal spacing across the canvas, padded from the edges.
    const pad = 90;
    const innerW = W - pad * 2;
    const gap = count === 1 ? 0 : innerW / (count - 1 || 1);

    for (let i = 0; i < count; i++) {
        const cx = count === 1 ? W / 2 : pad + gap * i;
        const cy = rowCY;
        const step = steps[i] || {};
        const clubName = String(step.club || "").trim();
        const year = String(step.year || "").trim();
        await drawSingleCareerCircle(ctx, cx, cy, r, clubName, year);
    }
}

async function drawSingleCareerCircle(ctx, cx, cy, r, clubName, year) {
    // White outer ring + soft drop shadow for separation from the background.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    // Inner circle — try to load a logo, otherwise paint a white disc with the
    // club initials in Impact as the fallback (per task spec).
    const candidates = buildClubLogoCandidates(clubName);
    let logoImg = null;
    for (const src of candidates) {
        try {
            logoImg = await loadImage(src);
            if (logoImg) break;
        } catch { /* try next */ }
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // White background inside the clip — makes transparent crests pop on the
    // dark blue/purple stage.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (logoImg) {
        // contain-fit inside the circle (don't crop a square club crest).
        const fitRatio = Math.min((r * 1.7) / logoImg.width, (r * 1.7) / logoImg.height);
        const w = logoImg.width * fitRatio;
        const h = logoImg.height * fitRatio;
        ctx.drawImage(logoImg, cx - w / 2, cy - h / 2, w, h);
    } else {
        // Acceptable fallback: club name shorthand in Impact, centered.
        const label = clubInitialsLabel(clubName);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontSize = Math.round(r * 0.7);
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
        ctx.fillStyle = "#1f2937";
        ctx.fillText(label, cx, cy);
    }
    ctx.restore();

    // Dark ring on top of the disc for definition.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
    ctx.restore();

    // Year label below the circle.
    if (year) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const fontSize = 30;
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Oswald", sans-serif`;
        ctx.lineWidth = Math.max(3, fontSize * 0.10);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(year, cx, cy + r + 14);
        ctx.fillStyle = "#FACC15";
        ctx.fillText(year, cx, cy + r + 14);
        ctx.restore();
    }
}

function buildClubLogoCandidates(clubName) {
    const name = String(clubName || "").trim();
    if (!name) return [];
    // 1) teamsIndex lookup — gives canonical Images/Teams/<country>/<league>/<name>.png
    const out = [];
    const seen = new Set();
    const push = (rel) => {
        if (!rel) return;
        const url = projectAssetUrl(rel);
        if (seen.has(url)) return;
        seen.add(url);
        out.push(url);
    };
    const clubs = Array.isArray(appState.teamsIndex?.clubs) ? appState.teamsIndex.clubs : [];
    const match = clubs.find((c) => String(c?.name || "").toLowerCase() === name.toLowerCase());
    if (match) {
        if (match.country && match.league) {
            push(`Images/Teams/${match.country}/${match.league}/${match.name}.png`);
            push(`Teams Images/${match.country}/${match.league}/${match.name}.png`);
        }
        if (match.path) {
            push(match.path.replace(".Storage/Squad Formation/Teams/", "Images/Teams/").replace(".json", ".png"));
        }
    }
    // 2) Loose "Other Teams" fallback.
    const otherRel = getClubLogoOtherTeamsRelPath(name);
    if (otherRel) push(otherRel);
    return out;
}

function clubInitialsLabel(clubName) {
    const n = String(clubName || "").trim();
    if (!n) return "?";
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

// ─── Banner / season badge / specific title (identical to canonical) ──────
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
