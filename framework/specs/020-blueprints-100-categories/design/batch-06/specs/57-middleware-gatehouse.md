# 57 — Gatehouse (Middleware)

**Tagline:** Shape requests as they pass through your middleware stack.

## Product brief
An API gateway and middleware control-plane mockup for browsing routes, configuring policies, inspecting upstream services and reviewing request traces.

**Primary audience:** Backend platform engineers, API architects and integration teams.

**UX direction:** Dark technical gateway console: route registry, central middleware pipeline visualization, trace ledger and route-policy inspector.

## Workspace / screen map
1. Route registry and upstream service list
2. Middleware pipeline per selected route
3. Request trace timeline
4. Route policy inspector and draft editor

## Primary workflows
1. Select a route and inspect its ordered middleware pipeline.
2. Change the upstream target and timeout in a local policy draft.
3. Toggle auth, rate-limit, logging and cache layers.
4. Generate a local test trace and save the route policy draft.

## Core data model
Route, UpstreamService, MiddlewareLayer, RoutePolicy, RequestTrace, PolicyDraft.

## Prototype boundaries
No traffic is proxied and no gateway, upstream service or identity provider is contacted. Test traces are synthetic and local only.

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
1. Design a typed route-policy model with ordered middleware layers and policy validation tests.
2. Build a request trace viewer that correlates route, middleware timing and upstream result fixtures.
3. Implement route editing and draft persistence behind an adapter interface without live gateway integration.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.
