# Agent Control Surface - Cordis Design Constraints

Status: architecture constraint, not an implementation claim

This document constrains the planned ACR control surface for coding agents in
the Development Canvas. ACR must integrate protocol-native and third-party
agents without creating a second plugin runtime beside Cordis or treating raw
terminal presentation as canonical agent context.

## Authoritative Cordis references

Development must follow the pinned documentation shipped with the exact
DeepSeek Harness revision used by this repository:

- `docs/cordis/cordis_system_guide_for_coding_agents.md` (repository-level
  operational guide and mandatory coding-agent workflow);
- `deepseek-harness/docs/cordis-primer.md`
- `deepseek-harness/docs/cordis-api/context.md`
- `deepseek-harness/docs/cordis-api/registry.md`
- `deepseek-harness/docs/cordis-api/fiber.md`
- `deepseek-harness/docs/cordis-tutorial/`
- `deepseek-harness/docs/user/develop/practice/index.md`
- `deepseek-harness/docs/user/develop/framework/service.md`

Published equivalents:

- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/>

The pinned local copy is authoritative when the public site and repository
revision differ.

## Required Cordis shape

The control surface follows the Harness three-role capability pattern.

### Service Definition

A stable Cordis service defines the provider-neutral agent-control interface,
request/result types, identities, capability vocabulary, and typed events. Its
working service name is `acrAgentControl`, chosen to avoid collision with the
Harness `agents` and `subagents` services.

The external interface should remain small and deep:

```ts
interface AcrAgentControl {
  attach(request: AttachAgentRequest): Promise<AgentSnapshot>
  dispatch(workerId: AcrWorkerId, command: AgentCommand): Promise<CommandReceipt>
  snapshot(scope: AgentScope): Promise<readonly AgentSnapshot[]>
}
```

Observation is delivered through typed Cordis events rather than a private
callback bus. Durable replay comes from the ACR room event store, not from a
second in-memory event history hidden in this service.

### Service Providers

Each adapter is a Cordis plugin that registers a provider with the service:

- ACP adapter;
- vendor SDK or API adapter;
- structured JSON/JSONL CLI adapter;
- PTY adapter as the universal lowest-fidelity fallback.

Providers depend on the Service Definition, not on Canvas or other consumers.
Provider registration is a reversible effect and must disappear when its
owning fiber unloads. An adapter declares and proves only capabilities it can
truthfully support.

### Consumers

Development Canvas, orchestration, handoff compilation, automation, and tests
consume `acrAgentControl` through `inject`. They depend on the Service
Definition and never import a concrete provider.

Canvas becomes a projection over Host-owned worker state. It binds a tab to an
ACR worker identity rather than directly treating a PTY id as an agent session.

## Identity model

The interface keeps presentation, ACR, runtime, and vendor identities separate:

- `CanvasTabId`: presentation identity and tab ordering;
- `AcrWorkerId`: canonical logical worker in the ACR room;
- `AgentRuntimeId`: one live process or protocol connection;
- `ProviderSessionRef`: adapter-scoped opaque vendor session reference;
- `CanvasPtySessionId`: transport-private PTY handle, not an agent identity.

Provider references may support resume but never become the source of truth for
room history or task state.

## Dependency and composition rules

- Compose the Service Definition, providers, and consumers as explicit Loader
  rows with stable entry ids.
- Do not rely on YAML row order. Required availability is expressed with
  `inject`; Cordis may start rows concurrently.
- A consumer that cannot function without the control service uses a required
  injection and naturally enters PENDING when it is absent.
- Truly optional integration is queried at the use site with `ctx.get()`.
- Use `ctx.isolate()` or Loader isolation only when two compositions genuinely
  need separate instances of the same service name.
- Use `ctx.plugin()` only for a real parent-child lifetime. Package-directory
  nesting does not imply a child plugin.
- Configuration must be validated before activation through an exported
  Standard Schema or Schemastery `Config` schema. Invalid capabilities,
  commands, providers, or resume requirements fail loudly.

## Lifecycle rules

Every external resource belongs to a Cordis fiber:

- processes and PTYs;
- ACP, SDK, JSON-RPC, and JSONL connections;
- stream readers and subscriptions;
- file watchers, timers, retry schedules, and heartbeats;
- adapter registrations and Host routes.

Acquire unmanaged resources inside `ctx.effect()` and return an idempotent
possibly asynchronous disposer that reaches quiescence. Cordis-managed
registrations use their existing effect ownership. If cleanup order matters,
perform the ordered awaits inside one disposer because separate asynchronous
disposers may run concurrently.

Removing a provider must make dependent behavior unavailable without stale
process handles, routes, listeners, registrations, or captured service
references. HMR must exercise the same unload/reload path as configuration
changes.

## Event rules

Events announce facts or provide deliberate interception seams. Direct
capability operations remain service methods.

Every event is declared through TypeScript declaration merging, namespaced, and
documents its dispatch mode. Examples:

- `acr-agent/runtime-status`: `emit`, synchronous observation;
- `acr-agent/observation`: `emit`, append/projection notification;
- `acr-agent/command`: only a `waterfall` if policy plugins genuinely need to
  wrap, replace, or veto command dispatch.

A waterfall observer must call `next()`. Returning without `next()` is an
intentional veto. Do not use event ordering as a substitute for a service
contract or a durable command transaction.

## Capability truth and context relay

Capability negotiation is explicit and generation-scoped. Unsupported
commands fail before dispatch. A PTY adapter may truthfully expose raw output,
byte input, resize, status, and termination, but it must not claim structured
messages, tool calls, provider history, acknowledgement, or resume unless an
additional verified protocol supplies them.

Normalized observations retain provenance:

- adapter and transport;
- native, derived, or opaque-terminal fidelity;
- provider sequence or session reference when available;
- mapper version;
- reference to preserved raw evidence when policy permits retention.

ACR context relay compiles a versioned packet from canonical room events,
tasks, decisions, artifacts, workspace state, and verified structured
observations. It may deliver that packet to any adapter. PTY delivery proves
only that bytes were sent, never that the target understood or adopted them.

## Relationship to existing Harness capabilities

Reuse the existing Harness `subagents` capability where its one-shot or
continuable-child semantics match the operation. Reuse its provider capability
and lifecycle patterns. Do not fork or edit the pinned upstream checkout.

An interactive Canvas worker has a different lifetime and ownership model from
a delegated subagent run, so do not force it into `SubagentProvider` when the
contracts disagree. Add an ACR-owned adjacent capability and compose existing
DSH providers behind adapters where possible. Propose a narrow upstream seam
only when measured integration proves one is missing.

## Verification requirements

Before calling an adapter supported, tests must cover:

- real Loader/export activation, not only manually constructed plugin objects;
- required-service PENDING and reactivation behavior;
- registration removal and dependent teardown on provider unload;
- HMR or equivalent restart with no stale resources;
- capability rejection and honest PTY degradation;
- idempotent async disposal and process/connection quiescence;
- identity separation and provider-session collision resistance;
- context-packet provenance and no promotion of terminal text to semantic
  history.

Before implementation, the active Spec Kit plan must also contain the
six-part Cordis mini-design required by `AGENTS.md`: boundary, provides/consumes,
effects/disposal, config/composition, events/durability, and lifecycle
verification. A feature description alone is not sufficient authorization to
create a new service seam.
