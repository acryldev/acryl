# From the aimbrace prototype to the ACRYL Blends framework

**Status of aimbrace (owner, 2026-10-09):** a prototype. Its job is to find out, quickly and cheaply, which of ACRYL's features
make a good *framework for building agentic apps*, so that the winners can become the ACRYL Blends framework. It is not a
product on its own, and apps such as WebBoxes.ai are built by other agents on ACRYL, not on this repository.

## Where this goes (owner, 2026-10-09)

- **ACRYL** is open source. **ACRYL Blends** is the open framework extracted from it. **aimbrace is the fresh start for Blends**:
  an earlier Blends attempt looped and went nowhere, so this prototype stays small and proven, and is merged back into ACRYL once
  it is ready.
- **WebBoxes.ai** is the hosted, multi-tenant implementation of Blends (open source framework, paid cloud, like Supabase), built by
  another agent. It is a consumer of the framework, not part of this repository.
- Design consequences, kept as rules: every tenant is an app instance with its own home, port and data (the `instance` plugin is the
  seam, and nothing else reads the environment); no cloud-only code in the framework; anything an agent builds must be inspectable
  and reversible, because a hosted tenant cannot be trusted by default (hence approval, the ledger and, next, per-extension
  permissions).

## What the prototype showed (v0.2.0, all tested in this repository)

| Finding | Evidence | For Blends |
|---|---|---|
| **A plugin is the right unit, and an agent can write it.** One contract (a Cordis plugin: `name`, `inject`, `apply`, optional `check`) is enough for the agent to build, install, fix and remove capabilities of the app it runs in | DeepSeek built and installed a plugin from a plain request in 5.6 s (`pnpm run verify:model`) | Keep the Cordis plugin as the only building unit. Do not add a second extension format |
| **Install must be a transaction:** check, stage by content digest, import fresh, start, self-check, record, answer; on failure the previous version runs again | extensions plugin, 11 tests; verify drives create, update, broken update, restart, remove | This is the "evolution transaction" Blends needs. ACRYL's `acryl-extension-context` already does it with pnpm; the prototype shows it without |
| **Real state beats a claim of "done":** `active`, `pending` (with missing services) or `failed` (with the real error) | every install answer | Keep structured results as the only thing an agent ever sees |
| **Records must be written before the answer** and must survive a crash | tasks plugin, 4 tests; task records read back after a restart | Adopt as the task contract (see below) |
| **The app as data is cheap and useful:** rows, parameters, diagnostics with paths, a lock of digests | manifest plugin, 5 tests | The manifest is now ACRYL's `blend.yaml` format (see mapping) |
| **Real models need a small adapter, not an SDK:** one `fetch` call; thinking models need their reasoning sent back | openai plugin; found by running DeepSeek | Provider plugins stay thin, behind one `model` service |
| **Copying beats importing for a prototype:** no runtime package, the app owns the code | `aimbrace add` | Blends differs on purpose: a Blend must be upgradable from its Blueprint, so copying is the wrong default there |

## Mapping to ACRYL

| aimbrace | ACRYL today | Direction |
|---|---|---|
| `instance` | `AppInstance` family, `select.ts` | same idea, ACRYL's is the reference |
| `settings` | `acryl-settings` | ported as is; ACRYL's stays the reference |
| `extensions` | `acryl-extension-context` (pnpm, Harness Loader, hot shim) | prototype minus pnpm and the Loader; lessons to feed back: structured results, `check`, restore-previous on every failure path |
| `builder` + `agent` | the agent's `acryl_install_plugin` tool | one tool per step and an explicit state read-back worked well with a real model |
| `manifest` (`blend.yaml`) | `blends-core` (`blend.yaml`: Blueprint and Blend, `extends`, overrides, lineage, parameters, lock) | converged: the prototype's file is a valid `blend.yaml`, and it resolves Blueprints and Blends with ACRYL's rules (extends, lineage, overrides by id, collisions, cycles), checked against ACRYL's JSON schema. Added by the prototype: `planUpgrade`, see below |
| `save` | `app-persistence` | ported; ACRYL's stays the reference |
| `tasks` | none (chat transcripts are the record) | new for ACRYL: see Pi Durable ideas |

## The Pi Durable ideas: where each one stands

