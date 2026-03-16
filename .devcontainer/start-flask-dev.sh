#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export START_TIMEOUT="${START_TIMEOUT:-45}"

attempt=1
max_attempts=3

while (( attempt <= max_attempts )); do
    if bash ./scripts/dev-server.sh ensure; then
        exit 0
    fi

    if (( attempt == max_attempts )); then
        echo "Dev server failed to start after ${max_attempts} attempts."
        exit 1
    fi

    echo "Retrying dev server start (${attempt}/${max_attempts})..."
    sleep 3
    ((attempt+=1))
done
