import { appState, getState } from "./state.js";
import { renderProgressSteps } from "./progress.js";
import { renderHeader, renderPitch } from "./pitch-render.js";
import { playRules, playWelcomeShortsLanding, playProgressVoice, playCommentBelow } from "./audio.js";

export function switchLevel(index) {
  let idx = index;
  if (document.body.classList.contains("shorts-mode") && idx === 0) {
    idx = 1;
  }
  const prevIndex = appState.currentLevelIndex;
  appState.currentLevelIndex = idx;
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

  renderProgressSteps(appState.totalLevelsCount, switchLevel);

  const stageMain = document.getElementById("stage-main");
  const progressContainer = els.quizProgressContainer;

  const updateDOMContent = () => {
    const isLogo = appState.currentLevelIndex === 0;
    const isLanding = appState.currentLevelIndex === 1;
    const isOutro = appState.currentLevelIndex === appState.totalLevelsCount;
    const isShorts = document.body.classList.contains("shorts-mode");

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
      // Keep page switches driven by stage animations only (no extra logo motion branch).
      logoImg.classList.remove("shift-top-right", "bounce-out");
      if (!isLogo) {
        logoImg.classList.remove("reveal");
      }
    }

    if (isLogo) {
      els.logoPage.hidden = false;
      if (logoImg) logoImg.classList.remove("shift-top-right", "bounce-out");
    } else if (isLanding) {
      els.logoPage.hidden = isShorts; 
      els.landingPage.hidden = false;
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
    
    if (appState.isVideoPlaying) {
      if (isLanding) {
        if (isShorts) {
          if (prevIndex !== 0) {
            void playWelcomeShortsLanding();
          }
        } else {
          const quizType = document.getElementById("in-quiz-type").value;
          playRules(quizType);
        }
      } else if (isOutro) {
        playCommentBelow();
      } else if (!isLogo && appState.currentLevelIndex < appState.totalLevelsCount - 1) {
        playProgressVoice(appState.currentLevelIndex, appState.totalLevelsCount);
      }
    }
  };

  if (stageMain) {
    const isShorts = document.body.classList.contains("shorts-mode");
    
    stageMain.classList.remove("stage-enter-anim");
    stageMain.classList.add("stage-exit-anim");

    if (progressContainer) {
        progressContainer.classList.remove("progress-in-reg", "progress-in-shorts");
        progressContainer.classList.add(isShorts ? "progress-out-shorts" : "progress-out-reg");
    }

    setTimeout(() => {
      updateDOMContent();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          stageMain.classList.remove("stage-exit-anim");
          void stageMain.offsetWidth; 
          stageMain.classList.add("stage-enter-anim");
          
          if (progressContainer) {
              progressContainer.classList.remove("progress-out-reg", "progress-out-shorts");
              void progressContainer.offsetWidth;
              progressContainer.classList.add(isShorts ? "progress-in-shorts" : "progress-in-reg");
          }

          setTimeout(() => {
              stageMain.classList.remove("stage-enter-anim");
          }, 600);
        });
      });
    }, 580);
  } else {
    updateDOMContent();
  }
}