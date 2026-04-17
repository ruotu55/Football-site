/**
 * image-cache.js — Shared RAM image cache for all Main Runner variants.
 *
 * Keeps decoded Image objects in memory so that switching levels, toggling
 * video mode, or re-rendering the career grid never re-fetches / re-decodes
 * the same bitmap.  Cache lives until the page is refreshed.
 *
 * Usage:
 *   import { getCachedImage, preloadImage, preloadImages } from "../../.Storage/shared/image-cache.js";
 *
 *   // Get a cached <img> (or null if not yet cached)
 *   const img = getCachedImage(url);
 *
 *   // Preload a single image — returns Promise<HTMLImageElement>
 *   const img = await preloadImage(url);
 *
 *   // Preload many at once — returns Promise<HTMLImageElement[]>
 *   const imgs = await preloadImages([url1, url2, url3]);
 *
 *   // Set src on a DOM <img> element — uses cache, returns promise that
 *   // resolves once the element is ready to paint (decoded):
 *   await applyCachedSrc(imgEl, url);
 *
 *   // Set src with a fallback chain — tries each URL until one loads:
 *   await applyCachedSrcChain(imgEl, [primary, fallback1, fallback2], { onFail: () => ... });
 *
 *   // Wait for ALL in-flight loads to finish (call after DOM swap in transitions):
 *   await waitForPendingImages();
 *
 *   // Wait for all <img> elements inside a container to load:
 *   await waitForDomImages(containerEl);
 */

/** @type {Map<string, HTMLImageElement>} Fully decoded images keyed by resolved URL. */
const cache = new Map();

/** @type {Map<string, Promise<HTMLImageElement>>} In-flight loads keyed by resolved URL. */
const pending = new Map();

/** @type {Set<string>} URLs that have failed to load — avoid retrying broken URLs. */
const failedUrls = new Set();

/**
 * Normalize URL so cache-bust tokens (`?v=...`) still share the same cache
 * entry within the same page session.  We strip the `v=<timestamp>` that
 * `projectAssetUrlFresh` adds because inside a single page load the asset
 * will not change.
 */
function normalizeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.href);
    u.searchParams.delete("v");
    return u.href;
  } catch {
    return String(url).replace(/[?&]v=[^&]*/g, "").replace(/[?&]$/, "");
  }
}

/**
 * Return a cached, fully-decoded Image for this URL, or `null`.
 * @param {string} url
 * @returns {HTMLImageElement | null}
 */
export function getCachedImage(url) {
  return cache.get(normalizeUrl(url)) ?? null;
}

/**
 * Check whether a URL is already in the cache (decoded and ready).
 * @param {string} url
 * @returns {boolean}
 */
export function isImageCached(url) {
  return cache.has(normalizeUrl(url));
}

/**
 * Preload a single image into the RAM cache.
 * If already cached, resolves immediately with the stored Image.
 * If already loading, piggy-backs on the existing Promise.
 * Otherwise starts a new fetch + decode.
 *
 * @param {string} url  The image URL (may contain cache-bust params).
 * @returns {Promise<HTMLImageElement>}
 */
export function preloadImage(url) {
  const key = normalizeUrl(url);
  if (!key) return Promise.resolve(new Image());

  // Already decoded — instant hit
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  // Already in flight — reuse
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";

    img.onload = () => {
      // Use decode() for browsers that support it — ensures the bitmap is
      // fully rasterised before we hand it back, avoiding jank on first paint.
      const finish = () => {
        cache.set(key, img);
        pending.delete(key);
        failedUrls.delete(key);
        resolve(img);
      };
      if (typeof img.decode === "function") {
        img.decode().then(finish, finish);
      } else {
        finish();
      }
    };

    img.onerror = () => {
      // Don't cache failures — let the caller's own error-handling run.
      pending.delete(key);
      failedUrls.add(key);
      resolve(img); // resolve (not reject) so Promise.all doesn't short-circuit
    };

    // Use the original URL (with cache-bust) for the actual network request
    // so the browser honours fresh-on-reload semantics.
    img.src = url;
  });

  pending.set(key, promise);
  return promise;
}

/**
 * Preload an array of image URLs in parallel.
 * @param {string[]} urls
 * @returns {Promise<HTMLImageElement[]>}
 */
export function preloadImages(urls) {
  if (!urls || !urls.length) return Promise.resolve([]);
  return Promise.all(urls.map((u) => preloadImage(u)));
}

/**
 * Store an externally-loaded Image in the cache so future lookups hit RAM.
 * Useful when an <img> element was created elsewhere (e.g. SVG <image>)
 * and you want to ensure the bitmap stays warm.
 *
 * @param {string} url
 * @param {HTMLImageElement} img
 */
