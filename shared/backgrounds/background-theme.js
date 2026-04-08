const STORAGE_COLOR_KEY = "football-channel.shared-background-color";
const STORAGE_EFFECT_KEY = "football-channel.shared-background-effect";
const LEGACY_PRESET_KEY = "football-channel.shared-background-preset";
const STORAGE_OPACITY_PROFILES_KEY = "football-channel.shared-background-opacity-profiles";
const STORAGE_OPACITY_PROFILES_BUCKET = "shared_background_opacity_profiles_v1";
const STYLE_TAG_ID = "shared-background-theme-style";
const ROOT_COLOR_ATTR = "data-shared-background-color";
const ROOT_EFFECT_ATTR = "data-shared-background-effect";
const DEFAULT_LINE_OPACITY_PERCENT = 1;
const EMOJI_EFFECT_CONTAINER_ID = "shared-background-emojis";
const EMOJI_IMAGES = [
  "../emojies/active-character-dribbling-removebg-preview.png",
  "../emojies/positive-character-with-ball-removebg-preview.png",
  "../emojies/round-characters-playing-football-removebg-preview.png",
  "../emojies/_Pngtree_soccer_ball_in_goal_net_3581900-removebg-preview.png",
  "../emojies/5842fe18a6515b1e0ad75b3d-removebg-preview.png",
  "../emojies/5842fe21a6515b1e0ad75b3e-removebg-preview.png",
  "../emojies/_Pngtree_mens_sports_red_football_shoes_9097428-removebg-preview.png",
];

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

function randomEmojiSrc() {
  return EMOJI_IMAGES[Math.floor(Math.random() * EMOJI_IMAGES.length)];
}

function ensureEmojiEffectContainer() {
  let container = document.getElementById(EMOJI_EFFECT_CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = EMOJI_EFFECT_CONTAINER_ID;
    container.className = "shared-bg-emojis";
    document.body.appendChild(container);
  }
  return container;
}

function populateEmojiEffectContainer(container) {
  if (!container) return;
  const isShorts = document.body.classList.contains("shorts-mode");
  const flowAxis = isShorts ? "vertical" : "horizontal";
  if (container.dataset.flowAxis !== flowAxis) {
    container.replaceChildren();
    container.dataset.flowAxis = flowAxis;
  }
  if (container.childElementCount > 0) return;
  const numRows = 10;
  const itemsPerRow = 8;
  const duration = 90;
  for (let row = 0; row < numRows; row++) {
    for (let i = 0; i < itemsPerRow; i++) {
      const img = document.createElement("img");
      img.src = randomEmojiSrc();
      img.alt = "";
      img.className = "shared-bg-emoji";
      img.style.width = "75px";
      img.style.height = "75px";
      if (isShorts) {
        img.style.left = `${5 + (row * (90 / (numRows - 1)))}%`;
      } else {
        img.style.top = `${5 + (row * (90 / (numRows - 1)))}vh`;
      }
      img.style.animationDuration = `${duration}s`;
      const timeSlot = duration / itemsPerRow;
      const baseDelay = i * timeSlot;
      const rowOffset = row % 2 === 0 ? 0 : timeSlot / 2;
      const jitter = Math.random() * 1;
      img.style.animationDelay = `-${baseDelay + rowOffset + jitter}s`;
      container.appendChild(img);
    }
  }
}

function syncEmojiEffect(effectId) {
  const container = document.getElementById(EMOJI_EFFECT_CONTAINER_ID);
  if (effectId === "floating-emojis") {
    const activeContainer = container || ensureEmojiEffectContainer();
    populateEmojiEffectContainer(activeContainer);
    return;
  }
  if (container) {
    container.remove();
  }
}

