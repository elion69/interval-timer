#!/usr/bin/env bash
# Issue a remote command to the interval timer.
# The phone or desktop app picks it up within about 5 seconds while the page is open.
#
#   scripts/send-command.sh start "20 on / 5 off"
#   scripts/send-command.sh pause
#   scripts/send-command.sh stop
#   scripts/send-command.sh start '{"countdown":300}'
#   scripts/send-command.sh start '{"stopwatch":true}'
#   scripts/send-command.sh start '{"work":1200,"rest":300,"rounds":4,"warmup":0}'
#
# work, rest, warmup, and countdown are seconds.
# Requires the GitHub CLI logged in as someone who can push to elion69/interval-timer.

set -euo pipefail

ACTION="${1:-}"
WORKOUT="${2:-}"
REPO="elion69/interval-timer"
FILE_PATH="remote/command.json"

if [[ "$ACTION" != "start" && "$ACTION" != "pause" && "$ACTION" != "stop" ]]; then
  echo "usage: scripts/send-command.sh start|pause|stop [workout name or JSON]" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh (GitHub CLI) is required and must be logged in." >&2
  exit 1
fi

BODY="$(node -e '
const [action, workout] = process.argv.slice(1);
let parsed = null;
if (workout && workout.trim()) {
  const text = workout.trim();
  parsed = text.startsWith("{") ? JSON.parse(text) : text;
}
const issued = new Date().toISOString();
const id = issued.replace(/[:.]/g, "") + "-" + process.pid;
process.stdout.write(JSON.stringify({ id, issued, action, workout: parsed }, null, 2) + "\n");
' "$ACTION" "$WORKOUT")"

ID="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).id)' <<<"$BODY")"
CONTENT="$(printf '%s' "$BODY" | base64 -w 0)"
SHA="$(gh api "/repos/${REPO}/contents/${FILE_PATH}?ref=main" --jq .sha 2>/dev/null || true)"

ARGS=(--method PUT "/repos/${REPO}/contents/${FILE_PATH}"
  -f message="Remote command: ${ACTION} ${WORKOUT:-}"
  -f content="$CONTENT"
  -f branch="main")
if [[ -n "$SHA" ]]; then
  ARGS+=(-f sha="$SHA")
fi

gh api "${ARGS[@]}" >/dev/null
echo "sent ${ID}"
echo "$BODY"
