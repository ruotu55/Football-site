import { appState } from "./state.js";
import { buildPlayerNameVoiceSrc, playPlayerNameVoiceIfExists } from "./audio.js";
import { projectAssetUrl } from "./paths.js";

const FIXED_VOICE = "en-US-AndrewNeural";
const VOICE_STATUS_ENDPOINT = "__player-voice/status";
const VOICE_GENERATE_ENDPOINT = "__player-voice/generate";
const VOICE_DELETE_ENDPOINT = "__player-voice/delete";

const uiState = {
  initialized: false,
  busy: false,
  playerName: "",
  exists: false,
  lastStatusKey: "",
};

function normalizePlayerName(name) {
  return String(name || "").trim();
}

function endpointUrl(relPath) {
  return projectAssetUrl(relPath);
}

function setBusy(nextBusy, playLabel = "Vol") {
  uiState.busy = !!nextBusy;
  const { playerVoicePlay, playerVoiceDelete } = appState.els;
  if (playerVoicePlay) {
    playerVoicePlay.disabled = uiState.busy;
    playerVoicePlay.textContent = uiState.busy ? "..." : playLabel;
  }
  if (playerVoiceDelete) {
    playerVoiceDelete.disabled = uiState.busy || !uiState.exists;
  }
}

function setControlsVisibility(visible) {
  if (!appState.els.playerVoiceControls) return;
  appState.els.playerVoiceControls.hidden = !visible;
}

async function refreshVoiceStatus() {
  const playerName = normalizePlayerName(uiState.playerName);
  if (!playerName) {
    uiState.exists = false;
    setBusy(uiState.busy, uiState.busy ? "..." : "Vol");
    return;
  }
  const params = new URLSearchParams({ name: playerName });
  try {
    const res = await fetch(`${endpointUrl(VOICE_STATUS_ENDPOINT)}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      uiState.exists = false;
      setBusy(uiState.busy, uiState.busy ? "..." : "Vol");
      return;
    }
    const body = await res.json();
    uiState.exists = !!body?.exists;
    setBusy(uiState.busy, uiState.busy ? "..." : "Vol");
  } catch {
    uiState.exists = false;
    setBusy(uiState.busy, uiState.busy ? "..." : "Vol");
  }
}

function playExistingVoice() {
  playPlayerNameVoiceIfExists(uiState.playerName, 0);
}

async function generateVoice() {
  const body = {
    name: uiState.playerName,
    voice: FIXED_VOICE,
  };
  const res = await fetch(endpointUrl(VOICE_GENERATE_ENDPOINT), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    const details = payload?.error || `Generation failed (${res.status})`;
    throw new Error(details);
  }
  uiState.exists = true;
  setBusy(false);
  playExistingVoice();
}

async function ensureVoiceThenPlay() {
  if (uiState.busy) return;
  const playerName = normalizePlayerName(uiState.playerName);
  if (!playerName) return;
  setBusy(true, "...");
  try {
    await refreshVoiceStatus();
    if (uiState.exists) {
      playExistingVoice();
      setBusy(false);
      return;
    }
    await generateVoice();
  } catch (err) {
    setBusy(false);
    alert(`Could not generate player voice.\n${err instanceof Error ? err.message : String(err)}`);
  }
}

async function deleteCurrentVoice() {
  if (uiState.busy || !uiState.exists) return;
  const playerName = normalizePlayerName(uiState.playerName);
  if (!playerName) return;
  setBusy(true, "...");
  try {
    const res = await fetch(endpointUrl(VOICE_DELETE_ENDPOINT), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: playerName }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) {
      const details = payload?.error || `Delete failed (${res.status})`;
      throw new Error(details);
    }
    uiState.exists = false;
    setBusy(false);
  } catch (err) {
    setBusy(false);
    alert(`Could not delete player voice.\n${err instanceof Error ? err.message : String(err)}`);
  }
}

function wireHandlers() {
  const { playerVoicePlay, playerVoiceDelete } = appState.els;
  if (playerVoicePlay) {
    playerVoicePlay.onclick = () => {
      ensureVoiceThenPlay();
    };
  }
  if (playerVoiceDelete) {
    playerVoiceDelete.onclick = () => {
      deleteCurrentVoice();
    };
  }
}

export async function initPlayerVoiceManager() {
  if (uiState.initialized) return;
  uiState.initialized = true;
  wireHandlers();
  await refreshVoiceStatus();
}

export function syncPlayerVoiceControls(playerName) {
  const name = normalizePlayerName(playerName);
  uiState.playerName = name;
  setControlsVisibility(!!name);
  if (!name) {
    uiState.exists = false;
    setBusy(false);
    return;
  }
  const clipSrc = buildPlayerNameVoiceSrc(name, ".mp3");
  if (!clipSrc) {
    uiState.exists = false;
    setBusy(false);
    return;
  }
  if (name === uiState.lastStatusKey && !uiState.busy) {
    setBusy(false);
    return;
  }
  uiState.lastStatusKey = name;
  refreshVoiceStatus();
}
