# 83. Optimization Software — Optima

## Product purpose
Operations-research workbench for comparing resource allocation and routing scenarios.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Scheduling, routing, resource allocation, mathematical optimization, constraint solving, operations research

## UX direction
Scenario canvas with decision variables, constraints, objective function and solution comparison.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Edit capacity; toggle a constraint; run a local illustrative solver; compare outcomes.

## Domain model
Scenario, Variable, Constraint, Objective, Solution

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
Results are illustrative heuristics, not certified optimization advice.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
