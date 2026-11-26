# @acryldev/blends 1.7.40

Released 2026-11-26.

- **One copy of `@acryldev/settings` in an app again.** 1.7.39 moved the frame to settings 0.2.2 while `@acryldev/workspace` 0.2.5 (which the frame
  uses) pinned 0.2.1, so an app installed both. workspace 0.2.6 pins settings 0.2.2 and blends-frame 0.2.20 pins workspace 0.2.6.
