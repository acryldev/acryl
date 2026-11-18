# 17 · Robotics — Robot Missions

**Blueprint ID:** `acrylblends.robot-missions`  
**Category:** `robotics`  
**Reference concept:** Robot Missions

## Product job
Plan and simulate robot missions using a facility map, fleet status, ordered waypoints and telemetry.

## UX direction
Map-first robotics console. The central surface is a grid/facility map with robot positions, obstacles and route geometry; fleet selector on left; waypoint sequence and telemetry on right.

## Screens and routes
1. Mission planner: facility map, fleet selector, waypoint editor, route preview and simulation controls. 2. Robot detail: battery, pose, mode and telemetry history. 3. Mission history: completed/failed simulation runs and event logs.

## Domain model
Robot(id, name, model, status, batteryPct, poseX, poseY, mode); FacilityMap(id, name, width, height, obstacles, zones); Mission(id, name, robotId, status, createdAt, waypoints); Waypoint(id, missionId, sequence, x, y, action); MissionEvent(id, missionId, type, occurredAt, detail).

## Primary interactions
Select robot; add/remove/reorder waypoints; preview path; run/pause/reset simulation; inspect robot telemetry; save mission draft.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
Simulation-only. Do not connect to physical robot controllers or send real motion commands. Clearly distinguish draft, simulated and physically executed mission states.

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
