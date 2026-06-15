/**
 * PREP PANEL — renders EVERY question level of the loaded save as a stacked
 * section. Each section body is now a 3-TAB block:
 *   1. ASSETS    — the EXISTING editable per-level content (the lineup/pitch
 *                  editor + the team panel editor with Save Team / LOGO / Rename)
 *                  PLUS small asset cards (team crest · country flag · Data).
 *                  ALL editing keeps working — the real editable DOM lives here.
 *   2. QUESTIONS — a STATIC faithful 1920×1080 frame of the QUESTION state
 *                  (11 flag cards on the 3D pitch + level badge + timer), scaled
 *                  into a 16:9 box.
 *   3. ANSWER    — a STATIC faithful frame of the ANSWER state (11 photo+name
 *                  cards + the reveal panel slid in on the left).
 *
 * The static frames replicate ___Remotion___/1_…_Remotion/src/scenes/Level.tsx
 * (+ components/PlayerSlot.tsx + RevealPanel.tsx) VERBATIM (every number/colour
 * copied), reusing the runner's OWN data resolvers (formation slot x/y, the
 * per-level XI, each player's nationality flag + photo + display name, and the
 * team crest / name / country flag) so the preview shows EXACTLY what renders.
 *
 * All existing slot handlers act on the "current" level (getState() at click
 * time): each section owns its own .pitch-slots container and we swap
 * appState.currentLevelIndex + appState.els.pitchSlots on pointerdown (capture
 * phase) before any click handler runs.
 */
import { appState, getState } from "./state.js";
import {
  renderPitch,
  resolveHeaderTeamDisplayName,
  applyTeamRename,
  resolvePlayerNationalityLabel,
  pitchSlotDisplayLabel,
} from "./pitch-render.js";
import {
  toggleSaveTeamForCurrentEntry,
  hasSavedTeamForCurrentEntry,
} from "./saved-team-layouts.js";
import { pickStartingXI } from "./pick-xi.js";
import { formationById } from "./formations.js";
import { playerPhotoPathsForLevel, pitchLabelFromPlayerName } from "./photo-helpers.js";
import { projectAssetUrl, projectAssetUrlFresh, bumpAssetCacheBust } from "./paths.js";

const TEAM_LOGO_FETCH_ENDPOINT = "/__team-logo/fetch";
const TEAM_LOGO_DELETE_ENDPOINT = "/__team-logo/delete";

/* Tiny 2-option chooser shown next to the LOGO button. Resolves to
   "page" (football-logos.cc), "image" (direct image URL), or null (dismissed).
   Inline-styled so it needs no CSS and stays consistent across runners. */
