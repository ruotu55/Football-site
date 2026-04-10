export const appState = {
  els: {
    squadType: null,
    teamSearch: null,
    teamResults: null,
    formation: null,
    displayMode: null,
    pitchSlots: null,
    panelToggle: null,
    panelFab: null,
    controlPanel: null,
    headerName: null,
    headerLogo: null,
    teamVoiceControls: null,
    teamVoicePlay: null,
    teamVoiceDelete: null,
    quizLevelsInput: null,
    updateLevelsBtn: null,
    quizProgressScroll: null,
    swapModal: null,
    swapClose: null,
    swapList: null,
    swapSearch: null,
    swapSearchAll: null,
    swapLogoModal: null,
    swapLogoClose: null,
    swapLogoList: null,
    swapLogoSearch: null,
    swapLogoReset: null,
    videoModeToggle: null,
    playVideoBtn: null,
    countdownTimer: null,
    teamHeader: null,
    tabBtnLanding: null,
    tabBtnSetup: null,
    tabBtnSaved: null,
    panelLanding: null,
    panelSetup: null,
    panelSaved: null,
    setupPitchControls: null,
    btnSaveCurrentTeam: null,
    btnSaveCurrentTeamFab: null,
    btnSaveCurrentTeamLanding: null,
    btnSaveScript: null,
    btnCreateFolder: null,
    savedScriptsList: null,
    saveScriptModal: null,
    saveScriptName: null,
    saveScriptCancel: null,
    saveScriptConfirm: null,
    createFolderModal: null,
    createFolderName: null,
    createFolderCancel: null,
    createFolderConfirm: null,
    deleteScriptModal: null,
    deleteScriptNo: null,
    deleteScriptYes: null,
    inQuizType: null,
    inSpecificTitleToggle: null,
    inSpecificTitleText: null,
    inSpecificTitleIcon: null,
    inEasy: null,
    inMedium: null,
    inHard: null,
    inImpossible: null,
    landingPage: null,
    outroPage: null,
    thumbnailMakerPage: null,
    openThumbnailMakerBtn: null,
    thumbnailMakerBackBtn: null,
    thumbnailMakerAddBtn: null,
    thumbnailMakerResetBtn: null,
    thumbnailMakerCanvas: null,
    thumbnailPickerModal: null,
    thumbnailPickerTitle: null,
    thumbnailPickerSearch: null,
    thumbnailPickerSelect: null,
    thumbnailPickerCancel: null,
    thumbnailPickerApply: null,
    pitchWrap: null,
    logoPage: null, 
    quizProgressContainer: null, 
    sideTextRight: null,
    shortsModeToggle: null,
    shortsModeBtn: null,
  },
  teamsIndex: { clubs: [], nationalities: [] },
  /** Map nationality string -> players from club squads with NT caps; null until lazy-loaded. */
  internationalClubPool: null,
  internationalClubPoolLoadPromise: null,
  playerImages: { club: {}, nationality: {} },
  flagcodes: {},
  totalLevelsCount: 20,
  currentLevelIndex: 0,
  levelsData: [],
  swapActiveSlotIndex: -1,
  careerActiveSlotIndex: -1,
  swapAvailablePlayers: [],
  /** Latest list for swap-logo modal (refetched when modal opens; live via `run_site.py`). */
  otherTeamsLogoNames: null,
  /** Bust browser cache for modal crest thumbnails after folder changes. */
  swapLogoThumbCacheToken: "0",
  /** While swap-logo modal is open: `null` = team header crest; `{ kind: "slot", slotIndex }` = national XI slot front. */
  swapLogoPickContext: null,
  /** One-shot: next `renderPitch` skips staggered flip-card transition (swap picker). */
  suppressPitchSlotFlipAnimation: false,
  isVideoPlaying: false,
  videoRevealPostTimerActive: false,
  videoInterval: null,
  videoTimeout: null,
  currentXi: [],
  allGlobalPlayers: null,
};

export function getState() {
  const direct = appState.levelsData[appState.currentLevelIndex];
  if (direct) return direct;
  const lastQuizIndex = Math.min(
    Math.max(1, appState.totalLevelsCount),
    Math.max(1, appState.levelsData.length - 1),
  );
  return appState.levelsData[lastQuizIndex] || appState.levelsData[1] || null;
}

/** Same step/min as header logo zoom; used for video-mode front-face graphics only. */
export const SLOT_BADGE_SCALE_STEP = 0.1;
export const SLOT_BADGE_SCALE_MIN = 0.001;
/** Club squads: nationality flag on the card front (original default size). */
export const DEFAULT_SLOT_FLAG_SCALE = 1;
/** National squads: club crest on the card front — original default (two “−” steps from 1.0). */
export const DEFAULT_SLOT_TEAM_LOGO_SCALE = 1 - 2 * SLOT_BADGE_SCALE_STEP;

export function sanitizeSlotBadgeScale(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  const r = Math.round(x * 1000) / 1000;
  return r < SLOT_BADGE_SCALE_MIN ? SLOT_BADGE_SCALE_MIN : r;
}

const SLOT_BADGE_SLOT_COUNT = 11;