From the owner's comparison (capture inbox, "Pi.dev Durable Objects And ACRYL Comparison..."). Its recommendation was: keep Cordis,
keep ACRYL state authoritative, borrow Pi Durable's *patterns*, treat the package as experimental, and keep Absurd and Gondolin
optional behind interfaces.

| Idea (comparison section) | State in the prototype | Next step |
|---|---|---|
| **A. Manifest vs runtime state:** the manifest is desired composition; execution state references a revision | done: manifest and tasks are separate, and every task records the digest of the manifest it ran under | none |
| **B. A first-class durable task contract** (identity, owner, input, status, checkpoint, result, error, retry, cancel, timestamps), backend-independent | done for storage: `tasks` has identity, owner, input, status, result, error, cancel, timestamps, progress, over a `TaskStore` interface with JSONL and SQLite backends passing one conformance suite. Still missing: retry policy, checkpoints, idempotency keys | a Pi Durable adapter would implement `TaskStore` (or replace `tasks` behind the same service), after a real app needs retries |
| **C. An evolution transaction:** propose, generate, validate, stage, test, approve, activate, record lineage; failure restores the last known good | done: check, stage, import, start, self-check, approve, record, restore; *propose* is the agent's own write | done: `approval: true` makes installs wait for `approve` or `deny`, per exact version, recorded in the ledger |
| **D. An execution policy:** generated code requests a capability and is granted only that; local first, container or micro-VM later | two trust levels: a *plugin* is trusted (approval gate), a *tool* is untrusted and runs only in the `sandbox` (a child process under `node --permission`: reads only its folder, no processes, no env, time and memory limits), with its examples as the install check. **Not covered: the network** (Node 24 has none) | a Gondolin-style micro-VM or container egress policy behind the same `sandbox` interface, when a hosted tenant needs network control |
| **E. One place to observe:** desktop, web and TUI render the same task ids, graph, outputs, decisions | `GET /tasks`, `GET /extensions`, the ledger, and the `GET /events` stream | done: the `events` plugin streams `tasks/changed` and `extensions/changed` as server-sent events; a surface renders state instead of polling |
| **Commit before "done"** | extension records and task records are written before the answer returns | keep as a rule for every new plugin |
| **Side effects are not exactly-once** | interrupted tasks are reported, never re-run | add idempotency keys to the task contract before any tool with an external effect exists |
| **Absurd (database workflows), Gondolin (micro-VMs), Pi Durable as a backend** | not adopted | only behind the interfaces above, after a real app asks |

## Recommended order (smallest first, each ends green)

1. ~~Task records carry the manifest digest (A).~~ Done.
2. ~~The task contract as a type plus a SQLite backend and a conformance test (B).~~ Done (storage); retry and checkpoints wait for a real need.
3. ~~Approval gate for extensions (C).~~ Done.
4. ~~Permissions per extension and a child-process runner for untrusted ones (D).~~ Done for tools (sandbox); the network is the open part.
5. ~~Event stream for observation (E).~~ Done.
6. ~~Make the manifest a valid `blend.yaml`, read Blends, and decide how a Blend upgrades.~~ Done: see "A proposal for ACRYL: upgrade as a plan".

## A proposal for ACRYL: upgrade as a plan

ACRYL's `lineage` records which Blueprint and version a Blend came from but not what moving to a newer version means. The prototype
implements one answer (`plugins/manifest/upgrade.ts`, tested, and run end to end on a scaffolded app):

1. Resolve the Blend over the old and over the new Blueprint, with ACRYL's own rules. The conflicts are ACRYL's existing diagnostics
   (`override-unknown-id`, `insert-id-collision`); no new concept.
2. Report four things: what the Blueprint changed, which of those changes the Blend's overrides hide, how the rows the app mounts
   differ, and the conflicts. Only a plan without conflicts is safe.
3. Applying is small: move `lineage.blueprintVersion`, keep the file as the owner wrote it, and record the Blueprint's digest in the
   lock. The rows come from the Blueprint at resolution time, so nothing is copied into the Blend.

Not decided: a Blueprint that also ships code (a plugin package) needs its own version pin and the same plan for the code; parameters
the new Blueprint adds; a way to keep an unsafe upgrade moving by editing the overrides in the plan. All three need a real Blend that
asks for them.

Open question for the owner: whether the Blends framework keeps Cordis plugins as the only unit (this prototype says yes) while a
Blueprint can still ship non-plugin assets (docs, data, templates).
