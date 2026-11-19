# 95. Software marketplaces — OpenShelf

> **Concept:** Discover tools worth keeping.

## Product purpose
A curated marketplace for browsing apps, plugins, APIs, models and agent tools.

## Intended audience
Teams and builders evaluating reusable software

## Category coverage
App stores; Plugin stores; Extension marketplaces; SaaS marketplaces; API marketplaces; Model marketplaces; Agent marketplaces.

## Primary screens
- Discover
- Listing detail
- Saved collection

## Core workflows
1. Browse a category
2. Inspect licence and publisher
3. Save a listing
4. Compare shortlist

## Suggested domain model
- `Listing`
- `Publisher`
- `Category`
- `Collection`
- `Review`

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
1. Add comparison tray.
2. Add publisher submission review.
3. Add collection sharing.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/95-openshelf.html`
- Category ID: `95`
- Slug: `openshelf`
