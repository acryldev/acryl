# 47. Bento Builder

**Category:** Low-code / no-code software  
**Blueprint ID:** `acrylblends.lowcode.bentobuilder`  
**Mockup:** `mockups/47-lowcode-bentobuilder.html`

## Product purpose
A visual internal-tool builder for composing a small operations portal from reusable components bound to simple data sources.

## Primary audience
Operations teams and internal-tool builders

## UX direction
Three-panel app builder: component palette, live application canvas and component inspector. This composes application UI, not process automations.

## Primary data model
App, Page, Component, ComponentProperty, DataSource, FieldBinding, LayoutNode, Deployment

## Core user flows
Add a metric, table, chart, form or task-list component; select a widget; edit its title; preview; undo the latest addition; publish demo state.

## Implementation constraints and boundaries
The canvas uses sample data and component definitions. No production code generation or deployment occurs. Production needs schema validation, component permissions, responsive constraints, versioning and safe execution.

## Suggested implementation slices
1. Define typed domain models and seed a compact, realistic demo dataset.
2. Implement the primary workflow and its state transitions without requiring third-party credentials.
3. Add route/domain tests for the core transitions and validation rules.
4. Add responsive empty, loading, error and success states; document all demo-only behavior.
5. Add a README explaining the app, intended user, local run steps and three useful coding-agent prompts.

## Acceptance criteria
- The primary workflow can be completed with seeded local data.
- The interface has distinct, category-appropriate information architecture rather than a generic dashboard template.
- Core actions produce visible state changes and handle invalid or empty input.
- No paid API key or external account is required for the demo.
- Domain behavior is covered by focused tests and the README documents limitations.
