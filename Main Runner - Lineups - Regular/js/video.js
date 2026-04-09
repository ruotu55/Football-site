import { appState, getState } from "./state.js";
import { switchLevel } from "./levels.js";
import { startBgMusic, stopAllAudio, playRules, playTheAnswerIs, playCommentBelow, playTicking, stopTicking } from "./audio.js";
import { renderProgressSteps } from "./progress.js";
import {
  applyVideoQuestionPostTimerFlip,
  clearPitchWrapTransitionOverride,
  renderHeader,
  renderPitch,
  shouldUseVideoQuestionLayout,
  syncPitchWrapTransitionToVideoReveal,
} from "./pitch-render.js";

/** After Play Video on the logo page: pause before logo reveal + next step. */
const LOGO_PAGE_PLAY_VIDEO_DELAY_MS = 2000;
const INTRO_GAME_NAME_VOICE_DELAY_MS = 500;
/** Must stay in sync with the question-to-question stage transition in `js/levels.js`. */
const LEVEL_SWITCH_STAGE_TRANSITION_MS = 820;

function setVideoRevealPostTimerActive(isActive) {
  const active = !!isActive;
  appState.videoRevealPostTimerActive = active;
  document.body?.classList.toggle("video-reveal-post-timer", active);
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

export function stopVideoFlow() {
  appState.isVideoPlaying = false;
  setVideoRevealPostTimerActive(false);
  clearPitchWrapTransitionOverride();
  document.body.classList.remove("play-video-active");
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  stopAllAudio(); 
  const { els } = appState;
  els.playVideoBtn.hidden = false;
  els.countdownTimer.hidden = true;
  els.countdownTimer.classList.remove("pulse", "timer-green", "timer-yellow");
  els.panelFab.hidden = false;
  renderProgressSteps(appState.totalLevelsCount, switchLevel);
  if (els.quizProgressContainer) {
    els.quizProgressContainer.hidden = false;
  }
  if (els.sideTextRight) {
    els.sideTextRight.hidden = true;
  }
  if (appState.currentLevelIndex === 0) {
    const logoImg = els.logoPage.querySelector('.logo-img-anim');
    if (logoImg) {
      logoImg.classList.remove('reveal');
    }
  }
  refreshCurrentQuestionPreview();
}

export function startVideoFlow() {
  const state = getState();
  const { els } = appState;
  const isShorts = document.body.classList.contains("shorts-mode");
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
  setVideoRevealPostTimerActive(false);
  document.body.classList.add("play-video-active");
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
    els.sideTextRight.hidden = true;
  }

  startBgMusic();
  if (appState.currentLevelIndex <= 1) {
    const quizType = els.inQuizType?.value || "nat-by-club";
    setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      playRules(quizType, 0);
    }, INTRO_GAME_NAME_VOICE_DELAY_MS);
  }

  if (appState.currentLevelIndex === 0) {
    if (isShorts) {
      appState.videoTimeout = setTimeout(() => {
        if (!appState.isVideoPlaying) return;
        switchLevel(1);
        runVideoStep();
      }, LOGO_PAGE_PLAY_VIDEO_DELAY_MS);
      return;
    }
    appState.videoTimeout = setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      const logoImg = els.logoPage.querySelector(".logo-img-anim");
      if (logoImg && !logoImg.classList.contains("reveal")) {
        logoImg.classList.add("reveal");
      }
      appState.videoTimeout = setTimeout(() => {
        if (appState.isVideoPlaying) runVideoStep();
      }, 1200);
    }, LOGO_PAGE_PLAY_VIDEO_DELAY_MS);
    return;
  }

  runVideoStep();
}

