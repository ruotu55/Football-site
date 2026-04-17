import { appState, getState } from "./state.js";
import { switchLevel } from "./levels.js";
import { startBgMusic, stopAllAudio, playRules, playTheAnswerIs, playCommentBelow, playTicking, stopTicking } from "./audio.js";
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

/** After Play Video on the logo page: pause before logo reveal + next step. */
const LOGO_PAGE_PLAY_VIDEO_DELAY_MS = 2000;

/* ── GSAP lazy loader (eagerly kicked off at module load) ────────── */
let gsapLib = null;
function loadGsap() {
  if (gsapLib) return Promise.resolve(gsapLib);
  return new Promise((resolve, reject) => {
    if (window.gsap) { gsapLib = window.gsap; return resolve(gsapLib); }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
    s.onload = () => { gsapLib = window.gsap; resolve(gsapLib); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Eagerly preload GSAP so the ball-preloader animation starts without network delay.
loadGsap();

/** Show the ball-drop preloader, run the GSAP animation, then resolve. */
function playBallPreloader() {
  const preloader = document.getElementById("ball-preloader");
  const ball = preloader?.querySelector(".ball-preloader-ball");
  if (!preloader || !ball) {
    console.warn("[ball-preloader] element not found, skipping");
    return Promise.resolve();
  }

  /* Reset ball to starting position */
  ball.removeAttribute("style");
  preloader.hidden = false;

  /* Clone DOM background overlays (emojis, question marks) into the preloader if present. */
  (function mirrorDomBackgroundOverlays() {
    preloader.querySelectorAll(".ball-bg-mirror").forEach(el => el.remove());
    ["shared-background-emojis", "shared-background-question-marks"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        const clone = el.cloneNode(true);
        clone.removeAttribute("id");
        clone.className = "ball-bg-mirror " + el.className;
        clone.style.zIndex = "2";
        preloader.appendChild(clone);
      }
    });
  })();

  return loadGsap().then((gsap) => {
    /* Clear any leftover transforms from a previous run */
    gsap.set(ball, { clearProps: "all" });

    /* Read the stage colour so the scale-up blends with the background */
    const stageColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-stage").trim() || "#3c6553";

    const layer1 = preloader.querySelector(".ball-layer-1");
    const layer2 = preloader.querySelector(".ball-layer-2");

    /* Both layers start fully solid (no hole) */
    gsap.set(layer1, { "--reveal-r": "0px" });
    gsap.set(layer2, { "--reveal-r": "0px" });

    const maxR = Math.ceil(Math.hypot(window.innerWidth, window.innerHeight)) + "px";

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        gsap.set(ball, { top: "-130px" });

        const tl = gsap.timeline();

        /* 1. Ball bounces down to center */
        tl.fromTo(
          ball,
          { top: "-130px" },
          {
            duration: 2,
            top: "calc(50vh - 60px)",
            ease: "bounce.out",
          },
        )
        /* 2. Prepare: mask on the preloader + ball expansion */
        .call(() => {
          const sphere = preloader.querySelector(".ball-sphera");
          const r = (sphere ?? ball).getBoundingClientRect();
          const cx = Math.round(r.left + r.width / 2) + "px";
          const cy = Math.round(r.top + r.height / 2) + "px";

          /* Remove mirrored bg-effect elements and reset layer-1 to flat colour
             so the reveal mask works cleanly against a solid background. */
          preloader.querySelectorAll(".ball-bg-mirror").forEach(el => el.remove());
          layer1.style.cssText = "";

          /* Radial mask on the whole preloader — hole reveals landing */
          preloader.style.setProperty("--reveal-cx", cx);
          preloader.style.setProperty("--reveal-cy", cy);
          preloader.classList.add("revealing");
          gsap.set(preloader, { "--reveal-r": "0px" });

          /* Scale ball well PAST the viewport so it never stops in view */
          const diag = Math.hypot(window.innerWidth, window.innerHeight);
          ball._expandScale = Math.ceil((diag * 3) / r.width);

          /* Transform-origin at the visual centre of the ball */
          const bRect = ball.getBoundingClientRect();
          const ox = (r.left + r.width / 2) - bRect.left;
          const oy = (r.top  + r.height / 2) - bRect.top;
          gsap.set(ball, { transformOrigin: `${ox}px ${oy}px` });
        })
        /* 3. Ball EXPANDS outward — constant speed, one take */
        .to(ball, {
          scale: () => ball._expandScale,
          duration: 1.6,
          ease: "none",
        })
        /* 4. Landing opens from inside while ball keeps going */
        .to(preloader, {
          "--reveal-r": maxR,
          duration: 1.3,
          ease: "none",
        }, "<+=0.3")
        /* 5. Done */
        .set(preloader, {
          onComplete: () => {
            preloader.hidden = true;
            preloader.classList.remove("revealing");
            preloader.querySelectorAll(".ball-bg-mirror").forEach(el => el.remove());
            layer1.removeAttribute("style");
            gsap.set([ball, layer1, layer2], { clearProps: "all" });
            resolve();
          },
        });
      });
    });
  }).catch((err) => {
    console.error("[ball-preloader] GSAP failed:", err);
    preloader.hidden = true;
  });
}
const INTRO_GAME_NAME_VOICE_DELAY_MS = 500;
const LANDING_SPECIAL_BADGE_AFTER_PLAY_MS = 2500;
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
  /* Hide ball preloader if mid-animation */
  const preloader = document.getElementById("ball-preloader");
  if (preloader) { preloader.hidden = true; }
  setVideoRevealPostTimerActive(false);
  clearPitchWrapTransitionOverride();
  document.body.classList.remove("play-video-active");
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  stopAllAudio(); 
  const { els } = appState;
  els.teamHeader?.classList.remove("team-header-stage-exit-video-anim", "team-header-stage-enter-video-anim");
  els.playVideoBtn.hidden = false;
  els.countdownTimer.hidden = true;
  els.countdownTimer.classList.remove("pulse", "timer-green", "timer-yellow");
  els.panelFab.hidden = false;
  renderProgressSteps(appState.totalLevelsCount, switchLevel);
  if (els.quizProgressContainer) {
    els.quizProgressContainer.hidden = document.body.classList.contains("youtube-thumbnails-mode");
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
  if (appState.currentLevelIndex > 1 && !state.currentSquad) {
    alert("Please select a team first.");
    return;
  }
  if (appState.isVideoPlaying) {
    stopVideoFlow();
    return;
  }
  appState.isVideoPlaying = true;
  // Auto-enable video mode on ALL levels
  appState.levelsData.forEach((lvl) => { lvl.videoMode = true; });
  appState.refreshLandingUi?.();
  scheduleLandingSpecialBadgeRevealAfterPlayVideo();
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
    const yt = document.body.classList.contains("youtube-thumbnails-mode");
    els.quizProgressContainer.hidden = yt || isLogo || isLanding || isOutro;
  }
  if (els.sideTextRight) {
    els.sideTextRight.hidden = true;
  }

  startBgMusic();

  if (appState.currentLevelIndex === 0) {
    /* Logo page: play voice immediately, then do logo reveal */
    const quizType = els.inQuizType?.value || "nat-by-club";
    setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      playRules(quizType, 0);
    }, INTRO_GAME_NAME_VOICE_DELAY_MS);

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

  /* Landing page: 2s pause → ball-drop animation → landing revealed → voice */
  if (appState.currentLevelIndex === 1) {
    appState.videoTimeout = setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      /* Play the quiz type voice as soon as the ball starts jumping,
         then move to level 1 as soon as the voice finishes */
      const quizType = els.inQuizType?.value || "nat-by-club";
      playBallPreloader();
      setTimeout(() => {
        if (!appState.isVideoPlaying) return;
        playRules(quizType, 0).then(() => {
          if (!appState.isVideoPlaying) return;
          /* Skip runVideoStep delays — go straight to level 2 */
          switchLevel(2);
          scheduleAfterTransition(() => {
            if (!appState.isVideoPlaying) return;
            runVideoStep();
          }, LEVEL_SWITCH_STAGE_TRANSITION_MS);
        });
      }, INTRO_GAME_NAME_VOICE_DELAY_MS + 200);
    }, 2000);
    return;
  }

  runVideoStep();
}

