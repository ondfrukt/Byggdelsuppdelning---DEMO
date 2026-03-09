#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="/tmp/byggdel-dev-server.pid"
LOG_FILE="/tmp/byggdel-dev-server.log"
APP_CMD=(python -u app.py)
PORT="${PORT:-5000}"

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
    [[ "$cmdline" == *"python"* && "$cmdline" == *"app.py"* ]]
}

is_port_listening() {
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
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
    if [[ -n "${pid:-}" ]] && is_server_process "$pid" && is_port_listening; then
        echo "RUNNING pid=$pid port=$PORT log=$LOG_FILE"
        return 0
    fi

    owner_pid="$(find_port_owner_pid || true)"
    if [[ -n "${owner_pid:-}" ]] && is_server_process "$owner_pid"; then
        echo "$owner_pid" >"$PID_FILE"
        echo "RUNNING pid=$owner_pid port=$PORT log=$LOG_FILE"
        return 0
    fi

    rm -f "$PID_FILE"
    echo "STOPPED"
    return 1
}

start() {
    local pid
    pid="$(read_pid || true)"
    if [[ -n "${pid:-}" ]] && is_server_process "$pid" && is_port_listening; then
        echo "Already running (pid=$pid)"
        exit 0
    fi

    rm -f "$PID_FILE"

    if is_port_listening; then
        local owner_pid
        owner_pid="$(find_port_owner_pid || true)"
        if [[ -n "${owner_pid:-}" ]] && is_server_process "$owner_pid"; then
            echo "$owner_pid" >"$PID_FILE"
            echo "Already running (pid=$owner_pid)"
            exit 0
        fi

        echo "Port $PORT is already in use."
        lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
        exit 1
    fi

    cd "$ROOT_DIR"
    nohup env PORT="$PORT" "${APP_CMD[@]}" >"$LOG_FILE" 2>&1 < /dev/null &
    pid=$!
    disown "$pid" >/dev/null 2>&1 || true
    echo "$pid" >"$PID_FILE"
    sleep 2

    if is_server_process "$pid" && is_port_listening; then
        echo "Started (pid=$pid) on port $PORT"
        echo "Logs: $LOG_FILE"
    else
        rm -f "$PID_FILE"
        if grep -q "PermissionError: \[Errno 1\] Operation not permitted" "$LOG_FILE" 2>/dev/null; then
            echo "Start blocked by sandbox permissions (cannot bind socket in detached mode)."
            echo "Run 'python app.py' in a dedicated terminal session instead."
        fi
        echo "Failed to start. Recent logs:"
        tail -n 80 "$LOG_FILE" || true
        exit 1
    fi
}

stop() {
    local pid
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
    start) start ;;
    stop) stop ;;
    restart) restart ;;
    status) status ;;
    logs) logs ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
