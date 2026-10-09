ACRYL for macOS
===============

1. Drag ACRYL onto Applications.
2. Open ACRYL from Applications.

First launch: macOS says it cannot verify ACRYL
-----------------------------------------------
ACRYL is not signed with an Apple Developer ID yet, so macOS asks you to confirm it once. This is the same for every
app that is not signed that way, and it only happens the first time.

  1. Open ACRYL. macOS blocks it. Click Done (not "Move to Bin").
  2. Open System Settings > Privacy & Security and scroll down.
  3. Next to the message about ACRYL, click Open Anyway, then enter your password.

ACRYL then opens normally from then on.

If you prefer Terminal
----------------------
This removes the "downloaded from the internet" flag from ACRYL (no password, no network, nothing else is touched):

  xattr -dr com.apple.quarantine /Applications/ACRYL.app

Help and downloads: https://github.com/acryldev/acryl/releases/latest
