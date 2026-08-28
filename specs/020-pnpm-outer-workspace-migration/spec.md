# Feature Specification: ACRYL Outer PNPM Workspace Migration

**Feature Directory**: `specs/020-pnpm-outer-workspace-migration`
**Created**: 2026-08-27
**Status**: In verification
**Input**: Replace the outer ACRYL Yarn workspace with PNPM before the pi-tui integration, while preserving the pinned DeepSeek Harness submodule as an independent upstream PNPM workspace.

## Objective

Give ACRYL one package-manager model across its product workspaces and the embedded Harness source without coupling their dependency graphs. The outer repository must retain reproducible dependency resolution, patch ownership, Electron native-module installation, universal macOS packaging support, and all existing build and verification paths.

## Scope

### In scope

- Replace root Yarn metadata, configuration, lockfile, scripts, and documentation with PNPM equivalents.
- Create a root `pnpm-workspace.yaml` that contains only ACRYL-owned workspaces and excludes `deepseek-harness/`.
- Translate every root Yarn patch resolution into PNPM patched-dependency configuration.
- Translate root native build policy and universal macOS architecture configuration to supported PNPM configuration.
- Update root commands, CI, repository checks, and developer documentation to run the outer workspace through Corepack PNPM.
- Verify clean installation, typecheck, tests, headless checks, build, and Electron packaging paths.
- Record the completed migration, canonical commit hash, and verification evidence in `docs/DEVELOPMENT-LOG.md` after the implementation commit.

### Out of scope

- Changing any file inside `deepseek-harness/`.
- Combining the outer and upstream workspaces into one lockfile or dependency graph.
- Updating the pinned Harness revision or published DSH runtime family.
- Adding pi-tui or importing `dsh-pi-tui` application code.
- Changing ACRYL product behavior, profile semantics, or Electron UI behavior.

## User Scenarios and Testing

### User Story 1 - Reproducible product development environment

As an ACRYL contributor, I can install and run the outer repository through its pinned PNPM version without Yarn, while the embedded Harness remains an unchanged independent upstream checkout.

**Independent test**: In a clean dependency state, `corepack pnpm install --frozen-lockfile` completes at the root and `corepack pnpm run upstream:version` reports the submodule's own PNPM version without modifying its working tree.

**Acceptance scenarios**:

1. **Given** a fresh ACRYL checkout with initialized submodules, **when** a contributor runs the documented root install command, **then** PNPM installs every ACRYL-owned workspace from the committed root lockfile.
2. **Given** the same checkout, **when** a contributor runs an upstream command, **then** the command enters `deepseek-harness/` and uses its committed PNPM workspace without changing its package-manager files.
3. **Given** a patched outer dependency, **when** PNPM installs the workspace, **then** the committed outer patch is applied and its focused consumer check passes.

### User Story 2 - Preserved Electron delivery

As an ACRYL user, I receive the same Electron application artifacts after the package-manager migration.

**Independent test**: A clean PNPM workspace builds the Electron application and produces the existing development or package artifact without native-module resolution failures.

**Acceptance scenarios**:

1. **Given** the PNPM outer workspace, **when** the root build runs, **then** every owned workspace builds using PNPM commands.
2. **Given** an Electron development launch, **when** native dependencies load, **then** Electron, `node-pty`, and other approved native modules resolve for the host architecture.
3. **Given** a macOS distribution build, **when** Electron Builder packages both supported macOS CPU architectures, **then** the required native dependency artifacts are present.

## Requirements

- **FR-001**: The outer root MUST pin one PNPM version through `packageManager` and Corepack.
- **FR-002**: The root PNPM workspace MUST include only ACRYL-owned package paths and MUST exclude `deepseek-harness/`.
- **FR-003**: The migration MUST remove root Yarn lock, configuration, and command references after their PNPM replacements are verified.
- **FR-004**: Every currently committed root dependency patch MUST remain explicit, reproducible, and covered by the same focused verification after translation.
- **FR-005**: Native dependency build permission and supported architecture policy MUST be explicit and reproducible under PNPM.
- **FR-006**: The root workspace MUST use PNPM's isolated dependency layout unless Electron packaging evidence proves a documented compatibility exception is required. The current exception is the root hoisted linker: existing published DSH Web packages expose React 18 type references while `acryl-tui` owns React 19 types.
- **FR-007**: Root scripts and documentation MUST use `corepack pnpm`; upstream scripts MUST enter the submodule and invoke its own pinned PNPM release.
- **FR-008**: The migration MUST NOT modify `deepseek-harness/` or its Git submodule pointer.
- **FR-009**: The pi-tui integration MUST begin only after this migration's focused checks, Electron build, and manual GUI smoke test have passed.

## Success Criteria

- `corepack pnpm install --frozen-lockfile` succeeds from a clean outer dependency state.
- Root typecheck, test, architecture/layout checks, and build pass through PNPM.
- The unchanged upstream Harness command path passes through the submodule's own PNPM workspace.
- A developer launches and manually verifies the Electron GUI from the PNPM workspace.
- `git diff -- deepseek-harness/` is empty before and after the migration.
