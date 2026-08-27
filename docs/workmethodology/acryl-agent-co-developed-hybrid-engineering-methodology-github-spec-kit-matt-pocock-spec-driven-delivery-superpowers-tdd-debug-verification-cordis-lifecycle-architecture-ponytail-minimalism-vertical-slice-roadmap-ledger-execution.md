# Agent-Co-Developed Hybrid Engineering Methodology

> **Instruction to a coding agent:** Read this methodology file and follow it for this repository.

## 1. Purpose and operating model

This is an operational engineering method for human and coding-agent teams. It
is language-, framework-, provider-, and tool-independent. Use a repository's
existing tools where they satisfy a step below. Do not introduce a replacement
process, tracker, lifecycle system, or architecture merely because this method
names one.

The method combines:

- GitHub Spec Kit for durable specification artifacts and task generation;
- spec-driven delivery in the style of Matt Pocock: clear requirements, small
  tasks, implementation, review, and evidence;
- Superpowers process skills for brainstorming, systematic debugging, TDD, and
  verification before completion;
- lifecycle and ownership discipline inspired by Cordis;
- Ponytail minimalism: the simplest correct root-cause change, no speculative
  infrastructure;
- vertical slices with short feedback loops;
- focused commits and repository artifacts as durable memory.

The governing model is:

```text
Roadmap gives direction.
Specs ledger gives task truth.
Tests and acceptance evidence give behavioral proof.
Git history gives recoverable checkpoints.
Chat coordinates work but is not durable project memory.
```

## 2. Sources of truth

### 2.1 Global navigator

`docs/ROADMAP.md` is the global navigator. It records:

- product direction;
- milestones and intended sequencing;
- architectural invariants;
- major dependencies and explicitly deferred areas;
- conditions that make a milestone complete or invalid.

A roadmap is not a task tracker. Do not check individual implementation items
there. Change it only when product direction or a governing constraint changes.

### 2.2 Specification ledger

`specs/<NNN-feature>/` is the authoritative delivery ledger for one bounded
feature block. Use the repository's configured Spec Kit feature directory and
numbering convention. A normal ledger contains only artifacts that genuinely
help the feature:

```text
specs/<NNN-feature>/
  spec.md                 # user value, requirements, acceptance
  research.md             # verified facts, decisions, alternatives
  plan.md                 # implementation design and boundaries
  tasks.md                # dependency-ordered executable work
  checklists/             # specification or acceptance checks
  contracts/              # public or cross-boundary contracts when needed
  data-model.md           # entities/state rules when needed
  quickstart.md           # runnable acceptance validation when needed
  evidence/               # durable proof links, logs, screenshots, outputs
  invalidated.md          # only if this feature is deliberately stopped
```

The ledger, source code, tests, command output, and committed evidence are
project memory. A private agent transcript is not.

### 2.3 Feature lifecycle

Use GitHub Spec Kit for ledger creation and progression:

```text
new bounded feature:
  specify -> clarify -> plan -> tasks -> analyze -> implement -> converge

existing feature:
  clarify -> plan -> tasks -> analyze -> implement -> converge
```

Use the repository's installed `specify` CLI and Spec Kit skills. Do not hand
invent a parallel feature folder when an active Spec Kit folder already exists.

A completed, exploratory, or obsolete feature can be changed deliberately:

- **Completed:** acceptance evidence exists and every completed task is checked.
- **Superseded:** a named successor ledger replaces it.
- **Invalidated:** new evidence proves the goal, assumptions, or route wrong.
- **Archived:** kept for historical reasoning but not active.
- **Removed:** delete only after an explicit decision that it has no enduring
  product, compliance, or architectural value.

Never leave a stale spec appearing active. Mark its state and reason.

## 3. Readiness protocol before work

Before starting a task, establish a compact readiness report. Read repository
instructions first, then inspect the active ledger and the source paths it
names.

```markdown
## Readiness

- Milestone: M# - <name>
- Ledger block: specs/<NNN-feature>/
- Task/Subtask: T### - <name>
- Why needed: <user or architectural outcome>
- Scope: <exact paths and boundaries>
- Acceptance proof: <test, smoke, command, or observation>
- Risks/open questions: <only material items>
```

