# Feature Specification: ACRYL Shared Harness Runtime

**Feature Directory**: `specs/019-acryl-harness-runtime`  
**Created**: 2026-08-26  
**Status**: Draft  
**Input**: Make the standalone `acryl` terminal host use the pinned DeepSeek Harness agent and durable-session runtime without depending on the Electron Desktop package or duplicating Harness state.

## Objective

Give every ACRYL presentation host one reliable way to start the same configured Harness profile. A terminal user must be able to open a real durable agent workspace, while Desktop and future Web hosts can reuse the same runtime boundary without owning separate copies of profile boot logic or plugin dependencies.

## User Scenarios & Testing

### User Story 1 - Start a standalone durable agent workspace (Priority: P1)

As an ACRYL user, I can run `acryl` and enter a workspace backed by a real Harness profile, rather than a static terminal placeholder.

**Why this priority**: A standalone ACRYL host has no product value if it cannot access the canonical agent and session runtime.

**Independent Test**: Boot an isolated ACRYL profile, verify that its live runtime exposes agent and session capabilities, then shut it down cleanly.

**Acceptance Scenarios**:

1. **Given** an absent ACRYL profile, **When** a user starts the terminal host, **Then** the system initializes a usable profile without overwriting user configuration.
2. **Given** a configured ACRYL profile, **When** the terminal host starts, **Then** the host and Harness runtime share one lifecycle root and expose durable session and agent capabilities.
3. **Given** profile startup fails, **When** initialization stops, **Then** no partial profile owner or live runtime remains.

---

### User Story 2 - Reuse one runtime across presentation hosts (Priority: P2)

As an ACRYL operator, I can use terminal and Desktop presentation without either host depending on the other for Harness startup.

**Why this priority**: Presentation must not determine agent-runtime ownership or create an Electron dependency for the terminal product.

**Independent Test**: A host-specific adapter can invoke the shared runtime boundary and receive the same profile identity and lifecycle contract.

**Acceptance Scenarios**:

1. **Given** terminal and Desktop hosts, **When** each initializes the same named profile in its permitted ownership mode, **Then** both use the shared profile-runtime contract.
2. **Given** a host is disposed, **When** its shared runtime is released, **Then** the runtime performs one ordered shutdown without host-specific orphaned resources.

## Edge Cases

- A profile already has a user patch or settings file.
- A required Harness package cannot be resolved from the runtime closure.
- A second host attempts to acquire an already owned profile.
- A model route is absent or invalid after the runtime starts.
- Profile activation fails after ownership has been acquired.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide one host-neutral boundary to initialize and dispose an ACRYL Harness profile.
- **FR-002**: The shared runtime MUST use the pinned Harness profile composition and must not modify the upstream submodule.
- **FR-003**: The shared runtime MUST expose its live root context to the owning host so host control services and Harness capabilities share one lifecycle.
- **FR-004**: The shared runtime MUST preserve a profile's user-managed configuration while preparing its generated root configuration.
- **FR-005**: The terminal host MUST use the shared runtime rather than depending on `dsh-plugin-desktop` for Harness boot.
- **FR-006**: A startup failure MUST dispose every partially created runtime contribution and release profile ownership.
- **FR-007**: The runtime package MUST own the complete compatible dependency closure required by its declared profile composition.
- **FR-008**: The follow-on native agent bridge MUST create, resume, and project only durable Harness sessions; it MUST NOT use terminal scrollback as agent history.

### Key Entities

- **ACRYL Harness Runtime**: The host-neutral owner of profile preparation and the live Harness root lifecycle.
- **ACRYL Profile**: A named, user-configurable Harness composition with durable settings and session storage.
- **Host Prepare Hook**: The controlled pre-profile activation hook where an owning host contributes its lease and control services to the shared root.
- **Native Agent Bridge**: The later adapter that maps ACRYL worker commands to live Harness agents and durable sessions.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A fresh isolated profile reaches a ready agent/session runtime in one command without manual package repair.
- **SC-002**: Repeating startup and shutdown ten times leaves no active profile owner, listener, or runtime process from prior runs.
- **SC-003**: A terminal user reaches an interactive, durable-agent-backed workspace without launching Electron.
- **SC-004**: Terminal and Desktop runtime boot behavior is explained by one shared contract rather than divergent host implementations.

## Assumptions

- The pinned Harness revision remains the authoritative source of profile and session behavior.
- User model credentials and route selection remain normal Harness profile configuration.
- The shared runtime is a repository-owned workspace, not a modification to the upstream Harness checkout.
- GUI and Web presentation migration is outside this milestone except for consuming the shared boot contract.
