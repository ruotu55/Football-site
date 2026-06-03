// js/remotion-state-export.js
import { appState } from "./state.js";
import { getActiveScriptName } from "./saved-scripts.js?v=20260601-autoopen5";

/** Serialize the live on-screen state into Remotion render props.
 *  Photos/logos are emitted as repo-relative paths; the server maps them to URLs. */
export function buildRemotionState() {
  const levels = appState.levelsData.map((lvl) => ({
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
  }));
  return {
    script: getActiveScriptName() || "",
    totalLevelsCount: appState.totalLevelsCount,
    questionCount: Math.max(0, appState.totalLevelsCount - 3),
    bgmSongs: Array.isArray(appState.bgmSongs) ? appState.bgmSongs.slice() : [],
    bundledVoiceVariants: appState.bundledVoiceVariants || null,
    endingType: typeof window.__getSelectedEndingType === "function" ? window.__getSelectedEndingType() : "think-you-know",
    transitionEffect: (window.__captureTransitionEffect && window.__captureTransitionEffect()) || "grid-overlay",
    levels,
  };
}
