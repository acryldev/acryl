# Tasks: Plugin model and dependency graph

- [x] T201 `standard-schema.ts` (vendored interface, `validateStandard`)
- [x] T202 `semver.ts` with tests (parse, satisfies, prerelease rule)
- [x] T203 error classes: DuplicatePluginError, DuplicateProviderError, MissingDependencyError, DependencyCycleError, PeerError, GraphValidationError
- [x] T204 `core-hooks.ts` and `context.ts` type contracts
- [x] T205 `plugin.ts` (`definePlugin`, callable plugin, metadata, freezing) with runtime and type tests
- [x] T206 `graph.ts` build, validate, order
- [x] T207 exporters: text, Mermaid, DOT, JSON with snapshot tests
- [x] T208 performance test (1,000-plugin chain under 200 ms)
- [x] T209 `pnpm run check` green; checkpoint pushed

## Findings during implementation

- The negative type tests were verified, not trusted: a probe file that calls `ctx.get` on an undeclared token fails `tsc` (the compiler message is `Argument of type 'ServiceToken<...>' is not assignable ...`, which is accurate but not friendly; improving the diagnostic is a docs and DX follow-up).
- The boundary test from M1 caught two vendor words inside TSDoc examples (`postgres`, `openai`). Examples now use neutral names.
- Explicit provider override (two plugins, one wins) is not implemented; a duplicate provider is an error. Recorded as deferred in FR-207.
