/**
 * Shared PROD checks for Photos / Logos / Flags — verifies files load, not only JSON paths.
 */
import { probeAssetUrl, probeAssetUrlChain } from "./asset-probe.js";
import {
  normalizeLegacyTeamImageRelPath,
  stripLogoOverrideRelPath,
} from "./team-image-paths.js";

const OTHER_TEAMS_DIR = "Images/Teams/(1) Other Teams";

/** Fallback when a runner has no photo-helpers#getHeaderLogoUrlChain. */
export function buildDefaultHeaderLogoUrlChain(projectAssetUrl) {
  return (state, squad, squadType, selectedEntryName, _quizType) => {
    const chain = [];
    const pushUnique = (u) => {
      if (u && !chain.includes(u)) chain.push(u);
    };
    const overrideRel = stripLogoOverrideRelPath(state?.headerLogoOverrideRelPath);
    if (overrideRel) pushUnique(projectAssetUrl(overrideRel));
    const primaryRel = squad?.imagePath
      ? normalizeLegacyTeamImageRelPath(squad.imagePath)
      : "";
    if (primaryRel) pushUnique(projectAssetUrl(primaryRel));
    if (squadType === "club") {
      const nameForOt = String(squad?.name || selectedEntryName || "").trim();
      if (nameForOt) {
        pushUnique(projectAssetUrl(`${OTHER_TEAMS_DIR}/${nameForOt}.png`));
      }
    }
    return chain;
  };
}

