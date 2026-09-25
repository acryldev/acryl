# Code layout of `src/`

`src/` is organized by the bounded context each file belongs to, not by technical layer (see the engineering
standards in the repository `CLAUDE.md`). A reader should be able to find "everything about updates" or
"everything about the profile" from the directory tree.

```text
src/
  main.ts  bin.ts  index.ts  preload.ts       entry points (composition roots)
  <layout-coupled files, see below>            stay beside the entry points
  shell/         native Electron shell: windows, tray, menu, platform differences, notifications, shutdown
  profile/       desktop profiles: discovery, selection, checkpoint, materialization, BLEND consumption
  plugins/       plugin inventory, reconcile, watch, market selection, install recovery, package manager
    lifecycle/   Desktop projection of the shared plugin lifecycle: contract, controller, route, state
    architecture/  read-only projection of the native Cordis runtime graph: contract, inspector, route
  startup/       startup generation, recovery window and controller, failure routing, renderer boot health
  diagnostics/   logging, log files, secret masking, diagnostic export
  updates/       update checks, downloads, lifecycle, scheduling
  settings/      private Desktop settings API: contract, controller, route
  terminal/      tray terminal, packaged CLI environment, login-shell environment
  workspaces/    native workspace selection: directory picker, admission policy, Windows volume checks
  windows/       Windows-only adapters for upstream agent presets and the ACL sandbox
  runtime/       web server wrapper, port policy, packaged-runtime paths
  client/        browser half (its own tsconfig): layout, settings, plugin lifecycle, plugin architecture, workspaces
  native-ui/     framework-free HTML pages and their scripts (its own tsconfig and Vite build)
tests/           mirrors src/ by domain; packaging and release tests stay at the root
```

## Files that stay beside the entry points

Some modules find their siblings through `import.meta.url`: the flat `lib/` output (`./desktop-cli.js`,
`./windows-acl-runner.js`, `./diagnostic-export-worker.js`), the package root (`../package.json`,
`../cordis.patch.yml`, `../lib/index.js`) or `./native-ui/*.html`. In `lib/` every entry is a sibling, so those
paths only mean the same thing in `src/` and in `lib/` while the module sits directly in `src/`. Moving them
into a folder would silently break the packaged app while unit tests still passed. They are:
`profile.ts`, `profile-create-window.ts`, `module-resolution.ts`, `electron-runtime.ts`, `desktop-cli.ts`,
`desktop-plugin-reconcile.ts`, `diagnostic-export.ts`, `diagnostic-export-worker.ts`, `windows-pwsh-sandbox.ts`,
`windows-acl-runner.ts` and `startup-recovery-window.ts`. To move one, first replace its `import.meta.url`
lookups with a depth-independent locator (for example "nearest `package.json` upward") and add a packaged-runtime
test for it.

## Notes for tooling

- `tsconfig.json` includes `src/**/*.ts` and excludes `src/client` and `src/native-ui`, which have their own
  configs (which reset `exclude`).
- The client configs list `src/client/layout/advanced-shell.ts` first on purpose: the order in which TypeScript
  loads the Cordis declaration files changes how a circular `Context` type resolves, and with a different first
  file `ctx.effect` disappears from the type. Keep that entry first.
- `package.json` `exports[*].types` follow `lib/types/<folder>/<file>.d.ts`; `tests/package.spec.ts` asserts them.
