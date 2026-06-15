/**
 * PREP PANEL slim replacement (2026-06-13). The browser transition overlays
 * are gone (Remotion owns transitions now); this file only preserves the
 * script-schema fields (`transitions: {effect, random}`) and the Look-tab
 * select so captureCurrentScriptObject()/applyScriptObject() stay
 * byte-compatible with every existing save.
 */
export const transitionSettings = {
  effect: "grid-overlay",
  random: false,
};

export function initTransitionsUI() {
  const effectSel = document.getElementById("in-transition-effect");
  if (!effectSel) return;
  effectSel.value = transitionSettings.effect;
  effectSel.addEventListener("change", () => {
    transitionSettings.effect = effectSel.value || "grid-overlay";
  });
}

export function applyTransitionSettings(saved) {
  if (!saved) return;
  transitionSettings.random = !!saved.random;
  transitionSettings.effect = saved.effect || "grid-overlay";
  const effectSel = document.getElementById("in-transition-effect");
  const randomChk = document.getElementById("in-transition-random");
  if (effectSel) effectSel.value = transitionSettings.effect;
  if (randomChk) randomChk.checked = transitionSettings.random;
}

/** Snapshot current settings for script save. */
export function captureTransitionSettings() {
  return {
    effect: transitionSettings.effect,
    random: transitionSettings.random,
  };
}
