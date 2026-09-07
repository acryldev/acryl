# Feature Specification: ACRYL Hybrid Engine

**Feature Branch**: `029-acryl-hybrid-engine`
**Created**: 2026-09-07
**Status**: Draft
**Milestone**: M9 - Interchangeable harness engine
**Depends on**: `specs/028-harness-engine-swap/`
**Input**: User description: "DSH + Pi combo is a hybrid engine that internally composes their loops, tools, and session behavior, adding or removing the features of either runtime."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run one hybrid coding session (Priority: P1)

A terminal user selects the `hybrid` engine for an ACRYL profile and completes a
coding turn through one coherent session. The user sees one continuous account
of the turn, including the active engine capabilities, model output, tool work,
and any goal, plan, or trajectory activity made available by the composition.

**Why this priority**: This proves that the hybrid is a real engine rather than
two separately launched agents or a presentation-only integration.

**Independent Test**: Start a profile with the hybrid engine, submit one prompt
that uses one Pi-provided and one DSH-provided capability, and verify that the
same ACRYL session displays the complete ordered result.

**Acceptance Scenarios**:

1. **Given** an authenticated profile whose hybrid composition is available,
   **When** a user launches `acryl tui` with the hybrid engine and submits a
   prompt, **Then** the user can complete one turn without selecting or
   coordinating two separate agents.
2. **Given** a hybrid session, **When** a capability is used during a turn,
   **Then** the surface identifies the capability and its source as DSH, Pi, or
   hybrid while retaining one session and worker identity.
3. **Given** a requested capability is absent from the declared composition,
   **When** the user or agent requests it, **Then** the request fails clearly
   before a partial or duplicate action occurs.

---

### User Story 2 - Preserve ACRYL continuity while composing capabilities (Priority: P2)

A developer can continue work started by a DSH-only or Pi-only engine in the
hybrid engine. Prior context, tasks, decisions, and ordered work history remain
visible, while new hybrid work appends to the same ACRYL-owned record.

**Why this priority**: Engine composability is useful only if it preserves the
continuity that makes ACRYL independent of any one agent runtime.

**Independent Test**: Create history under each single engine, open it under
the hybrid engine, complete a hybrid turn, and verify that all three episodes
are visible in their original order.

**Acceptance Scenarios**:

1. **Given** an ACRYL session with DSH-created work, **When** it is opened by
   the hybrid engine, **Then** its durable context remains visible before new
   hybrid work begins.
2. **Given** an ACRYL session with Pi-created work, **When** it is opened by
   the hybrid engine, **Then** its durable context remains visible before new
   hybrid work begins.
3. **Given** a completed hybrid turn, **When** the user later opens the same
   session with either single engine, **Then** the hybrid turn remains visible
   as durable ACRYL history with its source provenance.

---

### User Story 3 - Change or stop the hybrid without leftovers (Priority: P3)

An operator can replace or stop the hybrid engine using the same lifecycle
operation as another engine. Active work is settled safely, and no duplicate
tools, background work, approvals, subscriptions, or runtime handles remain.

**Why this priority**: The value of composition depends on being able to remove
one composition without damaging the rest of the profile.

**Independent Test**: Start an in-flight hybrid turn, replace the engine, and
verify cancellation, a clean unavailable interval for dependent behavior, and
one cleanly activated replacement with no surviving hybrid contribution.

**Acceptance Scenarios**:

1. **Given** an active hybrid turn, **When** the hybrid engine is replaced or
   stopped, **Then** the user receives a clear settled or cancelled outcome and
   no new hybrid action begins afterward.
2. **Given** the hybrid engine is removed, **When** a consumer needs the engine,
   **Then** it is unavailable until a valid replacement is active rather than
   using a stale DSH or Pi reference.
3. **Given** a hybrid engine is activated, removed, and activated again,
   **Then** each advertised capability appears exactly once.

### Edge Cases

- DSH and Pi both advertise an equivalent capability: the declared hybrid
  composition chooses one owner, or activation fails before either can act.
- One constituent capability fails during startup: the hybrid engine is not
  presented as usable and leaves no partial session or visible capability.
- A capability is removed while a turn is in progress: the turn reaches a
  documented cancellation or failure outcome; its already-recorded facts stay
  visible.
- A hybrid event cannot be represented with full fidelity by a single engine:
  the durable record preserves its source and fidelity rather than silently
  presenting it as native to the other engine.
- A user attempts to treat an engine-native private session identifier as the
  ACRYL session identity: the request is rejected or mapped explicitly; it
  never changes the canonical ACRYL identity.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose `hybrid` as one selectable agent engine
  after its DSH and Pi composition has activated successfully.