A task is ready only when all are true:

1. The active feature is known and is not invalidated.
2. The feature has a usable specification.
3. Material ambiguity has been clarified or recorded as an explicit assumption.
4. The task has a clear completion proof.
5. The source boundary and callers are understood well enough to avoid a
   symptom-only change.
6. Work does not conflict with another active owner, worktree, or agent.

If a task changes architecture, interfaces, persistence, security, or behavior
across multiple subsystems, stop and return to specification and planning.

## 4. Scale rigor to the work

Use the smallest process that can safely produce evidence. Do not turn a one
line correction into an architecture project. Do not treat a cross-service
migration like a one line correction.

| Work class | Examples | Required process |
|---|---|---|
| Tiny | typo, isolated build config, deterministic one-line defect | understand affected path, focused test or command, verify, commit |
| Normal | bug fix, component behavior, bounded API or CLI option | spec task, root-cause trace, RED-GREEN-REFACTOR, focused review, evidence |
| Architectural | new subsystem, runtime boundary, persistence format, public protocol, multi-surface behavior | brainstorm and approve design, Spec Kit clarify/plan/tasks/analyze, vertical slices, lifecycle review, acceptance evidence |
| High risk | credentials, authorization, destructive operation, money, privacy, migration, concurrency ownership | architectural rigor plus explicit threat/failure analysis, rollback, and human approval gates |

When uncertain, choose the higher rigor class. A discovery may upgrade a task
at any time. It never silently downgrades one.

## 5. Specify user value and acceptance first

A specification states what users need and how success is recognized. It does
not substitute framework or implementation details for acceptance criteria.

A quality specification includes:

- actors and their goal;
- independent user scenarios in priority order;
- testable functional requirements;
- measurable success criteria;
- explicit non-goals and boundaries;
- key entities, identity rules, and state transitions when data exists;
- meaningful edge cases and failure behavior;
- assumptions and external dependencies;
- acceptance scenarios that a reviewer can verify.

Use Spec Kit `specify` for a new feature. Run the generated requirements
checklist. If a requirement cannot be tested, make it observable or remove it.

### Clarify only material uncertainty

Use Spec Kit `clarify` before planning when an answer changes any of:

- user-visible behavior or scope;
- security, privacy, permission, or trust boundary;
- data model, ownership, or lifecycle;
- public contract or interoperability;
- acceptance test, task ordering, or rollback strategy.

Ask one question at a time. Prefer a short set of mutually exclusive options.
Record accepted answers in the specification. Make reasonable low-risk defaults
without interrupting progress and list them as assumptions.

## 6. Research separates facts from hypotheses

Research resolves planning-relevant uncertainty. It is not a collection of
links or an excuse to postpone a decision.

For every significant research item, record:

```markdown
## Decision: <decision>

- Verified facts: <source, version, date, direct observed behavior>
- Hypothesis or assumption: <clearly labeled if not verified>
- Rationale: <why this fits requirements and constraints>
- Alternatives considered: <viable alternatives and rejection reason>
- Consequences: <what later work must honor>
```

Prefer primary sources, repository source, executable experiments, official API
documentation, and actual command output. Do not present inferred behavior as a
verified fact. When upstream behavior is authoritative, identify the exact
version, pin, or commit that was inspected.

## 7. Plan boundaries before implementation

Use Spec Kit `plan` to turn accepted requirements into a design that names:

- capability or module boundary;
- data and contract boundary;
- existing code to reuse;
- paths to create, modify, or leave unchanged;
- ownership, effects, shutdown, and failure behavior;
- test strategy and acceptance command;
- migration and compatibility behavior when existing users exist.

The plan must make the next implementation task obvious. It is not a broad
wish list. Keep design depth proportional to risk.

### Architecture and lifecycle rules

Every capability has one clear owner. The owner is responsible for acquisition,
configuration, state transition, observability, and disposal of its resources.
A resource includes a process, thread, job, socket, route, subscription,
watcher, timer, lock, file handle, PTY, registry entry, cache, or background
loop.

For every long-lived capability, state:

```text
Provides: stable services, events, or contracts.
Consumes: required and optional dependencies.
Owns: resources and their acquisition point.
Disposes: ordered cleanup and quiescence condition.
Recovers: failure, replacement, restart, and rollback behavior.
```

Depend on stable contracts, not concrete providers or initialization order.
One source owns each fact. UI, logs, cached projections, and terminal output
are views unless explicitly designated durable state.

## 8. Generate dependency-ordered tasks

Use Spec Kit `tasks` after planning. Tasks are executable units, not vague
headings. Each task names exact paths, a completion proof, and dependencies.

A good task is:

- small enough for one focused review;
- large enough to deliver one coherent tested behavior;
- independently verifiable;
- ordered after its prerequisites;
- explicit about whether it can run in parallel.

Use the required checklist form where Spec Kit expects it:

```markdown
- [ ] T001 [US1] Add behavior in exact/path.ext and verify exact proof
```

Organize implementation tasks by user story after foundational tasks. Avoid
parallel edits to the same files. A task is complete only after its acceptance
evidence and focused commit exist, not merely after code is written.

## 9. Vertical-slice execution loop

Implement one task or smallest coherent subtask at a time. Each loop must have
a fast signal that distinguishes right direction from wrong direction.

```text
Task -> understand actual path -> RED -> GREEN -> REFACTOR -> verify
     -> review against spec -> evidence -> focused commit -> ledger checkpoint
```

At the beginning of every progress turn, report:

```markdown
- Milestone: M# - <name>
- Task/Subtask: T### - <name>
- Why needed: <one sentence>
- Feedback loop: <exact test, smoke, or observation>
```

A vertical slice crosses only the layers required to make one user-visible or
contract-visible behavior real. Do not build all screens, adapters, storage,
and future extension points before proving one end-to-end path.

## 10. Test-driven development

For behavior changes, use RED-GREEN-REFACTOR.

1. **RED:** write the smallest automated test proving the desired behavior.
2. Run it and observe the expected failure for the missing behavior, not a
   setup mistake.
3. **GREEN:** make the smallest correct implementation change.
4. Run the focused test and observe success.
5. **REFACTOR:** improve clarity or remove duplication only while tests remain
   green.
6. Run the relevant package or feature gate.

Tests should use real code and real boundaries whenever practical. Use mocks
only when an external boundary cannot be made deterministic. A test should
fail if the production behavior regresses, not merely if a mock expectation
changes.

For lifecycle work, tests cover activation, missing dependency behavior,
replacement, disposal, repeated mount/unmount, and resource-baseline recovery.
For concurrency or ownership work, tests cover races, cancellation, stale
state, and rollback.

## 11. Systematic debugging

Never patch a symptom before establishing its root cause.

1. Read the full error and stack trace.
2. Reproduce in an environment close to the user path.
3. Inspect recent changes, configuration, dependencies, and inputs.
4. Trace the bad value, state, or lifecycle transition backward to its origin.
5. Compare with a working in-repository or authoritative upstream pattern.
6. State one falsifiable hypothesis.
7. Add the smallest diagnostic or failing test that distinguishes it.
8. Fix the shared root cause, not each visible caller.
9. Verify the original reproduction and relevant regression suite.

A third failed independent fix attempt is an architecture signal. Stop stacking
patches. Reassess the boundary, ownership model, or premise and record the
new decision before continuing.

## 12. Ponytail minimalism

Apply Ponytail to every coding task after understanding the actual flow. Climb
this ladder and stop at the first option that satisfies the acceptance criteria:

1. The requested behavior may not need to exist. Skip speculative work.
2. Reuse an existing local helper, contract, or pattern.
3. Use the language standard library.
4. Use a native platform capability.
5. Use an already-installed dependency.
6. Write the smallest direct code.
7. Add a new dependency or abstraction only when the preceding options fail.

Prefer deletion to addition. Prefer one implementation over a factory with one
consumer. Prefer a stable interface only when more than one boundary genuinely
needs it. Do not scaffold settings, feature flags, adapters, caches, registries,
or extension points for imagined future use.

Minimalism does not remove validation at trust boundaries, explicit error
handling that prevents loss, security controls, accessibility basics, or a
required rollback path. Record a deliberate shortcut with a concise
`ponytail:` comment only when it has a real ceiling and a named upgrade trigger.

