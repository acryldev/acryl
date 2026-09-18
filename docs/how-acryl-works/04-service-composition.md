# 04 — Service Composition: What Actually Gets Mounted

The booted Cordis root contains every service the coding agent needs. This file lists
what those services are, where each row comes from, and the ACRYL-specific overrides.
Ground truth: `@deepseek-ai/dsh-base`'s `cordis.patch.yml` (one giant `insert` over the
empty root) and `acryl-harness-runtime/src/coding-capabilities.ts`.

## Layering recap

```
Cordis root (cordis.yml = [])
  │
  ├─ Layer 1: @deepseek-ai/dsh-base bundle patch  (ONE insert — all core services)
  ├─ Layer 2: ACRYL coding-capability patches     (override 1 row, insert 3 rows)
  └─ Layer 3: user patch layer                    (~/.dsh/profiles/acryl/cordis.patch.yml — empty here)
```

Row order carries **no load semantics** — activation is service-availability driven.
A later layer's id-targeted row **replaces** the earlier row's whole `config` (no merge);
`insert` rows that don't exist yet are created (a plain id-targeted row only overrides).

## Layer 1 — the `dsh-base` include tree, grouped by domain

### Foundation

| Row id | Package | Notes |
|---|---|---|
| `timer` | `@deepseek-ai/cordis-plugin-timer` | Lifecycle-owned timers. |
| `hmr` | `@deepseek-ai/cordis-plugin-hmr` | Hot module replacement, root `['.']`. Source of the `--expose-internals` requirement. |

### LLM plane

| Row id | Package | Notes |
|---|---|---|
| `llm` | `@deepseek-ai/dsh-llm` | LLM service & registry (`ctx.llm`). |
| `llm-deepseek` | `@deepseek-ai/dsh-llm-deepseek` | Native DeepSeek adapter. No key inlined — resolves per request from `llm-deepseek:` settings + credentials. |
| `llm-pi-ai` | `@deepseek-ai/dsh-llm-pi-ai` | Multi-provider twin, **mounted dormant**: zero routes until a `llm-pi-ai:` settings section names providers; registers OAuth flows into `authorization`. This is what `/login` and the Models page drive. |
| `llm-retry` | `@deepseek-ai/dsh-llm-retry` | Request retry policy. |
| `settings` | `@deepseek-ai/dsh-settings-file` | `$DSH_HOME/settings.yaml`, hot-reloaded; sections override adapter entries live. |
| `credentials` | `@deepseek-ai/dsh-credentials-local` | Env → `$DSH_HOME/.credentials.yaml` → project/user `.env`. Adapters resolve refs per request. |

### Session plane

| Row id | Package | Notes |
|---|---|---|
| `session` | `@deepseek-ai/dsh-session` | Durable session log (`SessionEvent` stream, `SessionId`). |
| `session-persistence-jsonl` | `@deepseek-ai/dsh-session-persistence-jsonl` | Append-only JSONL under `$DSH_HOME/sessions`. This is what `--resume` reads. |
| `session-title` + `session-title-llm` | `dsh-session-title`, `dsh-session-title-first-prompt-llm` | Auto session titles from the first prompt. |
| `user-questions` | `@deepseek-ai/dsh-user-questions` | `ask_user_question` channel. |
| `attachment-local` | `@deepseek-ai/dsh-attachment-local` | Durable image bytes outside the append-only log, content-addressed. |
| `session-query-sqlite` | `@deepseek-ai/dsh-session-query-sqlite` | Full-text search **opt-in**; `openAt: never` keeps exact reads/titles/lineage while search fails with `SESSION_QUERY_SEARCH_DISABLED` and SQLite stays closed. |
| `session-projection` | `@deepseek-ai/dsh-session-projection` | Shared projection registry (e.g. subagent catalog identity). |
| `session-checkpoint-policy` | `@deepseek-ai/dsh-session-checkpoint-policy` | Durability checkpoints before each model request / top-level dispatch. |
| `session-telemetry-otel` | `@deepseek-ai/dsh-session-telemetry-otel` | **Mounted but disabled** (`DSH_TELEMETRY_MODE` unset → `DISABLED`); OTLP logs exporter; `$DSH_HOME/.anonymous-user-id` as resource user; every CLI exit drains it via root dispose on SIGINT/SIGTERM. |

