#!/bin/bash
#
# Open ACRYL - removes the macOS download warning from ACRYL, then opens it.
#
# This script does exactly one thing: it deletes the "com.apple.quarantine" flag that your browser put on ACRYL when you downloaded it. That flag is why macOS
# says ACRYL is "damaged" or from an "unidentified developer": the app is not signed with an Apple Developer ID yet. It changes nothing else, needs no password,
# does not touch any other app, and does not connect to the internet.
#
# The one command it runs is:   xattr -dr com.apple.quarantine /Applications/ACRYL.app

APP=""
for candidate in "/Applications/ACRYL.app" "$HOME/Applications/ACRYL.app"; do
  if [ -d "$candidate" ]; then APP="$candidate"; break; fi
done

if [ -z "$APP" ]; then
  echo "ACRYL is not in your Applications folder yet."
  echo "Drag ACRYL onto Applications in the install window first, then double-click this again."
  echo
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

echo "Removing the download warning from $APP ..."
if xattr -dr com.apple.quarantine "$APP"; then
  echo "Done. Opening ACRYL."
  open "$APP"
else
  echo
  echo "macOS did not allow that without an administrator password. Run this in Terminal instead:"
  echo "  sudo xattr -dr com.apple.quarantine \"$APP\""
  echo
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
