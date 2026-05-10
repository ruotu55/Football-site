# Video Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace real-time screen recording with a one-click, frame-perfect `.mp4` exporter integrated into runner #1's existing UI. User clicks Play Video → picks save location → walks away → gets a YouTube-ready file.

**Architecture:** Pure-Python backend module (`.Storage/Scripts/dev_server_export_video.py`) mounted into the existing `run_site.py` server via the established `try_handle_get`/`try_handle_post` plugin pattern. The module drives a headless Chromium via Playwright (Python) frame-by-frame, collects an audio timeline from the page, and encodes everything to MP4 with ffmpeg. Frontend gets an "Export Resolution" dropdown + a hijacked Play Video button that calls `showSaveFilePicker`, POSTs the current state, polls progress, and streams the result to disk.

**Tech Stack:** Python 3.11 (stdlib `http.server`, `subprocess`, `threading`, `json`, `unittest`), Playwright for Python (headless Chromium), ffmpeg with VideoToolbox on macOS, vanilla JS modules (no framework) on the page side.

**Spec:** [`docs/superpowers/specs/2026-05-10-video-exporter-design.md`](../specs/2026-05-10-video-exporter-design.md)

**Pilot scope:** `1_Guess The Football Team Name - Main Runner - Regular` ONLY. No sibling runners. No Shorts.

---

## File map

| File | Action |
|---|---|
| `.Storage/Scripts/dev_server_export_video.py` | **new** — backend module (HTTP + Playwright + ffmpeg) |
| `.Storage/Scripts/tests/test_export_video.py` | **new** — Python unittest suite |
| `.Storage/Scripts/tests/test_export_video_e2e.py` | **new** — Playwright integration test |
| `.Storage/Scripts/requirements.txt` | **new or +** — pin `playwright>=1.40` |
| `1_Guess.../run_site.py` | + ~10 lines (loader + dispatch) at the existing `_runner_*_mod` hook sites |
| `1_Guess.../js/export-mode.js` | **new** — page-side export helpers |
| `1_Guess.../js/export-client.js` | **new** — browser-side render driver |
| `1_Guess.../js/dom-bindings.js` | + 1 element ref (`exportResolutionSelect`) |
| `1_Guess.../js/state.js` | + `exportResolution` field |
| `1_Guess.../js/app.js` | + import export-client, modify Play Video onclick |
| `1_Guess.../html/controls.html` | + Export Resolution dropdown below `#btn-youtube-thumbnails` |
| `1_Guess.../html/modals.html` | + Export progress modal (mirrors Update Data modal pattern) |
| `1_Guess.../js/audio.js` | timing/playback calls routed through export-mode helpers |
| `1_Guess.../js/video.js` | timing calls routed through export-mode helpers |
| `1_Guess.../js/transitions.js` | timing calls routed through export-mode helpers |
| `1_Guess.../js/pitch-render.js` | timing/random calls routed through export-mode helpers |
| `1_Guess.../js/emojis.js` | `Math.random` calls routed through export-mode helpers |
| `1_Guess.../js/levels.js`, `bootstrap-hybrid.js`, `voice-tab.js`, `team-header-hatch.js`, `saved-team-layouts.js`, `runner-saved-server-sync.js`, `saved-scripts.js` | small edits — only the calls that affect rendered frames |

---

## Phase A — Backend module (Python)

### Task A1: Bootstrap test harness and module skeleton

**Files:**
- Create: `.Storage/Scripts/tests/__init__.py` (if missing)
- Create: `.Storage/Scripts/tests/test_export_video.py`
- Create: `.Storage/Scripts/dev_server_export_video.py`
- Create: `.Storage/Scripts/requirements.txt`

- [ ] **Step 1: Create the test package marker if it doesn't exist**

```bash
test -f ".Storage/Scripts/tests/__init__.py" || touch ".Storage/Scripts/tests/__init__.py"
```

- [ ] **Step 2: Write the first failing test**

`.Storage/Scripts/tests/test_export_video.py`:

```python
"""Tests for dev_server_export_video."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
_MODULE_PATH = _SCRIPTS_DIR / "dev_server_export_video.py"


def _load():
    spec = importlib.util.spec_from_file_location("dev_server_export_video", _MODULE_PATH)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class TestModuleLoads(unittest.TestCase):
    def test_module_exposes_try_handle_hooks(self):
        mod = _load()
        self.assertTrue(hasattr(mod, "try_handle_get"))
        self.assertTrue(hasattr(mod, "try_handle_post"))


if __name__ == "__main__":
    unittest.main()
```

> **Module-loading note for all tasks in this plan:** Because the directory `.Storage/` starts with a dot, Python cannot import it as a package. Always load `dev_server_export_video.py` via the `_load()` helper shown above (the same pattern used by `test_update_data.py`). Subsequent tasks that say `mod = _load()` rely on this helper being present from Task A1.

