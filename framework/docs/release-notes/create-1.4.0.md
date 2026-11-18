# create-acrylblends 1.4.0

Ships with [acrylblends 1.3.0](acrylblends-1.3.0.md).

## Added

- **`--desktop` puts the new app inside the ACRYL frame.** The default stays an app on the framework alone.

  ```sh
  npm create acrylblends@latest my-app agent -- --desktop
  ```

  A starter from a source (`--from`, `github:`, a folder) refuses the option, since it decides its own shape.
- **An app made with `--from` always has a `.gitattributes`.** A registry entry made without one gets the default, so every checkout has the same line endings on every OS and a plugin's digest stays the same. An entry's own file is kept.
