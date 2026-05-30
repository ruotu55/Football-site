// js/transitions.js — Page-transition overlay system
// Each transition is registered by id with show()/hide() that return Promises.

import { appState } from "./state.js";
import { waitForPendingImages, waitForDomImages } from "../../.Storage/shared/image-cache.js";

/** Wait for images inside stage-main + any in-flight preloads (with timeout). */
async function waitForTransitionImages() {
  const stage = document.getElementById("stage-main");
  await Promise.all([
    waitForPendingImages(2500),
    waitForDomImages(stage, 2500),
  ]);
}

/* ── GSAP lazy loader (eagerly kicked off at module load) ─────────── */
let gsapLib = null;
let gsapConfigured = false;
function configureGsap(gsap) {
  if (!gsapConfigured && gsap && typeof gsap.defaults === "function") {
    if (gsap.ticker && typeof gsap.ticker.fps === "function") {
      gsap.ticker.fps(60);
    }
    gsap.defaults({ force3D: true });
    gsapConfigured = true;
  }
  return gsap;
}
function loadGsap() {
  if (gsapLib) return Promise.resolve(gsapLib);
  return new Promise((resolve, reject) => {
    if (window.gsap) { gsapLib = configureGsap(window.gsap); return resolve(gsapLib); }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
    s.onload = () => { gsapLib = configureGsap(window.gsap); resolve(gsapLib); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Eagerly preload GSAP so first animation has zero network delay.
loadGsap();

/* ── Phase-duration target (each transition's show/hide is normalised to this) ─── */
const PHASE_DUR = 0.84;
function _runPhase(animPromise) {
  return Promise.all([
    animPromise,
    new Promise(r => setTimeout(r, PHASE_DUR * 1000)),
  ]).then(() => undefined);
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
          scale: 1.05,
          opacity: 1,
          stagger: {
            grid: [rows, this.columns],
            from: 0,
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
            from: 0,
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
  document.body.appendChild(gridOverlayContainer);
  return gridOverlayContainer;
}

function ensureGridOverlay() {
  if (gridOverlayInstance) return gridOverlayInstance;
  const container = ensureGridOverlayContainer();
  gridOverlayInstance = new GridOverlay(container, { rows: 8, columns: 14 });
  return gridOverlayInstance;
}

registry.set("grid-overlay", {
  name: "Grid Overlay",
  async run(updateContentFn) {
    const gsap = await loadGsap();
    const overlay = ensureGridOverlay();

    // Phase 1: show overlay (cover current content)
    await _runPhase(overlay.show(gsap, {
      transformOrigin: "50% 0%",
      duration: 0.4,
      ease: "power3.inOut",
      staggerEach: 0.03,
    }));

    // Phase 2: swap content while overlay covers the screen
    updateContentFn();

    // Phase 2b: wait for images to decode before revealing
    await waitForTransitionImages();

    // Phase 3: hide overlay (reveal new content)
    await _runPhase(overlay.hide(gsap, {
      transformOrigin: "50% 100%",
      duration: 0.4,
      ease: "power2",
      staggerEach: 0.03,
    }));
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
  document.body.appendChild(container);

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

    // Phase 1: cover screen
    await _runPhase(new Promise(resolve => {
      gsap.to(tiles, {
        duration: 0.69,
        width: "100%",
        left: "0%",
        stagger: 0.03,
        ease: "power3.inOut",
        onComplete: resolve,
      });
    }));

    // Phase 2: swap content + wait for images
    updateContentFn();
    await waitForTransitionImages();

    // Phase 3: reveal
    await _runPhase(new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(tiles, {
        duration: 0.69,
        width: "100%",
        left: "100%",
        ease: "power2",
        stagger: -0.03,
      });
      tl.set(tiles, { left: "0", width: "0" });
    }));

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

    // Phase 1: cover screen
    await _runPhase(new Promise(resolve => {
      gsap.to(tiles, {
        duration: 0.69,
        height: "100%",
        top: "0%",
        stagger: 0.03,
        ease: "power3.inOut",
        onComplete: resolve,
      });
    }));

    // Phase 2: swap content + wait for images
    updateContentFn();
    await waitForTransitionImages();

    // Phase 3: reveal
    await _runPhase(new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(tiles, {
        duration: 0.69,
        height: "100%",
        top: "100%",
        ease: "power2",
        stagger: -0.03,
      });
      tl.set(tiles, { top: "0", height: "0" });
    }));

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

  document.body.appendChild(curtainContainer);
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

    // Phase 1: close curtain
    gsap.set(topHalf, { y: "-100%" });
    gsap.set(bottomHalf, { y: "100%" });
    await _runPhase(new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(topHalf, { duration: 0.84, y: "0%", ease: "power3.inOut" }, 0);
      tl.to(bottomHalf, { duration: 0.84, y: "0%", ease: "power3.inOut" }, 0);
    }));

    // Phase 2: swap content + wait for images
    updateContentFn();
    await waitForTransitionImages();

    // Phase 3: open curtain
    await _runPhase(new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(topHalf, { duration: 0.84, y: "-100%", ease: "power2" }, 0);
      tl.to(bottomHalf, { duration: 0.84, y: "100%", ease: "power2" }, 0);
    }));

    container.style.opacity = "0";
    container.style.pointerEvents = "none";
  },
});