- [ ] **Step 3: Run the test to verify it fails**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v
```

Expected: `FileNotFoundError` or load-time error because `dev_server_export_video.py` doesn't exist yet.

- [ ] **Step 4: Create the minimal module to pass**

`.Storage/Scripts/dev_server_export_video.py`:

```python
"""HTTP handlers for the per-runner Video Export feature (dev server only).

Endpoints (mounted from each runner's run_site.py):
  POST /__export-video/start    body: {"state": {...}, "resolution": "1080p|1440p|2160p"}
  GET  /__export-video/progress?id=<jobId>
  GET  /__export-video/result?id=<jobId>      (chunked .mp4 stream)
  POST /__export-video/cancel   body: {"id": "<jobId>"}
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse


def try_handle_get(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)
    if not parsed.path.startswith("/__export-video/"):
        return False
    return False  # endpoints filled in later tasks


def try_handle_post(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)
    if not parsed.path.startswith("/__export-video/"):
        return False
    return False  # endpoints filled in later tasks
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v
```

Expected: `OK` (1 test).

- [ ] **Step 6: Pin Playwright in requirements.txt**

`.Storage/Scripts/requirements.txt` (create or append):

```
playwright>=1.40,<2.0
```

- [ ] **Step 7: Commit**

```bash
git add ".Storage/Scripts/tests/__init__.py" ".Storage/Scripts/tests/test_export_video.py" ".Storage/Scripts/dev_server_export_video.py" ".Storage/Scripts/requirements.txt"
git commit -m "video-exporter: scaffold backend module + test harness"
```

---

### Task A2: Job state machine + progress snapshot

**Files:**
- Modify: `.Storage/Scripts/dev_server_export_video.py`
- Modify: `.Storage/Scripts/tests/test_export_video.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_export_video.py`:

```python
class TestJobState(unittest.TestCase):
    def setUp(self):
        self.mod = _load()
        if hasattr(self.mod, "_reset_jobs_for_tests"):
            self.mod._reset_jobs_for_tests()

    def test_new_job_starts_queued(self):
        job_id = self.mod._create_job(state={"x": 1}, resolution="1080p", fps=60)
        snap = self.mod._snapshot_job(job_id)
        self.assertEqual(snap["status"], "queued")
        self.assertEqual(snap["frame"], 0)
        self.assertEqual(snap["resolution"], "1080p")

    def test_progress_updates_visible(self):
        job_id = self.mod._create_job(state={}, resolution="1080p", fps=60)
        self.mod._update_progress(job_id, frame=240, total_frames=5400, phase="rendering")
        snap = self.mod._snapshot_job(job_id)
        self.assertEqual(snap["frame"], 240)
        self.assertEqual(snap["totalFrames"], 5400)
        self.assertEqual(snap["phase"], "rendering")

    def test_unknown_job_returns_error_snapshot(self):
        snap = self.mod._snapshot_job("does-not-exist")
        self.assertEqual(snap["status"], "unknown")

    def test_cancel_sets_flag(self):
        job_id = self.mod._create_job(state={}, resolution="1080p", fps=60)
        self.mod._cancel_job(job_id)
        snap = self.mod._snapshot_job(job_id)
        self.assertTrue(snap.get("cancelled"))
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v
```

Expected: 4 failures (missing `_create_job`, `_snapshot_job`, etc.).

- [ ] **Step 3: Add the job state machine to the module**

Add to `.Storage/Scripts/dev_server_export_video.py`:

```python
import secrets
import threading
import time
from typing import Optional

_JOBS_LOCK = threading.Lock()
_JOBS: dict[str, dict] = {}
_VALID_RESOLUTIONS = {"1080p": (1920, 1080), "1440p": (2560, 1440), "2160p": (3840, 2160)}


def _create_job(*, state: dict, resolution: str, fps: int) -> str:
    if resolution not in _VALID_RESOLUTIONS:
        raise ValueError(f"unsupported resolution: {resolution}")
    job_id = secrets.token_urlsafe(12)
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "id": job_id,
            "status": "queued",
            "phase": "queued",
            "frame": 0,
            "totalFrames": 0,
            "resolution": resolution,
            "fps": fps,
            "state": state,
            "cancelled": False,
            "error": None,
            "result_path": None,
            "created_at": time.time(),
        }
    return job_id


def _update_progress(job_id: str, *, frame: int, total_frames: int, phase: str) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return
        job["frame"] = frame
        job["totalFrames"] = total_frames
        job["phase"] = phase
        if phase == "rendering" and job["status"] == "queued":
            job["status"] = "running"


def _snapshot_job(job_id: Optional[str]) -> dict:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id) if job_id else None
        if job is None:
            return {"status": "unknown"}
        # Strip internal-only fields
        snap = {k: v for k, v in job.items() if k not in ("state",)}
        return snap


def _cancel_job(job_id: str) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return
        job["cancelled"] = True


def _reset_jobs_for_tests() -> None:
    with _JOBS_LOCK:
        _JOBS.clear()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v
```

Expected: 5 tests OK.

- [ ] **Step 5: Commit**

```bash
git add ".Storage/Scripts/dev_server_export_video.py" ".Storage/Scripts/tests/test_export_video.py"
git commit -m "video-exporter: job state machine + progress snapshot"
```

---

### Task A3: HTTP layer (POST /start, GET /progress, POST /cancel)

**Files:**
- Modify: `.Storage/Scripts/dev_server_export_video.py`
- Modify: `.Storage/Scripts/tests/test_export_video.py`

- [ ] **Step 1: Write failing HTTP-layer tests**

Append to `tests/test_export_video.py`:

```python
import io
import json
from unittest.mock import MagicMock


def _make_handler(*, method: str, path: str, body: bytes = b""):
    handler = MagicMock()
    handler.path = path
    handler.command = method
    handler.headers = {"Content-Length": str(len(body))}
    handler.rfile = io.BytesIO(body)
    handler.wfile = io.BytesIO()
    handler._responses = []
    def _send_response(code):
        handler._responses.append(code)
    def _send_header(k, v):
        pass
    def _end_headers():
        pass
    handler.send_response = _send_response
    handler.send_header = _send_header
    handler.end_headers = _end_headers
    return handler


class TestHttpLayer(unittest.TestCase):
    def setUp(self):
        self.mod = _load()
        if hasattr(self.mod, "_reset_jobs_for_tests"):
            self.mod._reset_jobs_for_tests()
        self.mod._reset_jobs_for_tests()
        self.root = Path("/tmp/test-root")

    def test_post_start_returns_job_id(self):
        body = json.dumps({"state": {}, "resolution": "1080p", "fps": 60}).encode("utf-8")
        handler = _make_handler(method="POST", path="/__export-video/start", body=body)
        # Disable the actual render worker for this unit test
        self.mod._render_worker = lambda job_id, project_root: None
        ok = self.mod.try_handle_post(handler, self.root)
        self.assertTrue(ok)
        self.assertEqual(handler._responses[-1], 200)
        out = json.loads(handler.wfile.getvalue().decode("utf-8"))
        self.assertIn("id", out)

    def test_post_start_rejects_bad_resolution(self):
        body = json.dumps({"state": {}, "resolution": "8k", "fps": 60}).encode("utf-8")
        handler = _make_handler(method="POST", path="/__export-video/start", body=body)
        ok = self.mod.try_handle_post(handler, self.root)
        self.assertTrue(ok)
        self.assertEqual(handler._responses[-1], 400)

    def test_get_progress_for_unknown_job(self):
        handler = _make_handler(method="GET", path="/__export-video/progress?id=nope")
        ok = self.mod.try_handle_get(handler, self.root)
        self.assertTrue(ok)
        out = json.loads(handler.wfile.getvalue().decode("utf-8"))
        self.assertEqual(out["status"], "unknown")

    def test_get_unrelated_path_returns_false(self):
        handler = _make_handler(method="GET", path="/index.html")
        ok = self.mod.try_handle_get(handler, self.root)
        self.assertFalse(ok)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v
```

Expected: 4 failures in `TestHttpLayer` (no handler implementations yet).

- [ ] **Step 3: Implement the HTTP layer**

Replace the stub `try_handle_get` / `try_handle_post` in `.Storage/Scripts/dev_server_export_video.py`:

```python
_PREFIX = "/__export-video/"
_POST_START_PATH = _PREFIX + "start"
_POST_CANCEL_PATH = _PREFIX + "cancel"
_GET_PROGRESS_PATH = _PREFIX + "progress"
_GET_RESULT_PATH = _PREFIX + "result"
_MAX_POST_BYTES = 8 * 1024 * 1024  # 8 MB state payload cap


def _send_json(handler, code: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_post_body(handler) -> Optional[dict]:
    try:
        n = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        _send_json(handler, 400, {"error": "Invalid Content-Length"})
        return None
    if n > _MAX_POST_BYTES:
        _send_json(handler, 413, {"error": "Payload too large"})
        return None
    raw = handler.rfile.read(max(n, 0))
    try:
        body = json.loads(raw.decode("utf-8") if raw else "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        _send_json(handler, 400, {"error": "Invalid JSON"})
        return None
    if not isinstance(body, dict):
        _send_json(handler, 400, {"error": "Body must be a JSON object"})
        return None
    return body


def _render_worker(job_id: str, project_root: Path) -> None:
    """Replaced by Task A4 (Playwright loop). Placeholder for tests."""
    pass


def try_handle_get(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)
    path = parsed.path
    if path == _GET_PROGRESS_PATH:
        from urllib.parse import parse_qs
        qs = parse_qs(parsed.query)
        job_id = (qs.get("id") or [None])[0]
        _send_json(handler, 200, _snapshot_job(job_id))
        return True
    if path == _GET_RESULT_PATH:
        from urllib.parse import parse_qs
        qs = parse_qs(parsed.query)
        job_id = (qs.get("id") or [None])[0]
        _stream_result(handler, job_id)
        return True
    return False


def try_handle_post(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)
    path = parsed.path
    if path == _POST_START_PATH:
        body = _read_post_body(handler)
        if body is None:
            return True
        state = body.get("state")
        resolution = body.get("resolution")
        fps = body.get("fps", 60)
        if not isinstance(state, dict):
            _send_json(handler, 400, {"error": "state must be an object"})
            return True
        if resolution not in _VALID_RESOLUTIONS:
            _send_json(handler, 400, {"error": "invalid resolution"})
            return True
        try:
            fps = int(fps)
        except (TypeError, ValueError):
            _send_json(handler, 400, {"error": "fps must be int"})
            return True
        if fps not in (30, 60):
            _send_json(handler, 400, {"error": "fps must be 30 or 60"})
            return True
        job_id = _create_job(state=state, resolution=resolution, fps=fps)
        threading.Thread(
            target=_render_worker, args=(job_id, project_root), daemon=True
        ).start()
        _send_json(handler, 200, {"id": job_id})
        return True

    if path == _POST_CANCEL_PATH:
        body = _read_post_body(handler)
        if body is None:
            return True
        jid = body.get("id")
        if not isinstance(jid, str):
            _send_json(handler, 400, {"error": "id required"})
            return True
        _cancel_job(jid)
        _send_json(handler, 200, {"ok": True})
        return True
    return False


def _stream_result(handler, job_id: Optional[str]) -> None:
    """Streams the rendered .mp4 to the response. Fills in once renderer writes a file."""
    snap = _snapshot_job(job_id)
    if snap.get("status") != "done" or not snap.get("result_path"):
        _send_json(handler, 404, {"error": "result not ready"})
        return
    path = Path(snap["result_path"])
    if not path.exists():
        _send_json(handler, 404, {"error": "result file missing"})
        return
    handler.send_response(200)
    handler.send_header("Content-Type", "video/mp4")
    handler.send_header("Content-Length", str(path.stat().st_size))
    handler.end_headers()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            handler.wfile.write(chunk)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v
```

Expected: 9 tests OK.

- [ ] **Step 5: Commit**

```bash
git add ".Storage/Scripts/dev_server_export_video.py" ".Storage/Scripts/tests/test_export_video.py"
git commit -m "video-exporter: HTTP endpoints + JSON validation"
```

---

### Task A4: ffmpeg encoder

**Files:**
- Modify: `.Storage/Scripts/dev_server_export_video.py`
- Modify: `.Storage/Scripts/tests/test_export_video.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_export_video.py`:

```python
import shutil
import subprocess
import tempfile


class TestFfmpegEncoder(unittest.TestCase):
    def setUp(self):
        if not shutil.which("ffmpeg"):
            self.skipTest("ffmpeg not installed")
        self.mod = _load()

    def test_encode_produces_mp4(self):
        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp) / "frames"
            frames_dir.mkdir()
            # Make 3 tiny PNGs with ffmpeg
            for i in range(3):
                subprocess.run(
                    ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:d=0.1",
                     "-frames:v", "1", str(frames_dir / f"frame_{i:06d}.png")],
                    check=True, capture_output=True,
                )
            out_path = Path(tmp) / "out.mp4"
            self.mod._encode(
                frames_dir=frames_dir,
                fps=30,
                resolution=(320, 180),
                audio_timeline=[],
                project_root=Path(tmp),
                out_path=out_path,
            )
            self.assertTrue(out_path.exists())
            self.assertGreater(out_path.stat().st_size, 1000)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v -k TestFfmpegEncoder
```

Expected: `AttributeError: module ... has no attribute '_encode'`.

- [ ] **Step 3: Implement the encoder**

Add to `.Storage/Scripts/dev_server_export_video.py`:

```python
import platform
import subprocess as _sp

_CRF = "16"  # visually lossless H.264
_AUDIO_BITRATE = "320k"


def _ffmpeg_video_args() -> list[str]:
    """Pick the best encoder for this platform."""
    if platform.system() == "Darwin":
        return [
            "-c:v", "h264_videotoolbox",
            "-q:v", "55",          # VideoToolbox uses 0-100; ~55 ≈ CRF 16-ish
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
        ]
    # Cross-platform fallback (libx264 software encode)
    return [
        "-c:v", "libx264",
        "-crf", _CRF,
        "-preset", "slow",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
    ]


def _build_audio_inputs(audio_timeline: list[dict], project_root: Path) -> tuple[list[str], list[str]]:
    """Returns (input_args, filter_complex_chunks) for ffmpeg.

    Each entry in audio_timeline has: { file: str (project-relative), startMs: int, durationMs: int, volume: float }
    """
    input_args: list[str] = []
    filter_chunks: list[str] = []
    for idx, entry in enumerate(audio_timeline):
        rel = entry["file"]
        abs_path = (project_root / rel).resolve()
        if not abs_path.exists():
            raise FileNotFoundError(f"audio file missing: {abs_path}")
        input_args += ["-i", str(abs_path)]
        delay_ms = int(entry["startMs"])
        vol = float(entry.get("volume", 1.0))
        # Each input becomes [1+idx:a] because [0:v] is the video frames
        filter_chunks.append(
            f"[{idx + 1}:a]volume={vol},adelay={delay_ms}|{delay_ms}[a{idx}]"
        )
    if filter_chunks:
        mix_inputs = "".join(f"[a{i}]" for i in range(len(audio_timeline)))
        filter_chunks.append(f"{mix_inputs}amix=inputs={len(audio_timeline)}:dropout_transition=0,aresample=48000[aout]")
    return input_args, filter_chunks


def _encode(
    *,
    frames_dir: Path,
    fps: int,
    resolution: tuple[int, int],
    audio_timeline: list[dict],
    project_root: Path,
    out_path: Path,
) -> None:
    """Encode PNG frames + audio timeline into an MP4 at out_path."""
    w, h = resolution
    cmd: list[str] = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", str(frames_dir / "frame_%06d.png"),
    ]
    audio_inputs, audio_filters = _build_audio_inputs(audio_timeline, project_root)
    cmd += audio_inputs
    cmd += _ffmpeg_video_args()
    cmd += ["-r", str(fps), "-s", f"{w}x{h}"]
    if audio_filters:
        cmd += ["-filter_complex", ";".join(audio_filters), "-map", "0:v", "-map", "[aout]",
                "-c:a", "aac", "-b:a", _AUDIO_BITRATE, "-ar", "48000"]
    else:
        cmd += ["-an"]
    cmd += ["-movflags", "+faststart", str(out_path)]
    _sp.run(cmd, check=True, capture_output=True)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video.py" -v -k TestFfmpegEncoder
```

Expected: 1 test OK (or skipped if ffmpeg not installed locally).

- [ ] **Step 5: Commit**

```bash
git add ".Storage/Scripts/dev_server_export_video.py" ".Storage/Scripts/tests/test_export_video.py"
git commit -m "video-exporter: ffmpeg encoder with VideoToolbox + audio timeline mix"
```

---

### Task A5: Playwright render loop

**Files:**
- Modify: `.Storage/Scripts/dev_server_export_video.py`

**Note:** This task requires Playwright Chromium installed. Run `python -m playwright install chromium` before the first run.

- [ ] **Step 1: Add the renderer function**

Replace the placeholder `_render_worker` in `.Storage/Scripts/dev_server_export_video.py`:

```python
import tempfile
import urllib.request
from urllib.parse import urlencode


def _python_server_origin() -> str:
    """The dev server origin the headless Chromium will hit. Always loopback."""
    return os.environ.get("EXPORT_RENDER_ORIGIN", "http://127.0.0.1:8000")


def _render_worker(job_id: str, project_root: Path) -> None:
    """Drives Playwright frame-by-frame, calls ffmpeg, marks the job done."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        _mark_failed(job_id, f"Playwright not installed: {e}. Run `python -m playwright install chromium`.")
        return

    job = _snapshot_job(job_id)
    if job.get("status") == "unknown":
        return
    w, h = _VALID_RESOLUTIONS[job["resolution"]]
    fps = job["fps"]

    with tempfile.TemporaryDirectory(prefix="export-video-") as tmpdir_str:
        tmpdir = Path(tmpdir_str)
        frames_dir = tmpdir / "frames"
        frames_dir.mkdir()
        out_mp4 = tmpdir / "out.mp4"

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
                page = ctx.new_page()
                url = _python_server_origin() + "/index.html?exportMode=1&jobId=" + job_id
                page.goto(url, wait_until="domcontentloaded")
                # Inject saved-script state
                page.evaluate(
                    "(s) => { window.__exportState__ = s; window.dispatchEvent(new Event('export-state-ready')); }",
                    _job_state(job_id),
                )
                # Page is responsible for computing total frames once state is loaded.
                # It then exposes window.__exportTotalFrames__ and window.__exportFrame__(t).
                page.wait_for_function("typeof window.__exportTotalFrames__ === 'number' && window.__exportTotalFrames__ > 0", timeout=60_000)
                total = page.evaluate("() => window.__exportTotalFrames__")
                _update_progress(job_id, frame=0, total_frames=total, phase="rendering")

                for i in range(total):
                    if _snapshot_job(job_id).get("cancelled"):
                        _mark_failed(job_id, "cancelled by user")
                        return
                    t_ms = int(round((i / fps) * 1000))
                    page.evaluate("(t) => window.__exportFrame__(t)", t_ms)
                    page.wait_for_function("window.__exportFrameReady__ === true", timeout=15_000)
                    page.evaluate("window.__exportFrameReady__ = false")
                    page.screenshot(path=str(frames_dir / f"frame_{i:06d}.png"), omit_background=False)
                    if i % 30 == 0:
                        _update_progress(job_id, frame=i, total_frames=total, phase="rendering")

                # Pull audio timeline from the page
                audio_timeline = page.evaluate("() => window.__exportAudioTimeline__ || []")
            finally:
                browser.close()

        _update_progress(job_id, frame=total, total_frames=total, phase="encoding")
        _encode(
            frames_dir=frames_dir,
            fps=fps,
            resolution=(w, h),
            audio_timeline=audio_timeline,
            project_root=project_root,
            out_path=out_mp4,
        )

        # Move the file to a stable spot the result endpoint can serve from
        result_dir = project_root / ".Storage" / "tmp" / "exports"
        result_dir.mkdir(parents=True, exist_ok=True)
        final = result_dir / f"{job_id}.mp4"
        shutil.move(str(out_mp4), str(final))
        _mark_done(job_id, final)


