# 36 — Listings

**ACRYL Blend ID:** `acrylblends.listings`  
**Category:** Real-estate software

## Product objective
Property listing browser for filtering homes by area, property type, price and bedroom count, then inspecting a property and requesting a viewing.

## Primary user
Prospective buyers and real-estate agents

## UX direction
Consumer-facing listing catalogue with a narrow filter rail and image-led property cards. A property detail drawer provides facts and enquiry action. It should look like a listings product, not an agent CRM.

## Core data model
Property, Address, Listing, MediaAsset, Feature, Price, Enquiry, SavedListing

## Required user flows
Filter by property type, maximum price and bedrooms; inspect listing details; save a home; submit a viewing enquiry.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/36-listings.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
All properties and addresses are fictional demo records. Production must distinguish asking price from fees, respect listing publication/expiry state, and apply consent and contact controls to enquiries. Mockup photos are CSS art placeholders.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Implement a responsive property catalogue, filters, save action and detail/enquiry drawer. Add tests for filter composition, saved-listing state and enquiry validation.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/36-listings.html`
