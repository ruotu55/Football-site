"""Tests for dev_server_update_data."""
from __future__ import annotations

import importlib.util
import io
import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
_MODULE_PATH = _SCRIPTS_DIR / "dev_server_update_data.py"


def _load():
    spec = importlib.util.spec_from_file_location("dev_server_update_data", _MODULE_PATH)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class ValidatePathsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        teams = self.root / ".Storage" / "Squad Formation" / "Teams" / "England" / "Premier League"
        nats = self.root / ".Storage" / "Squad Formation" / "Nationalities" / "Europe"
        teams.mkdir(parents=True)
        nats.mkdir(parents=True)
        (teams / "Arsenal FC.json").write_text("{}", encoding="utf-8")
        (nats / "France.json").write_text("{}", encoding="utf-8")
        self.mod = _load()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_accepts_team_path_with_dotdot_prefix(self) -> None:
        # Frontend ships paths like "../.Storage/Squad Formation/Teams/.../X.json"
        path = "../.Storage/Squad Formation/Teams/England/Premier League/Arsenal FC.json"
        resolved = self.mod._validate_and_resolve_path(self.root, path)
        self.assertTrue(resolved.is_file())
        self.assertEqual(resolved.name, "Arsenal FC.json")

    def test_accepts_nationality_path(self) -> None:
        path = "../.Storage/Squad Formation/Nationalities/Europe/France.json"
        resolved = self.mod._validate_and_resolve_path(self.root, path)
        self.assertTrue(resolved.is_file())

    def test_rejects_traversal_above_subtrees(self) -> None:
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(self.root, "../../../etc/passwd")

    def test_rejects_outside_squad_formation(self) -> None:
        other = self.root / "elsewhere.json"
        other.write_text("{}", encoding="utf-8")
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(self.root, "elsewhere.json")

    def test_rejects_non_json(self) -> None:
        bad = self.root / ".Storage" / "Squad Formation" / "Teams" / "x.txt"
        bad.write_text("", encoding="utf-8")
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(
                self.root,
                ".Storage/Squad Formation/Teams/x.txt",
            )

    def test_rejects_missing_file(self) -> None:
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(
                self.root,
                ".Storage/Squad Formation/Teams/Nope.json",
            )


class JobStateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()
        # Reset the singleton between tests
        self.mod._reset_job_for_tests()

    def test_initial_state_is_idle(self) -> None:
        self.assertEqual(self.mod._snapshot_job(None), {"status": "unknown"})

    def test_register_job_returns_id_and_running(self) -> None:
        jid = self.mod._register_job(total=3)
        self.assertIsInstance(jid, str)
        self.assertGreater(len(jid), 0)
        snap = self.mod._snapshot_job(jid)
        self.assertEqual(snap["status"], "running")
        self.assertEqual(snap["total"], 3)
        self.assertEqual(snap["done"], 0)
        self.assertEqual(snap["ok_count"], 0)
        self.assertEqual(snap["failed"], [])
        self.assertEqual(snap["current"], "")

    def test_concurrent_register_returns_existing_id(self) -> None:
        first = self.mod._register_job(total=2)
        with self.assertRaises(self.mod.JobAlreadyRunningError) as ctx:
            self.mod._register_job(total=5)
        self.assertEqual(ctx.exception.job_id, first)

    def test_record_progress_updates_counters(self) -> None:
        jid = self.mod._register_job(total=2)
        self.mod._set_current(jid, "Arsenal FC")
        self.mod._record_ok(jid)
        self.mod._set_current(jid, "France")
        self.mod._record_failure(jid, "France.json", "boom")
        snap = self.mod._snapshot_job(jid)
        self.assertEqual(snap["done"], 2)
        self.assertEqual(snap["ok_count"], 1)
        self.assertEqual(snap["failed"], [{"path": "France.json", "error": "boom"}])

    def test_finish_marks_done(self) -> None:
        jid = self.mod._register_job(total=1)
        self.mod._record_ok(jid)
        self.mod._finish(jid)
        snap = self.mod._snapshot_job(jid)
        self.assertEqual(snap["status"], "done")

    def test_after_done_register_returns_new_id(self) -> None:
        first = self.mod._register_job(total=1)
        self.mod._record_ok(first)
        self.mod._finish(first)
        second = self.mod._register_job(total=1)
        self.assertNotEqual(first, second)

    def test_unknown_id_is_unknown(self) -> None:
        self.mod._register_job(total=1)
        self.assertEqual(
            self.mod._snapshot_job("nope-not-a-real-id"),
            {"status": "unknown"},
        )


