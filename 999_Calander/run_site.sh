#!/usr/bin/env sh
# Run (no browser): "999_Calander/run_site.sh" --no-browser
# Or: python3 "999_Calander/run_site.py"
cd "$(dirname "$0")" || exit 1
exec python3 run_site.py "$@"
