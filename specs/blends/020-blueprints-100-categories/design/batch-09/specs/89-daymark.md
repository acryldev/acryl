# 89. Personal Software — Daymark

## Product purpose
Personal life dashboard combining finance, fitness, habits, journaling, planning, travel, recipes and family.

## Audience
Operators and practitioners who need a focused tool for this category.

## Taxonomy coverage
Personal finance, fitness, health, journaling, habit tracking, life planning, travel planning, recipe management, family management

## UX direction
Calm personal home screen with daily plan, habit streaks, journal prompt and upcoming life events.

## Screens
1. Overview / primary workspace
2. Selected object detail and contextual controls
3. Activity, history or review surface

## Core workflows
Complete a habit; add a journal entry; pin a goal; browse a trip or recipe.

## Domain model
DailyPlan, Habit, JournalEntry, Goal, Trip, Recipe, HouseholdTask

## Acceptance criteria
- The primary category workflow is usable without a third-party API key.
- Seed data makes the primary screen understandable immediately.
- Create, inspect, filter or state-change interactions are demonstrable.
- Route and domain behavior should be covered by tests in an implementation.
- README should explain the audience, purpose, and include three agent prompts and a screenshot.

## Safety and demo boundaries
Personal and health-related demo data is fictional; not medical or financial advice.

## Coding-agent prompts
1. Implement the primary workflow and data model described above.
2. Add validation, empty states, error states and tests for the key domain actions.
3. Refine responsive behavior and document setup, architecture and three useful follow-up prompts.
