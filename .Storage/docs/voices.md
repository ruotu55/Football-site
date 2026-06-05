# Voices (Text-to-Speech)

How spoken audio is generated, stored, frozen into saves, and played.

Key files: `js/audio.js`, `js/voice-tab.js`, `js/team-voice-manager.js`, `js/bundled-level-voices.js`, `js/recording-preflight.js`. Backend: `run_site.py` (TTS + `/__*-voice/*` endpoints).

## Provider
**ElevenLabs** (`run_site.py`): `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, model `eleven_v3`, output `mp3_44100_128`. Configurable via env `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID`.
⚠️ A **default API key is hardcoded** in `run_site.py` as a fallback — committed to the repo. Rotate + move to env if the repo is ever shared. Excited delivery uses `stability 0.25, similarity_boost 0.8, style 0.65, speaker_boost true`.

## Voice types & when they play
- **Team reveal** (club/national name) — on the answer reveal each question. Stored `Team names/` & `Nationality teams names/`.
- **Player-name reveal** — player runners. Stored `Players Names/`.
- **Quiz-title** — intro on landing→Q1. Stored `Game name/<RUNNER_VARIANT>/`.
- **Ending** — outro CTA (`think-you-know` / `how-many`). Stored `Ending Guess/`.
- **Bundled level** — progress lines at milestones: `warm-up`, `serious`, `nerds`, `genius` × 5 variants each. Stored `Levels/`.

## Disk layout
Pattern: `.Storage/Voices/<type-dir>/<language>/<phrase-key>/<Name>.mp3`
```
.Storage/Voices/Team names/english/plain/Arsenal.mp3
.Storage/Voices/Team names/english/correct-answer/Arsenal.mp3
.Storage/Voices/Ending Guess/english/think-you-know/<sentence>.mp3
.Storage/Voices/Levels/english/bundled-warm-up-02.mp3
.Storage/Voices/Game name/<RUNNER_VARIANT>/english/<title>.mp3
```
Languages: `english` / `spanish`. Allowed extensions: `.mp3 .wav .m4a`.

## Reveal-phrase system
Phrase keys (`audio.js` `TEAM_PHRASE_TEMPLATES`): `plain, correct-answer, right-answer, and-the-answer, answer-is, and-its, team-is` (+ `player-is`). `plain` = just the name; the rest are full sentences.

`getOrAssignRevealPhrase(level, idx, lang)` picks a **sticky** phrase per level, cached on `level.__revealPhraseByLanguage[lang]` (legacy `level.__revealPhrase`). Frozen at recording preflight so the voice tab, playback, and PROD all agree. **No plain fallback when a sentence phrase was assigned** (validation contract). National names are localized (`translateCountry`) for `nat-by-club`.

Spanish sentence phrases get a leading `¡`; prompts end in `!` for an excited read.

## Server endpoints (`run_site.py`)
Per type, `status` (GET) / `generate` (POST) / `delete` (POST):
`/__team-voice/*`, `/__player-voice/*`, `/__quiz-title-voice/*`, `/__ending-voice/*`, `/__bundled-voice/*`. `status` returns `{exists, src}`; `generate` body carries `name/phrase/language` (+ `key/variant` for bundled).

## Voice tab UI (`voice-tab.js`)
Language toggle (EN/ES; **resets to english on page load** — see runner-architecture i18n note). Per-row Vol (generate+play) / X (delete). Bulk buttons:
- **"Create voice for all"** — generates all missing rows for current language (gold button, styled inline).
- **"Download all voices (EN + ES)"** — drives every missing row's generate handler in both languages (`bulkDownloadActive` + `__voiceGen`).

## Freeze & warm
- `bundled-level-voices.js` `pickRandomBundledVariants()` chooses one variant (1–5) per milestone at preflight → `appState.bundledVoiceVariants`, persisted with the save (`voiceFreeze.bundledVariants`). `getBundledLevelPath()` resolves the frozen variant to a filename.
- `recording-preflight.js` pre-rolls every level's reveal phrase, then **warms** all voice MP3s (preload to fill HTTP cache) so there's no network latency mid-recording.

## Gotchas
- **RUNNER_VARIANT collisions**: quiz-title voices live under `Game name/<RUNNER_VARIANT>/`. Two runners sharing the same RUNNER_VARIANT string collide → wrong voice. Usually a filename collision, not a logic bug.
- `|| "nat-by-club"` (or sibling key) fallbacks break voices when a select value goes empty — copy-paste hazard across sibling runners.
- Team name normalization/aliases in `audio.js` (`TEAM_NAME_VOICE_FILE_ALIASES`) strip prefixes/suffixes/accents to build the filename stem.
