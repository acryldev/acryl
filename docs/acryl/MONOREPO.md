# ACRYL under one roof

One clone holds everything ACRYL is made of: the framework apps are built with (acrylblends), ACRYL's runtime, its plugins, and the apps
people run. This page says where each part lives, what it owns, what it deliberately does not do, and which way the parts depend on each
other. The plan that got here is [spec 051](../../specs/051-acryl-monorepo/spec.md).

The model is [Pi's](https://github.com/earendil-works/pi) (owner's decision, 2026-11-19): **the folders stay flat and simple, and the
layers live only in the dependency graph** that every `package.json` already declares. A small kernel; a feature that does not belong in
the core is a plugin.

## The folders

```
framework/   acrylblends, the framework apps are made with: its CLI and create, the frame's release list, its own app plugins
             (framework/plugins/: the plugins `acrylblends add` copies into an app), docs, tests and scripts
runtime/     ACRYL's runtime: the control plane, the harness runtime, loopback HTTP, diagnostics, persistence, the plugin hub
plugins/     Cordis plugins, each replaceable on its own: ACRYL's (ui, workspace, settings, sign-in, launcher, market, ...) and the
             Blends frame's (acryl-blends-frame, acryl-versions, acryl-app-context)
apps/        what people run: the acryl command, the desktop app, the web app, the terminal launcher
examples/    demo packages that ship nothing production-facing
distribution/ release shims (the `acryl` npm launcher)
deepseek-harness/  the pinned upstream harness (code we do not own; never edited here)
```

One word, one meaning: a **plugin** is a Cordis plugin. `plugins/` holds ACRYL's and the frame's. The framework's own plugins stay in
`framework/plugins/` for now, because they import each other as siblings (`../acryl-router/...`), exactly as they sit in an app once
`acrylblends` copies them in; they join the flat `plugins/` when they become packages (spec 051 Phase 3).

## Which way dependencies point

The picture, bottom to top. It is documentation of the graph, not a folder rule:

```
apps            acryl-cli, acryl-desktop, acryl-web, acryl-launcher-tui, examples
  ^ compose
plugins         @acryl/ui, acryl-workspace, acryl-settings, acryl-sign-in, acryl-launcher, acryl-blends-frame, ...
  ^ use
runtime         acryl-control, acryl-loopback-http, acryl-diagnostics, acryl-web-service, blends-core, plugin-hub, ...
  ^ rests on
foundation      acrylblends (the framework) and its packages: acryl-router, acryl-door, acryl-db, acryl-kv, acryl-state, ...
```

`scripts/dependency-direction.mjs` enforces it, run by `node scripts/verify-layout.mjs` (part of `pnpm run check`):

1. **No cycles** between workspace packages, so there is one straight build order, foundation first.
2. **Nothing points the wrong way:** the foundation depends only on itself; the runtime depends only on the foundation and itself;
   nothing depends on an app. The foundation is named package by package (a foundation package keeps its protection wherever it
   moves); runtime and app are read from the folder (`runtime/`, `apps/`, `examples/`).
3. **One named exception:** `acryl-harness-runtime` composes every plugin a surface runs (a composition root), so it may depend on
   exactly the 20 plugins it lists today; a 21st fails. Moving that composition up into `apps/` is spec 051 T021.

A Blend repository outside this one depends on published npm packages, never on copied source.

## What each part owns, and what it deliberately does not do

| Package | Owns | Deliberately does not |
|---|---|---|
| `acrylblends` (framework/packages/cli) | the framework (`import { Acryl } from 'acrylblends'`) and the `acrylblends` command: add, upgrade, update plugins | depend on any ACRYL package (the frame's packages it names only by their published names, in `frame/packages.json`) |
| `create-acrylblends` | `npm create acrylblends`: a new app from a template | carry the framework itself (it installs it) |
| `acryl-router`, `acryl-router-http` | routes and middleware on Web-standard Request/Response; mounting them on the web server | own any product route |
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
- Users notice nothing: the npm names (`acrylblends`, `create-acrylblends`, `@acrylblends/*`) and the installers stay the same.
