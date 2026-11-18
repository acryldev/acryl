# ACRYLBLENDS documentation

ACRYLBLENDS is the public ACRYL framework, in two parts.

- **The framework** is `import { Acryl } from 'acrylblends'`: a small web framework on Web Standards that runs on Node.js (Bun experimental), with each middleware and helper at its own
  subpath (`acrylblends/cors`, `acrylblends/node-server`). Start a project with `npm create acrylblends@latest`.
- **Blends** are apps built from [Cordis](https://www.npmjs.com/package/@deepseek-ai/cordis) plugins: ACRYL's router, shared state and inspector, and a library of plugins extracted from ACRYL
  (instance, settings, live extensions, an agent that extends the app it runs in, tasks, the app manifest, save). `acrylblends init` copies what you pick into your app. You own
  every copied line.

## Start here

| I want to | Read |
| --- | --- |
| Use the framework: handlers, routing, middleware | [Framework documentation](framework/README.md), [Getting started](framework/getting-started/basic.md) |
| Look up a call | [API summary](framework/api/summary.md), [Routing](framework/api/routing.md), [Context](framework/api/context.md), [Request](framework/api/request.md) |
| Use the framework inside a Cordis app | [Acryl in a Cordis app](framework/cordis/acryl-in-a-cordis-app.md), [Mounting](framework/cordis/mounting.md), [Plugin lifecycle](framework/cordis/plugin-lifecycle.md) |
| Move to 1.0 | [Migration to 1.0](framework/cordis/migration-to-1-0.md) |
| Move from 0.4 or 0.3 | [Migration from 0.4](framework/cordis/migration-from-0-4.md), [Migration from 0.3](framework/cordis/migration-from-0-3.md) |
| Create a Blend app and run it | [Getting started](getting-started.md) |
| Let an agent extend my running app | [Extending a running app](agent/extending-apps.md) |
| Describe my app as data | [The app manifest](blends/manifest.md) |
| See every plugin in the library | [The plugin library](plugins.md) |
| Build with Cordis itself | [Building with Cordis](cordis.md) |

## The framework docs (generated)

[framework/README.md](framework/README.md) is the framework's own text, kept in this repository and shipped inside every new app.
`pnpm run verify:framework` fails when the exports map of the package is out of date. The pages write `import { Acryl } from 'acrylblends'`; in a
generated Blend app the same names are the vendored plugin source in `plugins/acryl-router/src/` (see the app's `AGENTS.md`).

## Our own pages

- [Getting started](getting-started.md) - create an app, run it, add plugins, lock it, save it
- [The desktop shell](desktop.md) - `--desktop`, `npm run desktop`: an Electron window on the app's own server
- [The plugin library](plugins.md) - every plugin: what it does, its service, its config, where it came from
- [Releasing](releasing.md) - the steps of a release and the rule that its gates run the installed package
- [The PTY driver (plan)](plans/pty-driver.md) - M8: a coding agent in a real terminal inside the app folder, acting through the door
- [The PTY driver with real agents](plans/pty-driver-evidence.md) - M8 evidence: claude, codex and pi each build a feature in the terminal tab
- [The 1.0 docs claim audit](plans/docs-1-0-claim-audit.md) - every claim on the framework docs and the sites checked against the code; what was fixed
- [Real-agent runs against 1.0.0-rc.1](plans/release-evidence-1-0.md) - M10 evidence: codex and pi on the agent, notes and chat starters, claude once
- [The Electron adapter (design)](plans/electron-adapter.md) - windows and menu as door verbs, `--window` on look and act, how the desktop shell reaches the door
- [The site patches](plans/site-patches/README.md) - patches for the hand-written pages of acrylblends.github.io (`git am`)
- [WebSocket upgrades on the router (plan)](plans/router-websocket.md) - spec 047 T009: upgrade routes owned by the mounting plugin
- [Build, then check it through the door](plans/door-build-and-check-evidence.md) - the recorded run: an agent builds a page, installs it, and clicks through it in one run
- [The workshop registry](plans/workshop-registry.md) - acryldev/workshop-2026-11-20: how a pull request becomes a listed app, the rules, the rehearsal and its timings
- [After 1.0: tickets](plans/framework-1-1-tickets.md) - 1.0.1 security fix, the 1.1 items with priority and order, what is parked
- [Framework 1.0 readiness](plans/framework-1-0-readiness.md) - audit: the API surface to freeze, the missing upgrade path, what is experimental; each item must-fix or later
- [Workshop readiness](plans/workshop-readiness.md) - the newcomer path walked on 1.0.0 (macOS): the step table, the frictions ranked, and a 90-minute outline
- [The ACRYL frame and IDE in the framework](plans/ide-port.md) - a plan: the ACRYL frame under every app, what ports from ACRYL, DSH as the host, the slices in order, Electron, risks and estimates
- [Publishing the frame's packages](plans/frame-publish.md) - the dry-run pipeline: the one naming value, the original tests, provenance, pack contents, the peer rule, a tarball install that boots the frame, and the npm org it needs
- [IDE port: the packages and their exact dependencies](plans/ide-port-packages.md) - generated from ACRYL's checkout: what ports, what is replaced, the one peer-dependency change
- [IDE port, slice 0: the decision record](plans/ide-slice0.md) - the spike: DSH hosts, the framework as profile rows, measured cost, the DSH pin and its upgrade routine
- [IDE port: the host inversion](plans/ide-host-inversion.md) - owner decision 2026-10-31: our own framework hosts the app, DSH packages are rows of our composition; what it replaces and what it keeps
- [IDE port: where it stands](plans/ide-port-status.md) - live status: what is landed, the slice 6 decisions, the next steps and the open question
- [IDE port, slice 1 against ACRYL's desktop](plans/ide-slice1-frame-comparison.md) - the first frame comparison: the numbers, what matches, and what each difference belongs to
- [IDE port, slice 2: the frame comparison](plans/ide-slice2-frame-comparison.md) - 18 views, 13 within 2%: the frame, both themes, the collapsed sidebar and the terminal pass; the one desktop-only right-panel row and the remaining Settings diffs
- [IDE port, slice 3: chat, models and sessions](plans/ide-slice3-chat.md) - the connect-a-model card, where the key goes, the gate that proves the chat uses it and that a session survives a restart, and the frame numbers
- [IDE port, slice 4: files, the editor, Changes and Review](plans/ide-slice4-panels.md) - the four new comparison views, the committed git fixture both surfaces open, and the numbers
- [IDE port, slice 5: account sign-in](plans/ide-slice5-signin.md) - acryl-sign-in ported and mounted in Settings > Models, the account join that keeps the API-key card away, the token boundary and its test, and the comparison
- [Sharing a plugin between people](plans/plugin-share.md) - the plugin-share mini-design: the order of a pull and why no refusal has anything to undo, the plan a person says yes to, and what the app remembers
- [Workshop outline v2](plans/workshop-outline-v2.md) - the refocused workshop: a visual app built and driven by the agent inside it, with the capability each block depends on
- [Extending a running app](agent/extending-apps.md) - extensions, the builder, durable tasks; how an agent writes a plugin
- [The app manifest](blends/manifest.md) - `blend.yaml`: the app as data, parameters, diagnostics, the lock
- [Building with Cordis](cordis.md) - plugins, services, `inject`, effects, events, a scope per task
- [Release notes 0.9.1](release-notes/0.9.1.md) - a fix: apps made by the installed command line start again
- [Release notes 0.9.2](release-notes/0.9.2.md) - Stop cancels the app's own agent, a secrets scan in check
- [Release notes 0.10.0](release-notes/0.10.0.md) - driver-pty: a coding agent in a real terminal in the app, the panel's drivers as a registry
- [Release notes 1.0.5](release-notes/1.0.5.md) - the app's own agent drives the page with a real model; the agent template's tests no longer collide with /hello
- [Release notes 1.0.6](release-notes/1.0.6.md) - the desktop app's windows and menu as door verbs (window, menu, --window), guarded against ending the session; a clean tarball
- [Release notes 1.0.7](release-notes/1.0.7.md) - production serves the extensions the agent installed (read-only); Git Bash paths, two tabs and the word "card" in the door; the panel docks, renders Markdown and says it is working
- [Release notes 1.0.8](release-notes/1.0.8.md) - the door and the panel on a WebSocket (two live windows no longer stall), a Settings menu item and page, windows that cascade
- [Release notes 1.0.9](release-notes/1.0.9.md) - a message typed as the page loads is no longer dropped; a look after a navigate waits for the page; window places
- [Release notes 1.0.10](release-notes/1.0.10.md) - a production install no longer carries vitest (the optional peer for the conformance suites is gone)
- [Release notes 1.1.0](release-notes/1.1.0.md) - a page follows its state over one WebSocket (`watch` of `/api/state/client.js`), so windows no longer use up the browser's six connections
- [Release notes 1.2.0](release-notes/1.2.0.md) - a new app is a repository of plugin folders with snapshots; `create --from` makes a blueprint your own (name, lock, first commit); `init --desktop` installs the ACRYL frame from npm, one framework copy
- [Release notes acrylblends 1.5.3](release-notes/acrylblends-1.5.3.md) - a new app's first run connects a model with Settings > Models in front of the person, and shows no preview notice (`@acrylblends/sign-in` 0.1.1)
- [Release notes create-acrylblends 1.5.3](release-notes/create-1.5.3.md) - asks for acrylblends 1.5.3
- [Release notes acrylblends 1.5.4](release-notes/acrylblends-1.5.4.md) - `acrylblends add plugin-share` mounts it, so an app made from a registry starter can pull, list and publish plugins
- [Release notes create-acrylblends 1.5.4](release-notes/create-1.5.4.md) - asks for acrylblends 1.5.4; a registry starter without sharing gets it
- [Release notes acrylblends 1.5.12](release-notes/acrylblends-1.5.12.md) - released with create-acrylblends 1.5.12
- [Release notes create-acrylblends 1.5.12](release-notes/create-1.5.12.md) - a registry entry that already is a finished app in the frame is made again (System Monitor)
- [Release notes acrylblends 1.5.11](release-notes/acrylblends-1.5.11.md) - acrylblends update (a Blend's newer release merged into an app, your changes kept) and the in-app update of packed products
- [Release notes create-acrylblends 1.5.11](release-notes/create-1.5.11.md) - released with acrylblends 1.5.11
- [Release notes acrylblends 1.5.10](release-notes/acrylblends-1.5.10.md) - released with create-acrylblends 1.5.10
- [Release notes create-acrylblends 1.5.10](release-notes/create-1.5.10.md) - a registry entry unpacks on Windows with Git's tar first on PATH
- [Release notes acrylblends 1.5.9](release-notes/acrylblends-1.5.9.md) - the workbench opens on a folder it is given (`acryl ade` in a project); @acrylblends/workspace 0.1.1
- [Release notes create-acrylblends 1.5.9](release-notes/create-1.5.9.md) - asks for acrylblends 1.5.9
- [Release notes acrylblends 1.5.8](release-notes/acrylblends-1.5.8.md) - a packed Blend product does not ask for a name, also for an app it made before
- [Release notes create-acrylblends 1.5.8](release-notes/create-1.5.8.md) - asks for acrylblends 1.5.8
- [Release notes acrylblends 1.5.7](release-notes/acrylblends-1.5.7.md) - every registry Blend can be made in the frame again; a packed Blend product does not ask for a name
- [Release notes create-acrylblends 1.5.7](release-notes/create-1.5.7.md) - asks for acrylblends 1.5.7; `--from` a registry Blend with its own src/app.ts finishes
- [Release notes acrylblends 1.5.6](release-notes/acrylblends-1.5.6.md) - sharing pushes through your gh login whatever git protocol you chose; an app in a WebBoxes.ai box takes its model key (`@acrylblends/blends-frame` 0.1.4)
- [Release notes create-acrylblends 1.5.6](release-notes/create-1.5.6.md) - asks for acrylblends 1.5.6
- [Release notes acrylblends 1.5.5](release-notes/acrylblends-1.5.5.md) - `npm run share`: an app gets a repository of its own on GitHub and is pushed there, after a person confirms the plan (`@acrylblends/blends-frame` 0.1.3)
- [Release notes create-acrylblends 1.5.5](release-notes/create-1.5.5.md) - asks for acrylblends 1.5.5
- [Release notes acrylblends 1.5.2](release-notes/acrylblends-1.5.2.md) - an app can run behind a hosting front such as a WebBoxes.ai box (`ACRYL_PUBLIC_ORIGIN`, `ACRYL_TRUSTED_PROXY`, `ACRYLBLENDS_HOST`)
- [Release notes create-acrylblends 1.5.2](release-notes/create-1.5.2.md) - asks for acrylblends 1.5.2
- [Release notes acrylblends 1.5.1](release-notes/acrylblends-1.5.1.md) - pnpm installs and runs an app in the frame (`pnpm-workspace.yaml` written by init and upgrade); an app made with 1.4 starts on Linux with Node 22 and later
- [Release notes acrylblends 1.5.0](release-notes/acrylblends-1.5.0.md) - every new app opens in the ACRYL frame (`init` without `--bare`, and a registry blueprint through `--from`); `upgrade` frames a blueprint; the frame's plugin graph, Registry tab and Connect GitHub
- [Release notes acrylblends 1.4.0](release-notes/acrylblends-1.4.0.md) - a group's app: `plugin pull --from <list>` pulls everyone's plugins in one command, each refused one named while the others run; `add showcase` shows who made what; the agent template's home page shows widgets
- [Release notes acrylblends 1.3.2](release-notes/acrylblends-1.3.2.md) - `upgrade` works again on an untouched app made by 1.2.0, 1.3.0 or 1.3.1, and the gate fails when a release is missing from what it knows
- [Release notes acrylblends 1.3.1](release-notes/acrylblends-1.3.1.md) - plugins from several people in one app: a taken route or widget is refused naming its plugin, the list says who released each one, and every template that installs live can pull; in the frame a pull no longer restarts the app
- [Release notes acrylblends 1.3.0](release-notes/acrylblends-1.3.0.md) - share a plugin between people: `plugin pull` and `plugin publish`, `npm run acryl`, and upgrade moves a dependency forward
- [Release notes create-acrylblends 1.5.1](release-notes/create-1.5.1.md) - `pnpm create acrylblends` installs and starts the app in the frame (it asks for acrylblends 1.5.1)
- [Release notes create-acrylblends 1.5.0](release-notes/create-1.5.0.md) - a registry blueprint opens in the frame (it asks for acrylblends 1.5.0)
- [Release notes create-acrylblends 1.4.2](release-notes/create-1.4.2.md) - a new app has `pull --from`, the showcase and the agent home page (it asks for acrylblends 1.4.0)
- [Release notes create-acrylblends 1.4.1](release-notes/create-1.4.1.md) - a new app has plugin list, remove and route removal in the frame (it asks for acrylblends 1.3.1)
- [Release notes create-acrylblends 1.4.0](release-notes/create-1.4.0.md) - `--desktop` puts the new app inside the ACRYL frame
- [Release notes 1.3.0](release-notes/1.3.0.md) - `create --from` downloads only the app you asked for, checked against its sha512
- [Release notes 1.2.1](release-notes/1.2.1.md) - `create --from` works on a registry larger than one template (it failed past 5000 files)
- [The 1.2.0 release checklist](plans/release-1.2.0.md) - the frame's 16 packages, then acrylblends and create-acrylblends 1.2.0, the tags and the npm-release approval, with the owner's steps marked
- [Release notes 1.0.4](release-notes/1.0.4.md) - act reload and navigate, the page script on every page, runs that outlive the page
- [Release notes 1.0.3](release-notes/1.0.3.md) - Node 26, relative paths in manifest rows, a pasted GitHub address as a source
- [Release notes 1.0.2](release-notes/1.0.2.md) - the chat template closed in production, create-acrylblends --from, the newcomer-path fixes
- [Release notes 1.0.1](release-notes/1.0.1.md) - a security fix for the agent template in production
- [Release notes 1.0.0](release-notes/1.0.0.md) - the 1.0 surface, acrylblends upgrade, what runs in production
- [Release notes 0.11.0](release-notes/0.11.0.md) - WebSocket upgrades on the router, brief prints the address
- [Release notes 0.9.0](release-notes/0.9.0.md) - the framework's home: the Cordis forms as subpaths, one `Acryl`, the source and its history here
- [Release notes 0.8.1](release-notes/0.8.1.md) - the door's plugin verbs work in every web template
- [Release notes 0.8.0](release-notes/0.8.0.md) - every template a Cordis app, the door (`.acryl/bin/acryl`), `clientModules` inside a sub-app
- [Release notes 0.7.8](release-notes/0.7.8.md) - one `plugins/` folder, `AGENTS.md` and `CLAUDE.md` with the app-guide skill, `acrylblends/read-sse`
- [Release notes 0.7.7](release-notes/0.7.7.md) - `kv`: JSON documents for tiny apps; `acrylblends kv import`
- [Release notes 0.7.6](release-notes/0.7.6.md) - `acrylblends check-deps`: app code takes the db port, one file opens the database
- [Release notes 0.7.5](release-notes/0.7.5.md) - the `db` port and numbered migrations; the notes and chat templates use them
- [Release notes 0.7.4](release-notes/0.7.4.md) - hosting adapters (AWS Lambda, Cloudflare, Vercel, Netlify, Bun...), templates from a repository
- [Release notes 0.7.3](release-notes/0.7.3.md) - the chat template, streaming docs
- [Release notes 0.7.2](release-notes/0.7.2.md) - client components without a bundler, serve() on 127.0.0.1, the notes template, production-ready starters
- [Release notes 0.7.1](release-notes/0.7.1.md) - Electron 44.9.3, no shell warning on Windows, forms and sessions guide
- [Release notes 0.7.0](release-notes/0.7.0.md) - .tsx pages on Node.js with no build step
- [Release notes 0.6.4](release-notes/0.6.4.md) - the rename completed, a smaller package, JSX in apps
- [Release notes 0.6.3](release-notes/0.6.3.md) - jsx and css, the stricter save, the desktop page
- [Release notes 0.6.2](release-notes/0.6.2.md) - presets, dev, mount, cache and proxy
- [Release notes 0.6.1](release-notes/0.6.1.md) - add desktop for a plain Acryl app, the create version stamp
- [Release notes 0.6.0](release-notes/0.6.0.md) - the desktop shell
- [Release notes 0.5.1](release-notes/0.5.1.md) - the npm page: a README in the package
- [Release notes 0.5.0](release-notes/0.5.0.md) - the framework is the package root, `create-acrylblends`, and the new docs
- [Release notes 0.4.1](release-notes/0.4.1.md) - the framework docs and an AGENTS.md inside every generated app
- [Release notes 0.4.0](release-notes/0.4.0.md) - the App and `ctx.router.route` migration
- [Release notes 0.3.0](release-notes/0.3.0.md) - what is breaking and how to migrate three lines of a route
