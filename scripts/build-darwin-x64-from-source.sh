#!/bin/bash
# Build ACRYL CLI for darwin-x64 from source on native Intel macOS
# Run this on an actual Intel Mac (darwin-x64) to build the darwin-x64 binary
#
# Usage:
#   bash scripts/build-darwin-x64-from-source.sh
#
# This script:
# 1. Clones/syncs the repository
# 2. Installs Node.js (if needed)
# 3. Installs pnpm dependencies
# 4. Builds the CLI archive for darwin-x64
# 5. Generates checksums

set -euo pipefail

echo "🔨 ACRYL darwin-x64 Build from Source"
echo "===================================="

# 1. Verify this is actually an Intel Mac
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
  echo "❌ Error: This script must run on Intel macOS (darwin-x64)"
  echo "   Current arch: $ARCH"
  exit 1
fi
echo "✓ Running on Intel macOS ($ARCH)"

# 2. Clone or update repository
REPO_DIR="${REPO_DIR:-$HOME/acryl-build}"
if [ ! -d "$REPO_DIR" ]; then
  echo "📥 Cloning ACRYL repository..."
  git clone https://github.com/acryldev/acryl.git "$REPO_DIR"
else
  echo "📥 Updating ACRYL repository..."
  cd "$REPO_DIR"
  git fetch origin
  git checkout main
  git pull origin main
fi

cd "$REPO_DIR"

# 3. Initialize submodules
echo "📦 Initializing submodules..."
git submodule update --init --recursive

# 4. Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "not installed")
echo "✓ Node.js: $NODE_VERSION"

if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install Node.js ^22.19.0 or >=24.0.0 first"
  echo "   Download from: https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node --version | cut -d. -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node.js version too old. Need ^22.19.0 or >=24.0.0"
  exit 1
fi

# 5. Setup pnpm
echo "📦 Setting up pnpm..."
corepack enable
corepack prepare pnpm@11.8.0 --activate

# 6. Install dependencies
echo "📦 Installing dependencies..."
corepack pnpm install --frozen-lockfile

# 7. Build workspace type providers
echo "🔨 Building type providers..."
corepack pnpm --filter acryl-control run build
corepack pnpm --filter acryl-harness-runtime run build

# 8. Build CLI archive
echo "🔨 Building CLI archive for darwin-x64..."
mkdir -p release-artifacts
node scripts/build-cli-archive.mjs darwin-x64 release-artifacts

# 9. Verify archive
ARCHIVE="release-artifacts/acryl-cli-darwin-x64.tar.gz"
if [ ! -f "$ARCHIVE" ]; then
  echo "❌ Build failed: archive not found at $ARCHIVE"
  exit 1
fi

echo ""
echo "✅ Build complete!"
echo ""
echo "Archive:"
echo "  $ARCHIVE"
echo ""
echo "Size: $(du -h "$ARCHIVE" | cut -f1)"
echo ""
echo "Next steps:"
echo "  1. Smoke test: tar -xf $ARCHIVE"
echo "  2. Test CLI: ./acryl-cli-darwin-x64/bin/acryl --version"
echo "  3. Share with Intel Mac users"
echo ""
echo "Checksum:"
shasum -a 256 "$ARCHIVE"
