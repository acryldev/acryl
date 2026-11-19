# 66. Extended reality software — Luma Space

## Product intent
An XR scene-composition prototype for arranging spatial anchors, switching between AR/VR/MR modes and inspecting object placement in a stylized viewport.

**Audience:** XR designers, spatial-computing developers and teams prototyping immersive product concepts.

**Positioning:** Compose spatial experiences from scenes, anchors and interactions.

## UX architecture
An immersive dark scene editor with a large spatial viewport, floating scene object list and contextual transform inspector.

### Screens and regions
1. Scene viewport and camera mode selector
2. Spatial object and anchor hierarchy
3. Transform inspector for position, scale and rotation
4. Interaction preview and scene validation

## Core workflows
1. Switch between AR, VR and MR preview modes.
2. Select scene objects and inspect their transform values.
3. Add a new spatial anchor to the scene.
4. Adjust the world scale and run a local interaction preview.

## Domain model
XRScene, SceneObject, SpatialAnchor, Transform3D, Interaction, PreviewMode. Keep coordinates in a typed 3D vector and units explicit.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
The viewport is a visual 3D-style mockup, not a real XR session. No camera passthrough, tracking, eye data, biometric input or physical-world mapping. Do not claim AR safety or spatial accuracy.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a scene graph with stable object IDs, parent-child transforms and explicit meter units.
2. Build an XR preview-state controller for AR, VR and MR modes without requiring a hardware runtime.
3. Add scene serialization, anchor validation and tests for transform composition and scale boundaries.

## Prototype reference
- Standalone mockup: `../mockups/xr-luma-space.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