const COLORS = [
  { id: "forest-green", label: "Green - Forest", hex: "#166534" },
  { id: "aqua-green", label: "Green - Aqua", hex: "#0f9f7a" },
  { id: "pitch-green", label: "Green - Pitch", hex: "#1b8a46" },
  { id: "blue-sky", label: "Blue - Sky", hex: "#1f6fe5" },
  { id: "blue-royal", label: "Blue - Royal", hex: "#0a3db8" },
  { id: "cyan-teal", label: "Teal - Cyan", hex: "#0e8b8f" },
  { id: "bright-teal", label: "Teal - Bright", hex: "#14b8a6" },
  { id: "violet", label: "Purple - Violet", hex: "#6d28d9" },
  { id: "plum", label: "Purple - Plum", hex: "#7e22ce" },
  { id: "ruby-red", label: "Red - Ruby", hex: "#b91c1c" },
  { id: "crimson-red", label: "Red - Crimson", hex: "#dc2626" },
  { id: "magenta", label: "Pink - Magenta", hex: "#d946ef" },
  { id: "deep-pink", label: "Pink - Deep", hex: "#ec4899" },
  { id: "sunset-orange", label: "Orange - Sunset", hex: "#f97316" },
  { id: "amber-orange", label: "Orange - Amber", hex: "#f59e0b" },
  { id: "gold-yellow", label: "Yellow - Gold", hex: "#eab308" },
  { id: "lemon-yellow", label: "Yellow - Lemon", hex: "#facc15" },
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

function svgDataUri(svg) {
  return `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}")`;
}

function createSunSpiralSvgDataUri(opacityPercent) {
  const whiteAlpha = normalizeOpacityPercent(opacityPercent) / 100;
  const cx = 500;
  const cy = 500;
  const numArms = 16;
  const maxR = 780;
  const twist = Math.PI * 1.55;
  const halfWidth = (Math.PI / numArms) * 0.5;
  const steps = 120;

  let paths = "";
  for (let arm = 0; arm < numArms; arm += 1) {
    const baseAngle = (arm / numArms) * 2 * Math.PI - Math.PI / 2;
    const outerEdge = [];
    const innerEdge = [];
    for (let s = 0; s <= steps; s += 1) {
      const r = (s / steps) * maxR;
      const twistAngle = baseAngle + twist * (r / maxR);
      outerEdge.push({
        x: cx + r * Math.cos(twistAngle - halfWidth),
        y: cy + r * Math.sin(twistAngle - halfWidth),
      });
      innerEdge.push({
        x: cx + r * Math.cos(twistAngle + halfWidth),
        y: cy + r * Math.sin(twistAngle + halfWidth),
      });
    }
    let d = `M ${cx} ${cy}`;
    for (const pt of outerEdge) {
      d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    for (const pt of innerEdge.reverse()) {
      d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    d += " Z";
    paths += `<path d="${d}" fill="#ffffff" fill-opacity="${whiteAlpha}"/>`;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
      ${paths}
    </svg>
  `;
  return svgDataUri(svg);
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
  const aliasMap = {
    "royal-blue": "blue-royal",
    "ocean-blue": "blue-sky",
    "sky-blue": "blue-sky",
    "cobalt-blue": "blue-royal",
    "navy-blue": "blue-royal",
  };
  const candidate = aliasMap[colorId] || colorId;
  if (COLORS.some((color) => color.id === candidate)) {
    return candidate;
  }
  return COLORS[0]?.id || "forest-green";
}

function normalizeEffectId(effectId) {
  if (effectId === "sun-rays") return "sun-rays-top-right";
  return EFFECTS.some((effect) => effect.id === effectId) ? effectId : "sun-rays-top-right";
}

const EFFECTS = [
  { id: "sun-rays-center", label: "Sun effect middle" },
  { id: "sun-spiral-center", label: "Sun spiral middle" },
  { id: "sun-rays-top-right", label: "Sun effect top right" },
  { id: "sun-rays-top-left", label: "Sun effect top left" },
  { id: "center-rings", label: "Center circles" },
  { id: "floating-emojis", label: "Floating emojis" },
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
  const whiteStrong = `rgba(255, 255, 255, ${Math.min(0.2, opacityFactor * 12)})`;
  const blackSoft = `rgba(0, 0, 0, ${Math.min(0.08, opacityFactor * 4)})`;
  const blackMid = `rgba(0, 0, 0, ${Math.min(0.14, opacityFactor * 7)})`;
  switch (effectId) {
    case "sun-rays-center":
    case "sun-spiral-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
    case "floating-emojis":
      return `${colorHex}`;
    case "center-rings":
      return `${colorHex}`;
    case "football-pitch":
      return `
    radial-gradient(circle at 50% 50%, ${WHITE_0} 0 10%, ${whiteMid} 10% 10.4%, ${WHITE_0} 10.4% 100%),
    linear-gradient(to right, ${WHITE_0} 49.85%, ${whiteStrong} 49.85% 50.15%, ${WHITE_0} 50.15%),
    repeating-linear-gradient(to bottom, ${whiteSoft} 0 2px, ${WHITE_0} 2px 96px),
    repeating-linear-gradient(to right, rgba(255, 255, 255, 0.03) 0 120px, rgba(0, 0, 0, 0.04) 120px 240px),
    ${colorHex}`;
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
    case "sun-spiral-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
    case "floating-emojis":
      return "none";
    case "center-rings":
      return "none";
    case "football-pitch":
      return "shared-bg-football-pitch 200s linear infinite";
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

function getShortsEffectAnimation(effectId, defaultAnimation) {
  switch (effectId) {
    case "diagonal-flow":
      // Regular slides horizontally; shorts should slide vertically in the 9:16 frame.
      return "shared-bg-diagonal-flow-shorts 170s linear infinite";
    default:
      return defaultAnimation;
  }
}

function getEffectBackgroundSize(effectId) {
  switch (effectId) {
    case "sun-rays-center":
    case "sun-spiral-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
    case "floating-emojis":
      return "100% 100%";
    case "center-rings":
      return "100% 100%";
    case "football-pitch":
      return "100% 100%, 100% 100%, 100% 100%, 240% 100%, 100% 100%";
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
  const spiralSvg = createSunSpiralSvgDataUri(opacityPercent);
  const vignetteOpaque = rgbaFromHex(colorHex, 1);
  const vignetteTransparent = rgbaFromHex(colorHex, 0);
  const vignetteCss = (attr) => `
:root[${ROOT_EFFECT_ATTR}="${attr}"] body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    ${vignetteOpaque} 0%,
    ${vignetteTransparent} 100%
  );
}
`;
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
${vignetteCss("sun-rays-top-right")}
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
${vignetteCss("sun-rays-center")}
:root[${ROOT_EFFECT_ATTR}="sun-rays-center"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "sun-spiral-center":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-spiral-center"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-spiral-center"] body::before {
  content: "";
  position: fixed;
  top: calc(50vh - 320vmax);
  left: calc(50vw - 320vmax);
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background-image: ${spiralSvg};
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
  transform-origin: 320vmax 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}
${vignetteCss("sun-spiral-center")}
:root[${ROOT_EFFECT_ATTR}="sun-spiral-center"] .app {
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
${vignetteCss("sun-rays-top-left")}
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
    ellipse farthest-corner at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 100%
  );
  mask-image: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
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
    case "floating-emojis":
      return `
:root[${ROOT_EFFECT_ATTR}="floating-emojis"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] .shared-bg-emojis {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.03) 50%,
    rgba(0, 0, 0, 0.3) 100%
  );
  mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.03) 50%,
    rgba(0, 0, 0, 0.3) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] body.shorts-mode .shared-bg-emojis {
  inset: auto;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(56.25vh, 100vw);
  height: 100vh;
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.03) 50%,
    rgba(0, 0, 0, 0.3) 100%
  );
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.03) 50%,
    rgba(0, 0, 0, 0.3) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] .shared-bg-emoji {
  position: absolute;
  right: -250px;
  object-fit: contain;
  opacity: clamp(0.06, calc(var(--shared-line-opacity, 1) * 0.25), 0.8);
  filter: grayscale(100%);
  animation: shared-bg-emoji-float linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] body.shorts-mode .shared-bg-emoji {
  right: auto;
  top: -250px;
  animation-name: shared-bg-emoji-float-down;
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "diagonal-flow":
    case "diamond-grid":
      return `
:root[${ROOT_EFFECT_ATTR}="${effectId}"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    ${vignetteOpaque} 0%,
    ${vignetteTransparent} 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] .app {
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

@keyframes shared-bg-sun-spiral-center {
  0% { transform: rotate(0deg) scale(1.08); }
  100% { transform: rotate(360deg) scale(1.08); }
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

@keyframes shared-bg-football-pitch {
  0% {
    background-position: center center, center center, center center, 0 0, center center;
  }
  100% {
    background-position: center center, center center, center center, -240px 0, center center;
  }
}

@keyframes shared-bg-emoji-float {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(-100vw - 420px));
  }
}

@keyframes shared-bg-emoji-float-down {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(calc(100vh + 420px));
  }
}

@keyframes shared-bg-diagonal-flow {
  0% { background-position: 40% 0%, center center; }
  100% { background-position: -40% 0%, center center; }
}

@keyframes shared-bg-diagonal-flow-shorts {
  0% { background-position: 0% 40%, center center; }
  100% { background-position: 0% -40%, center center; }
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
  root.style.setProperty(
    "--shared-effect-opacity",
    String(Math.max(0.08, Math.min(0.45, normalizedOpacity / 10))),
  );
  const background = getEffectBackground(
    normalizedEffectId,
    selectedColor.hex,
    normalizedOpacity,
  );
  const animation = getEffectAnimation(normalizedEffectId);
  const shortsAnimation = getShortsEffectAnimation(normalizedEffectId, animation);
  const backgroundSize = getEffectBackgroundSize(normalizedEffectId);
  ensureStyleTag().textContent = `
:root[${ROOT_COLOR_ATTR}="${normalizedColorId}"][${ROOT_EFFECT_ATTR}="${normalizedEffectId}"] body {
  background: ${background};
  background-size: ${backgroundSize};
  animation: ${animation};
}

:root[${ROOT_COLOR_ATTR}="${normalizedColorId}"][${ROOT_EFFECT_ATTR}="${normalizedEffectId}"] body.shorts-mode {
  background: ${background};
  background-size: ${backgroundSize};
  animation: ${shortsAnimation};
}

:root[${ROOT_COLOR_ATTR}="${normalizedColorId}"][${ROOT_EFFECT_ATTR}="${normalizedEffectId}"] body.shorts-mode .stage::before {
  --shorts-stage-background: ${background};
  --shorts-stage-background-size: ${backgroundSize};
  --shorts-stage-background-animation: ${shortsAnimation};
}

${getEffectKeyframesCss()}
${getEffectExtraCss(normalizedEffectId, selectedColor.hex, normalizedOpacity)}
`;
  syncEmojiEffect(normalizedEffectId);
  try {
    localStorage.setItem(STORAGE_COLOR_KEY, normalizedColorId);
    localStorage.setItem(STORAGE_EFFECT_KEY, normalizedEffectId);
  } catch (_) {
    // Ignore storage failures (private mode / browser restrictions).
  }
}

function readSavedTheme() {
  let colorId = "blue-royal";
  let effectId = "sun-rays";
  try {
    const legacyPreset = localStorage.getItem(LEGACY_PRESET_KEY);
    if (legacyPreset === "blue-sun") {
      colorId = "blue-royal";
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

