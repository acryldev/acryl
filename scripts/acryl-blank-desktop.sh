#!/usr/bin/env bash
# Start the blank canvas (spec 036) on the desktop surface, for testing. Extra arguments go to scripts/blank.mjs:
#   --name Orbit --accent '#e8590c' --blueprint <file.yaml>
# Uses its own home, so your real ACRYL profile is untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || corepack pnpm install --frozen-lockfile
exec node scripts/blank.mjs desktop "$@"
