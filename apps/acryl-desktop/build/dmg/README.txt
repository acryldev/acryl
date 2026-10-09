ACRYL for macOS
===============

1. Drag ACRYL onto Applications.
2. Open ACRYL from Applications.

If macOS says ACRYL is "damaged and can't be opened" or is from an "unidentified developer":

  Double-click "Open ACRYL" in this window.

  It removes the "downloaded from the internet" flag from ACRYL and opens it. That flag is the only thing wrong:
  ACRYL is not signed with an Apple Developer ID yet, so macOS is cautious about any copy you download. The flag is
  removed once, and ACRYL then opens normally from then on.

  If macOS will not run "Open ACRYL" itself, right-click it, choose Open, then Open again. Or open Terminal and paste:

    xattr -dr com.apple.quarantine /Applications/ACRYL.app

Read the script before you run it
---------------------------------
"Open ACRYL" is a plain text file. Right-click it, choose Open With, then TextEdit, to read every line. It runs one
command (the one above) and nothing else: no password, no internet, no other app is touched.

Newer macOS versions (15 and later) also offer: System Settings > Privacy & Security > Open Anyway, shown after
the first blocked attempt to open ACRYL.

Help and downloads: https://github.com/acryldev/acryl/releases/latest
