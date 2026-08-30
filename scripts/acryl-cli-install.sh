#!/bin/sh
# ACRYL CLI installer — installs ONLY the terminal CLI, never the desktop GUI
# and never starts a web server.
#
# Design seam for:  curl -fsSL https://acryl.dev/install | bash
# The script is hosted externally at acryl.dev; this file is the tested
# implementation it serves. It defaults to the GitHub Release archives, which
# become live once a release with acryl-cli-* assets + checksums.txt is cut.
#
# Behavior:
#   - selects a versioned OS/arch archive (darwin/linux x arm64/x64)
#   - verifies the SHA-256 against the release checksums.txt
#   - installs into a user-owned directory (default ~/.acryl/bin)
#   - never requires sudo, never installs the GUI, never starts Web
#   - reports PATH and unsupported-platform issues clearly
#
# Overridable env: ACRYL_VERSION (default latest), ACRYL_INSTALL_DIR
# (default $HOME/.acryl/bin), ACRYL_BASE_URL (default GitHub release URL).
set -eu

REPO="acryldev/acryl"
BASE_URL="${ACRYL_BASE_URL:-https://github.com/${REPO}/releases/download}"
VERSION="${ACRYL_VERSION:-latest}"
INSTALL_BIN="${ACRYL_INSTALL_DIR:-$HOME/.acryl/bin}"

say() { printf 'acryl-install: %s\n' "$*"; }
die() { printf 'acryl-install: error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required to install ACRYL"
command -v tar >/dev/null 2>&1 || die "tar is required to install ACRYL"

# --- OS/arch detection ------------------------------------------------
os="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)"
arch="$(uname -m 2>/dev/null || true)"
case "$os" in
  darwin) ;;
  linux) ;;
  *) die "unsupported operating system '${os:-unknown}'; supported: darwin, linux" ;;
esac
case "$arch" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64 | amd64) arch="x64" ;;
  *) die "unsupported architecture '${arch:-unknown}'; supported: arm64, x64" ;;
esac

# --- version resolution ----------------------------------------------
if [ "$VERSION" = "latest" ]; then
  latest_tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
    | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 \
    | sed 's/.*"v\([^"]*\)".*/\1/' || true)"
  [ -n "${latest_tag:-}" ] || die "could not determine the latest ACRYL release"
  VERSION="$latest_tag"
fi
case "$VERSION" in
  v*) VERSION="${VERSION#v}" ;;
esac
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) die "invalid ACRYL version '$VERSION'" ;;
esac

archive="acryl-cli-${os}-${arch}.tar.gz"
url="${BASE_URL}/v${VERSION}/${archive}"
checksum_url="${BASE_URL}/v${VERSION}/checksums.txt"

# --- download + verify ------------------------------------------------
tmp="$(mktemp -d "${TMPDIR:-/tmp}/acryl-install.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

say "downloading ${archive} (v${VERSION}) from ${BASE_URL}/v${VERSION}"
curl -fsSL -o "$tmp/${archive}" "$url" || die "download failed: ${url}"
curl -fsSL -o "$tmp/checksums.txt" "$checksum_url" || die "checksums.txt not found at ${checksum_url}"

if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$tmp/${archive}" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/${archive}" | awk '{print $1}')"
else
  die "neither shasum nor sha256sum is available to verify the archive"
fi
expected="$(awk -v f="$archive" '$2 == f { print $1 }' "$tmp/checksums.txt" | head -n 1)"
[ -n "${expected:-}" ] || die "no checksum entry found for ${archive} in checksums.txt"
[ "$actual" = "$expected" ] || die "SHA-256 mismatch for ${archive} (expected ${expected}, got ${actual}); refusing to install"

# --- install (user-owned, no sudo) ------------------------------------
parent="$(CDPATH= cd -- "$(dirname -- "$INSTALL_BIN")" 2>/dev/null && pwd -P || printf '%s' "$HOME/.acryl")"
mkdir -p "$parent" "$INSTALL_BIN"
[ -w "$parent" ] || die "install directory $parent is not writable; pick a user-owned ACRYL_INSTALL_DIR"
[ -w "$INSTALL_BIN" ] || die "install directory $INSTALL_BIN is not writable; pick a user-owned ACRYL_INSTALL_DIR"

dir_name="acryl-cli-${os}-${arch}"
tar -xzf "$tmp/${archive}" -C "$tmp"
rm -rf "$parent/${dir_name}"
mv "$tmp/${dir_name}" "$parent/"
ln -sfn "$parent/${dir_name}/bin/acryl" "$INSTALL_BIN/acryl"
chmod +x "$parent/${dir_name}/bin/acryl" "$parent/${dir_name}/bin/node"

# --- report -----------------------------------------------------------
if [ "$(command -v acryl 2>/dev/null || true)" = "$INSTALL_BIN/acryl" ] ||
   printf '%s' "$PATH" | grep -q ":$INSTALL_BIN:" || [ "$PATH" = "$INSTALL_BIN" ]; then
  say "ACRYL CLI v${VERSION} installed at ${INSTALL_BIN}/acryl"
else
  say "ACRYL CLI v${VERSION} installed at ${INSTALL_BIN}/acryl"
  say "NOTE: ${INSTALL_BIN} is not on your PATH."
  say "      Add it with:  export PATH=\"${INSTALL_BIN}:\$PATH\""
fi
