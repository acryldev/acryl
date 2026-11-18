# 63. Desktop software — Canvasmith Desktop

## Product intent
A desktop application shell prototype with project navigation, asset thumbnails, a central editing canvas and contextual property controls.

**Audience:** Designers, desktop-product teams and developers exploring native, Electron or Tauri application UX.

**Positioning:** A focused desktop workspace for building and organizing visual assets.

## UX architecture
A dense desktop window with familiar native chrome, project sidebar, central canvas, inspector and bottom asset strip.

### Screens and regions
1. Project and file navigation
2. Asset canvas with selection and zoom
3. Layer and object inspector
4. Asset export and activity panel

## Core workflows
1. Select a project asset from the left sidebar.
2. Select a layer to inspect and edit its properties.
3. Change zoom and toggle the layer list.
4. Create an asset card and export a simulated preview.

## Domain model
DesktopProject, Asset, Layer, Property, ExportPreset, RecentFile. Model window state and selected asset independently from persistent project data.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
A browser-based desktop UI simulation only. It does not access the local filesystem, OS window manager, clipboard or native export APIs.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Create a cross-platform desktop shell with explicit platform abstraction boundaries for Electron and Tauri.
2. Implement typed project, asset and layer models with undoable inspector edits.
3. Add local file adapter interfaces and export-preset tests without coupling domain logic to the host runtime.

## Prototype reference
- Standalone mockup: `../mockups/desktop-canvasmith.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
