# ACRYL Constitution

This constitution governs every spec, plan, task, and plugin written in this
repository. It is the executable policy for Spec Kit, Wayfinder, and Matt
Pocock SDD. If a later document conflicts with this file, this file wins until
it is deliberately amended.

## Core Principles

### I. Everything is a plugin

ACRYL is not a monolith. Product behavior is expressed as Cordis plugins that
provide named services, declare `inject` requirements, emit typed events, and
register reversible effects. Core product functionality may itself be plugins.
Do not add a privileged kernel path when a neighboring plugin can sit on a
documented seam.

### II. Agents are disposable; the room is persistent

Agent sessions come and go. Project / room context does not. ACRYL owns
continuity. Claude, Codex, OpenCode, Pi, Gemini, Goose, and DSH-native loops
are actors, not owners. Never encode an agent-name switch where a capability
seam would work.

### III. Compose DeepSeek Harness; do not fork it

`deepseek-harness/` is a pinned, read-only upstream submodule. Desktop and ACRYL
work lives outside it. Reuse existing DSH seams (`ctx.sessions`, `ctx.agents`,
`ctx.subagents`, `ctx.terminals`, `ctx.agentTeams`, `ctx.dynamicCordisRunner`,
`ctx.approval`) before inventing ACRYL twins. If a seam is insufficient, write a
CORE EXTENSION PROPOSAL. Do not silently mutate DSH/Cordis semantics.

### IV. Canonical state is durable and agent-independent

Model-visible means logged. Agent-visible means relayable. The source of truth
is a durable event stream plus artifacts. Model history is a projection
(`deriveMessages()` and later provider-specific projections). Live Cordis
events are for coordination and interception, not the only record of facts
that must survive restart.

### V. Generated capabilities live outside the kernel

Self-extension produces versioned capability packages (manifest, logic, UI
projection, permissions, tests, provenance). It is not "edit production source
and hope". Classify every mutation as HOT (plugin remount), WARM (generation
restart), or COLD (native/executable swap). Evolution proposes; tests gate;
policy/human approves. Self-extension and self-evolution are different systems.

## Cordis Authoring Laws

1. Define the capability contract before the implementation.
2. Depend on service keys (`inject`), never concrete providers.
3. Every plugin-lifetime resource has a disposer. No hidden globals.
4. Use services for calls; events for observation/interception. Waterfall
   observers MUST call `next()`.
5. Choose scope deliberately: root, workspace, room, agent, session.
6. Stable composition IDs. Typed config. Fail loud before half-activation.
7. Generated plugins are independently testable, least-privilege, and
   rollbackable.
8. Never assume load order.

## Desktop / repository constraints

- Outer workspace is PNPM 11.8.0 (`node-linker=isolated`). Upstream remains an
  independent PNPM workspace.
- Use `corepack pnpm` for owned packages. Never `npm install` or an unpinned
  package-manager command.
- `dsh-plugin-desktop/` owns Electron Host/Client faces. Public desktop
  services are `desktopProfiles` and `desktopPnpm` only.
- Compatibility mode must keep the upstream default client. Advanced
  presentation is a profile composition, not a second plugin system.
- Builds, typechecks, unit tests, and Loader smokes stay headless-safe.
- Submodule pin updates are separate commits from desktop/ACRYL behavior.

## Development workflow

1. Wayfinder decides (research / grill / prototype) until the route is clear.
2. Spec Kit specifies (`spec.md`), plans (`plan.md`), and tasks (`tasks.md`)
   inside `specs/<NNN-slug>/`.
3. Implement only the current vertical slice. Prefer a walking skeleton.
4. Tests cover lifecycle (mount, inject, dispose, no leaks) as well as
   function.
5. Architecture catalogs should be source-derived when practical.

## Governance

This constitution supersedes informal chat decisions. Amendments require:

- an entry in `docs/acryl/ACRYL_DECISIONS.md` (context, alternatives, decision,
  evidence, consequences);
- an updated constitution version line;
- a note in the active Wayfinder map if the destination or scope changes.

Complexity must be justified against an existing DSH/Cordis primitive.

**Version**: 1.0.0 | **Ratified**: 2026-08-23 | **Last Amended**: 2026-08-23
