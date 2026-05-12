import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVideoExportFilename,
  cancelAllOfflineExportJobs,
  cancelOfflineExportJobsByTag,
  createPlaybackExportEndWatcher,
  getOfflineExportAuthoritativeClockMs,
  getSavePickerTiming,
  pickVideoRecorderFormat,
  resetOfflineExportAudioCues,
  resetOfflineExportCssAnimationSync,
  sanitizeHtml2CanvasColorValue,
  sanitizeExportFps,
  sanitizeFilenamePart,
  scheduleOfflineExportJob,
  syncOfflineExportAuthoritativeClock,
} from "../js/video-export-utils.js";

test("sanitizeExportFps only allows 30 or 60 fps", () => {
  assert.equal(sanitizeExportFps("30"), 30);
  assert.equal(sanitizeExportFps(60), 60);
  assert.equal(sanitizeExportFps("120"), 60);
  assert.equal(sanitizeExportFps("abc"), 60);
});

test("sanitizeFilenamePart keeps export names valid on Windows", () => {
  assert.equal(sanitizeFilenamePart("AC Milan: 1994/95?"), "AC Milan 1994-95");
  assert.equal(sanitizeFilenamePart("   "), "Football Team");
});

test("buildVideoExportFilename includes date, time, team name, fps, and extension", () => {
  const now = new Date("2026-05-12T21:04:05");
  assert.equal(
    buildVideoExportFilename("Real Madrid", 60, now, "mp4"),
    "2026-05-12_21-04-05_Real Madrid_60fps.mp4",
  );
});

test("pickVideoRecorderFormat prefers MP4 when the browser supports it", () => {
  const format = pickVideoRecorderFormat((type) => type === "video/mp4;codecs=avc1.42E01E,mp4a.40.2");

  assert.equal(format.extension, "mp4");
  assert.equal(format.mimeType, "video/mp4;codecs=avc1.42E01E,mp4a.40.2");
});

test("pickVideoRecorderFormat falls back to WebM when MP4 is unavailable", () => {
  const format = pickVideoRecorderFormat((type) => type === "video/webm;codecs=vp9,opus");

  assert.equal(format.extension, "webm");
  assert.equal(format.mimeType, "video/webm;codecs=vp9,opus");
});

test("getSavePickerTiming uses the click gesture for browser save picker", () => {
  assert.equal(getSavePickerTiming(true), "before-recording");
  assert.equal(getSavePickerTiming(false), "after-recording");
});

test("sanitizeHtml2CanvasColorValue converts color function output to rgba", () => {
  assert.equal(
    sanitizeHtml2CanvasColorValue("color(srgb 0.2 0.4 0.6 / 0.75)", "#123456"),
    "rgba(51, 102, 153, 0.75)",
  );
  assert.equal(
    sanitizeHtml2CanvasColorValue("color(srgb 0.2 0.4 0.6)", "#123456"),
    "rgb(51, 102, 153)",
  );
  assert.equal(sanitizeHtml2CanvasColorValue("rgb(1, 2, 3)", "#123456"), "rgb(1, 2, 3)");
});

test("offline export authoritative clock runs due jobs in deadline order", () => {
  cancelAllOfflineExportJobs();
  const log = [];
  scheduleOfflineExportJob(100, () => log.push("a"), "t");
  scheduleOfflineExportJob(50, () => log.push("b"), "t");
  syncOfflineExportAuthoritativeClock(200);
  assert.deepEqual(log, ["b", "a"]);
  cancelAllOfflineExportJobs();
  syncOfflineExportAuthoritativeClock(0);
});

test("cancelOfflineExportJobsByTag removes matching pending jobs", () => {
  cancelAllOfflineExportJobs();
  const log = [];
  scheduleOfflineExportJob(10, () => log.push("x"), "tag-a");
  scheduleOfflineExportJob(10, () => log.push("y"), "tag-b");
  cancelOfflineExportJobsByTag("tag-a");
  syncOfflineExportAuthoritativeClock(10);
  assert.deepEqual(log, ["y"]);
  cancelAllOfflineExportJobs();
  syncOfflineExportAuthoritativeClock(0);
});

test("getOfflineExportAuthoritativeClockMs tracks last sync value", () => {
  cancelAllOfflineExportJobs();
  syncOfflineExportAuthoritativeClock(42);
  assert.equal(getOfflineExportAuthoritativeClockMs(), 42);
  cancelAllOfflineExportJobs();
  syncOfflineExportAuthoritativeClock(0);
});

test("resetOfflineExportCssAnimationSync is safe to call repeatedly (Node)", () => {
  resetOfflineExportCssAnimationSync();
  resetOfflineExportCssAnimationSync();
});

test("resetOfflineExportAudioCues is safe to call repeatedly (Node)", () => {
  resetOfflineExportAudioCues();
  resetOfflineExportAudioCues();
});

test("playback export watcher does not finish before playback starts", async () => {
  let isVideoPlaying = false;
  let resolved = false;
  const intervals = [];
  const timeouts = [];
  const listeners = new Map();
  const watcher = createPlaybackExportEndWatcher({
    getIsVideoPlaying: () => isVideoPlaying,
    getCurrentLevelIndex: () => 1,
    getTotalLevelsCount: () => 32,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    setInterval: (fn) => {
      intervals.push(fn);
      return fn;
    },
    clearInterval: () => {},
    setTimeout: (fn) => {
      timeouts.push(fn);
      return fn;
    },
    clearTimeout: () => {},
    pollMs: 250,
    endingFallbackMs: 7000,
  });

  watcher.then(() => {
    resolved = true;
  });
  intervals[0]();
  await Promise.resolve();

  assert.equal(resolved, false);

  isVideoPlaying = true;
  intervals[0]();
  isVideoPlaying = false;
  intervals[0]();
  await Promise.resolve();

  assert.equal(resolved, true);
});
