# OBS Screen Recording on Play Video — Design

**Date:** 2026-05-13
**Scope:** `1_Guess The Football Team Name - Main Runner - Regular` only.

## Goal

When the user clicks **Play Video**:

1. The Chrome tab enters fullscreen mode.
2. OBS (on the same Mac) starts recording via OBS WebSocket v5.
3. One second after the last-page (outro) voice clip ends, OBS stops recording.

The video is saved to `Ready videos/<runner-folder>/<saved-setting-name>.<ext>`, where `<saved-setting-name>` is the currently loaded preset (e.g. `Champion League`).

## Topology

Chrome, OBS, and `run_site.py` all run on the same Mac. OBS WebSocket runs at `ws://localhost:4455` with **no password** (auth disabled in OBS settings).

```
Browser (Chrome) ──── ws://localhost:4455 ───▶ OBS
        │
        └── fetch /__obs-config ───▶ run_site.py
```

## Components

### `js/obs-recorder.js` (new)

Single-purpose module wrapping OBS WebSocket v5. Uses [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js) loaded from CDN.

Exports:

- `async connect()` — connect to `ws://localhost:4455`, throws if unreachable.
- `async start(savedName, recordingsDir)` — calls `SetProfileParameter` (FilenameFormatting), `SetRecordDirectory`, then `StartRecord`.
- `async stop()` — calls `StopRecord`. Idempotent (no-op if not recording).
- `disconnect()` — closes the socket.
- `isRecording()` — boolean getter.

### `run_site.py` — new endpoint `GET /__obs-config`

Returns:

```json
{
  "recordingsDir": "<abs path to repo>/Ready videos/1_Guess The Football Team Name - Main Runner - Regular",
  "obsUrl": "ws://localhost:4455"
}
```

Computes `recordingsDir` from `__file__`, creates the directory if missing.

### `js/app.js` — Play Video handler (rewritten)

Order:

1. Prod validation (existing).
2. Read `activeScriptName` from `saved-scripts.js`. If empty → error modal "Load a saved setting first". Return.
3. Fetch `/__obs-config` (cached after first call).
4. `obsRecorder.connect()`. On failure → error modal "OBS not connected". Return.
5. In parallel: `requestFullscreen()` and `obsRecorder.start(savedName, recordingsDir)`. On either failure → roll back, error modal, return.
6. `startVideoFlow()`.

### `js/audio.js` — return promises

- `playEndingVoice(endingType)` returns the `playVoice()` promise.
- `playCommentBelow()` returns that promise.

### `js/levels.js` — chain stop on outro

In the outro branch (currently line 211), replace `playCommentBelow();` with:

```js
playCommentBelow().then(() => {
  setTimeout(() => stopRecordingAndExitFullscreen(), 1000);
});
```

`stopRecordingAndExitFullscreen()` is a small helper that calls `obsRecorder.stop()`, exits fullscreen, and disconnects. Also called from `stopVideoFlow()` to handle mid-video abort.

### Files deleted

- `js/recorder.js` — replaced by `obs-recorder.js`.
- `#download-modal` element in `index.html` — no longer needed (OBS writes directly to disk).

## Error handling

- "Load a saved setting first" — no `activeScriptName`.
- "OBS not connected" — WebSocket fails to connect.
- "Recording failed to start" — OBS rejects `StartRecord` (e.g. already recording).
- All errors abort cleanly: no fullscreen-without-recording or recording-without-flow.
- WebSocket disconnect mid-recording: log warning; video continues; no retry.

## Filename and directory behavior

- `FilenameFormatting` set to `activeScriptName` verbatim (OBS handles `.mkv`/`.mp4` extension via its own format setting).
- `SetRecordDirectory` set to `Ready videos/<runner-folder>/` (server creates if missing).
- If a file with that name exists, OBS appends a counter (default OBS behavior). We accept that — no overwrite logic.

## Out of scope

- Other runners (Shorts, runners 2–8). User will roll out manually after pilot verification.
- Configurable OBS host/port/password — `ws://localhost:4455` no-auth only.
- Recording format selection — uses whatever OBS profile is set to.
- Post-recording file move/rename via server — OBS writes directly to the target dir.
