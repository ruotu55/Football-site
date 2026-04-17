import { appState, getState } from "./state.js";
import { buildTeamNameVoiceSrc } from "./audio.js";
import { pickStartingXI } from "./pick-xi.js";
import { FORMATIONS } from "./formations.js";

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
    // Question levels are levels that are NOT logo, intro, outro, or bonus
    return appState.levelsData
        .map((lvl, i) => ({ lvl, index: i }))
        .filter(({ lvl }) => !lvl.isLogo && !lvl.isIntro && !lvl.isOutro && !lvl.isBonus);
}

function validateTeamsSelected() {
    const questionLevels = getQuestionLevels();
    const failures = [];
    for (const { lvl, index } of questionLevels) {
        if (!lvl.currentSquad) {
            failures.push(`${getLevelLabel(index, lvl)}: No team/player selected`);
        }
    }
    return {
        sectionName: "Teams / Players Selected",
        passed: failures.length === 0,
        failures,
    };
}

/**
 * Check if a player has photos using the LEVEL's own state data
 * (not getState() which returns the currently active level).
 */
function playerHasPhotosForLevel(player, lvl) {
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

    // Check club photos
    if (lvl.squadType === "club" && lvl.selectedEntry && appState.playerImages?.club) {
        const country = lvl.selectedEntry.country || "";
        const league = lvl.selectedEntry.league || "";
        const squadNames = variants(lvl.currentSquad?.name);
        const playerNames = variants(name);
        for (const sq of squadNames) {
            for (const pn of playerNames) {
                const k = `${country}|${league}|${sq}|${pn}`;
                if (appState.playerImages.club[k]?.length > 0) return true;
            }
        }
    }

    // Check nationality photos
    if (lvl.squadType === "national" && lvl.selectedEntry && appState.playerImages?.nationality) {
        const region = lvl.selectedEntry.region || "";
        const entryName = lvl.selectedEntry.name || "";
        const k = `${region}|${entryName}|${name}`;
        if (appState.playerImages.nationality[k]?.length > 0) return true;
    }

    // Scan all club folders for this player's club
    if (player.club && appState.playerImages?.club) {
        const clubVariants = variants(player.club);
        const playerNames = variants(name);
        for (const key in appState.playerImages.club) {
            if (clubVariants.some((c) => playerNames.some((p) => key.endsWith(`|${c}|${p}`)))) {
                if (appState.playerImages.club[key]?.length > 0) return true;
            }
        }
    }

    // Scan all nationality folders for this player's nationality
    if (player.nationality && appState.playerImages?.nationality) {
        const natSuffix = `|${player.nationality}|${name}`;
        for (const key in appState.playerImages.nationality) {
            if (key.endsWith(natSuffix) && appState.playerImages.nationality[key]?.length > 0) return true;
        }
    }

    return false;
}

function validateTeamAssets() {
    const questionLevels = getQuestionLevels();
    const failures = [];
    const quizType = appState.els?.inQuizType?.value || "nat-by-club";

    for (const { lvl, index } of questionLevels) {
        if (!lvl.currentSquad) continue;
        const label = getLevelLabel(index, lvl);
        const teamName = String(lvl.currentSquad.name || lvl.selectedEntry?.name || "").trim();
        const missing = [];

        // Check team logo/image
        const hasImage = !!(lvl.currentSquad.imagePath || lvl.headerLogoOverrideRelPath);
        if (!hasImage) {
            missing.push("logo");
        }

        // Check team voice
        const voiceSrc = buildTeamNameVoiceSrc(teamName, quizType, ".mp3");
        if (!voiceSrc) {
            missing.push("voice");
        }

        // Check player photos — use customXi (the actual selected players on the pitch)
        const formation = FORMATIONS.find((f) => f.id === lvl.formationId) || FORMATIONS[0];
        const xi = lvl.customXi || (formation ? pickStartingXI(formation, lvl.currentSquad) : []);
        if (xi && xi.length > 0) {
            for (let si = 0; si < xi.length; si++) {
                const player = xi[si];
                if (!player) {
                    missing.push(`slot ${si + 1}: no player`);
                    continue;
                }
                if (!playerHasPhotosForLevel(player, lvl)) {
                    const pName = player.name || `slot ${si + 1}`;
                    missing.push(`${pName}: no photo`);
                }
            }
        }

        if (missing.length > 0) {
            failures.push(`${label} (${teamName}): ${missing.join(", ")}`);
        }
    }
    return {
        sectionName: "Photos / Logos / Voices",
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
        validateTeamsSelected(),
        validateTeamAssets(),
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
