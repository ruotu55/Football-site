#!/bin/bash
# Double-click this in Finder to start the Mac uploader.
# (First time only: in Terminal run  chmod +x "Start Uploader.command"  so macOS
#  lets you double-click it. See README.md.)
cd "$(dirname "$0")" || exit 1

# Prefer a modern python3 (Homebrew installs to /opt/homebrew or /usr/local).
PY="$(command -v python3)"
if [ -z "$PY" ]; then
  echo "python3 not found. Install it (e.g. 'brew install python') and try again."
  read -r -p "Press Return to close..." _
  exit 1
fi

echo "Using: $PY"
"$PY" mac_youtube_uploader.py
echo
read -r -p "Uploader stopped. Press Return to close..." _
