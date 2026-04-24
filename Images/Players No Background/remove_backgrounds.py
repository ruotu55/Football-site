import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

# Folder this script lives in = where player source images are (see subfolders too).
SCRIPT_DIR = Path(__file__).resolve().parent
INPUT_FOLDER = SCRIPT_DIR
OUTPUT_FOLDER = SCRIPT_DIR / "Ready photos"
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


def is_supported_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS


def should_pause() -> bool:
    return "--no-pause" not in sys.argv


def main() -> int:
    OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

    if not INPUT_FOLDER.exists():
        print(f"[ERROR] Folder not found: {INPUT_FOLDER}")
        return 1

    print("[INFO] Loading the Human-Specific AI Model...")
    human_session = new_session("u2net_human_seg")

    print(f"[INFO] Source folder: {INPUT_FOLDER}")
    print(f"[INFO] Ready photos: {OUTPUT_FOLDER}")
    print("[INFO] Scanning for images to process...")

    images_to_process = []
    for path in INPUT_FOLDER.rglob("*"):
        if not is_supported_image(path):
            continue
        if OUTPUT_FOLDER in path.parents:
            continue
        images_to_process.append(path)

    if not images_to_process:
        print("[INFO] No source images found outside Ready photos.")
        return 0

    processed = 0
    failed = 0

    for input_path in images_to_process:
        rel = input_path.relative_to(INPUT_FOLDER)
        output_path = OUTPUT_FOLDER / rel.with_suffix(".png")
        output_path.parent.mkdir(parents=True, exist_ok=True)

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
            print(f"[OK] Saved: {output_path.relative_to(INPUT_FOLDER)}")
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
