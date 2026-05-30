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


class CareerTotalsMonotonicTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()

    def test_preserves_old_when_new_is_zero(self) -> None:
        old = {
            "goalkeepers": [{
                "name": "David Raya",
                "club_career_totals": {"appearances": 462, "goals": 0, "assists": 0, "goals_conceded": 479, "clean_sheets": 161},
            }],
        }
        new = {
            "goalkeepers": [{
                "name": "David Raya",
                "club_career_totals": {"appearances": 470, "goals": 0, "assists": 0, "goals_conceded": 0, "clean_sheets": 165},
            }],
        }
        self.mod._apply_career_totals_monotonic_guard(new, old)
        gk = new["goalkeepers"][0]["club_career_totals"]
        self.assertEqual(gk["goals_conceded"], 479)  # old preserved
        self.assertEqual(gk["clean_sheets"], 165)    # new (higher) kept
        self.assertEqual(gk["appearances"], 470)     # new (higher) kept

    def test_preserves_old_when_new_is_lower(self) -> None:
        old = {
            "goalkeepers": [{
                "name": "Kepa",
                "club_career_totals": {"appearances": 392, "goals_conceded": 422, "clean_sheets": 134},
            }],
        }
        new = {
            "goalkeepers": [{
                "name": "Kepa",
                "club_career_totals": {"appearances": 392, "goals_conceded": 422, "clean_sheets": 133},
            }],
        }
        self.mod._apply_career_totals_monotonic_guard(new, old)
        self.assertEqual(new["goalkeepers"][0]["club_career_totals"]["clean_sheets"], 134)

    def test_preserves_old_when_new_is_null(self) -> None:
        old = {
            "defenders": [{
                "name": "Saliba",
                "club_career_totals": {"appearances": 295, "goals": 9},
            }],
        }
        new = {
            "defenders": [{
                "name": "Saliba",
                "club_career_totals": {"appearances": None, "goals": 9},
            }],
        }
        self.mod._apply_career_totals_monotonic_guard(new, old)
        self.assertEqual(new["defenders"][0]["club_career_totals"]["appearances"], 295)

    def test_higher_new_value_wins(self) -> None:
        old = {
            "attackers": [{
                "name": "Saka",
                "club_career_totals": {"appearances": 358, "goals": 101, "assists": 94},
            }],
        }
        new = {
            "attackers": [{
                "name": "Saka",
                "club_career_totals": {"appearances": 365, "goals": 105, "assists": 99},
            }],
        }
        self.mod._apply_career_totals_monotonic_guard(new, old)
        nt = new["attackers"][0]["club_career_totals"]
        self.assertEqual(nt["appearances"], 365)
        self.assertEqual(nt["goals"], 105)
        self.assertEqual(nt["assists"], 99)

    def test_unmatched_player_unchanged(self) -> None:
        # New player not in old — leave as-is.
        old = {"goalkeepers": []}
        new = {
            "goalkeepers": [{
                "name": "Tommy Setford",
                "club_career_totals": {"goals_conceded": None, "clean_sheets": None},
            }],
        }
        self.mod._apply_career_totals_monotonic_guard(new, old)
        self.assertIsNone(new["goalkeepers"][0]["club_career_totals"]["goals_conceded"])

    def test_handles_national_totals_too(self) -> None:
        old = {
            "goalkeepers": [{
                "name": "Raya",
                "national_team_career_totals": {"appearances": 12, "goals_conceded": 5, "clean_sheets": 7},
            }],
        }
        new = {
            "goalkeepers": [{
                "name": "Raya",
                "national_team_career_totals": {"appearances": 13, "goals_conceded": 0, "clean_sheets": 7},
            }],
        }
        self.mod._apply_career_totals_monotonic_guard(new, old)
        nt = new["goalkeepers"][0]["national_team_career_totals"]
        self.assertEqual(nt["goals_conceded"], 5)
        self.assertEqual(nt["clean_sheets"], 7)
        self.assertEqual(nt["appearances"], 13)

    def test_outfield_null_old_stays_null(self) -> None:
        # Outfield players have goals_conceded=null in the old JSON; should stay null.
        old = {
            "defenders": [{
                "name": "Gabriel",
                "club_career_totals": {"appearances": 368, "goals_conceded": None, "clean_sheets": None},
            }],
        }
        new = {
            "defenders": [{
                "name": "Gabriel",
                "club_career_totals": {"appearances": 370, "goals_conceded": None, "clean_sheets": None},
            }],
        }
        self.mod._apply_career_totals_monotonic_guard(new, old)
        ct = new["defenders"][0]["club_career_totals"]
        self.assertIsNone(ct["goals_conceded"])
        self.assertIsNone(ct["clean_sheets"])


class GkTotalsExtractorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()

    def test_extracts_from_typical_thead_tfoot(self) -> None:
        html = """
        <table>
          <thead>
            <tr>
              <th>Season</th><th>Comp</th><th>Apps</th><th>Goals</th>
              <th>Cards</th><th>Goals conceded</th><th>Clean sheets</th><th>Minutes</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>25/26</td><td>L1</td><td>16</td><td>0</td><td>1</td><td>14</td><td>5</td><td>1.440</td></tr>
          </tbody>
          <tfoot>
            <tr><td>Total</td><td></td><td>235</td><td>0</td><td>20</td><td>252</td><td>79</td><td>21.000</td></tr>
          </tfoot>
        </table>
        """
        gc, cs = self.mod._gk_extract_totals_from_html(html)
        self.assertEqual(gc, 252)
        self.assertEqual(cs, 79)

    def test_extracts_when_total_row_starts_data_section(self) -> None:
        html = """
        <table>
          <tr><th>Season</th><th>Apps</th><th>Goals conceded</th><th>Clean sheets</th></tr>
          <tr><td>Total</td><td>180</td><td>200</td><td>50</td></tr>
          <tr><td>25/26</td><td>10</td><td>15</td><td>2</td></tr>
        </table>
        """
        gc, cs = self.mod._gk_extract_totals_from_html(html)
        self.assertEqual(gc, 200)
        self.assertEqual(cs, 50)

    def test_german_headers(self) -> None:
        html = """
        <table>
          <thead><tr><th>Saison</th><th>Spiele</th><th>Gegentore</th><th>Zu Null</th></tr></thead>
          <tbody><tr><td>25/26</td><td>30</td><td>40</td><td>10</td></tr></tbody>
          <tfoot><tr><td>Gesamt</td><td>300</td><td>400</td><td>100</td></tr></tfoot>
        </table>
        """
        gc, cs = self.mod._gk_extract_totals_from_html(html)
        self.assertEqual(gc, 400)
        self.assertEqual(cs, 100)

    def test_returns_none_when_no_gk_columns(self) -> None:
        html = """
        <table>
          <thead><tr><th>Season</th><th>Apps</th><th>Goals</th><th>Assists</th></tr></thead>
          <tbody><tr><td>25/26</td><td>30</td><td>5</td><td>2</td></tr></tbody>
        </table>
        """
        gc, cs = self.mod._gk_extract_totals_from_html(html)
        self.assertIsNone(gc)
        self.assertIsNone(cs)

    def test_returns_none_on_blocked_html(self) -> None:
        html = "<html><body>human verification required</body></html>"
        gc, cs = self.mod._gk_extract_totals_from_html(html)
        self.assertIsNone(gc)
        self.assertIsNone(cs)

    def test_returns_none_on_empty_html(self) -> None:
        gc, cs = self.mod._gk_extract_totals_from_html("")
        self.assertIsNone(gc)
        self.assertIsNone(cs)

    def test_handles_dotted_thousands(self) -> None:
        html = """
        <table>
          <thead><tr><th>Season</th><th>Apps</th><th>Goals conceded</th><th>Clean sheets</th></tr></thead>
          <tfoot><tr><td>Total</td><td>500</td><td>1.234</td><td>200</td></tr></tfoot>
        </table>
        """
        gc, cs = self.mod._gk_extract_totals_from_html(html)
        self.assertEqual(gc, 1234)
        self.assertEqual(cs, 200)


class GkDetailsPathBuilderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()

    def test_builds_from_standard_relative_profile_url(self) -> None:
        rel = "/ederson/profil/spieler/238223"
        path = self.mod._gk_profile_to_details_path(rel, 238223)
        self.assertEqual(path, "/ederson/leistungsdatendetails/spieler/238223")

    def test_builds_from_absolute_profile_url(self) -> None:
        rel = "https://www.transfermarkt.com/ederson/profil/spieler/238223?foo=bar"
        path = self.mod._gk_profile_to_details_path(rel, 238223)
        self.assertEqual(path, "/ederson/leistungsdatendetails/spieler/238223")

    def test_falls_back_to_pid_when_shape_is_unexpected(self) -> None:
        rel = "/player/ederson/238223"
        path = self.mod._gk_profile_to_details_path(rel, 238223)
        self.assertEqual(path, "/-/leistungsdatendetails/spieler/238223")

    def test_falls_back_to_pid_when_relative_url_missing(self) -> None:
        path = self.mod._gk_profile_to_details_path(None, 238223)
        self.assertEqual(path, "/-/leistungsdatendetails/spieler/238223")


class GkPerClubApiTotalsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()

    def test_sums_conceded_and_clean_sheets(self) -> None:
        payload = {
            "goalkeeper": True,
            "performances": [
                {"concededGoals": 265, "cleanSheets": 88},
                {"concededGoals": 191, "cleanSheets": 75},
                {"concededGoals": 3, "cleanSheets": 0},
            ],
        }
        gc, cs = self.mod._gk_extract_totals_from_per_club_api(payload)
        self.assertEqual(gc, 459)
        self.assertEqual(cs, 163)

    def test_handles_missing_rows(self) -> None:
        gc, cs = self.mod._gk_extract_totals_from_per_club_api({"performances": []})
        self.assertIsNone(gc)
        self.assertIsNone(cs)

    def test_ignores_non_numeric_values(self) -> None:
        payload = {
            "performances": [
                {"concededGoals": "n/a", "cleanSheets": None},
                {"concededGoals": 12, "cleanSheets": 4},
            ],
        }
        gc, cs = self.mod._gk_extract_totals_from_per_club_api(payload)
        self.assertEqual(gc, 12)
        self.assertEqual(cs, 4)


class CurrentSeasonTotalsFromRowsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()

    def test_outfield_sums_all_competitions(self) -> None:
        rows = [
            {"gamesPlayed": 30, "goalsScored": 12, "assists": 5},
            {"gamesPlayed": 6, "goalsScored": 3, "assists": 1},
            {"gamesPlayed": 3, "goalsScored": 2, "assists": 0},
        ]
        out = self.mod._player_current_season_totals_from_rows(rows, is_goalkeeper=False)
        self.assertEqual(out["appearances"], 39)
        self.assertEqual(out["goals"], 17)
        self.assertEqual(out["assists"], 6)

    def test_goalkeeper_includes_conceded_and_clean_sheets(self) -> None:
        rows = [
            {"gamesPlayed": 30, "goalsScored": 0, "assists": 0, "concededGoals": 25, "cleanSheets": 13},
            {"gamesPlayed": 9, "goalsScored": 0, "assists": 0, "concededGoals": 12, "cleanSheets": 3},
        ]
        out = self.mod._player_current_season_totals_from_rows(rows, is_goalkeeper=True)
        self.assertEqual(out["appearances"], 39)
        self.assertEqual(out["goals"], 0)
        self.assertEqual(out["assists"], 0)
        self.assertEqual(out["goals_conceded"], 37)
        self.assertEqual(out["clean_sheets"], 16)

    def test_goalkeeper_handles_alternative_key_name(self) -> None:
        rows = [{"gamesPlayed": 1, "goalsConceded": 2, "cleanSheets": 0}]
        out = self.mod._player_current_season_totals_from_rows(rows, is_goalkeeper=True)
        self.assertEqual(out["goals_conceded"], 2)
        self.assertEqual(out["clean_sheets"], 0)


class PlayerFieldOrderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()

    def test_players_missing_shirt_numbers_lists_names(self) -> None:
        payload = {
            "goalkeepers": [{"name": "GK", "shirt_number": 1}],
            "defenders": [{"name": "No Shirt"}],
            "midfielders": [],
            "attackers": [{"name": "Striker", "shirt_number": 9}],
        }
        self.assertEqual(self.mod._players_missing_shirt_numbers(payload), ["No Shirt"])

    def test_goalkeeper_fields_order_puts_gk_stats_after_assists(self) -> None:
        pl = {
            "name": "GK",
            "position": "Goalkeeper",
            "age": 27,
            "nationality": "Italy",
            "club": "Manchester City",
            "appearances": 39,
            "goals": 0,
            "assists": 0,
            "transfer_history": [],
            "club_career_totals": {},
            "national_team_career_totals": {},
            "goals_conceded": 37,
            "clean_sheets": 16,
            "shirt_number": 25,
        }
        ordered = self.mod._reorder_player_fields_for_output(pl, is_goalkeeper=True)
        self.assertEqual(
            list(ordered.keys())[:10],
            [
                "name",
                "position",
                "age",
                "nationality",
                "club",
                "appearances",
                "goals",
                "assists",
                "goals_conceded",
                "clean_sheets",
            ],
        )


