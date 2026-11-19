# Tasks: Core primitives

- [x] T101 Package scaffold `packages/core` (package.json, tsdown config, tsconfig paths, vitest alias)
- [x] T102 `errors.ts` and `internal/name.ts`
- [x] T103 `service.ts` with type tests
- [x] T104 `disposable.ts` (`DisposerStack`, `Owner`) with LIFO, error aggregation, idempotence tests
- [x] T105 `hooks.ts` (`Hooks`, `ScopedHooks`) with serial, parallel, once, count, owner tests
- [x] T106 `registry.ts` (`registry`, `RegistryStore`, view, events) with ownership tests
- [x] T107 `index.ts` exports, TSDoc on every export
- [x] T108 `pnpm run check` green; checkpoint pushed
- [x] T109 Boundary test: core imports only relative modules, `hookable` and `cordis`; no Node-only imports; no vendor words

## Findings during implementation

- A registry `add()` through an already-disposed owner first published the entry and then failed to register ownership, leaving a leaked entry. Fixed by taking ownership before publishing; the test asserts `total() === 0`. (Found because the first version of that test was a tautology; the assertion was rewritten to check the real post-condition.)
