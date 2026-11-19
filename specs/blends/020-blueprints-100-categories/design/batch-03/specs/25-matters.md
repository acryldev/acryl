# 25 — Matters

**Taxonomy:** Legal  
**Blueprint ID:** `acrylblends.matters`  
**Repository target:** `25-matters`

## Product job
Matter-centric legal workspace for tracking clients, deadlines, case activity, documents, tasks and reusable clause references.

## UX direction
Matter docket with evidence panel. This should not inherit a generic admin-dashboard layout. The mockup is the visual source of truth for hierarchy, composition, navigation and interaction.

## Primary data model
Matter, client, party, deadline, document, activity, task, clause.

## Core user flows
Select a matter; switch between timeline, documents, tasks and notes; inspect summary and next deadline; create a matter or activity.

## Implementation notes
Demo matter data only. Do not generate legal advice or treat clause snippets as approved legal wording. Maintain matter-level access controls, audit trail and document version history in a real product.

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
