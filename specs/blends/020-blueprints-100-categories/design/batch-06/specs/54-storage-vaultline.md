# 54 — Vaultline (Storage software)

**Tagline:** See pools, volumes, objects and recovery points in one fabric.

## Product brief
A storage administration interface prototype for viewing pool health, managing volume and bucket metadata, browsing object samples and reviewing snapshots.

**Primary audience:** Storage administrators, platform engineers, backup operators and developers working with storage services.

**UX direction:** Editorial storage fabric console: capacity-first pool cards, volume ledger, object browser and recovery-point timeline.

## Workspace / screen map
1. Storage pool capacity overview
2. Volumes and bucket inventory
3. Object browser and metadata detail
4. Snapshot and backup ledger

## Primary workflows
1. Inspect pool capacity, allocation and health.
2. Create a local volume or object bucket with a name and capacity.
3. Browse seeded objects and inspect metadata.
4. Create a mock snapshot and review retention entries.

## Core data model
StoragePool, Volume, Bucket, StoredObject, Snapshot, BackupPolicy, CapacityMetric.

## Prototype boundaries
No disk, filesystem, NAS, SAN, object-store or backup target is accessed. All operations modify only local mock data; capacity values are illustrative.

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
1. Model pools, volumes, buckets and snapshots with typed constraints and testable capacity calculations.
2. Build an object browser with metadata filters, breadcrumb navigation and empty states.
3. Implement a retention timeline and snapshot actions against a local repository adapter.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
