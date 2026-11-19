# 93. Compatibility software — Bridgeworks

> **Concept:** Make old systems work with new ones.

## Product purpose
A compatibility workbench for assessing application/runtime pairs, translation layers and legacy dependencies.

## Intended audience
Platform engineers and enterprise IT

## Category coverage
Wine-like compatibility layers; Translation layers; Binary translation; API compatibility layers; Legacy runtime compatibility.

## Primary screens
- Compatibility matrix
- Runtime profile
- Issue dossier

## Core workflows
1. Select an application and runtime
2. Review compatibility matrix
3. Inspect failed check evidence
4. Assign a mitigation

## Suggested domain model
- `ApplicationTarget`
- `RuntimeProfile`
- `CompatibilityCheck`
- `KnownIssue`

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
1. Add report export.
2. Add dependency graph.
3. Add API translation rule editor.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/93-bridgeworks.html`
- Category ID: `93`
- Slug: `bridgeworks`
