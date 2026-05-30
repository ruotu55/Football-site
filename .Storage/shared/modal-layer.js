/**
 * modal-layer.js — shared by all runners
 *
 * Guarantees that while ANY menu/modal/dialog is open, clicks cannot reach
 * buttons behind it (pitch slot controls, control panel, FABs, etc.).
 *
 * Loads before app.js. Exposes window.FCModalLayer.
 */
(function () {
  if (window.__fcModalLayerInstalled) return;
  window.__fcModalLayerInstalled = true;

  const MODAL_ROOT_SELECTOR = [
    ".fc-modal-root",
    "#prod-validation-overlay",
    ".prod-validation-overlay",
    ".swap-modal",
    ".pcrop-modal",
    ".psrc-modal",
    ".ppick-modal",
    ".bpick-modal",
    ".rq-modal",
    ".modal",
    ".ts-overlay",
    ".career-ready-photo-switch-modal",
    ".career-ready-photo-switch-modal--portal",
    ".career-ready-photo-url-modal",
    ".career-ready-photo-url-modal--portal",
    // NOTE: #fc-loading-overlay is deliberately NOT listed. It is shown by a
    // CAPTURE-phase listener on the SAME Play/Record click that should start
    // playback — if it counted as an open modal, this blocker would
    // stopImmediatePropagation() that very click before it reached the button
    // handler, so startVideoFlow() never ran and the "Loading…" overlay hung
    // forever. The loading overlay already blocks clicks by covering the screen.
    "#render-progress-overlay",
    "#recording-preflight-overlay",
    "#recording-preflight-failure",
  ].join(",");

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (el.id === "fc-loading-overlay" && !el.classList.contains("fc-show")) return false;
    if (el.id === "render-progress-overlay" && cs.display === "none") return false;
    return el.offsetParent !== null || cs.position === "fixed";
  }

  function isModalRoot(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches?.(".fc-modal-root")) return true;
    if (el.id === "prod-validation-overlay") return true;
    return !!el.matches?.(MODAL_ROOT_SELECTOR);
  }

  function isInsideModal(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isModalRoot(el)) return true;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (!isModalRoot(node)) continue;
      if (isVisible(node)) return true;
    }
    return false;
  }

  function isAnyModalOpen() {
    for (const el of document.querySelectorAll(MODAL_ROOT_SELECTOR)) {
      if (isVisible(el)) return true;
    }
    return false;
  }

  function syncBodyClass() {
    document.body.classList.toggle("fc-modal-open", isAnyModalOpen());
  }

  function blockBackgroundPointer(e) {
    if (!isAnyModalOpen()) return;
    if (isInsideModal(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  const observer = new MutationObserver(() => syncBodyClass());
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style", "aria-hidden"],
  });

  document.addEventListener("pointerdown", blockBackgroundPointer, true);
  document.addEventListener("click", blockBackgroundPointer, true);
  syncBodyClass();

  window.FCModalLayer = {
    isAnyOpen: isAnyModalOpen,
    isInsideModal,
    sync: syncBodyClass,
    MODAL_ROOT_SELECTOR,
  };
})();