function chooseLogoSource(anchorBtn) {
  return new Promise((resolve) => {
    document.getElementById("prep-logo-source-pop")?.remove();
    const pop = document.createElement("div");
    pop.id = "prep-logo-source-pop";
    pop.style.cssText =
      "position:fixed;z-index:100200;background:#1b1f2a;border:1px solid #3a4256;" +
      "border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.55);min-width:210px;";
    const mkBtn = (label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "appearance:none;border:1px solid #4a5470;background:#262c3b;color:#eef1f8;" +
        "font:600 13px/1.2 system-ui,sans-serif;padding:9px 10px;border-radius:8px;" +
        "cursor:pointer;text-align:left;";
      b.addEventListener("mouseenter", () => { b.style.background = "#323a4e"; });
      b.addEventListener("mouseleave", () => { b.style.background = "#262c3b"; });
      return b;
    };
    const pageBtn = mkBtn("football-logos.cc (3000px)");
    const urlBtn = mkBtn("Image URL");
    pop.append(pageBtn, urlBtn);

    let done = false;
    const cleanup = (val) => {
      if (done) return;
      done = true;
      document.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("resize", onDismiss, true);
      pop.remove();
      resolve(val);
    };
    const onOutside = (ev) => {
      if (!pop.contains(ev.target)) cleanup(null);
    };
    const onDismiss = () => cleanup(null);
    pageBtn.addEventListener("click", (ev) => { ev.stopPropagation(); cleanup("page"); });
    urlBtn.addEventListener("click", (ev) => { ev.stopPropagation(); cleanup("image"); });

    document.body.appendChild(pop);
    const r = anchorBtn?.getBoundingClientRect?.() || { left: 20, bottom: 20 };
    const pw = pop.offsetWidth || 210;
    const ph = pop.offsetHeight || 90;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${Math.max(8, top)}px`;

    setTimeout(() => {
      document.addEventListener("mousedown", onOutside, true);
      window.addEventListener("resize", onDismiss, true);
    }, 0);
  });
}

let root = null;
let sections = []; // [{ levelIndex, sectionEl, slotsEl, headEl }]

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function questionLevelIndexes() {
  const out = [];
  (appState.levelsData || []).forEach((lvl, i) => {
    if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isOutro) return;
    // Only levels that actually have a team — the 30 empty init levels before
    // a save is picked would otherwise render as "(no team loaded)" noise.
    if (!lvl.currentSquad) return;
    out.push(i); // bonus levels are questions too — keep them
  });
  return out;
}

/** Same shell structure app.js used to build into the single pitch. */
function buildSlotsContainer() {
  const wrap = document.createElement("div");
  wrap.className = "pitch-slots";
  for (let i = 0; i < 11; i++) {
    const div = document.createElement("div");
    div.className = "player-slot empty";
    div.dataset.slotIndex = String(i);
    const mount = document.createElement("div");
    mount.className = "slot-mount";
    div.appendChild(mount);
    wrap.appendChild(div);
  }
  return wrap;
}

/* Country folder from the crest path — same rule as Remotion build-data:
   "Images/Teams/<Country>/<Team>.png". */
function countryFromImagePath(imagePath) {
  const parts = String(imagePath || "").split(/[/\\]/);
  return parts[1] === "Teams" && parts[2] !== "Competitions" ? (parts[2] || "") : "";
}

/** Override-aware team name for a specific level (lvl IS a state object). */
function teamDisplayName(lvl) {
  try {
    const resolved = resolveHeaderTeamDisplayName(lvl, "club-by-nat");
    if (resolved) return resolved;
  } catch { /* fall through */ }
  return lvl?.currentSquad?.name || "";
}

/** Flagcdn (or repo England) URL for a player's nationality — the SAME chain the
 *  on-pitch front face uses (pitch-render renderSlot). null if no flag code. */
function playerFlagUrl(player) {
  const natLabel = resolvePlayerNationalityLabel(player?.nationality);
  const code = natLabel ? appState.flagcodes?.[natLabel] : "";
  if (!code) return null;
  if (natLabel === "England") return projectAssetUrl("Images/Nationality/Europe/England.png");
  return `https://flagcdn.com/w320/${String(code).toLowerCase()}.png`;
}

/** First resolvable photo URL for a player in THIS level (mirrors the card). */
function playerPhotoUrl(player, lvl) {
  const rels = playerPhotoPathsForLevel(player, lvl) || [];
  return rels.length ? projectAssetUrl(rels[0]) : null;
}

/** The 11-slot XI for a level, resolved exactly as renderPitch does: a valid
 *  per-level customXi (saved layout / edits), else pickStartingXI. */
function resolveLevelXi(lvl) {
  const formation = formationById(lvl?.formationId);
  if (!lvl?.currentSquad) return { formation, xi: Array(formation.slots.length).fill(null) };
  if (
    Array.isArray(lvl.customXi) &&
    lvl.customXi.length === formation.slots.length &&
    lvl.lastFormationId === lvl.formationId
  ) {
    return { formation, xi: lvl.customXi };
  }
  let xi;
  try {
    xi = pickStartingXI(formation, lvl.currentSquad);
  } catch {
    xi = Array(formation.slots.length).fill(null);
  }
  return { formation, xi };
}

// ════════════════════════════════════════════════════════════════════════════
// FAITHFUL REMOTION FRAME PREVIEW — a 1:1 replica of the video's level layout,
// scaled into a 16:9 box. Every number/colour below is COPIED VERBATIM from
// ___Remotion___/1_…_Remotion/src/scenes/Level.tsx + components/PlayerSlot.tsx +
// components/RevealPanel.tsx. The stage is a fixed 1920×1080 div; a shared
// ResizeObserver scales it to the box width.
// ════════════════════════════════════════════════════════════════════════════
const FRAME_W = 1920;
const FRAME_H = 1080;

// Pitch surface (Level.tsx).
const PITCH_PLAN_RATIO = 1.28;
const PITCH_TILT = 38;
const PITCH_SURFACE_W = 1280;
const PITCH_SURFACE_H = PITCH_SURFACE_W / PITCH_PLAN_RATIO; // 1000
const SLOT_WIDTH_PCT = 14.7;
const SURFACE_SCALE = 1.0925;
const SURFACE_TY_PCT = -11;
const PITCH_SHIFT_Y = -8;
const PERSP = 1200;
const REVEAL_PANEL_W = 380; // RevealPanel.tsx PANEL_WIDTH
const REVEAL_PITCH_SHIFT_X = 150; // Level.tsx pitchShiftX at revealProgress=1

// Per-slot depth scale (Level.tsx slotZ / sizeComp).
const slotZ = (yPct) => {
  const tiltRad = (PITCH_TILT * Math.PI) / 180;
  const tY = (SURFACE_TY_PCT / 100) * PITCH_SURFACE_H;
  const oy = (yPct / 100) * PITCH_SURFACE_H - PITCH_SURFACE_H / 2;
  return (oy * SURFACE_SCALE + tY) * Math.sin(tiltRad) + 60;
};
const Z_REF = slotZ(58);
const sizeComp = (yPct) => (PERSP - slotZ(yPct)) / (PERSP - Z_REF);

// Soft-edged circular clip (PlayerSlot.tsx CIRCLE_MASK).
const CIRCLE_MASK = "radial-gradient(circle at 50% 50%, #000 calc(50% - 1px), rgba(0,0,0,0) 50%)";
const FLAG_CIRCLE_SCALE = 1.38;

const setStyle = (el, s) => { Object.assign(el.style, s); return el; };
const mkDiv = (s) => setStyle(document.createElement("div"), s || {});

/** One pitch player card — STATIC. state "question" = flag circle front; state
 *  "answer" = photo+name back card. Replicates PlayerSlot.tsx at flip 0 / 1.
 *  `slotPos` = { x, y } formation percentages; `player` null → empty slot. */
function previewPlayerSlot(player, slotPos, lvl, state) {
  const answer = state === "answer";
  const yPct = slotPos?.y ?? 50;
  const xPct = slotPos?.x ?? 50;
  const comp = sizeComp(yPct);

  const slot = mkDiv({
    position: "absolute",
    left: `${xPct}%`,
    top: `${yPct}%`,
    width: `${SLOT_WIDTH_PCT}%`,
    aspectRatio: "10 / 12",
    transform: `translate(-50%, -50%) translateZ(60px) rotateX(${-PITCH_TILT}deg) scale(${comp})`,
    transformStyle: "preserve-3d",
  });
  if (!player) return slot;

  const inner = mkDiv({
    position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
  });
  slot.appendChild(inner);

  if (!answer) {
    // FRONT: nationality flag in a white circle (flip=0 → innerScale 1.38).
    const face = mkDiv({
      position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
      transform: `scale(${FLAG_CIRCLE_SCALE})`,
    });
    const disc = mkDiv({
      position: "absolute", top: "50%", left: "50%", width: "100%", aspectRatio: "1 / 1",
      transform: "translate(-50%, -50%)",
      background: "rgba(255,255,255,0.92)",
      WebkitMaskImage: CIRCLE_MASK, maskImage: CIRCLE_MASK,
      filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.45))",
    });
    const flagUrl = playerFlagUrl(player);
    if (flagUrl) {
      const img = setStyle(document.createElement("img"), {
        position: "absolute", inset: "3.2%", width: "93.6%", height: "93.6%",
        objectFit: "cover", WebkitMaskImage: CIRCLE_MASK, maskImage: CIRCLE_MASK,
      });
      img.alt = "";
      img.src = flagUrl;
      disc.appendChild(img);
    }
    face.appendChild(disc);
    inner.appendChild(face);
    return slot;
  }

  // BACK: white card (scale 0.8) with player photo + red name band (flip=1).
  const card = mkDiv({
    position: "absolute", inset: "0", transform: "scale(0.8)",
    display: "flex", flexDirection: "column",
    border: "3px solid #ffffff", borderRadius: "14%", overflow: "hidden",
    background: "#ffffff", boxShadow: "0 10px 22px rgba(0,0,0,0.5)",
  });
  const photoWrap = mkDiv({
    flex: "1", minHeight: "0", position: "relative",
    background: "linear-gradient(180deg, #eef1f5 0%, #d9dee6 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
  });
  const photoUrl = playerPhotoUrl(player, lvl);
  const showInitial = () => {
    const ph = mkDiv({
      width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", fontSize: "40px",
      color: "rgba(20,28,40,0.45)",
    });
    ph.textContent = String(player.name || "?").charAt(0).toUpperCase();
    photoWrap.appendChild(ph);
  };
  if (photoUrl) {
    const img = setStyle(document.createElement("img"), {
      width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 12%", display: "block",
    });
    img.alt = "";
    img.onerror = () => { img.remove(); showInitial(); };
    img.src = photoUrl;
    photoWrap.appendChild(img);
  } else {
    showInitial();
  }
  const band = mkDiv({
    flex: "0 0 28%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(180deg, #ef5350 0%, #c62828 100%)",
    borderTop: "2px solid #14121f", boxShadow: "0 -1px 0 rgba(255,255,255,0.12) inset",
    // Black name on the red band — matches the editable Assets card + the video.
    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", color: "#111111",
    textTransform: "uppercase", letterSpacing: "0", fontSize: "30px", lineHeight: "1",
    padding: "0 2%", textAlign: "center", whiteSpace: "nowrap", textShadow: "none",
  });
  // Override-aware label (custom NAME edit / shared override) so the preview
  // matches the editable Assets card AND the rendered video — not the raw name.
  band.textContent = pitchSlotDisplayLabel(lvl, player) || pitchLabelFromPlayerName(player.name) || "";
  card.append(photoWrap, band);
  inner.appendChild(card);
  return slot;
}

