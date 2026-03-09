#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Force repository-root SQLite DB for all dev starts.
# This must win over any inherited Render/Codespaces env vars.
unset MAIN_DATABASE_URL
unset RENDER_GIT_BRANCH
export BRANCH_NAME="local"
export DATABASE_URL="sqlite:////workspaces/Byggdelsuppdelning---DEMO/plm.db"
export PORT="${PORT:-5000}"

# If already running on this port, avoid duplicate startup.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Dev server already running on port $PORT."
  exit 0
fi

echo "Starting Flask dev server in foreground on http://0.0.0.0:$PORT"
exec python -u app.py
