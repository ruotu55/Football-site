# Football Channel — System Documentation Index

This folder is the **living map of the whole system**: where everything is stored and how each part works. Read the relevant topic before starting a task; update it after you learn or change something. (See the root [`CLAUDE.md`](../../CLAUDE.md) for the rule.)

> Seeded by a full codebase sweep on **2026-06-04**. Treat file paths + function names as the source of truth; line numbers may drift — verify against code when editing.

## What this project is

A YouTube football-quiz **video factory**. ~17 browser "runner" apps (one per quiz type × Regular/Shorts) build a quiz on a pitch, then **play / record (via OBS) / render (headless frame-by-frame)** it to MP4 in English and Spanish, and upload to YouTube on a calendar schedule. All apps share assets, data, and JS modules under `.Storage/`.

## Topic map

| Topic | File | What's in it |
|-------|------|--------------|
| Storage & repo layout | [storage-layout.md](storage-layout.md) | The `.Storage/` tree, `Images/`, `Ready videos/`, every shared JSON blob and where it lives |
| Images (logos + photos) | [images.md](images.md) | Team crests & player photos: disk paths, naming, URL resolution, fetch/crop, caching |
| Voices (TTS) | [voices.md](voices.md) | Voice types, `.Storage/Voices/` layout, ElevenLabs generation, phrase system, voice tab |
| Saves & data model | [saves-and-data.md](saves-and-data.md) | Saved scripts, `recording-status.json` blocks, saved team layouts, runner JSON blobs, import resolution |
| Runner app architecture | [runner-architecture.md](runner-architecture.md) | The 17 runners, a runner's `js/` modules, shared modules, `appState`, cache-busting, i18n |
| Video / Record / Render | [video-record-render.md](video-record-render.md) | Play flow, OBS recording + preflight, the headless frame-by-frame render pipeline, BGM, PROD validation |
| Dev server & tooling | [server-and-tooling.md](server-and-tooling.md) | `run_site.py`, endpoint reference, ports, live-reload, Update Data, YouTube upload, Mac uploader |
| Content generation & theming | [content-generation.md](content-generation.md) | Title/description/tags generator, background themes, competition themes, thumbnail studio |

## Fastest way in

- "Where is X stored?" → **storage-layout.md**
- "How does a runner boot / which JS file does Y?" → **runner-architecture.md**
- "Recording or rendering broke" → **video-record-render.md**
- "A server endpoint / port / Update Data / upload" → **server-and-tooling.md**
- "A photo/logo/voice/title is wrong" → **images.md / voices.md / content-generation.md**
- "A save loads wrong / team won't import" → **saves-and-data.md**

## ⚠️ Security note

`run_site.py` contains a **hardcoded ElevenLabs API key** (default fallback for TTS). It is committed to the repo. If the repo is ever made public or shared, rotate that key and move it to an environment variable (`ELEVENLABS_API_KEY`). See voices.md.
