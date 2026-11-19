# 61. Integration software — Relaycraft

## Product intent
A compact integration studio for assembling connector-based data flows, mapping fields, previewing transformations and running a seeded sync job.

**Audience:** Operations engineers, integration specialists and teams connecting business systems.

**Positioning:** Move business data across systems, with every transformation visible.

## UX architecture
A node-and-mapping workbench with a left connector rail, central pipeline canvas, lower record preview and a right run inspector.

### Screens and regions
1. Connector catalogue and connection status
2. Pipeline canvas with ordered source, transform and destination nodes
3. Field mapping and sample-record preview
4. Run history with row counts and error details

## Core workflows
1. Choose a source and destination connector from seeded systems.
2. Add a transform step and map source fields to destination fields.
3. Preview the first sample records and inspect unmapped fields.
4. Run a deterministic local sync simulation and review processed, skipped and failed rows.

## Domain model
Connector, Connection, Pipeline, PipelineStep, FieldMapping, SampleRecord, SyncRun. Store connector capabilities separately from credential references; demo data must contain no real secrets.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
No live connectors, credentials, network requests or writes to external systems. The run is a deterministic local simulation. Never display real API keys or connection secrets.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a typed pipeline graph model with connector, transform and destination step validation.
2. Build a mapping service that previews deterministic sample-record transformations and reports unmapped or invalid fields.
3. Add run history, retry semantics for seeded failed rows and unit tests for mapping edge cases.

## Prototype reference
- Standalone mockup: `../mockups/integration-relaycraft.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