def _job_state(job_id: str) -> dict:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        return dict(job["state"]) if job else {}


def _mark_done(job_id: str, path: Path) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return
        job["status"] = "done"
        job["phase"] = "done"
        job["result_path"] = str(path)


def _mark_failed(job_id: str, message: str) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return
        job["status"] = "failed"
        job["error"] = message
```

- [ ] **Step 2: Add the imports near the top of the module**

Make sure these imports exist at the top of `dev_server_export_video.py`:

```python
import os
import shutil
```

- [ ] **Step 3: Smoke-test the import path**

```bash
python -c "from .Storage.Scripts.dev_server_export_video import _render_worker; print('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add ".Storage/Scripts/dev_server_export_video.py"
git commit -m "video-exporter: Playwright frame loop + result staging"
```

---

### Task A6: Wire backend into run_site.py

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/run_site.py`

- [ ] **Step 1: Locate the existing loader pattern**

Search for `_runner_update_mod` in `run_site.py` — there are three sites: the loader, `do_GET`, `do_POST`. Mirror them for the new module.

```bash
grep -n "_runner_update_mod" "1_Guess The Football Team Name - Main Runner - Regular/run_site.py"
```

Expected: 3 hits.

- [ ] **Step 2: Add the loader for the export module**

Find the block that ends with the `_runner_update_mod = ...` import-by-path. Add directly below it:

