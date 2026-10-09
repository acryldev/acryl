#!/usr/bin/env bash
#
# ACRYL - terminal CLI installer (macOS Apple silicon, Linux x64 and arm64).
#
#   curl -fsSL https://acryl.dev/install | bash
#
# Downloads the matching acryl-cli-<target> archive from the latest GitHub release, checks its SHA-256 against the release manifest, installs it
# under ~/.acryl, makes sure a Node >= 22.19 is available (installing one under ~/.acryl when there is none), and puts `acryl` on your PATH.
# It never uses sudo, never installs the desktop app and never starts a server. Windows uses `npm install -g acryl` or the desktop installer.
#
# Environment: ACRYL_VERSION (default latest, e.g. 0.2.2), ACRYL_INSTALL_DIR (default ~/.acryl), ACRYL_NO_PATH_MODIFY=1 (leave shell files alone),
# ACRYL_SKIP_VERIFY=1 (install without checking the SHA-256; only for a release that has no manifest).
set -euo pipefail

ACRYL_REPO="acryldev/acryl"
ACRYL_VERSION="${ACRYL_VERSION:-latest}"
INSTALL_DIR="${ACRYL_INSTALL_DIR:-$HOME/.acryl}"
BIN_DIR="$INSTALL_DIR/bin"
NODE_MIN="22.19.0"
NODE_VERSION="24.19.0"

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"

# --- detect platform / arch -------------------------------------------------
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux)  os=linux ;;
  *)      fail "unsupported OS: $(uname -s) (Windows: npm install -g acryl, or the desktop installer from https://github.com/$ACRYL_REPO/releases/latest)" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64)  arch=x64 ;;
  *)             fail "unsupported architecture: $(uname -m)" ;;
esac
# A Rosetta-translated shell (an Intel Homebrew bash on an Apple silicon Mac) reports x86_64; the hardware is what decides.
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then arch=arm64; fi
target="$os-$arch"
if [ "$target" = darwin-x64 ]; then
  fail "the terminal build is not available for Intel Macs. Use the desktop app: https://github.com/$ACRYL_REPO/releases/latest (acryl-desktop-mac-x64-v<version>.dmg)"
fi

# --- resolve the release tag -------------------------------------------------
resolve_tag() {
  if [ "$ACRYL_VERSION" = "latest" ]; then
    # The redirect of /releases/latest names the tag without the API, so there is no rate limit to hit.
    curl -fsSIL -o /dev/null -w '%{url_effective}' "https://github.com/$ACRYL_REPO/releases/latest" | sed 's#.*/tag/##'
  else
    echo "v${ACRYL_VERSION#v}"
  fi
}
TAG="$(resolve_tag)"
case "$TAG" in v[0-9]*.[0-9]*.[0-9]*) ;; *) fail "could not determine the ACRYL release (got '$TAG')" ;; esac
VERSION="${TAG#v}"
ARCHIVE="acryl-cli-$target.tar.gz"
RELEASE_URL="https://github.com/$ACRYL_REPO/releases/download/$TAG"

say "ACRYL $VERSION ($target)"

# --- ensure host Node --------------------------------------------------------
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local have; have="$(node -v | sed 's/^v//')"
  [ "$(printf '%s\n%s\n' "$NODE_MIN" "$have" | sort -V | head -n 1)" = "$NODE_MIN" ]
}
mkdir -p "$BIN_DIR"
if node_ok; then
  say "using host Node $(node -v)"
else
  say "no Node >= $NODE_MIN found; installing Node $NODE_VERSION into $INSTALL_DIR/node"
  nd="node-v$NODE_VERSION-$os-$arch"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$nd.tar.gz" -o "$INSTALL_DIR/$nd.tar.gz"
  tar -xzf "$INSTALL_DIR/$nd.tar.gz" -C "$INSTALL_DIR"
  rm -f "$INSTALL_DIR/$nd.tar.gz"
  ln -sf "$INSTALL_DIR/$nd/bin/node" "$BIN_DIR/node"
  export PATH="$BIN_DIR:$PATH"
  say "installed Node $(node -v)"
