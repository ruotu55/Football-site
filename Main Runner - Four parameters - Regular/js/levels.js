import { appState, getState, shirtNumberTextFromPlayerJson } from "./state.js";
import { renderProgressSteps } from "./progress.js";
import { getVideoQuestionPreviewState, renderHeader, renderCareer, preloadCareerAssets } from "./pitch-render.js";
import { playRules, playProgressVoice, playCommentBelow } from "./audio.js";
import { STAGE_VIDEO_LEVEL_TRANSITION_MS, STAGE_VIDEO_LEVEL_ENTER_MS } from "./constants.js";
import { runTransition, transitionSettings } from "./transitions.js";

/** Classes removed before each video stage transition step (see `css/components/transitions.css`). */
const VIDEO_STAGE_ANIM_CLASSES = [
  "stage-exit-video-anim",
  "stage-enter-video-anim",
  "stage-exit-video-anim-panel",
  "stage-enter-video-anim-panel",
  "stage-exit-video-anim--reveal-overlay-reg",
  "stage-exit-video-anim--reveal-overlay-safe",
  "stage-exit-video-anim--reveal-name",
  "career-team-unified-reveal-in",
  "video-question-enter-anim",
];

function stripVideoStageLayerAnims(el) {
  if (!el) return;
  el.classList.remove("stage-exit-anim", "stage-enter-anim", ...VIDEO_STAGE_ANIM_CLASSES);
}

/** Floating shirt: after the landing sheet, before the outro (not logo, landing, or finish). */
export function shouldShowFloatingPlayerShirt(levelIndex, totalLevels) {
  return levelIndex > 1 && levelIndex < totalLevels;
}

/** DOM + number for `#landing-shirt` (CSS `body .landing-shirt { display }` can beat `[hidden]` alone). */
export function syncFloatingShirtVisibilityFromLevel() {
  const state = getState();
  const shirtEl = document.getElementById("landing-shirt");
  const shirtNum = document.getElementById("landing-shirt-number");
  if (!shirtEl) return;

  const show = shouldShowFloatingPlayerShirt(
    appState.currentLevelIndex,
    appState.totalLevelsCount,
  );

  stripVideoStageLayerAnims(shirtEl);
  if (!show) {
    shirtEl.hidden = true;
    shirtEl.style.setProperty("display", "none", "important");
    return;
  }

  shirtEl.style.removeProperty("display");
  shirtEl.hidden = false;
  if (shirtNum) {
    shirtNum.textContent =
      state.shirtNumber ??
      shirtNumberTextFromPlayerJson(state.careerPlayer) ??
      "?";
  }
}

/** True only while `updateDOMContent` runs for logo→landing; keeps landing copy hidden until logo shift ends. */
let pendingLogoToLandingContentReveal = false;

