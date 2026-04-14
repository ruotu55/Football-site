export const DEFAULT_PLAYER_SILHOUETTE_SCALE_X = 1.0;
export const DEFAULT_PLAYER_SILHOUETTE_SCALE_Y = 1.0;
export const DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET = 0;
export const DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X = 0.85;
export const DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_Y = 1.0;
/** Shorts “Adjust Picture (Video Off)” baseline width/height multipliers. */
export const DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_X = 1.0;
export const DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_Y = 1.0;
/** Shorts "Video On" baseline Y-offset — player starts lower so it sits below the stats panel. */
export const DEFAULT_SHORTS_VIDEO_ON_Y_OFFSET = 13;

export function getDefaultPlayerPictureValues(isShortsLayout = false) {
  return {
    silhouetteYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
    silhouetteScaleX: isShortsLayout
      ? DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X
      : DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
    silhouetteScaleY: isShortsLayout
      ? DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_Y
      : DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
  };
}

/** Defaults for the active Adjust Picture profile (shorts splits Video On vs Video Off). */
export function getDefaultPlayerPictureValuesForCareerMode(isShortsLayout, videoMode) {
  if (!isShortsLayout) return getDefaultPlayerPictureValues(false);
  if (videoMode) return {
    silhouetteYOffset: DEFAULT_SHORTS_VIDEO_ON_Y_OFFSET,
    silhouetteScaleX: DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X,
    silhouetteScaleY: DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_Y,
  };
  return {
    silhouetteYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
    silhouetteScaleX: DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_X,
    silhouetteScaleY: DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_Y,
  };
}

/** One-time-style upgrade: old Video Off default was 0.85×1; new default is 1×1. */
export function migrateShortsVideoOffLegacyNormalProfile(st) {
  if (!st) return;
  const approxS = (value, expected) => Math.abs(Number(value ?? expected) - expected) < 0.001;
  if (
    approxS(st.silhouetteShortsNormalYOffset, DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET) &&
    approxS(st.silhouetteShortsNormalScaleX, DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X) &&
    approxS(st.silhouetteShortsNormalScaleY, DEFAULT_PLAYER_SILHOUETTE_SCALE_Y)
  ) {
    st.silhouetteShortsNormalScaleX = DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_X;
    st.silhouetteShortsNormalScaleY = DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_Y;
  }
}

/** One-time migrate: old Video On Y default was 0; new default is 13. */
export function migrateShortsVideoOnYOffset(st) {
  if (!st) return;
  const approxS = (value, expected) => Math.abs(Number(value ?? expected) - expected) < 0.001;
  if (
    approxS(st.silhouetteShortsVideoYOffset, 0) &&
    approxS(st.silhouetteShortsVideoScaleX, DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X) &&
    approxS(st.silhouetteShortsVideoScaleY, DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_Y)
  ) {
    st.silhouetteShortsVideoYOffset = DEFAULT_SHORTS_VIDEO_ON_Y_OFFSET;
  }
}

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
    quizLevelsInput: null,
    updateLevelsBtn: null,
    quizProgressScroll: null,
    swapModal: null,
    swapClose: null,
    swapList: null,
    swapSearch: null,
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
    saveScriptModalClose: null,
    saveDiscardModal: null,
    saveDiscardNo: null,
    saveDiscardYes: null,
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
    pitchWrap: null,
    logoPage: null, 
    quizProgressContainer: null, 
    sideTextRight: null,
    shortsModeToggle: null,
    shortsModeBtn: null,
    setupShortsCirclePreviewField: null,
    shortsCirclePreviewToggle: null,
    shortsCirclePreviewCount: null,
    inGameMode: null,
    careerWrap: null,
    inCareerClubs: null,
    setupCareerClubsField: null,
    setupCareerSilhouetteField: null,
    btnPictureControls: null,
    btnSilhouettePrev: null,
    btnSilhouetteNext: null,
    silhouetteIndicator: null,
    setupCareerControls: null,
    careerSelectedInfo: null,
    careerEditModal: null,
    careerEditClose: null,
    careerEditOptions: null,
    careerEditSearchContainer: null,
    careerEditBackBtn: null,
    careerEditSearchInput: null,
    careerEditSearchResults: null,
    careerEditImgBtn: null,
    careerEditTeamBtn: null,
    careerEditYearBtn: null
  },
  teamsIndex: { clubs: [], nationalities: [] },
  playerImages: { club: {}, nationality: {} },
  flagcodes: {},
  totalLevelsCount: 7,
  currentLevelIndex: 0,
  levelsData: [],
  swapActiveSlotIndex: -1,
  careerActiveSlotIndex: -1,
  swapAvailablePlayers: [],
  isVideoPlaying: false,
  videoRevealPostTimerActive: false,
  /** Shorts-only: show career club circles without a player (tune css/modes/shorts-career-club-count-map.css). */
  careerShortsCirclePreview: { enabled: false, count: 5 },
  videoInterval: null,
  videoTimeout: null,
  /** Cleared in stopVideoFlow; used for “Add specific title” landing stamp timing. */
  shortsLandingBadgeRevealTimeoutId: null,
  tickingLeadTimeout: null,
  careerRevealFxTimeout: null,
  videoModeToggleFxTimeout: null,
  currentXi: [],
  allGlobalPlayers: null,
};

