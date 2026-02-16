#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Force isolated local test DB inside this Codespace.
export DATABASE_URL="sqlite:///codespace_test.db"

# Stop previous dev server started by this script (if any).
pkill -f "python -m flask --app app run --reload --no-debugger --host=0.0.0.0 --port=5000" >/dev/null 2>&1 || true

nohup python -m flask --app app run --reload --no-debugger --host=0.0.0.0 --port=5000 \
  >/tmp/flask-dev.log 2>&1 &

echo "Flask dev server started on http://0.0.0.0:5000 (log: /tmp/flask-dev.log)"
