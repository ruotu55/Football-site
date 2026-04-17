// js/transitions.js — Page-transition overlay system
// Each transition is registered by id with show()/hide() that return Promises.

import { appState } from "./state.js";

/* ── GSAP lazy loader ──────────────────────────────────────────────── */
let gsapLib = null;
function loadGsap() {
  if (gsapLib) return Promise.resolve(gsapLib);
  return new Promise((resolve, reject) => {
    if (window.gsap) { gsapLib = window.gsap; return resolve(gsapLib); }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
    s.onload = () => { gsapLib = window.gsap; resolve(gsapLib); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ── Transition registry ───────────────────────────────────────────── */
const registry = new Map();

export function getTransitionIds() {
  return [...registry.keys()];
}

export function getTransitionName(id) {
  return registry.get(id)?.name ?? id;
}

/* ── Grid Overlay transition (ported from user reference code) ────── */
class GridOverlayCell {
  constructor(row, column) {
    this.el = document.createElement("div");
    this.row = row;
    this.column = column;
  }
}

class GridOverlay {
  constructor(containerEl, opts) {
    this.el = containerEl;
    this.rows = opts.rows || 8;
    this.columns = opts.columns || 14;
    this.el.style.setProperty("--gt-columns", this.columns);
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) {
        const cell = new GridOverlayCell(r, c);
        this.cells.push(cell);
        this.el.appendChild(cell.el);
      }
    }
  }

  async show(gsap, cfg = {}) {
    const dur   = cfg.duration ?? 0.4;
    const ease  = cfg.ease ?? "power3.inOut";
    const origin = cfg.transformOrigin ?? "50% 0%";
    const each  = cfg.staggerEach ?? 0.03;
    const rows  = this.rows;

    this.el.style.opacity = "1";
    this.el.style.pointerEvents = "none";

    return new Promise(resolve => {
      gsap.fromTo(
        this.cells.map(c => c.el),
        { scale: 0, opacity: 0, transformOrigin: origin },
        {
          duration: dur,
          ease,
          scale: 1.01,
          opacity: 1,
          stagger: {
            grid: [rows, this.columns],
            from: "start",
            axis: "y",
            each,
            ease: "none",
          },
          onComplete: resolve,
        }
      );
    });
  }

  async hide(gsap, cfg = {}) {
    const dur   = cfg.duration ?? 0.4;
    const ease  = cfg.ease ?? "power2";
    const origin = cfg.transformOrigin ?? "50% 100%";
    const each  = cfg.staggerEach ?? 0.03;
    const rows  = this.rows;

    return new Promise(resolve => {
      gsap.fromTo(
        this.cells.map(c => c.el),
        { transformOrigin: origin },
        {
          duration: dur,
          ease,
          scale: 0,
          opacity: 0,
          stagger: {
            grid: [rows, this.columns],
            from: "start",
            axis: "y",
            each,
            ease: "none",
          },
          onComplete: () => {
            this.el.style.opacity = "0";
            this.el.style.pointerEvents = "none";
            resolve();
          },
        }
      );
    });
  }

  destroy() {
    this.el.replaceChildren();
    this.cells = [];
  }
}

let gridOverlayInstance = null;
let gridOverlayContainer = null;

function ensureGridOverlayContainer() {
  if (gridOverlayContainer) return gridOverlayContainer;
  gridOverlayContainer = document.createElement("div");
  gridOverlayContainer.className = "grid-transition-overlay";
  document.querySelector(".app")?.appendChild(gridOverlayContainer)
    ?? document.body.appendChild(gridOverlayContainer);
  return gridOverlayContainer;
}

function ensureGridOverlay() {
  if (gridOverlayInstance) return gridOverlayInstance;
  const container = ensureGridOverlayContainer();
  // Shorts: tall narrow viewport → more rows, fewer columns
  const isShorts = document.body.classList.contains("shorts-mode");
  const rows = isShorts ? 12 : 8;
  const cols = isShorts ? 6 : 14;
  gridOverlayInstance = new GridOverlay(container, { rows, columns: cols });
  return gridOverlayInstance;
}

registry.set("grid-overlay", {
  name: "Grid Overlay",
  async run(updateContentFn) {
    const gsap = await loadGsap();
    const overlay = ensureGridOverlay();

    // Phase 1: show overlay (cover current content)
    await overlay.show(gsap, {
      transformOrigin: "50% 0%",
      duration: 0.4,
      ease: "power3.inOut",
      staggerEach: 0.03,
    });

    // Phase 2: swap content while overlay covers the screen
    updateContentFn();

    // Phase 3: hide overlay (reveal new content)
    await overlay.hide(gsap, {
      transformOrigin: "50% 100%",
      duration: 0.4,
      ease: "power2",
      staggerEach: 0.03,
    });
  },
});

/* ── Bars transition (horizontal / vertical tile wipes) ────────────── */
const BARS_COUNT = 6;

let barsLeftContainer = null;
let barsTopContainer = null;

function ensureBarsContainer(direction) {
  if (direction === "left" && barsLeftContainer) return barsLeftContainer;
  if (direction === "top" && barsTopContainer) return barsTopContainer;

  const container = document.createElement("div");
  container.className = `bars-transition-overlay bars-${direction}`;
  for (let i = 0; i < BARS_COUNT; i++) {
    container.appendChild(document.createElement("span"));
  }
  document.querySelector(".app")?.appendChild(container)
    ?? document.body.appendChild(container);

  if (direction === "left") barsLeftContainer = container;
  else barsTopContainer = container;
  return container;
}

registry.set("bars-left", {
  name: "Bars from Left",
  async run(updateContentFn) {
    const gsap = await loadGsap();
    const container = ensureBarsContainer("left");
    const tiles = container.querySelectorAll("span");

    container.style.opacity = "1";
    container.style.pointerEvents = "none";

    await new Promise(resolve => {
      const tl = gsap.timeline({ ease: "power3.inOut", onComplete: resolve });
      tl.to(tiles, {
        duration: 0.4,
        width: "100%",
        left: "0%",
        stagger: 0.03,
      });
      tl.call(() => updateContentFn());
      tl.to(tiles, {
        duration: 0.4,
        width: "100%",
        left: "100%",
        ease: "power2",
        stagger: -0.03,
      });
      tl.set(tiles, { left: "0", width: "0" });
    });

    container.style.opacity = "0";
    container.style.pointerEvents = "none";
  },
});

registry.set("bars-top", {
  name: "Bars from Top",
  async run(updateContentFn) {
    const gsap = await loadGsap();
    const container = ensureBarsContainer("top");
    const tiles = container.querySelectorAll("span");

    container.style.opacity = "1";
    container.style.pointerEvents = "none";

    await new Promise(resolve => {
      const tl = gsap.timeline({ ease: "power3.inOut", onComplete: resolve });
      tl.to(tiles, {
        duration: 0.4,
        height: "100%",
        top: "0%",
        stagger: 0.03,
      });
      tl.call(() => updateContentFn());
      tl.to(tiles, {
        duration: 0.4,
        height: "100%",
        top: "100%",
        ease: "power2",
        stagger: -0.03,
      });
      tl.set(tiles, { top: "0", height: "0" });
    });

    container.style.opacity = "0";
    container.style.pointerEvents = "none";
  },
});

/* ── Curtain Close transition (top/bottom panels meet in middle) ──── */
let curtainContainer = null;

function ensureCurtainContainer() {
  if (curtainContainer) return curtainContainer;
  curtainContainer = document.createElement("div");
  curtainContainer.className = "curtain-transition-overlay";

  const top = document.createElement("div");
  top.className = "curtain-half curtain-top";
  const bottom = document.createElement("div");
  bottom.className = "curtain-half curtain-bottom";

  curtainContainer.appendChild(top);
  curtainContainer.appendChild(bottom);

  document.querySelector(".app")?.appendChild(curtainContainer)
    ?? document.body.appendChild(curtainContainer);
  return curtainContainer;
}

registry.set("curtain-close", {
  name: "Curtain Close",
  async run(updateContentFn) {
    const gsap = await loadGsap();
    const container = ensureCurtainContainer();
    const topHalf = container.querySelector(".curtain-top");
    const bottomHalf = container.querySelector(".curtain-bottom");

    container.style.opacity = "1";
    container.style.pointerEvents = "none";

    await new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });

      tl.set(topHalf, { y: "-100%" });
      tl.set(bottomHalf, { y: "100%" });

      // Close
      tl.to(topHalf, { duration: 0.4, y: "0%", ease: "power3.inOut" }, 0);
      tl.to(bottomHalf, { duration: 0.4, y: "0%", ease: "power3.inOut" }, 0);

      // Swap content while fully covered
      tl.call(() => updateContentFn(), null, 0.45);

      // Open
      tl.to(topHalf, { duration: 0.4, y: "-100%", ease: "power2" }, 0.6);
      tl.to(bottomHalf, { duration: 0.4, y: "100%", ease: "power2" }, 0.6);
    });

    container.style.opacity = "0";
    container.style.pointerEvents = "none";
  },
});


