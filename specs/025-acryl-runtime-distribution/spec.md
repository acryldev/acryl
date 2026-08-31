# Feature Specification: ACRYL Runtime and Distribution Milestone

**Feature Branch**: `025-acryl-runtime-distribution`

**Created**: 2026-08-31

**Status**: Approved milestone

**Input**: Reduce accidental release payload, make the shared ACRYL runtime boundary real across terminal, Web, and Desktop surfaces, prepare safe plugin distribution, and introduce an attachable local runtime only after the new boundaries are proven.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install a lean terminal agent (Priority: P1)

As a terminal-first user, I can install or extract a target-specific ACRYL CLI that starts the normal durable coding-agent session without downloading or carrying browser UI, Marketplace installation machinery, foreign-platform native binaries, release source maps, or development-only files.

**Why this priority**: Every user receives the CLI payload. It is the immediate size, startup, updater, and attack-surface improvement while retaining the current product behavior.

**Independent Test**: Build each available local target archive, inspect its payload, and run `acryl --version` and `acryl tui --json` with no host Node runtime.

**Acceptance Scenarios**:

1. **Given** a terminal-only archive for one operating-system/CPU target, **When** a user extracts it with no host Node installation, **Then** its launcher starts the terminal readiness probe and contains no foreign operating-system/CPU native packages.
2. **Given** a production CLI archive, **When** its contents are inspected, **Then** it contains no production source maps, test fixtures, declarations, or publication-only library entry that are not needed at runtime.
3. **Given** the existing authorization-enabled terminal profile, **When** a user starts the terminal surface, **Then** its durable-session, login, tool, and cancellation behavior remains available.

---

### User Story 2 - Add only the surface and capabilities I use (Priority: P2)

As an ACRYL user, I can use the terminal, Web, Desktop, Marketplace, and Development Canvas without unrelated surfaces being mandatory dependencies of the terminal agent.

**Why this priority**: A plugin-native product needs intentional capability boundaries. The base coding agent must remain small while optional features remain installable, composable, and compatible.

**Independent Test**: Install the terminal product without optional Web or plugin-management bundles, boot a durable session, then install/enable each optional bundle and verify its own surface without changing terminal behavior.

**Acceptance Scenarios**:

1. **Given** a terminal-only installation, **When** the user starts `acryl tui`, **Then** it does not require Web UI, Marketplace package management, or Desktop-only extensions.
2. **Given** a user requests the Web surface, **When** its optional feature is present, **Then** it serves the same durable ACRYL runtime semantics as the terminal surface.
3. **Given** a user enables package installation, **When** the plugin-management capability is present, **Then** it alone owns package-manager execution, lockfile mutation, health checking, rollback, and cleanup.
4. **Given** a capability is absent, **When** a surface requests it, **Then** ACRYL gives an actionable install/enable response and never silently substitutes unrelated behavior.

---

### User Story 3 - Receive identical agent behavior through every surface (Priority: P3)

As a user moving between terminal, browser, and Desktop, I get the same session, plugin, profile, and lifecycle semantics without the surfaces maintaining competing agent runtimes or copied boot logic.

**Why this priority**: Shared behavior makes multi-surface ACRYL maintainable and is necessary before an external plugin ecosystem can depend on stable contracts.

**Independent Test**: Exercise the same fixture session and plugin/profile operation through the direct terminal adapter and the Web/Desktop transport, and assert equivalent durable results and cleanup.

**Acceptance Scenarios**:

1. **Given** a configured profile, **When** terminal, Web, or Desktop starts it, **Then** one shared host-composition contract applies common profile validation, patch ordering, boot, and disposal behavior.
2. **Given** a durable session, **When** it is opened through direct and remote surface transports, **Then** transcript, tool activity, prompt submission, cancellation, and failure semantics are equivalent.
3. **Given** a Desktop startup recovery condition, **When** the shared runtime composition is used, **Then** Desktop-specific recovery, native windows, diagnostics, and package operations remain owned by Desktop rather than the common runtime.

---

### User Story 4 - Keep work running while changing surfaces (Priority: P4)

As an advanced user, I can explicitly start one local ACRYL runtime and attach a terminal, browser, or Desktop surface to it without losing durable work when a client exits.

**Why this priority**: Persistent local runtime ownership enables future multi-surface and long-running work, but only after the core and transport contracts are stable.

**Independent Test**: Start a local runtime, attach a terminal client, begin a fixture operation, detach the client, attach another supported surface, and verify the operation/session remains available and orderly shutdown cleans all resources.

**Acceptance Scenarios**:

1. **Given** no running local runtime, **When** a user explicitly starts one, **Then** ACRYL reports an authenticated loopback endpoint and its owner process.
2. **Given** a compatible running local runtime, **When** a supported client attaches, **Then** the client uses its documented API/event transport instead of creating a competing root.
3. **Given** an incompatible runtime version, **When** a client tries to attach, **Then** it fails clearly and does not mutate or terminate the running process.
4. **Given** all clients disconnect, **When** the user has not requested persistence, **Then** the runtime follows its documented shutdown policy and disposes every owned resource.

### Edge Cases

