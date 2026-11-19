# 68. Localization software — LingoDesk

## Product intent
A translation-management and CAT-workbench prototype with locale selection, segment editing, terminology suggestions and QA checks.

**Audience:** Localization managers, translators, product teams and language-service providers.

**Positioning:** Translate at scale without losing the voice of the product.

## UX architecture
A focused translation editor: project/locale rail, source-target segment table, glossary sidebar and progress header.

### Screens and regions
1. Project and locale dashboard
2. Side-by-side source and target segments
3. Glossary and translation-memory suggestions
4. QA issues and locale readiness

## Core workflows
1. Choose a target locale and filter segments by state.
2. Edit a target segment and save the draft.
3. Insert a glossary term or translation-memory suggestion.
4. Run local QA checks for empty targets, placeholders and terminology consistency.

## Domain model
LocalizationProject, Locale, MessageKey, TranslationSegment, GlossaryTerm, TranslationMemoryEntry, QAIssue. Preserve stable message keys and placeholder tokens.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
Translations and QA are illustrative seeded examples. No machine-translation provider, external localization service or production content is contacted. Never silently rewrite approved translations.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a locale-aware message catalog with stable keys, plural forms and placeholder validation.
2. Build a translation editor with draft, review and approved states plus glossary and translation-memory suggestions.
3. Add QA checks for missing strings, placeholders, length constraints and term consistency with unit tests.

## Prototype reference
- Standalone mockup: `../mockups/localization-lingodesk.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
