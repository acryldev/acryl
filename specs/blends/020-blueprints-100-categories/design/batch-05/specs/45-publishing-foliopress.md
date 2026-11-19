# 45. Folio Press

**Category:** Publishing software  
**Blueprint ID:** `acrylblends.publishing.foliopress`  
**Mockup:** `mockups/45-publishing-foliopress.html`

## Product purpose
A desktop publishing workspace for composing a magazine spread, managing pages and adjusting headline typography before print/export.

## Primary audience
Editorial designers and small publishing teams

## UX direction
Desktop publishing-style workspace with page thumbnails, central two-page spread, compact ribbon tools and typography inspector.

## Primary data model
Publication, Issue, Page, Spread, TextFrame, ImageFrame, Style, FontAsset, ExportJob

## Core user flows
Select pages; edit a headline; adjust font family and size; insert a text block; add a page; invoke print/PDF export.

## Implementation constraints and boundaries
Page content is illustrative. Browser print is a stand-in for true press-ready PDF generation. Production requires precise layout, font embedding/licensing, bleed, trim, colour management and preflight.

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
