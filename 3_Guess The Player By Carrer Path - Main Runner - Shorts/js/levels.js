import { appState, getState, migrateShortsVideoOffLegacyNormalProfile } from "./state.js";
import { renderProgressSteps } from "./progress.js";
import { renderHeader, renderCareer, syncShortsCareerVideoPreviewLayers, refreshCareerPictureControlsDisplay, preloadCareerAssets } from "./pitch-render.js";
import {
  playRules,
  playProgressVoice,
  playCommentBelow,
  setBgMusicForLevel,
} from "./audio.js";
import { runTransition, transitionSettings } from "./transitions.js";
import { syncShortsVideoModeIdleTimerBar } from "./shorts-idle-timer-bar.js";

/** True only while `updateDOMContent` runs for logo→landing; keeps landing copy hidden until logo shift ends. */
let pendingLogoToLandingContentReveal = false;

/** Called during the covered phase of a transition to make the timer bar visible and full.
 *  The ball is started later, in beginQuestionCountdown, so it is perfectly in sync with the bar. */
function _prepTimerBarWhileCovered() {
  const timerEl = appState.els?.countdownTimer;
  const fillEl = document.getElementById("countdown-bar-fill");
  if (!timerEl) return;
  timerEl.classList.remove(
    "countdown-timer-stage-enter",
    "timer-shake",
    "timer-phase-orange",
    "timer-phase-yellow",
    "timer-phase-red"
  );
  timerEl.classList.add("timer-phase-green");
  if (fillEl) {
    fillEl.style.transition = "none";
    fillEl.style.width = "100%";
  }
}

