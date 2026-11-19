# 62. Mobile software — Mobiary

## Product intent
A mobile-first personal field journal prototype demonstrating native-feeling navigation, widgets, quick capture and a responsive companion dashboard.

**Audience:** Mobile product teams, field workers and users who capture short notes while moving.

**Positioning:** A compact mobile companion for the moments between meetings.

## UX architecture
A device-first prototype: realistic phone bezel and touch-sized screen on the left, feature configuration and widget controls on the right.

### Screens and regions
1. Mobile home with daily focus and quick actions
2. Capture view for a note, photo placeholder or voice memo
3. Activity list and saved entries
4. Profile and widget preferences

## Core workflows
1. Switch between Home, Activity and Profile tabs in the device preview.
2. Create a quick note and see it appear in the activity list.
3. Add or remove home widgets from the companion controls.
4. Toggle compact mode and notification preference.

## Domain model
UserProfile, JournalEntry, MobileWidget, DevicePreference, ActivityItem. Store UI state and demo entries locally in the prototype.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
The device is a responsive web mockup, not an installed native or hybrid application. Camera and microphone actions are simulated; no device permissions or data collection.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Build a mobile-first navigation shell with accessible touch targets and safe-area-aware layout.
2. Implement offline-first journal entries with local persistence and queued sync state.
3. Create widget configuration and device capability adapters with tests for mobile and desktop breakpoints.

## Prototype reference
- Standalone mockup: `../mockups/mobile-mobiary.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
