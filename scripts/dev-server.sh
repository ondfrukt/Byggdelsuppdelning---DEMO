#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/dev-env.sh"
PID_FILE="/tmp/byggdel-dev-server.pid"
LOG_FILE="/tmp/byggdel-dev-server.log"
LOCK_FILE="/tmp/byggdel-dev-server.lock"
START_TIMEOUT="${START_TIMEOUT:-15}"

is_running() {
    local pid="$1"
    kill -0 "$pid" >/dev/null 2>&1
}

is_server_process() {
    local pid="$1"
    local cmdline

    if ! is_running "$pid"; then
        return 1
    fi

    cmdline="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    [[ "$cmdline" == *"gunicorn"* && "$cmdline" == *"app:app"* ]] || [[ "$cmdline" == *"python"* && "$cmdline" == *"app.py"* ]]
}

is_port_listening() {
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

is_http_healthy() {
    curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1
}

is_server_healthy() {
    local pid="$1"
    is_server_process "$pid" && is_port_listening && is_http_healthy
}

find_port_owner_pid() {
    lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
}

read_pid() {
    if [[ -f "$PID_FILE" ]]; then
        cat "$PID_FILE"
    fi
}

status() {
    local pid
    local owner_pid
    pid="$(read_pid || true)"
    if [[ -n "${pid:-}" ]] && is_server_healthy "$pid"; then
        echo "RUNNING pid=$pid port=$PORT log=$LOG_FILE"
        return 0
    fi

    owner_pid="$(find_port_owner_pid || true)"
    if [[ -n "${owner_pid:-}" ]] && is_server_healthy "$owner_pid"; then
        echo "$owner_pid" >"$PID_FILE"
        echo "RUNNING pid=$owner_pid port=$PORT log=$LOG_FILE"
        return 0
    fi

    rm -f "$PID_FILE"
    echo "STOPPED"
    return 1
}

ensure() {
    if status >/dev/null 2>&1; then
        status
        return 0
    fi

    echo "Dev server not healthy on port $PORT. Starting a fresh instance."
    start
}

start() {
    local pid
    local elapsed
    pid="$(read_pid || true)"
    if [[ -n "${pid:-}" ]] && is_server_healthy "$pid"; then
        echo "Already running (pid=$pid)"
        exit 0
    fi

    rm -f "$PID_FILE"

    if is_port_listening; then
        local owner_pid
        owner_pid="$(find_port_owner_pid || true)"
        if [[ -n "${owner_pid:-}" ]] && is_server_healthy "$owner_pid"; then
            echo "$owner_pid" >"$PID_FILE"
            echo "Already running (pid=$owner_pid)"
            exit 0
        fi

        echo "Port $PORT is already in use."
        lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
        exit 1
    fi

    cd "$ROOT_DIR"
    gunicorn \
        --daemon \
        --bind "0.0.0.0:${PORT}" \
        --workers 1 \
        --threads 4 \
        --pid "$PID_FILE" \
        --error-logfile "$LOG_FILE" \
        app:app
    pid="$(read_pid || true)"
    elapsed=0
    while (( elapsed < START_TIMEOUT )); do
        if [[ -n "${pid:-}" ]] && is_server_healthy "$pid"; then
            break
        fi
        if [[ -n "${pid:-}" ]] && ! is_running "$pid"; then
            break
        fi
        sleep 1
        pid="$(read_pid || true)"
        ((elapsed+=1))
    done

    if [[ -n "${pid:-}" ]] && is_server_healthy "$pid"; then
        echo "Started (pid=$pid) on port $PORT"
        echo "Logs: $LOG_FILE"
    else
        rm -f "$PID_FILE"
        if grep -q "Address already in use" "$LOG_FILE" 2>/dev/null; then
            echo "Port $PORT is already in use by another process."
        fi
        echo "Failed to start. Recent logs:"
        tail -n 80 "$LOG_FILE" || true
        exit 1
    fi
}

run() {
    cd "$ROOT_DIR"
    exec python -u app.py
}

with_lock() {
    local action="$1"
    flock -w 30 --close "$LOCK_FILE" "$0" "__locked_${action}" || {
        echo "Could not acquire dev server lock: $LOCK_FILE"
        exit 1
    }
}

stop() {
    local pid
    local owner_pid
    pid="$(read_pid || true)"

    if [[ -n "${pid:-}" ]] && is_server_process "$pid"; then
        kill "$pid" || true
        sleep 1
        if is_running "$pid"; then
            kill -9 "$pid" || true
        fi
        rm -f "$PID_FILE"
        echo "Stopped pid=$pid"
        return 0
    fi

    owner_pid="$(find_port_owner_pid || true)"
    if [[ -n "${owner_pid:-}" ]] && is_server_process "$owner_pid"; then
        kill "$owner_pid" || true
        sleep 1
        if is_running "$owner_pid"; then
            kill -9 "$owner_pid" || true
        fi
        rm -f "$PID_FILE"
        echo "Stopped pid=$owner_pid"
        return 0
    fi

    rm -f "$PID_FILE"
    echo "No running server found via pid file."
}

logs() {
    if [[ -f "$LOG_FILE" ]]; then
        tail -n 120 "$LOG_FILE"
    else
        echo "No log file yet: $LOG_FILE"
    fi
}

restart() {
    stop || true
    start
}

case "${1:-}" in
    ensure) with_lock ensure ;;
    __locked_ensure) ensure ;;
    start) with_lock start ;;
    __locked_start) start ;;
    run) run ;;
    stop) with_lock stop ;;
    __locked_stop) stop ;;
    restart) with_lock restart ;;
    __locked_restart) restart ;;
    status) status ;;
    logs) logs ;;
    *)
        echo "Usage: $0 {ensure|start|run|stop|restart|status|logs}"
        exit 1
        ;;
esac
