# 76. File software — Filewell

## Product intent
A desktop-style file manager prototype covering folder navigation, metadata, duplicate review, file conversion queue and synchronization status.

**Audience:** Knowledge workers and teams managing local project files and shared folders.

**Positioning:** Find, organize and understand your files.

## UX architecture
A dual-pane file manager with a navigable folder tree, dense file table, metadata inspector and a bottom action tray for organize/convert/sync operations.

### Screens and regions
1. Folder tree and file listing
2. File detail and metadata inspector
3. Duplicate review and cleanup candidates
4. Conversion and sync task queue

## Core workflows
1. Navigate through the seeded project directory tree.
2. Select files and inspect metadata, versions and tags.
3. Review potential duplicates without deleting automatically.
4. Queue a demo conversion or synchronization task and inspect its status.

## Domain model
FileNode, Folder, FileVersion, MetadataRecord, DuplicateCandidate, ConversionJob, SyncJob.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Never access the host filesystem. Use synthetic file entries and local-only demo actions. Duplicate cleanup is review-only and must not silently delete files.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a virtual filesystem tree with stable node IDs and breadcrumb navigation.
2. Build metadata and duplicate-candidate services using seeded file fingerprints.
3. Add conversion/sync queues with cancel/retry states and tests that ensure no destructive default action.

## Prototype reference
- Standalone mockup: `../mockups/file-filewell.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
