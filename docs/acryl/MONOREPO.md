# ACRYL under one roof

One clone holds everything ACRYL is made of: the framework apps are built with (acrylblends), ACRYL's runtime, its plugins, and the apps
people run. This page says where each part lives, what it owns, what it deliberately does not do, and which way the parts depend on each
other. The plan that got here is [spec 051](../../specs/051-acryl-monorepo/spec.md).

The model is [Pi's](https://github.com/earendil-works/pi) (owner's decision, 2026-11-19): **the folders stay flat and simple, and the
layers live only in the dependency graph** that every `package.json` already declares. A small kernel; a feature that does not belong in
the core is a plugin.

## The folders

```
framework/   acrylblends, the framework apps are made with: its CLI and create, the frame's release list, docs, tests and
             scripts. Its library plugins (what `acrylblends add` copies into an app) live flat in plugins/, below
runtime/     ACRYL's runtime: the control plane, the harness runtime, loopback HTTP, diagnostics, persistence, the plugin hub
plugins/     Cordis plugins, each replaceable on its own: ACRYL's (ui, workspace, settings, sign-in, launcher, market, ...), the
             Blends frame's (acryl-blends-frame, acryl-versions, acryl-app-context) and the framework library's app plugins
             (acryl-instance, acryl-extensions, acryl-desktop-shell, ...)
apps/        what people run: the acryl command, the desktop app, the web app, the terminal launcher
examples/    demo packages that ship nothing production-facing
distribution/ release shims (the `acryl` npm launcher)
deepseek-harness/  the pinned upstream harness (code we do not own; never edited here)
```

One word, one meaning: a **plugin** is a Cordis plugin. `plugins/` holds ACRYL's, the frame's and the framework library's: every
folder with a `plugin.json` is one of the library's plugins (`acrylblends add` copies it into an app), and each is a workspace package
that imports the others by package name (spec 051 T017). Inside an app the same plugins are source, and `acrylblends` rewrites those
names to relative paths as it copies them.

## Which way dependencies point

The picture, bottom to top. It is documentation of the graph, not a folder rule:

```
apps            acryl-cli, acryl-desktop, acryl-web, acryl-launcher-tui, examples
  ^ compose
plugins         @acryl/ui, acryl-workspace, acryl-settings, acryl-sign-in, acryl-launcher, acryl-blends-frame, acryl-instance, ...
  ^ use
runtime         acryl-control, acryl-loopback-http, acryl-diagnostics, acryl-web-service, blends-core, plugin-hub, ...
  ^ rests on
foundation      acrylblends (the framework) and its packages: acryl-router, acryl-door, acryl-db, acryl-kv, acryl-state, acryl-drivers, ...
```

`scripts/dependency-direction.mjs` enforces it, run by `node scripts/verify-layout.mjs` (part of `pnpm run check`):

1. **No cycles** between workspace packages, so there is one straight build order, foundation first.
2. **Nothing points the wrong way:** the foundation depends only on itself; the runtime depends only on the foundation and itself;
   nothing depends on an app. The foundation and the framework's app plugins are named package by package (they keep their role
   wherever they move); runtime and app are read from the folder (`runtime/`, `apps/`, `examples/`). Every library plugin (a
   `plugins/*/plugin.json` folder) must be a workspace package with a role.
3. **No shipped plugin dependency:** `acryl-harness-runtime` keeps what is runtime (engine, profiles, instances, sessions); the plugin
   set a surface runs is composed by the surface, from `@acryldev/coding-capabilities` (rows and packages) and the Blueprint it boots
   (spec 051 T021). The runtime may name plugins in `devDependencies` only, so its integration tests boot a surface with the real
   composition and import the plugin under test; a plugin in `dependencies` or `peerDependencies` fails the guard. The foundation's one
   plugin-shaped dependency is
   `acryl-drivers`, the Cordis-free driver contract: it is a foundation package by role, even though it lives in `plugins/drivers` and an
   app receives it like any library plugin.

A Blend repository outside this one depends on published npm packages, never on copied source.

## What each part owns, and what it deliberately does not do

| Package | Owns | Deliberately does not |
|---|---|---|
| `acrylblends` (framework/packages/cli) | the framework (`import { Acryl } from 'acrylblends'`) and the `acrylblends` command: add, upgrade, update plugins | depend on any ACRYL package (the frame's packages it names only by their published names, in `frame/packages.json`) |
| `create-acrylblends` | `npm create acrylblends`: a new app from a template | carry the framework itself (it installs it) |
| `acryl-router`, `acryl-router-http` | routes and middleware on Web-standard Request/Response; mounting them on the web server | own any product route |
| the framework's app plugins (`acryl-instance`, `acryl-extensions`, `acryl-agent-panel`, `acryl-desktop-shell`, ...) | the features an app is made with, each one `acrylblends add` copies into `plugins/`: where data lives, extensions, the agent panel, the desktop shell | ship inside ACRYL Desktop; be imported by the foundation (the one named edge above) |
| `acryl-door` | how an agent in the app folder looks at the running app and acts on it, with approval | decide which tools the agent gets |
| `acryl-db`, `acryl-kv` (+ their providers) | the storage ports an app plugin injects, and their conformance suites | choose a database for the app |
| `acryl-state`, `acryl-inspect` | observable state cells; what every running plugin requires and provides | render UI |
| `acryl-control` | the host-neutral control plane: plugin lifecycle, agent control, providers | render any surface |
| `acryl-harness-runtime` | composing the harness and the plugins a surface runs (the composition root) | own a surface's UI |
| `acryl-loopback-http`, `acryl-diagnostics` | the same-origin loopback check for private routes; logs, secret masking, support archives | own a route of their own |
| `@acryl/ui`, `acryl-ui-tui` | the design system, for the browser and for the terminal, with the same names | hold business logic |
| `acryl-workspace` | the IDE workspace: worktrees, tiles, terminals, agents | own the agent loop |
| `acryl-blends-frame` | the workbench around an app being built: versions, the app, the agents | ship inside the app itself |
| `acryl-launcher` | the launcher's journeys (make, install, pull, update) for every face | draw the screen (the faces do) |
| `apps/*` | starting a surface and composing it | hold logic a plugin could own |

Every package says its job in its own `package.json` `description`; `pnpm ls -r --depth -1` lists them all.

## One check

`pnpm run check` at the root checks everything: ACRYL's layout guard, every package's checks, and as its last step the framework's whole
gate (`check:framework`: lint, build, typecheck, every test, and the verify scripts that make real apps from the templates). CI runs the
same command. The framework's jobs on Linux, macOS and Windows run from `.github/workflows/framework.yml`.

## Why one roof

- A fix to code that several products share is one commit, one review and one release, not a copy per repository.
- `git clone` plus `pnpm install` gives a contributor the framework, the runtime, the plugins and the apps together.
- Users notice nothing: the npm names (`acrylblends`, `create-acrylblends`, `@acryldev/*`) and the installers stay the same.
