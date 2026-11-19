# 60 — Orbit API Console (API / SDK software)

**Tagline:** Explore an API and shape your first SDK request.

## Product brief
A developer portal prototype with endpoint navigation, parameter editing, local request fixtures, schema examples and JavaScript / Python / Go code snippets.

**Primary audience:** API consumers, SDK developers, integration engineers and platform documentation teams.

**UX direction:** Developer reference layout: endpoint navigation, central request builder with docs tabs and right-side response inspector.

## Workspace / screen map
1. API endpoint explorer
2. Try-it request builder and parameter editor
3. Schema and examples documentation
4. Response inspector and language-specific SDK snippets

## Primary workflows
1. Choose an endpoint and inspect method, path and description.
2. Edit query parameters or a POST request body.
3. Send a local fixture request and inspect the response JSON.
4. Switch between JavaScript, Python and Go snippets.

## Core data model
ApiService, Endpoint, Parameter, RequestSchema, ResponseFixture, CodeSample, ApiVersion.

## Prototype boundaries
The console does not contact an external API. API base URL and responses are illustrative fixtures; secrets are nonfunctional placeholders.

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
1. Define endpoint, parameter and schema metadata for a small versioned API reference.
2. Implement a fixture-backed try-it request engine with GET and POST validation tests.
3. Generate idiomatic JavaScript, Python and Go examples from endpoint metadata.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
