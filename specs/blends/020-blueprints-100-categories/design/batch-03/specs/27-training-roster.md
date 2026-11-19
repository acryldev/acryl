# 27 — Training Roster

**Taxonomy:** Military / Defense  
**Blueprint ID:** `acrylblends.training-roster`  
**Repository target:** `27-training-roster`

## Product job
Non-operational personnel training administration for groups, attendance, safety qualifications, renewals and readiness reporting.

## UX direction
Personnel qualification matrix with training calendar. This should not inherit a generic admin-dashboard layout. The mockup is the visual source of truth for hierarchy, composition, navigation and interaction.

## Primary data model
Person, group, qualification, course, session, attendance, expiry.

## Core user flows
Search the roster; filter by group; inspect current/expired training qualifications; switch to weekly calendar; add a person; export a roster.

## Implementation notes
Strictly non-operational. No mission planning, targeting, deployment, weapons, intelligence or tactical functions. Readiness refers only to training completion and qualification currency.

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
