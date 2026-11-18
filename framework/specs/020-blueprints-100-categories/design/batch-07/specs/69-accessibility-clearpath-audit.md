# 69. Accessibility software — Clearpath Audit

## Product intent
An accessibility audit and assistive-preview prototype for triaging sample interface issues, previewing contrast and text settings, and recording remediation.

**Audience:** Accessibility specialists, QA teams, designers and product owners.

**Positioning:** Make accessibility visible, testable and part of the build.

## UX architecture
A quality-audit console with issue severity rail, live page preview and a detailed remediation panel.

### Screens and regions
1. Audit summary and issue filters
2. Sample page with contrast and typography controls
3. Issue detail with affected component and suggested fix
4. Remediation checklist and re-run summary

## Core workflows
1. Filter audit items by severity and select an issue.
2. Inspect the corresponding component in the preview.
3. Toggle a high-contrast or enlarged-text preview.
4. Mark a sample issue resolved and re-run the local checklist.

## Domain model
AccessibilityAudit, AuditIssue, ComponentReference, Remediation, PreviewSetting, AuditRun. Track WCAG criterion references only when the implementation spec includes verified mapping.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
This is a sample issue triage concept, not an automated conformance certificate. Passing visible demo checks does not prove WCAG compliance. Do not infer disability or user health from interactions.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement an accessibility issue model with severity, component references, WCAG mapping metadata and remediation state.
2. Build accessible preview toggles for contrast, text scale, focus visibility and reduced motion.
3. Add deterministic audit fixtures and unit tests; explicitly label heuristic checks as non-conformance evidence.

## Prototype reference
- Standalone mockup: `../mockups/accessibility-clearpath-audit.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
