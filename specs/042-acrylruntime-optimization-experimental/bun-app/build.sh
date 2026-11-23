#!/bin/bash
# build.sh <outDir> [--payload <dir>]   (macOS arm64 and Linux x64 as written; Windows needs the same with .exe)
# 1. the payload: ../deno-app/make-payload.sh <darwin|linux|win32> <arm64|x64> <outDir>/payload   (a flat production node_modules, pruned, plus a Node sidecar; not Deno specific)
# 2. the executable: `bun build --compile` of main.ts, next to the payload.
# Writes only under <outDir>. Run it with a THROWAWAY HOME and ACRYL_HOME (the launcher defaults to ~/.acrylbun, never to ~/.acryl).
set -euo pipefail
OUT=${1:?output dir}; shift || true
HERE=$(cd "$(dirname "$0")" && pwd)
BUN=${BUN:-bun}
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLATFORM=darwin; ARCH=arm64 ;;
  Linux-x86_64) PLATFORM=linux; ARCH=x64 ;;
  *) echo "unsupported host $(uname -s)-$(uname -m)"; exit 1 ;;
esac
mkdir -p "$OUT"
if [ "${1:-}" = "--payload" ]; then cp -Rc "$2" "$OUT/payload" 2>/dev/null || cp -R "$2" "$OUT/payload"; else "$HERE/../deno-app/make-payload.sh" "$PLATFORM" "$ARCH" "$OUT/payload"; fi
# --compile-autoload-package-json: without it a compiled executable does not resolve bare package names from node_modules on the real disk (measured, specs/042 B5), and the payload is
# resolved exactly that way (the Cordis Loader imports plugins by name).
"$BUN" build --compile --compile-autoload-package-json "$HERE/main.ts" --outfile "$OUT/acryl-bun"
echo "built: $OUT/acryl-bun ($(du -sk "$OUT/acryl-bun" | awk '{printf "%.1f MB", $1/1024}')), payload $(du -sk "$OUT/payload" | awk '{printf "%.1f MB", $1/1024}')"
