# Implementation Plan: ACRYL Agent, Plugin, Registry, and Blend Ecosystem

**Status**: Architecture approved. Implementation begins only after the 019 runtime ownership and active-control defects are fixed and independently reviewed.

## Architecture

The existing three package roles remain strict:

```text
acryl-harness-runtime: one runtime root, native handles, plugin settlement, health, rollback
acryl-control: leases, capability authorization, endpoint protocol, durable operation records
acryl-tui / acryl-gui / acryl-web: peer presentation surfaces and controllers
```

New responsibilities are implemented as replaceable Cordis capabilities, not a parallel plugin or agent framework:

```text
acrActiveControl         one mutation lease across attached surfaces
acrDelegatedJobs         durable generic-terminal and ACP job coordinator
acrPluginPolicy          global permission policy evaluation
acrPluginCandidates      proposal, validation, activation, health, quarantine, rollback
acrRegistryCatalog       ACRYL Registry and external-store source projection
acrBlendComposer         create/apply Blend plans and durable conflict resolution
```

## Connector design

Generic terminal and ACP connectors normalize to the same `DelegatedAgentJob` model.

- Generic terminal owns a PTY/process lifecycle and exposes a scoped `acryl` CLI in the child environment.
- ACP consumes structured events where available but writes the same durable artifacts.
- Connector fidelity is explicit. Terminal bytes are audit evidence, never canonical agent work history.
- Agents receive neither a Cordis `Context` nor root ownership credentials.
- A job can continue offline source/build/unit-test work after controller loss. Runtime mutation and approval-gated operations pause.

## Permission and activation design

1. Agent creates a proposal with intended permissions.
2. `acrPluginPolicy` evaluates global `deny`, `ask`, and `auto-allow` policy.
3. Agent builds/tests source and writes evidence.
4. Final manifest is compared to proposal and policy.
5. ACRYL creates a health checkpoint, stages package changes, activates through native Loader/profile authority, and awaits settlement.
6. Health failure disables/quarantines the candidate and restores the last healthy composition.
7. Controller receives a recovery receipt on return.

Default execution is in-process Cordis. A future isolation provider may execute the same manifest behind a typed bridge, without changing package APIs.

## Registry and Blend design

The ACRYL Registry is a source of ACRYL-native packages. DSH stores remain source-labeled adapters. Package source determines its lifecycle adapter and trust behavior.

A Blend is declarative and versioned. It references package dependencies and may include private editable source or sealed artifacts. `CREATE_PROJECT` creates a siloed project. `APPLY_TO_PROJECT` creates a non-mutating plan and stops for user conflict resolution. Blend permission requests intersect with, never override, global policy.

Commercial sealed artifacts retain provenance, signatures, compatibility, permissions, and license metadata. Editable customer modifications create a local fork with manual vendor-update merge flow.

## Delivery order

1. Repair and verify single owner, active-control lease, generation identity, and endpoint attachment in the current 019 runtime slice.
2. Add `.acryl/` project-state schema and migration-safe read/write layer.
3. Add global plugin policy and proposal/final-manifest validation.
4. Add plugin candidate checkpoint, health, quarantine, rollback, and recovery projection.
5. Add generic terminal connector and durable delegated job lifecycle.
6. Add ACP connector against the same job contract.
7. Add global workspace-mode settings and optional worktree creation.
8. Add ACRYL Registry source contract and keep external DSH store adapters separate.
9. Add editable/sealed package provenance and local-fork update model.
10. Add Blend create-project and apply-plan/conflict-resolution flows.
11. Add GUI/Web controller views and publication approval flow.
12. Only after local composition is reliable, design remote registry hosting, commercial publication, billing, and `webblends` deployment.

## Verification strategy

Every slice uses real Cordis activation and disposal where applicable. Required tests include ownership races, lease loss, process/PTY cleanup, job restart, policy denial/escalation, proposal-manifest mismatch, plugin rollback, catalog source separation, sealed artifact validation, local-fork update behavior, Blend plan conflicts, and repeated mount/unmount leak checks.

No slice may claim completion from a local in-memory map alone when the requirement is cross-process owner-or-attach behavior.
