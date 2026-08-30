#!/bin/sh
# ACRYL portable CLI launcher.
# Uses the bundled Node runtime from this archive; never touches the host's
# Node/npm/pnpm. The --expose-internals flag is required by the Cordis HMR
# boot guard in the ACRYL harness runtime.
#
# Resolves symlinks so an install can place a symlink to this script (e.g.
# ~/.acryl/bin/acryl -> ~/.acryl/acryl-cli-<os>-<arch>/bin/acryl) and the
# relative node/lib lookup still points into the extracted archive.
SCRIPT="$0"
while [ -L "$SCRIPT" ]; do
  LINK="$(readlink "$SCRIPT")"
  case "$LINK" in
    /*) SCRIPT="$LINK" ;;
    *) SCRIPT="$(dirname "$SCRIPT")/$LINK" ;;
  esac
done
DIR="$(CDPATH= cd -- "$(dirname -- "$SCRIPT")/.." && pwd -P)"
exec "$DIR/bin/node" --expose-internals "$DIR/lib/bin.js" "$@"