class TeamTimeoutGuardTest(unittest.TestCase):
    """A single hung team must time out and be recorded as a failure, so the job
    advances (done++) instead of sitting at 0/N forever."""

    def setUp(self) -> None:
        self.mod = _load()
        self.mod._reset_job_for_tests()

    def tearDown(self) -> None:
        self.mod._reset_job_for_tests()

    def test_hung_team_times_out_and_records_failure(self) -> None:
        import asyncio

        mod = self.mod
        jid = mod._register_job(total=1)

        async def hang() -> None:
            await asyncio.sleep(30)  # simulate a stalled Transfermarkt call

        asyncio.run(mod._run_team_guarded(jid, Path("Liverpool FC.json"), hang(), 0.05))

        snap = mod._snapshot_job(jid)
        self.assertEqual(snap["done"], 1)
        self.assertEqual(snap["ok_count"], 0)
        self.assertEqual(len(snap["failed"]), 1)
        self.assertIn("timed out", snap["failed"][0]["error"].lower())

    def test_fast_team_completes_without_double_count(self) -> None:
        import asyncio

        mod = self.mod
        jid = mod._register_job(total=1)

        async def quick() -> None:
            mod._record_ok(jid)  # the real coro records its own outcome

        asyncio.run(mod._run_team_guarded(jid, Path("Arsenal FC.json"), quick(), 5))

        snap = mod._snapshot_job(jid)
        self.assertEqual(snap["done"], 1)
        self.assertEqual(snap["ok_count"], 1)
        self.assertEqual(len(snap["failed"]), 0)


class _FakeTmkt:
    """Counts the expensive calls so tests can assert they happen once / are skipped."""

    def __init__(self) -> None:
        self.squad_calls = 0
        self.stats_calls = 0

    async def get_club_squad(self, cid):
        self.squad_calls += 1
        return {
            "success": True,
            "data": {
                "playerIds": [1, 2, 3],
                "squad": [
                    {"playerId": "1", "shirtNumber": 10},
                    {"playerId": "2", "shirtNumber": 20},
                    {"playerId": "3", "shirtNumber": 30},
                ],
            },
        }

    async def get_player_stats(self, pid, season=None):
        self.stats_calls += 1
        return []

    async def get_player_stats_per_club(self, pid):
        return {}


class _FakeFill:
    def __init__(self) -> None:
        self.meta_calls = 0

    async def _build_name_to_meta(self, tmkt, pids, sem=None):
        self.meta_calls += 1
        return {"P1": (1, "/profil/spieler/1")}


class SharedNameMetaTest(unittest.TestCase):
    """The current-season pass and the GK pass must share one squad fetch +
    name->id map instead of each building their own (the slow per-team work)."""

    def setUp(self) -> None:
        self.mod = _load()

    def test_build_club_name_meta_fetches_once(self) -> None:
        import asyncio

        tm, fill = _FakeTmkt(), _FakeFill()
        squad, name_meta = asyncio.run(self.mod._build_club_name_meta(tm, fill, 123))
        self.assertTrue(squad.get("success"))
        self.assertEqual((squad.get("data") or {}).get("playerIds"), [1, 2, 3])
        self.assertEqual(name_meta, {"P1": (1, "/profil/spieler/1")})
        self.assertEqual(tm.squad_calls, 1)
        self.assertEqual(fill.meta_calls, 1)

    def test_season_pass_skips_fetch_when_prefetched(self) -> None:
        import asyncio

        tm, fill = _FakeTmkt(), _FakeFill()
        payload = {
            "goalkeepers": [],
            "defenders": [{"name": "P1"}],
            "midfielders": [],
            "attackers": [],
        }
        asyncio.run(
            self.mod._patch_current_season_totals_in_payload(
                payload, tm, fill, cid=123, season_id=None,
                prefetched=(
                    {"success": True, "data": {"playerIds": [1]}},
                    {"P1": (1, "/x")},
                ),
            )
        )
        self.assertEqual(tm.squad_calls, 0)   # used the shared map
        self.assertEqual(fill.meta_calls, 0)
        self.assertGreaterEqual(tm.stats_calls, 1)  # still fetches season stats

    def test_gk_pass_skips_fetch_when_prefetched(self) -> None:
        import asyncio

        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        jp = Path(tmpdir.name) / "Team.json"
        jp.write_text(
            json.dumps({
                "transfermarktClubId": 123,
                "goalkeepers": [{"name": "Keeper One", "club_career_totals": {}}],
            }),
            encoding="utf-8",
        )
        tm, fill = _FakeTmkt(), _FakeFill()
        asyncio.run(
            self.mod._patch_gk_career_totals(
                jp, fill, tm, player_cache={}, legacy=None,
                prefetched_name_meta={"Keeper One": (99, "/profil/spieler/99")},
            )
        )
        self.assertEqual(tm.squad_calls, 0)   # used the shared map, no re-fetch
        self.assertEqual(fill.meta_calls, 0)


if __name__ == "__main__":
    unittest.main()
