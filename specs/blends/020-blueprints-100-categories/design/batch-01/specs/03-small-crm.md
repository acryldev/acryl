# 03 — Business: Small CRM

**Blueprint id:** `acrylblends.small-crm`  
**Concept:** A B2B relationship manager with companies, contacts, deal stages, ownership and next actions.

## Intent
A relationship-first CRM for a small sales team. Pipeline is the default work surface; deal movement, ownership, value and next action are visible without opening every record.

## Primary
Four-stage Kanban opportunity pipeline with a right inspector for selected deal value, stage, owner, contacts, next action and recent activity.

## Support
Contacts directory; company profile with linked contacts/deals; activity timeline and follow-up queue; lightweight pipeline report.

## Visual
Cool white B2B interface, blue selection, company identity marks and compact deal cards. This is a distinct pipeline/inspector pattern.

## Flows
Create contact/company → create deal → assign owner and close date → move through stages → log activity → set next action → mark won/lost.

## Data
Company(id,name,website,industry); Contact(id,companyId,name,email,role); Deal(id,companyId,contactId,title,value,currency,stage,probability,ownerId,closeDate); Activity(id,dealId,type,body,at,ownerId); Task(id,dealId,dueAt,status).

## Seed
Four stages, seven opportunities, six companies, seven contacts, activity history and follow-up due today.

## States
Stage changes, selected inspector, unassigned owner, overdue task, won/lost confirmation, empty filter and orphan contact.

## Routes
`/pipeline`; `/contacts`; `/companies/:id`; `/deals/:id`; `/activities`.

## Build notes for the agent
- Start from the published `acrylblends` blank template and follow `specs/020-blueprints-100-categories/spec.md` plus `cloud-brief.md`.
- Implement domain logic in a focused Cordis plugin; keep the domain separate from the route/view.
- Show useful local seed data on first launch. No required outside account, paid service, or API key.
- Keep external effects behind injected adapters; use fake adapters in tests.
- Implement the screen composition in the mockup; do not replace it with a generic dashboard.
- Cover domain logic and every route with `node:test`; include README, three follow-up prompts and screenshot.

## Acceptance checklist
- [ ] Main screen clearly expresses the category's core job.
- [ ] Primary workflow works with seed data.
- [ ] Appropriate create/edit/search and state transitions work.
- [ ] Empty, validation, success and failure states are handled.
- [ ] `npm test`, `npm run check` and `npm start` pass.
- [ ] Registry metadata and category placement match the task plan.
