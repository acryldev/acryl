# Feature Specification: ACRYL v0.1.0-alpha.1 release readiness

**Feature Directory**: `specs/022-acryl-v0.1.0-alpha.1`
**Created**: 2026-08-29 (C1). **Status**: in progress.
**Input**: `docs/ACRYL-ROADMAP.md` M1 secondary delivery; the primary pi-tui
terminal surface is delivered and PTY-evidenced.

## Objective

Ship a testable, **unsigned** `v0.1.0-alpha.1` of ACRYL as one product with three
entrypoints that all start the same local ACRYL Runtime (DeepSeek Harness +
Cordis + ACRYL plugins), not separate agents:

- `acryl tui` — direct TypeScript adapter (implemented, PTY-evidenced).
- `acryl gui` — Electron via `dsh-plugin-desktop`.
- `acryl web` — DSH web surface via `@deepseek-ai/dsh-web-app` over an ACRYL
  profile.

## Acceptance criteria

- An unsigned testable artifact is buildable per target with the same runtime.
- Executable headless-safe smoke checks pass: `--version`, `tui --json`, web
  startup/health, desktop startup.
- CI artifacts are produced by a manually triggered prerelease workflow
  (GitHub Actions artifacts), built only once reliable. No published release.
- GitHub source archive is the source distribution.

## Target release matrix

macOS Apple Silicon · macOS Intel · Debian/Linux ARM64 · Debian/Linux x64 ·
Windows x64. Windows x86/ia32 only if the existing Electron/Node toolchain
supports it.

## Non-goals

No notarization, no Windows code signing, no published GitHub Release, no
store/registry publication. Do not change the ACRYL Runtime or agent semantics
for packaging; packaging must not fork runtime behavior.

## Dependencies

- `acryl-tui` (shipped, primary flow proven).
- `dsh-plugin-desktop` (Electron packaging, electron-builder).
- Existing `.github/workflows/{ci,release-candidate}.yml`.
