// js/level-control.js
import { appState } from "./state.js";
import { switchLevel } from "./levels.js";
import { renderProgressSteps } from "./progress.js";

let draggedLevelIndex = -1;

export function initLevelControls() {
    const { els } = appState;
    if (!els.btnLevelsControl || !els.rightPanel) return;

    els.btnLevelsControl.onclick = () => {
        els.rightPanel.hidden = !els.rightPanel.hidden;
        if (!els.rightPanel.hidden) renderLevelsReorderList();
    };
}

export function renderLevelsReorderList() {
    const { els } = appState;
    if (!els.rightPanel) return;

    els.rightPanel.innerHTML = `
      <div class="panel-header">
        <h1>Levels Control</h1>
        <button type="button" class="panel-toggle" id="btn-close-right-panel">Hide</button>
      </div>
      <div id="levels-reorder-container" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem;"></div>
    `;

    document.getElementById("btn-close-right-panel").onclick = () => {
        els.rightPanel.hidden = true;
    };

    const container = document.getElementById("levels-reorder-container");
    
    for (let i = 2; i < appState.totalLevelsCount; i++) {
        const lvl = appState.levelsData[i];
        const item = document.createElement("div");
        item.className = "level-reorder-item";
        if (i === appState.currentLevelIndex) item.classList.add("active");
        
        item.draggable = true;
        item.dataset.index = i;

        const num = document.createElement("span");
        num.className = "level-num";
        num.textContent = (i - 1).toString().padStart(2, '0');

        const name = document.createElement("span");
        name.className = "level-name";
        const playerLabel = lvl.careerPlayer && typeof lvl.careerPlayer.name === "string"
            ? lvl.careerPlayer.name.trim()
            : "";
        name.textContent = playerLabel;

        item.append(num, name);

        item.ondragstart = (e) => {
            draggedLevelIndex = i;
            item.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        };

        item.ondragover = (e) => {
            e.preventDefault();
            item.classList.add("drag-over");
        };

        item.ondragleave = () => {
            item.classList.remove("drag-over");
        };

        item.ondrop = (e) => {
            e.preventDefault();
            item.classList.remove("drag-over");
            const targetIndex = parseInt(item.dataset.index);
            
            if (draggedLevelIndex !== targetIndex) {
                const [movedLevel] = appState.levelsData.splice(draggedLevelIndex, 1);
                appState.levelsData.splice(targetIndex, 0, movedLevel);
                
                if (appState.currentLevelIndex === draggedLevelIndex) {
                    appState.currentLevelIndex = targetIndex;
                } else if (draggedLevelIndex < appState.currentLevelIndex && targetIndex >= appState.currentLevelIndex) {
                    appState.currentLevelIndex--;
                } else if (draggedLevelIndex > appState.currentLevelIndex && targetIndex <= appState.currentLevelIndex) {
                    appState.currentLevelIndex++;
                }

                renderLevelsReorderList();
                renderProgressSteps(appState.totalLevelsCount, switchLevel);
            }
        };

        item.ondragend = () => {
            item.classList.remove("dragging");
            draggedLevelIndex = -1;
        };

        item.onclick = () => {
            switchLevel(i);
            renderLevelsReorderList();
        };

        container.appendChild(item);
    }
}