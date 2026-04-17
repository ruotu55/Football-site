import { appState, getState } from "./state.js";

let prodModeActive = false;
let backgroundColorConfirmed = false;
let backgroundEffectConfirmed = false;

export function isProdMode() { return prodModeActive; }
export function markBackgroundColorConfirmed() { backgroundColorConfirmed = true; }
export function markBackgroundEffectConfirmed() { backgroundEffectConfirmed = true; }

export function toggleProdMode() {
    const { els } = appState;
    prodModeActive = !prodModeActive;
    if (els.prodBtn) els.prodBtn.setAttribute("aria-pressed", prodModeActive ? "true" : "false");
    if (prodModeActive) {
        appState.levelsData.forEach((lvl) => { lvl.videoMode = true; });
        if (els.videoModeToggle) {
            els.videoModeToggle.checked = true;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        }
    }
}

function getLevelLabel(index, lvl) {
    if (lvl.isLogo) return "Level 0 (Logo)";
    if (lvl.isIntro) return "Level 1 (Intro)";
    if (lvl.isOutro) return `Level ${index - 1} (Outro)`;
    if (lvl.isBonus) return `Level ${index - 1} (Bonus)`;
    return `Level ${index - 1}`;
}

function getQuestionLevels() {
    return appState.levelsData
        .map((lvl, i) => ({ lvl, index: i }))
        .filter(({ lvl }) => !lvl.isLogo && !lvl.isIntro && !lvl.isOutro && !lvl.isBonus);
}

function validatePlayersSelected() {
    const failures = [];
    for (const { lvl, index } of getQuestionLevels()) {
        if (!lvl.careerPlayer) failures.push(`${getLevelLabel(index, lvl)}: No player selected`);
    }
    return { sectionName: "Players Selected", passed: failures.length === 0, failures };
}

function validatePlayerAssets() {
    const failures = [];
    for (const { lvl, index } of getQuestionLevels()) {
        if (!lvl.careerPlayer) continue;
        const label = getLevelLabel(index, lvl);
        const playerName = String(lvl.careerPlayer.name || "").trim();
        const missing = [];

        // Check player has career history (clubs)
        if (!lvl.careerHistory || lvl.careerHistory.length === 0) {
            missing.push("no career history/clubs");
        }

        // Check player image/silhouette exists
        if (appState.playerImages) {
            let hasImage = false;
            const name = playerName;
            // Check in all image sources
            if (appState.playerImages.club) {
                for (const key in appState.playerImages.club) {
                    if (key.endsWith(`|${name}`) && appState.playerImages.club[key]?.length > 0) { hasImage = true; break; }
                }
            }
            if (!hasImage && appState.playerImages.nationality) {
                for (const key in appState.playerImages.nationality) {
                    if (key.endsWith(`|${name}`) && appState.playerImages.nationality[key]?.length > 0) { hasImage = true; break; }
                }
            }
            if (!hasImage) missing.push("no player image");
        }

        if (missing.length > 0) failures.push(`${label} (${playerName}): ${missing.join(", ")}`);
    }
    return { sectionName: "Player Images & Career Data", passed: failures.length === 0, failures };
}

function validateBackgroundColor() {
    const failures = [];
    if (!backgroundColorConfirmed) failures.push("Background Color has not been selected");
    if (!backgroundEffectConfirmed) failures.push("Background Effect has not been selected");
    return { sectionName: "Background Color & Effect", passed: failures.length === 0, failures };
}

function validateTransition() {
    const effectVal = document.getElementById("in-transition-effect")?.value || "";
    const isRandom = document.getElementById("in-transition-random")?.checked || false;
    const failures = [];
    if (!effectVal && !isRandom) failures.push("No transition selected and Random is not checked");
    return { sectionName: "Transition", passed: failures.length === 0, failures };
}

function validateSpecificTitle() {
    const yesPressed = document.getElementById("specific-title-yes")?.getAttribute("aria-pressed") === "true";
    const noPressed = document.getElementById("specific-title-no")?.getAttribute("aria-pressed") === "true";
    const failures = [];
    if (!yesPressed && !noPressed) failures.push("'Add specific title' not set to YES or NO");
    return { sectionName: "Add Specific Title", passed: failures.length === 0, failures };
}

function validateEndingType() {
    const failures = [];
    if (!(appState.els?.inEndingType?.value)) failures.push("No ending type selected");
    return { sectionName: "Ending Type", passed: failures.length === 0, failures };
}

export function runProdValidation() {
    const sections = [validatePlayersSelected(), validatePlayerAssets(), validateBackgroundColor(), validateTransition(), validateSpecificTitle(), validateEndingType()];
    return { allPassed: sections.every((s) => s.passed), sections };
}

export function showValidationModal(result) {
    const existing = document.getElementById("prod-validation-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "prod-validation-overlay";
    overlay.className = "prod-validation-overlay";
    const modal = document.createElement("div");
    modal.className = "prod-validation-modal";
    const header = document.createElement("div");
    header.className = "prod-validation-modal__header";
    const title = document.createElement("h2");
    title.textContent = result.allPassed ? "All Checks Passed" : "PROD Validation Failed";
    if (result.allPassed) { header.style.background = "rgba(34,197,94,0.15)"; title.style.color = "#22c55e"; }
    const closeBtn = document.createElement("button");
    closeBtn.className = "prod-validation-modal__close";
    closeBtn.textContent = "\u00D7";
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(title); header.appendChild(closeBtn); modal.appendChild(header);
    const body = document.createElement("div");
    body.className = "prod-validation-modal__body";
    for (const section of result.sections) {
        const sectionEl = document.createElement("div"); sectionEl.className = "prod-validation-section";
        const toggle = document.createElement("button"); toggle.className = "prod-validation-section__toggle"; toggle.type = "button";
        const nameSpan = document.createElement("span"); nameSpan.textContent = section.sectionName;
        const statusSpan = document.createElement("span"); statusSpan.className = `section-status ${section.passed ? "pass" : "fail"}`;
        statusSpan.textContent = section.passed ? "PASS" : `FAIL (${section.failures.length})`;
        toggle.appendChild(nameSpan); toggle.appendChild(statusSpan);
        const details = document.createElement("div"); details.className = "prod-validation-section__details";
        if (section.passed) { details.innerHTML = '<span class="pass-item">All checks passed.</span>'; }
        else { const ul = document.createElement("ul"); for (const f of section.failures) { const li = document.createElement("li"); const span = document.createElement("span"); span.className = "fail-item"; span.textContent = f; li.appendChild(span); ul.appendChild(li); } details.appendChild(ul); }
        toggle.onclick = () => details.classList.toggle("open");
        sectionEl.appendChild(toggle); sectionEl.appendChild(details); body.appendChild(sectionEl);
    }
    modal.appendChild(body); overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    const escHandler = (e) => { if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); } };
    document.addEventListener("keydown", escHandler);
    document.body.appendChild(overlay);
}
