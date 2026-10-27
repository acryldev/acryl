# Plan 048 - The ACRYL IDE on the ACRYL Framework

## The slice method

Each slice takes one remaining user of the DSH `webServer`, largest first, and:

1. ports its routes onto one `App` per capability, mounted with `ctx.router.route` after the effect that builds the capability's services
   (so an unload ends the mount's requests before the services go) and served with `ctx.routerHttp.mount(prefix)`;
2. deletes what becomes dead (the old `(req, res)` handlers and their helpers);
3. keeps every answer, or records the ones that change here (and, for a change that applies to every app on the router, in the
   framework's own migration guide, which has lived in the acrylblends repository since M6);
4. writes the Cordis mini-design below before the code (the six points of the repository's Cordis protocol);
5. measures the two numbers before and after (below);
6. lands as one commit with its tests, the full gate (`corepack pnpm run check`) and CI green, and an isolated real boot through
   `scripts/live-run.mjs` (Web, and Desktop for anything the IDE uses there) before the coordinator merges it;
7. updates this folder on `main` with the commit and its evidence.

A slice that would change something a user sees, or remove a feature, stops and goes to the owner.

## The measures

| Measure | How it is counted | Start (2026-10-24, before slice 1) | Now |
| --- | --- | --- | --- |
| `webServer` registration call sites | `register`/`registerUpgrade` calls on `acrylWeb`, `webServer` or a port named `web`, in production source of `apps`, `plugins`, `runtime` (tests and build output excluded) | 30 | 9 (after T003) |
| DSH direct-import lines | the ceiling in `scripts/verify-layout.mjs` | 133 (104 outside the seam) | 135 (104 outside the seam): raised once by the 2026-10-25 profile resolution port, T012 is its way back |

The count is this command, from the repository root (M7, spec 049, started at 14):

```sh
git grep -nE "(acrylWeb|webServer|[^a-zA-Z]web)[?]?[.](register|registerUpgrade)[(]" -- apps plugins runtime \
  | grep -vE "/tests?/|/lib/|lib-publish/|\.md:|/docs/|/scripts/|\.spec\.|\.test\."
```

The call-site count today, by package: `runtime/acryl-harness-runtime` 2, `acryl-plugin-admin` 2, `acryl-plugin-context` 2 (the
`host-route-basic` example, T010, and the startup-hold route, T013), `acryl-workspace` 1 (the terminal WebSocket), `acryl-support` 1,
`acryl-sign-in` 1 (a loop over its five routes). The two in `acryl-harness-runtime` are the `acrylWeb` carrier (`engine-web.ts`, a
delegate to DSH's `webServer` that every consumer above registers through); it goes when its last consumer has moved. The router's
Web adapter, counted here until M6, now lives in the acrylblends repository.

The DSH import ceiling only falls when a slice removes a DSH import. Slice 1 could not: the workspace's old routes used ACRYL's own
`acryl-loopback-http`, not DSH. The imports live mostly in the engine composition roots and DSH-facing plugins, which later slices and the
driver spec reach.

## Slice order, and why

1. **`acryl-workspace`** (T001; 12 call sites, 24 routes): the IDE's core (projects, files, git, terminals, agents) and the largest user. Done.
2. **`acryl-agent-control`** (T002; 6): the door external drivers use (`acryl control`, the MCP config a worker starts with), and the next
   largest. It goes before Desktop's own routes because the drivers of spec 046 Phase 9 build on it. Security-sensitive: its trust model
   stays exactly as it is. Done.
3. **The terminal's PATH lookup** (T005; no call sites): found in slice 1. The workspace runs the login shell synchronously on every
   activation (about 1.2 s with zsh), blocking the Host. A small slice of its own so it does not hide inside a transport change.
4. **`apps/acryl-desktop`** (T003; 5): Desktop's own renderer routes: the settings routes, preferences, the renderer boot report, and the
   directory picker and validator. Desktop-only, so it follows the shared capabilities.
5. **`acryl-sign-in`** (T004; 1 call site, 5 routes): the provider list and the sign-in attempt, begin, answer and cancel routes. Credentials
   pass through it, so it gets a slice of its own and keeps its checks exactly.
6. **`acryl-plugin-admin` and `acryl-support`** (T006; 3): the plugin lifecycle and architecture pages, and the diagnostics archive. Small and
   alike (same-origin reads and one change), so one slice.
7. **WebSocket upgrades on the router** (T007, after spec 047 T009): the router carries upgrade routes, then the workspace terminal stream and the
   door's page channel move off `registerUpgrade`. Last of the moves, because it changes the adapter, not one capability.
8. **The carrier** (T008): with no consumer left, `acrylWeb`'s registration methods and the delegate in `engine-web.ts` are removed; the Host's
   server is reached only through `acryl-router-http`. What DSH itself registers on its own `webServer` (its pages and RPC) stays: that is
   DSH's, not the IDE's.
9. **Ratchet** (T009): the call-site count becomes a gate in `scripts/verify-layout.mjs`, like the DSH import ceiling, so it can only fall.

### Slice 1: `acryl-workspace` (T001, done: `16fe8aff`)

Cordis mini-design:

1. Capability and boundary: unchanged. `acryl-workspace` owns files, git, terminals, projects, agents and the brief; only its transport
   moves. A small owned helper (`src/private-route.ts`) holds what every route shares, not a generic utils folder.
2. Provides and consumes: injects `router` and `routerHttp` (hard: every route is served through them) beside `acrylWeb` (its port is the
   agent-hook address, and the terminal WebSocket stays a webServer upgrade until T009), `appInstance` and `acrylSettings`. Provides
   nothing new; `sharedContext`, the tools and the chat context are unchanged.
3. Effects and disposal: the services effect builds the app; `route('/')` and `mount('/api/acryl-workspace')` come after it, so on unload
   the mount goes first (its requests and event streams end and are waited for, bounded by the router's grace) and then the PTYs, git and
   the registry are released. The project event stream's keep-alive is one plugin-owned timer (`createKeepAlive`, stopped in the effect),
   not one per request.
4. Configuration and composition: row id `acryl-workspace` unchanged. A Blueprint with the `workspace` capability must carry the
   `framework-kit` row, which brings the router rows; `parseBlueprint` refuses it otherwise, so the workspace cannot sit PENDING silently.
   Every built-in Blueprint with the workspace has the kit (tested).
5. Events and durability: none changed.
6. Verification: `tests/plugin.spec.ts` activates the plugin on real Cordis with the real router and router-http over a loopback
   `webServer`: one prefix mount and no exact routes, PENDING without a router and active when one appears, the mount and upgrade gone on
   unload, three reloads without duplicates. Every route test runs through the real adapter (`tests/serve-api.ts`); the event stream is
   mounted on the real router and ends when the mount is removed.

Measured (this branch, before and after the slice):

| | before | after |
| --- | --- | --- |
| webServer registration call sites, all packages | 30 | 19 |
| of them in `acryl-workspace` | 12 (24 exact routes and 1 upgrade) | 1 (the terminal upgrade) |
| DSH import lines (layout gate) | 133 (104 outside the seam) | 133 (104 outside the seam): the old routes used ACRYL's own `acryl-loopback-http`, not DSH, so this slice could not lower it |

Answers that changed, recorded in `docs/framework/cordis/migration-from-dsh-webserver.md`: an oversized body is 413 on every route, a wrong method
405 with `Allow` on every route, a missing or wrong agent-hook token 401 (was 403), and the hook's `Host` must be the app's loopback address.

Found on the way: the PTY registry runs the user's login shell synchronously when it is built (`$SHELL -lic 'echo $PATH'`), about 1.2 s with
an interactive zsh, and it blocks the Host's event loop on every activation of the plugin (Desktop boot and every reload, T005).

Also found: the router labeled a mount with every route it serves in one string, so the workspace's mount (24 routes and their
middleware) made a label longer than the 512 characters the Host's Cordis architecture inspector accepts, and that page answered 500. A
mount is now labeled `acryl-router: route <path>` with one child effect per route (`acryl-router: serves <METHOD> <path>`), so no label
grows with an app; `acryl-inspect` reads the children and does not count them as registrations of their own.

### Slice 2: `acryl-agent-control`, the door (T002, done)

The door external drivers (claude, codex, pi through `acryl control`, the MCP config a worker starts with) use to operate the app.
Rule for this slice: its trust model does not change. Loopback peer plus the per-run secret file for the operator routes, the page's
same-origin check for the page routes, every-call approval in the tool policy; only the transport moves.

Cordis mini-design:

1. Capability and boundary: unchanged. The plugin owns the page channel, the Scope A tools, the approval policy, the audit log, the
   online channel, the tools gateway (JSON and MCP) and the workers endpoint. A small owned `host/http.ts` holds what its routes share.
2. Provides and consumes: adds hard `router` and `routerHttp` injects beside `acrylWeb` (its port is the origin and the MCP URL; the page
   channel stays a webServer upgrade until T009), `acrylTools` and `appInstance`. Provides nothing new.
3. Effects and disposal: the effect builds the channel, the audit log, the secret file and the App; `route('/')` and
   `mount('/api/acryl-agent-control')` come after it, so on unload the mount goes first (in-flight calls abort through the request
   signal, which the gateway and workers already honor), then the secret file and the worker MCP config are removed and the channel
   closes. Which routes exist still depends on config, decided once per activation (workers on, online on, gateway on).
4. Configuration and composition: row id unchanged. The `agent-control-ui` capability now needs the framework kit's router rows; the
   capability declares it (`needsRouter`) and Blueprint parsing refuses a Blueprint that composes such a capability without the
   `framework-kit` row (replacing the workspace-only check from slice 1). Desktop: the router rows must be present whenever the plugin is.
5. Events and durability: none changed.
6. Verification: route tests over a real loopback socket through the real adapter; a plugin test on real Cordis with the real router
   and router-http (one prefix mount, only the channel upgrade left on webServer, PENDING without a router, reload without duplicates);
   the existing lifecycle tests; an isolated app run with `acryl control snapshot` and one `acryl control tool call` end to end.

Exact answers kept (the CLI reads 403 as "refused, secret rotated?"):
- operator routes (online call, tools, MCP, workers with a token): a peer that is not loopback, or a missing/wrong token, is 403
  `{ error: 'forbidden' }` - not the bearer middleware's 401. No Host check is added (the old check had none).
- page routes (audit GET, workers POST from the page): the same own-page rule as before (exact Origin, or same-origin fetch metadata plus
  a same-origin Referer for a GET; loopback peer and Host).
- method checks answer 405 before auth, as before; `Allow` now lists what the router serves (GET routes also answer HEAD).
- bodies: malformed JSON 400 with the same bodies; oversized now 413 (was 400), as in slice 1.
- MCP notification-only batch: 202 with no body.

Measured (before and after the slice): webServer registration call sites 19 -> 14 (`acryl-agent-control` 6 -> 1, the page channel's
upgrade); DSH import lines 133 -> 133. Live proof and evidence: `tasks.md` T002. Found on the way: the workers route dropped the own-page
refusal and answered 500 instead of 403 (fixed); `acryl control` cannot discover apps not started by `pnpm blank` (T011).

### Before slice 4: one copy of the private-route rules (`9c43a4ef`)

`acryl-workspace` and `acryl-agent-control` each kept the same own-page guard, private headers, 405 with `Allow`, JSON body limit and
reader, and Desktop's routes would have made a third copy. They now live once in `acryl-loopback-http/router` (`ownPage`,
`privateApi(prefixes, ...routes)`, `jsonBody(maxBytes)`, `readJson`, `INVALID_JSON`, `ReportError`), with acrylblends as a peer so the
router's classes stay the app's one copy. Call sites unchanged at 14.

### Slice 4: `apps/acryl-desktop`, Desktop's own routes (T003)

The routes the Desktop renderer calls on its own Host: the settings API (`/api/desktop/settings` and its `/_dsh/desktop` twin, with the
restart after a change), the preferences, the renderer boot report, and the native directory picker and validator (win32 and darwin).

Cordis mini-design:

1. Capability and boundary: the routes move out of the shell plugin (`desktop-shell`, which owns the window, the runtime and the
   restart) into a plugin of their own, `acryl-desktop/api` (`src/api/plugin.ts`). The shell would otherwise need a hard `router`
   inject, and every router reload or replacement would unload the shell and with it the window's runtime. As its own plugin, a router
   reload re-registers only the routes. The route modules stay where their domain is (`settings/`, `startup/`, `workspaces/`) and each
   exports an `App`; `src/api/http.ts` holds only what is Desktop's (its two prefixes, the JSON media-type check, and `afterBody`, which
   runs a follow-up once a response body is fully read or cancelled).
2. Provides and consumes: hard `router`, `routerHttp`, `desktopRuntime` (the native picker and the boot report) and `acrylSettings`
   (preferences). `desktopSettingsController` is an intentional optional `ctx.get()`: the launcher provides it, a plain DSH boot of the
   profile has none and then serves no settings routes (as before). Provides nothing.
3. Effects and disposal: no resource of its own. `route('/')` and the two `mount(prefix)` calls are owned by the plugin's fiber; on
   unload the router ends the mount's requests within its grace and releases both prefixes (tested: two releases). The settings restart
   runs after the response body has been read (or the client went away), on the next turn, so the answer reaches the renderer before the
   Host restarts, as the old `res.on('finish')` did; a restart failure is reported, not thrown.
4. Configuration and composition: Desktop's installation overlay (`cordis.patch.yml`) now composes `acrylblends/cordis/router` and
   `acrylblends/cordis/router-http` before the shell, whatever the Blueprint carries, and `acryl-desktop/api` after it. A Blueprint's
   framework kit and the community Market find the router rows present and do not insert them again (tested for a Blueprint with and
   without the kit), so the Market no longer inserts them itself. Row id exception, named per the row-id rule in `CLAUDE.md`: the id
   `acryl-desktop/api` is not a bare package name but names the module, package plus subpath, the convention the framework's own rows
   (`acrylblends/cordis/router`) already use for a package that ships more than one plugin; `acryl-desktop/terminal` is the existing
   Desktop instance. A profile made before this change still boots: profiles on disk hold only their bundles and the user's patch, the
   composed rows come from the installation overlay, and no doc or skill told anyone to write the router rows themselves.
5. Events and durability: none changed.
6. Verification: `tests/api/plugin.spec.ts` runs the built plugin on a real Loader with the real router and router-http rows over a
   counting loopback `webServer`: two prefix mounts and no exact route, no picker on Linux, PENDING without the router, three router
   reloads with one registration per prefix each time and the shell's stand-in (with the shell's real `inject`) never disposed, and the
   row's unload releasing both prefixes. Every route test calls the route's `App` through the same `privateApi` the plugin serves.
   The profile tests check the composition above; an isolated Desktop boot from a home made before this change checks it live.

Answers that changed (Desktop's own renderer is the only caller):
- refusals (another origin, a peer that is not loopback, a wrong `Host`) are 403 from the shared own-page rule, with its JSON body; the
  renderer boot report and the picker used to answer an empty 403. The boot report and the picker now also check the peer and `Host`,
  which only the settings routes did.
- a body over the route's limit is 413 on every route (the boot report and the validator answered 400).
- a wrong method is 405 with `Allow` on every route; GET routes also answer HEAD.
- kept: 415 for a body that is not JSON, 400 for malformed JSON and invalid bodies, 422 for a preferences change the schema refuses, 204
  for the boot report, and every status and body of the settings API.

Measured: webServer registration call sites 14 -> 9 (`apps/acryl-desktop` 5 -> 0); DSH import lines 135 -> 135 (104 outside the seam).
