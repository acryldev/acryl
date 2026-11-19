# 50. Atlas

**Category:** Knowledge software  
**Blueprint ID:** `acrylblends.knowledge.atlas`  
**Mockup:** `mockups/50-knowledge-atlas.html`

## Product purpose
A linked knowledge workspace for authoring notes, navigating a collection tree, viewing concept relationships and discovering backlinks.

## Primary audience
Researchers, technical leads and personal knowledge managers

## UX direction
Three-column knowledge environment: collection tree, long-form note with embedded concept graph, and backlinks/entity panel.

## Primary data model
KnowledgeSpace, Collection, Note, Block, Entity, Relation, Backlink, Tag, GraphNode, GraphEdge

## Core user flows
Open a note; edit its title; create a new note; navigate related concepts; show/hide the graph; add a relationship.

## Implementation constraints and boundaries
Content and relationships are synthetic. The graph is a small illustrative SVG, not a dynamic ontology editor. Production needs version history, graph integrity, backlinks, access control, import/export and citation/source metadata.

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
