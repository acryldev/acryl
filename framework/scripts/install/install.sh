#!/bin/sh
# Install ACRYL Blends on macOS (Apple Silicon) or Linux (x86_64): download the app from a release, check its checksum, put it in place, start it.
#
#   curl -fsSL <release>/install.sh | sh
#
# Nothing needs an administrator, git, Node or npm: the app carries its own. Files the download leaves behind are removed. The app itself is never modified
# after this: what you make lives in the OS data folder (macOS ~/Library/Application Support/ACRYL Blends, Linux ~/.local/share/ACRYL Blends).
#
# Settings (environment): ACRYL_BLENDS_BASE_URL  where the release's files are (default: the script's own release);
#                         ACRYL_BLENDS_PREFIX    the folder the app goes into (macOS ~/Applications, or /Applications when it is writable; Linux ~/.local/share/acryl-blends);
#                         ACRYL_BLENDS_NO_LAUNCH=1  install and do not start.
set -eu

BASE="${ACRYL_BLENDS_BASE_URL:-https://github.com/acryldev/acryl-blends/releases/latest/download}"
say() { printf '%s\n' "acryl-blends: $*"; }
die() { printf '%s\n' "acryl-blends: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "this needs '$1', which this computer does not have"; }

need curl
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  Darwin-arm64) ASSET="ACRYL-Blends-arm64.dmg" ;;
  Linux-x86_64) ASSET="acryl-blends-linux-x64.tar.gz" ;;
  Darwin-x86_64) die "an Intel Mac has no build yet; use a browser-only workspace or ask the host" ;;
  *) die "no build for $OS $ARCH (macOS Apple Silicon, Linux x86_64 and Windows are built)" ;;
esac

WORK="$(mktemp -d "${TMPDIR:-/tmp}/acryl-blends.XXXXXX")"
MOUNT=""
cleanup() {
  [ -z "$MOUNT" ] || hdiutil detach "$MOUNT" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

say "downloading $ASSET"
curl -fL --progress-bar -o "$WORK/$ASSET" "$BASE/$ASSET" || die "could not download $BASE/$ASSET"
curl -fsSL -o "$WORK/SHA256SUMS" "$BASE/SHA256SUMS" || die "could not download $BASE/SHA256SUMS"

WANT="$(grep " $ASSET\$" "$WORK/SHA256SUMS" | cut -d' ' -f1 || true)"
[ -n "$WANT" ] || die "SHA256SUMS has no line for $ASSET"
if command -v shasum >/dev/null 2>&1; then GOT="$(shasum -a 256 "$WORK/$ASSET" | cut -d' ' -f1)"; else GOT="$(sha256sum "$WORK/$ASSET" | cut -d' ' -f1)"; fi
[ "$WANT" = "$GOT" ] || die "the download is not the release's file (checksum $GOT, expected $WANT); nothing was installed"
say "checksum ok"

if [ "$OS" = Darwin ]; then
  need hdiutil
  PREFIX="${ACRYL_BLENDS_PREFIX:-}"
  if [ -z "$PREFIX" ]; then
    if [ -w /Applications ]; then PREFIX=/Applications; else PREFIX="$HOME/Applications"; fi
  fi
  mkdir -p "$PREFIX"
  MOUNT="$WORK/mount"
  mkdir -p "$MOUNT"
  hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$WORK/$ASSET" >/dev/null || die "could not open the disk image"
  APP="$PREFIX/ACRYL Blends.app"
  if [ -e "$APP" ]; then
    say "replacing the app that is installed (your apps and data are in the data folder and stay)"
    rm -rf "$APP"
  fi
  cp -R "$MOUNT/ACRYL Blends.app" "$APP"
  say "installed $APP"
  [ "${ACRYL_BLENDS_NO_LAUNCH:-}" = 1 ] || open "$APP"
else
  PREFIX="${ACRYL_BLENDS_PREFIX:-$HOME/.local/share/acryl-blends}"
  need tar
  rm -rf "$PREFIX"
  mkdir -p "$PREFIX"
  tar -xzf "$WORK/$ASSET" -C "$PREFIX" --strip-components=1
  chmod +x "$PREFIX/acryl-blends"
  BIN="$HOME/.local/bin"
  APPS="$HOME/.local/share/applications"
  mkdir -p "$BIN" "$APPS"
  # Chromium's sandbox needs a setuid helper that a user install cannot have; the app runs its own pages only.
  printf '#!/bin/sh\nexec "%s/acryl-blends" --no-sandbox "$@"\n' "$PREFIX" > "$BIN/acryl-blends"
  chmod +x "$BIN/acryl-blends"
  printf '[Desktop Entry]\nType=Application\nName=ACRYL Blends\nExec="%s/acryl-blends" --no-sandbox %%U\nCategories=Development;\nTerminal=false\n' "$PREFIX" > "$APPS/acryl-blends.desktop"
  say "installed $PREFIX (start it from the applications menu, or run: acryl-blends)"
  [ "${ACRYL_BLENDS_NO_LAUNCH:-}" = 1 ] || { [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && (setsid "$BIN/acryl-blends" >/dev/null 2>&1 &) || say "no display here: start it from your desktop"; }
fi
say "done"
