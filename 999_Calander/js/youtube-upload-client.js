/* Calendar-side YouTube upload client.
 *
 * Exposes window.FCYouTube. Each calendar pill (one channel, one episode) can:
 *   - read whether its recording is uploadable / already uploaded
 *   - trigger an upload to the matching channel (en / es), scheduled to the
 *     pill's slot time, added to the quiz-type playlist
 *
 * Talks to two endpoints served by run_site.py:
 *   POST /__youtube-upload      -> does the actual upload (see dev_server_youtube.py)
 *   POST /__recording-status    -> op:"setYoutube" persists the result on the block
 *
 * Auth health is read once from GET /__youtube-status so the button can warn
 * if a channel isn't authorized yet.
 */
(function () {
  const UPLOAD_ENDPOINT = "/__youtube-upload";
  const STATUS_ENDPOINT = "/__youtube-status";
  const RECSTATUS_ENDPOINT = "/__recording-status";
  const THUMB_ENDPOINT = "/__youtube-thumbnail";

  // ── Mac-side uploader auto-detection ───────────────────────────────────
  // The site runs on the PC, but recording (and thus the video file) happens
  // on the Mac. A tiny helper (999_Mac_Uploader) runs on the Mac and does the
  // actual upload of the local file. When the calendar is open in the Mac's
  // browser and that helper is running, we route the UPLOAD + AUTH-STATUS calls
  // to it (http://localhost:<port>). Otherwise we fall back to the PC (relative
  // URLs) exactly as before. Thumbnails + recording-status stay on the PC.
  const DEFAULT_MAC_URL = "http://localhost:9876";
  function macBaseSetting() {
    try { return (localStorage.getItem("fcMacUploaderUrl") || DEFAULT_MAC_URL).replace(/\/+$/, ""); }
    catch (_) { return DEFAULT_MAC_URL; }
  }
  let MAC_BASE = null;          // resolved base URL of the Mac helper, or null (= use PC)
  let detectPromise = null;     // memoized detection
  async function detectUploader() {
    const base = macBaseSetting();
    try {
      const ctrl = ("AbortController" in window) ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 1500) : null;
      const r = await fetch(base + "/__ping", { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
      if (t) clearTimeout(t);
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        if (d && d.service === "fc-mac-uploader") {
          MAC_BASE = base;
          console.info("[youtube] Mac uploader detected at " + base + " — uploads will run on the Mac.");
        }
      }
    } catch (_) { MAC_BASE = null; }
    return MAC_BASE;
  }
  function ensureDetected() {
    if (!detectPromise) detectPromise = detectUploader();
    return detectPromise;
  }
  // YouTube upload + auth-status go to the Mac helper when present; everything
  // else (thumbnails, recording-status) stays on the PC.
  function ytUrl(endpoint) { return (MAC_BASE || "") + endpoint; }

  let auth = { clientSecret: false, channels: { en: false, es: false } };

  // Defense-in-depth against double-uploads: refuse a second upload of the same
  // (video, channel) while one is already running in this tab. The Mac helper
  // also dedups by file identity, so duplicates are impossible even across
  // connection drops / retries — this just blocks accidental re-entry.
  const _inflight = new Set();

  function channelToLanguage(channel) {
    return channel === "en" ? "english" : "spanish";
  }

  /** Convert an Israel wall-clock slot (the calendar is in Asia/Jerusalem) to a
   *  UTC RFC3339 string for YouTube's status.publishAt. DST-aware via Intl. */
  function israelSlotToUtcISO(year, month, day, hour, min) {
    const utcGuess = Date.UTC(year, month, day, hour, min, 0);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem", hour12: false,
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    }).formatToParts(new Date(utcGuess));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    let asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    const offset = asIfUtc - utcGuess; // ms Jerusalem is ahead of UTC at that instant
    return new Date(utcGuess - offset).toISOString();
  }

  /** "none" (no recording yet) | "ready" (recorded, not uploaded) |
   *  "uploaded" | "error" */
  function statusFor(block, channel) {
    if (!block) return "none";
    const lang = channelToLanguage(channel);
    const hasVideo = !!(block.video && block.video[lang] && block.video[lang].path);
    const yt = block.youtube && block.youtube[lang];
    if (yt && yt.videoId) return "uploaded";
    if (yt && yt.error) return "error";
    return hasVideo ? "ready" : "none";
  }

  function videoIdFor(block, channel) {
    const lang = channelToLanguage(channel);
    return block?.youtube?.[lang]?.videoId || null;
  }

  function channelAuthorized(channel) {
    return !!auth.channels[channel];
  }

  async function refreshAuth() {
    await ensureDetected();
    try {
      const r = await fetch(ytUrl(STATUS_ENDPOINT), { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      auth = {
        clientSecret: !!data.clientSecret,
        channels: { en: !!data.channels?.en, es: !!data.channels?.es },
      };
    } catch (_) { /* server may not expose it yet */ }
  }

  /** Reset one language of a block back to the start — clears its recorded
   *  flag, captured video metadata, and youtube upload info. Does NOT touch
   *  the actual YouTube video (remove that in YouTube Studio if you need to). */
  async function resetLanguage(key, channel) {
    try {
      const r = await fetch(RECSTATUS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "clearLanguage", key, language: channelToLanguage(channel) }),
      });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  async function persistResult(key, channel, info) {
    // Returns true only if the block was actually marked. A silent failure here
    // is what let the same video be uploaded again (the pill never flipped to
    // "uploaded"), so we report it back to the caller instead of swallowing it.
    try {
      const r = await fetch(RECSTATUS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "setYoutube", key, language: channelToLanguage(channel), info }),
      });
      return !!(r && r.ok);
    } catch (_) {
      return false;
    }
  }

  /** Run the upload for one pill. `slot` = { key, channel, block, date:{y,m,d},
   *  time:{hour,min}, playlistName }. Returns { ok, videoId?, error? }.
   *  `thumbnail` (optional) = { dataBase64, mime } — uploaded unmodified.
   *  Refuses to start a second upload of the same (video, channel) while one is
   *  already running in this tab (the Mac helper also dedups by file identity). */
  async function upload(slot, thumbnail) {
    const inflightKey = (slot && slot.key) + "|" + (slot && slot.channel);
    if (_inflight.has(inflightKey)) {
      return { ok: false, error: "An upload for this video is already running — wait for it to finish." };
    }
    _inflight.add(inflightKey);
    try {
      return await _uploadImpl(slot, thumbnail);
    } finally {
      _inflight.delete(inflightKey);
    }
  }

  async function _uploadImpl(slot, thumbnail) {
    const { key, channel, block, date, time, playlistName } = slot;
    const lang = channelToLanguage(channel);
    const meta = block?.video?.[lang];
    if (!meta || !meta.path) return { ok: false, error: "No recorded video for this language." };
    // Make sure detection + auth reflect the Mac helper (if running) before we
    // decide authorization / where to POST the upload.
    await ensureDetected();
    if (!auth.channels.en && !auth.channels.es) await refreshAuth();
    if (!channelAuthorized(channel)) {
      const where = MAC_BASE ? "on the Mac uploader (check its youtube/ folder)" : "on the PC";
      return { ok: false, error: `The ${channel.toUpperCase()} channel isn't authorized ${where} — run authorize_youtube.py --channel ${channel}.` };
    }

    const publishAt = israelSlotToUtcISO(date.y, date.m, date.d, time.hour, time.min);
    let res;
    try {
      const r = await fetch(ytUrl(UPLOAD_ENDPOINT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          videoPath: meta.path,
          title: meta.title || "",
          description: meta.description || "",
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          publishAt,
          playlistName: playlistName || "",
          thumbnail: thumbnail && thumbnail.dataBase64 ? thumbnail : undefined,
        }),
      });
      res = await r.json();
    } catch (e) {
      return { ok: false, error: "Upload request failed: " + e };
    }

    if (res && res.ok) {
      const info = {
        videoId: res.videoId,
        playlistId: res.playlistId || null,
        publishAt,
        uploadedAt: Date.now(),
      };
      const persisted = await persistResult(key, channel, info);
      return { ok: true, videoId: res.videoId, warning: res.warning || null, persisted };
    }
    const errMsg = (res && (res.error || res.detail)) || "Upload failed";
    await persistResult(key, channel, { error: errMsg, failedAt: Date.now() });
    return { ok: false, error: errMsg };
  }

  /* ── Per-video custom thumbnails (set ahead of time, used at upload) ── */

  /** Returns { exists, dataBase64?, mime?, name? } for (key, channel). */
  async function getThumbnail(key, channel) {
    try {
      const url = `${THUMB_ENDPOINT}?key=${encodeURIComponent(key)}&channel=${encodeURIComponent(channel)}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return { exists: false };
      return await r.json();
    } catch (_) {
      return { exists: false };
    }
  }

  /** Save a thumbnail for (key, channel). `file` = { dataBase64, mime, name }. */
  async function saveThumbnail(key, channel, file) {
    try {
      const r = await fetch(THUMB_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, channel, dataBase64: file.dataBase64, mime: file.mime, name: file.name }),
      });
      const data = await r.json().catch(() => ({}));
      return !!(r.ok && data.ok);
    } catch (_) {
      return false;
    }
  }

  async function deleteThumbnail(key, channel) {
    try {
      const r = await fetch(`${THUMB_ENDPOINT}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, channel }),
      });
      const data = await r.json().catch(() => ({}));
      return !!(r.ok && data.ok);
    } catch (_) {
      return false;
    }
  }

  refreshAuth();

  window.FCYouTube = {
    statusFor,
    videoIdFor,
    channelAuthorized,
    refreshAuth,
    upload,
    resetLanguage,
    israelSlotToUtcISO,
    getThumbnail,
    saveThumbnail,
    deleteThumbnail,
  };
})();