```python
_runner_export_video_mod = _import_module_from_path(
    "_export_video_mod",
    PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_export_video.py",
)
```

(Use the same helper the existing code uses for `_runner_update_mod`. If the helper is inlined rather than named, copy-paste the inlined pattern; do NOT extract a new helper as part of this task.)

- [ ] **Step 3: Add the GET dispatch**

In `do_GET`, immediately after the `_runner_update_mod.try_handle_get(...)` line at line 2679, add:

```python
        if _runner_export_video_mod.try_handle_get(self, PROJECT_ROOT):
            return
```

- [ ] **Step 4: Add the POST dispatch**

In `do_POST`, immediately after the `_runner_update_mod.try_handle_post(...)` line at line 2707, add:

```python
        if _runner_export_video_mod.try_handle_post(self, PROJECT_ROOT):
            return
```

- [ ] **Step 5: Smoke-test the server starts**

```bash
cd "1_Guess The Football Team Name - Main Runner - Regular"
python run_site.py --no-browser --port 8765 &
sleep 2
curl -s http://127.0.0.1:8765/__export-video/progress?id=nope
kill %1
```

Expected: JSON `{"status": "unknown"}`.

- [ ] **Step 6: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/run_site.py"
git commit -m "video-exporter: mount backend module into run_site.py"
```

---

## Phase B — Page-side export mode

### Task B1: `export-mode.js` helpers

**Files:**
- Create: `1_Guess The Football Team Name - Main Runner - Regular/js/export-mode.js`

- [ ] **Step 1: Create the module**

`1_Guess The Football Team Name - Main Runner - Regular/js/export-mode.js`:

```javascript
/**
 * Export-mode helpers. When ?exportMode=1 is in the URL, timing/random/audio
 * calls become deterministic and frame-driven instead of wall-clock-driven.
 *
 * In non-export mode, every wrapper here is a pass-through. The runner still
 * behaves identically when the user previews in their normal tab.
 */

const _params = new URLSearchParams(window.location.search);
const _IS_EXPORT = _params.get("exportMode") === "1";

let _exportClockMs = 0;
let _seedState = 0xC0FFEE;
const _audioTimeline = [];
const _pendingTimers = [];

export function isExportMode() {
    return _IS_EXPORT;
}

export function exportNow() {
    return _IS_EXPORT ? _exportClockMs : performance.now();
}

