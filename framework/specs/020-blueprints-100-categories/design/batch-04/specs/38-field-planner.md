# 38 — Field Planner

**ACRYL Blend ID:** `acrylblends.field-planner`  
**Category:** Agriculture software

## Product objective
Farm field and seasonal crop planner for keeping parcel boundaries, crop rotation, field notes and upcoming operations together.

## Primary user
Small or mid-sized farm manager

## UX direction
Interactive parcel map as the primary surface, with a right-side field dossier showing crop plan, observations and tasks. The map selects the active parcel; the side panel changes to its agronomic record.

## Core data model
Farm, Field, Boundary, CropSeason, CropPlan, Variety, FieldTask, FieldObservation, SoilSample, YieldRecord

## Required user flows
Select a parcel; inspect area and crop plan; review field operations; add a task; record a field observation; switch season.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/38-field-planner.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
Map boundaries and agronomic values are fictional. This is planning/admin software, not automated machinery control or agronomic advice. Production should use spatially valid geometries, units, crop-rotation history and field-level permissions.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Implement a parcel selector with local vector boundaries, crop plan and task/observation workflow. Test field ownership, area units, task assignment and season transitions.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/38-field-planner.html`
