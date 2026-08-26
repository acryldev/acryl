# Feature Specification: ACR-1 - ACR Cordis plugin + project/room identity + durable state

**Feature Branch**: `002-acr-1-plugin-identity`
**Created**: 2026-08-23
**Status**: Draft
**Input**: Orientation spec §26-§31; constitution v1.0.0; gap analysis §2.1 (`ctx.acrRoom` is one of the three genuine ACR seams). User directive: build the multi-agent foundation (room + provider seam) before handoff, accounts, and self-evolution.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a persistent project room (Priority: P1)

A developer opens ACR, creates (or reopens) a project room for a folder, and gets a stable room identity that stays the same across agent sessions and app restarts. The room, not any single agent, owns the project's working context.

**Why this priority**: This is the substrate every later ACR capability (providers, handoff, accounts, self-evolution) attaches to. Without a durable room, "agents come and go, work continues" is impossible.

**Independent Test**: In a headless test, create a room for a temp directory, capture its identity, dispose the app generation, start a new one, reopen the same directory, and assert the room identity and recorded state are unchanged.

**Acceptance Scenarios**:

1. **Given** a folder without a room, **When** the user opens it in ACR, **Then** a room is created with a stable identity bound to that folder.
2. **Given** an existing room, **When** the user reopens the same folder after a restart, **Then** the same room identity and state are restored.
3. **Given** a room, **When** the user opens a different folder, **Then** a different room identity is used (rooms are per project).

---

### User Story 2 - Room events survive restart (Priority: P1)

Everything that happens in a room is recorded as durable, ordered events. After a crash or restart, the full sequence is replayable, so no agent's transcript is the source of truth.

**Why this priority**: This implements the constitution's "canonical state is durable and agent-independent" law. It is the foundation for projections, handoff, and traces.

**Independent Test**: Append a known sequence of room events, dispose the generation, start a new one, and assert the events replay in the original order with no loss.

**Acceptance Scenarios**:

1. **Given** a room, **When** a meaningful action occurs (message, agent joined, task created), **Then** a durable event is appended in order.
2. **Given** events recorded in a room, **When** the app restarts, **Then** the full event sequence replays unchanged.
3. **Given** a room, **When** two events are appended in quick succession, **Then** they retain a total order.

---

### User Story 3 - The room outlives its agents (Priority: P2)

An agent (native or external, added in a later slice) can join and leave a room. The room and its durable state are unaffected by which agent is currently active.

**Why this priority**: This is the ACR inversion - agents are disposable actors, the room is the persistent scene. It is the acceptance test for room identity being agent-independent.

**Independent Test**: Create a room, register a placeholder member handle, remove it, and assert the room identity and prior events are unchanged.

**Acceptance Scenarios**:

1. **Given** a room with recorded events, **When** an agent member joins and later leaves, **Then** the room identity and prior events are unchanged.
2. **Given** a room, **When** all agent members have left, **Then** the room remains openable and its events remain replayable.

---

### Edge Cases

- First launch with no prior room state: room creation is idempotent and calm.
- Reopening a folder whose room state was deleted: ACR re-creates or reports cleanly, never half-opens.
- Disabling/unloading the ACR room plugin: durable state on disk is not deleted; re-enabling restores it.
- Two app instances opening the same folder: behavior is defined (single-writer or explicit conflict), not silent corruption.
- Partial write during a crash: the durable log tolerates an incomplete final record without losing earlier events.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: ACR MUST present project rooms as an activatable plugin surface, not a hardwired core path; the room plugin can be enabled and disabled independently.
- **FR-002**: Each room MUST have a stable, agent-independent identity bound to its project folder that survives restarts.
- **FR-003**: Opening the same folder MUST resolve to the same room identity.
- **FR-004**: A room MUST maintain a durable, append-only, totally ordered event log.
- **FR-005**: The durable event log MUST be replayable in order after restart, independent of any single agent's transcript.
- **FR-006**: Disabling or unloading the room plugin MUST NOT destroy durable room state.
- **FR-007**: Room behavior MUST be verifiable headlessly without launching a GUI.
- **FR-008**: A room MUST be able to hold heterogeneous member handles (native or external agents) as peers, without being owned by any one member. Identity only; provider behavior is ACR-2.

### Key Entities *(include if feature involves data)*

- **Room**: persistent project identity for one folder; owns the durable event log and a roster of member handles.
- **RoomEvent**: an ordered durable record of a meaningful room action (created, member joined/left, message, task, etc.) with type, timestamp, and author.
- **RoomMember**: a handle describing a participant (agent or human) attached to the room; provider-backed in ACR-2.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reopening a folder after a full restart restores the same room identity in 100% of tests.
- **SC-002**: 100% of recorded room events replay in order after restart with zero loss.
- **SC-003**: Disabling and re-enabling the room plugin leaves durable state intact.
- **SC-004**: A room can be created and reopened headlessly without a GUI.

## Assumptions

- The room is the ACR product layer on top of DSH, not a new event store. It composes DSH session/persistence seams; it does not duplicate them.
- Durable room state lives in the project's own portable store (per the `.allagent/` philosophy), not only in ephemeral runtime memory.
- A room is per-folder for this slice; cross-folder/workspace federation is out of scope.
- The DSH-native agent and external PTY agents attach to the room in ACR-2; this slice only establishes identity, durable state, and a member-handle shape.

## Notes

- Gap analysis §2.1 identifies `ctx.acrRoom` as one of the three genuine ACR seams (identity independent of any single agent/session). This spec is that seam.
- Constitution Law II ("agents are disposable; the room is persistent") and Law IV ("canonical state is durable and agent-independent") are the governing constraints.
