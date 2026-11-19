# 07 — Analytics: Web Analytics

**Blueprint id:** `acrylblends.web-analytics`  
**Concept:** A privacy-conscious website analytics console for page views, traffic sources, device mix, top pages and conversion journeys.

## Intent
A measurement and reporting product. It answers acquisition and engagement questions, not operational tasks.

## Primary
Analytics overview with date range, visitor/session/conversion metrics, time-series line chart, top pages and traffic-source distribution.

## Support
Acquisition report; page report; event explorer; conversion funnel; tracking setup with copyable snippet; property settings.

## Visual
Bright editorial reporting interface, restrained green data palette, chart-forward layout and precise labels. No Kanban or generic CRM cards.

## Flows
Create property → copy tracking snippet → receive page-view events → choose date range → inspect traffic trend → drill into source/page/event → define conversion.

## Data
Property(id,domain,trackingId,createdAt); PageView(id,propertyId,path,referrer,device,country,sessionId,at); Event(id,name,properties,sessionId,at); DailyMetric(date,visitors,sessions,bounceRate,conversions).

## Seed
Northstar.app property, 48,291 visitors, 62,814 sessions, daily trend and top-page/referrer sample aggregates.

## States
No events yet, tracking snippet not installed, date range with no data, event filter, privacy exclusion notice and export prepared.

## Routes
`/overview`; `/acquisition`; `/pages`; `/events`; `/conversions`; `/settings/tracking`.

## Build notes for the agent
- Start from the published `acrylblends` blank template and follow `specs/020-blueprints-100-categories/spec.md` plus `cloud-brief.md`.
- Implement domain logic in a focused Cordis plugin; keep the domain separate from the route/view.
- Show useful local seed data on first launch. No required outside account, paid service, or API key.
- Keep external effects behind injected adapters; use fake adapters in tests.
- Implement the screen composition in the mockup; do not replace it with a generic dashboard.
- Cover domain logic and every route with `node:test`; include README, three follow-up prompts and screenshot.

## Acceptance checklist
- [ ] Main screen clearly expresses the category's core job.
- [ ] Primary workflow works with seed data.
- [ ] Appropriate create/edit/search and state transitions work.
- [ ] Empty, validation, success and failure states are handled.
- [ ] `npm test`, `npm run check` and `npm start` pass.
- [ ] Registry metadata and category placement match the task plan.
