# 51 — Morrow Lab (Simulation software)

**Tagline:** Explore system behavior through reproducible experiments.

## Product brief
A compact simulation workbench for running seeded thermal-system experiments, adjusting assumptions, comparing response traces and preserving experiment snapshots.

**Primary audience:** Engineers, researchers, educators and product teams exploring simulation workflows.

**UX direction:** Scientific workbench: dark instrument-panel visual language, parameter controls, live response charts and experiment archive.

## Workspace / screen map
1. Experiment setup and parameter controls
2. Thermal field / system state visualization
3. Response traces and run comparison
4. Experiment archive and saved snapshots

## Primary workflows
1. Adjust ambient temperature, heater power, airflow and insulation values.
2. Run a deterministic local model and inspect peak temperature, settling time and energy estimate.
3. Compare response curves from two saved runs.
4. Save a named snapshot with the current parameter set.

## Core data model
Experiment, ParameterSet, SimulationRun, MetricSeries, Snapshot. Each run stores input assumptions, computed summary metrics and a deterministic trace.

## Prototype boundaries
The numerical model is illustrative seed logic, not a validated engineering or safety model. Do not use for real design certification, physical control or safety-critical decisions. No external solver or hardware connection.

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
1. Implement a deterministic simulation service that accepts a typed parameter set and returns metrics plus trace points.
2. Build a responsive chart workspace that overlays saved simulation runs and supports CSV export.
3. Add experiment persistence, versioned parameter sets and domain tests for model boundaries.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
