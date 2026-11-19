# 99. Autonomous software — Autonomy Fleet

> **Concept:** Coordinate systems that act.

## Product purpose
A simulation-first console for supervising autonomous agents, robots and infrastructure missions.

## Intended audience
Teams prototyping autonomous software or robotics

## Category coverage
Autonomous agents; Autonomous vehicles; Trading bots; Industrial robots; Software agents; Autonomous infrastructure; Self-healing systems.

## Primary screens
- Fleet map
- Mission queue
- Intervention log

## Core workflows
1. Inspect unit and mission
2. Pause/reassign simulated mission
3. Review policy limits
4. Record intervention

## Suggested domain model
- `AutonomousUnit`
- `Mission`
- `Policy`
- `Intervention`
- `TelemetrySample`

## Implementation guidance
- Keep the information architecture specific to this category; do not replace it with a generic dashboard.
- Start with seeded local data and define adapter boundaries before optional integrations.
- Add accessible keyboard paths, focus states and responsive layouts.
- Include loading, empty, error and permission-denied states.
- Keep credentials out of the client. Integrations must be opt-in.

## Acceptance checks
- [ ] Core workflows can be completed without a paid API key.
- [ ] Primary views work at desktop and narrow mobile widths.
- [ ] Demo data is clearly identified as illustrative.
- [ ] State changes are reflected in the interface and can be reset.

## Agent prompts
1. Add geofenced mission planner.
2. Add explainable policy simulation.
3. Add incident timeline.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/99-autonomy-fleet.html`
- Category ID: `99`
- Slug: `autonomy-fleet`
