import { appState, getState } from "./state.js";
import { switchLevel } from "./levels.js";
import {
  startBgMusic,
  stopAllAudio,
  playWelcome,
  playBundledQuizTitleShorts,
  playRulesShortsLanding,
  playTheAnswerIs,
  playTicking,
  stopTicking,
} from "./audio.js";
import { renderProgressSteps } from "./progress.js";
import {
  applyVideoQuestionPostTimerFlip,
  clearPitchWrapTransitionOverride,
  renderHeader,
  renderPitch,
  resolveHeaderTeamDisplayName,
  shouldUseVideoQuestionLayout,
  syncPitchWrapTransitionToVideoReveal,
} from "./pitch-render.js";

/** After Play Video on the logo page: pause before BGM, welcome, and logo reveal. */
const LOGO_PAGE_PLAY_VIDEO_DELAY_MS = 2000;
/** Shorts level 1 (if reached): quiz-title voice; pre-delay lives in video.js (0 = immediate). */
const SHORTS_LANDING_PRE_WELCOME_DELAY_MS = 0;
const LANDING_SPECIAL_BADGE_AFTER_PLAY_MS = 2500;
/** Match Career Path - Shorts `levels.js` + `transitions.css` video stage (0.82s). */
const SHORTS_STAGE_CONTENT_SWAP_MS = 820;
const SHORTS_STAGE_ENTER_MS = 820;
/** Added to base question countdown (5s shorts / 3s regular) so each tick stays an equal slice of the longer total. */
const QUESTION_COUNTDOWN_EXTRA_MS = 1500;
/** Start ticking this many ms before the bar enters the red phase (last ~25% of the countdown scale). */
const TICKING_LEAD_BEFORE_RED_MS = 1500;
/** Last-resort if `playing` never fires (blocked audio, etc.); keep high so slow title-voice generate does not start the bar early. */
const SHORTS_INTRO_VOICE_COUNTDOWN_FALLBACK_MS = 12000;

/** Logo→first question: skip pre-countdown stage swap once so the bar lines up with title voice `playing`. */
let shortsSyncIntroVoiceCountdownOnce = false;

/** Must match `levels.js` transition delay before `updateDOMContent` during stage-exit-video-anim. */
function scheduleRunVideoStepAfterShortsStageSwapToOutro() {
  clearTimeout(appState.videoTimeout);
  appState.videoTimeout = setTimeout(() => {
    if (!appState.isVideoPlaying) return;
    runVideoStep();
  }, SHORTS_STAGE_CONTENT_SWAP_MS);
}

function runVideoStepAfterLevelSwitchIfNeeded() {
  const onOutro = appState.currentLevelIndex === appState.totalLevelsCount;
  const isShorts = document.body.classList.contains("shorts-mode");
  if (onOutro && isShorts && appState.isVideoPlaying) {
    scheduleRunVideoStepAfterShortsStageSwapToOutro();
    return;
  }
  runVideoStep();
}

function setVideoRevealPostTimerActive(isActive) {
  appState.videoRevealPostTimerActive = !!isActive;
}

function refreshCurrentQuestionPreview() {
  if (appState.currentLevelIndex <= 1 || appState.currentLevelIndex >= appState.totalLevelsCount) {
    return;
  }
  const state = getState();
  const useVideoQ = shouldUseVideoQuestionLayout(state);
  const postReveal = appState.videoRevealPostTimerActive;

  if (postReveal && useVideoQ) {
    const pitchSlots = appState.els.pitchSlots;
    const occupied = pitchSlots?.querySelectorAll(".player-slot.has-player") ?? [];
    const flipReady =
      occupied.length > 0 &&
      [...occupied].every((el) => el.querySelector(".slot-inner"));

    if (!flipReady) {
      renderPitch();
      const filled = pitchSlots?.querySelectorAll(".player-slot.has-player");
      const n = filled?.length ?? 0;
      syncPitchWrapTransitionToVideoReveal(n);
      renderHeader();
      applyVideoQuestionPostTimerFlip();
      return;
    }
    syncPitchWrapTransitionToVideoReveal(occupied.length);
    renderHeader();
    applyVideoQuestionPostTimerFlip();
    return;
  }

  clearPitchWrapTransitionOverride();
  renderPitch();
  renderHeader();
}

function clearShortsQuestionCountdown() {
  document.body.classList.remove("shorts-question-countdown");
  appState.els.countdownTimer.classList.remove("countdown-timer-stage-enter");
}

