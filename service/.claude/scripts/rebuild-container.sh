#!/usr/bin/env bash
# rebuild-container.sh
# Claude Code PostToolUse hook / standalone script.
# Builds the Docker image(s) and recreates the running container(s).
# Logs every rebuild to .claude/logs/docker-rebuilds.log.
#
# Deliberately NOT wired into .claude/settings.json: a full compose rebuild
# (which restarts the live trading stack) after every file edit is too heavy.
# Run manually:  bash service/.claude/hooks/rebuild-container.sh
# To automate anyway, add to the PostToolUse hooks array in .claude/settings.json:
#   {
#     "type": "command",
#     "command": "$CLAUDE_PROJECT_DIR/service/.claude/hooks/rebuild-container.sh",
#     "timeout": 600
#   }
#
# Config via env vars (override in your shell):
#   APP_NAME        image/container name        (default: project dir name)
#   APP_PORT        host:container port mapping (default: 8080:8080)
#   DOCKERFILE      path to Dockerfile          (default: Dockerfile)
#   COMPOSE_SERVICE compose service to rebuild  (default: empty = all)

set -uo pipefail

# Resolve the repo root: CLAUDE_PROJECT_DIR when run as a hook; otherwise walk
# up from this script's location (service/.claude/hooks -> repo root) so manual
# runs find the repo-root docker-compose.yml regardless of cwd.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/.claude/logs"
LOG_FILE="$LOG_DIR/docker-rebuilds.log"
mkdir -p "$LOG_DIR"

APP_NAME="${APP_NAME:-$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]')}"
APP_PORT="${APP_PORT:-8080:8080}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-}"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
START_TS=$(date +%s)

log_result() {
  local status="$1"
  local detail="$2"
  local duration=$(( $(date +%s) - START_TS ))
  echo "$TIMESTAMP | $status | ${duration}s | $detail" >> "$LOG_FILE"
  tail -n 200 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
}

# Make sure the docker daemon is up (Docker Desktop on Windows/macOS)
if ! docker info >/dev/null 2>&1; then
  echo "[docker-hook] Docker daemon not reachable (is Docker Desktop running?)" >&2
  log_result "SKIP" "daemon not reachable"
  exit 0   # don't fail the whole hook chain over this
fi

# --- Path A: docker compose project ---
if [[ -f "docker-compose.yml" || -f "compose.yml" || -f "docker-compose.yaml" ]]; then
  echo "[docker-hook] Rebuilding via docker compose${COMPOSE_SERVICE:+ (service: $COMPOSE_SERVICE)}..."
  # shellcheck disable=SC2086
  if OUTPUT=$(docker compose up -d --build $COMPOSE_SERVICE 2>&1); then
    echo "[docker-hook] Compose rebuild OK"
    log_result "PASS" "compose${COMPOSE_SERVICE:+ service=$COMPOSE_SERVICE}"
    exit 0
  else
    echo "[docker-hook] Compose rebuild FAILED" >&2
    echo "$OUTPUT" | tail -n 40 >&2
    log_result "FAIL" "compose build error"
    exit 2   # feed the build error back to Claude
  fi
fi

# --- Path B: plain Dockerfile ---
if [[ ! -f "$DOCKERFILE" ]]; then
  echo "[docker-hook] No Dockerfile or compose file found in $PROJECT_DIR, skipping" >&2
  log_result "SKIP" "no dockerfile"
  exit 0
fi

echo "[docker-hook] Building image $APP_NAME..."
if ! OUTPUT=$(docker build -t "$APP_NAME" -f "$DOCKERFILE" . 2>&1); then
  echo "[docker-hook] Image build FAILED" >&2
  echo "$OUTPUT" | tail -n 40 >&2
  log_result "FAIL" "image build error"
  exit 2
fi

echo "[docker-hook] Recreating container $APP_NAME..."
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true

if OUTPUT=$(docker run -d --name "$APP_NAME" -p "$APP_PORT" "$APP_NAME" 2>&1); then
  echo "[docker-hook] Container $APP_NAME running on $APP_PORT"
  log_result "PASS" "image=$APP_NAME port=$APP_PORT"
  exit 0
else
  echo "[docker-hook] Container start FAILED" >&2
  echo "$OUTPUT" | tail -n 20 >&2
  log_result "FAIL" "container start error"
  exit 2
fi