export function advanceExportClock(ms) {
    _exportClockMs = ms;
    // Drain any timers whose target time has passed
    while (_pendingTimers.length && _pendingTimers[0].at <= _exportClockMs) {
        const t = _pendingTimers.shift();
        try { t.fn(); } catch (e) { console.error("[export-mode] timer error", e); }
    }
}

export function exportDelay(ms) {
    if (!_IS_EXPORT) return new Promise((resolve) => setTimeout(resolve, ms));
    return new Promise((resolve) => {
        _pendingTimers.push({ at: _exportClockMs + ms, fn: resolve });
        _pendingTimers.sort((a, b) => a.at - b.at);
    });
}

export function exportSetTimeout(fn, ms) {
    if (!_IS_EXPORT) return setTimeout(fn, ms);
    _pendingTimers.push({ at: _exportClockMs + ms, fn });
    _pendingTimers.sort((a, b) => a.at - b.at);
    return -1; // export-mode timers are not cancellable individually (YAGNI for pilot)
}

function _seededRandomNext() {
    // Mulberry32
    _seedState |= 0;
    _seedState = (_seedState + 0x6D2B79F5) | 0;
    let t = Math.imul(_seedState ^ (_seedState >>> 15), 1 | _seedState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function exportRandom() {
    return _IS_EXPORT ? _seededRandomNext() : Math.random();
}

export function setExportSeed(seed) {
    _seedState = (seed | 0) || 0xC0FFEE;
}

export function recordAudio(file, { startMs, durationMs, volume = 1.0 } = {}) {
    if (!_IS_EXPORT) return; // caller will play the audio normally
    _audioTimeline.push({ file, startMs, durationMs, volume });
}

export function getAudioTimeline() {
    return _audioTimeline.slice();
}

// Expose to the Playwright driver:
if (_IS_EXPORT) {
    window.__exportAudioTimeline__ = _audioTimeline;
    window.__advanceExportClock__ = advanceExportClock;
}
```

- [ ] **Step 2: Smoke-test it loads without errors**

Open the runner in a browser, look at the JS console — no errors. Then open with `?exportMode=1` and verify `window.__exportAudioTimeline__` exists.

```bash
# Start the server in one shell:
cd "1_Guess The Football Team Name - Main Runner - Regular"
python run_site.py --no-browser
```

In another shell:
```bash
curl -s "http://127.0.0.1:8000/1_Guess%20The%20Football%20Team%20Name%20-%20Main%20Runner%20-%20Regular/js/export-mode.js" | head -5
```

Expected: the JS source.

- [ ] **Step 3: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/export-mode.js"
git commit -m "video-exporter: add page-side export-mode helpers"
```

---

### Task B2: Route timing primitives through export-mode helpers

**Files:** all 13 affected runner JS files (see File map).

**Approach (DRY recipe — apply to each file):**

For each occurrence of:

- `setTimeout(fn, ms)` → if it advances a visible animation/state step, replace with `exportSetTimeout(fn, ms)`. **Leave it alone** if it's a watchdog/network timeout that should NOT advance the export clock.
- `await new Promise(r => setTimeout(r, ms))` or `await delay(ms)` → replace with `await exportDelay(ms)`.
- `Math.random()` → if its output ends up in a rendered frame (emoji position, shuffle order, etc.), replace with `exportRandom()`. **Leave it alone** if it's used only for logging/telemetry IDs.

For each file that gets a replacement, add at the top:

```javascript
import { exportSetTimeout, exportDelay, exportRandom } from "./export-mode.js";
```

- [ ] **Step 1: Inventory the call sites**

```bash
grep -rnE "setTimeout\(|Math\.random\(|new Promise\(\s*\(?r\)?\s*=>\s*setTimeout" "1_Guess The Football Team Name - Main Runner - Regular/js" | tee /tmp/export-inventory.txt
wc -l /tmp/export-inventory.txt
```

Expected: ~80-130 lines. Review each one and classify as "advance clock" vs "leave alone."

- [ ] **Step 2: Apply replacements in `audio.js`**

For each `setTimeout` that schedules an audio playback step → wrap with `exportSetTimeout`.

For each `Math.random()` used to vary playback (e.g., music start offset) → wrap with `exportRandom`.

Add the import at top:
```javascript
import { exportSetTimeout, exportRandom } from "./export-mode.js";
```

- [ ] **Step 3: Apply replacements in `video.js`**

Same recipe. The `LOGO_PAGE_PLAY_VIDEO_DELAY_MS` constant is fine — only the `setTimeout` that USES it gets wrapped.

- [ ] **Step 4: Apply replacements in `transitions.js`**

Same recipe. This is the highest-touch file (42 hits per the spec inventory).

- [ ] **Step 5: Apply replacements in `pitch-render.js`, `emojis.js`, `team-header-hatch.js`, `levels.js`, `bootstrap-hybrid.js`, `voice-tab.js`, `saved-team-layouts.js`, `runner-saved-server-sync.js`, `saved-scripts.js`**

Per file, same recipe. Most have 1-13 hits.

- [ ] **Step 6: Verify non-export-mode behavior unchanged**

```bash
cd "1_Guess The Football Team Name - Main Runner - Regular"
python run_site.py
# In the browser, load a saved script and click Play Video — animations
# and audio should look identical to before this task.
```

- [ ] **Step 7: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js"
git commit -m "video-exporter: route timing/random calls through export-mode helpers"
```

---

### Task B3: Audio playback timeline collector

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/audio.js`

The goal: in export mode, `new Audio(src).play()` (and similar `play*` helpers) should NOT actually play but instead emit a `{ file, startMs, durationMs, volume }` entry that ffmpeg uses later.

- [ ] **Step 1: Identify the playback sites**

```bash
grep -nE "new Audio\(|\.play\(\)|audio\.src\s*=" "1_Guess The Football Team Name - Main Runner - Regular/js/audio.js"
```

- [ ] **Step 2: Add a wrapper at the top of audio.js**

```javascript
import { isExportMode, exportNow, recordAudio } from "./export-mode.js";

/**
 * Single point through which all voice/music playback flows.
 * In export mode this writes to the timeline; in normal mode it plays the audio.
 */
function _playAudioOrRecord(src, { volume = 1.0, durationMs = null } = {}) {
    if (isExportMode()) {
        recordAudio(src, { startMs: Math.round(exportNow()), durationMs, volume });
        return Promise.resolve();
    }
    const a = new Audio(src);
    a.volume = volume;
    return a.play().then(() => a);
}
```

- [ ] **Step 3: Replace each direct `new Audio(...)` / `audio.play()` site**

Refactor `playBgMusic`, `playRules`, `playTheAnswerIs`, `playCommentBelow`, `playTicking`, etc. so each is a single line that calls `_playAudioOrRecord(file, opts)`. The `stopAllAudio` / `stopTicking` calls are no-ops in export mode (the timeline doesn't care about stops — duration is built into each entry).

- [ ] **Step 4: Each cue must know its `durationMs`**

For voice files, look up duration ahead of time. Easiest path: use `<audio>` `loadedmetadata` event once at boot:

```javascript
async function _probeDuration(src) {
    if (!isExportMode()) return null;
    const a = new Audio(src);
    return new Promise((resolve) => {
        a.addEventListener("loadedmetadata", () => resolve(a.duration * 1000));
        a.addEventListener("error", () => resolve(null));
        // Required in some browsers to load metadata
        a.preload = "metadata";
        a.src = src;
    });
}
```

Probe each unique source on demand and cache the result.

- [ ] **Step 5: Verify the timeline collects entries**

Open the runner with `?exportMode=1`, click Play Video, then in console:

```javascript
window.__exportAudioTimeline__
```

Expected: an array of `{ file, startMs, durationMs, volume }` entries growing as the video plays.

- [ ] **Step 6: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/audio.js"
git commit -m "video-exporter: audio playback emits timeline entries in export mode"
```

---

### Task B4: Frame-stepping API (`window.__exportFrame__`)

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/video.js`
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/export-mode.js`

The renderer calls `window.__exportFrame__(timestampMs)` per frame. The runner must (a) advance the export clock, (b) flush any GSAP timelines to the target time, (c) wait for all images/fonts to settle, then (d) signal readiness.

- [ ] **Step 1: Compute total frames once state is loaded**

In `video.js`, after the runner finishes its bootstrap and resolves the saved-script state, in export mode compute:

```javascript
import { isExportMode, advanceExportClock, exportNow } from "./export-mode.js";

function _setupExportApi() {
    if (!isExportMode()) return;
    // Sum of all cue durations + transition allowances determines totalMs.
    // Total frames = ceil(totalMs / 1000 * fps). Use fps = 60 (renderer also uses 60).
    const totalMs = _computeFullScriptDurationMs();
    const fps = 60;
    window.__exportTotalFrames__ = Math.ceil((totalMs / 1000) * fps);

    let _ready = true;
    window.__exportFrameReady__ = true;

    window.__exportFrame__ = async (tMs) => {
        window.__exportFrameReady__ = false;
        advanceExportClock(tMs);
        // Wait for any in-flight animations and images:
        await Promise.all([
            document.fonts.ready,
            _waitForAllImagesLoaded(),
            _flushGsapToTime(tMs),
        ]);
        window.__exportFrameReady__ = true;
    };
}
```

- [ ] **Step 2: Implement `_computeFullScriptDurationMs()`**

Walk through the level structure exactly the way `startVideoFlow` does, but accumulate durations instead of playing. Use the same cue-duration table from Task B3. Add transitions allowance per level (e.g., 800 ms default — the spec's GSAP defaults).

Concrete shape:

```javascript
function _computeFullScriptDurationMs() {
    let total = 0;
    for (const lvl of appState.levelsData) {
        total += _durationForLevel(lvl); // sums voice cues + transitions + post-reveal pauses
    }
    return total;
}
```

- [ ] **Step 3: Implement `_waitForAllImagesLoaded()`**

```javascript
async function _waitForAllImagesLoaded() {
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
        });
    }));
}
```

- [ ] **Step 4: Implement `_flushGsapToTime(tMs)`**

GSAP has `gsap.globalTimeline.totalTime(t)` which jumps every active animation to time `t` (in seconds). Use it:

```javascript
async function _flushGsapToTime(tMs) {
    if (!window.gsap) return;
    window.gsap.globalTimeline.totalTime(tMs / 1000);
}
```

Note: this requires that GSAP animations are placed onto `gsap.globalTimeline` (the default for `gsap.to/from/timeline()`). They are — GSAP defaults to the global timeline.

- [ ] **Step 5: Call `_setupExportApi()` after bootstrap**

Find the place `startVideoFlow` is invoked / the equivalent boot completion. Add `_setupExportApi()` immediately after the state-ready event in export mode.

- [ ] **Step 6: Manual verification**

```bash
cd "1_Guess The Football Team Name - Main Runner - Regular"
python run_site.py --no-browser
# Then in a separate browser tab:
# http://127.0.0.1:8000/1_Guess.../index.html?exportMode=1
```

In console:
```javascript
window.__exportTotalFrames__   // some positive integer
await window.__exportFrame__(0);
window.__exportFrameReady__     // true
await window.__exportFrame__(1000);
// page should reflect t=1000ms state
```

- [ ] **Step 7: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js"
git commit -m "video-exporter: frame-stepping API + duration calculator"
```