/* ── Skew Wipe transition (diagonal wipe across screen) ──────────── */
let skewContainer = null;

function ensureSkewContainer() {
  if (skewContainer) return skewContainer;
  skewContainer = document.createElement("div");
  skewContainer.className = "skew-transition-overlay";
  document.querySelector(".app")?.appendChild(skewContainer)
    ?? document.body.appendChild(skewContainer);
  return skewContainer;
}

registry.set("skew-wipe", {
  name: "Skew Wipe",
  async run(updateContentFn) {
    const gsap = await loadGsap();
    const el = ensureSkewContainer();

    el.style.opacity = "1";
    el.style.pointerEvents = "none";

    await new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });

      // Start: hidden on the left, skewed
      tl.set(el, { scaleX: 0, skewX: -40, transformOrigin: "left" });

      // Wipe in: scale to full width, straighten skew
      tl.to(el, {
        duration: 0.5,
        scaleX: 1,
        skewX: 0,
        ease: "cubic-bezier(0.770, 0.000, 0.175, 1.000)",
      });

      // Swap content while fully covered
      tl.call(() => updateContentFn());

      // Switch origin to right for exit
      tl.set(el, { transformOrigin: "right" });

      // Wipe out: scale away to the right with opposite skew
      tl.to(el, {
        duration: 0.5,
        scaleX: 0,
        skewX: 40,
        ease: "cubic-bezier(0.770, 0.000, 0.175, 1.000)",
      });
    });

    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  },
});

