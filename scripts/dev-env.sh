#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DB_PATH="$ROOT_DIR/plm.db"

# Dev/Codespaces should default to the repository database instead of inheriting
# remote deployment settings. Set DEVSERVER_ALLOW_EXTERNAL_DB=1 to opt out.
if [[ "${DEVSERVER_ALLOW_EXTERNAL_DB:-0}" != "1" ]]; then
    unset MAIN_DATABASE_URL
    unset RENDER_GIT_BRANCH
    export BRANCH_NAME="local"
    export DATABASE_URL="sqlite:///$DEFAULT_DB_PATH"
else
    export BRANCH_NAME="${BRANCH_NAME:-local}"
    export DATABASE_URL="${DATABASE_URL:-sqlite:///$DEFAULT_DB_PATH}"
fi

export PORT="${PORT:-5000}"
