// js/remotion-state-export.js
//
// Resolved fields (slots/teamName/headerLogoRel/revealVoiceRel/progressVoiceRel) are
// BROWSER-UNTESTED as of 2026-06-03 — validate on first real modal capture; each is
// try/caught to fail safe.

import { appState } from "./state.js";
import { getActiveScriptName } from "./saved-scripts.js?v=20260601-autoopen5";

// ── Resolvers reused from the app (all verified-exported) ──────────────────────
import { pickStartingXI } from "./pick-xi.js";
import { formationById } from "./formations.js";
import {
  resolveHeaderTeamDisplayName,
  resolvePlayerNationalityLabel,
} from "./pitch-render.js";
import {
  normalizeLegacyTeamImageRelPath,
  stripLogoOverrideRelPath,
  playerPhotoPaths,
  getClubLogoUrl,
  getClubLogoOtherTeamsRelPath,
} from "./photo-helpers.js";
import {
  getOrAssignRevealPhrase,
  buildRevealVoiceCandidates,
} from "./audio.js";
import { getBundledLevelPath } from "./bundled-level-voices.js";

// ── Internal helpers (mirrors of pitch-render internals, not exported there) ───

/**
 * Best-effort: derive the repo-relative path for the header logo from state.
 * Mirrors the logic in getHeaderLogoUrlChain / getClubSquadHeaderLogoLoadUrls
 * but returns a REL path instead of a full URL.
 *
 * For nat-by-club + national squad the canonical logo is under
 * "Images/National Team Logos/<Name>.png".
 * For club squads: override → squad.imagePath (canonicalized) → Other Teams fallback.
 *
 * BEST-EFFORT: this replicates getHeaderLogoUrlChain's priority order without
 * calling projectAssetUrl(). Validate on first real render capture.
 */
function deriveHeaderLogoRel(lvl, quizType) {
  const override = stripLogoOverrideRelPath(lvl.headerLogoOverrideRelPath);
  if (override) return override;

  const squad = lvl.currentSquad;
  if (!squad) return "";

  const squadType = lvl.squadType;
  const selectedEntryName = lvl.selectedEntry?.name || "";

  if (quizType === "nat-by-club" && squadType === "national") {
    // National team logo directory (first candidate — raw name).
    const teamName = String(squad.name || selectedEntryName || "").trim();
    if (teamName) return `Images/National Team Logos/${teamName}.png`;
    return "";
  }

  // Club squad (or national squad in non-nat-by-club mode): use imagePath first.
  const primaryRel = squad.imagePath
    ? normalizeLegacyTeamImageRelPath(squad.imagePath)
    : "";
  if (primaryRel) return primaryRel;

  // Fallback: Other Teams directory by squad name.
  if (squadType === "club") {
    const nameForOt = String(squad.name || selectedEntryName || "").trim();
    const otRel = getClubLogoOtherTeamsRelPath(nameForOt);
    return otRel || "";
  }

  return "";
}

/**
 * Resolve the front-face (badge) rel-path for one slot.
 *
 * Club XI  → player's nationality flag.
 *   England special-case: repo path "Images/Nationality/Europe/England.png"
 *   Others: flagcdn.com URL (not repo-relative — renderer fetches it as a URL).
 *   No code found: returns "" (renderer shows text fallback).
 *
 * National XI → club crest rel-path.
 *   Priority: per-slot override → getClubLogoUrl (league folder) → getClubLogoOtherTeamsRelPath.
 *
 * BEST-EFFORT for flag CDN URLs (non-England): these are https:// strings, not
 * repo-relative, but the renderer's assetUrl() passes through http/https untouched.
 */
