#!/bin/sh
# D5/D6 spike: a `deno desktop` shell whose window hosts the ACRYL web host, payload beside it on the real disk.
# 1. node specs/042-.../probes/d6-payload.mjs <payloadDir>        (production closure of acryl-web, native-pruned)
# 2. prune what nothing loads at run time: *.d.ts/.d.mts/.d.cts, and *.md outside acryl*/@deepseek-ai/*
#    optional heavy packs for the lean variant: @deepseek-ai/libreoffice-kit-darwin-arm64, @deepseek-ai/dsh-client-ui-sidebar-documentpreview,
#    sherpa-onnx-darwin-arm64, @img/sharp-libvips-darwin-arm64
# 3. ./build.sh <payloadDir> <out.app>   then run with a THROWAWAY HOME and ACRYL_HOME (the runtime picks the port; ACRYL_WEB_PORT is ignored)
set -e
PAYLOAD=${1:?payload dir}; OUT=${2:?output name, e.g. ACRYL-D5.app}
HERE=$(cd "$(dirname "$0")" && pwd)
rm -rf "$OUT" "$OUT.app"
(cd "$HERE" && deno desktop -A --no-check -o "$OLDPWD/$OUT" main.ts)   # deno appends .app: result is "$OUT.app"
mkdir -p "$OUT.app/Contents/Resources" && cp -Rc "$PAYLOAD" "$OUT.app/Contents/Resources/payload"
codesign --force --deep -s - "$OUT.app" && codesign --verify --deep --strict "$OUT.app" && echo "built: $OUT.app"
