# 15 · Scientific & Engineering — Lab Notebook

**Blueprint ID:** `acrylblends.lab-notebook`  
**Category:** `scientific-engineering`  
**Reference concept:** Lab Notebook

## Product job
Record reproducible experiments with objectives, protocols, instrument metadata, measurements, observations and results.

## UX direction
Research notebook inspired by a paper record: notebook/experiment navigation on the left, long-form structured record in the center, unit conversion and metadata tools in a side rail. Calm scientific blue-grey palette.

## Screens and routes
1. Notebook: list projects and experiments. 2. Experiment record: objective, method, materials, structured measurements, chart, observations, attachments and audit trail. 3. Data table: sample-level measurements and export.

## Domain model
Notebook(id, title, project, ownerId); Experiment(id, notebookId, title, protocolVersion, objective, method, startedAt, status, instrumentId); Measurement(id, experimentId, sampleId, parameter, value, unit, measuredAt); Observation(id, experimentId, authorId, body, createdAt); Attachment(id, experimentId, filename, mimeType, sizeBytes).

## Primary interactions
Create experiment; add timestamped observation; append measurement row; convert units; chart a measured parameter; export a record. Preserve append-only observation history.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
Do not invent scientific conclusions or silently overwrite measurements. Record units, sample IDs, protocol version and instrument metadata. Seed values are illustrative; calculations should be deterministic and unit-aware.

## ACRYL implementation handoff
- Start from the published `acrylblends` blank template unless the feature genuinely requires the agent template.
- Implement the domain capability as one focused Cordis plugin, with domain logic separated from route rendering.
- Keep external effects behind injected/configured interfaces so route and domain tests can use fakes.
- Keep the first page at `/`; use the additional routes listed above only where they provide a distinct workflow.
- Use the existing ACRYL Blends router, state and database ports. Do not add a second application framework.
- Add domain tests and route tests; assert the seed data and important workflow transitions.
- No third-party sign-in, external account requirement or mandatory API key.

## Acceptance checklist
- [ ] First page loads with useful seeded data.
- [ ] Main task can be completed without setup or external credentials.
- [ ] The primary interaction is implemented, not just styled.
- [ ] Domain operations are tested independently from the UI.
- [ ] Every route and validation state is tested.
- [ ] README includes purpose, audience, setup and three example prompts for extending the app.
- [ ] Screenshot shows the distinctive primary workflow.
