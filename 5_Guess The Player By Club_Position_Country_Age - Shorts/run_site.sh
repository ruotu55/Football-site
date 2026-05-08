#!/usr/bin/env sh
# Run (no browser): "C:/Users/Rom/Desktop/‏‏תיקיה חדשה/Football Channel/Main Runner - Career Path - Shorts/run_site.sh" --no-browser
# Or: python3 "C:/Users/Rom/Desktop/‏‏תיקיה חדשה/Football Channel/Main Runner - Career Path - Shorts/run_site.py"
cd "$(dirname "$0")" || exit 1
exec python3 run_site.py "$@"
