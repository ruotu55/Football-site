import { appState, getState } from "./state.js";
import { transitionSettings } from "./transitions.js";
import { projectAssetUrl } from "./paths.js";
import { validateDisplayedImagesAsync } from "../../.Storage/shared/prod-asset-validation.js";
import { isUpdateDataFresh } from "../../.Storage/shared/update-data-freshness.js";
import { getMcq, localized } from "./mcq-mode.js";
import { getCurrentLanguage } from "./voice-tab.js";
import { BUNDLED_MILESTONES, getSelectedBundledVariant } from "./bundled-level-voices.js";
/* No team-header rename feature in this runner — read the name straight off the level. */
function resolveLevelTeamName(lvl, _quizType) {
    return String(lvl.currentSquad?.name || lvl.selectedEntry?.name || "").trim();
}

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
        // Turn on video mode for ALL levels (PROD = "ready to record")
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
    /* Note: PROD no longer touches transitionSettings.effect — Record Video must
       use the same transition as Play Video, and the user's transition selection
       (or the value saved with the loaded script) should be respected regardless. */
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
        const mcq = getMcq(lvl);
        if (!mcq || !Array.isArray(mcq.answers) || mcq.answers.length === 0) {
            failures.push(`${getLevelLabel(index, lvl)}: No question set`);
        }
    }
    return {
        sectionName: "Questions Set",
        passed: failures.length === 0,
        failures,
    };
}

/* Build the runner-relative URL exactly the way mcq-mode.js#assetUrl does, so PROD
   probes the same file the card renders. */
function mcqAssetUrl(path) {
    const clean = String(path || "").replace(/^\.?\/+/, "");
    if (!clean) return "";
    return "../" + clean.split("/").map(encodeURIComponent).join("/");
}

/* The images an MCQ level actually displays:
   - "which-player": three player PHOTO cards (answers[].photoPath)
   - "trivia": one topic image (mcq.topicImage), if set (a null topic renders no image).
   No squad XI exists in this quiz. */