export function putCachedImage(url, img) {
  const key = normalizeUrl(url);
  if (key && img) cache.set(key, img);
}

/**
 * Check whether a URL has previously failed to load.
 * @param {string} url
 * @returns {boolean}
 */
export function hasImageFailed(url) {
  return failedUrls.has(normalizeUrl(url));
}

// ─── DOM-AWARE HELPERS ────────────────────────────────────────────────

/**
 * Apply a src to a DOM <img> element using the RAM cache.
 * If the image is already cached, sets src synchronously from the cached
 * bitmap — the browser can paint it in the very next frame with zero flicker.
 * If not cached, loads + decodes in background, then sets src.
 *
 * Returns a Promise that resolves when the element is ready to paint.
 *
 * @param {HTMLImageElement} el  The DOM <img> element
 * @param {string} url          The image URL
 * @returns {Promise<boolean>}  true if loaded successfully, false on error
 */
export async function applyCachedSrc(el, url) {
  if (!el || !url) return false;

  const key = normalizeUrl(url);

  // Instant cache hit — set src from decoded bitmap, zero network
  const hit = cache.get(key);
  if (hit) {
    el.src = hit.src;
    // Ensure the element itself is decoded before we resolve
    if (typeof el.decode === "function") {
      try { await el.decode(); } catch { /* ok */ }
    }
    return true;
  }

  // Load via the shared cache pipeline
  const loaded = await preloadImage(url);
  if (!loaded.naturalWidth) return false; // failed to load

  // Element may have been disconnected while we waited
  if (!el.isConnected) return false;

  el.src = loaded.src;
  if (typeof el.decode === "function") {
    try { await el.decode(); } catch { /* ok */ }
  }
  return true;
}

/**
 * Apply src from a chain of fallback URLs. Tries each in order until one
 * loads successfully. Much faster than sequential onerror handlers because
 * it uses the RAM cache and skips known-failed URLs.
 *
 * @param {HTMLImageElement} el       The DOM <img> element
 * @param {string[]} urlChain        Ordered list of URLs to try
 * @param {Object} [opts]
 * @param {Function} [opts.onFail]   Called if ALL URLs fail
 * @param {Function} [opts.onLoad]   Called with the successful URL when one loads
 * @returns {Promise<boolean>}       true if any URL loaded successfully
 */
export async function applyCachedSrcChain(el, urlChain, opts = {}) {
  if (!el || !urlChain?.length) {
    opts.onFail?.();
    return false;
  }

  for (const url of urlChain) {
    if (!url) continue;

    // Skip known failures immediately
    if (hasImageFailed(url)) continue;

    const ok = await applyCachedSrc(el, url);
    if (ok) {
      opts.onLoad?.(url);
      return true;
    }
  }

  opts.onFail?.();
  return false;
}

/**
 * Wait for ALL currently in-flight preload operations to finish.
 * Call this after a DOM swap during transitions to ensure every image that
 * was kicked off by renderCareer() / renderHeader() is decoded before the
 * overlay is removed.
 *
 * Has a safety timeout to avoid blocking transitions indefinitely.
 *
 * @param {number} [timeoutMs=3000] Maximum time to wait
 * @returns {Promise<void>}
 */
export function waitForPendingImages(timeoutMs = 3000) {
  if (pending.size === 0) return Promise.resolve();

  const allPending = Promise.all(pending.values());
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([allPending, timeout]);
}

/**
 * Wait for all <img> elements inside a container to finish loading.
 * Handles both images already loaded (img.complete) and in-progress loads.
 * Has a safety timeout.
 *
 * @param {Element} container  The DOM container to scan
 * @param {number} [timeoutMs=3000] Maximum time to wait
 * @returns {Promise<void>}
 */
export function waitForDomImages(container, timeoutMs = 3000) {
  if (!container) return Promise.resolve();

  const imgs = container.querySelectorAll("img[src]");
  if (!imgs.length) return Promise.resolve();

  const promises = [];
  for (const img of imgs) {
    if (img.complete && img.naturalWidth) continue; // already loaded
    if (img.complete && !img.naturalWidth) continue; // already failed
    promises.push(
      new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      })
    );
  }

  if (!promises.length) return Promise.resolve();

  const all = Promise.all(promises);
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([all, timeout]);
}

/**
 * Return cache statistics (useful for debugging in the console).
 * @returns {{ cached: number, pending: number, failed: number }}
 */
export function cacheStats() {
  return { cached: cache.size, pending: pending.size, failed: failedUrls.size };
}

// Expose for debugging in dev console
window.__imageCache = {
  getCachedImage, isImageCached, preloadImage, preloadImages,
  putCachedImage, cacheStats, applyCachedSrc, applyCachedSrcChain,
  waitForPendingImages, waitForDomImages, hasImageFailed,
};
