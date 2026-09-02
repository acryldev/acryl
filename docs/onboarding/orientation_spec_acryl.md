# ACRYL Orientation for Coding Agents

**Project:** ACRYL - Agent Context Relay Yielding Lifecycles

**Repository:** <https://github.com/acryldev/acryl>

**Website:** <https://acryl.dev>

**Status snapshot:** 2026-08-30, public foundation v0.1.9

This is the entry point for a coding agent joining ACRYL. It explains the
product thesis, the runtime model, what exists today, what remains planned, and
how to make changes without creating a second architecture beside Cordis.

This file is an orientation, not a complete API reference. Follow its links to
the owning specifications and source before implementation.

## 1. Mission

ACRYL is a local-first, agent-agnostic Agentic Development Environment and
continuity layer for software work.

```text
One persistent development environment.
One persistent project context.
Any coding agent.
Agents may come and go.
The work continues.
```

The project does not belong to Claude Code, Codex, OpenCode, Pi, Gemini CLI,
DeepSeek, or any other agent. ACRYL owns the persistent project, room, context,
tasks, artifacts, identities, and handoffs. Agent sessions are replaceable
workers entering and leaving the same development scene.

```text
Same project
Same context
Same work
Different agents
```

ACRYL must remain capable of operating agents that do not know ACRYL exists.
Native Harness agents, ACP agents, structured protocol adapters, and ordinary
PTY/CLI tools are all valid execution classes. Provider capabilities, not agent
names, determine what ACRYL may safely do with each runtime.

## 2. Source-of-truth hierarchy

When documents disagree, use this order:

1. [`AGENTS.md`](../../AGENTS.md) for repository operating rules.
2. [The ACRYL constitution](../../.specify/memory/constitution.md) for product
   and architecture law.
3. The active feature's `spec.md`, `plan.md`, `tasks.md`, contracts, and evidence
   under [`specs/`](../../specs/).
4. [The Cordis system guide](../cordis/cordis_system_guide_for_coding_agents.md)
   and the pinned `deepseek-harness/` documentation and package source for
   runtime behavior.
5. [The agent control-surface constraints](../acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md)
   and [current alignment audit](../cordis/acryl_cordis_alignment_audit.md) for
   ACRYL-specific Cordis decisions.
6. Owning package types, source, Loader composition, and tests.
7. This orientation and the root README as maps of the current product.

The pinned local Harness revision is authoritative over generic Cordis examples
or newer public Harness documentation. Chat history is not architecture.
Record durable decisions in the repository.

## 3. The runtime model

ACRYL continues key architecture from DeepSeek Harness while remaining an
independent product:

```text
ACRYL product surfaces
        |
        +-- Desktop
        +-- TUI / CLI
        +-- explicit local Web surface
        |
ACRYL-owned capabilities and compositions
        |
DeepSeek Harness capability substrate
        |
Cordis lifecycle and composition runtime
        |
Node.js / Electron / operating system
```

The architectural rule is composition over duplication:

- Cordis owns plugin lifecycle, services, injection, effects, events, Fibers,
  scopes, configuration, Loader reconciliation, and HMR.
- Harness provides reusable agent-runtime semantics such as sessions, agents,
  tools, LLMs, prompts, subprocesses, PTYs, filesystems, sandboxing, approvals,
  jobs, and Web composition.
- ACRYL provides the product identity and the missing continuity, control,
  context-relay, workspace, and multi-surface capabilities.
- Electron is a host adapter and presentation boundary, not a second plugin
  runtime.

`deepseek-harness/` is a pinned, read-only upstream submodule. Reuse it through
published capability seams and explicit patches. Update its pin deliberately;
do not edit its source from an ACRYL feature branch.

## 4. Cordis laws for every implementation

The product is a plugin tree. Every practical capability must fit that model.

1. **Plugin equals lifecycle unit.** Use a plugin when behavior needs independent
   activation, configuration, replacement, or cleanup.
2. **Context equals scoped capability environment.** Resolve capabilities from
   `ctx`, not hidden globals.
3. **`inject` equals live dependency contract.** Required consumers enter
   `PENDING` when a provider is absent and reactivate when the provider returns
   or changes.
