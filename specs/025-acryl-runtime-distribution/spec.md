# Feature Specification: Lean ACRYL npm CLI

**Feature:** `025-acryl-runtime-distribution`

## Scope

Make published `acryl` a focused, self-contained coding-agent product:

```sh
npm i -g acryl
acryl
acryl web
```

The base CLI contains the terminal TUI and existing shared local Web host, plus only runtime dependencies actually used by either. `acryl-desktop` remains a separately distributed Electron/Desktop shell that reuses that shared Web host and owns Desktop-only features.

## Acceptance

- `acryl web` remains a supported base CLI command and uses the existing shared `bootAcrylWebProfile` implementation.
- The published npm manifest contains only dependencies proven by a TUI plus Web-host import/profile audit.
- Electron/Desktop-native code, Development Canvas, Market, PNPM/package-management, and unused DSH providers/tools/client bundles are excluded unless the audit proves one is required by TUI or Web host.
- One clean installation of the exact packed candidate runs `acryl --version`, `acryl tui --json`, and `acryl web --json` without workspace symlinks or a global fallback.

## Out of Scope

New Web servers, server/attach/remote runtime work, daemon redesign, capability metadata, plugin installer UX, package metrics/budgets, cross-platform installer abstractions, release CI expansion, and Desktop/archive optimization are deliberately deferred.
