# ACRYL Cordis Alignment Audit

**Status:** current implementation and planning gate
**Audited:** 2026-08-24
**Authority:** [Cordis system guide](cordis_system_guide_for_coding_agents.md)
plus the pinned `deepseek-harness/docs/cordis-tutorial/` and owning package
source.

## Scope and evidence

This audit covers the loadable repository-owned Cordis surfaces and the next
planned ACRYL seams:

- `dsh-plugin-desktop` Host and Client entries;
- Development Canvas Host/Client lifecycle and PTY prototype;
- Community Market Host/Client lifecycle;
- Hello World R&D fixture;
- ACRYL-1 room identity/durability plan;
- ACRYL-2 external-agent provider plan; and
- later roadmap stubs where they make Cordis architecture claims.

The codebase-memory MCP was unavailable, so evidence came from direct reads of
the exact manifests, Loader patches, source, tests, plans, and pinned upstream
packages. This is a bounded audit, not a claim that every helper in the
repository has received a line-by-line lifecycle proof.

## Overall verdict

The current runtime foundation is Cordis-aligned. Desktop and Market use real
plugins, stable Loader rows, service injection, child Fibers, effect-owned
registrations, and generation-scoped disposal.

The Development Canvas is lifecycle-aligned as a UI/terminal prototype, but its
agent command catalog is intentionally transitional. It is not yet the planned
agent-agnostic provider architecture.

ACRYL-1 and ACRYL-2 have aligned product requirements but incomplete implementation
plans. Neither is ready for coding until its six-part Cordis mini-design and
DSH-reuse decisions are complete.

## Built surfaces

### Aligned: Desktop Host and Client composition

Evidence:

- `dsh-plugin-desktop/cordis.patch.yml` uses stable Loader ids.
- Host plugins declare hard dependencies with `inject`.
- Client contributions use child plugins, slots, and `ctx.effect()`.
- Launcher-provided services are mounted into the Host root and are disposed
  with the generation.
- Compatibility mode preserves the upstream Client; advanced mode adds
  Desktop-owned presentation through the Client Cordis tree.

No second Electron plugin runtime exists. Electron supplies native adapters and
launches the Host/Web generations; Cordis owns the replaceable application
layer.

### Aligned: Community Market

The Market Host entry hard-injects `webServer` and `settings`. Desktop-only
capabilities are added through nested `ctx.inject(...)` episodes. Routes and
the private install implementation are created inside owned effects and
disposed together. The Client face uses lifecycle-owned locale, style, and slot
registrations.

Provider selection inserts exactly one Market Loader identity. Catalog sources
remain discovery metadata and do not become Cordis plugins merely by appearing
in a remote catalog.

### Aligned R&D: Hello World

`dsh-plugin-desktop/hello-world` is a minimal function plugin with one stable
Loader row. It acquires no resources and therefore needs no custom disposer. It
proves package export and Loader activation only; it is not a product
capability or model-facing Tool.

### Aligned lifecycle, transitional seam: Development Canvas

What is correct:

- Host and Client faces live in the standalone
  `dsh-plugin-development-canvas` package and derive from one Loader row.
- The Host injects `webServer` rather than assuming startup order.
- `CanvasPtyRegistry` is created inside one `ctx.effect()`.
- Partial route activation rolls back synchronously; normal disposal removes
  routes and awaits every PTY session.
- The Client contributes through `ctx.slots.inject('desktop.main', ...)` rather
  than being mounted or imported by Desktop.
- The Client declaration effect owns its slot, styles, and tracked PTY handles,
  including late starts during disposal.
- React owns only view-local polling, xterm subscriptions, ResizeObserver, and
  terminal disposal through `useEffect` cleanup.
- Headless tests cover route rollback/removal, PTY termination, TTY behavior,
  input, resize, Client-session cleanup, and slot replacement.

What remains transitional:

- `CANVAS_PTY_COMMAND_IDS` and the Client label map hardcode agent brands.
- Canvas directly maps an agent name to a `node-pty` command.
- A Canvas PTY id currently doubles as the only runtime handle.
- Canvas does not consume `acrAgentControl` and does not compose existing
  `ctx.terminals` or `ctx.subagents` adapters.
- Raw terminal output is presentation evidence, not canonical agent messages
  or room history.

