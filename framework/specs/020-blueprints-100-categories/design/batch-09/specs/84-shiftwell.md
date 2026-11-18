# 84. Scheduling Software — Shiftwell

## Product purpose
Workforce and appointment scheduling planner with coverage and conflict detection.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Workforce scheduling, appointment scheduling, production scheduling, CPU scheduling, job scheduling, cloud workload scheduling

## UX direction
Drag-and-drop weekly rota with staff lanes, availability, coverage and conflict sidebar.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Move a shift; assign a person; detect overlap; inspect coverage gaps.

## Domain model
Person, Shift, Availability, Requirement, Conflict

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
Demo schedule only; no real employee or patient records.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
