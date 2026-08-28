# Feature Specification: ACRYL Agent, Plugin, Registry, and Blend Ecosystem

**Feature Directory**: `specs/021-acryl-agent-plugin-ecosystem`
**Created**: 2026-08-28
**Status**: Approved architecture, not ready for implementation
**Input**: Make ACRYL living, plugin-native software where a controlling GUI or Web surface can delegate extension work to any terminal or ACP coding agent, safely install and recover plugins, federate package catalogs, and compose reusable vertical applications called Blends.

## Objective

ACRYL is the persistent, local-first composition layer above coding agents. One profile has one writable Harness/Cordis runtime. One attached peer surface - CLI, GUI, or Web - holds the active-control lease. It may delegate coding work to generic terminal or ACP agents, including unknown future agents, without granting those agents direct presentation internals or a competing runtime root.

Delegated agents create, build, test, and propose ACRYL plugins through scoped capabilities. ACRYL owns policy evaluation, lifecycle settlement, health checks, rollback, and durable project records. Plugins can add widgets, tools, logic, workflows, agent connectors, and other Cordis contributions. ACRYL packages are discoverable through an ACRYL-owned registry; external DSH stores remain separate, connectable catalogs. A Blend is a versioned application composition that directs the adaptable ACRYL base into a domain product such as a Music Studio, AI Video Studio, Weather Operations workspace, or Accounting workspace.

## Clarifications

### Session 2026-08-28

| Question | Decision |
| --- | --- |
| Who controls ACRYL? | Exactly one attached CLI, GUI, or Web surface holds the active-control lease. Third-party coding-agent delegation is most useful from GUI/Web, but follows the same capability model from every peer surface. |
| Can external coding agents control ACRYL? | They are delegated workers of the active controller. They act through `acryl-control` capabilities, not through direct GUI/Web internals or direct Cordis roots. |
| Which external agent transports come first? | Generic terminal CLI and ACP. Named runtimes are later presets over those connectors, not special architectures. |
| How do generic agents communicate? | Both a scoped `acryl` CLI in the agent environment and human-readable `.acryl/` files. |
| Can agents install and enable local plugins by default? | Yes, within the global permission policy's automatic baseline. Stricter settings can require active-controller approval or deny the action. |
| Can agents publish to a Marketplace by default? | No. Publication requires active-controller approval by default. A user may explicitly select an auto-publish YOLO policy. |
| How are permissions declared? | Before creation, the agent submits intended permissions. Before activation or publication, ACRYL validates the final manifest against that declaration and policy. Escalation is rejected or returns to approval. |
| How is permission policy configured? | One global matrix for all agents: `Deny`, `Ask active controller`, or `Auto-allow` per permission. Presets are Safe, Developer, and YOLO. Per-agent overrides are deferred. |
| What is automatically allowed? | A reasonable baseline: project-scoped file read/write, plugin-local storage, and declared ACRYL UI slots. Network, arbitrary subprocesses, external-agent launch, delegation, credentials, control transfer, and Marketplace publication are not baseline grants. |
| May agents work after the controller disconnects? | They may create source, build, run static/unit tests, and prepare artifacts. Live-runtime operations, integration tests, approvals, and approval-gated publication wait until a controller holds the lease again. |
| Do jobs survive restart? | Yes. Job, proposal, permission, evidence, handoff, and lifecycle state live in portable `.acryl/` project files. SQLite is only a local index/cache. |
| Where do agents work? | The default is the current project workspace. A per-run control and global setting may select an isolated worktree for every agent session. Every mode records a diff summary before runtime mutation. |
| Where do third-party plugins execute? | In the main Cordis runtime by default. User policy may raise isolation for selected or untrusted plugins later without changing public plugin capability APIs. |
| How does failed activation recover? | ACRYL automatically disables and quarantines the unhealthy new/updated plugin, restores the last healthy plugin set, and reports recovery to the next active controller. |
| Is there one marketplace? | No. The ACRYL Registry distributes ACRYL packages. Official and community DSH stores remain separate connectable catalogs with explicit adapters and trust identities. |
| What is a Blend? | A versioned ACRYL application composition: plugins, configuration, policy requests, roles, templates, integrations, and optional private plugin source or sealed artifacts. It is not an app fork. |
| Can Blends contain private/commercial plugins? | Yes. They may reference published packages, carry editable private source, or carry signed sealed artifacts. Sealed artifacts run and configure but do not expose internals for modification. |
| What happens when an editable commercial plugin changes? | It becomes an explicit local fork. Seller updates remain discoverable but are not automatically applied; the customer explicitly rebases or merges. |
| Can a Blend create a new project and apply to an existing project? | Both. Create makes an isolated project/workspace. Apply computes a merge plan for an existing project. |
| How are Blend conflicts resolved? | ACRYL stops before mutation and requires active-controller resolution. Blend manifests have no deterministic override rules. |
| Can Blends set security policy? | They may request/recommend permissions, but effective grants are the intersection of the Blend request and global user policy. A Blend may tighten, never silently loosen, user policy. |

