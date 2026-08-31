# Lean ACRYL npm CLI Plan

The governing scope is [`spec.md`](./spec.md).

1. Audit `acryl-tui` direct-host imports, `bootAcrylHarnessProfile`, `bootAcrylWebProfile`, and the profiles/Loader rows they compose. Record the packages genuinely required by either TUI or the existing shared Web host.
2. Keep `acryl web` grammar, dispatch, and `bootAcrylWebProfile` unchanged. Do not create another server.
3. Replace only `publish-npm-cli.mjs` maximal deployed-manifest flattening with the audited shared closure. Do not remove a package until the import/profile audit proves it unused.
4. Pack the exact candidate, install it once into a clean temporary global prefix, then run installed `acryl --version`, `acryl tui --json`, and `acryl web --json`.
5. Stop.

Desktop-native functionality, Development Canvas, Market, PNPM/package-management, unused DSH bundles, runtime architecture, budgets, CI expansion, and installer abstractions remain outside this cleanup unless the import/profile audit proves a shared CLI requirement.