/** Shared cleanup for countdown timer UI — used by both timer-reach-0 and manual stop. */
function cleanupCountdownState() {
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  clearTimeout(appState.tickingLeadTimeout);
  appState.tickingLeadTimeout = null;
  stopTicking();
  clearShortsQuestionCountdown();
  const { els } = appState;
  els.countdownTimer.hidden = true;
  els.countdownTimer.classList.remove(
    "pulse",
    "timer-green",
    "timer-yellow",
    "timer-shake",
    "timer-phase-green",
    "timer-phase-orange",
    "timer-phase-yellow",
    "timer-phase-red",
    "countdown-timer-stage-enter"
  );
  const fillEl = document.getElementById("countdown-bar-fill");
  if (fillEl) {
    fillEl.style.transition = "";
    fillEl.style.width = "";
  }
}

/**
 * Trigger the post-timer answer reveal animation.
 * Shared by both timer-finish and manual stop so the transition is always identical.
 * Returns the delay (ms) to wait before the next action.
 */
function triggerAnswerReveal(options = {}) {
  const { playAudio = true } = options;
  const isShorts = document.body.classList.contains("shorts-mode");

  if (isShorts && appState.currentLevelIndex === 1) return 0;
  if (appState.currentLevelIndex <= 1) return 1000;

  const isLastQuestionBeforeOutro =
    appState.currentLevelIndex + 1 === appState.totalLevelsCount;
  if (isLastQuestionBeforeOutro) return 0;

  if (playAudio) {
    const { els } = appState;
    const state = getState();
    const quizType = els.inQuizType?.value || "nat-by-club";
    const teamDisplayName = String(resolveHeaderTeamDisplayName(state, quizType) || "").trim();
    playTheAnswerIs(true, teamDisplayName, quizType);
  }
  setVideoRevealPostTimerActive(true);
  refreshCurrentQuestionPreview();
  return 3000;
}

/**
 * Apply all layout changes to exit video mode.
 * Called while stage is faded out so the user never sees abrupt layout shifts.
 */
function applyTeardownLayout() {
  setVideoRevealPostTimerActive(false);
  clearPitchWrapTransitionOverride();
  document.body.classList.remove("play-video-active");
  document.body.classList.remove("shorts-play-pre-countdown");
  shortsSyncIntroVoiceCountdownOnce = false;
  const { els } = appState;
  if (els.pitchWrap) els.pitchWrap.classList.add("pitch-wrap-snap-height");
  if (els.teamHeader) els.teamHeader.classList.remove("video-hidden", "video-revealed");
  els.playVideoBtn.hidden = false;
  els.panelFab.hidden = false;
  renderProgressSteps(appState.totalLevelsCount, switchLevel);
  if (els.quizProgressContainer) {
    els.quizProgressContainer.hidden = false;
  }
  if (els.sideTextRight) {
    els.sideTextRight.hidden = true;
  }
  if (appState.currentLevelIndex === 0) {
    const logoImg = els.logoPage?.querySelector(".logo-img-anim");
    if (logoImg) {
      logoImg.classList.remove("reveal");
    }
  }
  refreshCurrentQuestionPreview();
}

/**
 * Complete UI teardown after video mode ends.
 * Uses the same stage fade-out / fade-in animation as switchLevel()
 * so the layout change is hidden behind the fade.
 */
function finishVideoTeardown() {
  if (appState.isVideoPlaying) return;
  const stageMain = document.getElementById("stage-main");
  const { els } = appState;

  if (stageMain) {
    stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
    stageMain.classList.add("stage-exit-video-anim");

    setTimeout(() => {
      applyTeardownLayout();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          stageMain.classList.remove("stage-exit-anim", "stage-exit-video-anim");
          void stageMain.offsetWidth;
          stageMain.classList.add("stage-enter-video-anim");

          setTimeout(() => {
            stageMain.classList.remove("stage-enter-video-anim");
            if (els.pitchWrap) els.pitchWrap.classList.remove("pitch-wrap-snap-height");
          }, SHORTS_STAGE_CONTENT_SWAP_MS);
        });
      });
    }, SHORTS_STAGE_CONTENT_SWAP_MS);
  } else {
    applyTeardownLayout();
  }
}

function scheduleLandingSpecialBadgeRevealAfterPlayVideo() {
  clearTimeout(appState.landingSpecialBadgeRevealTimeoutId);
  appState.landingSpecialBadgeRevealTimeoutId = null;
  if (!appState.els?.inSpecificTitleToggle?.checked) {
    appState.refreshLandingUi?.();
    return;
  }
  appState.landingSpecialBadgeRevealTimeoutId = setTimeout(() => {
    appState.landingSpecialBadgeRevealTimeoutId = null;
    if (!appState.isVideoPlaying) return;
    appState.refreshLandingUi?.();
  }, LANDING_SPECIAL_BADGE_AFTER_PLAY_MS);
  appState.refreshLandingUi?.();
}

