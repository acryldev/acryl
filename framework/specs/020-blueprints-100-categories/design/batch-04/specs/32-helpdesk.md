# 32 — Helpdesk

**ACRYL Blend ID:** `acrylblends.helpdesk`  
**Category:** Customer service software

## Product objective
Shared support inbox for triaging customer questions, replying in context and managing ticket ownership and status.

## Primary user
Small customer-support team

## UX direction
Three-pane support inbox: compact navigation rail, searchable ticket queue, central email-style conversation thread and ticket properties panel. The conversation is the primary canvas.

## Core data model
Ticket, Customer, Message, Assignee, Priority, Status, Tag, OrderReference

## Required user flows
Search tickets; filter by status; open a ticket; inspect customer context; change priority, assignee and status; add a reply; resolve or snooze the ticket.

## MVP scope
- Deliver a standalone, responsive application with 2–5 meaningful screens or states.
- Seed believable synthetic data so the application is useful immediately after launch.
- Implement the primary interaction model shown in `../mockups/32-helpdesk.html`; do not flatten it into a generic dashboard.
- Include create/edit/update actions for the central record and useful empty, loading or validation states.
- Provide local persistence for the starter or a clearly isolated repository adapter for later replacement.
- Include a README with purpose, target user, data model, local run steps, limitations and three example prompts for an AI coding agent.

## Implementation notes and constraints
Use synthetic customers and example.test email addresses only. Keep message history append-only. In production, enforce tenant scoping, role-based access, PII retention controls, safe attachment handling and an auditable status history.

## Acceptance criteria
1. A new user can understand the product's primary job from the first screen without setup.
2. The core flow can be completed with seeded data and without paid APIs or external credentials.
3. All visible controls either perform an action or are clearly presented as navigation placeholders in the prototype.
4. Domain calculations and state transitions are covered by tests; primary routes and major interactions have route or integration tests.
5. The UI is responsive, keyboard-usable and has accessible labels for form controls.
6. The implementation is independent of the mockup's inline script and is built using the selected ACRYL Blend composition.
7. Add a registry entry and screenshots only after the standalone app and tests pass.

## Agent implementation brief
Implement a three-pane helpdesk with seeded tickets, thread rendering, search/filter, property updates and reply composition. Add domain tests for status transitions, assignment and message ordering.

## Example prompts for the app README
- “Walk me through the main workflow and explain what each record represents.”
- “Add validation and tests for the core domain rules without changing the product's interaction model.”
- “Add an export or reporting feature that follows the current visual language.”

## Reference prototype
`mockups/32-helpdesk.html`
