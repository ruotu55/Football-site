import { appState, getState } from "./state.js";
import { switchLevel } from "./levels.js";
import { startBgMusic, stopAllAudio, playRules, playTheAnswerIs, playCommentBelow, playTicking, stopTicking } from "./audio.js";
import { renderProgressSteps } from "./progress.js";
import { renderCareer, renderHeader, syncCareerSlotControlsVisibility } from "./pitch-render.js";
import { STAGE_VIDEO_LEVEL_TRANSITION_MS, STAGE_VIDEO_LEVEL_ENTER_MS } from "./constants.js";

/** After Play Video on the logo page: pause before logo reveal + next step. */
const LOGO_PAGE_PLAY_VIDEO_DELAY_MS = 2000;
const INTRO_GAME_NAME_VOICE_DELAY_MS = 500;

/* ── GSAP lazy loader ────────────────────────────────────────────── */
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

/** Show the ball-drop preloader, run the GSAP animation, then resolve. */
function playBallPreloader() {
  const preloader = document.getElementById("ball-preloader");
  const ball = preloader?.querySelector(".ball-preloader-ball");
  if (!preloader || !ball) {
    console.warn("[ball-preloader] element not found, skipping");
    return Promise.resolve();
  }

  ball.removeAttribute("style");
  preloader.hidden = false;

  /* Clone DOM background overlays into the preloader when present (shared theme). */
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
    gsap.set(ball, { clearProps: "all" });

    const layer1 = preloader.querySelector(".ball-layer-1");
    const layer2 = preloader.querySelector(".ball-layer-2");

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
          { duration: 2, top: "calc(50vh - 60px)", ease: "bounce.out" },
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

          preloader.style.setProperty("--reveal-cx", cx);
          preloader.style.setProperty("--reveal-cy", cy);
          preloader.classList.add("revealing");
          gsap.set(preloader, { "--reveal-r": "0px" });

          const diag = Math.hypot(window.innerWidth, window.innerHeight);
          ball._expandScale = Math.ceil((diag * 3) / r.width);

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
/** Exit + enter so the next `runVideoStep` runs after the new level has fully faded in (like landing → first question). */
const STAGE_VIDEO_LEVEL_FULL_CYCLE_MS = STAGE_VIDEO_LEVEL_TRANSITION_MS + STAGE_VIDEO_LEVEL_ENTER_MS;

function setVideoRevealPostTimerActive(isActive) {
  const on = !!isActive;
  appState.videoRevealPostTimerActive = on;
  document.body.classList.toggle("career-play-video-answer-reveal", on && appState.isVideoPlaying);
}

function refreshCurrentQuestionPreview() {
  if (appState.currentLevelIndex <= 1 || appState.currentLevelIndex >= appState.totalLevelsCount) {
    return;
  }
  renderCareer();
  renderHeader();
}

function clearCinematicRevealFx() {
  clearTimeout(appState.careerRevealFxTimeout);
  appState.careerRevealFxTimeout = null;
  appState.holdCinematicBackdropForPlayVideoStage = false;
  document.body.classList.remove("career-cinematic-reveal");
  document.body.classList.remove("career-reveal-sync-drop");
  const { els } = appState;
  if (els.careerWrap) {
    els.careerWrap.classList.remove("cinematic-reveal-active");
  }
  const revealOverlay = document.getElementById("career-reveal-overlay");
  if (revealOverlay) {
    revealOverlay.classList.remove("show");
  }
  const revealName = document.getElementById("career-reveal-name");
  if (revealName) {
    revealName.classList.remove("show");
  }
  const silhouette = document.querySelector(".career-silhouette");
  if (silhouette) {
    silhouette.classList.remove("drop-away");
  }
  if (els.teamHeader) {
    els.teamHeader.classList.remove("cinematic-reveal");
  }
}

function triggerCinematicRevealFx(options = {}) {
  const { autoClearMs = null, syncDrop = false } = options;
  const { els } = appState;
  clearCinematicRevealFx();
  document.body.classList.add("career-cinematic-reveal");
  if (syncDrop) {
    document.body.classList.add("career-reveal-sync-drop");
  }
  if (els.careerWrap) {
    els.careerWrap.classList.add("cinematic-reveal-active");
  }
  const revealOverlay = document.getElementById("career-reveal-overlay");
  if (revealOverlay) {
    revealOverlay.classList.add("show");
  }
  const revealName = document.getElementById("career-reveal-name");
  if (revealName) {
    revealName.classList.add("show");
  }
  if (els.teamHeader) {
    els.teamHeader.classList.add("cinematic-reveal");
  }
  if (Number.isFinite(autoClearMs) && autoClearMs >= 0) {
    appState.careerRevealFxTimeout = setTimeout(() => {
      clearCinematicRevealFx();
    }, autoClearMs);
  }
}

function clearShortsQuestionCountdown() {
  document.body.classList.remove("shorts-question-countdown");
}

export function stopVideoFlow() {
  appState.isVideoPlaying = false;
  setVideoRevealPostTimerActive(false);
  document.body.classList.remove("play-video-active");
  clearShortsQuestionCountdown();
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  clearCinematicRevealFx();
  stopAllAudio(); 
  const { els } = appState;
  const state = getState();
  if (els.careerWrap) {
    els.careerWrap.classList.toggle("video-mode-enabled", !!state?.videoMode);
  }
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
  const careerGrid = document.querySelector(".career-grid");
  if (careerGrid) {
    careerGrid.classList.remove("reveal-active");
  }
  syncCareerSlotControlsVisibility();
  refreshCurrentQuestionPreview();
}

export function startVideoFlow() {
  const state = getState();
  const { els } = appState;
  const isShorts = document.body.classList.contains("shorts-mode");
  if (appState.currentLevelIndex > 1) {
    if (!state.careerPlayer) { 
      alert("Please select a player and check the 'Video Mode' box first."); 
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
  if (els.careerWrap) {
    if (state.videoMode) {
      els.careerWrap.classList.add("video-mode-enabled");
    } else {
      els.careerWrap.classList.remove("video-mode-enabled");
    }
  }
  syncCareerSlotControlsVisibility();
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
    els.quizProgressContainer.hidden = isLogo || isLanding || isOutro;
  }
  if (els.sideTextRight) {
    els.sideTextRight.hidden = true;
  }

  startBgMusic();
  if (appState.currentLevelIndex === 0) {
    const quizType = els.inQuizType?.value || "player-by-career-stats";
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

  /* Landing page: 2s pause → ball-drop animation + voice → level switch */
  if (appState.currentLevelIndex === 1) {
    appState.videoTimeout = setTimeout(() => {
      if (!appState.isVideoPlaying) return;
      const quizType = els.inQuizType?.value || "player-by-career-stats";
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
          });
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
  clearCinematicRevealFx();
  clearShortsQuestionCountdown();
  const isIntro = appState.currentLevelIndex < 2; 
  const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
  const isShorts = document.body.classList.contains("shorts-mode");
  const isQuestionLevel = appState.currentLevelIndex > 1 && !isOutro;
  clearInterval(appState.videoInterval);
  clearTimeout(appState.videoTimeout);
  if (els.careerWrap && isQuestionLevel) {
    els.careerWrap.classList.add("video-mode-enabled");
  }
  if (isQuestionLevel && els.teamHeader) {
    // Keep question countdown framing identical on all levels, including level 20 + bonus.
    els.teamHeader.classList.remove("video-revealed");
    els.teamHeader.classList.add("video-hidden");
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
    if (isShorts) {
      document.body.classList.add("shorts-question-countdown");
    }
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
          switchLevel(appState.currentLevelIndex + 1);
          scheduleAfterTransition(() => runVideoStep());
        } else {
          clearShortsQuestionCountdown();
          revealCurrentLevel();
        }
      }
    }, 1000);
  }
}

