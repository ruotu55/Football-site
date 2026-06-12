/**
 * PREP PANEL — renders EVERY question level of the loaded save as a stacked
 * section: players card grid (left) + a TEAM PANEL PREVIEW (right) that
 * mirrors the Remotion RevealPanel at the SAME internal scale, reusing
 * pitch-render's renderSlot/slot-controls unchanged. Trick: all existing slot
 * handlers act on the "current" level (getState() at click time), so each
 * section owns its own .pitch-slots container and we swap
 * appState.currentLevelIndex + appState.els.pitchSlots on pointerdown
 * (capture phase) before any click handler runs.
 */
import { appState } from "./state.js";
import {
  renderPitch,
  resolveHeaderTeamDisplayName,
  applyTeamRename,
} from "./pitch-render.js";
import { projectAssetUrl } from "./paths.js";

/* Remotion RevealPanel design constants (components/RevealPanel.tsx) — the
   preview is built at EXACTLY these pixel sizes and scaled as ONE unit, so
   the crest/flag/name proportions on screen = the rendered video. */
const RP_W = 380;
const RP_H = 1080;

let root = null;
let sections = []; // [{ levelIndex, sectionEl, slotsEl, headEl }]

function questionLevelIndexes() {
  const out = [];
  (appState.levelsData || []).forEach((lvl, i) => {
    if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isOutro) return;
    // Only levels that actually have a team — the 30 empty init levels before
    // a save is picked would otherwise render as "(no team loaded)" noise.
    if (!lvl.currentSquad) return;
    out.push(i); // bonus levels are questions too — keep them
  });
  return out;
}

/** Same shell structure app.js used to build into the single pitch. */
function buildSlotsContainer() {
  const wrap = document.createElement("div");
  wrap.className = "pitch-slots";
  for (let i = 0; i < 11; i++) {
    const div = document.createElement("div");
    div.className = "player-slot empty";
    div.dataset.slotIndex = String(i);
    const mount = document.createElement("div");
    mount.className = "slot-mount";
    div.appendChild(mount);
    wrap.appendChild(div);
  }
  return wrap;
}

/* Country folder from the crest path — same rule as Remotion build-data:
   "Images/Teams/<Country>/<Team>.png". */
function countryFromImagePath(imagePath) {
  const parts = String(imagePath || "").split(/[/\\]/);
  return parts[1] === "Teams" && parts[2] !== "Competitions" ? (parts[2] || "") : "";
}

/** Override-aware team name for a specific level (lvl IS a state object). */
function teamDisplayName(lvl) {
  try {
    const resolved = resolveHeaderTeamDisplayName(lvl, "club-by-nat");
    if (resolved) return resolved;
  } catch { /* fall through */ }
  return lvl?.currentSquad?.name || "";
}

/** The Remotion RevealPanel preview: crest → team name → divider → flag,
 *  built at the panel's REAL pixel sizes and scaled as one block.
 *  + a Rename button (override-aware, optionally permanent for all runners). */
function buildTeamPanelPreview(lvl, levelIndex) {
  const wrap = document.createElement("div");
  wrap.className = "prep-team-panel";
  const inner = document.createElement("div");
  inner.className = "prep-team-panel__inner";

  const cs = lvl?.currentSquad;

  const crest = document.createElement("img");
  crest.className = "prep-team-panel__crest";
  crest.alt = "";
  if (cs?.imagePath) crest.src = projectAssetUrl(cs.imagePath);

  const name = document.createElement("div");
  name.className = "prep-team-panel__name";
  name.textContent = teamDisplayName(lvl);

  const divider = document.createElement("div");
  divider.className = "prep-team-panel__divider";

  const flagBox = document.createElement("div");
  flagBox.className = "prep-team-panel__flagbox";
  const country = countryFromImagePath(cs?.imagePath);
  const code = country ? String(appState.flagcodes?.[country] || "") : "";
  if (code) {
    const flag = document.createElement("img");
    flag.className = "prep-team-panel__flag";
    flag.alt = "";
    flag.src = projectAssetUrl(`Images/Flags/${code}.png`);
    flag.onerror = () => {
      flag.onerror = null;
      flag.src = `https://flagcdn.com/w320/${code}.png`;
    };
    flagBox.appendChild(flag);
  } else {
    flagBox.classList.add("prep-team-panel__flagbox--missing");
    flagBox.textContent = country ? `no flag code: ${country}` : "no country";
  }

  inner.append(crest, name, divider, flagBox);
  wrap.appendChild(inner);

  // Rename button (outside the scaled inner, so it stays a normal size).
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "prep-team-panel__rename";
  renameBtn.textContent = "✎ Rename team";
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setActiveLevel(levelIndex); // getState() now points at this level
    const current = teamDisplayName(appState.levelsData[levelIndex]);
    const next = window.prompt(
      "Enter a custom team name.\nLeave empty to reset to the original.",
      current
    );
    if (next === null) return;
    const clean = String(next).trim();
    let persistGlobal = false;
    if (clean && clean.toLowerCase() !== String(current).toLowerCase()) {
      persistGlobal = window.confirm(
        `Save "${clean}" PERMANENTLY for this team?\n\n` +
          "OK — every save and every main runner shows this name from now on " +
          "(it's saved to disk and survives closing the terminal).\n" +
          "Cancel — only for THIS save."
      );
    }
    const resolved = applyTeamRename(clean, persistGlobal);
    name.textContent = resolved;
    const sec = sections.find((s) => s.levelIndex === levelIndex);
    if (sec) {
      sec.headEl.innerHTML = sectionHeadText(
        appState.levelsData[levelIndex],
        sections.indexOf(sec) + 1
      );
    }
  });
  wrap.appendChild(renameBtn);

  return wrap;
}