function sanitizeName(raw) {
  return String(raw || "")
    .trim()
    .replace(/\//g, "")
    .replace(/\\/g, "")
    .replace(/\.\./g, "")
    .replace(/[<>:"|?*]/g, "")
    .replace(/[. ]+$/g, "");
}

function nameVariants(raw) {
  const base = String(raw || "").trim();
  if (!base) return [];
  const s = sanitizeName(base);
  return s && s !== base ? [base, s] : [base];
}

/** Relative paths from player-images index (first match only). */
export function collectPlayerPhotoRelPaths(player, lvl, playerImages) {
  if (!player || !playerImages) return [];
  const name = player.name || "";
  if (!name) return [];

  const paths = [];
  const pushPaths = (list) => {
    if (!Array.isArray(list)) return;
    for (const p of list) {
      if (typeof p === "string" && p.length) paths.push(p);
    }
  };

  if (lvl.squadType === "club" && lvl.selectedEntry && playerImages.club) {
    const country = lvl.selectedEntry.country || "";
    const league = lvl.selectedEntry.league || "";
    const squadNames = nameVariants(lvl.currentSquad?.name);
    const playerNames = nameVariants(name);
    for (const sq of squadNames) {
      for (const pn of playerNames) {
        pushPaths(playerImages.club[`${country}|${league}|${sq}|${pn}`]);
      }
    }
  }

  if (lvl.squadType === "national" && lvl.selectedEntry && playerImages.nationality) {
    const region = lvl.selectedEntry.region || "";
    const entryName = lvl.selectedEntry.name || "";
    pushPaths(playerImages.nationality[`${region}|${entryName}|${name}`]);
  }

  if (player.club && playerImages.club) {
    const clubVariants = nameVariants(player.club);
    const playerNames = nameVariants(name);
    for (const key in playerImages.club) {
      if (clubVariants.some((c) => playerNames.some((p) => key.endsWith(`|${c}|${p}`)))) {
        pushPaths(playerImages.club[key]);
      }
    }
  }

  if (player.nationality && playerImages.nationality) {
    const natSuffix = `|${player.nationality}|${name}`;
    for (const key in playerImages.nationality) {
      if (key.endsWith(natSuffix)) pushPaths(playerImages.nationality[key]);
    }
  }

  return paths;
}

export function playerHasPhotosInIndex(player, lvl, playerImages) {
  return collectPlayerPhotoRelPaths(player, lvl, playerImages).length > 0;
}

/**
 * @param {object} opts
 * @param {Array<{lvl: object, index: number}>} opts.questionLevels
 * @param {string} opts.quizType
 * @param {(index: number, lvl: object) => string} opts.getLevelLabel
 * @param {(lvl: object, quizType: string) => string} opts.resolveLevelTeamName
 * @param {typeof import("../../1_Guess The Football Team Name - Main Runner - Regular/js/formations.js").FORMATIONS} opts.FORMATIONS
 * @param {Function} opts.pickStartingXI
 * @param {object} opts.appState
 * @param {(rel: string) => string} opts.projectAssetUrl
 * @param {(state: object, squad: object, squadType: string, selectedEntryName: string, quizType: string) => string[]} opts.getHeaderLogoUrlChain
 * @param {(player: object, lvl: object) => string} [opts.resolvePlayerNationalityLabel]
 * @param {(clubName: string) => string|null} [opts.getClubLogoUrl]
 * @param {(clubName: string) => string|null} [opts.getClubLogoOtherTeamsUrl]
 * @param {(countryLabel: string, flagcodes: object) => string|null} [opts.getTeamHeaderFlagUrl]
 * @param {string} [opts.sectionName]
 */
export async function validateTeamAssetsAsync(opts) {
  const {
    questionLevels,
    quizType,
    getLevelLabel,
    resolveLevelTeamName,
    FORMATIONS,
    pickStartingXI,
    appState,
    projectAssetUrl,
    getHeaderLogoUrlChain,
    resolvePlayerNationalityLabel,
    getClubLogoUrl,
    getClubLogoOtherTeamsUrl,
    getTeamHeaderFlagUrl,
    sectionName = "Photos / Logos / Flags",
  } = opts;

  const failures = [];
  const checkFlags = Boolean(
    resolvePlayerNationalityLabel && getClubLogoUrl && getClubLogoOtherTeamsUrl
  );

  for (const { lvl, index } of questionLevels) {
    if (!lvl.currentSquad) continue;
    const label = getLevelLabel(index, lvl);
    const teamName = resolveLevelTeamName(lvl, quizType);
    const missing = [];

    const resolveLogoChain =
      getHeaderLogoUrlChain || buildDefaultHeaderLogoUrlChain(projectAssetUrl);
    const logoUrls = resolveLogoChain(
      lvl,
      lvl.currentSquad,
      lvl.squadType,
      lvl.selectedEntry?.name,
      quizType
    );
    if (!logoUrls.length) {
      missing.push("logo (no path)");
    } else if (!(await probeAssetUrlChain(logoUrls))) {
      missing.push("logo (file missing or failed to load)");
    }

    const formation = FORMATIONS.find((f) => f.id === lvl.formationId) || FORMATIONS[0];
    const xi = lvl.customXi || (formation ? pickStartingXI(formation, lvl.currentSquad) : []);
    if (xi && xi.length > 0) {
      for (let si = 0; si < xi.length; si++) {
        const player = xi[si];
        if (!player) {
          missing.push(`slot ${si + 1}: no player`);
          continue;
        }
        const pName = player.name || `slot ${si + 1}`;
        const photoPaths = collectPlayerPhotoRelPaths(player, lvl, appState.playerImages);
        if (!photoPaths.length) {
          missing.push(`${pName}: no photo`);
        } else {
          const photoUrls = photoPaths.map((rel) => projectAssetUrl(rel));
          if (!(await probeAssetUrlChain(photoUrls))) {
            missing.push(`${pName}: photo file missing or failed to load`);
          }
        }

        if (!checkFlags) continue;

        if (lvl.squadType === "club") {
          const natLabel = resolvePlayerNationalityLabel(player.nationality);
          const code = natLabel ? appState.flagcodes?.[natLabel] : null;
          if (!code) {
            const detail = natLabel
              ? `unresolved nationality "${natLabel}"`
              : "missing nationality";
            missing.push(`${pName}: no country flag (${detail})`);
          } else if (getTeamHeaderFlagUrl) {
            const flagUrl = getTeamHeaderFlagUrl(natLabel, appState.flagcodes);
            if (!flagUrl || !(await probeAssetUrl(flagUrl))) {
              missing.push(`${pName}: country flag failed to load`);
            }
          }
        } else if (lvl.squadType === "national") {
          const clubName = String(player?.club || "").trim();
          if (!clubName) {
            missing.push(`${pName}: missing club`);
          } else {
            const crestUrls = [getClubLogoUrl(clubName), getClubLogoOtherTeamsUrl(clubName)].filter(
              Boolean
            );
            if (!crestUrls.length) {
              missing.push(`${pName}: no club logo path for "${clubName}"`);
            } else if (!(await probeAssetUrlChain(crestUrls))) {
              missing.push(`${pName}: club logo missing for "${clubName}"`);
            }
          }
        }
      }
    }

    if (missing.length > 0) {
      failures.push(`${label} (${teamName}): ${missing.join(", ")}`);
    }
  }

  return {
    sectionName,
    passed: failures.length === 0,
    failures,
  };
}