4. **Registration equals ownership.** Cordis-managed registrations belong to
   their Fiber. Acquire raw timers, watchers, sockets, PTYs, subprocesses,
   routes, and subscriptions inside one owning `ctx.effect()` and return full,
   idempotent cleanup.
5. **Services are for direct operations.** Events are for open observation or
   deliberate interception. A waterfall observer calls `next()` unless it is
   intentionally vetoing or replacing downstream behavior.
6. **Loader configuration is desired composition.** Use stable row IDs,
   validated runtime config, and explicit scopes. YAML order is not dependency
   order.
7. **Provider replacement is normal.** Consumers depend on stable interfaces,
   never concrete providers. Do not retain provider references beyond an
   activation episode.
8. **Durable facts are not live events.** Model-visible or replay-critical facts
   belong in durable session or ACRYL room state. Live Cordis events coordinate
   the current process.
9. **A Tool is a consumer.** A model-facing Tool injects `tools`, registers via
   `defineTool(...)`, returns canonical typed values separately from rendering,
   honors cancellation, traverses policy, and disappears on unload.
10. **Cordis isolation is not an OS sandbox.** Security authority comes from
    explicit permission, process, filesystem, sandbox, and host boundaries.

Current Fiber states are `PENDING`, `LOADING`, `ACTIVE`, `FAILED`, `UNLOADING`,
and `DISPOSED`. Missing dependencies are a valid `PENDING` state, not a startup
race to hide with sleeps or retries.

## 5. Canonical state and context relay

ACRYL follows these laws:

```text
MODEL-VISIBLE MEANS LOGGED.
AGENT-VISIBLE MEANS RELAYABLE.
```

The canonical project state is not any vendor's native chat. It must be
reconstructable from durable events and artifacts. Agent prompts and histories
are projections from that state.

```text
canonical room/session events + tasks + decisions + artifacts + workspace state
                                  |
                         context compiler
                                  |
                 provider-specific, budgeted packet
                                  |
                     target agent or runtime
```

A PTY transcript is useful evidence, but raw terminal output is not canonical
semantic history. Sending bytes to a PTY proves delivery only. It does not prove
that the target understood, accepted, or persisted the context.

Keep identities separate:

- presentation identity, such as a Canvas tab;
- canonical ACRYL worker identity;
- one live runtime/process identity;
- provider-scoped session reference;
- transport-private PTY handle.

A provider session reference may support resume. It never becomes the owner of
room history or task state.

## 6. What exists now

ACRYL is in active early development, but it is no longer only a bootstrap
proposal.

### 6.1 Public product surfaces

- **Desktop:** `acryl-desktop` owns the Electron bootstrap, Cordis Host and
  Client faces, native adapters, profile management, packaging, and Desktop UI.
- **Terminal:** `acryl-tui` owns the canonical `acryl` command and terminal
  experience.
- **Local Web:** `acryl web` starts an explicit local Web runtime. It is not a
  hosted cloud service and does not run implicitly.
- **npm:** `npm install -g acryl` is the canonical CLI installation path. The
  public package is `acryl`; internal workspace package names are implementation
  details.
- **Release:** v0.1.9 is the current public release snapshot. Desktop and CLI
  distribution are separate so installing one does not silently install or
  start another surface.

### 6.2 Cordis-owned application composition

- `acryl-control` provides host-neutral ACRYL control-plane capabilities.
- `acryl-harness-runtime` integrates ACRYL behavior with Harness capability
  seams while remaining outside the pinned upstream checkout.
- `acryl-desktop` composes Host and Client behavior through Cordis rather than
  a parallel Electron plugin system.
- `acryl-development-canvas` is a standalone Host/Client plugin contributing
  the Development Canvas through a stable Loader row and owned lifecycle.
- `dsh-community-market` is an optional private Host/Client Market provider,
  disabled by default and composed through normal Cordis, profile, and Desktop
  service contracts.
- `dsh-community-fabric` remains a private interoperability RFC scaffold. It is
  not a loadable runtime or a second plugin framework.

### 6.3 Development Canvas and terminals

The Development Canvas is the emerging primary workspace surface. It currently
supports real terminal-backed work and is designed to host agent sessions,
files/editors, browser views, and future capability-provided tools.

