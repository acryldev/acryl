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
# The pinned pnpm that `dsh plugin add` runs (pinned-pnpm.ts resolves the package by name; without it the install falls back to a bare `pnpm` on the user's PATH, which an end user does not have).
PNPM_MANIFEST=$(cd "$REPO/runtime/acryl-harness-runtime" && node -p "require.resolve('pnpm')")
rm -rf "$OUT/node_modules/pnpm"; mkdir -p "$OUT/node_modules/pnpm"; cp -R "$(dirname "$PNPM_MANIFEST")/." "$OUT/node_modules/pnpm/"
echo "pnpm $(node -p "require('$OUT/node_modules/pnpm/package.json').version") added"

# A real Node beside the app, as runtime/node[.exe]: the Harness starts child processes as "node" (the package manager behind `dsh plugin add`, MCP servers, the subprocess runner), and
# neither a Deno host nor a `deno desktop` GUI executable can be that (specs/042 F14). The version the stock DeepSeek Harness desktop bundles; the official archive, checked against
# nodejs.org's own SHASUMS256.txt. main.ts sets process.execPath to it. About +115 MB installed (macOS arm64), +118 (Linux x64), +88 (Windows x64).
NODE_VERSION=24.18.1
case "$PLATFORM-$ARCH" in
  darwin-arm64) NODE_FILE=node-v$NODE_VERSION-darwin-arm64.tar.gz; NODE_MEMBER=node-v$NODE_VERSION-darwin-arm64/bin/node; NODE_DEST=node ;;
  linux-x64)    NODE_FILE=node-v$NODE_VERSION-linux-x64.tar.xz;    NODE_MEMBER=node-v$NODE_VERSION-linux-x64/bin/node;    NODE_DEST=node ;;
  win32-x64)    NODE_FILE=node-v$NODE_VERSION-win-x64.zip;         NODE_MEMBER=node-v$NODE_VERSION-win-x64/node.exe;      NODE_DEST=node.exe ;;
  *) NODE_FILE="" ;;
esac
if [ -n "$NODE_FILE" ]; then
  NW=$(mktemp -d)
  curl -fsSL -o "$NW/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  curl -fsSL -o "$NW/$NODE_FILE" "https://nodejs.org/dist/v$NODE_VERSION/$NODE_FILE"
  (cd "$NW" && grep " $NODE_FILE\$" SHASUMS256.txt | shasum -a 256 -c - >/dev/null) || { echo "Node archive checksum mismatch"; rm -rf "$NW"; exit 1; }
  case "$NODE_FILE" in
    *.tar.gz) tar -xzf "$NW/$NODE_FILE" -C "$NW" "$NODE_MEMBER" ;;
    *.tar.xz) tar -xJf "$NW/$NODE_FILE" -C "$NW" "$NODE_MEMBER" ;;
    *.zip)    unzip -qo "$NW/$NODE_FILE" "$NODE_MEMBER" -d "$NW" ;;
  esac
  mkdir -p "$OUT/runtime"; cp "$NW/$NODE_MEMBER" "$OUT/runtime/$NODE_DEST"; chmod 755 "$OUT/runtime/$NODE_DEST"; rm -rf "$NW"
  echo "Node $NODE_VERSION sidecar added ($PLATFORM-$ARCH)"
else
  echo "no Node sidecar for $PLATFORM-$ARCH: plugin install will not work there"
fi
du -sk "$OUT" | awk '{printf "payload %.1f MB\n", $1/1024}'
