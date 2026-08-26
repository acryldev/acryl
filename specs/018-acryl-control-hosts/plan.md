# Implementation Plan: ACRYL Standalone Agent and Peer Hosts

**Branch**: `018-acryl-control-hosts` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-acryl-control-hosts/spec.md`

## Summary

Establish `acryl` as a standalone interactive agent and operational control surface with three peer host compositions (terminal `acryl`, Electron `acryl-gui`, Web `acryl-web`). The terminal host reuses the pinned DeepSeek Harness agent spine, durable sessions, trajectory, tools, jobs, subagents, and existing Codex/Claude providers, adds host-neutral ACRYL control services, and provides full lifecycle, architecture, installation, recovery, and coding-agent orchestration through OpenTUI.

## Technical Context

- **Language/Version**: TypeScript (strict). DSH control plane stays on the repository Node line (`^22.19.0` or `>=24.0.0`). The OpenTUI presentation spine runs on Bun 1.3.0+ (or Node 26.4.0+) per `@opentui/core` 0.5.8.
- **Primary Dependencies**: `@deepseek-ai/cordis` (vendored/pinned), `@deepseek-ai/dsh-*` capabilities, `@opentui/core`, existing `dsh-plugin-desktop` profile/lifecycle/Market modules.
- **Storage**: reuse Harness durable sessions, Desktop profile state, Market state, and the profile ownership lease file. No new general-purpose event store.
- **Testing**: run-once `node --test` / Vitest (run mode) per workspace, `corepack yarn check`, headless Loader/profile smokes, and no interactive/watch test modes.
- **Target Platform**: macOS first (current dev host), Windows and Linux follow the existing cross-platform gates.
- **Project Type**: multi-workspace Yarn 4 monorepo + pinned upstream pnpm submodule.
- **Performance Goals**: startup to usable TUI in under a few seconds; attach discovery bounded to a short timeout; no unbounded runtime state polling.
- **Constraints**: no upstream edits, no second plugin/lifecycle/event/DI framework, single-writer profile ownership, headless-safe gates, no PTY text scraping as canonical history.
- **Scale/Scope**: one new control-plane workspace, one new TUI workspace, plus staged extraction of existing Desktop capabilities.

## Constitution Check

| Gate | Status | Evidence |
| --- | --- | --- |
| Everything is a plugin | Pass | TUI screens, control services, agent adapters, and launchers are Cordis plugins with reversible effects. |
| Agents disposable, room persistent | Pass | TUI presentation is a projection over durable sessions; no terminal text becomes canonical history. |
| Compose DSH, do not fork it | Pass | Reuse `ctx.agents`, `ctx.sessions`, `ctx.subagents`, `ctx.dynamicCordisRunner`; submodule untouched. |
| Canonical state durable and agent-independent | Pass | Durable session events and profile state remain authoritative; live events only coordinate. |
| Generated capabilities outside the kernel | Pass | Candidate promotion follows build/validate/settle/health/rollback; HOT/WARM/COLD classified. |
| Cordis authoring laws | Pass | Six-part mini-design below; `inject` not YAML order; disposers for all owned resources; PENDING treated as valid. |
| Desktop/repository constraints | Pass | Yarn 4 + Corepack; headless-safe tests; submodule pin separate. |

No violation requires a Complexity Tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/018-acryl-control-hosts/
├── spec.md            # approved feature specification
├── plan.md            # this file
├── research.md        # decisions and evidence
├── data-model.md      # entities and relationships
├── contracts/
│   └── cli.md         # canonical command grammar and output contract
├── quickstart.md      # runnable validation guide
└── tasks.md           # dependency-ordered tasks (separate step)
```

### Source Code (repository root, following the existing flat workspace convention)