/** Level badge disc (Level.tsx LevelBadge) — static at pop=1. */
function previewLevelBadge(n) {
  const wrap = mkDiv({ position: "absolute", top: "34px", left: "40px", zIndex: "60" });
  const disc = setStyle(document.createElement("div"), {
    width: "156px", height: "156px", borderRadius: "50%",
    background: "radial-gradient(circle at 50% 32%, #ffdf73 0%, #f7a81b 62%, #e07d09 100%)",
    border: "7px solid rgba(255,255,255,0.94)",
    boxShadow: "0 18px 38px rgba(0,0,0,0.55), inset 0 -8px 18px rgba(0,0,0,0.18)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", fontSize: "93px",
    lineHeight: "1", color: "#241500", textShadow: "0 2px 0 rgba(255,255,255,0.25)",
  });
  disc.textContent = String(n);
  wrap.appendChild(disc);
  return wrap;
}

/** Timer disc (Level.tsx Timer) — static; `secs` is the number shown, r=66. */
function previewTimer(secs) {
  const wrap = mkDiv({ position: "absolute", top: "34px", right: "40px", width: "162px", height: "162px", zIndex: "60" });
  wrap.innerHTML =
    '<svg width="162" height="162" style="display:block;filter:drop-shadow(0 14px 28px rgba(0,0,0,0.5))">' +
    '<circle cx="81" cy="81" r="66" fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" stroke-width="14"></circle>' +
    '<circle cx="81" cy="81" r="66" fill="none" stroke="#f7a81b" stroke-width="14" stroke-linecap="round" transform="rotate(-90 81 81)"></circle>' +
    "</svg>";
  const num = setStyle(document.createElement("div"), {
    position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", fontSize: "72px",
    color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)",
  });
  num.textContent = String(secs == null ? 3 : secs);
  wrap.appendChild(num);
  return wrap;
}

