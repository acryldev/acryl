# Tasks: Effect bridge and Unplugin

- [x] T601 Scaffold `packages/effect` and `packages/unplugin`, install deps
- [x] T602 `bindings.ts`, `runtime.ts`, `layer.ts`
- [x] T603 Effect bridge tests (layer round trip, finalizer order, failure rollback, interruption, types)
- [x] T604 Unplugin factory, virtual modules, strict mode
- [x] T605 Bundler tests (Rollup, Rolldown, esbuild)
- [x] T606 `pnpm run check` green; checkpoint pushed

## Findings during implementation

- **Detached methods crashed** (`createEffectRuntime(ctx.get, ...)`): context methods used `this` with private fields. Contexts now bind their methods, so `const { get, provide } = ctx` is safe (core test added). Found by writing the first realistic Effect bridge call.
- **esbuild portability**: `addWatchFile` is only allowed inside `resolveId`, `load` and `transform` under esbuild, and `this.warn` from `resolveId` is forwarded only when the hook returns a result. The Unplugin registers the watch file from `resolveId`, emits the non-strict warning when a virtual module is resolved, and falls back to `console.warn` at `buildEnd`.
- **Strict mode** fails the build by throwing from `buildStart` (works in every bundler); `this.error` is not available there.
- **pnpm 12** fails installs on ignored build scripts; `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml` records the approval.
- **Loader test portability**: the bare-package loader test used the built `@aimbrace/core`; it now generates fake packages (including an ESM-only one) so `pnpm test` works on a fresh clone.
- Effect `Context<in R>` is contravariant, so dynamic assembly needs erased contexts; the cast lives in `bindings.ts` only.
- **Broken entry points caught late**: packages built with `platform: node` emitted `.mjs` while `package.json` pointed at `.js`; every test ran from source so nothing noticed. `fixedExtension: false` fixes the build, and `scripts/verify-packages.mjs` (now part of `pnpm run check`) checks that every `main`, `types` and `exports` target exists after the build and that each package imports from `dist`. The guard was shown to fail on a deliberately renamed file.
