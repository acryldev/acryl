# 90. Home Software — HearthOS

## Product purpose
Smart-home control center for automation, security, energy, media and NAS.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Home automation, smart-home control, home security, energy monitoring, media servers, NAS management

## UX direction
Room-based home overview with device controls, automation timeline, energy meter and NAS status.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Toggle a demo device; trigger a scene; inspect a security event; view energy use.

## Domain model
Room, Device, Automation, SecurityEvent, EnergyReading, MediaServer, StoragePool

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
No real devices or security systems are connected; controls are simulated.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
