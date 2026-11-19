# 02 — Application: Productivity Hub

**Blueprint id:** `acrylblends.productivity-hub`  
**Concept:** A personal workbench unifying quick capture, a focused task list, lightweight notes and a week calendar.

## Intent
A lightweight personal workspace; the user starts with their day, not a report. One focus outcome, next actions, recent notes and calendar context stay visible without project-management complexity.

## Primary
My Day: warm personal workspace with quick capture, daily focus, task checklist, recent note cards and right-side weekly agenda.

## Support
Inbox capture/triage; note editor with linked tasks; full week calendar with time blocks and overlap warnings.

## Visual
Paper-like warm neutral background, serif editorial headings, sage focus card, pastel notes; restrained visual density and calm personal tone.

## Flows
Quick capture → triage into task or note → assign date/project → complete from My Day. Create calendar event → detect overlap → confirm/save.

## Data
Task(id,title,status,dueAt,priority,projectId,estimateMinutes); Note(id,title,body,updatedAt,projectId,tags); Event(id,title,startAt,endAt,calendarId); Project(id,name,color).

## Seed
Three spaces, six tasks, four notes and one week of meetings/focus blocks.

## States
Inbox count, empty today, task completion, overdue item, calendar overlap, unsaved note, capture shortcut.

## Routes
`/` My Day; `/inbox`; `/tasks`; `/notes/:id`; `/calendar`.

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
