# 78. Identity software — Identra Directory

## Product intent
An identity and access management console for directory users, groups, SSO applications, role assignments and joiner-mover-leaver lifecycle requests.

**Audience:** IT administrators, IAM teams and enterprise application owners.

**Positioning:** Manage the lifecycle behind every digital identity.

## UX architecture
An identity directory with a user-centric profile, group membership matrix and application assignment panel. The main workflow is identity lifecycle and authorization review, not sign-in.

### Screens and regions
1. Directory people and service identities
2. Identity profile with groups and attributes
3. Application access and role assignment
4. Joiner/mover/leaver request queue

## Core workflows
1. Search a seeded identity and open its profile.
2. Inspect group membership, roles and connected applications.
3. Review an access request and approve or deny the requested entitlement.
4. Simulate a joiner or leaver lifecycle action and inspect its audit trail.

## Domain model
Identity, DirectoryGroup, Application, Role, Entitlement, AccessRequest, LifecycleEvent, AuditEvent.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep this category's workflow and visual composition distinct from the other blueprints.
- Use semantic HTML, visible keyboard focus and responsive layouts with no horizontal page overflow.
- Separate persisted domain data from transient selection and editor state in a production implementation.

## Scope and safety boundary
Synthetic users only; no real directory connection, SSO provider, credentials or provisioning API. Never display real passwords, tokens or employee personal data.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials or services.
- Primary success, empty, selected, in-progress and error states are represented where relevant.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains purpose, audience, local run command and three coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement identity, group, application and entitlement models with explicit role relationships.
2. Build an access review workflow with least-privilege context and an auditable decision history.
3. Add deterministic joiner/mover/leaver simulations with tests for orphaned entitlements.

## Prototype reference
- Standalone mockup: `../mockups/identity-identra.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