/** Reveal panel (RevealPanel.tsx) at slide=1 (final position) — STATIC. */
function previewRevealPanel(lvl) {
  const cs = lvl?.currentSquad;
  const panel = mkDiv({
    position: "absolute", top: "0", bottom: "0", left: "0", width: `${REVEAL_PANEL_W}px`,
    background: "linear-gradient(165deg, rgba(40,90,56,0.44) 0%, rgba(12,28,18,0.46) 62%, rgba(6,9,14,0.4) 100%)",
    borderRight: "1.5px solid rgba(255,255,255,0.22)",
    borderTopRightRadius: "36px", borderBottomRightRadius: "36px",
    boxShadow: "26px 0 70px rgba(0,0,0,0.5), inset 0 0 70px rgba(255,255,255,0.06)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "64px 32px", overflow: "hidden", zIndex: "70",
  });
  // top sheen
  panel.appendChild(mkDiv({
    position: "absolute", inset: "0", pointerEvents: "none",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 26%), radial-gradient(120% 50% at 50% 0%, rgba(255,255,255,0.10), transparent 60%)",
  }));

  // 1 — crest
  if (cs?.imagePath) {
    const crest = setStyle(document.createElement("img"), {
      width: "296px", height: "296px", objectFit: "contain",
      filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.55))", zIndex: "2",
    });
    crest.alt = "";
    crest.src = projectAssetUrl(cs.imagePath);
    panel.appendChild(crest);
  }

  // 2 — team name
  const name = setStyle(document.createElement("div"), {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", fontSize: "56px",
    lineHeight: "0.96", color: "#fff", textAlign: "center", letterSpacing: "1px",
    textTransform: "uppercase", textShadow: "0 4px 16px rgba(0,0,0,0.7)", marginTop: "28px", zIndex: "2",
  });
  name.textContent = teamDisplayName(lvl);
  panel.appendChild(name);

  // divider
  panel.appendChild(mkDiv({
    width: "58%", height: "2px",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
    margin: "30px 0 24px", zIndex: "2",
  }));

  // 3 — country flag
  const country = countryFromImagePath(cs?.imagePath);
  const code = country ? String(appState.flagcodes?.[country] || "") : "";
  if (code) {
    const flagBox = mkDiv({
      width: "232px", height: "188px", borderRadius: "18px", overflow: "hidden",
      border: "3px solid rgba(255,255,255,0.88)", boxShadow: "0 12px 26px rgba(0,0,0,0.5)", zIndex: "2",
    });
    const flag = setStyle(document.createElement("img"), {
      width: "100%", height: "100%", objectFit: "cover", display: "block",
    });
    flag.alt = "";
    flag.src = projectAssetUrl(`Images/Flags/${code}.png`);
    flag.onerror = () => { flag.onerror = null; flag.src = `https://flagcdn.com/w320/${code}.png`; };
    flagBox.appendChild(flag);
    panel.appendChild(flagBox);
  }

  return panel;
}

// One shared observer keeps every preview stage scaled to its box width.
let prepFrameRO = null;
function scalePrepFrame(frameEl) {
  const stage = frameEl.querySelector(".prep-frame__stage");
  if (!stage) return;
  const w = frameEl.clientWidth;
  if (!w) return;
  stage.style.transform = `scale(${w / FRAME_W})`;
}
function observePrepFrame(frameEl) {
  if (typeof ResizeObserver === "undefined") { scalePrepFrame(frameEl); return; }
  if (!prepFrameRO) {
    prepFrameRO = new ResizeObserver((entries) => { for (const e of entries) scalePrepFrame(e.target); });
  }
  prepFrameRO.observe(frameEl);
  scalePrepFrame(frameEl);
}

/** The faithful 16:9 video-frame preview for one level.
 *  state = "question" (flag cards + badge + timer) or "answer" (photo+name cards
 *  + reveal panel slid in, badge/timer faded out). Both are STATIC. */
