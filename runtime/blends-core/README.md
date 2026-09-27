# @acryl/blends-core

The ACRYL Blends format, `blends.acryl.dev/v1alpha1`: the manifest an app's `blend.yaml` is, and the library that parses, validates, resolves (Blueprint
inheritance and parameters), compiles (to Cordis Loader patches) and locks it. Host-independent: no Cordis, DSH or surface dependencies, so the engine, the
registry's CI and other runtimes can all use it.

Moved into the ACRYL monorepo from `acryldev/blends` (2026-09-27, spec 036 `repositories.md`), with its history-tested source and tests unchanged. The format's
design decisions (D1 to D27) are recorded in that repository's `specs/001` to `004`.
