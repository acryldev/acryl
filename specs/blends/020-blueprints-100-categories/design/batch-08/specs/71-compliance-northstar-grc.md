# 71. Compliance / governance software — Northstar GRC

## Product intent
A governance workbench for maintaining a control library, tracking risk ownership, collecting audit evidence and reviewing compliance posture.

**Audience:** Compliance leads, internal auditors, risk owners and privacy or ESG teams.

**Positioning:** Make controls, risks and evidence traceable.

## UX architecture
A control-assurance cockpit: left-side framework rail, central control register with evidence freshness, and a right-side risk/evidence inspector. The primary interaction is evidence review and control attestation.

### Screens and regions
1. Framework overview and control coverage
2. Control register with owner, status and evidence freshness
3. Evidence review drawer with source and review notes
4. Risk register with inherent/residual score and treatment action

## Core workflows
1. Filter controls by framework, owner and assurance status.
2. Open a control and inspect the evidence bundle and review history.
3. Accept evidence, request a refresh or mark an exception.
4. Update a risk treatment and see the posture summary recalculate.

## Domain model
Framework, Control, ControlTest, EvidenceItem, Risk, RiskTreatment, AuditEvent. Evidence records include provenance, collectedAt, reviewedAt and retention class.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Illustrative control catalogue only; do not claim certification or legal compliance. Do not include real personal data, sensitive evidence or actual audit findings. Seed demo controls and synthetic evidence.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement a versioned control library with framework mapping and control ownership.
2. Build an evidence review workflow with provenance, freshness windows and immutable audit events.
3. Add risk scoring and treatment tracking with deterministic test fixtures and audit-log tests.

## Prototype reference
- Standalone mockup: `../mockups/compliance-northstar-grc.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
