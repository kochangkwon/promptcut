#!/usr/bin/env bash
# Serve the promptcut UI locally. Requires Python 3 only — no backend yet.
set -euo pipefail

PORT="${PORT:-8765}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. Install it, or open ui/index.html directly in a browser." >&2
  exit 1
fi

echo "promptcut UI  ->  http://localhost:${PORT}"
echo "Stop with Ctrl-C."

if command -v open >/dev/null 2>&1; then
  (sleep 1; open "http://localhost:${PORT}") &
fi

cd "${DIR}/ui"
exec python3 -m http.server "${PORT}" --bind 127.0.0.1
