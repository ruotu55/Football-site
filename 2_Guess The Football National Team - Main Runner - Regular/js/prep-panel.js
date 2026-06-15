/**
 * PREP PANEL — runner 2 "Guess the Football National Team".
 *
 * Each question level renders as a stacked section whose body is a 3-tab block:
 *   1. ASSETS    — the EXISTING editable content (the pitch slot grid that reuses
 *                  pitch-render's renderSlot/slot-controls unchanged + the team
 *                  panel preview with Save Team / Rename) PLUS small asset cards
 *                  (national-team logo, country flag, a Data card).
 *   2. QUESTIONS — a STATIC, faithful 1920×1080 frame of the QUESTION state
 *                  (3D pitch, 11 cards showing the players' CLUB CRESTS floating
 *                  on the pitch, level badge + timer), scaled into a 16:9 box.
 *   3. ANSWER    — a STATIC frame of the ANSWER state (cards flipped to the white
 *                  photo + red-name-band face, reveal panel shown with the
 *                  NATIONAL-TEAM logo → name → flag).
 *
 * The two static frames are built at EXACTLY the Remotion Level.tsx pixel sizes
 * (scenes/Level.tsx + components/PlayerSlot.tsx + NationalRevealPanel.tsx) and a
 * shared ResizeObserver scales the 1920×1080 stage to the box width — so the
 * prep panel shows what the video renders. They reuse the runner's OWN resolvers
 * (club crest chain, player photo paths, national-logo chain, flag) — no new
 * endpoints, same assets as the video.
 *
 * Editing still works because the slot grid in the Assets pane is the same
 * renderPitch()-filled .pitch-slots container as before; pointerdown (capture)
 * swaps appState.currentLevelIndex + appState.els.pitchSlots to this section.
 */
import { appState } from "./state.js";
import {
  renderPitch,
  resolveHeaderTeamDisplayName,
  applyTeamRename,
  pitchSlotDisplayLabel,
  resolveSlotClubCrestUrlsForLevel,
} from "./pitch-render.js";
import {
  toggleSaveTeamForCurrentEntry,
  hasSavedTeamForCurrentEntry,
} from "./saved-team-layouts.js";
import { projectAssetUrl, projectAssetUrlFresh, bumpAssetCacheBust } from "./paths.js";
import { formationById } from "./formations.js";
import { pickStartingXI } from "./pick-xi.js";
import { playerPhotoPathsForLevel, getHeaderLogoUrlChain } from "./photo-helpers.js";

let root = null;
let sections = []; // [{ levelIndex, sectionEl, slotsEl, headEl }]

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

/* Country folder from the crest path — only meaningful for CLUB crests:
   "Images/Teams/<Country>/<Team>.png". National logos live under
   Images/Nationality/<Continent>/… where the country is the squad itself. */
function countryFromImagePath(imagePath) {
  const parts = String(imagePath || "").split(/[/\\]/);
  return parts[1] === "Teams" && parts[2] !== "Competitions" ? (parts[2] || "") : "";
}

/** Flag country for a level: NATIONAL squads → the squad name IS the country;
 *  club-type levels → crest-path parse, then selectedEntry.country. */
function flagCountryForLevel(lvl) {
  const cs = lvl?.currentSquad;
  if (!cs) return "";
  if (lvl.squadType === "national") {
    return String(cs.name || "").trim();
  }
  const fromPath = countryFromImagePath(cs.imagePath);
  if (fromPath) return fromPath;
  return String(lvl.selectedEntry?.country || "").trim();
}

/** Per-level quiz type for the override-aware display name: national squads
 *  are renameable in this runner's main "nat-by-club" mode. */
function levelQuizType(lvl) {
  return lvl?.squadType === "national" ? "nat-by-club" : "club-by-nat";
}

/** Override-aware team name for a specific level (lvl IS a state object). */
function teamDisplayName(lvl) {
  try {
    const resolved = resolveHeaderTeamDisplayName(lvl, levelQuizType(lvl));
    if (resolved) return resolved;
  } catch { /* fall through */ }
  return lvl?.currentSquad?.name || "";
}

/** The national-team LOGO url chain for a level (Remotion reveal panel source).
 *  National Team Logos/<name>.png first, then the
 *  currentSquad.imagePath (the nationality image) as a fallback. */
