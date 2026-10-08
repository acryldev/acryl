#!/bin/bash
# test-mac.sh <dmg> [shotPath]  - what a user does: mount the DMG, copy the app out, launch it, look at it, quit it. Throwaway HOME (so ~/.acryldeno lands in scratch),
# bash with HISTFILE=/dev/null for the terminal (a zsh terminal would write the real history), window captured ALONE (CGWindowList id), nothing left behind.
# The page checks (WebKit features, opening a terminal, typing into it) come from the app's own ACRYLDENO_DEBUG_JS hook.
set -uo pipefail
DMG=$1; SHOT=${2:-}
HERE=$(cd "$(dirname "$0")" && pwd); INSPECT=$HERE/../probes/d5-desktop-spike/inspect.js
W=$(mktemp -d); WINID=$W/winid
cat > $W/winid.swift <<'SW'
import CoreGraphics
import Foundation
for w in (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []) {
  let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
  if CommandLine.arguments.count > 1, "\(pid)" != CommandLine.arguments[1] { continue }
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  print("\(w[kCGWindowNumber as String] ?? 0)\t\(w[kCGWindowOwnerName as String] ?? "")\tlayer \(w[kCGWindowLayer as String] ?? 0)\t\(b["Width"] ?? 0)x\(b["Height"] ?? 0)")
}
SW
swiftc -O $W/winid.swift -o $WINID 2>/dev/null
echo "port 3080 before: $(lsof -nP -iTCP:3080 -sTCP:LISTEN | awk 'NR>1{print $1" pid "$2}')"
MNT=$(hdiutil attach -readonly -nobrowse -noverify -mountrandom /tmp "$DMG" | tail -1 | awk '{print $NF}')
mkdir $W/installed; ditto "$MNT/AcrylDeno.app" $W/installed/AcrylDeno.app; hdiutil detach "$MNT" -quiet
mkdir -p $W/home
ACRYLDENO_DEBUG_JS=$INSPECT ACRYLDENO_DEBUG_HOLD_SECONDS=12 ACRYLDENO_DEBUG_QUIT=1 HOME=$W/home SHELL=/bin/bash HISTFILE=/dev/null \
  $W/installed/AcrylDeno.app/Contents/MacOS/laufey_webview > $W/run.log 2>&1 &
PID=$!
sleep 7; echo "windows at 7 s: $($WINID $PID | tr '\t' ' ')"
sleep 26
if [ -n "$SHOT" ]; then WID=$($WINID $PID | awk -F'\t' '$3=="layer 0"{print $1; exit}'); [ -n "$WID" ] && screencapture -x -o -l $WID "$SHOT" && echo "captured window $WID -> $SHOT"; fi
echo "app listens on: $(lsof -a -p $PID -iTCP -sTCP:LISTEN -nP 2>/dev/null | awk 'NR>1{print $9}' | tr '\n' ' ')"
wait $PID 2>/dev/null; echo "app exit code: $?"
echo "--- log ---"; sed 's/token=[^ "]*/token=<redacted>/g' $W/home/.acryldeno/logs/acryldeno.log | cut -c1-260 | sed 's#payload=.*Contents#payload=<app>/Contents#; s#home=[^ ]*#home=<throwaway>/.acryldeno#' | head -16
echo "--- data folder ---"; ls -A $W/home $W/home/.acryldeno
echo "port 3080 after: $(lsof -nP -iTCP:3080 -sTCP:LISTEN | awk 'NR>1{print $1" pid "$2}')"
pgrep -fl "installed/AcrylDeno.app" >/dev/null && echo "APP PROCESSES LEFT" || echo "no app processes left"
rm -rf "$W"
