---
date:
  created: "2026-09-02"
  completed: ""
  last-activity: "2026-09-02"
---

# Implement ACP transport in acryl-control for Devin integration

## Branch

Create a feature branch `feat/acp-transport` from `main` for this work. The
fork's `origin` is `git@github-l:levonk/acryl.git` and `upstream` is
`https://github.com/acryldev/acryl.git`. The PR will target `upstream` (acryldev/acryl).

The repo's AGENTS.md says "work directly on `main` unless the user explicitly
requests a branch or pull request" — this work is explicitly destined for an
upstream PR, so a feature branch is warranted. Filed upstream issue about this
convention sabotaging third-party contributors: https://github.com/acryldev/acryl/issues/6

## Summary

The user wants Devin usable from the acryl TUI via `devin acp`. A prior session
shipped a subpar integration using DSH's `dsh-subagent-acp` package (a
model-facing subagent tool), which bypassed the intended architecture. The
correct plan is to implement an `AgentTransport` in `acryl-control` that speaks
ACP JSON-RPC to `devin acp` and wires into the existing `AcrAgentControlService`
(`ctx.acrAgentControl`).

## What was done (wrong approach — keep or revert?)

Four commits landed on `main` ahead of `origin/main`:

1. `3132bc1` — feat(acp): add acryl ACP server for Devin Desktop integration
   - Adds `acryl acp` subcommand (Direction B: acryl as ACP server inside Devin
     Desktop). This is correct and useful — it lets Devin Desktop launch acryl
     as an ACP agent.
