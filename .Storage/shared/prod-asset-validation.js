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

  const checkFlags = Boolean(
    resolvePlayerNationalityLabel && getClubLogoUrl && getClubLogoOtherTeamsUrl
  );
  const resolveLogoChain =
    getHeaderLogoUrlChain || buildDefaultHeaderLogoUrlChain(projectAssetUrl);

  // Probe one starting-XI slot. Returns an array of "missing" strings (its own
  // slot order is preserved by the caller). Network probes inside run as they
  // hit await; running slots + levels concurrently lets the browser use all of
  // its connections instead of sitting idle between sequential HEAD requests.
  const probeSlot = async (lvl, player, si) => {
    const out = [];
    if (!player) {
      out.push(`slot ${si + 1}: no player`);
      return out;
    }
    const pName = player.name || `slot ${si + 1}`;
    const photoPaths = collectPlayerPhotoRelPaths(player, lvl, appState.playerImages);
    if (!photoPaths.length) {
      out.push(`${pName}: no photo`);
    } else {
      const photoUrls = photoPaths.map((rel) => projectAssetUrl(rel));
      if (!(await probeAssetUrlChain(photoUrls))) {
        out.push(`${pName}: photo file missing or failed to load`);
      }
    }

    if (!checkFlags) return out;

    if (lvl.squadType === "club") {
      const natLabel = resolvePlayerNationalityLabel(player.nationality);
      const code = natLabel ? appState.flagcodes?.[natLabel] : null;
      if (!code) {
        const detail = natLabel ? `unresolved nationality "${natLabel}"` : "missing nationality";
        out.push(`${pName}: no country flag (${detail})`);
      } else if (getTeamHeaderFlagUrl) {
        const flagUrl = getTeamHeaderFlagUrl(natLabel, appState.flagcodes);
        if (!flagUrl || !(await probeAssetUrl(flagUrl))) {
          out.push(`${pName}: country flag failed to load`);
        }
      }
    } else if (lvl.squadType === "national") {
      const clubName = String(player?.club || "").trim();
      if (!clubName) {
        out.push(`${pName}: missing club`);
      } else {
        const crestUrls = [getClubLogoUrl(clubName), getClubLogoOtherTeamsUrl(clubName)].filter(Boolean);
        if (!crestUrls.length) {
          out.push(`${pName}: no club logo path for "${clubName}"`);
        } else if (!(await probeAssetUrlChain(crestUrls))) {
          out.push(`${pName}: club logo missing for "${clubName}"`);
        }
      }
    }
    return out;
  };

  // One level's checks (logo + every slot). Returns a failure string or null.
  const checkLevel = async ({ lvl, index }) => {
    if (!lvl.currentSquad) return null;
    const label = getLevelLabel(index, lvl);
    const teamName = resolveLevelTeamName(lvl, quizType);
    const missing = [];

    const logoUrls = resolveLogoChain(
      lvl, lvl.currentSquad, lvl.squadType, lvl.selectedEntry?.name, quizType
    );
    const formation = FORMATIONS.find((f) => f.id === lvl.formationId) || FORMATIONS[0];
    const xi = lvl.customXi || (formation ? pickStartingXI(formation, lvl.currentSquad) : []);

    // Logo + all slots concurrently.
    const [logoMissing, perSlot] = await Promise.all([
      (async () => {
        if (!logoUrls.length) return "logo (no path)";
        if (!(await probeAssetUrlChain(logoUrls))) return "logo (file missing or failed to load)";
        return null;
      })(),
      xi && xi.length > 0
        ? Promise.all(xi.map((p, si) => probeSlot(lvl, p, si)))
        : Promise.resolve([]),
    ]);

    if (logoMissing) missing.push(logoMissing);
    for (const arr of perSlot) for (const m of arr) missing.push(m);

    return missing.length > 0 ? `${label} (${teamName}): ${missing.join(", ")}` : null;
  };

  // All levels concurrently; failures kept in level order.
  const perLevel = await Promise.all(questionLevels.map(checkLevel));
  const failures = perLevel.filter(Boolean);

  return {
    sectionName,
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Probe-free sibling of validateTeamAssetsAsync used by the recording preflight.
 * Enumerates every image URL the recording will need — team/club logos, starting-XI
 * player photos, player country flags (club squads), club crests (national squads) —
 * WITHOUT touching the network, so the caller can warm them into cache.
 *
 * Accepts the SAME opts shape as validateTeamAssetsAsync (so each runner reuses the
 * exact asset derivation PROD already trusts). Returns
 *   { imageUnits: [{ label, urls: [primary, ...fallbacks] }] }
 * where a unit's urls are fallbacks for one logical asset — warm them all; the unit
 * counts as satisfied if ANY of them loads (matches PROD's probeAssetUrlChain).
 *
 * @param {object} opts — see validateTeamAssetsAsync for field meanings.
 * @returns {{ imageUnits: Array<{label: string, urls: string[]}> }}
 */
export function collectTeamAssetUrls(opts) {
  const {
    questionLevels = [],
    quizType,
    resolveLevelTeamName,
    FORMATIONS = [],
    pickStartingXI,
    appState,
    projectAssetUrl,
    getHeaderLogoUrlChain,
    resolvePlayerNationalityLabel,
    getClubLogoUrl,
    getClubLogoOtherTeamsUrl,
    getTeamHeaderFlagUrl,
    // Preflight-only extras (optional). When playerPhotoPaths is supplied we warm the
    // exact URL the pitch renders (and projectAssetUrlFresh keeps it cache-bust-aligned),
    // pre-decoding it; otherwise we fall back to the PROD photo-index derivation.
    playerPhotoPaths,
    projectAssetUrlFresh,
  } = opts || {};

  const checkFlags = Boolean(
    resolvePlayerNationalityLabel && getClubLogoUrl && getClubLogoOtherTeamsUrl
  );
  const resolveLogoChain =
    getHeaderLogoUrlChain || buildDefaultHeaderLogoUrlChain(projectAssetUrl);
  const photoUrl = (rel) => (projectAssetUrlFresh ? projectAssetUrlFresh(rel) : projectAssetUrl(rel));

  const imageUnits = [];
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

  // playerPhotoPaths() reads the current level via getState() internally, so we move
  // appState.currentLevelIndex across levels while enumerating. Always restored.
  const originalIndex = appState ? appState.currentLevelIndex : undefined;
  try {
    for (const entry of questionLevels) {
      const lvl = entry && entry.lvl;
      if (!lvl || !lvl.currentSquad) continue;
      if (appState && playerPhotoPaths && typeof entry.index === "number") {
        appState.currentLevelIndex = entry.index;
      }
      const teamName = safe(() => resolveLevelTeamName(lvl, quizType), "") || "?";

      const logoUrls = safe(
        () => resolveLogoChain(lvl, lvl.currentSquad, lvl.squadType, lvl.selectedEntry?.name, quizType),
        []
      ) || [];
      if (logoUrls.length) imageUnits.push({ label: `logo: ${teamName}`, urls: logoUrls.slice() });

      const formation = FORMATIONS.find((f) => f.id === lvl.formationId) || FORMATIONS[0];
      const xi = safe(
        () => lvl.customXi || (formation ? pickStartingXI(formation, lvl.currentSquad) : []),
        []
      ) || [];

      for (let si = 0; si < xi.length; si++) {
        const player = xi[si];
        if (!player) continue;
        const pName = player.name || `slot ${si + 1}`;

        const photoPaths = playerPhotoPaths
          ? (safe(() => playerPhotoPaths(player, lvl.displayMode), []) || [])
          : (safe(() => collectPlayerPhotoRelPaths(player, lvl, appState.playerImages), []) || []);
        const photoUrls = photoPaths.filter(Boolean).map(photoUrl);
        if (photoUrls.length) imageUnits.push({ label: pName, urls: photoUrls });

        if (!checkFlags) continue;
        if (lvl.squadType === "club") {
          const natLabel = safe(() => resolvePlayerNationalityLabel(player.nationality), "");
          const code = natLabel ? appState.flagcodes?.[natLabel] : null;
          if (code && getTeamHeaderFlagUrl) {
            const flagUrl = safe(() => getTeamHeaderFlagUrl(natLabel, appState.flagcodes), null);
            if (flagUrl) imageUnits.push({ label: `${pName} flag`, urls: [flagUrl] });
          }
        } else if (lvl.squadType === "national") {
          const clubName = String(player?.club || "").trim();
          if (clubName) {
            const crestUrls = [
              safe(() => getClubLogoUrl(clubName), null),
              safe(() => getClubLogoOtherTeamsUrl(clubName), null),
            ].filter(Boolean);
            if (crestUrls.length) imageUnits.push({ label: `${pName} crest`, urls: crestUrls });
          }
        }
      }

      // Per-slot crest overrides (e.g. a player photo using a different club crest on the front face).
      if (lvl.slotClubCrestOverrideRelPathBySlot && typeof lvl.slotClubCrestOverrideRelPathBySlot === "object") {
        for (const rel of Object.values(lvl.slotClubCrestOverrideRelPathBySlot)) {
          if (rel) imageUnits.push({ label: `crest override`, urls: [photoUrl(rel)] });
        }
      }
    }
  } finally {
    if (appState && originalIndex !== undefined) appState.currentLevelIndex = originalIndex;
  }

  return { imageUnits };
}
