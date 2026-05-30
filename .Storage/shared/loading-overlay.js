/**
 * loading-overlay.js  (shared by all runners)
 *
 * DISABLED per user request (no "Loading…" bridge overlay). Pressing Play Video
 * or Record Video now just starts the flow when it's ready — nothing is shown in
 * the gap. We keep a no-op window.FCLoadingOverlay so any (current or future)
 * caller of .show()/.hide() stays safe, and we install no click listener and no
 * DOM/overlay at all.
 *
 * To re-enable, restore from git history (the previous version showed a
 * full-screen spinner on Play/Record click and hid it once playback started).
 */
(function () {
  if (window.__fcLoadingOverlayInstalled) return;
  window.__fcLoadingOverlayInstalled = true;
  window.FCLoadingOverlay = { show() {}, hide() {} };
})();
