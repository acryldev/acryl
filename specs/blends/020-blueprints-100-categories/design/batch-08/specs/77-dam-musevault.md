# 77. Digital asset management — Musevault DAM

## Product intent
A visual digital asset library for images, video, brand kits and campaign files, with metadata filters, rights windows and usage tracking.

**Audience:** Brand teams, creative studios, marketing departments and asset librarians.

**Positioning:** Keep creative assets searchable, approved and licensed.

## UX architecture
An image-led masonry library with a left filter rail and a rich asset detail drawer. Rights and usage are first-class, distinct from ordinary file management.

### Screens and regions
1. Visual asset library with collections and facets
2. Asset detail with metadata, tags and rendition previews
3. Rights and expiry calendar
4. Usage history and approval state

## Core workflows
1. Browse a seeded visual collection and filter by asset type or campaign.
2. Open an asset and inspect tags, rendition sizes and rights holder.
3. Review an expiring license and record a renewal reminder.
4. Inspect where an asset has been used and its approval status.

## Domain model
Asset, Rendition, Collection, Tag, RightsRecord, LicenseWindow, UsageRecord, Approval.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Use generated or abstract visual placeholders and synthetic rights holders. No real copyrighted content, personal likeness or actual license claims. Rights status is sample data only.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement an asset catalog with faceted search, collections and rendition metadata.
2. Create a rights model with territory, permitted usage, expiry and reminder events.
3. Add approval and usage-history views with tests for expired and restricted assets.

## Prototype reference
- Standalone mockup: `../mockups/dam-musevault.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
