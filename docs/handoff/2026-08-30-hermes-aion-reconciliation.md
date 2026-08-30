# Handoff / Result — ACRYL release version-sync and external-npm boot fix

- **Date:** 2026-08-30
- **Author agent:** Hermes (running on **AION**; the canonical work machine is **M1 MAX**)
- **Owner note:** This was produced on AION and pushed to `origin/main`. It has
  **not** been applied to the M1 MAX working tree — M1 MAX has live agents
  (an ACRYL TUI session, codewhale, claude, three Hermes gateways) actively
  using that repo, so per the hybrid methodology §16 and the "one shared
  mutable worktree for competing owners" anti-pattern, no rebase/reset/force
  was run there.

## Objective and task

Reconcile the ACRYL release version and guarantee that a GitHub release and the
published npm package always share the same version. Also close the gap that an
external `npm install -g acryl` could not actually boot.

## Completed behavior

1. **External npm CLI boot** — root-caused and fixed the published `acryl`
   package failing to boot `tui`/`web`. The Cordis Loader could not apply the
   `cordis:include` loader entries because the published dependency map omitted
   the DSH profile-bundle plugin packages (`@deepseek-ai/cordis-plugin-timer`,
   `-hmr`, `@deepseek-ai/dsh-typert-loader`) and the `@koromix/koffi-*` natives.
   `scripts/publish-npm-cli.mjs` now derives the dependency map from the real
   production closure (`pnpm --filter acryl-tui deploy --prod --legacy`) and
   **gates on loader-entry completeness**.
2. **`--help`** — `acryl-tui/src/cli/grammar.ts` + `run.ts` now support `--help`/`-h`.
3. **Version reconciled to 0.1.12** and **CI auto-sync** — `.github/workflows/release.yml`
   gains an `npm-publish` job and both it and the `release` job verify
   `tag == acryl-tui package version` and fail on mismatch; `publish-npm-cli.mjs`
   refuses to publish a version that differs from the workspace.

## Changed files (committed on AION / origin)

- `scripts/publish-npm-cli.mjs`
- `acryl-tui/tsdown.publish.config.ts` (new)
- `acryl-tui/src/cli/grammar.ts`, `acryl-tui/src/cli/run.ts`
- `.github/workflows/release.yml`
- `package.json`, `acryl-control/package.json`, `acryl-desktop/package.json`,
  `acryl-harness-runtime/package.json`, `acryl-tui/package.json` (0.1.10 → 0.1.12)
- `docs/DEVELOPMENT-LOG.md`, `docs/npm-test-external-user.md`,
  `docs/RELEASE-FOUNDATION-HANDOFF.md`

## Commit hashes (origin/main)

- `3d12e82` — fix(release): external npm CLI installs a bootable dependency closure and supports --help
- `3d5273f` — docs: record external npm CLI full-boot failure and closure-completeness fix
- `b06bca5` — release: bump workspace packages to v0.1.12
- `f3103a4` — feat(release): auto-publish CLI to npm and enforce release/npm version sync
- `e13d980` — docs: record version reconciliation to 0.1.12 and release/npm auto-sync

## Verification command output

- `corepack pnpm --filter acryl-tui run typecheck` → pass.
- Workspace-built CLI boots: `acryl --version` → `0.1.12`, `acryl --help` → usage,
  `acryl tui --json` → `{"mode":"direct","profile":"acryl",...}`, `acryl web --json` → `http://127.0.0.1:3080`.
- Closure derivation validated: 538 pkgs, all five loader entries present, koffi 3.1.5.

## Decisions and assumptions

- The **release tag is the single source of truth** for the version; the
  workspace packages must equal it, and npm is published at exactly that version.
- The `ACRYL_NPM_VERSION` publish override is now rejected if it diverges.
- `tsdown.publish.config.ts` bundles `acryl-control` **and** `acryl-harness-runtime`
  (M1 MAX's local untracked copy bundles the latter; see divergence note).

## Open problems and risks

- **M1 MAX divergence:** M1 MAX is at local `0fefaaf` (ahead 1, behind 6 of
  origin after `git fetch`). `0fefaaf`'s `publish-npm-cli.mjs` matches the
  already-pushed `f8b0605`, but its `docs/npm-test-external-user.md` and
  DEVELOPMENT-LOG entry are not on origin and may conflict with `3d5273f`.
  M1 MAX also has uncommitted `deepseek-harness` (submodule), a spec evidence
  output, and `upstream.json`, plus untracked `.codewhale/`, `.openclaude/`,
  `acryl-tui/lib-publish/`, and its own `acryl-tui/tsdown.publish.config.ts`.
- **Live agents:** do not rebase/reset/force on M1 MAX while the ACRYL TUI
  session (PID 98856), codewhale, and claude are running.
- **tsdown/vitest `.bin` links are broken on AION** (Node 22 + pnpm hoisted), so
  a local external `npm i -g` boot of the fresh artifact could not be re-run
  there; it builds in CI.
- **koffi native load** is intermittent under the loader's concurrent entry
  creation (upstream DSH behavior).

## Exact next recommended task

On M1 MAX (when the current agents are idle or have checked out their work):
`git pull` origin (brings the five commits), then resolve the `npm-test-external-user.md`
/ DEVELOPMENT-LOG conflict between `0fefaaf` and `3d5273f` deliberately, keeping
both the C1 external-user test doc and the version-sync record. Confirm the five
`package.json` read `0.1.12`, then cut tag `v0.1.12` (requires `NPM_TOKEN` as a
GitHub Actions secret) to run the fully-synced CD: GitHub Release at 0.1.12 +
npm `acryl@0.1.12`.
