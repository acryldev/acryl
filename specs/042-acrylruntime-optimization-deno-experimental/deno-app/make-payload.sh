#!/bin/bash
# make-payload.sh <darwin|linux> <arm64|x64> <outDir>
# The run-time payload of the web surface (lib/ + a flat production node_modules): the closure of apps/acryl-web, native files of other
# platforms pruned, type declarations and non-ACRYL markdown removed, and the three packs the shipped Electron app does not contain dropped
# (LibreOffice kit, document preview, sherpa/voice). For a platform other than this machine's, that platform's native packages are fetched
# from npm at the versions pinned below, which are the ones the closure holds for macOS (a macOS install has no Linux natives); run probes/native-modules.mjs
# with PAYLOAD=<outDir> to confirm they load and work. Rebuild the workspace first: this copies lib/ folders.
set -euo pipefail
PLATFORM=$1; ARCH=$2; OUT=$3
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../.." && pwd); PROBES=$HERE/../probes
export D6_PLATFORM=$PLATFORM D6_ARCH=$ARCH
node "$PROBES/d6-payload.mjs" "$OUT" | grep -E "^closure|FINAL"
DROP="@deepseek-ai/libreoffice-kit-darwin-arm64,@deepseek-ai/dsh-client-ui-sidebar-documentpreview,sherpa-onnx-darwin-arm64"
node "$PROBES/d6-prune.mjs" "$OUT/node_modules" --drop "$DROP"
if [ "$PLATFORM-$ARCH" = "linux-x64" ]; then
  W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
  for spec in "@deepseek-ai/node-addon-system-linux-x64@0.1.2" "@img/sharp-linux-x64@0.35.4" "@img/sharp-libvips-linux-x64@1.3.3" "@koromix/koffi-linux-x64@3.1.5" "@vscode/ripgrep-linux-x64@1.18.0" "node-addon-require-builtin-linux-x64-gnu@0.1.7"; do
    name=${spec%@*}; (cd "$W" && npm pack "$spec" --silent >/dev/null 2>&1) ; tgz=$(ls "$W"/*.tgz | head -1)
    rm -rf "$OUT/node_modules/$name"; mkdir -p "$OUT/node_modules/$name"; tar -xzf "$tgz" -C "$OUT/node_modules/$name" --strip-components=1; rm -f "$tgz"
  done
  echo "linux-x64 natives added"
fi
du -sk "$OUT" | awk '{printf "payload %.1f MB\n", $1/1024}'