function nationalLogoUrlsForLevel(lvl) {
  const cs = lvl?.currentSquad;
  const urls = [];
  const push = (u) => { if (u && !urls.includes(u)) urls.push(u); };
  if (lvl?.squadType === "national" && cs?.name) {
    try {
      getHeaderLogoUrlChain(lvl, cs, "national", lvl.selectedEntry?.name, "nat-by-club")
        .forEach(push);
    } catch { /* fall back below */ }
    push(projectAssetUrl(`Images/National Team Logos/${cs.name}.png`));
    if (cs.imagePath) push(projectAssetUrl(cs.imagePath));
  } else if (cs?.imagePath) {
    push(projectAssetUrl(cs.imagePath));
  }
  return urls;
}

/** Country flag url chain for a level (repo flag, then flagcdn fallback). */
function flagUrlsForLevel(lvl) {
  const country = flagCountryForLevel(lvl);
  const code = country ? String(appState.flagcodes?.[country] || "") : "";
  if (!code) return [];
  return [
    projectAssetUrl(`Images/Flags/${code}.png`),
    `https://flagcdn.com/w320/${code.toLowerCase()}.png`,
  ];
}

/** The 11-player XI for a level (customXi if it matches the formation, else a
 *  freshly picked one). Does NOT mutate the level. */
