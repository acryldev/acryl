# 85. Workflow Software — Flowstate

## Product purpose
Workflow orchestration studio for human, machine, developer, AI and durable workflows.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Human workflow, machine workflow, business workflow, developer workflow, AI workflow, durable workflows

## UX direction
Node-based workflow designer with step inspector, run history and state timeline.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Add a step; connect nodes; validate graph; run a simulated workflow.

## Domain model
Workflow, Node, Edge, Run, StepState

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
Execution is simulated; no external actions or live agents.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