class _FakeHandler:
    """Minimal stand-in for BaseHTTPRequestHandler that records the response."""

    def __init__(self, method: str, path: str, body: bytes = b"") -> None:
        self.command = method
        self.path = path
        self.headers = {"Content-Length": str(len(body))}
        self.rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()
        self.status: int | None = None
        self.response_headers: dict[str, str] = {}

    # Methods the module is expected to call
    def send_response(self, code: int) -> None:
        self.status = code

    def send_header(self, k: str, v: str) -> None:
        self.response_headers[k] = v

    def end_headers(self) -> None:
        pass

    def send_error(self, code: int, msg: str = "") -> None:
        self.status = code
        self.wfile.write(msg.encode("utf-8"))

    def body_json(self) -> dict:
        raw = self.wfile.getvalue()
        return json.loads(raw.decode("utf-8")) if raw else {}


class HttpRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        teams = self.root / ".Storage" / "Squad Formation" / "Teams" / "England" / "Premier League"
        teams.mkdir(parents=True)
        (teams / "Arsenal FC.json").write_text(
            json.dumps({"kind": "club", "name": "Arsenal FC", "transfermarktClubId": 11}),
            encoding="utf-8",
        )
        self.mod = _load()
        self.mod._reset_job_for_tests()

        # Inject a fake worker so we don't hit the network during tests.
        self._calls = []
        self._done = threading.Event()

        def fake_runner(project_root, cookie, resolved_paths, job_id):
            self._calls.append({"cookie": cookie, "paths": list(resolved_paths), "job_id": job_id})
            for _ in resolved_paths:
                self.mod._record_ok(job_id)
            self.mod._finish(job_id)
            self._done.set()

        self.mod._set_runner_for_tests(fake_runner)

    def tearDown(self) -> None:
        self.tmp.cleanup()
        self.mod._set_runner_for_tests(None)
        self.mod._reset_job_for_tests()

    def test_get_progress_unknown_when_no_job(self) -> None:
        h = _FakeHandler("GET", "/__update-data/progress?id=xxx")
        handled = self.mod.try_handle_get(h, self.root)
        self.assertTrue(handled)
        self.assertEqual(h.status, 200)
        self.assertEqual(h.body_json(), {"status": "unknown"})

    def test_get_unknown_path_returns_false(self) -> None:
        h = _FakeHandler("GET", "/some/other/path")
        self.assertFalse(self.mod.try_handle_get(h, self.root))

    def test_post_start_happy_path(self) -> None:
        body = json.dumps({
            "cookie": "tm-session=abc",
            "paths": ["../.Storage/Squad Formation/Teams/England/Premier League/Arsenal FC.json"],
        }).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 200)
        resp = h.body_json()
        self.assertIn("jobId", resp)
        # Wait for the daemon thread to finish, then assert post-run state.
        self.assertTrue(self._done.wait(timeout=2))
        snap = self.mod._snapshot_job(resp["jobId"])
        self.assertEqual(snap["status"], "done")
        self.assertEqual(snap["ok_count"], 1)
        # Runner saw the resolved (absolute) path
        self.assertEqual(len(self._calls), 1)
        self.assertEqual(self._calls[0]["cookie"], "tm-session=abc")
        self.assertEqual(len(self._calls[0]["paths"]), 1)
        self.assertTrue(str(self._calls[0]["paths"][0]).endswith("Arsenal FC.json"))

    def test_post_start_rejects_empty_cookie(self) -> None:
        body = json.dumps({"cookie": "", "paths": []}).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 400)
        self.assertIn("cookie", h.body_json().get("error", "").lower())

    def test_post_start_rejects_empty_paths(self) -> None:
        body = json.dumps({"cookie": "x", "paths": []}).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 400)
        self.assertIn("paths", h.body_json().get("error", "").lower())

    def test_post_start_rejects_traversal(self) -> None:
        body = json.dumps({
            "cookie": "x",
            "paths": ["../../../etc/passwd"],
        }).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 400)

    def test_post_start_409_when_busy(self) -> None:
        # Block the runner so the first job stays "running"
        block = threading.Event()

        def slow_runner(project_root, cookie, resolved_paths, job_id):
            block.wait(timeout=2)
            for _ in resolved_paths:
                self.mod._record_ok(job_id)
            self.mod._finish(job_id)

        self.mod._set_runner_for_tests(slow_runner)

        body = json.dumps({
            "cookie": "x",
            "paths": ["../.Storage/Squad Formation/Teams/England/Premier League/Arsenal FC.json"],
        }).encode("utf-8")

        h1 = _FakeHandler("POST", "/__update-data/start", body)
        self.mod.try_handle_post(h1, self.root)
        self.assertEqual(h1.status, 200)
        first_id = h1.body_json()["jobId"]

        h2 = _FakeHandler("POST", "/__update-data/start", body)
        self.mod.try_handle_post(h2, self.root)
        self.assertEqual(h2.status, 409)
        self.assertEqual(h2.body_json().get("jobId"), first_id)

        block.set()  # let the worker thread finish


if __name__ == "__main__":
    unittest.main()
