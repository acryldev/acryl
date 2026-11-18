# 82. Monitoring Software — Signalglass

## Product purpose
Observability workspace for infrastructure, network, application, security and user signals.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Infrastructure monitoring, network monitoring, application monitoring, security monitoring, user monitoring, synthetic monitoring, uptime monitoring

## UX direction
Time-series dashboard with service health strip, metric charts, alert stream and trace detail.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Change time range; filter alerts; inspect a trace; acknowledge a demo alert.

## Domain model
Monitor, MetricSeries, Alert, SyntheticCheck, Trace

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
Synthetic telemetry only; alert acknowledgement is local demo state.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
