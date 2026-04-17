import { appState, getState } from "./state.js";
import { renderProgressSteps } from "./progress.js";
import {
  clearPitchWrapTransitionOverride,
  renderHeader,
  renderPitch,
  preloadSquadImages,
} from "./pitch-render.js";
import {
  playProgressVoice,
  playCommentBelow,
  setBgMusicForLevel,
} from "./audio.js";
import { refreshSaveTeamButtonUi } from "./saved-team-layouts.js";
import { runTransition, transitionSettings } from "./transitions.js";

/** Match Career Path - Shorts `levels.js` + `transitions.css` video stage (0.82s). */
const STAGE_VIDEO_TRANSITION_MS = 820;
const STAGE_VIDEO_ENTER_TRANSITION_MS = STAGE_VIDEO_TRANSITION_MS;

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
    const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
    const isShorts = document.body.classList.contains("shorts-mode");

    if (els.quizProgressContainer) {
      els.quizProgressContainer.hidden = (isLogo || isOutro) && appState.isVideoPlaying;
    }
    
    if (els.sideTextRight) {
      els.sideTextRight.hidden = !((isLogo || isOutro) && appState.isVideoPlaying);
    }

    els.logoPage.hidden = true;
    els.landingPage.hidden = true;
    els.outroPage.hidden = true;
    els.pitchWrap.hidden = true;
    if (appState._preserveTeamSidebar) {
      // Custom transition between quiz levels: keep sidebar visible in place
    } else {
      els.teamHeader.hidden = true;
    }

    const logoImg = els.logoPage.querySelector(".logo-img-anim");
    if (logoImg) {
      // Keep page switches driven by stage animations only (no extra logo motion branch).
      logoImg.classList.remove("shift-top-right", "bounce-out");
      if (!isLogo) {
        logoImg.classList.remove("reveal");
      }
    }

    if (isLogo) {
      els.logoPage.hidden = false;
      if (logoImg) logoImg.classList.remove("shift-top-right", "bounce-out");
    } else if (isOutro) {
      els.logoPage.hidden = isShorts;
      els.outroPage.hidden = false;
    } else {
      els.logoPage.hidden = isShorts;

      els.teamHeader.hidden = false;
      els.teamHeader.classList.remove("video-hidden", "video-revealed");
      if (appState.isVideoPlaying && state.videoMode && state.currentSquad) {
        clearPitchWrapTransitionOverride();
        els.pitchWrap.classList.add("pitch-wrap-snap-height");
      }
      els.pitchWrap.hidden = false;
      renderPitch();
      // Skip header update when sidebar is preserved — it will be called
      // after the overlay reveals so the old team stays visible during transition.
      if (!appState._preserveTeamSidebar) renderHeader();
      if (appState.isVideoPlaying && state.videoMode && state.currentSquad && els.pitchWrap) {
        void els.pitchWrap.offsetHeight;
        setTimeout(() => {
          els.pitchWrap?.classList.remove("pitch-wrap-snap-height");
        }, STAGE_VIDEO_ENTER_TRANSITION_MS);
      }
    }

    const sharedBg = document.getElementById("shared-bg-layer");
    if (sharedBg) {
      sharedBg.hidden = !(isLogo || isOutro);
    }
    
    if (isOutro && prevIndex !== appState.totalLevelsCount && appState.isVideoPlaying) {
      playCommentBelow();
    }

    if (appState.isVideoPlaying) {
      if (
        !isLogo &&
        !isShorts &&
        appState.currentLevelIndex < appState.totalLevelsCount - 1
      ) {
        playProgressVoice(appState.currentLevelIndex, appState.totalLevelsCount);
      }
    }
  };

  if (stageMain) {
    const isShorts = document.body.classList.contains("shorts-mode");

    /** Same as Career Path - Shorts: instant handoff only from logo (0) → first question during Play Video. */
    const isShortsFromLogoToFirstQuestion =
      isShorts &&
      prevIndex === 0 &&
      idx >= 1 &&
      idx < appState.totalLevelsCount &&
      appState.isVideoPlaying;
    const teamHeaderEl = document.getElementById("team-header");

    if (isShortsFromLogoToFirstQuestion) {
      stageMain.classList.remove(
        "stage-exit-anim",
        "stage-exit-video-anim",
        "stage-enter-anim",
        "stage-enter-video-anim"
      );
      teamHeaderEl?.classList.remove("team-header-stage-exit-video-anim", "team-header-stage-enter-video-anim");
      updateDOMContent();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void stageMain.offsetWidth;
          stageMain.classList.add("stage-enter-video-anim");
          if (teamHeaderEl) {
            teamHeaderEl.classList.remove("team-header-stage-exit-video-anim", "team-header-stage-enter-video-anim");
            void teamHeaderEl.offsetWidth;
            teamHeaderEl.classList.add("team-header-stage-enter-video-anim");
          }
          if (progressContainer) {
            progressContainer.classList.remove(
              "progress-out-reg",
              "progress-out-shorts",
              "progress-in-reg",
              "progress-in-shorts"
            );
          }
          setTimeout(() => {
            stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
            teamHeaderEl?.classList.remove("team-header-stage-enter-video-anim");
          }, STAGE_VIDEO_ENTER_TRANSITION_MS);
        });
      });
      refreshSaveTeamButtonUi();
      return;
    }

    // Preload images for the next level BEFORE transition starts
    preloadSquadImages(state);

    const useCustomTransition = transitionSettings.effect !== "none";

    if (useCustomTransition) {
      stageMain.classList.remove("stage-exit-anim", "stage-exit-video-anim", "stage-enter-anim", "stage-enter-video-anim");
      teamHeaderEl?.classList.remove("team-header-stage-exit-video-anim", "team-header-stage-enter-video-anim");
      // Keep sidebar in place when both prev and next are quiz levels
      const prevIsQuiz = prevIndex >= 1 && prevIndex < appState.totalLevelsCount;
      const nextIsQuiz = idx >= 1 && idx < appState.totalLevelsCount;
      const sidebarPreserved = prevIsQuiz && nextIsQuiz;
      appState._preserveTeamSidebar = sidebarPreserved;

      appState._transitionDone = runTransition(() => {
        if (appState._prepTimerOnCover) {
          appState._prepTimerOnCover = false;
          _prepTimerBarWhileCovered();
        }
        updateDOMContent();
        appState._preserveTeamSidebar = false;

        // Overlay still covers the screen — snap sidebar to closed instantly
        // (no CSS transition) so the new level is revealed with it off-screen.
        if (sidebarPreserved && els.teamHeader) {
          els.teamHeader.style.transition = "none";
          els.teamHeader.classList.remove("team-header--show");
          appState.teamSidebarAnimGeneration += 1;
          appState.teamSidebarLastOpen = false;
          appState.teamSidebarLastKey = "";
          void els.teamHeader.offsetWidth;
          els.teamHeader.style.transition = "";
        }

        if (progressContainer) {
          progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
        }
      }).then(() => {
        // Overlay is gone — slide sidebar in fresh for the new level
        if (sidebarPreserved && els.teamHeader && !els.teamHeader.hidden) {
          renderHeader();
        }
      });
    } else {
      const exitClass = "stage-exit-video-anim";
      const enterClass = "stage-enter-video-anim";
      const transitionDelay = STAGE_VIDEO_TRANSITION_MS;

      stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
      stageMain.classList.add(exitClass);
      if (teamHeaderEl) {
        teamHeaderEl.classList.remove("team-header-stage-enter-video-anim");
        teamHeaderEl.classList.add("team-header-stage-exit-video-anim");
      }

      setTimeout(() => {
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

            if (teamHeaderEl) {
              teamHeaderEl.classList.remove("team-header-stage-exit-video-anim");
              if (teamHeaderEl.classList.contains("team-header--show")) {
                void teamHeaderEl.offsetWidth;
                teamHeaderEl.classList.add("team-header-stage-enter-video-anim");
              }
            }

            setTimeout(() => {
                stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
                teamHeaderEl?.classList.remove("team-header-stage-enter-video-anim");
            }, STAGE_VIDEO_ENTER_TRANSITION_MS);
          });
        });
      }, transitionDelay);
    }
  } else {
    updateDOMContent();
  }
  refreshSaveTeamButtonUi();
}