function resolveSlotFrontRel(lvl, player, slotIndex) {
  const squadType = lvl.squadType || "club";

  if (squadType === "club") {
    // Front face = nationality flag
    const natLabel = resolvePlayerNationalityLabel(player.nationality);
    if (!natLabel) return "";
    if (natLabel === "England") {
      return "Images/Nationality/Europe/England.png";
    }
    const code = appState.flagcodes[natLabel];
    if (!code) return "";
    // CDN URL — renderer fetches it directly.
    return `https://flagcdn.com/w320/${String(code).toLowerCase()}.png`;
  }

  // National XI: front face = club crest
  const ovKey = String(slotIndex);
  const rawOverride =
    lvl.slotClubCrestOverrideRelPathBySlot?.[ovKey] ||
    (lvl.slotClubCrestOverrideRelPathBySlot instanceof Map
      ? lvl.slotClubCrestOverrideRelPathBySlot.get(ovKey)
      : undefined);
  if (rawOverride) {
    // strip cache-bust query/hash the same way pitch-render.js does
    return normalizeLegacyTeamImageRelPath(
      String(rawOverride).split("?")[0].split("#")[0]
    );
  }

  const clubName = player.club || "";
  if (!clubName) return "";

  // Try canonical league-folder path first
  const primaryUrl = getClubLogoUrl(clubName);
  if (primaryUrl) {
    // getClubLogoUrl returns a full URL built with projectAssetUrl.
    // Convert back to rel by stripping the origin prefix if present.
    // The URL is "Images/Teams/<country>/<league>/<name>.png" after projectAssetUrl.
    // We replicate the rel directly from the teams index instead.
    const { teamsIndex } = appState;
    if (teamsIndex?.clubs) {
      const entry = teamsIndex.clubs.find((c) => c.name === clubName);
      if (entry?.country && entry?.league) {
        return `Images/Teams/${entry.country}/${entry.league}/${entry.name}.png`;
      }
    }
  }

  // Fallback: Other Teams folder
  return getClubLogoOtherTeamsRelPath(clubName) || "";
}

/**
 * Resolve the progress-voice audioKey for a given questionIndex and totalQuestions.
 * Mirrors playProgressVoice() in audio.js exactly.
 * Returns "" if no milestone fires at this question.
 */
function resolveProgressAudioKey(questionIndex, totalQuestions) {
  if (questionIndex === 1) return "warmUp";
  const total = totalQuestions;
  const target30 = Math.max(2, Math.round(total * 0.3));
  const target60 = Math.max(2, Math.round(total * 0.6));
  const target90 = Math.max(2, Math.round(total * 0.9));
  if (questionIndex === target30) return "serious";
  if (questionIndex === target60) return "nerds";
  if (questionIndex === target90) return "genius";
  return "";
}

/** Serialize the live on-screen state into Remotion render props.
 *  Photos/logos are emitted as repo-relative paths; the server maps them to URLs. */
