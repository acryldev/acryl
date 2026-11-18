# 88. Information-management Software — Indexia

## Product purpose
Enterprise information map for PIM, ECM, DAM, MDM, CMS, knowledge and records.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
PIM, ECM, DAM, MDM, CMS, knowledge management, records management

## UX direction
Information architecture console with entity graph, schema browser, lineage and record detail.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Browse entity types; inspect a record; trace lineage; review retention metadata.

## Domain model
EntityType, Record, Relationship, Policy, LineageEvent

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
Demo records only; retention and governance policies are illustrative.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
