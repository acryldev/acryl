# 31 — Quote Builder

**ACRYL Blend ID:** `acrylblends.quote-builder`  
**Category:** Sales software

## Product objective
Quote editor with live commercial calculations and a client-facing proposal preview

## Primary user
Sales coordinator / account executive at a small service business

## UX direction
A two-pane document workspace: editable commercial line items on the left, a polished quote preview on the right. Treat the quote document—not a dashboard—as the primary workspace.

## Core data model
Quote, QuoteLine, Customer, ProductOrService, TaxRule, Discount, QuoteStatus, PaymentTerm

## Required user flows
Select a customer; edit reference and validity; add, edit and remove line items; calculate subtotal, percentage discount, VAT and total; save a local draft; mark ready to issue; print the preview.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/31-quote-builder.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
Use integer minor currency units in a production implementation. Keep tax rates configurable by jurisdiction and quote date. Validate quantities and rates as non-negative. Do not imply tax or legal advice. The mockup uses EUR and indicative Austrian VAT options.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Create a responsive quote editor with live totals and a printable proposal view. Persist locally for the demo; production should have customer/product selectors, immutable issued snapshots, version history, quote acceptance and PDF rendering.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/31-quote-builder.html`
