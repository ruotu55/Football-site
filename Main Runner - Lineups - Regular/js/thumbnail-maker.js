import { appState } from "./state.js";

export function syncThumbnailMakerUiForQuizType() {
    const titleEl = document.getElementById("thumbnail-maker-title");
    const quizType = String(appState.els.inQuizType?.value || "nat-by-club");
    const isClubQuiz = quizType === "club-by-nat";
    if (titleEl) {
        titleEl.textContent = isClubQuiz ? "GUESS THE CLUB" : "GUESS THE NATIONAL TEAM";
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
