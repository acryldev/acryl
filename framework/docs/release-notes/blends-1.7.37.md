# @acryldev/blends 1.7.37

Released 2026-11-25.

- **One copy of `@acryldev/app-persistence` in an app again.** 1.7.36 moved the library's `save` and `plugin-share` to app-persistence 0.1.7, while
  `@acryldev/plugin-hub-core` 0.2.4 still pinned 0.1.6, so an app installed both. plugin-hub-core 0.2.5 pins 0.1.7, and the library's `builder` and
  `plugin-share` pin plugin-hub-core 0.2.5.
