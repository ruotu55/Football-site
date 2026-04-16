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
/** Added to base question countdown (3s steps) so each tick stays an equal slice of the longer total. */
const QUESTION_COUNTDOWN_EXTRA_MS = 0;
/** Start ticking this many ms before the bar enters the red phase (last ~25% of the countdown scale). */
const TICKING_LEAD_BEFORE_RED_MS = 1500;
/** Last-resort if `playing` never fires (blocked audio, etc.); keep high so slow title-voice generate does not start the bar early. */
const SHORTS_INTRO_VOICE_COUNTDOWN_FALLBACK_MS = 12000;
/** Shorts: when Play Video is pressed on level 1 (first question), wait before quiz voice + countdown. */
const PLAY_VIDEO_LEVEL_1_INTRO_DELAY_MS = 2000;

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
  if (appState.currentLevelIndex <= 0 || appState.currentLevelIndex >= appState.totalLevelsCount) {
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

function clearShortsCountdownSoccer(timerEl) {
  const soccer = timerEl?.querySelector?.(".soccer");
  if (!soccer) return;
  soccer.classList.remove("countdown-soccer-rolling");
  soccer.style.removeProperty("--shorts-soccer-run-ms");
}

function restartShortsCountdownSoccer(timerEl, totalDurationMs) {
  const soccer = timerEl?.querySelector?.(".soccer");
  if (!soccer) return;
  soccer.style.setProperty("--shorts-soccer-run-ms", String(totalDurationMs));
  soccer.classList.remove("countdown-soccer-rolling");
  void soccer.offsetWidth;
  soccer.classList.add("countdown-soccer-rolling");
}

/** Timeouts for shorts linear countdown (phase ticks); cleared with question countdown / stop. */
let shortsCountdownAuxTimeouts = [];

function clearShortsCountdownAuxTimeouts() {
  for (const id of shortsCountdownAuxTimeouts) {
    clearTimeout(id);
  }
  shortsCountdownAuxTimeouts = [];
}

function clearShortsQuestionCountdown() {
  document.body.classList.remove("shorts-question-countdown");
  appState.els.countdownTimer.classList.remove("countdown-timer-stage-enter");
  clearShortsCountdownSoccer(appState.els.countdownTimer);
  clearShortsCountdownAuxTimeouts();
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
  appState.isVideoPlaying = false;
  appState.refreshLandingUi?.();
  setVideoRevealPostTimerActive(false);
  clearPitchWrapTransitionOverride();
  document.body.classList.remove("play-video-active");
  document.body.classList.remove("shorts-play-pre-countdown");
  clearShortsQuestionCountdown();
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoInterval);
  appState.videoInterval = null;
  clearTimeout(appState.videoTimeout);
  clearTimeout(appState.tickingLeadTimeout);
  appState.tickingLeadTimeout = null;
  stopAllAudio();
  shortsSyncIntroVoiceCountdownOnce = false;
  const { els } = appState;
  els.teamHeader?.classList.remove("team-header-stage-exit-video-anim", "team-header-stage-enter-video-anim");
  els.playVideoBtn.hidden = false;
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
  if (appState.currentLevelIndex > 0) {
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
    appState.currentLevelIndex > 0 &&
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
  const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
  if (els.quizProgressContainer) {
    els.quizProgressContainer.hidden = isLogo || isOutro;
  }
  if (els.sideTextRight) {
    els.sideTextRight.hidden = !(isLogo || isOutro);
  }

  startBgMusic();

  /**
   * Shorts: first question (index 1): after a short pause, bundled quiz-type voice + countdown
   * (timer starts on voice `playing`).
   */
  if (isShorts && appState.currentLevelIndex === 1) {
    document.body.classList.add("shorts-play-pre-countdown");
    const quizTypeRaw =
      els.inQuizType?.value ?? document.getElementById("in-quiz-type")?.value ?? "nat-by-club";
    const quizType = String(quizTypeRaw).trim() || "nat-by-club";
    clearTimeout(appState.videoTimeout);
    appState.videoTimeout = setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      shortsSyncIntroVoiceCountdownOnce = true;
      let introCountdownKickoffDone = false;
      const kickoffIntroQuestionCountdown = () => {
        if (introCountdownKickoffDone || !appState.isVideoPlaying) return;
        introCountdownKickoffDone = true;
        runVideoStep();
      };
      void playBundledQuizTitleShorts(quizType, {
        duckBgm: true,
        onPlaybackStart: kickoffIntroQuestionCountdown,
      });
      clearTimeout(appState.videoTimeout);
      appState.videoTimeout = setTimeout(() => {
        if (!appState.isVideoPlaying) return;
        kickoffIntroQuestionCountdown();
      }, SHORTS_INTRO_VOICE_COUNTDOWN_FALLBACK_MS);
    }, PLAY_VIDEO_LEVEL_1_INTRO_DELAY_MS);
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
    switchLevel(1);
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

/** Wait for any running page-transition overlay, then run fn after 200ms.
 *  Falls back to fallbackMs delay when no custom transition is active. */
function scheduleAfterTransition(fn, fallbackMs = 0) {
  if (appState._transitionDone) {
    const p = appState._transitionDone;
    appState._transitionDone = null;
    p.then(() => { appState.videoTimeout = setTimeout(fn, 200); });
  } else if (fallbackMs > 0) {
    appState.videoTimeout = setTimeout(fn, fallbackMs);
  } else {
    fn();
  }
}

function runVideoStep() {
  const { els } = appState;
  setVideoRevealPostTimerActive(false);
  clearShortsQuestionCountdown();
  const isIntro = appState.currentLevelIndex < 1; 
  const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
  const isShorts = document.body.classList.contains("shorts-mode");
  const isQuestionLevel = appState.currentLevelIndex >= 1 && !isOutro;
  if (isShorts && isQuestionLevel && appState.isVideoPlaying) {
    document.body.classList.add("shorts-play-pre-countdown");
    // Skip header update if a transition overlay is still running —
    // renderHeader() will be called after the overlay reveals.
    if (!appState._preserveTeamSidebar) renderHeader();
  } else {
    document.body.classList.remove("shorts-play-pre-countdown");
  }
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoInterval);
  appState.videoInterval = null;
  clearTimeout(appState.videoTimeout);
  clearTimeout(appState.tickingLeadTimeout);
  appState.tickingLeadTimeout = null;
  stopTicking();
  if (isQuestionLevel) {
    clearPitchWrapTransitionOverride();
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
    let delay = appState.currentLevelIndex === 0 ? 1000 : 3000;
    appState.videoTimeout = setTimeout(() => {
      revealCurrentLevel();
    }, delay);
  } else {
    const baseSteps = 3;
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

    function finishQuestionCountdownAfterBar() {
      appState.videoInterval = null;
      clearShortsCountdownAuxTimeouts();
      clearTimeout(appState.tickingLeadTimeout);
      appState.tickingLeadTimeout = null;
      stopTicking();
      els.countdownTimer.hidden = true;
      els.countdownTimer.classList.remove(
        "pulse",
        "timer-green",
        "timer-yellow",
        "timer-shake",
        "timer-phase-green",
        "timer-phase-orange",
        "timer-phase-yellow",
        "timer-phase-red"
      );
      if (fillEl) {
        fillEl.style.transition = "";
        fillEl.style.width = "";
      }
      clearShortsCountdownSoccer(els.countdownTimer);
      const shortsEndingType = typeof window.__getSelectedEndingType === "function"
        ? window.__getSelectedEndingType() : "think-you-know";
      const skipRevealToOutro =
        appState.currentLevelIndex + 1 === appState.totalLevelsCount && shortsEndingType !== "how-many";
      if (skipRevealToOutro) {
        setVideoRevealPostTimerActive(false);
        clearTimeout(appState.videoTimeout);
        switchLevel(appState.currentLevelIndex + 1);
        scheduleAfterTransition(() => runVideoStepAfterLevelSwitchIfNeeded());
        return;
      }
      clearShortsQuestionCountdown();
      revealCurrentLevel();
    }

    function beginQuestionCountdown() {
      if (!appState.isVideoPlaying) return;

      clearInterval(appState.videoInterval);
      clearTimeout(appState.videoInterval);
      appState.videoInterval = null;
      clearShortsCountdownAuxTimeouts();

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

      if (isShorts) {
        if (fillEl) {
          fillEl.style.transition = "none";
          fillEl.style.width = "100%";
          void fillEl.offsetWidth;
          setTimeout(() => {
            fillEl.style.transition = `width ${totalDurationMs}ms linear`;
            fillEl.style.width = "0%";
          }, 50);
        }
        setTimeout(() => restartShortsCountdownSoccer(els.countdownTimer, totalDurationMs), 50);
        for (let step = 1; step < baseSteps; step++) {
          const t = step * tickMs;
          shortsCountdownAuxTimeouts.push(
            setTimeout(() => {
              if (!appState.isVideoPlaying) return;
              applyTimerPhase(baseSteps - step);
              updateUrgency(baseSteps - step);
              els.countdownTimer.hidden = false;
            }, t)
          );
        }
      } else if (fillEl) {
        fillEl.style.transition = "none";
        fillEl.style.width = "100%";
        void fillEl.offsetWidth;
        setTimeout(() => {
          fillEl.style.transition = `width ${tickMs}ms linear`;
          setBarToCountdownMoment(count);
        }, 50);
        clearShortsCountdownSoccer(els.countdownTimer);
      } else {
        clearShortsCountdownSoccer(els.countdownTimer);
      }

      clearTimeout(appState.tickingLeadTimeout);
      const msUntilTicking = Math.max(0, msUntilRed - TICKING_LEAD_BEFORE_RED_MS);
      appState.tickingLeadTimeout = setTimeout(() => {
        appState.tickingLeadTimeout = null;
        if (appState.isVideoPlaying) playTicking();
      }, msUntilTicking);

      if (isShorts) {
        const countdownWallMs = 50 + totalDurationMs;
        appState.videoInterval = setTimeout(() => {
          if (!appState.isVideoPlaying) return;
          finishQuestionCountdownAfterBar();
        }, countdownWallMs);
      } else {
        appState.videoInterval = setInterval(() => {
          count--;
          if (count > 0) {
            applyTimerPhase(count);
            updateUrgency(count);
            els.countdownTimer.hidden = false;
            setBarToCountdownMoment(count);
          } else {
            clearInterval(appState.videoInterval);
            appState.videoInterval = null;
            finishQuestionCountdownAfterBar();
          }
        }, tickMs);
      }
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
  const { els } = appState;
  const state = getState();
  let flipDelay = 1000;
  const isShorts = document.body.classList.contains("shorts-mode");
  if (isShorts && appState.currentLevelIndex === 1) {
    flipDelay = 0;
  }
  if (
    appState.currentLevelIndex >= 1 &&
    appState.currentLevelIndex < appState.totalLevelsCount
  ) {
    const isLastQuestionBeforeOutro =
      appState.currentLevelIndex + 1 === appState.totalLevelsCount;
    const endingType = typeof window.__getSelectedEndingType === "function"
      ? window.__getSelectedEndingType() : "think-you-know";
    const skipBonusReveal = isLastQuestionBeforeOutro && endingType !== "how-many";
    if (!skipBonusReveal) {
      const quizType = els.inQuizType?.value || "nat-by-club";
      const teamDisplayName = String(resolveHeaderTeamDisplayName(state, quizType) || "").trim();
      setVideoRevealPostTimerActive(true);
      refreshCurrentQuestionPreview();
      playTheAnswerIs(true, teamDisplayName, quizType, 0);
      flipDelay = 3000;
    } else {
      /* Bonus: no answer reveal — go straight to outro after the question timer. */
      flipDelay = 0;
    }
  }
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
        scheduleAfterTransition(() => runVideoStepAfterLevelSwitchIfNeeded());
      } else {
        stopVideoFlow();
      }
    } else {
      stopVideoFlow();
    }
  }, flipDelay);
}