Its PTY lifecycle, Host routes, Client slot contribution, terminal handles, and
cleanup are Cordis-owned and tested. The current brand-oriented agent command
catalog remains transitional. Do not promote Canvas command names or PTY IDs
into the canonical provider, identity, relay, or resume model.

### 6.4 Lifecycle control and reload

ACRYL has progressed from restart-oriented experiments to in-place plugin
lifecycle control. Plugin changes should reconcile through the owning Cordis
Fiber and Loader generation where the capability permits HOT replacement.
Binary, native ABI, signing, preload, or Electron-host changes may still require
WARM generation restart or COLD application replacement.

Classify mutations explicitly:

- **HOT:** plugin remount or provider replacement in the live process;
- **WARM:** controlled Host/Web generation restart;
- **COLD:** executable, native module, entitlement, installer, or host swap.

### 6.5 Distribution foundation

The repository has an npm CLI, Desktop installers, portable CLI archive work,
checksum generation, and a release matrix designed to verify targets before
publication. The current release-foundation status and remaining authoritative
matrix work are tracked in [`docs/RELEASE-FOUNDATION-HANDOFF.md`](../RELEASE-FOUNDATION-HANDOFF.md).
Do not describe a target as proven merely because configuration for it exists.

## 7. What is still being built

Do not confuse architecture direction with shipped functionality.

The durable cross-agent room, canonical ACRYL event stream, complete handoff
workflow, provider-neutral `acrAgentControl` seam, ACP provider, multi-agent
room, context engine, checkpoints, Continuous Mode, generated capability
pipeline, and evidence-driven evolution remain staged work across
[`specs/`](../../specs/).

In particular:

- Development Canvas is a working terminal/UI foundation, not yet the complete
  agent-agnostic control surface.
- PTY is the universal low-fidelity fallback, not proof of structured messages,
  tool events, acknowledgement, or resume.
- The planned room must resolve ownership between Harness durable sessions and
  any ACRYL-owned room projection before implementation.
- ACRYL should reuse Harness sessions, subagents, Agent Teams, terminals,
  subprocesses, sandbox, approvals, and dynamic composition wherever their
  contracts fit.
- Generated executable capabilities require versioning, provenance,
  least-privilege permissions, tests, approval, and rollback. Decorative
  generated UI alone is not a capability.
- Self-extension and self-evolution are separate. Evolution proposes candidates;
  tests and evaluations gate them; policy or a human approves adoption.

The roadmap stubs are destinations, not authorization to implement every layer
at once. Work only on the active vertical slice.

## 8. Repository map

```text
acryl-control/              Host-neutral control-plane capabilities
acryl-harness-runtime/      ACRYL integration with Harness runtime seams
acryl-tui/                  Canonical terminal client and `acryl` command
acryl-desktop/              Electron, Host/Client composition, native UI, release
acryl-development-canvas/   Composable workspace and PTY surface
dsh-community-market/       Optional private Market provider
dsh-community-fabric/       Interoperability RFC scaffold only
deepseek-harness/           Pinned read-only upstream submodule
docs/acryl/                 ACRYL architecture constraints and analysis
docs/cordis/                Operational Cordis guidance and audits
specs/                      Feature truth: specification, plan, tasks, evidence
.agents/notes/              Implemented architecture and process records
```

The outer repository is a PNPM 11.8.0 workspace. Use `corepack pnpm` for owned
packages. The pinned Harness submodule remains its own independent upstream
workspace and is entered only through the root `upstream:*` wrappers.

## 9. Required onboarding sequence

Before changing code:

1. Read [`AGENTS.md`](../../AGENTS.md) and the
   [constitution](../../.specify/memory/constitution.md).
2. Read this orientation and the root [`README.md`](../../README.md).
3. Read the active feature's complete `spec.md`, `plan.md`, `tasks.md`,
   contracts, research, and evidence.
4. For any plugin, service, provider, Tool, route, event, Client contribution,
   or Loader change, read the complete
   [Cordis system guide](../cordis/cordis_system_guide_for_coding_agents.md).
5. Inspect the owning pinned Harness subsystem documentation, package types,
   source, and tests. Reuse before inventing.
