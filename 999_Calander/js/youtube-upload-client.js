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

  let auth = { clientSecret: false, channels: { en: false, es: false } };

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
    try {
      const r = await fetch(STATUS_ENDPOINT, { cache: "no-store" });
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
    try {
      await fetch(RECSTATUS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "setYoutube", key, language: channelToLanguage(channel), info }),
      });
    } catch (_) { /* best-effort; the upload itself already succeeded */ }
  }

  /** Run the upload for one pill. `slot` = { key, channel, block, date:{y,m,d},
   *  time:{hour,min}, playlistName }. Returns { ok, videoId?, error? }. */
  /** `slot` = { key, channel, block, date, time, playlistName }.
   *  `thumbnail` (optional) = { dataBase64, mime } — uploaded unmodified. */
  async function upload(slot, thumbnail) {
    const { key, channel, block, date, time, playlistName } = slot;
    const lang = channelToLanguage(channel);
    const meta = block?.video?.[lang];
    if (!meta || !meta.path) return { ok: false, error: "No recorded video for this language." };
    if (!channelAuthorized(channel)) {
      return { ok: false, error: `The ${channel.toUpperCase()} channel isn't authorized yet — run authorize_youtube.py --channel ${channel}.` };
    }

    const publishAt = israelSlotToUtcISO(date.y, date.m, date.d, time.hour, time.min);
    let res;
    try {
      const r = await fetch(UPLOAD_ENDPOINT, {
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
      await persistResult(key, channel, info);
      return { ok: true, videoId: res.videoId, warning: res.warning || null };
    }
    const errMsg = (res && (res.error || res.detail)) || "Upload failed";
    await persistResult(key, channel, { error: errMsg, failedAt: Date.now() });
    return { ok: false, error: errMsg };
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
  };
})();