function levelXi(lvl) {
  const formation = formationById(lvl?.formationId);
  if (
    Array.isArray(lvl?.customXi) &&
    lvl.customXi.length === formation.slots.length
  ) {
    return lvl.customXi;
  }
  try {
    return pickStartingXI(formation, lvl.currentSquad);
  } catch {
    return Array(formation.slots.length).fill(null);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FAITHFUL REMOTION FRAME PREVIEW — a 1:1 replica of the video's Level layout,
// scaled into a 16:9 box. Numbers/colours below are COPIED VERBATIM from
// ___Remotion___/2_…_Remotion/src/scenes/Level.tsx + the shared PlayerSlot +
// components/NationalRevealPanel.tsx. The stage is a fixed 1920×1080 div; a
// ResizeObserver scales it to the box width.
// ════════════════════════════════════════════════════════════════════════════
const FRAME_W = 1920;
const FRAME_H = 1080;

// Pitch surface maths (Level.tsx).
const PITCH_PLAN_RATIO = 1.28;
const PITCH_TILT = 38;
const PITCH_SURFACE_W = 1280;
const PITCH_SURFACE_H = PITCH_SURFACE_W / PITCH_PLAN_RATIO;
const SLOT_WIDTH_PCT = 14.7;
const SURFACE_SCALE = 1.0925;
const SURFACE_TY_PCT = -11;
const PITCH_SHIFT_Y = -8;
const PERSP = 1200;
const CREST_IMG_PCT = 72; // crestImgPct passed by Level.tsx
const REVEAL_PITCH_SHIFT_X = 150; // pitchShiftX at revealProgress=1

const slotZ = (yPct) => {
  const tiltRad = (PITCH_TILT * Math.PI) / 180;
  const tY = (SURFACE_TY_PCT / 100) * PITCH_SURFACE_H;
  const oy = (yPct / 100) * PITCH_SURFACE_H - PITCH_SURFACE_H / 2;
  return (oy * SURFACE_SCALE + tY) * Math.sin(tiltRad) + 60;
};
const Z_REF = slotZ(58);
const sizeComp = (yPct) => (PERSP - slotZ(yPct)) / (PERSP - Z_REF);

const setStyle = (el, s) => { Object.assign(el.style, s); return el; };
const mkDiv = (s) => setStyle(document.createElement("div"), s || {});

/** Set an <img> from a fallback chain; on total failure run onFail(holder). */
function applyImgChain(img, urls, onFail) {
  const chain = (urls || []).slice();
  let i = 0;
  const tryNext = () => {
    if (i >= chain.length) {
      img.onerror = null;
      img.remove();
      if (onFail) onFail();
      return;
    }
    img.src = chain[i++];
  };
  img.onerror = tryNext;
  if (!chain.length) {
    img.remove();
    if (onFail) onFail();
  } else {
    tryNext();
  }
}

/** The pitch markings — EXACTLY the shared `Pitch.tsx` the video renders: a
 *  TRANSPARENT surface with white SVG lines (viewBox 160×100). The dark surface
 *  gradient/border lives on the parent. (The old GREEN grass box was wrong — the
 *  real pitch is transparent, like runner 1's faithful preview.) */
function previewPitchSurface() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  setStyle(svg, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
  svg.setAttribute("viewBox", "0 0 160 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
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
  return svg;
}

/** One player card on the pitch. state: "question" = club-crest face floating on
 *  the pitch (no white disc); "answer" = white card, photo + red name band. */
function previewPlayerCard(lvl, slot, player, slotIndex, state) {
  const answer = state === "answer";
  const sc = sizeComp(slot.y);
  const card = mkDiv({
    position: "absolute", left: `${slot.x}%`, top: `${slot.y}%`,
    width: `${SLOT_WIDTH_PCT}%`, aspectRatio: "10 / 12",
    transform: `translate(-50%, -50%) translateZ(60px) rotateX(${-PITCH_TILT}deg) scale(${sc})`,
    transformStyle: "preserve-3d",
  });
  if (!player) return card;

  if (!answer) {
    // FRONT (QUESTION): the club crest floats directly on the pitch — contain,
    // ~72% of the card, drop shadow. No white disc/plate (runner-2 difference).
    const holder = mkDiv({
      position: "absolute", inset: "0", display: "flex",
      alignItems: "center", justifyContent: "center",
    });
    const img = setStyle(document.createElement("img"), {
      width: `${CREST_IMG_PCT}%`, height: `${CREST_IMG_PCT}%`, objectFit: "contain",
      filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.6))",
    });
    img.alt = "";
    applyImgChain(img, resolveSlotClubCrestUrlsForLevel(lvl, slotIndex, player), () => {
      const q = setStyle(document.createElement("div"), {
        fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800",
        fontSize: "48px", color: "rgba(255,255,255,0.55)",
        textShadow: "0 2px 8px rgba(0,0,0,0.6)", textAlign: "center", padding: "0 6%",
        lineHeight: "1.05",
      });
      q.textContent = (player.club || "?").toUpperCase();
      holder.appendChild(q);
    });
    holder.appendChild(img);
    card.appendChild(holder);
    return card;
  }

  // BACK (ANSWER): white card, player photo on top, red name band at bottom.
  const back = mkDiv({
    position: "absolute", inset: "0", transform: "scale(0.8)",
    display: "flex", flexDirection: "column",
    border: "3px solid #ffffff", borderRadius: "14%", overflow: "hidden",
    background: "#ffffff", boxShadow: "0 10px 22px rgba(0,0,0,0.5)",
  });
  const photoWrap = mkDiv({
    flex: "1", minHeight: "0", position: "relative",
    background: "linear-gradient(180deg, #eef1f5 0%, #d9dee6 100%)",
  });
  const photoPaths = playerPhotoPathsForLevel(player, lvl) || [];
  const photoUrls = photoPaths.map((p) => projectAssetUrlFresh(p));
  const img = setStyle(document.createElement("img"), {
    width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 12%", display: "block",
  });
  img.alt = "";
  applyImgChain(img, photoUrls, () => {
    const initial = setStyle(document.createElement("div"), {
      width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800",
      fontSize: "40px", color: "rgba(20,28,40,0.45)",
    });
    initial.textContent = String(pitchSlotDisplayLabel(lvl, player) || "?").charAt(0);
    photoWrap.appendChild(initial);
  });
  photoWrap.appendChild(img);

  const band = setStyle(document.createElement("div"), {
    flex: "0 0 28%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(180deg, #ef5350 0%, #c62828 100%)",
    borderTop: "2px solid #14121f", fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    // Black name on the red band — matches the editable Assets card + the video.
    fontWeight: "800", color: "#111111", textTransform: "uppercase",
    fontSize: "30px", lineHeight: "1", padding: "0 2%", textAlign: "center", whiteSpace: "nowrap",
    textShadow: "none",
  });
  band.textContent = pitchSlotDisplayLabel(lvl, player) || "—";
  back.append(photoWrap, band);
  card.appendChild(back);
  return card;
}

/** Level badge disc (Level.tsx <LevelBadge>) — static. */
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

/** Timer disc (Level.tsx <Timer>) — static; `secs` is the number shown. */
function previewTimer(secs) {
  const wrap = mkDiv({ position: "absolute", top: "34px", right: "40px", width: "162px", height: "162px", zIndex: "60" });
  wrap.innerHTML =
    '<svg width="162" height="162" style="display:block;filter:drop-shadow(0 14px 28px rgba(0,0,0,0.5))">' +
    '<circle cx="81" cy="81" r="66" fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" stroke-width="14"></circle>' +
    '<circle cx="81" cy="81" r="66" fill="none" stroke="#ffca28" stroke-width="14" stroke-linecap="round" transform="rotate(-90 81 81)"></circle>' +
    "</svg>";
  const num = setStyle(document.createElement("div"), {
    position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", fontSize: "72px",
    color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)",
  });
  num.textContent = String(secs == null ? 6 : secs);
  wrap.appendChild(num);
  return wrap;
}

