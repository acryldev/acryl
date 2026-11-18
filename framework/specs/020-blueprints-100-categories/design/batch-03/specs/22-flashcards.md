# 22 — Flashcards

**Taxonomy:** Education  
**Blueprint ID:** `acrylblends.flashcards`  
**Repository target:** `22-flashcards`

## Product job
Spaced-repetition study app for creating decks, reviewing cards and tracking recall over time.

## UX direction
Focused study session. This should not inherit a generic admin-dashboard layout. The mockup is the visual source of truth for hierarchy, composition, navigation and interaction.

## Primary data model
Deck, card, prompt, answer, review, interval, difficulty, due date.

## Core user flows
Select a deck; reveal the answer; grade recall as Again, Hard, Good or Easy; schedule the next review; inspect progress and upcoming cards.

## Implementation notes
The review surface is the product. Keep one card central with distraction-free controls and keyboard-friendly reveal/rating actions. Use an SM-2-like scheduler behind a replaceable policy; mock data only.

## Required screens / states
1. **Primary workspace:** the main layout shown in the mockup, populated with meaningful seeded data on first launch.
2. **Record or item detail:** inspection and editing surface for the selected domain object.
3. **Create / update flow:** a focused form or direct manipulation action appropriate to the category.
4. **Supporting view:** calendar, report, public reference, collection or settings surface as applicable.

Implement only the smallest useful app described here. Use the framework's Cordis plugin and `blend.yaml` conventions. Keep external systems behind injected ports/config so tests can use fakes. Use local seed data; do not require paid APIs, API keys or external sign-in.

## Acceptance checklist
- [ ] First page opens with seeded records and the category's core job is immediately obvious.
- [ ] Core flow works end-to-end with local data.
- [ ] Detail and create/update interactions have validation and clear feedback.
- [ ] Empty, loading, error and success states are defined.
- [ ] Domain logic and every route have tests.
- [ ] README describes audience, purpose and three next prompts.
- [ ] No secrets, external credentials or unsafe production claims.
