#!/usr/bin/env bash
# generate-postman.sh
# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit).
# If the changed file is a *Controller.java, regenerates its Postman collection
# by asking the Claude API to parse the controller source.
#
# Wiring (.claude/settings.json):
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": "Write|Edit|MultiEdit",
#         "hooks": [
#           { "type": "command", "command": "$CLAUDE_PROJECT_DIR/service/.claude/hooks/generate-postman.sh", "timeout": 120 }
#         ]
#       }
#     ]
#   }
# }

set -uo pipefail

# Resolve the repo root: CLAUDE_PROJECT_DIR when run as a hook; otherwise walk
# up from this script's location (service/.claude/hooks -> repo root).
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# Python does all JSON building/parsing (jq is not installed on every dev box).
PY_BIN=$(command -v python || command -v python3 || true)
if [[ -z "$PY_BIN" ]]; then
  echo "[postman-hook] python not found; skipping" >&2
  exit 0
fi

# Hooks receive JSON context via stdin, not argv
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | "$PY_BIN" -c "import sys,json;d=json.load(sys.stdin);print(d.get('tool_input',{}).get('file_path') or '')" 2>/dev/null)

# Nothing to do if no file path or not a controller
if [[ -z "$FILE_PATH" || "$FILE_PATH" != *Controller.java ]]; then
  exit 0
fi

# File may have been deleted or moved since the tool call
if [[ ! -f "$FILE_PATH" ]]; then
  echo "[postman-hook] File not found: $FILE_PATH" >&2
  exit 0
fi

# No key -> skip quietly (exit 0). A hard failure here would error on every
# controller edit for anyone without the key exported.
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "[postman-hook] ANTHROPIC_API_KEY not set; skipping Postman regeneration for $(basename "$FILE_PATH")"
  exit 0
fi

echo "[postman-hook] Controller change detected: $FILE_PATH"

CONTROLLER_NAME=$(basename "$FILE_PATH" .java)
OUT_DIR="$PROJECT_DIR/environment/postman"
COLLECTION_FILE="$OUT_DIR/${CONTROLLER_NAME}.postman_collection.json"

mkdir -p "$OUT_DIR"

# Build the request body with python (correct JSON escaping of the source).
REQUEST_BODY=$("$PY_BIN" - "$CONTROLLER_NAME" "$FILE_PATH" <<'PY'
import json, sys

name, path = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    source = f.read()

prompt = (
    "You are a tool that generates Postman collections from Spring Boot controllers.\n\n"
    "Given the following Spring Boot controller, produce a valid Postman Collection v2.1 JSON.\n\n"
    "Rules:\n"
    "- Use {{baseUrl}} as the base URL variable\n"
    "- Group all requests under a folder named after the controller\n"
    "- Infer path variables and query params from the method signatures\n"
    "- Use appropriate HTTP methods from the mapping annotations\n"
    "- For POST/PUT methods include an example JSON body based on the request DTO fields if visible\n"
    "- Return ONLY raw JSON, no markdown, no explanation\n\n"
    f"Controller name: {name}\n\nController source:\n{source}"
)

print(json.dumps({
    "model": "claude-sonnet-4-6",
    "max_tokens": 8192,
    "messages": [{"role": "user", "content": prompt}],
}))
PY
)

RESPONSE=$(curl -s --max-time 55 https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "$REQUEST_BODY")

if [[ -z "$RESPONSE" ]]; then
  echo "[postman-hook] ERROR: empty response from API (network/timeout?)" >&2
  exit 1
fi

# Extract the collection: detect API errors, pull content[0].text, strip
# markdown fences if present, and require a JSON *object* before writing.
if echo "$RESPONSE" | "$PY_BIN" - "$COLLECTION_FILE" <<'PY'
import json, re, sys

out_path = sys.argv[1]
resp = json.load(sys.stdin)

if resp.get("type") == "error":
    msg = (resp.get("error") or {}).get("message", "unknown")
    print(f"[postman-hook] API error: {msg}", file=sys.stderr)
    sys.exit(1)

blocks = resp.get("content") or []
text = next((b.get("text") for b in blocks if b.get("type") == "text"), None)
if not text:
    print("[postman-hook] ERROR: no text content in API response", file=sys.stderr)
    print(json.dumps(resp)[:2000], file=sys.stderr)
    sys.exit(1)

# Strip markdown fences if the model wrapped the output anyway
text = re.sub(r"^\s*```(?:json)?\s*", "", text)
text = re.sub(r"\s*```\s*$", "", text)

try:
    collection = json.loads(text)
except ValueError:
    print("[postman-hook] ERROR: response was not valid JSON. Skipping write.", file=sys.stderr)
    sys.exit(1)

if not isinstance(collection, dict):
    print("[postman-hook] ERROR: response was not a JSON object. Skipping write.", file=sys.stderr)
    sys.exit(1)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(collection, f, indent=2)
PY
then
  echo "[postman-hook] Collection written to $COLLECTION_FILE"
else
  exit 1
fi
