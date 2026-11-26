# @acryldev/blends 1.7.41

Released 2026-11-26.

- **Share with team in every app's own Settings > Share** (blends-frame 0.2.21). Under Share to GitHub, a row says GitHub builds the desktop installers
  for this app; it adds the release workflow, tags the next version, pushes, follows GitHub's build step by step and ends with the release page,
  installers for macOS, Windows and Linux on it. It needs the app on GitHub and a GitHub connection with the workflow permission. Inside a WebBoxes.ai
  box this is how an app gets its desktop installers.
- **Share with team lives in `@acryldev/app-persistence` 0.1.8** beside the GitHub sign-in; `@acryldev/launcher` 0.2.3 re-exports it for Control Center.
- **Our commands ask npm for `@acryldev/blends` and `@acryldev/create-blends`** (launcher-desktop 0.2.7), not the archived short names.
