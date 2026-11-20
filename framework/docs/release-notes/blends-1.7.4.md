# @acryldev/blends 1.7.4

Released 2026-11-20.

## Fixed

- Apps made from a Blueprint in the Blends registry (`npm create @acryldev/blends my-app -- --from <id>`, and Make an app in ACRYL Control
  Center) have the Blends frame again - the chat, Settings and Settings > Share - as they did before 1.7. The frame step now counts an app
  that names `@acryldev/desktop-shell` in package.json before its install, and the frame's host uses the plugin folders the app has
  (`plugins/<id>`, or `plugins/acryl-<id>` in a Blueprint made before the folders were renamed).
