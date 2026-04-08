import { appState, getState } from "./state.js";
import { switchLevel } from "./levels.js";
import {
  startBgMusic,
  stopAllAudio,
  playWelcome,
  playWelcomeShortsLanding,
  playTheAnswerIs,
  playCommentBelow,
  playTicking,
  stopTicking,
} from "./audio.js";
import { renderProgressSteps } from "./progress.js";
import {
  applyVideoQuestionPostTimerFlip,
  clearPitchWrapTransitionOverride,
  renderHeader,
  renderPitch,
  shouldUseVideoQuestionLayout,
  syncPitchWrapTransitionToVideoReveal,
} from "./pitch-render.js";

/** After Play Video on the logo page: pause before BGM, welcome, and logo reveal. */
const LOGO_PAGE_PLAY_VIDEO_DELAY_MS = 2000;
/** Shorts landing: BGM plays; wait before welcome, then full welcome, then level advance. */
const SHORTS_LANDING_PRE_WELCOME_DELAY_MS = 2000;
/** Shorts: “Add specific title” stamp on landing — show only after Play Video, not on static landing. */
const SHORTS_LANDING_SPECIAL_BADGE_AFTER_PLAY_MS = 500;
/** Match `levels.js` stage swap before enter anim; enter duration matches `stage-enter-shorts`. */
const SHORTS_STAGE_CONTENT_SWAP_MS = 1020;
const SHORTS_STAGE_ENTER_MS = 800;
/** Must stay in sync with question-to-question stage transition in `levels.js`. */
const LEVEL_SWITCH_STAGE_TRANSITION_MS = 1020;
/** Added to base question countdown (5s shorts / 3s regular) so each tick stays an equal slice of the longer total. */
const QUESTION_COUNTDOWN_EXTRA_MS = 1500;
/** Start ticking this many ms before the bar enters the red phase (last ~25% of the countdown scale). */
const TICKING_LEAD_BEFORE_RED_MS = 2000;

function setVideoRevealPostTimerActive(isActive) {
  appState.videoRevealPostTimerActive = !!isActive;
}

function hideShortsLandingSpecialBadgeIfEnabled() {
  if (!document.body.classList.contains("shorts-mode")) return;
  const toggle = document.getElementById("in-specific-title-toggle");
  const badge = document.getElementById("landing-special-badge");
  if (toggle?.checked && badge) {
    badge.hidden = true;
  }
}

function scheduleShortsLandingSpecialBadgeAfterPlayVideo() {
  if (!document.body.classList.contains("shorts-mode")) return;
  const toggle = document.getElementById("in-specific-title-toggle");
  if (!toggle?.checked) return;
  setTimeout(() => {
    if (!appState.isVideoPlaying) return;
    const badge = document.getElementById("landing-special-badge");
    if (badge) badge.hidden = false;
  }, SHORTS_LANDING_SPECIAL_BADGE_AFTER_PLAY_MS);
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

export function stopVideoFlow() {
  appState.isVideoPlaying = false;
  setVideoRevealPostTimerActive(false);
  clearPitchWrapTransitionOverride();
  document.body.classList.remove("play-video-active");
  clearShortsQuestionCountdown();
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  clearTimeout(appState.tickingLeadTimeout);
  appState.tickingLeadTimeout = null;
  stopAllAudio();
  const { els } = appState;
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
  hideShortsLandingSpecialBadgeIfEnabled();
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
    els.sideTextRight.hidden = !(isLogo || isLanding || isOutro);
  }

  startBgMusic();
  scheduleShortsLandingSpecialBadgeAfterPlayVideo();

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
      appState.videoTimeout = setTimeout(() => {
        if (!appState.isVideoPlaying) return;
        playWelcomeShortsLanding().then(() => {
          if (!appState.isVideoPlaying) return;
          revealCurrentLevel();
        });
      }, SHORTS_LANDING_PRE_WELCOME_DELAY_MS);
      return;
    }
    let delay = appState.currentLevelIndex === 0 ? 1000 : 4000;
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
          clearInterval(appState.videoInterval);
          clearTimeout(appState.tickingLeadTimeout);
          appState.tickingLeadTimeout = null;
          stopTicking();
          clearShortsQuestionCountdown();
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
          revealCurrentLevel();
        }
      }, tickMs);
    }

    if (isShorts) {
      els.countdownTimer.hidden = true;
      els.countdownTimer.classList.remove("countdown-timer-stage-enter");
      appState.videoTimeout = setTimeout(beginQuestionCountdown, SHORTS_STAGE_CONTENT_SWAP_MS);
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
