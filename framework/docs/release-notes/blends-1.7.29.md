# @acryldev/blends 1.7.29

Released 2026-11-22.

- **An app is named as its Blend names it.** The window's title, the About panel and the Dock read the Blend's `metadata.name` from
  blend.yaml ("ACRYL Control Center"), not the folder or package name (`control-center`). @acryldev/instance 0.1.4; the page and its
  tab in `ide-profile` take the same name (ec670134).
- **One copy of instance in an app.** Republished on instance 0.1.4: agent-panel 0.1.3, app-settings 0.1.3, builder 0.1.4,
  desktop-shell 0.1.11, desktop-web 0.1.3, driver-acp 0.1.2, driver-pty 0.1.3, extensions 0.1.4, feedback 0.1.3, plugin-share 0.1.8,
  showcase 0.1.3, tasks 0.1.3. The release gate's one-copy check covers it.
