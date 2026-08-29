# Research: ACRYL v0.1.0-alpha.1 release readiness

## Decision

Ship an unsigned alpha; package the same ACRYL Runtime under three entrypoints.
Record facts only — no build changes until a local artifact is reliably
produced and smoke-checkable.

## Verified facts (inspection 2026-08-29, C1)

- **Electron packaging:** `dsh-plugin-desktop` uses `electron-builder@26.15.7`.
  `package.json` `main: lib/main.js`; `build` config: `appId: dev.acryl.desktop`,
  `productName: ACRYL`, `asar: true`, `mac.target: ["dir"]`,
  `mac.category: public.app-category.developer-tools`, `mac.hardenedRuntime: true`,
  `mac.notarize: true`, `mac.signIgnore: [".(?:pak|dat|wasm)$"]`,
  `afterPack: ./scripts/verify-packaged-runtime.ts`,
  `files` includes `lib/**`, `cordis.patch.yml`, `package.json`; excludes
  `node_modules/node-pty/build/**`.
- **Packaging scripts** (`dsh-plugin-desktop`): `package:dir`
  (= `build:canvas && build && node scripts/package-dir.mjs`), `dist:mac`
  (`node scripts/release-mac.ts`), `dist:mac-smoke`
  (`node scripts/package-mac.ts`), `dist:win` (`node scripts/package-win.ts`),
  `dist:win-portable`.
- **mac x64 + arm64:** `mac.target: ["dir"]` + the `x64ArchFiles` field present
  implies both arches are handled by the packager; `dist:mac-smoke` is the
  safe unsigned path for an alpha.
- **Existing CI:** `.github/workflows/ci.yml` runs typecheck/test/build on
  `ubuntu-latest` (node 24, bun 1.3.14) for PR/push to `main`.
  `.github/workflows/release-candidate.yml` triggers on `v*` tags +
  `workflow_dispatch`, builds **Windows** artifacts
  (`check:win-package`, `dist:win`, then a portable archive). No mac/linux
  artifact job yet.
- **Web entrypoint:** DSH serves the web surface via `dsh --profile web`
  (boots `@deepseek-ai/dsh-web-app`). ACRYL's `acryl web` command is declared in
  `acryl-tui/src/cli/grammar.ts` but `runAcryl` currently throws for non-`tui`;
  so web/gui entrypoints are not yet wired into the `acryl` CLI. (They remain
  reachable via the DSH launcher against an ACRYL profile.)
- **GUI entrypoint:** Electron via `dsh-plugin-desktop/lib/main.js` (the
  `dsh-plugin-desktop` bin). The desktop already assembles an ACRYL profile.
- **Linux packaging:** no `linux` target is configured in the desktop build
  (only mac + win). Debian/ARM64 + x64 packaging must be added to the
  electron-builder `build.linux` section.
- **Windows x86/ia32:** `package-win.ts` is the owning script; whether the
  Electron/electron-builder toolchain supports ia32 is unverified — record as an
  open fact, do not assume.

## Assumptions (to verify before CI)

- The `mac.target: ["dir"]` build produces an unsigned `.app`; turning
  `notarize` off (or documenting it is skipped) is acceptable for the alpha.
- GitHub Actions artifacts + the existing `release-candidate.yml`
  `workflow_dispatch` are the prerelease artifact path; no published release.
- Source distribution = GitHub source archive (no extra work).

## Alternatives considered

- A cross-platform `pnpm run dist` umbrella script — deferred; the per-OS
  scripts already exist and are CI-proven for Windows.
- Publishing a GitHub release — explicitly out of scope for the alpha.
