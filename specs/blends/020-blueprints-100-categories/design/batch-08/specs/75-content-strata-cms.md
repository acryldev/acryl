# 75. Content management — Strata CMS

## Product intent
A headless content management workbench for editing structured entries, managing collections, reviewing drafts and previewing channel output.

**Audience:** Content teams, editors, product marketers and developers building content-driven experiences.

**Positioning:** Structure content once. Publish it anywhere.

## UX architecture
A content studio with a collection rail, structured entry editor and live preview pane. The key interaction is editing schema-driven fields and switching preview channels.

### Screens and regions
1. Collection overview with drafts and scheduled entries
2. Structured content editor with schema fields
3. Channel preview for web and mobile
4. Editorial review and publishing queue

## Core workflows
1. Choose a collection and open an entry.
2. Edit structured fields and inspect validation feedback.
3. Switch the preview between web and mobile renderings.
4. Submit the draft for review or publish the seeded demo entry.

## Domain model
Collection, ContentType, FieldDefinition, Entry, Revision, Publication, ChannelPreview, EditorialReview.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Seeded fictional content only. Publishing actions update local demo state; there is no external CMS delivery, public posting or third-party API call.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement schema-driven content types with typed field definitions and validation.
2. Build a revision-aware entry editor with local web/mobile preview rendering.
3. Add editorial workflow states, publication scheduling and tests for required fields and revisions.

## Prototype reference
- Standalone mockup: `../mockups/content-strata-cms.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