async function validateTeamAssets() {
    return validateDisplayedImagesAsync({
        questionLevels: getQuestionLevels(),
        getLevelLabel,
        hasContent: (lvl) => !!getMcq(lvl),
        collectUnits: (lvl) => {
            const mcq = getMcq(lvl);
            if (!mcq) return [];
            const units = [];
            if (mcq.questionType === "which-player") {
                for (const a of (Array.isArray(mcq.answers) ? mcq.answers : [])) {
                    const id = (a && a.id) || "?";
                    const url = a && a.photoPath ? mcqAssetUrl(a.photoPath) : "";
                    units.push({ label: `answer ${id}: player photo`, urls: url ? [url] : [] });
                }
            } else if (mcq.topicImage) {
                units.push({ label: "topic image", urls: [mcqAssetUrl(mcq.topicImage)] });
            }
            return units;
        },
        sectionName: "Photos / Logos",
    });
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

// ── Async voice-existence validators ──
// These all hit the same per-runner status endpoints that the Voice tab uses,
// so PROD checks the actual files on disk (not just constructed URLs).


async function fetchExists(path, params) {
    try {
        const qs = new URLSearchParams(params).toString();
        const res = await fetch(`${path}?${qs}`, { cache: "no-store" });
        if (!res.ok) return { exists: false, error: `HTTP ${res.status}` };
        const data = await res.json().catch(() => ({}));
        return { exists: !!data?.exists };
    } catch (err) {
        return { exists: false, error: String(err?.message || err) };
    }
}

/* The voices an MCQ level actually plays: the QUESTION voice and the correct ANSWER
   voice, in the current language. Checks /__mcq-voice/status with the same text→slug
   the Voice tab + playback use (server slugifies the text). */
async function validateTeamVoices() {
    const questionLevels = getQuestionLevels();
    const language = getCurrentLanguage();
    const checks = questionLevels.map(async ({ lvl, index }) => {
        const mcq = getMcq(lvl);
        if (!mcq) return [];
        const out = [];
        const qText = localized(mcq.questionText, language);
        if (qText) {
            const { exists } = await fetchExists("/__mcq-voice/status", { kind: "questions", text: qText, language });
            if (!exists) out.push(`${getLevelLabel(index, lvl)}: question voice missing (${language})`);
        }
        const answers = Array.isArray(mcq.answers) ? mcq.answers : [];
        const correct = answers.find((a) => a && a.id === mcq.correctAnswerId);
        const aText = correct ? localized(correct.text, language) : "";
        if (aText) {
            const { exists } = await fetchExists("/__mcq-voice/status", { kind: "answers", text: aText, language });
            if (!exists) out.push(`${getLevelLabel(index, lvl)}: answer voice missing (${language})`);
        }
        return out;
    });
    const results = (await Promise.all(checks)).flat();
    return {
        sectionName: "Question & Answer Voices",
        passed: results.length === 0,
        failures: results,
    };
}

async function validateQuizIntroVoice() {
    const quizType = appState.els?.inQuizType?.value || "nat-by-club";
    const language = getCurrentLanguage();
    
    const { exists } = await fetchExists("/__quiz-title-voice/status", {
        quizType,
        specificTitle: "",
        language,
    });
    const detail = "";
    return {
        sectionName: "Quiz Intro Voice",
        passed: exists,
        failures: exists ? [] : [`Quiz intro voice missing for ${quizType}${detail} (${language})`],
    };
}

async function validateEndingVoice() {
    const raw = String(appState.els?.inEndingType?.value || "").trim();
    const language = getCurrentLanguage();
    if (!raw) {
        // The "Ending Type" validator already complains; don't double-fail here.
        return { sectionName: "Ending Voice", passed: true, failures: [] };
    }
    /* When "random" is selected we don't know which ending will be picked at
       play time, so verify BOTH so the recording works no matter which one rolls. */
    const allOptions = typeof window.__getEndingTypeOptions === "function"
        ? window.__getEndingTypeOptions()
        : ["think-you-know", "how-many"];
    const toCheck = raw === "random" ? allOptions : [raw];
    const failures = [];
    for (const endingType of toCheck) {
        const { exists } = await fetchExists("/__ending-voice/status", { endingType, language });
        if (!exists) failures.push(`Ending voice missing for "${endingType}" (${language})`);
    }
    return {
        sectionName: "Ending Voice",
        passed: failures.length === 0,
        failures,
    };
}

async function validateLevelVoices() {
    const language = getCurrentLanguage();
    const variants = appState.bundledVoiceVariants || {};
    const checks = BUNDLED_MILESTONES.map(async (milestone) => {
        const variant = getSelectedBundledVariant(milestone.audioKey, variants);
        const { exists } = await fetchExists("/__bundled-voice/status", {
            key: milestone.serverKey,
            variant,
            language,
        });
        return exists ? null : `Level voice "${milestone.serverKey}" #${variant} missing (${language})`;
    });
    const results = await Promise.all(checks);
    return {
        sectionName: "Level Voices",
        passed: results.every((r) => !r),
        failures: results.filter(Boolean),
    };
}

async function validateUpdateDataFreshness() {
    const questionLevels = getQuestionLevels();
    const quizType = appState.els?.inQuizType?.value || "nat-by-club";
    /* Mirror update-data.js#collectPaths: one path per level, first non-empty of
       selectedEntry.path, careerPlayer._clubItem.path, careerPlayer._clubItem.id.
       Server stamps the same project-relative form with forward slashes. */
    const stripLeadingDotDot = (s) =>
        typeof s === "string" && s.startsWith("../") ? s.slice(3) : s;
    const items = questionLevels.map(({ lvl, index }) => {
        const candidates = [
            lvl?.selectedEntry?.path,
            lvl?.careerPlayer?._clubItem?.path,
            lvl?.careerPlayer?._clubItem?.id,
        ];
        let path = "";
        for (const p of candidates) {
            if (typeof p === "string" && p.length > 0) {
                path = stripLeadingDotDot(p);
                break;
            }
        }
        return { index, lvl, path };
    });

    let history = { paths: {} };
    try {
        const res = await fetch("/__update-data/history", { cache: "no-store" });
        if (res.ok) history = await res.json();
    } catch (_) { /* fall through — every level reports never-updated */ }
    const stamps = (history && history.paths) || {};

    const pad = (n) => String(n).padStart(2, "0");
    const fmtStamp = (iso) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const failures = [];
    for (const { lvl, index, path } of items) {
        if (!lvl.currentSquad) continue; // teams-selected validator already complains
        if (!path) continue; // custom level without a TM-backed path
        const label = getLevelLabel(index, lvl);
        const teamName = resolveLevelTeamName(lvl, quizType) || path;
        const stamp = stamps[path];
        if (!stamp) {
            failures.push(`${label} (${teamName}): never updated`);
            continue;
        }
        if (!isUpdateDataFresh(stamp)) {
            failures.push(`${label} (${teamName}): last updated ${fmtStamp(stamp)} (over a week ago)`);
        }
    }
    return {
        sectionName: "Update Data (this week)",
        passed: failures.length === 0,
        failures,
    };
}

// ── Run all validations ──
export async function runProdValidation() {
    const sections = await Promise.all([
        Promise.resolve(validateTeamsSelected()),
        validateTeamAssets(),
        Promise.resolve(validateEndingType()),
        validateUpdateDataFreshness(),
        validateTeamVoices(),
        validateQuizIntroVoice(),
        validateEndingVoice(),
        validateLevelVoices(),
    ]);
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
    overlay.className = "prod-validation-overlay fc-modal-root";

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
