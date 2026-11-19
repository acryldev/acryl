# 64. Web software — Pagefoundry

## Product intent
A browser-based website builder prototype with page navigation, a live page preview, block insertion and a right-side design inspector.

**Audience:** Small teams, designers and developers creating websites, SaaS pages and portals.

**Positioning:** Shape a web experience, block by block.

## UX architecture
A visual web editor with a left page/block navigator, centered browser-like page canvas and inspector on the right.

### Screens and regions
1. Site map and page selector
2. Live website canvas with selectable sections
3. Block library and insertion controls
4. Theme and publish settings

## Core workflows
1. Switch between Home, Features and Pricing pages.
2. Select a hero, feature grid or CTA section in the preview.
3. Insert a new section and change its headline or background theme.
4. Toggle preview mode and publish a simulated build.

## Domain model
Site, Page, Section, Block, ThemeToken, PublishVersion. Represent page structure as ordered blocks with schema-defined editable properties.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
The builder edits local demo state only. Publishing is simulated; no external hosting, analytics, form submissions or third-party services.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a schema-driven page builder with reusable block types and serializable page documents.
2. Create an editor state model with selection, insertion, deletion and undo/redo operations.
3. Build responsive rendering and a deterministic static-export pipeline with page-schema tests.

## Prototype reference
- Standalone mockup: `../mockups/web-pagefoundry.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