fi

# --- download and verify the CLI archive ------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
say "downloading $ARCHIVE from $TAG"
curl -fsSL "$RELEASE_URL/$ARCHIVE" -o "$TMP/$ARCHIVE" || fail "download failed: $RELEASE_URL/$ARCHIVE"

if [ "${ACRYL_SKIP_VERIFY:-0}" = 1 ]; then
  say "skipping the SHA-256 check (ACRYL_SKIP_VERIFY=1)"
else
  curl -fsSL "$RELEASE_URL/acryl-release-manifest.json" -o "$TMP/manifest.json" \
    || fail "the release manifest is missing, so the download cannot be verified (set ACRYL_SKIP_VERIFY=1 to install anyway)"
  node -e '
    const fs = require("node:fs"), crypto = require("node:crypto")
    const [manifestPath, archivePath, target] = process.argv.slice(1)
    const entry = JSON.parse(fs.readFileSync(manifestPath, "utf8")).artifacts.find(a => a.surface === "cli" && a.target === target)
    if (!entry) { console.error("error: the release manifest has no cli/" + target + " entry"); process.exit(2) }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex")
    if (actual !== entry.integrity.value) { console.error("error: SHA-256 mismatch (expected " + entry.integrity.value + ", got " + actual + "); refusing to install"); process.exit(1) }
  ' "$TMP/manifest.json" "$TMP/$ARCHIVE" "$target"
  say "SHA-256 verified"
fi

# --- install (user-owned, no sudo) ------------------------------------------
tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
CLI_ROOT="$INSTALL_DIR/acryl-cli-$target"
rm -rf "$CLI_ROOT"
mv "$TMP/acryl-cli-$target" "$CLI_ROOT"
ln -sf "$CLI_ROOT/bin/acryl" "$BIN_DIR/acryl"
chmod +x "$CLI_ROOT/bin/acryl"

# --- PATH, once --------------------------------------------------------------
MARK_BEGIN='# >>> ACRYL CLI >>>'
MARK_END='# <<< ACRYL CLI <<<'
add_path() {
  [ "${ACRYL_NO_PATH_MODIFY:-0}" = 1 ] && { say "leaving shell files alone (ACRYL_NO_PATH_MODIFY=1)"; return 0; }
  local rc line
  case "$(basename "${SHELL:-/bin/sh}")" in
    zsh)  rc="$HOME/.zshrc";  line="export PATH=\"$BIN_DIR:\$PATH\"" ;;
    bash) rc="$HOME/.bashrc"; line="export PATH=\"$BIN_DIR:\$PATH\""; [ "$os" = darwin ] && rc="$HOME/.bash_profile" ;;
    fish) rc="$HOME/.config/fish/config.fish"; line="fish_add_path \"$BIN_DIR\"" ;;
    *)    say "add $BIN_DIR to your PATH to run 'acryl'"; return 0 ;;
  esac
  mkdir -p "$(dirname "$rc")"
  if [ -f "$rc" ] && grep -qF "$MARK_BEGIN" "$rc"; then say "$BIN_DIR is already on your PATH through $rc"; return 0; fi
  printf '\n%s\n%s\n%s\n' "$MARK_BEGIN" "$line" "$MARK_END" >> "$rc"
  say "added $BIN_DIR to your PATH in $rc"
}
add_path

say "installed ACRYL $VERSION to $CLI_ROOT"
if "$BIN_DIR/acryl" --version >/dev/null 2>&1; then
  say "'acryl --version' answers $("$BIN_DIR/acryl" --version 2>&1 | head -n 1); open a new terminal and run 'acryl'"
else
  say "installed, but 'acryl --version' did not answer; run '$BIN_DIR/acryl --version' to see why"
fi
