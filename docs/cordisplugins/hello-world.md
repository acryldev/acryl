# Hello World: a Cordis plugin in this Desktop checkout

This is a learning guide for **this repository**, not a copy of the upstream tutorial. After you finish it you should be able to write a plugin that mounts, injects a service, registers a reversible effect, and disappears cleanly.

Read this before you write Development Canvas or any other ACRYL plugin.

## The rule that never changes

Everything is a plugin. The desktop shell is a plugin. The agent loop is a plugin. Your feature should be a plugin too.

Cordis is the composition kernel:

| Idea | In practice |
| --- | --- |
| **Plugin** | A module Cordis can mount and unmount |
| **Context** | `ctx` - named services, not concrete imports |
| **inject** | Hard requirements. The plugin stays PENDING until they exist |
| **Effect** | Anything you create must have a disposer |
| **Fiber** | The live instance: PENDING, LOADING, ACTIVE, FAILED, UNLOADING, DISPOSED |

Upstream condensed reference: [Cordis primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer). Hands-on chapters live in `deepseek-harness/docs/cordis-tutorial/`. **Do not edit files inside `deepseek-harness/`.** Learn from them, then write owned plugins outside the submodule.

## What this checkout actually boots

```text
Yarn 4 workspace (this repo)
  dsh-plugin-desktop     Host + Client faces, Electron, packaging
  dsh-community-fabric   docs scaffold
  dsh-community-market   docs/runtime scaffold
  deepseek-harness/      pinned upstream (pnpm, read-only)

A running Desktop generation
  Loader reads profile bundles + patches
  dsh-plugin-desktop/cordis.patch.yml inserts desktop-* rows
  Host Cordis tree starts in Electron main
  loopback HTTP/WebSocket carries the Web Client
  packages with dsh.client are scanned into window.__DSH_BOOT__
  Client Cordis tree starts in the renderer
```

Compatibility mode leaves the upstream Web UI alone. Advanced mode is where Desktop owns `root` slots (`sidebar`, `conversation`, `details`, `shell.overlay`). A new UI surface belongs on those slots, not on a private Electron IPC channel.

Public Host services third-party plugins may inject: `desktopProfiles`, `desktopPnpm`. Everything else on the Electron adapter is private.

## Shape 1 - function plugin (start here)

A plugin is usually a file that exports `apply`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-world'

export function apply(ctx: Context) {
  ctx.logger.info('hello-world: loaded')
}
```

That is the entire unit. Cordis calls `apply` when the fiber becomes ACTIVE. There is no app bootstrap in your file.

Three legal shapes:

1. **Function** - `export function apply(ctx)`
2. **Object** - `{ name, apply(ctx) {} }`
3. **Service class** - `class Hello extends Service { constructor(ctx) { super(ctx, 'hello') } }`

Use the function until you need to *provide* a named service.

## Shape 2 - inject, then apply

Load order is not the YAML list order. If you need a service, declare it:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-greeter'
export const inject = ['logger']

export function apply(ctx: Context) {
  ctx.logger.info('hello-greeter: logger is ready')
}
```

If `logger` is missing, the fiber stays **PENDING**. That is healthy. Inspect fiber state before rewriting code.

Optional dependency - probe, do not inject:

```ts
const profiles = ctx.get('desktopProfiles')
if (profiles === undefined) {
  // ordinary dsh web: this plugin can no-op or use a fallback
  return
}
```

Required Desktop-only plugins use `export const inject = ['desktopProfiles']` and stay PENDING in plain `dsh web`. That is correct.

## Shape 3 - reversible effects

Anything that outlives a function call needs a disposer. `ctx.on()` already tracks listeners. For timers, processes, DOM nodes, or slot registrations:

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      ctx.logger.info('hello-world: heartbeat')
    }, 5_000)
    return () => {
      clearInterval(timer)
    }
  }, 'hello-world: heartbeat')
}
```

When the plugin unloads, Cordis runs the inverse. A leak is an architecture bug, not a polish item.

Waterfall listeners that only observe **must** call `next()`. Forgetting it swallows downstream behavior.

## How a plugin is composed here

Desktop's Host composition is `dsh-plugin-desktop/cordis.patch.yml`:

```yaml
- insert:
    - id: desktop-shell
      name: dsh-plugin-desktop
      config:
        mode: compatibility
