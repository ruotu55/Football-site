"""Stdlib assert test (no pytest needed): run with `python tests/test_photo_mime.py`."""
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("run_site", ROOT / "run_site.py")
run_site = importlib.util.module_from_spec(spec)
sys.modules["run_site"] = run_site
spec.loader.exec_module(run_site)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 8
GIF = b"GIF89a" + b"\x00" * 16
UNKNOWN = b"\x00\x01\x02\x03" + b"\x00" * 16

assert run_site._guess_image_mime(PNG) == "image/png", "PNG magic"
assert run_site._guess_image_mime(JPEG) == "image/jpeg", "JPEG magic"
assert run_site._guess_image_mime(WEBP) == "image/webp", "WEBP magic"
assert run_site._guess_image_mime(GIF) == "image/gif", "GIF magic"
assert run_site._guess_image_mime(UNKNOWN) == "image/png", "unknown falls back to png"
print("OK test_photo_mime")