function buildRemotionFramePreview(lvl, ordinal, state) {
  const answer = state === "answer";
  const { formation, xi } = resolveLevelXi(lvl);

  const frame = document.createElement("div");
  frame.className = "prep-frame";
  const stage = document.createElement("div");
  stage.className = "prep-frame__stage";

  // The pitch shifts right on reveal (Level.tsx pitchShiftX); replicate the
  // whole-pitch translate so the cards line up with the slid-in reveal panel.
  const pitchShiftX = answer ? REVEAL_PITCH_SHIFT_X : 0;
  // Full-canvas layer (Level.tsx outer AbsoluteFill). Explicit 1920×1080 box —
  // not `inset:0` — so it reliably spans the whole stage and the flex wrapper
  // below can centre the pitch surface horizontally (was drifting left).
  const pitchLayer = mkDiv({
    position: "absolute", left: "0", top: "0", width: `${FRAME_W}px`, height: `${FRAME_H}px`,
    transform: `translate(${pitchShiftX}px, ${PITCH_SHIFT_Y}px)`,
  });
  // perspective wrapper, full-canvas flex-centered (Level.tsx inner AbsoluteFill
  // align/justify center) → the 1280px pitch surface sits at the canvas centre.
  const perspWrap = mkDiv({
    position: "absolute", left: "0", top: "0", width: "100%", height: "100%", display: "flex",
    alignItems: "center", justifyContent: "center", perspective: `${PERSP}px`,
  });
  const surface = mkDiv({
    position: "relative", width: `${PITCH_SURFACE_W}px`, height: `${PITCH_SURFACE_H}px`,
    transformOrigin: "center center",
    transform: `rotateX(${PITCH_TILT}deg) translateY(${SURFACE_TY_PCT}%) scale(${SURFACE_SCALE})`,
    transformStyle: "preserve-3d",
    borderRadius: "26px", border: "2px solid rgba(255,255,255,0.22)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.20) 100%)",
    boxShadow: "0 40px 90px rgba(0,0,0,0.85), 0 0 60px rgba(30,120,70,0.16), inset 0 0 40px rgba(0,0,0,0.18)",
  });
  // pitch markings — the runner's real SVG (Pitch.tsx, viewBox 160×100), white
  // lines over the transparent surface so the field reads exactly as it renders.
  const pitchSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  setStyle(pitchSvg, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
  pitchSvg.setAttribute("viewBox", "0 0 160 100");
  pitchSvg.setAttribute("preserveAspectRatio", "none");
  pitchSvg.setAttribute("aria-hidden", "true");
  pitchSvg.innerHTML =
    '<g fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.42" stroke-linecap="square" stroke-linejoin="miter">' +
    '<line x1="0" y1="50" x2="160" y2="50" />' +
    '<ellipse cx="80" cy="50" rx="21.529" ry="8.714" />' +
    '<rect x="32.565" y="0" width="94.871" height="20.5" />' +
    '<rect x="58.435" y="0" width="43.13" height="6.6" />' +
    '<path d="M 73.038 20.5 A 8.71 8.71 0 0 0 86.962 20.5" />' +
    '<rect x="32.565" y="79.5" width="94.871" height="20.5" />' +
    '<rect x="58.435" y="93.4" width="43.13" height="6.6" />' +
    '<path d="M 73.038 79.5 A 8.71 8.71 0 0 1 86.962 79.5" />' +
    '</g>' +
    '<g fill="rgba(255,255,255,0.28)">' +
    '<circle cx="80" cy="50" r="0.55" /><circle cx="80" cy="13.5" r="0.42" /><circle cx="80" cy="86.5" r="0.42" />' +
    '</g>';
  surface.appendChild(pitchSvg);

  const slotsLayer = mkDiv({ position: "absolute", inset: "0", transformStyle: "preserve-3d" });
  formation.slots.forEach((slot, i) => {
    slotsLayer.appendChild(previewPlayerSlot(xi[i] || null, slot, lvl, state));
  });
  surface.appendChild(slotsLayer);
  perspWrap.appendChild(surface);
  pitchLayer.appendChild(perspWrap);
  stage.appendChild(pitchLayer);

  // Reveal panel (answer only) — over the pitch, on the left.
  if (answer) stage.appendChild(previewRevealPanel(lvl));

  // Badge + timer: shown on the question; faded out on the answer (omit).
  if (!answer) {
    stage.appendChild(previewLevelBadge(ordinal || 1));
    stage.appendChild(previewTimer(3));
  }

  frame.appendChild(stage);
  requestAnimationFrame(() => observePrepFrame(frame));
  return frame;
}

// ════════════════════════════════════════════════════════════════════════════
// ASSETS tab — the EXISTING editable content (pitch slots + team panel editor)
// PLUS small asset cards (crest · flag · Data).
// ════════════════════════════════════════════════════════════════════════════

/** A small framed "asset" card with a title + content (image/text). */
function buildAssetCard(title, contentEl) {
  const card = document.createElement("div");
  card.className = "prep-asset-card";
  const t = document.createElement("div");
  t.className = "prep-asset-card__title";
  t.textContent = title;
  const body = document.createElement("div");
  body.className = "prep-asset-card__body";
  if (contentEl) body.appendChild(contentEl); else body.textContent = "—";
  card.append(t, body);
  return card;
}

/** LOGO + X controls for a team crest (download / remove the crest file).
 *  Refreshes `crestImg` in place. Used above the Team-crest asset card.
 *  (Moved here from the old team-panel box.) */
function buildCrestLogoControls(levelIndex, crestImg, fallbackImagePath) {
  const logoRow = document.createElement("div");
  logoRow.className = "prep-asset-crest-logo-row";

  const logoBtn = document.createElement("button");
  logoBtn.type = "button";
  logoBtn.className = "prep-team-panel__logo-btn";
  logoBtn.textContent = "LOGO";
  logoBtn.title = "Download this team's crest from a football-logos.cc URL";

  const logoDelBtn = document.createElement("button");
  logoDelBtn.type = "button";
  logoDelBtn.className = "prep-team-panel__logo-del-btn";
  logoDelBtn.textContent = "X";
  logoDelBtn.title = "Remove this team's crest";

  const refreshCrest = (rel) => {
    if (rel) {
      // Bump first: a just-downloaded file may have been cached as a 404 (dev
      // server sends max-age on 404s for image paths), so force a fresh URL.
      bumpAssetCacheBust(rel);
      crestImg.src = projectAssetUrlFresh(rel);
      crestImg.style.removeProperty("display");
    } else {
      crestImg.removeAttribute("src");
      crestImg.style.display = "none";
    }
  };

  logoBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (logoBtn.disabled) return;
    const choice = await chooseLogoSource(logoBtn);
    if (!choice) return;
    setActiveLevel(levelIndex);
    const st = getState();
    const payload = {
      squadType: st.squadType || "club",
      selectedEntry: st.selectedEntry || {},
      currentSquadName: st.currentSquad?.name || st.selectedEntry?.name || "",
      currentSquadImagePath: st.currentSquad?.imagePath || fallbackImagePath || "",
    };
    if (choice === "page") {
      const pasted = window.prompt(
        "Paste a football-logos.cc URL for this team's crest\n" +
          "(example: https://football-logos.cc/uae/al-ain/). Leave empty to cancel.",
        ""
      );
      const pageUrl = String(pasted || "").trim();
      if (!pageUrl) return;
      payload.pageUrl = pageUrl;
    } else {
      const pasted = window.prompt(
        "Paste a direct image URL for this team's crest\n" +
          "(https://… .png/.jpg/.webp). Leave empty to cancel.",
        ""
      );
      const imageUrl = String(pasted || "").trim();
      if (!imageUrl) return;
      payload.imageUrl = imageUrl;
    }
    const prevText = logoBtn.textContent;
    logoBtn.disabled = true;
    logoBtn.textContent = "...";
    try {
      const res = await fetch(TEAM_LOGO_FETCH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.relativePath) {
        throw new Error(data?.error || "Could not download the team crest.");
      }
      const rel = String(data.relativePath);
      const lvl2 = appState.levelsData[levelIndex];
      if (lvl2?.currentSquad && typeof lvl2.currentSquad === "object") {
        lvl2.currentSquad.imagePath = rel;
      }
      refreshCrest(rel);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not download the team crest.");
    } finally {
      logoBtn.disabled = false;
      logoBtn.textContent = prevText;
    }
  });

  logoDelBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (logoDelBtn.disabled) return;
    setActiveLevel(levelIndex);
    const st = getState();
    const relRaw = String(
      st.currentSquad?.imagePath || fallbackImagePath || ""
    ).split("?")[0];
    if (!relRaw) {
      window.alert("No crest file to remove for this team.");
      return;
    }
    if (!window.confirm(`Remove this team's crest?\n${relRaw}`)) return;
    const prevText = logoDelBtn.textContent;
    logoDelBtn.disabled = true;
    logoDelBtn.textContent = "...";
    try {
      const res = await fetch(TEAM_LOGO_DELETE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath: relRaw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not remove the team crest.");
      }
      refreshCrest("");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not remove the team crest.");
    } finally {
      logoDelBtn.disabled = false;
      logoDelBtn.textContent = prevText;
    }
  });

  logoRow.append(logoBtn, logoDelBtn);
  return logoRow;
}