/* ── New Transition Effects ──────────────────────────────────── */
const NEW_DUR = 0.84;

const _newOverlays = {};
function _ensureNewOv(cls, build) {
  if (_newOverlays[cls]) return _newOverlays[cls];
  const c = document.createElement("div");
  c.className = cls;
  build(c);
  document.body.appendChild(c);
  _newOverlays[cls] = c;
  return c;
}
function _mkDiv(cls) { const d = document.createElement("div"); d.className = cls; return d; }
function _newRun(cls, build, showFn, hideFn) {
  return async function (updateContentFn) {
    const gsap = await loadGsap();
    const c = _ensureNewOv(cls, build);
    c.style.opacity = "1";
    c.style.pointerEvents = "none";
    await _runPhase(showFn(gsap, c));
    try { updateContentFn(); } catch (e) { console.error("Transition swap error:", e); }
    await waitForTransitionImages();
    await _runPhase(hideFn(gsap, c));
    c.style.opacity = "0";
    c.style.pointerEvents = "none";
  };
}
function _tl(gsap, build) {
  return new Promise(r => { const t = gsap.timeline({ onComplete: r }); build(t); });
}

/* new 1 — Cloud Drift */
registry.set("new-1", {
  name: "Cloud Drift",
  run: _newRun("new1-overlay",
    (c) => { for (let i = 0; i < 14; i++) c.appendChild(_mkDiv("new1-cloud")); c.appendChild(_mkDiv("new1-back")); },
    (gsap, c) => {
      const cl = c.querySelectorAll(".new1-cloud"), b = c.querySelector(".new1-back");
      gsap.set(cl, { scale: 0.35, x: (i) => (i % 2 ? -1 : 1) * (60 + (i % 7) * 6) + "vw", y: (i) => ((i * 53) % 90 - 45) + "vh", opacity: 0 });
      gsap.set(b, { opacity: 0 });
      return _tl(gsap, t => {
        t.to(cl, {
          duration: NEW_DUR * 0.5,
          x: (i) => ((i % 2 ? -1 : 1) * (22 + (i % 7) * 4)) + "vw",
          y: (i) => ((i * 19) % 80 - 40) + "vh",
          scale: 1.7,
          opacity: 1,
          stagger: 0.025,
          ease: "power2.out"
        }, 0);
        t.to(b, { duration: NEW_DUR * 0.35, opacity: 1, ease: "power1.in" }, NEW_DUR * 0.45);
      });
    },
    (gsap, c) => {
      return _tl(gsap, t => {
        t.to(c, { duration: NEW_DUR * 1.0, opacity: 0, ease: "power1.out" }, 0);
      });
    }
  ),
});

