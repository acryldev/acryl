#!/bin/bash
# make-payload.sh <darwin|linux|win32> <arm64|x64> <outDir>
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
# Native packages of the target platform, fetched from npm at the versions pinned here (the ones the closure holds for macOS). Windows has no
# @deepseek-ai/node-addon-system package at all (macOS and Linux only), and node-pty carries its win32-x64 ConPTY prebuilds inside its own package.
case "$PLATFORM-$ARCH" in
  linux-x64) NATIVES="@deepseek-ai/node-addon-system-linux-x64@0.1.2 @img/sharp-linux-x64@0.35.4 @img/sharp-libvips-linux-x64@1.3.3 @koromix/koffi-linux-x64@3.1.5 @vscode/ripgrep-linux-x64@1.18.0" ;;
  win32-x64) NATIVES="@img/sharp-win32-x64@0.35.4 @img/sharp-libvips-win32-x64@1.3.3 @koromix/koffi-win32-x64@3.1.5 @vscode/ripgrep-win32-x64@1.18.0" ;;
  *) NATIVES="" ;;
esac
if [ -n "$NATIVES" ]; then
  W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
  for spec in $NATIVES; do
    name=${spec%@*}; (cd "$W" && npm pack "$spec" --silent >/dev/null 2>&1) ; tgz=$(ls "$W"/*.tgz | head -1)
    rm -rf "$OUT/node_modules/$name"; mkdir -p "$OUT/node_modules/$name"; tar -xzf "$tgz" -C "$OUT/node_modules/$name" --strip-components=1; rm -f "$tgz"
  done
  echo "$PLATFORM-$ARCH natives added"
fi
# Replace node-addon-require-builtin (and its per-platform native packages) with the fail-fast stub: see stubs/node-addon-require-builtin/index.js for why.
rm -rf "$OUT/node_modules/node-addon-require-builtin" "$OUT"/node_modules/node-addon-require-builtin-*
mkdir -p "$OUT/node_modules/node-addon-require-builtin"
cp "$HERE"/stubs/node-addon-require-builtin/package.json "$HERE"/stubs/node-addon-require-builtin/index.js "$OUT/node_modules/node-addon-require-builtin/"
du -sk "$OUT" | awk '{printf "payload %.1f MB\n", $1/1024}'
