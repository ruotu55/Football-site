"""Tests for dev_server_update_data."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
