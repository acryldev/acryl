# 40 — SIM Inventory

**ACRYL Blend ID:** `acrylblends.sim-inventory`  
**Category:** Telecom software

## Product objective
SIM and mobile-number inventory for tracking carrier, plan, assignment, lifecycle status and recurring monthly cost.

## Primary user
IT administrator or telecom operations coordinator

## UX direction
High-density inventory table as the primary surface, with a SIM profile drawer for assignment and suspend/reactivate actions. This is an asset register, not a subscriber-facing portal.

## Core data model
SIM, PhoneNumber, ICCID, Carrier, Plan, Assignment, Device, LifecycleStatus, RecurringCharge

## Required user flows
Search by phone number, user or ICCID; filter by lifecycle status; inspect SIM details; change assignment; suspend/reactivate; add inventory record; export CSV.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/40-sim-inventory.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
Phone numbers and ICCIDs are synthetic reserved-looking demo placeholders, not provisioned numbers. Production should encrypt identifiers, restrict access to telecom metadata, validate carrier provisioning state and log lifecycle actions.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Create a SIM asset register with searchable inventory, details drawer, assignment and lifecycle controls, plus CSV export. Test unique ICCID constraints, assignment changes, and suspend/reactivate audit events.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/40-sim-inventory.html`
