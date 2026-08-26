# Feature Specification: ACRYL-2 - External PTY agent provider as a room peer

**Feature Branch**: `003-acryl-2-pty-provider`
**Created**: 2026-08-23
**Status**: Draft
**Input**: Orientation spec §5-§6, §10.1; constitution v1.0.0 Law II; gap analysis §2.2. User directive: full multi-agent functionality (provider seam before handoff and accounts).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Available agents are discovered, not hardcoded (Priority: P1)

The list of coding agents a developer can run in the room is supplied by active provider plugins. Disabling a provider removes that agent; enabling (or adding) one makes it appear, without changing core code.

**Why this priority**: This is the "everything is a plugin" law applied to agents. It converts the current hardcoded agent allowlist into a capability seam and proves agents are swappable.

**Independent Test**: In a headless test, register two mock providers, assert both appear in the discovered list; remove one, assert it disappears and the other remains.

**Acceptance Scenarios**:

1. **Given** active agent providers, **When** the surface lists available agents, **Then** only agents with an active provider appear.
2. **Given** a provider is disabled, **When** the surface lists agents, **Then** that agent is absent.
3. **Given** a new provider is enabled, **When** the surface lists agents, **Then** the new agent appears without a rebuild.

---

### User Story 2 - Run an external coding agent as a room member (Priority: P1)

A developer launches an external coding agent (Claude Code, Codex, OpenCode, Pi, Gemini, etc.) inside the room. It runs as a native terminal process, streams input/output, and is tracked as a room member with a status.

**Why this priority**: Native PTY is the defining ACRYL capability from the orientation spec (§6). This proves external agents are first-class, not subprocess hacks hidden in the UI.

**Independent Test**: With a mock spawner, start a provider, assert a room member/session is created with a stable identity and running status, write input, read output, stop it, and assert the member is removed cleanly.

**Acceptance Scenarios**:

1. **Given** an available agent, **When** the developer starts it in the room, **Then** a room member with a stable identity is created and input/output stream to the canvas surface.
2. **Given** a running agent, **When** the developer stops it, **Then** the process terminates and the member is removed with no leak.
3. **Given** a running agent, **When** the room plugin unloads, **Then** every agent session it owns is disposed.

---

### User Story 3 - Missing or broken agents fail cleanly (Priority: P2)

If an agent's underlying binary is not installed or fails to start, the developer sees a clear, immediate error rather than a hanging or half-running session.

**Why this priority**: A real agent roster spans many CLIs the user may not have installed. Graceful failure is what keeps the surface calm and trustworthy.

**Independent Test**: Register a provider whose spawn fails, start it, and assert the surface reports an error and no session/member remains.

**Acceptance Scenarios**:

1. **Given** an agent whose binary is missing, **When** the developer starts it, **Then** a clear error appears and no session is left behind.
2. **Given** a provider whose detection reports unavailable, **When** the surface lists agents, **Then** that agent is marked unavailable rather than silently spawnable.

---

### Edge Cases

- Rapid start/stop of the same agent must not leak processes or leave ghost members.
- Provider unload while an agent is running must dispose the process before the provider disappears.
- A generation restart (mode switch) must dispose all agent sessions owned by the previous generation.
- Spawn failure mid-start must clean up partial state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Coding agents MUST be represented as provider plugins registered on a shared seam; the core MUST NOT encode an agent-name switch or a hardcoded allowlist.
- **FR-002**: The set of available agents MUST be discovered from active providers at runtime.
- **FR-003**: A provider MUST declare how to detect availability, spawn, stream, and stop its agent.
- **FR-004**: A running agent MUST be tracked as a room member with a stable identity and lifecycle status.
- **FR-005**: Stopping an agent or unloading its provider MUST dispose the underlying process with no leaks.
- **FR-006**: A missing or failing binary MUST produce a clear error and leave no partial session.
- **FR-007**: Provider registration MUST be independently testable with a mock spawner (no real process in unit tests).
- **FR-008**: The existing Development Canvas "+" surface MUST consume the provider seam rather than a hardcoded list.

### Key Entities *(include if feature involves data)*

- **AgentProvider**: a plugin exposing one coding agent (id, label, availability detection, spawn/stream/stop).
- **AgentSession**: a running instance bound to a room, with stable identity, provider id, and status.
- **AgentDescriptor**: the discovered summary (id, label, available) a surface renders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Adding or removing an agent is achievable by enabling/disabling a provider, with no change to core code.
- **SC-002**: 100% of agent sessions are disposed when their provider or the room unloads (no leaked processes or listeners).
- **SC-003**: A missing binary is reported as a clear error in 100% of cases, with no hanging session.
- **SC-004**: The full provider lifecycle (discover, spawn, stream, stop, unload) is covered headlessly with mock spawners.

## Assumptions

- External agents run as native PTY processes (the approach already proven by the Development Canvas), not as DSH-native subagents. The published DSH runtime does not ship external agent backends; ACRYL owns the provider seam.
- The DSH-native loop becomes a provider in a later slice; this slice establishes the external PTY provider contract.
- Each provider is independently activatable and disableable inside `dsh-plugin-desktop` (or a future neighboring package).

## Notes

- Elevates the canvas's hardcoded `CANVAS_PTY_COMMAND_IDS` / `planCanvasPtyCommand` into a first-class provider seam, satisfying constitution Law II ("never encode an agent-name switch where a capability seam would work").
- Gap analysis §2.2: external agents must be room peers, not child-of-agent; this spec is the peer seam. Handoff between peers is ACRYL-3 (next).