export function getState() {
  return appState.levelsData[appState.currentLevelIndex];
}

export function initLevels(count) {
  const { els } = appState;
  const newLevels = [];
  const buildDefaultLevel = (i) => {
    const regularPictureDefaults = getDefaultPlayerPictureValues(false);
    const shortsPictureDefaults = getDefaultPlayerPictureValues(true);
    return {
      isLogo: i === 0,
      isIntro: i === 1,
      isBonus: i === count + 2,
      isOutro: i === count + 3,
      gameMode: "career",
      squadType: els.squadType ? els.squadType.value : "club",
      selectedEntry: null,
      currentSquad: null,
      slotPhotoIndexBySlot: new Map(),
      formationId:
        els.formation && els.formation.options.length > 0
          ? els.formation.options[0].value
          : "3421",
      lastFormationId: null,
      displayMode: els.displayMode ? els.displayMode.value : "club",
      searchText: "",
      customXi: null,
      customNames: {},
      videoMode: false,
      landingPageType: "club",
      careerClubsCount: els.inCareerClubs ? parseInt(els.inCareerClubs.value, 10) || 5 : 5,
      careerSilhouetteIndex: 0,
      silhouetteYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
      silhouetteScaleX: regularPictureDefaults.silhouetteScaleX,
      silhouetteScaleY: regularPictureDefaults.silhouetteScaleY,
      silhouetteVideoYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
      silhouetteVideoScaleX: regularPictureDefaults.silhouetteScaleX,
      silhouetteVideoScaleY: regularPictureDefaults.silhouetteScaleY,
      silhouetteNormalYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
      silhouetteNormalScaleX: regularPictureDefaults.silhouetteScaleX,
      silhouetteNormalScaleY: regularPictureDefaults.silhouetteScaleY,
      silhouetteShortsVideoYOffset: DEFAULT_SHORTS_VIDEO_ON_Y_OFFSET,
      silhouetteShortsVideoScaleX: shortsPictureDefaults.silhouetteScaleX,
      silhouetteShortsVideoScaleY: shortsPictureDefaults.silhouetteScaleY,
      silhouetteShortsNormalYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
      silhouetteShortsNormalScaleX: DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_X,
      silhouetteShortsNormalScaleY: DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_Y,
      careerPlayer: null,
      careerHistory: [],
      careerSlotBadgeScales: [],
      careerSlotBadgeScalesRegular: [],
      careerSlotBadgeScalesShorts: [],
      careerSlotYearNudges: [],
    };
  };
  
  for (let i = 0; i <= count + 3; i++) {
    const shouldResetLateQuestionLevels = i === count + 1 || i === count + 2;
    if (shouldResetLateQuestionLevels || !appState.levelsData[i]) {
      newLevels.push(buildDefaultLevel(i));
    } else {
      newLevels.push(appState.levelsData[i]);
    }
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