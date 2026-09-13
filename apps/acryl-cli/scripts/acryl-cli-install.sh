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
#   - adds that directory to the user's shell PATH automatically
#     (opt out with ACRYL_NO_PATH_MODIFY=1)
#   - never requires sudo, never installs the GUI, never starts Web
#   - reports PATH and unsupported-platform issues clearly
#
# Overridable env: ACRYL_VERSION (default latest), ACRYL_INSTALL_DIR
# (default $HOME/.acryl/bin), ACRYL_BASE_URL (default GitHub release URL),
# ACRYL_NO_PATH_MODIFY (default unset; set to 1 to skip shell PATH edits).
set -eu

REPO="acryldev/acryl"
BASE_URL="${ACRYL_BASE_URL:-https://github.com/${REPO}/releases/download}"
VERSION="${ACRYL_VERSION:-latest}"
INSTALL_BIN="${ACRYL_INSTALL_DIR:-$HOME/.acryl/bin}"

say() { printf 'acryl-install: %s\n' "$*"; }
die() { printf 'acryl-install: error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required to install ACRYL"
command -v tar >/dev/null 2>&1 || die "tar is required to install ACRYL"

# --- shell PATH setup --------------------------------------------------
# Append INSTALL_BIN to the user's shell rc so `acryl` is on PATH in new
# shells. Idempotent (marker-guarded). Set ACRYL_NO_PATH_MODIFY=1 to skip.

PATH_MARKER_BEGIN='# >>> ACRYL CLI install >>>'
PATH_MARKER_END='# <<< ACRYL CLI install <<<'

add_path_to_shell() {
  if [ "${ACRYL_NO_PATH_MODIFY:-0}" = "1" ]; then
    say "PATH setup skipped (ACRYL_NO_PATH_MODIFY=1)"
    return 0
  fi

  # Pick the shell rc to modify: prefer the login shell's native file, then
  # fall back to common alternatives. The first existing+writable (or
  # creatable) candidate wins.
  case "$(basename "${SHELL:-/bin/sh}" 2>/dev/null)" in
    zsh)  set -- "$HOME/.zshrc" "$HOME/.profile" ;;
    fish) set -- "$HOME/.config/fish/config.fish" ;;
    bash) set -- "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile" ;;
    *)    set -- "$HOME/.profile" "$HOME/.bashrc" ;;
  esac

  rc=""
  for candidate do
    parent="$(dirname "$candidate")"
    [ -d "$parent" ] || mkdir -p "$parent" 2>/dev/null || continue
    if [ -f "$candidate" ] && [ -w "$candidate" ]; then
      rc="$candidate"; break
    elif [ ! -e "$candidate" ] && [ -w "$parent" ]; then
      rc="$candidate"; break
    fi
  done

  if [ -z "$rc" ]; then
    say "no writable shell rc found; add ${INSTALL_BIN} to your PATH manually"
    return 0
  fi

  # Idempotency: skip if we already added the marker, or if the install dir
  # is already referenced by the file.
  if [ -f "$rc" ] && grep -qF "$PATH_MARKER_BEGIN" "$rc" 2>/dev/null; then
    say "${INSTALL_BIN} is already on PATH via ${rc}"
    return 0
  fi
  if [ -f "$rc" ] && grep -qF "${INSTALL_BIN}" "$rc" 2>/dev/null; then
    say "${INSTALL_BIN} is already referenced in ${rc}; leaving it as-is"
    return 0
  fi

  case "$rc" in
    *config.fish) path_line="fish_add_path \"${INSTALL_BIN}\"" ;;
    *)            path_line="export PATH=\"${INSTALL_BIN}:\$PATH\"" ;;
  esac

  {
    printf '\n%s\n%s\n%s\n' "$PATH_MARKER_BEGIN" "$path_line" "$PATH_MARKER_END"
  } >> "$rc"
  say "added ${INSTALL_BIN} to PATH in ${rc}"
}

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

# Wire the install dir into the user's shell profile for future shells.
add_path_to_shell

# --- report -----------------------------------------------------------
say "ACRYL CLI v${VERSION} installed at ${INSTALL_BIN}/acryl"

# The shell-rc edit above covers future shells. This branch only covers the
# CURRENT shell, which still holds an old PATH snapshot.
if [ "$(command -v acryl 2>/dev/null || true)" = "$INSTALL_BIN/acryl" ] ||
   printf '%s' "$PATH" | grep -q ":$INSTALL_BIN:" || [ "$PATH" = "$INSTALL_BIN" ]; then
  say "acryl is on your current PATH; run: acryl"
else
  say "open a new terminal and run 'acryl', or add it now with:"
  say "  export PATH=\"${INSTALL_BIN}:\$PATH\""
fi