/* new 5 — Pixel Pop */
registry.set("new-5", {
  name: "Pixel Pop",
  run: _newRun("new5-overlay",
    (c) => {
      for (let r = 0; r < 8; r++) for (let i = 0; i < 12; i++) {
        const p = _mkDiv("new5-px");
        p.style.setProperty("--h", (((r * 12 + i) * 47) % 360) + "deg");
        c.appendChild(p);
      }
      c.appendChild(_mkDiv("new5-back"));
    },
    (gsap, c) => {
      const px = c.querySelectorAll(".new5-px"), b = c.querySelector(".new5-back");
      gsap.set(px, { scale: 0, opacity: 0, rotation: (i) => (i % 4) * 12 - 18 });
      gsap.set(b, { opacity: 0 });
      return _tl(gsap, t => {
        t.to(px, { duration: NEW_DUR * 0.45, scale: 1.05, opacity: 1, rotation: 0, stagger: { each: 0.0042, from: "random" }, ease: "back.out(2)" }, 0);
        t.to(b, { duration: NEW_DUR * 0.3, opacity: 1, ease: "power1.in" }, NEW_DUR * 0.5);
      });
    },
    (gsap, c) => {
      const px = c.querySelectorAll(".new5-px"), b = c.querySelector(".new5-back");
      return _tl(gsap, t => {
        t.to(b, { duration: NEW_DUR * 0.25, opacity: 0, ease: "power1.out" }, 0);
        t.to(px, { duration: NEW_DUR * 0.45, scale: 0, opacity: 0, rotation: (i) => (i % 4) * 18 - 27, stagger: { each: 0.0044, from: "random" }, ease: "power2.in" }, 0);
      });
    }
  ),
});

/* new 15 — Slab Squash */
registry.set("new-15", {
  name: "Slab Squash",
  run: _newRun("new15-overlay",
    (c) => { for (let i = 0; i < 12; i++) c.appendChild(_mkDiv("new15-slab")); },
    (gsap, c) => {
      const s = c.querySelectorAll(".new15-slab");
      gsap.set(s, { scaleY: 0, transformOrigin: "top center" });
      return _tl(gsap, tl => {
        tl.to(s, { duration: NEW_DUR * 0.5, scaleY: 1, stagger: { amount: NEW_DUR * 0.4, from: "center" }, ease: "power3.out" }, 0);
      });
    },
    (gsap, c) => {
      const s = c.querySelectorAll(".new15-slab");
      gsap.set(s, { transformOrigin: "bottom center" });
      return _tl(gsap, tl => {
        tl.to(s, { duration: NEW_DUR * 0.5, scaleY: 0, stagger: { amount: NEW_DUR * 0.4, from: "center" }, ease: "power3.in" }, 0);
      });
    }
  ),
});

/* new 18 — Wave Bars */
registry.set("new-18", {
  name: "Wave Bars",
  run: _newRun("new18-overlay",
    (c) => { for (let i = 0; i < 10; i++) c.appendChild(_mkDiv("new18-bar")); },
    (gsap, c) => {
      const b = c.querySelectorAll(".new18-bar");
      gsap.set(b, { scaleX: 0, transformOrigin: (i) => i % 2 === 0 ? "left center" : "right center" });
      return _tl(gsap, tl => {
        tl.to(b, { duration: NEW_DUR * 0.5, scaleX: 1, stagger: NEW_DUR * 0.05, ease: "power3.out" }, 0);
      });
    },
    (gsap, c) => {
      const b = c.querySelectorAll(".new18-bar");
      gsap.set(b, { transformOrigin: (i) => i % 2 === 0 ? "right center" : "left center" });
      return _tl(gsap, tl => {
        tl.to(b, { duration: NEW_DUR * 0.5, scaleX: 0, stagger: NEW_DUR * 0.05, ease: "power3.in" }, 0);
      });
    }
  ),
});

/* new 19 — Radial Tiles */
registry.set("new-19", {
  name: "Radial Tiles",
  run: _newRun("new19-overlay",
    (c) => { for (let r = 0; r < 9; r++) for (let i = 0; i < 14; i++) c.appendChild(_mkDiv("new19-cell")); },
    (gsap, c) => {
      const cells = c.querySelectorAll(".new19-cell");
      gsap.set(cells, { scale: 0 });
      return _tl(gsap, tl => {
        tl.to(cells, { duration: NEW_DUR * 0.4, scale: 1.05, stagger: { amount: NEW_DUR * 0.55, grid: [9, 14], from: "center" }, ease: "power2.out" }, 0);
      });
    },
    (gsap, c) => {
      const cells = c.querySelectorAll(".new19-cell");
      return _tl(gsap, tl => {
        tl.to(cells, { duration: NEW_DUR * 0.4, scale: 0, stagger: { amount: NEW_DUR * 0.55, grid: [9, 14], from: "edges" }, ease: "power2.in" }, 0);
      });
    }
  ),
});

