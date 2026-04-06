const STORAGE_COLOR_KEY = "football-channel.shared-background-color";
const STORAGE_EFFECT_KEY = "football-channel.shared-background-effect";
const LEGACY_PRESET_KEY = "football-channel.shared-background-preset";
const STORAGE_OPACITY_PROFILES_KEY = "football-channel.shared-background-opacity-profiles";
const STORAGE_OPACITY_PROFILES_BUCKET = "shared_background_opacity_profiles_v1";
const STYLE_TAG_ID = "shared-background-theme-style";
const ROOT_COLOR_ATTR = "data-shared-background-color";
const ROOT_EFFECT_ATTR = "data-shared-background-effect";
const DEFAULT_LINE_OPACITY_PERCENT = 1;

const WHITE_0 = "rgba(255, 255, 255, 0)";
let opacityProfiles = {};
let opacityProfilesPushTimer = null;

function isNonEmptyObject(value) {
  return !!(value && typeof value === "object" && !Array.isArray(value));
}

function isServerSyncActive() {
  return (
    typeof location !== "undefined" &&
    location.protocol === "http:" &&
    location.hostname !== ""
  );
}

const COLORS = [
  { id: "royal-blue", label: "Royal Blue", hex: "#0a3db8" },
  { id: "ocean-blue", label: "Ocean Blue", hex: "#0c63b5" },
  { id: "sky-blue", label: "Sky Blue", hex: "#1f6fe5" },
  { id: "cobalt-blue", label: "Cobalt Blue", hex: "#1e40af" },
  { id: "navy-blue", label: "Navy Blue", hex: "#1e3a8a" },
  { id: "teal", label: "Teal", hex: "#0f766e" },
  { id: "cyan-teal", label: "Cyan Teal", hex: "#0e8b8f" },
  { id: "emerald", label: "Emerald", hex: "#0f8a5f" },
  { id: "forest-green", label: "Forest Green", hex: "#166534" },
  { id: "aqua-green", label: "Aqua Green", hex: "#0f9f7a" },
  { id: "amber", label: "Amber", hex: "#b9770e" },
  { id: "gold", label: "Gold", hex: "#a16207" },
  { id: "crimson", label: "Crimson", hex: "#a31621" },
  { id: "ruby-red", label: "Ruby Red", hex: "#b91c1c" },
  { id: "burgundy", label: "Burgundy", hex: "#7f1d1d" },
  { id: "purple", label: "Purple", hex: "#5b2a86" },
  { id: "violet", label: "Violet", hex: "#6d28d9" },
  { id: "indigo", label: "Indigo", hex: "#4338ca" },
  { id: "deep-pink", label: "Deep Pink", hex: "#9a2f6a" },
  { id: "magenta", label: "Magenta", hex: "#a21caf" },
  { id: "plum", label: "Plum", hex: "#7e22ce" },
];

function ensureStyleTag() {
  let styleTag = document.getElementById(STYLE_TAG_ID);
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = STYLE_TAG_ID;
    document.head.appendChild(styleTag);
  }
  return styleTag;
}

function normalizeHex(hex) {
  if (typeof hex !== "string") return null;
  const trimmed = hex.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(trimmed);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function hexToRgb(hex) {
  const normalizedHex = normalizeHex(hex);
  if (!normalizedHex) return { r: 10, g: 61, b: 184 };
  const value = parseInt(normalizedHex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeOpacityPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LINE_OPACITY_PERCENT;
  return Math.min(10, Math.max(0, Math.round(numeric * 100) / 100));
}

function whiteWithOpacity(opacityPercent) {
  return `rgba(255, 255, 255, ${normalizeOpacityPercent(opacityPercent) / 100})`;
}

function readOpacityProfilesFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_OPACITY_PROFILES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!isNonEmptyObject(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([colorId, opacity]) => [
        colorId,
        normalizeOpacityPercent(opacity),
      ]),
    );
  } catch (_) {
    return {};
  }
}

