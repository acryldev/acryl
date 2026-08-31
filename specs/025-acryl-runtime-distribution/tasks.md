# Tasks: ACRYL Terminal Runtime Distribution

**Scope gate**: This milestone ends after a demonstrably lean, terminal-first npm package and its archive/Desktop payload safeguards. Web, Market, Canvas, generic capability schemas, remote session façades, `serve`, and `attach` are deferred.

## Phase 1 - Baseline and release evidence

- [x] T001 Record the v0.1.17 npm baseline in `evidence/npm-install-baseline-v0.1.17.md`: platform, Node/npm versions, fresh-prefix/fresh-cache command, direct dependencies, canonical installed package count, files, installed bytes, tarball bytes, elapsed wall time, and installed-binary checks.
- [x] T002 Add `scripts/measure-npm-install.mjs` and tests. It installs a packed tarball into a newly created prefix/cache/HOME, discovers the installed root through isolated `npm root --global`, collects metrics, and runs the installed `acryl --version` and `acryl tui --json`.
- [ ] T003 Add an npm evidence assertion with explicit package-count, installed-byte, and wall-time budgets against the v0.1.17 baseline.
- [x] T004 Add artifact-manifest tests and `scripts/inspect-artifact.mjs` for required paths, forbidden paths, foreign native payload, and byte budgets.
- [ ] T005 Implement archive extraction verification and run it in release CI before upload.
- [ ] T006 Replace the source-symlink `scripts/verify-npm-entrypoint.mjs` gate with the candidate-tarball clean-install gate. Keep it separate from portable archive acceptance.

## Phase 2 - Terminal manifest and Loader closure split

- [ ] T007 Map the current TUI Loader rows and imports to the minimal authorization-enabled terminal closure. Add a failing manifest/closure test asserting Web/client UI, Market/package-manager, Canvas, and Desktop packages are absent.
- [ ] T008 Split TUI-core and Web package manifests/entrypoints. The base `acryl` manifest may contain only the proven terminal closure; do not add install/enable/plugin-manager UX.
- [ ] T009 Remove/defer `acryl web` from base CLI dispatch and ensure `acryl-tui/src/cli/run.ts` has no static Web boot import. Update CLI regression tests without weakening `--version`, `tui --json`, or authorization coverage.
- [ ] T010 Update the terminal Loader declarations/profile only as required by the manifest split, then prove a clean installed tarball has no `MODULE_NOT_FOUND`.
- [ ] T011 Change `scripts/publish-npm-cli.mjs` only after T007-T010 prove the explicit terminal closure. It must no longer flatten the maximal deployed workspace closure.

## Phase 3 - Release gates and payload reductions

- [x] T012 Implement CLI foreign-native pruning and source-map removal with focused tests.
- [x] T013 Implement Desktop foreign-native pruning, owned source-map exclusion, and Electron locale reduction with focused tests.
- [ ] T014 Add the candidate-tarball clean-install measurement gate to `.github/workflows/release.yml` immediately before npm publish, persist its evidence, and fail release budgets.
- [ ] T015 Build and inspect one target CLI archive, run no-host-Node readiness, record comparable size evidence, and enforce its artifact manifest.
- [ ] T016 Build a comparable Desktop artifact, run its existing package verification, record its size evidence, and enforce its artifact manifest.

## Phase 4 - Completion

- [ ] T017 Run terminal package build/typecheck/tests, clean tarball install, installed binary smoke, archive smoke, Desktop package checks, and relevant workspace checks.
- [ ] T018 Update release documentation to state that base `acryl` is terminal-only and richer surfaces remain separate Desktop-owned products. Do not document a future installer/server as shipped.
- [ ] T019 Update `docs/DEVELOPMENT-LOG.md` in a separate checkpoint using canonical implementation commit hashes.
- [ ] T020 Reconcile evidence and mark only completed tasks. Any optional-surface/server work must start a new future spec.

## Dependencies

- T001-T006 create the measurement contract before size claims.
- T007-T011 prove the manifest-level terminal split before reducing npm dependencies.
- T014 cannot land until T002-T003 exist and must block npm publication.
- T015-T16 are separate archive/Desktop acceptance and do not substitute for the npm clean-install gate.
