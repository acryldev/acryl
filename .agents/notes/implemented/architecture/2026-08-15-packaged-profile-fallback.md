# Agent Note: Physical packaged profile fallback

Status: implemented

English | [中文](2026-08-15-packaged-profile-fallback.zh.md)

## Problem

DSH profile plugins resolve installation-owned packages through symlinks below `$DSH_HOME/profiles/node_modules`. A packaged Electron process can read files through the virtual `app.asar` filesystem, but an operating-system symlink cannot traverse into that virtual archive. Using the logical packaged manifest as the installation anchor therefore created links that failed with `ENOTDIR` before the Loader could activate the Web bundle.

## Decision

Electron Builder unpacks the desktop deployment manifest, Cordis patch, runtime modules and assets, and `node_modules`. The desktop Host maps its installation anchor from `app.asar/package.json` to `app.asar.unpacked/package.json` before calling `healProfilesModuleFallback`; ordinary source and npm launches keep their existing physical path unchanged. The packaged-runtime hook requires the physical manifest, desktop plugin subpaths and native assets, and runtime dependency sentinels before signing begins.

## Verification

Focused tests cover the ASAR path mapping, the packaging declaration, and rejection of a package missing the physical manifest or a desktop plugin subpath. The unpacked package gate then verifies the real `app.asar.unpacked` tree, and a packaged profile-resolution smoke uses a private Harness home to prove that generated fallback links resolve to physical package directories before the application is released.

## Alternatives considered

**Keep profile links pointed at `app.asar`.** Electron can read a direct ASAR path, but Node reaches profile dependencies through operating-system links, where the archive path is not a real directory.

**Copy only the two profile bundle packages.** Third-party plugins can consume peers and providers anywhere in the deployment closure, so a partial fallback would reintroduce resolution failures under different plugin sets.

**Disable ASAR.** This avoids virtual paths but gives up the established package layout and integrity boundary for code that does not need to be physically executable.

## Consequences

The physical desktop package is duplicated beside the unpacked dependency tree. Every startup can repair links left by a prior installation location without modifying a selected profile's manifest or patch layer. Packaging fails before signing if either the root anchor or a required runtime entry is absent.
