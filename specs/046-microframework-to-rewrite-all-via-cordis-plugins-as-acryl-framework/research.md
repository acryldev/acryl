# Research 046 - facts the plan waits on

All measured 2026-10-23 from shallow clones and the pinned DSH checkout. Source claims about third-party releases are
marked unverified.

## Candidates, measured

| | Layer | Core size | Runtime deps | Notes |
| --- | --- | --- | --- | --- |
| Reference A | HTTP transport | about 3.4k lines across the files that matter (`compose` 73, `router` 103, linear router 152, `hono-base` 564, `context` 797, `request` 520); about 4.9k lines of core without routers, middleware, helpers and adapters | none | in-process `fetch`, Web-standard types |
| Vike | page rendering, Vite plugin | about 45.9k lines in `packages/vike/src` | 20+ (`vite` >= 7.1, `rolldown`, `@babel/core`, `@universal-middleware/*`, `sirv`...) | server-agnostic; its templates use Reference A |
| VanJS | reactive UI (DOM) | 141 lines (`van.js`), about 1.8 KB gzipped | none | its DOM-free reactive part is about 40 lines |
| H3 v2, Rou3, itty-router, srvx | HTTP / routing | not measured | not measured | named in the owner's research file; "H3 v2 stable 2026-10-03" is unverified |

## ACRYL and DSH, measured

- DSH `dsh-host-webserver`: Cordis `Service`, 365 lines in `src/index.ts`, exact + longest-prefix + fallback matching, duplicate
  path throws, disposers returned, node:http handlers `(req, res)`, no middleware. README: "It serves browsers only; Electron
  loads dist over file:// and carries fetch over an IPC bridge."
- typert: `@Remote` decorators, generated descriptors, WebSocket through the API gateway (`registerUpgrade`).
- Stack: Cordis 4.0.4, React 18 (131 importing files, 166 .tsx), Vite 6, Electron 44, `ws` 8.21, zustand 4.4 in the DSH client,
  xterm 6, `@earendil-works/pi-tui` 1.1.0, Tailwind 4 (Desktop).
- ACRYL HTTP users of `ctx.webServer`: about 6 source files (market routes, sign-in callback and others).

## Source documents

- Owner research file: `docs-acryl-project-RnD-ideas-discussions-questions/ACRYL Microframework Recommendation - 6adac450-....md`
  (an outside assistant's survey of about 59 frameworks; ends by recommending a Vike audit and an H3 v2 versus Reference A test).
  This spec follows its test idea (M0) and its five rules, and departs from its final pick for the reasons above.
- `docs/acryl/ROUTER-SERVICE-DESIGN.md` (design draft and decision record).
- Reference philosophy: pi.dev (small core, extensions, docs shipped beside the code).

## Still to find out

- Whether H3 v2 and Rou3 are as small and disposable as Reference A's design (measure, do not assume).
- typert and Desktop IPC answers (open questions 1 and 2 in spec.md).

## M0/M1 result (2026-10-23)

- Candidate 1, the reference-shaped rewrite (`plugins/acryl-router`, about 400 lines of source in 6 files: `pattern` 100, `table` 110,
  `service` 100, `context` 20, `compose` 20, `types` 35), passes all 12 conformance checks through three routes: the pure
  `RouteTable`, the `Router` service in a Cordis `Context`, and a real Loader row mounting the built `lib/index.js`.
- Lifecycle checks green: PENDING without a provider and activation when it appears, provider replacement with no doubled
  registrations, consumer unload removes only its routes, 50 mount/unload cycles return to baseline, in-flight requests are
  aborted and awaited on disposal (disposed router answers 503), 10 Loader disable/enable cycles.
- Because the first candidate passed, H3 and Rou3 were not measured. The suite is framework-neutral (`Candidate`), so a
  comparison is one adapter and a test run if one is wanted later.
- No dependency on `hono` was needed: the matcher, `compose` and context are ACRYL-owned.

## M2 result (2026-10-23)

- `acryl-router-http` serves a mounted prefix through `router.fetch`. A prefix route on the DSH webServer matches the path and
  everything below it, so one `mount('/api/community-market')` covers all of the Market's routes, ported or not: exact routes
  still registered on the webServer win over the prefix, so the unported routes keep working unchanged.
- **Finding: connection facts need a seam.** The Market's loopback-only authority check reads `req.socket.remoteAddress`, which
  a Web `Request` does not carry. The router now takes `connection` info as a second argument of `fetch` (the adapter fills it
  from the socket); an in-process caller passes none, so the Market refuses it by default. Anything that must trust the peer
  has to read `c.connection`, never a header.
- **Finding: route methods.** The old state route answered any method; the router route is `GET` (and `HEAD`). Routes that
  checked methods themselves (sources, assets) use the any-method route so their exact error bodies are unchanged.
- **Finding: composition is where the cost is.** Porting a route is mechanical; making every surface mount the new services is
  not: the Web blueprint, the Desktop profile, the Loader boot smoke, four package manifests and the lockfile. A row table `needs`
  list in the Web blueprint and a required-rows constant in the Desktop market module now carry it.
- **Not done in this slice:** seven Market routes (their tests build `req`/`res` emitters by hand), the Desktop IPC bridge,
  the CLI/TUI call path, and a full application boot (Web or Desktop). The worktree's other packages lack `node_modules`, so
  `acryl-plugin-context` and `extension-examples` specs cannot run here; CI is the check for those.

## M4 and M5 results (2026-10-23)

- Cordis exposes a fiber's `inject` (what it requires), its state, and `getEffects()` (a tree of labeled effects; `ctx.provide("x")`
  for what it provides). With the label convention `<plugin>: <what>`, the whole per-plugin contract is available at runtime, so
  M4 is an inspector, not a declaration format.
- **Finding: streaming and "in flight".** A request is done when its `Response` is returned, but a server-sent stream lives on.
  Without an explicit hand-off the router could not abort or await it at disposal (found when a disposal-closes-the-stream test
  timed out). `waitUntil` plus a bounded grace period fixed it and is covered by tests in the router and over real HTTP.
- **Finding: the layout gate.** The repo's DSH import ratchet (134 lines) rejected the first adapter because it imported a
  type from the DSH webserver; the adapter now owns a two-line port and reads the service by name.
- The state core is about 70 lines (`cell.ts`), no Cordis and no DOM, VanJS-shaped as proposed; the DOM-renderer half of the idea
  (M6) is untouched.
