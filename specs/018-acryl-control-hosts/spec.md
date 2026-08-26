# Feature Specification: ACRYL Standalone Agent and Peer Hosts

**Feature Directory**: `specs/018-acryl-control-hosts`

**Created**: 2026-08-26

**Status**: Approved for planning

**Input**: Establish `acryl` as a standalone interactive agent and operational control surface, with ACRYL presented through three peer hosts: the default terminal interface, Electron GUI, and Web. Reuse the pinned DeepSeek Harness agent, trajectory, tools, sessions, and adapter seams rather than creating a second agent runtime.

## Objective

Make ACRYL fully operable without Electron while preserving one product philosophy and one authoritative runtime model across terminal, GUI, and Web surfaces. The terminal surface must support persistent agent work, coding-agent delegation, profile maintenance, plugin lifecycle control, architecture inspection, installation, updates, reloads, and recovery.

## User Scenarios & Testing

### User Story 1 - Run the standalone ACRYL agent (Priority: P1)

As an ACRYL user, I can run `acryl` from a terminal and enter a persistent interactive agent workspace without starting Electron or a browser.

**Why this priority**: This establishes ACRYL as an independently usable agent rather than a Desktop-only product or shell launcher.

**Independent Test**: Start `acryl` while no other ACRYL host is running, submit a coding task, observe its trajectory and tool activity, exit, restart, and resume the same durable session.

**Acceptance Scenarios**:

1. **Given** no ACRYL host owns the active profile, **When** the user runs `acryl`, **Then** ACRYL starts the terminal host for that profile and presents an interactive agent workspace.
2. **Given** an active terminal session, **When** the agent performs tool calls, **Then** the user can inspect structured calls, results, approvals, background work, and completion state.
3. **Given** a persisted agent session, **When** the terminal host is restarted, **Then** the user can resume the session without relying on terminal scrollback.
4. **Given** no explicit profile option, **When** `acryl` starts, **Then** it selects the current active ACRYL profile.
5. **Given** an explicit profile option, **When** `acryl --profile <name>` starts, **Then** it targets that named profile.

---

### User Story 2 - Use three peer ACRYL hosts (Priority: P1)

As a user, I can choose terminal, Electron, or Web presentation without changing ACRYL's underlying profiles, plugins, agents, or lifecycle semantics.

**Why this priority**: Host separation is the product boundary that prevents Desktop presentation from becoming the control plane.

**Independent Test**: Open the same profile through each supported host and confirm that shared operational and durable state has consistent meaning while host-specific contributions appear only where supported.

**Acceptance Scenarios**:

1. **Given** an installed ACRYL distribution, **When** the user runs `acryl`, `acryl gui`, or `acryl web`, **Then** the corresponding terminal, Electron, or Web host starts.
2. **Given** convenience launchers are installed, **When** the user runs `acryl-gui` or `acryl-web`, **Then** they launch the same GUI and Web products as the canonical subcommands.
3. **Given** a plugin supports only one presentation host, **When** another host is used, **Then** the unsupported presentation is absent while Host-side lifecycle and inventory remain manageable.
4. **Given** a capability supports multiple hosts, **When** users switch presentation, **Then** its domain state and lifecycle meaning remain consistent.

---

### User Story 3 - Attach to the live profile owner (Priority: P1)

As a user, I can open `acryl` while the GUI or Web host already owns the profile and safely administer that live runtime instead of starting a competing instance.

**Why this priority**: A profile must never have multiple writable runtime owners that can diverge or corrupt state.

**Independent Test**: Start the GUI or Web host, then run `acryl` for the same profile and verify that it attaches to the existing owner, displays its live state, and does not create a second writable runtime.

**Acceptance Scenarios**:

1. **Given** another healthy local host owns the profile, **When** `acryl` starts, **Then** it authenticates to and attaches to that host.
2. **Given** no host owns the profile, **When** `acryl` starts, **Then** it acquires ownership and runs standalone.
3. **Given** ownership is ambiguous, stale, or cannot be authenticated, **When** `acryl` starts, **Then** it fails safely with recovery guidance rather than creating a competing owner.
4. **Given** an attached host exits, **When** the connection is lost, **Then** the user sees the ownership change and can explicitly retry, exit, or acquire the profile after safe recovery.

---

