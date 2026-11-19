# 04 — Developer: Snippet Manager

**Blueprint id:** `acrylblends.snippets`  
**Concept:** A developer snippet vault with language-aware source previews, tags, reusable variables and fast search.

## Intent
A developer utility, not a general project dashboard. It optimizes discovery and reuse of small code units.

## Primary
Two-pane snippet browser with searchable language list and an editor-style detail view. Code is the visual centre.

## Support
Language and tag filters; collections; recently used; starred; variables/placeholder view; copy and insert actions.

## Visual
Dark editor canvas, syntax colour, line numbers, compact file-list navigation, muted grey chrome and mint accent. Deliberately unlike business UIs.

## Flows
Search or filter → select snippet → inspect code + description + tags → copy or insert → create/edit snippet and assign language/tags.

## Data
Snippet(id,title,description,language,code,tags[],variables[],createdAt,updatedAt,starred); Collection(id,name,snippetIds[]).

## Seed
128 snippets across TypeScript, JavaScript, Python, SQL and Shell; selected retry-with-backoff.ts; collections and recent usage.

## States
No search results, unsaved editor changes, copy confirmation, missing variable, empty collection and delete confirmation.

## Routes
`/snippets`; `/snippets/:id`; `/collections/:id`; `/new`; `/settings/languages`.

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
