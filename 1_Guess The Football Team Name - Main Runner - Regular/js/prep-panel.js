/**
 * PREP PANEL — renders EVERY question level of the loaded save as a stacked
 * section of 11 player cards, reusing pitch-render's renderSlot/slot-controls
 * unchanged. Trick: all existing slot/header handlers act on the "current"
 * level (getState() at click time), so each section owns its own .pitch-slots
 * container and we swap appState.currentLevelIndex + appState.els.pitchSlots
 * on pointerdown (capture phase) before any click handler runs.
 */
import { appState } from "./state.js";
import { renderPitch, renderHeader } from "./pitch-render.js";

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

export function setActiveLevel(levelIndex) {
  appState.currentLevelIndex = levelIndex;
  const sec = sections.find((s) => s.levelIndex === levelIndex);
  if (sec) {
    appState.els.pitchSlots = sec.slotsEl;
    sections.forEach((s) =>
      s.sectionEl.classList.toggle("prep-section--active", s === sec)
    );
  }
  // The single sticky #team-header tracks the active level (crest scale/nudge
  // controls + dblclick name edit live there).
  try {
    renderHeader();
    const th = appState.els.teamHeader;
    if (th) {
      th.hidden = false;
      th.classList.add("team-header--show");
    }
  } catch (e) {
    console.warn("[prep] renderHeader failed:", e);
  }
}

function sectionHeadText(lvl, ordinal) {
  const teamName = lvl?.currentSquad?.name || "(no team loaded)";
  const players = lvl?.currentSquad ? "11 players" : "—";
  return (
    `<span class="prep-section__level">Level ${ordinal}</span>` +
    `<span class="prep-section__team">${teamName}</span>` +
    `<span class="prep-section__meta">${lvl?.formationId || ""} · ${players}${lvl?.isBonus ? " · BONUS" : ""}</span>`
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

    const slotsEl = buildSlotsContainer();
    sectionEl.appendChild(slotsEl);
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

  /* Saves store videoMode:true per level, which would render the UNREVEALED
     flip-card front (flag only, hidden player). Forcing the post-timer flag
     makes getVideoQuestionPreviewState() treat every card as revealed —
     photos + names + slot controls — WITHOUT mutating the save data. */
  appState.videoRevealPostTimerActive = true;

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

  document.addEventListener("recording-queue:script-applied", () => renderPrepPanel());
  document.addEventListener("prep:levels-changed", () => renderPrepPanel());
  document.addEventListener("prep:level-switched", (e) => {
    const sec = sections.find((s) => s.levelIndex === e.detail?.index);
    if (sec) {
      setActiveLevel(sec.levelIndex);
      sec.sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  renderPrepPanel();
}
