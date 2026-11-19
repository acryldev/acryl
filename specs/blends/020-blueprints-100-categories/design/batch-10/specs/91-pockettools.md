# 91. Utilities — PocketTools

> **Concept:** Small tools. Zero ceremony.

## Product purpose
Fast desktop utilities for calculations, conversions, clipboard snippets and quick-launch actions.

## Intended audience
Developers and operations staff

## Category coverage
Calculators; Converters; Clipboard managers; Launchers; Screenshot tools; Screen recorders; File finders; System cleaners; Archive tools.

## Primary screens
- Tool shelf
- Converter
- Clipboard drawer

## Core workflows
1. Open a utility
2. Convert values
3. Pin a snippet
4. Launch a local action

## Suggested domain model
- `Tool`
- `ConversionPreset`
- `ClipboardSnippet`
- `LaunchAction`

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
1. Add timezone conversion presets.
2. Add keyboard-first command search.
3. Add snippet collections.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/91-pockettools.html`
- Category ID: `91`
- Slug: `pockettools`
