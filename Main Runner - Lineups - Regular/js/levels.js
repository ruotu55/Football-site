import { appState, getState } from "./state.js";
import { renderProgressSteps } from "./progress.js";
import {
  clearPitchWrapTransitionOverride,
  renderHeader,
  renderPitch,
  shouldUseVideoQuestionLayout,
} from "./pitch-render.js";
import { playRules, playProgressVoice, playCommentBelow, setBgMusicForLevel } from "./audio.js";
import { refreshSaveTeamButtonUi } from "./saved-team-layouts.js";
import { runTransition, transitionSettings } from "./transitions.js";

/** True only while `updateDOMContent` runs for logo→landing; keeps landing copy hidden until logo shift ends. */
let pendingLogoToLandingContentReveal = false;

/** appState._preserveTeamSidebar — set true while a custom overlay transition
 *  swaps content between quiz levels; keeps sidebar in place. */

/** Same as video stage enter/exit duration in this file and `LEVEL_SWITCH_STAGE_TRANSITION_MS` in `video.js`. */
const STAGE_VIDEO_TRANSITION_MS = 820;

export function switchLevel(index) {
  if (index === 0) {
    index = 1;
  }
  const prevIndex = appState.currentLevelIndex;
  appState.currentLevelIndex = index;
  setBgMusicForLevel(appState.currentLevelIndex);
  const fallbackState =
    appState.levelsData[Math.min(appState.totalLevelsCount, appState.levelsData.length - 1)] ||
    appState.levelsData[1] ||
    {};
  const state = getState() || fallbackState;
  const { els } = appState;

  if (els.squadType && state.squadType !== undefined) {
    els.squadType.value = state.squadType;
  }
  if (els.formation && state.formationId !== undefined) {
    els.formation.value = state.formationId;
  }
  if (els.displayMode && state.displayMode !== undefined) {
    els.displayMode.value = state.displayMode;
  }
  if (els.teamSearch) {
    els.teamSearch.value = state.searchText || "";
  }
  if (els.videoModeToggle) {
    els.videoModeToggle.checked = !!state.videoMode;
  }
  if (els.videoModeBtn) {
    els.videoModeBtn.setAttribute("aria-pressed", state.videoMode ? "true" : "false");
  }

  document.querySelectorAll("select").forEach((sel) => {
    const wrapper = sel.nextElementSibling;
    if (wrapper && wrapper.classList.contains("custom-select-wrapper")) {
      const triggerSpan = wrapper.querySelector(".custom-select-trigger span");
      if (triggerSpan) {
        triggerSpan.textContent = sel.options[sel.selectedIndex]?.text || "";
      }

      wrapper.querySelectorAll(".custom-select-option").forEach((opt) => {
        if (opt.dataset.value === sel.value) {
          opt.classList.add("selected");
        } else {
          opt.classList.remove("selected");
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
  const teamHeaderEl = els.teamHeader;
  /** #team-header is outside .stage-main; mirror video fade with the pitch (see transitions.css). */
  const teamHeaderVideoExit =
    !!appState.isVideoPlaying &&
    !!teamHeaderEl &&
    prevIndex >= 2 &&
    prevIndex < appState.totalLevelsCount;
  /* Do not run enter fade into a question hold: panel stays off until post-timer reveal. */
  const teamHeaderVideoEnter =
    !!appState.isVideoPlaying &&
    !!teamHeaderEl &&
    index >= 2 &&
    index < appState.totalLevelsCount &&
    !!state.currentSquad &&
    !(state.videoMode && shouldUseVideoQuestionLayout(state));

  const updateDOMContent = () => {
    renderProgressSteps(appState.totalLevelsCount, switchLevel);

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

    if (els.quizProgressContainer) {
      els.quizProgressContainer.hidden = (isLogo || isLanding || isOutro) && appState.isVideoPlaying;
    }

    if (els.sideTextRight) {
      els.sideTextRight.hidden = true;
    }

    els.logoPage.hidden = true;
    els.landingPage.hidden = true;
    els.outroPage.hidden = true;
    els.pitchWrap.hidden = true;
    if (els.teamHeader) {
      if (appState._preserveTeamSidebar) {
        // Custom transition between quiz levels: keep sidebar visible in place,
        // just update content — the overlay hides the swap from view.
      } else {
        els.teamHeader.hidden = true;
        els.teamHeader.classList.remove("team-header--show");
        appState.teamSidebarAnimGeneration += 1;
        appState.teamSidebarLastOpen = false;
        appState.teamSidebarLastKey = "";
      }
    }

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
          logoImg.classList.remove("reveal");
          void logoImg.offsetWidth;
          logoImg.classList.add("reveal");
        } else if (state.videoMode && !appState.isVideoPlaying) {
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
      els.logoPage.hidden = true;
      els.outroPage.hidden = false;
    } else {
      els.logoPage.hidden = isShorts;

      els.teamHeader.hidden = false;
      els.teamHeader.classList.remove("video-hidden", "video-revealed");
      if (appState.isVideoPlaying && state.videoMode && state.currentSquad) {
        /* Pitch height was transitioning from stale values / long reveal duration — snap once. */
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
        }, STAGE_VIDEO_TRANSITION_MS);
      }
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
      } else if (!isLogo && appState.currentLevelIndex < appState.totalLevelsCount - 1) {
        playProgressVoice(appState.currentLevelIndex, appState.totalLevelsCount);
      }
    }
  };

  if (stageMain) {
    const isShorts = document.body.classList.contains("shorts-mode");
    const isLogoToLanding = prevIndex === 0 && index === 1 && !isShorts;
    if (isLogoToLanding) {
      const LOGO_SHIFT_MS = 900;
      const LANDING_SLIDE_MS = 900;
      stageMain.classList.remove(
        "stage-exit-anim",
        "stage-exit-video-anim",
        "stage-enter-anim",
        "stage-enter-video-anim"
      );
      teamHeaderEl?.classList.remove("team-header-stage-exit-video-anim", "team-header-stage-enter-video-anim");
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
      refreshSaveTeamButtonUi();
      return;
    }

    const isFromLogoPage = prevIndex === 0 && index > 1 && !isShorts;
    if (isFromLogoPage) {
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
      teamHeaderEl?.classList.remove("team-header-stage-exit-video-anim", "team-header-stage-enter-video-anim");
      setTimeout(() => {
        updateDOMContent();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void stageMain.offsetWidth;
            stageMain.classList.add("stage-enter-video-anim");
            if (teamHeaderVideoEnter && teamHeaderEl) {
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
              void progressContainer.offsetWidth;
              progressContainer.classList.add("progress-in-reg");
            }
            setTimeout(() => {
              stageMain.classList.remove("stage-enter-video-anim");
              teamHeaderEl?.classList.remove("team-header-stage-enter-video-anim");
            }, 820);
          });
        });
      }, 820);
      refreshSaveTeamButtonUi();
      return;
    }

    const useCustomTransition = transitionSettings.effect !== "none";

    if (useCustomTransition) {
      // Custom transition overlay: covers screen -> swap content -> reveals
      stageMain.classList.remove(
        "stage-exit-anim", "stage-exit-video-anim",
        "stage-enter-anim", "stage-enter-video-anim"
      );
      teamHeaderEl?.classList.remove(
        "team-header-stage-exit-video-anim",
        "team-header-stage-enter-video-anim"
      );

      if (progressContainer) {
        progressContainer.classList.remove("progress-in-reg", "progress-in-shorts");
        progressContainer.classList.add(isShorts ? "progress-out-shorts" : "progress-out-reg");
      }

      // Keep sidebar in place when both prev and next are quiz levels
      const prevIsQuiz = prevIndex >= 2 && prevIndex < appState.totalLevelsCount;
      const nextIsQuiz = index >= 2 && index < appState.totalLevelsCount;
      const sidebarPreserved = prevIsQuiz && nextIsQuiz;
      appState._preserveTeamSidebar = sidebarPreserved;

      appState._transitionDone = runTransition(() => {
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
          void els.teamHeader.offsetWidth;          // flush the instant snap
          els.teamHeader.style.transition = "";      // restore CSS transition
        }

        if (progressContainer) {
          progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
          void progressContainer.offsetWidth;
          progressContainer.classList.add(isShorts ? "progress-in-shorts" : "progress-in-reg");
        }
      }).then(() => {
        // Overlay is gone — slide sidebar in fresh for the new level
        if (sidebarPreserved && els.teamHeader && !els.teamHeader.hidden) {
          renderHeader();
        }
      });
    } else {
      // Default CSS exit/enter animation
      const exitClass = "stage-exit-video-anim";
      const enterClass = "stage-enter-video-anim";
      const transitionDelay = 820;

      stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
      stageMain.classList.add(exitClass);
      if (teamHeaderVideoExit && teamHeaderEl) {
        teamHeaderEl.classList.remove("team-header-stage-enter-video-anim");
        teamHeaderEl.classList.add("team-header-stage-exit-video-anim");
      }

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
            if (teamHeaderEl) {
              teamHeaderEl.classList.remove("team-header-stage-exit-video-anim");
            }
            if (teamHeaderVideoEnter && teamHeaderEl) {
              void teamHeaderEl.offsetWidth;
              teamHeaderEl.classList.add("team-header-stage-enter-video-anim");
            }

            if (progressContainer) {
              progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
              void progressContainer.offsetWidth;
              progressContainer.classList.add(isShorts ? "progress-in-shorts" : "progress-in-reg");
            }

            setTimeout(() => {
              stageMain.classList.remove("stage-enter-anim", "stage-enter-video-anim");
              teamHeaderEl?.classList.remove("team-header-stage-enter-video-anim");
            }, 820);
          });
        });
      }, transitionDelay);
    }
  } else {
    updateDOMContent();
  }
  refreshSaveTeamButtonUi();
}
