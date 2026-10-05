# App instances and bulkheads: many ACRYL apps on one machine

Status: implemented (spec 036, commit `1b10c17`). Code: `runtime/acryl-harness-runtime/src/instance/`. Tests: `runtime/acryl-harness-runtime/tests/instance.spec.ts`,
`tests/bulkhead.spec.ts`.

## The problem, as it happened

A user runs several ACRYL apps at once: the ACRYL IDE from `main`, a branch under development, and apps built on the framework (a music editor, a
social-media content machine, a UX wireframe tool). On 2026-09-27 a Web run from a second checkout used the shared `~/.acryl`, re-linked the running main
app's Web profile to its own packages, and the main app rendered blank. A leftover global setting (`dsh-desktop.blend`) separately made a shared Desktop
profile boot a demo Blend. Each fix (the port, then the home, then the Electron user data, then worktrees) landed in a different file, which was the real
signal: the design was missing a module.

## Diagnosis: a hidden Singleton

"The ACRYL home" was an implicit Singleton: about a dozen places looked it up by themselves (`homedir()`, `process.env.ACRYL_HOME`, `DSH_HOME`), and every one
of them fell back to the one shared `~/.acryl` when nothing was set. Any code path could reach the global, so isolating one path never isolated the app.

## The design, by the books in the engineering rules

| Source (`~/.agents/rules/agent-rules-books`) | Pattern | Role here |
| --- | --- | --- |
| Release It! | **Bulkheads** | The strategy: each app is a sealed compartment; one app's failure or state never reaches another |
| The Pragmatic Programmer | Orthogonality; globals and ambient context must earn themselves and be visible | The diagnosis: the ambient home was a global that had not earned itself |
| A Philosophy of Software Design | **Deep module**, information hiding | "Where an app keeps things" is decided in one module with a small interface |
| refactoring.guru | **Abstract Factory**, replacing a hidden **Singleton** | Each kind of app is a factory that produces a whole, consistent family of resources |
| Clean Architecture | **Composition root** (Main) | The instance is chosen once, at startup, and passed inward; inner code never looks it up |
| Patterns of Enterprise Application Architecture | **Pessimistic Offline Lock**, **Registry** | One live process per app, one live installation per profile (visible holder, stale takeover); `ps` reads a Registry of running apps |

## The module

`AppInstance` is the family one app owns: `home` (the ACRYL home), `dshHome` (the engine home the pinned harness reads), `webPort` (start, and whether to take
the next free one), `userDataName` (Electron user data, window state, single-instance lock), `projectScope` (namespace for folders its builder writes in a
project), `definitionFile` (`blend.yaml`), `runLockFile`.

| Factory | When | Home | Port | Electron user data |
| --- | --- | --- | --- | --- |
| `defaultInstance` | nothing configured | `~/.acryl` (the only one allowed) | 3080 | `ACRYL` |
| `developmentInstance` | the main checkout's `pnpm run dev` | `~/.acryl-dev` | 3080, then next free | `ACRYL Development` |
| `worktreeInstance` | a dev run from a git worktree | `~/.acryl-worktrees/<folder>` | 3081, then next free | `ACRYL Development <folder>` |
| `appFolderInstance` | an app from `acryl new` (its folder has `blend.yaml`) | the app folder | stable per app (3100 + hash), then next free | `ACRYL <id>` |
| managed app | `~/.acryl-instances/<name>` | that folder | as above | as above |
| `pinnedInstance` | a caller set ACRYL_HOME (or a legacy DSH_HOME) | as given | 3080 unless ACRYL_WEB_PORT | `ACRYL` unless ACRYL_LOCAL_PRODUCT_NAME |

`select.ts` is the only code that reads the environment or the OS home. Precedence: ACRYL_HOME (an app when it has `blend.yaml`), then a legacy DSH_HOME, then
a git-worktree checkout, then the development app when asked, then the default. ACRYL_WEB_PORT, ACRYL_INSTANCE and ACRYL_LOCAL_PRODUCT_NAME refine the chosen
family; `instanceEnvironment(instance)` writes exactly those variables, so a family crosses a process boundary (launcher to app, app to pinned harness)
unchanged. A test round-trips every kind.

