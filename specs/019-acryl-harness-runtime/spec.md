# Feature Specification: ACRYL Shared Harness Runtime

**Feature Directory**: `specs/019-acryl-harness-runtime`  
**Created**: 2026-08-26  
**Status**: Ready for planning
**Input**: Make the standalone `acryl` terminal host use the pinned DeepSeek Harness agent and durable-session runtime without depending on the Electron Desktop package or duplicating Harness state.

## Objective

Give every ACRYL presentation host one reliable way to start the same configured Harness profile. A terminal user must be able to open a real durable agent workspace, while Desktop and future Web hosts can reuse the same runtime boundary without owning separate copies of profile boot logic or plugin dependencies.

## Clarifications

### Session 2026-08-26

- Q: What happens when a healthy compatible owner already owns the requested profile? → A: The requesting surface attaches to that owner.
- Q: How does a standalone terminal choose its durable session at startup? → A: It always creates a new durable session.
- Q: How is local attachment authorized, and how does ACRYL handle agent-provider authentication? → A: Attachment requires an owner-issued local capability credential plus operating-system local endpoint permissions. Agent-provider authentication remains provider-managed profile or CLI authentication; ACRYL exposes status and re-authentication guidance but neither stores nor extracts provider secrets.
- Q: How do multiple authenticated attached surfaces submit agent actions? → A: Only the surface holding an explicit active-control lease can submit actions. Other attached surfaces receive live read-only projections until they acquire the lease.
- Q: What happens to an active-control lease when its surface becomes unavailable? → A: The runtime automatically releases it on disconnect, process death, or authenticated control-channel expiry. Another attached surface must explicitly acquire it; control is never silently transferred.

## User Scenarios & Testing

### User Story 1 - Start a standalone durable agent workspace (Priority: P1)

As an ACRYL user, I can run `acryl` and enter a workspace backed by a real Harness profile, rather than a static terminal placeholder.

**Why this priority**: A standalone ACRYL host has no product value if it cannot access the canonical agent and session runtime.

**Independent Test**: Boot an isolated ACRYL profile, verify that its live runtime exposes agent and session capabilities, then shut it down cleanly.

**Acceptance Scenarios**:

1. **Given** an absent ACRYL profile, **When** a user starts the terminal host, **Then** the system initializes a usable profile without overwriting user configuration.
2. **Given** a configured ACRYL profile, **When** the terminal host starts, **Then** the host and Harness runtime share one lifecycle root and expose durable session and agent capabilities.
3. **Given** profile startup fails, **When** initialization stops, **Then** no partial profile owner or live runtime remains.
4. **Given** a healthy compatible owner already owns the requested profile, **When** another ACRYL surface starts for it, **Then** it attaches rather than creating a second writable runtime.
5. **Given** no compatible owner owns the profile, **When** a user starts the standalone terminal, **Then** it creates a new durable session rather than automatically resuming an earlier session.

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
- A process reaches the local control endpoint without a valid current owner capability credential.
- A provider authentication session is absent, expired, or revoked.
- An attached surface attempts to submit an agent action without the active-control lease.
- The active-control surface disconnects, dies, or its authenticated control channel expires.

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
- **FR-009**: When a healthy compatible owner already owns the requested profile, a requesting surface MUST attach to it and MUST NOT create a second writable runtime.
- **FR-010**: When the standalone terminal becomes the profile owner, it MUST create a new durable session rather than automatically resuming an earlier session.
- **FR-011**: A surface attaching to an existing owner MUST authenticate with a current owner-issued local capability credential and an operating-system-permitted local control endpoint; the credential MUST be rotated when ownership generation changes and MUST NOT be logged.
- **FR-012**: Agent-provider authentication MUST remain provider-managed profile or CLI authentication. ACRYL MAY expose authentication status and re-authentication guidance but MUST NOT store, extract, or expose provider secrets.
- **FR-013**: The runtime MUST grant at most one explicit active-control lease at a time. Only that surface may submit agent actions; other authenticated attached surfaces MUST receive live read-only projections until they acquire the lease.
- **FR-014**: The runtime MUST automatically release the active-control lease when its surface disconnects, its process dies, or its authenticated control channel expires. It MUST NOT silently transfer control; another authenticated attached surface must explicitly acquire the lease.

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