- A package archive built on one platform must not contain another platform's native executable or dynamic library.
- Payload pruning must retain license notices, runtime-loaded assets, target-native modules, and all files required for Node module resolution.
- A missing optional feature must not make `acryl tui --json` fail or cause a partial runtime boot.
- Profile configuration can enable or disable a capability while a process is active; Cordis lifecycle ownership must unload its routes, registrations, processes, and subscriptions before reactivation.
- Desktop may require a Web host internally, but that does not make Web dependencies mandatory for the standalone terminal distribution.
- Attach protocol failure, stale endpoint records, duplicate starts, and client exit must not corrupt durable sessions or leave orphaned processes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: ACRYL MUST define one core runtime contract for durable sessions, agent behavior, tools, profile composition, plugin lifecycle, and domain events.
- **FR-002**: Terminal, Web, and Desktop surfaces MUST invoke the core runtime contract rather than independently implementing agent loops, session mutation semantics, or common profile boot logic.
- **FR-003**: The terminal distribution MUST contain only terminal-required runtime capabilities and target-required native dependencies.
- **FR-004**: Web hosting/client capability, Marketplace/package-management capability, Development Canvas capability, and Desktop-native capability MUST be independently composable and absent from the terminal distribution unless explicitly requested.
- **FR-005**: Package-manager execution, dependency installation, lockfile mutation, package health validation, recovery, and rollback MUST have one owning plugin-management capability.
- **FR-006**: Release artifacts MUST reject foreign operating-system/CPU native payloads and must exclude release source maps and development-only files unless a documented runtime requirement justifies them.
- **FR-007**: Desktop release artifacts MUST include only supported application localizations and target-required native payloads, while retaining all Desktop runtime behavior.
- **FR-008**: ACRYL MUST retain the v0.1.17 authorization-enabled TUI, durable session, tool, cancellation, and resume behavior throughout each phase.
- **FR-009**: Shared host composition MUST provide a stable surface-neutral boot/dispose interface, while Desktop retains ownership of Electron lifecycle, recovery, diagnostics, native dialogs, updater, and platform package-manager adapters.
- **FR-010**: Direct in-process and remote surface transports MUST implement one documented session/client capability contract without exposing raw Cordis roots to external clients.
- **FR-011**: Dynamic capability packages MUST declare their compatibility, requested permissions, host/client contributions, provenance, and lifecycle owner before activation.
- **FR-012**: ACRYL MUST support an explicit local runtime server only after phases 1 through 3 pass their compatibility and lifecycle gates.
- **FR-013**: The local runtime server MUST use loopback-only authenticated transport, version compatibility checks, ordered shutdown, and durable-session preservation.
- **FR-014**: New dependencies and packaging rules MUST be owned by explicit profile/capability packages rather than inferred from a maximal deployed workspace closure.
- **FR-015**: Every phase MUST add automated payload, boot, lifecycle, and regression verification before removing the preceding implementation path.

### Key Entities

- **Runtime Capability**: A versioned, independently composable ACRYL behavior with declared dependencies, permissions, lifecycle owner, and optional surface contributions.
- **Surface Adapter**: A terminal, Web, or Desktop presentation/transport that invokes runtime capabilities without owning duplicated domain semantics.
- **Runtime Composition**: The ordered profile and capability selection used to create one Cordis root for a requested surface.
- **Artifact Manifest**: The inspected release payload inventory, including platform, architecture, permitted native files, excluded classes, byte budget, and verification result.
- **Runtime Endpoint**: An authenticated loopback address plus version and owner metadata used by an explicitly attachable local runtime.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every target-specific terminal archive passes its no-host-runtime readiness probe and contains zero foreign-platform native package directories.
- **SC-002**: The terminal artifact's installed runtime payload is reduced by at least 20% from the v0.1.17 measured baseline without losing terminal session, login, tool, cancellation, or resume acceptance coverage.
- **SC-003**: The Desktop ARM64 release payload removes all foreign platform-native payloads, release source maps, and unsupported language resources, with a measured compressed artifact reduction of at least 20% from the recorded baseline when comparable inputs are used.
- **SC-004**: Terminal-only installation starts a durable coding session without Web, Marketplace, or Desktop-only capability packages present.
- **SC-005**: Equivalent fixture session operations through direct and remote transports produce the same durable event sequence and terminal outcome.
- **SC-006**: An explicitly started local runtime survives one supported client detach/reattach cycle and shuts down with no leaked owned process, socket, route, subscription, or temporary endpoint record.

## Assumptions

- The five current release targets remain macOS ARM64, macOS x64, Linux ARM64, Linux x64, and Windows x64.
- Desktop continues to use Electron; its Chromium framework cost is not an artifact-pruning target.
- DeepSeek Harness remains pinned and unmodified; ACRYL composes its documented Cordis and DSH seams.
- The current direct TUI launch remains supported until the optional local runtime server is delivered and demonstrated compatible.
- The initial ACRYL registry is curated metadata, not a claim of universal review, sandboxing, or automatic trusted publication.
- The milestone may add tasks as evidence uncovers required migration work, but no phase may bypass its documented verification gate.
