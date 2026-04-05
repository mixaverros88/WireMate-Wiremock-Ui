#!/usr/bin/env bash
# run-ui-tests.sh
# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit).
# After a change under ui/src/: runs the edited spec file directly, or the
# vitest tests *related* to the edited source file (imports-based), logs every
# run to .claude/logs/ui-test-runs.log, and feeds failures back to Claude.
#
# Wiring (.claude/settings.json):
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": "Write|Edit|MultiEdit",
#         "hooks": [
#           {
#             "type": "command",
#             "command": "$CLAUDE_PROJECT_DIR/service/.claude/hooks/run-ui-tests.sh",
#             "timeout": 300
#           }
#         ]
#       }
#     ]
#   }
# }

set -uo pipefail   # no -e: we handle the test exit code ourselves

# Resolve the repo root: CLAUDE_PROJECT_DIR when run as a hook; otherwise walk
# up from this script's location (service/.claude/hooks -> repo root).
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# JSON stdin parsing: prefer jq, fall back to python.
PY_BIN=$(command -v python || command -v python3 || true)
read_file_path() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.tool_input.file_path // empty'
  elif [[ -n "$PY_BIN" ]]; then
    "$PY_BIN" -c "import sys,json;d=json.load(sys.stdin);print(d.get('tool_input',{}).get('file_path') or '')" 2>/dev/null
  else
    echo "[ui-test-hook] Neither jq nor python found; cannot parse hook input" >&2
    echo ""
  fi
}

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | read_file_path)
FILE_PATH=${FILE_PATH//\\//}   # normalize Windows backslashes

# Only react to frontend sources under ui/src/ (skip type decls and e2e —
# vitest only includes src/**/*.{spec,test}.ts; playwright runs separately).
case "$FILE_PATH" in
  *.d.ts) exit 0 ;;
  */ui/src/*.ts | */ui/src/*.tsx | */ui/src/*.vue | */ui/src/*.js) ;;
  *) exit 0 ;;
esac

UI_DIR="$PROJECT_DIR/ui"
if [[ ! -f "$UI_DIR/package.json" ]]; then
  echo "[ui-test-hook] $UI_DIR/package.json not found, skipping" >&2
  exit 0
fi
if [[ ! -d "$UI_DIR/node_modules" ]]; then
  echo "[ui-test-hook] ui/node_modules missing (run npm install), skipping" >&2
  exit 0
fi

LOG_DIR="$PROJECT_DIR/.claude/logs"
LOG_FILE="$LOG_DIR/ui-test-runs.log"
mkdir -p "$LOG_DIR"

cd "$UI_DIR"

# Path relative to ui/ for vitest
REL_PATH=${FILE_PATH#*/ui/}

# Scope the run:
# - edited a spec/test file -> run exactly that file
# - edited a source file    -> run the specs that import it (vitest related)
if [[ "$REL_PATH" == *.spec.ts || "$REL_PATH" == *.test.ts ]]; then
  SCOPE="$REL_PATH"
  VITEST_ARGS=(run "$REL_PATH")
else
  SCOPE="related:$REL_PATH"
  VITEST_ARGS=(related "$REL_PATH" --run --passWithNoTests)
fi

START_TS=$(date +%s)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

OUTPUT=$(npx vitest "${VITEST_ARGS[@]}" 2>&1)
EXIT_CODE=$?
DURATION=$(( $(date +%s) - START_TS ))

STATUS="PASS"
[[ $EXIT_CODE -ne 0 ]] && STATUS="FAIL"

# --- Monitoring: append a structured line per run ---
echo "$TIMESTAMP | $STATUS | exit=$EXIT_CODE | ${DURATION}s | scope=$SCOPE | trigger=$FILE_PATH" >> "$LOG_FILE"

# Keep the log bounded (last 500 runs)
tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "[ui-test-hook] PASS ($SCOPE, ${DURATION}s)"
  exit 0
fi

# --- Failure: exit 2 sends stderr back to Claude so it sees and fixes it ---
{
  echo "[ui-test-hook] TESTS FAILED (scope=$SCOPE, ${DURATION}s) after change to $FILE_PATH"
  echo "--- last 60 lines of output ---"
  echo "$OUTPUT" | tail -n 60
} >&2
exit 2
