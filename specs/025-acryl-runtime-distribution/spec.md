# Feature Specification: Lean ACRYL npm CLI

**Feature:** `025-acryl-runtime-distribution`

## Scope

Make the published `acryl` npm CLI terminal-only.

1. Remove `acryl web` from base CLI dispatch and remove its static Web import.
2. Audit the actual authorization-enabled TUI boot/profile imports.
3. Publish a manifest containing only packages that TUI boot and runtime use.
4. Pack that candidate, install it globally into a clean temporary prefix, and prove `acryl tui --json` works.
5. Stop.

## Acceptance

- The base CLI has no `acryl web` command or static Web boot import.
- The published `acryl` manifest contains only the audited TUI closure.
- A clean global installation of the packed candidate runs `acryl --version` and `acryl tui --json` without workspace symlinks or an installed global fallback.
- The existing authorization-enabled terminal behavior remains covered by current TUI tests.

## Out of Scope

Desktop distribution and optimization, package counts/size/install-time budgets, generic measurement frameworks, cross-platform installer abstractions, release CI expansion, server/attach/remote runtime, capability metadata, and plugin installer UX are deliberately deferred.
