const SAFE_FILENAME_FALLBACK = "Football Team";

export function sanitizeExportFps(value) {
  const fps = Number(value);
  return fps === 30 ? 30 : 60;
}

export function sanitizeFilenamePart(value) {
  const cleaned = String(value || "")
    .replace(/[<>:"\\|?*\u0000-\u001f]+/g, "")
    .replace(/[\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned || SAFE_FILENAME_FALLBACK;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function buildVideoExportFilename(firstTeamName, fps, now = new Date(), extension = "mp4") {
  const year = now.getFullYear();
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  const hours = pad2(now.getHours());
  const minutes = pad2(now.getMinutes());
  const seconds = pad2(now.getSeconds());
  const team = sanitizeFilenamePart(firstTeamName);
  const cleanExt = String(extension || "mp4").replace(/^\.+/, "") || "mp4";
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_${team}_${sanitizeExportFps(fps)}fps.${cleanExt}`;
}

export function pickVideoRecorderFormat(isTypeSupported) {
  const supported = typeof isTypeSupported === "function" ? isTypeSupported : () => false;
  const candidates = [
    { extension: "mp4", mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2" },
    { extension: "mp4", mimeType: "video/mp4;codecs=h264,aac" },
    { extension: "mp4", mimeType: "video/mp4" },
    { extension: "webm", mimeType: "video/webm;codecs=vp9,opus" },
    { extension: "webm", mimeType: "video/webm;codecs=vp8,opus" },
    { extension: "webm", mimeType: "video/webm" },
  ];
  return candidates.find((candidate) => supported(candidate.mimeType)) || {
    extension: "webm",
    mimeType: "",
  };
}

export function getSavePickerTiming(canUseSavePicker) {
  return canUseSavePicker ? "before-recording" : "after-recording";
}

/** True when headless MP4 export loads `?video-export=1`. */
export function isOfflineVideoExportUrlMode() {
  try {
    return new URLSearchParams(window.location.search).get("video-export") === "1";
  } catch {
    return false;
  }
}

/* ── Authoritative timeline for offline MP4 (ms, driven by Python each frame) ──
   Playwright's clock + long CDP screenshots can leave DOM timers misaligned with the
   encoded frame clock; schedule work at absolute export times instead of setTimeout. */

let offlineExportAuthoritativeMs = 0;
/** @type {{ at: number, tag: string, fn: () => void }[]} */
const offlineExportJobs = [];

/** WeakMap values: `{ gen, base }` — local time = clockMs − base (new animations anchor at first seen clock). */
let offlineExportCssAnimSyncGen = 0;
const offlineExportCssAnimBase = new WeakMap();

export function resetOfflineExportCssAnimationSync() {
  offlineExportCssAnimSyncGen++;
}

/** Reset MP4 audio cue list (see `pushOfflineExportAudioCue`; Python muxes via ffmpeg). */
export function resetOfflineExportAudioCues() {
  if (typeof window === "undefined") return;
  window.__footballVideoExportAudioCues = [];
}

/** Map `../.Storage/...` or same-origin paths to repo-relative paths (allowlist: `.Storage/`, `Images/` only). */
function toProjectRelativeMediaRel(src) {
  const raw = String(src || "")
    .trim()
    .split(/[?#]/)[0];
  if (!raw) return "";
  if (raw.startsWith("../")) return raw.slice(3).replace(/^\/+/, "");
  if (raw.startsWith("./")) return raw.slice(2).replace(/^\/+/, "");
  try {
    const base =
      typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "http://local/";
    const u = new URL(raw, base);
    const segs = u.pathname.split("/").filter(Boolean);
    const jStorage = segs.findIndex((s) => s.toLowerCase() === ".storage");
    const jImages = segs.findIndex((s) => s.toLowerCase() === "images");
    const j = jStorage >= 0 ? jStorage : jImages;
    if (j >= 0) return segs.slice(j).join("/");
  } catch {
    return "";
  }
  return "";
}

export function pushOfflineExportAudioCue({ startMs, src, volume = 1, kind = "sfx", durationMs }) {
  if (!isOfflineVideoExportUrlMode() || typeof window === "undefined") return;
  const rel = toProjectRelativeMediaRel(src);
  if (!rel) return;
  const low = rel.toLowerCase();
  if (!low.startsWith(".storage/") && !low.startsWith("images/")) return;
  if (!window.__footballVideoExportAudioCues) window.__footballVideoExportAudioCues = [];
  const entry = {
    startMs: Math.max(0, Math.round(Number(startMs) || 0)),
    rel,
    volume: Math.max(0, Math.min(1, Number(volume) || 1)),
    kind: String(kind || "sfx"),
  };
  if (Number.isFinite(durationMs) && Number(durationMs) > 0) {
    entry.durationMs = Math.round(Number(durationMs));
  }
  window.__footballVideoExportAudioCues.push(entry);
}

function syncOfflineExportWebAnimationsToClock(clockMs) {
  if (!isOfflineVideoExportUrlMode()) return;
  const clock = Math.max(0, Number(clockMs) || 0);
  const doc = typeof document === "undefined" ? null : document;
  if (!doc?.getAnimations) return;
  let list;
  try {
    list = doc.getAnimations({ subtree: true });
  } catch {
    return;
  }
  const ScrollTimelineCtor =
    typeof globalThis.ScrollTimeline === "function" ? globalThis.ScrollTimeline : null;
  for (const anim of list) {
    if (!anim?.effect) continue;
    try {
      if (ScrollTimelineCtor && anim.timeline instanceof ScrollTimelineCtor) continue;
    } catch {
      /* ignore */
    }
    let meta = offlineExportCssAnimBase.get(anim);
    if (!meta || meta.gen !== offlineExportCssAnimSyncGen) {
      try {
        if (anim.playState === "running") anim.pause();
      } catch {
        /* ignore */
      }
      offlineExportCssAnimBase.set(anim, { gen: offlineExportCssAnimSyncGen, base: clock });
      try {
        anim.currentTime = 0;
      } catch {
        /* ignore */
      }
      continue;
    }
    const localMs = Math.max(0, clock - meta.base);
    let setMs = localMs;
    try {
      const ct = anim.effect.getComputedTiming?.();
      if (
        ct &&
        typeof ct.endTime === "number" &&
        Number.isFinite(ct.endTime) &&
        ct.endTime > 0
      ) {
        setMs = Math.min(localMs, ct.endTime);
      }
    } catch {
      /* ignore */
    }
    try {
      if (anim.playState === "running") anim.pause();
      anim.currentTime = setMs;
    } catch {
      /* ignore */
    }
  }
}

export function getOfflineExportAuthoritativeClockMs() {
  return offlineExportAuthoritativeMs;
}

export function scheduleOfflineExportJob(atMs, fn, tag = "misc") {
  offlineExportJobs.push({
    at: Number(atMs) || 0,
    tag: String(tag || "misc"),
    fn,
  });
}

export function cancelOfflineExportJobsByTag(tag) {
  const t = String(tag || "");
  for (let i = offlineExportJobs.length - 1; i >= 0; i--) {
    if (offlineExportJobs[i].tag === t) {
      offlineExportJobs.splice(i, 1);
    }
  }
}

export function cancelAllOfflineExportJobs() {
  offlineExportJobs.length = 0;
}

/** Advance authoritative time and run all jobs with deadline <= ms (re-entrant safe). */
export function syncOfflineExportAuthoritativeClock(authoritativeMs) {
  offlineExportAuthoritativeMs = Math.max(0, Number(authoritativeMs) || 0);
  const tSec = offlineExportAuthoritativeMs / 1000;
  const hook =
    typeof window !== "undefined" && window.__gsapOfflineSetAuthoritativeSeconds;
  /* Tick GSAP before jobs so new tweens from this frame land on the current export time. */
  if (typeof hook === "function") {
    try {
      hook(tSec);
    } catch (err) {
      console.warn("[offline-export-clock] gsap pre-jobs:", err);
    }
  }
  while (true) {
    offlineExportJobs.sort((a, b) => a.at - b.at);
    const next = offlineExportJobs[0];
    if (!next || next.at > offlineExportAuthoritativeMs) {
      break;
    }
    offlineExportJobs.shift();
    try {
      next.fn();
    } catch (err) {
      console.warn("[offline-export-clock] job error:", err);
    }
  }
  /* Tick again after jobs so tweens created mid-sync render for this clock (page transitions). */
  if (typeof hook === "function") {
    try {
      hook(tSec);
    } catch (err) {
      console.warn("[offline-export-clock] gsap post-jobs:", err);
    }
  }
  syncOfflineExportWebAnimationsToClock(offlineExportAuthoritativeMs);
}

export function sanitizeHtml2CanvasColorValue(value, fallback = "rgb(0, 0, 0)") {
  const raw = String(value || "").trim();
  if (!raw.startsWith("color(")) return raw;
  const match = raw.match(/^color\(\s*srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\s*\)$/i);
  if (!match) return fallback;
  const toByte = (part) => Math.max(0, Math.min(255, Math.round(Number(part) * 255)));
  const r = toByte(match[1]);
  const g = toByte(match[2]);
  const b = toByte(match[3]);
  const alpha = match[4] == null ? 1 : Math.max(0, Math.min(1, Number(match[4])));
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createPlaybackExportEndWatcher({
  getIsVideoPlaying,
  getCurrentLevelIndex,
  getTotalLevelsCount,
  addEventListener,
  removeEventListener,
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout,
  pollMs = 250,
  endingFallbackMs = 7000,
}) {
  return new Promise((resolve) => {
    let done = false;
    let playbackStarted = false;
    let noEndingVoiceTimeout = null;

    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(levelPoll);
      clearTimeout(noEndingVoiceTimeout);
      removeEventListener("football-video-audio-ended", onAudioEnded);
      removeEventListener("football-video-audio-error", onAudioEnded);
      resolve();
    };

    const onAudioEnded = (event) => {
      if (event?.detail?.role !== "ending") return;
      setTimeout(finish, 1000);
    };

    const levelPoll = setInterval(() => {
      if (getIsVideoPlaying()) {
        playbackStarted = true;
      } else if (playbackStarted) {
        finish();
        return;
      }

      if (
        playbackStarted &&
        getCurrentLevelIndex() === getTotalLevelsCount() &&
        !noEndingVoiceTimeout
      ) {
        noEndingVoiceTimeout = setTimeout(finish, endingFallbackMs);
      }
    }, pollMs);

    addEventListener("football-video-audio-ended", onAudioEnded);
    addEventListener("football-video-audio-error", onAudioEnded);
  });
}
