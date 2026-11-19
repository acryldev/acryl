# 81. Operating / Management Consoles — Controlroom

## Product purpose
Command-center console for managing environments, services, users and operational actions.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Admin dashboards, control panels, management interfaces, command centers, operations consoles

## UX direction
Dense command center with environment switcher, service tiles, activity feed and action drawer.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Switch environment; inspect service; stage a controlled action; review audit trail.

## Domain model
Environment, Service, Operator, ActionLog

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
No real infrastructure actions; destructive controls are simulated and require a confirmation step.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
