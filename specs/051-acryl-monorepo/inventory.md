# Spec 051 inventory - what is where, measured 2026-11-18

First pass of Phase 1. Every number below came from a command against the repositories on 2026-11-18 (acryldev/acryl `origin/main`
8394d2b1, acrylblends/acrylblends `main` 1a976364). Re-run before acting on it.

## 1. The framework's ports of acryl packages (`framework/ide/*`)

Each port carries a `provenance.json` naming the acryl commit it came from. "Changed in acryl since" counts acryl commits that touched the
source after that commit, measured with `git rev-list --count <commit>..origin/main -- <source>` and `git diff --shortstat`.

| Port in `framework/ide/` | acryl source @ commit | acryl commits since | acryl diff since |
|---|---|---|---|
| acryl-app-context | plugins/acryl-plugin-context @ f6538891 | 3 | 5 files, +76 -13 |
| acryl-app-shell | plugins/acryl-app-shell @ 37f4dd9c | 1 | 1 file, +2 |
| acryl-brand | plugins/acryl-brand @ 37f4dd9c | 0 | none |
| acryl-control | runtime/acryl-control @ 37f4dd9c | 6 | 2 files, +3 -1 |
| acryl-diagnostics | runtime/acryl-diagnostics @ 37f4dd9c | 1 | 1 file, +3 -1 |
| acryl-loopback-http | runtime/acryl-loopback-http @ 37f4dd9c | 1 | 1 file, +3 -1 |
| acryl-plugin-admin | plugins/acryl-plugin-admin @ 37f4dd9c | 1 | 1 file, +2 |
| acryl-settings | plugins/acryl-settings @ 37f4dd9c | 1 | 1 file, +2 |
| acryl-shortcuts | plugins/acryl-shortcuts @ 37f4dd9c | 1 | 1 file, +2 |
| acryl-sign-in | plugins/acryl-sign-in @ dbf6cf7d | 1 | 1 file, +2 |
| acryl-support | plugins/acryl-support @ 37f4dd9c | 1 | 1 file, +2 |
| acryl-system-prompt | plugins/acryl-system-prompt @ f6538891 | 1 | 1 file, +1 -1 |
| acryl-ui | plugins/acryl-ui @ 37f4dd9c | 1 | 1 file, +3 -1 |
| acryl-web-service | runtime/acryl-harness-runtime/src/engine-web.ts, runtime/acryl-control/src/platform/web.ts @ 37f4dd9c | 0 | none |
| acryl-workspace | plugins/acryl-workspace @ 37f4dd9c | 2 | 2 files, +2 -2 |
| acryl-blends-frame, acryl-versions, dsh-client-ui-brand-acryl | written in acrylblends (no acryl source) | - | - |

**Reading:** acryl's side has barely moved since the ports (mostly one `package.json` line each); the real differences are the changes the
ports made, which each `provenance.json` lists under `changes`. So merging each pair into one package (T008) is a review of those listed
changes, not a three-way merge of two living codebases. `plugins/acryl-plugin-context` is the one with real acryl-side work to carry over.

## 2. Copies inside Blend repositories

| Blend | Copied from the framework (by `acrylblends upgrade`, recorded in `plugins/library.lock.json`) | Copied by hand |
|---|---|---|
| 05-acryl-ade | acryl-door, acryl-node-server, acryl-page, acryl-router, acryl-web-server, desktop, extensions, instance, manifest, plugin-share, sandbox, save | - |
| 63-acryl-control-center | the same twelve | `plugins/acryl-launcher-host/launcher-lib/` (8 files): acryl's `plugins/acryl-launcher` built and rewritten with `sed` |

The library copies are tracked (upgrade refreshes them), but each fix still travels as an npm release plus an upgrade commit plus a product
tag per Blend. The launcher copy is the one untracked hand copy: it is the first thing Phase 3 removes.

## 3. Package-manager setups

| | acryl (`origin/main`) | framework (acrylblends) |
|---|---|---|
| pnpm | 11.11.0 (`packageManager`) | 12.4.2 |
| node | ^22.19.0 \|\| >=24.0.0 | >=22.19.0 |
| node-linker | isolated (`.npmrc`) | default |
| workspace | `pnpm-workspace.yaml`, explicit package list | `packages/*`, `plugins/acryl-*`, `ide/*`, `allowBuilds`, `minimumReleaseAgeExclude` |

Merging the workspaces (T005) needs one pnpm release (the owner's local checkout already moves acryl toward pnpm 12), one node range (the
narrower acryl one), and a decision on `node-linker` for the framework's packages. That is the first concrete Phase 2 blocker.

## 4. acryl's guards on the imported code

`node scripts/verify-layout.mjs` passed before the import and failed after it on `framework/workshop-registry/test/archives.test.mjs`. The
file does clean up, with node:test's `after()`, which the guard did not recognise. The guard now accepts `after` too, and passes with the
framework inside. Other root checks (biome, typecheck, the bilingual-docs and architecture checks) have not been run against `framework/` yet
(T006).

## 5. Name clashes (why the workspaces cannot simply be joined)

The root `pnpm-workspace.yaml` lists 39 acryl packages and the framework's lists 34. Fifteen names appear in both, which pnpm refuses in one
workspace. They are exactly the ports in section 1: `@acryl/ui`, `acryl-app-shell`, `acryl-brand`, `acryl-control`, `acryl-diagnostics`,
`acryl-loopback-http`, `acryl-plugin-admin`, `acryl-settings`, `acryl-shortcuts`, `acryl-sign-in`, `acryl-support`, `acryl-system-prompt`,
`acryl-web`, `acryl-workspace`, `dsh-client-ui-brand-acryl`. So T008 (one package per pair) comes before T005 (one workspace). Renaming one side
instead would only rename the duplication.