/* new 20 — Zigzag Slats */
registry.set("new-20", {
  name: "Zigzag Slats",
  run: _newRun("new20-overlay",
    (c) => { for (let i = 0; i < 12; i++) c.appendChild(_mkDiv("new20-slat")); },
    (gsap, c) => {
      const s = c.querySelectorAll(".new20-slat");
      gsap.set(s, { y: (i) => i % 2 === 0 ? "-110vh" : "110vh" });
      return _tl(gsap, tl => {
        tl.to(s, { duration: NEW_DUR * 0.5, y: "0vh", stagger: NEW_DUR * 0.04, ease: "power3.out" }, 0);
      });
    },
    (gsap, c) => {
      const s = c.querySelectorAll(".new20-slat");
      return _tl(gsap, tl => {
        tl.to(s, { duration: NEW_DUR * 0.5, y: (i) => i % 2 === 0 ? "110vh" : "-110vh", stagger: NEW_DUR * 0.04, ease: "power3.in" }, 0);
      });
    }
  ),
});

/* ── Second batch of new transitions (n2-1..n2-20) ──────────────── */
const N2_DUR = NEW_DUR;

/* Spiral Tiles (grid scale-in from edges) */
registry.set("n2-2", {
  name: "Spiral Tiles",
  run: _newRun("n2-2-overlay",
    (c) => { for (let i = 0; i < 7 * 14; i++) c.appendChild(_mkDiv("n2-2-cell")); },
    (gsap, c) => {
      const cells = c.querySelectorAll(".n2-2-cell");
      gsap.set(cells, { scale: 0, transformOrigin: "50% 50%" });
      return _tl(gsap, t => {
        t.to(cells, { duration: N2_DUR * 0.4, scale: 1.05, stagger: { amount: N2_DUR * 0.45, grid: [7, 14], from: "edges" }, ease: "power2.out" }, 0);
      });
    },
    (gsap, c) => {
      const cells = c.querySelectorAll(".n2-2-cell");
      return _tl(gsap, t => {
        t.to(cells, { duration: N2_DUR * 0.4, scale: 0, stagger: { amount: N2_DUR * 0.45, grid: [7, 14], from: "center" }, ease: "power2.in" }, 0);
      });
    }
  ),
});

/* Diamond Burst (rotated grid cells + back panel) */
registry.set("n2-3", {
  name: "Diamond Burst",
  run: _newRun("n2-3-overlay",
    (c) => {
      for (let i = 0; i < 6 * 11; i++) c.appendChild(_mkDiv("n2-3-dia"));
      c.appendChild(_mkDiv("n2-3-back"));
    },
    (gsap, c) => {
      const cells = c.querySelectorAll(".n2-3-dia");
      const back = c.querySelector(".n2-3-back");
      gsap.set(cells, { scale: 0, rotation: 45 });
      gsap.set(back, { opacity: 0 });
      return _tl(gsap, t => {
        t.to(cells, { duration: N2_DUR * 0.4, scale: 1.4, stagger: { amount: N2_DUR * 0.4, grid: [6, 11], from: "random" }, ease: "back.out(1.6)" }, 0);
        t.to(back, { duration: N2_DUR * 0.3, opacity: 1, ease: "power1.in" }, N2_DUR * 0.3);
      });
    },
    (gsap, c) => {
      const cells = c.querySelectorAll(".n2-3-dia");
      const back = c.querySelector(".n2-3-back");
      return _tl(gsap, t => {
        // Mirror of the entry: back fades out first (revealing the diamond cells beneath),
        // then cells shrink with random stagger using `back.in` — symmetric to the entry's
        // `back.out` pop. Avoids the prior "instant disappear" where cells shrank invisibly
        // behind a still-opaque back and only the final back-fade was perceived.
        t.to(back, { duration: N2_DUR * 0.3, opacity: 0, ease: "power1.out" }, 0);
        t.to(cells, { duration: N2_DUR * 0.4, scale: 0, stagger: { amount: N2_DUR * 0.25, grid: [6, 11], from: "random" }, ease: "back.in(1.6)" }, N2_DUR * 0.15);
      });
    }
  ),
});