export function switchLevel(index) {
  let idx = index;
  if (document.body.classList.contains("shorts-mode") && idx === 0) {
    idx = 1;
  }
  const prevIndex = appState.currentLevelIndex;
  appState.currentLevelIndex = idx;
  setBgMusicForLevel(appState.currentLevelIndex);
  const state = getState();
  const { els } = appState;
  const isQuestionLevel = index >= 1 && index < appState.totalLevelsCount;
  if (isQuestionLevel && !state.careerPlayer) {
    const baselineQuestionState = appState.levelsData[1];
    if (baselineQuestionState && baselineQuestionState !== state) {
      state.careerClubsCount = baselineQuestionState.careerClubsCount;
      /* Each level starts with fresh default picture settings (3 / 0.90 / 0.90). */
      state.silhouetteYOffset = 3;
      state.silhouetteScaleX = 0.90;
      state.silhouetteScaleY = 0.90;
      state.silhouetteVideoYOffset = 3;
      state.silhouetteVideoScaleX = 0.90;
      state.silhouetteVideoScaleY = 0.90;
      state.silhouetteNormalYOffset = 3;
      state.silhouetteNormalScaleX = 0.90;
      state.silhouetteNormalScaleY = 0.90;
      state.silhouetteShortsVideoYOffset = 3;
      state.silhouetteShortsVideoScaleX = 0.90;
      state.silhouetteShortsVideoScaleY = 0.90;
      state.silhouetteShortsNormalYOffset = -7;
      state.silhouetteShortsNormalScaleX = 0.90;
      state.silhouetteShortsNormalScaleY = 0.90;
      state.careerSlotBadgeScales = [];
      state.careerSlotBadgeScalesRegular = [];
      state.careerSlotBadgeScalesShorts = [];
      state.careerSlotYearNudges = [];
    }
  }
  const isShortsNow = document.body.classList.contains("shorts-mode");
  const isQuestionToQuestionTransition =
    idx !== prevIndex &&
    !isShortsNow &&
    prevIndex >= 1 &&
    prevIndex < appState.totalLevelsCount &&
    idx >= 1 &&
    idx < appState.totalLevelsCount;

  /* Immediately refresh the Adjust Picture panel so it shows the new level's values without waiting for transitions. */
  refreshCareerPictureControlsDisplay(state);

  els.squadType.value = state.squadType;
  els.formation.value = state.formationId;
  els.displayMode.value = state.displayMode;
  els.teamSearch.value = state.searchText;
  els.videoModeToggle.checked = !!state.videoMode;
  if (els.videoModeBtn) {
    els.videoModeBtn.setAttribute("aria-pressed", state.videoMode ? "true" : "false");
  }
  
  document.querySelectorAll('select').forEach(sel => {
    const wrapper = sel.nextElementSibling;
    if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
      const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
      if (triggerSpan) {
        triggerSpan.textContent = sel.options[sel.selectedIndex]?.text || '';
      }
      
      wrapper.querySelectorAll('.custom-select-option').forEach(opt => {
        if (opt.dataset.value === sel.value) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });
    }
  });

  if (state.currentSquad) {
    els.teamSearch.classList.add("team-selected");
  } else {
    els.teamSearch.classList.remove("team-selected");
  }
  els.teamResults.replaceChildren();

  const stageMain = document.getElementById("stage-main");
  const progressContainer = els.quizProgressContainer;

  const updateDOMContent = () => {
    renderProgressSteps(appState.totalLevelsCount, switchLevel);

    const isLogo = appState.currentLevelIndex === 0;
    const isShorts = document.body.classList.contains("shorts-mode");
    const isLanding = appState.currentLevelIndex === 1 && !isShorts;
    const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
    if (els.landingPage && !isLanding) {
      els.landingPage.classList.remove(
        "landing-content-awaiting-shift",
        "landing-content-slide-in"
      );
    }
    if (els.teamHeader) els.teamHeader.style.top = "";
    if (els.careerWrap) els.careerWrap.style.marginTop = "";

    if (els.quizProgressContainer) {
      els.quizProgressContainer.hidden = (isLogo || isLanding || isOutro) && appState.isVideoPlaying;
    }
    
    if (els.sideTextRight) {
      els.sideTextRight.hidden = !((isLogo || isLanding || isOutro) && appState.isVideoPlaying);
    }

    els.logoPage.hidden = true;
    els.landingPage.hidden = true;
    els.outroPage.hidden = true;
    if (els.pitchWrap) els.pitchWrap.hidden = true;
    if (els.careerWrap) {
      els.careerWrap.hidden = true;
    }
    els.teamHeader.hidden = true;
    if (els.playerVoiceControls) els.playerVoiceControls.hidden = true;

    const logoImg = els.logoPage.querySelector(".logo-img-anim");
    if (logoImg) {
      if (!isLogo && !isShorts && !isOutro) {
        logoImg.classList.add("shift-top-right");
        logoImg.classList.remove("reveal");
      } else if (isLogo || isOutro) {
        logoImg.classList.remove("shift-top-right");
      }
    }

    if (isLogo) {
      els.logoPage.hidden = false;
      if (logoImg) {
        logoImg.classList.remove("shift-top-right", "bounce-out");
        if (!appState.isVideoPlaying && !state.videoMode && prevIndex !== 0) {
          // Re-trigger intro animation each time user enters the logo page.
          logoImg.classList.remove("reveal");
          void logoImg.offsetWidth;
          logoImg.classList.add("reveal");
        } else if (state.videoMode && !appState.isVideoPlaying) {
          // In video mode, keep logo hidden until Play Video is pressed.
          logoImg.classList.remove("reveal");
        }
      }
    } else if (isLanding) {
      els.logoPage.hidden = true;
      els.landingPage.hidden = false;
      if (pendingLogoToLandingContentReveal) {
        els.landingPage.classList.add("landing-content-awaiting-shift");
        els.landingPage.classList.remove("landing-content-slide-in");
      } else {
        els.landingPage.classList.remove(
          "landing-content-awaiting-shift",
          "landing-content-slide-in"
        );
      }
    } else if (isOutro) {
      els.logoPage.hidden = isShorts;
      els.outroPage.hidden = false;
    } else {
      els.logoPage.hidden = isShorts;

      els.teamHeader.hidden = false;
      els.teamHeader.classList.remove("video-revealed");
      if (els.pitchWrap) els.pitchWrap.hidden = true;

      if (els.careerWrap) {
        els.careerWrap.hidden = false;
      }

      renderCareer();
      renderHeader();

      // During video playback, ensure the new level loads in hidden/silhouette
      // state so the player isn't briefly shown revealed before runVideoStep.
      if (appState.isVideoPlaying && isShorts && !isLogo && !isLanding && !isOutro) {
        document.body.classList.add("shorts-play-pre-countdown");
        syncShortsCareerVideoPreviewLayers();
      }

      if (isQuestionToQuestionTransition && els.careerWrap) {
        els.careerWrap.classList.remove("video-question-enter-anim");
        void els.careerWrap.offsetWidth;
        els.careerWrap.classList.add("video-question-enter-anim");
        setTimeout(() => {
          if (els.careerWrap) {
            els.careerWrap.classList.remove("video-question-enter-anim");
          }
        }, 820);
      }

      syncShortsCareerVideoPreviewLayers();
    }

    const sharedBg = document.getElementById("shared-bg-layer");
    if (sharedBg) {
      sharedBg.hidden = !(isLogo || isLanding || isOutro);
    }
    
    if (isOutro && prevIndex !== appState.totalLevelsCount && appState.isVideoPlaying) {
      playCommentBelow();
    }

    if (appState.isVideoPlaying) {
      if (isLanding) {
        const quizType = document.getElementById("in-quiz-type").value;
        playRules(quizType);
      } else if (
        !isLogo &&
        !isShorts &&
        appState.currentLevelIndex < appState.totalLevelsCount - 1
      ) {
        playProgressVoice(appState.currentLevelIndex, appState.totalLevelsCount);
      }
    }

    if (isShorts) {
      syncShortsVideoModeIdleTimerBar();
    }
  };

  if (stageMain) {
    const isShorts = document.body.classList.contains("shorts-mode");
    const isLogoToLanding = prevIndex === 0 && index === 1 && !isShorts;
    if (isLogoToLanding) {
      // First page -> second page: logo shifts to top-right first; landing copy slides in from top after.
      const LOGO_SHIFT_MS = 800;
      const LANDING_SLIDE_MS = 650;
      stageMain.classList.remove(
        "stage-exit-anim",
        "stage-exit-video-anim",
        "stage-enter-anim",
        "stage-enter-video-anim"
      );
      pendingLogoToLandingContentReveal = true;
      updateDOMContent();
      pendingLogoToLandingContentReveal = false;
      setTimeout(() => {
        if (appState.currentLevelIndex !== 1 || !els.landingPage) return;
        els.landingPage.classList.remove("landing-content-awaiting-shift");
        void els.landingPage.offsetWidth;
        els.landingPage.classList.add("landing-content-slide-in");
        if (progressContainer) {
          progressContainer.classList.remove(
            "progress-out-reg",
            "progress-out-shorts",
            "progress-in-reg",
            "progress-in-shorts"
          );
          void progressContainer.offsetWidth;
          progressContainer.classList.add("progress-in-reg");
        }
      }, LOGO_SHIFT_MS);
      setTimeout(() => {
        if (els.landingPage && appState.currentLevelIndex === 1) {
          els.landingPage.classList.remove("landing-content-slide-in");
        }
      }, LOGO_SHIFT_MS + LANDING_SLIDE_MS);
      return;
    }

    const isFromLogoPage = prevIndex === 0 && index > 1 && !isShorts;
    if (isFromLogoPage) {
      // Let logo finish its top-right move first, then fade the next page in.
      const logoImg = els.logoPage?.querySelector(".logo-img-anim");
      if (logoImg) {
        logoImg.classList.add("shift-top-right");
        logoImg.classList.remove("reveal");
      }
      stageMain.classList.remove(
        "stage-exit-anim",
        "stage-exit-video-anim",
        "stage-enter-anim",
        "stage-enter-video-anim"
      );
      setTimeout(() => {
        updateDOMContent();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void stageMain.offsetWidth;
            stageMain.classList.add("stage-enter-video-anim");
            if (progressContainer) {
              progressContainer.classList.remove(
                "progress-out-reg",
                "progress-out-shorts",
                "progress-in-reg",
                "progress-in-shorts"
              );
              void progressContainer.offsetWidth;
              progressContainer.classList.add("progress-in-reg");
            }
            setTimeout(() => {
              stageMain.classList.remove("stage-enter-video-anim");
            }, 820);
          });
        });
      }, 820);
      return;
    }

    const isShortsFromLogoToFirstQuestion =
      isShorts &&
      prevIndex === 0 &&
      idx >= 1 &&
      idx < appState.totalLevelsCount &&
      appState.isVideoPlaying;
    if (isShortsFromLogoToFirstQuestion) {
      stageMain.classList.remove(
        "stage-exit-anim",
        "stage-exit-video-anim",
        "stage-enter-anim",
        "stage-enter-video-anim"
      );
      updateDOMContent();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void stageMain.offsetWidth;
          stageMain.classList.add("stage-enter-video-anim");
          if (progressContainer) {
            progressContainer.classList.remove(
              "progress-out-reg",
              "progress-out-shorts",
              "progress-in-reg",
              "progress-in-shorts"
            );
            void progressContainer.offsetWidth;
            progressContainer.classList.add("progress-in-shorts");
          }
          setTimeout(() => {
            stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
          }, 820);
        });
      });
      return;
    }

    // Preload images for the next level BEFORE transition starts
    preloadCareerAssets(state);

    const useCustomTransition = transitionSettings.effect !== "none";

    if (useCustomTransition) {
      stageMain.classList.remove("stage-exit-anim", "stage-exit-video-anim", "stage-enter-anim", "stage-enter-video-anim");
      if (progressContainer) {
        progressContainer.classList.remove("progress-in-reg", "progress-in-shorts");
        progressContainer.classList.add(isShorts ? "progress-out-shorts" : "progress-out-reg");
      }
      appState._transitionDone = runTransition(() => {
        // If video.js flagged it, prep the timer bar now while the screen is covered
        if (appState._prepTimerOnCover) {
          appState._prepTimerOnCover = false;
          _prepTimerBarWhileCovered();
        }

        // Disable CSS transitions on all animated elements so they appear
        // instantly in their final position when the overlay reveals.
        const careerWrap = els.careerWrap;
        const teamHeader = els.teamHeader;
        const careerGrid = document.querySelector(".career-grid");
        const careerSilhouette = document.querySelector(".career-silhouette");
        const revealPhoto = document.getElementById("career-reveal-photo");
        const snapEls = [careerWrap, teamHeader, careerGrid, careerSilhouette, revealPhoto];
        snapEls.forEach(el => { if (el) el.style.transition = "none"; });

        updateDOMContent();

        // Re-query elements that may have been recreated by renderCareer
        const freshGrid = document.querySelector(".career-grid");
        const freshSil = document.querySelector(".career-silhouette");
        const freshPhoto = document.getElementById("career-reveal-photo");
        const allEls = [...snapEls, freshGrid, freshSil, freshPhoto];
        // Flush the instant layout, then restore transitions
        allEls.forEach(el => { if (el) { void el.offsetWidth; el.style.transition = ""; } });

        if (progressContainer) {
          progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
          void progressContainer.offsetWidth;
          progressContainer.classList.add(isShorts ? "progress-in-shorts" : "progress-in-reg");
        }
      });
    } else {
      const exitClass = "stage-exit-video-anim";
      const enterClass = "stage-enter-video-anim";
      const transitionDelay = 820;

      stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
      stageMain.classList.add(exitClass);

      if (progressContainer) {
        progressContainer.classList.remove("progress-in-reg", "progress-in-shorts");
        progressContainer.classList.add(isShorts ? "progress-out-shorts" : "progress-out-reg");
      }

      setTimeout(() => {
        // If video.js flagged it, prep the timer bar now while the screen is covered
        if (appState._prepTimerOnCover) {
          appState._prepTimerOnCover = false;
          _prepTimerBarWhileCovered();
        }
        updateDOMContent();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            stageMain.classList.remove("stage-exit-anim", "stage-exit-video-anim");
            void stageMain.offsetWidth;
            stageMain.classList.add(enterClass);

            if (progressContainer) {
              progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
              void progressContainer.offsetWidth;
              progressContainer.classList.add(isShorts ? "progress-in-shorts" : "progress-in-reg");
            }

            setTimeout(() => {
              stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
            }, 820);
          });
        });
      }, transitionDelay);
    }
  } else {
    updateDOMContent();
  }
}