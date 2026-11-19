# 21 — Places Map

**Taxonomy:** Geographic  
**Blueprint ID:** `acrylblends.places-map`  
**Repository target:** `21-places-map`

## Product job
Map-first personal and team atlas for saving places, classifying them, annotating them and exploring them spatially.

## UX direction
Map / GIS workspace. This should not inherit a generic admin-dashboard layout. The mockup is the visual source of truth for hierarchy, composition, navigation and interaction.

## Primary data model
Place, collection, category, coordinate, note, visit status.

## Core user flows
Browse saved places on a vector map; filter by category; search; select a marker to inspect its details; add or edit a place; export GeoJSON/JSON.

## Implementation notes
Use a map as the primary canvas, not a dashboard chart. Production version should use OpenStreetMap tiles with attribution and a pluggable geocoder; mockup uses an illustrative local vector map so it works offline.

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
