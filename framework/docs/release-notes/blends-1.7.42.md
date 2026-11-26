# @acryldev/blends 1.7.42

Released 2026-11-26.

- **`upgrade` brings an app's frame packages to the current frame release.** It moved the framework's own range but kept each frame package's
  older range (`@acryldev/blends-frame`, `app-shell`, `versions`, `sign-in`, `web` and the rest), so `npm install` kept the frame the app was made with:
  an upgraded WebBoxes.ai box still showed blends-frame 0.2.4 under 1.7.41. A registry range older than `frame/packages.json` now moves up to it, and
  the DSH pin moves with the frame; a newer range and a checkout's `file:` spec stay. The app's chats, versions and own code are not touched.
- **Save point keeps typed text on a second click** (blends-frame 0.2.22): with a name typed, a second click on Save point (or on a new branch's
  New) saves it, as Enter does; it closed the field and dropped the text.
- Published with it: `@acryldev/app-context` 0.2.5 (its docs name the framework `@acryldev/blends`), `@acryldev/workspace` 0.2.7 and
  `@acryldev/router` 0.1.1 (a comment each).
