# 014: Merging the aimbrace prototype back into ACRYL

Status: plan (2026-10-10). Source of truth for what the prototype proved: [013 handoff](../013-acryl-extraction/handoff-to-blends.md).

## Principle

aimbrace was extracted *from* ACRYL, so most of it already exists there, and ACRYL's version is the reference. The merge is not
"copy the prototype in". It is: **bring back only what is new, built on ACRYL's own parts, never as a second copy**. Each item lands
as an ACRYL-native change (its package layout, its Cordis conventions, its tests, its development log), reviewed on its own.

Checked against ACRYL `main` (a2eead3, 2026-10-10), by searching for each idea:

| aimbrace piece | In ACRYL today | Verdict |
|---|---|---|
| `instance` | `AppInstance` family, `select.ts` | **Drop.** ACRYL's is the reference |
| `settings` | `plugins/acryl-settings` | **Drop** (it was ported from there, unchanged in kind) |
| `save` | `runtime/app-persistence` | **Drop** (same) |
| `manifest`: parse, validate, resolve, lock, schema | `runtime/blends-core` (the original) | **Drop my port.** Keep only the one thing it lacks: `planUpgrade` |
| **`planUpgrade` / `applyUpgrade`** | none | **Port**, onto blends-core's own `resolveDefinition`. First item |
| `digest` | `manifestDigest`, `hashPackage` | **Drop** |
| `extensions` (install, stage, rollback, ledger) | `plugins/acryl-extension-context` (pnpm, Harness Loader, `restoredPrevious`, `blend-ledger`) | **Keep ACRYL's.** Possible improvements below |
| extension `check` (self-verify before an install counts) | `lib/verify.js` exists; no exported per-plugin check seen | **Compare, then maybe port** |
| extension approval gate (`trust: ask`) | none for installs (the "approval" hits are TUI tool approvals) | **Design with ACRYL's permission model first** |
| **`sandbox` + the `tool` kind** (`tool.json`, examples as the install check) | none (no `--permission` use, no `tool.json`) | **Port as a new plugin** `plugins/acryl-sandbox`, after a spike (see risks) |
| `tasks` (durable records, jsonl and sqlite stores) | Harness has `jobs`, `todo`, `session`; no app-level task store | **Compare with Harness `jobs` first.** Port only the gap, if any |
| `events` (SSE stream of Cordis events) | the Host already streams to its clients | **Probably drop.** Check the Host's channel first |
| `openai` (model over `fetch`) | Harness LLM provider layer | **Drop.** Verify the Harness passes DeepSeek `reasoning_content` back (the one thing the prototype learned) |
| `builder`, `agent`, scripted model | the real agent and `acryl_install_plugin`; a mock model exists for live runs | **Drop.** Lesson to keep: structured results the agent can act on |
| templates, `aimbrace init/add` | `acryl new` | **Drop** |
| docs: the extension contract, upgrade plan | `plugins/acryl-extension-context/docs`, blends docs | **Contribute** the upgrade-plan page; the rest overlaps |

## Order

Each step is its own branch of ACRYL, ends green on ACRYL's own gate, gets a development-log entry, and is reviewed before the next.

1. **Upgrade planning in `runtime/blends-core`** (pure functions, no I/O, additive to the public API as its rules allow). Uses
   `resolveDefinition` (not my port). New diagnostics are additive. Tests in its vitest suite; README section.
2. **Sandbox spike.** Does `node --permission` work when `process.execPath` is Electron run as Node (`ELECTRON_RUN_AS_NODE`, which the
   packaged app already needs for the Harness subprocess runner), on macOS, Windows and Linux? If not, the sandbox needs another
   mechanism (a bundled Node, as ACRYL already ships one for some paths). The answer decides step 3. Measure, do not assume.
3. **`plugins/acryl-sandbox`** and a `tool` kind in `acryl-extension-context`, if step 2 allows it. ACRYL's own packaging rules
   apply (extension manifest, `permissions`, Loader row ids equal package names).
4. **Compare `tasks` with the Harness `jobs` package**; write down the gap; port only that.
5. **Extension `check` and the approval gate**, designed with ACRYL's extension manifest and permissions, not around them.
6. **Retire aimbrace**: README points to ACRYL; the repository stays as the record of the experiment, with the Deno branch.

## Rules for the merge

- ACRYL's rules win: `CLAUDE.md`, the Cordis protocol (mini-design before a plugin), Loader row ids, package layout
  (`runtime/`, `plugins/`), the development log, no edits inside `deepseek-harness/`.
- No second copy of anything ACRYL has. If the prototype's version is better, change ACRYL's, with a test.
- Nothing is pushed to ACRYL `main` without the owner's instruction. Work happens on a branch of a worktree; the owner decides
  when it merges.
- The sandbox does not block the network on Node 24 (it has no network permission). That limit travels with the code and the docs.

## Risks worth knowing

- **Electron as Node.** The sandbox spawns `process.execPath --permission`. In a packaged ACRYL that is the Electron binary. Whether
  Electron's embedded Node honours `--permission` is unverified (step 2).
- **Task records may duplicate Harness jobs.** Two sources of truth for "what is running" would be worse than none (step 4).
- **blends-core's rule "nothing throws for invalid input".** The prototype's `planUpgrade` threw for a wrong input; the port must
  return diagnostics instead.