/* Slot Drop (vertical strips drop from above) */
registry.set("n2-6", {
  name: "Slot Drop",
  run: _newRun("n2-6-overlay",
    (c) => { for (let i = 0; i < 12; i++) c.appendChild(_mkDiv("n2-6-strip")); },
    (gsap, c) => {
      const s = c.querySelectorAll(".n2-6-strip");
      gsap.set(s, { yPercent: -110 });
      return _tl(gsap, t => {
        t.to(s, { duration: N2_DUR * 0.55, yPercent: 0, stagger: N2_DUR * 0.04, ease: "power4.out" }, 0);
      });
    },
    (gsap, c) => {
      const s = c.querySelectorAll(".n2-6-strip");
      return _tl(gsap, t => {
        t.to(s, { duration: N2_DUR * 0.55, yPercent: 110, stagger: N2_DUR * 0.04, ease: "power3.in" }, 0);
      });
    }
  ),
});

/* Door Slide (left/right halves meet in middle) */
registry.set("n2-7", {
  name: "Door Slide",
  run: _newRun("n2-7-overlay",
    (c) => { c.appendChild(_mkDiv("n2-7-left")); c.appendChild(_mkDiv("n2-7-right")); },
    (gsap, c) => {
      const l = c.querySelector(".n2-7-left"), r = c.querySelector(".n2-7-right");
      gsap.set(l, { xPercent: -100 });
      gsap.set(r, { xPercent: 100 });
      return _tl(gsap, t => {
        t.to(l, { duration: N2_DUR * 1.0, xPercent: 0, ease: "power3.inOut" }, 0);
        t.to(r, { duration: N2_DUR * 1.0, xPercent: 0, ease: "power3.inOut" }, 0);
      });
    },
    (gsap, c) => {
      const l = c.querySelector(".n2-7-left"), r = c.querySelector(".n2-7-right");
      return _tl(gsap, t => {
        t.to(l, { duration: N2_DUR * 1.0, xPercent: -100, ease: "power3.inOut" }, 0);
        t.to(r, { duration: N2_DUR * 1.0, xPercent: 100, ease: "power3.inOut" }, 0);
      });
    }
  ),
});

/* Vertical Blinds (scaleY alternating origins) */
registry.set("n2-8", {
  name: "Vertical Blinds",
  run: _newRun("n2-8-overlay",
    (c) => { for (let i = 0; i < 12; i++) c.appendChild(_mkDiv("n2-8-blind")); },
    (gsap, c) => {
      const b = c.querySelectorAll(".n2-8-blind");
      gsap.set(b, { scaleY: 0, transformOrigin: (i) => i % 2 === 0 ? "center top" : "center bottom" });
      return _tl(gsap, t => {
        t.to(b, { duration: N2_DUR * 0.5, scaleY: 1, stagger: N2_DUR * 0.035, ease: "power3.out" }, 0);
      });
    },
    (gsap, c) => {
      const b = c.querySelectorAll(".n2-8-blind");
      gsap.set(b, { transformOrigin: (i) => i % 2 === 0 ? "center bottom" : "center top" });
      return _tl(gsap, t => {
        t.to(b, { duration: N2_DUR * 0.5, scaleY: 0, stagger: N2_DUR * 0.035, ease: "power3.in" }, 0);
      });
    }
  ),
});

