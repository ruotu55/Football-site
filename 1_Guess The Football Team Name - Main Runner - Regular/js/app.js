import { FORMATIONS } from "./formations.js";
import { appState, clearSlotPhotoIndices, getState, initLevels } from "./state.js";
import { migratePlayerImages, projectAssetUrl, projectAssetUrlFresh } from "./paths.js";
import { playerPhotoPaths } from "./photo-helpers.js";
import { switchLevel } from "./levels.js";
import {
    applySwapSearchAllNationality,
    applyPlayerPhotoFramingForSourceRelPath,
    initTeamNameOverridesSharedSync,
    isCurrentHeaderTeamNameEditable,
    openSwapLogoModal,
    refreshSwapLogoListFromSearch,
    refreshSwapPlayerListFromSearch,
    renameCurrentClubByNatTeamName,
    renderHeader,
    renderPitch,
    resolveHeaderTeamDisplayName,
    scheduleTeamHeaderNameCenterShift,
    scheduleShortsTeamNameFit,
    shouldUseVideoQuestionLayout,
    syncTeamHeaderLogoVarsFromLevel,
} from "./pitch-render.js";
import { filterTeams, showResults } from "./teams.js";
import { startVideoFlow, stopVideoFlow } from "./video.js?v=20260416-ball";
import { applyCustomSelects } from "./custom-selects.js";
import { getCurrentLanguage, setCurrentLanguage, renderVoiceTab } from "./voice-tab.js";
import { applyTranslations, t, endingTitleText } from "./i18n.js";
import { initLevelControls } from "./level-control.js";
import { initSavedScripts, renderSavedScripts, getActiveScriptName } from "./saved-scripts.js";
import { startRecordingAndFullscreen } from "./recording-flow.js";
import { initTransitionsUI, transitionSettings } from "./transitions.js";
import { initUpdateData } from "./update-data.js";
import {
    isProdMode,
    toggleProdMode,
    runProdValidation,
    showValidationModal,
    markBackgroundColorConfirmed,
    markBackgroundEffectConfirmed,
} from "./prod-validation.js";
import {
    initSavedTeamLayouts,
    refreshSaveTeamButtonUi,
    confirmAndDeleteSaveIfPresent,
} from "./saved-team-layouts.js";
import { bindDomElements } from "./dom-bindings.js";
import { refreshTeamHeaderHatchGrid } from "./team-header-hatch.js";
import { wireMainTabs, wireControlPanelToggle } from "./ui-panels.js";
import { initOptionalBootstrapUtilities } from "./bootstrap-hybrid.js";
import { initTeamVoiceManager } from "./team-voice-manager.js";
import { initSharedBackgroundTheme } from "../../.Storage/shared/backgrounds/background-theme.js";
import {
    applyDevLiveReloadControls,
    captureDevLiveReloadSnapshot,
    consumeDevLiveReloadSnapshot,
    getInitialLevelCountFromSnapshot,
    restoreDevLiveReloadState,
} from "./dev-live-reload-state.js";

const HEADER_LOGO_SCALE_STEP = 0.1;
const HEADER_LOGO_SCALE_MIN_POSITIVE = 0.001;
const PERFORMANCE_MODE_SESSION_KEY = "lineups:performance-mode";
const SESSION_JSON_CACHE_PREFIX = "lineups:session-json:v1:";
const PERFORMANCE_MODE_QUERY_VALUES = new Set(["1", "true", "on", "yes"]);
const PERFORMANCE_MODE_QUERY_OFF_VALUES = new Set(["0", "false", "off", "no"]);
const QUIZ_TYPE_DEFAULT_THEME = {
    "club-by-nat": { colorId: "quiz-club-by-nat", effectId: "youtube-thumbnails", opacity: 0.5, transitionId: "grid-overlay" },
};

const HEADER_LOGO_NUDGE_STEP = 6;
const HEADER_LOGO_NUDGE_ABS_MAX = 4000;
const AUTO_FETCH_TEAM_LOGO_ENDPOINT = "/__team-logo/fetch";

function showTeamNameSaveConfirmModal({ oldName, newName }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:10002; display:flex; align-items:center; justify-content:center;";
        const modal = document.createElement("div");
        modal.style.cssText = "background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:1.1rem 1.25rem; width:min(440px, 92vw); display:flex; flex-direction:column; gap:0.85rem;";
        const header = document.createElement("h3");
        header.textContent = "Save name change?";
        header.style.cssText = "margin:0; color:#fff; font-size:1rem;";
        const body = document.createElement("div");
        body.style.cssText = "color:#ddd; font-size:0.9rem; line-height:1.4;";
        body.append("Always show ");
        const newB = document.createElement("b");
        newB.style.color = "#ffd166";
        newB.textContent = String(newName ?? "");
        body.append(newB, " instead of ");
        const oldB = document.createElement("b");
        oldB.style.color = "#ffd166";
        oldB.textContent = String(oldName ?? "");
        body.append(oldB, " for this team?");
        const footer = document.createElement("div");
        footer.style.cssText = "display:flex; gap:0.5rem; justify-content:flex-end;";
        const noBtn = document.createElement("button");
        noBtn.type = "button";
        noBtn.textContent = "No";
        noBtn.style.cssText = "padding:0.45rem 1.1rem; background:#333; color:#fff; border:1px solid #555; border-radius:4px; cursor:pointer;";
        const yesBtn = document.createElement("button");
        yesBtn.type = "button";
        yesBtn.textContent = "Yes";
        yesBtn.style.cssText = "padding:0.45rem 1.1rem; background:var(--accent, #ffaa00); color:#000; border:none; border-radius:4px; cursor:pointer; font-weight:600;";
        footer.append(noBtn, yesBtn);
        modal.append(header, body, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        function close(result) { try { document.body.removeChild(overlay); } catch {} resolve(result); }
        noBtn.onclick = () => close(false);
        yesBtn.onclick = () => close(true);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
        setTimeout(() => yesBtn.focus(), 0);
    });
}

function applyDefaultThemeForCurrentQuizType() {
    const quizType = String(appState?.els?.inQuizType?.value || "").trim();
    const theme = QUIZ_TYPE_DEFAULT_THEME[quizType];
    if (!theme) return;
    const colorSel = document.getElementById("in-background-color");
    const effectSel = document.getElementById("in-background-effect");
    const opacityInput = document.getElementById("in-background-opacity");
    const transitionSel = document.getElementById("in-transition-effect");

    /* Set color/effect first and dispatch their change events. The color-change
       listener inside the shared background module auto-resets opacity to the
       saved profile for that color, so we set our desired opacity AFTER that
       chain runs to avoid being clobbered. */
    if (colorSel && theme.colorId) colorSel.value = theme.colorId;
    if (effectSel && theme.effectId) effectSel.value = theme.effectId;

    if (colorSel) colorSel.dispatchEvent(new Event("change"));
    if (effectSel) effectSel.dispatchEvent(new Event("change"));

    if (opacityInput && theme.opacity != null) {
        opacityInput.value = String(theme.opacity);
        opacityInput.dispatchEvent(new Event("input"));
    }

    if (transitionSel && theme.transitionId) {
        transitionSel.value = theme.transitionId;
        transitionSel.dispatchEvent(new Event("change"));
    }

    /* The native <select>s are wrapped by a custom-select widget that mirrors the
       selected option's text into a separate `.custom-select-trigger` element.
       Setting `select.value` programmatically updates the underlying value but
       does NOT refresh the custom trigger — re-running applyCustomSelects re-renders
       all custom triggers from current values. */
    applyCustomSelects();
}

function shouldBypassSessionJsonCache() {
    return !!window.__RUNNER_LIVE_RELOAD__;
}

function applyPerformanceModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get("perf") || "").trim().toLowerCase();
    let enabled;
    if (PERFORMANCE_MODE_QUERY_VALUES.has(raw)) {
        enabled = true;
    } else if (PERFORMANCE_MODE_QUERY_OFF_VALUES.has(raw)) {
        enabled = false;
    } else {
        enabled = sessionStorage.getItem(PERFORMANCE_MODE_SESSION_KEY) === "1";
    }
    sessionStorage.setItem(PERFORMANCE_MODE_SESSION_KEY, enabled ? "1" : "0");
    document.body.classList.toggle("performance-mode", enabled);
    return enabled;
}

async function fetchJsonSessionCached(path, fallbackValue = null) {
    const cacheKey = `${SESSION_JSON_CACHE_PREFIX}${path}`;
    const bypass = shouldBypassSessionJsonCache();
    if (!bypass) {
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch {
            // Ignore malformed session cache and fetch fresh copy.
        }
    }
    try {
        const res = await fetch(projectAssetUrl(path), { cache: "default" });
        const data = await res.json();
        if (!bypass) {
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify(data));
            } catch {
                // Ignore quota/storage failures.
            }
        }
        return data;
    } catch (err) {
        if (fallbackValue !== null) return fallbackValue;
        throw err;
    }
}

function sanitizeHeaderLogoScale(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 1;
    const r = Math.round(x * 1000) / 1000;
    if (r < HEADER_LOGO_SCALE_MIN_POSITIVE) return HEADER_LOGO_SCALE_MIN_POSITIVE;
    return r;
}

function currentLevelHeaderLogoScale() {
    const st = getState();
    if (!st) return 1;
    return sanitizeHeaderLogoScale(st.headerLogoScale ?? 1);
}

function sanitizeHeaderLogoNudge(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    const r = Math.round(x);
    return Math.min(HEADER_LOGO_NUDGE_ABS_MAX, Math.max(-HEADER_LOGO_NUDGE_ABS_MAX, r));
}

function currentLevelHeaderLogoNudge() {
    const st = getState();
    if (!st) return 0;
    return sanitizeHeaderLogoNudge(st.headerLogoNudgeX ?? 0);
}

function applyHeaderLogoNudge(px) {
    const n = sanitizeHeaderLogoNudge(px);
    const st = getState();
    if (st) {
        st.headerLogoNudgeX = n;
    }
    const th = appState.els.teamHeader;
    if (th) {
        th.style.setProperty("--header-logo-nudge-x", `${n}px`);
    }
}

function applyHeaderLogoScale(scale) {
    const s = sanitizeHeaderLogoScale(scale);
    const st = getState();
    if (st) {
        st.headerLogoScale = s;
    }
    const th = appState.els.teamHeader;
    if (th) {
        th.style.setProperty("--header-logo-scale", String(s));
    }
}

function initHeaderLogoZoom(onClearTeamSelection) {
    const th = appState.els.teamHeader;
    const zoomPairs = [
        [document.getElementById("team-header-zoom-out"), document.getElementById("team-header-zoom-in")],
    ].filter(([a, b]) => a && b);
    const swapLogo = document.getElementById("team-header-swap-logo");
    const fetchLogo = document.getElementById("team-header-fetch-logo");
    const pitchSwapLogo = document.getElementById("pitch-swap-logo");
    const clearTeamBtn = document.getElementById("team-header-clear-team");
    if (pitchSwapLogo) {
        pitchSwapLogo.onclick = () => {
            openSwapLogoModal();
        };
    }
    if (!th || zoomPairs.length === 0) return;
    if (swapLogo) {
        swapLogo.onclick = () => {
            openSwapLogoModal();
        };
    }
    if (clearTeamBtn) {
        clearTeamBtn.onclick = () => {
            if (typeof onClearTeamSelection === "function") {
                onClearTeamSelection();
            }
        };
        /* Re-parent the X to <body> so pitch-wrap's `perspective: 1200px` stops creating
           a containing block for it — then `position: fixed; top: 5.5vh` anchors to the
           viewport and matches the chrome-row X in Career Path / Four params / Player stats. */
        if (clearTeamBtn.parentElement !== document.body) {
            document.body.appendChild(clearTeamBtn);
        }
    }
    if (fetchLogo) {
        fetchLogo.onclick = async () => {
            const st = getState();
            if (!st?.currentSquad) return;
            if (fetchLogo.disabled) return;
            const prevText = fetchLogo.textContent || "Get logo";
            fetchLogo.disabled = true;
            fetchLogo.textContent = "...";
            try {
                const logoPayload = {
                    squadType: st.squadType || "",
                    selectedEntry: st.selectedEntry || {},
                    currentSquadName: st.currentSquad?.name || st.selectedEntry?.name || "",
                    currentSquadImagePath: st.currentSquad?.imagePath || "",
                };
                const res = await fetch(AUTO_FETCH_TEAM_LOGO_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(logoPayload),
                });
                let data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.ok) {
                    const msg0 = data?.error || "Could not fetch team logo.";
                    const pasted = window.prompt(
                        `${msg0}\n\nPaste a football-logos.cc team page URL (example: team page with download sizes), or a direct PNG link from images.football-logos.cc / assets.football-logos.cc. Leave empty to cancel.`,
                        "",
                    );
                    const manual = String(pasted || "").trim();
                    if (!manual) {
                        throw new Error(msg0);
                    }
                    const res2 = await fetch(AUTO_FETCH_TEAM_LOGO_ENDPOINT, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...logoPayload, pageUrl: manual }),
                    });
                    data = await res2.json().catch(() => ({}));
                    if (!res2.ok || !data?.ok) {
                        throw new Error(data?.error || "Could not download team logo from pasted URL.");
                    }
                }
                if (data?.relativePath) {
                    const rel = String(data.relativePath);
                    st.headerLogoOverrideRelPath = `${rel}${rel.includes("?") ? "&" : "?"}_logo=${Date.now()}`;
                    if (st.currentSquad && typeof st.currentSquad === "object") {
                        st.currentSquad.imagePath = rel;
                    }
                }
                renderHeader();
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Could not fetch team logo.";
                window.alert(msg);
            } finally {
                fetchLogo.disabled = false;
                fetchLogo.textContent = prevText;
            }
        };
    }
    syncTeamHeaderLogoVarsFromLevel();
    const onHeaderZoomOut = () => {
        applyHeaderLogoScale(currentLevelHeaderLogoScale() - HEADER_LOGO_SCALE_STEP);
        scheduleTeamHeaderNameCenterShift();
    };
    const onHeaderZoomIn = () => {
        applyHeaderLogoScale(currentLevelHeaderLogoScale() + HEADER_LOGO_SCALE_STEP);
        scheduleTeamHeaderNameCenterShift();
    };
    for (const [zOut, zIn] of zoomPairs) {
        zOut.onclick = onHeaderZoomOut;
        zIn.onclick = onHeaderZoomIn;
    }
    window.addEventListener("resize", () => {
        scheduleTeamHeaderNameCenterShift();
        scheduleShortsTeamNameFit();
    });
}

// ==========================================
// SHARED UI HELPERS (Exported for Sub-Modules)
// ==========================================

const QUIZ_TYPE_VOICE_FILES = {
    "club-by-nat": "../.Storage/Voices/Game name/Guess the football team name by players' nationality !!!.mp3",
};

// ==========================================
// ENDING TYPE VOICE CONTROLS
// ==========================================
const ENDING_TYPE_TEXTS = {
    "think-you-know": "THINK YOU KNOW THE ANSWER?",
    "how-many": "HOW MANY DID YOU GET?",
};
const ENDING_VOICE_STATUS_ENDPOINT = "__ending-voice/status";
const ENDING_VOICE_GENERATE_ENDPOINT = "__ending-voice/generate";
const ENDING_VOICE_DELETE_ENDPOINT = "__ending-voice/delete";
const ENDING_VOICE_FIXED_VOICE = "en-US-AndrewNeural";
const endingTypeVoiceStatusByType = {};
let endingTypePreviewAudioEl = null;
let endingTypePreviewAudioSrc = "";

