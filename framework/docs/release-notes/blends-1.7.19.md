# @acryldev/blends 1.7.19

Released 2026-11-21.

## Fixed

- `acrylblends pack`: a product without its own `assets/icon.png` gets ACRYL Blends' icon again. The packer looked for it where only the
  source checkout has it, so electron-builder silently used Electron's own icon, and the new Linux tarball step failed (ACRYL ADE v0.2.3,
  ACRYL SDE v0.1.2). A missing icon now stops the pack with its reason.
- A desktop app always ends when it quits. After every disposer had run, macOS sometimes kept Electron's main loop running with
  nothing left (about one SIGTERM in six for ACRYL ADE); the process now ends at `quit`, after writing the window's storage.
  (@acryldev/desktop-shell 0.1.8)
