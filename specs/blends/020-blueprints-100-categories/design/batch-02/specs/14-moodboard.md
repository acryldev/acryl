# 14 · 3D / CAD / Design — Moodboard

**Blueprint ID:** `acrylblends.moodboard`  
**Category:** `3d-cad-design`  
**Reference concept:** Moodboard

## Product job
Arrange reference images, colours, notes and visual ideas on a spatial canvas for a design project.

## UX direction
Freeform studio canvas, not a dashboard. Warm paper-like background, visible object layers, draggable free-positioned objects, palette rail and sparse project controls.

## Screens and routes
1. Board canvas: drag/reposition image, note, palette, text and link objects. 2. Assets: reference image and colour library. 3. Board settings: title, dimensions, collaborators and export.

## Domain model
Board(id, title, projectId, width, height, background); BoardObject(id, boardId, type, x, y, width, height, zIndex, content, assetId, style, rotation); Asset(id, kind, url, filename, colorValue, tags).

## Primary interactions
Drag objects; add object types; edit note text; select colours; reorder layers; save board; duplicate object. Keep canvas positions and object types explicit in persisted data.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
No heavyweight 3D/CAD engine is implied. This category concept is a lightweight design-reference board. Use seeded visual assets and ensure canvas objects remain keyboard-selectable and accessible.

## ACRYL implementation handoff
- Start from the published `acrylblends` blank template unless the feature genuinely requires the agent template.
- Implement the domain capability as one focused Cordis plugin, with domain logic separated from route rendering.
- Keep external effects behind injected/configured interfaces so route and domain tests can use fakes.
- Keep the first page at `/`; use the additional routes listed above only where they provide a distinct workflow.
- Use the existing ACRYL Blends router, state and database ports. Do not add a second application framework.
- Add domain tests and route tests; assert the seed data and important workflow transitions.
- No third-party sign-in, external account requirement or mandatory API key.

## Acceptance checklist
- [ ] First page loads with useful seeded data.
- [ ] Main task can be completed without setup or external credentials.
- [ ] The primary interaction is implemented, not just styled.
- [ ] Domain operations are tested independently from the UI.
- [ ] Every route and validation state is tested.
- [ ] README includes purpose, audience, setup and three example prompts for extending the app.
- [ ] Screenshot shows the distinctive primary workflow.
