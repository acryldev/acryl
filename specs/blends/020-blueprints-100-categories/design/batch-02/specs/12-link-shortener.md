# 12 · Internet — Link Shortener

**Blueprint ID:** `acrylblends.link-shortener`  
**Category:** `internet`  
**Reference concept:** Link Shortener

## Product job
Create branded short URLs and inspect click activity, referrers and link state.

## UX direction
Growth-oriented link management SaaS: a prominent create-link composer, compact KPI strip, active-links list, click trend and referrer breakdown. Use a light green palette and a compact top navigation.

## Screens and routes
1. Overview: create link, recent links, click KPIs, click trend and referrers. 2. Link detail: destination, QR/slug, click-by-day chart, referrer and country breakdown. 3. Domains: configured short domains and status.

## Domain model
ShortLink(id, slug, destinationUrl, title, tags, createdAt, expiresAt, enabled, ownerId); ClickEvent(id, linkId, occurredAt, referrer, country, device, campaign); Domain(id, hostname, verified, default).

## Primary interactions
Validate destination URL; create a unique slug; copy short URL; search links; filter by active/expired; open detail analytics; enable/disable link.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
Use deterministic sample metrics and sample click events. A generated short link is a local demo record unless a redirect route and persistent store are implemented. Do not claim external redirect or DNS verification in the mockup.

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
