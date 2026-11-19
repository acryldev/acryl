# 26 — Citizen Requests

**Taxonomy:** Government / Public Sector  
**Blueprint ID:** `acrylblends.citizen-requests`  
**Repository target:** `26-citizen-requests`

## Product job
Municipal service portal for receiving citizen reports, triaging them to departments and publishing status updates.

## UX direction
Civic request queue plus public status view. This should not inherit a generic admin-dashboard layout. The mockup is the visual source of truth for hierarchy, composition, navigation and interaction.

## Primary data model
Request, resident, department, location, category, priority, status update.

## Core user flows
Filter the queue; inspect a request on a location map; assign a responsible department; update status; create a request; expose a public reference page.

## Implementation notes
Keep personal data private and separate from the public status projection. Provide a clear status history, reference ID, accessible resident flow and department SLA fields.

## Required screens / states
1. **Primary workspace:** the main layout shown in the mockup, populated with meaningful seeded data on first launch.
2. **Record or item detail:** inspection and editing surface for the selected domain object.
3. **Create / update flow:** a focused form or direct manipulation action appropriate to the category.
4. **Supporting view:** calendar, report, public reference, collection or settings surface as applicable.

Implement only the smallest useful app described here. Use the framework's Cordis plugin and `blend.yaml` conventions. Keep external systems behind injected ports/config so tests can use fakes. Use local seed data; do not require paid APIs, API keys or external sign-in.

## Acceptance checklist
- [ ] First page opens with seeded records and the category's core job is immediately obvious.
- [ ] Core flow works end-to-end with local data.
- [ ] Detail and create/update interactions have validation and clear feedback.
- [ ] Empty, loading, error and success states are defined.
- [ ] Domain logic and every route have tests.
- [ ] README describes audience, purpose and three next prompts.
- [ ] No secrets, external credentials or unsafe production claims.
