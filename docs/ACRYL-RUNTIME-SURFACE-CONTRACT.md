# ACRYL Runtime and Surface Contract

**Status**: Current product decision
**Date**: 2026-08-28

## Decision

ACRYL implements coding-agent behavior once in the ACRYL Runtime. CLI/TUI,
Electron, and Web are surfaces that invoke and render the same runtime
semantics. They do not own copied agent loops, session mutations, plugin
lifecycle logic, or durable state.

The ACRYL Runtime is the repository-owned composition of DeepSeek Harness,
Cordis, and ACRYL plugins. It owns durable sessions, agent turns, tools,
models, permissions, plugins, context, and emitted domain events.

## Surface adapters

The common semantic API has surface-appropriate transports:

```text
TUI      - direct TypeScript adapter in the launched runtime process
Electron - existing DeepSeek Harness IPC/API adapter
Web      - existing DeepSeek Harness HTTP/WebSocket adapter
```

A feature is implemented once as a runtime capability with typed request,
result, and durable event records. A surface may add a command, panel, or view,
but it invokes that runtime capability rather than reimplementing it.

Dynamic ACRYL plugins load into the runtime. They may contribute capabilities,
commands, events, and declared TUI, Electron, or Web presentation slots.

## Current delivery model

Each launched surface starts a normal local DSH/Cordis runtime. Durable DSH
sessions provide continuity across launches and surfaces: a user can exit one
surface and resume the same session from another.

The first terminal surface adopts the complete user-facing behavior of
`tomowang/dsh-tui` at commit
`f7663341f604c3ad96e9b2b838a7ca2de8e84fd1` (`@tomowang/dsh-tui` 0.7.0,
MIT, pi-tui 0.84.2). ACRYL adapts its terminal presentation to the shared
runtime semantics without shipping the upstream direct-Cordis bundle unchanged.

## Explicit non-goals

ACRYL does not currently require a detached control daemon, cross-process
owner discovery, attachment credentials, active-controller leases, heartbeats,
generation fencing, or a recovery protocol for competing live controllers.

It also does not currently require RLM, Fleet, model routing, a side-Git
journal, context-compute services, or a separate evidence runtime. Those are
future proposals, not current product subsystems.

## Future threshold

Reconsider a lightweight `acryl serve` process only when a real user story
requires simultaneous live surfaces, a runtime that continues after every UI
closes, remote control, or long-running background workers.

That future design starts with an OpenCode-style local server: one runtime,
ordinary command serialization, and event streaming to clients. It must not
introduce controller leases or distributed fencing unless demonstrated
conflicting-write behavior requires them.
