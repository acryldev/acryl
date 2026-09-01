#!/usr/bin/env bash
#
# ACRYL - minimal CLI installer (host-Node).
#
#   curl -fsSL https://acryl.dev/install | bash
#
# Downloads the matching acryl-cli-<target> archive from the latest GitHub
# release, installs it under ~/.acryl/<version>, ensures a host Node (>=22.19),
# and puts `acryl` on your PATH. Override the version with ACRYL_VERSION.
set -euo pipefail

ACRYL_REPO="acryldev/acryl"
ACRYL_VERSION="${ACRYL_VERSION:-latest}"
INSTALL_DIR="${ACRYL_INSTALL_DIR:-$HOME/.acryl}"
BIN_DIR="$INSTALL_DIR/bin"
NODE_MIN="22.19.0"

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- detect platform / arch -------------------------------------------------
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux)  os=linux ;;
  *)      fail "unsupported OS: $(uname -s)" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64)  arch=x64 ;;
  *)             fail "unsupported architecture: $(uname -m)" ;;
esac
target="$os-$arch"

# --- resolve the release tag -------------------------------------------------
resolve_tag() {
  if [ "$ACRYL_VERSION" = "latest" ]; then
    curl -fsSL "https://api.github.com/repos/$ACRYL_REPO/releases/latest" \
      | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
  else
    echo "v$ACRYL_VERSION"
  fi
}
TAG="$(resolve_tag)"
VERSION="${TAG#v}"
ARCHIVE="acryl-cli-$target.tar.gz"

say "ACRYL $VERSION ($target)"

# --- ensure host Node --------------------------------------------------------
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -v | sed 's/^v//')" != "" ] && awk "BEGIN{exit !(\"$(node -v | sed 's/^v//')\" >= \"$NODE_MIN\")}"; }
if node_ok; then
  say "using host Node $(node -v)"
else
  say "no Node >= $NODE_MIN found; installing into $INSTALL_DIR/node"
  nd="node-v24.19.0-$os-$arch"
  ndext="tar.gz"
  url="https://nodejs.org/dist/v24.19.0/$nd.$ndext"
  mkdir -p "$INSTALL_DIR"
  curl -fsSL "$url" -o "$INSTALL_DIR/$nd.$ndext"
  tar -xzf "$INSTALL_DIR/$nd.$ndext" -C "$INSTALL_DIR"
  rm -f "$INSTALL_DIR/$nd.$ndext"
  ln -sf "$INSTALL_DIR/$nd/bin/node" "$BIN_DIR/node"
  export PATH="$BIN_DIR:$PATH"
  say "installed Node $(node -v)"
fi

# --- download the CLI archive -----------------------------------------------
say "downloading $ARCHIVE from $TAG"
mkdir -p "$BIN_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$ACRYL_REPO/releases/download/$TAG/$ARCHIVE" -o "$TMP/$ARCHIVE"
tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
CLI_ROOT="$INSTALL_DIR/acryl-cli-$target"
rm -rf "$CLI_ROOT"
mkdir -p "$(dirname "$CLI_ROOT")"
mv "$TMP/acryl-cli-$target" "$CLI_ROOT"
ln -sf "$CLI_ROOT/bin/acryl" "$BIN_DIR/acryl"
chmod +x "$BIN_DIR/acryl" "$CLI_ROOT/bin/acryl"

# --- ensure PATH -------------------------------------------------------------
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) export PATH="$BIN_DIR:$PATH" ;;
esac
shell_init() {
  case "${SHELL:-}" in
    */zsh) printf '\n# ACRYL\nexport PATH="%s:$PATH"\n' "$BIN_DIR" >> "$HOME/.zshrc" ;;
    */bash) printf '\n# ACRYL\nexport PATH="%s:$PATH"\n' "$BIN_DIR" >> "$HOME/.bashrc" ;;
  esac
}
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) shell_init || true ;;
esac

say "installed to $CLI_ROOT"
say "run 'acryl --version' to verify (PATH:$BIN_DIR on PATH)"