/** The reveal panel (NationalRevealPanel.tsx) at its final slid-in position:
 *  NATIONAL-TEAM logo (296) → name → divider → flag (232×188). Fallback (no
 *  logo file) = large flag (296×216) on top + name below. */
function previewRevealPanel(lvl) {
  const panel = mkDiv({
    position: "absolute", top: "0", bottom: "0", left: "0", width: "380px",
    background: "linear-gradient(165deg, rgba(40,90,56,0.55) 0%, rgba(12,28,18,0.72) 62%, rgba(6,9,14,0.6) 100%)",
    borderRight: "1.5px solid rgba(255,255,255,0.22)",
    borderTopRightRadius: "36px", borderBottomRightRadius: "36px",
    boxShadow: "26px 0 70px rgba(0,0,0,0.5), inset 0 0 70px rgba(255,255,255,0.06)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "64px 32px", overflow: "hidden", zIndex: "70",
  });
  panel.appendChild(mkDiv({
    position: "absolute", inset: "0", pointerEvents: "none",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 26%), radial-gradient(120% 50% at 50% 0%, rgba(255,255,255,0.10), transparent 60%)",
  }));

  const logoUrls = nationalLogoUrlsForLevel(lvl);
  const flagUrls = flagUrlsForLevel(lvl);
  const name = teamDisplayName(lvl);

  // Try the logo first; if it fails entirely, swap to the fallback layout.
  const logoImg = setStyle(document.createElement("img"), {
    width: "296px", height: "296px", objectFit: "contain",
    filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.55))", position: "relative", zIndex: "2",
  });
  logoImg.alt = "";

  const buildName = (fontSize) => {
    const el = setStyle(document.createElement("div"), {
      fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800",
      fontSize: `${fontSize}px`, lineHeight: "0.96", color: "#fff", textAlign: "center",
      letterSpacing: "1px", textTransform: "uppercase", textShadow: "0 4px 16px rgba(0,0,0,0.7)",
      position: "relative", zIndex: "2",
    });
    el.textContent = name;
    return el;
  };
  const buildDivider = (margin) => mkDiv({
    width: "58%", height: "2px",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
    margin, position: "relative", zIndex: "2",
  });
  const buildFlagBox = (w, h, radius, borderW) => {
    const box = mkDiv({
      width: `${w}px`, height: `${h}px`, borderRadius: `${radius}px`, overflow: "hidden",
      border: `${borderW}px solid rgba(255,255,255,${borderW >= 4 ? 0.9 : 0.88})`,
      boxShadow: "0 12px 26px rgba(0,0,0,0.5)", position: "relative", zIndex: "2",
    });
    if (flagUrls.length) {
      const fImg = setStyle(document.createElement("img"), {
        width: "100%", height: "100%", objectFit: "cover", display: "block",
      });
      fImg.alt = "";
      applyImgChain(fImg, flagUrls, () => {});
      box.appendChild(fImg);
    }
    return box;
  };

  const renderWithLogo = () => {
    panel.appendChild(logoImg);
    panel.appendChild(buildName(56));
    panel.appendChild(buildDivider("30px 0 24px"));
    if (flagUrls.length) panel.appendChild(buildFlagBox(232, 188, 18, 3));
  };
  const renderFallback = () => {
    if (flagUrls.length) panel.appendChild(buildFlagBox(296, 216, 20, 4));
    panel.appendChild(buildDivider("34px 0 26px"));
    panel.appendChild(buildName(58));
  };

  if (logoUrls.length) {
    renderWithLogo();
    // Probe the logo chain; if every candidate fails, rebuild as the no-logo
    // fallback (large flag on top + name) — keep only the sheen overlay (child 0).
    applyImgChain(logoImg, logoUrls, () => {
      Array.from(panel.children).forEach((c, i) => { if (i > 0) c.remove(); });
      renderFallback();
    });
  } else {
    renderFallback();
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
 *  state = "question" (club crests on cards, badge/timer, no panel) or
 *  "answer" (photo+name cards, panel slid in, badge/timer faded). Both STATIC. */
function buildRemotionFramePreview(lvl, levelIndex, ordinal, state) {
  const answer = state === "answer";
  const formation = formationById(lvl?.formationId);
  const xi = levelXi(lvl);

  const frame = document.createElement("div");
  frame.className = "prep-frame";
  const stage = document.createElement("div");
  stage.className = "prep-frame__stage";

  // soft vignette backdrop
  stage.appendChild(mkDiv({
    position: "absolute", inset: "0",
    background: "radial-gradient(ellipse 60% 70% at 50% 60%, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0) 72%)",
  }));

  // ── 3D pitch + cards (Level.tsx) ──
  // Outer translate (pitch shift). On answer the whole pitch shifts right (150px).
  const shiftWrap = mkDiv({
    position: "absolute", inset: "0",
    transform: `translate(${answer ? REVEAL_PITCH_SHIFT_X : 0}px, ${PITCH_SHIFT_Y}px)`,
  });
  const persp = mkDiv({
    position: "absolute", inset: "0", display: "flex",
    alignItems: "center", justifyContent: "center", perspective: `${PERSP}px`,
  });
  const surface = mkDiv({
    position: "relative", width: `${PITCH_SURFACE_W}px`, height: `${PITCH_SURFACE_H}px`,
    transformOrigin: "center center",
    transform: `rotateX(${PITCH_TILT}deg) translateY(${SURFACE_TY_PCT}%) scale(${SURFACE_SCALE})`,
    transformStyle: "preserve-3d", borderRadius: "26px",
    border: "2px solid rgba(255,255,255,0.22)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.20) 100%)",
    boxShadow: "0 40px 90px rgba(0,0,0,0.85), 0 0 60px rgba(30,120,70,0.16), inset 0 0 40px rgba(0,0,0,0.18)",
  });
  surface.appendChild(previewPitchSurface());
  const cardLayer = mkDiv({ position: "absolute", inset: "0", transformStyle: "preserve-3d" });
  formation.slots.forEach((slot, i) => {
    cardLayer.appendChild(previewPlayerCard(lvl, slot, xi[i] || null, i, state));
  });
  surface.appendChild(cardLayer);
  persp.appendChild(surface);
  shiftWrap.appendChild(persp);
  stage.appendChild(shiftWrap);

  // ── badge + timer (faded on answer) ──
  const badge = previewLevelBadge(ordinal || 1);
  const timer = previewTimer(answer ? 0 : 3);
  if (answer) { badge.style.opacity = "0"; timer.style.opacity = "0"; }
  stage.append(badge, timer);

  // ── reveal panel (answer only) ──
  if (answer) stage.appendChild(previewRevealPanel(lvl));

  frame.appendChild(stage);
  requestAnimationFrame(() => observePrepFrame(frame));
  return frame;
}

// ════════════════════════════════════════════════════════════════════════════
// ASSETS pane — the EXISTING editable content + asset cards.
// ════════════════════════════════════════════════════════════════════════════

const TEAM_LOGO_FETCH_ENDPOINT = "/__team-logo/fetch";
const TEAM_LOGO_DELETE_ENDPOINT = "/__team-logo/delete";

/* Tiny 2-option chooser next to the LOGO button → "page" / "image" / null. */
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
    const onOutside = (ev) => { if (!pop.contains(ev.target)) cleanup(null); };
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

/** The file a national-team logo download/delete should TARGET for a level. */
function nationalLogoRelPath(lvl) {
  const cs = lvl?.currentSquad;
  if (lvl?.squadType === "national" && cs?.name) {
    return `Images/National Team Logos/${cs.name}.png`;
  }
  return String(cs?.imagePath || "");
}

/** LOGO + X controls for the NATIONAL-TEAM logo (download / remove the logo
 *  file). Refreshes `logoImg` in place. Floated ABOVE the Logo asset card so it
 *  doesn't change the box size — mirrors runner 1's crest controls. */
function buildLogoControls(levelIndex, logoImg) {
  const logoRow = document.createElement("div");
  logoRow.className = "prep-asset-crest-logo-row";

  const logoBtn = document.createElement("button");
  logoBtn.type = "button";
  logoBtn.className = "prep-team-panel__logo-btn";
  logoBtn.textContent = "LOGO";
  logoBtn.title = "Download this national team's logo from a football-logos.cc / image URL";

  const logoDelBtn = document.createElement("button");
  logoDelBtn.type = "button";
  logoDelBtn.className = "prep-team-panel__logo-del-btn";
  logoDelBtn.textContent = "X";
  logoDelBtn.title = "Remove this national team's logo";

  const refreshLogo = (rel) => {
    if (rel) {
      bumpAssetCacheBust(rel);
      logoImg.src = projectAssetUrlFresh(rel);
      logoImg.style.removeProperty("display");
    } else {
      logoImg.removeAttribute("src");
      logoImg.style.display = "none";
    }
  };

  logoBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (logoBtn.disabled) return;
    const choice = await chooseLogoSource(logoBtn);
    if (!choice) return;
    setActiveLevel(levelIndex);
    const lvl2 = appState.levelsData[levelIndex];
    const cs = lvl2?.currentSquad;
    const rel = nationalLogoRelPath(lvl2);
    const payload = {
      squadType: lvl2?.squadType || "national",
      selectedEntry: lvl2?.selectedEntry || {},
      currentSquadName: cs?.name || lvl2?.selectedEntry?.name || "",
      currentSquadImagePath: rel, // save to the National Team Logos file
    };
    if (choice === "page") {
      const pasted = window.prompt(
        "Paste a football-logos.cc URL for this team's logo\n(example: https://football-logos.cc/…/). Leave empty to cancel.",
        ""
      );
      const pageUrl = String(pasted || "").trim();
      if (!pageUrl) return;
      payload.pageUrl = pageUrl;
    } else {
      const pasted = window.prompt(
        "Paste a direct image URL for this team's logo\n(https://… .png/.jpg/.webp). Leave empty to cancel.",
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
        throw new Error(data?.error || "Could not download the team logo.");
      }
      refreshLogo(String(data.relativePath));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not download the team logo.");
    } finally {
      logoBtn.disabled = false;
      logoBtn.textContent = prevText;
    }
  });

  logoDelBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (logoDelBtn.disabled) return;
    setActiveLevel(levelIndex);
    const rel = nationalLogoRelPath(appState.levelsData[levelIndex]).split("?")[0];
    if (!rel) {
      window.alert("No logo file to remove for this team.");
      return;
    }
    if (!window.confirm(`Remove this team's logo?\n${rel}`)) return;
    const prevText = logoDelBtn.textContent;
    logoDelBtn.disabled = true;
    logoDelBtn.textContent = "...";
    try {
      const res = await fetch(TEAM_LOGO_DELETE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath: rel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not remove the team logo.");
      }
      refreshLogo("");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not remove the team logo.");
    } finally {
      logoDelBtn.disabled = false;
      logoDelBtn.textContent = prevText;
    }
  });

  logoRow.append(logoBtn, logoDelBtn);
  return logoRow;
}

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

