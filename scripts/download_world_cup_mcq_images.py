#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Download trivia topic images for the World Cup MCQ save into
Images/Quiz/World Cup/<slug>.jpg, using free Wikipedia/Wikimedia thumbnails.

Each trivia question references a topic image by slug. We map slug -> Wikipedia
article, fetch its (free-licensed) thumbnail, convert to JPEG. Articles whose
infobox image is non-free (e.g. tournament logos) return no thumbnail; those
fall back to a neutral generic football image so no card is ever broken.

After downloading, rewrites the save JSON so topicImage points only at files
that actually exist (else null).
"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "Images", "Quiz", "World Cup")
SAVE = os.path.join(ROOT, ".Storage", "storage", "saved-scripts", "football_quiz_mcq_regular.json")
IMG_DIR_REL = "Images/Quiz/World Cup"
UA = {"User-Agent": "FootballChannelBot/1.0 (educational quiz; contact: local)"}

from PIL import Image  # noqa: E402

# slug -> Wikipedia article title (free infobox image where possible)
SLUG_TITLE = {
    "first-world-cup-1930": "1930 FIFA World Cup",
    "world-cup-trophy": "Association football",
    "estadio-centenario": "Estadio Centenario",
    "italy-world-cup": "Italy national football team",
    "world-cup-2026": "2026 FIFA World Cup",
    "argentina-2022": "Argentina national football team",
    "mbappe-2022": "Kylian Mbappé",
    "miroslav-klose": "Miroslav Klose",
    "france-2018": "France national football team",
    "brazil-2014": "2014 FIFA World Cup",
    "south-africa-2010": "2010 FIFA World Cup",
    "qatar-2022": "Lusail Stadium",
    "maradona-1986": "Diego Maradona",
    "spain-2010": "Spain national football team",
    "france-1998": "Stade de France",
    "england-1966": "Wembley Stadium (1923)",
    "messi-2022": "Lionel Messi",
    "brazil-team": "Brazil national football team",
    "pele-1970": "Pelé",
    "germany-2014": "Germany national football team",
    "germany-2006": "Allianz Arena",
    "italy-2006": "Olympiastadion (Berlin)",
    "zidane-2006": "Zinedine Zidane",
}

GENERIC_FALLBACK_SLUG = "world-cup-trophy"  # neutral football image; always downloads


def fetch_thumbnail_url(title):
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title)
    data = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            data = json.load(urllib.request.urlopen(req, timeout=25))
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            print("  ! summary failed for %r: %s" % (title, e))
            return None
        except Exception as e:
            print("  ! summary failed for %r: %s" % (title, e))
            return None
    if not data:
        return None
    # Prefer the full-res original (any width rewrite of a thumb URL is rejected by Wikimedia).
    src = (data.get("originalimage") or {}).get("source")
    if not src:
        src = (data.get("thumbnail") or {}).get("source")
    return src


def download_image(src):
    raw = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(src, headers=UA)
            raw = urllib.request.urlopen(req, timeout=40).read()
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(4 * (attempt + 1))
                continue
            raise
    img = Image.open(io.BytesIO(raw))
    if img.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    if img.width > 1100:
        h = int(img.height * (1100 / img.width))
        img = img.resize((1100, h), Image.LANCZOS)
    return img


def save_jpeg(img, slug):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, slug + ".jpg")
    img.save(path, "JPEG", quality=88)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ok, fail = {}, []
    # Download the generic fallback first so it can rescue others.
    order = [GENERIC_FALLBACK_SLUG] + [s for s in SLUG_TITLE if s != GENERIC_FALLBACK_SLUG]
    fallback_img = None
    for slug in order:
        title = SLUG_TITLE[slug]
        time.sleep(1.2)  # pace REST calls to avoid 429
        src = fetch_thumbnail_url(title)
        if src:
            try:
                img = download_image(src)
                save_jpeg(img, slug)
                ok[slug] = title
                if slug == GENERIC_FALLBACK_SLUG:
                    fallback_img = img
                print("  ok  %-22s <- %s" % (slug, title))
                continue
            except Exception as e:
                print("  ! download failed for %s (%s): %s" % (slug, title, e))
        fail.append(slug)

    # Rescue failures with the generic fallback image.
    if fail and fallback_img is not None:
        for slug in fail:
            save_jpeg(fallback_img, slug)
            print("  fb  %-22s <- generic fallback" % slug)
        fail = []

    print("Downloaded %d/%d topic images. Unresolved: %s" % (len(SLUG_TITLE) - len(fail), len(SLUG_TITLE), fail or "none"))

    # Rewrite save JSON: topicImage only if file exists.
    s = json.load(open(SAVE, encoding="utf-8"))
    for sc in s["scripts"]:
        for lvl in sc["levels"]:
            mcq = lvl.get("mcq")
            if not mcq or mcq.get("questionType") != "trivia":
                continue
            slug = mcq.get("topicImageSlug")
            path = os.path.join(OUT_DIR, (slug or "") + ".jpg")
            mcq["topicImage"] = ("%s/%s.jpg" % (IMG_DIR_REL, slug)) if (slug and os.path.exists(path)) else None
    json.dump(s, open(SAVE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("Updated topicImage paths in %s" % SAVE)


if __name__ == "__main__":
    main()
