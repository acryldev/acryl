#!/bin/bash
# Regenerates build/app-icon-mac.icns and build/app-icon.ico from the 1024 px master PNGs (build/app-icon-mac.png, build/app-icon.png). macOS only: needs ImageMagick
# (`magick`) and `iconutil`. electron-builder's own PNG-to-icns/ico conversion writes noise for the 16 px and 32 px sizes (what Finder, the Dock's small views, Explorer
# and the installer show), so the real files are committed and `build.mac.icon` / `build.win.icon` point at them; the builder passes finished .icns/.ico files through.
set -euo pipefail
cd "$(dirname "$0")/../build"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
set=$tmp/app-icon.iconset
mkdir "$set"
resize() { magick app-icon-mac.png -filter Lanczos -resize "${1}x${1}" -depth 8 "PNG32:$2"; }
resize 16 "$set/icon_16x16.png";     resize 32 "$set/icon_16x16@2x.png"
resize 32 "$set/icon_32x32.png";     resize 64 "$set/icon_32x32@2x.png"
resize 128 "$set/icon_128x128.png";  resize 256 "$set/icon_128x128@2x.png"
resize 256 "$set/icon_256x256.png";  resize 512 "$set/icon_256x256@2x.png"
resize 512 "$set/icon_512x512.png";  resize 1024 "$set/icon_512x512@2x.png"
iconutil -c icns "$set" -o app-icon-mac.icns
magick app-icon.png -depth 8 -define icon:auto-resize=256,128,64,48,32,24,16 app-icon.ico
echo "wrote build/app-icon-mac.icns and build/app-icon.ico"
