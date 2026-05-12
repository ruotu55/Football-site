import { appState } from "./state.js";
import {
  buildVideoExportFilename,
  getSavePickerTiming,
  sanitizeExportFps,
} from "./video-export-utils.js";

const FPS_STORAGE_KEY = "lineups:video-export-fps";

let exportRunning = false;

function setStatus(message) {
  const el = appState.els.exportStatus;
  if (!el) return;
  const text = String(message || "").trim();
  el.textContent = text;
  el.hidden = !text;
}

function selectedFps() {
  return sanitizeExportFps(appState.els.exportFpsSelect?.value || 60);
}

function firstLoadedTeamName() {
  const firstLevel = appState.levelsData.find((level, index) => (
    index > 1 &&
    index < appState.totalLevelsCount &&
    (level?.currentSquad || level?.selectedEntry || level?.teamName || level?.clubName)
  ));
  return (
    firstLevel?.teamName ||
    firstLevel?.clubName ||
    firstLevel?.selectedEntry?.name ||
    firstLevel?.selectedEntry?.club ||
    firstLevel?.currentSquad?.name ||
    firstLevel?.currentSquad?.teamName ||
    firstLevel?.currentSquad?.clubName ||
    "Football Team"
  );
}

function serializeLevelForExport(level) {
  if (!level || typeof level !== "object") return null;
  const rawMap = level.slotPhotoIndexBySlot;
  return {
    ...level,
    slotPhotoIndexBySlotEntries: rawMap instanceof Map ? Array.from(rawMap.entries()) : [],
  };
}

function createVideoExportSnapshot() {
  const levels = Array.isArray(appState.levelsData)
    ? appState.levelsData.map(serializeLevelForExport).filter(Boolean)
    : [];
  if (levels.length === 0) {
    throw new Error("No levels are loaded. Load your quiz levels before exporting.");
  }
  const stateTotal = Number(appState.totalLevelsCount);
  const derivedTotal = levels.length > 0 ? levels.length - 1 : NaN;
  const totalLevelsCount = Number.isFinite(stateTotal)
    ? Math.max(stateTotal, derivedTotal)
    : derivedTotal;
  if (!Number.isFinite(totalLevelsCount) || totalLevelsCount < 3) {
    throw new Error(`Invalid total level count: ${appState.totalLevelsCount}`);
  }
  const currentLevelIndex = Number.isFinite(Number(appState.currentLevelIndex))
    ? Math.floor(Number(appState.currentLevelIndex))
    : 1;
  const els = appState.els || {};
  return {
    version: 1,
    totalLevelsCount,
    currentLevelIndex,
    levelsData: levels,
    controls: {
      quizLevelsInput: els.quizLevelsInput?.value ?? null,
      inEasy: els.inEasy?.value ?? null,
      inMedium: els.inMedium?.value ?? null,
      inHard: els.inHard?.value ?? null,
      inImpossible: els.inImpossible?.value ?? null,
      inSpecificTitleToggle: !!els.inSpecificTitleToggle?.checked,
      inSpecificTitleText: els.inSpecificTitleText?.value ?? null,
      inSpecificTitleIcon: els.inSpecificTitleIcon?.value ?? null,
      shortsModeToggle: false,
      inQuizType: els.inQuizType?.value ?? null,
      inEndingType: els.inEndingType?.value ?? null,
      squadType: els.squadType?.value ?? null,
      displayMode: els.displayMode?.value ?? null,
      formation: els.formation?.value ?? null,
      videoModeToggle: !!els.videoModeToggle?.checked,
      searchMode: els.searchMode?.value ?? null,
      teamSearch: els.teamSearch?.value ?? null,
    },
  };
}

async function pickSaveTarget(filename, format) {
  if (!window.showSaveFilePicker) return null;
  const mimeType = format.extension === "mp4" ? "video/mp4" : "video/webm";
  const description = format.extension === "mp4" ? "MP4 video" : "WebM video";
  return window.showSaveFilePicker({
    suggestedName: filename,
    types: [{
      description,
      accept: { [mimeType]: [`.${format.extension}`] },
    }],
  });
}

async function saveBlob(blob, filename, fileHandle) {
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function initVideoExport() {
  const fpsSelect = appState.els.exportFpsSelect;
  if (fpsSelect) {
    const stored = sanitizeExportFps(localStorage.getItem(FPS_STORAGE_KEY) || 60);
    fpsSelect.value = String(stored);
    fpsSelect.addEventListener("change", () => {
      const fps = selectedFps();
      fpsSelect.value = String(fps);
      localStorage.setItem(FPS_STORAGE_KEY, String(fps));
    });
  }
}

export async function startVideoExport() {
  if (exportRunning || appState.isVideoPlaying) return;
  const fps = selectedFps();
  const format = { extension: "mp4", mimeType: "video/mp4" };
  const filename = buildVideoExportFilename(firstLoadedTeamName(), fps, new Date(), format.extension);
  let fileHandle = null;
  if (getSavePickerTiming(!!window.showSaveFilePicker) === "before-recording") {
    try {
      setStatus("Choose where to save the MP4 file...");
      fileHandle = await pickSaveTarget(filename, format);
    } catch (err) {
      if (err?.name === "AbortError") {
        setStatus("");
        return;
      }
      throw err;
    }
  }
  exportRunning = true;
  if (appState.els.importVideoBtn) appState.els.importVideoBtn.disabled = true;
  setStatus(`Rendering offline MP4 at ${fps} FPS. This can take a while...`);

  try {
    const snapshot = JSON.stringify(createVideoExportSnapshot());
    const response = await fetch("/__video-export/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fps, snapshot }),
    });
    if (!response.ok) {
      let message = `Offline renderer failed (${response.status}).`;
      try {
        const errorPayload = await response.json();
        if (errorPayload?.error) message = errorPayload.error;
      } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error("The offline renderer returned an empty MP4 file.");
    }
    if (!fileHandle) {
      try {
        setStatus("Recording complete. Choose where to save the MP4 file...");
        fileHandle = await pickSaveTarget(filename, format);
      } catch (err) {
        if (err?.name === "AbortError") {
          setStatus("Export finished, but saving was cancelled.");
          return;
        }
        throw err;
      }
    }
    setStatus("Saving MP4 file...");
    await saveBlob(blob, filename, fileHandle);
    setStatus(`Saved ${filename}`);
  } catch (err) {
    console.error("[video-export]", err);
    setStatus(`Import Video failed: ${err?.message || err}`);
  } finally {
    if (appState.els.importVideoBtn) appState.els.importVideoBtn.disabled = false;
    exportRunning = false;
  }
}