```

Rules that matter:

- Give every row a **stable `id`**. Without it, an edit looks like "remove old + add new" and remounts unnecessarily.
- `name` is a package name or an absolute module path.
- `config` is validated by the plugin's exported `Config` schema (Schemastery in DSH).
- `disabled: !!js ...` is computed at mount time. Treat expressions as code.

A Client package also declares:

```json
{
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-runtime"]
    }
  },
  "exports": {
    "./client": {
      "default": "./lib/client.js"
    }
  }
}
```

The Host scanner finds `dsh.client`, serves `/plugins/<id>/client.js`, and the browser Cordis tree mounts that `apply`. Renderer plugins use slots, routes, and RPC. They never import Electron.

## How to run Hello World (recommended: isolated Cordis, no Desktop)

This does **not** open the GUI and does **not** touch `~/.dsh`. Use it to prove `apply()` runs.

From this repository root, after the upstream submodule is installed:

```sh
git submodule update --init --recursive
cd deepseek-harness
corepack pnpm install --frozen-lockfile
mkdir -p tmp/cordis-tutorial
```

Write `deepseek-harness/tmp/cordis-tutorial/hello.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-world'

export function apply(ctx: Context) {
  console.log('[hello-world] loaded')
}
```

Write `deepseek-harness/tmp/cordis-tutorial/cordis.yml`:

```yaml
- name: './hello.ts'
```

Run it (cwd must be `tmp/cordis-tutorial`):

```sh
cd tmp/cordis-tutorial
node --import tsx ../../vendor/cordis/bin.js
```

Expected:

```
[hello-world] loaded
```

The process then exits. `tmp/` is gitignored. This is the upstream Cordis tutorial launcher: a root `Context`, the Loader, then your plugin. No Electron, no profiles, no `~/.dsh`.

If `tsx` is missing, you skipped `corepack pnpm install` in `deepseek-harness/`.

## Optional: Hello World on `dsh web` (uses a Harness home)

Only if you want to see a plugin inside a real Host. **Do not point this at your production `~/.dsh`.** Give it a throwaway home:

```sh
mkdir -p /tmp/dsh-hello-plugin /tmp/dsh-hello-home
```

`/tmp/dsh-hello-plugin/hello.ts` as in the isolated example, using `ctx.logger.info` if you prefer logs over `console.log`.

`/tmp/dsh-hello-plugin/cordis.yml` (absolute `name` is required for a patch):

```yaml
- insert:
    - id: hello-world
      name: '/tmp/dsh-hello-plugin/hello.ts'
```

```sh
cd deepseek-harness
DSH_HOME=/tmp/dsh-hello-home corepack pnpm dsh web --patch /tmp/dsh-hello-plugin/cordis.yml
```

Watch the terminal for the load line. Open the printed `http://127.0.0.1:...` URL if you also want the Web UI. Ctrl-C unloads the process.

In Desktop, the same idea is a **profile** patch or `dsh plugin add`, not a hand-edit of `dsh-plugin-desktop/cordis.patch.yml`.

## Walkthrough: Client Hello World on a slot

Host plugins cannot draw in the BrowserWindow. UI is a Client plugin that registers on a documented slot.

Advanced Desktop already owns `root` with children `sidebar`, `conversation`, `details`, `shell.overlay`. Additive chrome belongs on `shell.overlay` (a list slot). Replacing Chat belongs on `conversation` and will fight the upstream occupant unless you intend to.

A Client `apply` looks like Desktop settings:

```ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export const inject = ['slots']

export function apply(ctx: ClientContext) {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'hello-world',
    order: 50,
  }, HelloBadge))
}
```

`HelloBadge` is a React function component. Registration is an effect: unmounting the plugin removes the badge.

That is the same mechanism Development Canvas uses, except Canvas occupies the center surface in advanced mode instead of a tiny overlay.

## How to run this Desktop / ACRYL checkout (the GUI)

