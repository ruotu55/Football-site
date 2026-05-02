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


if __name__ == "__main__":
    unittest.main()
