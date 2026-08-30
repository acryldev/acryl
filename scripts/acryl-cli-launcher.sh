#!/bin/sh
# ACRYL portable CLI launcher.
# Uses the bundled Node runtime from this archive; never touches the host's
# Node/npm/pnpm. The --expose-internals flag is required by the Cordis HMR
# boot guard in the ACRYL harness runtime.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
exec "$DIR/bin/node" --expose-internals "$DIR/lib/bin.js" "$@"