---

## Phase C — UI integration

### Task C1: Add Export Resolution dropdown

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/html/controls.html`
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/dom-bindings.js`
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/state.js`

- [ ] **Step 1: Add the dropdown in `controls.html`**

Locate line 110 (the closing `</button>` of `#btn-youtube-thumbnails`). Directly below, insert:

```html
  <label class="field" style="margin-top: 0.8rem;">
    <span class="label">Export Resolution</span>
    <select id="in-export-resolution">
      <option value="1080p" selected>1080p (1920 × 1080)</option>
      <option value="1440p">1440p (2560 × 1440)</option>
      <option value="2160p">2160p (3840 × 2160)</option>
    </select>
  </label>
```

- [ ] **Step 2: Add the element ref in `dom-bindings.js`**

After the `els.playVideoBtn = ...` line at line 39, add:

```javascript
els.exportResolutionSelect = document.getElementById("in-export-resolution");
```

- [ ] **Step 3: Add the state field in `state.js`**

Add `exportResolution: "1080p"` to the `appState` initial object (or wherever defaults are seeded). Also include it in any save/load serialization that touches `landing`/`lineup` config.

- [ ] **Step 4: Wire the change handler in `app.js`**

Find the block where other `els.*.onchange` handlers are registered. Add:

```javascript
if (els.exportResolutionSelect) {
    els.exportResolutionSelect.value = appState.exportResolution || "1080p";
    els.exportResolutionSelect.onchange = () => {
        appState.exportResolution = els.exportResolutionSelect.value;
    };
}
```

- [ ] **Step 5: Verify the UI shows the dropdown**

Reload the runner, open the control panel, confirm "Export Resolution" appears directly below the "YouTube thumbnails" button with three options.

- [ ] **Step 6: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/html/controls.html" \
        "1_Guess The Football Team Name - Main Runner - Regular/js/dom-bindings.js" \
        "1_Guess The Football Team Name - Main Runner - Regular/js/state.js" \
        "1_Guess The Football Team Name - Main Runner - Regular/js/app.js"
git commit -m "video-exporter: Export Resolution dropdown in control panel"
```

---

### Task C2: Export progress modal

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/html/modals.html`

- [ ] **Step 1: Add the modal markup**

Append to `modals.html` (use the existing Update Data modal as a structural reference — same class names so it picks up CSS for free):

```html
<div id="export-modal" class="swap-modal" hidden>
  <div class="swap-modal__panel">
    <div class="swap-modal__header">
      <h3 id="export-modal-title">Rendering video…</h3>
      <button type="button" id="export-modal-cancel" class="panel-toggle">Cancel</button>
    </div>
    <div class="swap-modal__body">
      <div id="export-progress-phase" style="margin-bottom: 0.6rem;">Preparing…</div>
      <div id="export-progress-bar-outer" style="width:100%;height:14px;background:rgba(255,255,255,0.06);border-radius:7px;overflow:hidden;">
        <div id="export-progress-bar" style="width:0%;height:100%;background:var(--accent);transition:width 200ms;"></div>
      </div>
      <div id="export-progress-counter" style="margin-top: 0.6rem; font-size: 0.9rem; opacity: 0.85;">Frame 0 / 0</div>
      <div id="export-progress-eta" style="margin-top: 0.2rem; font-size: 0.85rem; opacity: 0.7;"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/html/modals.html"
git commit -m "video-exporter: progress modal markup"
```

