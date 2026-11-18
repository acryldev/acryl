# 13 · Media — Photo Gallery

**Blueprint ID:** `acrylblends.photo-gallery`  
**Category:** `media`  
**Reference concept:** Photo Gallery

## Product job
Browse photographs by album and category, upload assets, and inspect full-resolution images in a lightbox.

## UX direction
Editorial, image-first library. Use a charcoal canvas, minimal chrome, left album rail, masonry image grid, restrained metadata and a full-screen lightbox. The image content—not cards and tables—dominates the screen.

## Screens and routes
1. Library: albums, filters, masonry grid, favourites and storage. 2. Lightbox: large image, filename, date, dimensions, tags, previous/next. 3. Album detail: image collection and album metadata.

## Domain model
Photo(id, filename, source, thumbnail, width, height, sizeBytes, albumId, capturedAt, tags, favourite, description); Album(id, name, coverPhotoId, photoCount); Tag(id, label).

## Primary interactions
Switch album/category; open and close lightbox; navigate previous/next; favourite photo; search by filename/tag; add photo through upload flow.

## Seed data
Provide enough realistic fixture data that the first screen is useful immediately: at least 5 records in the primary collection, 3 related records, meaningful dates/statuses, and one non-empty detail view. Do not rely on external API keys or paid services.

## States to implement
- First-run state with seeded content visible.
- Empty state for a genuinely empty filtered result.
- Validation state for invalid input.
- Success feedback after a local mutation.
- Error state for a failed persistence or import operation.

## Boundaries and safety
The demo may use remote sample imagery, but the real app should store uploaded originals and generated thumbnails locally or via a configured storage provider. Keep EXIF/private metadata access explicit.

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
