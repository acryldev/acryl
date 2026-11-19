# 33 — Shipments

**ACRYL Blend ID:** `acrylblends.shipments`  
**Category:** Logistics software

## Product objective
Shipment control tower that tracks parcel movement, milestones, carrier exceptions and estimated delivery.

## Primary user
Small fulfilment team or logistics coordinator

## UX direction
Operations control tower: shipment table on the left, selected shipment route and milestone history on the right. Prioritise scan status and exceptions over a generic analytics dashboard.

## Core data model
Shipment, Parcel, Carrier, Route, TrackingEvent, DeliveryEstimate, Exception, Recipient

## Required user flows
Search shipments; filter by state; select a shipment; inspect tracking milestones; record a demo scan; flag an exception; create a draft shipment.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/33-shipments.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
Tracking map is an illustrative route, not live geolocation. Production integrations should normalize carrier events, deduplicate webhook deliveries, preserve raw event payloads and distinguish estimated from confirmed delivery times.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Build a local shipment control tower with carrier-neutral records, event timeline and exception workflow. Seed realistic but synthetic shipments; test event ordering, status mapping and duplicate scan handling.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/33-shipments.html`