function runVideoStep() {
  const { els } = appState;
  setVideoRevealPostTimerActive(false);
  const isIntro = appState.currentLevelIndex < 2; 
  const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
  const isShorts = document.body.classList.contains("shorts-mode");
  const isQuestionLevel = appState.currentLevelIndex > 1 && !isOutro;
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  if (isQuestionLevel && els.teamHeader) {
    clearPitchWrapTransitionOverride();
    els.teamHeader.classList.remove("video-revealed");
    els.teamHeader.classList.add("video-hidden");
  }
  if (isIntro || isOutro) {
    els.countdownTimer.hidden = true;
    els.countdownTimer.classList.remove("pulse", "timer-green", "timer-yellow");
    if (isOutro) {
      return; 
    }
    let delay = appState.currentLevelIndex === 0 ? 1000 : 4000;
    if (isShorts && appState.currentLevelIndex === 1) {
      delay = 1000;
    }
    appState.videoTimeout = setTimeout(() => { 
      revealCurrentLevel(); 
    }, delay);
  } else {
    let count = isShorts ? 5 : 10;
    let totalTime = count;
    const drainTotalTime = totalTime;
    const textEl = document.getElementById("countdown-text");
    const circleEl = document.querySelector(".timer-progress");
    const dashLength = 283; 
    function updateTimerColors(c) {
      if (isShorts) return; 
      if (c > 6) { 
        els.countdownTimer.classList.add("timer-green"); 
        els.countdownTimer.classList.remove("timer-yellow", "pulse"); 
      } else if (c > 3) { 
        els.countdownTimer.classList.add("timer-yellow"); 
        els.countdownTimer.classList.remove("timer-green", "pulse"); 
      } else {
        els.countdownTimer.classList.remove("timer-green", "timer-yellow");
      }
    }
    updateTimerColors(count);
    els.countdownTimer.classList.remove("pulse");
    els.countdownTimer.hidden = false;
    textEl.textContent = String(count);
    if (circleEl) {
      circleEl.style.transition = "none"; 
      circleEl.style.strokeDashoffset = 0; 
      void circleEl.offsetWidth; 
      setTimeout(() => {
        circleEl.style.transition = "stroke-dashoffset 1s linear";
        const ratio = (drainTotalTime - (count - 1)) / drainTotalTime;
        circleEl.style.strokeDashoffset = dashLength * ratio;
      }, 50);
    }
    const delayToTick = (count - (isShorts ? 4.0 : 4.5)) * 1000;
    setTimeout(() => { if (appState.isVideoPlaying) playTicking(); }, delayToTick);
    if (isShorts) {
      const stopTickDelay = (totalTime * 1000) - 200;
      setTimeout(() => { if (appState.isVideoPlaying) stopTicking(); }, stopTickDelay);
    }
    appState.videoInterval = setInterval(() => {
      count--;
      if (count > 0) {
        updateTimerColors(count); 
        els.countdownTimer.hidden = false;
        textEl.textContent = String(count);
        if (circleEl) {
          const nextCount = count - 1; 
          const ratio = (drainTotalTime - nextCount) / drainTotalTime;
          circleEl.style.strokeDashoffset = dashLength * ratio;
        }
        if (count <= 3) {
          if (!els.countdownTimer.classList.contains("pulse")) {
            els.countdownTimer.classList.add("pulse");
          }
        } else {
          els.countdownTimer.classList.remove("pulse");
        }
      } else {
        clearInterval(appState.videoInterval); 
        els.countdownTimer.hidden = true;
        els.countdownTimer.classList.remove("pulse", "timer-green", "timer-yellow");
        revealCurrentLevel();
      }
    }, 1000);
  }
}

function revealCurrentLevel() {
  const { els } = appState;
  const state = getState();
  let flipDelay = 1000;
  if (appState.currentLevelIndex > 1) {
    let isLastQuestion = (appState.currentLevelIndex + 1 === appState.totalLevelsCount);
    if (isLastQuestion) {
      flipDelay = 0;
    } else {
      const teamDisplayName = String(
        state?.currentSquad?.name || state?.selectedEntry?.name || ""
      ).trim();
      const quizType = els.inQuizType?.value || "nat-by-club";
      playTheAnswerIs(true, teamDisplayName, quizType);
      setVideoRevealPostTimerActive(true);
      refreshCurrentQuestionPreview();
      flipDelay = 4000;
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
      appState.videoTimeout = setTimeout(() => {
        if (!appState.isVideoPlaying) return;
        if (appState.currentLevelIndex !== jumpToIndex) return;
        if (shouldContinueVideo) {
          runVideoStep();
        } else {
          stopVideoFlow();
        }
      }, LEVEL_SWITCH_STAGE_TRANSITION_MS);
    } else {
      stopVideoFlow();
    }
  }, flipDelay);
}