/** The small asset-cards row (crest · country flag · Data). The Team-crest card
 *  now carries the LOGO + X controls (above the crest image). */
function buildAssetCardsRow(lvl, levelIndex) {
  const row = document.createElement("div");
  row.className = "prep-assets-row";
  const cs = lvl?.currentSquad;

  // Crest card — LOGO/X controls above the crest image.
  const crestWrap = document.createElement("div");
  crestWrap.className = "prep-asset-crest-wrap";
  const cImg = document.createElement("img");
  cImg.className = "prep-asset-crest";
  cImg.alt = "";
  if (cs?.imagePath) cImg.src = projectAssetUrl(cs.imagePath);
  else cImg.style.display = "none";
  crestWrap.append(
    buildCrestLogoControls(levelIndex, cImg, cs?.imagePath || ""),
    cImg,
  );
  const logoCard = buildAssetCard("Logo", crestWrap);
  logoCard.classList.add("prep-asset-card--logo"); // positions the LOGO/X row above the box
  row.appendChild(logoCard);

  // Flag card.
  const country = countryFromImagePath(cs?.imagePath);
  const code = country ? String(appState.flagcodes?.[country] || "") : "";
  let flagContent = null;
  if (code) {
    const fImg = document.createElement("img");
    fImg.className = "prep-asset-flag";
    fImg.alt = "";
    fImg.src = projectAssetUrl(`Images/Flags/${code}.png`);
    fImg.onerror = () => { fImg.onerror = null; fImg.src = `https://flagcdn.com/w320/${code}.png`; };
    flagContent = fImg;
  }
  row.appendChild(buildAssetCard("Flag", flagContent));

  return row;
}

/** "✎ Rename" button shown in the section head, next to the "Level N — Team"
 *  title. Renames THIS level's team (optionally persisted globally) and
 *  refreshes the head title + the Data card's Team value. */
function buildRenameBtn(levelIndex) {
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "prep-rename-team";
  renameBtn.textContent = "✎ Rename team";
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setActiveLevel(levelIndex); // getState() now points at this level
    const current = teamDisplayName(appState.levelsData[levelIndex]);
    const next = window.prompt(
      "Enter a custom team name.\nLeave empty to reset to the original.",
      current
    );
    if (next === null) return;
    const clean = String(next).trim();
    let persistGlobal = false;
    if (clean && clean.toLowerCase() !== String(current).toLowerCase()) {
      persistGlobal = window.confirm(
        `Save "${clean}" PERMANENTLY for this team?\n\n` +
          "OK — every save and every main runner shows this name from now on " +
          "(it's saved to disk and survives closing the terminal).\n" +
          "Cancel — only for THIS save."
      );
    }
    applyTeamRename(clean, persistGlobal);
    const sec = sections.find((s) => s.levelIndex === levelIndex);
    if (sec) {
      fillHead(sec.headEl, appState.levelsData[levelIndex], sections.indexOf(sec) + 1, levelIndex);
    }
  });
  return renameBtn;
}

/** ASSETS pane — the info cards (Logo · Flag) on top, editable pitch slots
 *  below. Returns { paneEl, slotsEl } so the section can fill the slots. */
function buildAssetsPane(lvl, levelIndex) {
  const pane = document.createElement("div");
  pane.className = "prep-assets";

  const main = document.createElement("div");
  main.className = "prep-assets-main";
  main.appendChild(buildAssetCardsRow(lvl, levelIndex));
  const editRow = document.createElement("div");
  editRow.className = "prep-assets-edit";
  const slotsEl = buildSlotsContainer();
  editRow.appendChild(slotsEl);
  main.appendChild(editRow);
  pane.appendChild(main);

  return { paneEl: pane, slotsEl };
}

