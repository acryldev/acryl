# ACRYL Outer PNPM Workspace Migration Implementation Plan

> **For agentic workers:** Execute in focused commits. Do not modify `deepseek-harness/`; it remains an independent upstream PNPM workspace.

**Goal:** Replace the outer ACRYL Yarn workspace with a reproducible PNPM workspace while preserving patch, native-module, Electron packaging, and upstream-boundary behavior.

**Architecture:** The root owns its own PNPM workspace and lockfile. `deepseek-harness/` remains excluded from that workspace and keeps its own PNPM metadata, lockfile, and dependency graph. Root configuration records patches, build permissions, and universal macOS CPU installation policy explicitly.

**Tech Stack:** Node 22+, Corepack, PNPM 11.7.0, Electron Builder, Yarn-to-PNPM patch migration.

**Spec:** [spec.md](spec.md)

## Global Constraints

- Do not edit, install into, or change the Git link for `deepseek-harness/`.
- Use PNPM's isolated linker unless Electron evidence requires a documented exception.
- Preserve every root dependency patch and native build policy.
- Run only run-once checks.
- Do not update `docs/DEVELOPMENT-LOG.md` until the implementation commit hash exists.

---

### Task 1: Establish outer PNPM metadata and the workspace boundary

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc` if a repository-level PNPM setting cannot be represented in the workspace file
- Modify: `package.json`
- Modify: `scripts/verify-layout.mjs`
- Test: `scripts/verify-layout.test.mjs` or the existing layout test entry point

**Produces:** Root PNPM 11.7.0 metadata with the seven owned workspaces, explicit exclusion of `deepseek-harness/`, a documented hoisted-linker exception for the existing React 18/React 19 DSH Electron peer graph, supported macOS CPU architectures, package override, patch registry, and native build permissions.

- [ ] Write a failing layout test for PNPM root metadata and an unchanged upstream package-manager boundary.
- [ ] Create the PNPM workspace configuration and translate the root package-manager field, resolutions, native build metadata, and workspace scripts.
- [ ] Update the layout validator so it rejects root Yarn metadata and validates the PNPM policy.
- [ ] Run the focused layout test and `corepack pnpm run check:layout`.
- [ ] Commit only the configuration and layout-gate changes.

### Task 2: Translate package scripts, workspace links, patches, and CI

**Files:**
- Modify: root and owned workspace `package.json` files that invoke Yarn
- Modify: `scripts/dev-local.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release-candidate.yml`
- Move: `.yarn/patches/dshmarket-npm-1.17.1-d9fe6da08c.patch` to `patches/`
- Modify: package/release scripts and tests that assert Yarn paths

**Produces:** All outer commands use `corepack pnpm`, all owned workspace dependencies resolve through `workspace:*`, and every patch is accepted by PNPM.

- [ ] Write failing focused tests for PNPM command construction and root package-manager assertions.
- [ ] Replace Yarn workspace invocation with PNPM filter invocation without changing command order or package boundaries.
- [ ] Translate each patch through PNPM's patch mechanism and preserve its tested content.
- [ ] Update CI cache/install keys and frozen-install commands for PNPM while retaining submodule initialization.
- [ ] Run affected package, script, and workflow syntax tests.
- [ ] Commit command, patch, CI, and test translation together.

### Task 3: Generate the locked dependency graph and remove Yarn artifacts

**Files:**
- Create: `pnpm-lock.yaml`
- Delete: `yarn.lock`
- Delete: `.yarnrc.yml`
- Delete: obsolete tracked `.yarn/` artifacts
- Modify: `.gitignore` if it names Yarn-only files

**Produces:** A clean outer PNPM installation which leaves the upstream submodule untouched.

- [ ] Run `corepack pnpm install` after configuration and patch translation.
- [ ] Fix only dependency declarations or patch metadata required for a reproducible installation.
- [ ] Run `corepack pnpm install --frozen-lockfile` from the clean installed state.
- [ ] Assert `git diff --exit-code -- deepseek-harness/`.
- [ ] Commit lockfile and removal of obsolete Yarn artifacts.

### Task 4: Update active developer documentation and package-boundary policy

**Files:**
- Modify: active root and package READMEs, contributor documentation, CI/PR instructions, architecture documentation, and the active pinned-upstream package-boundary Agent Note
- Modify: their active translation metadata and translations where required
- Test: documentation and layout checks

**Produces:** Contributors receive only correct Corepack PNPM commands, while upstream instructions explicitly remain PNPM commands executed inside the submodule.

- [ ] Replace active root Yarn installation, build, test, release, and workspace command examples with PNPM equivalents.
- [ ] Preserve historical evidence in completed specifications and development-log entries.
- [ ] Amend the active package-boundary decision documentation to describe two independent PNPM workspaces.
- [ ] Run documentation, translation, and layout checks.
- [ ] Commit documentation and policy updates.

### Task 5: Verify delivery and complete the evidence record

**Files:**
- Create: `specs/020-pnpm-outer-workspace-migration/evidence/verification.md`
- Modify: `docs/DEVELOPMENT-LOG.md` after the implementation commit

**Produces:** Automated verification evidence, owner-confirmed GUI smoke result, a separate development-log commit, and a clean pushed branch.

- [ ] Run clean frozen install, upstream-version, layout, typecheck, test, build, and root check through PNPM.
- [ ] Run the smallest supported Electron packaging smoke and inspect its output.
- [ ] Ask the product owner to launch the Electron app, open a profile, verify window rendering, and close it cleanly.
- [ ] Record exact automated output and the owner-provided GUI result in the evidence file.
- [ ] Commit implementation evidence, then add the implementation hash and result to `docs/DEVELOPMENT-LOG.md` in a separate commit.
- [ ] Push only after every acceptance criterion is evidenced.
