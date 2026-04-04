import { appState, getState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

/** Loose crests: PNG named like the JSON / UI club string (e.g. Atlético de Madrid.png). */
const TEAMS_IMAGES_OTHER_TEAMS_DIR = "Teams Images/(1) Other Teams";

export function generateMonogram(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getClubLogoUrl(clubName) {
  const { teamsIndex } = appState;
  if (!teamsIndex || !teamsIndex.clubs) return null;
  const clubEntry = teamsIndex.clubs.find((c) => c.name === clubName);
  if (clubEntry && clubEntry.country && clubEntry.league) {
    return projectAssetUrl(`Teams Images/${clubEntry.country}/${clubEntry.league}/${clubEntry.name}.png`);
  }
  return null;
}

export function getClubLogoOtherTeamsRelPath(clubField) {
  if (clubField == null || typeof clubField !== "string") return null;
  const t = clubField.trim();
  if (!t || t.includes("/") || t.includes("\\") || t.includes("..")) return null;
  return `${TEAMS_IMAGES_OTHER_TEAMS_DIR}/${t}.png`;
}

/**
 * Fallback when the canonical country/league crest is missing or the index has no league row.
 * Filename must match the club string you use in the UI / history (including accents).
 */
export function getClubLogoOtherTeamsUrl(clubField) {
  const rel = getClubLogoOtherTeamsRelPath(clubField);
  return rel ? projectAssetUrl(rel) : null;
}

/**
 * Header crest for a loaded squad: canonical `imagePath` (league folder) first, then `(1) Other Teams/<name>.png`
 * if that URL differs (club squads only). National squads use `imagePath` only.
 */
export function getClubSquadHeaderLogoLoadUrls(squad, squadType, selectedEntryName) {
  const primaryUrl = squad?.imagePath ? projectAssetUrl(squad.imagePath) : null;
  if (squadType !== "club") {
    return { primaryUrl, secondaryUrl: null };
  }
  const nameForOt = String(squad?.name || selectedEntryName || "").trim();
  const otherTeamsUrl = nameForOt ? getClubLogoOtherTeamsUrl(nameForOt) : null;
  const secondaryUrl =
    otherTeamsUrl && otherTeamsUrl !== primaryUrl ? otherTeamsUrl : null;
  return { primaryUrl, secondaryUrl };
}

/** Pitch uses rotateX(~38deg); smaller y = farther away — scale so portrait size matches FUT.GG-style depth */
export function slotPerspectiveScale(yPercent) {
  const t = 1 - Math.min(100, Math.max(0, yPercent)) / 100;
  return 1 + t * 0.38;
}

export function clubPhotoKey(entry, squad, playerName) {
  if (!entry?.country || !entry?.league || !squad?.name) return null;
  return `${entry.country}|${entry.league}|${squad.name}|${playerName}`;
}

export function nationalityPhotoKey(entry, playerName) {
  if (!entry?.region || !entry?.name) return null;
  return `${entry.region}|${entry.name}|${playerName}`;
}

/** Last name / final segment — matches typical broadcast lineup labels */
export function pitchLabelFromPlayerName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts[parts.length - 1].toLocaleUpperCase();
}

export function playerPhotoPaths(player, displayMode) {
  const state = getState();
  if (!player || !state.selectedEntry) return [];
  const name = player.name || "";
  
  const paths = new Set();

  // 1. Direct key match based on the CURRENT squad we are looking at
  if (state.squadType === "club") {
    const k = clubPhotoKey(state.selectedEntry, state.currentSquad, name);
    if (k && appState.playerImages.club?.[k]) {
      appState.playerImages.club[k].forEach((p) => paths.add(p));
    }
  } else if (state.squadType === "nationality") {
    const k = nationalityPhotoKey(state.selectedEntry, name);
    if (k && appState.playerImages.nationality?.[k]) {
      appState.playerImages.nationality[k].forEach((p) => paths.add(p));
    }
  }

  // 2. Scan ALL club folders for this player's specific club (as noted in their JSON profile)
  if (player.club && appState.playerImages.club) {
    const clubSuffix = `|${player.club}|${name}`;
    for (const key in appState.playerImages.club) {
      if (key.endsWith(clubSuffix)) {
        appState.playerImages.club[key].forEach((p) => paths.add(p));
      }
    }
  }

  // 3. Scan ALL nationality folders for this player's specific nationality (as noted in their JSON profile)
  if (player.nationality && appState.playerImages.nationality) {
    const natSuffix = `|${player.nationality}|${name}`;
    for (const key in appState.playerImages.nationality) {
      if (key.endsWith(natSuffix)) {
        appState.playerImages.nationality[key].forEach((p) => paths.add(p));
      }
    }
  }

  return Array.from(paths);
}