function syncOpacityProfilesToServer() {
  if (!isServerSyncActive()) return;
  clearTimeout(opacityProfilesPushTimer);
  opacityProfilesPushTimer = setTimeout(() => {
    fetch(`/__runner-json-blob/${encodeURIComponent(STORAGE_OPACITY_PROFILES_BUCKET)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opacityProfiles),
    }).catch(() => {});
  }, 300);
}

function persistOpacityProfiles() {
  try {
    localStorage.setItem(
      STORAGE_OPACITY_PROFILES_KEY,
      JSON.stringify(opacityProfiles),
    );
  } catch (_) {
    // Ignore storage failures (private mode / browser restrictions).
  }
  syncOpacityProfilesToServer();
}

function startOpacityProfilesPull(onLoaded) {
  if (!isServerSyncActive()) return;
  (async () => {
    try {
      const response = await fetch(
        `/__runner-json-blob/${encodeURIComponent(STORAGE_OPACITY_PROFILES_BUCKET)}`,
      );
      if (response.ok) {
        const json = await response.json();
        if (isNonEmptyObject(json)) {
          opacityProfiles = Object.fromEntries(
            Object.entries(json).map(([colorId, opacity]) => [
              colorId,
              normalizeOpacityPercent(opacity),
            ]),
          );
          try {
            localStorage.setItem(
              STORAGE_OPACITY_PROFILES_KEY,
              JSON.stringify(opacityProfiles),
            );
          } catch (_) {
            // Ignore local cache failures.
          }
          if (typeof onLoaded === "function") onLoaded();
          return;
        }
      }

      if (isNonEmptyObject(opacityProfiles)) {
        syncOpacityProfilesToServer();
      }
    } catch (_) {
      // file:// or offline
    }
  })();
}

function readSavedOpacityForColor(colorId) {
  return normalizeOpacityPercent(
    opacityProfiles[normalizeColorId(colorId)] ?? DEFAULT_LINE_OPACITY_PERCENT,
  );
}

function normalizeColorId(colorId) {
  return COLORS.some((color) => color.id === colorId) ? colorId : "royal-blue";
}

function normalizeEffectId(effectId) {
  if (effectId === "sun-rays") return "sun-rays-top-right";
  return EFFECTS.some((effect) => effect.id === effectId) ? effectId : "sun-rays-top-right";
}

const EFFECTS = [
  { id: "sun-rays-center", label: "Sun effect middle" },
  { id: "sun-rays-top-right", label: "Sun effect top right" },
  { id: "sun-rays-top-left", label: "Sun effect top left" },
  { id: "center-rings", label: "Center circles" },
  { id: "diagonal-flow", label: "Diagonal flow" },
  { id: "diamond-grid", label: "Diamond grid" },
];

function getEffectBackground(effectId, colorHex, opacityPercent) {
  const opacityFactor = normalizeOpacityPercent(opacityPercent) / 100;
  const whiteLine = whiteWithOpacity(opacityPercent);
  const color10 = rgbaFromHex(colorHex, 0.1 * opacityPercent);
  const color05 = rgbaFromHex(colorHex, 0.05 * opacityPercent);
  const color14 = rgbaFromHex(colorHex, 0.14 * opacityPercent);
  const color18 = rgbaFromHex(colorHex, 0.18 * opacityPercent);
  const whiteSoft = `rgba(255, 255, 255, ${Math.min(0.08, opacityFactor * 4)})`;
  const whiteMid = `rgba(255, 255, 255, ${Math.min(0.12, opacityFactor * 6)})`;
  const blackSoft = `rgba(0, 0, 0, ${Math.min(0.08, opacityFactor * 4)})`;
  const blackMid = `rgba(0, 0, 0, ${Math.min(0.14, opacityFactor * 7)})`;
  switch (effectId) {
    case "sun-rays-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
      return `${colorHex}`;
    case "center-rings":
      return `${colorHex}`;
    case "diagonal-flow":
      return `
    repeating-linear-gradient(-28deg, ${whiteLine} 0 66px, ${color10} 66px 132px),
    ${colorHex}`;
    case "wave-bands":
      return `
    radial-gradient(140% 80% at 0% 100%, ${whiteMid} 0 36%, ${WHITE_0} 62%),
    radial-gradient(140% 80% at 100% 0%, ${whiteSoft} 0 34%, ${WHITE_0} 60%),
    repeating-linear-gradient(0deg, ${blackSoft} 0 48px, ${WHITE_0} 48px 96px),
    ${colorHex}`;
    case "diamond-grid":
      return `
    repeating-linear-gradient(45deg, ${whiteLine} 0 38px, ${color10} 38px 76px),
    repeating-linear-gradient(-45deg, ${WHITE_0} 0 38px, ${color10} 38px 76px),
    ${colorHex}`;
    case "soft-vignette":
      return `
    radial-gradient(circle at 50% 50%, ${whiteMid} 0 18%, ${WHITE_0} 60%),
    radial-gradient(130% 95% at 50% 50%, ${WHITE_0} 0 40%, ${blackMid} 76%),
    ${colorHex}`;
    case "sun-rays":
    default:
      return `${colorHex}`;
  }
}

function getEffectAnimation(effectId) {
  switch (effectId) {
    case "sun-rays-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
      return "none";
    case "center-rings":
      return "none";
    case "diagonal-flow":
      return "shared-bg-diagonal-flow 170s linear infinite";
    case "wave-bands":
      return "shared-bg-wave-bands 170s linear infinite";
    case "diamond-grid":
      return "shared-bg-diamond-grid 200s linear infinite";
    case "soft-vignette":
      return "shared-bg-soft-vignette 220s linear infinite";
    case "sun-rays":
    default:
      return "none";
  }
}

function getEffectBackgroundSize(effectId) {
  switch (effectId) {
    case "sun-rays-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
      return "100% 100%";
    case "center-rings":
      return "100% 100%";
    case "diagonal-flow":
      return "340% 340%, 100% 100%";
    case "wave-bands":
      return "220% 220%, 220% 220%, 240% 240%, 100% 100%";
    case "diamond-grid":
      return "220% 220%, 220% 220%, 100% 100%";
    case "soft-vignette":
      return "180% 180%, 100% 100%, 100% 100%";
    case "sun-rays":
    default:
      return "100% 100%";
  }
}

function getEffectExtraCss(effectId, colorHex, opacityPercent) {
  const whiteLine = whiteWithOpacity(opacityPercent);
  const color10 = rgbaFromHex(colorHex, 0.1 * opacityPercent);
  const color05 = rgbaFromHex(colorHex, 0.05 * opacityPercent);
  switch (effectId) {
    case "sun-rays-top-right":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-rays-top-right"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-top-right"] body::before {
  content: "";
  position: fixed;
  top: -320vmax;
  right: -320vmax;
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background: repeating-conic-gradient(
    from 10deg at calc(100% - 320vmax) 320vmax,
    ${whiteLine} 0deg 7deg,
    ${color10} 7deg 14deg
  );
  transform-origin: calc(100% - 320vmax) 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-top-right"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "sun-rays-center":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-rays-center"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-center"] body::before {
  content: "";
  position: fixed;
  top: calc(50vh - 320vmax);
  left: calc(50vw - 320vmax);
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background: repeating-conic-gradient(
    from 10deg at 320vmax 320vmax,
    ${whiteLine} 0deg 7deg,
    ${color10} 7deg 14deg
  );
  transform-origin: 320vmax 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-center"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "sun-rays-top-left":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-rays-top-left"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-top-left"] body::before {
  content: "";
  position: fixed;
  top: -320vmax;
  left: -320vmax;
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background: repeating-conic-gradient(
    from 10deg at 320vmax 320vmax,
    ${whiteLine} 0deg 7deg,
    ${color10} 7deg 14deg
  );
  transform-origin: 320vmax 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-top-left"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "center-rings":
      return `
:root[${ROOT_EFFECT_ATTR}="center-rings"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="center-rings"] body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: repeating-radial-gradient(
    circle at 50% 50%,
    ${color05} 0 var(--center-rings-offset),
    ${whiteLine} var(--center-rings-offset) calc(var(--center-rings-offset) + 58px),
    ${color05} calc(var(--center-rings-offset) + 58px) calc(var(--center-rings-offset) + 116px)
  );
  -webkit-mask-image: radial-gradient(
    circle at 50% 50%,
    rgba(0, 0, 0, 0.26) 0%,
    rgba(0, 0, 0, 0.39) 12.5%,
    rgba(0, 0, 0, 0.51) 25%,
    rgba(0, 0, 0, 0.64) 37.5%,
    rgba(0, 0, 0, 0.76) 50%,
    rgba(0, 0, 0, 0.82) 62.5%,
    rgba(0, 0, 0, 0.89) 75%,
    rgba(0, 0, 0, 0.95) 87.5%,
    rgba(0, 0, 0, 1) 100%
  );
  mask-image: radial-gradient(
    circle at 50% 50%,
    rgba(0, 0, 0, 0.26) 0%,
    rgba(0, 0, 0, 0.39) 12.5%,
    rgba(0, 0, 0, 0.51) 25%,
    rgba(0, 0, 0, 0.64) 37.5%,
    rgba(0, 0, 0, 0.76) 50%,
    rgba(0, 0, 0, 0.82) 62.5%,
    rgba(0, 0, 0, 0.89) 75%,
    rgba(0, 0, 0, 0.95) 87.5%,
    rgba(0, 0, 0, 1) 100%
  );
  opacity: 1;
  animation: shared-bg-center-rings-offset 60s linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="center-rings"] .app {
  position: relative;
  z-index: 1;
}
`;
    default:
      return `
:root[${ROOT_EFFECT_ATTR}="${effectId}"] body::before {
  content: none;
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] body::after {
  content: none;
}
`;
  }
}

function getEffectKeyframesCss() {
  return `
@keyframes shared-bg-sun-rays {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes shared-bg-center-rings {
  0% {
    background-position: 50% 50%, 50% 50%, center center;
    background-size: 120% 120%, 130% 130%, 100% 100%;
  }
  50% {
    background-position: 35% 65%, 65% 35%, center center;
    background-size: 190% 190%, 205% 205%, 100% 100%;
  }
  100% {
    background-position: 20% 80%, 80% 20%, center center;
    background-size: 270% 270%, 290% 290%, 100% 100%;
  }
}

@keyframes shared-bg-center-rings-pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.8);
    opacity: 1;
  }
}

@property --center-rings-offset {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

@keyframes shared-bg-center-rings-offset {
  0% {
    --center-rings-offset: 0px;
  }
  100% {
    --center-rings-offset: 116px;
  }
}

@keyframes shared-bg-diagonal-flow {
  0% { background-position: 40% 0%, center center; }
  100% { background-position: -40% 0%, center center; }
}

@keyframes shared-bg-wave-bands {
  0% { background-position: 0% 100%, 100% 0%, 0% 0%, center center; }
  100% { background-position: -20% 100%, 120% 0%, -30% 0%, center center; }
}

@keyframes shared-bg-diamond-grid {
  0% { background-position: 0% 0%, 0% 0%, center center; }
  100% { background-position: -30% 20%, 30% -20%, center center; }
}

@keyframes shared-bg-soft-vignette {
  0% { background-position: 50% 50%, 50% 50%, center center; }
  100% { background-position: 48% 52%, 52% 48%, center center; }
}
`;
}

function applyTheme(colorId, effectId, opacityPercent = DEFAULT_LINE_OPACITY_PERCENT) {
  const normalizedColorId = normalizeColorId(colorId);
  const normalizedEffectId = normalizeEffectId(effectId);
  const normalizedOpacity = normalizeOpacityPercent(opacityPercent);
  const selectedColor = COLORS.find((item) => item.id === normalizedColorId);
  const root = document.documentElement;
  root.setAttribute(ROOT_COLOR_ATTR, normalizedColorId);
  root.setAttribute(ROOT_EFFECT_ATTR, normalizedEffectId);
  root.style.setProperty("--bg-stage", selectedColor.hex);
  root.style.setProperty("--shared-line-opacity", String(normalizedOpacity));
  const background = getEffectBackground(
    normalizedEffectId,
    selectedColor.hex,
    normalizedOpacity,
  );
  const animation = getEffectAnimation(normalizedEffectId);
  const backgroundSize = getEffectBackgroundSize(normalizedEffectId);
  ensureStyleTag().textContent = `
:root[${ROOT_COLOR_ATTR}="${normalizedColorId}"][${ROOT_EFFECT_ATTR}="${normalizedEffectId}"] body {
  background: ${background};
  background-size: ${backgroundSize};
  animation: ${animation};
}
${getEffectKeyframesCss()}
${getEffectExtraCss(normalizedEffectId, selectedColor.hex, normalizedOpacity)}
`;
  try {
    localStorage.setItem(STORAGE_COLOR_KEY, normalizedColorId);
    localStorage.setItem(STORAGE_EFFECT_KEY, normalizedEffectId);
  } catch (_) {
    // Ignore storage failures (private mode / browser restrictions).
  }
}

function readSavedTheme() {
  let colorId = "royal-blue";
  let effectId = "sun-rays";
  try {
    const legacyPreset = localStorage.getItem(LEGACY_PRESET_KEY);
    if (legacyPreset === "blue-sun") {
      colorId = "royal-blue";
      effectId = "sun-rays";
    }
    colorId = normalizeColorId(localStorage.getItem(STORAGE_COLOR_KEY) || colorId);
    effectId = normalizeEffectId(localStorage.getItem(STORAGE_EFFECT_KEY) || effectId);
  } catch (_) {
    // Keep defaults.
  }
  return { colorId, effectId };
}

function populateSelect(selectEl, values) {
  if (!selectEl) return;
  selectEl.innerHTML = values
    .map((item) => `<option value="${item.id}">${item.label}</option>`)
    .join("");
}

export function initSharedBackgroundTheme(
  colorSelectEl,
  effectSelectEl,
  opacityInputEl,
  saveButtonEl,
) {
  populateSelect(colorSelectEl, COLORS);
  populateSelect(effectSelectEl, EFFECTS);
  opacityProfiles = readOpacityProfilesFromLocalStorage();
  const savedTheme = readSavedTheme();
  const applyCurrentSelection = () => {
    const colorId = colorSelectEl ? colorSelectEl.value : savedTheme.colorId;
    const effectId = effectSelectEl ? effectSelectEl.value : savedTheme.effectId;
    const opacity = opacityInputEl
      ? normalizeOpacityPercent(opacityInputEl.value)
      : readSavedOpacityForColor(colorId);
    if (opacityInputEl) {
      opacityInputEl.value = String(opacity);
    }
    applyTheme(colorId, effectId, opacity);
  };

  if (colorSelectEl) {
    colorSelectEl.value = savedTheme.colorId;
  }
  if (effectSelectEl) {
    effectSelectEl.value = savedTheme.effectId;
  }
  if (opacityInputEl) {
    opacityInputEl.value = String(readSavedOpacityForColor(savedTheme.colorId));
    opacityInputEl.addEventListener("input", applyCurrentSelection);
    opacityInputEl.addEventListener("change", applyCurrentSelection);
  }

  applyCurrentSelection();

  if (colorSelectEl) {
    colorSelectEl.addEventListener("change", () => {
      if (opacityInputEl) {
        opacityInputEl.value = String(readSavedOpacityForColor(colorSelectEl.value));
      }
      applyCurrentSelection();
    });
  }
  if (effectSelectEl) {
    effectSelectEl.addEventListener("change", applyCurrentSelection);
  }
  if (saveButtonEl) {
    saveButtonEl.addEventListener("click", () => {
      const colorId = colorSelectEl ? colorSelectEl.value : savedTheme.colorId;
      opacityProfiles[normalizeColorId(colorId)] = opacityInputEl
        ? normalizeOpacityPercent(opacityInputEl.value)
        : DEFAULT_LINE_OPACITY_PERCENT;
      persistOpacityProfiles();
      applyCurrentSelection();
    });
  }
  startOpacityProfilesPull(() => {
    if (colorSelectEl && opacityInputEl) {
      opacityInputEl.value = String(readSavedOpacityForColor(colorSelectEl.value));
    }
    applyCurrentSelection();
  });
}

