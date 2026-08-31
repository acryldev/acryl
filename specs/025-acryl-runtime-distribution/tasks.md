# Tasks: Lean ACRYL npm CLI

The governing scope is [`spec.md`](./spec.md). Complete these tasks and stop.

- [ ] T001 Audit `acryl-tui/src/cli/run.ts`, the authorization-enabled TUI profile, and Loader imports. Record the minimal terminal package closure.
- [ ] T002 Add a failing CLI regression test proving base `acryl` has no `web` dispatch and no static Web boot import.
- [ ] T003 Remove `acryl web` from base CLI dispatch and split/remove its Web-only entrypoint from the base npm package.
- [ ] T004 Change `scripts/publish-npm-cli.mjs` only after T001-T003 identify the exact terminal closure. Do not flatten every deployed production manifest.
- [ ] T005 Run existing TUI tests, pack the exact candidate, install it globally into one clean temporary prefix, and prove installed `acryl --version` plus `acryl tui --json`.

## Deliberately deferred

Desktop work, package/size/time budgets, generic measurement tooling, CI evidence machinery, server/attach/remote runtime, capability metadata, and plugin installer UX are out of scope.
