#!/usr/bin/env bash
# Serve the promptcut UI locally. Requires Python 3 only — no backend yet.
set -euo pipefail

PORT="${PORT:-8765}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. Install it, or open ui/index.html directly in a browser." >&2
  exit 1
fi

URL="http://localhost:${PORT}/ui/"
echo "promptcut UI  ->  ${URL}"
echo "Stop with Ctrl-C."

if command -v open >/dev/null 2>&1; then
  (sleep 1; open "${URL}") &
fi

# serve.py, not `python3 -m http.server`: the latter ignores Range requests,
# which leaves the sample videos unseekable in the preview
exec python3 "${DIR}/serve.py" "${PORT}"