### User Story 4 - Inspect and maintain ACRYL (Priority: P1)

As an operator, I can inspect profiles, installed packages, Cordis Loader entries, Fibers, services, dependencies, effects, and health, then perform permitted lifecycle operations.

**Why this priority**: The terminal host is intended to be ACRYL's complete maintenance and recovery gateway.

**Independent Test**: Use only `acryl` to inspect architecture, enable or disable an admitted plugin, reload it, and verify the resulting Fiber and service state.

**Acceptance Scenarios**:

1. **Given** a running profile, **When** the user opens architecture inspection, **Then** ACRYL shows native runtime identities, lifecycle phases, dependencies, provided services, and owned effects without inventing a parallel registry.
2. **Given** an admitted mutable plugin, **When** the user enables, disables, mounts, unmounts, or reloads it, **Then** the operation reconciles through the authoritative lifecycle and reports settlement.
3. **Given** a protected control-plane component, **When** mutation is requested, **Then** ACRYL rejects the operation with its protection reason.
4. **Given** a disabled optional terminal presentation plugin, **When** the user inspects the profile, **Then** normal presentation contributions are absent but narrow recovery commands remain available.

---

### User Story 5 - Install, update, remove, and recover plugins (Priority: P1)

As an operator, I can discover, preview, install, update, remove, register, and deregister profile plugins from the terminal surface with the same safety guarantees as other ACRYL surfaces.

**Why this priority**: A standalone control surface is incomplete if plugin maintenance still requires Electron Settings or manual profile editing.

**Independent Test**: Preview and install a trusted plugin, observe its resulting profile and runtime state, reload or restart as classified, then remove it and verify cleanup.

**Acceptance Scenarios**:

1. **Given** a candidate plugin, **When** the user previews installation, **Then** ACRYL reports source, version, permissions, build-script implications, profile changes, and required restart class before mutation.
2. **Given** an approved installation, **When** the user executes it, **Then** ACRYL uses the existing profile/package authority and reports the resulting installation and lifecycle state.
3. **Given** a failed install, update, or activation, **When** recovery completes, **Then** the previous valid composition remains available or ACRYL enters an explicit recoverable state.
4. **Given** a plugin is removed, **When** lifecycle settlement completes, **Then** its owned processes, routes, listeners, tools, services, and presentation contributions no longer remain active.

---

### User Story 6 - Delegate coding work through interchangeable agents (Priority: P1)

As a user, I can ask the built-in ACRYL agent to build, test, patch, or review plugins and delegate suitable work to interchangeable external coding agents.

**Why this priority**: Agent orchestration is part of the approved first milestone, not a later terminal enhancement.

**Independent Test**: Start a task in the ACRYL agent, delegate one bounded operation to an available external provider, inspect its identity and status, receive a structured result, and continue the parent trajectory.

**Acceptance Scenarios**:

1. **Given** the default ACRYL agent, **When** the user submits a maintenance or coding task, **Then** it uses the existing Harness trajectory, tools, persistence, compaction, jobs, and subagent capabilities.
2. **Given** Codex or Claude Code is configured, **When** work is delegated, **Then** ACRYL uses the existing Harness provider seam rather than a parallel orchestration runtime.
3. **Given** Gemini, OpenCode, or a local runtime adapter is configured, **When** compatible work is delegated, **Then** it follows the same provider-neutral task and result model.
4. **Given** an adapter supports only low-fidelity terminal interaction, **When** it is used, **Then** ACRYL labels that fidelity honestly and does not treat terminal bytes as canonical semantic history.
5. **Given** an agent edits a plugin candidate, **When** it proposes activation, **Then** build, validation, lifecycle settlement, health checks, approval policy, and rollback requirements run before promotion.

---

### User Story 7 - Automate without opening the TUI (Priority: P2)

As an operator or automation client, I can invoke stable non-interactive `acryl` commands and receive deterministic results suitable for scripts.

**Why this priority**: The canonical command must support both interactive maintenance and reliable automation.

**Independent Test**: Query profiles and plugin state in a machine-readable format, execute one permitted operation, and verify meaningful exit codes and protocol-pure output.

**Acceptance Scenarios**:

