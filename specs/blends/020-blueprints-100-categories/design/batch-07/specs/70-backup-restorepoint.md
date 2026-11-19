# 70. Backup / recovery software — Restorepoint

## Product intent
A backup operations and recovery-planning prototype with job status, restore points, retention visibility and a guided restore simulation.

**Audience:** IT administrators, infrastructure teams and operations leads responsible for business continuity.

**Positioning:** Know what is protected, and how quickly you can recover it.

## UX architecture
A dark operational console with backup job rail, recovery timeline and a guided restore target inspector.

### Screens and regions
1. Protected workloads and backup job list
2. Snapshot timeline and retention points
3. Restore-point detail with integrity status
4. Recovery plan preview and simulated restore run

## Core workflows
1. Select a protected workload and inspect its recent snapshots.
2. Choose a recovery point on the timeline.
3. Preview the destination and selected restore scope.
4. Run a local verification simulation and review recovery status.

## Domain model
ProtectedWorkload, BackupJob, RecoveryPoint, RetentionPolicy, RestorePlan, VerificationRun. Distinguish backup completion, integrity verification and restore readiness.

## Interaction requirements
- The prototype must work with seeded data and without a server or paid third-party API.
- Every primary control shown in the mockup must have a meaningful local interaction or a clearly identified demo-only state.
- Keep the category's workflow and visual composition distinct from the other blueprints in this batch.
- Keep keyboard focus visible, use semantic HTML, and support a narrow viewport without horizontal page overflow.
- Persisted data, if implemented in the real app, must be separated from transient selection and editor state.

## Scope and safety boundary
No real data is read, copied, deleted, overwritten or restored. Restore actions are simulations against seeded metadata. Never imply that a real recovery point is valid without independent verification.

## Acceptance criteria
- A user can complete the key workflow in the seeded demo without external credentials.
- All shown primary states (empty, selected, in-progress, completed or error where relevant) have a defined UI representation.
- Domain logic is testable separately from rendering and uses deterministic fixtures.
- The README explains the product purpose, intended audience, local run command and three useful coding-agent prompts.
- The registry entry describes the category, app purpose and supported demo workflows.

## Coding-agent prompts
1. Implement backup-job and recovery-point domain models with explicit states for completed, verified and restore-ready.
2. Build a retention timeline and restore-plan preview that requires scope and destination confirmation.
3. Add deterministic verification simulations, audit events and tests for stale or incomplete recovery points.

## Prototype reference
- Standalone mockup: `../mockups/backup-restorepoint.html`
- No external API keys are required.
- This mockup is a design and workflow reference, not a production-ready implementation.
