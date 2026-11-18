# 55 — Meshwatch (Distributed systems software)

**Tagline:** Understand cluster topology, quorum and replica health.

## Product brief
A distributed-systems observability prototype for exploring a seeded cluster topology, node health, leader identity, replica lag and a simulated failover drill.

**Primary audience:** Distributed-systems engineers, SREs, database operators and platform teams.

**UX direction:** Dark topology map with selectable nodes, quorum indicators, replica state cards and an append-only consensus event log.

## Workspace / screen map
1. Cluster topology and node selection
2. Node detail, role and health telemetry
3. Consensus / replication event log
4. Failover drill and cluster summary

## Primary workflows
1. Select a node to inspect role, region, health and replication lag.
2. Inspect the current leader and quorum membership.
3. Run a simulated failover drill and update the local leader marker.
4. Review the generated local event log and reset the fixture.

## Core data model
Cluster, Node, NodeHealth, Replica, ConsensusTerm, ClusterEvent, FailoverDrill.

## Prototype boundaries
No distributed consensus, node election, database replication or infrastructure change occurs. The failover action is a visual state simulation only.

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
1. Implement a deterministic cluster-state fixture and a failover reducer with invariant tests.
2. Build an accessible topology view with keyboard-selectable nodes and a synchronized detail panel.
3. Add event-log filtering and quorum / replica-health summary calculations.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
