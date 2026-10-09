#!/bin/bash
# Regenerates build/dmg/background.tiff (the install window of the macOS DMG) from the text below. macOS only: needs ImageMagick (`magick`) and `tiffutil`.
# The image is 660x400 points with a 1x and a 2x (Retina) image. It is light on purpose: Finder draws the icon names in black. Icon positions are set in
# apps/acryl-desktop/package.json (build.dmg.contents): ACRYL (130,105), Applications (350,105), README.txt (560,105).
set -euo pipefail
cd "$(dirname "$0")/../build/dmg"
FONT=Helvetica
FONT_BOLD=Helvetica-Bold
INK='#1b1e27'
MUTED='#4a5163'

draw() { # $1 = scale
  local s=$1
  local w=$((660*s)) h=$((400*s))
  magick -size "${w}x${h}" gradient:'#fbfcfe-#eef1f7' \
    -font "$FONT_BOLD" -fill "$INK" -pointsize $((24*s)) -gravity north -annotate +0+$((22*s)) 'Install ACRYL' \
    -stroke '#3b6df0' -strokewidth $((3*s)) -fill none \
    -draw "line $((200*s)),$((105*s)) $((285*s)),$((105*s))" \
    -draw "polyline $((271*s)),$((92*s)) $((286*s)),$((105*s)) $((271*s)),$((118*s))" \
    +stroke \
    -stroke '#d5dae6' -strokewidth $((1*s)) -draw "line $((50*s)),$((205*s)) $((610*s)),$((205*s))" +stroke \
    -font "$FONT_BOLD" -fill "$INK" -pointsize $((15*s)) -gravity northwest -annotate +$((50*s))+$((220*s)) 'First launch: macOS says it cannot verify ACRYL' \
    -font "$FONT" -fill "$MUTED" -pointsize $((13*s)) \
    -annotate +$((50*s))+$((246*s)) 'We have not signed ACRYL with an Apple Developer ID yet, so macOS asks you to confirm it once.' \
    -font "$FONT_BOLD" -fill "$INK" \
    -annotate +$((50*s))+$((276*s)) '1.' -annotate +$((50*s))+$((298*s)) '2.' -annotate +$((50*s))+$((320*s)) '3.' \
    -font "$FONT" -fill "$INK" \
    -annotate +$((70*s))+$((276*s)) 'Open ACRYL from Applications. macOS blocks it: click Done.' \
    -annotate +$((70*s))+$((298*s)) 'Open System Settings > Privacy & Security and scroll down. Click Open Anyway next to ACRYL.' \
    -annotate +$((70*s))+$((320*s)) 'Enter your password. ACRYL then opens normally every time.' \
    -fill "$MUTED" -pointsize $((12*s)) \
    -annotate +$((50*s))+$((356*s)) 'Prefer Terminal, or stuck? README.txt has the steps, and a one-line command.' \
    "bg-${s}x.png"
}

draw 1
draw 2
tiffutil -cathidpicheck bg-1x.png bg-2x.png -out background.tiff
rm -f bg-1x.png bg-2x.png
echo "wrote build/dmg/background.tiff"