---

### Task C3: `export-client.js` (browser-side driver)

**Files:**
- Create: `1_Guess The Football Team Name - Main Runner - Regular/js/export-client.js`
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/dom-bindings.js`

- [ ] **Step 1: Add element refs**

In `dom-bindings.js`, after the existing `els.*` block, add:

```javascript
els.exportModal = document.getElementById("export-modal");
els.exportModalCancel = document.getElementById("export-modal-cancel");
els.exportProgressPhase = document.getElementById("export-progress-phase");
els.exportProgressBar = document.getElementById("export-progress-bar");
els.exportProgressCounter = document.getElementById("export-progress-counter");
els.exportProgressEta = document.getElementById("export-progress-eta");
```

- [ ] **Step 2: Create the client module**

`1_Guess The Football Team Name - Main Runner - Regular/js/export-client.js`:

```javascript
import { appState } from "./state.js";
import { els } from "./dom-bindings.js";

const POLL_MS = 500;
let _currentJobId = null;

export async function runExport() {
    // 1) Ask the user where to save
    if (!window.showSaveFilePicker) {
        alert("Your browser does not support the File System Access API. Use Chrome or Edge.");
        return;
    }
    let fileHandle;
    try {
        fileHandle = await window.showSaveFilePicker({
            suggestedName: _suggestedFilename(),
            types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
        });
    } catch (e) {
        // User cancelled the picker
        return;
    }

    // 2) Open the modal
    _openModal();

    // 3) POST the current state
    const state = _serializeAppState();
    const resolution = appState.exportResolution || "1080p";
    const fps = 60;
    let job;
    try {
        const resp = await fetch("/__export-video/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state, resolution, fps }),
        });
        if (!resp.ok) throw new Error(`server returned ${resp.status}`);
        job = await resp.json();
    } catch (e) {
        _showError("Failed to start render: " + e.message);
        return;
    }
    _currentJobId = job.id;

    // 4) Poll progress until done or failed
    let lastSnap = null;
    while (true) {
        await _sleep(POLL_MS);
        const snap = await _fetchProgress(_currentJobId);
        lastSnap = snap;
        _renderProgress(snap);
        if (snap.status === "done" || snap.status === "failed" || snap.cancelled) break;
    }

    if (lastSnap.status !== "done") {
        _showError(lastSnap.error || "Render did not complete.");
        return;
    }

    // 5) Stream the result to the user-picked file
    try {
        const resp = await fetch(`/__export-video/result?id=${encodeURIComponent(_currentJobId)}`);
        if (!resp.ok) throw new Error(`server returned ${resp.status}`);
        const writable = await fileHandle.createWritable();
        await resp.body.pipeTo(writable);
        _showDone();
    } catch (e) {
        _showError("Failed to save file: " + e.message);
    } finally {
        _currentJobId = null;
    }
}

function _suggestedFilename() {
    const name = (appState.currentScriptName || "video").replace(/[^A-Za-z0-9-_ ]+/g, "").trim() || "video";
    const stamp = new Date().toISOString().slice(0, 10);
    return `${name} ${stamp}.mp4`;
}

function _serializeAppState() {
    // Reuse the same shape that saved scripts use, so the page can load it via window.__exportState__
    return {
        landing: { ...appState.landing },
        lineup: { ...appState.lineup },
        levels: JSON.parse(JSON.stringify(appState.levelsData || [])),
        transitions: { ...appState.transitions },
    };
}

async function _fetchProgress(id) {
    const r = await fetch(`/__export-video/progress?id=${encodeURIComponent(id)}`);
    return r.json();
}

function _openModal() {
    if (!els.exportModal) return;
    els.exportModal.hidden = false;
    _renderProgress({ phase: "queued", frame: 0, totalFrames: 0 });
    if (els.exportModalCancel) {
        els.exportModalCancel.onclick = _onCancel;
    }
}

function _renderProgress(snap) {
    if (!els.exportProgressBar) return;
    const total = Math.max(snap.totalFrames || 0, 1);
    const pct = Math.min(100, Math.round(((snap.frame || 0) / total) * 100));
    els.exportProgressBar.style.width = pct + "%";
    els.exportProgressCounter.textContent = `Frame ${snap.frame || 0} / ${snap.totalFrames || 0}`;
    els.exportProgressPhase.textContent = _phaseLabel(snap.phase);
}

function _phaseLabel(p) {
    switch (p) {
        case "queued": return "Preparing…";
        case "rendering": return "Rendering frames…";
        case "encoding": return "Encoding video…";
        case "done": return "Done.";
        default: return p || "";
    }
}

function _showDone() {
    els.exportProgressPhase.textContent = "Done!";
    els.exportProgressBar.style.width = "100%";
}

function _showError(msg) {
    els.exportProgressPhase.textContent = "Error: " + msg;
}

async function _onCancel() {
    if (!_currentJobId) return;
    await fetch("/__export-video/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: _currentJobId }),
    });
    els.exportModal.hidden = true;
    _currentJobId = null;
}

function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
```

- [ ] **Step 3: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/export-client.js" \
        "1_Guess The Football Team Name - Main Runner - Regular/js/dom-bindings.js"
git commit -m "video-exporter: browser-side render driver + progress polling"
```

---

### Task C4: Hijack Play Video click handler

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/app.js`

- [ ] **Step 1: Add the import**

Near the top of `app.js`, with the other module imports:

```javascript
import { runExport } from "./export-client.js";
```

- [ ] **Step 2: Replace the Play Video handler body**

Find `els.playVideoBtn.onclick = () => { ... }` (line 1286). Replace the body so the production-validation check runs first (as today), and **after** that gate, instead of `startVideoFlow()`, call `runExport()`:

```javascript
els.playVideoBtn.onclick = async () => {
    if (isProdMode()) {
        const result = runProdValidation();
        if (!result.allPassed) {
            showValidationModal(result);
            return;
        }
    }
    appState.levelsData.forEach((lvl) => { lvl.videoMode = true; });
    if (els.videoModeToggle && !els.videoModeToggle.checked) {
        els.videoModeToggle.checked = true;
        els.videoModeToggle.dispatchEvent(new Event("change"));
    }
    await runExport();
};
```

(Keep `renderLandingTitleVoiceControls()` and `startVideoFlow()` callable from elsewhere — do NOT delete them. Other code paths still need them.)

- [ ] **Step 3: Manual smoke test**

Start `run_site.py`, load a saved script, click Play Video. Confirm:
- a Save As dialog appears
- the progress modal opens
- (the actual render won't complete yet without Tasks B2-B4 being executed cleanly — but the round-trip should reach `phase: "rendering"`)

- [ ] **Step 4: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/app.js"
git commit -m "video-exporter: route Play Video click to export flow"
```

---

## Phase D — Validation

### Task D1: End-to-end smoke test

**Files:**
- Create: `.Storage/Scripts/tests/test_export_video_e2e.py`

- [ ] **Step 1: Write the smoke test**

`.Storage/Scripts/tests/test_export_video_e2e.py`:

