# Host inversion: our framework hosts the app; DSH is the chat/session driver

Status: design note for slice 107 (`107-host-inversion`), revised after review. Owner direction (2026-10-31): the app is hosted by our own framework, not by `dsh --profile`; DSH is one driver (its chat, its session host); the frame packages publish as the `@acrylblends` scope packages (DS_Fork3 owns the pipeline).

What changed from the first draft: DSH's web server, web runtime, page and client boot are **not mounted**. Our node-server and router serve the document and the client modules; the document is the ACRYL frame's own layout; DSH contributes only the chat/session driver rows and the client packages the frame imports as libraries.

## 1. Our HTTP host

- `acryl-node-server` (ours) listens on the port and serves the router and the client modules; there is no DSH `webServer` or `web-startup` row.
- The page is one document written and served by us (`clientModules`): the frame's client entry (the `acryl-app-shell` layout, which renders the left panel, main surface and right panel) is the root bundle. No DSH page, no DSH slots switched off: the frame's slots are the page's slots.
- The app's own routes are mounted at `/app` on our router (the slice 6 prefix rule), served by our server; the door's page script rides the same document through our client-module serving (the slice 1/6 adaptation, now against our server instead of DSH's index-inject).
- For the DSH driver rows that register HTTP endpoints (the remote gateway), our host provides **one compatibility service of our own**, `webServer`, with the slice of DSH's web-server interface they use (`register` prefix/exact, `registerUpgrade`, index tap if a row needs it), backed by our node-server. It is our adapter (estimate: 150-250 lines, tested like `routerHttp`), not DSH code; a row that needs more of the interface is listed with the extra surface and either served or excluded with a reason. This avoids mounting DSH's web server while keeping the driver rows unchanged.

## 2. Our client runtime

- The page loads our client-module loader (DSH's `@deepseek-ai/dsh-client-modules` as an npm **library**, served by our server; ~1,900 lines) and the client graph of the frame: `acryl-app-shell`, `acryl-workspace`, and the DSH client packages the frame imports (table below).
- DSH's client packages are served by **our** client-module serving, from `node_modules`, through their `dsh.client` entries; our loader resolves their bare imports. They are libraries, not rows of DSH's web runtime.
- The chat tab mounts the conversation UI client module (DSH's `dsh-client-ui-conversation`, ~18,500 lib lines) as a library in the chat tile; it talks to the driver through the remote client packages (also libraries) over our host's gateway endpoint. The frame's chat tile already receives `renderConversation` today; under our page it receives the same component from the served module.
- The client-side services the frame's client packages inject (`slots`, `locale`, `sidebarRight`, `sidebarRightTabs`, `shortcuts`, `layout`, `renderer`, ...) come from those client libraries, bootstrapped by the page's client entry. No DSH client runtime row or DSH client boot is mounted.

## 3. The client contract, per package

Line counts are the package's shipped `lib` JavaScript (`.js`, no maps) in DSH `0.2.0-rc.2`, as installed in a frame profile; "frame imports" is how many of our `ide/*/src` files name it. Decision means: **library** = DSH npm package served by our server and loaded in our client graph, not ported; **port** = source under the `@acrylblends` scope packages with provenance. No package is ported in this slice unless a row below says so.

| Package | lib lines | frame imports | Used for | Decision |
| --- | ---: | ---: | --- | --- |
| `dsh-client-modules` | 1,898 | 4 | client-module loader and client boot primitives | library, served by our server |
| `dsh-client-store` | 179 | 2 | reactive store the client plugins share | library |
| `dsh-client-ui-slots` | 576 | 23 | slot registry (the frame's link/extension points) | library |
| `dsh-client-ui-renderer` | 1,898 | 13 | client renderer the frame's plugins register into | library |
| `dsh-client-ui-primitives` | (npm package, not in this profile) | 11 | base UI components used by the frame's screens | library |
| `dsh-client-locale` | 1,600 | 9 | localized strings | library |
| `dsh-client-ui-theme` | 1,732 | 8 | theme tokens, light/dark | library |
| `dsh-client-ui-settings` | 1,554 | 8 | Settings shell and sections | library |
| `dsh-client-ui-session` | 504 | 6 | session views shared by chat/tabs | library |
| `dsh-client-ui-layout` | 699 | 4 | layout service the frame's shell uses | library |
| `dsh-client-ui-sidebar` | 541 | 5 | sidebar tab primitives | library |
| `dsh-client-ui-sidebar-right` | 9,244 | 4 | right panel shell (File/Changes/Review mount here) | library |
| `dsh-client-ui-commands` | 1,465 | 2 | command registry for the palette/shortcuts | library |
| `dsh-client-shortcuts` | 2,557 | 5 | shortcut commands and the palette event | library |
| `dsh-client-connection` | 2,352 | 1 | remote connection client | library |
| `dsh-client-ui-settings-models` | 4,126 | 4 | Models settings page (the account card mounts here) | library |
| `dsh-client-ui-settings-account` | 4,619 | 0 | account settings page used by sign-in | library |
| `dsh-client-ui-conversation` | 18,505 | 7 | the DSH chat view in the chat tile | library, served as the chat module |
| `dsh-client-ui-workspace` | 4,435 | 0 | workspace client the conversation UI injects | library |
| `dsh-client-file-upload` | 1,982 | 0 | upload client the conversation UI injects | library |
| `dsh-brand` | 32 | 0 | brand token helpers | library |

If a library turns out to hard-depend on a DSH host row that we do not mount, the row is added to section 4 with its evidence; if a library turns out to need a profile-only mechanism, the note is amended with that package's port plan and provenance before the code. The frame's own client packages (the `@acrylblends` scope packages) keep their existing ports and provenance.

## 4. The DSH driver rows

Only the rows the chat and session need, grouped with why. Each is a standard Cordis row from DSH's npm packages, mounted in our composition after our own rows; "verified injects" are read from the installed `0.2.0-rc.2` package.

| Row (id) | Package | Why | Verified hard injects |
| --- | --- | --- | --- |
| `typert` | `@deepseek-ai/dsh-typert-registry` | the typed remote registry the conversation client calls through | - |
| `typert-loader` | `@deepseek-ai/dsh-typert-loader` | registers the generated remote modules | - |
| `typert-gateway` | `@deepseek-ai/dsh-api-gateway` | the HTTP/remote gateway the page's client connects to; registers on the host (through our `webServer` port) | - |
| `session` | `@deepseek-ai/dsh-session` | the session host: create, read, send turns | - |
| `session-persistence-jsonl` | `@deepseek-ai/dsh-session-persistence-jsonl` | keeps chat sessions across restarts | - |
| `session-query-sqlite` | `@deepseek-ai/dsh-session-query-sqlite` | session list/search the left pane and controller read | - |
| `session-projection` | `@deepseek-ai/dsh-session-projection` | the turn projections the conversation renders | - |
| `session-title` | `@deepseek-ai/dsh-session-title` | titles for chat tabs | - |
| `storage`, `storage-json`, `storage-domain` | DSH storage rows | the durable store the session/settings rows write through | - |
| `agent` | `@deepseek-ai/dsh-agent` | runs a chat turn | - |
| `agent-default-model` | `@deepseek-ai/dsh-agent-default-model` | the model a new session uses | - |
| `llm` | `@deepseek-ai/dsh-llm` | the model service | - |
| `llm-retry` | `@deepseek-ai/dsh-llm-retry` | provider retries | - |
| `llm-deepseek` | `@deepseek-ai/dsh-llm-deepseek-api-key` | the API-key model provider | - |
| `llm-deepseek-account` | `@deepseek-ai/dsh-llm-deepseek-account` | the account model provider (OAuth) | - |
| `deepseek-account` | `@deepseek-ai/dsh-deepseek-account-platform` | the account catalog/OAuth service | - |
| `credentials` | `@deepseek-ai/dsh-credentials-local` | the key store (never in the page/app folder) | - |
| `authorization` | `@deepseek-ai/dsh-authorization` | the authorization service the sign-in host uses | - |
| `settings` | `@deepseek-ai/dsh-settings` | settings the model rows read; needs `configEditor` and `profileContext` (we provide a minimal `profileContext`) | `configEditor`, `profileContext` |
| `config-editor` | `@deepseek-ai/dsh-config-editor` | the settings store backend | - |
| `attachment-local` | `@deepseek-ai/dsh-attachment-local` | attachments the session controller admits | - |
| `file-reference-local` | `@deepseek-ai/dsh-file-reference-local` | file references the session controller resolves | - |
| `session-controller` | `@deepseek-ai/dsh-api-session-controller` | the session remote API the conversation client calls | its row class injects `agents`, `sessionQuery`, `typert`; the service uses `typert`, `fileReferences`, `attachments` |
| `api-remotes` | `@deepseek-ai/dsh-api-remotes` | the remote registry/gateway wiring | `typertGateway` |
| `workspace-controller` | `@deepseek-ai/dsh-api-workspace-controller` | the workspace remote the conversation UI's workspace client injects; our workspace also uses its own files/git services | - |

Excluded with reasons: DSH's web server, web startup, web runtime, client HMR, DSH's UI client rows (not mounted as rows; the client packages are libraries), DSH's terminal/file/diff controllers (our workspace's, ported in slice 2), DSH's plugin manager/support rows (our the `@acrylblends` scope packages packages), the tool rows and their dependencies (the chat answers without tools; the owner's terminal agents are our PTYs), telemetry/product analytics (disabled in the web profile today). If a listed driver row's hard injects pull a row not listed, that row is added here with its evidence in the implementation commit; the gate's active-row list is the proof.

## 5. What our ported packages hard-require from DSH

- `acryl-sign-in` host: DSH's `authorization` and `credentials` services (slice 5; listed above).
- `acryl-workspace`'s connect-model control: DSH's `credentials`, `llm` and `session` remote faces (slice 3; the rows above).
- `acryl-workspace`'s chat tile and session list: the session/agent rows above; its terminals, files, git, board, comments are ours (node-pty host routes), not DSH's controllers.
- Settings screens, shortcuts and the palette are ours (the `@acrylblends` scope packages), mounted on our host.

## 6. What the generated app contains, and what `dev` runs

- `package.json`: our framework, the the `@acrylblends` scope packages frame packages (published names; the `ACRYLBLENDS_FRAME_PACKAGES` bridge until then), DSH's driver packages pinned exactly, and the client libraries the frame imports. No DSH profile, no `dsh plugin add`.
- `scripts/ide-host.mjs`: our launcher: chooses the instance/home/port (`ACRYLBLENDS_PORT`, 0 allowed), composes our rows (the app's frame layer: `app-instance`, door when present, `app-routes` at `/app`, our router/routerHttp, the the `@acrylblends` scope packages rows, the DSH driver rows), provides `profileContext` and the `webServer` compatibility port, mounts the client-module serving and the page, and forwards stop signals.
- `npm run dev`: `node --import ./plugins/acryl-node-server/src/register.ts scripts/ide-host.mjs` (the app's JSX register, as the app's own scripts use). `npm start`/production stays the app's own framework server (no frame, no door, no DSH).
- Scaffolder (`acrylblends init` and `acrylblends upgrade`): write the host script and layer instead of the DSH profile (`scripts/ide-profile.mjs` and the profile directory are removed); generation stays idempotent; blank first.

## 7. The boot gate

`scripts/verify-ide-template.mjs <template>` keeps the slice 6 shape and acceptance: scaffold through the CLI, install, boot, real Chrome on a free port, every row active; the frame renders; (a) left panel Projects/sessions; (b) right panel Files/editor/Changes/Review; (c) Settings General/Models/Plugins/Support/Shortcuts; (d) chat tab; (e) a terminal PTY that answers; (f) the command palette and shortcuts; (g) the door script once and a door call; (h) the app answers at `/app` and its page shows in the workspace browser tile; plus chat with the local Anthropic-Messages mock. What changes: no DSH profile and no `dsh` output to parse; the gate reads our launcher's row status, and the page is ours.

## 8. What is kept from `106-ide-slice6-boot`

Kept: the `/app` prefix and the single-prefix rule, the frame row shape (router + `routerHttp` claim + route), the tile decision (ACRYL's canvas browser tile, not DSH's right-sidebar browser), the door in each template, the boot gate and its surface assertions, the app's page check, the `spawn-dirs` timing bound fix, and the docs decisions. Dropped: the DSH profile generator, the `dsh --profile` dev command and its arguments, and DSH-profile row parsing in the gate. The branch is pushed as `d615176b` for reference; it can be dropped once this branch carries the gate.

## 9. Risks

- **Driver row drift.** A DSH bump may change a row's injects; the gate's active-row list and the pin are the guard.
- **`webServer` port surface.** If a driver row uses more of DSH's web-server interface than the port exposes, that row is either served by a small extension to our port or excluded with a reason in this note.
- **Client library boot.** The client libraries expect DSH's client boot order; our page bootstraps them explicitly; the gate's chat/tile/settings checks are the proof.
- **Settings' `profileContext`.** DSH's settings row hard-injects it; our host provides the minimal compatible object (name `web`, home, directories) and the gate proves settings and models work.
- **Home.** DSH's rows keep their files in the app's own data home (the launcher sets `DSH_HOME` from the app instance before importing any driver row); the gate proves nothing is written to a user-wide home.

## 10. Implementation notes (2026-10-31, after steps 1-2)

Landed on `107-host-inversion`: `bfaeb660` (the raw node route/upgrade seam in `acryl-node-server` and the `acryl-web-server` port with its tests) and `f0c0cfa3` (the generated `scripts/ide-host.mjs`, the driver-row selection, and `scripts/verify-ide-host.mjs`, which boots the composition and checks: 52 rows active, no DSH web row, PENDING on provider removal / active on restore, two reloads clean). The app pins one Cordis (4.0.5, DSH's own) and `cordis-plugin-loader` 1.0.6; the driver rows are selected from `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` by id and mounted through the Cordis loader on our node server.

The next step, the page and the client runtime, has these findings:

- `@deepseek-ai/dsh-client-modules` is a Cordis row with a host half that does the client-module work: it scans the loader entries for `dsh.client` declarations, composes `window.__DSH_BOOT__`, serves the client bundles, and contributes its boot scripts to the web server's index-injection table. It hard-injects only `loader` and optionally uses `webServer`, which our port provides. It is the package to mount as the client-module serving on our host (a library row, not DSH's web runtime).
- Its graph invariant fails loudly when a `dsh.client` row advertises a bundle that does not resolve, so the frame's client injects are the complete list of client rows to mount: for the frame packages, `client-locale`, `client-shortcuts`, `ui-settings`, `ui-sidebar-right`, `ui-theme`, `ui-settings-models`, `api-remotes`, `client-connection`, `ui-slots`, `ui-primitives`; for the chat, `client-ui-conversation` and its injects (`api-session-controller`, `client-file-upload`, `ui-layout`, `ui-renderer`, `ui-session`, `ui-workspace`). Nothing else of DSH's client surface is mounted.
- The document itself: our page row serves a minimal index from `@deepseek-ai/dsh-web-frontend`'s `dist/index.html` with the webServer index taps applied (that is where `__DSH_BOOT__` and the registration scripts land) and serves its `assets/` files; the visible layout is the ACRYL frame because the only layout client row mounted is `acryl-app-shell`, which renders in the shell's root slot. The shell (the frontend's built client runtime) is a library served by our server, as the per-package table allows; DSH's web server, web runtime and web-startup rows are still not mounted.
- The page row and the client rows are the next commit; the browser gate then runs (a)-(h) plus the PTY, the chat mock and the door.


## 11. Handoff (2026-10-31, branch 107-host-page)

State: `107-host-page` is pushed; the latest code commit before this note is `2cfe7a93` (the workspace Settings fallback and the page gate). The composition gate (`pnpm run verify:ide-host`) is green: every row active (70 rows), no DSH web row mounted, PENDING on provider removal / active on restore, two reloads clean, the app's tests and typecheck green. The app boots on our host, the page is ours (title ACRYL, `__DSH_BOOT__` through the webServer index rows), the launcher prints the tokenized URL (plain 401, token 303 with the cookie), the ACRYL frame renders, and the chat session is created (the agent-loop row is mounted).

`scripts/verify-ide-template.mjs blank` (run `node --import ./scripts/workspace-source.mjs scripts/verify-ide-template.mjs blank --keep` after `pnpm --filter acrylblends run build`) now passes: scaffolding through the CLI with the frame specs and the second-init refusal, install, the composition check, the tokenized boot, the page with the boot wire and the door script once, `/app` with the app's own body, a door CLI call, `/app/about`, the frame, the left panel with Projects rows, the chat tab, and the right panel with Files/Changes/Review. It stops at Settings:

- The frame's page renders no DSH sidebar, so the workspace's `openSettingsSection` finds no `aria-haspopup="dialog"` Settings trigger. It now falls back to the layout service's `selectPanel('settings')` (`setSettingsPanelOpener` in `ide/acryl-workspace/src/client/settings/open-settings.ts`, registered by the workspace client's `ctx.inject(['layout'])`), but the settings dialog still does not appear: the frame's layout sets `panelInfo`, while the shell's keyed `settings` panel is registered in DSH's root layout store, not in the frame's `DesktopLayoutState`. The next step is to find where DSH's `ui-settings` registers that main panel and wire it to the frame's layout (or provide the registration), then run the gate's remaining checks.

After Settings, the gate's remaining assertions are the command palette (the `acryl:toggle-command-palette` event), a terminal tab over a real PTY, `/app` in the workspace browser tile, and chat with the local Anthropic-Messages mock through the key card (the slice 3 gate's mock and flow).

Other open items: the door's page WebSocket owner is deterministic (services presence; one owner; routerHttp preferred), with tests for node-only, routerHttp after the node server and routerHttp before the door; the provider-removed-and-restored scenario is skipped in `plugins/acryl-door/tests/host/hub-ownership.spec.ts` because the next upgrade is not answered after a re-provide. The door's handshake was verified 101 against the frame host before this test was written.

## 12. Session note (2026-10-31, 107-host-page-settings)

Picked up at the Settings step of the page gate. Findings, in order:

1. **DSH's settings UI is a dialog, not a keyed `main` panel.** `ui-settings-general` registers `SettingsRoot` into the root slot `sidebar.settings` (declared
   by `dsh-client-ui-sidebar`'s contract), and opens it through `shellStore` (its own store), the `settings.trigger` slot's button, or the `settings.open`
   shortcut command. The workspace's fallback `selectPanel('settings')` therefore opens nothing: the frame's keyed `main` slot has no `settings` entry.
2. **The frame did not declare or render `sidebar.settings`.** Tried the obvious fix: declare it in the frame's root children and render it in
   `AdvancedFrame` with `{ wide: !collapsed }`. It typechecks (with `@deepseek-ai/dsh-client-ui-sidebar` as a devDependency for the SlotMap), builds, and
   **breaks the page: the gate then fails earlier with "the ACRYL frame did not render in the page"** (no `.dshWorkspace`), so the change was reverted. The
   attempt is kept as an attachment to this note's session (`/tmp/settings-slot-attempt.patch`, not committed): the next attempt should find why rendering
   that slot crashes the frame (most likely the settings client's strict child entries need the DSH root's other providers, e.g. `locale`/`shortcuts`
   hooks the frame's root does not inject) rather than rendering it blind.
3. **Baseline check after the revert:** with the revert the gate gets past the frame, the left Projects panel and the chat tab, and now fails at "the right
   panel did not open with its views" (`checkTileInBrowser`), a step the handoff recorded as passing at `2cfe7a93`. It may be a flake or a state difference
   from a full rebuild; it needs a rerun on a quiet machine before it is called a regression.

Next: fix the settings opening at the dialog's owner (render the settings dialog inside the frame with the providers its root expects, or have the workspace
run the `settings.open` path through the settings trigger), then the gate's steps after Settings (palette, PTY tab, /app tile, chat mock), then the door's
re-provide scenario.

## 13. The app's own plugin rows in the frame (design note, 2026-10-31)

Found while asserting the agent template's panel inside the `/app` tile: the generated layer mounts only the app's routes row, so an app's own plugins never run
in the frame host. On the agent template that means no agent panel on the page, and no `/ask` either; the blank template is unaffected because it has no plugins
of its own.

### 1. Which rows the host owns, and which the layer owns

The host launcher mounts, in its own layer: `node-server` (the framework's server), `web-server` (the webServer port DSH's driver rows register on), `page` (the
document and the index tap), the client rows, and the DSH driver rows it selects by id. `app-instance` comes from `app/runtime.mjs`. The generator's layer keeps
`app-routes` (`./src/frame.ts`), the frame packages with their rows, the door row when the app carries one, and the disabled/overridden DSH rows it already
writes. So the layer owns: the app's routes row, the app's own plugin rows, the frame packages, and the door. The host owns: the server, the web-server port,
the page, the app instance, and the DSH driver selection. `manifest` and `save` are app plugins but not rows the frame needs (they are CLI-time tools), so they
stay out of the layer.

### 2. How the app's own rows mount

The same entries the app's own server mounts: the app's `blend.yaml` lists `- id: <name>` rows, and each resolves to `./plugins/<name>/index.ts` (the folder the
scaffolder copied). The layer should carry them in `blend.yaml` order, after `app-routes`, skipping the ids the host or the generator already provides
(`instance`, `acryl-router`, `acryl-node-server`, `acryl-web-server`, `acryl-page`, `manifest`, `save`, `acryl-door`). The attempted implementation in
`packages/cli/src/init.ts` did exactly that (reading `blend.yaml`, falling back to the plugin folders, `readdirSync` for the rest) and is reverted, not landed.

### 3. What actually fails, measured

With those rows in the layer, DSH's startup audit reports (text as printed):

```
Failed plugins (6):
  agent
    Package: ./plugins/agent/index.ts
    failed to import
  tasks
    Package: ./plugins/tasks/index.ts
    failed to import
  sandbox, extensions, builder, openai: the same
```

`failed to import` is `dsh-app-boot`'s label for a row whose Loader entry has no fiber (`inactiveEntries`: `if (fiber === void 0) ... error: "failed to import"`),
so the real import rejection is swallowed. What was measured around it, on a scratch framed agent app:

- Patching `cordis-plugin-loader`'s own `_init` catch to print `error` printed **nothing**: the row never reaches that catch, so the import happens on another
  path (DSH's boot importer), which is where the next session must print the rejection.
- The same plugins import cleanly from the app folder with the app's register:
  `node --import ./plugins/acryl-node-server/src/register.ts -e "import('./plugins/agent/index.ts')"` prints `agent ok` (and the same without the register).
- It is not a row-id collision: prefixing every id (`app-agent`, ...) fails identically. It is not the loader's TypeScript extension rewrite
  (`__rewriteRelativeImportExtension`, which turns `./x.ts` into `./x.js`): an absolute `file:///.../plugins/agent/index.ts` row name and an extensionless
  `./plugins/agent/index` row name fail the same way. All six app plugin rows fail while `app-routes` (`./src/frame.ts`) and the framework rows mount.

Next: instrument DSH's boot import of layer rows (the path that runs before the Loader's `_init`) and print its rejection; the two candidates are a different base
URL for rows inside the app's `plugins/` folders, and the boot importer evaluating rows before the app's register hooks are installed. Once the cause is known, the
rows land in `init.ts` as described in (2) and the agent template's panel assertion can go back into the page gate.

### 13a. The cause, measured, and what mounting the rows then needs

The swallowed rejection, printed by patching the Loader's activation step: `Error: invalid plugin, expect function or object with an "apply" method,
received object`, once per row. A Cordis row's module must BE the plugin, while the app's registry mounts NAMED plugin objects
(`import { agent, memory, model, tools } from '../plugins/agent/index.ts'`; `export const registry = { tasks, model, tools, memory, agent, ... }`), so the module
namespace has no `apply`. That is why the rows never reached the loader's import catch: the import succeeded and the plugin check threw afterwards.

A working mount is a one-line generated adapter per row, from the same source of truth the app already has (`src/app.ts`'s imports and its registry), never a
hand-kept list:

```js
// frame/<row>.mjs
export { agent as default } from '../plugins/agent/index.ts'
```

and the row names `./frame/<row>.mjs`; a row imported as a namespace (`* as panel`) mounts the module directly. Tried in a scaffolded agent app: all rows
load and apply, and two further needs surfaced, which are the next step:

- **The rows need their composition config.** The app's server passes per-row config in `createApp` (`builders`/`extensions` sources and the rest are set in code,
  not in `blend.yaml`), so the layer's rows run without it: the builder row then fails with its own clear error ("the builder writes into …/plugins, which is
  not an extensions source"). The composition the app's server builds should be exported by the template (one function `appRows()` the server and the generated
  layer both mount), so the frame composes the app exactly as its own server does, config included.
- **The launcher must print the cause.** DSH's "failed to import" hid this for two rounds, here and in ACRYL's 178 rows. The generated `scripts/ide-host.mjs`
  should catch the boot's StartupError and print each failing row's id, module and the full error chain (`error.entries` carries the original failures), and
  `--check` should fail naming them.

Both are prerequisites for re-mounting the app rows and for the agent template's panel assertion in the page gate.

### 13b. The composition row, landed, and the service-name collision it hits

`composeInto(ctx, chosen, options)` is now exported by the agent template's `src/app.ts`: `createApp` calls it (same rows, same order, same config as before; its
own suite is 15/15), and a generated `frame/app-plugins.mjs` row can call it with `{ host: true }` (no server config, and the server and door rows left to the
host). The generated launcher also prints the boot's failure chain now: on a StartupError it lists each failed row's id, module and full error, then exits 1;
`--check` already names every inactive row.

Mounting that row hits a second, bigger collision, measured: the app's own plugins and the host's DSH driver rows use the same Cordis service names. First
`Error: service "tools" has been registered at <ToolRuntime>` (DSH's driver `tools` row versus the app's `tools` plugin), and after isolating `tools`, `agent`,
`settings` and `workspace` in the row's scope, `Error: service "agent" has been registered at <tools>` - a per-service `isolate()` does not separate the
providers the way the mount needs.

So the next decision is not mechanical: either the app's whole plugin set mounts in a fully isolated scope (every service it provides isolated, which Cordis
supports but which needs the list derived from the app's registry, not hand-kept), or the host stops mounting the DSH driver rows whose names the app replaces
(`tools`, `agent`, `settings`, `workspace`) when the app brings its own - which changes what the chat driver rows see. That is a design call for the
coordinator, with the two exact errors above as the evidence.

### 13c. Scope isolation, tried: the derived list works, the app's own composition collides under it

Per the coordinator's decision (a), the mount was tried with the isolate list DERIVED from the app's own plugins (read from their sources: a Service's
`super(ctx, 'name')` and a `provide('name')`, restricted to the blend.yaml rows the host does not provide). For the agent template the derived list is exactly
`agent, extensions, memory, model, sandbox, tasks, tools`, and the row is generated with it. Booting then collides INSIDE the app's own composition, not with
the host: `Error: service "model" has been registered at <tasks>` although the app's own server mounts the same rows without isolating them. So the per-name
`isolate()` chain (one label, built by extending the context name by name) does not reproduce what the app's server does for the app's rows; the next probe is
how Cordis expects one bounded context to be isolated as a whole (one extension with the full map, or a forked context whose group keeps the app's rows in one
scope), with the app's own suite as the oracle: the app's rows must activate exactly as they do standalone, and only then can the host's driver rows keep their
own copies of the same names.

The row generation code is written and reverted (not landed); the derived-list scan itself is sound (it found exactly the seven services the app provides).

Attempt detail for the next probe, so it is not retried: the row already mounts the app under ONE child lineage - `let scope = ctx; for (const name of
APP_SERVICES) scope = scope.isolate(name, 'app-plugins')` - one context built once with a shared label, not a fresh label per name. That is the variant the
decision (a) note suggested, and it is the one that produced `service "model" has been registered at <tasks>` inside the app. A different mechanism is needed,
not a repeat of this one: either a context whose group keeps the app's rows in one scope as the app's own server does (the server mounts every row through one
`compose()` call on one plain Context), or a separate root Context for the app with the host's shared services (router, state, webServer, nodeServer) provided
into it explicitly.

### 13d. The Loader's entry isolate works; the panel's script still does not load under the host

Following the coordinator's lead (2), the app's rows mount through the Loader's own entry option: the generated `app-plugins` row carries
`isolate: {"agent":true,"extensions":true,"memory":true,"model":true,"sandbox":true,"tasks":true,"tools":true}` (the derived list), and `composeInto` with
`host: true` leaves out the host's infrastructure rows (`instance`, `acryl-router`, `acryl-web-server`, `acryl-page`, `manifest`, `save`, `acryl-node-server`,
`acryl-door`). Measured result: the host boots with every row active - DSH's driver rows and the app's own plugins coexist, no service collision - and the app
answers at `/app` with its page carrying the agent-panel and door script tags.

What still fails: the panel UI does not appear in the page. The app's panel endpoints are mounted on the host router at the ROOT (`/api/agent-panel/...`), not
under `/app`, and at that root they answer 401 to a plain request (`/api/agent-panel/panel.js` 401, `/api/agent-panel/session` "unauthorized"), so the panel
script is refused in the page even though its tag is served. The next probe is the panel's own origin/token admission under the host (its standalone gate,
`verify-agent-panel.mjs`, shows the contract it expects), not the composition.

The code is written and reverted; the branch stays green at the approved pair plus the notes.
## 14. Handoff at the hub-token step (2026-10-31)

`55f1f673` is the landing candidate approved with the full check green (scaffolder OK, verify:ide-host 72 rows + PENDING/restore + two reloads, verify:ide-template green end to end including Settings; whole chain EXIT 0). `7c694afc` is the next step and also has the full check green: routerHttp exposes a stable per-service hub token; the door keys its socket owner and prefix claim on it; the node server refuses any upgrade that reaches the HTTP fetch path before raw HTTP routes (503 for a WebSocket upgrade, 400 for another protocol); the reject writer checks the socket so a second handler can never answer twice. Suites: node-server 553, router-http 20, web-server 7, door 168 passed / 2 skipped; lint green; full check EXIT 0.

The narrowed re-provide state: the door's provider-removed-and-restored test (`tests/host/hub-ownership.spec.ts`, still skipped) now shows its steady state answering the upgrade with a plain 200 (`never opened (refused 200, refused 200)`). The transition windows themselves are clean: an upgrade with no listener is refused 503/400 before any HTTP route, never answered twice, and no write-after-end remains. The three supporting scenarios pass (node-only, routerHttp after the node server, routerHttp before the door).

The two hub generations: when the routerHttp row is disposed, its hub is closed with the service, but the prefix and upgrade claims made through `routerHttp.mount` can outlive it because the door's release is driven by service-change events rather than the service's own lifecycle. The re-provided service has a new hub token, so the door remounts the page socket route with the new allow; the surviving claim's handler still emits into the old hub, whose bindings the new route does not share, and the route answers the upgrade through its non-upgrade path (the plain 200).

Next idea (not yet coded): bind the claim and the page socket route to the service's Cordis lifecycle instead of to events. Mount both inside `ctx.inject(['routerHttp'], ...)`, so Cordis disposes them exactly when the service goes away and re-runs them against the new service; keep the node-server fallback in a scope active only while routerHttp is not provided. The hub token then only picks the allow for the scope that owns the route, and no state can survive the service it belongs to. A second, smaller idea if that still leaves a window: have the stable claim handler answer 503 whenever the owner generation it was made for is not the current one, so a stale claim refuses instead of reaching the old hub.

## 15. Handoff at the lifecycle-bound socket (2026-10-31)

`ad682bbf` on 107-host-page: the page socket route is mounted once at apply, before the private API routes, so a host restart cannot lose its precedence; the middleware asks for the live upgrade helper per request and refuses 503 while none is ready. While routerHttp exists, its `ctx.inject` scope owns the prefix claim and sets the helper, and Cordis disposes the claim with the service; the node server's hub is the helper only while routerHttp is absent. The transition windows are clean: 503 before any HTTP route and no double answers. Node-server 553 tests, door 168 passed / 2 skipped, lint green. The re-provide test is still skipped.

The narrowed remaining state: after routerHttp is disposed and re-provided, the steady state answers the upgrade with a plain, empty 200 (`never opened (refused 200 , refused 200 )`). With the route precedence and the claim lifetime now taken out of the equation, the 200 comes from the upgrade path itself on the re-provided service: the route's ownOrigin passes, the helper returns a 200 with an empty body rather than a handshake, which is what this router's upgrade helper does when the request it sees is not carrying the hub's upgrade bindings. The next investigation should look at the re-provided RouterHttp's hub and emitter: whether its setupWebSocket listener is attached to the emitter the claim emits into (the claim is made by `http.mount` inside the inject scope, so the emit target and the listener should be the same hub unless the mount resolves `this.ctx`/web differently on a second instantiation), and whether the `ctx.inject` activation for the new service runs before the route reads the helper (the 503 path would be visible if it did not). A focused probe: log the hub token and the emitter identity in the routerHttp adapter's `upgrades()`/`mount` on both activations, and the status the helper returns in the route.

The two earlier handoff sections still hold: the hub-token step (section 14) and the frame/page gate (sections 11-13), with the full check green at `7c694afc` and `55f1f673` approved for landing.

## 16. The section 15 probe: identities are consistent, the 200 is inside the re-provided hub

The probe ran on `225d4944` with the identities numbered by object: activation 1 created token 1, emitter 2 and hub 3; activation 2 created token 4, emitter 5 and hub 6; after the re-provide the raw claim's handler emits into the NEW emitter (5) and the NEW hub (6), and the page socket route reads a helper from that same new hub. So the steady-state 200 is not a claim/route generation mismatch: the right hub, the right emitter and the right helper are all in play, and the failure is inside the re-provided hub's upgrade path (the helper answers a plain empty 200).

What differs from activation 1 is the presence of the node server's `UpgradeHub` on the HTTP server (attached during the dispose window) with its `setupWebSocket` listener running with `skipWhenRawUpgrade: true`, while the routerHttp hub's listener runs on its own emitter. The next probe: label the two hubs in `adapter/websocket.ts`'s setup listener (a new option, only for diagnostics), log whether `WAIT_FOR_WEBSOCKET_SYMBOL` and `wss` are in the env the helper sees, the status of the `fetchCallback` result before it is written, and whether the helper's middleware called `next()` (a plain 200 with no body is what a router fallthrough or a deferred helper would leave). That separates the hub's binding plumbing from the door's route.

State: `225d4944` is the landing candidate (full check EXIT 0 at `225d4944` and at `ad682bbf`); the re-provide test is skipped; node-server 553, door 168 passed / 2 skipped, lint green; the probe edits were removed and the worktree is clean.

## 17. The re-provide scenario is fixed (2026-10-31)

Measured in the re-provide test at dispatch: the node server held three `upgrade` listeners, `[raw, raw, setup:node]` - two raw listeners, both attached at the emit (Node copies the listener array at emit, so a listener re-added during an emit cannot be called for that request; the second raw listener had been attached at an earlier moment and never removed). One request was therefore dispatched twice into the hub, the first waiter rejected and the second run found none, and the setup wrote the router's plain empty 200 down the socket.

Fix: the raw upgrade listener is attached once when the node server is made and consults the claim registry for the server's lifetime; claims coming and going never add or remove a listener. `upgradeListenerCount` is exposed for the test, which asserts it is 1 and stays 1 across a claim added, removed and added again. The WeakSet remains only as a guard; the re-provide test passes with the guard disabled, which proves the single ownership is the fix. Refusals keep one writer: an unclaimed WebSocket upgrade gets 503 and another protocol 400 from the raw listener (flagged so a hub setup leaves it alone), and a hub's own rejection no longer depends on the server's listener count.

`66865602` carries the fix and the door's provider-removed-and-restored test is unskipped and green (101 exactly once). Suites: node-server 554, router-http 20, web-server 7, door 169 passed / 1 skipped; lint green; full `pnpm run check` EXIT 0 on `66865602`. Sections 14-16 are kept as the record of the narrowing.

## 18. The panel under the app's mount (2026-10-31)

Section 13d left one blocker: the panel script was refused in the page. The cause was measured in the driver, not in the panel: DSH's `connection` row registers a `prefix /api`
route on the host's webServer (`deepseek-harness/packages/client/connection/src/index.ts`, `API_PATH = '/api'`), and that route answers every request under `/api` first. Its
admission refuses a request without DSH's browser session with exactly the 401 `unauthorized` seen in the page. The panel had mounted `/api/agent-panel` on the host's router at
the ROOT, so the driver's prefix route answered before the router ever saw the panel, and the panel's routes were not under the app's mount (`/app`) at all.

Fix, at the cause: the panel row takes the app's mount as its config (`mount`, the same rule and the same validation family as `clientModules`'s option). Its routes, the
script tag it adds to pages, its client-module mount and its WebSocket path are all `${mount}/api/agent-panel`, and the served `panel.js` calls `start(prefix)` so the client
uses the mounted path instead of a hardcoded root one. The agent template's `composeInto` passes `FRAME_MOUNT_PREFIX` (`/app`) in host mode, as a config override keyed by
the row id `agent-panel`, the same mechanism that carries the `server`, `tasks`, `extensions`, `builder` and `model` values. On the app's own server the row keeps its
default (the root), so standalone behavior and the standalone panel gate are unchanged.

The admission is the same one, not a loosened one: `Sec-Fetch-Site: same-origin` (or `Origin` equal to `Host`) for the session, and the token for ask, stop and run, now at
`/app/api/agent-panel/...`. The page gate asserts both directions: the panel appears in the app's iframe, offers its `agent` driver, and "add 2 3" produces a run that starts
and stops with "The answer is 5." in the panel's own log; a cross-site session and an ask without the token answer 403 at the mounted path.

Measured in the page gate: the panel script loads at `/app/api/agent-panel/panel.js` (200 through the `/app` routerHttp mount), the client modules compile and load under the
same prefix, the session answers and the run's events arrive over the panel's socket, all inside the app's tile. The panel unit suite gains the mounted case (routes under the
mount, nothing at the root, the mounted import and the `start('/app/api/agent-panel')` call, the mount's validation).

The same shape applies to any app plugin that mounts its own routes rather than joining `makeApp`. The PTY driver is the second: `driver-pty` takes the same `mount` config, its routes and
client modules live at `<mount>/api/driver-pty`, and `composeInto` passes `FRAME_MOUNT_PREFIX` to its row too (the row exists when `add driver-pty` mounted it; the override is unused
otherwise). A terminal driver now carries its view with it (`view: { module, prefix }` in `acrylblends/drivers`, read in the panel's session), so the panel loads the terminal module and
calls its endpoints at the mounted path instead of knowing `/api/driver-pty` itself. The shared mount rule is one function, `mountedPrefix` in `plugins/agent-panel/mount.ts`, used by the
panel and the PTY driver.

The page gate adds `driver-pty` to the agent app (with `programs: { node: [] }`, so it does not depend on which coding agents a machine has) and asserts the terminal at the mounted
path: the session names `pty:node` with its view under `/app/api/driver-pty`, the view module answers there, a session starts (200 with an id) and stops (200), and a cross-site or
untokened start answers 403. The PTY suite gains the mounted case on the same rule the panel's gained.

Survey of the other app-owned rows that claim a root `/api` path under the host (2026-10-31): `acryl-state` mounts `/api/state` on the router, and `acryl-inspect` mounts `/api/inspect`;
both also claim that prefix through `routerHttp` when it exists, and the host's raw routing picks the longest prefix, so `/api/state` and `/api/inspect` beat DSH's `/api` and are served.
They work, but they live outside the app's mount (their browser modules are addressed root-absolute, `/api/state/client.js`); moving them under the mount is a later change, not a
breakage. The door's `/api/acryl-door` is host-owned in the frame (the host layer mounts the row, `composeInto` leaves the app's out) and claims a longer prefix than `/api` by design,
because the CLI addresses it by app URL plus that path. The frame packages (`acryl-workspace`, `acryl-plugin-admin`, `acryl-support`, `acryl-sign-in`) are host rows and claim
`/api/acryl-*` through `routerHttp`, so they are never in DSH's `/api`. The templates other than `agent` mount their routes at `/` on their own server and have no framed composition
yet; when they get one they take the same `mount` config the agent template passes.

## 19. `acrylblends upgrade` brings a pre-frame app onto the host layout (2026-10-31)

The parked slice (6fc3d33e, `20b67da0`) was planned against the DSH-profile layout. What still fits the host launcher: the frame half of `upgrade` as a step
planned before anything is written, with per-file conflict detection by the generated marker, a refusal (exit 1, nothing written) unless `--force`, which
saves the app's version under `.acrylblends/upgrade-backup/` first, an idempotent second run, and a boot gate on a real app. What does not fit: the
`scripts/ide-profile.mjs` profile script and the `profile` npm script (the host launcher replaced them), the `app-routes` row alone (the framed app now also
mounts its own plugins through `frame/app-plugins.mjs` with the entry isolate, and the mount config lives in the composition root), and the rule that an app
without `src/frame.ts` simply stays standalone (every app made by the previous published release lacks it; the upgrade now brings the frame row and the
scaffold it needs).

The shape now: the fixtures cover every published release that shipped templates, `acrylblends` 0.3.0 through 1.1.0 (40 versions, checked against npm; the
releases before 0.3.0 predate the CLI's templates), deduplicated by content hash to 31 distinct scaffolds under `packages/cli/legacy/<template>/<hash>/`.
`scripts/build-legacy-layouts.mjs` derives them from the release tags: for each template it takes the route module `src/frame.ts` imports (or `src/routes.ts`)
plus `src/app.ts` where the current template exports `composeInto`, so the file list follows the templates rather than a hand list; `--check` compares the
committed bytes with the tags. `planFrameStep` identifies the app's template from those files and plans three kinds of writes. The template's own files are
`same` when they already equal the current template's, `update` when they equal the released ones, `add` when missing and `conflict` when the app edited
them. The generated files (overlay, `cordis.yml`, `scripts/ide-host.mjs`, `app/runtime.mjs`, `frame/app-plugins.mjs`) are ours by their marker line. The
two host plugins the launcher mounts by path (`acryl-web-server`, `acryl-page`) are copied when missing. `package.json` is merged, never a conflict (its
`dev` script moves to the launcher; `start` keeps the app's own server). The app's `blend.yaml` and any file of its own are untouched. The old
`scripts/ide-profile.mjs` is removed when it carries the generated marker.

`appFrameRows` (the row ids, the isolate scan and the generated composition file) moved out of `init` into `packages/cli/src/frame-rows.ts`, so `init` and
`upgrade` write the same rows from one home; `init` keeps its behavior (a template with `composeInto` gets the app-plugins row; the blank template keeps its
own composition). `applyIdeProfile` now goes through the same plan/write as the upgrade, so planning and applying cannot drift.

Releases before 0.7.8 cannot be carried forward: their `src/main.ts` imports `./plugins/...`, where the app keeps its plugins one folder up (`../plugins/...`
since 0.7.8), so such an app cannot start as scaffolded and replacing the scaffold the upgrade owns would not fix the entry module it does not. The upgrade
recognises that entry module (`brokenEntry`), reports it precisely in the CLI's message ("src/main.ts imports './plugins/...', as acrylblends 0.3.0 through
0.7.7 wrote it ... change those imports to '../plugins/...' and run again"), and leaves the frame alone; their layouts are still in the fixtures so the app is
identified and the message is exact. Every template without the frame row in the current release keeps the older plain report ("the notes template has no
src/frame.ts yet: left standalone"); every built-in template has the row now, so that branch is tested on the planning function with a temporary template
folder without `src/frame.ts`.

Tests: `packages/cli/test/upgrade-frame.test.ts` builds a released-layout app (current scaffold, then the released files, no frame row, no host plugins) and
covers the write and its report, the agent template's composition row with its isolate and the mount config, idempotency, a hand-written overlay refusal, an
edited scaffold refusal and `--force` with the backup, the planning function's no-frame-row branch, an unidentified scaffold, the pre-0.7.8 report, the old
profile script removal, and a loop over every distinct scaffold of all six templates (each upgrades and settles, or is reported). The gate
`scripts/verify-upgrade-frame.mjs` (wired as `verify:upgrade-frame`) iterates every distinct scaffold: the safe ones get the upgrade with every reported
change asserted and `blend.yaml` and a file of the app's own byte-identical, then a second run that must change nothing; the pre-0.7.8 ones are asserted to
get the precise report and no frame files. The oldest releasable layout per template is installed and booted (the frame page and `/app` answer, then the
server and its port are checked gone), and a 1.1.0 agent app is upgraded and run through the page gate (`verify-ide-template.mjs agent --existing <app>`:
composition, `/app`, the panel run, the PTY under the mount, the chat and Settings).

Known boundary: an app whose scaffold was edited (or made by a release other than 1.1.0) is identified only through its other template files; when none
matches, the upgrade leaves it standalone and says so. `--force` covers a recognized template with edited files, never an unidentified one.

## 20. The Windows 10 ConPTY resize: a test child that never read stdin (2026-10-31)

The driver-pty suite's real-PTY resize test failed on mbpi9win (Windows 10 Pro `10.0.19045`): after the driver's resize the child kept its start size. A minimal repro outside the framework (node-pty `1.2.0-beta.15`, and `1.2.0-beta.18`; Node 24.18.0) compared two children of the same `pty.spawn(process.execPath, ['-e', script], { cols: 90, rows: 20 })` and the same `pty.resize(110, 35)` after 2.5 s:

- A Node child that never reads stdin: its `process.stdout.columns` and `getWindowSize()` stay `90x20`; its `resize` event either does not fire or fires with the old size.
- The same Node child calling `process.stdin.setRawMode(true)` and `process.stdin.resume()` (what claude, codex and pi do): its next tick reports `110x35`.
- A PowerShell child printing `[Console]::WindowWidth`/`[Console]::WindowHeight`: `110x35` from the next sample on.

`useConptyDll: true` only makes the spawn size current (a child started after the resize sees `110x35`); it does not change the live case. The node-pty version does not change it either.

Cause: the ConPTY console is resized by `pty.resize` in every case (the client repaints at 35 rows, and the console API reports the new size); Node's tty learns of the change through its console input handling, so a child that never reads its console input never sees it. The real programs the driver starts read stdin in raw mode, so the framed terminal is not limited on Windows 10; the test's ECHO program was the one that never read stdin. It now reads stdin in raw mode on Windows, like a real program, and keeps its POSIX behavior (SIGWINCH reaches Node there). If a Windows host ever again delivers no resize to the child, the test skips with this section as the reason rather than passing silently.

The suite keeps the platform's evidence as it is: the new size where `resize` fires, or the console's `ESC [ 8 ; rows ; cols t` report where it appears.

## 21. The host owns a real profile: durable Settings (design, 2026-10-31)

The workshop rehearsal found the first user-facing defect of the host inversion: in the frame, Settings > Models answered "Loading the provider directory failed: dsh:
failed to read profile manifest <app home>/.acrylblends/package.json", and once that file existed, the DSH "Preview Notice" modal appeared and could not be dismissed
("The acknowledgement could not be saved"). Both come from one fact: DSH's Settings, config editor and plugin manager are written against a launcher-owned profile
(manifest, patch document, reconcile), and our host only fabricates a `profileContext` object. This slice gives the app a real profile in its own DSH home, so every
Settings write persists and survives a restart.

### 1. What DSH reads and writes

- `ProfileContext` (`deepseek-harness/packages/boot/app-boot/src/profile-context.ts:21-40`) is the launcher's contract: `name`, `dir` (the profile directory),
  `patchPath` (the settings document), `installAnchor` (the app's `package.json`), `cwd`, `home`, `startedBundles`, `overlays`, `telemetryDisabledEnv`.
- `readProfilePatches` (`profile-context.ts:64-76`) is the one composition reader: `loadProfileDirectory(dir, installAnchor)` bundle layers (none for us),
  then the `patchPath` file, then `<dir>/cordis.patch.yml` (`PROFILE_PATCH_FILENAME`, `profile.ts:40`), then the launch overlays, then a telemetry patch when the
  composition carries that row. The order is significant: the config editor re-applies exactly this list.
- `loadProfileDirectory` (`profile.ts:655-689`) reads `<dir>/package.json` (the profile manifest) and, per `dsh.profile.bundles`, each bundle's patch files; it also
  parses `<dir>/cordis.patch.yml` as the profile's own patch layer.
- `ConfigEditor.edit` (`packages/boot/config-editor/src/index.ts:95-160`) does, under a file lock: reconcile the current `readProfilePatches` list; read the entry's
  live config; compute the next config; read and update `patchPath` as a YAML sequence (one `{ id, name, config }` patch per edited row); verify through
  `composeEntries` that the document produces exactly the next config (else "overridden by a home patch or command-line overlay"); write the document atomically
  (mode 0o600); reconcile again with the document replacing the `patchPath` file in the list; and on failure restore the previous document and reconcile again.
- `reconcileProfilePatches` (`packages/boot/app-boot/src/index.ts:273-303`) replaces the root Include entry's `patches` with the given list, awaits the Loader,
  and rejects on newly introduced inactive entries (or on any failure of a required id). It requires the boot's Include entry, which `boot()` records.
- The plugin manager (`packages/boot/plugin-manager/src/index.ts:281-330`) reads the same manifest and `installAnchor` to list bundles; a missing manifest is the
  Models error above.

### 2. Who owns the profile files

The host owns the app's DSH home and writes its generated files there on every boot:

- `package.json`: the profile manifest, `{ name, private: true, dependencies: { "acrylblends-frame": "0.0.0" }, dsh: { profile: { bundles: ["acrylblends-frame"] } } }`.
- `node_modules/acrylblends-frame/package.json`: the composition bundle's manifest (`dsh.bundle.patch: cordis.patch.yml`), so DSH resolves the composition the
  way it resolves any installed bundle (from the profile directory).
- `node_modules/acrylblends-frame/cordis.patch.yml`: the composition (the driver rows selected from the base and web bundles, the host rows, the app's frame
  layer), with a "generated, do not edit, rewritten on every boot" header, written with the include's `!!js` tag so it round-trips to the identical patch list.

One file is the user's and the host only creates it when missing: `settings.patch.yml`, the profile patch document `ProfileContext.patchPath` points at. It is
never rewritten by a boot, an init or an upgrade; only DSH's config editor writes it (atomically). The app's own `cordis.patch.yml` (the frame overlay at the app
root) stays the app's generated overlay, a different file in a different folder.

The composition is a BUNDLE, not the profile's own home patch (`<dir>/cordis.patch.yml`), because of precedence, measured: with the composition as the home patch,
DSH's config editor refused every Settings save with "Configuration for ... is overridden by a home patch or command-line overlay". `readProfilePatches`
orders bundle layers, then the patch document, then the home patch; only a bundle layer puts the user's Settings edit after the composition. All three files live
under `.acrylblends/`, which every template's `.gitignore` already ignores.

### 3. Boot and reconcile use the same list

The launcher passes the composition bundle's patches and then the settings document to `boot`, exactly `readProfilePatches`' order and content with no home
patch and no overlays. Without that equality the first settings edit would reconcile the include to a different composition (the editor calls reconcile before and
after its write); with it, the first reconcile is a no-op recomposition and later ones differ only by the edited patch. The gate proves the precedence with one
key set in both places: the composition carries `ui-settings-general.welcomeNoticeVersion` and the user's dismissal writes the same key; the notice stays
dismissed after a host restart only if the document wins.

### 4. PENDING and reload

`reconcileProfilePatches` applies the list through the Include entry, so an edited row follows Cordis' ordinary update path: unchanged rows keep their fibers, a
changed config reloads its fiber, a row whose new config no longer satisfies its dependencies becomes PENDING until the dependency returns, and the editor's
required-id set turns a new failure into a rejected save (the editor then restores the document and recommits the previous list). The settings form's namespace
values come from the same document through `SettingsForms.describe`, and its revision counter is driven by the reload event, so the client sees the new value
without a page reload.

### 5. What stays fabricated, and what is out of scope

`startedBundles` stays as it is (our start is the launcher, not a DSH plugin install), `overlays` stays empty, and the plugin manager's install/remove operations
(for profile bundles) remain out of scope: the app's plugins are upgraded by `acrylblends upgrade`, not by DSH's manager. What this slice fixes is the contract
the Settings screens themselves exercise: the manifest read, the document read/write, and the reconcile.

### 6. Verification

The page gate (`scripts/verify-ide-template.mjs`) gains the workshop's day-one path: open Settings > Models and assert no error text and the provider rows; dismiss
the Preview Notice and assert it closes; restart the host with the same app home and assert the notice does not return (the acknowledgement persisted); add the
model key in Settings > Models and save; and chat with it against the local mock. It also asserts the secrets rule: after saving, the key text appears in no
`package.json` and in neither patch file (the settings document or the composition), only in DSH's credentials store. The precedence fixture is the notice itself:
the app's overlay carries a composition patch for `ui-settings-general.welcomeNoticeVersion`, the dismissal writes the same key in the settings document, and only
a correct order keeps the notice dismissed across the restart. A unit test in `packages/cli/test/upgrade-frame.test.ts` proves `init` and `upgrade` leave an
existing `settings.patch.yml` byte-identical and never report it. The existing checks (composition active, PENDING/restore, two reloads clean) keep proving the
recomposition itself.

## 22. Handoff: the workshop guide (branch 114-workshop-guide)

The attendee guide is `docs/framework/workshop/README.md` (with `facilitator.md` beside it); the registry repository `github.com/acryldev/workshop-2026-11-20`
(cloned read-only during the rehearsal) carries no guide, only the registry README, `CONTRIBUTING.md`, `index.json` and the entries, so the guide's publish block
must stay consistent with that README.

Target flow (the coordinator's outline): create an app; it opens in the ACRYL frame with sessions, the right panel and Settings; add the model key in Settings >
Models; chat; run claude/codex/pi in a PTY tab; edit the app and see it at /app; upgrade an older app.

Rehearsal setup measured on this Mac (2026-10-31): the packed `acrylblends` tarball (`scripts-pack.mjs copy`, `npm pack --ignore-scripts`, `scripts-pack.mjs
remove`) installed with a prefix into an isolated HOME; the app scaffolded by the packed CLI with `ACRYLBLENDS_FRAME_PACKAGES` through the checkout bridge (the
frame packages are unpublished; their tarball pipeline is `verify:frame-publish`); `npm install` with an isolated cache; `npm run dev` with `ACRYLBLENDS_HOME`
and `DSH_HOME` under the app and `ACRYLBLENDS_PORT=0`, never 3080. `npm create` cannot be rehearsed from a tarball because `create-acrylblends` resolves its
`acrylblends` dependency from the registry; use the packed CLI (`acrylblends init`).

Frame UI measured: left Projects/sessions with the app as a project and `New session`/`New chat on <app>`; the right panel with Files/Changes/Review/Checks/
Comments/Terminal; Settings sections General/Models/Built-in plugins/Agents/Tabs/Command palette/Shortcuts/Support; the tab menu opens New Terminal, New Browser
Tab, New File, New Diff, New Board, New Doc, Workspace brief, AcrylDSH Chat and coding-agent tabs (Claude, Codex, Pi, ...); a terminal tab starts in the app folder;
a browser tab reaches `/app`; `.acryl/door.json` appears in the app.

State carried into 114: 115 gives the host a real DSH profile, and the fresh-app page gates (agent and blank) are green on the day-one path: Settings > Models
loads and takes the key, the Preview Notice is dismissed and stays dismissed after a restart, the chat needs no key card after a settings reload (the reload is
what makes a saved key effective in the running page) and answers against the mock, and the key text is confined to DSH's `.credentials.yaml`. The upgrade gate's
page run on the upgraded fixture is green after that reload, and the reload's window is a product rule now, not a gate workaround. The frame restores the shown
chat's worktree asynchronously after a reload (the session list arrives, then the tree follows the chat's folder; `relocateShown` documents the
startup-before-discovery case), and a reload can also come back with no shown chat at all. A new chat asked in that window used to open with no selected
worktree, which the canvas answered with "Select a worktree first." and no composer. In the ported `ide/acryl-workspace` package, `WorkspaceShellState` now
exposes `restoring()` and `waitForSelection()` (8 s bound; a selection settles waiting callers, a restore that ends without one settles them with undefined,
and disposal settles them too), and `WorkspaceCanvas.openChat`, with no selected worktree, shows "Restoring the worktree of the open chat…" and opens the chat
on the worktree once the selection resolves; when no restore picks one (a reload with no shown chat), it falls back to the first worktree the sidebar lists
(the app's project) and selects it. Only a workspace with no worktree keeps "Select a worktree first.", and a chat is never opened with no worktree. The page
gate now asks for the new chat as soon as the frame is back - inside the window - with no fallback or worktree retry (it retries only the tab menu's own press
when the menu did not open), and its Settings step waits for the dialog instead of accepting an immediate snapshot. The upgraded app itself was complete
(profile manifest, composition bundle with the `workspace-controller` `documentsDirectory` config, `storages/workspace.json`); the persistence design is
unchanged.

Remaining for 114: rewrite the guide's blocks to the frame flow (day-one frame; Settings > Models; chat; a coding agent in a PTY tab; edit the app and see it at
/app; upgrade an older app), rehearse end to end exactly as an attendee would from the packed CLI in an isolated HOME, fix every failure at the cause, commit to
`114-workshop-guide`, and push nothing to the registry repository without the coordinator's approval.

## 23. CI after 115: the restarted host's token, and the notice check's Chrome (2026-10-31)

The first CI run after 115 landed (`797c8215`, run 41247560397) failed only in the two frame jobs. macOS, `blank`: after the settings restart the tile check
failed. The restart mints a new connection token - the log shows the same port with two different tokens - and the gate does refresh `url`, `origin` and the
cookie jar through the new token (the frame rendered after the restart), so the failure was the tile itself: its one-shot "Go" press landed on a fresh page
whose tile was still wiring, and the app's page never loaded in the iframe. The tile check now presses Go up to three times (the address stays typed) and, on
failure, names the iframe's `src`, title and text instead of only the server output. Windows: the notice check's own headless Chrome did not open within its
20-second loop, with Chrome's output discarded; the launch now waits up to 60 seconds, ends early when Chrome exits, and names the exit code and Chrome's last
lines. Product note: a host restart issues a new token, so a frame left open with the old token is expected to be re-opened through the browser with the new
printed URL; the gate follows the new token rather than requiring an old tab to survive the restart. The frame jobs on `118-ci-after-115` are the evidence.

### The rerun on 118 (`ba180b23`, run 41249023980)

Ubuntu green; the two others named their next causes. macOS: the Go re-press let the blank tile pass; the agent gate then failed at Settings > Models because the dialog opened on General (a remembered section) while the gate assumed Models - the gate now presses the Models section explicitly. Windows: `stopServer`'s port check ran `lsof`, which does not exist there, and crashed the restart (`Cannot read properties of undefined (reading 'trim')`); the holder is guarded now, so a missing tool reads as "no holder" and the ended process is the evidence. The notice Chrome's own diagnostics did not trigger.

**Open cause (product): the first Go press on a freshly loaded frame.** The re-press is a gate mitigation, not a cause fixed: if the first Go does nothing, an attendee who clicks once sees nothing happen. Likely the tile's Go handler is not attached when the page first paints (hydration), or Go fires before the address is committed. The product fix is that Go works on the first press, or stays disabled (visibly) until it can; the gate then presses once.

**The frame surviving a dev restart (decided 2026-11-02).** A host restart minted a new connection token (same port, new token); a frame left open with the old token had to be re-opened through the new printed URL. The owner decided: persist the access token in the app's git-ignored `.acrylblends` home, owner-only, written atomically at mint time, reuse it on later boots, and add a command that reprints the frame's URL (and one that asks for a fresh token); an open frame survives a restart. Implemented on branch 119 (section 25): `.acrylblends/frame-url.json` holds `{version, url, token, pid, writtenAt}`, 0600 (a restricted `icacls` ACL on Windows), a temp file renamed over the old one; the launcher writes it at mint time, and on every later boot gives the stored token back to DSH's connection through the one seam the pinned package offers (the instance field `browserAuth.launchToken` that `authorizeIndex` and `authenticatedUrl` read; nothing in the package is edited, and a package without that shape simply keeps its fresh token). The printed URL is therefore the same on every restart and an open page - even one whose cookie was lost - comes back by reloading its original URL. `acrylblends open [dir]` prints the address of the frame that is listening (a stopped or never-run frame is explained on stderr, never a dead token); `acrylblends open --new` rotates the token in the running host through a token-authenticated route the launcher mounts (`POST /api/acryl-frame/token/new`), so the old address dies at once and the new one is printed and stored.

### The real Settings causes (`b0139d49`'s red, found with a local dialog dump)

The "no Models section" error on every frame job and on the check jobs was two things, neither of them the nav selector. The page opens DSH's first-run "Add an API key to get started" dialog on a profile without a key, and the gate accepted any dialog as Settings (its wait returned on the first `[role=dialog]`), so it looked for the section list in a dialog that was not open. The gate now dismisses that first-run dialog with "Configure later" - the user's own path - before pressing Settings. And the real Models page saves a provider key with **Apply** (the first-run card's button was "Save and continue"), so the gate tries Apply first and the card's button second. With those, the agent gate runs end to end: Settings > Models takes the key, the chat needs no card and answers against the mock; the blank and upgrade gates pass in the full check. The real DOM was read once, as asked: the only dialog at the failure was the first-run card, and the Models page's buttons are Cancel / Apply.

**Resolved in section 24:** the first Go press (the address field is read directly and every press reloads, with a bounded automatic-reload net for a transport error), and the frame gate's Settings press (the frame's own foot button, pressed until its dialog opens). Readiness is ruled out as the cause of the tile's error page by that run's own timeline.

## 24. CI stability on one tree: the tile's press, the Settings press, a refusal's body (2026-11-01)

Run 41258550752 on `94548f5d` (the merge of the green 118 tip) was red in three jobs on a tree that had just passed: the notes frame gate on ubuntu
("Settings did not open"), the chat frame gate on macOS (the tile's iframe had `src` and no readable document), and `packages` on Windows Node 22
(acryl-db-sqlite's ten-cycle loader test at the 5-second default). Each had its own cause, and each is fixed at the cause on `120-ci-stable`.

**The tile's first Go, and a failed load no press could recover.** The browser tab submitted `draft`, the React copy of the address, so a press that
arrived before the input's state had committed submitted nothing or the previous address. It now reads the address field itself (`name="address"`),
which is what the person sees. The address bar is uncontrolled for the same reason: nothing rewrites the typed text under React's tracker. A press of
the address already loaded was a no-op too, because `updateTile` with the same `url` changes no state and the iframe never reloads; every accepted
press now remounts the frame through a key. The gate presses Go once, as an attendee does, and names whether the iframe's document was readable when it
fails. Tests: a submit with the field's value ahead of React's state (the old code did nothing), a same-address press remounting the frame, and the
attempt rule.

**Cause fixes and safety net.** The live field read and the remount on every press are the cause fixes: a press is never lost, and a failed page can
always be reloaded. A finished load whose same-origin address has no readable document is the browser's error page (a real same-origin page always
exposes its document; a cross-origin page also hides it, and is never retried): the tile loads it again, at most three attempts per press with 250 ms
between them, then settles on the error page. That net is deliberately not offered as the cause fix.

**Neither readiness nor a socket from before the restart is the cause.** In the failing macOS chat step /app answered at 01:00:35.965, the host
restarted at 01:00:40.143, the new page rendered at 01:00:41.922, Settings > Models saved at 01:00:43.783, a PTY ran at 01:00:44.795, and the tile's
GET /app at about 01:00:45 had no readable document, while every request around it succeeded against the same server. An app route that is not mounted
answers a readable 404; only a transport failure produces the browser's error page. The tile-check browser is fresh: the notice check runs its own
Chrome and kills it before the tile check starts, so no socket from before the restart can be in its pool. node-server's disposer does close
connections on stop (`hub.close()`, `closeAllConnections()`, `close()`), and the generated launcher disposes the fiber on SIGINT/SIGTERM.

The mechanism therefore stays open until a net log names it: the tile check's Chrome now writes `--log-net-log` to the runner's temp folder, the
failure message prints the path, and the frame job uploads `frame-netlog-*.json` as an artifact only when a gate fails. The error code
(ERR_CONNECTION_RESET, ERR_EMPTY_RESPONSE or ERR_ABORTED) then decides between a kernel-level reset on a pooled connection and a cancelled subframe
navigation.

**Queued: a graceful node-server stop.** The disposer closes all connections immediately (`closeAllConnections()` before `close()`), so an in-flight
request at stop time is cut, for example a save while the app restarts. Requested: `closeIdleConnections()` first, a short bounded grace for in-flight
requests, then `closeAllConnections()` and `close()`, with a test that an in-flight request completes when stop begins. Queued after the three green CI
runs.

**The Settings press.** The last step used the generic `click('Settings')`, which takes the first control with that exact name anywhere in the page,
and one press of a wrong one, or of the right one before its dialog was wired, was lost. The first replacement pressed the frame's foot button on
every poll and then checked, and `41352589158` exposed its flaw: a poll could press while the dialog was already opening and stop on a dialog that was
closing (the new wait returned true), and the old snapshot check right after it then failed with the very same "Settings did not open" dump, on ubuntu
notes and macOS blank alike. The gate now looks first and presses only when no visible Settings dialog is up: every Settings-labelled button in the
left pane is pressed (the visible foot button goes through the product's `openSettings` path, and the hidden upstream shell's own trigger sits beside
it), the plain DSH trigger is the fallback when the pane offers none, and only a visible dialog whose nav carries a real section (Models) counts, so a
stale or hidden dialog cannot be mistaken for Settings. The candidates are still named on failure. The notes, blank and upgraded-agent gates pass
locally with it, together with the single Go.

**The notice check's profile cleanup.** Run `41352593171` (check, Linux Node 22) failed with `ENOTEMPTY: directory not empty, rmdir
'/tmp/ide-template-notice-...'`: the notice check killed its Chrome and removed the profile in the same breath, while Chrome was still writing it.
The cleanup now waits for the process to be gone (bounded at five seconds) before removing with the tile block's retries, and the outer cleanup
waits for a SIGKILLed host to exit before removing the scratch. A passed check no longer dies on its own cleanup.

**The agent panel's answer wait.** Run `41358355702`'s macOS agent step then failed at the in-app panel: "the panel's run did not start and stop in the
app's page: undefined", with the panel, its synchronous submit wiring and the template unchanged from `98355d28`, where the same step had passed. The
offline agent answers in well under a second on a quiet machine, so the tight part was the 30 s bound on a loaded runner; the wait is 60 s now, and a
failure carries the panel's own log, button states and driver list instead of only `undefined`.

**The SQLite bound.** The ten open/close cycles measured 1.2 to 1.4 s in three runs on Windows 10 (mbpi9win, Node 24.18), so the 5-second default is
honest cost under a loaded windows-latest runner, not a hang. The test carries the same 20-second bound as the kv-db ten-cycle test.

**A refusal answered before the request body (the queued ECONNRESET ticket).** The adapter (`acryl-router-http`'s `serve`) wrote the answer and ended,
leaving a request body the handler never read (a guard's 403, a 415, a body over its limit). Node then closes the socket with data pending, and the
peer sees a reset instead of the answer: read ECONNRESET in the workspace git worktree test on Windows, and reproducible on macOS with a client that
writes half a body and waits. `serve` now settles an unread body (bounded: one second, resumed not buffered) before writing the answer, so the client
can finish sending and read it. The test writes half a body, asserts no answer arrives yet, finishes the body, and reads the 403; the old adapter fails
the first assertion on every OS, the fixed one passes.

**The composer after a reload (product).** A reload mounts the chat surface before DSH's composer and nothing moves focus into the message box, so the
page lands on the body and an attendee clicks before the first word; the same happens when the worktree restore re-renders the surface and replaces the
focused node. `focusChatComposer` watches while a chat is the shown tab (bounded at 30 s) and focuses the composer only when focus is on the page
itself, never from a field, a dialog, a menu or a control the person is using. Tests cover the late composer, the field and the dialog, the replaced
composer and the deadline.

## 25. The workshop flow rehearsed (2026-11-01, branch 119-workshop-guide)

The handout was rewritten to the frame flow (create; the frame opens on the app; Settings > Models; chat; a coding agent in a terminal tab; edit and
see it at /app; upgrade an older app; publish as take-home), and then walked on this Mac from the packed CLI in an isolated HOME, never on port 3080.
Every stopping point in that walk was a product cause, not a guide step:

- **The frame opened on an empty canvas (fixed, `8d2615b1`).** The app was only reachable by pressing +, choosing New Browser Tab and pasting a full
  address with `/app`. The overlay now tells the workspace row where the app's page is (`appPage: /app`, `FRAME_PAGE_PREFIX` in the CLI, with a test
  that every template's `FRAME_MOUNT_PREFIX` still agrees), the workspace Host advertises the page, the app folder and the app's name through its
  capabilities route, and on a first run (no saved tabs) the client selects the app's folder and opens the page in a tile titled with the app's name.
  The chat binds a moment later and takes the focus; the app's page takes it back once, within the first six seconds, and never after. A Host without
  an app (ACRYL Web, Desktop) advertises no page and keeps its empty canvas. Measured: first run shows the app's page in the tile with no click.
- **A restart changed the frame's address (fixed, `9f23b3a4`).** The launcher listened on `ACRYLBLENDS_PORT` or 0, so every `npm run dev` minted a new
  origin; the frame's auth cookie is bound to the origin, so the page could never come back. The launcher now selects the app's own instance (the
  folder's stable port, the same one the app's own server uses) and listens there; the gates still pass 0 for any free port. Measured with the cookie
  durable: a restart with the page open reconnects by itself within a few seconds, on the same address, with the app's tile and the chat's session
  still there.
- **The app was not a git repository (fixed in this commit).** The frame's Files and Changes views answer only for a git worktree; without one,
  Files said "file request failed" and the left pane said "detached". `acrylblends init` now runs `git init` and makes the scaffold the first commit
  (`Initial commit from acrylblends`, the person's own identity when git has one), so Files opens the app's source and Changes starts from the
  person's edits instead of "421 files changed". Measured: Files failed before, listed and opened `src/routes.ts` after.

**The reconnect's one open case (browser, not the app).** Chrome persists cookies to disk lazily (about half a minute). If the host dies within that
window of the frame's first load, the browser's auth cookie can be lost with the page's network state; every retry then answers 401 and the page
stays on `Reconnecting...`, and no page-side code can re-mint it without the launch token (which DSH deliberately keeps out of the page). After the
cookie is durable, the same restart reconnects on its own. The facilitator notes carry this as a known edge; the guide's recovery is a tab reload,
and the stable port means the printed address stays valid.

**The frame's address and token, kept so a restart changes nothing (owner decision, 2026-11-02).** The launcher itself writes the printed URL - the
only thing that can re-enter a frame whose browser session ended - into the app's git-ignored home (the record is the launcher's own bookkeeping, so an
app whose installed framework predates `acrylblends open` still gets it; the CLI reads the same record): `.acrylblends/frame-url.json`,
`{version, url, token, pid, writtenAt}`, created 0600 (a restricted `icacls` ACL on Windows), written as a temp file renamed over the old one, and
left behind on a clean stop so the command can say the frame is not running instead of pretending it never ran. On every later boot the launcher
gives the stored token to DSH's connection through the field the package reads (`browserAuth.launchToken`; the shape is guarded, and a package
without it keeps its fresh token), so the address and any open page survive a restart. `acrylblends open [dir]` reads the record, checks the host
still listens, and prints the URL alone on stdout (a stopped or never-run frame goes to stderr with `npm run dev` advice; a dead token is never handed
out). `acrylblends open --new` rotates the token in the running host: the launcher mounts `POST /api/acryl-frame/token/new`, authenticated by the
current token, which replaces `launchToken`, rewrites the record and answers the new address; the old address answers 401 from that moment. Unit
tests cover the mode, the atomic write (no temp files left), owner-only removal, malformed and pre-token records, token extraction and rotation
helpers, the reuse guard, and all `open` outcomes including `--new` against a host that enforces the rotation; the generated launcher's text is
asserted to read, reuse, write and rotate. Measured live with the packed CLI: a restart printed the same URL, `open` printed it, `open --new`
rotated it (old 401, new 303) and the rotated address survived the next restart with the app's page rendering from it. The workshop release is
**1.2.0** by the owner's decision, and the guide says so.

**The session banner (coordinator's request, 2026-11-02).** The frame's client watches DSH's client connection recovery state (`ctx.connection.state`)
and, while it is not `connected`, polls one small admitted Remote (`POST /api/settings/describe`) every three seconds; the workspace's own routes sit
on a longer router prefix and are not behind the browser session, so they could not answer. Only statuses are read: any admitted answer (200, 400,
404, 500) proves the session, a network failure is the connection's own retry, and a 401 that holds for two consecutive polls means the browser
session is gone - the banner then replaces the endless "Reconnecting..." at the top of the canvas, over the tab strip, with: "This frame's session
ended. Open the address the terminal printed, or run `npx acrylblends open` in the app folder and open the address it prints." The watcher stops
polling once the connection recovers, and a composition without a connection service renders nothing. Unit tests (fake connection, fake probe, fake
timers) cover quiet-when-connected, no polling at all, the one-401 race, the two-401 verdict with the exact message, non-401 answers and network
failures staying quiet, recovery, dispose, and the probe's request shape. Measured live: with the cookie deleted and the host restarted inside the
window, the banner appeared on the second poll cycle with the exact text and the page scrolled nowhere. The post-120 gate work landed with the merge of `af583d6c`: `verify-ide-template` now asserts the first-run tile (the app's page already open, no +
and no typed address, `scrollTop` 0 with the card shown), the session banner after the browser cookie is deleted and the host restarts on the same
port (the text names `npx acrylblends open`, `scrollTop` 0), `scrollTop` 0 while Settings is open, and it runs `scripts/verify-frame-token.mjs` on
the app it scaffolded (the same address after a restart, page 303 + cookie, WebSocket open, record 0600 with the matching token) - all measured green
on the agent template: "the app opens itself in a tile on first run", "the session banner names `npx acrylblends open` ... with the page unscrolled",
"verify-frame-token: the same address after a restart admits the page and its WebSocket", OK. The guide's reconnecting step already names the
command. The publish block is the take-home, unchanged from the registry's own README.

**The document must never scroll (coordinator's finding from the banner screenshot).** The frame's page scrolled to 256px when DSH's first-run key
card appeared: the card is a body-level root appended after `#root` in normal flow (`div._root_...`, 256px tall below the 800px shell), so the document
grew to 1056px, and the card's autofocused input scrolled the whole page down - the tab strip and the sidebar's content went off-screen. The probe
that found it (computed overflow, body children, rects) is recorded above in the measurements. Fixed in the app shell's advanced styles (`acryl-app-
shell`): `html, body { overflow: hidden; }` so the frame owns the viewport and only its panes scroll, and - narrowed, after the coordinator's review,
from "every body-level root" to the cause itself - `body > div:not(#root):has(input[aria-label="API key"]) { position: fixed; inset: auto 0 0 0;
z-index: 60; }`, which matches only the first-run key card's root and leaves every other portal (menus, tooltips, the palette, popovers, toasts) to
position itself. Measured after: `scrollTop` 0 with the card shown (input focused), after blur and after a reload; `scrollHeight` 800; the card
visible as a bottom sheet over the intact frame; the card's root `fixed` at top 644; Settings > Models still opens; the banner still appears with
scroll 0. The narrowed rule's reach was verified in the live frame: the tab strip's `+` menu, the command palette and the Settings dropdown all live
inside `#root` (body root `#root`, position static) and not in a body-level root, so the rule cannot touch them; the menu's rect with and without
the rule is identical (top 40, left 1106, 254x534) and removing the rule only returns the key card to flow (body root static, top 900). The
product's tooltips are native `title` attributes drawn by the browser, not DOM elements, and the workspace's toasts render inside `.dshWorkspace`
(that is, inside `#root`); automation could not make Pi or Claude exit their TUI to raise one, but by construction neither can be reached by a
body-level rule. Screenshots of the menu, palette and dropdown with the rule and after removing it are in the rehearsal record. The page gate
assertion (scrollTop stays 0 through the first-run card, Settings and the banner) joins the post-120 gate work with the other assertions.

### The reused token's guards (2026-11-02)

Two guards accompany the seam (condition of the coordinator's acceptance): `packages/cli/test/dsh-launch-token.test.ts` reads the installed
`@deepseek-ai/dsh-client-connection` and fails loudly when a DSH bump removes or renames the field or when another path mints or compares a
per-process token - it asserts the constructor assignment, the two reads (`authenticatedUrl`, the index admission), and that `processLaunchToken` has
exactly the definition and that one call (the WebSocket admission admits through the cookie, never the token). `scripts/verify-frame-token.mjs
<app-dir>` boots an installed app twice and asserts the second boot prints the same address, that the address admits the page (303 and the cookie),
and that the cookie admits `/api/remote.mux` - the restart with a reused token admits the page and its WebSocket. It runs on the rehearsal app today;
it joins `pnpm run check` with the post-120 gate work, where an installed app already exists.

### Upstream request (draft - not posted): a supported launch-token seam

For the owner to post to DSH's Discussions if they choose to:

> **Allow a host to supply the browser launch token (BrowserAuth)**
>
> We host an application inside DSH's web GUI and restart the host many times a day during development. `BrowserAuth` mints a random launch token per
> process (`processLaunchToken`), so every restart changes the printed URL: an already open page survives only through its cookie, and when that cookie
> is lost or expired the person must reopen a URL that no longer exists. To give the URL (and an open page) a stable identity we read the token back by
> assigning the instance field `browserAuth.launchToken`, which `authorizeIndex` and `authenticatedUrl` read - it works today, but it is an
> unsupported seam that a rename or a package refactor would break.
>
> Request: let the connection row take the launch token from its config - a literal, or a provider/file the host owns (e.g. `config.launchToken` or
> `config.launchTokenFile`) - with the current random per-process token as the default. A host could then keep a stable, owner-scoped token across
> restarts, offer a supported reprint and rotation command, and stop reaching into the instance. Documented as host-owned state (owner-only
> permissions are the host's business) it would not change the browser trust model: the token stays the sole authentication input at `GET /`, and the
> cookie remains authority-bound.

### Handoff (2026-11-02, 119-workshop-guide)

State: `119-workshop-guide` at `0a38c723` (main `af583d6c` merged); the full check exited 0 on that tree. The handout and facilitator notes are
rewritten to the frame flow for 1.2.0, and the day-one product fixes and gate assertions are in: the stable port; the first-run tile; the scaffold as
a git repository; the stable launch token with `acrylblends open` / `open --new` and the launcher's self-contained record; the session banner; the
unscrollable frame document with the overlay rule narrowed to the first-run card. `verify-ide-template` asserts the first-run tile, the banner after
cookie loss with `scrollTop` 0, `scrollTop` 0 while Settings is open, and runs `scripts/verify-frame-token.mjs` on its own app.

Open items and next steps, in order: push this branch and watch CI on macOS, Ubuntu and Windows; if the macOS frame job still fails at the tile, pull
that run's net-log artifact and report the cause before any rerun (do not call it a flake); ask the coordinator to approve landing; after landing,
walk the handout end to end once as an attendee with the packed CLI in an isolated HOME; the upstream request for a supported launch-token seam in
this section is drafted, not posted (the owner's to post); nothing goes to the workshop registry without the coordinator's approval.

### Handoff 2 (2026-11-02, after the owner test kit)

The owner kit lives at `/Users/musichen/_projects/p11_acr_agentcontextrelay/acryldev/_testfield/acrylblends-test-kit-1.2.0-rc`
(`sh /Users/musichen/_projects/p11_acr_agentcontextrelay/acryldev/_testfield/acrylblends-test-kit-1.2.0-rc/try.sh`; README.txt; five screenshots in
`screenshots/`). Owner rule: nothing is ever created directly in the home folder; test material lives in `acryldev/_testfield` or the session's scratch
directory. The kit was deliberately moved there (its regenerated prefix, home, npm cache, npmrc and install log were cleared, and frame-specs.json and
README.txt rewritten to the new path); it is rebuilt and re-shot only in that folder. It packs the CLI and the 13 frame packages from the branch's working tree as tarballs, installs the CLI from the kit, creates the
agent app inside the kit, uses an isolated HOME, never the registry's acrylblends (`^1.0.0` peers require a non-prerelease version, so the kit's CLI
tarball is version 1.2.0). A run of the kit found six visual defects; three are fixed in `ffd55b5f`: (1) the frame never applied the theme font
(`--dsw-font-family` was on the root but no rule used it), so every DSH-drawn surface rendered in Times - html/body now take that one inherited
value; (2) the Preview Notice and the key card were a bottom sheet - a body-level root hosting a `[role=dialog]` is now a full-viewport centered
modal layer, like ACRYL; (5) `npm install` writes `package-lock.json` after the scaffold's first commit, so a fresh app said "1 file changed" - every
template gitignores it. Re-measured in the rebuilt kit: sans typography everywhere, both dialogs centered, a fresh app clean, five distinct shots.

Still open from that review, with the second pass's findings: (3) the right panel's "Start" view is misplaced - the compass icon and the "Start"
label float at the panel's top-left with the toolbar icons stacked under them, and the card list (Files, Changes, Review, Checks, Comments) runs under
the right panel's own Terminal dock, so the Comments card is clipped by the dock's tab strip; the view needs ACRYL's placement and a scroll region
above the dock. (4) "Open configuration file" sits close to the close X in Settings. (6) the left-panel screenshot should show a listed session (it
was taken before one existed). (7) The centered dialogs have no surface: the Preview Notice and the key card are bare text over the app page - no card
background, border, shadow or backdrop scrim - and the key card's text and buttons overlap the terminal dock; the Continue button is a flat grey box.
DSH's own dialog styles are probably missing the same way the font token was unused (the dialog element's class hashed styles exist in
ModelsSection/OnboardingModal CSS tags, but the element may carry none of them or a wrapper's CSS is absent); find that cause and port ACRYL's dialog
surface and backdrop rather than painting a new card. (8) The Settings nav truncates "Command pale..." - widen the nav or let labels wrap as ACRYL
does. Gate gap: `verify-ide-template` checks structure, not look - wire `scripts/frame-compare.mjs` (the 2% threshold against the ACRYL reference
shots) for the first-run screen, Settings > Models and the right panel so this class fails CI.

State: branch 119-workshop-guide at `ffd55b5f`; typecheck green, the full check has NOT been run since `ffd55b5f` (the last green check was
`9a63850c`; the earlier gate additions were green on the agent template). Next, in the coordinator's order: full check + push + CI on `ffd55b5f`; then fix 7 (dialog surface and backdrop at the cause), 3 (the Start view's
placement and the card list's scroll region), 4 and 8; then the frame-compare wiring; then rebuild the kit (in `acryldev/_testfield` only) and re-shoot,
every shot compared with ACRYL before reporting. The kit's app folder is removed and its port free; the kit itself (tarballs, prefix, home, cache,
screenshots) is ready.

### Handoff 3 (2026-11-02, after the stylesheet root cause)

The kit's dialog defect and the Start view's misplacement had one cause, found by reading the live page rather than the code's intent: `clientAssetTags`
in `plugins/acryl-page/src/index.ts` copied the frontend's `<script ... src>` opening tag without its closing `</script>`. The browser then parsed the
vendor modulepreload and both stylesheet links as that script's text, so DSH's whole component stylesheet (primitives: Modal, Button, Input, Menu, ...)
never loaded and every surface drawn by it fell back to browser defaults. The theme tokens still worked because the theme plugin injects its CSS inline,
which is why only primitives-drawn surfaces looked wrong. Fixed at the cause in `49417c57`: the page closes the tag it owns, the test pins the copied
tags, and the gate asserts it twice - the served page's script tags are closed, and in real Chrome the document carries a stylesheet link while the
entry script element holds no text. With the stylesheet loaded, the three symptom patches from `ffd55b5f`/`6cd7a585` were re-measured and removed:
DSH's base CSS sets body font-family, its Modal root is fixed/centered/z-index 1000, and the notice, Settings and banner scroll assertions pass without
`html, body { overflow: hidden }`. Defects 3 and 4 are gone with the same cause (the Start header sits like ACRYL's, the card list ends above the dock,
and "Open configuration file" is a proper outline button with ACRYL's spacing). Defect 6 was a shot-order issue, fixed in the kit scenario.

Defect 8 is a ticket, not a 119 fix: the Settings nav truncates "Command pale..." in ACRYL and in the frame alike (ACRYL's own settings-models
reference shows the same ellipsis), so it is an ACRYL + frame UI ticket - widen the nav or let labels wrap in both.

Frame-compare is now wired with the coordinator's conditions. `scripts/frame-views-frame.json` holds the frame's three day-one states (first-run,
Settings > Models, the right panel) at one fixed viewport, 1440x900, with masks only for what changes every run (the app's port inside the address
field, the terminal dock's text). `verify-ide-template` captures those states for the agent template after the notice check and, when `FRAME_VISUAL=1`
on Linux, compares them with `scripts/frame-reference-frame` at 2% (`FRAME_VISUAL_CAPTURE` writes the states instead, for regenerating the baseline);
macOS and Windows keep the structural assertions. `.github/workflows/frame-baseline.yml` regenerates the baseline on the Ubuntu runner (Node 24) and
uploads the PNGs for review. `frame-compare compare` now honors `--views`, and `check --against acryl` reads `scripts/frame-reference` and never
fails: that set is ACRYL Desktop with no project and ACRYL's own plugins, so content differs by design (measured on the fixed build: settings-models
3.67% at 1440x900 and 4.95% at 1024x768, right-panel-open 37%, frame 72.4%/64.6%; the diff image shows the dialog chrome itself aligned). The baseline
is captured on the Linux runner and approved by the coordinator before it is committed; until then the frame job does not set `FRAME_VISUAL`.

Kit: rebuilt in `acryldev/_testfield/acrylblends-test-kit-1.2.0-rc` from `49417c57` (CLI 1.2.0, 13 frame tarballs), a fresh app installed through
`try.sh`, and the five shots retaken at 1280x800 into `screenshots/`: the Preview Notice as a centered card with a scrim, the frame with the app open,
the right panel with the Start header and its list above the dock, Settings > Models with its real surface, and the terminal. The app folder is removed
after the run so the owner's `try.sh` starts clean.

State: branch 119-workshop-guide; `49417c57` (root cause) and `9f57d0fd` (visual gate wiring) on top of the green `7c7b5e40`; the full check has not
been run since `49417c57`. Next: the Linux baseline capture and the coordinator's review of the five kit shots; commit the baseline and set
`FRAME_VISUAL=1` on the frame job once approved; run the full check and push; CI.

### Handoff 4 (2026-11-02, owner kit review round two)

(9) Settings > Models said "Use your Claude, ChatGPT or DeepSeek subscription" but listed only DeepSeek. The sign-in rows come from the harness
authorization catalog, and the frame's driver rows composed `llm-deepseek-account` without `llm-pi-ai` - the multi-provider twin whose flows register
Claude, ChatGPT and the rest of the catalog. Fixed in `7b6b307d` by adding `llm-pi-ai` to `DRIVER_ROWS`, mounted dormant exactly as DSH's base mounts
it: zero model routes until a sign-in supplies a provider profile, which is what the Models page does. The page gate now fails if those two rows are
absent (the workshop guide tells attendees a subscription works); the agent gate is green with every row active and both rows shown. Changing the copy
was never the fix, as the coordinator said.

(10) The gear icons in the Settings nav are parity, not a defect: ACRYL's own settings-models reference shows the same generic gear for Agents, Tabs,
Command palette, Shortcuts and Agent Control. DSH's settings dialog maps icons only for `account`, `models`, `agent-presets`, `plugins` and
`archived-sessions`; every other id falls back to the gear. Our frame renders exactly that, and our own Support section gets the same fallback. No
change; noted with the item 8 ticket (Settings nav truncation, ACRYL + frame).

Lint: the `b093fe2d` Linux check jobs failed on one formatter error in `scripts/verify-ide-template.mjs`, introduced by the visual-gate commit after
the last local full check on `7c7b5e40`. The two unused imports (`tokenOfFrameUrl` in the frame-url test, `mkdtempSync` in
`scripts/build-legacy-layouts.mjs`) were warnings: `biome check .` reports them and still exits 0, so the local full check was not skipping lint - it
simply predated the formatter error. Both imports are removed in `7b6b307d`, and lint exits 0 with warnings only.

Kit: rebuilt again from `7b6b307d` (CLI tarball repacked; the 13 frame tarballs are unchanged since the stylesheet fix) with a fresh app; the
settings-models shot now shows the Claude, ChatGPT and DeepSeek sign-in rows. The visual baseline is requested again from this push, since fix 9
changes the settings-models state; the three PNGs are reviewed and approved before they are committed, and `FRAME_VISUAL` stays off until then.

A second gap in (9) showed up only in the rebuilt kit: composing `llm-pi-ai` brought Claude but not ChatGPT. DSH 0.2.0-rc.2's pi-ai catalog gives
`llm-pi-ai/openai` an API key only; the ChatGPT subscription flow lives on its legacy `llm-pi-ai/openai-codex` route ("OpenAI (ChatGPT Plus/Pro)"),
which the card kept under Other providers. Fixed in `3ba045be`: the featured ChatGPT row takes whichever of the two routes the catalog actually offers
with an OAuth flow (preferring `openai`, falling back to `openai-codex`), and a promoted route is not listed twice. The gate assertion was reading the
section text, which always contains "Claude, ChatGPT or DeepSeek" whether the rows exist or not; it now reads the card's row names. The agent gate
shows all three rows and the sign-in package's 32 tests pass, including the legacy-route case.

The Ubuntu page gate then stalled for forty minutes after its banner line, and the guards added for it (`f6d78142`'s predecessors) turned the stall
into a named failure instead of silence: `verify-frame-token: gave up after 10 minutes`, with no progress because the watchdog's `process.exit`
truncated buffered stdout. Synchronous progress lines (`71bcfada`) then named the failure in two lines: boot 1 passed every check and "stopped", but
boot 2 printed port **3705** instead of 3704 and `STABLE` was false. Signalling `npm run dev` alone leaves the app process (npm -> sh -> node) alive
holding the stable port on Linux, so the next boot scans to another port - the guarantee this check exists for breaks - and the leftover child kept
the script's event loop alive, which is why the watchdog fired after the work was already done.

Fixed in `f6d78142`: the app starts as its own POSIX process group and `stop()` signals the group (taskkill `/T` on Windows), so the port is free
when the second boot starts; the script exits explicitly after its final synchronous line. This was a harness path, not a product flow - a person's
Ctrl-C reaches the script child through npm, but a bare SIGTERM to npm does not. The agent gate passes end to end locally; the Ubuntu job is the
proof, and the visual baseline is requested again from this push.

The coordinator relayed the owner's scope decision (2026-11-02): the frame keeps only what every app type needs - the collapsible sessions panel,
agents, the collapsible right panel, Settings and the app as the central canvas; the IDE-only parts (Files/Changes/Review/Checks/Comments, the
branch/worktree tree, the git status bar and the IDE Settings sections) leave the default frame, and a redesign slice follows. The visual baseline is
therefore held: the three PNGs were captured on ubuntu-latest (frame, settings-models, right-panel-open at 1440x900) but are not committed,
`FRAME_VISUAL` stays off, and the masking/compare code (`scripts/frame-views-frame.json`, `frame-compare --against acryl`, the Linux capture path)
stays for the baseline after the redesign.

The blank template's first tile showed Chrome's JSON viewer: its root answered JSON to every client, which is nearly invisible in the frame's dark
surface. Fixed in `9f04ced9`: the root negotiates like the agent template - a browser gets a minimal first page naming the app with a relative About
link, an API client still gets the JSON hello - so the scaffolder gate's `GET /` contract does not move. The blank frame gate shows the tile with the
page ("blank-app"), and the scaffolder gate over every template is green.

## 26. A graceful node-server stop (branch 121, 2026-11-02)

The disposer closed all connections immediately (`closeAllConnections()` before `close()`), so a request in flight when the app stopped was cut. Requested
behavior: close idle connections first, let in-flight requests finish within a short bounded grace, then close all connections and close; and since an
upgraded socket (the PTY and door WebSockets) is never an HTTP connection, track those too and let their owner close each with a proper close frame inside
the same grace.

Measured first, on Node 24 (the platform the apps require): `server.close()` does not end a keep-alive socket that becomes idle after its request finished
(it stays until the server cuts it), and neither `close()` nor `closeAllConnections()` reaches an upgraded socket - in a probe with one open raw upgrade, the
`close()` callback never fired, even after `closeAllConnections()`.

The implementation: the adapter counts requests whose response has not finished (the response's `finish`/`close` events), the upgrade listener tracks every
upgraded socket until it closes, and `NodeServer.stop()` - idempotent, public, and what the disposer calls - runs the hub's close beside the request grace.
It stops new connections, sweeps idle keep-alive sockets on every pass (one that goes idle after its request finished is not caught by the single sweep
`close()` does), waits up to `STOP_GRACE_MS` (2 s) for the active requests and the tracked sockets, then ends the finished sockets gracefully (a `FIN` behind
the buffered body, not a destroy: destroying there answered the client with a reset and an empty body, which the first version of the test caught), gives
them a 300 ms flush window, and forces `closeAllConnections()` plus destroys any upgraded socket still left, so the server's own `close()` can finish. A
socket owned by another hub (the router-http adapter's) is closed by that owner's disposer, with its 1001 frame; if it is still open when the grace ends, the
stop destroys it rather than hang. Tests: an in-flight request finishes and its answer arrives while `stop()` is under way, the port is free, and a second
stop or the disposer is a no-op; disposal with an open event stream gets an explicit bound for the grace it now waits; and stopping with a WebSocket open
resolves while the socket gets its 1001 close frame.

**D: the router drains, and the mount removal that cut a second time.** The first whole-root dispose still answered the save with a 200 and
`content-length: 0`: Cordis runs every disposer together, and the router's own disposal refused new requests, aborted in-flight flights and ended their
bodies at once. The coordinator chose D - the router's disposer drains instead of aborting - and first asked whether Cordis awaits async disposers. It
does: a probe with one 100 ms and one 500 ms disposer starts both on the same tick and resolves the root dispose at 636 ms, after the slow one. D is
implemented: while closing, the router answers new requests 503 with `Connection: close`; disposal waits up to `disposeGraceMs` for the flights in hand,
then aborts what is left and settles it for 300 ms. Implementing it exposed a second cut: removing a mount also aborted its flights at once, and on a whole
root dispose every plugin unloads together, so a route-owning plugin's removal cut the save even when the router drained. Mount removal now follows the
same rule (drain first, then abort). The launcher is unchanged: it keeps disposing the root directly, and both drains run in that window.

**The gate gap that let a type error hide.** The root typecheck ran three aggregate tsconfigs, not each package's own script, so a package's own test configs
(the router's `tsconfig.jsx-tests.json` among them) were never exercised by the gate: the compress test's `Blob` parts failed TypeScript 6 there while every
gate stayed green. The check now also runs `pnpm -r --if-present run typecheck` - every package's own script, test configs included - right after the
aggregate, and the whole tree passes it (27 packages). That is the same class as the earlier test-timeout gaps: the gate has to run the thing that fails.

Tests on a whole-root dispose, on the frame's own composition (the router, our node server, the webServer port over it, and the router-http adapter): an
in-flight save finishes with its full body and a mounted WebSocket gets 1001, both inside the grace plus 300 ms; the router's unit tests cover the drain,
the 503 with `Connection: close`, and that a flight finishing inside the grace is never aborted, while the node-server tests keep the `stop()` path, the
no-op second stop, the bounded event stream, and the 1001 close frame. The DSH web server stack is not in this test: its own disposal destroys upgraded
sockets (the client saw 1006) and the frame does not use it.

The Windows frame timings from the three green runs on `af583d6c` (measure only, for the record): blank 4m53 / 5m40 / 8m58, agent 5m12 / 6m15 / 6m51, todo
4m44 / 5m07 / 6m49, notes 4m16 / 5m05 / 7m09, chat 4m34 / 5m33 / 7m07, nodejs 4m16 / 5m41 / 6m29. Every step grows roughly together rather than one path
growing, which reads as runner and install/network slowness (each step scaffolds and installs from scratch), not a gate code regression; not fixed here.

## 27. The desktop window opens the frame (design, branch 122, 2026-11-02)

`npm run desktop` opened only the app's page: it ran the bare `src/app.ts` `createApp`, or attached to a running dev server and loaded its root. The
web surface already has the whole ACRYL frame (`npm run dev` boots `scripts/ide-host.mjs`). The desktop window now shows that same frame. It does not
build a second one: the host is the one `npm run dev` runs, and the window is one more surface on it.

1. **Capability and plugin boundary.** The window is a surface, not a Cordis plugin: it is not a row of the composition, and it owns nothing a row
   provides. `plugins/desktop` stays the only place that imports Electron (`check-deps` enforces it). The frame host stays the one owner of the
   frame: the composition, the driver rows, the PTY, the chat and the app under `/app`. ACRYL Desktop draws the same line: its shell generation
   loads the workspace URL into a locked-down window and owns only the window, the menu and the navigation policy
   (`apps/acryl-desktop/src/shell/electron-shell-generation.ts`).
2. **Provides and consumes.** It consumes the host's printed address (`acrylblends host: <url>`, the token included) from a host it started, and
   the host's address record (`.acrylblends/frame-url.json`, owner-only, written by the host since 119) to attach to one that already runs. It
   provides the door's window and menu port (`door-shell.ts`), unchanged. An app without `scripts/ide-host.mjs` (made before the frame) keeps the
   old path: `createApp`, or attach through `.acryl/door.json`.
3. **Effects and disposal.** It owns one effect: the host child it started. The child is `npm run dev`, run by the same npm and Node that ran
   `npm run desktop` (`npm_execpath`, `npm_node_execpath`), never by Electron's Node: node-pty and DSH's rows are built for Node's ABI, not
   Electron's. On shutdown, the order is: the door shell stops, then the child tree gets SIGTERM (its process group on macOS and Linux,
   `taskkill /T` on Windows), and the window ends once the child is gone (bounded wait, then a forced kill). A host the window attached to is
   never stopped; closing the window leaves it running, as before. Ctrl-C reaches the same quit: the launcher starts Electron as the leader of its own
   process group (macOS, Linux) and passes on exactly one SIGINT, SIGTERM or SIGHUP, because Electron is killed outright by a second one before its quit
   code runs, and a terminal's Ctrl-C reaches both the launcher's group and, through npm, the launcher a second time. A host that exits before it prints its address ends the desktop run with its
   output and exit code.
4. **Configuration and composition.** No new Loader row and no change to the host's composition or row ids. The frame mode is chosen by one fact:
   `scripts/ide-host.mjs` exists in the app. The window keeps ACRYL Desktop's secure options and its navigation rules: only a main-frame
   navigation is checked, so the app tile's iframe navigates freely. The frame's own origin stays in the window; any other `http(s)` or `mailto`
   address opens in the system browser, and nothing else is opened. `window.open` is always denied in the window, and its `http(s)` and `mailto`
   targets go to the system browser. The menu keeps `Settings...` (`CmdOrCtrl+,`; the app menu on macOS, the File menu elsewhere). In a frame
   window it dispatches the window event `acryl:open-settings`, which the frame's workspace answers by opening its own Settings dialog, the same
   one as the left panel's Settings button. There is no second Settings window, and `acrylblends.desktopPath` does not apply to a frame app.
5. **Events and durability.** The one durable fact is the host's address record, which the host owns; the window only reads it. A record counts
   only while its host listens. A stale record (the host stopped) is ignored, and the window starts a host of its own. The single-instance lock
   is unchanged: a second `npm run desktop` focuses the first window.
6. **Verification.** Unit tests for the pure parts: the frame-mode choice, the ready line, the record check and the navigation decision. Real
   Electron in `verify:desktop`: a framed app, `npm run desktop`, then through the window's DevTools port, the left panel (Projects), the right
   panel (Files/Changes/Review), Settings with its sections, the menu's `Settings...` opening that same dialog, and the app's page in the browser
   tile. It also checks that closing the window stops
   the host it started (the port is free), that Ctrl-C (SIGINT to `npm run desktop`'s process group) does too, and that a window attached to a running `npm run dev` leaves that host running. The desktop CI job
   runs on macOS, Windows and Linux (xvfb).

## 28. The Windows notice-check Chrome launch (branch 123, 2026-11-02)

Run 41440407757 on `d0e0561c` failed frame (windows-latest) at the blank gate: "headless Chrome did not open for the notice check (exit null)" after about two
minutes, with nothing after the colon. The cause was in the gate, in two parts. The notice check spawned Chrome with `stdio: 'ignore'` and attached its output
listeners to the resulting null streams, so the captured output was always empty - the diagnostics that claimed to show Chrome's last lines never could. And
the launch waited on a guessed port (9300 + random(300)) with a 600-iteration loop and no named bound, so a browser that never opened DevTools on that port
spun with a live child and no evidence.

Both launches (the notice check and the tile check) now go through `scripts/lib/door-probe.mjs`'s `startChrome`: a unique profile per launch,
`--remote-debugging-port=0` with the port read from the profile's `DevToolsActivePort` file (never a guess), `--enable-logging=stderr` with stderr captured,
and a bounded 60 s wait whose failure names the exit code, the DevToolsActivePort state and the last 8 KB of the browser's output, appends that to
`<tmp>/acryl-chrome-launch.log` (the frame job's failure artifact step uploads it with the net logs, only when a gate fails), and kills the whole process
tree (`taskkill /T /F` on Windows, the process group elsewhere) before failing. A parser test covers the DevToolsActivePort read; the blank gate passes locally
through the new launcher and the full check is exit 0.

Handoff: the full check is green on branch 123; the next step is the branch CI and, on the Windows frame job, either a green run or the captured browser output
naming whether it is Defender, a first-run dialog or a profile lock - the message and the artifact now exist for that answer. Three consecutive green CI runs
on one sha are the bar before reporting 123 green.

### The agent panel's silent Send (branch 123, same day)

Run 3's macOS agent gate failed with the panel present, drivers listed, empty log, Send enabled and Stop disabled; the gate-wide page capture added earlier showed only
warnings (a PTY WebSocket closed before it opened, and the sandbox notices), no exception - so nothing threw, and the submit handler's two silent early returns
(nothing typed, or a run already being followed) were the fit. The panel now says why it does not send ("Type a message first." / "A run is already going; stop it
first."), marks itself `data-ready` once its form is wired and `data-following` while a run is going, and the gate waits for the ready mark, types with the native
setter plus an input event, and prints the textarea value, ready and following at submit time in both the failure message and its panel detail. A guard test covers
the two refusal reasons. The capture result is part of the record: no exception was thrown, which ruled the half-wired-by-a-throw theory out before the change.

### Handoff (branch 123, 2026-11-02, at d18a3b40)

Where it stands: the Chrome-launch rewrite and the agent panel's guards/readiness/diagnostics are in and green locally (full check exit 0 on d18a3b40; CI run 41466529499 on
it passed every job except the macOS agent gate). That run reached a new failure: the panel step now passes, and the gate fails at the FINAL Settings open after the chat
step ("Settings did not open", 20 s of the look-first press loop, no page exception) - the same class as `94548f5d`'s notes red. Evidence: the page dump shows the hidden
upstream sidebar's Settings trigger and the frame's foot Settings both present, a chat session "Hello from the gate" in the tree, and no dialog; the first Settings open
(Models, before the chat step) passes.

Open hypothesis to test next: the DSH chat run from the gate's chat step may still be streaming when the final Settings open starts (either Settings does not open while a
run is active, or the dialog is closed by the chat surface). The product answer is fixed, not open: Settings MUST open while a run streams - a user changes models or keys
mid-run - so the gate must not paper over it by waiting for idle. Test it deterministically on this Mac instead of waiting for CI: make the mock model stream slowly (about
10 s), start a chat run, press the frame's Settings while it streams, and poll for dialogs plus both Settings triggers' disabled and aria-expanded state. If Settings does not
open during a run, that is a product defect in the frame (or a DSH behaviour to report), to fix at the cause; if it does open, the cause of the gate failure is elsewhere and
the dialog polling names it.

What is in the branch: `d0e0561c` (121: node-server graceful stop, router drain, whole-root tests, every package's typecheck in the gate); `3318719a` (startChrome: own port
from DevToolsActivePort, `--enable-logging=stderr` captured, bounded named failure, launch log artifact, whole-tree kill; parser test); `d18a3b40` (panel guards,
data-ready/data-following, the gate's human-style typing and submit diagnostics, client-guards test). Three consecutive green CI runs on one sha remain the bar; the count
restarts on the next push.

**Settings during a streaming run, reproduced and the livelock fixed (`73d52acf`).** The product question was settled first, with the mock's new
`ACRYL_GATE_STREAM_MS` switch holding the answer open: with a 10 s and then a 60 s stream, the final Settings open succeeded while the chat showed
`Stop generating` at the moment the dialog was found, so Settings does open during a run and the product answer holds. The CI failure was therefore the
gate's own open loop: it re-pressed every Settings-labelled button every 500 ms whenever no visible dialog was up, and on a slow runner a press that
landed before the dialog rendered toggled the just-opened panel closed again - a livelock that leaves exactly the recorded state (both triggers present,
no dialog, no exception, about forty presses in twenty seconds). The loop now presses once and waits up to 3 s for the render before another press is
allowed (six bounded attempts, about the old 20 s budget). A failure records the press count, each trigger's visible/disabled/aria-disabled/
aria-expanded/aria-haspopup state, the dialog list and the stop/send controls; a success logs the stop controls present when the dialog opened, so the
"opens during a run" fact is in the record of every green run.

**The blank gate's dialog that closed during its sections wait (run 41491427783 on `c85973d8`).** The Linux Node 22 check failed at the blank gate after
the open loop found a visible Settings dialog: the old 15 s sections wait found it gone, and the dump had no dialog content. The wait was reading
`document.body` and had no way to reopen, and the press pressed every Settings-labelled button in the left pane - the visible foot and the hidden upstream
trigger, both moving the same panel, so a second press in the same tick can toggle the just-opened dialog straight back shut. The step now reads the
dialog's own text, re-presses only when the dialog has vanished, and presses one trigger per attempt: the product's foot button first (its `openSettings`
path activates the DSH trigger itself), the hidden trigger as the fallback. Blank and agent gates pass on the final code; the three-run count restarts on
this push.

## 29. The agent panel in a page that is replaced (branch 124, 2026-11-03)

The frame gate's macOS agent job failed on main (run 41536717281) at the panel step: the submit state had an empty composer, no "me" line and no refusal, and
the surviving panel was a fresh one (ready `1`, Send enabled, Stop disabled). Two candidates were checked, as the coordinator framed them.

**The submit does not navigate the page.** The submit handler's first statement is `preventDefault()` (it has been since the visible-guards change), and
the form names no action. A jsdom test now pins both: the submit event is `defaultPrevented` and the form has no `action`, so a missed guard could only
submit to this page, never leave it.

**The page is replaced under the panel.** A run that changes files reloads the page (the panel's own post-run reload), and a mount replaces the panel; a
page that comes back must show the run it lost and keep the composer's draft. Two changes in `plugins/agent-panel/client/main.ts`: `start()` closes the
previous instance's run socket and removes the previous `#agent-panel` host, so one live panel exists and the readiness mark belongs to the instance being
wired now; and the composer's draft lives in `sessionStorage`, is restored before the form is wired and cleared when a submit sends it.

The two causes behind those guards were checked, as the coordinator asked. **A second `start()` on one page was not found**: the panel script is one tag per
HTML response (the middleware inserts it only when the response does not already carry `${PREFIX}/panel.js`), a module executes once per document, and
neither the router wrap, the door, nor the agent template names the script again - so the host removal stays as a defence, not a fix for a named caller.
**The follow does not race the record**: the server creates the run and its `current` before the ask response answers (`startRun`, then `follow` in
`plugins/agent-panel/index.ts`), so a page that reloads after that response always finds it in one question; the client's timed retry was removed rather
than kept. What a follow genuinely cannot recover is a run the app server restarted away - a file change the run made kills the in-memory run with the
process - and the answer then lives only in the page that was replaced; that is recorded as a known property, not papered over.

The gate's panel step now records what it submitted with: `typedAt`, the typed textarea's and form's `isConnected`, whether that textarea is still the
panel's current one, whether the host is the current `#agent-panel`, and the panel's log at submit and at failure. A recurrence then names a replaced page
or an unwired form instead of leaving an empty dump.

Tests: `plugins/agent-panel/test/panel-client.test.ts` (node:test with jsdom, pinned as a root devDependency at the lockfile's version). A submit is
prevented and says "Type a message first."; a remount leaves one host and keeps the draft; a page replaced mid-run shows the question and the answer again
from the one follow the server can answer.

State: branch `124-panel-reload` from `542cfaf2`; the full check and the three-run count follow.

**The panel's own reload, and the check-then-reload race.** The panel reloads the app's page after a run that installed or removed a plugin, because the new
feature is served by the running app. It decided that at the end of the run and reloaded 900 ms later, so a person (or the frame gate) who started typing in
that window had the page replaced under their text - exactly the empty-composer dump. The panel lives inside the app's own page (it cannot refresh the
frame's canvas from inside), so the page reload is the app's refresh; but the decision is now made at the moment of reloading, in
`reloadDecision({ value, focused, following })`: the composer must be empty, unfocused and no run still going. Every panel-initiated reload is recorded
before it happens - a warning the page's error report and the gate both see, and a marker in `sessionStorage` (`agent-panel-reload`, reason and time) that
the reloaded page keeps; the gate's panel snapshot and failure dump now read that marker.

Tests: `reloadDecision` is pinned for typing, focus and a running run; a change event while the composer holds text leaves the page and the text alone (no
marker); a change event with an idle, empty composer records the marker before reloading.

**Open ticket, not 124 work: the standalone app's `node --watch`.** The frame's generated dev script has no watcher
(`packages/cli/src/ide-profile.ts`: `dev: node --import ... scripts/ide-host.mjs`), so a run's file edits do not restart the frame's app server. The
template's own `npm run dev` for a standalone app runs `node --watch`, where a run that edits a watched file would restart the server and kill the
in-memory run; the panel would come back with no run to follow. That is a ticket for the standalone path (a durable run log, or the run in a process the
watcher does not restart), not this branch.

**A port no browser opens (the merged-head check's second defect).** The full check on the merged head (`5c3afee3`) stopped in `verify-frame-token`:
boot 1 printed `http://127.0.0.1:3659/` and the gate's `fetch` threw `TypeError: fetch failed` with cause `bad port`, and that same nested gate failed
`verify-upgrade-frame`. The cause was not the gate. `stablePort` hashes every app's address into 3100..3999 (`plugins/instance`), and 3659 is one of the
Fetch standard's bad ports, which Chromium refuses for a page too (ERR_UNSAFE_PORT): that app's address could never have been opened by a person. The
listener now skips them: `acryl-node-server` carries the standard's 82 ports (probed against Node 24 port by port on 2026-11-03), and `portCandidates`
leaves them out of the scan like a taken port, configured or scanned. The address record, the profile row and the printed URL already carry the bound
port, so the stable address simply becomes the next usable one (3660 for 3659) and a restart keeps it; a configured restricted port with no scan left to
move to fails with `no usable port from X to Y: each is taken, or one a browser refuses` instead of binding an address no browser opens. Tests: the list
and the candidates (the skip does not widen the range; port 0 stays the system's choice), a real socket asked for 3659 binding 3660 and answering a
fetch, and the instance seed path (a project folder whose hash is 3659 boots on an address fetch reaches). `verify-upgrade-frame` passes again with the
fix (`96afd061`).

**The count's attempt 2 (two flakes, both unrelated to the port).** Attempt 1 on `91fe629a` was green; attempt 2 failed `packages (windows-latest, Node 24)` and
`frame (macos-latest, agent)`. The Windows job was a fixture, not a product: the `ide/acryl-workspace` files spec's `beforeAll` starts git three times and vitest's
10 s hook default expired on a runner carrying about a hundred test workers. A longer bound would be a bigger budget, not a cause, so the fixture does less: the
file only asks `git rev-parse --show-toplevel` and `git check-ignore --`, and both answer in an initialized repository with no commit, so `git add` and `git
commit` are gone and the hook starts one process (`85c6303d`, 20/20 tests pass). The macOS agent job was the panel again, with a new shape: the panel there was
fresh (ready, empty log, no `agent-panel-reload` marker), the typed host and textarea were no longer current while the typed form was still connected to its old
document, and the ask never reached the server. That is the app's page replaced with the ask in flight by something other than the panel (its own reload writes
the marker first). The gate now records every iframe load in the frame's page (time, src, whether the document was readable), keeps the submit's iframe element,
document and `performance.timeOrigin`, and lists the CDP's `Page.frameNavigated` events in the failure dump (`dc829324`), so the next red names the load that
replaced the page. Seven local runs with the instrumentation (four plain, three under eight CPU hogs) passed on this Mac, so the actor is still unnamed; the rule
it must be fixed against is that the frame never reloads the app page on its own while a run is going, and the count restarts on the head that carries the dump.
The 125 redesign removes this class by moving the agent out of the app's iframe into the frame's right panel, where an app reload cannot touch a run.

**State (2026-11-03, survives a compact).** Branch `124-panel-reload` from `542cfaf2`; commits `44d51a99` (draft, single host, diagnostics),
`efa29230` (restore once, no retry, causes checked), `749b35b3` (reload decided when it happens, marker + tests), `f70c9c96` (jsdom types). Proven:
the submit cannot navigate (preventDefault first, no form action, tested); the server records a run before answering the ask (no follow race); no
second `start()` caller exists (one tag per HTML response, one module execution per document - host removal is defence); the frame's generated dev
script has no watcher, so the frame's app server does not restart under a run; the panel's check-then-reload race is fixed and its tests pass (typing
during the change window leaves the page and text alone; an idle empty composer records the marker before reloading). Also `e1f6617a`: a sent message blurs the composer, so a plugin-install run still reloads the page (verify:panel passes again).
State at this edit: main `81bb14dc` (119 landed) merged into the branch as `7e2d208b` with no conflicts; the full check on the merged head (`5c3afee3`)
found the restricted port above, fixed in `96afd061`; the full check is green on the head that carries this note; the first count on `91fe629a` was
stopped by attempt 2's two flakes, both addressed above, and the macOS one's cause and fix are section 30 (merged from `124-rootcause`: `dabceeb5`,
`9fbbf209`); the count runs on the head that carries them. The gate's panel step records the typed nodes' liveness, the reload marker, every iframe
load under the submit and every tile frame re-pointed in place or made for an outside site, so a recurrence names a replaced page, a frame-initiated
load, a re-pointed tile or an unwired form.

## 30. The tile that replaced the app page: the agent-panel failure's cause (branch 124, 2026-11-03)

Section 29's macOS agent-job failure (run 41559207908: the panel took the submit, wrote "add 2 3", cleared the composer, and a moment later a fresh panel
stood in a fresh document with the ask lost) had one actor: the frame's browser tile. Neither the panel, the door, the router nor Chrome reloaded the page.

**What happened.** The canvas shows only the active tab, and `renderTile` returned an unkeyed `<BrowserPane>`, so React kept one pane - one iframe, one
attempt counter, one retry timer - for whichever browser tab was in front. The gate's path is the workshop's: the app's own tab ("agent-app", `/app`)
is in front, then "New Browser Tab", then the app's address and Go. A local probe (a MutationObserver installed on every new document) recorded the
same iframe element being pointed in place from `/app` to the new tab's default `https://example.com`, then about 100 ms later to `/app/settings`, on
every run. When the outside page commits before Go replaces it (a runner with a fast network: a CDN answers in tens of milliseconds), its load event
fires while the element's `src` already reads `/app/settings`. `shouldRetryBrowserLoad` read `src` from the element, saw an unreadable document (a
cross-origin page hides it, like Chrome's error page does) for one of the frame's own addresses, and scheduled a "retry": 250 ms later it remounted the
iframe, replacing the app page the gate had just typed into. Whether the remount landed before or after the submit decided green or red.

**The rule it broke**, and the fix at the source (`ide/acryl-workspace`): the frame never reloads the app page on its own.
- Every canvas pane is keyed by its tab (`WorkspaceCanvas.renderTile`): a pane's own state belongs to its tab, and selecting another tab of the same
  kind mounts that tab's pane.
- A browser tab's frame is made for one address and one attempt (`key` is both): a frame is never re-pointed, so a late load from an earlier address
  cannot land on the current one.
- The retry answers only for a frame's first load (`shouldRetryBrowserLoad({ firstLoad })`). A later load is the page's own move (a link it followed,
  its own reload, a door navigation) and is never undone, unreadable or not. A pending retry is cancelled when the address changes.
- A new browser tab opens at the app's own page when the Host serves one, else empty with the address bar waiting (`WorkspaceStateOptions.browserHome`);
  it never loads an outside site nobody asked for.

**Tests.** `tests/browser/browser-pane.spec.tsx` (jsdom): a late load from the address the frame showed before does not replace the page it shows now
(the CI failure, deterministic with fake timers); a page that navigates itself somewhere unreadable is left there; the first load's error page is still
loaded again; a reload pending for one address never lands on the next. Four of them fail on the old pane. `tests/canvas/state.spec.ts`: a new browser
tab opens at the app page or empty. The frame gate records every tile frame re-pointed in place and every tile frame made for an outside site, and fails
on either when the app page is shown and again after the panel's run; the old code re-pointed on every run, so the gate fails it every time, not one
run in N.

**A second way the app page is taken away, not fixed here (a scope question for 125).** The same probe showed the app's tab losing the front to the
chat tab with no click: `synchronizeWorkspaceWithSessionNavigation` treats every session-list update while the shown chat is blank as "New Session"
and selects the chat tab, and a fresh app's chat is always blank. The canvas unmounts the tab that leaves the front, so the app page (and any panel
run in it) is gone; coming back loads it again. The 125 redesign moves the agent out of the app's iframe, which removes the run loss; whether the
canvas should also keep browser tabs mounted, and the New Session signal become an event instead of list state, is recorded for 125.

**Open item: a graceful stop on Windows (a branch after 124 and 122).** On Windows a signal is `TerminateProcess`: nothing runs the host's disposal
(the persistence flush, PTY reaping, the graceful stop 121 built) when the gate stops it, and probably not when the desktop app closes either. 122's
gate fix ends the host's whole tree instead of relying on the host to end its own children; the product fix is a stop request the host can act on
before any tree kill - Ctrl-C/CTRL_BREAK, or a loopback shutdown route that the owner token guards - so a Windows stop settles like a POSIX one.
Not fixed on 122; it gets its own branch after 124 and 122 land.
