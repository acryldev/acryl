#!/usr/bin/env bash
# graft-qwen.sh — run a Graft *deep* build against Qwen with the correct key/URL/model pairing.
#
# WHY THIS EXISTS
#   Qwen has two separate plans with two separate endpoints, and the keys are NOT
#   interchangeable. Pairing the wrong one returns HTTP 401 "Incorrect API key
#   provided"; pairing a wrong model id returns 404 "Model not exist." All three
#   values (key, base url, model) must come from the SAME plan block of
#   ~/.secure-storage/llmproviders/qwen/qwen.json — which is what this script does.
#
# USAGE
#   scripts/graft-qwen.sh                      # token_plan + qwen3.8-max, deep build
#   scripts/graft-qwen.sh --plan pay-as-you-go # metered plan + its default model
#   GRAFT_MODEL=qwen3-coder-plus scripts/graft-qwen.sh
#   scripts/graft-qwen.sh graft check          # pass a non-build command through verbatim
#   scripts/graft-qwen.sh --show               # print the resolved pairing (key redacted) and exit
#   scripts/graft-qwen.sh --verify             # probe the pairing first; build only if it works
#
# FLAGS
#   --plan token_plan|pay-as-you-go|pay_as_you_go   which Qwen plan to bill against
#   -j N, --jobs N                                  LLM concurrency (default 4)
#   --show                                          show config, run nothing
#   --no-deep                                       drop the --deep flag (deterministic, $0)
#   anything else                                   forwarded to graft unchanged
#
# EXCLUSIONS (see ONLY_DIRS below)
#   apps/acryl-cli/lib-publish/{bin,index}.js are ~450KB COMMITTED npm bundles. They are
#   tracked, so .gitignore cannot hide them (graft enumerates with `git ls-files --cached
#   --others`), and they sit under graft's 1 MB MAX_FILE_BYTES cut-off, so they get parsed.
#   They contribute 824 duplicate nodes — 68% of the "meaning tier" backlog — for code
#   already indexed from apps/acryl-cli/src. The --only-dir whitelist below keeps every
#   real source root and drops that one directory. Graft persists the whitelist in the
#   graph fingerprint, so `graft check` and the auto-refresh hooks honour it too.

set -euo pipefail

QCONF="${QWEN_CONFIG:-$HOME/.secure-storage/llmproviders/qwen/qwen.json}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Real source roots, minus the committed lib-publish bundles.
ONLY_DIRS=(
  apps/acryl-cli/bin
  apps/acryl-cli/scripts
  apps/acryl-cli/src
  apps/acryl-cli/tests
  apps/acryl-desktop
  apps/acryl-web
  distribution
  examples
  plugins
  runtime
  scripts
  specs
)

plan=token_plan
jobs=4
deep=1
show=0
verify=0
forward=()

while [ $# -gt 0 ]; do
  case "$1" in
    --plan) plan="${2:?--plan needs a value}"; shift 2 ;;
    -j|--jobs) jobs="${2:?-j needs a value}"; shift 2 ;;
    --no-deep) deep=0; shift ;;
    --show) show=1; shift ;;
    --verify) verify=1; shift ;;
    *) forward+=("$1"); shift ;;
  esac
done

# normalise spellings: pay-as-you-go / pay_as_you_go -> pay_as_you_go
case "${plan//-/_}" in
  token_plan) plan=token_plan ;;
  pay_as_you_go) plan=pay_as_you_go ;;
  *) echo "graft-qwen: unknown --plan '$plan' (expected token_plan | pay-as-you-go)" >&2; exit 2 ;;
esac

[ -r "$QCONF" ] || { echo "graft-qwen: cannot read $QCONF" >&2; exit 2; }
command -v jq >/dev/null || { echo "graft-qwen: jq is required" >&2; exit 2; }
command -v graft >/dev/null || { echo "graft-qwen: graft is not on PATH (npm i -g @nanonets/graft)" >&2; exit 2; }

base_url=$(jq -r --arg p "$plan" '.plans[$p].openai_base_url // empty' "$QCONF")
api_key=$(jq -r  --arg p "$plan" '.plans[$p].api_key // empty' "$QCONF")
model="${GRAFT_MODEL:-$(jq -r --arg p "$plan" '.plans[$p].recommended_model // .default_graft_model // empty' "$QCONF")}"

if [ "$plan" = token_plan ]; then
  # deepseek-v4.1-flash: tool-capable AND fast (2.6s) on the flat-rate plan. qwen3.7-max also
  # works but costs 21.9s/call (~10x) on a 526-call deep scan. NOT qwen3.8-max: thinking mode
  # 400s on a forced tool_choice, which silently stalls --deep. See graft_model_choice_evidence.
  : "${model:=deepseek-v4.1-flash}"
