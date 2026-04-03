import { appState, getState } from "./state.js";
import { renderProgressSteps } from "./progress.js";
import { getVideoQuestionPreviewState, renderHeader, renderCareer } from "./pitch-render.js";
import { playRules, playProgressVoice, playCommentBelow } from "./audio.js";

/** True only while `updateDOMContent` runs for logo→landing; keeps landing copy hidden until logo shift ends. */
let pendingLogoToLandingContentReveal = false;

export function switchLevel(index) {
  const prevIndex = appState.currentLevelIndex;
  appState.currentLevelIndex = index;
  const state = getState();
  const { els } = appState;
  const isQuestionLevel = index > 1 && index < appState.totalLevelsCount;
  if (isQuestionLevel && !state.careerPlayer) {
    const baselineQuestionState = appState.levelsData[2];
    if (baselineQuestionState && baselineQuestionState !== state) {
      state.careerClubsCount = baselineQuestionState.careerClubsCount;
      state.silhouetteYOffset = baselineQuestionState.silhouetteYOffset;
      state.silhouetteScaleX = baselineQuestionState.silhouetteScaleX;
      state.silhouetteScaleY = baselineQuestionState.silhouetteScaleY;
      state.silhouetteVideoYOffset = baselineQuestionState.silhouetteVideoYOffset;
      state.silhouetteVideoScaleX = baselineQuestionState.silhouetteVideoScaleX;
      state.silhouetteVideoScaleY = baselineQuestionState.silhouetteVideoScaleY;
      state.silhouetteNormalYOffset = baselineQuestionState.silhouetteNormalYOffset;
      state.silhouetteNormalScaleX = baselineQuestionState.silhouetteNormalScaleX;
      state.silhouetteNormalScaleY = baselineQuestionState.silhouetteNormalScaleY;
      state.silhouetteShortsVideoYOffset =
        baselineQuestionState.silhouetteShortsVideoYOffset ??
        baselineQuestionState.silhouetteShortsNormalYOffset ??
        baselineQuestionState.silhouetteVideoYOffset;
      state.silhouetteShortsVideoScaleX =
        baselineQuestionState.silhouetteShortsVideoScaleX ??
        baselineQuestionState.silhouetteShortsNormalScaleX ??
        baselineQuestionState.silhouetteVideoScaleX;
      state.silhouetteShortsVideoScaleY =
        baselineQuestionState.silhouetteShortsVideoScaleY ??
        baselineQuestionState.silhouetteShortsNormalScaleY ??
        baselineQuestionState.silhouetteVideoScaleY;
      state.silhouetteShortsNormalYOffset =
        baselineQuestionState.silhouetteShortsNormalYOffset ??
        baselineQuestionState.silhouetteNormalYOffset;
      state.silhouetteShortsNormalScaleX =
        baselineQuestionState.silhouetteShortsNormalScaleX ??
        baselineQuestionState.silhouetteNormalScaleX;
      state.silhouetteShortsNormalScaleY =
        baselineQuestionState.silhouetteShortsNormalScaleY ??
        baselineQuestionState.silhouetteNormalScaleY;
      state.careerSlotBadgeScales = Array.isArray(baselineQuestionState.careerSlotBadgeScales)
        ? [...baselineQuestionState.careerSlotBadgeScales]
        : [];
      state.careerSlotBadgeScalesRegular = Array.isArray(baselineQuestionState.careerSlotBadgeScalesRegular)
        ? [...baselineQuestionState.careerSlotBadgeScalesRegular]
        : [...state.careerSlotBadgeScales];
      state.careerSlotBadgeScalesShorts = Array.isArray(baselineQuestionState.careerSlotBadgeScalesShorts)
        ? [...baselineQuestionState.careerSlotBadgeScalesShorts]
        : [...state.careerSlotBadgeScales];
      state.careerSlotYearNudges = Array.isArray(baselineQuestionState.careerSlotYearNudges)
        ? [...baselineQuestionState.careerSlotYearNudges]
        : [];
    }
  }
  const isShortsNow = document.body.classList.contains("shorts-mode");
  const isQuestionToQuestionTransition =
    index !== prevIndex &&
    !isShortsNow &&
    prevIndex > 1 &&
    prevIndex < appState.totalLevelsCount &&
    index > 1 &&
    index < appState.totalLevelsCount;

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

  renderProgressSteps(appState.totalLevelsCount, switchLevel);

  const stageMain = document.getElementById("stage-main");
  const progressContainer = els.quizProgressContainer;

  const updateDOMContent = () => {
    const isLogo = appState.currentLevelIndex === 0;
    const isLanding = appState.currentLevelIndex === 1;
    const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
    const isShorts = document.body.classList.contains("shorts-mode");
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
    document.getElementById("player-stats-panel")?.remove();
    els.teamHeader.hidden = true;

    const logoImg = els.logoPage.querySelector(".logo-img-anim");
    if (logoImg) {
      if (!isLogo && !isShorts) {
        logoImg.classList.add("shift-top-right");
        logoImg.classList.remove("reveal");
      } else if (isLogo) {
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
      els.logoPage.hidden = isShorts;
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

      const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);

      const silhouette = document.querySelector(".career-silhouette");
      if (silhouette) {
        silhouette.classList.toggle("revealed", previewPostTimer);
      }

      const revealPhoto = document.getElementById("career-reveal-photo");
      const careerGrid = document.querySelector(".career-grid");
      if (revealPhoto) {
        revealPhoto.classList.toggle("show", previewPostTimer || (isShorts && previewPreTimer));
        if (careerGrid) careerGrid.classList.toggle("reveal-active", previewPostTimer);
      }
    }

    const sharedBg = document.getElementById("shared-bg-layer");
    if (sharedBg) {
      sharedBg.hidden = !(isLogo || isLanding || isOutro);
    }
    
    if (appState.isVideoPlaying) {
      if (isLanding) {
        const quizType = document.getElementById("in-quiz-type").value;
        playRules(quizType);
      } else if (isOutro) {
        playCommentBelow();
      } else if (!isLogo && appState.currentLevelIndex < appState.totalLevelsCount - 1) {
        playProgressVoice(appState.currentLevelIndex, appState.totalLevelsCount);
      }
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
  } else {
    updateDOMContent();
  }
}