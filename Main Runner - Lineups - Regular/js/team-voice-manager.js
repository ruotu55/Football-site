import { appState, getState } from "./state.js";
import { buildTeamNameVoiceSrc, playTeamNameVoiceIfExists } from "./audio.js";
import { projectAssetUrl } from "./paths.js";

const FIXED_VOICE = "en-US-AndrewNeural";

const VOICE_STATUS_ENDPOINT = "__team-voice/status";
const VOICE_GENERATE_ENDPOINT = "__team-voice/generate";
const VOICE_DELETE_ENDPOINT = "__team-voice/delete";

const uiState = {
  initialized: false,
  busy: false,
  teamName: "",
  quizType: "nat-by-club",
  exists: false,
  lastStatusKey: "",
};

function normalizeTeamName(name) {
  return String(name || "").trim();
}

function normalizeQuizType(quizType) {
  return quizType === "club-by-nat" ? "club-by-nat" : "nat-by-club";
}

function endpointUrl(relPath) {
  return projectAssetUrl(relPath);
}

function setBusy(nextBusy, playLabel = "Vol") {
  uiState.busy = !!nextBusy;
  const { teamVoicePlay, teamVoiceDelete } = appState.els;
  if (teamVoicePlay) {
    teamVoicePlay.disabled = uiState.busy;
    teamVoicePlay.textContent = uiState.busy ? "..." : playLabel;
  }
  if (teamVoiceDelete) {
    teamVoiceDelete.disabled = uiState.busy || !uiState.exists;
  }
}

function setControlsVisibility(visible) {
  if (!appState.els.teamVoiceControls) return;
  const hasSelectedTeam = !!getState()?.currentSquad;
  appState.els.teamVoiceControls.hidden = !(visible && hasSelectedTeam);
}

async function refreshVoiceStatus() {
  const teamName = normalizeTeamName(uiState.teamName);
  if (!teamName) {
    uiState.exists = false;
    setBusy(uiState.busy, uiState.busy ? "..." : "Vol");
    return;
  }
  const params = new URLSearchParams({
    name: teamName,
    quizType: normalizeQuizType(uiState.quizType),
  });
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
  playTeamNameVoiceIfExists(uiState.teamName, uiState.quizType, 0);
}

async function generateVoice() {
  const body = {
    name: uiState.teamName,
    quizType: normalizeQuizType(uiState.quizType),
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
  const teamName = normalizeTeamName(uiState.teamName);
  if (!teamName) return;
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
    alert(`Could not generate team voice.\n${err instanceof Error ? err.message : String(err)}`);
  }
}

async function deleteCurrentVoice() {
  if (uiState.busy || !uiState.exists) return;
  const teamName = normalizeTeamName(uiState.teamName);
  if (!teamName) return;
  setBusy(true, "...");
  try {
    const res = await fetch(endpointUrl(VOICE_DELETE_ENDPOINT), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: teamName,
        quizType: normalizeQuizType(uiState.quizType),
      }),
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
    alert(`Could not delete generated voice.\n${err instanceof Error ? err.message : String(err)}`);
  }
}

function wireHandlers() {
  const { teamVoicePlay, teamVoiceDelete } = appState.els;
  if (teamVoicePlay) {
    teamVoicePlay.onclick = () => {
      ensureVoiceThenPlay();
    };
  }
  if (teamVoiceDelete) {
    teamVoiceDelete.onclick = () => {
      deleteCurrentVoice();
    };
  }
}

export async function initTeamVoiceManager() {
  if (uiState.initialized) return;
  uiState.initialized = true;
  wireHandlers();
  await refreshVoiceStatus();
}

export function syncTeamVoiceControls(teamName, quizType) {
  const name = normalizeTeamName(teamName);
  uiState.teamName = name;
  uiState.quizType = normalizeQuizType(quizType);
  setControlsVisibility(!!name);
  if (!name) {
    uiState.exists = false;
    setBusy(false);
    return;
  }
  const clipSrc = buildTeamNameVoiceSrc(name, uiState.quizType, ".mp3");
  if (!clipSrc) {
    uiState.exists = false;
    setBusy(false);
    return;
  }
  const key = `${uiState.quizType}::${name}`;
  if (key === uiState.lastStatusKey && !uiState.busy) {
    setBusy(false);
    return;
  }
  uiState.lastStatusKey = key;
  refreshVoiceStatus();
}
