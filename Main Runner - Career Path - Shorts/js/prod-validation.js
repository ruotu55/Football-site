import { appState, getState } from "./state.js";
import { transitionSettings } from "./transitions.js";

// ── PROD mode state ──
let prodModeActive = false;

// Track whether user has explicitly confirmed background selections
let backgroundColorConfirmed = false;
let backgroundEffectConfirmed = false;

export function isProdMode() {
    return prodModeActive;
}

export function markBackgroundColorConfirmed() {
    backgroundColorConfirmed = true;
}

export function markBackgroundEffectConfirmed() {
    backgroundEffectConfirmed = true;
}

export function isBackgroundColorConfirmed() {
    return backgroundColorConfirmed;
}

export function isBackgroundEffectConfirmed() {
    return backgroundEffectConfirmed;
}

// ── Toggle PROD mode ──
export function toggleProdMode() {
    const { els } = appState;
    prodModeActive = !prodModeActive;
    if (els.prodBtn) {
        els.prodBtn.setAttribute("aria-pressed", prodModeActive ? "true" : "false");
    }
    const effectSel = document.getElementById("in-transition-effect");
    if (prodModeActive) {
        // Turn on video mode for ALL levels
        appState.levelsData.forEach((lvl) => {
            lvl.videoMode = true;
        });
        // Sync the current level's video mode toggle
        if (els.videoModeToggle) {
            const curState = getState();
            if (curState) {
                els.videoModeToggle.checked = true;
                els.videoModeToggle.dispatchEvent(new Event("change"));
            }
        }
        transitionSettings.effect = "";
        if (effectSel) effectSel.selectedIndex = 0;
    } else {
        transitionSettings.effect = "grid-overlay";
        if (effectSel) effectSel.value = "grid-overlay";
    }
}

// ── Validation logic ──

function getLevelLabel(index, lvl) {
    if (lvl.isLogo) return `Level 0 (Logo)`;
    if (lvl.isIntro) return `Level 1 (Intro)`;
    if (lvl.isOutro) return `Level ${index - 1} (Outro)`;
    if (lvl.isBonus) return `Level ${index - 1} (Bonus)`;
    return `Level ${index - 1}`;
}

function getQuestionLevels() {
    return appState.levelsData
        .map((lvl, i) => ({ lvl, index: i }))
        .filter(({ lvl }) => !lvl.isLogo && !lvl.isIntro && !lvl.isOutro && !lvl.isBonus);
}

function validateCareerPlayerSelected() {
    const questionLevels = getQuestionLevels();
    const failures = [];
    for (const { lvl, index } of questionLevels) {
        if (!lvl.careerPlayer) {
            failures.push(`${getLevelLabel(index, lvl)}: No career player selected`);
        }
    }
    return {
        sectionName: "Career Player Selected",
        passed: failures.length === 0,
        failures,
    };
}

function validateCareerHistory() {
    const questionLevels = getQuestionLevels();
    const failures = [];
    for (const { lvl, index } of questionLevels) {
        const label = getLevelLabel(index, lvl);
        if (!lvl.careerHistory || lvl.careerHistory.length === 0) {
            failures.push(`${label}: No career history`);
            continue;
        }
        lvl.careerHistory.forEach((entry, ei) => {
            if (!entry.club || entry.club === "Unknown") {
                failures.push(`${label} slot ${ei + 1}: missing club name`);
            }
            if (!entry.year || entry.year === "YYYY") {
                failures.push(`${label} slot ${ei + 1}: missing year`);
            }
        });
    }
    return {
        sectionName: "Career History",
        passed: failures.length === 0,
        failures,
    };
}

/**
 * Check if a career player has photos available.
 */
