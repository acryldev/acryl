# 98. Self-modifying / adaptive software — MorphOS Studio

> **Concept:** Observe the interface adapting.

## Product purpose
A sandbox for inspecting adaptive interfaces, runtime-generated tools and configuration changes.

## Intended audience
Frontend platform engineers and AI product teams

## Category coverage
Self-updating applications; Plugin-generating systems; Runtime extension systems; Adaptive interfaces; Generative UI; Self-configuring systems; Self-healing software; Agent-generated tooling.

## Primary screens
- Runtime preview
- Adaptation rules
- Change history

## Core workflows
1. Load context
2. Switch user/task conditions
3. Inspect generated UI
4. Accept or revert changes

## Suggested domain model
- `RuntimeVariant`
- `AdaptationRule`
- `GeneratedTool`
- `ChangeSet`
- `Evaluation`

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
1. Add generated component validation.
2. Add visual diff.
3. Add policy layer for UI mutations.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/98-morphos-studio.html`
- Category ID: `98`
- Slug: `morphos-studio`