## User Scenarios and Testing

### User Story 1 - Delegate plugin work through any coding agent

As an ACRYL user controlling any peer surface, I can delegate creation of a plugin to a generic terminal or ACP coding agent. The agent receives a durable job, a declared permission budget, project context, and scoped `acryl` CLI access. It can prepare source and evidence while the controller is unavailable, then request runtime install and integration testing when the controller returns.

**Independent test**: Use a fixture generic terminal agent to create a plugin proposal, write `.acryl/` artifacts, build/test it, disconnect the controller, resume the controller, and settle the queued activation request without a second runtime root.

### User Story 2 - Govern plugin permissions and publication

As an ACRYL user, I configure one global permission matrix. Normal local plugins receive a practical baseline automatically. Elevated capabilities ask, deny, or auto-allow according to the chosen setting. Marketplace publication requires approval by default and may be switched to explicit YOLO auto-publish.

**Independent test**: A plugin that requests baseline UI/files permissions activates automatically; one requesting network or subprocess access is denied or awaits approval according to the global policy; a publication request cannot proceed without the configured publication grant.

### User Story 3 - Recover from unhealthy plugin changes

As an ACRYL user, I do not lose a working profile because an agent-created or updated plugin fails to boot or becomes unhealthy. ACRYL restores the last healthy composition, quarantines the failed candidate, and shows the controller a recovery report with evidence and next actions.

**Independent test**: Install a fixture plugin that fails activation, assert that the previous plugin set becomes active, the failing version is quarantined, and no abandoned effects, routes, processes, or services remain.

### User Story 4 - Discover packages through separate catalogs

As an ACRYL user, I can search the ACRYL Registry for ACRYL-native packages and optionally connect official/community DSH stores. Source, trust identity, package type, permissions, and compatibility are explicit before installation.

**Independent test**: Query one ACRYL Registry fixture and one DSH-store fixture, verify that their packages remain source-labeled and cannot be installed through the wrong lifecycle adapter.

### User Story 5 - Create or apply a Blend

As an ACRYL user, I can create a new isolated project from a Blend or apply a Blend to an existing project. A Blend may contain published dependencies, private editable source, or sealed commercial artifacts. Existing-project conflicts stop for controller resolution; a modified editable plugin becomes a local fork and stops automatic seller updates.

**Independent test**: Create a project from a fixture Blend, then apply a conflicting Blend to an existing fixture project and verify no mutation occurs until a controller records resolutions. Modify an editable dependency and verify vendor update is offered but not automatically applied.

## Functional Requirements

