/**
 * Title presets for the "Add specific title" landing badge.
 *
 * Each preset has:
 *   - key:     stable identifier (saved on disk; never translated)
 *   - icon:    image path; the SAME icon is used regardless of language
 *   - english: dropdown label / on-canvas text in English
 *   - spanish: dropdown label / on-canvas text in Spanish
 *
 * The dropdown is rebuilt when the language changes (see `renderSpecificTitlePresetOptions`).
 */

export const SPECIFIC_TITLE_PRESETS = [
    // Competitions
    {
        key: "world-cup",
        icon: "Images/Icons/specific-title/World Cup 2026.png",
        english: "World Cup Edition",
        spanish: "Edición Mundial",
        group: "Competitions",
        groupEs: "Competiciones",
    },
    {
        key: "champions-league",
        icon: "Images/Icons/specific-title/Champions League.png",
        english: "Champions League Edition",
        spanish: "Edición Champions League",
        group: "Competitions",
        groupEs: "Competiciones",
    },
    {
        key: "europa-league",
        icon: "Images/Icons/specific-title/Europa League.png",
        english: "Europa League Edition",
        spanish: "Edición Europa League",
        group: "Competitions",
        groupEs: "Competiciones",
    },
    {
        key: "conference-league",
        icon: "Images/Icons/specific-title/Conference League.png",
        english: "Conference League Edition",
        spanish: "Edición Conference League",
        group: "Competitions",
        groupEs: "Competiciones",
    },
    // Leagues
    {
        key: "premier-league",
        icon: "Images/Icons/specific-title/Premier League.png",
        english: "Premier League Edition",
        spanish: "Edición Premier League",
        group: "Leagues",
        groupEs: "Ligas",
    },
    {
        key: "la-liga",
        icon: "Images/Icons/specific-title/La Liga.png",
        english: "La Liga Edition",
        spanish: "Edición La Liga",
        group: "Leagues",
        groupEs: "Ligas",
    },
    {
        key: "serie-a",
        icon: "Images/Icons/specific-title/Seria A.png",
        english: "Serie A Edition",
        spanish: "Edición Serie A",
        group: "Leagues",
        groupEs: "Ligas",
    },
    {
        key: "bundesliga",
        icon: "Images/Icons/specific-title/Bundesliga.png",
        english: "Bundesliga Edition",
        spanish: "Edición Bundesliga",
        group: "Leagues",
        groupEs: "Ligas",
    },
    {
        key: "ligue-1",
        icon: "Images/Icons/specific-title/Ligue 1.png",
        english: "Ligue 1 Edition",
        spanish: "Edición Ligue 1",
        group: "Leagues",
        groupEs: "Ligas",
    },
];

export const DEFAULT_SPECIFIC_TITLE_PRESET_KEY = "world-cup";

export function getSpecificTitlePreset(key) {
    return SPECIFIC_TITLE_PRESETS.find((p) => p.key === key) ||
        SPECIFIC_TITLE_PRESETS.find((p) => p.key === DEFAULT_SPECIFIC_TITLE_PRESET_KEY) ||
        SPECIFIC_TITLE_PRESETS[0];
}

export function getSpecificTitleText(key, language) {
    const preset = getSpecificTitlePreset(key);
    return (String(language).toLowerCase() === "spanish" ? preset.spanish : preset.english) || "";
}

export function getSpecificTitleIcon(key) {
    return getSpecificTitlePreset(key).icon;
}

/** Best-effort migration: map an old-schema { text, icon } to a preset key. */
export function inferPresetKeyFromLegacy(legacyText, legacyIcon) {
    const txt = String(legacyText || "").trim().toLowerCase();
    const ico = String(legacyIcon || "").trim();
    const byIcon = SPECIFIC_TITLE_PRESETS.find((p) => p.icon === ico);
    if (byIcon) return byIcon.key;
    const byText = SPECIFIC_TITLE_PRESETS.find(
        (p) => p.english.toLowerCase() === txt || p.spanish.toLowerCase() === txt,
    );
    if (byText) return byText.key;
    return DEFAULT_SPECIFIC_TITLE_PRESET_KEY;
}

/** Rebuild the <select id="in-specific-title-preset"> options, preserving the
 *  current value. Call this on init and whenever the language changes. */
export function renderSpecificTitlePresetOptions(selectEl, language) {
    if (!selectEl) return;
    const isSpanish = String(language).toLowerCase() === "spanish";
    const prevValue = selectEl.value;

    // Group by `group` while preserving the original preset order within each group.
    const groupOrder = [];
    const groups = new Map();
    for (const p of SPECIFIC_TITLE_PRESETS) {
        const label = isSpanish ? p.groupEs : p.group;
        if (!groups.has(label)) {
            groups.set(label, []);
            groupOrder.push(label);
        }
        groups.get(label).push(p);
    }

    selectEl.innerHTML = "";
    for (const groupLabel of groupOrder) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = groupLabel;
        for (const p of groups.get(groupLabel)) {
            const opt = document.createElement("option");
            opt.value = p.key;
            opt.textContent = isSpanish ? p.spanish : p.english;
            optgroup.appendChild(opt);
        }
        selectEl.appendChild(optgroup);
    }

    /* Restore previous selection if still valid; else default. */
    const keys = SPECIFIC_TITLE_PRESETS.map((p) => p.key);
    selectEl.value = keys.includes(prevValue) ? prevValue : DEFAULT_SPECIFIC_TITLE_PRESET_KEY;
}