## 13. Verification and review

Do not claim a task is complete, fixed, passing, or ready without fresh
command evidence.

Before completion:

1. Identify the command or observation that proves each acceptance claim.
2. Run the focused test, then the relevant build/typecheck/lint/package gate.
3. Read the exit status and failures, not only the final line.
4. Reproduce the original defect or user flow when applicable.
5. Review the diff against the active specification and repository rules.
6. Record concise evidence in the ledger or task result.

A review asks two separate questions:

- **Spec review:** does this implement the stated user outcome and acceptance
  criteria, with no unapproved scope change?
- **Standards review:** does this honor repository conventions, ownership,
  lifecycle, safety, architecture, tests, and documentation rules?

Use Spec Kit `analyze` before implementation when artifacts need consistency
checking. Use `converge` after implementation to identify specified work not
actually built. Do not silently declare a feature done when converge finds
remaining work.

## 14. Focused commits and evidence

A coherent change gets a focused commit promptly. Do not mix unrelated
refactors, generated artifacts, dependency upgrades, and behavior changes.

Before committing:

- inspect `git status`;
- stage explicit intended paths only;
- run the task's verification gate;
- include tests and required docs with the behavior they prove;
- use a message describing the user-visible or architectural change.

After the implementation commit, add any required development-log or evidence
checkpoint in a separate documentation commit. Link exact commit hashes where
the repository uses a development log.

Evidence is concise and durable:

```markdown
## Evidence

- Task: T###
- Commit: <full SHA>
- RED: `<command>` failed because <expected missing behavior>
- GREEN: `<command>` passed
- Gate: `<command>` passed
- Acceptance: <manual smoke, fixture, screenshot, command output, or N/A>
- Residual risk: <specific known limitation or none>
```

## 15. Scope control and discoveries

A task may reveal new work. Classify it before acting:

- **Required correction:** necessary for the active task's acceptance or safety.
  Add it to the same task only if small and directly coupled.
- **New prerequisite:** blocks the active task. Add a dependency task to the
  active ledger and stop until it is planned.
- **Adjacent improvement:** valuable but not required. Record it as a new
  candidate feature or issue; do not expand the current slice.
- **Roadmap change:** affects product direction, milestone order, or
  architectural invariants. Update the roadmap after explicit decision.
- **Invalidation:** contradicts an active feature's assumptions. Mark the
  feature invalidated or superseded before building around the contradiction.

The safe default is to preserve working behavior and make the smallest change
that proves the next outcome.

## 16. Agent startup, coordination, and handoff

Before an agent starts implementation, give it a written readiness packet or
ledger reference containing:

- active milestone, feature, task, and acceptance proof;
- repository instructions and architectural invariants;
- exact source paths, symbols, and relevant callers already inspected;
- current working tree and ownership/worktree constraints;
- dependencies, decisions, assumptions, and known risks;
- commands already run and their result;
- explicit deliverables and verification command.

An implementation agent owns only its assigned working scope. It does not
merge its own work, discard unrelated changes, or treat private reasoning as
project memory.

At handoff or task completion, write a durable summary containing:

```markdown
## Handoff / Result

- Objective and task ID
- Completed behavior
- Changed files
- Tests and command output summary
- Commit hashes
- Decisions and assumptions
- Open problems and risks
- Exact next recommended task
```

A future agent must be able to continue from artifacts, source, tests, and
git history without reconstructing private chat context.

## 17. Methodology self-evolution

The methodology is a living engineering artifact, not ritual. Improve it only
with evidence:

1. Name the observed failure mode or repeated waste.
2. Identify the smallest process change that prevents it.
3. Record the rationale, alternative, and consequence.
4. Trial it on a bounded feature.
5. Keep it only if it improves correctness, speed, or clarity without adding
   unneeded process load.

Do not add a ceremony merely because another team uses it. Remove stale steps,
templates, and trackers when they no longer change behavior.

## 18. Anti-patterns

Avoid these patterns:

- treating chat, terminal scrollback, or an agent's private state as durable
  project memory;
