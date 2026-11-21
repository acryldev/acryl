# @acryldev/blends 1.7.25

Released 2026-11-22.

- **A new app's first test passes whatever its folder is called.** The blank template's first test now expects the app's own name (its
  instance's), not the name the template was written with, so an app made with `--from <id>` into a folder of another name starts green
  (f64bc742, 464973bf).
- Also carries the Windows test fix for the launcher (7d2618a5) and the formatting of the .deb code (4b8722b8).
