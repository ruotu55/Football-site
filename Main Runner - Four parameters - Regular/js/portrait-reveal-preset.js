/** Four-params portrait: reveal presets **1–10** (slider), soft fade family. */

export const PORTRAIT_REVEAL_PRESET_STORAGE_KEY =
  "footballQuiz_fourParams_portraitRevealPreset_v6";

const PORTRAIT_REVEAL_PRESET_MIN = 1;
const PORTRAIT_REVEAL_PRESET_MAX = 10;

/** @returns {number} 1–10 */
export function normalizePortraitRevealPreset(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 1;
  /* Legacy v5 slider stored 4 / 5 → same two styles now numbered 1 / 2 */
  if (v === 4) return 1;
  if (v === 5) return 2;
  return Math.min(PORTRAIT_REVEAL_PRESET_MAX, Math.max(PORTRAIT_REVEAL_PRESET_MIN, v));
}

export function getPortraitRevealPreset() {
  try {
    const raw = window.localStorage?.getItem(PORTRAIT_REVEAL_PRESET_STORAGE_KEY);
    return normalizePortraitRevealPreset(parseInt(String(raw), 10));
  } catch {
    /* ignore */
  }
  return 1;
}

export function setPortraitRevealPreset(n) {
  const v = normalizePortraitRevealPreset(n);
  try {
    window.localStorage?.setItem(PORTRAIT_REVEAL_PRESET_STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
  return v;
}

/** DOM only (does not write storage — use on every render). */
export function applyPortraitRevealPresetClass(portraitCard, presetRaw) {
  if (!portraitCard) return 1;
  const v = normalizePortraitRevealPreset(presetRaw);
  for (let i = 1; i <= PORTRAIT_REVEAL_PRESET_MAX; i += 1) {
    portraitCard.classList.remove(`career-portrait-reveal-preset-${i}`);
  }
  portraitCard.classList.add(`career-portrait-reveal-preset-${v}`);
  portraitCard.dataset.portraitRevealPreset = String(v);
  return v;
}

const PORTRAIT_REVEAL_PRESET_TITLES = {
  1: "Soft fade",
  2: "Fade + grow",
  3: "Fade + shrink",
  4: "Slow fade",
  5: "Quick fade",
  6: "Fade breathe",
  7: "Fade + rise",
  8: "Fade + settle",
  9: "Blur fade",
  10: "Fade + drift",
};

function presetTitle(n) {
  const v = normalizePortraitRevealPreset(n);
  return PORTRAIT_REVEAL_PRESET_TITLES[v] || `Reveal ${v}`;
}

export function syncPortraitRevealPickerUI(pickerRoot, activePreset) {
  if (!pickerRoot) return;
  const slider = pickerRoot.querySelector(".career-portrait-reveal-picker__slider");
  const valueEl = pickerRoot.querySelector(".career-portrait-reveal-picker__value");
  const titleEl = pickerRoot.querySelector(".career-portrait-reveal-picker__title");
  const v = normalizePortraitRevealPreset(activePreset);
  if (slider) slider.value = String(v);
  if (valueEl) valueEl.textContent = String(v);
  if (titleEl) titleEl.textContent = presetTitle(v);
}

/** Back-compat name for callers. */
export function syncPortraitRevealPickerPressedState(pickerRoot, activePreset) {
  syncPortraitRevealPickerUI(pickerRoot, activePreset);
}

/**
 * Slider picker above the portrait card (values **1–10**).
 * @param {HTMLElement} portraitCard
 * @returns {HTMLDivElement}
 */
export function createPortraitRevealPicker(portraitCard) {
  const root = document.createElement("div");
  root.className = "career-portrait-reveal-picker";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Portrait reveal animation (1–10)");

  const label = document.createElement("span");
  label.className = "career-portrait-reveal-picker__label";
  label.textContent = "Reveal";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(PORTRAIT_REVEAL_PRESET_MIN);
  slider.max = String(PORTRAIT_REVEAL_PRESET_MAX);
  slider.step = "1";
  slider.className = "career-portrait-reveal-picker__slider";
  slider.setAttribute("aria-label", "Reveal animation (1–10)");

  const valueEl = document.createElement("span");
  valueEl.className = "career-portrait-reveal-picker__value";
  valueEl.setAttribute("aria-hidden", "true");

  const titleEl = document.createElement("span");
  titleEl.className = "career-portrait-reveal-picker__title";
  titleEl.setAttribute("aria-live", "polite");

  const active0 = getPortraitRevealPreset();
  slider.value = String(active0);
  valueEl.textContent = String(active0);
  titleEl.textContent = presetTitle(active0);

  const onChange = () => {
    if (!portraitCard?.isConnected) return;
    const n = normalizePortraitRevealPreset(parseInt(slider.value, 10));
    setPortraitRevealPreset(n);
    applyPortraitRevealPresetClass(portraitCard, n);
    slider.value = String(n);
    valueEl.textContent = String(n);
    titleEl.textContent = presetTitle(n);
  };

  slider.addEventListener("input", onChange);
  slider.addEventListener("change", onChange);

  root.appendChild(label);
  root.appendChild(slider);
  root.appendChild(valueEl);
  root.appendChild(titleEl);

  return root;
}