2. `f0bb3bc` — docs: log acryl ACP server for Devin Desktop integration
3. `256e287` — feat(tui): add Devin subagent via ACP for TUI
   - Adds a `devin` agent preset with `tool-subagent-devin` using
     `dsh-subagent-acp`. This is the SUBPAR approach the user flagged. It uses
     `ctx.subagents` (DSH's subagent delegation seam) instead of
     `ctx.acrAgentControl` (acryl's own agent control surface).
4. `a78e4b7` — docs: log Devin subagent via ACP for TUI

**Decision needed:** Keep commit `256e287` as a stopgap, or revert it before
implementing the correct approach? The user said "so what you did was subpar?"
and agreed it should be done properly. Recommend reverting `256e287` and
`a78e4b7` before starting the correct implementation, since the
`dsh-subagent-acp` approach and the `acrAgentControl` approach are different
service seams and would conflict.

Commits `3132bc1` and `f0bb3bc` (Direction B: acryl as ACP server) are
unrelated to this task and should be kept.

## The correct plan

### Existing scaffolding (already built — do NOT recreate)

1. `AcrAgentControlService` — implemented in `acryl-control/src/agent-control.ts`
   with `registerProvider`, `attach`, `dispatch`, `snapshot`, capability
   checking, and identity collision detection.
2. An `acp` provider kind declared in `acryl-control/src/agent/capabilities.ts`
   with `structured` fidelity and capabilities: `agent.start`, `agent.stop`,
   `agent.send`, `agent.cancel`, `agent.resume`, `agent.snapshot`,
   `output.structured`, `tool.calls`.
3. An `acpProvider()` plugin factory in
   `acryl-control/src/agent/providers/acp.ts` — currently an 8-line stub that
   delegates to `createProviderPlugin`, and the factory's `execute` throws
   `transport-unavailable` when no transport is wired (see `factory.ts:50-58`).

### What to build

#### 1. ACP client transport (the one real piece of work — ~300-500 lines)

Create `acryl-control/src/agent/providers/acp-transport.ts` that:

- Spawns `devin acp` as a child process via `ctx.subprocess` (the DSH Cordis
  service for subprocess lifecycle — do NOT use raw `child_process` per
  AGENTS.md rules about fiber-owned resources).
- Speaks JSON-RPC 2.0 over the child's stdin/stdout. A lightweight JSON-RPC
  frame handler (newline-delimited JSON, request/response by `id`,
  notification handling for `session/update`).
- Maps `AgentCommand` kinds to ACP methods:
  - `start` → `initialize` (negotiate protocol version + capabilities), then
    `authenticate` if the agent requires it, then `session/new` (with `cwd`
    from `AgentWorkspace`). Store the returned `sessionId` as the
    `ProviderSessionRef`.
  - `resume` → `initialize` + `authenticate`, then `session/load` or
    `session/resume` (Devin advertises which it supports via `loadSession` /
    `sessionCapabilities.resume` in the `initialize` response).
  - `send` → `session/prompt` with the user text. Stream `session/update`
    notifications into ACRYL's durable event log as `assistant/message`,
    `tool/call`, `tool/result` events (the projection shape already exists in
    `session-bridge.ts`'s `transcript()` and `tools()` functions — see
    `session-bridge.ts:55-89`).
  - `cancel` → `session/cancel` notification.
  - `stop` → `session/close` (if Devin advertises `sessionCapabilities.close`)
    or kill the subprocess.
- Handles `session/request_permission` from Devin by routing to ACRYL's
  `ctx.approval` waterfall (the design doc at
  `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` explicitly says to reuse
  the Harness approval system, not build a parallel one).
- Owns the subprocess lifetime in a `ctx.effect()` disposer that kills the
  process and drains stdio on fiber unload.

#### 2. Wire the transport into the provider

Change `acpProvider()` to accept and inject the transport:

```ts
export function acpProvider(transport: AgentTransport) {
  return createProviderPlugin({ kind: 'acp', transport })
}
```

Currently `transport` is optional and the factory throws `transport-unavailable`
without it. Pass the real ACP transport instance.

#### 3. A Cordis plugin that composes the transport + provider into the profile

A Loader row that registers the ACP provider with `ctx.acrAgentControl`. This
follows the same pattern as the existing `dsh-native`, `codex`, and `claude`
provider plugins. The plugin's `apply()` calls
`ctx.acrAgentControl.registerProvider(ctx, provider)` inside a `ctx.effect()`.

#### 4. Configuration schema

Per the AGENTS.md Cordis protocol, a Standard Schema or Schemastery `Config`
schema that validates: the `devin` binary path (default: resolved from PATH),
optional `--model` and `--agent-type` flags, and credential source
(`WINDSURF_API_KEY` env vs. `devin auth login` store). Invalid configs fail
loudly before activation.

#### 5. Tests (mandatory per the design doc)

The `AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` verification requirements
(lines 184-200) require: real Loader activation, PENDING/reactivation, provider
removal + teardown, HMR/reload with no stale resources, capability rejection,
idempotent disposal + process quiescence, and identity separation. For the ACP
transport specifically, also want a mock ACP server (JSON-RPC over a fake stdio
pair) to test the protocol mapping without real Devin credentials.

#### 6. Normalize session-bridge.ts

`session-bridge.ts` in `acryl-harness-runtime` is currently hardcoded to the
DSH-native agent path (`ctx.agents.create` / `resume`). To make an ACP-backed
worker drivable from the TUI/Desktop surfaces, the bridge (or a parallel
bridge) needs to route through `ctx.acrAgentControl.dispatch()` instead of
`ctx.agents` directly when the worker is an ACP provider. This is part of M2/M4
— normalizing the surface-to-runtime path so it's provider-neutral.

## What you do NOT need to build

- A new ACP protocol implementation — `devin acp` already speaks the full
  protocol. You're writing a client, not a server.
- A new event store — ACRYL's `ctx.sessions` `SessionEvent` log is the
  canonical store. You project ACP `session/update` notifications into it.
- A new approval/permission system — route `session/request_permission` to
  `ctx.approval`.
- A new subprocess/PTY manager — use `ctx.subprocess` / `ctx.terminals`.
- A new provider registry — `AcrAgentControlService` already implements it.

## Required reading

- `AGENTS.md` (repo root) — repository rules, Cordis development protocol
- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` — the design doc with
  verification requirements (lines 184-200)
- `docs/cordis/cordis_system_guide_for_coding_agents.md` — Cordis patterns
- `acryl-control/src/agent-control.ts` — `AcrAgentControlService`
- `acryl-control/src/agent/capabilities.ts` — `acp` provider kind declaration
- `acryl-control/src/agent/providers/acp.ts` — `acpProvider()` stub
- `acryl-control/src/agent/providers/factory.ts` — `createProviderPlugin` and
  the `transport-unavailable` throw (lines 50-58)
- `acryl-harness-runtime/src/session-bridge.ts` — hardcoded DSH-native path
  (`transcript()` and `tools()` functions, lines 55-89)
- `ACRYL-ROADMAP.md` lines 160-171 — Milestone M4

## Devin ACP reference

- Binary: `/usr/local/bin/devin` (version `devin 3000.2.17`)
- ACP invocation: `devin acp [--model <model>] [--agent-type <type>]`
- Credentials: `WINDSURF_API_KEY` env or `devin auth login` store
- Protocol: JSON-RPC 2.0 over stdin/stdout (newline-delimited)
- Methods: `initialize`, `authenticate`, `session/new`, `session/load`
  (resume), `session/prompt`, `session/cancel`, `session/update` notifications,
  slash commands, `session/request_permission`
- Docs: `commands.mdx` lines 295-330

## Task list

- [ ] Decide: revert commits `256e287` and `a78e4b7` (subpar subagent approach)
- [ ] Read required files: `acryl-control/src/agent-control.ts`,
      `acryl-control/src/agent/providers/acp.ts`, `factory.ts`,
      `capabilities.ts`, `session-bridge.ts`,
      `AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`
- [ ] Implement `acp-transport.ts` — ACP JSON-RPC client transport
- [ ] Wire transport into `acpProvider()` factory
- [ ] Create Loader row / Cordis plugin that registers the ACP provider
- [ ] Add configuration schema (Schemastery `Config`)
- [ ] Normalize `session-bridge.ts` for provider-neutral routing
- [ ] Write tests: mock ACP server, protocol mapping, Loader activation,
      PENDING/reactivation, disposal, capability rejection
- [ ] Typecheck and test
- [ ] Commit implementation
- [ ] Update `docs/DEVELOPMENT-LOG.md` (separate commit)

## Definition of done

- `devin acp` subprocess is spawned via `ctx.subprocess` (not raw
  `child_process`)
- `AgentCommand` kinds map to ACP methods correctly
- `session/update` notifications project into ACRYL's `SessionEvent` log
- `session/request_permission` routes to `ctx.approval`
- Subprocess lifetime owned by `ctx.effect()` disposer
- Tests pass with mock ACP server (no real Devin credentials needed)
- Provider registers via `ctx.acrAgentControl.registerProvider()`
- `session-bridge.ts` routes through `acrAgentControl.dispatch()` for ACP
  providers
- Typecheck and tests pass
- Working tree clean

## Suggested skills

- `git-repository-management` — for reverting the subpar commits
- `code-review-guidance` — for reviewing the transport implementation
- `unit-test-writing` — for the mock ACP server tests