```text
acryl-control/
├── package.json
├── tsconfig.json
├── cordis.patch.yml
├── src/
│   ├── index.ts                 # public Host entry and service definitions
│   ├── contracts/
│   │   ├── control-protocol.ts  # generation-scoped capability + envelope types
│   │   ├── ownership.ts         # ProfileOwnershipLease types and invariants
│   │   └── operations.ts        # ControlOperation + receipt + restart class
│   ├── ownership/
│   │   ├── lease-store.ts       # platform-exclusive acquire/release/heartbeat
│   │   ├── lease-provider.ts    # acrProfileOwnership service provider
│   │   └── recovery.ts          # stale/suspect recovery with verification
│   ├── architecture/
│   │   ├── projection.ts        # bounded RuntimeArchitectureSnapshot
│   │   └── provider.ts          # acrRuntimeArchitecture service provider
│   ├── lifecycle/
│   │   ├── controller.ts        # host-neutral lifecycle operations
│   │   └── provider.ts          # acrPluginLifecycle service provider
│   ├── agent/
│   │   ├── agent-control.ts     # acrAgentControl definition (composed, not new transport)
│   │   └── providers/           # dsh-native, codex, claude, acp, future adapters
│   └── events.ts                # typed ACRYL control events
├── tests/
│   ├── ownership.spec.ts
│   ├── architecture.spec.ts
│   ├── lifecycle.spec.ts
│   ├── agent-control.spec.ts
│   └── leak.spec.ts

acryl-tui/
├── package.json                 # Bun 1.3+ / Node 26.4+ runtime; depends on @opentui/core
├── tsconfig.json
├── src/
│   ├── bin.ts                   # canonical `acryl` argv parser and dispatch
│   ├── cli/
│   │   ├── grammar.ts           # subcommand grammar and validation
│   │   ├── output.ts            # canonical JSON envelope + exit classes
│   │   └── noninteractive.ts    # script commands
│   ├── host/
│   │   ├── direct.ts            # boot ACRYL composition in-process
│   │   ├── attach.ts            # authenticate to live owner endpoint
│   │   └── recovery.ts          # narrow diagnostic/repair path
│   ├── render/
│   │   ├── app.ts               # createCliRenderer lifecycle and root renderable
│   │   ├── screens/             # chat, architecture, lifecycle, market, agents
│   │   ├── contributions.ts     # TuiContribution registry service
│   │   └── status.ts            # host/owner/profile/model/health status
│   ├── bridge/
│   │   ├── control-client.ts    # typed local control protocol client
│   │   └── transport/           # socket, unix, named-pipe, loopback HTTP
│   └── runtime.ts               # TUI-side Cordis composition and effects
├── tests/
│   ├── grammar.spec.ts
│   ├── output.spec.ts
│   ├── contributions.spec.ts
│   ├── attach.spec.ts
│   └── smoke.spec.ts
```

**Structure Decision**: follow the existing flat workspace convention (`dsh-plugin-*` at root). `acryl-control/` is the host-neutral control plane consumed both in-process and over the protocol; `acryl-tui/` is the terminal presentation host. Desktop and Market continue to own their Electron/browser faces and are refactored stage-by-stage toward `acryl-control`.

## Six-part Cordis mini-design

### 1. Capability and plugin boundary

ACRYL control is its own domain: inspect and mutate the runtime composition, profile ownership, plugin lifecycle, Market operations, and agent execution across terminal, GUI, and Web hosts.

Service definitions live in `acryl-control/src/contracts` and are provided by Cordis Service classes:

```text
acrProfileOwnership   exclusive profile lease and owner discovery
acrRuntimeArchitecture bounded native runtime projection
acrPluginLifecycle    lifecycle mutation over Loader/Fiber authority
acrAgentControl       provider-neutral agent worker control (from AGENT_CONTROL_SURFACE_CORDIS_DESIGN)
acrControlProtocol    host-neutral local control endpoint and capability negotiation
```

Each service is a replaceable capability. The TUI host, Desktop routes, and Web routes are consumers; none import a concrete provider.

### 2. Provides and consumes

Provides:

- `acrProfileOwnership` - acquire, release, verify, attach endpoint, recovery;
- `acrRuntimeArchitecture` - bounded generation-scoped snapshots;
- `acrPluginLifecycle` - enable, disable, mount, unmount, reload receipts;
- `acrAgentControl` - attach, dispatch, snapshot over ACRYL worker identity;
- `acrControlProtocol` - local endpoint, generation negotiation, capability set;
- typed events `acryl/host-status`, `acryl/ownership-changed`, `acryl/operation-settled`, `acryl/agent-runtime-status`.

Consumes (required via `inject`):

- `acrProfileOwnership` requires launcher-provided profile authority;
- `acrRuntimeArchitecture` requires `ctx.registry`/`ctx.loader` projection surfaces;
- `acrPluginLifecycle` requires `ctx.loader` and the profile persistence bootstrap;
- `acrAgentControl` requires `ctx.agents`, `ctx.sessions`, and `ctx.subagents` where applicable;
- `acrControlProtocol` requires the ownership service.

Optional (`ctx.get()`):

- `ctx.commands` for human shortcuts;
- `ctx.clientModules` for Host-side presentation graph membership;
- `ctx.approval` for interactive approval flow (falls back to policy when absent).

### 3. Effects and disposal