function getEndingTypeBaseLabel(optionEl) {
    const savedBase = optionEl?.dataset?.baseLabel;
    if (savedBase) return savedBase;
    return String(optionEl?.textContent || "").trim();
}

function setEndingTypeOptionLabel(optionEl, hasVoice) {
    if (!optionEl) return;
    const baseLabel = getEndingTypeBaseLabel(optionEl);
    optionEl.dataset.baseLabel = baseLabel;
    endingTypeVoiceStatusByType[optionEl.value] = !!hasVoice;
    optionEl.textContent = baseLabel;
}

function stopEndingTypeVoicePreview() {
    if (!endingTypePreviewAudioEl) return;
    endingTypePreviewAudioEl.pause();
    endingTypePreviewAudioEl.currentTime = 0;
    endingTypePreviewAudioEl = null;
    endingTypePreviewAudioSrc = "";
}

function playEndingTypeVoicePreview(src) {
    const clipSrc = String(src || "").trim();
    if (!clipSrc) return;
    stopEndingTypeVoicePreview();
    const audio = new Audio(clipSrc);
    endingTypePreviewAudioEl = audio;
    endingTypePreviewAudioSrc = clipSrc;
    audio.addEventListener("ended", () => {
        if (endingTypePreviewAudioEl === audio) {
            endingTypePreviewAudioEl = null;
            endingTypePreviewAudioSrc = "";
        }
    }, { once: true });
    audio.play().catch(() => {});
}

function setEndingTypeVoiceBusy(endingType, isBusy) {
    const volBtns = document.querySelectorAll(`button[data-ending-type-voice-vol="${endingType}"]`);
    const delBtns = document.querySelectorAll(`button[data-ending-type-voice-del="${endingType}"]`);
    volBtns.forEach((volBtn) => {
        volBtn.disabled = !!isBusy;
        volBtn.textContent = isBusy ? "..." : "Vol";
    });
    delBtns.forEach((delBtn) => {
        delBtn.disabled = !!isBusy || !endingTypeVoiceStatusByType[endingType];
    });
}

async function fetchEndingTypeVoiceStatus(endingType) {
    const params = new URLSearchParams({
        endingType: String(endingType || ""),
        language: getCurrentLanguage(),
    });
    const res = await fetch(`${endpointUrl(ENDING_VOICE_STATUS_ENDPOINT)}?${params.toString()}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Status failed (${res.status})`);
    const exists = !!body.exists;
    endingTypeVoiceStatusByType[endingType] = exists;
    return { exists, src: String(body?.src || "") };
}

