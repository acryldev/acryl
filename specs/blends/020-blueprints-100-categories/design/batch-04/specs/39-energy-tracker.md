# 39 — Energy Tracker

**ACRYL Blend ID:** `acrylblends.energy-tracker`  
**Category:** Energy software

## Product objective
Building-level energy usage tracker that compares consumption periods, estimates cost from an indicative tariff and records manual meter readings.

## Primary user
Facility manager or small property operator

## UX direction
Energy operations console with a deep-colour consumption headline, period selector, hourly usage chart and end-use breakdown. The chart is the main analytical surface.

## Core data model
Site, Meter, MeterReading, ConsumptionInterval, Tariff, CostEstimate, EndUseCategory, PeriodComparison

## Required user flows
Switch day/week/month views; switch chart metric between energy and cost; inspect end-use shares; record a manual meter reading.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/39-energy-tracker.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
Mock data is illustrative and cost is an estimate, not a bill. Production requires unit normalization, meter rollover handling, tariff effective dates, interval aggregation and explicit missing-data treatment.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Build an energy dashboard with period aggregation, a usage chart and manual meter-reading entry. Test kWh conversion, period boundaries, tariff calculations and invalid readings.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/39-energy-tracker.html`
