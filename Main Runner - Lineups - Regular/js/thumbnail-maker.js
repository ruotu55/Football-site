import { projectAssetUrl } from "./paths.js";
import { appState } from "./state.js";

export function syncThumbnailMakerSpecificTitle() {
    const wrap = document.getElementById("thumbnail-maker-specific-title");
    if (!wrap) return;

    const els = appState.els;
    const toggle =
        els?.inSpecificTitleToggle ?? document.getElementById("in-specific-title-toggle");
    const show = !!toggle?.checked;
    wrap.hidden = !show;
    if (!show) return;

    const textEl = document.getElementById("thumbnail-maker-specific-text");
    const iconImg = document.getElementById("thumbnail-maker-specific-icon-img");
    const iconEmoji = document.getElementById("thumbnail-maker-specific-icon-emoji");
    const textInput =
        els?.inSpecificTitleText ?? document.getElementById("in-specific-title-text");
    const iconSelect =
        els?.inSpecificTitleIcon ?? document.getElementById("in-specific-title-icon");

    if (textEl && textInput) {
        textEl.textContent = textInput.value;
    }

    const iconVal = iconSelect?.value ?? "";
    if (!iconImg || !iconEmoji) return;

    if (iconVal.startsWith("icons/")) {
        iconImg.src = projectAssetUrl(iconVal);
        iconImg.hidden = false;
        iconEmoji.hidden = true;
    } else {
        iconEmoji.textContent = iconVal || "🏆";
        iconEmoji.hidden = false;
        iconImg.hidden = true;
    }
}

export function syncThumbnailMakerUiForQuizType() {
    const titleEl = document.getElementById("thumbnail-maker-title");
    if (titleEl) {
        titleEl.textContent = "GUESS THE NATIONAL TEAM";
    }
}

export function initThumbnailMaker({ switchLevel }) {
    const thumbnailMakerSwitchLevel = switchLevel;
    const { els } = appState;
    const openBtn = els.openThumbnailMakerBtn;

    openBtn?.addEventListener("click", () => {
        if (typeof thumbnailMakerSwitchLevel !== "function") return;
        thumbnailMakerSwitchLevel(appState.totalLevelsCount + 1);
    });
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (!document.body.classList.contains("thumbnail-maker-active")) return;
        if (typeof thumbnailMakerSwitchLevel !== "function") return;
        thumbnailMakerSwitchLevel(appState.totalLevelsCount);
    });

    syncThumbnailMakerUiForQuizType();
}
