# create-acrylblends 1.4.1

Ships with [acrylblends 1.3.1](acrylblends-1.3.1.md), and needs at least that release.

## Fixed

- **A new app now has `plugin list`, `plugin remove` and route removal in the frame.** 1.4.0 was content with acrylblends 1.3.0, so `npm create acrylblends@latest` on a machine that had run it before 1.3.1 came out reused npm's cached copy with acrylblends 1.3.0. The app got the 1.3.0 door and plugin-share, and a `frame/app-plugins.mjs` that keeps a removed plugin's route. 1.4.1 asks for acrylblends 1.3.1 or later, so npm fetches it again.
