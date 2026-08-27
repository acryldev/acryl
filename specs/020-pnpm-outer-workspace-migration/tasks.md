# Tasks: ACRYL Outer PNPM Workspace Migration

**Input**: [spec.md](spec.md)

## Dependencies

```text
Ledger approval -> PNPM configuration and patch translation -> clean install -> automated checks -> Electron build -> manual GUI smoke -> migration commit -> development-log checkpoint
```

## Task ledger

- [ ] T001 Write `plan.md` with the exact mapping from each root Yarn file, patch, script, native build approval, and architecture setting to its PNPM replacement. Verify that the plan contains no changes under `deepseek-harness/`.
- [ ] T002 Create the root PNPM workspace configuration with only ACRYL-owned workspace paths, a pinned PNPM release, isolated linker policy, explicit native build permissions, and supported macOS architecture configuration.
- [ ] T003 Translate the committed root Yarn patches into PNPM patches and update the relevant dependency declarations so each patch is applied from the root PNPM configuration.
- [ ] T004 Replace root Yarn scripts, CI configuration, repository checks, and developer documentation with `corepack pnpm` commands while preserving `upstream:*` commands that enter the independent Harness submodule.
- [ ] T005 Generate the root `pnpm-lock.yaml`, remove obsolete root Yarn files, and prove a clean frozen PNPM installation does not modify the Harness submodule.
- [ ] T006 Run focused root typecheck, tests, layout/architecture checks, and build through PNPM. Record exact commands and results in `evidence/verification.md`.
- [ ] T007 Build the Electron application through PNPM and have the product owner complete a manual GUI smoke test covering application launch, profile boot, window rendering, and clean close. Record the outcome in `evidence/verification.md`.
- [ ] T008 Commit the implementation, then add its full commit hash and verification outcome to `docs/DEVELOPMENT-LOG.md` in a separate documentation commit.
- [ ] T009 Push the implementation and development-log commits only after every acceptance criterion in `spec.md` is evidenced.