/** Fit each panel preview to its section height (scale the WHOLE panel). */
function fitTeamPanels() {
  for (const s of sections) {
    const wrap = s.sectionEl.querySelector(".prep-team-panel");
    const inner = wrap?.querySelector(".prep-team-panel__inner");
    if (!wrap || !inner) continue;
    const h = wrap.clientHeight || 0;
    const scale = h > 0 ? h / RP_H : 0.35;
    inner.style.transform = `scale(${scale})`;
    wrap.style.width = `${Math.round(RP_W * scale)}px`;
  }
}

export function setActiveLevel(levelIndex) {
  appState.currentLevelIndex = levelIndex;
  const sec = sections.find((s) => s.levelIndex === levelIndex);
  if (sec) {
    appState.els.pitchSlots = sec.slotsEl;
    sections.forEach((s) =>
      s.sectionEl.classList.toggle("prep-section--active", s === sec)
    );
  }
}

function sectionHeadText(lvl, ordinal) {
  const teamName = teamDisplayName(lvl) || "(no team loaded)";
  return (
    `<span class="prep-section__level">Level ${ordinal}</span>` +
    `<span class="prep-section__team">${teamName}</span>`
  );
}

export function renderPrepPanel() {
  if (!root) return;
  const prevLevel = appState.currentLevelIndex;
  sections = [];
  root.innerHTML = "";

  const indexes = questionLevelIndexes();
  if (!indexes.length) {
    const empty = document.createElement("div");
    empty.className = "prep-empty";
    empty.textContent = "Pick a save in the Saved tab to load its levels here.";
    root.appendChild(empty);
    return;
  }

  let ordinal = 0;
  for (const levelIndex of indexes) {
    const lvl = appState.levelsData[levelIndex];
    ordinal += 1;

    const sectionEl = document.createElement("section");
    sectionEl.className = "prep-section";
    sectionEl.dataset.levelIndex = String(levelIndex);

    const head = document.createElement("div");
    head.className = "prep-section__head";
    head.innerHTML = sectionHeadText(lvl, ordinal);
    sectionEl.appendChild(head);

    const body = document.createElement("div");
    body.className = "prep-section__body";
    const slotsEl = buildSlotsContainer();
    body.append(slotsEl, buildTeamPanelPreview(lvl, levelIndex));
    sectionEl.appendChild(body);

    root.appendChild(sectionEl);
    sections.push({ levelIndex, sectionEl, slotsEl, headEl: head });
  }

  // Fill every section's slots with the context swapped in.
  for (const s of sections) {
    appState.currentLevelIndex = s.levelIndex;
    appState.els.pitchSlots = s.slotsEl;
    try {
      renderPitch();
    } catch (e) {
      console.warn("[prep] renderPitch failed for level", s.levelIndex, e);
    }
  }

  // Restore/activate: keep the previously-active level if it still exists.
  const keep = sections.find((s) => s.levelIndex === prevLevel) || sections[0];
  setActiveLevel(keep.levelIndex);

  requestAnimationFrame(fitTeamPanels);
}

