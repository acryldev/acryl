# Research 046 - facts the plan waits on

All measured 2026-10-23 from shallow clones and the pinned DSH checkout. Source claims about third-party releases are
marked unverified.

## Candidates, measured

| | Layer | Core size | Runtime deps | Notes |
| --- | --- | --- | --- | --- |
| Hono | HTTP transport | about 3.4k lines across the files that matter (`compose` 73, `router` 103, linear router 152, `hono-base` 564, `context` 797, `request` 520); about 4.9k lines of core without routers, middleware, helpers and adapters | none | in-process `fetch`, Web-standard types |
| Vike | page rendering, Vite plugin | about 45.9k lines in `packages/vike/src` | 20+ (`vite` >= 7.1, `rolldown`, `@babel/core`, `@universal-middleware/*`, `sirv`...) | server-agnostic; its templates use Hono |
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
  (an outside assistant's survey of about 59 frameworks; ends by recommending a Vike audit and an H3 v2 versus Hono test).
  This spec follows its test idea (M0) and its five rules, and departs from its final pick for the reasons above.
- `docs/acryl/ROUTER-SERVICE-DESIGN.md` (design draft and decision record).
- Reference philosophy: pi.dev (small core, extensions, docs shipped beside the code).

## Still to find out

- Whether H3 v2 and Rou3 are as small and disposable as Hono's design (measure, do not assume).
- typert and Desktop IPC answers (open questions 1 and 2 in spec.md).

## M0/M1 result (2026-10-23)

- Candidate 1, the Hono-shaped rewrite (`plugins/acryl-router`, about 400 lines of source in 6 files: `pattern` 100, `table` 110,
  `service` 100, `context` 20, `compose` 20, `types` 35), passes all 12 conformance checks through three routes: the pure
  `RouteTable`, the `Router` service in a Cordis `Context`, and a real Loader row mounting the built `lib/index.js`.
- Lifecycle checks green: PENDING without a provider and activation when it appears, provider replacement with no doubled
  registrations, consumer unload removes only its routes, 50 mount/unload cycles return to baseline, in-flight requests are
  aborted and awaited on disposal (disposed router answers 503), 10 Loader disable/enable cycles.
- Because the first candidate passed, H3 and Rou3 were not measured. The suite is framework-neutral (`Candidate`), so a
  comparison is one adapter and a test run if one is wanted later.
- No dependency on `hono` was needed: the matcher, `compose` and context are ACRYL-owned.