function migrateLegacySlotBadgeScales(state) {
  if (!Array.isArray(state.slotBadgeScales)) return;
  if (!Array.isArray(state.slotTeamLogoScales)) {
    state.slotTeamLogoScales = [...state.slotBadgeScales];
  }
  if (!Array.isArray(state.slotFlagScales)) {
    state.slotFlagScales = Array(SLOT_BADGE_SLOT_COUNT).fill(DEFAULT_SLOT_FLAG_SCALE);
  }
  delete state.slotBadgeScales;
}

/** Per-slot scale for video-mode front: flags (club XI) vs club logos (national XI). */
export function ensureSlotFrontFaceScales(state) {
  if (!state) return;
  migrateLegacySlotBadgeScales(state);

  if (!Array.isArray(state.slotFlagScales)) {
    state.slotFlagScales = Array(SLOT_BADGE_SLOT_COUNT).fill(DEFAULT_SLOT_FLAG_SCALE);
  } else {
    while (state.slotFlagScales.length < SLOT_BADGE_SLOT_COUNT) {
      state.slotFlagScales.push(DEFAULT_SLOT_FLAG_SCALE);
    }
    for (let i = 0; i < SLOT_BADGE_SLOT_COUNT; i++) {
      state.slotFlagScales[i] = sanitizeSlotBadgeScale(
        state.slotFlagScales[i] ?? DEFAULT_SLOT_FLAG_SCALE
      );
    }
  }

  if (!Array.isArray(state.slotTeamLogoScales)) {
    state.slotTeamLogoScales = Array(SLOT_BADGE_SLOT_COUNT).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE);
  } else {
    while (state.slotTeamLogoScales.length < SLOT_BADGE_SLOT_COUNT) {
      state.slotTeamLogoScales.push(DEFAULT_SLOT_TEAM_LOGO_SCALE);
    }
    for (let i = 0; i < SLOT_BADGE_SLOT_COUNT; i++) {
      state.slotTeamLogoScales[i] = sanitizeSlotBadgeScale(
        state.slotTeamLogoScales[i] ?? DEFAULT_SLOT_TEAM_LOGO_SCALE
      );
    }
  }

  const teamScales = state.slotTeamLogoScales;
  const uniform = (v) =>
    teamScales.slice(0, SLOT_BADGE_SLOT_COUNT).every(
      (s) => sanitizeSlotBadgeScale(s) === v
    );
  // Levels left at our temporary uniform defaults → restore original 0.8 crest size.
  if (uniform(1) || uniform(1.05) || uniform(1.25) || uniform(1.5)) {
    state.slotTeamLogoScales = Array(SLOT_BADGE_SLOT_COUNT).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE);
  }
}

export function initLevels(count) {
  const { els } = appState;
  const newLevels = [];
  
  for (let i = 0; i <= count + 3; i++) {
    newLevels.push(
      appState.levelsData[i] || {
        isLogo: i === 0,
        isIntro: i === 1,
        isBonus: i === count + 2,
        isOutro: i === count + 3,
        gameMode: "lineup",
        squadType: els.squadType ? els.squadType.value : "club",
        selectedEntry: null,
        currentSquad: null,
        slotPhotoIndexBySlot: new Map(),
        formationId: "433",
        lastFormationId: null,
        displayMode: els.displayMode ? els.displayMode.value : "club",
        searchText: "",
        customXi: null,
        customNames: {},
        videoMode: false,
        landingPageType: "club",
        careerClubsCount: els.inCareerClubs ? parseInt(els.inCareerClubs.value, 10) || 5 : 5,
        careerSilhouetteIndex: 0,
        silhouetteYOffset: 0,
        silhouetteScaleX: 1.0,
        silhouetteScaleY: 1.0,
        careerPlayer: null,
        careerHistory: [],
        headerLogoScale: 1,
        headerLogoNudgeX: 0,
        headerLogoOverrideRelPath: null,
        /** National XI + video mode: per-slot club crest PNG rel path from `(1) Other Teams`. Keys: "0".."10". */
        slotClubCrestOverrideRelPathBySlot: {},
        slotFlagScales: Array(SLOT_BADGE_SLOT_COUNT).fill(DEFAULT_SLOT_FLAG_SCALE),
        slotTeamLogoScales: Array(SLOT_BADGE_SLOT_COUNT).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE),
      }
    );
    const last = newLevels[newLevels.length - 1];
    if (last.headerLogoScale === undefined || last.headerLogoScale === null) {
      last.headerLogoScale = 1;
    }
    if (last.headerLogoNudgeX === undefined || last.headerLogoNudgeX === null) {
      last.headerLogoNudgeX = 0;
    }
    if (last.headerLogoOverrideRelPath === undefined) {
      last.headerLogoOverrideRelPath = null;
    }
    if (!last.slotClubCrestOverrideRelPathBySlot || typeof last.slotClubCrestOverrideRelPathBySlot !== "object") {
      last.slotClubCrestOverrideRelPathBySlot = {};
    }
    ensureSlotFrontFaceScales(last);
  }
  appState.levelsData = newLevels;
  appState.totalLevelsCount = count + 3;
  if (appState.currentLevelIndex > count + 3) {
    appState.currentLevelIndex = count + 3;
  }
}

export function clearSlotPhotoIndices() {
  getState().slotPhotoIndexBySlot.clear();
}