1. **Given** a read-only command, **When** a machine-readable output mode is selected, **Then** stdout contains only the requested result and diagnostics use stderr.
2. **Given** a successful command, **When** it exits, **Then** it returns a success code only after durable writes and lifecycle settlement required by that operation.
3. **Given** an invalid, denied, or failed command, **When** it exits, **Then** it returns a non-success code and an actionable structured error.

### Edge Cases

- The selected profile does not exist, has an invalid composition, or cannot be materialized.
- A profile ownership record exists but its process or control endpoint is gone.
- Two hosts attempt to acquire the same profile concurrently.
- A live host is reachable but presents an incompatible control protocol generation.
- A plugin provider disappears while a dependent screen, tool, or agent operation is active.
- A plugin update changes native dependencies and therefore cannot be hot-reloaded safely.
- The terminal loses size, color, Unicode, mouse, or alternate-screen capabilities.
- The user interrupts an agent, installation, lifecycle operation, or host shutdown.
- An external agent runtime is unavailable, unauthenticated, rate-limited, or cannot resume.
- A plugin's install script requires explicit trust or attempts access outside allowed policy.
- The terminal presentation plugin itself is disabled or fails activation.
- An attached GUI or Web host exits during a mutation.
- Durable session history exists but a presentation projection is stale or incomplete.

## Requirements

### Functional Requirements

- **FR-001**: ACRYL MUST provide `acryl` as its canonical command.
- **FR-002**: Running `acryl` without a subcommand MUST open the interactive terminal surface.
- **FR-003**: ACRYL MUST provide canonical `gui` and `web` launch targets and MAY provide `acryl-gui` and `acryl-web` convenience launchers.
- **FR-004**: The terminal, GUI, and Web products MUST be peer host compositions over shared ACRYL domain capabilities.
- **FR-005**: Host-specific presentation plugins MUST be independently composable without duplicating domain state or lifecycle authority.
- **FR-006**: The terminal host MUST default to the current active profile and support explicit named profile selection.
- **FR-007**: At most one writable runtime owner MAY control a profile at one time.
- **FR-008**: The terminal host MUST run standalone when no other host owns the profile.
- **FR-009**: The terminal host MUST attach to an authenticated compatible live owner when another local host owns the profile.
- **FR-010**: Ownership uncertainty or authentication failure MUST fail closed and MUST NOT start a competing writable runtime.
- **FR-011**: The terminal host MUST expose persistent multi-turn ACRYL agent sessions, not repeatedly wrap one-shot agent invocations.
- **FR-012**: Agent trajectory, tool activity, approvals, jobs, and completion state MUST derive from durable structured runtime records where available.
- **FR-013**: Terminal scrollback and raw PTY bytes MUST NOT become canonical semantic agent history.
- **FR-014**: The built-in ACRYL agent MUST reuse the pinned Harness agent, session, trajectory, tool, job, workflow, compaction, and subagent capabilities.
- **FR-015**: Codex and Claude Code integrations MUST reuse compatible existing Harness provider seams.
- **FR-016**: Gemini, OpenCode, and local runtime integrations MUST use the same provider-neutral adapter model and declare only capabilities they support.
- **FR-017**: Users MUST be able to inspect profiles, installations, Loader entries, Fibers, services, dependencies, effects, health, sessions, agents, jobs, and provider status.
- **FR-018**: Architecture inspection MUST project authoritative runtime state and MUST NOT introduce a parallel plugin or lifecycle registry.
- **FR-019**: Users MUST be able to perform permitted plugin enable, disable, mount, unmount, reload, registration, and deregistration operations.
- **FR-020**: Users MUST be able to preview and execute permitted plugin installation, update, and removal operations.
- **FR-021**: Mutation flows MUST expose protection, permission, restart class, verification, settlement, and rollback outcomes.
- **FR-022**: Plugins MUST be able to contribute terminal screens, commands, keybindings, status items, tools, and workflows through independently reversible lifecycle ownership.
- **FR-023**: A small recovery boundary MUST remain available when optional terminal presentation or control plugins are disabled or broken.
- **FR-024**: Non-interactive commands MUST provide stable exit semantics and machine-readable output without mixing protocol output and diagnostics.
- **FR-025**: The pinned `deepseek-harness/` checkout MUST remain unmodified; ACRYL behavior MUST be supplied through repository-owned compositions, plugins, services, adapters, and launchers.
- **FR-026**: Candidate self-modification MUST pass build, validation, policy, lifecycle settlement, health, and rollback gates before becoming active.
- **FR-027**: Every long-lived process, connection, subscription, watcher, timer, route, PTY, and registration created by this milestone MUST have explicit lifecycle ownership and reach quiescence on disposal.
- **FR-028**: Losing or replacing a required capability MUST remove dependent behavior and allow clean reactivation without stale references or duplicate registrations.
- **FR-029**: GUI and Web must remain interoperable where they share browser Client contributions, while terminal-only and native-only presentation remains explicitly scoped.
- **FR-030**: The feature MUST preserve current working Desktop, Web, profile, Market, lifecycle, architecture, and Development Canvas behavior during staged delivery.

