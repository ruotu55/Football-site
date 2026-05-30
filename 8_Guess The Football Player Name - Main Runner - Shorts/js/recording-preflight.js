/**
 * recording-preflight.js — universal warm-only recording preflight (per-runner adapter).
 *
 * Warms every image the recording will render — starting-XI player photos, the team/
 * club logo, per-slot crest overrides, and the floating-emoji sprites — into the
 * browser's decode cache before OBS connects, so playback never lags loading an asset.
 * Enumeration is shared (collectTeamAssetUrls) and reuses this runner's own render-path
 * playerPhotoPaths, so we pre-decode the exact URLs the pitch will show.
 *
 * Images are WARM-ONLY here (imagesBlocking:false): a missing file is skipped, never a
 * blocking modal — so this can never abort a recording. Voice warming is per-family and
 * not yet wired in this runner.
 *
 * Wired into recording-flow.js#startRecordingAndFullscreen, between loadObsConfig and
 * obsRecorder.connect (so a cancelled preflight never touches OBS).
 */

import { appState } from "./state.js";
import { projectAssetUrl, projectAssetUrlFresh } from "./paths.js";
import { FORMATIONS } from "./formations.js";
import { pickStartingXI } from "./pick-xi.js";
import { playerPhotoPaths } from "./photo-helpers.js";
import { EMOJI_IMAGES } from "./emojis.js";
import { collectTeamAssetUrls } from "../../.Storage/shared/prod-asset-validation.js";
import { runPreflightCore } from "../../.Storage/shared/recording-preflight-core.js";

/** Levels that actually play (skip logo/intro/outro/bonus), with their levelsData index. */
function questionLevels() {
  if (!Array.isArray(appState.levelsData)) return [];
  return appState.levelsData
    .map((lvl, index) => ({ lvl, index }))
    .filter(({ lvl }) => lvl && !lvl.isLogo && !lvl.isIntro && !lvl.isOutro && !lvl.isBonus);
}

/** Label only — image URLs come from the logo chain / photo paths, not from this. */
function resolveLevelTeamName(lvl) {
  return String(lvl?.currentSquad?.name || lvl?.selectedEntry?.name || "").trim();
}

function collectImageUnits() {
  const quizType = appState.els?.inQuizType?.value || "";
  const { imageUnits } = collectTeamAssetUrls({
    questionLevels: questionLevels(),
    quizType,
    resolveLevelTeamName,
    FORMATIONS,
    pickStartingXI,
    appState,
    projectAssetUrl,
    projectAssetUrlFresh,
    playerPhotoPaths,
  });
  // Floating-emoji sprites (one picked at random per spawn during playback).
  if (Array.isArray(EMOJI_IMAGES)) {
    for (const rel of EMOJI_IMAGES) {
      if (rel) imageUnits.push({ label: "emoji", urls: [projectAssetUrlFresh(String(rel).replace(/^\.\.\//, ""))] });
    }
  }
  return imageUnits;
}

/**
 * Warm the recording's assets. Called from recording-flow.js before OBS connects.
 * @param {"english"|"spanish"} [language]  (accepted for call-site parity; unused for images)
 * @returns {Promise<{proceed: boolean}>}
 */
export async function runPreflight(language = "english") {
  return runPreflightCore({
    collectImageUnits,
    imagesBlocking: false,
  });
}
