# Plan: Testing package and CLI

```text
packages/testing/src/index.ts        withApp, startTestApp, assertClean, mockService, recordHooks, waitFor, deferred, LeakError
packages/cli/src
  commands.ts     Command, CommandContext, Commands registry, commandsPlugin, RESERVED
  io.ts           Io, defaultIo
  args.ts         global option parsing
  builtins/       graph, check, run, plugins, init, commands
  cli.ts          runCli
packages/cli/bin/aimbrace.js         thin launcher over dist
```

The CLI loads config with `@aimbrace/loader`, uses `App.validate()` for `check`, and `app.registry(Commands)` for custom commands.
