#!/bin/bash
# build-mac.sh <payloadDir> <outDir> [version]  ->  <outDir>/AcrylDeno.app and <outDir>/AcrylDeno-<version>-arm64.dmg (ad-hoc signed; for local testing, not notarized)
set -euo pipefail
PAYLOAD=$1; OUT=$2
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../.." && pwd)
VERSION=${3:-$(node -p "require('$HERE/../../../apps/acryl-desktop/package.json').version")}   # default: the ACRYL desktop package version (the pinned Harness version is a different number)
mkdir -p "$OUT"; APP="$OUT/AcrylDeno.app"; rm -rf "$APP" "$OUT/AcrylDeno.app.app"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
# icon: the repo's own 1024 px mac icon -> .icns
mkdir "$W/i.iconset"; SRC="$REPO/apps/acryl-desktop/build/app-icon-mac.png"
for s in 16 32 128 256 512; do sips -z $s $s "$SRC" --out "$W/i.iconset/icon_${s}x${s}.png" >/dev/null; sips -z $((s*2)) $((s*2)) "$SRC" --out "$W/i.iconset/icon_${s}x${s}@2x.png" >/dev/null; done
iconutil -c icns "$W/i.iconset" -o "$W/AcrylDeno.icns"
(cd "$HERE" && deno desktop -A --no-check --icon "$W/AcrylDeno.icns" -o "$APP" main.ts 2>&1 | grep -iE "error|warn" || true)
[ -d "$APP" ] || APP="$APP.app"; [ -d "$APP" ] || { echo "deno desktop produced no .app"; exit 1; }
[ "$APP" = "$OUT/AcrylDeno.app" ] || { mv "$APP" "$OUT/AcrylDeno.app"; APP="$OUT/AcrylDeno.app"; }
P="$APP/Contents/Info.plist"
for k in CFBundleName CFBundleDisplayName; do /usr/libexec/PlistBuddy -c "Set :$k AcrylDeno" "$P" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$k string AcrylDeno" "$P"; done
for k in CFBundleShortVersionString CFBundleVersion; do /usr/libexec/PlistBuddy -c "Set :$k $VERSION" "$P" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$k string $VERSION" "$P"; done
mkdir -p "$APP/Contents/Resources"; cp -Rc "$PAYLOAD" "$APP/Contents/Resources/payload"
codesign --force --deep -s - "$APP" >/dev/null 2>&1; codesign --verify --deep --strict "$APP"
# DMG: the app and an Applications shortcut
S="$W/dmg"; mkdir "$S"; ditto --noextattr --norsrc --noqtn "$APP" "$S/AcrylDeno.app"; ln -s /Applications "$S/Applications"
DMG="$OUT/AcrylDeno-$VERSION-arm64.dmg"; rm -f "$DMG"
hdiutil create -quiet -srcfolder "$S" -format UDZO -imagekey zlib-level=9 -volname AcrylDeno "$DMG"
echo "app: $APP"; echo "dmg: $DMG ($(du -h "$DMG" | cut -f1))"