### Agent plane

| Row id | Package | Notes |
|---|---|---|
| `agent` | `@deepseek-ai/dsh-agent` | Agent service (`ctx.agents`, `AgentHandle`). |
| `agent-default-model` | `@deepseek-ai/dsh-agent-default-model` | Transport-independent default: `deepseek-official` / `deepseek-v4-flash` (settings selection wins at creation time). |
| `agent-loop` | `@deepseek-ai/dsh-agent-loop` | Startup agents; base mounts **none** (`agents: []`) — sessions are created on demand. |
| `agent-instructions` | `@deepseek-ai/dsh-agent-instructions` | AGENTS.md-style instruction loading (max 64 KiB). |

### Isolation & approval

| Row id | Package | Notes |
|---|---|---|
| `sandbox` / `sandbox-policy` | `dsh-sandbox-local` / `dsh-sandbox-policy` | `DSH_PERMISSION_MODE` (default `workspace-write`); `workspaceRoot = process.cwd()`. |
| `bash-sandbox` / `pwsh-sandbox` | `dsh-bash-sandbox` / `dsh-pwsh-sandbox` | Per-platform shell sandboxing (each disabled off-platform). |
| `approval` | `@deepseek-ai/dsh-user-approval` | `policy: 'ask'` unless `danger-full-access` (`'never'`). |
| `permission` | `@deepseek-ai/dsh-permission-presets` | `read-only` / `workspace-write` / `danger-full-access`. |
| `fs-sandbox` | `@deepseek-ai/dsh-fs-sandbox` | Sandboxed filesystem provider, `cwd` = `process.cwd()`. |
| `subprocess` / `shell-env` | `dsh-subprocess-local` / `dsh-shell-env` | Local subprocess execution + shell environment. |

### Tool registry & coding tools

`tools` (`@deepseek-ai/dsh-tools`) is the registry; presentation mode stays native by
default. Registered tools:

`tool-bash`, `tool-pwsh` (platform-gated), `tool-jobs`, `tool-fs`, `tool-fs-search`,
`tool-str-replace-editor` (16k output cap), `tool-skill`, `tool-todo`
(parallel-in-progress allowed), `tool-goal`, `tool-web` (`fetch: false` — no fetch
provider is mounted; search only, 60s), `tool-subagent` + `tool-subagent-fork` +
`tool-subagent-control` (+`list-agents`, `report`), `tool-workflow`, `tool-ralph`
(fresh-agent loop, max 64 rounds).

Supporting rows: `timeout-policy` (per-call timeouts), `repeat-tool-reminder`
(consecutive-repeat nudges at 3/5/8), `fs-observation-policy`, `spill-local` +
`spill-policy` (50k inline byte cap), `tool-result-pruner` (compacts oversized tool
results before conversation compaction).

### Skills, commands, goal, plan mode

| Row id | Package | Notes |
|---|---|---|
| `skill`, `skill-filesystem`, `skill-badge`(disabled) | `dsh-skill*` | Skill catalog + filesystem roots. |
| `commands`, `command-feedback` | `dsh-commands*` | Slash-command registry. |
| `goal`, `goal-round-driver`, `command-goal`, `tool-goal` | `dsh-goal*` | Persisted long-running goals. |
| `plan-mode` | `@deepseek-ai/dsh-plan-mode` | Plan-mode session section: explore first, no mutations, `exit_plan_mode` presents the plan. |
| `command-compact` | `@deepseek-ai/dsh-command-compact` | Human `/compact` below the auto threshold. |

