# 52 — Hyperplane (Virtualization software)

**Tagline:** Operate a virtual fleet from one clean control surface.

## Product brief
A virtualization console prototype for selecting hosts, inspecting virtual machines, reading resource allocation and exercising safe local VM state transitions.

**Primary audience:** Infrastructure engineers, platform operators and internal IT teams.

**UX direction:** Light hypervisor fleet console: host rail, VM inventory table, utilization summary and contextual provisioning actions.

## Workspace / screen map
1. Host overview and resource utilization
2. Virtual machine inventory with filters
3. VM detail and lifecycle actions
4. Provisioning form / snapshot summary

## Primary workflows
1. Select a host and inspect its allocated CPU, memory and storage.
2. Search VMs by name, state or operating system.
3. Start, pause or snapshot a selected VM in local fixture state.
4. Create a sample VM through a small provisioning dialog.

## Core data model
Host, VirtualMachine, ResourceAllocation, Image, Snapshot, LifecycleEvent.

## Prototype boundaries
All hosts and virtual machines are fictional local fixtures. Lifecycle actions update only browser state and never call a hypervisor, cloud provider or host API.

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
1. Define a typed VM lifecycle state machine with guard conditions and domain tests.
2. Implement host capacity calculations and VM inventory filtering with seeded fixtures.
3. Create accessible provisioning and snapshot flows with optimistic UI state and rollback handling.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