export function buildRemotionState() {
  const quizType =
    (document.getElementById("in-quiz-type")?.value) || "club-by-nat";

  // Language for voice resolution: read same LS key audio.js uses.
  let language = "english";
  try {
    const stored = String(
      localStorage.getItem("voice-tab.language") || ""
    ).toLowerCase();
    if (stored === "spanish") language = "spanish";
  } catch { /* ignore */ }

  const totalLevelsCount = appState.totalLevelsCount;
  const totalQuestions = Math.max(0, totalLevelsCount - 3);

  const levels = appState.levelsData.map((lvl, i) => {
    // ── Existing fields (unchanged) ─────────────────────────────────────────
    const base = {
      isLogo: !!lvl.isLogo, isIntro: !!lvl.isIntro, isOutro: !!lvl.isOutro, isBonus: !!lvl.isBonus,
      squadType: lvl.squadType, displayMode: lvl.displayMode, formationId: lvl.formationId,
      videoMode: true,
      currentSquad: lvl.currentSquad || null,
      slotPhotoIndexBySlot: lvl.slotPhotoIndexBySlot instanceof Map
        ? Object.fromEntries(lvl.slotPhotoIndexBySlot) : (lvl.slotPhotoIndexBySlot || {}),
      slotFlagScales: Array.isArray(lvl.slotFlagScales) ? lvl.slotFlagScales.slice() : [],
      slotTeamLogoScales: Array.isArray(lvl.slotTeamLogoScales) ? lvl.slotTeamLogoScales.slice() : [],
      slotClubCrestOverrideRelPathBySlot: { ...(lvl.slotClubCrestOverrideRelPathBySlot || {}) },
      headerLogoScale: lvl.headerLogoScale ?? 1, headerLogoNudgeX: lvl.headerLogoNudgeX ?? 0,
      headerLogoOverrideRelPath: lvl.headerLogoOverrideRelPath || null,
      selectedEntry: lvl.selectedEntry || null,
      __revealPhraseByLanguage: lvl.__revealPhraseByLanguage || null,
    };

    // ── NEW: resolved fields ─────────────────────────────────────────────────
    // Only question levels (index 2 .. totalLevelsCount-2) have meaningful squad data.
    // Logo (index 0), Landing (index 1) and Outro (last) get safe empty defaults.
    const isQuestionLevel = !lvl.isLogo && !lvl.isIntro && !lvl.isOutro && !!lvl.currentSquad;

    // teamName
    let teamName = "";
    try {
      if (isQuestionLevel) {
        teamName = resolveHeaderTeamDisplayName(lvl, quizType) || "";
      }
    } catch { teamName = ""; }

    // headerLogoRel
    let headerLogoRel = "";
    try {
      if (isQuestionLevel) {
        headerLogoRel = deriveHeaderLogoRel(lvl, quizType) || "";
      }
    } catch { headerLogoRel = ""; }

    // slots[]
    let slots = [];
    try {
      if (isQuestionLevel) {
        const formation = formationById(lvl.formationId);
        const squad = lvl.currentSquad;
        const displayMode = lvl.displayMode;

        // Mirror renderPitch()'s XI selection exactly:
        // Use customXi when it matches the formation length AND lastFormationId === formationId.
        let xi;
        if (
          lvl.customXi &&
          Array.isArray(lvl.customXi) &&
          lvl.customXi.length === formation.slots.length &&
          lvl.lastFormationId === lvl.formationId
        ) {
          xi = lvl.customXi;
        } else {
          xi = pickStartingXI(formation, squad);
        }

        // Build the slotPhotoIndexBySlot lookup (Map or plain object).
        const photoIdxMap = lvl.slotPhotoIndexBySlot instanceof Map
          ? lvl.slotPhotoIndexBySlot
          : (lvl.slotPhotoIndexBySlot && typeof lvl.slotPhotoIndexBySlot === "object"
              ? new Map(Object.entries(lvl.slotPhotoIndexBySlot).map(([k, v]) => [Number(k), v]))
              : new Map());

        slots = xi.map((player, si) => {
          if (!player) return { name: "", frontRel: "", photoRel: "" };
          try {
            const name = String(player.name || "").trim();

            // photoRel: use playerPhotoPaths against THIS level's state context.
            // playerPhotoPaths reads appState.currentLevelIndex + getState(); since we
            // are not switching the live level here, the paths it finds depend on the
            // current active state's selectedEntry/currentSquad — which may differ.
            // BEST-EFFORT: call playerPhotoPaths with the player + displayMode; it
            // reads appState.playerImages which is global and independent of active level.
            // The index-based photo pick mirrors renderPitch()'s logic exactly.
            let photoRel = "";
            try {
              // Temporarily set up a proxy: playerPhotoPaths reads getState() for
              // selectedEntry/squadType/currentSquad. Since those differ per-level, we
              // can't call playerPhotoPaths cleanly for non-active levels.
              // Instead, derive paths from appState.playerImages directly:
              const photoPaths = playerPhotoPaths(player, displayMode);
              if (photoPaths.length) {
                let idx = photoIdxMap.get(si) ?? 0;
                idx = ((idx % photoPaths.length) + photoPaths.length) % photoPaths.length;
                photoRel = String(photoPaths[idx] || "");
              }
            } catch { photoRel = ""; }

            // frontRel: flag or club crest
            let frontRel = "";
            try {
              frontRel = resolveSlotFrontRel(lvl, player, si) || "";
            } catch { frontRel = ""; }

            return { name, frontRel, photoRel };
          } catch {
            return { name: "", frontRel: "", photoRel: "" };
          }
        });
      }
    } catch { slots = []; }

    // revealVoiceRel
    // questionIndex for level i (i>=2) is i-1; matches playProgressVoice convention.
    const questionIndex = i - 1;
    let revealVoiceRel = "";
    try {
      if (isQuestionLevel && teamName) {
        const phraseKey = getOrAssignRevealPhrase(lvl, questionIndex, language);
        const candidates = buildRevealVoiceCandidates(teamName, quizType, phraseKey, language);
        revealVoiceRel = candidates[0] || "";
      }
    } catch { revealVoiceRel = ""; }

    // progressVoiceRel
    let progressVoiceRel = "";
    try {
      if (isQuestionLevel) {
        const audioKey = resolveProgressAudioKey(questionIndex, totalQuestions);
        if (audioKey) {
          progressVoiceRel =
            getBundledLevelPath(audioKey, language, appState.bundledVoiceVariants) || "";
        }
      }
    } catch { progressVoiceRel = ""; }

    return {
      ...base,
      teamName,
      headerLogoRel,
      slots,
      revealVoiceRel,
      progressVoiceRel,
    };
  });

  // ── Background theme capture ──────────────────────────────────────────────────
  // Read the LIVE applied DOM — do not re-derive from settings.
  const bgTheme = (() => {
    try {
      const root = document.documentElement;
      const styleEl = document.getElementById("shared-background-theme-style");
      const cs = getComputedStyle(root);
      const grab = (id) => { const el = document.getElementById(id); return el ? el.outerHTML : ""; };

      // Capture the computed body background so the renderer can paint the exact
      // resolved gradient + pattern directly, without relying on body CSS rules
      // that are hidden behind an opaque AbsoluteFill layer.
      let computed = null;
      try {
        const bodyCS = getComputedStyle(document.body);
        computed = {
          backgroundImage: bodyCS.backgroundImage || "",
          backgroundColor: bodyCS.backgroundColor || "",
          backgroundSize: bodyCS.backgroundSize || "",
          backgroundRepeat: bodyCS.backgroundRepeat || "",
          backgroundPosition: bodyCS.backgroundPosition || "",
        };
      } catch { computed = null; }

      return {
        css: styleEl ? styleEl.textContent : "",
        colorAttr: root.getAttribute("data-shared-background-color") || "",
        effectAttr: root.getAttribute("data-shared-background-effect") || "",
        bgStage: (root.style.getPropertyValue("--bg-stage") || cs.getPropertyValue("--bg-stage") || "").trim(),
        lineOpacity: (root.style.getPropertyValue("--shared-line-opacity") || cs.getPropertyValue("--shared-line-opacity") || "3.5").trim(),
        effectOpacity: (root.style.getPropertyValue("--shared-effect-opacity") || cs.getPropertyValue("--shared-effect-opacity") || "0.3").trim(),
        particlesHtml: [grab("shared-background-emojis"), grab("shared-background-question-marks"), grab("shared-background-soccer-balls")].filter(Boolean),
        computed,
      };
    } catch (_) { return null; }
  })();

  return {
    script: getActiveScriptName() || "",
    totalLevelsCount: appState.totalLevelsCount,
    // Question PHASES = indices 2 .. totalLevelsCount-1 (includes the bonus level at
    // totalLevelsCount-1, which IS played with a countdown). Outro is index===totalLevelsCount.
    // (totalQuestions for progress-voice milestones stays -3, computed above.)
    questionCount: Math.max(0, appState.totalLevelsCount - 2),
    totalQuestions: Math.max(0, appState.totalLevelsCount - 3),
    bgmSongs: Array.isArray(appState.bgmSongs) ? appState.bgmSongs.slice() : [],
    bundledVoiceVariants: appState.bundledVoiceVariants || null,
    endingType: typeof window.__getSelectedEndingType === "function" ? window.__getSelectedEndingType() : "think-you-know",
    transitionEffect: (window.__captureTransitionEffect && window.__captureTransitionEffect()) || "grid-overlay",
    quizType,
    levels,
    bgTheme,
  };
}
