# 87. Research Software — Fieldnotes

## Product purpose
Research library for literature discovery, citations, notebooks, experiments and lab work.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Literature search, citation management, reference management, academic discovery, research notebooks, experiment management, lab management

## UX direction
Academic reading desk with source list, abstract preview, citation drawer and notebook.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Filter literature; save a citation; annotate a source; add an experiment note.

## Domain model
Source, Citation, Note, Experiment, LabRecord

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
Seed references are fictional examples, not claims of real publications.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