- coding before the active ledger has a task and acceptance proof;
- treating an unfilled plan template as a plan;
- broad implementation before one vertical slice proves the boundary;
- tests written only after implementation, without observed RED evidence;
- claiming completion from code inspection rather than fresh verification;
- fixing each caller instead of the common root cause;
- one shared mutable runtime or worktree for competing owners;
- retaining resources without a lifecycle owner and disposal condition;
- creating a second registry, event system, dependency-injection mechanism, or
  state store beside an existing authoritative one;
- hiding an architectural disagreement behind compatibility hacks;
- adding factories, plugin systems, settings, caches, or dependencies for
  hypothetical future use;
- leaving superseded specifications apparently active;
- massive commits that hide independent behavior and evidence;
- using destructive repository commands to make a test or status look clean.

## 19. Reusable templates

### 19.1 Minimal feature specification

```markdown
# Feature: <name>

## Objective
<Who needs what outcome and why.>

## User scenarios
1. Given <initial state>, when <action>, then <observable outcome>.

## Functional requirements
- FR-001: The system must <testable behavior>.

## Success criteria
- SC-001: A user can <outcome> in <measurable condition>.

## Non-goals
- <Explicitly excluded behavior>.

## Edge cases
- <Failure, invalid input, concurrency, recovery, or empty state>.

## Assumptions and dependencies
- <Explicit assumption or external authority>.
```

### 19.2 Research record

```markdown
# Research: <topic>

## Decision
<Chosen direction>

## Verified facts
- <Fact> - Source: <path, command, URL, version, date>

## Assumptions
- <Unverified but accepted working assumption>

## Alternatives considered
- <Alternative> - Rejected because <reason>.

## Consequences
- <Constraint later plan/tasks must honor>.
```

### 19.3 Implementation plan item

```markdown
## Design: <capability>

- Boundary: <what this owns and does not own>
- Provides: <stable interface/service/event>
- Consumes: <dependencies and authority>
- State: <durable facts and transient projections>
- Effects/disposal: <resources, cleanup order, quiescence>
- Failure/recovery: <error and rollback behavior>
- Verification: <focused test and acceptance command>
```

### 19.4 Task

```markdown
- [ ] T### [US#] <action> in `<exact/path>`.
  - Why: <outcome>
  - Depends on: <task IDs or none>
  - RED/GREEN proof: `<exact command>`
  - Acceptance: <observable condition>
```

### 19.5 Acceptance evidence

```markdown
# Evidence: T### <task name>

- Commit: <full SHA>
- RED: `<command>` -> <expected failure>
- GREEN: `<command>` -> pass
- Gate: `<command>` -> pass
- Acceptance observation: <what was observed>
- Residual risk: <none or specific limitation>
```

### 19.6 Invalidated feature

```markdown
# Feature invalidated: <feature name>

- Status: invalidated
- Date: <YYYY-MM-DD>
- Decision: <why this work must not continue>
- Evidence: <fact, test, user decision, or architectural finding>
- Successor: <spec path or none>
- Preservation: <archive, remove, or retain for reference>
```

### 19.7 Readiness report

```markdown
## Readiness

- Milestone: M# - <name>
- Ledger block: specs/<NNN-feature>/
- Task/Subtask: T### - <name>
- Why needed: <outcome>
- Scope: <paths>
- Feedback loop: `<command>`
- Risks/open questions: <material items only>
```

### 19.8 Completion report

```markdown
## Completion

- Milestone: M# - <name>
- Task/Subtask: T### - <name>
- Delivered: <observable behavior>
- Evidence: <tests, smoke, gate>
- Commit: <full SHA>
- Ledger: <task checkbox/evidence path>
- Residual risk: <none or specific limitation>
- Next: <next task, why needed, feedback loop>
```

## 20. Final execution rule

For each task, prefer the shortest path that produces durable evidence:

```text
Understand -> specify task -> make RED -> make GREEN -> verify -> review
-> commit -> update ledger -> hand off -> next task
```

When a repository provides stricter instructions, apply them. When this method
and repository instructions are both silent, choose the smallest reversible
change that preserves authoritative state, explicit ownership, and a runnable
proof.
