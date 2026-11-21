# ACRYL distribution - how a release is made

State of 2026-11-21. `npx acryl@latest` is the way in: the `acryl` npm package opens ACRYL Control Center (terminal, window or browser). The products are not built
here any more: this repository holds the reusable building blocks and the `acryl` selector; the terminal agent has its own repository.

| What | Where it is built and released | Released by |
|---|---|---|
| `acryl`, the selector and the terminal Control Center (npm) | this repository, `distribution/acryl-npm-launcher` | tag `v<selector version>`: `.github/workflows/release.yml` |
| The terminal coding agent `acryl-cli` and the earlier browser surface `acryl-web` | https://github.com/acryldev/acryl-terminal | tag `v<version>` there: its `.github/workflows/release.yml` |
| The `@acryldev/*` building blocks (control, harness-runtime, plugins ...) | this repository | published by hand, in dependency order |
| acrylblends (`@acryldev/blends`, create-blends, the frame) | this repository, `framework/` | `.github/workflows/framework-release.yml` (tags that do not start with `v`) |
| ACRYL Control Center, ADE, SDE (installable apps) | their own repositories | `acrylblends pack` |

## How the pieces find each other

- The selector never reads a GitHub release. It installs the agent's runtime from npm, into `~/.acryl/runtime/<acrylRuntime>`, the first time someone opens it
  (`acryl ade --tui`, or any words the selector does not own, after a `y`): `npm install --prefix ... acryl-cli-<target>@<acrylRuntime>`. `acrylRuntime` in
  `distribution/acryl-npm-launcher/package.json` names the acryl-terminal release the runtime comes from; the selector's own version moves on its own.
- `acryl-cli-<target>` (darwin-arm64, linux-arm64, linux-x64, windows-x64) are the npm tarballs acryl-terminal's release builds from its CLI archives
  (`scripts/pack-npm-runtimes.mjs`), attached to its GitHub release.
- acryl-terminal depends on the published `@acryldev/*` packages with exact pins, and on nothing in this checkout.

## Release procedure

1. **acryl-terminal** (when the agent or the browser surface changed). Bump the root and both apps to `<new>` (they must be equal), land it on main, wait for its CI
   (Linux, macOS, Windows), tag `v<new>`. The release workflow builds the CLI and Web archives for the 4 targets, smokes each from a clean extraction, validates one
   manifest, packs the four `acryl-cli-<target>-<new>.tgz` and creates the GitHub release only when every surface built. A tag that failed before anything was published
   may be deleted and re-created on a fixed commit.
2. **Publish the runtimes.** Download the four `.tgz` from the release and `npm publish ./<file> --access public` each (under `--tag next` first). The registry shows
   tarballs this size (125-150 MB) 20-35 minutes after publish returns; `curl -I https://registry.npmjs.org/acryl-cli-<target>/-/acryl-cli-<target>-<new>.tgz` answers 200
   when it is really there. npm refuses a version that exists, so a retry is safe.
3. **The selector.** In `distribution/acryl-npm-launcher/package.json` set `version` (the tag) and `acrylRuntime` (`<new>`), land it, then
   `node scripts/pack-npm-selector.mjs <out-dir>` (needs `pnpm install` and the build of `@acryldev/app-persistence`; the terminal Control Center is bundled into `launcher.js`)
   and `npm publish ./<out-dir>/acryl-<version>.tgz --access public`. Pushing the tag `v<version>` runs the selector tests and the npm round trip on three OSes
   and attaches the tarball to a GitHub release; it publishes to npm only when the repository variable `ACRYL_PUBLISH_SELECTOR_NPM` is `true` (with the `NPM_TOKEN` secret).
4. **Prove it from npm** under a scratch HOME on a machine that is not the one you built on: `npx acryl@<version> --version`, `--help`, the terminal Control Center in a
   terminal, and `acryl ade --tui --version` (it downloads the runtime from npm, then prints `<new>`). Then promote the tags to `latest`.

A push that changes `.github/workflows` needs SSH (`git@github.com:acryldev/...`): the GitHub CLI's OAuth token has no `workflow` scope.

## What is checked on every change

- `corepack pnpm run check` here (layout and dependency direction, typecheck, tests, build) and CI on Linux; the Windows workflow runs the repository's script tests and
  `scripts/selector-round-trip.mjs` (pack the selector, `npm install --global` it into a scratch prefix, `acryl --version` and `--help`). 0.2.5 shipped a Windows selector that
  could not start its runtime because the release smoke ran each archive's launcher, never npm.
- acryl-terminal's CI runs the same on Linux, macOS and Windows, and its release smokes every archive.

## Supported targets

- Terminal agent and browser surface: darwin-arm64, linux-arm64, linux-x64 (`.tar.gz`) and windows-x64 (`acryl-cli-windows-x64.zip`, `acryl-web-windows-x64.tar.gz`).
  darwin-x64 is not built (no x64 macOS runner can build its natives); Intel Mac users build it with `scripts/build-darwin-x64-from-source.sh` in acryl-terminal.
- The earlier ACRYL desktop is superseded: its source is https://github.com/acryldev/acryl-desktop, its installers stay at https://github.com/acryldev/acryl/releases, and
  `acryl desktop --installer` still downloads one.
- The standalone terminal installer (`curl https://acryl.dev/install | bash`) is retired: the script prints a pointer to `npx acryl@latest`.

## Open

- `flake.nix` and the nix workflows (manual-only, pinned to v0.1.36, building a CLI that no longer lives here): owner decision, retire or move to acryl-terminal.
- Deferred, not built: AppImage, RPM, auto-update manifests, signing and notarization of the agent runtime, Homebrew, Scoop, Chocolatey, Pacman/AUR, mise.