function revealCurrentLevel() {
  const state = getState();
  let flipDelay = 1000;
  if (appState.currentLevelIndex > 1) {
    const isLastQuestionBeforeOutro =
      appState.currentLevelIndex + 1 === appState.totalLevelsCount;
    const endingType = typeof window.__getSelectedEndingType === "function"
      ? window.__getSelectedEndingType() : "think-you-know";
    const skipBonusReveal = isLastQuestionBeforeOutro && endingType !== "how-many";
    if (!skipBonusReveal) {
      const playerDisplayName = String(state?.careerPlayer?.name || "").trim();
      // In Play Video mode, always announce the revealed player when a name clip exists.
      playTheAnswerIs(true, playerDisplayName);
      setVideoRevealPostTimerActive(true);
      refreshCurrentQuestionPreview();
      flipDelay = 3000;
    } else {
      /* Bonus: no answer reveal — go straight to outro after the question timer. */
      flipDelay = 0;
    }
  }
  appState.videoTimeout = setTimeout(() => {
    if (!appState.isVideoPlaying) return;
    const jumpToIndex = appState.currentLevelIndex + 1;

    if (jumpToIndex <= appState.totalLevelsCount) {
      /* Full viewport (stage + floating background + timer) exits, then the next level enters like landing → first question. */
      switchLevel(jumpToIndex, {
        syncFullViewportVideoStage: true,
        afterPlayVideoStageEnterDone: clearCinematicRevealFx,
      });

      const nextState = getState();
      const isNextOutro = jumpToIndex === appState.totalLevelsCount;
      scheduleAfterTransition(() => {
        if (!appState.isVideoPlaying) return;
        if (appState.currentLevelIndex === 1 || isNextOutro || (nextState.videoMode && nextState.careerPlayer)) {
          runVideoStep();
        } else {
          stopVideoFlow();
        }
      }, STAGE_VIDEO_LEVEL_FULL_CYCLE_MS + 50);
    } else {
      stopVideoFlow();
    }
  }, flipDelay);
}