### Key Entities

- **Host Kind**: The terminal, GUI, or Web application composition presenting ACRYL capabilities.
- **Profile**: A named runnable ACRYL composition and its durable configuration.
- **Profile Ownership Lease**: The generation-scoped authority identifying the sole writable host for a profile and its attach endpoint.
- **Control Operation**: A typed inspection or mutation request with policy, settlement, verification, and result state.
- **Agent Session**: Durable structured trajectory and workspace identity that can be resumed across presentation restarts.
- **ACRYL Worker**: Provider-neutral logical coding worker, distinct from its live runtime process and vendor session.
- **Agent Runtime**: One live in-process, protocol, API, structured-process, or PTY-backed worker execution.
- **Plugin Candidate**: A proposed install, update, or locally built plugin version awaiting verification and promotion.
- **Presentation Contribution**: A host-scoped screen, command, keybinding, status item, or view registered by a plugin.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user can start ACRYL from a terminal, submit a task, inspect its structured progress, exit, and resume the session without opening Electron or a browser.
- **SC-002**: In 100 concurrent ownership-race trials per supported platform, exactly one host becomes writable owner and all others attach or fail safely.
- **SC-003**: Users can complete profile inspection, plugin lifecycle control, and plugin installation from the terminal surface without manual profile-file editing.
- **SC-004**: Repeating provider removal, replacement, and reactivation 20 times leaves no duplicate screens, tools, listeners, routes, processes, or registrations.
- **SC-005**: Every supported external-agent adapter passes cancellation, capability rejection, disposal, identity separation, and structured-result acceptance tests before being advertised as available.
- **SC-006**: Abrupt termination during each supported mutation phase leaves either the previous valid composition or an explicit recoverable state on the next launch.
- **SC-007**: All existing repository verification gates remain green throughout the migration, and each delivered slice adds direct run-once tests for its new behavior.
- **SC-008**: A first-time operator can identify the active host, profile, model, agent session, installed plugins, failed Fibers, and pending approvals from the terminal surface in under two minutes.
- **SC-009**: Scripted read commands produce parseable output and correct exit codes in all acceptance fixtures, with no diagnostic contamination of stdout.
- **SC-010**: No product implementation changes are required inside the pinned upstream checkout.

## Assumptions

- The terminal host initially targets the same desktop operating systems supported by ACRYL, with headless verification remaining portable.
- The existing active-profile selection remains the default authority for profile choice.
- Existing Harness durable sessions are reused for agent trajectory rather than copied into a second chat-history format.
- Existing Desktop profile, package, Market, lifecycle, and architecture capabilities are refactored toward host-neutral seams where required rather than reimplemented independently.
- OpenTUI is the approved terminal presentation library, subject to compatibility and packaging verification against the repository's supported Node runtimes.
- GUI and Web presentation can share browser Client plugins, while native Electron and terminal contributions remain host-specific.
- Plugin build scripts and external coding-agent execution remain subject to explicit trust, sandbox, approval, and repository policies.
- Delivery will be staged as independently usable vertical slices while preserving the approved final architecture.

## Out of Scope

- Forking or editing the pinned DeepSeek Harness source.
- Treating a PTY transcript as canonical agent or room history.
- Running multiple writable Hosts against one profile.
- Replacing Cordis with a second plugin, lifecycle, dependency-injection, event, or tool framework.
- Guaranteeing live hot replacement of executable, native ABI, entitlement, signing, or installer changes that require a process restart.
- Advertising unsupported external-agent capabilities merely because a terminal process can be launched.
