# ACRYL distribution foundation - release handoff

Status (2026-10-29): one tag `v<version>` runs `.github/workflows/release-cli.yml`, which builds the 4 CLI and 4 Web archives, calls
`release-desktop.yml` for the 5 Desktop installers, publishes the npm packages and promotes the GitHub release, and does none of the
irreversible steps unless every surface built. A `workflow_dispatch` run on `main` is the non-publishing dry run; it must be green before a tag.
The sections after "Release procedure" below are the history of the first release work and name the workflow by its old file name.

## Remaining verification

1. **npm round trip** - `scripts/npm-round-trip.mjs` packs this machine's CLI target and the selector, installs them with
   `npm install --global` into a scratch prefix, and runs `acryl --version` and `acryl web --yes` through a release-style redirect. CI (Linux)
   and the Windows workflow run it on every change; 0.2.5 shipped a Windows selector that could not start its runtime and an `acryl web` that
   could not find its release, because the release smoke runs each archive's launcher, never npm.
2. **After publishing** - a clean `npm install -g acryl` with `acryl --version`, `acryl web --yes` and `acryl control list` on macOS, Windows
   and Linux.

## Verified deliverables (goal's completion list)

1. **Release cannot publish unverified builds** — `.github/workflows/release.yml`:
   - `build` matrix (macos-arm64, macos-x64, linux-arm64, linux-x64, windows-x64) runs
     `check:layout` + typecheck + test **before** electron-builder packages/upload.
   - `cli` matrix (darwin-arm64/x64, linux-arm64/x64, windows-x64) smoke-tests the
     extracted archive (bundled `acryl --version`, `acryl tui --json`, no host
     Node) **before** upload. The Windows archive builder uses `corepack.cmd`;
     each CLI job also runs the TUI typecheck/tests and platform-helper test.
   - `release` job `needs: [build, cli]`; any failed matrix job prevents GitHub
     Release creation. Every desktop matrix job now also runs
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

## Release procedure (version-synced; npm auto-published)

The release tag is the single source of truth for the version. The workflow's manifest job checks that the tag equals all seven package
versions, and the npm packages are published at that version.

```sh
# 1. Dry run: gh workflow run release-cli.yml --ref main. Everything but the version check must be green, and the Windows workflow too.
# 2. Bump the seven package versions <old> -> <new> (they must all be equal), and distribution/acryl-web-container's ARG ACRYL_VERSION:
#    package.json, runtime/acryl-control, runtime/acryl-harness-runtime, apps/acryl-cli, apps/acryl-web, apps/acryl-desktop,
#    distribution/acryl-npm-launcher. Check: node scripts/release-manifest.mjs verify-versions <new> <the seven package.json files>
# 3. Commit "chore(release): bump to <new>" and land it on main.
# 4. Tag v<new> on that commit and push the tag: CLI + Web archives, Desktop, manifest, npm (the 4 acryl-cli-<target> packages, then the
#    acryl selector), then the GitHub release. About 30 minutes. Before npm publish a failed run may be fixed and the tag recreated; never after.
# 5. Confirm: npm view acryl version == <new> (the target tarballs can lag 20-35 minutes), a clean install on the three OSes, the release
#    marked Latest with no draft left, release notes, node scripts/sync-release-readme.mjs v<new>, and the DEVELOPMENT-LOG entry.
```

Prerequisite for the npm auto-publish: a valid `NPM_TOKEN` stored as a GitHub Actions secret on the repository.

## Supported targets

- Desktop: macOS ARM64 DMG, macOS Intel DMG, Windows x64 EXE, Linux x64 DEB, Linux ARM64 DEB (`acryl-desktop-*`, with `.blockmap`).
- CLI, 4 targets: darwin-arm64, linux-arm64, linux-x64 (`acryl-cli-<target>.tar.gz`) and windows-x64 (`acryl-cli-windows-x64.zip`). darwin-x64
  is not built (no x64 macOS runner can build its natives); Intel Mac users build it with `scripts/build-darwin-x64-from-source.sh`.
- Web, the same 4 targets (`acryl-web-<target>.tar.gz`), downloaded by `acryl web` from the release's `acryl-release-manifest.json`.
- npm: `npm install -g acryl`, the selector, which installs the matching `acryl-cli-<target>` package as an optional dependency.
- Installer seam: `apps/acryl-cli/scripts/acryl-cli-install.sh` (SHA-256 verify, user-owned dir, no sudo/GUI/Web), not advertised.

## Deferred (recorded, not built)

AppImage, RPM, auto-update manifests, code signing/notarization for the CLI,
Homebrew, Scoop, Chocolatey, Pacman/AUR, mise, Nix.

## Commits (goal work, all on `main`)

`9c442facf129d4440e74d9f01611378f3c3576ec` removes the obsolete Release
Candidate workflow, makes the release-workflow assertion match its matrix, and
renames the Windows-incompatible methodology path.

`5d268c7f0dbbae33c4b262f0e85ce343104d7f6d` selects the Windows Corepack shim
and gates each CLI archive with TUI verification. `02d3ff2` supplies the required
Windows shell spawn option for that `.cmd` shim.

`933ee2e` rename → `5558721` CLI version/entrypoint fixes → `16ba098` CLI archive
build + matrix → `d196df0` installer seam → `5a509a6` verify-before-upload →
`30b2c15` README canonical npm → `f6c3f20` windows CLI target → `feb2e4f` checksums
format → `e92b9b3` deferred channels.

## Next task

Release 0.2.6: the dry run on `main`, then the procedure above.
