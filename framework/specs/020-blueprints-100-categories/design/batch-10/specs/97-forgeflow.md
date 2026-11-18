# 97. Software factories — ForgeFlow

> **Concept:** From specification to working build.

## Product purpose
A software factory cockpit turning a product specification into a coordinated, reviewable build pipeline.

## Intended audience
Small engineering teams using coding agents

## Category coverage
Code generation systems; AI software factories; Autonomous development systems; Specification-driven development; Multi-agent development systems; Continuous software-generation platforms; Self-improving development environments.

## Primary screens
- Factory pipeline
- Spec brief
- Artifact review

## Core workflows
1. Submit a brief
2. Break work into agent tasks
3. Inspect artifacts and evidence
4. Approve or return a stage

## Suggested domain model
- `ProjectSpec`
- `BuildRun`
- `AgentTask`
- `Artifact`
- `GateDecision`

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
1. Add budget envelope.
2. Add architecture/security review gates.
3. Add reproducible build manifest.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/97-forgeflow.html`
- Category ID: `97`
- Slug: `forgeflow`