/** Re-render every section's cards IN PLACE (keeps DOM/scroll) — used by the
 *  Revealed toggle so cards flip between flag-front and photo-back. */
function rerenderAllSlots() {
  const prevLevel = appState.currentLevelIndex;
  for (const s of sections) {
    appState.currentLevelIndex = s.levelIndex;
    appState.els.pitchSlots = s.slotsEl;
    try {
      renderPitch();
    } catch (e) {
      console.warn("[prep] rerenderAllSlots failed for level", s.levelIndex, e);
    }
  }
  const keep = sections.find((s) => s.levelIndex === prevLevel) || sections[0];
  if (keep) setActiveLevel(keep.levelIndex);
}

/** Re-render ONLY the active section (used after photo/name edits). */
export function refreshActiveSection() {
  const sec = sections.find((s) => s.levelIndex === appState.currentLevelIndex);
  if (!sec) return;
  appState.els.pitchSlots = sec.slotsEl;
  try {
    renderPitch();
    sec.headEl.innerHTML = sectionHeadText(
      appState.levelsData[sec.levelIndex],
      sections.indexOf(sec) + 1
    );
  } catch (e) {
    console.warn("[prep] refreshActiveSection failed:", e);
  }
}

export function initPrepPanel() {
  root = document.getElementById("prep-root");
  if (!root) {
    console.error("[prep] missing #prep-root");
    return;
  }

  /* "Revealed" toggle (next to PROD). OFF (default on load) = the cards show
     the country-flag FRONT, exactly like the quiz before the answer reveal.
     ON = the photo + name BACK (the answer). Driven by the same
     videoRevealPostTimerActive flag renderSlot already reads — no save data
     is mutated either way. */
  appState.videoRevealPostTimerActive = false;
  const revealBtn = document.getElementById("reveal-btn");
  const syncRevealBtn = () => {
    if (!revealBtn) return;
    const on = !!appState.videoRevealPostTimerActive;
    revealBtn.setAttribute("aria-pressed", on ? "true" : "false");
    revealBtn.textContent = on ? "Revealed ✓" : "Revealed";
  };
  if (revealBtn) {
    revealBtn.onclick = () => {
      appState.videoRevealPostTimerActive = !appState.videoRevealPostTimerActive;
      syncRevealBtn();
      rerenderAllSlots();
    };
    syncRevealBtn();
  }

  /* The sliding #team-header sidebar is GONE (the per-level panel preview
     replaced it) — but "Get all team photos" lives inside it; move the
     button to <body> so its fixed FAB-row spot still works. */
  const bulkBtn = document.getElementById("team-header-get-all-photos");
  if (bulkBtn && bulkBtn.parentElement !== document.body) {
    document.body.appendChild(bulkBtn);
  }

  // Context switch BEFORE any click handler fires (capture phase).
  root.addEventListener(
    "pointerdown",
    (e) => {
      const sec = e.target?.closest?.(".prep-section");
      if (!sec) return;
      const idx = Number(sec.dataset.levelIndex);
      if (Number.isFinite(idx) && idx !== appState.currentLevelIndex) {
        setActiveLevel(idx);
      } else if (Number.isFinite(idx)) {
        // Same level — still make sure els.pitchSlots points at this section.
        const s = sections.find((x) => x.levelIndex === idx);
        if (s) appState.els.pitchSlots = s.slotsEl;
      }
    },
    true
  );

  document.addEventListener("recording-queue:script-applied", () => {
    renderPrepPanel();
    // A fresh save always opens at the TOP (Level 1). Instant, not smooth —
    // smooth scrolling races the cards' layout/images and lands mid-list.
    const scroller = root.closest(".stage");
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  document.addEventListener("prep:levels-changed", () => renderPrepPanel());
  document.addEventListener("prep:level-switched", (e) => {
    const sec = sections.find((s) => s.levelIndex === e.detail?.index);
    if (!sec) return;
    setActiveLevel(sec.levelIndex);
    // First section = top of the list (don't leave the FAB-row padding behind).
    if (sec === sections[0]) {
      const scroller = root.closest(".stage");
      if (scroller) scroller.scrollTop = 0;
      window.scrollTo(0, 0);
    } else {
      sec.sectionEl.scrollIntoView({ behavior: "auto", block: "start" });
    }
  });
  window.addEventListener("resize", () => fitTeamPanels());

  renderPrepPanel();
}
