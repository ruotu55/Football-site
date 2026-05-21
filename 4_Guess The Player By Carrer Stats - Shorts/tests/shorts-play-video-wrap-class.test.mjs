import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const videoSource = await readFile(new URL("../js/video.js", import.meta.url), "utf8");

assert.equal(
  videoSource.includes('classList.add("video-mode-enabled")'),
  false,
  "Play Video must not re-add #career-wrap.video-mode-enabled; shorts playback uses the body-level career-shorts-video-layout flag so the preview portrait transform does not snap at start."
);
