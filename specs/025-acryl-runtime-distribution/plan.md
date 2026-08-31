# Lean ACRYL npm CLI Plan

The governing scope is [`spec.md`](./spec.md).

1. Read `acryl-tui/src/cli/run.ts`, the TUI profile, and Loader rows to identify the packages TUI boot actually requires.
2. Write a regression test that fails while base CLI dispatches `web` or statically imports Web boot.
3. Remove base Web dispatch/import and update the TUI package/publish assembly so it declares only the audited terminal closure.
4. Run existing TUI authorization and command tests.
5. Pack the exact candidate package, run one clean `npm i -g <tarball>` into a temporary prefix, then run the installed `acryl --version` and `acryl tui --json`.

Desktop packaging, archive optimization, budgets, generic evidence tooling, CI changes, and runtime architecture are deliberately deferred.
