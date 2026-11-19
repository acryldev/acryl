# 34 — Trip Planner

**ACRYL Blend ID:** `acrylblends.trip-planner`  
**Category:** Travel software

## Product objective
Personal itinerary planner combining day-by-day stops, booking references and a practical packing checklist.

## Primary user
Independent travellers, couples or small groups

## UX direction
Travel journal / itinerary composition: trip collection on the left, scenic trip header and day tabs in the centre, essentials and packing list in a side rail. The day timeline is the core interaction.

## Core data model
Trip, Day, Stop, Place, Booking, Traveller, PackingItem, Note

## Required user flows
Switch trip days; inspect chronological stops; add and reorder stops by time; tick packing items; inspect bookings and travel notes.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/34-trip-planner.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
No live booking or map API is required. Show local demo data and make travel times/forecasts explicitly illustrative. Production should preserve time zones per stop and support offline access and collaborative editing.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Implement a multi-day itinerary with editable stops, local packing checklist and booking notes. Add tests for date ordering, stop ordering and checklist persistence.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/34-trip-planner.html`