### Context management

| Row id | Package | Notes |
|---|---|---|
| `token-meter` | `@deepseek-ai/dsh-token-meter` | Usage metering (drives `/context`). |
| `compaction-basic` | `@deepseek-ai/dsh-compaction-basic` | Automatic conversation compaction. |
| `subagent`, `subagent-spawn-in-process`, `subagent-fork-in-process`, `workflow-worker-thread` | `dsh-subagent*` | In-process spawn/fork providers; spawn children continuable, forks one-shot. |

### Web plane

| Row id | Package | Notes |
|---|---|---|
| `web`, `web-search-deepseek` | `dsh-web`, `dsh-web-search-deepseek` | DeepSeek search resolving `DEEPSEEK_API_KEY` per search (separate Messages endpoint; 60s). |

### Typert / gateway

`typert`, `typert-loader`, `typert-gateway` (`dsh-typert-registry/loader`,
`dsh-api-gateway`) — the structured typed-endpoint registry and gateway seam.

## Layer 2 — ACRYL coding-capability patches

`createAcrylCodingCapabilityPatches(new Set(['tui']))` applies, for the `tui` surface:

1. **`system-prompt` override** (id-targeted; the row already exists in dsh-base):

   ```yaml
   persona: 'You are a coding agent powered by the {{model}} model.
             Your working directory is {{cwd}}.'
   ```

2. **`insert` of three rows that dsh-base does NOT mount** (a plain row only overrides —
   these must be inserted):

   | Row id | Package | Why |
   |---|---|---|
   | `agent-presets` | `@deepseek-ai/dsh-agent-presets` | Default preset `standard`; roster roots: `deepseek-harness/packages/preset/agent-presets/presets/` with `trust: 'system'` when present, plus user roots. Powers `/presets`. |
   | `session-stats` | `@deepseek-ai/dsh-session-stats` | Session stat projection for the status bar/overlays. |
   | `authorization` | `@deepseek-ai/dsh-authorization` | The seam `dsh-llm-pi-ai` registers OAuth sign-in flows into; **without it the pi-ai adapter stays PENDING and `/login` has no providers**. |

Surface scoping (`selectNonTuiCapabilityPatches`): non-TUI surfaces (`web`, `desktop`)
receive **only the `authorization` insert** — the persona override and
presets/stats rows are TUI-applied today (each surface decides what it mounts;
`ACRYL_CODING_CAPABILITIES` declares applicability, surfaces opt in).

## Layer 3 — the user patch layer

`~/.dsh/profiles/acryl/cordis.patch.yml` is hot-reloaded on long-lived surfaces and wins
last per row. It is empty on this machine (`[]`), but this is the supported extension
point for overriding any row's config (e.g. enabling `session-query-sqlite` search,
switching permission mode) without touching product code.

## Mental picture

```
ctx (Cordis root)
 ├─ llm ──── llm-deepseek (native) · llm-pi-ai (dormant→/login) · retry · settings · credentials
 ├─ session ─ jsonl persistence (~/.dsh/sessions) · titles · attachments · checkpoint · query(sqlite,off) · projection · telemetry(off)
 ├─ agents ─ agent · agent-loop(empty) · default-model · instructions
 ├─ tools ── bash/pwsh · fs · fs-search · str-replace-editor · skill · todo · goal · web(search-only) · subagent/fork/control · workflow · ralph
 ├─ sandbox ─ local · policy(workspace-write) · approval(ask) · permission presets · fs-sandbox
 ├─ compaction ─ basic · tool-result-pruner · spill(50k) · token-meter
 ├─ commands ─ registry · /compact · /goal · plan-mode · user-questions
 ├─ skills ── catalog · filesystem roots
 ├─ acryl ─── system-prompt persona · agent-presets · session-stats · authorization · acryl_workspace_status tool
 └─ platform ─ timer · hmr · typert registry/loader/gateway · jobs · subprocess · shell-env
```
