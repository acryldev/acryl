# Implementation work order: M10 rewire into aimbrace (T109)

## Situation

T100-T105 and T107 content is done. Owner decision: everything stays in this
repository, no new repository, no new package, no new binary, no npm publish.
The 4 commits on `main` stay as checkpoints; the standalone `scaffolder/`
directory is removed and its content lives on inside the aimbrace CLI.

## 1. Read first (before touching code)

1. `specs/010-scaffolder-rebuild/tasks.md` - T109 is the only open build task.
2. `specs/010-scaffolder-rebuild/spec.md` - FR-001 (`aimbrace init`),
   FR-002, FR-004, FR-007 (upstream `cordis@4.0.0-rc.10`, no `@deepseek-ai/*`).

## 2. Rewire (T109) then single-host (T110)

- Move the questionnaire plus copy logic into `packages/cli` by extending
  the `init` command. No new binary name: the entry point is `aimbrace init`
  with name plus agent-extra selection. No host question, no host flags.
- Move the templates to `packages/cli/templates/`, then replace them with 2:
  `base` (Cordis app, one route via `node:http`) and `agent` (plus mock
  model, memory, tools, agent scope, offline). No `hono`, `fastify`,
  `hookable`, `effect` or `unplugin` anywhere in templates or the init path.
- Move the verify script to `scripts/verify-scaffolder.mjs`; repoint it at
  `aimbrace init`, 2 templates, cordis-only dep scan.
- Move the quickstart page into `docs/getting-started/scaffold.md`.
- Delete `scaffolder/` entirely, including any workspace registration.
- Generated apps depend on upstream `cordis` (exact pin) and nothing else.

## 3. Hard constraints

- No new package, no new binary name, nothing outside this repo.
- Do NOT touch runtime code (`packages/core`, `loader`, hosts, `effect`,
  `unplugin`), `plugins/`, `examples/`, old `docs/`, `specs/000-009`, or the
  sibling site repo. Only `packages/cli` (init extension), `templates/`,
  `scripts/`, `docs/quickstart.md` and `specs/010-*` may change.
- The directories under
  `../Cordis_Effect_Fastify_Hookable_Unplugin_Hono/` are study references,
  never dependencies.

## 4. Verify before pushing

Verify script end to end (both templates: install, boot, curl 200, template
tests) plus the repo gate, both green. Paste the tail of the green run in the
report. Check off T109 and T110 in `specs/010-scaffolder-rebuild/tasks.md` in
the same commit. There is no publish step: scaffolding ships with the aimbrace
CLI from this checkout.
