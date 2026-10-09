#!/bin/bash
# Regenerates build/dmg/background.tiff (the install window of the macOS DMG) from the text below. macOS only: needs ImageMagick (`magick`) and `tiffutil`.
# The window is 660x500 points; the tiff carries a 1x and a 2x (Retina) image. Icon positions are set in apps/acryl-desktop/package.json (build.dmg.contents).
set -euo pipefail
cd "$(dirname "$0")/../build/dmg"
FONT=Helvetica
FONT_BOLD=Helvetica-Bold

draw() { # $1 = scale
  local s=$1
  local w=$((660*s)) h=$((500*s))
  magick -size "${w}x${h}" gradient:'#1b1e27-#10121a' \
    -font "$FONT_BOLD" -fill '#ffffff' -pointsize $((26*s)) -gravity north -annotate +0+$((26*s)) 'Install ACRYL' \
    -font "$FONT" -fill '#9aa3b5' -pointsize $((14*s)) -gravity north -annotate +0+$((64*s)) 'Drag ACRYL onto Applications' \
    -stroke '#5b8cff' -strokewidth $((3*s)) -fill none \
    -draw "line $((255*s)),$((150*s)) $((395*s)),$((150*s))" \
    -draw "polyline $((380*s)),$((136*s)) $((396*s)),$((150*s)) $((380*s)),$((164*s))" \
    +stroke \
    -stroke '#2a2f3d' -strokewidth $((1*s)) -draw "line $((60*s)),$((244*s)) $((600*s)),$((244*s))" +stroke \
    -font "$FONT_BOLD" -fill '#e8ecf5' -pointsize $((14*s)) -gravity north -annotate +0+$((258*s)) 'macOS says ACRYL is "damaged" or from an unidentified developer?' \
    -font "$FONT" -fill '#9aa3b5' -pointsize $((12*s)) -gravity north \
    -annotate +0+$((284*s)) 'ACRYL is not signed with an Apple Developer ID yet. Double-click "Open ACRYL" below:' \
    -annotate +0+$((304*s)) 'it only removes the download warning flag from ACRYL, and opens it.' \
    -annotate +0+$((330*s)) 'To read the script first: right-click it, Open With, TextEdit.' \
    "bg-${s}x.png"
}

draw 1
draw 2
tiffutil -cathidpicheck bg-1x.png bg-2x.png -out background.tiff
rm -f bg-1x.png bg-2x.png
echo "wrote build/dmg/background.tiff"
