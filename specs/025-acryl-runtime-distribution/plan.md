# ACRYL Terminal Runtime Distribution Plan

**Goal:** Make the real `npm install -g acryl` product terminal-first, measurably lean, and release-gated through a clean install of the packed candidate. Archive and Desktop payload pruning are separate acceptance paths and do not substitute for npm-install evidence.

**Spec:** `specs/025-acryl-runtime-distribution/spec.md`

## Scope and non-goals

This plan contains only terminal npm distribution, target archive verification, and Desktop payload hygiene.

It does not create a generic capability schema, plugin installer/enable UX, Web/Market/Canvas distribution mechanism, shared runtime facade, public Cordis contract, loopback server, `acryl serve`, or `acryl attach`. Those need separate specs with demonstrated user value.

## Baseline and canonical measurement

The v0.1.17 baseline is measured from the published tarball on the release host using a newly created temporary directory for each run. Tarball acquisition (`npm pack` or download) is preparation, uses a separate temporary pack cache, and is explicitly outside timed installation measurement. The measured command is:

```sh
env -i PATH="$PATH" HOME="$work/home" \
  npm_config_prefix="$work/prefix" npm_config_cache="$work/install-cache" \
  npm install --global --ignore-scripts --no-audit --no-fund "$candidate_tarball"
```

Using the same isolated environment, the collector discovers the cross-platform global module root with `npm root --global --prefix "$work/prefix"`, resolves `acryl` below that result, and never assumes a platform-specific prefix layout. The canonical transitive-package metric is the number of distinct package roots reachable under the resolved installed `acryl/node_modules` tree. The collector walks directories deterministically, ignores `.bin` and pnpm metadata, canonicalizes each package root with `realpath`, and deduplicates real paths before counting. It therefore cannot be inflated by symlink aliases or duplicate traversal paths. Manifest count, `npm ls` output, file count, tarball bytes, and install time are informational except where a stated budget applies.

Baseline evidence records platform, Node/npm version, exact command, temporary-prefix/cache policy, direct dependency count, canonical transitive package count, installed files/bytes, tarball bytes, wall time, and installed-binary results. Candidate measurement uses exactly the same procedure.

## Architecture

1. **Measurement first.** `scripts/measure-npm-install.mjs` packs or accepts one candidate tarball, installs it into a fresh prefix/cache/HOME with isolated PATH, measures the installed package tree, and runs the installed binary. Its JSON output is both test fixture and release evidence.
2. **Manifest-level terminal split.** Identify the authorization-enabled TUI Loader rows and imports required at boot. Create distinct TUI-core and Web manifests/entrypoints. Base `acryl` declares only TUI-core packages. Removing a static Web import alone is insufficient: both the package manifest and installed tree must reject the excluded package IDs.
3. **Prove then publish.** Only after the split passes a clean tarball install may `publish-npm-cli.mjs` replace maximal deployed-manifest flattening with the explicit terminal closure. The clean installed `tui --json` smoke proves Loader/package declarations remain complete.
4. **Separate payload checks.** Native/map pruning and Desktop locale pruning continue behind artifact manifest checks. They do not change npm package-count acceptance.

## Exact base-closure exclusions

The base `acryl` package manifest and its installed `acryl/node_modules` tree must exclude these package-ID families:

- `@deepseek-ai/dsh-web`, `@deepseek-ai/dsh-web-*`, and `@deepseek-ai/dsh-client-*`
- `dsh-community-market`
- `acryl-development-canvas`
- `pnpm`
- `@deepseek-ai/dsh-host-webserver`, `@deepseek-ai/dsh-host-apiproxy`, and `@deepseek-ai/dsh-host-frontend-static`

The closure test must validate both manifest dependency keys and installed package root IDs. Any package that becomes necessary for terminal behavior must be explicitly justified in terminal-closure evidence before the exclusion list changes.

## Implementation phases

### Phase 1 - Evidence and guards

- Record the v0.1.17 published-tarball baseline.
- Implement and test deterministic clean-install measurement, including realpath de-duplication.
- Add comparison budgets and candidate-tarball acceptance.
- Replace local-source/symlink entrypoint verification with the clean-install test.

**Exit gate:** a generated JSON record proves the actual globally installed candidate invokes `--version` and `tui --json` in isolation.

### Phase 2 - TUI manifest closure

- Map existing TUI Loader rows and imports to terminal ownership.
- Split TUI-core and Web manifests/entrypoints and remove/defer base `acryl web` dispatch.
- Assert excluded package IDs are absent from both the base manifest and clean installed tree.
- Update publishing only after the clean candidate validates no missing terminal Loader module.

**Exit gate:** base npm tarball is materially smaller and lower-count than v0.1.17 while existing authorization-enabled terminal behavior remains green.

### Phase 3 - Artifact and release enforcement

- Retain target-native/map pruning and Desktop locale/payload checks.
- Run the candidate tarball measurement in release CI immediately before npm publish with `npm_config_prefix`, `npm_config_cache`, isolated HOME/PATH, and a fresh temporary work directory.
- Upload the emitted measurement JSON as a workflow artifact and fail budget regressions.

**Exit gate:** the same tarball CI would publish has clean-install evidence plus archive and Desktop evidence.

## Verification

- Focused Node/Vitest tests for measurement, symlink de-duplication, closure exclusions, and artifact verifiers.
- Existing authorization and TUI command regressions, including `--version` and `tui --json`.
- Clean candidate-tarball global install with isolated `HOME`, `PATH`, prefix, and npm cache.
- Archive no-host-Node smoke and Desktop package tests remain independent checks.

## Change discipline

Keep focused implementation commits. After each implementation commit, add its canonical hash and evidence to `docs/DEVELOPMENT-LOG.md` in a separate documentation commit. Do not modify `deepseek-harness/`.