- **FR-002**: The hybrid engine MUST present one coherent session, worker, turn,
  cancellation path, and durable ordered history to ACRYL surfaces.
- **FR-003**: Each capability advertised by a hybrid composition MUST have one
  declared owner: DSH, Pi, or the hybrid coordinator. Conflicting ownership
  MUST fail before the composition becomes active.
- **FR-004**: The hybrid engine MUST make its declared capability set and the
  provenance of each observed capability available to every surface through the
  engine-neutral ACRYL interface.
- **FR-005**: The hybrid engine MUST preserve ACRYL-owned room context, task
  artifacts, decisions, session identity, and durable work history across
  selection of DSH-only, Pi-only, and hybrid engines.
- **FR-006**: A hybrid engine MUST record new work in the ACRYL durable record
  with sufficient provenance to distinguish DSH-derived, Pi-derived, and
  hybrid-derived facts. Native runtime transcripts remain projections.
- **FR-007**: A requested feature that the active hybrid composition does not
  declare MUST fail clearly without falling back silently to a similarly named
  feature from the other constituent engine.
- **FR-008**: The initial hybrid composition MUST support a declared DSH
  contribution for existing trajectory, goal, plan, approval, and governed tool
  behavior, and a declared Pi contribution for its agent-loop behavior. A
  capability may be excluded only when the composition says so explicitly.
- **FR-009**: The hybrid engine MUST use the same profile selection and
  lifecycle behavior as the selectable single engines, including a clean
  unavailable interval for dependent behavior during replacement.
- **FR-010**: Stopping, replacing, or failed activation of the hybrid engine
  MUST leave no live hybrid-owned processes, sessions, timers, subscriptions,
  tool registrations, approvals, or captured references.
- **FR-011**: The system MUST reject a hybrid composition that would create two
  independent lifecycle authorities, two competing durable writers, or two
  concurrent owners for one turn, tool call, approval, or cancellation decision.
- **FR-012**: The first hybrid delivery MUST use a fixed, documented composition
  profile. It MUST NOT claim arbitrary feature-by-feature mixing or automatic
  conflict resolution beyond the capabilities it verifies.

### Key Entities

- **Hybrid engine**: One selectable ACRYL engine that coordinates a declared
  composition of DSH and Pi capabilities for one runtime episode.
- **Hybrid composition profile**: The named, validated set of capabilities,
  owners, and compatibility rules that defines one hybrid engine behavior.
- **Capability provenance**: The durable indication that a capability or fact
  came from DSH, Pi, or hybrid coordination, including its available fidelity.
- **Canonical ACRYL session**: The engine-independent identity and ordered
  durable record that persists while engines and their private session
  references change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete an end-to-end hybrid coding turn using one
  declared DSH capability and one declared Pi capability without launching or
  selecting a second agent session.
- **SC-002**: In acceptance testing, 100% of hybrid capabilities displayed to a
  user report exactly one declared owner and source provenance.
- **SC-003**: In lifecycle acceptance testing, 100% of hybrid resources are
  absent after a stop, failed activation, or replacement; repeated activation
  produces no duplicate visible capability.
- **SC-004**: A session containing DSH-only, Pi-only, and hybrid work remains
  readable in chronological order after switching among all three engine modes.
- **SC-005**: Every unsupported or ownership-conflicting capability request in
  the declared initial composition fails before it creates a partial action.

## Assumptions

- `specs/028-harness-engine-swap/` supplies the engine-neutral surface contract,
  selectable single engines, and engine-independent continuity record before
  hybrid implementation starts.
- ACRYL retains one lifecycle/composition authority and one canonical durable
  writer per profile; embedded Pi behavior is a constituent capability, not an
  additional ACRYL runtime owner.
- The first hybrid profile is deliberately narrow. Expanding its capability
  matrix is a later independently specified feature after its initial lifecycle
  and continuity proof succeeds.
- Existing DSH command experiences such as trajectory, goal, and plan remain
  user-visible only when the active hybrid profile explicitly declares and
  validates them.

## Non-goals

- Replacing the single-engine DSH or Pi milestones, or duplicating their
  contract and selection work.
- Running two independent agent conversations and calling that a hybrid.
- Adopting a second lifecycle, dependency-injection, event, or canonical-state
  framework.
- Supporting every Pi extension, every DSH plugin, or arbitrary automatic
  feature mixing in the first hybrid profile.
- Editing the pinned `deepseek-harness/` checkout.
