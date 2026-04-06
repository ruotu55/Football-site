import { appState, getState } from "./state.js";
import { renderProgressSteps } from "./progress.js";
import { renderHeader, renderPitch } from "./pitch-render.js";
import { playRules, playProgressVoice, playCommentBelow } from "./audio.js";
import { refreshSaveTeamButtonUi } from "./saved-team-layouts.js";

/** True only while `updateDOMContent` runs for logo→landing; keeps landing copy hidden until logo shift ends. */
let pendingLogoToLandingContentReveal = false;

export function switchLevel(index) {
  const prevIndex = appState.currentLevelIndex;
  appState.currentLevelIndex = index;
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

    if (els.quizProgressContainer) {
      els.quizProgressContainer.hidden = (isLogo || isLanding || isOutro) && appState.isVideoPlaying;
    }

    if (els.sideTextRight) {
      els.sideTextRight.hidden = !((isLogo || isLanding || isOutro) && appState.isVideoPlaying);
    }

    els.logoPage.hidden = true;
    els.landingPage.hidden = true;
    els.outroPage.hidden = true;
    els.pitchWrap.hidden = true;
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
      els.logoPage.hidden = isShorts;
      els.outroPage.hidden = false;
    } else {
      els.logoPage.hidden = isShorts;

      els.teamHeader.hidden = false;
      els.teamHeader.classList.remove("video-revealed");
      els.pitchWrap.hidden = false;
      renderPitch();
      renderHeader();
    }

    const sharedBg = document.getElementById("shared-bg-layer");
    if (sharedBg) {
      sharedBg.hidden = !(isLogo || isLanding || isOutro);
    }

    if (isOutro && prevIndex !== appState.totalLevelsCount) {
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
      refreshSaveTeamButtonUi();
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
  refreshSaveTeamButtonUi();
}
