# 06 — Data: CSV Explorer

**Blueprint id:** `acrylblends.csv-explorer`  
**Concept:** A local-first data workbench for importing CSV files, profiling columns, filtering rows and charting a selected field.

## Intent
A data exploration tool where the imported dataset is the application. Primary work is inspecting schema, profiling, filtering and charting the current file.

## Primary
Left column profile and field selector; main area contains dataset health summary, an exploratory chart and a dense spreadsheet preview.

## Support
Import/export, saved views, filter builder, column metadata, sort, pagination, type correction and missing-value inspection.

## Visual
Data-tool visual language: teal field type markers, fine grid lines, sheet-like cells, column profile sidebar. Not generic cards-first dashboard.

## Flows
Import CSV → infer types → inspect quality → choose columns → filter/sort/group → chart an aggregate → save view/export results.

## Data
Dataset(id,name,fileName,size,rows,columns,importedAt); Column(id,datasetId,name,type,nullable,distinctCount,missingCount); Row(datasetId,index,values); SavedView(id,datasetId,filters,sort,chart).

## Seed
24,680 sales rows, 8 columns, € revenue by five regions, 0.2% missing values, 3 saved views.

## States
No dataset, parsing error, unknown encoding, type mismatch, empty filter result, missing values, large-file warning and export complete.

## Routes
`/datasets`; `/datasets/:id`; `/datasets/:id/chart`; `/views/:id`; `/import`.

## Build notes for the agent
- Start from the published `acrylblends` blank template and follow `specs/020-blueprints-100-categories/spec.md` plus `cloud-brief.md`.
- Implement domain logic in a focused Cordis plugin; keep the domain separate from the route/view.
- Show useful local seed data on first launch. No required outside account, paid service, or API key.
- Keep external effects behind injected adapters; use fake adapters in tests.
- Implement the screen composition in the mockup; do not replace it with a generic dashboard.
- Cover domain logic and every route with `node:test`; include README, three follow-up prompts and screenshot.

## Acceptance checklist
- [ ] Main screen clearly expresses the category's core job.
- [ ] Primary workflow works with seed data.
- [ ] Appropriate create/edit/search and state transitions work.
- [ ] Empty, validation, success and failure states are handled.
- [ ] `npm test`, `npm run check` and `npm start` pass.
- [ ] Registry metadata and category placement match the task plan.