async function ensureEndingTypeVoiceThenPlay(endingType) {
    setEndingTypeVoiceBusy(endingType, true);
    try {
        const status = await fetchEndingTypeVoiceStatus(endingType);
        let previewSrc = status.src;
        if (!status.exists) {
            const res = await fetch(endpointUrl(ENDING_VOICE_GENERATE_ENDPOINT), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    endingType,
                    voice: ENDING_VOICE_FIXED_VOICE,
                    language: getCurrentLanguage(),
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
            endingTypeVoiceStatusByType[endingType] = true;
            previewSrc = String(body?.src || "");
        }
        renderEndingTypeVoiceStatusPanel();
        playEndingTypeVoicePreview(previewSrc);
    } catch (err) {
        alert(`Could not generate ending voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setEndingTypeVoiceBusy(endingType, false);
    }
}

async function resolveEndingVoiceSrcForPlayback(endingType) {
    const status = await fetchEndingTypeVoiceStatus(endingType).catch(() => ({ exists: false, src: "" }));
    if (status.exists && status.src) {
        return String(status.src || "");
    }
    const res = await fetch(endpointUrl(ENDING_VOICE_GENERATE_ENDPOINT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            endingType,
            voice: ENDING_VOICE_FIXED_VOICE,
            language: getCurrentLanguage(),
        }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
    endingTypeVoiceStatusByType[endingType] = true;
    return String(body?.src || "");
}

window.__resolveEndingVoiceSrc = resolveEndingVoiceSrcForPlayback;

async function deleteEndingTypeVoice(endingType) {
    if (!endingTypeVoiceStatusByType[endingType]) return;
    setEndingTypeVoiceBusy(endingType, true);
    try {
        stopEndingTypeVoicePreview();
        const res = await fetch(endpointUrl(ENDING_VOICE_DELETE_ENDPOINT), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endingType, language: getCurrentLanguage() }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(body?.error || `Delete failed (${res.status})`);
        endingTypeVoiceStatusByType[endingType] = false;
        renderEndingTypeVoiceStatusPanel();
    } catch (err) {
        alert(`Could not delete ending voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setEndingTypeVoiceBusy(endingType, false);
    }
}

function renderEndingTypeVoiceStatusPanel() {
    document.getElementById("ending-type-voice-status")?.remove();
}

async function refreshEndingTypeVoiceLabels() {
    const { els } = appState;
    const endingTypeSelect = els?.inEndingType;
    if (!endingTypeSelect) return;
    const options = Array.from(endingTypeSelect.options || []).filter((opt) => opt.value && !opt.disabled);
    if (options.length === 0) return;
    await Promise.all(
        options.map(async (opt) => {
            let hasVoice = false;
            try {
                const status = await fetchEndingTypeVoiceStatus(opt.value);
                hasVoice = !!status.exists;
            } catch {
                hasVoice = false;
            }
            setEndingTypeOptionLabel(opt, hasVoice);
        }),
    );
    applyCustomSelects();
    renderEndingTypeVoiceStatusPanel();
}

/* Available concrete ending types, kept in one place so PROD validation and the
   random picker stay in sync. */
const ENDING_TYPE_OPTIONS = ["think-you-know", "how-many"];

/* Cache for the random pick — set the first time getSelectedEndingType resolves
   "random" within a play/record session, cleared by resetRandomEndingType().
   The Play and Record handlers call reset BEFORE the flow starts; Record only
   resets once at the very start so both EN and ES phases see the same pick. */
let cachedRandomEndingType = null;

function getSelectedEndingType() {
    const raw = String(appState?.els?.inEndingType?.value || "").trim();
    if (raw && raw !== "random" && ENDING_TYPE_OPTIONS.includes(raw)) {
        return raw;
    }
    /* Random mode: pick once, then return the same value for the rest of this session. */
    if (!cachedRandomEndingType) {
        const idx = Math.floor(Math.random() * ENDING_TYPE_OPTIONS.length);
        cachedRandomEndingType = ENDING_TYPE_OPTIONS[idx];
    }
    return cachedRandomEndingType;
}

function resetRandomEndingType() {
    cachedRandomEndingType = null;
}
window.__resetRandomEndingType = resetRandomEndingType;
window.__getEndingTypeOptions = () => ENDING_TYPE_OPTIONS.slice();

function updateOutroText() {
    const endingType = getSelectedEndingType();
    const outroTitle = document.getElementById("outro-title");
    const outroSubtitle = document.getElementById("outro-subtitle");
    if (outroTitle) {
        outroTitle.textContent = endingTitleText(endingType);
    }
    if (outroSubtitle) {
        outroSubtitle.textContent = t("outroSubtitle");
    }
}

window.__getSelectedEndingType = getSelectedEndingType;
const QUIZ_TITLE_VOICE_STATUS_ENDPOINT = "__quiz-title-voice/status";
const QUIZ_TITLE_VOICE_GENERATE_ENDPOINT = "__quiz-title-voice/generate";
const QUIZ_TITLE_VOICE_DELETE_ENDPOINT = "__quiz-title-voice/delete";
const QUIZ_TITLE_FIXED_VOICE = "en-US-AndrewNeural";
const quizTypeVoiceStatusByType = {};
let quizTypePreviewAudioEl = null;
let quizTypePreviewAudioSrc = "";

function getQuizTypeBaseLabel(optionEl) {
    const savedBase = optionEl?.dataset?.baseLabel;
    if (savedBase) return savedBase;
    const current = String(optionEl?.textContent || "").trim();
    return current.replace(/\s+\[(?:VOL|X)\]$/i, "").trim();
}

function setQuizTypeOptionLabel(optionEl, hasVoice) {
    if (!optionEl) return;
    const baseLabel = getQuizTypeBaseLabel(optionEl);
    optionEl.dataset.baseLabel = baseLabel;
    quizTypeVoiceStatusByType[optionEl.value] = !!hasVoice;
    optionEl.textContent = baseLabel;
}

function normalizeVoiceSrc(src) {
    try {
        return new URL(String(src || ""), window.location.href).href;
    } catch {
        return String(src || "").trim();
    }
}

function stopQuizTypeVoicePreview() {
    if (!quizTypePreviewAudioEl) return;
    quizTypePreviewAudioEl.pause();
    quizTypePreviewAudioEl.currentTime = 0;
    quizTypePreviewAudioEl = null;
    quizTypePreviewAudioSrc = "";
}

function playQuizTypeVoicePreview(src) {
    const clipSrc = String(src || "").trim();
    if (!clipSrc) return;
    stopQuizTypeVoicePreview();
    const audio = new Audio(clipSrc);
    quizTypePreviewAudioEl = audio;
    quizTypePreviewAudioSrc = clipSrc;
    audio.addEventListener(
        "ended",
        () => {
            if (quizTypePreviewAudioEl === audio) {
                quizTypePreviewAudioEl = null;
                quizTypePreviewAudioSrc = "";
            }
        },
        { once: true },
    );
    audio.play().catch(() => {});
}

function endpointUrl(relPath) {
    return projectAssetUrl(relPath);
}

function getSpecificTitleForQuizType(quizType) {
    /* "Add specific competition" was removed — there is no longer a per-quiz title.
       Returning "" preserves the call sites without changing their structure. */
    return "";
}

function setQuizTypeVoiceBusy(quizType, isBusy) {
    const volBtns = document.querySelectorAll(`button[data-quiz-type-voice-vol="${quizType}"]`);
    const delBtns = document.querySelectorAll(`button[data-quiz-type-voice-del="${quizType}"]`);
    volBtns.forEach((volBtn) => {
        volBtn.disabled = !!isBusy;
        volBtn.textContent = isBusy ? "..." : "Vol";
    });
    delBtns.forEach((delBtn) => {
        delBtn.disabled = !!isBusy || !quizTypeVoiceStatusByType[quizType];
    });
}

async function fetchQuizTypeVoiceStatus(quizType, specificTitle = "") {
    const params = new URLSearchParams({
        quizType: String(quizType || ""),
        specificTitle: String(specificTitle || ""),
        language: getCurrentLanguage(),
    });
    const res = await fetch(`${endpointUrl(QUIZ_TITLE_VOICE_STATUS_ENDPOINT)}?${params.toString()}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Status failed (${res.status})`);
    const exists = !!body.exists;
    quizTypeVoiceStatusByType[quizType] = exists;
    return { exists, src: String(body?.src || "") };
}

async function ensureQuizTypeVoiceThenPlay(quizType) {
    setQuizTypeVoiceBusy(quizType, true);
    const specificTitleText = getSpecificTitleForQuizType(quizType);
    try {
        const status = await fetchQuizTypeVoiceStatus(quizType, specificTitleText);
        let previewSrc = status.src;
        if (!status.exists) {
            const res = await fetch(endpointUrl(QUIZ_TITLE_VOICE_GENERATE_ENDPOINT), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    quizType,
                    voice: QUIZ_TITLE_FIXED_VOICE,
                    specificTitle: specificTitleText,
                    language: getCurrentLanguage(),
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
            quizTypeVoiceStatusByType[quizType] = true;
            previewSrc = String(body?.src || "");
        }
        renderQuizTypeVoiceStatusPanel();
        playQuizTypeVoicePreview(previewSrc);
    } catch (err) {
        alert(`Could not generate quiz title voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setQuizTypeVoiceBusy(quizType, false);
    }
}

async function resolveQuizTitleVoiceSrcForPlayback(quizType) {
    const specificTitleText = getSpecificTitleForQuizType(quizType);
    const status = await fetchQuizTypeVoiceStatus(quizType, specificTitleText).catch(() => ({ exists: false, src: "" }));
    if (status.exists && status.src) {
        return String(status.src || "");
    }
    const res = await fetch(endpointUrl(QUIZ_TITLE_VOICE_GENERATE_ENDPOINT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            quizType,
            voice: QUIZ_TITLE_FIXED_VOICE,
            specificTitle: specificTitleText,
            language: getCurrentLanguage(),
        }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
    quizTypeVoiceStatusByType[quizType] = true;
    return String(body?.src || "");
}

window.__resolveQuizTitleVoiceSrc = resolveQuizTitleVoiceSrcForPlayback;

async function deleteQuizTypeVoice(quizType) {
    if (!quizTypeVoiceStatusByType[quizType]) return;
    setQuizTypeVoiceBusy(quizType, true);
    const specificTitleText = getSpecificTitleForQuizType(quizType);
    try {
        stopQuizTypeVoicePreview();
        const res = await fetch(endpointUrl(QUIZ_TITLE_VOICE_DELETE_ENDPOINT), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                quizType,
                specificTitle: specificTitleText,
                language: getCurrentLanguage(),
            }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(body?.error || `Delete failed (${res.status})`);
        quizTypeVoiceStatusByType[quizType] = false;
        renderQuizTypeVoiceStatusPanel();
    } catch (err) {
        alert(`Could not delete quiz title voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setQuizTypeVoiceBusy(quizType, false);
    }
}

function renderQuizTypeVoiceStatusPanel() {
    document.getElementById("quiz-type-voice-status")?.remove();
}

function renderLandingTitleVoiceControls() {
    const host = document.getElementById("landing-title-voice-controls");
    if (!host) return;
    host.hidden = true;
    host.replaceChildren();
}

async function refreshQuizTypeVoiceLabels() {
    const { els } = appState;
    const quizTypeSelect = els?.inQuizType;
    if (!quizTypeSelect) return;
    const options = Array.from(quizTypeSelect.options || []);
    if (options.length === 0) return;

    await Promise.all(
        options.map(async (opt) => {
            let hasVoice = false;
            try {
                const status = await fetchQuizTypeVoiceStatus(opt.value, getSpecificTitleForQuizType(opt.value));
                hasVoice = !!status.exists;
            } catch {
                hasVoice = false;
            }
            setQuizTypeOptionLabel(opt, hasVoice);
        }),
    );

    applyCustomSelects();
    renderQuizTypeVoiceStatusPanel();
    renderLandingTitleVoiceControls();
}

export function updateSetupUI() {
    const { els } = appState;
    if (!els.setupPitchControls) {
        return;
    }
    const subType = els.inQuizType.value;

    els.setupPitchControls.style.display = "flex";

    let targetSquad = "national";
    let targetDisplay = "club";

    if (subType === "club-by-nat") {
        targetSquad = "club";
        targetDisplay = "country";
    }

    let changed = false;
    if (els.squadType.value !== targetSquad) {
        els.squadType.value = targetSquad;
        changed = true;
    }
    if (els.displayMode.value !== targetDisplay) {
        els.displayMode.value = targetDisplay;
        changed = true;
    }

    if (appState.levelsData) {
        appState.levelsData.forEach(lvl => {
            lvl.squadType = targetSquad;
            lvl.displayMode = targetDisplay;
        });
    }

    if (changed && els.squadType.onchange) {
        els.squadType.dispatchEvent(new Event('change'));
        els.displayMode.dispatchEvent(new Event('change'));
    }
}

export function populateSubTypes() {
    const { els } = appState;
    els.inQuizType.innerHTML = `
      <option value="club-by-nat">Guess the football team by players' nationality</option>
    `;

    if (els.inQuizType.options.length > 0) {
        els.inQuizType.selectedIndex = 0;
    }

    Array.from(els.inQuizType.options).forEach((opt) => {
        opt.dataset.baseLabel = String(opt.textContent || "").trim();
    });

    updateSetupUI();
    applyCustomSelects();
    renderQuizTypeVoiceStatusPanel();
    renderLandingTitleVoiceControls();
    void refreshQuizTypeVoiceLabels();
}

function landingDifficultyTotalQuestionsForLevels() {
    return Math.max(0, appState.totalLevelsCount - 2);
}

function computeLandingDifficultyDistribution(totalQuestions) {
    const total = Math.max(0, Number(totalQuestions) || 0);
    if (total === 0) {
        return { easy: 0, medium: 0, hard: 0, impossible: 0 };
    }

    const targetEasy = total * 0.4;
    const targetMedium = total * 0.3;
    const targetHard = total * 0.2;
    const targetImpossible = total * 0.1;

    let bestStrict = null;
    let bestRelaxed = null;

    for (let impossible = 0; impossible <= total; impossible += 1) {
        for (let hard = impossible; hard <= total - impossible; hard += 1) {
            for (let medium = hard; medium <= total - impossible - hard; medium += 1) {
                const easy = total - impossible - hard - medium;
                if (easy < medium) continue;

                const score =
                    Math.abs(easy - targetEasy) +
                    Math.abs(medium - targetMedium) +
                    Math.abs(hard - targetHard) +
                    Math.abs(impossible - targetImpossible);
                const candidate = { easy, medium, hard, impossible, score };
                const isStrict = easy > medium && medium > hard && hard > impossible;

                if (isStrict) {
                    if (!bestStrict || candidate.score < bestStrict.score) bestStrict = candidate;
                } else if (!bestRelaxed || candidate.score < bestRelaxed.score) {
                    bestRelaxed = candidate;
                }
            }
        }
    }

    const best = bestStrict || bestRelaxed || { easy: total, medium: 0, hard: 0, impossible: 0 };
    return {
        easy: best.easy,
        medium: best.medium,
        hard: best.hard,
        impossible: best.impossible,
    };
}

export function updateLanding() {
    const { els } = appState;
    const type = els.inQuizType.value;
    const title = document.getElementById("landing-title");
    const isShorts = document.body.classList.contains("shorts-mode");

    if (type === "club-by-nat") {
        title.innerHTML = isShorts
            ? t("landingTitleClubByNatShorts")
            : t("landingTitleClubByNat");
    } else {
        title.innerHTML = isShorts
            ? t("landingTitleNatByClubShorts")
            : t("landingTitleNatByClub");
    }
    renderLandingTitleVoiceControls();
    const landingQuestionsCount = document.getElementById("landing-questions-count");
    if (landingQuestionsCount) {
        landingQuestionsCount.textContent = String(
            Math.max(0, landingDifficultyTotalQuestionsForLevels() - 1),
        );
    }

}

// ==========================================
// CORE SYSTEM INIT
// ==========================================

const FIXED_SHORTS_MODE = false;

function applyFixedShortsMode(els) {
    if (els.shortsModeToggle) {
        els.shortsModeToggle.checked = FIXED_SHORTS_MODE;
        els.shortsModeToggle.disabled = true;
    }
    document.body.classList.toggle("shorts-mode", FIXED_SHORTS_MODE);
}

async function init() {
    initOptionalBootstrapUtilities();
    const { els } = appState;
    const devLiveReloadSnapshot = consumeDevLiveReloadSnapshot();

    bindDomElements();
    refreshTeamHeaderHatchGrid(appState.els.teamHeader);
    applyPerformanceModeFromUrl();
    initSharedBackgroundTheme(
        document.getElementById("in-background-color"),
        document.getElementById("in-background-effect"),
        document.getElementById("in-background-opacity"),
        { forcedDefaults: { colorId: "quiz-club-by-nat", effectId: "youtube-thumbnails", opacity: 0.5 } },
    );

    // Track explicit user selection for PROD validation
    const bgColorSel = document.getElementById("in-background-color");
    const bgEffectSel = document.getElementById("in-background-effect");
    if (bgColorSel) bgColorSel.addEventListener("change", () => markBackgroundColorConfirmed());
    if (bgEffectSel) bgEffectSel.addEventListener("change", () => markBackgroundEffectConfirmed());

    await initTeamVoiceManager();
    function syncShortsModeFab() {
        if (!els.shortsModeBtn || !els.shortsModeToggle) return;
        els.shortsModeBtn.setAttribute("aria-pressed", els.shortsModeToggle.checked ? "true" : "false");
    }
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    syncShortsModeFab();

    // Call initialized modules
    initLevelControls();
    initTransitionsUI();
    initSavedScripts({ populateSubTypes, updateSetupUI, updateLanding });
    initUpdateData();

    FORMATIONS.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.label;
        els.formation.appendChild(opt);
    });
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    syncShortsModeFab();
    window.__captureRunnerState = () => {
        captureDevLiveReloadSnapshot(appState, appState.els);
    };
    window.addEventListener("beforeunload", window.__captureRunnerState);
    window.addEventListener("pagehide", window.__captureRunnerState);

    for (let i = 0; i < 11; i++) {
        const div = document.createElement("div");
        div.className = "player-slot empty";
        div.dataset.slotIndex = String(i);
        const mount = document.createElement("div");
        mount.className = "slot-mount";
        div.appendChild(mount);
        els.pitchSlots.appendChild(div);
    }

    const initialLevelCount = getInitialLevelCountFromSnapshot(devLiveReloadSnapshot, 29);
    initLevels(initialLevelCount);
    const didRestoreState = restoreDevLiveReloadState(appState, devLiveReloadSnapshot);
    if (!didRestoreState) {
        const totalQuestions = Math.max(0, appState.totalLevelsCount - 2);
        const { easy, medium, hard, impossible } =
            computeLandingDifficultyDistribution(totalQuestions);
        els.inEasy.value = String(easy);
        els.inMedium.value = String(medium);
        els.inHard.value = String(hard);
        els.inImpossible.value = String(impossible);
    }
    const initialLevelIndex = didRestoreState
        ? Math.min(
            Math.max(1, appState.currentLevelIndex),
            Math.max(0, appState.levelsData.length - 1),
        )
        : 1;
    switchLevel(initialLevelIndex);
    /* Apply the per-quiz-type theme after the quiz type has been populated/restored,
       so the runner loads with the correct defaults for whichever quiz type is active
       (instead of just the runner's generic init forced defaults). */
    applyDefaultThemeForCurrentQuizType();
    syncShortsModeFab();
    initSavedTeamLayouts();
    initTeamNameOverridesSharedSync();

    // Expose for pitch-render.js (avoids circular ES module dependency).
    window.__confirmAndDeleteSaveIfPresent = confirmAndDeleteSaveIfPresent;

    const updateLogoForLanguage = () => {
        const lang = getCurrentLanguage();
        const src = lang === 'spanish'
            ? '../Images/Logo/Football Quiz Logo Spanish.png'
            : '../Images/Logo/Football Quiz Logo English.png';
        document.querySelectorAll('.logo-img-anim, .shorts-landing-logo').forEach(img => { img.src = src; });
        const subSrc = lang === 'spanish'
            ? '../Images/Emojis/Subscribe Spanish.png'
            : '../Images/Emojis/Subscribe.png';
        document.querySelectorAll('.action-sub, .action-sub-bottom').forEach(img => { img.src = subSrc; });
    };
    updateLogoForLanguage();
    document.addEventListener('voice-language-change', updateLogoForLanguage);

    /* Language toggle in the Quiz tab. */
    const langEnglishBtn = document.getElementById("lang-english");
    const langSpanishBtn = document.getElementById("lang-spanish");
    const syncLanguageButtons = () => {
        const cur = getCurrentLanguage();
        if (langEnglishBtn) langEnglishBtn.setAttribute("aria-pressed", cur === "english" ? "true" : "false");
        if (langSpanishBtn) langSpanishBtn.setAttribute("aria-pressed", cur === "spanish" ? "true" : "false");
    };
    if (langEnglishBtn) {
        langEnglishBtn.onclick = () => {
            if (getCurrentLanguage() === "english") return;
            setCurrentLanguage("english");
            syncLanguageButtons();
            updateLanding();
            updateOutroText();
            renderHeader();
        };
    }
    if (langSpanishBtn) {
        langSpanishBtn.onclick = () => {
            if (getCurrentLanguage() === "spanish") return;
            setCurrentLanguage("spanish");
            syncLanguageButtons();
            updateLanding();
            updateOutroText();
            renderHeader();
        };
    }
    syncLanguageButtons();
    applyTranslations();
    document.addEventListener('voice-language-change', () => { syncLanguageButtons(); });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && appState.isVideoPlaying) {
            stopVideoFlow();
        }
    });

    wireMainTabs(els);

    // Listeners
    els.inQuizType.onchange = () => {
        applyDefaultThemeForCurrentQuizType();
        updateSetupUI();
        /* Switching quiz type discards any loaded levels so the new quiz starts from a
           clean slate (same as a fresh run_site open). */
        let levels = parseInt(els.quizLevelsInput.value, 10);
        if (isNaN(levels) || levels < 1) levels = 30;
        appState.levelsData = [];
        initLevels(levels - 1);
        appState.currentLevelIndex = 1;
        const totalQuestions = Math.max(0, appState.totalLevelsCount - 2);
        const { easy, medium, hard, impossible } =
            computeLandingDifficultyDistribution(totalQuestions);
        els.inEasy.value = String(easy);
        els.inMedium.value = String(medium);
        els.inHard.value = String(hard);
        els.inImpossible.value = String(impossible);
        updateLanding();
        renderSavedScripts();
        renderHeader();
        switchLevel(appState.currentLevelIndex);
    };

    els.inEndingType.onchange = () => {
        updateOutroText();
        updateLanding();
        renderEndingTypeVoiceStatusPanel();
        /* Voice tab filters endings by this value — refresh so the list stays in sync. */
        renderVoiceTab();
    };

    els.inEasy.oninput = updateLanding;
    els.inMedium.oninput = updateLanding;
    els.inHard.oninput = updateLanding;
    els.inImpossible.oninput = updateLanding;

    if (els.inScreenSizeToggle && els.screenSizeOverlay) {
        els.inScreenSizeToggle.onchange = () => {
            els.screenSizeOverlay.hidden = !els.inScreenSizeToggle.checked;
        };
    }

    els.updateLevelsBtn.onclick = () => {
        let levels = parseInt(els.quizLevelsInput.value, 10);
        if (isNaN(levels) || levels < 1) levels = 30;
        initLevels(levels - 1);
        const totalQuestions = Math.max(0, appState.totalLevelsCount - 2);
        const { easy, medium, hard, impossible } = computeLandingDifficultyDistribution(totalQuestions);
        els.inEasy.value = String(easy);
        els.inMedium.value = String(medium);
        els.inHard.value = String(hard);
        els.inImpossible.value = String(impossible);
        updateLanding();
        switchLevel(appState.currentLevelIndex);
    };

    els.shortsModeToggle.onchange = (e) => {
        if (e.target.checked) document.body.classList.add("shorts-mode");
        else document.body.classList.remove("shorts-mode");
        updateLanding();
        switchLevel(appState.currentLevelIndex);
        scheduleTeamHeaderNameCenterShift();
        scheduleShortsTeamNameFit();
        syncShortsModeFab();
    };

    if (els.shortsModeBtn && els.shortsModeToggle) {
        els.shortsModeBtn.onclick = () => {
            els.shortsModeToggle.checked = !els.shortsModeToggle.checked;
            els.shortsModeToggle.dispatchEvent(new Event("change"));
        };
    }

    function syncYoutubeThumbnailsButton() {
        if (!els.youtubeThumbnailsBtn) return;
        const on = document.body.classList.contains("youtube-thumbnails-mode");
        els.youtubeThumbnailsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }

    if (els.youtubeThumbnailsBtn) {
        els.youtubeThumbnailsBtn.onclick = () => {
            document.body.classList.toggle("youtube-thumbnails-mode");
            syncYoutubeThumbnailsButton();
            switchLevel(appState.currentLevelIndex);
        };
        syncYoutubeThumbnailsButton();
    }

    function syncVideoModeButton(isEnabled) {
        if (!els.videoModeBtn) return;
        const pressed = !!isEnabled;
        els.videoModeBtn.setAttribute("aria-pressed", pressed ? "true" : "false");
    }

    function areAllLevelsVideoModeEnabled() {
        return (appState.levelsData || []).every((lvl) => !!lvl.videoMode);
    }

    function syncApplyVideoAllButton(isEnabled) {
        if (!els.applyVideoAllBtn) return;
        const pressed = !!isEnabled;
        els.applyVideoAllBtn.setAttribute("aria-pressed", pressed ? "true" : "false");
        if (pressed) {
            els.applyVideoAllBtn.style.background = "#22c55e";
            els.applyVideoAllBtn.style.color = "#001408";
            els.applyVideoAllBtn.style.boxShadow = "0 2px 5px rgba(34, 197, 94, 0.45)";
            els.applyVideoAllBtn.style.borderColor = "#22c55e";
            return;
        }
        els.applyVideoAllBtn.style.background = "";
        els.applyVideoAllBtn.style.color = "";
        els.applyVideoAllBtn.style.boxShadow = "";
        els.applyVideoAllBtn.style.borderColor = "";
    }

    els.videoModeToggle.onchange = (e) => {
        const state = getState();
        state.videoMode = e.target.checked;
        if (appState.currentLevelIndex === 0) {
            const logoImg = appState.els?.logoPage?.querySelector(".logo-img-anim");
            if (logoImg) {
                if (state.videoMode && !appState.isVideoPlaying) {
                    logoImg.classList.remove("reveal");
                } else if (!state.videoMode && !appState.isVideoPlaying) {
                    logoImg.classList.remove("reveal");
                    void logoImg.offsetWidth;
                    logoImg.classList.add("reveal");
                }
            }
        }
        syncVideoModeButton(state.videoMode);
        syncApplyVideoAllButton(areAllLevelsVideoModeEnabled());
        refreshSaveTeamButtonUi();
        if (!e.target.checked && appState.isVideoPlaying) {
            stopVideoFlow();
        }
        const isQuestionLevel =
            appState.currentLevelIndex > 1 &&
            appState.currentLevelIndex < appState.totalLevelsCount;
        if (isQuestionLevel) {
            renderPitch();
        }
        renderHeader();
        renderLandingTitleVoiceControls();
        updateLanding();
    };

    if (els.videoModeBtn && els.videoModeToggle) {
        els.videoModeBtn.onclick = () => {
            els.videoModeToggle.checked = !els.videoModeToggle.checked;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        };
    }

    els.applyVideoAllBtn.onclick = () => {
        const nextVideoMode = !areAllLevelsVideoModeEnabled();
        appState.levelsData.forEach((lvl) => {
            lvl.videoMode = nextVideoMode;
        });
        syncApplyVideoAllButton(nextVideoMode);
        if (els.videoModeToggle.checked !== nextVideoMode) {
            els.videoModeToggle.checked = nextVideoMode;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        }
    };

    // ── PROD button ──
    if (els.prodBtn) {
        els.prodBtn.onclick = () => {
            toggleProdMode();
            syncVideoModeButton(!!getState()?.videoMode);
            syncApplyVideoAllButton(areAllLevelsVideoModeEnabled());
        };
    }

    /* Pacing for the EN→ES double-record. Tweak here if you want longer/shorter brakes. */
    const RECORD_LANG_BRAKE_MS = 2000;   // after switching language, before next phase starts
    const RECORD_BETWEEN_PHASES_MS = 3000; // visual brake between phase 1 finish and phase 2 start
    const brake = (ms) => new Promise((r) => setTimeout(r, ms));

    /** Hide the top FAB row (Show Controls / Video Mode / Play / Record / Prod)
     *  so the recording's very first frames are a clean stage, not a UI snapshot.
     *  Mirrors what `startVideoFlow` does — but we do it earlier (before StartRecord). */
    function freezeUIForRecording() {
        document.body.classList.add("play-video-active");
        if (els.playVideoBtn) els.playVideoBtn.hidden = true;
        if (els.recordVideoBtn) els.recordVideoBtn.hidden = true;
        if (els.panelFab) els.panelFab.hidden = true;
    }
    function unfreezeUIForRecording() {
        document.body.classList.remove("play-video-active");
        if (els.playVideoBtn) els.playVideoBtn.hidden = false;
        if (els.recordVideoBtn) els.recordVideoBtn.hidden = false;
        if (els.panelFab) els.panelFab.hidden = false;
    }

    /** Run one recording pass: start OBS+fullscreen, kick the level flow, resolve
     *  when the outro chain in levels.js dispatches `recording-naturally-finished`. */
    async function runRecordingPhase(savedName, language) {
        /* Defensive: a legacy session may have left transitionSettings.effect = ""
           (the old PROD toggle wiped it). Without this guard the recording skips
           every transition. Empty/null/undefined → restore to the dropdown's
           selected value, or fall back to "grid-overlay". */
        if (!transitionSettings.effect) {
            const effectSel = document.getElementById("in-transition-effect");
            transitionSettings.effect = (effectSel?.value && effectSel.value !== "")
                ? effectSel.value
                : "grid-overlay";
            if (effectSel && effectSel.value !== transitionSettings.effect) {
                effectSel.value = transitionSettings.effect;
            }
        }

        /* Always begin from the landing page (ball animation), regardless of which
           level the user is currently on. This applies to both phase 1 (initial)
           and phase 2 (after the EN→ES handoff — the user is on the outro page
           after phase 1's natural finish). */
        if (appState.currentLevelIndex !== 1) {
            switchLevel(1);
            /* Wait for the actual level-switch transition to fully complete before
               continuing — otherwise `transitionRunning` may still be true when the
               video flow triggers level 1→2, causing that transition to be skipped. */
            if (appState._transitionDone && typeof appState._transitionDone.then === "function") {
                await appState._transitionDone.catch(() => {});
            }
            await brake(300); // small settle after transition completes
        }

        /* Hide FABs BEFORE StartRecord so the recorded file never shows them.
           startVideoFlow re-asserts the same state right after, so this is idempotent
           on success; on failure we roll it back. */
        freezeUIForRecording();

        /* Cover the landing title with the ball-preloader's opaque bg-stage layer
           BEFORE OBS starts capturing, so the recording's first frames are a clean
           solid background — never a title flash. The ball element itself sits at
           `top: -130px` in CSS and ~9px of it pokes into the viewport, so we hide
           it inline until playBallPreloader (via startVideoFlow) takes over. */
        const _preloaderForCover = document.getElementById("ball-preloader");
        const _preloaderBall = _preloaderForCover?.querySelector(".ball-preloader-ball");
        const _preloaderWasHidden = _preloaderForCover ? _preloaderForCover.hidden : true;
        if (_preloaderForCover) _preloaderForCover.hidden = false;
        if (_preloaderBall) _preloaderBall.style.opacity = "0";

        const ok = await startRecordingAndFullscreen(savedName, language);
        if (!ok) {
            if (_preloaderForCover && _preloaderWasHidden) _preloaderForCover.hidden = true;
            if (_preloaderBall) _preloaderBall.style.opacity = "";
            unfreezeUIForRecording();
            return false;
        }

        renderLandingTitleVoiceControls();
        appState.levelsData.forEach((lvl) => { lvl.videoMode = true; });
        if (els.videoModeToggle && !els.videoModeToggle.checked) {
            els.videoModeToggle.checked = true;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        }

        /* Subscribe BEFORE startVideoFlow so we never miss the event. */
        const completion = new Promise((resolve) => {
            document.addEventListener("recording-naturally-finished", () => resolve(), { once: true });
        });

        startVideoFlow();
        setTimeout(() => { renderLandingTitleVoiceControls(); }, 0);

        await completion;
        return true;
    }

    /* Play Video: runs the level flow WITHOUT recording or fullscreen.
       Ignored while a double-record is orchestrating. */
    els.playVideoBtn.onclick = async () => {
        if (appState.doubleRecording) return;
        if (appState.isVideoPlaying) {
            startVideoFlow(); // toggles to stop
            return;
        }
        if (isProdMode()) {
            const result = await runProdValidation();
            if (!result.allPassed) {
                showValidationModal(result);
                return;
            }
        }
        /* Fresh random pick per Play click. */
        resetRandomEndingType();
        renderLandingTitleVoiceControls();
        appState.levelsData.forEach((lvl) => { lvl.videoMode = true; });
        if (els.videoModeToggle && !els.videoModeToggle.checked) {
            els.videoModeToggle.checked = true;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        }
        startVideoFlow();
        setTimeout(() => {
            renderLandingTitleVoiceControls();
        }, 0);
    };

    /* Record Video: records once in English, then once in Spanish — both saved under
       Ready videos/<language>/<saved-setting>.<ext>. Stays fullscreen between phases
       so the browser doesn't need a fresh user gesture to re-enter fullscreen. */
    if (els.recordVideoBtn) {
        els.recordVideoBtn.onclick = async () => {
            if (appState.doubleRecording) return; // already running; ignore duplicate clicks
            if (appState.isVideoPlaying) {
                startVideoFlow(); // toggles to stop (also tears down recording)
                return;
            }
            if (isProdMode()) {
                const result = await runProdValidation();
                if (!result.allPassed) {
                    showValidationModal(result);
                    return;
                }
            }
            const savedName = (getActiveScriptName() || "").trim();
            if (!savedName) {
                alert("Load a saved setting first — the OBS file is named after it.");
                return;
            }

            /* Pick the random ending ONCE for the whole double-record, so phase 1
               (English) and phase 2 (Spanish) end with the same chosen type. */
            resetRandomEndingType();

            try {
                // ── PHASE 1: English ──
                appState.doubleRecording = { phase: 1, savedName };
                if (getCurrentLanguage() !== "english") {
                    setCurrentLanguage("english");
                    await brake(RECORD_LANG_BRAKE_MS);
                }
                const ok1 = await runRecordingPhase(savedName, "english");
                if (!ok1) return;

                // ── Brake between phases (fullscreen stays on) ──
                await brake(RECORD_BETWEEN_PHASES_MS);

                // ── PHASE 2: Spanish ──
                appState.doubleRecording = { phase: 2, savedName };
                setCurrentLanguage("spanish");
                await brake(RECORD_LANG_BRAKE_MS);
                await runRecordingPhase(savedName, "spanish");
            } finally {
                appState.doubleRecording = null;
            }
        };
    }
    els.swapClose.onclick = () => els.swapModal.hidden = true;

    els.swapSearch.oninput = () => {
        refreshSwapPlayerListFromSearch();
    };

    if (els.swapSearchAll) {
        els.swapSearchAll.onclick = () => applySwapSearchAllNationality();
    }

    if (els.swapLogoClose && els.swapLogoModal) {
        els.swapLogoClose.onclick = () => {
            els.swapLogoModal.hidden = true;
            appState.swapLogoPickContext = null;
        };
    }
    if (els.swapLogoSearch) {
        els.swapLogoSearch.oninput = () => refreshSwapLogoListFromSearch();
    }
    if (els.swapLogoReset) {
        els.swapLogoReset.onclick = () => {
            const ctx = appState.swapLogoPickContext;
            const st = getState();
            if (ctx?.kind === "slot") {
                const k = String(ctx.slotIndex);
                if (st.slotClubCrestOverrideRelPathBySlot) {
                    delete st.slotClubCrestOverrideRelPathBySlot[k];
                }
                els.swapLogoModal.hidden = true;
                appState.swapLogoPickContext = null;
                renderPitch();
                return;
            }
            st.headerLogoOverrideRelPath = null;
            if (els.swapLogoModal) els.swapLogoModal.hidden = true;
            appState.swapLogoPickContext = null;
            renderHeader();
        };
    }

    // Load indexes
    const [idx, photos, flags] = await Promise.all([
        fetchJsonSessionCached(".Storage/data/teams-index.json"),
        fetchJsonSessionCached(".Storage/data/player-images.json", { club: {}, nationality: {} }),
        fetchJsonSessionCached(".Storage/data/country-to-flagcode.json", { codes: {} }),
    ]);
    appState.teamsIndex = idx;
    appState.playerImages = migratePlayerImages(photos);
    appState.flagcodes = flags.codes || {};

    {
      const quizIdx = appState.currentLevelIndex;
      if (
        quizIdx > 1 &&
        quizIdx < appState.totalLevelsCount &&
        getState()?.currentSquad
      ) {
        renderPitch();
        renderHeader();
      }
    }

    const clearCurrentTeamSelection = () => {
        const state = getState();
        if (!state) return;

        state.currentSquad = null;
        state.selectedEntry = null;
        state.searchText = "";
        state.customXi = null;
        state.customNames = {};
        state.headerLogoOverrideRelPath = null;
        state.slotClubCrestOverrideRelPathBySlot = {};

        els.teamSearch.value = "";
        els.teamSearch.classList.remove("team-selected");
        els.teamResults.replaceChildren();
        clearSlotPhotoIndices();

        renderHeader();
        renderPitch();
        refreshSaveTeamButtonUi();
    };

    const handleSearchInput = () => {
        els.teamSearch.classList.remove("team-selected");
        getState().searchText = els.teamSearch.value;
        const results = filterTeams(els.teamSearch.value);
        showResults(results);
    };

    els.teamSearch.onfocus = handleSearchInput;
    els.teamSearch.oninput = handleSearchInput;

    els.squadType.onchange = () => {
        const state = getState();
        state.squadType = els.squadType.value;
        state.currentSquad = null;
        state.selectedEntry = null;
        state.searchText = "";
        state.customXi = null;
        state.customNames = {};
        state.headerLogoOverrideRelPath = null;
        state.slotClubCrestOverrideRelPathBySlot = {};

        els.teamSearch.value = "";
        els.teamSearch.classList.remove("team-selected");

        clearSlotPhotoIndices();
        els.teamResults.replaceChildren();

        renderHeader();
        renderPitch();
        handleSearchInput();
        refreshSaveTeamButtonUi();
    };

    els.formation.onchange = () => {
        const state = getState();
        if (!confirmAndDeleteSaveIfPresent()) {
            // User cancelled — revert the select to the current formation.
            els.formation.value = state.formationId;
            applyCustomSelects();
            return;
        }
        state.formationId = els.formation.value;
        clearSlotPhotoIndices();
        renderPitch();
    };

    els.displayMode.onchange = () => {
        const state = getState();
        state.displayMode = els.displayMode.value;
        clearSlotPhotoIndices();
        renderPitch();
    };
    wireControlPanelToggle(els);

    els.pitchSlots.addEventListener("dblclick", (e) => {
        if (appState.isVideoPlaying) return;
        const slot = e.target.closest(".player-slot");
        if (
            e.target.closest(".slot-name") ||
            e.target.closest(".slot-swap-btn") ||
            e.target.closest(".slot-badge-controls")
        )
            return;
        if (!slot || !els.pitchSlots.contains(slot)) return;
        const i = Number(slot.dataset.slotIndex);
        if (Number.isNaN(i)) return;
        const player = appState.currentXi[i];
        if (!player) return;
        const state = getState();
        if (shouldUseVideoQuestionLayout(state) && !e.target.closest(".slot-back")) return;

        const paths = playerPhotoPaths(player, state.displayMode);
        if (paths.length <= 1) return;
        const next = ((state.slotPhotoIndexBySlot.get(i) ?? 0) + 1) % paths.length;
        state.slotPhotoIndexBySlot.set(i, next);
        const img = shouldUseVideoQuestionLayout(state)
            ? slot.querySelector(".slot-back .slot-avatar .slot-img")
            : slot.querySelector(".slot-avatar .slot-img");
        if (img) {
            applyPlayerPhotoFramingForSourceRelPath(img, paths[next]);
            img.src = projectAssetUrlFresh(paths[next]);
        }
    });

    if (els.headerName) {
        els.headerName.addEventListener("dblclick", async () => {
            if (appState.isVideoPlaying) return;
            if (!isCurrentHeaderTeamNameEditable()) return;
            const state = getState();
            if (!state?.currentSquad) return;
            const quizType = els.inQuizType?.value || "club-by-nat";
            const currentDisplay = resolveHeaderTeamDisplayName(state, quizType);
            const nextName = window.prompt(
                "Enter a custom team name for this nationality quiz.\nLeave empty to reset.",
                currentDisplay || ""
            );
            if (nextName === null) return;
            const cleanNext = String(nextName).trim();
            const cleanCurr = String(currentDisplay || "").trim();
            if (cleanNext === cleanCurr) return;
            const wantSave = await showTeamNameSaveConfirmModal({ oldName: cleanCurr, newName: cleanNext });
            if (wantSave !== true) return;
            renameCurrentClubByNatTeamName(cleanNext);
            if (cleanCurr && cleanNext) {
                try {
                    await fetch("/__team-voice/rename", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ oldName: cleanCurr, newName: cleanNext, quizType }),
                    });
                } catch {}
            }
            /* Refresh the Voice tab so the renamed team shows up (and the correct voice
               file is probed/generated/played for the new display name). */
            renderVoiceTab();
        });
    }

    populateSubTypes();
    renderEndingTypeVoiceStatusPanel();
    void refreshEndingTypeVoiceLabels();
    updateOutroText();
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    updateSetupUI();
    if (didRestoreState) {
        switchLevel(appState.currentLevelIndex);
    }
    updateLanding();
    applyCustomSelects();
    syncVideoModeButton(!!getState()?.videoMode);
    syncApplyVideoAllButton(areAllLevelsVideoModeEnabled());
    initHeaderLogoZoom(clearCurrentTeamSelection);
    document.fonts?.ready?.then(() => scheduleShortsTeamNameFit());
    appState.refreshLandingUi = updateLanding;
}

// START
init();