export const DEFAULT_PLAYER_SILHOUETTE_SCALE_X = 1.0;
export const DEFAULT_PLAYER_SILHOUETTE_SCALE_Y = 1.0;
export const DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET = 0;
export const DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X = 0.85;
export const DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_Y = 1.0;

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
    playerVoiceControls: null,
    playerVoicePlay: null,
    playerVoiceDelete: null,
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
    inEndingType: null,
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
    youtubeThumbnailsBtn: null,
    sideTextLeft: null,
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
    btnRevealPhoto: null,
    setupCareerControls: null,
    btnCareerBrowse: null,
    careerBrowseContainer: null,
    btnCareerBrowseBack: null,
    careerBrowseSearch: null,
    careerBrowseList: null,
    careerSelectedInfo: null,
    btnBrowseModeTeam: null,
    btnBrowseModeName: null,
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
  totalLevelsCount: 32,
  currentLevelIndex: 0,
  levelsData: [],
  swapActiveSlotIndex: -1,
  careerActiveSlotIndex: -1,
  swapAvailablePlayers: [],
  isVideoPlaying: false,
  videoRevealPostTimerActive: false,
  /** Set in `app.js` to `updateLanding` so `video.js` can refresh specific-title visibility. */
  refreshLandingUi: null,
  /** Cleared in stopVideoFlow; used for “Add specific title” landing stamp timing. */
  landingSpecialBadgeRevealTimeoutId: null,
  /** Shorts-only: show career club circles without a player (tune css/modes/shorts-career-club-count-map.css). */
  careerShortsCirclePreview: { enabled: false, count: 5 },
  videoInterval: null,
  videoTimeout: null,
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
      silhouetteShortsVideoYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
      silhouetteShortsVideoScaleX: shortsPictureDefaults.silhouetteScaleX,
      silhouetteShortsVideoScaleY: shortsPictureDefaults.silhouetteScaleY,
      silhouetteShortsNormalYOffset: DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
      silhouetteShortsNormalScaleX: shortsPictureDefaults.silhouetteScaleX,
      silhouetteShortsNormalScaleY: shortsPictureDefaults.silhouetteScaleY,
      careerPlayer: null,
      careerHistory: [],
      careerSlotBadgeScales: [],
      careerSlotBadgeScalesRegular: [],
      careerSlotBadgeScalesShorts: [],
      careerSlotYearNudges: [],
      /** Ready photo file variant (1 = ``{Name}.png``, 2 = ``{Name} 2.png``, …). */
      careerReadyPhotoVariantIndex: 1,
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