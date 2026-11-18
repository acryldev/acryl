#!/usr/bin/env bash
# Slice 0 of docs/plans/ide-port.md, from nothing: DSH 0.2.0-rc.2 and the framework 1.1.0 from npm, the ported ACRYL brand, ACRYL's prebuilt workspace shell, one Cordis context, one page.
#   ACRYL=<an acryldev/acryl checkout with its packages built> ./run.sh [work folder]
# Writes screenshots and prints the costs: install, cold start, page load, bytes. Needs Node 24, Chrome, and the repository's own node_modules (tsdown, tsc).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
: "${ACRYL:?set ACRYL to the acryldev/acryl checkout}"
work=${1:-$(mktemp -d)}
DSH=${DSH_VERSION:-0.2.0-rc.2}
FRAMEWORK=1.1.0
mkdir -p "$work/dsh/app" "$work/home" "$work/app-home"
now() { node -e 'console.log(Date.now())'; }
echo "work folder: $work"

# 1. DSH and the framework, from the registry, the way an app's install would get them.
cd "$work/dsh"
echo '{"name":"slice0","private":true,"type":"module"}' > package.json
t=$(now); npm install "@deepseek-ai/dsh@$DSH" "acrylblends@$FRAMEWORK" --no-audit --no-fund --loglevel=error >/dev/null 2>&1; echo "install: $(( ($(now) - t) / 1000 )) s, $(du -sk node_modules | cut -f1) KB, $(ls node_modules/@deepseek-ai | wc -l | tr -d ' ') @deepseek-ai packages"
cp "$here"/app/*.mjs app/
cp "$here/overlay.yml" overlay.yml   # its ./app/... rows resolve from the folder that holds the overlay, which must see node_modules
export DSH_HOME="$work/home" SPIKE_APP_HOME="$work/app-home"

# 2. The ported brand, built with this repository's toolchain; ACRYL's prebuilt shell staged.
(cd "$here/dsh-client-ui-brand-acryl" && "$repo/node_modules/.bin/tsdown" >/dev/null 2>&1 && "$repo/node_modules/.bin/tsc" -p tsconfig.json)
cmp "$here/dsh-client-ui-brand-acryl/lib/client.js" "$ACRYL/plugins/dsh-client-ui-brand-acryl/lib/client.js" && echo "brand client.js: byte-identical to ACRYL's own build"
node "$here/stage-acryl.mjs" "$ACRYL" "$work/pkgs"

# 3. Into DSH's web profile (`dsh plugin add` is DSH's own way; pnpm inside it must be allowed to run node-pty's install script).
npx dsh --profile web --dump-config >/dev/null
grep -q allowBuilds "$DSH_HOME/profiles/web/pnpm-workspace.yaml" || printf 'allowBuilds:\n  node-pty: true\n' >> "$DSH_HOME/profiles/web/pnpm-workspace.yaml"
npx dsh plugin --profile web add "acrylblends@$FRAMEWORK" >/dev/null 2>&1
npx dsh plugin --profile web add "file:$here/dsh-client-ui-brand-acryl" "file:$work/pkgs/acryl-workspace" "file:$work/pkgs/acryl-app-shell" "file:$work/pkgs/acryl__ui" "file:$work/pkgs/acryl-settings" >/dev/null 2>&1

# 4. Boot and look.
log="$work/boot.log"
t=$(now)
npx dsh --profile web --patch "$work/dsh/overlay.yml" --no-open --port 0 > "$log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; pkill -f "dsh --profile web" 2>/dev/null || true' EXIT
until grep -q "dsh web: http" "$log"; do sleep 0.1; done
echo "cold start to the URL: $(( $(now) - t )) ms"
grep -iE "warning|did not activate|pending|failed" "$log" || echo "every row activated"
url=$(grep -o "http://[^ ]*" "$log" | head -1)
node "$here/capture.mjs" "$url" "$work/shot" --settings --terminal
echo "screenshots: $work/shot-*.png"
