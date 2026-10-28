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
| `webServer` registration call sites | `register`/`registerUpgrade` calls on `acrylWeb`, `webServer` or a port named `web`, in production source of `apps`, `plugins`, `runtime` (tests and build output excluded) | 30 | 8 (after T004) |
| DSH direct-import lines | the ceiling in `scripts/verify-layout.mjs` | 133 (104 outside the seam) | 135 (104 outside the seam): raised once by the 2026-10-25 profile resolution port, T012 is its way back |

The count is this command, from the repository root (M7, spec 049, started at 14):

```sh
git grep -nE "(acrylWeb|webServer|[^a-zA-Z]web)[?]?[.](register|registerUpgrade)[(]" -- apps plugins runtime \
  | grep -vE "/tests?/|/lib/|lib-publish/|\.md:|/docs/|/scripts/|\.spec\.|\.test\."
```

The call-site count today, by package: `runtime/acryl-harness-runtime` 2, `acryl-plugin-admin` 2, `acryl-plugin-context` 2 (the
`host-route-basic` example, T010, and the startup-hold route, T013), `acryl-workspace` 1 (the terminal WebSocket), `acryl-support` 1.
The two in `acryl-harness-runtime` are the `acrylWeb` carrier (`engine-web.ts`, a
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

### Slice 5: `acryl-sign-in` (T004)

The routes behind the account sign-in card on Settings > Models (Web and Desktop): the provider list, the current attempt, and begin,
answer and cancel. Credentials pass through them, so the rule for this slice is the one of slice 2: the checks do not change.

Cordis mini-design:

1. Capability and boundary: unchanged. The plugin owns the sign-in conversation over the harness's authorization flows; only its
   transport moves. `src/route.ts` now exports `signInRoutes(controller, report)`, one App.
2. Provides and consumes: adds hard `router` and `routerHttp` injects beside `acrylWeb` (its port is still the origin DeepSeek's
   browser sign-in returns to), `authorization` and `credentials`. `settings`, `llm`, `agentDefaultModel` and `deepseekAccount` stay
   optional `ctx.get()` lookups made when a sign-in succeeds. Provides nothing new.
3. Effects and disposal: no resource of its own; the controller holds the one running attempt in memory. `route('/')` and
   `mount('/api/acryl-sign-in')` are owned by the fiber; on unload the router ends the mount's requests within its grace and releases
   the prefix.
4. Configuration and composition: row id `acryl-sign-in` unchanged. The `sign-in` capability now declares `needsRouter`, so a
   Blueprint that composes it without the `framework-kit` row is refused (the built-ins with it, `acryl.ide` and `acryl.agents`,
   have the kit; tested). Desktop composes the router rows itself (slice 4). The terminal's account-callback row, which serves
   DeepSeek's `/oauth/callback` on its own `webServer` realm, is a different plugin and unchanged. Found on the way: the JSON
   media-type check was Desktop's alone and sign-in needs the same, so it moved to `acryl-loopback-http/router` as `jsonContent`
   (tested there).
5. Events and durability: none changed.
6. Verification: route tests call the App as the adapter does (connection facts included); a plugin test on real Cordis with the
   real router and router-http over a loopback socket: one prefix mount and no exact route, PENDING without the router and without
   the harness services, the mount gone while `credentials` is withdrawn and back when it returns, three reloads with one mount each,
   and the default-model adoption after a sign-in begun over the socket.

Checks kept exactly: a read from the own page (exact `Origin`, or same-origin fetch metadata plus a same-origin `Referer`), a change
only with the exact `Origin`, loopback peer and `Host` for both; 415 for a body that is not JSON, 413 over 16 KiB, 400 for malformed
JSON (`invalid JSON request`) and for an invalid body (`invalid <operation> request`), 409 with the harness's reason, 500 `sign-in
unavailable` with the cause reported, never echoed. Answers that changed: a refusal's body is the own-page rule's text instead of
`forbidden` (the status stays 403, and only a page that is not the app's own can see it); `Allow` on a 405 lists HEAD beside GET for
the two reads, which now also answer HEAD.

Measured: webServer registration call sites 9 -> 8 (`acryl-sign-in` 1 -> 0, a loop over five routes); DSH import lines 135 -> 135.

### Slice 3: the terminal's search path without blocking (T005)

Found in slice 1: building the workspace's PTY registry ran the user's login shell synchronously (`$SHELL -lic 'echo $PATH'`, about
1.2 s with an interactive zsh), so every activation of `acryl-workspace` (each boot and each reload) stalled the Host's event loop.

Cordis mini-design:

1. Capability and boundary: unchanged. The registry (`src/pty/service.ts`) still owns the search path a bare command is resolved on;
   only when and how it is found changes.
2. Provides and consumes: no service or inject changes. Inside the plugin, `WorkspacePtyRegistry.start` and `canRun` return promises,
   and the agents' "is this program installed" port (`CommandExists`) is asynchronous, so `AgentSettings.view()` is too; the PTY start
   route and the agent settings route await them. The answers on the wire are the same.
3. Effects and disposal: the lookup is one child process (`spawn`, stdin ignored, stderr dropped, killed after 3 s), started when the
   registry is built and never awaited by activation. Its promise is kept per shell, home and PATH for the life of the process, so a
   reload does not ask again; it never rejects (a failed or slow shell leaves the environment's PATH). A start that is still waiting
   when the registry is disposed (the plugin unloaded) spawns nothing and rejects.
4. Configuration and composition: none changed.
5. Events and durability: none changed.
6. Verification: a fake login shell that sleeps, counts its runs and prints a folder only it knows: the registry is built at once and a
   20 ms timer keeps firing while the shell answers (the old code fails this), `canRun` and `start` find the program only the login
   shell knows, one run for three registries, the environment PATH kept when the shell fails (both probe forms tried), and no spawn for
   a start pending at disposal. The existing PTY, agent and shared-context tests run against the asynchronous API.

Measured: webServer registration call sites 8 -> 8 and DSH import lines 135 -> 135 (this slice moves no route).

### Slice 6: `acryl-plugin-admin` and `acryl-support` (T006)

The routes behind Settings > Plugins > Lifecycle and Architecture (Web and Desktop), and Web's Settings > Support > Export diagnostics.

Cordis mini-design:

1. Capability and boundary: unchanged. `acryl-plugin-admin` owns the lifecycle and architecture projections, `acryl-support` the Web
   file log and the diagnostics archive; only their transport moves. Each route file now exports one App: `architectureRoutes(controller,
   report)`, `lifecycleRoutes(controller, report)` and `supportRoutes(build, report)`.
2. Provides and consumes: both replace the `acrylWeb` inject with hard `router` and `routerHttp` (the origin no longer comes from its
   port: the own-page rule checks the request against the socket's local port). The lifecycle child injects `router` and
   `acrPluginLifecycle`, the agent-tools child is unchanged, and `acryl-support` keeps `appInstance`. Provides nothing new.
3. Effects and disposal: `acryl-plugin-admin` mounts `/api/acryl-plugin-admin` once in its root fiber and routes the architecture App
   there; the lifecycle child routes its App into the same router, so it leaves with `acrPluginLifecycle` and the four paths answer 404,
   as before, while the architecture route stays. `acryl-support` keeps its one effect for the log sink (closed on unload) and routes and
   mounts `/api/acryl-support` outside it, owned by the fiber.
4. Configuration and composition: row ids `acryl-plugin-admin` and `acryl-support` unchanged. The `plugin-admin` and `support`
   capabilities now declare `needsRouter`; the only built-in Blueprint with either, `acryl.ide`, has the `framework-kit` row, and
   Desktop composes the router rows itself (slice 4).
5. Events and durability: none changed.
6. Verification: route tests call each App as the adapter does; plugin tests on real Cordis with the real router and router-http over
   a loopback socket: one prefix mount and no exact route, PENDING without a router, the lifecycle routes present only while the
   lifecycle service is (architecture kept), the support download over the socket with the log folder in the engine home, and three
   reloads with one mount each.

Checks kept: reads only from the own page (exact `Origin`, or same-origin fetch metadata and `Referer`, which is what the diagnostics
download, a navigation, sends), changes only with the exact `Origin`, loopback peer and `Host`; 400 for an invalid lifecycle body, 409
with the fixed public reason for a refused change, 500 without the cause for a failed projection or archive, 429 while an archive is
being built, the archive's attachment headers. Answers that changed, as in slice 5: a refusal's body is the own-page rule's text instead
of `forbidden` (still 403); the reads also answer HEAD and list it in `Allow`; a lifecycle change now gets 415, 413 and 400 from the
shared middleware with the same texts (`parseJsonPostBody` before).

Measured: webServer registration call sites 8 -> 5 (`acryl-plugin-admin` 2 -> 0, a loop over four routes plus one; `acryl-support`
1 -> 0); DSH import lines 135 -> 135.

### Slice 6b: `acryl-plugin-context`'s startup hold (T013)

The route a Web page rendered before the startup pass settled waits on (`/api/acryl-plugin-context/startup-settled`, specs/001 T097).

Cordis mini-design:

1. Capability and boundary: unchanged. The plugin owns the startup pass and the hold; only the route's transport moves. `index.js`
   exports `startupRoutes(settled, ctx)`, one App.
2. Provides and consumes: the optional `ctx.inject(['webServer'], ...)` scope becomes `['webServer', 'router', 'routerHttp']`: the
   `webserver/index-inject` hook (DSH's own index rendering, not a registration) and the route now live in one scope, so a page gets the
   hold script only where the route is served. `connection` stays an optional lookup made per request; its `admit` takes the request's
   headers, which the router's request carries. The plugin is still required by TUI, which has no web server: nothing activates there.
3. Effects and disposal: `route('/')` and `mount('/api/acryl-plugin-context')` are owned by the scope; on unload the router aborts a
   hold in flight within its grace. Each hold owns one timer and one abort listener, both released when it ends. A page that leaves
   is seen through `c.req.raw.signal` (router-http aborts it when the response closes unfinished) where it was `req.once('close')`.
4. Configuration and composition: row id `acryl-plugin-context` unchanged. Every built-in Blueprint has the `framework-kit` row. A
   custom Blueprint without it serves no hold and no script: its page composes as it did before the hold existed (the race of specs/001
   T097 returns there), instead of fetching a route that is not there. Not declared as a hard requirement because the row also serves
   TUI and Desktop, which never need the hold.
5. Events and durability: none changed.
6. Verification: a unit test of the App (204 once settled with `no-store`, a refused admission answered with its status before any hold
   and given the request's headers, a page that leaves releasing the hold at once); the real-engine test `web-startup-hold.spec.ts`
   (a blank app with the kit: the early index carries the script, 401 and 403 for the unauthenticated and foreign requests, 204 once the
   pass settles, the later index full and without the script) passes on the router.

Answers that changed: the route answers GET only (another method falls through to 404; the page only ever sends GET). acrylblends
^0.9.2 is a dependency; `@types/node` ^22.20.0 joins the devDependencies so the lock resolves acrylblends' optional peers like every
other package's (without it PNPM wrote a third, peer-keyed copy of acrylblends).

Measured: webServer registration call sites 5 -> 4 (`acryl-plugin-context` 2 -> 1: the `host-route-basic` example is T010's); DSH
import lines 135 -> 135.

### Slice 7: what the plugin docs teach (T010)

The agent-facing docs and the verified example in `acryl-plugin-context` taught `ctx.webServer.register` for a plugin's HTTP routes; an
agent copying them would add a call site the moves above remove.

1. Capability and boundary: docs and one example; no runtime code except the install lint.
2. Provides and consumes: the `host-route.basic` example injects `router` and `routerHttp`, builds one `Acryl` app, routes it and mounts
   `/api/example`. It declares `acrylblends` under `peerDependencies` and the two router modules in `dsh.requiresAcrylPackages`, the
   existing path (`materializeRequiredAcrylPackages`) that links the app's own copy into the profile once the framework-kit rows are
   mounted, so an installed plugin never brings a second copy. The install lint now counts `acrylblends` as host-owned: under
   `dependencies` it is refused with the `peerDependencies` advice, like `@deepseek-ai/*` (tested, including a lookalike name).
3. Effects and disposal: the example has none to write; the doc says so (routes and mount leave with the plugin).
4. Configuration and composition: the example's Loader row id becomes `acryl-example-route`, its package name (it was `example-route`,
   the anti-pattern the row-id rule names, in the one place agents copy from).
5. Events and durability: none.
6. Verification: the example gate (`extension-examples.spec.ts`) mounts it on the real web engine, gets `ok` from `GET /api/example/hello`
   on the real socket, and a non-200 after the plugin unloads; the pack's tests (81) and `verify:manifest` pass.

Docs changed: `extending/host-route.md` (rewritten around the router: one prefix per plugin, no effect needed, the package.json fields,
PENDING without the kit, the handler context), `extending/state-and-persistence.md` and the `state-host-store` header (a plain router
route, not `webServer.register`, is what skips the RPC auth fence), and through their generators `maps/mount-points.md` (the
host-route row and the surface table). Regenerated by `sync:corpus` on the way: the taxonomy row of `acryl-desktop` (its router injects
from T003) and the synced guide's source stamp. The page-shell hooks (`webserver/index-inject`, `tapIndex`) stay documented: they are
DSH's index rendering, not route registration.

Measured: webServer registration call sites 4 -> 3 (the example); what remains is T007's terminal upgrade and the two `engine-web.ts`
delegate lines T008 removes. DSH import lines 135 -> 135.

### Slice 8: the ratchet (T009)

`scripts/verify-layout.mjs`, part of the headless gate, counts webServer and acrylWeb registration call sites the same way every slice above
measured them (the same expression over the tracked files of `apps/`, `plugins/` and `runtime/`, without tests, docs, build output and
scripts) and holds them at `WEB_REGISTRATION_CEILING`, set to 3. Like the DSH import ceiling it fails both ways: above the ceiling it says to
serve the route on the router and points at `extending/host-route.md`; below it, it asks for the ceiling to be lowered in the same commit,
so the number in the script is always the measured one. Its summary line now prints the count. Both failures were run once against a probe
copy with the ceiling at 4 and at 2. What remains at 3 is T007's terminal upgrade and the two `engine-web.ts` delegate lines (T008).

### Slice 9: the terminal's WebSocket on the router, and `acrylWeb` without registration (T007, T008)

acrylblends 0.11.0 carries WebSocket upgrades on the router (spec 047 T009, Blends): `ctx.routerHttp.mount(prefix, { upgrade: [path] })` claims
the exact path as one upgrade route of the web server, and `ctx.routerHttp.upgrades()` returns the ported `upgradeWebSocket`, whose sockets belong
to the plugin that asked.

Cordis mini-design:

1. Capability and boundary: unchanged. The workspace owns its terminal stream; only the transport moves. `pty/stream.ts` exports
   `ptyStreamRoutes(registry, upgrade, reportError)`, one App with one route, composed into the workspace's `privateApi` with the others.
2. Provides and consumes: `inject` is unchanged (`acrylWeb` stays for the address agent hooks report to). The stream takes
   `ctx.routerHttp.upgrades()`; `acryl-control`'s `AcrylWeb` loses `register` and `registerUpgrade` (T008), and `engine-web.ts` delegates
   only `host` and `port`. Nothing in ACRYL registered through them after T007.
3. Effects and disposal: the plugin no longer owns a `ws` server, a ping timer or a socket list. The hub pings every socket (30 s, the
   stream's own interval before) and ends dead peers; on unload the mount goes first, then the plugin's sockets close with 1001 within the
   hub's grace (each view's `onClose` runs once and releases its subscription and batch timer), then the PTYs, git and the rest. This is
   the order of before: `upgrades()` is taken after the services' effect, so its disposer runs before theirs.
4. Configuration and composition: no row changes. `acryl-router-http` now imports `acryl-node-server`'s hub but still injects only
   `router` and `webServer`, so the `framework-kit` row needs no new row. `ws` is an optional peer of acrylblends; the lock resolves the
   one acrylblends instance with `ws` 8.22.0 (the workspace's own `ws` moves from 8.21.3 to 8.22.0 so the peer set stays one).
5. Events and durability: none changed. The wire format (`PtyServerMessage`, `PtyClientMessage`) and the path are the same, so the client
   is unchanged.
6. Verification: the stream's tests run on a real loopback socket through the framework's own `UpgradeHub` (replay, resume from a cursor,
   ordered keystrokes, exit, 1008, 4404, the refusals, and 1001 when the owner unloads); the plugin test runs a real shell through the real
   `router` and `routerHttp` over a web server that dispatches upgrades by exact path, as DSH's does (output, keystrokes, a reconnect that
   resumes from its cursor, the refusals, 1001 on unload, one upgrade path per activation across reloads). Live, in isolated homes
   (`scripts/live-run.mjs`, no model key): on Web a client doing what the page does (the run's token, the page's Origin and cookie) started a
   shell, got output for its keystrokes, resized it, resumed from its cursor after a reconnect, and was refused for another Origin, no Origin
   and a malformed request (403, 403, 400) and closed with 4404 for an unknown session; in the Desktop window a terminal tab ran a command
   and showed the window's size, and after a reload came back with its history and ran the next one.

Answers that changed:

- The upgrade's checks are ordinary middleware in front of the route: `ownPageSocket`, new in `acryl-loopback-http/router`, is the
  own-page rule plus always the exact `Origin` (the rule the stream kept before: a socket takes keystrokes, so a read's `Referer` is not
  enough), then the id and cursor check. A refusal is a plain 403 or 400 with `Connection: close` before any handshake, as before.
- The largest frame the hub accepts is its default, 1 MiB (it was 512 KiB); a bigger frame closes with 1009. A keystroke message is
  still refused above 256 Ki characters by the message parser (1008), so what a page can send is unchanged.
- Binary frames never reach the handler (`textOnly`); before, they were dropped in the handler.

Measured: webServer registration call sites 3 -> 0, and `WEB_REGISTRATION_CEILING` 3 -> 0 in the same commit; DSH import lines 135 -> 135.