// ── GLOBAL view switch (ONE bar at the top controls ALL levels) ──────────────
// Every level renders all three panes (Assets/Questions/Answer); only the panes
// matching `prepView` are shown. The single top bar flips `prepView` for every
// level at once.
const PREP_VIEWS = [
  { view: "assets", label: "Assets" },
  { view: "questions", label: "Questions" },
  { view: "answer", label: "Answer" },
];
let prepView = "assets";

/** Show only the panes for the active view across EVERY level + sync the bar. */
function applyPrepView() {
  if (!root) return;
  root.querySelectorAll(".prep-pane").forEach((p) => {
    p.hidden = p.dataset.view !== prepView;
  });
  root.querySelectorAll(".prep-globaltab").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.view === prepView);
  });
}

/** The single top tab bar (built once per render, at the top of #prep-root). */
function buildGlobalTabBar() {
  const bar = document.createElement("div");
  bar.className = "prep-globaltabbar";
  for (const { view, label } of PREP_VIEWS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prep-globaltab";
    btn.dataset.view = view;
    btn.textContent = label;
    if (view === prepView) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      prepView = view;
      applyPrepView();
    });
    bar.appendChild(btn);
  }
  return bar;
}

/** The per-level body = the 3 panes (no bar). Visibility follows the global view.
 *  Returns { wrap, slotsEl } — the Assets pane holds the editable pitch slots. */
function buildLevelView(lvl, levelIndex, ordinal) {
  const wrap = document.createElement("div");
  wrap.className = "prep-tabbody";

  const assets = buildAssetsPane(lvl, levelIndex);
  const panes = [
    { view: "assets", el: assets.paneEl },
    { view: "questions", el: buildRemotionFramePreview(lvl, ordinal, "question") },
    { view: "answer", el: buildRemotionFramePreview(lvl, ordinal, "answer") },
  ];

  for (const p of panes) {
    const pane = document.createElement("div");
    pane.className = "prep-pane";
    pane.dataset.view = p.view;
    pane.hidden = p.view !== prepView;
    pane.appendChild(p.el);
    wrap.appendChild(pane);
  }

  return { wrap, slotsEl: assets.slotsEl };
}

export function setActiveLevel(levelIndex) {
  appState.currentLevelIndex = levelIndex;
  const sec = sections.find((s) => s.levelIndex === levelIndex);
  if (sec) {
    appState.els.pitchSlots = sec.slotsEl;
    sections.forEach((s) =>
      s.sectionEl.classList.toggle("prep-section--active", s === sec)
    );
  }
}

function sectionHeadText(lvl, ordinal) {
  const teamName = teamDisplayName(lvl) || "(no team loaded)";
  return (
    `<span class="prep-section__level">Level ${ordinal}</span>` +
    `<span class="prep-section__team">${escapeHtml(teamName)}</span>`
  );
}

/** "Save Level" button — top-right of the section head (saves THIS team's XI). */
function buildSaveLevelBtn(levelIndex) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "prep-save-player";
  const paint = () => {
    const prev = appState.currentLevelIndex;
    appState.currentLevelIndex = levelIndex;
    let saved = false;
    try { saved = hasSavedTeamForCurrentEntry(); } catch { /* ignore */ }
    appState.currentLevelIndex = prev;
    btn.classList.toggle("is-saved", saved);
    btn.textContent = saved ? "✓ Level saved" : "Save Level";
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setActiveLevel(levelIndex);
    toggleSaveTeamForCurrentEntry();
    paint();
  });
  requestAnimationFrame(paint);
  return btn;
}

/** Set the head text AND (re-)attach the Rename + Save Level buttons — used
 *  everywhere the head innerHTML is reset, so the buttons are never lost.
 *  Order: Level N · Team name · ✎ Rename · …(spacer)… · Save Level. */
function fillHead(headEl, lvl, ordinal, levelIndex) {
  headEl.innerHTML = sectionHeadText(lvl, ordinal);
  headEl.appendChild(buildRenameBtn(levelIndex));
  headEl.appendChild(buildSaveLevelBtn(levelIndex));
}

// ── Centred top action buttons ("Get all photos" + clear-team "X") ───────────
// Both buttons are re-parented to <body> elsewhere (to escape transformed
// ancestors). Group them in ONE fixed, centred wrapper so the PAIR's bounding
// box is centred above the Assets/Questions/Answer tab bar — centring each
// separately left the wide "Get all photos" looking off to the left.
let topActionsWrap = null;
function dockTopActions() {
  if (!topActionsWrap || !document.body.contains(topActionsWrap)) {
    topActionsWrap = document.getElementById("prep-top-actions");
    if (!topActionsWrap) {
      topActionsWrap = document.createElement("div");
      topActionsWrap.id = "prep-top-actions";
      document.body.appendChild(topActionsWrap);
    }
  }
  const getAll = document.getElementById("team-header-get-all-photos");
  const clearX = document.getElementById("team-header-clear-team");
  const misplaced =
    (getAll && getAll.parentElement !== topActionsWrap) ||
    (clearX && clearX.parentElement !== topActionsWrap);
  if (!misplaced) return;
  if (getAll) topActionsWrap.appendChild(getAll); // GET ALL PHOTOS (left)
  if (clearX) topActionsWrap.appendChild(clearX);  // X (right)
}

