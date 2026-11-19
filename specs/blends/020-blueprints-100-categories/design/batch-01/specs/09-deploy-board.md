# 09 — DevOps: Deploy Board

**Blueprint id:** `acrylblends.deploy-board`  
**Concept:** A release operations console that tracks deployments by service and environment with a chronological activity feed and incident response.

## Intent
A release operations room for tracking deployments and responding to incidents. It is environment-centric and chronological, with a real status hierarchy.

## Primary
Environment release board with columns for Development, Staging and Production; service cards show deployed/building/failed state, version, commit and actor.

## Support
Active incident queue and detail; chronological event timeline; service inventory; environment config; release/change calendar.

## Visual
Technical operations console with dark header, environment columns, CI state labels and a dedicated incident rail. Status colours are semantically consistent.

## Flows
Register service/environment → queue build/deploy → show progress/result → health-check deployment → raise incident on failure → assign/respond → promote or roll back with approval.

## Data
Service(id,name,repository,owner); Environment(id,name,region); Deployment(id,serviceId,environmentId,version,commit,status,startedAt,finishedAt,actor,logs); Incident(id,serviceId,environmentId,severity,status,summary,assignee,openedAt); Event(id,type,entityId,message,at).

## Seed
3 services × 3 environments, 18 daily deployments, one failed staging deployment, two active incidents and a chronological event feed.

## States
Queued/building/succeeded/failed/cancelled; health check timeout; incident acknowledged/resolved; approval required for production rollback.

## Routes
`/deployments`; `/services`; `/incidents`; `/incidents/:id`; `/environments`; `/events`.

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
