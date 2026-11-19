# 94. Licensing / software distribution — ReleaseDock

> **Concept:** Ship software. Govern access.

## Product purpose
A publisher console for package releases, update channels, activation keys and seat allocation.

## Intended audience
Independent software vendors and platform teams

## Category coverage
App stores; Package repositories; License servers; Software activation; Update systems; Patch management; Software deployment.

## Primary screens
- Release overview
- Package channel
- License seats

## Core workflows
1. Promote a package
2. Create activation pool
3. Allocate/revoke seats
4. Inspect rollout

## Suggested domain model
- `ProductPackage`
- `Release`
- `UpdateChannel`
- `LicensePool`
- `Activation`

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
1. Add signed package metadata.
2. Add production approval gates.
3. Add offline activation.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/94-releasedock.html`
- Category ID: `94`
- Slug: `releasedock`
