# 92. Emulation software — CompatLab

> **Concept:** Reproduce. Inspect. Compare.

## Product purpose
A test bench for launching emulated devices and comparing software behaviour across machine profiles.

## Intended audience
QA engineers and retro-computing researchers

## Category coverage
Console emulators; CPU emulators; OS emulators; Terminal emulators; Hardware simulators; Compatibility layers.

## Primary screens
- Emulator bench
- Machine profiles
- Session trace

## Core workflows
1. Choose a machine profile
2. Boot a sandboxed session
3. Attach a peripheral
4. Inspect trace events

## Suggested domain model
- `MachineProfile`
- `EmulationSession`
- `Peripheral`
- `TraceEvent`

## Implementation guidance
- Keep the information architecture specific to this category; do not replace it with a generic dashboard.
- Start with seeded local data and define adapter boundaries before optional integrations.
- Add accessible keyboard paths, focus states and responsive layouts.
- Include loading, empty, error and permission-denied states.
- Keep credentials out of the client. Integrations must be opt-in.

## Acceptance checks
- [ ] Core workflows can be completed without a paid API key.
- [ ] Primary views work at desktop and narrow mobile widths.
- [ ] Demo data is clearly identified as illustrative.
- [ ] State changes are reflected in the interface and can be reset.

## Agent prompts
1. Add CPU architecture presets.
2. Add deterministic session snapshots.
3. Add side-by-side profile comparison.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/92-compatlab.html`
- Category ID: `92`
- Slug: `compatlab`
