// js/render-test-clips-ui.js — menu to render short test clips (intro, transitions, etc.)

import { RENDER_TEST_SECTIONS } from "./render-segments.js";

let panel = null;
let onRenderClip = null;

function ensurePanel() {
  if (panel) return;
  const style = document.createElement("style");
  style.textContent = `
    #render-test-clips-panel {
      position: fixed;
      right: calc(22.5rem + 5vw);
      top: calc(1.5rem + 5.35rem);
      bottom: auto;
      z-index: 10050;
      width: min(22rem, calc(100vw - 2rem));
      max-height: min(70vh, 32rem);
      overflow: auto;
      display: none;
      flex-direction: column;
      gap: 0;
      background: rgba(18, 20, 26, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
      color: #fff;
      font-family: inherit;
      backdrop-filter: blur(10px);
    }
    #render-test-clips-panel.open { display: flex; }
    #render-test-clips-panel .rtc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      position: sticky;
      top: 0;
      background: rgba(18, 20, 26, 0.98);
      z-index: 1;
    }
    #render-test-clips-panel .rtc-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    #render-test-clips-panel .rtc-close {
      border: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      padding: 0 4px;
    }
    #render-test-clips-panel .rtc-section {
      padding: 10px 12px 4px;
    }
    #render-test-clips-panel .rtc-section-title {
      margin: 0 0 6px;
      font-size: 0.68rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.45);
    }
    #render-test-clips-panel .rtc-clip {
      display: block;
      width: 100%;
      text-align: left;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      color: #fff;
      padding: 10px 12px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    #render-test-clips-panel .rtc-clip:hover:not(:disabled) {
      background: rgba(55, 214, 122, 0.12);
      border-color: rgba(55, 214, 122, 0.35);
    }
    #render-test-clips-panel .rtc-clip:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    #render-test-clips-panel .rtc-clip-label {
      display: block;
      font-size: 0.88rem;
      font-weight: 700;
      margin-bottom: 2px;
    }
    #render-test-clips-panel .rtc-clip-hint {
      display: block;
      font-size: 0.72rem;
      opacity: 0.65;
      line-height: 1.3;
    }
    .render-test-clips-btn {
      bottom: auto;
    }
    body.play-video-active .render-test-clips-btn,
    body.play-video-active #render-test-clips-panel {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  panel = document.createElement("div");
  panel.id = "render-test-clips-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Render test clips");

  const head = document.createElement("div");
  head.className = "rtc-head";
  head.innerHTML = `<p class="rtc-title">Render test clips</p>`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "rtc-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.onclick = () => panel.classList.remove("open");
  head.appendChild(closeBtn);
  panel.appendChild(head);

  for (const section of RENDER_TEST_SECTIONS) {
    const sec = document.createElement("div");
    sec.className = "rtc-section";
    const title = document.createElement("p");
    title.className = "rtc-section-title";
    title.textContent = section.title;
    sec.appendChild(title);

    for (const clip of section.clips) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rtc-clip";
      btn.dataset.segment = clip.id;
      btn.innerHTML = `<span class="rtc-clip-label">${clip.label}</span><span class="rtc-clip-hint">${clip.hint}</span>`;
      btn.onclick = () => {
        panel.classList.remove("open");
        if (typeof onRenderClip === "function") onRenderClip(clip.id, clip.label);
      };
      sec.appendChild(btn);
    }
    panel.appendChild(sec);
  }

  document.body.appendChild(panel);

  document.addEventListener("click", (ev) => {
    if (!panel.classList.contains("open")) return;
    const toggle = document.getElementById("render-test-clips-btn");
    if (panel.contains(ev.target) || toggle?.contains(ev.target)) return;
    panel.classList.remove("open");
  });
}

export function initRenderTestClipsUi({ renderClipFn, isBusyFn } = {}) {
  ensurePanel();
  onRenderClip = renderClipFn;

  const toggle = document.getElementById("render-test-clips-btn");
  if (!toggle) return;

  toggle.onclick = () => {
    if (typeof isBusyFn === "function" && isBusyFn()) return;
    panel.classList.toggle("open");
  };
}

export function setRenderTestClipsBusy(busy) {
  ensurePanel();
  const toggle = document.getElementById("render-test-clips-btn");
  if (toggle) toggle.disabled = !!busy;
  panel.querySelectorAll(".rtc-clip").forEach((btn) => {
    btn.disabled = !!busy;
  });
  if (busy) panel.classList.remove("open");
}
