# 49. Scout

**Category:** Search and information retrieval  
**Blueprint ID:** `acrylblends.search.scout`  
**Mockup:** `mockups/49-search-scout.html`

## Product purpose
A cross-source search interface that combines keyword queries with source filters, result snippets and an in-context document preview.

## Primary audience
Knowledge workers searching across team files, notes, code and conversations

## UX direction
Search-first page with large universal query bar, source facets, ranked result list and a preview pane.

## Primary data model
SearchQuery, SearchSource, SearchDocument, Snippet, Facet, SearchResult, RankingSignal, PreviewReference

## Core user flows
Edit and submit a query; filter sources; select results; inspect their preview; open a source placeholder.

## Implementation constraints and boundaries
Search corpus and snippets are synthetic. No external index or connector is required. Production should enforce source permissions at query time, support ACL-aware indexing, deletion propagation and explainable ranking.

## Suggested implementation slices
1. Define typed domain models and seed a compact, realistic demo dataset.
2. Implement the primary workflow and its state transitions without requiring third-party credentials.
3. Add route/domain tests for the core transitions and validation rules.
4. Add responsive empty, loading, error and success states; document all demo-only behavior.
5. Add a README explaining the app, intended user, local run steps and three useful coding-agent prompts.

## Acceptance criteria
- The primary workflow can be completed with seeded local data.
- The interface has distinct, category-appropriate information architecture rather than a generic dashboard template.
- Core actions produce visible state changes and handle invalid or empty input.
- No paid API key or external account is required for the demo.
- Domain behavior is covered by focused tests and the README documents limitations.
