# 46. Batchdocs

**Category:** Office automation  
**Blueprint ID:** `acrylblends.office.batchdocs`  
**Mockup:** `mockups/46-office-batchdocs.html`

## Product purpose
A mail-merge and document-generation tool that maps structured dataset columns into approved document templates and previews a batch before export.

## Primary audience
Operations, HR and admin teams generating recurring documents

## UX direction
Step-based document workflow: template and dataset configuration, field mapping table, live document preview and recipient review.

## Primary data model
Template, TemplateVersion, Dataset, DatasetRow, FieldMapping, Recipient, GeneratedDocument, BatchJob

## Core user flows
Choose a template and dataset; inspect mappings; navigate sample recipients; review records; generate a local demo batch.

## Implementation constraints and boundaries
All customer/contract data is synthetic. No email or signature is sent. Production needs document snapshotting, validation, auditability, secure storage, permissions and optional e-signature integration.

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