- **FR-001**: ACRYL MUST maintain exactly one writable runtime owner and exactly one active-control lease per profile.
- **FR-002**: Delegated external agents MUST use generic terminal or ACP connectors that normalize into one durable job model.
- **FR-003**: Delegated agents MUST NOT receive direct Cordis contexts, raw owner credentials, GUI/Web internals, or authority to create a runtime root.
- **FR-004**: ACRYL MUST expose scoped capabilities through both an `acryl` CLI and `.acryl/` artifacts.
- **FR-005**: Every delegated job MUST persist portable artifacts under `.acryl/` and resume after ACRYL restart.
- **FR-006**: Job runtime mutation requests MUST wait when no controller holds the active-control lease; offline build and test work MAY continue.
- **FR-007**: Plugin proposals MUST declare intended permissions before source creation and final manifest permissions before activation/publication.
- **FR-008**: ACRYL MUST evaluate a global permission matrix with `Deny`, `Ask active controller`, and `Auto-allow` outcomes.
- **FR-009**: Safe, Developer, and YOLO permission presets MUST be explicit convenience mappings over the same matrix.
- **FR-010**: Plugin manifest escalation beyond the approved proposal MUST fail closed or return to approval.
- **FR-011**: Local plugin install/enable MAY be automatic only when policy grants every requested permission.
- **FR-012**: Marketplace publication MUST require controller approval by default and MAY be auto-allowed only by explicit user policy.
- **FR-013**: ACRYL MUST record agent identity, source/worktree, manifest, permission decision, build/test evidence, diff summary, and publisher decision for every publication.
- **FR-014**: Third-party plugins MUST execute in the main Cordis runtime by default and contribute through typed, reversible Cordis capabilities.
- **FR-015**: Plugin lifecycle operations MUST checkpoint the last healthy composition, await settlement and health, and quarantine/rollback failed candidates automatically.
- **FR-016**: ACRYL MUST provide an ACRYL-owned Registry for ACRYL packages and model external DSH stores as separately trusted sources.
- **FR-017**: ACRYL packages and DSH packages MUST retain source, publisher, compatibility, permission, and lifecycle-adapter identity.
- **FR-018**: A Blend MUST be a versioned declarative composition, not a new application runtime or a copy of ACRYL core.
- **FR-019**: A Blend MAY reference published packages, editable private source, and signed sealed runtime artifacts.
- **FR-020**: A sealed artifact MUST retain signature, provenance, compatibility, declared permissions, and license metadata; it MUST be extendable through documented public capability APIs without exposing internals.
- **FR-021**: Creating from a Blend MUST create an isolated ACRYL project/workspace with its own `.acryl/` state.
- **FR-022**: Applying a Blend to an existing project MUST calculate a plan and stop before mutation on package, configuration, or permission conflicts.
- **FR-023**: An editable plugin changed by the customer MUST become an explicit local fork and MUST NOT accept vendor updates automatically.
- **FR-024**: Effective Blend permissions MUST be the intersection of Blend requests and global user policy; a Blend MUST NOT silently loosen policy.
- **FR-025**: Worktree mode MUST default to the current workspace and support per-run override plus a global separate-worktree default.
- **FR-026**: All processes, PTYs, sockets, subscriptions, routes, timers, registrations, artifacts, and control leases introduced by this feature MUST have one lifecycle owner and an ordered disposer.

## Non-goals

- Building the remote public registry, commerce, billing, licensing backend, or SaaS `webblends` product in the first implementation slice.
- Per-agent permission overrides.
- Default worker/process isolation for all plugins.
- Treating raw terminal bytes as canonical agent history.
- Allowing an external agent to seize control, publish, or mutate a live runtime outside a granted capability and policy decision.
- Editing `deepseek-harness/` or replacing Cordis with another plugin/lifecycle system.

## Success Criteria

- A generic terminal agent and an ACP agent complete the same fixture job through one durable job model.
- Across 100 concurrent control and job requests, at most one runtime owner and one active controller receive mutation authority.
- A restart preserves all queued jobs, proposals, evidence, and approvals required to resume safely.
- A failed plugin activation restores a verified healthy composition in every fixture scenario.
- A user can create a new project from a Blend and apply a non-conflicting Blend to an existing project without manual file editing.
- Conflicting Blend application performs no partial mutation before active-controller resolution.
