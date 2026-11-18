# Tasks: M10 scaffolding ledger

Spec: [`./spec.md`](./spec.md). Plan: [`./plan.md`](./plan.md).
A task closes only when its exit evidence exists on `main`.

Owner correction 2026-10-06: everything stays in this repository. Scaffolding
ships inside the aimbrace CLI (`aimbrace init`). No new repository, no new
package, no new binary name, no npm publish. T101-T105 and T107 content is
reused by T109 inside aimbrace.

## T100 - Constitution amendment

- [x] Rewrite the product definition in `.specify/memory/constitution.md`
  (scaffolder, not composition runtime; templates on raw Cordis; no wrapper
  runtime) with a version bump.
- Evidence: constitution amendment 2.0.0, research R9.
- Exit: diff of the constitution plus this task checked.

## T101 - Questionnaire and copy logic (built standalone, rewired in T109)

- [x] Name/host/extras questionnaire plus matching flags, refuse-if-target-dirty,
  file copy with substitution, next-steps output.
- Evidence: 12 tests (now `packages/cli/test/init-templates.test.ts`).
- Exit: covered by T109.

## T102 - Hono templates (superseded by T110)

- Superseded 2026-10-06: owner decision is Cordis-only; no host library in any
  template. The hono template content is reused as the serving shape for T110.

## T103 - Fastify templates (superseded by T110)

- Superseded 2026-10-06: same reason. No second host; serving is `node:http`.

## T104 - Verify script (updated for 2 templates in T110)

- [x] Verify script scaffolds, installs, boots, curls and tests; scans
  generated apps for anything but `cordis` (any other dep fails the build);
  enforces the template count cap.
- Evidence: `scripts/verify-scaffolder.mjs` (repointed at `aimbrace init`;
  cap and template list updated in T110).
- Exit: script passes end to end on this machine.

## T105 - Template tests (updated for 2 templates in T110)

- [x] Per-template suites: route test for both templates, offline agent test
  for the agent variant, refuse-overwrite test.
- Evidence: suites green (moved with templates in T109; trimmed in T110).
- Exit: suites green inside verify runs.

## T106 - Workspace check wiring (superseded by T109)

- Superseded: the gate wiring happens as part of the rewire, not the standalone.

## T107 - Quickstart page

- [x] Zero to serving app on one page.
- Evidence: page content (moved into `docs/` in T109).
- Exit: completed run plus time note in the ledger (redone after rewire).

## T108 - mistaken npm publish (withdrawn)

- What happened 2026-10-06: `create-aimbrace@0.1.0` was published to npm under
  a stale spec line. Owner deleted it via the registry UI the same day;
  `npm view` returns 404. No publish step exists in this milestone;
  scaffolding ships with the aimbrace CLI.
- [x] owner confirms the name is gone from the registry.

## T109 - Rewire into aimbrace (the actual deliverable)

- [ ] Move questionnaire plus copy logic into `packages/cli` by extending
  `init` (no new binary name); move the templates to
  `packages/cli/templates/`; move the verify script to
  `scripts/verify-scaffolder.mjs`; move the quickstart into
  `docs/getting-started/scaffold.md`; delete `scaffolder/` entirely.
- [ ] Re-run the verify script end to end plus the repo gate, both green.
- Exit: `aimbrace init` offers name plus agent extra, all templates verify
  green, `scaffolder/` gone, gate green.

## T110 - Single-host Cordis-only templates (Cordis-only decision)

- [ ] Replace the 4 host templates with 2: `base` (Cordis app serving one
  route via `node:http`) and `agent` (plus mock model, memory, tools, agent
  scope, offline). Delete all `hono`, `fastify`, `hookable`, `effect`,
  `unplugin` imports from templates and the CLI init path. Update the verify
  script (2 templates, cordis-only dep scan) and the init questionnaire
  (no host question, no host flags).
- Exit: verify green on both templates, generated apps depend on `cordis`
  and nothing else, gate green.

## Cutover (explicitly NOT this milestone)

Old `packages/` runtime code (core, loader, hosts) gets deleted and the site
shrinks only after two real apps ship from `aimbrace init`. That decision gets
its own spec.