6. For agent-runtime, Canvas, context-relay, or third-party adapter work, read
   [the control-surface design](../acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md)
   and [alignment audit](../cordis/acryl_cordis_alignment_audit.md).
7. Inspect current git status and recent commits. Preserve concurrent work and
   never edit the pinned submodule from a product feature.
8. Write the six-part Cordis mini-design in the active plan before
   implementation:
   - capability and plugin boundary;
   - provides and consumes;
   - effects and disposal;
   - configuration and composition;
   - events and durability;
   - verification under PENDING, replacement, reload, and disposal.
9. Implement the smallest end-to-end vertical slice and keep each package
   boundary aligned with its owning capability.
10. Verify the real Loader composition and lifecycle, not only isolated helper
    functions.

## 10. Verification standard

Use run-once checks. Inspect scripts before invoking them.

For an ordinary root change, the available progression is:

```sh
corepack pnpm typecheck
corepack pnpm test
corepack pnpm verify
corepack pnpm check
```

Use the narrowest relevant checks during development and the complete applicable
gate before handoff. Packaging, release, and platform work must also run their
own package-specific verification.

For a Cordis capability, completion requires evidence for:

- real Loader activation;
- valid `PENDING` behavior when a required service is absent;
- reactivation when that service appears;
- provider replacement without stale references;
- full disposal and quiescence of owned resources;
- repeated mount/reload without duplicate registrations or leaks;
- cancellation of in-flight work;
- durable handling of replay-critical facts;
- honest degradation when a transport has lower fidelity.

Passing a startup test is not sufficient.

## 11. Development and release boundaries

- Use `corepack pnpm`, not npm, to install or run the repository workspace.
  `npm install -g acryl` is for consumers of the published CLI.
- Keep build, typecheck, test, and Loader smoke paths headless-safe. Launch the
  graphical app only through explicit development or lifecycle commands.
- The isolated Desktop development entrypoint is `corepack pnpm dev` or
  `corepack pnpm dev:local`; it uses `~/.dsh-acryl` and separate Electron user
  data.
- Commit coherent implementation checkpoints promptly. A release behavior
  commit and its `docs/DEVELOPMENT-LOG.md` record are separate checkpoints.
- Keep submodule pin updates separate from ACRYL behavior changes.
- Treat signing, notarization, credentials, and npm browser authentication as
  explicit human-controlled release boundaries.
- Publish only verified artifacts. Configuration or an uploaded file is not
  evidence that an install works.

## 12. Architectural laws

Preserve these unless source evidence and an explicit decision amend them:

1. ACRYL owns continuity. Agents perform work.
2. Agent sessions are disposable. Project and room context are persistent.
3. Canonical state is durable and agent-independent.
4. Agent-specific context is a projection.
5. Prefer Cordis composition over Harness core modification.
6. Reuse Harness capabilities before creating ACRYL twins.
7. Generated capabilities live outside the stable kernel.
8. Generated executable code receives explicit, least-privilege authority.
9. Generated UI controls real capabilities through trusted host seams.
10. Everything generated is versioned, reproducible, testable, and auditable.
11. Self-extension and self-evolution remain separate systems.
12. Evolution proposes; evaluation gates; policy or a human approves.
13. Capability truth replaces agent-name branching.
14. If an extension contract is insufficient, propose the smallest new seam.
15. Keep the kernel intentionally boring.
16. Preserve the ability to run agents that do not know ACRYL exists.

## 13. How to leave the project better

A completed coding-agent contribution should leave:

- source and tests in the owning package;
- lifecycle and replacement evidence;
- updated active spec artifacts when scope or contracts changed;
- an explicit decision record for foundational choices;
- an accurate development-log entry tied to the implementation commit;
- no hidden architecture in private chat;
- no stale resources, duplicate registrations, or accidental edits to
  concurrent work.

Optimize for proving the product thesis, not for maximizing code volume:

```text
ACRYL starts small.
The user works.
Missing capabilities become explicit.
Agents build versioned capabilities through stable seams.
Cordis activates and can withdraw them.
The environment grows around real workflows.
The kernel remains small, understandable, and stable.
```
