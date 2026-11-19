# Tasks: Reference AI plugins and examples

- [x] T801 `plugin-model`: types, Model service, ModelProviders registry, scripted and mock providers, hooks, tests
- [x] T802 `plugin-memory`: Memory service, task memory, hooks, tests
- [x] T803 `plugin-tools`: Tool, registry, runner (validation, errors, timeout), calculator and clock, tests
- [x] T804 `plugin-agent`: Budget, run loop in a task scope, cancellation, hooks, tests
- [x] T805 `examples/agent-cli` with tests through `runCli`
- [x] T806 `examples/http-agent` with tests under both hosts
- [x] T807 `pnpm run check` green; checkpoint pushed

## Findings during implementation

- **A bare plugin with a config schema failed to start.** A plugin used without config passes `undefined` to its schema and `v.object(...)` rejects it. This also affected `honoHost` and `fastifyHost` used without arguments. The pattern is `v.optional(shape, v.getDefaults(shape))` (valibot does not run inner defaults for an outer `optional` default). Applied to the host config and every new plugin, with tests for bare use. The guide `write-a-plugin` must say so.
- **Scope-open race in core.** When an external `AbortSignal` fired while `scope()` was still opening, core returned an already-disposed scope and the next use threw `DisposedError`. `scope()` now rejects with the abort reason and leaves nothing behind (core test added). Found by `cancelAll()` in the agent tests.
- `Agent.cancel(id)` returns `false` for a run that is not in flight or is already being cancelled.
- `RunOptions.id` lets a caller choose the run id; the HTTP example passes the request id so the request scope `request:<id>` and the task scope `task:<id>` are linked, and a client disconnect cancels the run (tested on both hosts).
- **Examples are integration tests of the built packages.** Bare specifiers in `aimbrace.config.mjs` resolve to each package's `dist`, like a real project. They run through `vitest.examples.config.ts` (`pnpm run test:examples`), which `check` runs after the build. Unit tests keep using source aliases and need no build.
- The cross-host comparison first failed on a real timestamp from the `clock` tool, not on any host difference; timestamps are normalised in that comparison only.
- Calculator: parsed with a recursive descent parser; the tests include injection-looking input (`process.exit()`), `**`, unbalanced parentheses and overflow.
- Budget semantics: checked before each model call, so the last call may overshoot; a finished answer is never discarded because it overshot.
