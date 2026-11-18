# 58 — Runlevel (Runtime software)

**Tagline:** Manage process health and runtime compatibility.

## Product brief
A runtime operations console for reviewing hosts and managed processes, comparing language-runtime compatibility, simulating restarts and inspecting rollout history.

**Primary audience:** Platform engineers, SREs, runtime maintainers and application operations teams.

**UX direction:** Warm editorial operations desk: host selector, process table, runtime compatibility matrix and rollout history tabs.

## Workspace / screen map
1. Runtime host selector and host metrics
2. Managed process inventory and lifecycle controls
3. Runtime compatibility matrix
4. Rollout history and deployment preparation

## Primary workflows
1. Select a host and inspect CPU, memory and managed processes.
2. Inspect a process runtime and version.
3. Request a simulated restart and view local confirmation.
4. Compare current and target runtime versions and prepare a rollout draft.

## Core data model
RuntimeHost, RuntimeFamily, RuntimeVersion, ManagedProcess, CompatibilityRule, Rollout, LifecycleEvent.

## Prototype boundaries
No process is restarted, deployed or upgraded. Host data and compatibility statuses are seeded illustrations, not authoritative runtime compatibility advice.

## Acceptance criteria
- A user can complete each primary workflow using seeded data without credentials or external API keys.
- The application has responsive behavior and meaningful empty, selected, success and error states.
- Data transformations and state transitions are separated from presentation and covered by domain tests.
- The UI uses semantic controls, visible focus states and keyboard-accessible primary actions.
- README documents purpose, target users, local run steps, prototype boundaries and the three agent prompts.

## Suggested implementation sequence
1. Define typed domain entities, seed fixtures and pure domain operations.
2. Implement the primary workspace and main state transitions.
3. Add detail / create / inspect flows, responsive layout and accessibility.
4. Add domain and route tests, then capture a screenshot for the registry entry.

## Coding-agent prompts
1. Create a runtime compatibility domain model and fixture-driven compatibility matrix.
2. Implement host selection, process filtering and a simulated process lifecycle reducer.
3. Add rollout drafts with version comparison, review steps and tests for compatibility warnings.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
