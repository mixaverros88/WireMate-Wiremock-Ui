#!/usr/bin/env bash
# run-tests.sh
# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit).
# After any *.java change: runs the matching test class (fast) or falls back
# to the full module test suite, logs every run to .claude/logs/test-runs.log,
# and feeds failures back to Claude so it fixes them immediately.
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
#             "command": "$CLAUDE_PROJECT_DIR/service/.claude/hooks/run-tests.sh",
#             "timeout": 300
#           }
#         ]
#       }
#     ]
#   }
# }

set -uo pipefail   # no -e: we handle the test exit code ourselves

# Resolve the repo root: CLAUDE_PROJECT_DIR when run as a hook; otherwise walk
# up from this script's location (service/.claude/hooks -> repo root) so manual
# runs work from any cwd.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# JSON stdin parsing: prefer jq, fall back to python (jq is not installed on
# every dev box; python ships with Git for Windows setups here).
PY_BIN=$(command -v python || command -v python3 || true)
read_file_path() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.tool_input.file_path // empty'
  elif [[ -n "$PY_BIN" ]]; then
    "$PY_BIN" -c "import sys,json;d=json.load(sys.stdin);print(d.get('tool_input',{}).get('file_path') or '')" 2>/dev/null
  else
    echo "[test-hook] Neither jq nor python found; cannot parse hook input" >&2
    echo ""
  fi
}

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | read_file_path)

# Only react to Java source changes
if [[ -z "$FILE_PATH" || "$FILE_PATH" != *.java ]]; then
  exit 0
fi

LOG_DIR="$PROJECT_DIR/.claude/logs"
LOG_FILE="$LOG_DIR/test-runs.log"
mkdir -p "$LOG_DIR"

# The Maven module lives in service/ (repo root has no pom.xml).
if [[ -f "$PROJECT_DIR/service/pom.xml" ]]; then
  MODULE_DIR="$PROJECT_DIR/service"
elif [[ -f "$PROJECT_DIR/pom.xml" ]]; then
  MODULE_DIR="$PROJECT_DIR"
else
  echo "[test-hook] No pom.xml found under $PROJECT_DIR, skipping" >&2
  exit 0
fi

cd "$MODULE_DIR"

# Pick the build tool: wrapper if present, else the global binary.
if [[ -x "./mvnw" ]]; then
  BUILD="./mvnw"
elif command -v mvn >/dev/null 2>&1; then
  BUILD="mvn"
elif [[ -x "./gradlew" ]]; then
  BUILD="./gradlew"
elif command -v gradle >/dev/null 2>&1; then
  BUILD="gradle"
else
  echo "[test-hook] No maven/gradle found, skipping" >&2
  exit 0
fi

CLASS_NAME=$(basename "$FILE_PATH" .java)

# Scope the run:
# - edited a test class          -> run that test class
# - edited prod class Foo.java   -> run FooTest / FooIT if they exist
#   (only *Test runs via `mvn test`; *IT classes need failsafe/Docker, so they
#   are left to `mvn verify` rather than fired on every edit)
# - otherwise                    -> full unit test suite (slow path)
TEST_TARGET=""
if [[ "$CLASS_NAME" == *Test ]]; then
  TEST_TARGET="$CLASS_NAME"
elif [[ "$CLASS_NAME" == *IT ]]; then
  echo "[test-hook] $CLASS_NAME is an integration test (needs Docker); run 'mvn verify' manually. Skipping."
  exit 0
else
  if find src/test -name "${CLASS_NAME}Test.java" -print -quit 2>/dev/null | grep -q .; then
    TEST_TARGET="${CLASS_NAME}Test"
  fi
fi

START_TS=$(date +%s)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [[ "$BUILD" == "./mvnw" || "$BUILD" == "mvn" ]]; then
  if [[ -n "$TEST_TARGET" ]]; then
    SCOPE="$TEST_TARGET"
    OUTPUT=$($BUILD test -q -Dtest="$TEST_TARGET" -Dsurefire.failIfNoTests=false 2>&1)
  else
    SCOPE="ALL"
    OUTPUT=$($BUILD test -q 2>&1)
  fi
else
  if [[ -n "$TEST_TARGET" ]]; then
    SCOPE="$TEST_TARGET"
    OUTPUT=$($BUILD test --tests "*.$TEST_TARGET" --quiet 2>&1)
  else
    SCOPE="ALL"
    OUTPUT=$($BUILD test --quiet 2>&1)
  fi
fi
EXIT_CODE=$?
DURATION=$(( $(date +%s) - START_TS ))

STATUS="PASS"
[[ $EXIT_CODE -ne 0 ]] && STATUS="FAIL"

# --- Monitoring: append a structured line per run ---
echo "$TIMESTAMP | $STATUS | exit=$EXIT_CODE | ${DURATION}s | scope=$SCOPE | trigger=$FILE_PATH" >> "$LOG_FILE"

# Keep the log bounded (last 500 runs)
tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "[test-hook] PASS ($SCOPE, ${DURATION}s)"
  exit 0
fi

# --- Failure: exit 2 sends stderr back to Claude so it sees and fixes it ---
{
  echo "[test-hook] TESTS FAILED (scope=$SCOPE, ${DURATION}s) after change to $FILE_PATH"
  echo "--- last 60 lines of output ---"
  echo "$OUTPUT" | tail -n 60
} >&2
exit 2