export function stopVideoFlow() {
  clearTimeout(appState.landingSpecialBadgeRevealTimeoutId);
  appState.landingSpecialBadgeRevealTimeoutId = null;

  const wasOnQuestion = appState.isVideoPlaying &&
    appState.currentLevelIndex > 1 &&
    appState.currentLevelIndex < appState.totalLevelsCount;

  appState.isVideoPlaying = false;
  appState.refreshLandingUi?.();
  cleanupCountdownState();
  stopAllAudio();

  if (wasOnQuestion) {
    const flipDelay = triggerAnswerReveal({ playAudio: false });
    if (flipDelay > 0) {
      appState.videoTimeout = setTimeout(() => {
        finishVideoTeardown();
      }, flipDelay);
      return;
    }
  }

  finishVideoTeardown();
}

function isShortsMode() {
  return (
    document.body.classList.contains("shorts-mode") ||
    document.documentElement.classList.contains("shorts-mode")
  );
}

export function startVideoFlow() {
  const state = getState();
  const { els } = appState;
  const isShorts = isShortsMode();
  if (appState.currentLevelIndex > 1) {
    if (!state.currentSquad) { 
      alert("Please select a team and check the 'Video Mode' box first."); 
      return; 
    }
    if (!state.videoMode) { 
      alert("Please check the 'Video Mode' box first."); 
      return; 
    }
  } else {
    if (!state.videoMode) { 
      alert("Please check the 'Video Mode' box first."); 
      return; 
    }
  }
  if (appState.isVideoPlaying) { 
    stopVideoFlow(); 
    return; 
  }
  appState.isVideoPlaying = true;
  appState.refreshLandingUi?.();
  scheduleLandingSpecialBadgeRevealAfterPlayVideo();
  setVideoRevealPostTimerActive(false);
  document.body.classList.add("play-video-active");
  if (
    isShorts &&
    appState.currentLevelIndex > 1 &&
    appState.currentLevelIndex < appState.totalLevelsCount
  ) {
    document.body.classList.add("shorts-play-pre-countdown");
  }
  renderHeader();
  els.playVideoBtn.hidden = true;
  els.panelFab.hidden = true;
  els.controlPanel.classList.add("collapsed");
  if (els.rightPanel) {
    els.rightPanel.hidden = true;
  }
  renderProgressSteps(appState.totalLevelsCount, switchLevel);
  const isLogo = appState.currentLevelIndex === 0;
  const isLanding = appState.currentLevelIndex === 1;
  const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
  if (els.quizProgressContainer) {
    els.quizProgressContainer.hidden = false;
  }
  if (els.sideTextRight) {
    els.sideTextRight.hidden = !(isLogo || isLanding || isOutro);
  }

  startBgMusic();

  /**
   * Shorts: bundled quiz-type voice + countdown together (timer starts on voice `playing`, not when clip ends).
   * Index 1 = landing (📝). Index 2 = progress dot labeled "1".
   */
  if (isShorts && (appState.currentLevelIndex === 1 || appState.currentLevelIndex === 2)) {
    document.body.classList.add("shorts-play-pre-countdown");
    const quizTypeRaw =
      els.inQuizType?.value ?? document.getElementById("in-quiz-type")?.value ?? "nat-by-club";
    const quizType = String(quizTypeRaw).trim() || "nat-by-club";
    shortsSyncIntroVoiceCountdownOnce = true;
    let introCountdownKickoffDone = false;
    const kickoffIntroQuestionCountdown = () => {
      if (introCountdownKickoffDone || !appState.isVideoPlaying) return;
      introCountdownKickoffDone = true;
      runVideoStep();
    };
    if (appState.currentLevelIndex === 1) {
      switchLevel(2);
    }
    void playBundledQuizTitleShorts(quizType, {
      duckBgm: true,
      onPlaybackStart: kickoffIntroQuestionCountdown,
    });
    clearTimeout(appState.videoTimeout);
    appState.videoTimeout = setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      kickoffIntroQuestionCountdown();
    }, SHORTS_INTRO_VOICE_COUNTDOWN_FALLBACK_MS);
    return;
  }

  /** Shorts logo (level 0): jump to first question; quiz-title voice `playing` kicks off countdown. */
  if (isShorts && appState.currentLevelIndex === 0) {
    document.body.classList.add("shorts-play-pre-countdown");
    const quizType = els.inQuizType?.value || "nat-by-club";
    shortsSyncIntroVoiceCountdownOnce = true;
    let introCountdownKickoffDone = false;
    const kickoffIntroQuestionCountdown = () => {
      if (introCountdownKickoffDone || !appState.isVideoPlaying) return;
      introCountdownKickoffDone = true;
      runVideoStep();
    };
    switchLevel(2);
    void playRulesShortsLanding(quizType, {
      onPlaybackStart: kickoffIntroQuestionCountdown,
    });
    clearTimeout(appState.videoTimeout);
    appState.videoTimeout = setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      kickoffIntroQuestionCountdown();
    }, SHORTS_INTRO_VOICE_COUNTDOWN_FALLBACK_MS);
    return;
  }

  if (appState.currentLevelIndex === 0) {
    appState.videoTimeout = setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      playWelcome();
      const logoImg = els.logoPage?.querySelector(".logo-img-anim");
      if (logoImg && !logoImg.classList.contains("reveal")) {
        logoImg.classList.add("reveal");
      }
      appState.videoTimeout = setTimeout(() => {
        if (appState.isVideoPlaying) runVideoStep();
      }, 1200);
    }, LOGO_PAGE_PLAY_VIDEO_DELAY_MS);
    return;
  }

  if (!isShorts) {
    playWelcome();
  }
  runVideoStep();
}