- The lease store owns its platform lock/handle/heartbeat timer inside one `ctx.effect()`; release awaits quiescence.
- Architecture projection owns any watchers/subscriptions it creates and unsubscribes on unload; it caches nothing across activation episodes.
- Lifecycle operations never retain a Fiber or Loader Entry across an await without revalidating its identity; each mutation awaits settlement.
- The control protocol endpoint (socket, named pipe, or loopback HTTP server) is created inside one effect and closed on unload; connections are tracked and aborted on disposal.
- Agent adapters own every process, connection, stream reader, and subscription; provider removal terminates them and removes registrations.
- TUI contributions (screens, commands, keybindings, status, renderers) and any raw renderer resources (subscriptions, timers) are owned by the contributing Fiber; the renderer itself is disposed on host shutdown.

### 4. Configuration and composition

- Stable Loader row ids, e.g. `acryl-ownership`, `acryl-architecture`, `acryl-lifecycle`, `acryl-agent-control`, `acryl-control-protocol`.
- Runtime schemas are exported (`Config: Schema<Config>`) and validated before activation.
- `disabled` and `!!js` expressions are used only where a deployment value genuinely varies and must fail before half-activation.
- The terminal presentation plugin is independently disableable; when disabled, normal TUI contributions disappear and only narrow recovery commands remain.
- Provider replacement unloads and reactivates consumers without stale references or duplicate registrations.

### 5. Events and durability

- `acryl/host-status` - `emit`, synchronous observation of host/owner mode changes.
- `acryl/ownership-changed` - `emit`, notification that a profile's writable owner changed.
- `acryl/operation-settled` - `emit`, durable/reconcilable mutation settled with receipt.
- `acryl/agent-runtime-status` - `emit`, adapter observation.
- No waterfall is introduced unless a policy plugin genuinely needs to wrap or veto a dispatch; any such observer calls `next()`.
- Durable facts remain Harness session events and profile/lease state. Live events are coordination only.

### 6. Verification

For each service: real Loader/export activation, not hand-built plugin objects; PENDING with missing provider; provider appears and disappears; replacement with no stale references; disposal with no leaked timers, sockets, listeners, processes, or registrations; repeated mount/unmount cycles equal baseline. Control protocol tests cover origin/auth rejection, malformed/oversized bodies, unknown capabilities, and generation mismatch. Agent adapters test capability rejection, cancellation, identity separation, and structured-result acceptance. TUI tests cover contribution registration/removal, renderer lifecycle, and deterministic command output.

### 7. Direct Harness session bridge

`acryl` prepares a normal DSH profile whose default bundle is
`@deepseek-ai/dsh-base`, then boots its Loader tree in the same Cordis root
that owns the ACRYL lease and control services. The profile's `cordis.yml` is
the standard empty patch root: bundle and user patches remain the configuration
source of truth. ACRYL must not create a second root Context or duplicate the
session log.

A DSH-native ACRYL provider owns every `AgentHandle` it creates or resumes
through `ctx.agents`. It maps the shared agent/session id to the ACRYL worker
binding, submits identified user messages through the agent inbox, and derives
TUI transcript, tool, approval, and job cards from the durable session stream
and native services. It does not infer semantic history from terminal bytes.
Its single owning effect disposes active handles in order, allowing the agent
loop to flush final session events before live registry removal.

The TUI composer dispatches only to this provider. When no model route is
configured by the selected DSH profile, it displays the reported runtime error
and preserves the durable session history rather than fabricating a reply.

## Delivery sequence

1. `acryl-control` service definitions and profile ownership lease (direct mode identity).
2. Architecture and lifecycle control services, extracted from Desktop controllers behind host-neutral interfaces.
3. Control protocol and attach mode with generation negotiation.
4. `acryl-tui` OpenTUI host with direct/attach/recovery modes and canonical CLI grammar.
5. Agent orchestration surface reusing `ctx.agents`/`ctx.subagents` and adding provider adapters.
6. Installation/Market control and candidate promotion with HOT/WARM/COLD classification.
7. Cross-platform packaging, `acryl-gui`/`acryl-web` convenience launchers, and full verification.

## Testing

- Run-once `node --test`/Vitest per workspace; no watch/interactive modes.
- Headless Loader/profile smokes with keyless fixtures.
- Ownership race simulation (100 concurrent acquire attempts, exactly one owner).
- Provider removal/replacement 20-cycle leak checks.
- CLI grammar and JSON envelope contract tests.
- Full `corepack yarn check` and bilingual/architecture/layout gates preserved.

## Specification coverage

Every `spec.md` FR-001..FR-030 maps to a service, contract, or slice above; `tasks.md` expands each into bite-sized, dependency-ordered steps with exact file paths.