Hello World above is a tiny Host plugin. Development Canvas lives in **advanced** Desktop. That is a different command.

1. **Quit the installed ACRYL app first.** Tray **Quit**, not only close the window. This checkout uses the same Electron app id (`DSH Desktop`). A second launch is swallowed by the single-instance lock and just focuses the already-running app.

2. From the repository root:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm local
```

`yarn local` (alias `yarn dev:local`) builds, then starts Electron against `~/.dsh-acryl` and a separate Electron user-data folder so it does not share settings with the installed ACRYL app. First build can take a while.

Daily loop without launching the window:

```sh
corepack pnpm typecheck
corepack pnpm test
corepack pnpm verify          # typecheck + test
corepack pnpm lifecycle       # verify, then isolated GUI
```

3. In the window, open **Settings** (or the tray) and switch to **advanced** mode. That restarts the app. Compatibility mode is the upstream Chat UI and does **not** show the canvas.

4. After restart you should see Chat in the main column and a **+** control. **+** adds Terminal, File, or Browser tiles.

Headless checks (no window):

```sh
corepack pnpm --filter dsh-plugin-desktop run test tests/development-canvas-state.spec.ts tests/canvas-pty.spec.ts
corepack pnpm --filter dsh-plugin-desktop run typecheck
```

### Isolate this checkout from the installed DMG app

By default **both** the `dshdesktop.cn` app and `yarn dev` use:

| Store | Default path on this Mac | What lives there |
| --- | --- | --- |
| Harness home | `~/.dsh` | `settings.yaml` (including `dsh-desktop.mode` / port), profiles (`desktop`, `web`, …), sessions, credentials, installed plugins |
| Electron user data | `~/Library/Application Support/DSH Desktop` | which profile is selected, logs, updates, market choice, recovery |

They are two binaries of the same product name. They **will** share and overwrite that state unless you separate the Harness home.

Safer ACRYL / canvas development:

```sh
# quit Applications/DSH Desktop.app first
corepack pnpm local
```

That uses `~/.dsh-acryl` as Harness home and `~/Library/Application Support/ACRYL Development` as Electron user data. The DMG app keeps `~/.dsh` and `~/Library/Application Support/ACRYL`. Still quit the store app before launching this checkout: two Electron processes with the same binary name can fight over the tray even when data dirs differ.

Do **not** install experimental plugins into the `desktop` profile while both apps share `~/.dsh`: the next launch of the store app will load that same profile.

## How to test a plugin (even Hello World)

Lifecycle matters as much as the log line:

1. Mount - fiber ACTIVE, service or slot appears
2. Consumer that `inject`s your service activates
3. Unload - disposer ran, timer gone, slot gone, process gone
4. Remount - consumer returns ACTIVE against the new provider

Headless tests in this repo use Vitest. Graphical `yarn dev` is explicit and is not a substitute for those tests. Loader smokes must stay headless-safe.

## Common failure modes

| Symptom | Usual cause |
| --- | --- |
| Plugin "does nothing" | PENDING on a missing `inject`, or a typo in `name` / path |
| Config looks ignored | Row `id` changed, so Loader treated it as a new entry |
| Listener survives reload | Side effect not created through `ctx.effect` / `ctx.on` |
| UI never appears | Client bundle missing `dsh.client` or `exports["./client"]`, or you registered on a slot that does not exist in compatibility mode |
| Desktop service is undefined | You injected `desktopProfiles` into a plugin running under ordinary `dsh web` |

## What to do next

1. Keep this file as the authoring checklist.
2. Product features go through Spec Kit under `specs/<NNN-slug>/`.
3. Development Canvas is the first serious plugin surface: `specs/015-development-canvas/`.

Related:

- Constitution: `.specify/memory/constitution.md`
- Desktop plugin services: `dsh-plugin-desktop/docs/plugin-services.md`
- Desktop plugin development (product APIs): `docs/plugin-development.en.md`
- Upstream first plugin: `deepseek-harness/docs/user/develop/basic/index.md`
- Upstream Cordis tutorial: `deepseek-harness/docs/cordis-tutorial/index.md`
