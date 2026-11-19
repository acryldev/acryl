# 100. Meta-software — MetaForge

> **Concept:** Build the tools that build software.

## Product purpose
A developer workbench for editing a DSL, compiling it into an app scaffold and inspecting build outputs.

## Intended audience
Framework authors and developer-experience teams

## Category coverage
Compilers; IDEs; Build systems; Package managers; Operating systems; Hypervisors; AI coding agents; Software factories; Programming languages; DSLs; Low-code systems; Runtime generators; Code generators.

## Primary screens
- Project workspace
- DSL editor
- Build graph and output

## Core workflows
1. Edit DSL
2. Run parser/compiler passes
3. Inspect build graph
4. Compare generated output

## Suggested domain model
- `Workspace`
- `SourceFile`
- `BuildTarget`
- `CompilerPass`
- `BuildArtifact`

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
1. Add grammar diagnostics.
2. Add incremental compilation status.
3. Add package publishing.

## Design direction
The prototype uses a category-specific visual language and interaction model. Treat it as a starting point, not a production design system.

## Files
- Prototype: `mockups/100-metaforge.html`
- Category ID: `100`
- Slug: `metaforge`
