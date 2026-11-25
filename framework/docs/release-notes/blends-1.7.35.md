# @acryldev/blends 1.7.35

Released 2026-11-25.

- **An update no longer breaks the running app half way.** `acrylblends update` (and every Update button that runs it, the Control Center's own among
  them) writes `.acrylblends/updating.json` from before the merge until `npm install` ends. The running app's frame (`@acryldev/blends-frame` 0.2.18)
  holds its reload while that file names a live process and reloads once when it is gone, so new code never loads before the packages it imports.
  Before, the frame reloaded right after the merge and showed "Not reloaded: Cannot find package ..." until a restart. A hold left by an update that
  died (its process gone, or older than 30 minutes) holds nothing.
- **A failed install takes the app back.** When `npm install` fails after the merge, the app returns to the release it had, its packages are installed
  again, and the update says so; nothing is left half updated.
- **A Blend's chat lists and switches its plugins** (`@acryldev/blends-frame` 0.2.18 provides `frameAppPlugins`, `@acryldev/app-context` 0.2.3 adapts it
  to `acrPluginLifecycle`), so plugin-admin's agent tools work in a Blend's chat (spec 052 T055d).
