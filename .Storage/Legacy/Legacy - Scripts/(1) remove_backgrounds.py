import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SUPPORTED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".jfif",
}


def resolve_input_folder() -> Path:
    """Choose the preferred source folder and keep legacy fallback."""
    candidates = [
        PROJECT_ROOT / "Player Images No Background",
        PROJECT_ROOT / "Images" / "Players Shadows",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate
    return candidates[0]


def is_supported_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS


def should_pause() -> bool:
    # Keep console open for double-click usage on Windows.
    return "--no-pause" not in sys.argv


def main() -> int:
    input_folder = resolve_input_folder()
    output_folder = input_folder / "Ready photos"
    output_folder.mkdir(parents=True, exist_ok=True)

    if not input_folder.exists():
        print(f"[ERROR] Folder not found: {input_folder}")
        return 1

    print("[INFO] Loading the Human-Specific AI Model...")
    human_session = new_session("u2net_human_seg")

    print(f"[INFO] Source folder: {input_folder}")
    print(f"[INFO] Ready photos: {output_folder}")
    print("[INFO] Scanning for images to process...")

    images_to_process = []
    for path in input_folder.rglob("*"):
        if not is_supported_image(path):
            continue
        if output_folder in path.parents:
            continue
        images_to_process.append(path)

    if not images_to_process:
        print("[INFO] No source images found outside Ready photos.")
        return 0

    processed = 0
    failed = 0

    for input_path in images_to_process:
        output_path = output_folder / f"{input_path.stem}.png"
        print(f"[WORK] Removing background for: {input_path.name}...")

        try:
            with Image.open(input_path) as input_image:
                output_image = remove(
                    input_image,
                    session=human_session,
                    post_process_mask=True,
                )
                output_image.save(output_path, format="PNG")
                output_image.close()

            input_path.unlink()
            print(f"[OK] Saved: {output_path.name}")
            print(f"[OK] Deleted original photo: {input_path.name}")
            processed += 1
        except Exception as error:
            failed += 1
            print(f"[ERROR] Failed to process {input_path.name}: {error}")

    print("[DONE] Background removal complete!")
    print(f"Processed: {processed} | Failed: {failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    exit_code = main()
    if should_pause():
        try:
            input("Press Enter to close...")
        except EOFError:
            pass
    raise SystemExit(exit_code)
