from pathlib import Path
import importlib.util
import unittest


RUNNER_DIR = Path(__file__).resolve().parents[1]
RUN_SITE_PATH = RUNNER_DIR / "run_site.py"

spec = importlib.util.spec_from_file_location("run_site", RUN_SITE_PATH)
run_site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_site)


class VideoExportClockTest(unittest.TestCase):
    def test_video_export_clock_tick_uses_numeric_milliseconds(self):
        tick = run_site._video_export_clock_tick_ms(33.333)

        self.assertEqual(tick, 33)
        self.assertIs(type(tick), int)