export function switchLevel(
  index,
  {
    immediate = false,
    syncFullViewportVideoStage = false,
    beforeDomUpdate = null,
    afterPlayVideoStageDomUpdate = null,
    afterPlayVideoStageEnterDone = null,
  } = {},
) {
  if (index === 0) {
    index = 1;
  }
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

  const stageMain = document.getElementById("stage-main");

  const progressContainer = els.quizProgressContainer;

  const updateDOMContent = () => {
    renderProgressSteps(appState.totalLevelsCount, switchLevel);

    const isLogo = appState.currentLevelIndex === 0;
    const isLanding = appState.currentLevelIndex === 1;
    const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
    const isShorts = document.body.classList.contains("shorts-mode");
    const isYoutubeThumbnails = document.body.classList.contains("youtube-thumbnails-mode");
    if (els.landingPage && !isLanding) {
      els.landingPage.classList.remove(
        "landing-content-awaiting-shift",
        "landing-content-slide-in"
      );
    }
    if (els.teamHeader) els.teamHeader.style.top = "";
    if (els.careerWrap) els.careerWrap.style.marginTop = "";

    if (els.quizProgressContainer) {
      els.quizProgressContainer.hidden =
        isYoutubeThumbnails ||
        ((isLogo || isLanding || isOutro) && appState.isVideoPlaying);
    }

    if (els.sideTextRight) {
      els.sideTextRight.hidden = true;
    }
    if (els.sideTextLeft) {
      els.sideTextLeft.hidden = isYoutubeThumbnails;
    }

    els.logoPage.hidden = true;
    els.landingPage.hidden = true;
    els.outroPage.hidden = true;
    if (els.pitchWrap) els.pitchWrap.hidden = true;
    if (els.careerWrap) {
      els.careerWrap.hidden = true;
    }
    document.getElementById("player-stats-panel")?.remove();
    /* Reveal overlay + name float on `.app` (position: fixed, outside career-wrap).
       Remove them so they don't bleed through on non-question pages. */
    document.getElementById("career-reveal-overlay")?.remove();
    document.getElementById("career-reveal-name")?.remove();
    els.teamHeader.hidden = true;

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
      els.logoPage.hidden = isYoutubeThumbnails;
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
      els.logoPage.hidden = isShorts || isYoutubeThumbnails;
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
      els.logoPage.hidden = true;
      els.outroPage.hidden = false;
    } else {
      els.logoPage.hidden = isShorts || isYoutubeThumbnails;

      els.teamHeader.hidden = false;
      els.teamHeader.classList.remove("video-revealed");
      if (els.pitchWrap) els.pitchWrap.hidden = true;

      if (els.careerWrap) {
        els.careerWrap.hidden = false;
      }

      renderCareer();
      renderHeader();
      if (
        isQuestionToQuestionTransition &&
        els.careerWrap &&
        !appState.careerTeamVisualGatePending &&
        !appState.careerTeamVisualGateDone
      ) {
        els.careerWrap.classList.remove("video-question-enter-anim");
        void els.careerWrap.offsetWidth;
        els.careerWrap.classList.add("video-question-enter-anim");
        setTimeout(() => {
          if (els.careerWrap) {
            els.careerWrap.classList.remove("video-question-enter-anim");
          }
        }, STAGE_VIDEO_LEVEL_ENTER_MS);
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

    syncFloatingShirtVisibilityFromLevel();
    
    if (isOutro && prevIndex !== appState.totalLevelsCount && appState.isVideoPlaying) {
      playCommentBelow();
    }

    if (appState.isVideoPlaying) {
      if (isLanding) {
        const quizType = document.getElementById("in-quiz-type").value;
        playRules(quizType);
      } else if (!isLogo && appState.currentLevelIndex < appState.totalLevelsCount - 1) {
        playProgressVoice(appState.currentLevelIndex, appState.totalLevelsCount);
      }
    }
  };

  if (stageMain && !immediate) {
    const isShorts = document.body.classList.contains("shorts-mode");
    const isLogoToLanding = prevIndex === 0 && index === 1 && !isShorts;
    if (isLogoToLanding) {
      // First page -> second page: logo shifts to top-right first; landing copy slides in from top after.
      const LOGO_SHIFT_MS = 800;
      const LANDING_SLIDE_MS = 820;
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
            }, STAGE_VIDEO_LEVEL_TRANSITION_MS);
          });
        });
      }, 820);
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
        if (syncFullViewportVideoStage) {
          appState.videoRevealPostTimerActive = false;
          document.body.classList.remove("career-play-video-answer-reveal");
          document.body.classList.remove("fake-info-reveal");
          appState.holdCinematicBackdropForPlayVideoStage = false;
          if (typeof afterPlayVideoStageEnterDone === "function") afterPlayVideoStageEnterDone();
        }
        updateDOMContent();
        if (progressContainer) {
          progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
          void progressContainer.offsetWidth;
          progressContainer.classList.add(isShorts ? "progress-in-shorts" : "progress-in-reg");
        }
      });
    } else {

    const exitClass = "stage-exit-video-anim";
    const enterClass = "stage-enter-video-anim";
    const transitionDelay = STAGE_VIDEO_LEVEL_TRANSITION_MS;

    /*
     * Play Video question → question: opacity-only fade. HUD on `.app` (see `pitch-render.js`);
     * `#floating-background` is also faded to prevent a flash when cinematic-reveal is cleared.
     */
    const countdownEl = document.getElementById("countdown-timer");
    const playerStatsEl = document.getElementById("player-stats-panel");
    const pictureControlsEl = document.getElementById("career-picture-controls-floating");
    const revealOverlayEl = document.getElementById("career-reveal-overlay");
    const revealNameEl = document.getElementById("career-reveal-name");
    const floatingBgEl = document.getElementById("floating-background");
    const shirtFloatEl = document.getElementById("landing-shirt");

    stripVideoStageLayerAnims(stageMain);
    stripVideoStageLayerAnims(progressContainer);
    if (syncFullViewportVideoStage) {
      stripVideoStageLayerAnims(countdownEl);
      stripVideoStageLayerAnims(playerStatsEl);
      stripVideoStageLayerAnims(pictureControlsEl);
      stripVideoStageLayerAnims(revealOverlayEl);
      stripVideoStageLayerAnims(revealNameEl);
      stripVideoStageLayerAnims(floatingBgEl);
      stripVideoStageLayerAnims(shirtFloatEl);
      appState.holdCinematicBackdropForPlayVideoStage = true;
    }

    stageMain.classList.add(exitClass);
    const cinematicActive = document.body.classList.contains("career-cinematic-reveal");
    if (syncFullViewportVideoStage) {
      /* Floating panels on `.app` use panel fade (no transform override) to keep their positioning.
         When cinematic-reveal is active, CSS `animation: none !important` blocks class-based
         animations, so we force-fade with inline !important styles instead. */
      const cinematicExitEasing = "opacity 0.82s cubic-bezier(0.22, 1, 0.36, 1)";
      if (countdownEl) countdownEl.classList.add("stage-exit-video-anim-panel");
      if (
        shirtFloatEl &&
        shouldShowFloatingPlayerShirt(prevIndex, appState.totalLevelsCount)
      ) {
        shirtFloatEl.classList.add("stage-exit-video-anim-panel");
      }
      if (playerStatsEl) {
        if (cinematicActive) {
          playerStatsEl.style.setProperty("transition", cinematicExitEasing, "important");
          playerStatsEl.style.setProperty("opacity", "0", "important");
        } else {
          playerStatsEl.classList.add("stage-exit-video-anim-panel");
        }
      }
      if (pictureControlsEl) pictureControlsEl.classList.add("stage-exit-video-anim-panel");
      if (floatingBgEl) {
        if (cinematicActive) {
          floatingBgEl.style.setProperty("transition", cinematicExitEasing, "important");
          floatingBgEl.style.setProperty("opacity", "0", "important");
        } else {
          floatingBgEl.classList.add("stage-exit-video-anim-panel");
        }
      }
      if (revealOverlayEl) {
        /* Overlay is on `.app` (not inside #career-wrap), so the `.career-wrap.video-mode-enabled`
           CSS show-animation selector never matches — it always uses the `reg` rise animation
           ending at scale(1.16).  The exit must match that scale to avoid a visible shrink. */
        revealOverlayEl.classList.add("stage-exit-video-anim--reveal-overlay-reg");
      }
      if (revealNameEl) revealNameEl.classList.add("stage-exit-video-anim--reveal-name");
    }

    if (progressContainer) {
      if (syncFullViewportVideoStage) {
        progressContainer.classList.remove(
          "progress-in-reg",
          "progress-in-shorts",
          "progress-out-reg",
          "progress-out-shorts",
        );
        stripVideoStageLayerAnims(progressContainer);
        if (cinematicActive) {
          progressContainer.style.setProperty("transition", "opacity 0.82s cubic-bezier(0.22, 1, 0.36, 1)", "important");
          progressContainer.style.setProperty("opacity", "0", "important");
        } else {
          /* Use panel fade (opacity-only) — the stage animation overrides
             `transform: translateY(-50%)` causing the bar to jump on strip. */
          progressContainer.classList.add("stage-exit-video-anim-panel");
        }
      } else {
        progressContainer.classList.remove("progress-in-reg", "progress-in-shorts");
        progressContainer.classList.add(isShorts ? "progress-out-shorts" : "progress-out-reg");
      }
    }

    setTimeout(() => {
      if (syncFullViewportVideoStage) {
        /* Match `setVideoRevealPostTimerActive(false)` in video.js — only after exit fade (see timeout above). */
        appState.videoRevealPostTimerActive = false;
        document.body.classList.toggle("career-play-video-answer-reveal", false);
        document.body.classList.toggle("fake-info-reveal", false);
      }
      if (typeof beforeDomUpdate === "function") beforeDomUpdate();
      updateDOMContent();
      if (syncFullViewportVideoStage) {
        /* `holdCinematicBackdropForPlayVideoStage` stays true through the enter animation
           so any re-render keeps `career-cinematic-reveal` on body. It is cleared in the
           enter-done cleanup alongside `afterPlayVideoStageEnterDone`. */
        if (typeof afterPlayVideoStageDomUpdate === "function") afterPlayVideoStageDomUpdate();
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          /* Clear cinematic blur NOW — before any enter animation class is added.
             Everything is still invisible (exit animation fill = opacity 0) so the
             snap from dimmed→default is never rendered.  All elements then
             participate in the normal unified enter fade from opacity 0→1. */
          if (syncFullViewportVideoStage) {
            appState.holdCinematicBackdropForPlayVideoStage = false;
            if (typeof afterPlayVideoStageEnterDone === "function") afterPlayVideoStageEnterDone();
          }

          stripVideoStageLayerAnims(stageMain);
          void stageMain.offsetWidth;
          stageMain.classList.add(enterClass);

          if (syncFullViewportVideoStage) {
            const cdIn = document.getElementById("countdown-timer");
            if (cdIn) {
              stripVideoStageLayerAnims(cdIn);
              cdIn.classList.add("stage-enter-video-anim-panel");
            }
            const statsIn = document.getElementById("player-stats-panel");
            if (statsIn) {
              statsIn.style.removeProperty("opacity");
              statsIn.style.removeProperty("transition");
              stripVideoStageLayerAnims(statsIn);
              if (!appState.careerTeamVisualGatePending && !appState.careerTeamVisualGateDone) {
                statsIn.classList.add("stage-enter-video-anim-panel");
              }
            }
            const picIn = document.getElementById("career-picture-controls-floating");
            if (picIn) {
              stripVideoStageLayerAnims(picIn);
              picIn.classList.add("stage-enter-video-anim-panel");
            }
            const bgIn = document.getElementById("floating-background");
            if (bgIn) {
              bgIn.style.removeProperty("opacity");
              bgIn.style.removeProperty("transition");
              stripVideoStageLayerAnims(bgIn);
              bgIn.classList.add("stage-enter-video-anim-panel");
            }
            const shirtIn = document.getElementById("landing-shirt");
            if (
              shirtIn &&
              shouldShowFloatingPlayerShirt(
                appState.currentLevelIndex,
                appState.totalLevelsCount,
              )
            ) {
              stripVideoStageLayerAnims(shirtIn);
              shirtIn.classList.add("stage-enter-video-anim-panel");
            }
            /* Next question: overlay + name start hidden — no enter animation (avoids opacity 0→1 flash). */
            stripVideoStageLayerAnims(document.getElementById("career-reveal-overlay"));
            stripVideoStageLayerAnims(document.getElementById("career-reveal-name"));
          }

          if (progressContainer) {
            if (syncFullViewportVideoStage) {
              progressContainer.style.removeProperty("opacity");
              progressContainer.style.removeProperty("transition");
              progressContainer.classList.remove(
                "progress-in-reg",
                "progress-in-shorts",
                "progress-out-reg",
                "progress-out-shorts",
              );
              stripVideoStageLayerAnims(progressContainer);
              /* Use panel fade (opacity-only) — the stage animation overrides
                 `transform: translateY(-50%)` causing the bar to jump on strip. */
              progressContainer.classList.add("stage-enter-video-anim-panel");
            } else {
              progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
              void progressContainer.offsetWidth;
              progressContainer.classList.add(isShorts ? "progress-in-shorts" : "progress-in-reg");
            }
          }

          setTimeout(() => {
            stripVideoStageLayerAnims(stageMain);
            stripVideoStageLayerAnims(progressContainer);
            if (syncFullViewportVideoStage) {
              stripVideoStageLayerAnims(document.getElementById("countdown-timer"));
              stripVideoStageLayerAnims(document.getElementById("player-stats-panel"));
              stripVideoStageLayerAnims(document.getElementById("career-wrap"));
              stripVideoStageLayerAnims(document.getElementById("career-picture-controls-floating"));
              stripVideoStageLayerAnims(document.getElementById("floating-background"));
              stripVideoStageLayerAnims(document.getElementById("career-reveal-overlay"));
              stripVideoStageLayerAnims(document.getElementById("career-reveal-name"));
              stripVideoStageLayerAnims(document.getElementById("landing-shirt"));
            }
          }, STAGE_VIDEO_LEVEL_ENTER_MS);
        });
      });
    }, transitionDelay);
    } // end else (default CSS transition)
  } else {
    updateDOMContent();
  }
}