/* Triangle Wedges (4 clipped triangles slide in) */
registry.set("n2-11", {
  name: "Triangle Wedges",
  run: _newRun("n2-11-overlay",
    (c) => { ["t","r","b","l"].forEach(s => c.appendChild(_mkDiv("n2-11-tri n2-11-tri-" + s))); },
    (gsap, c) => {
      const tT = c.querySelector(".n2-11-tri-t");
      const tR = c.querySelector(".n2-11-tri-r");
      const tB = c.querySelector(".n2-11-tri-b");
      const tL = c.querySelector(".n2-11-tri-l");
      gsap.set(tT, { yPercent: -110 });
      gsap.set(tR, { xPercent: 110 });
      gsap.set(tB, { yPercent: 110 });
      gsap.set(tL, { xPercent: -110 });
      return _tl(gsap, t => {
        t.to(tT, { duration: N2_DUR * 1.0, yPercent: 0, ease: "power3.inOut" }, 0);
        t.to(tR, { duration: N2_DUR * 1.0, xPercent: 0, ease: "power3.inOut" }, 0);
        t.to(tB, { duration: N2_DUR * 1.0, yPercent: 0, ease: "power3.inOut" }, 0);
        t.to(tL, { duration: N2_DUR * 1.0, xPercent: 0, ease: "power3.inOut" }, 0);
      });
    },
    (gsap, c) => {
      const tT = c.querySelector(".n2-11-tri-t");
      const tR = c.querySelector(".n2-11-tri-r");
      const tB = c.querySelector(".n2-11-tri-b");
      const tL = c.querySelector(".n2-11-tri-l");
      return _tl(gsap, t => {
        t.to(tT, { duration: N2_DUR * 1.0, yPercent: -110, ease: "power3.inOut" }, 0);
        t.to(tR, { duration: N2_DUR * 1.0, xPercent: 110, ease: "power3.inOut" }, 0);
        t.to(tB, { duration: N2_DUR * 1.0, yPercent: 110, ease: "power3.inOut" }, 0);
        t.to(tL, { duration: N2_DUR * 1.0, xPercent: -110, ease: "power3.inOut" }, 0);
      });
    }
  ),
});

/* Quadrant Slam (4 corners → center) */
registry.set("n2-13", {
  name: "Quadrant Slam",
  run: _newRun("n2-13-overlay",
    (c) => { ["tl","tr","bl","br"].forEach(s => c.appendChild(_mkDiv("n2-13-q n2-13-q-" + s))); },
    (gsap, c) => {
      const tl = c.querySelector(".n2-13-q-tl");
      const tr = c.querySelector(".n2-13-q-tr");
      const bl = c.querySelector(".n2-13-q-bl");
      const br = c.querySelector(".n2-13-q-br");
      gsap.set(tl, { xPercent: -100, yPercent: -100 });
      gsap.set(tr, { xPercent: 100, yPercent: -100 });
      gsap.set(bl, { xPercent: -100, yPercent: 100 });
      gsap.set(br, { xPercent: 100, yPercent: 100 });
      return _tl(gsap, t => {
        t.to([tl, tr, bl, br], { duration: N2_DUR * 1.0, xPercent: 0, yPercent: 0, ease: "power3.inOut" }, 0);
      });
    },
    (gsap, c) => {
      const tl = c.querySelector(".n2-13-q-tl");
      const tr = c.querySelector(".n2-13-q-tr");
      const bl = c.querySelector(".n2-13-q-bl");
      const br = c.querySelector(".n2-13-q-br");
      return _tl(gsap, t => {
        t.to(tl, { duration: N2_DUR * 1.0, xPercent: -100, yPercent: -100, ease: "power3.inOut" }, 0);
        t.to(tr, { duration: N2_DUR * 1.0, xPercent: 100, yPercent: -100, ease: "power3.inOut" }, 0);
        t.to(bl, { duration: N2_DUR * 1.0, xPercent: -100, yPercent: 100, ease: "power3.inOut" }, 0);
        t.to(br, { duration: N2_DUR * 1.0, xPercent: 100, yPercent: 100, ease: "power3.inOut" }, 0);
      });
    }
  ),
});

