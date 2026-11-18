# Feature Specification: Testing package and CLI host

**Milestone**: M7 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

`@aimbrace/testing` makes the framework's own discipline (start, stop, assert nothing leaked) a
one-liner for plugin authors. `@aimbrace/cli` is the command-line host: built-in commands for the
graph, validation and running an app, plus **a `Commands` registry any plugin can contribute to**, so
the CLI is one more host for the same plugin contract.

## User Scenarios & Testing

### User Story 1 - Test a plugin in three lines (P1)

`await withApp({ plugins }, async (app) => { ... })` starts the app, runs the test body, stops, and
**fails if anything leaked** (plugins, scopes, services, hooks, registry entries, fibers).

### User Story 2 - Stub services and watch the lifecycle (P2)

`mockService(token, value)` is a plugin that provides a fixed value. `recordHooks(app)` records every hook call.

### User Story 3 - Inspect a project from the terminal (P1)

`aimbrace graph [--format text|mermaid|dot|json]`, `aimbrace check` (graph + configs, no `setup` runs),
`aimbrace plugins` (installed plugin packages).

### User Story 4 - Run an app (P1)

`aimbrace run` loads the config, starts the app, lists plugin states, waits for SIGINT/SIGTERM, stops in
reverse order. `--once` starts and stops (smoke test). Exit code 1 on start failure with the typed error message.

### User Story 5 - Plugins contribute commands (P2)

A plugin adds `{ name, run(ctx) }` to the `Commands` registry. `aimbrace <name> ...` starts the app, runs the
command inside a scope (`ctx.scope`, with `ctx.scope.get(Service)`), stops the app, and exits with the command's code.
`aimbrace commands` lists them.

### User Story 6 - Scaffold (P3)

`aimbrace init [dir]` writes `aimbrace.config.mjs`, `plugins/hello.mjs` and, if absent, `package.json`; it never overwrites.

## Requirements

- **FR-701**: `withApp` MUST stop the app and assert a clean leak probe even when the body throws; a leak error MUST list the non-zero counters.
- **FR-702**: `runCli(argv, io)` MUST be testable: output through `io.stdout/stderr`, cancellation through `io.signal`, no `process.exit` inside.
- **FR-703**: Built-in command names are reserved; a plugin command with a reserved name is an error at registration.
- **FR-704**: `check` MUST not run any plugin `setup`.
- **FR-705**: Argument parsing uses Node's `util.parseArgs`; no CLI framework dependency.
- **FR-706**: Errors print `error: <message>`; AIMBRACE errors also print their `code`; `--debug` prints the stack.
