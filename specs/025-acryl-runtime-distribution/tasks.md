# Tasks: Lean ACRYL npm CLI

The governing scope is [`spec.md`](./spec.md). Complete these tasks and stop.

- [x] T001 Audit direct TUI host imports plus `bootAcrylHarnessProfile` and `bootAcrylWebProfile` Loader/profile rows. Record the shared CLI closure and excluded package rationale in `evidence/tui-web-closure-audit.md`.
- [x] T002 Restore and preserve base `acryl web` grammar, dispatch, shared boot export, and runtime path.
- [ ] T003 Add a minimal closure test asserting the audited manifest retains TUI/Web requirements and excludes Electron/Desktop-native code, Canvas, Market, PNPM/package-management, and audit-proven-unused DSH packages.
- [ ] T004 Replace only `scripts/publish-npm-cli.mjs` maximal dependency flattening with the proven shared TUI + Web closure.
- [ ] T005 Run existing TUI/Web tests; pack the exact candidate; one clean global install must pass installed `acryl --version`, `acryl tui --json`, and `acryl web --json`.

## Deliberately deferred

New Web servers, server/attach/remote runtime, daemon redesign, capability metadata, plugin installer UX, package metrics/budgets, installer abstractions, CI expansion, and Desktop/archive optimization are out of scope.
