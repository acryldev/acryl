# 67. Human-computer interaction software — Sensepath Lab

## Product intent
An interaction research workbench for reviewing input modalities, running a simulated task and comparing accessibility and usability signals.

**Audience:** HCI researchers, product designers, accessibility practitioners and prototyping teams.

**Positioning:** Prototype the interface between human intent and machine response.

## UX architecture
A research lab layout with modality selector, task-stage display, calibration controls and a measured-session summary.

### Screens and regions
1. Input modality overview
2. Speech, gesture, gaze, haptic and alternative interaction panels
3. Task run and calibration feedback
4. Session observations and comparison

## Core workflows
1. Choose a modality and inspect its requirements and feedback loop.
2. Run a short local task simulation for the selected modality.
3. Adjust sensitivity or feedback settings.
4. Save an observation and compare the session summary.

## Domain model
Modality, InteractionProfile, Calibration, TaskScenario, SessionRun, Observation. Track synthetic timing and completion events without collecting real user signals.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
All modality activity is simulated. No microphone, camera, eye tracking, brain-computer interface, haptic device or biometric input is accessed. Sample metrics are illustrative and not clinical or scientific evidence.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Design a modality adapter interface that separates device-specific input from normalized interaction events.
2. Implement synthetic task scenarios and session metrics for keyboard, speech, gaze and gesture prototypes.
3. Add accessible modality settings, consent gates for any future device integration and unit tests around normalized events.

## Prototype reference
- Standalone mockup: `../mockups/hci-sensepath-lab.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
