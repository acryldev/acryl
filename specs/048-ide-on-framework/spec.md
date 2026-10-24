# Spec 048 - The ACRYL IDE on the ACRYL Framework

Status (2026-10-24): slices 1 (`acryl-workspace`) and 2 (`acryl-agent-control`, the door) are on `main`; next is T005, the
terminal's PATH lookup. The ledger is `tasks.md`; the method, the measures and the slice order are in `plan.md`. This folder takes over
Phase 8 from spec 046 (`tasks.md` T021-T027) and spec 047 (`plan.md` Phase 8, T016-T017), which now point here.

## Why

The owner asked for a real port of a mature web framework into Cordis plugins, the first Cordis framework, usable for both Web and
Desktop (Electron), and then for the ACRYL IDE to be restructured and simplified on it. The port is done (spec 047, released as 0.4.0).
This spec is the second half: move the IDE onto that framework.

Owner direction (2026-10-23, in the owner's words where quoted): ACRYL builds its own agentic framework from that upstream design,
rewritten as Cordis plugins; "technically it will be rewrite but into cordis plugins", "the first cordis framework"; the IDE is ported into
it afterwards; DSH becomes one chat driver among others, and terminal agents (claude, codex, pi) act as drivers through the door.

## What is wrong today

The IDE's Host routes go through DSH's `webServer`, the route table the DeepSeek Harness provides: one Node `(req, res)` handler per path,
no middleware chain, no Web-standard `Request`/`Response`, and a copy of the same origin, method and body checks in every handler. The
terminal UI and tests cannot call those routes in process. Every handler is welded to DSH's server shape, which DSH may change.

## Goal

Every IDE capability serves its HTTP through the framework: an `App` per capability, mounted with `ctx.router.route` and served on the
Host with `ctx.routerHttp.mount(prefix)`. The same handlers then run on Web and Desktop over the Host's loopback server, in process for
the terminal UI and tests, and under `acryl-node-server` without the Host.

Success is measured, not asserted:

- `webServer` registration call sites in production source go to zero outside the adapter (`acryl-router-http`), which is the one place
  the IDE reaches the Host's server.
- The DSH direct-import ceiling in `scripts/verify-layout.mjs` (133 lines, 104 outside the seam) falls wherever a slice removes a DSH
  import, and never rises.
- No user-visible behavior is lost. An answer that changes (a status code, a header) is recorded where the slice lands, and anything that
  changes what a user sees or removes a feature stops for an owner decision.

## Out of scope

- Typed RPC over DSH's typert WebSocket. Do not convert RPC methods because their names look like HTTP routes.
- What DSH itself serves on its own `webServer` (its pages and RPC): that is DSH's, not the IDE's.
- Drivers (spec 046 Phase 9: `acryl-driver-dsh`, `acryl-driver-pty`). They build on the door this spec moves, and get their own spec.

## Constraints

- One slice per `webServer` user, largest first, each small, revertible and its own commit, with its tests and CI green and a real
  isolated boot (`scripts/live-run.mjs`) before it merges.
- A capability keeps its trust model exactly unless the owner decides otherwise. For the door (`acryl-agent-control`): the loopback-only
  rule, the per-run secret file and every-call approval stay as they are.
- The upstream framework's name appears only in LICENSE files.
