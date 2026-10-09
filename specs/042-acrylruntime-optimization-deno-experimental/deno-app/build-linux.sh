#!/bin/bash
# build-linux.sh <payloadDir> <outDir> [version]  ->  <outDir>/AcrylDeno_<version>_amd64.deb   (x86_64, Debian/Ubuntu with webkit2gtk-4.1 and gtk3)
# The app is cross-built from any host (`deno desktop --target x86_64-unknown-linux-gnu`), laid out under /opt/AcrylDeno with a /usr/bin/acryldeno link,
# a menu entry and an icon, and packed with dpkg-deb inside a Debian container (macOS has no dpkg-deb). Needs a running Docker.
set -euo pipefail
PAYLOAD=$1; OUT=$2
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../.." && pwd)
VERSION=${3:-$(node -p "require('$HERE/../../../apps/acryl-desktop/package.json').version")}   # default: the ACRYL desktop package version (the pinned Harness version is a different number)
mkdir -p "$OUT"; W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
(cd "$HERE" && deno desktop -A --no-check --target x86_64-unknown-linux-gnu -o "$W/bundle/acryldeno" main.ts 2>&1 | grep -iE "error" || true)
B=$W/bundle/acryldeno; [ -d "$B" ] || { echo "deno desktop produced no bundle at $B"; ls "$W/bundle" 2>&1; exit 1; }
ls "$B" >/dev/null
R=$W/root; mkdir -p "$R/opt/AcrylDeno" "$R/usr/bin" "$R/usr/share/applications" "$R/usr/share/icons/hicolor/512x512/apps" "$R/DEBIAN"
EXE=$(cd "$B" && ls | grep -v '\.' | head -1); SO=$(cd "$B" && ls | grep '\.so$' | head -1)
[ -n "$EXE" ] && [ -n "$SO" ] || { echo "bundle lacks an executable or a .so:"; ls "$B"; exit 1; }
cp "$B/$EXE" "$R/opt/AcrylDeno/acryldeno"; cp "$B/$SO" "$R/opt/AcrylDeno/$SO"; [ -f "$B/.deno-desktop-app" ] && cp "$B/.deno-desktop-app" "$R/opt/AcrylDeno/"
chmod 755 "$R/opt/AcrylDeno/acryldeno"; chmod 644 "$R/opt/AcrylDeno/$SO"
cp -Rc "$PAYLOAD" "$R/opt/AcrylDeno/payload"
ln -s /opt/AcrylDeno/acryldeno "$R/usr/bin/acryldeno"
sips -z 512 512 "$REPO/apps/acryl-desktop/build/app-icon.png" --out "$R/usr/share/icons/hicolor/512x512/apps/acryldeno.png" >/dev/null
cat > "$R/usr/share/applications/acryldeno.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=AcrylDeno
Comment=ACRYL running on Deno (experimental build)
Exec=/opt/AcrylDeno/acryldeno
Icon=acryldeno
Terminal=false
Categories=Development;
StartupWMClass=acryldeno
DESK
SIZE=$(du -sk "$R/opt" | awk '{print $1}')
cat > "$R/DEBIAN/control" <<CTRL
Package: acryldeno
Version: $VERSION
Section: devel
Priority: optional
Architecture: amd64
Depends: libwebkit2gtk-4.1-0, libgtk-3-0, util-linux
Installed-Size: $SIZE
Maintainer: ACRYL experiments <noreply@invalid>
Description: AcrylDeno - ACRYL running on Deno (experimental)
 The ACRYL web host and client in a deno desktop window instead of Electron.
 Keeps its data in ~/.acryldeno and does not touch an installed ACRYL.
CTRL
chmod 755 "$R/DEBIAN"
DEB="AcrylDeno_${VERSION}_amd64.deb"; rm -f "$OUT/$DEB"
docker run --rm -v "$W:/w" -v "$OUT:/out" debian:stable-slim sh -c "dpkg-deb --root-owner-group -Zxz -z5 --build /w/root /out/$DEB && dpkg-deb -I /out/$DEB | head -14 && dpkg-deb -c /out/$DEB | awk '{print \$1, \$2, \$3, \$6}' | grep -E 'opt/AcrylDeno/(acryldeno|[a-z0-9_.]*\\.so)\$|usr/bin|\\.desktop' "
echo "deb: $OUT/$DEB ($(du -h "$OUT/$DEB" | cut -f1))"
