# @acryldev/blends 1.7.30

Released 2026-11-22.

- **A packed product is named for the product.** The packer writes the product's name (`--product "ACRYL Control Center"`) into the packed
  blend.yaml as `metadata.name`, beside the version it already writes. The packed copy is the scaffold's, named for its folder (`blend`), and the
  instance names an app by that field, so the window's title, the About panel and the Dock now say "ACRYL Control Center".
- **An app is named as its Blend names it** (@acryldev/instance 0.1.4, ec670134; the page and its tab in `ide-profile` take the same name).
  A product repository's own `scripts/ide-host.mjs` keeps the page title it was made with: replace its `appTitle` block with
  `const appTitle = chosen.name`.
- **One copy of instance in an app.** Republished on instance 0.1.4: agent-panel 0.1.3, app-settings 0.1.3, builder 0.1.4,
  desktop-shell 0.1.11, desktop-web 0.1.3, driver-acp 0.1.2, driver-pty 0.1.3, extensions 0.1.4, feedback 0.1.3, plugin-share 0.1.8,
  showcase 0.1.3, tasks 0.1.3.
- After the release: @acryldev/blends-frame 0.2.16 - after a change of the app's code (an agent's new plugin or edit, a version restored,
  a branch switched) the app canvas reloads on the page it is on, not on the app's first page. An app made with 1.7.30 gets it through its
  `^` range.
