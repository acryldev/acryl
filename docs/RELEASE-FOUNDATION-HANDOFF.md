# ACRYL distribution foundation — release handoff

Status: **the legacy Release Candidate workflow and Windows long-path blocker
were removed.** Portable darwin-arm64 CLI archive is proven without host Node.
A non-publishing run of the authoritative per-architecture release matrix is
still required before the next tag.

## Remaining verification

1. **NPM clean-install verification** — run an isolated `npm install -g acryl`
   smoke against the published package.
2. **Authoritative release matrix** — run `.github/workflows/release.yml` through
   `workflow_dispatch` and require every desktop and CLI target to pass before
   creating another tag.

## Verified deliverables (goal's completion list)

1. **Release cannot publish unverified builds** — `.github/workflows/release.yml`:
   - `build` matrix (macos-arm64, macos-x64, linux-arm64, linux-x64, windows-x64) runs
     `check:layout` + typecheck + test **before** electron-builder packages/upload.
   - `cli` matrix (darwin-arm64/x64, linux-arm64/x64, windows-x64) smoke-tests the
     extracted archive (bundled `acryl --version`, `acryl tui --json`, no host
     Node) **before** upload.
   - `release` job `needs: [build, cli]`; any failed matrix job prevents artifact
     upload and release creation. Every desktop matrix job now also runs
     `corepack pnpm --filter acryl-desktop run verify:closure`.
2. **Fresh gates pass** — `corepack pnpm run verify` green locally. CI-side readiness
   confirmed: committed `upstream.json` (`b150a551…`) == committed submodule pointer
   (`b150a551…`), so `check:layout` passes on a clean checkout; `pnpm install
   --frozen-lockfile` passes (rc 0, "Lockfile is up to date"). The local dirty
   `deepseek-harness` submodule is a working-tree artifact, not a CI blocker.
3. **Portable CLI archive smoke-tested without host runtime** — darwin-arm64 proven:
   `acryl --version` → 0.1.9, `acryl tui --json` boots with `PATH=/usr/bin:/bin`.
   `acryl-cli-windows-x64.zip` assembly verified locally; linux targets structured
   for CI.
4. **Checksums** — `release-artifacts/checksums.txt` (darwin + windows) verifies `OK`;
   the release job regenerates it from all uploaded CLI archives at publish time.
5. **Ledger** — `docs/DEVELOPMENT-LOG.md` updated through the deferred-channels record.
6. **Commits / results / targets / blockers / next task** — see below.

## Release procedure for v0.1.10 (user-authorized)

```sh
# 1. Bump the five package versions 0.1.9 -> 0.1.10:
#    package.json, acryl-desktop, acryl-development-canvas, acryl-tui,
#    acryl-harness-runtime, acryl-control
# 2. Commit "release: ... (bump to v0.1.10)", push main.
# 3. Tag v0.1.10, push tag -> Release workflow runs build + cli + release.
# 4. Watch: every matrix job must verify green; any failure stops the release.
# 5. Confirm assets: acryl-desktop-* (DMG/EXE/DEB + blockmaps),
#    acryl-cli-* (5 targets), checksums.txt, README download links synced.
```

## Supported targets

- Desktop: macOS ARM64 DMG, macOS Intel DMG, Windows x64 EXE, Linux x64 DEB,
  Linux ARM64 DEB (`acryl-desktop-*`, version-less, with `.blockmap`).
- CLI portable: `acryl-cli-darwin-arm64/x64.tar.gz`, `acryl-cli-linux-arm64/x64.tar.gz`,
  `acryl-cli-windows-x64.zip` + `checksums.txt`.
- CLI npm: `npm install -g acryl` (canonical, published); `acryldev` / `@webboxes/acryl`
  are compatibility aliases only.
- Installer seam: `scripts/acryl-cli-install.sh` (SHA-256 verify, user-owned dir,
  no sudo/GUI/Web) — not advertised until hosting + release archives + checksums live.

## Deferred (recorded, not built)

AppImage, RPM, auto-update manifests, code signing/notarization for the CLI,
Homebrew, Scoop, Chocolatey, Pacman/AUR, mise, Nix.

## Commits (goal work, all on `main`)

`9c442facf129d4440e74d9f01611378f3c3576ec` removes the obsolete Release
Candidate workflow, makes the release-workflow assertion match its matrix, and
renames the Windows-incompatible methodology path.

`933ee2e` rename → `5558721` CLI version/entrypoint fixes → `16ba098` CLI archive
build + matrix → `d196df0` installer seam → `5a509a6` verify-before-upload →
`30b2c15` README canonical npm → `f6c3f20` windows CLI target → `feb2e4f` checksums
format → `e92b9b3` deferred channels.

## Next task

Run the authoritative release workflow through `workflow_dispatch`, inspect all
five desktop and five CLI jobs, then address any target-specific failure before
authorizing a new tag.