The generic Terminal tab may remain a Canvas capability. Agent tabs must move
to ACRYL-2's service/provider seam. The current hardcoded list must not become the
foundation for relay, identity, resume, orchestration, or handoff.

### Not executable: Community Fabric

Fabric remains RFC documentation. It has no package export, Loader entry,
service, effect, Tool, or runtime schema. Current implementations must not
pretend its proposed capability declarations are enforced Cordis or security
contracts.

## Planned surfaces

### Conditionally aligned, planning blocked: ACRYL-1 room

The requirements correctly make the room agent-independent, durable, and
activatable. The proposed `acrRoom` capability is a plausible new service seam.

Planning must resolve these questions before implementation:

1. Which existing `ctx.sessions`, workspace, persistence, and Agent Teams
   contracts are reused exactly?
2. Is the portable room record a projection/index over DSH durable events, or
   a genuinely new domain event stream? The plan may not claim both “not a new
   event store” and an independent canonical log without defining ownership.
3. Which service is provided, what are its request/result types, and which
   consumers hard-inject it?
4. Which facts are durable records versus live Cordis events?
5. How are single-writer locking, partial writes, restart, provider loss, and
   repeated activation tested?
6. What survives Fiber disposal, and what process-local state must disappear?

The service definition, provider, and consumers must be separated only where
they vary. A second generic event bus or persistence framework is not allowed.

### Direction aligned, plan incomplete: ACRYL-2 agent control

The governing seam is the working `acrAgentControl` service from
`docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`.

Required shape:

- one stable service definition for provider-neutral agent control;
- provider plugins for PTY, ACP, SDK/API, or structured CLI transports;
- reversible provider registrations owned by provider Fibers;
- Canvas, relay, and orchestration as consumers that inject the service;
- explicit capability/fidelity declarations;
- separate Canvas, ACRYL worker, runtime, and provider-session identities; and
- durable room facts independent of terminal text.

The PTY provider should adapt existing `ctx.terminals`, `ctx.subprocess`,
`ctx.sandbox`, and relevant `ctx.subagents` backends where their contracts fit.
Direct `node-pty` ownership is acceptable only as a documented adapter fallback,
not as a second global terminal/provider framework.

### Not yet auditable: later roadmap stubs

ACRYL-3 through ACRYL-13 mostly state product intent and Cordis constraints but do
not yet define interfaces, injections, effects, event modes, durability, or
replacement tests. Their current status is “not planned,” not “Cordis
approved.” Each must pass the `AGENTS.md` mini-design before tasks are emitted.

## Tool-specific gate

No custom ACRYL model-facing Tool has been implemented yet.

Before the first one is accepted, it must:

1. be an ordinary plugin that injects `tools` and every capability it consumes;
2. register through `ctx.tools.register(defineTool(...))`;
3. expose validated model arguments;
4. return a canonical typed value through `output.schema`;
5. render model-facing content separately through `output.render`;
6. honor `exec.signal`;
7. traverse the normal Tool policy/event pipeline; and
8. disappear cleanly when its Fiber or a required provider unloads.

The first Tool exercise should also test PENDING without `tools`, activation
when `tools` appears, execution, `tools/result` observation, cancellation, and
unregistration on disposal.

## Required order before product implementation

1. Use the Hello World fixture only to understand plugin loading.
2. Complete a keyless Tool R&D exercise against the real `tools` service.
3. Complete a service/provider/consumer replacement exercise with PENDING,
   provider swap, disposal, and repeated activation.
4. Finish the ACRYL-1 mini-design and DSH persistence reuse decision.
5. Finish the ACRYL-2 `acrAgentControl` contract and adapter reuse decision.
6. Only then emit implementation tasks for the persistent room and
   provider-backed agent surface.

## Evidence pointers

- `docs/cordis/cordis_system_guide_for_coding_agents.md`
- `deepseek-harness/docs/cordis-tutorial/`
- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`
- `dsh-plugin-desktop/cordis.patch.yml`
- `dsh-plugin-development-canvas/src/index.ts`
- `dsh-plugin-development-canvas/src/canvas-pty.ts`
- `dsh-plugin-development-canvas/src/client/`
- `dsh-community-market/src/index.ts`
- `dsh-community-market/src/client/index.ts`
- `specs/002-acryl-1-plugin-identity/`
- `specs/003-acryl-2-pty-provider/`
- `specs/015-development-canvas/`
