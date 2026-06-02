# Football Channel — Mac YouTube Uploader

A tiny helper that runs **on the Mac** so the calendar's **Upload to YouTube**
button works even though the website itself runs on the Windows PC.

## Why this is needed

- The site runs on the **PC**; you record on the **Mac** via the shared LAN URL.
- OBS saves the `.mkv` file **on the Mac**.
- To upload a video, something has to read the file's bytes — and the bytes are
  on the Mac. So the upload must run on the Mac. That's all this does.

This is **not** the website. It's one small program in one Terminal window. The
calendar button and your whole workflow stay exactly the same — the button just
auto-detects this helper and sends the upload here instead of to the PC.

It also tells each runner **where on the Mac to record**, so OBS saves locally
(fixing the "video saved in the wrong place" problem too).

## One-time setup

1. **Copy this whole `999_Mac_Uploader` folder to the Mac.** Put it anywhere,
   e.g. `~/Football Channel Uploader`.

   This folder is already **self-contained** — it includes the upload engine
   (`dev_server_youtube.py`) and your YouTube login (`youtube/`). Just copy the
   whole folder across (USB / AirDrop / network share / drag-and-drop). You
   should see:
   ```
   999_Mac_Uploader/
     mac_youtube_uploader.py
     dev_server_youtube.py        ← upload engine (included)
     uploader-config.json
     Start Uploader.command
     youtube/                     ← your YouTube login (included)
       client_secret.json
       token_en.json
       token_es.json
       playlists.json
       ...
   ```
   > `dev_server_youtube.py` and `youtube/` are git-ignored so your secrets are
   > never pushed to GitHub — but they ARE physically present in the folder, so
   > a normal file copy brings them along. (Only if you obtain this folder via
   > `git clone`/`git pull` will they be missing — then copy them from the PC
   > repo: `.Storage/Scripts/dev_server_youtube.py` and `.Storage/youtube/` →
   > `youtube/`.)

2. **Check Python 3.10+** is available:
   ```bash
   python3 --version
   ```
   If it's older than 3.10, install a modern one: `brew install python`.

3. **(Optional) Edit `uploader-config.json`:**
   - `recordingsRoot` — where OBS records on the Mac. Default
     `~/Movies/Football Channel` (English/ and Spanish/ subfolders are made
     automatically).
   - `port` — default `9876`. Only change it if something else uses that port
     (then also set it in the calendar — see "Changing the port" below).

4. **Make the launcher double-clickable (first time only):**
   ```bash
   cd "~/Football Channel Uploader"   # wherever you put it
   chmod +x "Start Uploader.command"
   ```

## Running it

Double-click **`Start Uploader.command`** (or run `python3 mac_youtube_uploader.py`).
You'll see something like:

```
 Listening on : http://localhost:9876
 Recordings   : /Users/you/Movies/Football Channel
 Credentials  : /Users/you/Football Channel Uploader/youtube
   EN channel authorized, ES channel authorized
```

**Leave the window open** while you record and upload. Press `Ctrl+C` to stop.

That's it. Open a runner from the shared URL, record as usual, then in the
calendar click **Upload to YouTube** — it uploads from the Mac automatically.

## How the auto-detection works

- The calendar (loaded in the Mac's browser) pings `http://localhost:9876`. If
  this helper answers, the Upload button and the auth-status check go to the
  Mac. If it doesn't (e.g. you opened the calendar on the PC), they fall back to
  the PC exactly as before.
- Each runner asks the helper where to record; OBS then saves to the Mac folder.

## Changing the port

If you change `port` in `uploader-config.json`, tell the calendar too. In the
browser console on any runner/calendar page:
```js
localStorage.setItem("fcMacUploaderUrl", "http://localhost:NEWPORT");
```
(or `localStorage.removeItem("fcMacUploaderUrl")` to go back to the default.)

## No duplicate uploads — guaranteed

A video upload takes a while. If the browser's connection drops before it hears
"success", the calendar may show the job as failed and offer **Retry**. The
helper protects you from that: it remembers every file it has uploaded (by the
file's path + size + modified-time) and, on any repeat, **returns the existing
video instead of uploading again**. So clicking Upload/Retry multiple times can
never create a second copy. (Re-recording produces a different file, so a
genuinely new take still uploads normally.) The helper also no longer crashes
when a connection drops mid-upload.

> If a connection drop made the calendar show "failed" but the video actually
> uploaded, just click **Retry** once — the helper returns the existing video
> and the pill flips to uploaded. Then double-check YouTube Studio.

## Keeping it up to date

If you change the helper, re-copy the changed file(s) to the Mac and restart it
(Ctrl+C, then run again):
- `mac_youtube_uploader.py` — the helper itself.
- `dev_server_youtube.py` — only if the site's upload building-blocks changed.
- `youtube/` — only if you authorized a new channel (`authorize_youtube.py` on
  the PC, then re-copy `.Storage/youtube/`).

## Troubleshooting

- **Button still uploads from the PC / "file not found".** The helper isn't
  running or isn't reachable. Confirm the Terminal window is open and shows
  `Listening on http://localhost:9876`. Reload the calendar page.
- **"channel isn't authorized".** The `youtube/` folder is missing or has no
  `token_en.json` / `token_es.json` with a refresh token. Re-copy `.Storage/youtube/`.
- **Browser blocked the request (Private Network Access).** The helper already
  sends the required header. If a very strict Chrome build still blocks it,
  allow the site's "Insecure private network requests" for the page, or use
  Safari.
- **`dev_server_youtube.py not found`.** You didn't copy it next to the script
  (step 2).