Where it is chosen (each is a composition root): the Web and CLI engine compositions (`engine-dsh.ts`), the direct boots (`bootAcrylHarnessProfile`,
`bootAcrylWebProfile`), Desktop's `main.ts`, the dev launchers (`scripts/dev-local.mjs`, `scripts/blank.mjs`, the Web and CLI `bin/dev-run.mjs` through
`scripts/lib/checkout-isolation.mjs`) and the Desktop smokes. The engine provides it to plugins as the `appInstance` Cordis service; a plugin declares the
shape it reads (`{ home, dshHome }`) as a separated interface instead of importing the runtime.

The launcher scripts import the same TypeScript module (Node strips types natively), so every isolation rule exists once. An app that carries its own runtime
(`acryl new --runtime`) carries a copy of the module with its launcher.

## The chat's first workspace is part of the family

DSH creates the chat's first workspace in the operating system's Documents folder, which it asks the OS for (on macOS through `osascript`), so moving `HOME` does not move it: an isolated app wrote its first project into the real `~/Documents/deepseek-harness`. The instance now carries `documentsDirectory`: undefined for the default instance (the user's installed app keeps the OS folder), `<home>/documents` for every other instance, handed to the `workspace-controller` row as a patch on every mount and every configuration reload (`instancePatches`). A new place the engine or a plugin asks the OS for (a folder, a cache, a socket) is a new member of the family, never a lookup.

## Gates, smokes and live runs fail closed

A run that is not a user launching their own app (a gate, a packed-app smoke, a live run with a real model) must never reach a real ACRYL or DSH home. Three layers, one idea, so a forgotten override ends in an error and not in a write to the installed app:

- **The selector refuses.** With `ACRYL_REQUIRE_ISOLATED_HOME` set, `selectInstance` throws `IsolationRequiredError` for any instance the caller did not pin, and for a pinned home inside `~/.acryl`, `~/.acryl-dev`, `~/.acryl-worktrees`, `~/.acryl-instances` or `~/.dsh`. `createAcrylEngineHost` selects its instance before anything mounts, so the refusal stops the host on every surface (inside a plugin it would only have failed that plugin and the app would have exited 0).
- **Scripts build their environment with `scripts/lib/isolated-run.mjs`.** `isolatedEnvironment` gives a throwaway root with its own `HOME` (so the engine's default workspace under `~/Documents`, macOS Application Support and any stray `~/.dsh` land there too), ACRYL and engine homes, Electron user data, and the requirement above. `scripts/verify-layout.mjs` fails any `verify-*` script that can boot an app without using it or pinning a home.
- **Live runs go through `scripts/live-run.mjs web|desktop|tui`.** It injects the model key into the process environment only, snapshots the real homes first, and on exit stops its processes, checks its port is free and fails if a real home changed (an app of yours running meanwhile can also write there: the message names the newest file).

Never test the guard, or anything that boots an app, with a command that can fall back to the real home: move `HOME` as well.

## Rules for contributors

- Never call `homedir()` or read ACRYL_HOME, DSH_HOME, ACRYL_WEB_PORT, ACRYL_INSTANCE or ACRYL_LOCAL_PRODUCT_NAME outside `instance/select.ts`. Take an
  `AppInstance` as a parameter, or read the `appInstance` service. `tests/bulkhead.spec.ts` fails otherwise; its allow-list names the only exceptions and why.
- A new kind of state an app keeps is a new member of the family (or a path under `home`), never a new lookup.
- A new resource two apps could share (a port range, a socket, a cache) is either derived from the instance id or guarded by the offline lock.
- Per-app choices (which Blend, the brand, the rows) live in the app's `blend.yaml`, never in a shared settings file.
- A new entry point is a composition root: choose the instance once, provide it, pass it on.

## Behaviour changes to know about

- A legacy DSH_HOME now moves the ACRYL home with it (its parent when it is named `.dsh`). Before, state beside the engine home (the pinned pnpm shim, global
  extensions, the workspace's custom agents) still went to the shared `~/.acryl`.
- The main checkout's `pnpm run dev` Desktop owns `~/.acryl-dev` completely, so its custom agents and agent settings live in `~/.acryl-dev/workspace/` instead
  of `~/.acryl/workspace/`. To keep the ones configured before: `cp -R ~/.acryl/workspace ~/.acryl-dev/` once.
- A profile records its owner installation (`<profile>/.acryl-owner.json`). An older installation does not write it, so until both sides have this change the
  per-app homes are what protect a shared profile.
