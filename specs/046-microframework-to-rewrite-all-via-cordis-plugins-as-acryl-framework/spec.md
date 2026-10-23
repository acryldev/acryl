# Spec 046 - A microframework rewritten as Cordis plugins: the ACRYL Framework

Status: draft for owner review (2026-10-23). Nothing here is implemented. Ticket: new, no earlier spec covers it.
The folder name carries no framework name on purpose: more than one candidate may be tried.

## Why

ACRYL inherited a large part of its stack from the DeepSeek Harness (DSH), which changes quickly and may not go where ACRYL needs.
DSH stays as one optional agent; Cordis, its plugin system, is the part ACRYL keeps. What is missing is a small, readable layer
on top of Cordis that a person can hold in their head, so that building an agentic app with ACRYL feels like using a framework
and not like reading 50 DSH packages.

Owner request (2026-10-22/23, paraphrased from chat): find a micro-framework that fits ACRYL's stack (Cordis, React, Electron,
Web, TUI), rewrite it completely as Cordis plugins, and make that the ACRYL Framework. Keep React, do not rip anything out.

## What ACRYL has today (measured 2026-10-23, see research.md)

- Cordis 4.0.4 is the one lifecycle for Web, Desktop and the CLI/TUI.
- UI is React 18 (131 files import it) with plugin-owned slots; build is Vite; Desktop is Electron 44.
- HTTP goes through DSH's `webServer` (`node:http`, route table with disposers, no middleware, no Web-standard Request/Response).
  Desktop does not use it: it carries fetch over an IPC bridge. The TUI has no web server.
- Typed RPC is DSH's typert over a WebSocket upgrade.

## The decision this spec carries (owner confirmation requested)

The base is **a micro-framework's design, rewritten as ACRYL-owned Cordis plugins**, not a fork of a full framework.
Current leading reference: Hono (HTTP transport; about 1k lines of design to copy). Vike was measured (about 46k lines, a Vite
plugin, page rendering) and is not rewritten; it stays an optional page layer for public SSR pages if ever needed. The leading
reference can change: milestone M0 makes the choice testable. Record: `docs/acryl/ROUTER-SERVICE-DESIGN.md`, "Decision record".

## The five rules (from the research, adopted)

1. Everything extensible is a Cordis plugin.
2. One application, several surfaces: share capabilities and contracts, not necessarily the transport.
3. One declared contract per plugin: what it provides, needs, and registers (routes, commands, tools, slots).
4. Every registration is reversible: unloading a plugin removes what it owns.
5. Conventions are explicit and small: an ordinary feature needs no knowledge of the runtime internals.

## Milestones (ordered, each ends in a gate; no time estimates)

| # | Milestone | Gate (done when) |
| --- | --- | --- |
| M0 | **Conformance suite and candidate check.** One framework-neutral test suite for a `router` service (the six Loader checks and the same-handler-three-ways check). Run it against the Hono-shaped design first; run H3 and a Rou3-based core only if the first fails a check or the owner asks. | The suite exists and the first candidate's result is recorded; a choice is written in research.md. |
| M1 | **`acryl-router`.** The service: `route`, `use`, in-process `fetch(Request)`. No I/O, no dependencies. | All conformance checks pass in a real Loader. |
| M2 | **HTTP adapter and first port.** `acryl-router-http` wraps DSH `webServer`; the market routes move onto the router; typert is untouched. | Market works in Web as before; unload removes its routes; reload registers them once. |
| M3 | **Three surfaces, one handler.** The same capability runs through HTTP (Web), the Desktop IPC bridge, and in-process in the TUI with no network server. | One handler, three recorded runs. |
| M4 | **Plugin contract.** One typed declaration per plugin (provides, requires, routes, commands, tools, slots) and a generated diagnostic ("what does this plugin do, and what happens when it unloads"). Builds on the existing `acryl.requires` and `acryl.provides`. | Every plugin in a chosen set declares it and the generator reads it. |
| M5 | **`state` service.** A DOM-free reactive core shared by the surfaces (VanJS-shaped), React and pi-tui adapters. | A value changes in one place and updates Web, Desktop and the TUI. |
| M6 | **Optional layers, decided not assumed.** DOM renderer for small Blend apps; page/SSR layer for public pages (Vike unchanged). Each only if the owner confirms a product need. | A written yes or no per layer. |
| M7 | **Detach from DSH `webServer`.** ACRYL serves its own routes without depending on `ctx.webServer`; docs, tests and the development log updated. | `ctx.webServer` is no longer imported by ACRYL plugins, or the remaining uses are listed and justified. |

## Non-goals

- Rewriting React, Vite, Electron, `pi-tui` or typert.
- Replacing Next.js for public SEO pages (decided in M6, not now).
- A second dependency-injection, plugin or lifecycle system. Cordis stays the only one.

## Open questions

1. typert: should an RPC method also be callable through the `router`, so the TUI needs no WebSocket?
2. Where the Desktop IPC bridge lives (DSH desktop host or ACRYL) and whether it can call `router.fetch`.
3. Whether the framework's kernel should be one package with the services in it, or the services stay separate plugins.
4. Service name: confirm `router` collides with nothing.