/** "✎ Rename" button shown in the section head, next to the "Level N — Team"
 *  title. Renames THIS level's national team (optionally persisted globally) and
 *  refreshes the head title. */
function buildRenameBtn(levelIndex) {
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "prep-rename-team";
  renameBtn.textContent = "✎ Rename team";
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setActiveLevel(levelIndex);
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

/** ASSETS tab — small asset cards (Logo · Flag) on top, editable slot grid below. */
function buildAssetsPane(lvl, levelIndex, slotsEl) {
  const pane = document.createElement("div");
  pane.className = "prep-assets";

  const main = document.createElement("div");
  main.className = "prep-assets-main";

  // Small asset cards: national logo · flag (top of the column).
  const cards = document.createElement("div");
  cards.className = "prep-assets-row";

  // National-team logo card — LOGO/X controls float ABOVE the box.
  const logoWrap = document.createElement("div");
  logoWrap.className = "prep-asset-crest-wrap";
  const lImg = document.createElement("img");
  lImg.className = "prep-asset-logo";
  lImg.alt = "";
  const logoUrls = nationalLogoUrlsForLevel(lvl);
  if (logoUrls.length) applyImgChain(lImg, logoUrls, () => { lImg.style.display = "none"; });
  else lImg.style.display = "none";
  logoWrap.append(buildLogoControls(levelIndex, lImg), lImg);
  const logoCard = buildAssetCard("Logo", logoWrap);
  logoCard.classList.add("prep-asset-card--logo"); // positions the LOGO/X row above the box
  cards.appendChild(logoCard);

  // Flag card.
  let flagContent = null;
  const flagUrls = flagUrlsForLevel(lvl);
  if (flagUrls.length) {
    const fImg = document.createElement("img");
    fImg.className = "prep-asset-flag";
    fImg.alt = "";
    applyImgChain(fImg, flagUrls, () => {});
    flagContent = fImg;
  }
  cards.appendChild(buildAssetCard("Flag", flagContent));
  main.appendChild(cards);

  // Pitch slots below the cards.
  const editRow = document.createElement("div");
  editRow.className = "prep-assets-edit";
  editRow.appendChild(slotsEl);
  main.appendChild(editRow);
  pane.appendChild(main);

  return pane;
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
 *  `slotsEl` is the editable .pitch-slots (lives inside the Assets pane). */
function buildLevelView(lvl, levelIndex, ordinal, slotsEl) {
  const bodyEl = document.createElement("div");
  bodyEl.className = "prep-tabbody";
  const panes = [
    { view: "assets", el: buildAssetsPane(lvl, levelIndex, slotsEl) },
    { view: "questions", el: buildRemotionFramePreview(lvl, levelIndex, ordinal, "question") },
    { view: "answer", el: buildRemotionFramePreview(lvl, levelIndex, ordinal, "answer") },
  ];
  for (const p of panes) {
    const pane = document.createElement("div");
    pane.className = "prep-pane";
    pane.dataset.view = p.view;
    pane.hidden = p.view !== prepView;
    pane.appendChild(p.el);
    bodyEl.appendChild(pane);
  }
  return bodyEl;
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
    `<span class="prep-section__team">${teamName}</span>`
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

/** Set the head text AND (re-)attach the Rename + Save Level buttons.
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

  // ONE global tab bar at the top — switches the view for ALL levels at once.
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
    const slotsEl = buildSlotsContainer();
    // The editable slots live inside the Assets tab; Questions/Answer are static.
    body.append(buildLevelView(lvl, levelIndex, ordinal, slotsEl));
    sectionEl.appendChild(body);

    root.appendChild(sectionEl);
    sections.push({ levelIndex, sectionEl, slotsEl, headEl: head });
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

  applyPrepView();
  requestAnimationFrame(dockTopActions);
}

/** Re-render ONLY the active section's slots (used after photo/name edits). */
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

  /* Build cards with BOTH faces fully populated (club-crest front + photo
     back). The 3D flip is flattened in CSS for the prep panel; the "Revealed"
     toggle just adds/removes the `prep-revealed` class on #prep-root, which
     shows the photo back (ON) or the club-logo front (OFF) in the editable
     Assets grid. No re-render on toggle. */
  appState.videoRevealPostTimerActive = true;
  // The ASSETS pane ALWAYS shows every card REVEALED (player photo + name) —
  // the "Revealed" toggle was removed.
  root.classList.add("prep-revealed");

  /* The sliding #team-header sidebar is GONE — but "Get all team photos" lives
     inside it; move the button to <body> so its fixed FAB-row spot still works. */
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
        const s = sections.find((x) => x.levelIndex === idx);
        if (s) appState.els.pitchSlots = s.slotsEl;
      }
    },
    true
  );

  document.addEventListener("recording-queue:script-applied", () => {
    renderPrepPanel();
    const scroller = root.closest(".stage");
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  document.addEventListener("prep:levels-changed", () => renderPrepPanel());
  // Re-render ONE section's slots in place (e.g. after the bulk photo picker
  // assigns a photo) without rebuilding the whole panel.
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
