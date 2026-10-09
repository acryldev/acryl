#!/bin/bash
# build-windows.sh <payloadDir> <outDir> [version]  ->  <outDir>/AcrylDeno-<version>-win-x64.zip   (Windows 10/11 x64 with the WebView2 runtime)
# The app is cross-built from any host (`deno desktop --target x86_64-pc-windows-msvc`): acryldeno.exe + acryldeno.dll, with the payload (make-payload.sh win32 x64)
# beside them. A zip, not an installer: unzip anywhere and run acryldeno.exe. Not code-signed, so SmartScreen will warn. Needs zip.
set -euo pipefail
PAYLOAD=$1; OUT=$2
HERE=$(cd "$(dirname "$0")" && pwd)
VERSION=${3:-$(node -p "require('$HERE/../../../apps/acryl-desktop/package.json').version")}   # default: the ACRYL desktop package version (the pinned Harness version is a different number)
mkdir -p "$OUT"; W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
(cd "$HERE" && deno desktop -A --no-check --target x86_64-pc-windows-msvc -o "$W/bundle/acryldeno" main.ts 2>&1 | grep -iE "error" || true)
B=$W/bundle/acryldeno; [ -d "$B" ] || { echo "deno desktop produced no bundle at $B"; ls "$W/bundle" 2>&1; exit 1; }
[ -f "$B/acryldeno.exe" ] && [ -f "$B/acryldeno.dll" ] || { echo "bundle lacks acryldeno.exe or acryldeno.dll:"; ls "$B"; exit 1; }
R=$W/AcrylDeno; mkdir -p "$R"
cp "$B"/* "$R"/ 2>/dev/null || true; [ -f "$B/.deno-desktop-app" ] && cp "$B/.deno-desktop-app" "$R/"
cp -R "$PAYLOAD" "$R/payload"
ZIP="AcrylDeno-${VERSION}-win-x64.zip"; rm -f "$OUT/$ZIP"
(cd "$W" && zip -qr -9 "$OUT/$ZIP" AcrylDeno)
echo "zip: $OUT/$ZIP ($(du -h "$OUT/$ZIP" | cut -f1)); unzipped $(du -sh "$R" | cut -f1)"