function careerPlayerHasPhotos(player) {
    if (!player) return false;
    const name = player.name || "";
    if (!name) return false;

    const sanitize = (raw) =>
        String(raw || "").trim().replace(/\//g, "").replace(/\\/g, "").replace(/\.\./g, "").replace(/[<>:"|?*]/g, "").replace(/[. ]+$/g, "");
    const variants = (raw) => {
        const base = String(raw || "").trim();
        if (!base) return [];
        const s = sanitize(base);
        return s && s !== base ? [base, s] : [base];
    };

    const playerNames = variants(name);

    // Check club photos
    if (appState.playerImages?.club) {
        for (const key in appState.playerImages.club) {
            if (playerNames.some((p) => key.endsWith(`|${p}`))) {
                if (appState.playerImages.club[key]?.length > 0) return true;
            }
        }
    }

    // Check nationality photos
    if (appState.playerImages?.nationality) {
        for (const key in appState.playerImages.nationality) {
            if (playerNames.some((p) => key.endsWith(`|${p}`))) {
                if (appState.playerImages.nationality[key]?.length > 0) return true;
            }
        }
    }

    return false;
}

function validatePlayerImages() {
    const questionLevels = getQuestionLevels();
    const failures = [];
    for (const { lvl, index } of questionLevels) {
        if (!lvl.careerPlayer) continue;
        const label = getLevelLabel(index, lvl);
        const playerName = lvl.careerPlayer.name || "Unknown";
        if (!careerPlayerHasPhotos(lvl.careerPlayer)) {
            failures.push(`${label} (${playerName}): no player photo found`);
        }
    }
    return {
        sectionName: "Player Images",
        passed: failures.length === 0,
        failures,
    };
}

function validateBackgroundColor() {
    const failures = [];
    if (!backgroundColorConfirmed) {
        failures.push("Background Color has not been selected (currently showing default)");
    }
    if (!backgroundEffectConfirmed) {
        failures.push("Background Effect has not been selected (currently showing default)");
    }
    return {
        sectionName: "Background Color & Effect",
        passed: failures.length === 0,
        failures,
    };
}

function validateTransition() {
    const failures = [];
    const effectSel = document.getElementById("in-transition-effect");
    const randomChk = document.getElementById("in-transition-random");
    const effectVal = effectSel ? effectSel.value : "";
    const isRandom = randomChk ? randomChk.checked : false;

    if (!effectVal && !isRandom) {
        failures.push("No transition effect selected and Random is not checked");
    }
    return {
        sectionName: "Transition",
        passed: failures.length === 0,
        failures,
    };
}

function validateSpecificTitle() {
    const failures = [];
    const yesBtn = document.getElementById("specific-title-yes");
    const noBtn = document.getElementById("specific-title-no");
    const yesPressed = yesBtn?.getAttribute("aria-pressed") === "true";
    const noPressed = noBtn?.getAttribute("aria-pressed") === "true";

    if (!yesPressed && !noPressed) {
        failures.push("'Add specific title' has not been set to YES or NO");
    }
    return {
        sectionName: "Add Specific Title",
        passed: failures.length === 0,
        failures,
    };
}

function validateEndingType() {
    const failures = [];
    const endingType = appState.els?.inEndingType?.value || "";
    if (!endingType) {
        failures.push("No ending type selected");
    }
    return {
        sectionName: "Ending Type",
        passed: failures.length === 0,
        failures,
    };
}

// ── Run all validations ──
export function runProdValidation() {
    const sections = [
        validateCareerPlayerSelected(),
        validateCareerHistory(),
        validatePlayerImages(),
        validateBackgroundColor(),
        validateTransition(),
        validateSpecificTitle(),
        validateEndingType(),
    ];
    const allPassed = sections.every((s) => s.passed);
    return { allPassed, sections };
}

// ── Show validation modal ──
export function showValidationModal(result) {
    // Remove existing modal if any
    const existing = document.getElementById("prod-validation-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "prod-validation-overlay";
    overlay.className = "prod-validation-overlay";

    const modal = document.createElement("div");
    modal.className = "prod-validation-modal";

    // Header
    const header = document.createElement("div");
    header.className = "prod-validation-modal__header";
    const title = document.createElement("h2");
    title.textContent = result.allPassed ? "All Checks Passed" : "PROD Validation Failed";
    if (result.allPassed) {
        header.style.background = "rgba(34,197,94,0.15)";
        title.style.color = "#22c55e";
    }
    const closeBtn = document.createElement("button");
    closeBtn.className = "prod-validation-modal__close";
    closeBtn.textContent = "\u00D7";
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body - sections
    const body = document.createElement("div");
    body.className = "prod-validation-modal__body";

    for (const section of result.sections) {
        const sectionEl = document.createElement("div");
        sectionEl.className = "prod-validation-section";

        const toggle = document.createElement("button");
        toggle.className = "prod-validation-section__toggle";
        toggle.type = "button";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = section.sectionName;

        const statusSpan = document.createElement("span");
        statusSpan.className = `section-status ${section.passed ? "pass" : "fail"}`;
        statusSpan.textContent = section.passed ? "PASS" : `FAIL (${section.failures.length})`;

        toggle.appendChild(nameSpan);
        toggle.appendChild(statusSpan);

        const details = document.createElement("div");
        details.className = "prod-validation-section__details";

        if (section.passed) {
            details.innerHTML = '<span class="pass-item">All checks passed.</span>';
        } else {
            const ul = document.createElement("ul");
            for (const f of section.failures) {
                const li = document.createElement("li");
                const span = document.createElement("span");
                span.className = "fail-item";
                span.textContent = f;
                li.appendChild(span);
                ul.appendChild(li);
            }
            details.appendChild(ul);
        }

        toggle.onclick = () => {
            details.classList.toggle("open");
        };

        sectionEl.appendChild(toggle);
        sectionEl.appendChild(details);
        body.appendChild(sectionEl);
    }

    modal.appendChild(body);
    overlay.appendChild(modal);

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // Close on Escape
    const escHandler = (e) => {
        if (e.key === "Escape") {
            overlay.remove();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);

    document.body.appendChild(overlay);
}