/* ── Public API ────────────────────────────────────────────────────── */

/** Current transition settings (persisted with script saves). */
export const transitionSettings = {
  effect: "",
  random: false,
};

/**
 * Run the currently selected transition.
 * `updateContentFn` is called at the midpoint (while overlay is covering the screen).
 * Returns a Promise that resolves when the full transition (show + hide) is done.
 * If effect is "none", calls updateContentFn immediately and resolves.
 */
let transitionRunning = false;

export async function runTransition(updateContentFn) {
  if (transitionRunning) {
    // If a transition is already in progress, just swap content immediately
    updateContentFn();
    return;
  }

  let effectId = transitionSettings.effect;

  if (transitionSettings.random) {
    const ids = getTransitionIds();
    if (ids.length > 0) {
      effectId = ids[Math.floor(Math.random() * ids.length)];
    }
  }

  const entry = registry.get(effectId);
  if (!entry) {
    updateContentFn();
    return;
  }

  transitionRunning = true;
  try {
    await entry.run(updateContentFn);
  } finally {
    transitionRunning = false;
  }
}

/* ── UI wiring (called once from app.js) ───────────────────────────── */

export function initTransitionsUI() {
  const { els } = appState;
  const btn = document.getElementById("btn-transitions-control");
  const panel = document.getElementById("transitions-settings");
  const effectSel = document.getElementById("in-transition-effect");
  const randomChk = document.getElementById("in-transition-random");

  if (!btn || !panel) return;

  // Store refs on appState.els for dom-bindings pattern
  els.btnTransitionsControl = btn;
  els.transitionsSettings = panel;
  els.inTransitionEffect = effectSel;
  els.inTransitionRandom = randomChk;

  // Toggle panel visibility
  btn.addEventListener("click", () => {
    const open = panel.style.display === "flex";
    panel.style.display = open ? "none" : "flex";
  });

  // Sync UI -> settings
  if (effectSel) {
    effectSel.value = transitionSettings.effect;
    effectSel.addEventListener("change", () => {
      transitionSettings.effect = effectSel.value;
    });
  }
  if (randomChk) {
    randomChk.checked = transitionSettings.random;
    randomChk.addEventListener("change", () => {
      transitionSettings.random = randomChk.checked;
    });
  }
}

/** Apply settings from a loaded script save. */
export function applyTransitionSettings(saved) {
  if (!saved) return;
  transitionSettings.effect = saved.effect || "grid-overlay";
  transitionSettings.random = !!saved.random;

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
