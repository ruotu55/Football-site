import { appState, getState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

/** Loose crests: drop a PNG named exactly like the squad JSON `club` string (e.g. Atlético de Madrid.png). */
const TEAMS_IMAGES_OTHER_TEAMS_DIR = "Teams Images/(1) Other Teams";
const NATIONAL_TEAM_LOGOS_DIR = "National Team Logos";

const NATIONALITY_TO_TEAM_LOGO_NAME = {
  american: "United States",
  bosnian: "Bosnia and Herzegovina",
  "bosnia herzegovina": "Bosnia and Herzegovina",
  "bosnia-herzegovina": "Bosnia and Herzegovina",
  czechia: "Czech Republic",
  czech: "Czech Republic",
  english: "England",
  ivorian: "Ivory Coast",
  "cote d ivoire": "Ivory Coast",
  mexican: "Mexico",
  portuguese: "Portugal",
  saudi: "Saudi Arabia",
  scottish: "Scotland",
  turkiye: "Turkey",
  turkish: "Turkey",
  usa: "United States",
  "u s a": "United States",
  "u s": "United States",
  uruguayan: "Uruguay",
};

function normalizeNationalityLogoKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toTitleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getNationalTeamLogoLoadUrls(teamNameRaw) {
  const natLabel = String(teamNameRaw || "").trim();
  const normalizedKey = normalizeNationalityLogoKey(natLabel);
  const aliased = NATIONALITY_TO_TEAM_LOGO_NAME[normalizedKey] || "";
  const normalizedTitle = toTitleCaseWords(normalizedKey);
  const names = [];
  const pushUniqueName = (name) => {
    const t = String(name || "").trim();
    if (t && !names.includes(t)) names.push(t);
  };
  pushUniqueName(natLabel);
  pushUniqueName(aliased);
  pushUniqueName(normalizedTitle);
  return names.map((name) => projectAssetUrl(`${NATIONAL_TEAM_LOGOS_DIR}/${name}.png`));
}

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

/**
 * Fallback crest path when the canonical country/league file is missing or the name does not match the index.
 * File name must match the player JSON `club` field (including accents/spacing).
 */
export function getClubLogoOtherTeamsUrl(clubField) {
  if (clubField == null || typeof clubField !== "string") return null;
  const t = clubField.trim();
  if (!t || t.includes("/") || t.includes("\\") || t.includes("..")) return null;
  return projectAssetUrl(`${TEAMS_IMAGES_OTHER_TEAMS_DIR}/${t}.png`);
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

/** Relative repo path for a PNG in `(1) Other Teams` (basename without `.png`). */
export function getClubLogoOtherTeamsRelPath(clubField) {
  if (clubField == null || typeof clubField !== "string") return null;
  const t = clubField.trim();
  if (!t || t.includes("/") || t.includes("\\") || t.includes("..")) return null;
  return `${TEAMS_IMAGES_OTHER_TEAMS_DIR}/${t}.png`;
}

/**
 * Header crest load order: optional per-level override (`headerLogoOverrideRelPath`), then league `imagePath`,
 * then automatic Other Teams fallback for club squads.
 */
export function getHeaderLogoUrlChain(state, squad, squadType, selectedEntryName, quizType = "nat-by-club") {
  const { primaryUrl, secondaryUrl } = getClubSquadHeaderLogoLoadUrls(squad, squadType, selectedEntryName);
  const chain = [];
  const ov = state?.headerLogoOverrideRelPath;
  if (ov && typeof ov === "string") {
    const t = ov.trim();
    if (t && !t.includes("..") && !t.includes("\\")) {
      chain.push(projectAssetUrl(t));
    }
  }
  const pushUnique = (u) => {
    if (u && !chain.includes(u)) chain.push(u);
  };
  if (quizType === "nat-by-club" && squadType === "national") {
    const teamName = String(squad?.name || selectedEntryName || "").trim();
    getNationalTeamLogoLoadUrls(teamName).forEach(pushUnique);
    return chain;
  }
  pushUnique(primaryUrl);
  pushUnique(secondaryUrl);
  return chain;
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

function sanitizePhotoKeyPart(raw) {
  return String(raw || "")
    .trim()
    .replace(/\//g, "")
    .replace(/\\/g, "")
    .replace(/\.\./g, "")
    .replace(/[<>:"|?*]/g, "")
    .replace(/[. ]+$/g, "");
}

function photoKeyPartVariants(raw) {
  const base = String(raw || "").trim();
  if (!base) return [];
  const out = [base];
  const sanitized = sanitizePhotoKeyPart(base);
  if (sanitized && sanitized !== base) out.push(sanitized);
  return out;
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
    const country = state.selectedEntry?.country || "";
    const league = state.selectedEntry?.league || "";
    const squadNameVariants = photoKeyPartVariants(state.currentSquad?.name);
    const playerNameVariants = photoKeyPartVariants(name);
    for (const squadName of squadNameVariants) {
      for (const playerName of playerNameVariants) {
        const k = `${country}|${league}|${squadName}|${playerName}`;
        if (appState.playerImages.club?.[k]) {
          appState.playerImages.club[k].forEach((p) => paths.add(p));
        }
      }
    }
  } else if (state.squadType === "nationality") {
    const k = nationalityPhotoKey(state.selectedEntry, name);
    if (k && appState.playerImages.nationality?.[k]) {
      appState.playerImages.nationality[k].forEach((p) => paths.add(p));
    }
  }

  // 2. Scan ALL club folders for this player's specific club (as noted in their JSON profile)
  if (player.club && appState.playerImages.club) {
    const clubVariants = photoKeyPartVariants(player.club);
    const playerNameVariants = photoKeyPartVariants(name);
    for (const key in appState.playerImages.club) {
      if (
        clubVariants.some((clubName) =>
          playerNameVariants.some((playerName) =>
            key.endsWith(`|${clubName}|${playerName}`)
          )
        )
      ) {
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