/** Wait for any running page-transition overlay, then run fn after 200ms.
 *  Falls back to fallbackMs delay when no custom transition is active. */
function scheduleAfterTransition(fn, fallbackMs = 0) {
  if (appState._transitionDone) {
    const p = appState._transitionDone;
    appState._transitionDone = null;
    p.then(() => { appState.videoTimeout = setTimeout(fn, 200); })
     .catch(() => { appState.videoTimeout = setTimeout(fn, fallbackMs || 200); });
  } else if (fallbackMs > 0) {
    appState.videoTimeout = setTimeout(fn, fallbackMs);
  } else {
    fn();
  }
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
  if (isQuestionLevel) {
    clearPitchWrapTransitionOverride();
  }
  if (isIntro || isOutro) {
    els.countdownTimer.hidden = true;
    els.countdownTimer.classList.remove("pulse", "timer-green", "timer-yellow");
    if (isOutro) {
      return; 
    }
    let delay = appState.currentLevelIndex === 0 ? 1000 : 500;
    if (isShorts && appState.currentLevelIndex === 1) {
      delay = 1000;
    }
    appState.videoTimeout = setTimeout(() => { 
      revealCurrentLevel(); 
    }, delay);
  } else {
    let count = 3;
    let totalTime = count;
    const drainTotalTime = totalTime;
    const textEl = document.getElementById("countdown-text");
    const showNumericCountdown = isShorts;
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
    textEl.textContent = showNumericCountdown ? String(count) : "";
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
    const delayToTick = Math.max(0, (count - (isShorts ? 4.0 : 3.0)) * 1000);
    setTimeout(() => { if (appState.isVideoPlaying) playTicking(); }, delayToTick);
    const stopTickDelay = totalTime * 1000;
    setTimeout(() => { if (appState.isVideoPlaying) stopTicking(); }, stopTickDelay);
    appState.videoInterval = setInterval(() => {
      count--;
      if (count > 0) {
        updateTimerColors(count); 
        els.countdownTimer.hidden = false;
        textEl.textContent = showNumericCountdown ? String(count) : "";
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
        stopTicking();
        els.countdownTimer.hidden = true;
        els.countdownTimer.classList.remove("pulse", "timer-green", "timer-yellow");
        const shortsEndingType = typeof window.__getSelectedEndingType === "function"
          ? window.__getSelectedEndingType() : "think-you-know";
        const skipRevealToOutro =
          isShorts && appState.currentLevelIndex + 1 === appState.totalLevelsCount && shortsEndingType !== "how-many";
        if (skipRevealToOutro) {
          setVideoRevealPostTimerActive(false);
          const jumpToIndex = appState.currentLevelIndex + 1;
          switchLevel(jumpToIndex);
          const nextState = getState();
          const isNextOutro = jumpToIndex === appState.totalLevelsCount;
          const shouldContinueVideo =
            appState.currentLevelIndex === 1 ||
            isNextOutro ||
            (nextState.videoMode && nextState.currentSquad);
          scheduleAfterTransition(() => {
            if (!appState.isVideoPlaying) return;
            if (appState.currentLevelIndex !== jumpToIndex) return;
            if (shouldContinueVideo) {
              runVideoStep();
            } else {
              stopVideoFlow();
            }
          }, LEVEL_SWITCH_STAGE_TRANSITION_MS);
        } else {
          revealCurrentLevel();
        }
      }
    }, 1000);
  }
}

function revealCurrentLevel() {
  const { els } = appState;
  const state = getState();
  let flipDelay = 1000;
  if (appState.currentLevelIndex > 1) {
    const isLastQuestionBeforeOutro =
      appState.currentLevelIndex + 1 === appState.totalLevelsCount;
    const endingType = typeof window.__getSelectedEndingType === "function"
      ? window.__getSelectedEndingType() : "think-you-know";
    const skipBonusReveal = isLastQuestionBeforeOutro && endingType !== "how-many";
    if (!skipBonusReveal) {
      try {
        const quizType = els.inQuizType?.value || "nat-by-club";
        const teamDisplayName = String(resolveHeaderTeamDisplayName(state, quizType) || "").trim();
        setVideoRevealPostTimerActive(true);
        refreshCurrentQuestionPreview();
        /* Panel opens here; team clip used to wait 600ms for duck — start with the window. */
        playTheAnswerIs(true, teamDisplayName, quizType, 0);
      } catch (err) {
        console.error("[revealCurrentLevel] reveal error:", err);
      }
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
      scheduleAfterTransition(() => {
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