```python
"""End-to-end: spin up run_site.py, post a tiny script, wait for the .mp4."""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import unittest
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNNER_DIR = PROJECT_ROOT / "1_Guess The Football Team Name - Main Runner - Regular"
SAVED_SCRIPTS = PROJECT_ROOT / ".Storage" / "storage" / "saved-scripts" / "lineups_regular.json"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@unittest.skipUnless(SAVED_SCRIPTS.exists(), "lineups_regular.json not present")
@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class TestExportE2E(unittest.TestCase):
    def setUp(self):
        try:
            import playwright  # noqa: F401
        except ImportError:
            self.skipTest("playwright not installed")
        self.port = _free_port()
        env = os.environ.copy()
        env["EXPORT_RENDER_ORIGIN"] = f"http://127.0.0.1:{self.port}"
        self.proc = subprocess.Popen(
            [sys.executable, str(RUNNER_DIR / "run_site.py"), "--no-browser", "--port", str(self.port)],
            env=env, cwd=str(RUNNER_DIR),
        )
        for _ in range(40):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/__export-video/progress?id=ping", timeout=1) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(0.25)

    def tearDown(self):
        self.proc.terminate()
        self.proc.wait(timeout=10)

    def test_render_first_saved_script(self):
        with SAVED_SCRIPTS.open(encoding="utf-8") as f:
            data = json.load(f)
        script = data["scripts"][0]
        # Shape it as the export-client.js would
        state = {
            "landing": script["landing"],
            "lineup": script["lineup"],
            "levels": script["levels"],
            "transitions": script.get("transitions", {}),
        }
        body = json.dumps({"state": state, "resolution": "1080p", "fps": 60}).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/__export-video/start",
            data=body, headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            self.assertEqual(r.status, 200)
            job = json.loads(r.read().decode("utf-8"))
        job_id = job["id"]

        # Poll up to 20 min
        deadline = time.time() + 20 * 60
        while time.time() < deadline:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/__export-video/progress?id={job_id}", timeout=5) as r:
                snap = json.loads(r.read().decode("utf-8"))
            if snap.get("status") in ("done", "failed"):
                break
            time.sleep(2)

        self.assertEqual(snap.get("status"), "done", msg=f"snap={snap}")

        # Download result
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/__export-video/result?id={job_id}", timeout=30) as r:
            data = r.read()
        self.assertGreater(len(data), 100_000)  # at least 100 KB
        self.assertEqual(data[4:8], b"ftyp")    # MP4 magic bytes


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video_e2e.py" -v
```

Expected: `test_render_first_saved_script` passes (may take 5-15 minutes).

- [ ] **Step 3: Commit**

```bash
git add ".Storage/Scripts/tests/test_export_video_e2e.py"
git commit -m "video-exporter: end-to-end smoke test"
```

---

### Task D2: Determinism check

**Files:**
- Modify: `.Storage/Scripts/tests/test_export_video_e2e.py`

- [ ] **Step 1: Add a second test that renders the same script twice and compares**

Append to `test_export_video_e2e.py` (re-uses `self.proc` server):

```python
import hashlib


class TestDeterminism(TestExportE2E):
    """Inherits the server setup."""

    def test_two_renders_are_byte_identical(self):
        with SAVED_SCRIPTS.open(encoding="utf-8") as f:
            data = json.load(f)
        script = data["scripts"][0]
        state = {
            "landing": script["landing"],
            "lineup": script["lineup"],
            "levels": script["levels"][:3],   # use a short prefix so this finishes in a reasonable time
            "transitions": script.get("transitions", {}),
        }
        body = json.dumps({"state": state, "resolution": "1080p", "fps": 60}).encode("utf-8")
        hashes = []
        for _ in range(2):
            req = urllib.request.Request(
                f"http://127.0.0.1:{self.port}/__export-video/start",
                data=body, headers={"Content-Type": "application/json"}, method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                job_id = json.loads(r.read().decode("utf-8"))["id"]
            deadline = time.time() + 10 * 60
            while time.time() < deadline:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/__export-video/progress?id={job_id}", timeout=5) as r:
                    snap = json.loads(r.read().decode("utf-8"))
                if snap.get("status") in ("done", "failed"):
                    break
                time.sleep(2)
            self.assertEqual(snap.get("status"), "done", msg=f"snap={snap}")
            with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/__export-video/result?id={job_id}", timeout=30) as r:
                data_bytes = r.read()
            hashes.append(hashlib.sha256(data_bytes).hexdigest())
        self.assertEqual(hashes[0], hashes[1], msg="two renders of the same script produced different files")
```

- [ ] **Step 2: Run the test**

```bash
python -m unittest discover ".Storage/Scripts/tests" -p "test_export_video_e2e.py" -v -k TestDeterminism
```

Expected: PASS. If it fails, the diff in hashes points to non-deterministic code that escaped Task B2 — investigate and fix that file, then re-run.

- [ ] **Step 3: Commit**

```bash
git add ".Storage/Scripts/tests/test_export_video_e2e.py"
git commit -m "video-exporter: determinism check (two renders byte-identical)"
```

---

### Task D3: Manual acceptance pass

- [ ] **Step 1: Run the runner normally**

```bash
cd "1_Guess The Football Team Name - Main Runner - Regular"
python run_site.py
```

- [ ] **Step 2: Load a real saved script**

Use the saved scripts panel to pick one — preferably the same "Champion League" entry the e2e test uses.

- [ ] **Step 3: Set Export Resolution to 1080p**

- [ ] **Step 4: Click Play Video**

Verify the Save As dialog appears, you pick a path, the modal shows progress, and a `.mp4` lands at the chosen path.

- [ ] **Step 5: Open the `.mp4` in QuickTime / VLC**

Verify:
- Resolution matches the dropdown (1920×1080)
- Frame rate is smooth (no stutter)
- Player photos look right
- Voice lines are in sync
- Music plays under the voice
- No black frames at start/end

- [ ] **Step 6: Repeat at 2160p**

Same script, switch dropdown to 2160p, render again. File should be 4× larger and visibly higher resolution (text crisper; player photos may look soft per the spec's known caveat).

- [ ] **Step 7: Confirm success criteria against the spec**

Cross-check the 8 items in spec Section 6. All eight should hold.

---

## Self-review (done at plan-write time)

**Spec coverage:**
- ✅ Section 1 (user flow): Tasks C1, C2, C3, C4, D3
- ✅ Section 2 (architecture): Tasks A1-A6
- ✅ Section 3 (output specs): Task A4
- ✅ Section 4 (code changes): Tasks B1-B4, C1-C4, A6
- ✅ Section 5 (risks): mitigations baked into B2 (timing-only review), B4 (image-load wait), A4 (filesystem paths), A5 (cancel flag)
- ✅ Section 6 (success criteria): Tasks D1, D2, D3

**Placeholder scan:** No `TBD`/`TODO`/"implement later" present. Where exact diffs aren't shown (Task B2 — replacing setTimeout/Math.random across 13 files), a precise recipe is given. The recipe is actionable because it includes a classifier (advance-clock vs. leave-alone) and an inventory step.

**Type consistency:** Method names match across tasks (`exportSetTimeout`, `exportDelay`, `exportRandom`, `recordAudio`, `advanceExportClock`, `_create_job`, `_snapshot_job`, `_update_progress`, `_render_worker`, `_encode`). Endpoint paths consistent (`/__export-video/start`, `/__export-video/progress`, `/__export-video/result`, `/__export-video/cancel`).
