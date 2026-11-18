# 013: A usable app framework from ACRYL's best parts

> **Status (owner, 2026-10-09): aimbrace is a prototype of the ACRYL Blends framework.** What it proves, how it maps to ACRYL,
> and how far each Pi Durable idea has come: [handoff-to-blends.md](./handoff-to-blends.md).

## Decision (owner, 2026-10-09)

AIMBRACE becomes a usable framework for Cordis apps by extracting the most useful, proven features of ACRYL (main at
`49b3e9e`, release 0.2.2), on Node. The Deno runtime work lives on the branch `012-deno-runtime-experiment`; `main`
continues on Node without it.

## What is extracted, and why each one

| Feature | ACRYL source | Why it is worth having |
|---|---|---|
| **App instance**: one place decides where an app keeps things (home, data, port), chosen once | `runtime/acryl-harness-runtime/src/instance/` (545 lines, no Harness imports) | Two apps, or a test and a real run, never share a home or a port. ACRYL learned this from real breaches |
| **Settings**: per-namespace sections in one YAML file, validated, layered defaults, `watch`, `update` | `plugins/acryl-settings` (349 lines; Cordis, schemastery, yaml) | Every app needs settings; this is the version ACRYL ships |
| **Extensions**: install, update, remove and reload plugins while the app runs; a failed update brings the previous version back; a log of every change; trust rules for what starts automatically | `plugins/acryl-extension-context/lib` (1,938 lines; install, stage, reconcile, provenance) | The feature that lets an agent extend the running app. Proven in ACRYL's packaged app on macOS, Windows and Linux |
| **Builder**: the agent's tools over Extensions (write a plugin, install it, read its real state, remove it) | ACRYL's agent tools (`acryl_install_plugin` and the extension docs) | An agent can build the app it runs in, and learns from facts, not guesses |
| **App manifest**: an app as a YAML document of plugin rows with config, parameters and a lock | `runtime/blends-core` (1,453 lines, host-independent) | Save an app, recreate it elsewhere, review it in a diff |
| **Save with a secret check**: commit the app, refusing when a file holds a secret | `runtime/app-persistence` (341 lines) | Saving an app never leaks a key |

Not extracted: the workspace (16k lines, tied to Harness sessions), the market, the Electron shell, the Harness agent.
Each extraction is a port of the behaviour and its tests, rewritten for this repository, not a copy of ACRYL's
package boundaries.

## Shape: a plugin library, copied into apps

- **`plugins/<name>/`** in this repository is the library. Each entry is TypeScript source plus a `plugin.json` that
  names its files, the npm packages it needs, and the library plugins it requires.
- **`aimbrace init`** copies a template and the library plugins it lists into `src/plugins/<name>/`. **`aimbrace add
  <name>`** copies one more into an existing app, with what it requires, and adds its npm packages to `package.json`.
  The app owns the copied code; there is no AIMBRACE runtime package to import or update (constitution I and II hold).
- **TypeScript on Node with no build.** Node 22.18 and later run `.ts` files directly (type stripping) and `node --test`
  runs `.ts` tests. Code uses erasable syntax only. `tsc --noEmit` checks types.
- **Dependencies a generated app may have at run time:** `@deepseek-ai/cordis` 4.0.4 always; `@deepseek-ai/schemastery`
  3.18.4 and `yaml` 2.9.0 when a plugin that needs them is included. Nothing that duplicates a Cordis capability.

## Requirements

- **FR1** `instance`: a frozen `AppInstance` (kind, id, name, home, data dir, port start and scan, run-lock file) chosen
  once in `main.ts` from the environment (`AIMBRACE_HOME`, `AIMBRACE_PORT`) or the project folder, and provided as the
  `appInstance` service. Nothing else reads those variables. A stable port per app id.
- **FR2** `settings`: `ctx.settings.register(namespace, schema, options)` returns a scope with `get`, `watch`, `update`,
  `replace`; values layer schema defaults, `base`, then the stored section; writes are atomic and ordered; an
  `settings/updated` event fires after a committed change; pending writes settle on dispose.
- **FR3** `extensions`: install from a folder (lint the package, stage a content-hashed copy, import it fresh, mount it,
  wait until it settles, report `active`, `pending` with the missing services, or `failed` with the real error); update
  in place, restoring the previous version when the new one fails; remove; list; reload changed sources; a startup pass
  that installs the app's own extensions and only reports others; an append-only ledger of installs, updates and
  removals with content digests.
- **FR4** `builder` (agent template): tools `list_plugins`, `read_plugin`, `write_plugin` (confined to the app's
  extensions folder), `install_plugin`, `remove_plugin`; every answer is the structured Extensions result. The offline
  scripted model can build a plugin that adds a route, so the whole loop is tested without a network.
- **FR5** `manifest`: `blend.yaml` (ACRYL's Blend format, `blends.acryl.dev/v1alpha1`) lists plugin rows (`id`, `name`, `config`, `disabled`) and parameters;
  `parse`, `validate` (with diagnostics), `resolve` parameters, and a lock with digests; the app composes from it.
- **FR6** `save`: commit the app folder with git, refusing when a file contains a secret pattern; `aimbrace save`.
- **FR7** Templates `app` and `agent` are TypeScript on Node and list their library plugins; each generated project
  passes `npm run check` (types) and `npm test`, and starts with `npm start`.

## Acceptance

`pnpm run check` green, including `scripts/verify-scaffolder.mjs`, which for the `agent` template also proves, against
the running app: the builder writes a plugin that adds a route, the route answers; an update changes the answer; a
broken update is refused and the previous answer still comes back; removal makes the route 404; a restart keeps the
installed plugin.

## Ideas from Pi Durable (owner, 2026-10-09)

Source: the owner's comparison `Pi.dev Durable Objects And ACRYL Comparison and analysis for what to take for ideas to
implement.md` (capture inbox). Pi Durable is experimental and built on Chord, not Cordis, so the package is not adopted.
Its patterns are, in the smallest form that fits Cordis:

- **FR8 Durable task records** (`tasks` plugin): every agent run is a task with an id, an optional parent (ownership),
  its input, status (`running`, `completed`, `failed`, `cancelled`, `interrupted`), result or error, the tool-call trace
  and timestamps, appended to a log in the app's home and readable after a restart. A task found `running` at startup
  is marked `interrupted`, never silently resumed: side effects are not assumed idempotent (the comparison's warning).
  Cancelling a task cancels its children.
- **FR9 Commit before "done"** (evolution transaction): an extension may export `check(ctx)`; after it activates,
  Extensions runs the check, and only a passing check makes the install count. A failing check rolls back exactly like a
  failed start. The ledger records the result before the answer is returned.
- **FR10 One place to observe:** tasks and the extension ledger are queryable through their services and over HTTP in
  the agent template, so a surface renders state instead of reading a chat log.

Recorded, not adopted now: Absurd (PostgreSQL workflows), Gondolin (micro-VM execution for generated code; no Windows),
an execution-policy service. Each needs a real app that asks for it.

## Out of scope

npm publishing; the website; a real model provider (the scripted model stays the default).