/* Checker Flash (even/odd cells with split timing) */
registry.set("n2-15", {
  name: "Checker Flash",
  run: _newRun("n2-15-overlay",
    (c) => {
      for (let r = 0; r < 8; r++) for (let i = 0; i < 12; i++) {
        const d = _mkDiv("n2-15-cell");
        if ((r + i) % 2) d.classList.add("n2-15-odd");
        c.appendChild(d);
      }
    },
    (gsap, c) => {
      const ev = c.querySelectorAll(".n2-15-cell:not(.n2-15-odd)");
      const od = c.querySelectorAll(".n2-15-cell.n2-15-odd");
      gsap.set([...ev, ...od], { scale: 0 });
      return _tl(gsap, t => {
        t.to(ev, { duration: N2_DUR * 0.4, scale: 1.05, stagger: { each: 0.006, from: "start" }, ease: "power3.out" }, 0);
        t.to(od, { duration: N2_DUR * 0.4, scale: 1.05, stagger: { each: 0.006, from: "end" }, ease: "power3.out" }, N2_DUR * 0.15);
      });
    },
    (gsap, c) => {
      const ev = c.querySelectorAll(".n2-15-cell:not(.n2-15-odd)");
      const od = c.querySelectorAll(".n2-15-cell.n2-15-odd");
      return _tl(gsap, t => {
        t.to(od, { duration: N2_DUR * 0.4, scale: 0, stagger: { each: 0.006, from: "start" }, ease: "power3.in" }, 0);
        t.to(ev, { duration: N2_DUR * 0.4, scale: 0, stagger: { each: 0.006, from: "end" }, ease: "power3.in" }, N2_DUR * 0.1);
      });
    }
  ),
});

/* Snake Path (cells appear in serpentine order) */
registry.set("n2-17", {
  name: "Snake Path",
  run: _newRun("n2-17-overlay",
    (c) => {
      const ROWS = 7, COLS = 14;
      for (let i = 0; i < ROWS * COLS; i++) c.appendChild(_mkDiv("n2-17-cell"));
      const order = [];
      for (let r = 0; r < ROWS; r++) {
        for (let i = 0; i < COLS; i++) {
          order.push(r * COLS + (r % 2 === 0 ? i : (COLS - 1 - i)));
        }
      }
      c._snakeOrder = order;
    },
    (gsap, c) => {
      const cells = c.querySelectorAll(".n2-17-cell");
      const ordered = (c._snakeOrder || []).map(i => cells[i]).filter(Boolean);
      gsap.set(cells, { scale: 0 });
      return _tl(gsap, t => {
        t.to(ordered, { duration: N2_DUR * 0.4, scale: 1.05, stagger: 0.005, ease: "power2.out" }, 0);
      });
    },
    (gsap, c) => {
      const cells = c.querySelectorAll(".n2-17-cell");
      const ordered = (c._snakeOrder || []).map(i => cells[i]).filter(Boolean);
      return _tl(gsap, t => {
        t.to(ordered, { duration: N2_DUR * 0.4, scale: 0, stagger: 0.005, ease: "power2.in" }, 0);
      });
    }
  ),
});

/* ── Public API ────────────────────────────────────────────────────── */

/** Current transition settings (persisted with script saves). */
export const transitionSettings = {
  effect: "bars-left",
  random: false,
};

function isProdModeFromUi() {
  const btn = appState.els?.prodBtn || document.getElementById("prod-btn");
  return btn?.getAttribute("aria-pressed") === "true";
}

/** Outside PROD, blank effect falls back to grid overlay. In PROD, empty means no implicit selection. */
function resolveRuntimeTransitionEffectId(effectId) {
  if (effectId) return effectId;
  return isProdModeFromUi() ? "" : "grid-overlay";
}

/**
 * Run the currently selected transition.
 * `updateContentFn` is called at the midpoint (while overlay is covering the screen).
 * Returns a Promise that resolves when the full transition (show + hide) is done.
 * If effect is "none", calls updateContentFn immediately and resolves.
 */
let transitionRunning = false;

export async function runTransition(updateContentFn, forceEffectId = null) {
  if (transitionRunning) {
    // If a transition is already in progress, just swap content immediately
    updateContentFn();
    return;
  }

  let effectId;
  if (forceEffectId) {
    effectId = forceEffectId;
  } else {
    effectId = transitionSettings.effect;
    if (transitionSettings.random) {
      const ids = getTransitionIds();
      if (ids.length > 0) {
        effectId = ids[Math.floor(Math.random() * ids.length)];
      }
    }
    effectId = resolveRuntimeTransitionEffectId(effectId);
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
    if (!transitionSettings.effect) {
      transitionSettings.effect = "grid-overlay";
    }
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
