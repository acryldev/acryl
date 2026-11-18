# 35 — Reservations

**ACRYL Blend ID:** `acrylblends.reservations`  
**Category:** Hospitality software

## Product objective
Restaurant reservation and table-management tool for planning a service, seating guests and reviewing the upcoming book.

## Primary user
Restaurant host or floor manager

## UX direction
Restaurant floor plan is the centre of the application. Clickable tables show capacity and seating state; a right-hand service list shows upcoming bookings. This is a spatial seating workflow, not a calendar dashboard.

## Core data model
Reservation, Guest, Table, Seating, ServicePeriod, PartySize, ReservationStatus, WaitlistEntry

## Required user flows
Choose a service time; inspect table availability; select a table; review upcoming bookings; add a reservation; clear selection.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/35-reservations.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
Table availability must be computed from overlapping reservation intervals and seating duration, not just a static status. The mockup is a local single-service simulation with synthetic guests; production should support table combinations, deposits and no-show policies.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Build an interactive floor plan and reservation list, with time-slot-aware table allocation. Add overlap and capacity tests, including combined tables and walk-in holds.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/35-reservations.html`
