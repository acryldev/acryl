# 96. Plugin / extension ecosystems — Extensio

> **Concept:** A safer home for extensions.

## Product purpose
An extension control plane for finding, installing, updating and reviewing plugin permissions.

## Intended audience
Product teams and administrators

## Category coverage
Browser extensions; IDE extensions; CMS plugins; Audio plugins; Game mods; AI skills; MCP servers; Agent tools.

## Primary screens
- Extension library
- Permission review
- Update channel

## Core workflows
1. Browse by host
2. Review permissions
3. Enable/disable extension
4. Pin/defer update

## Suggested domain model
- `Extension`
- `Installation`
- `PermissionGrant`
- `ReleaseChannel`

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
1. Add organisation allowlists.
2. Add permission diff.
3. Add staged rollout.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/96-extensio.html`
- Category ID: `96`
- Slug: `extensio`