export function renderPrepPanel() {
  if (!root) return;
  const prevLevel = appState.currentLevelIndex;
  sections = [];
  root.innerHTML = "";

  const indexes = questionLevelIndexes();
  if (!indexes.length) {
    const empty = document.createElement("div");
    empty.className = "prep-empty";
    empty.textContent = "Pick a save in the Saved tab to load its levels here.";
    root.appendChild(empty);
    return;
  }

  // ONE global tab bar at the very top — switches the view for ALL levels.
  root.appendChild(buildGlobalTabBar());

  let ordinal = 0;
  for (const levelIndex of indexes) {
    const lvl = appState.levelsData[levelIndex];
    ordinal += 1;

    const sectionEl = document.createElement("section");
    sectionEl.className = "prep-section";
    sectionEl.dataset.levelIndex = String(levelIndex);

    const head = document.createElement("div");
    head.className = "prep-section__head";
    fillHead(head, lvl, ordinal, levelIndex);
    sectionEl.appendChild(head);

    const body = document.createElement("div");
    body.className = "prep-section__body";
    const view = buildLevelView(lvl, levelIndex, ordinal);
    body.append(view.wrap);
    sectionEl.appendChild(body);

    root.appendChild(sectionEl);
    sections.push({ levelIndex, sectionEl, slotsEl: view.slotsEl, headEl: head });
  }

  // Fill every section's slots with the context swapped in.
  for (const s of sections) {
    appState.currentLevelIndex = s.levelIndex;
    appState.els.pitchSlots = s.slotsEl;
    try {
      renderPitch();
    } catch (e) {
      console.warn("[prep] renderPitch failed for level", s.levelIndex, e);
    }
  }

  // Restore/activate: keep the previously-active level if it still exists.
  const keep = sections.find((s) => s.levelIndex === prevLevel) || sections[0];
  setActiveLevel(keep.levelIndex);

  // Apply the current global view across every freshly-built level.
  applyPrepView();
  requestAnimationFrame(dockTopActions);
}

/** Re-render ONLY the active section (used after photo/name edits). */
export function refreshActiveSection() {
  const sec = sections.find((s) => s.levelIndex === appState.currentLevelIndex);
  if (!sec) return;
  appState.els.pitchSlots = sec.slotsEl;
  try {
    renderPitch();
    fillHead(sec.headEl, appState.levelsData[sec.levelIndex], sections.indexOf(sec) + 1, sec.levelIndex);
  } catch (e) {
    console.warn("[prep] refreshActiveSection failed:", e);
  }
}

export function initPrepPanel() {
  root = document.getElementById("prep-root");
  if (!root) {
    console.error("[prep] missing #prep-root");
    return;
  }

  /* The editable slot cards in the ASSETS pane keep BOTH faces populated (flag
     front + photo back). The 3D flip is flattened in CSS; the "Revealed" toggle
     just adds/removes `prep-revealed` on #prep-root, which shows the photo back
     (ON) or the flag front (OFF). The static Questions/Answer frames are NOT
     affected by this toggle (they always show their fixed state). */
  appState.videoRevealPostTimerActive = true;
  // The ASSETS pane ALWAYS shows every card REVEALED (player photo + name) —
  // the "Revealed" toggle was removed.
  root.classList.add("prep-revealed");

  /* The sliding #team-header sidebar is GONE (the per-level panel preview
     replaced it) — but "Get all team photos" lives inside it; move the
     button to <body> so its fixed FAB-row spot still works. */
  const bulkBtn = document.getElementById("team-header-get-all-photos");
  if (bulkBtn && bulkBtn.parentElement !== document.body) {
    document.body.appendChild(bulkBtn);
  }

  // Context switch BEFORE any click handler fires (capture phase).
  root.addEventListener(
    "pointerdown",
    (e) => {
      const sec = e.target?.closest?.(".prep-section");
      if (!sec) return;
      const idx = Number(sec.dataset.levelIndex);
      if (Number.isFinite(idx) && idx !== appState.currentLevelIndex) {
        setActiveLevel(idx);
      } else if (Number.isFinite(idx)) {
        // Same level — still make sure els.pitchSlots points at this section.
        const s = sections.find((x) => x.levelIndex === idx);
        if (s) appState.els.pitchSlots = s.slotsEl;
      }
    },
    true
  );

  document.addEventListener("recording-queue:script-applied", () => {
    renderPrepPanel();
    // A fresh save always opens at the TOP (Level 1). Instant, not smooth —
    // smooth scrolling races the cards' layout/images and lands mid-list.
    const scroller = root.closest(".stage");
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  document.addEventListener("prep:levels-changed", () => renderPrepPanel());
  // Re-render ONE section in place (e.g. after the bulk photo picker assigns a
  // photo to a player in that level) without rebuilding the whole panel.
  document.addEventListener("prep:refresh-level", (e) => {
    const sec = sections.find((s) => s.levelIndex === e.detail?.index);
    if (!sec) return;
    appState.currentLevelIndex = sec.levelIndex;
    appState.els.pitchSlots = sec.slotsEl;
    try { renderPitch(); } catch (err) { console.warn("[prep] refresh-level failed:", err); }
  });
  document.addEventListener("prep:level-switched", (e) => {
    const sec = sections.find((s) => s.levelIndex === e.detail?.index);
    if (!sec) return;
    setActiveLevel(sec.levelIndex);
    // First section = top of the list (don't leave the FAB-row padding behind).
    if (sec === sections[0]) {
      const scroller = root.closest(".stage");
      if (scroller) scroller.scrollTop = 0;
      window.scrollTo(0, 0);
    } else {
      sec.sectionEl.scrollIntoView({ behavior: "auto", block: "start" });
    }
  });
  renderPrepPanel();
  requestAnimationFrame(dockTopActions);
}