function runVideoStep() {
  const { els } = appState;
  setVideoRevealPostTimerActive(false);
  clearShortsQuestionCountdown();
  const isIntro = appState.currentLevelIndex < 2; 
  const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
  const isShorts = document.body.classList.contains("shorts-mode");
  const isQuestionLevel = appState.currentLevelIndex > 1 && !isOutro;
  if (isShorts && isQuestionLevel && appState.isVideoPlaying) {
    document.body.classList.add("shorts-play-pre-countdown");
    renderHeader();
  } else {
    document.body.classList.remove("shorts-play-pre-countdown");
  }
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  clearTimeout(appState.tickingLeadTimeout);
  appState.tickingLeadTimeout = null;
  stopTicking();
  if (isQuestionLevel && els.teamHeader) {
    clearPitchWrapTransitionOverride();
    els.teamHeader.classList.remove("video-revealed");
    els.teamHeader.classList.add("video-hidden");
  }
  if (isIntro || isOutro) {
    els.countdownTimer.hidden = true;
    els.countdownTimer.classList.remove(
      "pulse",
      "timer-green",
      "timer-yellow",
      "timer-shake",
      "timer-phase-green",
      "timer-phase-orange",
      "timer-phase-yellow",
      "timer-phase-red",
      "countdown-timer-stage-enter"
    );
    const introFill = document.getElementById("countdown-bar-fill");
    if (introFill) {
      introFill.style.transition = "";
      introFill.style.width = "";
    }
    if (isOutro) {
      return;
    }
    if (isShorts && appState.currentLevelIndex === 1) {
      const quizType = els.inQuizType?.value || "nat-by-club";
      appState.videoTimeout = setTimeout(() => {
        if (!appState.isVideoPlaying) return;
        playRulesShortsLanding(quizType).then(() => {
          if (!appState.isVideoPlaying) return;
          revealCurrentLevel();
        });
      }, SHORTS_LANDING_PRE_WELCOME_DELAY_MS);
      return;
    }
    let delay = appState.currentLevelIndex === 0 ? 1000 : 3000;
    appState.videoTimeout = setTimeout(() => {
      revealCurrentLevel();
    }, delay);
  } else {
    const baseSteps = isShorts ? 5 : 3;
    let count = baseSteps;
    const totalDurationMs = baseSteps * 1000 + QUESTION_COUNTDOWN_EXTRA_MS;
    const totalTime = totalDurationMs / 1000;
    const tickMs = totalDurationMs / baseSteps;
    const fillEl = document.getElementById("countdown-bar-fill");
    /** Wall time from interval start until UI first matches red (same threshold as timer-phase-red). */
    const msUntilRed = (() => {
      for (let s = baseSteps; s >= 1; s--) {
        if (s > 0 && s / totalTime <= 0.25) {
          return (baseSteps - s) * tickMs;
        }
      }
      return (baseSteps - 1) * tickMs;
    })();

    function applyTimerPhase(c) {
      const el = els.countdownTimer;
      const p = c / totalTime;
      el.classList.remove(
        "timer-phase-green",
        "timer-phase-orange",
        "timer-phase-yellow",
        "timer-phase-red"
      );
      if (p > 0.75) el.classList.add("timer-phase-green");
      else if (p > 0.5) el.classList.add("timer-phase-orange");
      else if (p > 0.25) el.classList.add("timer-phase-yellow");
      else el.classList.add("timer-phase-red");
    }

    function updateUrgency(c) {
      els.countdownTimer.classList.remove("pulse", "timer-green", "timer-yellow");
      const isRedPhase = c / totalTime <= 0.25;
      if (isRedPhase) {
        els.countdownTimer.classList.add("timer-shake");
      } else {
        els.countdownTimer.classList.remove("timer-shake");
      }
    }

    function setBarToCountdownMoment(c) {
      if (!fillEl) return;
      const nextPct = Math.max(0, ((c - 1) / baseSteps) * 100);
      fillEl.style.width = `${nextPct}%`;
    }

    function beginQuestionCountdown() {
      if (!appState.isVideoPlaying) return;

      if (isShorts) {
        document.body.classList.remove("shorts-play-pre-countdown");
      }
      applyTimerPhase(count);
      updateUrgency(count);
      if (isShorts) {
        document.body.classList.add("shorts-question-countdown");
      }
      els.countdownTimer.hidden = false;

      if (isShorts) {
        els.countdownTimer.classList.remove("countdown-timer-stage-enter");
        void els.countdownTimer.offsetWidth;
        els.countdownTimer.classList.add("countdown-timer-stage-enter");
        setTimeout(() => {
          els.countdownTimer.classList.remove("countdown-timer-stage-enter");
        }, SHORTS_STAGE_ENTER_MS + 50);
      }

      if (fillEl) {
        fillEl.style.transition = "none";
        fillEl.style.width = "100%";
        void fillEl.offsetWidth;
        setTimeout(() => {
          fillEl.style.transition = `width ${tickMs}ms linear`;
          setBarToCountdownMoment(count);
        }, 50);
      }

      clearTimeout(appState.tickingLeadTimeout);
      const msUntilTicking = Math.max(0, msUntilRed - TICKING_LEAD_BEFORE_RED_MS);
      appState.tickingLeadTimeout = setTimeout(() => {
        appState.tickingLeadTimeout = null;
        if (appState.isVideoPlaying) playTicking();
      }, msUntilTicking);

      appState.videoInterval = setInterval(() => {
        count--;
        if (count > 0) {
          applyTimerPhase(count);
          updateUrgency(count);
          els.countdownTimer.hidden = false;
          setBarToCountdownMoment(count);
        } else {
          cleanupCountdownState();
          const skipRevealToOutro =
            appState.currentLevelIndex + 1 === appState.totalLevelsCount;
          if (skipRevealToOutro) {
            switchLevel(appState.currentLevelIndex + 1);
            runVideoStepAfterLevelSwitchIfNeeded();
            return;
          }
          revealCurrentLevel();
        }
      }, tickMs);
    }

    if (isShorts) {
      els.countdownTimer.hidden = true;
      els.countdownTimer.classList.remove("countdown-timer-stage-enter");
      let swapDelayMs = SHORTS_STAGE_CONTENT_SWAP_MS;
      if (shortsSyncIntroVoiceCountdownOnce) {
        swapDelayMs = 0;
        shortsSyncIntroVoiceCountdownOnce = false;
      }
      appState.videoTimeout = setTimeout(beginQuestionCountdown, swapDelayMs);
    } else {
      beginQuestionCountdown();
    }
  }
}

function revealCurrentLevel() {
  const flipDelay = triggerAnswerReveal({ playAudio: true });
  appState.videoTimeout = setTimeout(() => {
    if (!appState.isVideoPlaying) return;
    setVideoRevealPostTimerActive(false);
    let jumpToIndex = appState.currentLevelIndex + 1;
    if (jumpToIndex <= appState.totalLevelsCount) {
      switchLevel(jumpToIndex);
      const nextState = getState();
      const isNextOutro = jumpToIndex === appState.totalLevelsCount;
      const shouldContinueVideo =
        appState.currentLevelIndex === 1 || isNextOutro || (nextState.videoMode && nextState.currentSquad);
      if (shouldContinueVideo) {
        runVideoStepAfterLevelSwitchIfNeeded();
      } else {
        stopVideoFlow();
      }
    } else {
      stopVideoFlow();
    }
  }, flipDelay);
}