else
  # qwen3-coder-plus is the code-specialised id on the metered endpoint.
  : "${model:=qwen3-coder-plus}"
fi

[ -n "$base_url" ] && [ -n "$api_key" ] || {
  echo "graft-qwen: plan '$plan' not found in $QCONF — re-verify with the probes documented in ._readme" >&2; exit 2; }

if [ "$show" = 1 ]; then
  jq -r --arg p "$plan" '"plan:      \($p)
base url:  \(.plans[$p].openai_base_url)
api key:   \(.plans[$p].key_prefix)<redacted, len \(.plans[$p].api_key|length)>
wire:      \(.plans[$p].wire_formats|join(", "))
models:    \(.plans[$p].model_ids|length) served
verified:  \(._verified_at)"' "$QCONF"
  echo "model:     $model"
  echo "concurrency: $jobs"
  echo "only-dir whitelist (${#ONLY_DIRS[@]} roots): ${ONLY_DIRS[*]}"
  ready=$(jq -r --arg p "$plan" '(.plans[$p].graft_ok_models // [])
         | join(", ")' "$QCONF" 2>/dev/null || true)
  blocked=$(jq -r --arg p "$plan" '(.plans[$p].graft_blocked_models // [])
            | join(", ")' "$QCONF" 2>/dev/null || true)
  echo "graft-ready on this plan (forced tool_choice verified): ${ready:-unknown - run probe-qwen-models.py}"
  [ -n "$blocked" ] && echo "NOT graft-usable here (thinking mode rejects tool_choice): $blocked"
  exit 0
fi

# Cheap pre-flight: one forced-tool_choice completion - exactly the request shape graft's
# concept pass sends. Catches both the key mismatch and the thinking-mode 400 before a
# long build dies halfway and leaves a partial graph behind.
if [ "$verify" = 1 ]; then
  vjson=/tmp/graft-qwen-verify.$$.json
  vcode=$(curl -sS -m 60 -o "$vjson" -w '%{http_code}' "$base_url/chat/completions" \
    -H "Authorization: Bearer $api_key" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"max_tokens\":500,\"messages\":[{\"role\":\"user\",\"content\":\"Name and one-line summarise: a loader that reads a manifest and resolves refs.\"}],\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"emit\",\"description\":\"Return JSON.\",\"parameters\":{\"type\":\"object\",\"additionalProperties\":true}}}],\"tool_choice\":{\"type\":\"function\",\"function\":{\"name\":\"emit\"}}}" 2>/dev/null || echo 000)
  if [ "$vcode" != "200" ] || ! jq -e '(.choices[0].message.tool_calls | length) > 0' "$vjson" >/dev/null 2>&1; then
    echo "graft-qwen: pre-flight FAILED (HTTP $vcode) for $model on $plan - not starting a build." >&2
    jq -r '.error.message // .message // "no tool call returned"' "$vjson" 2>/dev/null | head -2 | sed 's/^/    /' >&2
    echo "  try: scripts/graft-qwen.sh --plan pay-as-you-go   (qwen3-coder-plus is tool-capable)" >&2
    rm -f "$vjson"; exit 1
  fi
  rm -f "$vjson"
  echo "graft-qwen: pre-flight ok ($model forced a tool call on $plan)" >&2
fi

export GRAFT_PROVIDER=openai GRAFT_BASE_URL="$base_url" GRAFT_API_KEY="$api_key" GRAFT_MODEL="$model"
export GRAFT_CONCURRENCY="$jobs" GRAFT_LLM_RETRIES="${GRAFT_LLM_RETRIES:-3}"

# A non-`build` verb (check/ask/map/...) is forwarded verbatim with just the creds set.
if [ ${#forward[@]} -gt 0 ] && [ "${forward[0]}" != "build" ]; then
  cd "$REPO_ROOT"; exec graft "${forward[@]}"
fi

args=(build)
[ "$deep" = 1 ] && args+=(--deep)
args+=(-j "$jobs")
for d in "${ONLY_DIRS[@]}"; do args+=(--only-dir "$d"); done
# --allow-partial is deliberately NOT defaulted: a degraded meaning tier should be loud.
# Add it via `scripts/graft-qwen.sh build --allow-partial` if you want exit 0 regardless.
args+=("${forward[@]}")

cd "$REPO_ROOT"
echo "graft-qwen: graft ${args[*]}" >&2
echo "graft-qwen: $plan -> $base_url ($model)" >&2
exec graft "${args[@]}"
